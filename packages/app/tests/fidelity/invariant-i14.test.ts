import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import { loadMdxCrashTaxonomy } from '../../../core/src/markdown/fixtures/index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function collectRawMdxFallbacks(node: JSONContent): JSONContent[] {
  const out: JSONContent[] = [];
  function walk(n: JSONContent): void {
    if (n.type === 'rawMdxFallback') out.push(n);
    if (n.content) for (const child of n.content) walk(child);
  }
  walk(node);
  return out;
}

function sourceRawOf(node: JSONContent): string | null {
  if (!node.content || node.content.length === 0) return null;
  const parts: string[] = [];
  for (const child of node.content) {
    if (child.type === 'text' && typeof child.text === 'string') parts.push(child.text);
  }
  return parts.length > 0 ? parts.join('') : null;
}

function assertRawMdxFallbackByteIdentity(input: string, label: string): number {
  const parsed = mdManager.parseWithFallback(input);
  const fallbacks = collectRawMdxFallbacks(parsed);
  for (const node of fallbacks) {
    const raw = sourceRawOf(node);
    expect(raw, `${label}: rawMdxFallback must have sourceRaw`).not.toBeNull();
    if (raw !== null) {
      expect(input.includes(raw), `${label}: sourceRaw not present in input`).toBe(true);
    }
  }
  return fallbacks.length;
}

describe('I14 — rawMdxFallback byte-identity (crash-taxonomy corpus)', () => {
  const entries = loadMdxCrashTaxonomy();
  const degradableEntries = entries.filter((e) => e.expectedOutcome === 'clean-or-fallback');

  for (const entry of degradableEntries) {
    test(`${entry.id}: ${entry.class}`, () => {
      assertRawMdxFallbackByteIdentity(entry.input, entry.id);
    });
  }
});

describe('I14 — rawMdxFallback byte-identity (hand-authored malformed fixtures)', () => {
  const ALWAYS_FALLBACK: Array<{ id: string; name: string; input: string }> = [
    {
      id: 'M02',
      name: 'tag-mismatch-open-close',
      input: '# Doc\n\n<Widget>Content</Callout>\n\n# Later\n',
    },
    {
      id: 'M04',
      name: 'malformed-expression-attr-brace-mismatch',
      input: '# Doc\n\n<Comp data={unclosed >\n\nContent\n\n</Comp>\n',
    },
    {
      id: 'M05',
      name: 'malformed-string-attr-unclosed-quote',
      input: '# Doc\n\n<Comp title="never closed>\n\nContent\n\n</Comp>\n',
    },
    {
      id: 'M07',
      name: 'double-open-same-tag',
      input: '# Doc\n\n<Widget><Widget>nested open\n\n</Widget>\n',
    },
  ];

  const MAY_FALLBACK: Array<{ id: string; name: string; input: string }> = [
    {
      id: 'M01',
      name: 'unclosed-paired-tag',
      input: '# Doc\n\n<Widget>\n\nContent that never closes.\n\n# Later\n',
    },
    {
      id: 'M03',
      name: 'nested-unclosed-inner',
      input: '# Doc\n\n<Outer>\n\n<Inner>\n\nForgot to close\n\n</Outer>\n',
    },
    {
      id: 'M06',
      name: 'unclosed-self-closing-slash',
      input: '# Doc\n\n<Icon name="check" /\n\n# Later\n',
    },
    {
      id: 'M08',
      name: 'fragment-open-no-close',
      input: '# Doc\n\n<>\n\nFragment never closed\n\n# Later\n',
    },
    {
      id: 'M09',
      name: 'tag-with-invalid-name-char',
      input: '# Doc\n\n<Foo$bar>content</Foo$bar>\n\n# Later\n',
    },
    {
      id: 'M10',
      name: 'mixed-text-and-broken-jsx-single-block',
      input: '# Doc\n\nPrefix text <Comp\n\nContent\n',
    },
  ];

  for (const fixture of ALWAYS_FALLBACK) {
    test(`${fixture.id} — ${fixture.name} (always emits ≥ 1 fallback + byte-identity)`, () => {
      const fallbackCount = assertRawMdxFallbackByteIdentity(fixture.input, fixture.id);
      expect(
        fallbackCount,
        `${fixture.id} must emit at least one rawMdxFallback. ` +
          'If this fails, the parser silently became more lenient on a shape ' +
          'that should always degrade — review whether the change is intentional.',
      ).toBeGreaterThanOrEqual(1);
    });
  }

  for (const fixture of MAY_FALLBACK) {
    test(`${fixture.id} — ${fixture.name} (byte-identity if any fallback fires)`, () => {
      assertRawMdxFallbackByteIdentity(fixture.input, fixture.id);
    });
  }

  const CORPUS_FALLBACK_FLOOR = 4;

  test(`hand-authored corpus produces ≥ ${CORPUS_FALLBACK_FLOOR} fallbacks total (M12 ratchet)`, () => {
    const totalFallbacks = [...ALWAYS_FALLBACK, ...MAY_FALLBACK].reduce((sum, fixture) => {
      const parsed = mdManager.parseWithFallback(fixture.input);
      return sum + collectRawMdxFallbacks(parsed).length;
    }, 0);
    expect(
      totalFallbacks,
      `corpus must produce ≥ ${CORPUS_FALLBACK_FLOOR} rawMdxFallback emissions total. ` +
        'If this fails, the parser has silently become too lenient — broken MDX that ' +
        'used to degrade now parses clean, leaving I14 byte-identity un-exercised. ' +
        'Review whether the parser change is intentional, then consciously lower ' +
        'CORPUS_FALLBACK_FLOOR (and update this comment) to ratchet.',
    ).toBeGreaterThanOrEqual(CORPUS_FALLBACK_FLOOR);
  });
});

describe('I14 — rawMdxFallback round-trip: serialize fallback subtree byte-identity', () => {
  test('fallback-only doc round-trip preserves bytes', () => {
    const input = '<Foo\nbroken';
    const parsed = mdManager.parseWithFallback(input);
    const fallbacks = collectRawMdxFallbacks(parsed);
    if (fallbacks.length > 0) {
      const serialized = mdManager.serialize(parsed);
      const raw = sourceRawOf(fallbacks[0]);
      expect(raw).not.toBeNull();
      if (raw !== null) {
        expect(serialized.includes(raw)).toBe(true);
      }
    }
  });
});
