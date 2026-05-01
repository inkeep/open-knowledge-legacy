
import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { loadBuiltInFixtures } from '../../../core/src/markdown/fixtures/index.ts';
import { assertAcrossSeeds, mdManager, NUM_RUNS } from './helpers';

function walkJsxComponents(node: JSONContent, mutate: (n: JSONContent) => void): void {
  if (node.type === 'jsxComponent') mutate(node);
  if (node.content) {
    for (const child of node.content) walkJsxComponents(child, mutate);
  }
}

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

type PropEdit =
  | { kind: 'set-string'; key: string; value: string }
  | { kind: 'set-boolean'; key: string; value: boolean }
  | { kind: 'set-identifier-expr'; key: string; ident: string }
  | { kind: 'delete'; key: string };

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
      props[edit.key] = { type: 'expression', value: edit.ident };
      break;
    case 'delete':
      delete props[edit.key];
      break;
  }
}

const COMPAT_FIXTURE_PREFIXES = ['Callout-gfm-', 'Callout-obsidian-', 'Accordion-details-'];
const isCompatFixture = (componentName: string): boolean =>
  COMPAT_FIXTURE_PREFIXES.some((prefix) => componentName.startsWith(prefix));

describe('I13 — JSX edited idempotence (γ dirty-path PBT)', () => {
  const canonicalFixtures = blockFixtures.filter((f) => !isCompatFixture(f.componentName));
  const perFixtureRuns = Math.max(50, Math.floor(NUM_RUNS / canonicalFixtures.length));

  for (const fixture of canonicalFixtures) {
    test(`${fixture.componentName}: idempotent under synthetic prop edits`, () => {
      assertAcrossSeeds(
        fc.property(fc.array(propEditArb, { minLength: 0, maxLength: 3 }), (edits) => {
          const firstOutput = dirtyRoundTrip(fixture.blockForm, (props) => {
            for (const edit of edits) applyEdit(props, edit);
          });
          const secondOutput = dirtyRoundTrip(firstOutput);
          expect(secondOutput).toBe(firstOutput);
        }),
        { numRuns: perFixtureRuns },
      );
    });
  }
});

describe('I13 — NG12 probe cases: idempotent under synthetic prop edits', () => {
  test('pristine dirty-path produces idempotent output across fixtures', () => {
    for (const fixture of blockFixtures) {
      const firstOutput = dirtyRoundTrip(fixture.blockForm);
      const secondOutput = dirtyRoundTrip(firstOutput);
      expect(secondOutput).toBe(firstOutput);
    }
  });
});
