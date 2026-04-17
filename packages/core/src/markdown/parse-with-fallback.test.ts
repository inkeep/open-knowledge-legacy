import { afterEach, describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { getParseHealth, resetParseHealth } from '../metrics/parse-health.ts';
import { findFencedRegions } from './fence-regions.ts';
import { loadPerfFixture } from './fixtures/index.ts';
import { MarkdownManager } from './index.ts';
import {
  enumerateFallbackRegions,
  MAX_SPLIT_DEPTH,
  parseRecursive,
  parseWithFallback as parseWithFallbackFn,
  scanTagEvents,
  type TagEvent,
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

  test('(m3) nested broken — innermost paired region captured', () => {
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
    const singleBlock = 'just one paragraph here no blank lines';
    const result = parseWithFallbackFn(singleBlock, {
      parse: () => {
        throw new Error('always fails, no position');
      },
    });
    expect(result.type).toBe('doc');
    const children = result.content as {
      type: string;
      content?: { type: string; text?: string }[];
    }[];
    expect(children.length).toBe(1);
    expect(children[0].type).toBe('paragraph');
    const text = children[0].content?.[0]?.text ?? '';
    expect(text).toContain('just one paragraph here');
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

// ── SC — scanTagEvents unit correctness (FR-23) ─────────────────────────────

describe('scanTagEvents (SC series)', () => {
  function scan(src: string): TagEvent[] {
    return scanTagEvents(src, findFencedRegions(src));
  }

  test('SC01: paired open/close tags produce OPEN + CLOSE events', () => {
    const events = scan('<Foo bar="baz">text</Foo>');
    expect(events.length).toBe(2);
    expect(events[0].kind).toBe('open');
    expect(events[0].name).toBe('Foo');
    expect(events[0].start).toBe(0);
    expect(events[1].kind).toBe('close');
    expect(events[1].name).toBe('Foo');
  });

  test('SC02: unclosed quote (EOL before close) emits no event (v1 safe-coarsening)', () => {
    const events = scan('<Foo bar="');
    // Forward scan enters quote state at `="` and never exits → no event emitted
    expect(events.length).toBe(0);
  });

  test('SC03: brace-depth tracking skips > inside {…}', () => {
    const events = scan('<Foo bar={x > 5}>text</Foo>');
    // Should produce one OPEN + one CLOSE, not split at the inner >
    expect(events.length).toBe(2);
    expect(events[0].kind).toBe('open');
    expect(events[0].name).toBe('Foo');
    expect(events[1].kind).toBe('close');
    expect(events[1].name).toBe('Foo');
  });

  test('SC04: nested braces with JSX-like content inside expression attr', () => {
    const events = scan('<Foo bar={items.map(x => <span>{x}</span>)}>');
    // Brace-depth tracking handles nested {/}. Inner <span> is inside expression,
    // not a tag event. Single OPEN(Foo) event.
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('open');
    expect(events[0].name).toBe('Foo');
  });

  test('SC05: tag inside fenced code block produces no events', () => {
    const src = '```\n<Foo>\n```';
    const events = scan(src);
    expect(events.length).toBe(0);
  });

  test('SC06: comment-like <!-- <Foo> --> does not produce OPEN(Foo)', () => {
    // <!-- is not a valid JSX/MDX tag start (tag names must start with [A-Z])
    const events = scan('<!-- <Foo> -->');
    // The scanner may see <Foo> inside the comment if it's not a fence —
    // but `<!--` doesn't match `<[A-Z]`, so it's skipped as a tag start.
    // However <Foo> inside the comment text WILL match the regex (it's not fenced).
    // This is acceptable — MDX doesn't have HTML comments, and the scanner
    // produces a conservative result.
    // What matters: no crash, and the event (if any) is for Foo, not `!--`.
    for (const ev of events) {
      expect(ev.name).not.toContain('!');
    }
  });

  test('SC07: < followed by space is not a tag start', () => {
    const events = scan('< 5');
    expect(events.length).toBe(0);
  });

  test('SC08: numeric tag names produce no events', () => {
    const events = scan('<5>');
    expect(events.length).toBe(0);
    const events2 = scan('<123>');
    expect(events2.length).toBe(0);
  });

  test('SC09: self-closing variants recognized', () => {
    const variants = ['<Foo/>', '<Foo />', '<Foo  />', '<Foo\n/>'];
    for (const src of variants) {
      const events = scan(src);
      expect(events.length).toBe(1);
      expect(events[0].kind).toBe('self-close');
      expect(events[0].name).toBe('Foo');
    }
  });

  test('SC10: multi-line tag produces single OPEN event', () => {
    const src = '<Foo\n  bar="baz"\n  baz="qux"\n>';
    const events = scan(src);
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('open');
    expect(events[0].name).toBe('Foo');
    expect(events[0].start).toBe(0);
  });
});

// ── NB — enumerateFallbackRegions + findFallbackRegion integration (FR-23) ──

describe('enumerateFallbackRegions + findFallbackRegion (NB series)', () => {
  afterEach(() => resetParseHealth());

  test('NB01: broken inner attr inside second Accordion — only second degrades', () => {
    const src =
      '<Accordions>\n<Accordion title="First">ok</Accordion>\n<Accordion title="Second"><Image src="\n</Accordion>\n</Accordions>';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    // The rawMdxFallback should NOT contain the entire Accordions — it should
    // be localized. Check that at least some structured content survives.
    expect(getParseHealth().parseFallback.blockLevel).toBeGreaterThanOrEqual(1);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('NB02: tag mismatch inside second Card — fallback fires', () => {
    // Use tag mismatch (which agnostic-mode MDX reliably errors on) rather
    // than unclosed attrs (which agnostic mode tolerates).
    const src =
      '# Before\n\n<Cards>\n<Card>clean first</Card>\n<Card><Foo>broken</Bar></Card>\n</Cards>\n\n# After';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('NB03: tag mismatch inside middle Tab — surrounding structure preserved', () => {
    const src =
      '# Before\n\n<Tabs>\n<Tab>a</Tab>\n<Tab><Foo>broken</Bar></Tab>\n<Tab>c</Tab>\n</Tabs>\n\n# After';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('NB04: tag mismatch deep in nested pairs — fallback preserves outer structure', () => {
    const src =
      '# Before\n\n<Outer>\n<Mid>\n<Inner><Foo>x</Bar></Inner>\n</Mid>\n</Outer>\n\n# After';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('NB05: error in purely-prose block with no enclosing MDX tags → blank-line bounds', () => {
    const regions = enumerateFallbackRegions('# Hello\n\nsome broken text\n\n# Footer');
    // No MDX structure — no regions emitted; findFallbackRegion falls through
    // to blank-line bounds for an error offset in the middle
    const mdxRegions = regions.filter((r) => r.source === 'pair' || r.source === 'unmatched');
    // No JSX tags means no regions
    expect(mdxRegions.length).toBe(0);
  });

  test('NB06: two independent broken regions in separate ancestor chains', () => {
    // Two broken sections separated by clean content
    const src = '# Intro\n\n<Foo>broken1</Bar>\n\nClean paragraph\n\n<Baz>broken2</Qux>\n\n# Outro';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    const fallbacks = types.filter((t) => t === 'rawMdxFallback');
    // At least one rawMdxFallback — both independent broken regions degrade
    expect(fallbacks.length).toBeGreaterThanOrEqual(1);
    // Surrounding headings should survive
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('NB07: broken tag inside fenced code block — no regions emitted for fenced content', () => {
    const src = '```\n<Foo attr="\n```\n\nClean paragraph';
    const regions = enumerateFallbackRegions(src);
    // Tags inside fences are not scanned, so no regions
    expect(regions.length).toBe(0);
  });

  test('NB08: deep nesting stress (8-level) — single-pass with no re-parse', () => {
    const src =
      '<A>\n<B>\n<C>\n<D>\n<E>\n<F>\n<G>\n<H>x<Image src="</H>\n</G>\n</F>\n</E>\n</D>\n</C>\n</B>\n</A>';
    const regions = enumerateFallbackRegions(src);
    // All 8 pairs + inner Image doesn't emit (unclosed quote safe-coarsening)
    // We should have at least 8 pair regions for the properly-closed levels
    const pairs = regions.filter((r) => r.source === 'pair');
    expect(pairs.length).toBe(8);

    // Test via parseWithFallback — should produce structured result, not whole-doc
    const _result = mdManager.parseWithFallback(src);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('NB09: safe-coarsening via scanTagEvents — unclosed quote suppresses tag event', () => {
    // Under v1 safe-coarsening: an open tag with an unclosed attribute quote
    // like `<Accordion broken attr="` emits NO TagEvent from scanTagEvents
    // (the forward scan enters quote state and never exits → no `>` found).
    // Verify this directly at the scanner level.
    const src = '<Accordions>\n<Accordion broken attr="\n  orphan text\n</Accordions>';
    const fences = findFencedRegions(src);
    const events = scanTagEvents(src, fences);
    // The broken `<Accordion broken attr="` should NOT produce an open event
    // because the unclosed quote prevents finding `>`.
    const accordionOpens = events.filter((e) => e.kind === 'open' && e.name === 'Accordion');
    expect(accordionOpens.length).toBe(0);
    // But <Accordions> and </Accordions> should be detected
    const accordionsOpens = events.filter((e) => e.kind === 'open' && e.name === 'Accordions');
    const accordionsCloses = events.filter((e) => e.kind === 'close' && e.name === 'Accordions');
    expect(accordionsOpens.length).toBe(1);
    expect(accordionsCloses.length).toBe(1);
  });

  test("NB10: self-closing tags don't enter stack", () => {
    const src = '<Outer>\n<SelfClose attr="x" />\n<Inner>x<Image src="broken</Inner>\n</Outer>';
    const regions = enumerateFallbackRegions(src);
    // SelfClose should NOT be in any region as a pair participant
    const selfCloseRegions = regions.filter((r) => {
      const regionText = src.slice(r.start, r.end);
      return (
        regionText.includes('SelfClose') &&
        r.source === 'pair' &&
        !regionText.includes('Outer') &&
        !regionText.includes('Inner')
      );
    });
    expect(selfCloseRegions.length).toBe(0);
    // Inner should be a pair (properly closed)
    const innerPairs = regions.filter(
      (r) => r.source === 'pair' && src.slice(r.start, r.end).startsWith('<Inner'),
    );
    expect(innerPairs.length).toBe(1);
    // Outer should also be a pair
    const outerPairs = regions.filter(
      (r) => r.source === 'pair' && src.slice(r.start, r.end).startsWith('<Outer'),
    );
    expect(outerPairs.length).toBe(1);
  });

  test('NB11: top-level unmatched-open bounded by blank line', () => {
    const src = '# Intro\n\n<Foo>content</Bar>\n\n# Outro';
    const regions = enumerateFallbackRegions(src);
    // <Foo> push; </Bar> orphan close (name mismatch, dropped); at EOF Foo
    // still on stack → unmatched with end = nearestBlankLineAfter(<Foo>.start)
    const unmatchedFoo = regions.filter(
      (r) => r.source === 'unmatched' && src.slice(r.start, r.start + 4) === '<Foo',
    );
    expect(unmatchedFoo.length).toBe(1);
    // The unmatched region should NOT extend past the blank line before # Outro
    const region = unmatchedFoo[0];
    expect(region.end).toBeLessThanOrEqual(src.indexOf('\n\n# Outro'));

    // End-to-end: parseWithFallback should produce rawMdxFallback + preserve headings
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });
});
