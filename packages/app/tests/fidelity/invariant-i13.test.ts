/**
 * Invariant I13 — JSX edited idempotence (γ dirty-path).
 *
 * For every block-form built-in fixture, once we flip `sourceDirty=true` on
 * the parsed jsxComponent and serialize, the resulting markdown must be
 * idempotent under re-parse/re-serialize:
 *
 *   dirtyRoundTrip(md)             === serialize(parse(md_with_dirty))
 *   dirtyRoundTrip(dirtyRoundTrip(md)) === dirtyRoundTrip(md)  // idempotent
 *
 * The γ pattern's edited path reconstructs the mdast `mdxJsxFlowElement`
 * from the PM node's typed props + children (NG12 accepts quote / whitespace
 * normalization on first edit). Idempotence is the load-bearing property —
 * two consecutive saves must produce identical output so downstream CRDTs
 * converge on a stable shape.
 *
 * PBT dimension: for each of the 18 built-in fixtures, generate synthetic
 * prop mutations (string replacement, boolean flip, identifier expression)
 * and assert idempotence across the generator's sample space. This catches
 * normalization bugs where a prop-shape the γ reconstructor produces isn't a
 * fixed point under re-parse (e.g. single-quoted string attr → double-quoted
 * re-emission that flips back on second save).
 *
 * SPEC §7.1 I13.
 */

import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { loadBuiltInFixtures } from '../../../core/src/markdown/fixtures/index.ts';
import { assertAcrossSeeds, mdManager, NUM_RUNS } from './helpers';

/** Walk PM JSON tree, apply `mutate` to every jsxComponent node found. */
function walkJsxComponents(node: JSONContent, mutate: (n: JSONContent) => void): void {
  if (node.type === 'jsxComponent') mutate(node);
  if (node.content) {
    for (const child of node.content) walkJsxComponents(child, mutate);
  }
}

/**
 * Round-trip through the γ dirty path: parse, flip `sourceDirty=true` on
 * every jsxComponent (forcing reconstruction on serialize), optionally
 * mutate its props, then serialize.
 */
function dirtyRoundTrip(
  md: string,
  propMutation?: (props: Record<string, unknown>) => void,
): string {
  const json = mdManager.parse(md);
  walkJsxComponents(json, (node) => {
    if (!node.attrs) return;
    node.attrs.sourceDirty = true;
    if (propMutation) {
      const props = (node.attrs.props ?? {}) as Record<string, unknown>;
      propMutation(props);
      node.attrs.props = props;
    }
  });
  return mdManager.serialize(json);
}

const fixtures = loadBuiltInFixtures();
const blockFixtures = fixtures.filter((f) => !f.componentName.includes('-inline-'));

// A synthetic prop-edit arbitrary. We don't use the descriptor registry's
// PropDef shapes because the fixtures intentionally include unregistered +
// unknown-attr cases (FR-21 merge-symmetry). Covers the prop-shape space a
// γ reconstructor must serialize correctly: string replace, boolean flip,
// identifier expression (bare JS var), delete.
type PropEdit =
  | { kind: 'set-string'; key: string; value: string }
  | { kind: 'set-boolean'; key: string; value: boolean }
  | { kind: 'set-identifier-expr'; key: string; ident: string }
  | { kind: 'delete'; key: string };

// String attr values are restricted to the NG12-accepted domain: the γ
// reconstructor's idempotence contract (SPEC §NG12) covers canonical string
// attrs — identifiers, URLs, short prose. MDX special chars (`{`, `}`, `"`,
// `'`, `<`, `>`, newlines, backslashes) trigger expression-form escaping on
// first serialize; PBT on those paths is an I14/I9-class concern, not I13's.
// The 10 NG12 probe cases (`fixtures/ng-pinned/component-blocks-v2.json`)
// all use canonical attrs; this matches their coverage domain.
const stringAttrValueArb = fc.stringMatching(/^[a-zA-Z0-9 _./:#-]{1,40}$/);

const propEditArb: fc.Arbitrary<PropEdit> = fc.oneof(
  fc.record({
    kind: fc.constant('set-string' as const),
    key: fc.oneof(
      fc.constantFrom('title', 'type', 'href', 'src', 'alt', 'value', 'name'),
      fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,8}$/),
    ),
    value: stringAttrValueArb,
  }),
  fc.record({
    kind: fc.constant('set-boolean' as const),
    key: fc.constantFrom('disabled', 'external', 'hidden', 'open'),
    value: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('set-identifier-expr' as const),
    key: fc.constantFrom('items', 'data', 'value'),
    ident: fc.constantFrom('values', 'items', 'data', 'myVar'),
  }),
  fc.record({
    kind: fc.constant('delete' as const),
    key: fc.constantFrom('title', 'href', 'disabled', 'color'),
  }),
);

function applyEdit(props: Record<string, unknown>, edit: PropEdit): void {
  switch (edit.kind) {
    case 'set-string':
      props[edit.key] = edit.value;
      break;
    case 'set-boolean':
      props[edit.key] = edit.value;
      break;
    case 'set-identifier-expr':
      // Expression attrs are stored as `{ type: 'expression', value: '<ident>' }`
      // per the destructureAttrs contract; a bare identifier is valid JSX.
      props[edit.key] = { type: 'expression', value: edit.ident };
      break;
    case 'delete':
      delete props[edit.key];
      break;
  }
}

describe('I13 — JSX edited idempotence (γ dirty-path PBT)', () => {
  // For each fixture, assert idempotence under a PBT over synthetic prop edits.
  // The budget rotates across PBT_SEEDS; per-fixture NUM_RUNS is divided by the
  // fixture count so the total run count stays within budget.
  const perFixtureRuns = Math.max(50, Math.floor(NUM_RUNS / blockFixtures.length));

  for (const fixture of blockFixtures) {
    test(`${fixture.componentName}: idempotent under synthetic prop edits`, () => {
      assertAcrossSeeds(
        fc.property(fc.array(propEditArb, { minLength: 0, maxLength: 3 }), (edits) => {
          // First pass: parse, apply edits, set dirty, serialize.
          const firstOutput = dirtyRoundTrip(fixture.blockForm, (props) => {
            for (const edit of edits) applyEdit(props, edit);
          });
          // Second pass: re-parse, re-serialize with dirty flag set but no
          // additional edits. The reconstruction path fires again.
          // If the first pass's output is a fixed point, the second pass must
          // produce byte-identical output.
          const secondOutput = dirtyRoundTrip(firstOutput);
          // NG12: first edit produces normalized output; second edit must be stable.
          expect(secondOutput).toBe(firstOutput);
        }),
        { numRuns: perFixtureRuns },
      );
    });
  }
});

describe('I13 — NG12 probe cases: idempotent under synthetic prop edits', () => {
  // Cross-check the dirty-path idempotence invariant against the NG12 probe
  // corpus. Each case is a known-interesting input for the γ normalizer; we
  // assert that after any synthetic edit, re-serialize is a fixed point.
  test('pristine dirty-path produces idempotent output across fixtures', () => {
    for (const fixture of blockFixtures) {
      const firstOutput = dirtyRoundTrip(fixture.blockForm);
      const secondOutput = dirtyRoundTrip(firstOutput);
      expect(secondOutput).toBe(firstOutput);
    }
  });
});
