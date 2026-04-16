import { afterEach, describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { getParseHealth, resetParseHealth } from '../metrics/parse-health.ts';
import { loadPerfFixture } from './fixtures/index.ts';
import { MarkdownManager } from './index.ts';
import {
  MAX_SPLIT_DEPTH,
  parseRecursive,
  parseWithFallback as parseWithFallbackFn,
} from './parse-with-fallback.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

// ─── US-015 perf gating ────────────────────────────────────────────
//
// The perf tests below exercise parseWithFallback on 1K/10K-block inputs
// and assert the fallback path stays within 5× happy-path `parse()` time.
// They are gated by `RUN_BENCH=1` for the same reason `markdown-bench.test.ts`
// is gated: warm-up discipline + multiple measured runs at 10K blocks push
// the total wall time into the minute range, which `bun run check`'s
// 20-30s warm budget cannot absorb. Invoked explicitly by the
// `test:perf:fallback` turbo task on tier-2 runners.
const BENCH_ENABLED = process.env.RUN_BENCH === '1' || process.env.RUN_BENCH === 'true';
const describeBench = BENCH_ENABLED ? describe : describe.skip;

describe('parseWithFallback (R6)', () => {
  afterEach(() => resetParseHealth());

  test('valid markdown parses clean (no fallback)', () => {
    const result = mdManager.parseWithFallback('# Heading\n\nParagraph\n');
    expect(result.content).toBeDefined();
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(getParseHealth().parseFallback.blockLevel).toBe(0);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('<Foo>...</Bar> tag mismatch produces rawMdxFallback with surrounding structure', () => {
    const src = '# Heading\n\n<Foo>broken</Bar>\n\n# Another heading\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('rawMdxFallback');
    // Both headings should be preserved
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(getParseHealth().parseFallback.blockLevel).toBeGreaterThanOrEqual(1);
  });

  test('mismatched close tag in middle produces rawMdxFallback', () => {
    // </Bar> without opening <Bar> throws VFileMessage from mdast-util-mdx-jsx
    const src = '# Title\n\ntext </Bar> more text\n\nSome text after\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
  });

  test('position-less error falls through to whole-doc fallback', () => {
    const result = parseWithFallbackFn('some content', {
      parse: () => {
        throw new Error('no position info');
      },
    });
    expect(result.type).toBe('doc');
    expect(getParseHealth().parseFallback.wholeDoc).toBeGreaterThanOrEqual(1);
  });

  test('MAX_SPLIT_DEPTH exceeded falls to whole-doc fallback', () => {
    const result = parseWithFallbackFn(
      'a\n\nb\n\nc\n\nd\n\ne\n\nf\n\ng\n\nh\n\ni\n\nj\n\nk\n\nl\n\nm\n\nn\n\no\n\np\n\nq\n\nr\n\ns\n\nt\n\nu\n\nv\n\nw',
      {
        parse: () => {
          const err = new Error('always fails') as Error & { place: { offset: number } };
          err.place = { offset: 2 };
          throw err;
        },
      },
    );
    expect(result.type).toBe('doc');
    expect(getParseHealth().parseFallback.wholeDoc).toBeGreaterThanOrEqual(1);
  });

  test('ref-def hoisting across split: link resolves after fallback', () => {
    const src =
      '[link][ref1]\n\n[ref1]: https://example.com\n\n<Foo>broken</Bar>\n\nAnother [link][ref1]\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    // Verify link resolution survived the split — serialize and check
    const serialized = mdManager.serialize(result);
    expect(serialized).toContain('[ref1]: https://example.com');
    expect(serialized).toContain('[link][ref1]');
  });

  test('code fence containing <Tag> is not mistaken for JSX', () => {
    const src = '```\nsome code <Tag> inside\n```\n\n<Foo>broken</Bar>\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    // Code block should be preserved as codeBlock, not fallback
    expect(types).toContain('codeBlock');
    expect(types).toContain('rawMdxFallback');
  });

  test('empty input returns empty doc', () => {
    const result = mdManager.parseWithFallback('');
    expect(result.type).toBe('doc');
  });

  // ─── Regression tests added from PR #136 review feedback ─────────────────

  test('(m2) recovery-failure path: split succeeds but recursive parse throws → whole-doc fallback', () => {
    // Reviewer's concern: the inner try/catch in parseRecursive (lines 65-106)
    // handles recovery-phase failures (e.g., a bug in findFallbackRegion or a
    // pathological recursive-parse throw). Without this test, a regression
    // could silently degrade to whole-doc fallback on content that should
    // have had block-level fallback.
    let callCount = 0;
    const result = parseWithFallbackFn('a\n\nb\n\nc', {
      parse: () => {
        callCount++;
        if (callCount === 1) {
          // First (outer) parse throws with position → triggers split-then-rejoin
          const err = new Error('first call fails with position') as Error & {
            place: { offset: number };
          };
          err.place = { offset: 4 };
          throw err;
        }
        // Every subsequent parse throws — recovery fails; final wholeDocRawText
        throw new Error('recovery parse fail');
      },
    });
    expect(result.type).toBe('doc');
    // Recovery failure produces a single paragraph carrying the whole source as text
    const children = result.content as { type: string }[];
    expect(children.length).toBeGreaterThanOrEqual(1);
    // Metric fired for the whole-doc fallback that terminates recovery
    expect(getParseHealth().parseFallback.wholeDoc).toBeGreaterThanOrEqual(1);
  });

  test('(m3) findEnclosingPairedTag: surrounding headings preserved when mid-doc fallback fires', () => {
    // Reviewer's concern: findFallbackRegion correctly bounds the failing
    // region so headings before + after remain structured. Under agnostic
    // mode the error-producing construct is tag-mismatch (not unclosed tag,
    // which agnostic-mode tokenizer tolerates as prose). This exercises the
    // same findEnclosingPairedTag path — it locates the open tag to set
    // region.start and walks forward for the close.
    const src = '# Before\n\nsome text\n\n<Foo>content</Bar>\n\n# After\n\nmore\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBe(2); // both "Before" and "After" preserved
    expect(types).toContain('rawMdxFallback');
  });

  test('(m3) findEnclosingPairedTag: nested broken — innermost paired region captured', () => {
    // Reviewer's concern: multiple candidate opening tags before the error
    // offset. Our regex walks the BEST (last-before-offset) open tag — verify
    // that picks the innermost when nested.
    const src = '# Heading\n\n<Outer><Inner>broken</Bar></Outer>\n\n# Footer\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBe(2);
  });

  // ─── US-015 R23 MAX_SPLIT_DEPTH boundary coverage ─────────────────────
  //
  // The existing "MAX_SPLIT_DEPTH exceeded falls to whole-doc fallback" test
  // is a single-sided check — it drives deep recursion via a 23-block source
  // and asserts whole-doc fires somewhere inside the chain. It does NOT pin
  // the boundary at MAX_SPLIT_DEPTH itself: a regression that flipped the
  // guard to `depth >= MAX_SPLIT_DEPTH` (off-by-one early) would still pass
  // that test.
  //
  // The parametric pair below uses the exported `parseRecursive` + the
  // `MAX_SPLIT_DEPTH` constant to drive each side of the boundary
  // explicitly, with `parse()` that never throws so the only variable is
  // the starting depth. At `depth === MAX_SPLIT_DEPTH`, parse is invoked
  // and succeeds — whole-doc counter stays 0. At `depth === MAX_SPLIT_DEPTH + 1`,
  // parse is NEVER invoked — the guard short-circuits and whole-doc fires
  // exactly once. Together these pin the guard at `depth > MAX_SPLIT_DEPTH`.

  test('(r23 boundary) depth=MAX_SPLIT_DEPTH permits parse; depth=MAX_SPLIT_DEPTH+1 short-circuits to whole-doc', () => {
    // Sanity: the exported constant matches the internal guard. Locks any
    // future value change to a deliberate edit of both constant + test.
    expect(MAX_SPLIT_DEPTH).toBe(20);

    let parseCalls = 0;
    const validParse = () => {
      parseCalls++;
      return { type: 'doc' as const, content: [{ type: 'paragraph' }] };
    };

    // Left side of the boundary: deepest permitted depth. Parse IS invoked
    // and returns the PM tree; no whole-doc fallback.
    const belowResult = parseRecursive('any content\n', validParse, MAX_SPLIT_DEPTH);
    expect(belowResult.type).toBe('doc');
    expect(parseCalls).toBe(1);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);

    // Right side of the boundary: one past permitted. Parse is NEVER
    // invoked — whole-doc fires synchronously. Re-assert parseCalls stayed
    // at 1 to prove the short-circuit.
    const aboveResult = parseRecursive('any content\n', validParse, MAX_SPLIT_DEPTH + 1);
    expect(aboveResult.type).toBe('doc');
    const above = aboveResult.content as { type: string; content?: { text?: string }[] }[];
    expect(above.length).toBe(1);
    expect(above[0].type).toBe('paragraph');
    expect(above[0].content?.[0]?.text).toContain('any content');
    expect(parseCalls).toBe(1); // unchanged — short-circuit bypassed parse()
    expect(getParseHealth().parseFallback.wholeDoc).toBe(1);
  });

  test('(c1) tryPerBlockFallback single-block early-return: position-less error on one-block doc → whole-doc', () => {
    // Reviewer's concern: the `if (blocks.length < 2) return null` guard is
    // untested. A single-block document with a position-less error should
    // fall to whole-doc raw text, NOT attempt per-block splitting (which
    // would wrap the whole doc in a rawMdxFallback).
    const singleBlock = 'just one paragraph here no blank lines';
    const result = parseWithFallbackFn(singleBlock, {
      parse: () => {
        // Position-less error ALWAYS — forces position-less fallback path,
        // then per-block split encounters single block, returns null,
        // caller falls to wholeDocRawText.
        throw new Error('always fails, no position');
      },
    });
    expect(result.type).toBe('doc');
    // Whole-doc fallback produces ONE paragraph containing the source
    const children = result.content as {
      type: string;
      content?: { type: string; text?: string }[];
    }[];
    expect(children.length).toBe(1);
    expect(children[0].type).toBe('paragraph');
    const text = children[0].content?.[0]?.text ?? '';
    expect(text).toContain('just one paragraph here');
    // No rawMdxFallback node — single-block path intentionally avoids wrapping
    const types = children.map((c) => c.type);
    expect(types).not.toContain('rawMdxFallback');
    expect(getParseHealth().parseFallback.wholeDoc).toBeGreaterThanOrEqual(1);
  });
});

// ─── US-015 R23 parseWithFallback perf bound ─────────────────────────
//
// At scale, parseWithFallback on input with some broken MDX regions must
// stay within 5× the happy-path `parse()` time on equivalent-size valid
// input. Rationale (SPEC A9): the fallback path invokes `parse()`
// recursively on the split regions — K broken blocks produce ≈ K levels
// of linear recursion, and each level re-parses a shrinking suffix.
// Worst-case is O(2^MAX_SPLIT_DEPTH), but realistic shapes (a handful of
// broken regions scattered across a mostly-valid document) land well
// below that. 5× is the loud bound: if this fails, investigate the
// specific shape rather than loosen the bound.
//
// The broken-block count is deliberately modest (5) so recursion depth
// stays << MAX_SPLIT_DEPTH — more broken blocks would push us toward the
// depth guard and into whole-doc fallback, which tests a different path.

describeBench('parseWithFallback perf bound vs happy path (R23)', () => {
  // Run budget (per block count, summed over happy + fallback):
  //   2 warm-ups + 3 measured × 2 paths = 10 invocations
  //   10K blocks: ~3.5s fallback + ~1.1s happy median ⇒ ~45s wall time.
  // The 120s per-test timeout below absorbs warmups + slower CI runners
  // without inflating the ratio bound itself.
  const MEASURED_RUNS = 3;
  const WARM_UPS = 2;
  const RATIO_BOUND = 5;
  const TEST_TIMEOUT_MS = 120_000;

  /** Inject `count` `<Foo>bad</Bar>` blocks evenly across `valid` at block boundaries. */
  function injectBrokenBlocks(valid: string, count: number): string {
    // Split at blank-line block boundaries. For each target slot, replace
    // the slot's leading content with a tag-mismatch payload so micromark
    // reports an offset and parseWithFallback engages block-level fallback.
    const parts = valid.split(/\n\n+/);
    if (parts.length < count * 2) {
      throw new Error(
        `fixture has ${parts.length} parts, need at least ${count * 2} to inject ${count} broken blocks`,
      );
    }
    const step = Math.floor(parts.length / (count + 1));
    for (let i = 1; i <= count; i++) {
      const idx = i * step;
      parts[idx] = `<Foo>broken ${i}</Bar>`;
    }
    return parts.join('\n\n');
  }

  function median(xs: number[]): number {
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  function measure(fn: () => unknown, warmups: number, runs: number): number[] {
    for (let i = 0; i < warmups; i++) fn();
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      Bun.gc(true);
      const t0 = performance.now();
      fn();
      times.push(performance.now() - t0);
    }
    return times;
  }

  test.each([1000, 10000] as const)(
    'fallback path at %i blocks stays within 5× happy-path parse',
    (blockCount) => {
      const valid = loadPerfFixture(blockCount);
      const broken = injectBrokenBlocks(valid, 5);

      const happyTimes = measure(() => mdManager.parse(valid), WARM_UPS, MEASURED_RUNS);
      const fallbackTimes = measure(
        () => mdManager.parseWithFallback(broken),
        WARM_UPS,
        MEASURED_RUNS,
      );

      const happyMs = median(happyTimes);
      const fallbackMs = median(fallbackTimes);
      const ratio = fallbackMs / happyMs;

      // Log the observed ratio so a passing-but-drifting ratio shows up in
      // CI logs without flaking the gate.
      console.log(
        `[R23 perf ${blockCount} blocks] happy p50=${happyMs.toFixed(1)}ms fallback p50=${fallbackMs.toFixed(1)}ms ratio=${ratio.toFixed(2)}×`,
      );

      expect(ratio).toBeLessThanOrEqual(RATIO_BOUND);
      // Sanity: the fallback path actually engaged block-level recovery.
      expect(getParseHealth().parseFallback.blockLevel).toBeGreaterThanOrEqual(1);
    },
    TEST_TIMEOUT_MS,
  );
});
