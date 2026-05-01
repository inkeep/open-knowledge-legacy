import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { loadBuiltInFixtures } from '../../../core/src/markdown/fixtures/index.ts';
import { assertAcrossSeeds, mdManager, NUM_RUNS } from './helpers';

const fixtures = loadBuiltInFixtures();

const nestedFixtures = fixtures.filter((f) => f.componentName.startsWith('Nested-'));

if (nestedFixtures.length === 0) {
  throw new Error(
    'I16 precondition: no Nested-* fixtures found in built-ins.json. ' +
      'The PBT would silently no-op and the hasDirtyDescendant walk would go unprotected.',
  );
}

function collectJsxComponentPaths(root: JSONContent): number[][] {
  const paths: number[][] = [];
  function walk(node: JSONContent, path: number[]): void {
    if (node.type === 'jsxComponent') paths.push([...path]);
    if (node.content) {
      node.content.forEach((child, i) => {
        walk(child, [...path, i]);
      });
    }
  }
  walk(root, []);
  return paths;
}

function nodeAtPath(root: JSONContent, path: number[]): JSONContent | null {
  let current: JSONContent | undefined = root;
  for (const idx of path) {
    if (!current?.content?.[idx]) return null;
    current = current.content[idx];
  }
  return current ?? null;
}

describe('I16 — Nested-dirty correctness PBT', () => {
  const perFixtureRuns = Math.max(50, Math.floor(NUM_RUNS / nestedFixtures.length / 2));

  for (const fixture of nestedFixtures) {
    test(`${fixture.componentName}: descendant edits survive ancestor serialization`, () => {
      const rootParsed = mdManager.parse(fixture.blockForm);
      const allPaths = collectJsxComponentPaths(rootParsed);
      if (allPaths.length < 2) return;

      assertAcrossSeeds(
        fc.property(
          fc.record({
            dirtyIndices: fc
              .array(fc.integer({ min: 0, max: allPaths.length - 1 }))
              .map((arr) => [...new Set(arr)]),
            editMarker: fc.stringMatching(/^[a-zA-Z0-9_-]{4,8}$/),
          }),
          ({ dirtyIndices, editMarker }) => {
            const tree = mdManager.parse(fixture.blockForm);
            const paths = collectJsxComponentPaths(tree);

            const editedComponents: Array<{ path: number[]; marker: string }> = [];
            for (const idx of dirtyIndices) {
              if (idx >= paths.length) continue;
              const path = paths[idx];
              const node = nodeAtPath(tree, path);
              if (!node?.attrs) continue;
              node.attrs.sourceDirty = true;
              const props = (node.attrs.props ?? {}) as Record<string, unknown>;
              props.title = `edit-${editMarker}-${idx}`;
              node.attrs.props = props;
              editedComponents.push({ path, marker: `edit-${editMarker}-${idx}` });
            }

            if (editedComponents.length === 0) return; // nothing to verify

            const output = mdManager.serialize(tree);

            for (const { marker } of editedComponents) {
              expect(
                output.includes(marker),
                `dirty-descendant edit "${marker}" must appear in serialized output`,
              ).toBe(true);
            }
          },
        ),
        { numRuns: perFixtureRuns },
      );
    });
  }
});

describe('I16 — Nested-dirty deterministic pin', () => {
  test('Callout > dirty Accordion: descendant edit appears in serialized output', () => {
    const input =
      '<Callout type="note">\n\nOuter intro\n\n<Accordion title="Original title">\n\nOriginal inner content\n\n</Accordion>\n\nOriginal outro\n\n</Callout>\n';
    const tree = mdManager.parse(input);

    const paths = collectJsxComponentPaths(tree);
    expect(paths.length).toBeGreaterThanOrEqual(2); // Callout + inner Accordion

    const accordion = nodeAtPath(tree, paths[1]);
    expect(accordion?.type).toBe('jsxComponent');
    expect(accordion?.attrs?.componentName).toBe('Accordion');
    if (accordion?.attrs) {
      accordion.attrs.sourceDirty = true;
      const props = (accordion.attrs.props ?? {}) as Record<string, unknown>;
      props.title = 'INJECTED-EDIT-MARKER';
      accordion.attrs.props = props;
    }

    const output = mdManager.serialize(tree);
    expect(output.includes('INJECTED-EDIT-MARKER')).toBe(true);
    expect(output.includes('Outer intro')).toBe(true);
    expect(output.includes('Original outro')).toBe(true);
  });

  test('Callout-collapsible > dirty Accordion: descendant edit survives', () => {
    const input =
      '<Callout type="warning" collapsible defaultOpen>\n\nFoldable outer\n\n<Accordion title="Inner">\n\nOriginal body\n\n</Accordion>\n\n</Callout>\n';
    const tree = mdManager.parse(input);

    const paths = collectJsxComponentPaths(tree);
    expect(paths.length).toBeGreaterThanOrEqual(2);

    const accordion = nodeAtPath(tree, paths[1]);
    if (accordion?.attrs) {
      accordion.attrs.sourceDirty = true;
      const props = (accordion.attrs.props ?? {}) as Record<string, unknown>;
      props.title = 'FOLDABLE-NESTED-MARKER';
      accordion.attrs.props = props;
    }

    const output = mdManager.serialize(tree);
    expect(output.includes('FOLDABLE-NESTED-MARKER')).toBe(true);
    expect(output.includes('collapsible')).toBe(true);
  });
});
