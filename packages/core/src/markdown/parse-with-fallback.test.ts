import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
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

const BENCH_ENABLED = process.env.RUN_BENCH === '1' || process.env.RUN_BENCH === 'true';
const describeBench = BENCH_ENABLED ? describe : describe.skip;

describe('parseWithFallback (R6)', () => {
  beforeEach(() => resetParseHealth());
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
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(getParseHealth().parseFallback.blockLevel).toBeGreaterThanOrEqual(1);
  });

  test('mismatched close tag in middle produces rawMdxFallback', () => {
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
    const serialized = mdManager.serialize(result);
    expect(serialized).toContain('[ref1]: https://example.com');
    expect(serialized).toContain('[link][ref1]');
  });

  test('code fence containing <Tag> is not mistaken for JSX', () => {
    const src = '```\nsome code <Tag> inside\n```\n\n<Foo>broken</Bar>\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('codeBlock');
    expect(types).toContain('rawMdxFallback');
  });

  test('empty input returns empty doc', () => {
    const result = mdManager.parseWithFallback('');
    expect(result.type).toBe('doc');
  });

  test('(m2) recovery-failure path: split succeeds but recursive parse throws → whole-doc fallback', () => {
    let callCount = 0;
    const result = parseWithFallbackFn('a\n\nb\n\nc', {
      parse: () => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('first call fails with position') as Error & {
            place: { offset: number };
          };
          err.place = { offset: 4 };
          throw err;
        }
        throw new Error('recovery parse fail');
      },
    });
    expect(result.type).toBe('doc');
    const children = result.content as { type: string }[];
    expect(children.length).toBeGreaterThanOrEqual(1);
    expect(getParseHealth().parseFallback.wholeDoc).toBeGreaterThanOrEqual(1);
  });

  test('(m3) enumerateFallbackRegions: surrounding headings preserved when mid-doc fallback fires', () => {
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

  test('(r23 boundary) depth=MAX_SPLIT_DEPTH permits parse; depth=MAX_SPLIT_DEPTH+1 short-circuits to whole-doc', () => {
    expect(MAX_SPLIT_DEPTH).toBe(20);

    let parseCalls = 0;
    const validParse = () => {
      parseCalls++;
      return { type: 'doc' as const, content: [{ type: 'paragraph' }] };
    };

    const belowResult = parseRecursive('any content\n', validParse, MAX_SPLIT_DEPTH);
    expect(belowResult.type).toBe('doc');
    expect(parseCalls).toBe(1);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);

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

  describe('never-throws invariant (Observer B hot-path)', () => {
    const pathological = [
      '<Foo>',
      '<Foo><Bar></Foo>',
      '<Foo bar="',
      '<Foo bar={',
      '{ unclosed',
      '{ {{ nested unbalanced }',
      '<div><span>',
      '\u0000\u0001\u0002',
      '',
      '\n',
      '<',
      '{',
      '# H\n\n<Foo>\n\n<Bar attr="xxx',
    ];

    for (const src of pathological) {
      const label = JSON.stringify(src).slice(0, 60);
      test(`does not throw on ${label}`, () => {
        expect(() => mdManager.parseWithFallback(src)).not.toThrow();
      });
    }
  });
});

describeBench('parseWithFallback perf bound vs happy path (R23)', () => {
  const MEASURED_RUNS = 3;
  const WARM_UPS = 2;
  const RATIO_BOUND = 5;
  const TEST_TIMEOUT_MS = 120_000;

  function injectBrokenBlocks(valid: string, count: number): string {
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

      console.log(
        `[R23 perf ${blockCount} blocks] happy p50=${happyMs.toFixed(1)}ms fallback p50=${fallbackMs.toFixed(1)}ms ratio=${ratio.toFixed(2)}×`,
      );

      expect(ratio).toBeLessThanOrEqual(RATIO_BOUND);
      expect(getParseHealth().parseFallback.blockLevel).toBeGreaterThanOrEqual(1);
    },
    TEST_TIMEOUT_MS,
  );
});

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
    expect(events.length).toBe(0);
  });

  test('SC03: brace-depth tracking skips > inside {…}', () => {
    const events = scan('<Foo bar={x > 5}>text</Foo>');
    expect(events.length).toBe(2);
    expect(events[0].kind).toBe('open');
    expect(events[0].name).toBe('Foo');
    expect(events[1].kind).toBe('close');
    expect(events[1].name).toBe('Foo');
  });

  test('SC04: nested braces with JSX-like content inside expression attr', () => {
    const events = scan('<Foo bar={items.map(x => <span>{x}</span>)}>');
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
    const events = scan('<!-- <Foo> -->');
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

describe('enumerateFallbackRegions + findFallbackRegion (NB series)', () => {
  afterEach(() => resetParseHealth());

  test('NB01: broken inner attr inside second Accordion — only second degrades', () => {
    const src =
      '<Accordions>\n<Accordion title="First">ok</Accordion>\n<Accordion title="Second"><Image src="\n</Accordion>\n</Accordions>';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    expect(getParseHealth().parseFallback.blockLevel).toBeGreaterThanOrEqual(1);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('NB02: tag mismatch inside second Card — fallback fires', () => {
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
    const mdxRegions = regions.filter((r) => r.source === 'pair' || r.source === 'unmatched');
    expect(mdxRegions.length).toBe(0);
  });

  test('NB06: two independent broken regions in separate ancestor chains', () => {
    const src = '# Intro\n\n<Foo>broken1</Bar>\n\nClean paragraph\n\n<Baz>broken2</Qux>\n\n# Outro';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    const fallbacks = types.filter((t) => t === 'rawMdxFallback');
    expect(fallbacks.length).toBeGreaterThanOrEqual(1);
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('NB07: broken tag inside fenced code block — no regions emitted for fenced content', () => {
    const src = '```\n<Foo attr="\n```\n\nClean paragraph';
    const regions = enumerateFallbackRegions(src);
    expect(regions.length).toBe(0);
  });

  test('NB08: deep nesting stress (8-level) — single-pass with no re-parse', () => {
    const src =
      '<A>\n<B>\n<C>\n<D>\n<E>\n<F>\n<G>\n<H>x<Image src="</H>\n</G>\n</F>\n</E>\n</D>\n</C>\n</B>\n</A>';
    const regions = enumerateFallbackRegions(src);
    const pairs = regions.filter((r) => r.source === 'pair');
    expect(pairs.length).toBe(8);

    const _result = mdManager.parseWithFallback(src);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('NB09: safe-coarsening via scanTagEvents — unclosed quote suppresses tag event', () => {
    const src = '<Accordions>\n<Accordion broken attr="\n  orphan text\n</Accordions>';
    const fences = findFencedRegions(src);
    const events = scanTagEvents(src, fences);
    const accordionOpens = events.filter((e) => e.kind === 'open' && e.name === 'Accordion');
    expect(accordionOpens.length).toBe(0);
    const accordionsOpens = events.filter((e) => e.kind === 'open' && e.name === 'Accordions');
    const accordionsCloses = events.filter((e) => e.kind === 'close' && e.name === 'Accordions');
    expect(accordionsOpens.length).toBe(1);
    expect(accordionsCloses.length).toBe(1);
  });

  test("NB10: self-closing tags don't enter stack", () => {
    const src = '<Outer>\n<SelfClose attr="x" />\n<Inner>x<Image src="broken</Inner>\n</Outer>';
    const regions = enumerateFallbackRegions(src);
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
    const innerPairs = regions.filter(
      (r) => r.source === 'pair' && src.slice(r.start, r.end).startsWith('<Inner'),
    );
    expect(innerPairs.length).toBe(1);
    const outerPairs = regions.filter(
      (r) => r.source === 'pair' && src.slice(r.start, r.end).startsWith('<Outer'),
    );
    expect(outerPairs.length).toBe(1);
  });

  test('NB11: top-level unmatched-open bounded by blank line', () => {
    const src = '# Intro\n\n<Foo>content</Bar>\n\n# Outro';
    const regions = enumerateFallbackRegions(src);
    const unmatchedFoo = regions.filter(
      (r) => r.source === 'unmatched' && src.slice(r.start, r.start + 4) === '<Foo',
    );
    expect(unmatchedFoo.length).toBe(1);
    const region = unmatchedFoo[0];
    expect(region.end).toBeLessThanOrEqual(src.indexOf('\n\n# Outro'));

    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });
});
