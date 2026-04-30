/**
 * Tests for the isMarkdown signal-count heuristic.
 *
 * The heuristic must reject prose that happens to contain a single `*` or
 * `#` and accept authored markdown with 3+ distinct signals. Threshold
 * scales with line count: min(3, floor(lineCount / 5)), floored at 1.
 */

import { describe, expect, test } from 'bun:test';
import { isMarkdown } from './is-markdown.ts';

describe('isMarkdown — signal-count heuristic', () => {
  test('rejects simple one-line prose', () => {
    expect(isMarkdown('hello world')).toBe(false);
  });

  test('rejects short prose even with one accidental marker', () => {
    expect(isMarkdown("Tom's *favorite* movie")).toBe(false);
  });

  test('accepts authored markdown with 3+ signals', () => {
    const md = `# heading\n\n- bullet\n- bullet\n\n[link](url)\n\n\`\`\`\ncode\n\`\`\`\n`;
    expect(isMarkdown(md)).toBe(true);
  });

  test('accepts GFM table', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |';
    expect(isMarkdown(md)).toBe(true);
  });

  test('accepts fenced code block alone', () => {
    const md = '```typescript\nconst x = 1;\n```';
    expect(isMarkdown(md)).toBe(true);
  });

  test('short snippet (<5 lines) accepts at threshold 1', () => {
    // threshold = max(1, min(3, floor(4/5))) = max(1, 0) = 1
    expect(isMarkdown('- one\n- two\n- three\n- four')).toBe(true);
  });

  test('long prose with no markdown signals is rejected', () => {
    const prose = Array(20).fill('This is plain prose with no markdown signals.').join('\n');
    expect(isMarkdown(prose)).toBe(false);
  });

  test('empty string returns false', () => {
    expect(isMarkdown('')).toBe(false);
  });

  test('ATX heading counts as one signal', () => {
    expect(isMarkdown('# heading')).toBe(true);
  });

  test('math block counts', () => {
    expect(isMarkdown('Some text\n$$\n\\frac{a}{b}\n$$')).toBe(true);
  });
});

describe('isMarkdown — extended signals (D8 + D18)', () => {
  describe('blockquote signal', () => {
    test('detects a single blockquote line', () => {
      expect(isMarkdown('> quoted text')).toBe(true);
    });

    test('detects blockquote inside a multi-line snippet', () => {
      expect(isMarkdown('intro\n\n> quoted')).toBe(true);
    });

    test('rejects bare `>` without trailing space (e.g. comparison operator)', () => {
      expect(isMarkdown('if (x > y) {')).toBe(false);
    });
  });

  describe('inline code signal', () => {
    test('detects a single backtick-wrapped span', () => {
      expect(isMarkdown('use `npm install` to add deps')).toBe(true);
    });

    test('rejects unmatched backticks', () => {
      expect(isMarkdown('this has a stray ` backtick')).toBe(false);
    });
  });

  describe('paired emphasis signal', () => {
    test('detects **bold**', () => {
      expect(isMarkdown('this is **bold** text')).toBe(true);
    });

    test('detects __underscored bold__', () => {
      expect(isMarkdown('this is __bold__ text')).toBe(true);
    });

    test('detects ~~strikethrough~~', () => {
      expect(isMarkdown('this is ~~struck~~ text')).toBe(true);
    });

    test('rejects single asterisks', () => {
      expect(isMarkdown('this has a single *italic* word')).toBe(false);
    });

    test('three styles count as one signal (not three)', () => {
      // Single-line snippet, threshold = 1. One paired emphasis hit
      // counts as 1 signal — adding `__` and `~~` does not stack.
      expect(isMarkdown('**a** __b__ ~~c~~')).toBe(true);
    });
  });

  describe('capitalized JSX open tag signal', () => {
    test('detects single-line <Callout> from email/Slack', () => {
      expect(isMarkdown('<Callout type="note">body</Callout>')).toBe(true);
    });

    test('detects self-closing capitalized tag', () => {
      expect(isMarkdown('<Image/>')).toBe(true);
    });

    test('detects capitalized tag with no attributes', () => {
      expect(isMarkdown('<Accordion>x</Accordion>')).toBe(true);
    });

    test('rejects lowercase HTML without attributes (does not match capital re)', () => {
      // Need either lowercase-with-attr or HTML-inline to match — bare `<u>` alone has no attrs and no closing pair on same line wrapping content
      // Bare `<u>` followed by a same-line close *with content* triggers HTML_INLINE_RE; check below
      expect(isMarkdown('plain <u> opener only here')).toBe(false);
    });
  });

  describe('lowercase JSX-with-attribute signal', () => {
    test('detects single-line <img src="…"/>', () => {
      expect(isMarkdown('<img src="x.png" />')).toBe(true);
    });

    test('detects <a href="…">', () => {
      expect(isMarkdown('<a href="https://example.com">link</a>')).toBe(true);
    });

    test('rejects bare lowercase tag without attrs (e.g. <p>)', () => {
      expect(isMarkdown('<p>')).toBe(false);
    });
  });

  describe('raw-HTML-inline signal (D18)', () => {
    test('detects <u>foo</u>', () => {
      expect(isMarkdown('Some <u>foo</u> text')).toBe(true);
    });

    test('detects <mark>...</mark>', () => {
      expect(isMarkdown('a <mark>highlighted</mark> word')).toBe(true);
    });

    test('rejects opener-only <u> on same line without closer', () => {
      expect(isMarkdown('plain text <u> with opener only')).toBe(false);
    });

    test('rejects opener and closer on different lines', () => {
      expect(isMarkdown('<u>\nfoo\n</u>')).toBe(false);
    });
  });

  describe('AI-chat copy-button shape (combined signals)', () => {
    test('blockquote + inline code + paired emphasis triggers the heuristic', () => {
      const aiChat = '> quoted reply\n\nuse `code` here\n\nand **bold** answer\n';
      expect(isMarkdown(aiChat)).toBe(true);
    });
  });

  describe('false-positive guard on prose with incidental signals', () => {
    test('long prose with one accidental `<word>` does not trip', () => {
      const prose = `${Array(20)
        .fill('Plain prose continues without any markdown shape.')
        .join('\n')}\nA stray <thing> appears once.`;
      expect(isMarkdown(prose)).toBe(false);
    });

    test('prose with comparison operators stays below threshold', () => {
      const prose = 'compare x > y and a < b\n'.repeat(10);
      expect(isMarkdown(prose)).toBe(false);
    });
  });

  describe('threshold boundary — exact N-1 vs N signal counts', () => {
    // Threshold formula: `min(3, floor(lineCount/5))` with `Math.max(1,
    // threshold)` floor. For 30 lines: `min(3, 6) = 3`. Boundary anchor
    // tests verify the exact count where prose tips into "looks like
    // markdown" — a regression in the formula would silently shift the
    // false-positive surface.
    test('30-line prose with exactly 2 signals stays below threshold=3', () => {
      const lines = Array(28).fill('Plain prose without markdown shape.');
      const withTwoSignals = [
        '> quoted reply', // blockquote signal #1
        ...lines,
        '`code` reference', // inline-code signal #2
      ].join('\n');
      expect(isMarkdown(withTwoSignals)).toBe(false);
    });

    test('30-line prose with exactly 3 signals hits threshold=3', () => {
      const lines = Array(27).fill('Plain prose without markdown shape.');
      const withThreeSignals = [
        '> quoted reply', // blockquote signal #1
        ...lines,
        '`code` reference', // inline-code signal #2
        'and **bold** word', // paired-emphasis signal #3
      ].join('\n');
      expect(isMarkdown(withThreeSignals)).toBe(true);
    });
  });

  describe('large-payload sampling — head + tail scan above 256KB', () => {
    // `sampleForHeuristic` samples first 32KB + last 32KB of payloads
    // above 256KB so the regex scan stays constant-time regardless of
    // input size. These tests pin the sampling boundaries:
    //   - signals in the head ARE detected,
    //   - signals buried only in the middle are NOT detected (acknowledged
    //     limitation; documented in the spec),
    //   - the join newline between head + tail does not synthesize a
    //     false-positive blockquote at the boundary.
    test('large payload (>256KB) samples head+tail and detects signals in the head', () => {
      const head = '# Heading\n\n- bullet item\n\n```\ncode block\n```\n';
      const filler = 'plain prose line without markdown shape\n'.repeat(7000);
      // ~290KB total — above the 256KB sampling threshold.
      expect((head + filler).length).toBeGreaterThan(256 * 1024);
      expect(isMarkdown(head + filler)).toBe(true);
    });

    test('large payload with signals only in the middle is not detected (sampling limitation)', () => {
      const headFiller = 'plain prose line without markdown shape\n'.repeat(4000);
      const middle = '# Heading\n- bullet\n```\ncode\n```\n';
      const tailFiller = 'plain prose line without markdown shape\n'.repeat(4000);
      const payload = headFiller + middle + tailFiller;
      expect(payload.length).toBeGreaterThan(256 * 1024);
      // Documented sampling limitation — signals only in the unsampled
      // middle region (between head 32KB and tail 32KB) don't surface.
      expect(isMarkdown(payload)).toBe(false);
    });

    test('boundary newline does not synthesize a blockquote false-positive between head and tail', () => {
      // Head ends with `>`; tail starts with ` text`. The join `\n` MUST
      // NOT create `> text` matching `/^> /m` at the boundary. The
      // head's `>` is mid-content (preceded by `a` chars), so the join
      // line begins with `a...>` not `> ` and the pattern doesn't form.
      const head = `${'a'.repeat(32 * 1024 - 1)}>`;
      const tail = ` text${'a'.repeat(32 * 1024 - 5)}`;
      const filler = 'b'.repeat(200 * 1024);
      const payload = head + filler + tail;
      expect(payload.length).toBeGreaterThan(256 * 1024);
      // No real markdown signals in either the head or the tail — only
      // the synthetic boundary token. Should NOT be detected as markdown.
      expect(isMarkdown(payload)).toBe(false);
    });
  });
});
