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

// ── Whole-doc raw text fallback ────────────────────────────────────

function wholeDocRawText(source: string): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: source }] }],
  };
}
