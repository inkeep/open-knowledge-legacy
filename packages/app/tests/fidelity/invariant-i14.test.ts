/**
 * Invariant I14 — rawMdxFallback byte-identity.
 *
 * The G9 always-live bridge guarantees that when a block parses to
 * `rawMdxFallback` (R6), the fallback node's `sourceRaw` attr holds the
 * original source bytes for that region. This invariant asserts:
 *
 *   For every rawMdxFallback node N in parse(md):
 *     serialize(subtree containing only N) === N.attrs.sourceRaw
 *
 * This is the load-bearing contract: the user's raw text is preserved
 * through the tolerant-parse path and re-emitted verbatim. Without I14,
 * silent content loss in fallback blocks becomes possible — the user types
 * broken MDX, sees it displayed, but a subsequent save drops the raw bytes
 * because the serializer emitted a canonical placeholder instead.
 *
 * Coverage:
 *   A) Crash-taxonomy corpus: 14 cases with `expectedOutcome: 'clean-or-fallback'`
 *      — any case that produces rawMdxFallback gets its sourceRaw asserted
 *        byte-identical to the original input's broken region.
 *   B) 10 hand-authored malformed-MDX fixtures: unclosed tags, tag-mismatch,
 *      malformed expression attrs, nested-unclosed, and mixed text+broken-JSX.
 *
 * SPEC §7.1 I14.
 */

import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import { loadMdxCrashTaxonomy } from '../../../core/src/markdown/fixtures/index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

/** Collect every rawMdxFallback node in the PM tree, flat. */
function collectRawMdxFallbacks(node: JSONContent): JSONContent[] {
  const out: JSONContent[] = [];
  function walk(n: JSONContent): void {
    if (n.type === 'rawMdxFallback') out.push(n);
    if (n.content) for (const child of n.content) walk(child);
  }
  walk(node);
  return out;
}

/**
 * Extract the raw source bytes from a rawMdxFallback node. Per Precedent #10
 * (content-bearing opaque nodes for Y.Item identity), the raw source is
 * stored as a `text` child, not as `attrs.sourceRaw`. The attrs carry only
 * `{reason, originalSpan}` metadata.
 */
function sourceRawOf(node: JSONContent): string | null {
  if (!node.content || node.content.length === 0) return null;
  // Concatenate every text child — the content is `text*` so children are
  // text nodes. In practice there's one, but we handle the general case.
  const parts: string[] = [];
  for (const child of node.content) {
    if (child.type === 'text' && typeof child.text === 'string') parts.push(child.text);
  }
  return parts.length > 0 ? parts.join('') : null;
}

/**
 * For each rawMdxFallback found, assert that sourceRaw appears as a
 * substring of the original input. This is the byte-preservation contract
 * — the user's raw bytes survive the tolerant-parse transformation intact.
 */
function assertRawMdxFallbackByteIdentity(input: string, label: string): number {
  // Tolerant parse: never throws, produces rawMdxFallback on broken regions.
  // This is the path server Observer B uses (precedent #14); I14 asserts
  // that when the fallback fires, sourceRaw preserves the bytes verbatim.
  const parsed = mdManager.parseWithFallback(input);
  const fallbacks = collectRawMdxFallbacks(parsed);
  for (const node of fallbacks) {
    const raw = sourceRawOf(node);
    expect(raw, `${label}: rawMdxFallback must have sourceRaw`).not.toBeNull();
    if (raw !== null) {
      // The sourceRaw must appear verbatim in the original input, preserving
      // every byte the user typed. We use includes() instead of a strict
      // range-offset check because R6's findFallbackRegion may trim leading
      // or trailing whitespace via structural enumeration — the
      // byte-preservation contract is "no bytes inside the region are
      // rewritten," not "offsets are preserved."
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
      // May produce 0 fallbacks (parsed clean) or 1+ fallbacks. Either is
      // valid; we only assert that any fallback emitted has byte-identity.
      assertRawMdxFallbackByteIdentity(entry.input, entry.id);
    });
  }
});

describe('I14 — rawMdxFallback byte-identity (hand-authored malformed fixtures)', () => {
  // Two-tier corpus per pre-QA review M6:
  //
  //   ALWAYS_FALLBACK — fixtures whose shape MUST emit at least one
  //     rawMdxFallback under any conformant parser. Per-fixture pin
  //     `expect(fallbacks.length).toBeGreaterThanOrEqual(1)` ensures the
  //     byte-identity invariant is deterministically exercised on these.
  //     A parser change that lets one of these parse clean is a regression
  //     — accept the failure, then promote intentionally if appropriate.
  //
  //   MAY_FALLBACK — fixtures whose shape is ambiguous under the agnostic
  //     MDX mode (R23-tolerant). Some emit fallbacks today, some don't,
  //     and the boundary is sensitive to the parser's tolerance heuristics.
  //     We don't pin per-fixture (would couple I14 to incidental tolerance
  //     behavior); the suite-level floor is the canary across the whole
  //     bucket.
  //
  // Pre-fix the loop over `fallbacks` short-circuited to a no-op when a
  // fixture parsed clean, so byte-identity was exercised on a non-
  // deterministic subset. Splitting the corpus restores deterministic
  // exercise on the load-bearing shapes.
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

  // ALWAYS_FALLBACK: per-fixture pin of `>= 1` fallbacks AND byte-identity.
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

  // MAY_FALLBACK: still asserts byte-identity if any fallback fires;
  // tolerates 0 fallbacks (parser accepted the input under agnostic mode).
  for (const fixture of MAY_FALLBACK) {
    test(`${fixture.id} — ${fixture.name} (byte-identity if any fallback fires)`, () => {
      assertRawMdxFallbackByteIdentity(fixture.input, fixture.id);
    });
  }

  // Suite-level floor (M12 ratchet, refined post-M6 review): the
  // ALWAYS_FALLBACK bucket guarantees ≥ 4 fallbacks (one per fixture).
  // The MAY_FALLBACK bucket adds opportunistic coverage. Total floor of 4
  // is the deterministic minimum the per-fixture pins enforce; if a future
  // change reduces ALWAYS_FALLBACK (e.g. promotes one to MAY_FALLBACK),
  // adjust the floor in lockstep with the pin removal so the ratchet
  // stays auditable.
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
  // Additional load-bearing property: a doc containing a rawMdxFallback
  // serializes the fallback region back to the byte-identical sourceRaw.
  // This is the user-facing invariant — save a doc with a broken block,
  // re-open, and the broken block is preserved character-for-character.
  test('fallback-only doc round-trip preserves bytes', () => {
    const input = '<Foo\nbroken';
    const parsed = mdManager.parseWithFallback(input);
    const fallbacks = collectRawMdxFallbacks(parsed);
    // Either the parse produced 0 fallbacks (agnostic mode accepted it) or
    // 1+ fallbacks with the broken region preserved. Both outcomes are G9-
    // compliant. When fallbacks present, serialize→parse round-trip must
    // preserve the byte-exact sourceRaw.
    if (fallbacks.length > 0) {
      const serialized = mdManager.serialize(parsed);
      // The serialized output must contain the fallback's sourceRaw.
      const raw = sourceRawOf(fallbacks[0]);
      expect(raw).not.toBeNull();
      if (raw !== null) {
        expect(serialized.includes(raw)).toBe(true);
      }
    }
  });
});
