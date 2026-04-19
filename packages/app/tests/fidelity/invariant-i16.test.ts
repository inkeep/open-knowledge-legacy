/**
 * Invariant I16 — Nested-dirty correctness (effectiveDirty + hasDirtyDescendant).
 *
 * The γ pattern's pristine-path short-circuit emits `sourceRaw` verbatim. If
 * a pristine ancestor whose descendant was edited returned its stale
 * sourceRaw, the descendant's edit would vanish — a CRDT-permanent data
 * loss. `effectiveDirty` + `hasDirtyDescendant` (core/markdown/index.ts:265)
 * enforce FR-5: a pristine ancestor with ANY dirty descendant MUST go
 * through the reconstruction path so the edit reaches the serialized output.
 *
 * PBT: generate nested jsxComponent trees (Steps→Step, Tabs→Tab,
 * Accordions→Accordion, Cards→Card, Card→Card+inner content), mark a
 * random subset of descendants `sourceDirty=true`, serialize, re-parse,
 * and assert that every dirty descendant's injected edit appears in the
 * serialized output. A regression in `hasDirtyDescendant`'s walk (missed
 * node type, broken short-circuit, jsxInline handling wrong) would surface
 * as silent loss of descendant edits.
 *
 * SPEC §7.1 I16.
 */

import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { loadBuiltInFixtures } from '../../../core/src/markdown/fixtures/index.ts';
import { assertAcrossSeeds, mdManager, NUM_RUNS } from './helpers';

const fixtures = loadBuiltInFixtures();

// Input corpus: the nested-container fixtures. These all have jsxComponent
// descendants inside jsxComponent containers, which is the shape the walk
// must handle correctly.
const nestedFixtures = fixtures.filter((f) =>
  ['Cards', 'Steps', 'Tabs', 'Accordion'].includes(f.componentName),
);

/**
 * Collect every jsxComponent node into a flat list with its path (indices
 * from root). Used so the PBT can pick a subset by path rather than having
 * to walk repeatedly.
 */
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

/** Navigate to node at `path` (indices into `.content`). */
function nodeAtPath(root: JSONContent, path: number[]): JSONContent | null {
  let current: JSONContent | undefined = root;
  for (const idx of path) {
    if (!current?.content?.[idx]) return null;
    current = current.content[idx];
  }
  return current ?? null;
}

describe('I16 — Nested-dirty correctness PBT', () => {
  // For each nested-container fixture, PBT over "which subset of descendants
  // are dirty" × "what edit is applied". Assert each dirty descendant's
  // edit appears in the serialized output.
  const perFixtureRuns = Math.max(50, Math.floor(NUM_RUNS / nestedFixtures.length / 2));

  for (const fixture of nestedFixtures) {
    test(`${fixture.componentName}: descendant edits survive ancestor serialization`, () => {
      const rootParsed = mdManager.parse(fixture.blockForm);
      const allPaths = collectJsxComponentPaths(rootParsed);
      // Need at least 2 jsxComponents (parent + descendant) to exercise the
      // invariant. Skip fixtures that don't have nesting — they're I13's job.
      if (allPaths.length < 2) return;

      assertAcrossSeeds(
        fc.property(
          fc.record({
            // Which descendants (by index into allPaths) to mark dirty. Each
            // index has 50% probability of being included.
            dirtyIndices: fc
              .array(fc.integer({ min: 0, max: allPaths.length - 1 }))
              .map((arr) => [...new Set(arr)]),
            // A synthetic edit marker — a short, MDX-safe string that we
            // inject into a string prop to make the edit observable in the
            // serialized output.
            editMarker: fc.stringMatching(/^[a-zA-Z0-9_-]{4,8}$/),
          }),
          ({ dirtyIndices, editMarker }) => {
            // Fresh parse per iteration — PBT is allowed to mutate the tree.
            const tree = mdManager.parse(fixture.blockForm);
            const paths = collectJsxComponentPaths(tree);

            // Apply edits: set dirty + inject marker into a prop.
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

            // Serialize. The effectiveDirty walk must propagate dirty up the
            // ancestor chain so every pristine ancestor of a dirty
            // descendant goes through reconstruction (not sourceRaw emit).
            const output = mdManager.serialize(tree);

            // Assert every injected edit-marker appears in the output.
            // A regression where hasDirtyDescendant misses a node type would
            // cause the ancestor to emit stale sourceRaw, silently dropping
            // the descendant's edit.
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
  // Explicit regression pin: Steps with a dirty inner Step. If
  // hasDirtyDescendant returns false for a dirty grandchild, the Steps
  // container emits its stale sourceRaw and the Step's edit is silently lost.
  test('Steps > dirty Step: descendant edit appears in serialized output', () => {
    const input =
      '<Steps>\n\n<Step>\n\nOriginal first step\n\n</Step>\n\n<Step>\n\nOriginal second step\n\n</Step>\n\n</Steps>\n';
    const tree = mdManager.parse(input);

    // Find first Step descendant and mark dirty with an injected marker.
    const paths = collectJsxComponentPaths(tree);
    expect(paths.length).toBeGreaterThanOrEqual(3); // Steps + 2 Step

    // paths[0] = Steps (outer); paths[1] = first Step; paths[2] = second Step.
    const firstStep = nodeAtPath(tree, paths[1]);
    expect(firstStep?.type).toBe('jsxComponent');
    if (firstStep?.attrs) {
      firstStep.attrs.sourceDirty = true;
      const props = (firstStep.attrs.props ?? {}) as Record<string, unknown>;
      props.title = 'INJECTED-EDIT-MARKER';
      firstStep.attrs.props = props;
    }

    const output = mdManager.serialize(tree);
    expect(output.includes('INJECTED-EDIT-MARKER')).toBe(true);
    // And the second Step's original content must still be present too
    // (pristine siblings unaffected by dirty sibling).
    expect(output.includes('Original second step')).toBe(true);
  });
});
