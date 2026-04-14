/**
 * R6: Block-level split-then-rejoin fallback parser.
 *
 * On parse failure with position info, split source at the enclosing block
 * boundary (MDX-aware for paired tags), replace the failing block with
 * rawMdxFallback, parse the halves recursively, and merge. Reference
 * definitions are hoisted (R11) so cross-block link semantics survive splits.
 *
 * See SPEC §9 R6 for the full algorithm description.
 */
import type { JSONContent } from '@tiptap/core';
import { incrementBlockFallback, incrementWholeDocFallback } from '../metrics/parse-health.ts';
import { findFencedRegions, isInsideFence } from './fence-regions.ts';
import { hoistRefDefs } from './ref-def-hoist.ts';

const MAX_SPLIT_DEPTH = 20;

type ParseFn = (markdown: string) => JSONContent;

interface ParseWithFallbackOptions {
  parse: ParseFn;
}

/**
 * Parse markdown with block-level fallback on failure.
 * Returns JSONContent (same shape as MarkdownManager.parse).
 */
export function parseWithFallback(source: string, opts: ParseWithFallbackOptions): JSONContent {
  return parseRecursive(source, opts.parse, 0);
}

function parseRecursive(source: string, parse: ParseFn, depth: number): JSONContent {
  if (depth > MAX_SPLIT_DEPTH) {
    incrementWholeDocFallback();
    console.warn(
      JSON.stringify({ event: 'mdx-whole-doc-fallback', reason: 'MAX_SPLIT_DEPTH exceeded' }),
    );
    return wholeDocRawText(source);
  }

  try {
    return parse(source);
  } catch (e: unknown) {
    const offset = extractErrorOffset(e);
    if (offset === undefined) {
      // Position-less error — covers PM-construction failures (RangeError from
      // `prosemirror-model/schema.ts:201` "Invalid content for node X") and
      // other errors that carry no `.place`/`.offset`. Before falling through
      // to whole-doc, try per-block source splitting: if ANY top-level block
      // parses clean, preserve it. This upgrades M2 from "zero whole-doc on
      // clean files" to "zero whole-doc wherever per-block split can recover."
      if (depth === 0) {
        const perBlock = tryPerBlockFallback(source, parse, e);
        if (perBlock) return perBlock;
      }
      incrementWholeDocFallback();
      console.warn(
        JSON.stringify({
          event: 'mdx-whole-doc-fallback',
          reason: (e as Error)?.message ?? 'unknown error (no position)',
        }),
      );
      return wholeDocRawText(source);
    }

    incrementBlockFallback();
    console.warn(
      JSON.stringify({
        event: 'mdx-block-fallback',
        offset,
        reason: (e as Error)?.message ?? 'parse error',
      }),
    );

    try {
      const region = findFallbackRegion(source, offset);
      const beforeSrc = source.slice(0, region.start);
      const brokenSrc = source.slice(region.start, region.end);
      const afterSrc = source.slice(region.end);

      const beforeDoc = beforeSrc.trim()
        ? parseRecursive(beforeSrc, parse, depth + 1)
        : { type: 'doc' as const, content: [] };
      const afterDoc = afterSrc.trim()
        ? parseRecursive(hoistRefDefs(beforeSrc) + afterSrc, parse, depth + 1)
        : { type: 'doc' as const, content: [] };

      const fallbackNode: JSONContent = {
        type: 'rawMdxFallback',
        attrs: {
          reason: (e as Error)?.message ?? 'parse error',
          originalSpan: { start: region.start, end: region.end },
        },
        content: brokenSrc ? [{ type: 'text', text: brokenSrc }] : [],
      };

      const merged: JSONContent[] = [
        ...((beforeDoc.content as JSONContent[]) ?? []),
        fallbackNode,
        ...((afterDoc.content as JSONContent[]) ?? []),
      ];

      return {
        type: 'doc',
        content: merged.length > 0 ? merged : [{ type: 'paragraph', content: [] }],
      };
    } catch (recoveryErr) {
      incrementWholeDocFallback();
      console.warn(
        JSON.stringify({
          event: 'mdx-whole-doc-fallback',
          reason: `Recovery failed: ${(recoveryErr as Error)?.message ?? 'unknown'}`,
        }),
      );
      return wholeDocRawText(source);
    }
  }
}

// ── Error offset extraction ────────────────────────────────────────

interface VFilePlace {
  offset?: number;
  start?: { offset?: number };
}

function extractErrorOffset(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as { place?: VFilePlace; position?: VFilePlace };

  // VFileMessage Point shape: err.place.offset
  if (e.place && typeof e.place.offset === 'number') return e.place.offset;
  // VFileMessage Position shape: err.place.start.offset
  if (e.place?.start && typeof e.place.start.offset === 'number') return e.place.start.offset;
  // Some errors use .position instead of .place
  if (e.position && typeof e.position.offset === 'number') return e.position.offset;
  if (e.position?.start && typeof e.position.start.offset === 'number')
    return e.position.start.offset;

  return undefined;
}

// ── Fallback region detection ──────────────────────────────────────

interface Region {
  start: number;
  end: number;
}

/**
 * Find the enclosing paired tag (e.g., <Callout>...</Callout>) around the
 * error offset. Only matches UpperCase tag names (JSX convention).
 * Fence-aware: skips fenced code regions.
 */
function findEnclosingPairedTag(src: string, offset: number): Region | null {
  const fences = findFencedRegions(src);
  if (isInsideFence(offset, fences)) return null;

  // Walk backward for an unclosed <UpperCase (opening tag)
  const OPEN_TAG_RE = /<([A-Z][A-Za-z0-9.]*)[\s/>]/g;
  const CLOSE_TAG_RE = /<\/([A-Z][A-Za-z0-9.]*)\s*>/g;

  let bestOpen: { name: string; start: number } | null = null;

  for (const match of src.matchAll(OPEN_TAG_RE)) {
    if (match.index > offset) break;
    if (isInsideFence(match.index, fences)) continue;
    bestOpen = { name: match[1], start: match.index };
  }

  if (!bestOpen) return null;

  // Walk forward for the matching close tag
  for (const match of src.matchAll(CLOSE_TAG_RE)) {
    if (match.index < offset) continue;
    if (isInsideFence(match.index, fences)) continue;
    if (match[1] === bestOpen.name) {
      return { start: bestOpen.start, end: match.index + match[0].length };
    }
  }

  // No close tag found — span from open tag to nearest blank line after offset
  const blankAfter = nearestBlankLineAfter(src, offset);
  return { start: bestOpen.start, end: blankAfter ?? src.length };
}

function nearestBlankLineBefore(src: string, offset: number): number | null {
  const BLANK_RE = /\n\s*\n/g;
  let best: number | null = null;
  for (const match of src.matchAll(BLANK_RE)) {
    if (match.index >= offset) break;
    best = match.index + match[0].length;
  }
  return best;
}

function nearestBlankLineAfter(src: string, offset: number): number | null {
  const BLANK_RE = /\n\s*\n/g;
  for (const match of src.matchAll(BLANK_RE)) {
    if (match.index >= offset) return match.index;
  }
  return null;
}

function findFallbackRegion(src: string, errorOffset: number): Region {
  const enclosing = findEnclosingPairedTag(src, errorOffset);
  if (enclosing) return enclosing;

  const blockStart = nearestBlankLineBefore(src, errorOffset) ?? 0;
  const blockEnd = nearestBlankLineAfter(src, errorOffset) ?? src.length;
  return { start: blockStart, end: blockEnd };
}

// ── Per-block source splitting for position-less errors ───────────

/**
 * Split `source` into top-level blocks at blank-line boundaries (skipping
 * fenced code regions which may contain blank lines internally). Returns
 * an array of `{ src, start, end }` covering the full source with block
 * offsets into the original string.
 *
 * Fence-awareness: a blank line INSIDE ``` fences is NOT a block boundary.
 */
interface SourceBlock {
  src: string;
  start: number;
  end: number;
}

function splitSourceIntoBlocks(source: string): SourceBlock[] {
  const fences = findFencedRegions(source);
  const BLANK_RE = /\n[ \t]*\n/g;
  const boundaries: number[] = [0];
  for (const match of source.matchAll(BLANK_RE)) {
    const blankStart = match.index;
    if (isInsideFence(blankStart, fences)) continue;
    boundaries.push(blankStart + match[0].length);
  }
  boundaries.push(source.length);
  const blocks: SourceBlock[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end <= start) continue;
    const src = source.slice(start, end);
    if (!src.trim()) continue;
    blocks.push({ src, start, end });
  }
  return blocks;
}

/**
 * When the top-level parse throws without a position (PM-construction
 * RangeError, etc.), split the source at blank-line block boundaries and
 * parse each block independently. Failing blocks substitute a rawMdxFallback
 * holding that block's raw text; succeeding blocks contribute their content.
 *
 * Returns `null` if per-block recovery didn't improve over whole-doc (e.g.,
 * only one block, or every block fails). In that case, the caller falls
 * through to whole-doc raw text.
 *
 * Ref-def hoisting (R11) applies across blocks: any `[label]: url` definitions
 * in a successfully-parsed block are prepended to the source of subsequent
 * blocks when they get parsed independently.
 */
function tryPerBlockFallback(
  source: string,
  parse: ParseFn,
  originalErr: unknown,
): JSONContent | null {
  const blocks = splitSourceIntoBlocks(source);
  // Single block means the whole source IS one block; per-block recovery
  // degenerates to whole-doc.
  if (blocks.length < 2) return null;

  const merged: JSONContent[] = [];
  let anySucceeded = false;
  let anyFailed = false;
  let hoistedRefDefs = '';

  for (const block of blocks) {
    const blockSource = hoistedRefDefs + block.src;
    try {
      const blockResult = parse(blockSource);
      const children = (blockResult.content as JSONContent[] | undefined) ?? [];
      // If the block parse succeeded, harvest its ref-defs for downstream blocks
      hoistedRefDefs += hoistRefDefs(block.src);
      // Filter out the synthetic empty-doc paragraph that appears for ref-def-only blocks
      const nonEmpty = children.filter(
        (c) => c.type !== 'paragraph' || (Array.isArray(c.content) && c.content.length > 0),
      );
      if (nonEmpty.length === 0 && children.length > 0) {
        // Block was all ref-defs; contribute nothing to the rendered output
        anySucceeded = true;
        continue;
      }
      merged.push(...nonEmpty);
      anySucceeded = true;
    } catch {
      incrementBlockFallback();
      console.warn(
        JSON.stringify({
          event: 'mdx-block-fallback',
          offset: block.start,
          reason: `Per-block recovery after position-less error: ${
            (originalErr as Error)?.message?.slice(0, 160) ?? 'unknown'
          }`,
        }),
      );
      merged.push({
        type: 'rawMdxFallback',
        attrs: {
          reason: (originalErr as Error)?.message?.slice(0, 200) ?? 'Position-less parse error',
          originalSpan: { start: block.start, end: block.end },
        },
        content: [{ type: 'text', text: block.src }],
      });
      anyFailed = true;
    }
  }

  if (!anySucceeded) return null; // every block failed — no improvement over whole-doc
  if (!anyFailed) {
    // Per-block dispatch succeeded where top-level failed — emit the merged result.
    // This can happen when a cross-block construct (e.g., a link reference
    // resolved across blocks) caused the full-doc parse to fail but each block
    // parses in isolation.
    return {
      type: 'doc',
      content: merged.length > 0 ? merged : [{ type: 'paragraph', content: [] }],
    };
  }
  return {
    type: 'doc',
    content: merged.length > 0 ? merged : [{ type: 'paragraph', content: [] }],
  };
}

// ── Whole-doc raw text fallback ────────────────────────────────────

function wholeDocRawText(source: string): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: source }] }],
  };
}
