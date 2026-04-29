/**
 * Invariant I15 — JSX cross-path consistency (Layer A === Layer B for
 * jsxComponent + jsxInline).
 *
 * Layer A: `mdManager.serialize(mdManager.parse(md))` — direct markdown
 *          round-trip through the unified+remark pipeline.
 * Layer B: md → parse → PM JSON → schema.nodeFromJSON → Y.XmlFragment (via
 *          `updateYFragment`) → yXmlFragmentToProseMirrorRootNode → serialize —
 *          the full CRDT path used by server Observer B (precedent #14).
 *
 * The invariant asserts both paths produce byte-identical output (modulo
 * `normalize()` — trailing whitespace only) on every built-in fixture. This
 * is load-bearing because:
 *
 *  - Server Observer B uses Layer B (parseWithFallback → updateYFragment)
 *    to mirror Y.Text changes into the XmlFragment. If Layer A and Layer B
 *    diverge on jsxComponent, the bridge introduces silent drift — the
 *    stored markdown no longer matches the in-memory CRDT.
 *  - I5 covers the generic case; I15 is the JSX-specific pin across the
 *    18 built-in shapes + γ dirty path.
 *
 * Template: I5. Shared fixture corpus = 18 built-ins from
 * `loadBuiltInFixtures()` + the 10 NG12 probe cases from
 * `loadNgPinnedCases()`.
 *
 * SPEC §7.1 I15.
 */

import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import {
  loadBuiltInFixtures,
  loadNgPinnedCases,
} from '../../../core/src/markdown/fixtures/index.ts';
import { normalize } from './helpers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

/** Layer A: direct md round-trip via mdManager. */
function layerA(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

/** Layer B: Y.Doc path — parse → PM node → Y.XmlFragment → serialize. */
function layerB(md: string): string {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(doc, fragment, pmNode, meta);
  const resultJson = yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON();
  const result = mdManager.serialize(resultJson);
  doc.destroy();
  return result;
}

describe('I15 — JSX cross-path consistency (built-in fixtures)', () => {
  const fixtures = loadBuiltInFixtures();
  // Exclude inline-flavored fixtures: their input starts with prose ("Hello
  // <Icon …> world") which means Layer B runs through the y-prosemirror
  // path for a paragraph with an inline jsxInline child. Keep both block
  // and inline in coverage — the invariant applies symmetrically.
  for (const fixture of fixtures) {
    const label = fixture.notes
      ? `${fixture.componentName} — ${fixture.notes}`
      : fixture.componentName;
    test(label, () => {
      const a = normalize(layerA(fixture.blockForm));
      const b = normalize(layerB(fixture.blockForm));
      expect(a).toBe(b);
    });
  }
});

describe('I15 — JSX cross-path consistency (NG12 probe cases)', () => {
  const cases = loadNgPinnedCases();
  for (const c of cases) {
    test(`${c.id} ${c.name}`, () => {
      const a = normalize(layerA(c.input));
      const b = normalize(layerB(c.input));
      expect(a).toBe(b);
    });
  }
});
