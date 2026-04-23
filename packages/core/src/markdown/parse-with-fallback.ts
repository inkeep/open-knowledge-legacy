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

/**
 * Maximum recursion depth for the block-level split-then-rejoin fallback.
 * Exported so tests can parametrically exercise the depth=N vs depth=N+1
 * boundary without duplicating the literal (US-015).
 *
 * Boundary semantics: the guard is `depth > MAX_SPLIT_DEPTH`, so a call at
 * depth === MAX_SPLIT_DEPTH is the deepest that is permitted to attempt a
 * parse; depth === MAX_SPLIT_DEPTH + 1 immediately falls through to
 * whole-doc raw text and increments `parseFallback.wholeDoc`.
 */
export const MAX_SPLIT_DEPTH = 20;

type ParseFn = (markdown: string) => JSONContent;

interface ParseWithFallbackOptions {
  parse: ParseFn;
}

/**
 * Defense-in-depth budget against adversarial MDX that could drive the
 * recursive fallback path with pathological per-region failures.
 *
 * MAX_SPLIT_DEPTH already caps recursion depth; in practice the total
 * parse() work is bounded by ~O(N × depth) because each recursion operates
 * on a non-overlapping substring of its parent (with a marginal overhead
 * from `hoistRefDefs` prepend). A hostile input with N unclosed tags could
 * still tie up the event loop for seconds on the server-side Observer B
 * hot path (precedent #14 — server is the single writer). The wall-clock
 * ceiling and parse-call cap are belt-and-braces defense against
 * multi-tenant CPU starvation: first one to trip aborts to whole-doc raw
 * text, which is always a valid PM doc.
 */
const MAX_PARSE_WALLCLOCK_MS = 500;
const MAX_TOTAL_PARSE_CALLS = 1000;

interface ParseBudget {
  startMs: number;
  calls: number;
}

/**
 * Parse markdown with block-level fallback on failure.
 * Returns JSONContent (same shape as MarkdownManager.parse).
 */
export function parseWithFallback(source: string, opts: ParseWithFallbackOptions): JSONContent {
  const budget: ParseBudget = {
    startMs:
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now(),
    calls: 0,
  };
  return parseRecursive(source, opts.parse, 0, budget);
}

function budgetExhausted(budget: ParseBudget): boolean {
  if (budget.calls >= MAX_TOTAL_PARSE_CALLS) return true;
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  return now - budget.startMs >= MAX_PARSE_WALLCLOCK_MS;
}

/**
 * Internal recursion core. Exported for test-only use (US-015 boundary
 * coverage of `depth > MAX_SPLIT_DEPTH`). Production callers should use
 * `parseWithFallback` which pins the starting depth at 0.
 */
/**
 * Extract a structured error payload from an unknown caught value. Keeps the
 * bracket-style message friendly for humans reading dev-server output while
 * adding name + stack (head of) for log aggregators that key off JSON shape.
 * See CLAUDE.md "Logging conventions" and the `bridge-merge-content-loss`
 * event shape for the precedent this mirrors.
 *
 * Both `message` and `stack` are capped. Unified mdast/micromark errors can
 * quote source snippets of arbitrary length; an adversarial file would
 * otherwise produce multi-KB per-parse log entries and a log-volume DoS
 * amplification under load. Matches the `slice(0, 200)` pattern in
 * `tryPerBlockFallback` but with a slightly larger ceiling for the top-level
 * site because the primary message is the main signal for diagnosis.
 */
const MAX_ERROR_MESSAGE_LEN = 500;

function errorPayload(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message.slice(0, MAX_ERROR_MESSAGE_LEN),
      // Stack traces can be tens of KB. Keep the first 4 frames — enough to
      // locate the throw site without flooding log aggregators.
      stack: err.stack?.split('\n').slice(0, 4).join('\n'),
    };
  }
  return {
    name: 'UnknownError',
    message: String(err ?? 'unknown').slice(0, MAX_ERROR_MESSAGE_LEN),
  };
}

export function parseRecursive(
  source: string,
  parse: ParseFn,
  depth: number,
  budget?: ParseBudget,
): JSONContent {
  if (depth > MAX_SPLIT_DEPTH) {
    incrementWholeDocFallback();
    console.warn(
      JSON.stringify({ event: 'mdx-whole-doc-fallback', reason: 'MAX_SPLIT_DEPTH exceeded' }),
    );
    return wholeDocRawText(source);
  }

  // Wall-clock / call-count budget (defense-in-depth against adversarial
  // MDX on the server Observer B hot path). When tripped, abort to
  // whole-doc raw text which is always a valid PM doc. `budget` is
  // optional so existing test callers that invoke `parseRecursive`
  // directly (e.g. US-015 boundary coverage) don't need the wrapper.
  if (budget) {
    if (budgetExhausted(budget)) {
      incrementWholeDocFallback();
      console.warn(
        JSON.stringify({
          event: 'mdx-whole-doc-fallback',
          reason: 'parse budget exhausted',
          calls: budget.calls,
        }),
      );
      return wholeDocRawText(source);
    }
    budget.calls += 1;
  }

  try {
    return parse(source);
  } catch (e: unknown) {
    const offset = extractErrorOffset(e);
    const payload = errorPayload(e);
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
          reason: payload.message,
          error: payload,
        }),
      );
      return wholeDocRawText(source);
    }

    incrementBlockFallback();
    console.warn(
      JSON.stringify({
        event: 'mdx-block-fallback',
        offset,
        reason: payload.message,
        error: payload,
      }),
    );

    try {
      const region = findFallbackRegion(source, offset);
      const beforeSrc = source.slice(0, region.start);
      const brokenSrc = source.slice(region.start, region.end);
      const afterSrc = source.slice(region.end);

      const beforeDoc = beforeSrc.trim()
        ? parseRecursive(beforeSrc, parse, depth + 1, budget)
        : { type: 'doc' as const, content: [] };
      const afterDoc = afterSrc.trim()
        ? parseRecursive(hoistRefDefs(beforeSrc) + afterSrc, parse, depth + 1, budget)
        : { type: 'doc' as const, content: [] };

      const fallbackNode: JSONContent = {
        type: 'rawMdxFallback',
        attrs: {
          reason: payload.message,
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
      const recoveryPayload = errorPayload(recoveryErr);
      console.warn(
        JSON.stringify({
          event: 'mdx-whole-doc-fallback',
          reason: `Recovery failed: ${recoveryPayload.message}`,
          // Disambiguate which recovery stage threw: block-split + rejoin
          // (this catch site) vs per-block independent parse (caught inline
          // inside `tryPerBlockFallback`). Saves guesswork during incident
          // triage when a sibling `mdx-block-fallback` is also in the logs.
          recoveryPath: 'block-split-then-rejoin',
          error: recoveryPayload,
          originalError: payload,
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

// ── Single-pass structural enumeration (FR-23) ────────────────────

/**
 * Tag event produced by scanTagEvents — an open, close, or self-closing tag
 * occurrence in source order. Only matches UpperCase tag names (JSX / MDX
 * component convention); lowercase `<div>` or `<span>` are treated as HTML.
 */
export interface TagEvent {
  kind: 'open' | 'close' | 'self-close';
  name: string;
  start: number;
  end: number;
}

/**
 * A region in the source identified as either a properly-paired tag span
 * or an unmatched open tag bounded by blank line / EOF.
 */
interface FallbackRegion {
  start: number;
  end: number;
  source: 'pair' | 'unmatched';
}

/**
 * Scan source for JSX/MDX tag events in source order.
 *
 * Fence-aware: tags inside ``` fences are skipped.
 * Quote-aware: `>` inside attribute double-quotes is not treated as the tag
 * terminator. When a quote never closes, the tag emits no event (safe-coarsening
 * documented in FR-23).
 * Brace-aware: `>` inside `{…}` expression attributes is not treated as the
 * tag terminator (handles `<Foo bar={x > 5}>` correctly).
 *
 * Only matches UpperCase tag names (JSX / MDX component convention).
 */
/**
 * Max bytes the per-tag forward scan for `>` will consume. The outer
 * `src.matchAll(TAG_START_RE)` loop visits every `<UpperCase` occurrence;
 * without a bound, a pathological input of N unclosed tags forces each
 * match to rescan most of the remaining source (O(N^2)). Real MDX tags
 * are < 1 KB; 32 KB accommodates every legitimate case with headroom and
 * caps the worst-case cost at O(N * MAX_TAG_SCAN_SPAN) = O(N).
 *
 * When the scan hits the bound without finding a terminator, the tag emits
 * no event — same "safe-coarsening" documented for the unclosed-attribute
 * case in FR-23. The higher-level fallback still produces a correct
 * result: surrounding blocks parse normally, the unbounded tag span
 * collapses to a source-editor fallback region.
 */
const MAX_TAG_SCAN_SPAN = 32 * 1024;

export function scanTagEvents(src: string, fences: Array<[number, number]>): TagEvent[] {
  const events: TagEvent[] = [];
  // Match potential tag starts: `<UpperCase` or `</UpperCase`
  const TAG_START_RE = /<(\/?)([A-Z][A-Za-z0-9.]*)/g;

  for (const match of src.matchAll(TAG_START_RE)) {
    const tagStartPos = match.index;
    if (isInsideFence(tagStartPos, fences)) continue;

    const isClose = match[1] === '/';
    const name = match[2];
    // Forward-scan from after the tag name to find the terminating `>`
    // while respecting quote and brace state. Bounded by MAX_TAG_SCAN_SPAN
    // so adversarial input (N unclosed tags) stays linear overall.
    const scanStart = tagStartPos + match[0].length;
    const scanEnd = Math.min(src.length, scanStart + MAX_TAG_SCAN_SPAN);
    let inDoubleQuote = false;
    let braceDepth = 0;
    let terminatorPos = -1;
    let isSelfClosing = false;

    for (let i = scanStart; i < scanEnd; i++) {
      const ch = src[i];
      if (inDoubleQuote) {
        if (ch === '"') inDoubleQuote = false;
        // Backslash escape inside quotes — skip next char
        if (ch === '\\' && i + 1 < scanEnd) i++;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = true;
        continue;
      }
      if (ch === '{') {
        braceDepth++;
        continue;
      }
      if (ch === '}' && braceDepth > 0) {
        braceDepth--;
        continue;
      }
      if (braceDepth > 0) continue;
      if (ch === '>') {
        terminatorPos = i;
        // Check if the char before `>` is `/` (self-closing)
        if (i > 0 && src[i - 1] === '/') isSelfClosing = true;
        break;
      }
    }

    // If forward scan never found `>` outside quotes/braces, emit no event
    // (safe-coarsening documented in FR-23: unclosed attribute quote case).
    if (terminatorPos === -1) continue;

    const tagEnd = terminatorPos + 1;

    if (isClose) {
      events.push({ kind: 'close', name, start: tagStartPos, end: tagEnd });
    } else if (isSelfClosing) {
      events.push({ kind: 'self-close', name, start: tagStartPos, end: tagEnd });
    } else {
      events.push({ kind: 'open', name, start: tagStartPos, end: tagEnd });
    }
  }

  return events;
}

/**
 * Build a list of fallback regions from the source in a single pass.
 *
 * Uses a stack-based enumeration of open/close tag events:
 * - Open tags push onto the stack.
 * - Self-closing tags (<Foo />) are skipped (never enter the stack).
 * - Close tags pop the stack to the matching name. Tags between the top and
 *   the match are evicted as unmatched-open regions (bounded by the evicting
 *   close's start, capped by nearest blank line).
 * - At EOF, remaining stack entries emit unmatched-open regions bounded by
 *   the nearest blank line after the open tag (or EOF).
 *
 * Properly-matched open+close pairs emit as 'pair' regions.
 *
 * O(n) in source length — one regex scan + O(1) work per tag event.
 */
export function enumerateFallbackRegions(src: string): FallbackRegion[] {
  const fences = findFencedRegions(src);
  const events = scanTagEvents(src, fences);
  const stack: TagEvent[] = [];
  const regions: FallbackRegion[] = [];

  for (const ev of events) {
    if (ev.kind === 'self-close') continue;

    if (ev.kind === 'open') {
      stack.push(ev);
      continue;
    }

    // Close tag — pop to matching name
    let matchIdx = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name === ev.name) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx === -1) continue; // orphan close with no matching open — drop

    // Tags above the match are evicted as unmatched-opens
    for (let i = stack.length - 1; i > matchIdx; i--) {
      const open = stack[i];
      const blankCap = nearestBlankLineAfter(src, open.start) ?? src.length;
      regions.push({
        start: open.start,
        end: Math.min(ev.start, blankCap),
        source: 'unmatched',
      });
    }

    // Emit the proper pair
    regions.push({
      start: stack[matchIdx].start,
      end: ev.end,
      source: 'pair',
    });

    stack.length = matchIdx;
  }

  // Anything still on the stack at EOF is an unmatched-open
  for (const open of stack) {
    const blankCap = nearestBlankLineAfter(src, open.start) ?? src.length;
    regions.push({
      start: open.start,
      end: Math.min(src.length, blankCap),
      source: 'unmatched',
    });
  }

  return regions;
}

/**
 * Find the tightest structural fallback region containing the error offset.
 *
 * Uses single-pass structural enumeration (FR-23) to identify paired and
 * unmatched-open regions; returns the smallest region containing the error
 * offset. Falls back to blank-line block bounds when no MDX region contains
 * the offset (position-less errors, errors in pure prose).
 *
 * Does NOT take a parse parameter. Does NOT invoke any parse call.
 */
function findFallbackRegion(src: string, errorOffset: number): Region {
  const regions = enumerateFallbackRegions(src);

  // Innermost containing region wins (smallest span)
  let best: FallbackRegion | null = null;
  for (const r of regions) {
    if (r.start <= errorOffset && errorOffset <= r.end) {
      if (!best || r.end - r.start < best.end - best.start) best = r;
    }
  }
  if (best) return { start: best.start, end: best.end };

  // No MDX structure around the error — fall back to blank-line block bounds
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
    } catch (blockErr) {
      incrementBlockFallback();
      // Surface BOTH the block-specific failure AND the original top-level
      // error — the two may differ (e.g. top-level is PM-construction, the
      // block fails with a different MDX tokenizer error). Capped so log
      // aggregators don't see unbounded payloads (A9 parse-health budget).
      const blockMsg = (blockErr as Error)?.message?.slice(0, 200) ?? 'unknown block error';
      const originalMsg = (originalErr as Error)?.message?.slice(0, 160) ?? 'unknown';
      console.warn(
        JSON.stringify({
          event: 'mdx-block-fallback',
          offset: block.start,
          reason: `Per-block recovery after position-less error: ${originalMsg}`,
          blockError: blockMsg,
          blockErrorName: (blockErr as Error)?.name,
        }),
      );
      merged.push({
        type: 'rawMdxFallback',
        attrs: {
          reason: blockMsg,
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
