/**
 * Invariant I7 — Cross-path consistency: all write paths that produce
 * the same logical content yield equivalent serialized output.
 *
 * Tests that content written via mdManager.parse (WYSIWYG), Y.Text
 * (source mode), and updateYFragment (external) all produce the same
 * serialized markdown when read back.
 */

import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as fc from 'fast-check';
import * as Y from 'yjs';
import { block, heading, paragraph, paragraphWithFidelityChars } from './arbitraries';
import { NUM_RUNS, normalize } from './helpers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

/** Path 1: md → parse → serialize (mdManager only). */
function pathMdManager(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

/** Path 2: md → parse → nodeFromJSON → Y.XmlFragment → serialize (Y.Doc path). */
function pathYDoc(md: string): string {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(doc, fragment, pmNode, meta);
  const resultJson = yXmlFragmentToProsemirrorJSON(fragment);
  const result = mdManager.serialize(resultJson);
  doc.destroy();
  return result;
}

/**
 * Path 3: md → parse → serialize (mdManager re-parse path).
 *
 * NOTE: This exercises the same mdManager round-trip as pathMdManager.
 * A true Y.Text path (write to Y.Text → Observer B fires → XmlFragment
 * → serialize) requires async debounce wiring that is impractical in PBT.
 * The actual text→tree path is covered by integration tests
 * (bridge-matrix.test.ts V2) rather than PBT invariants.
 */
function pathMdManagerReparse(md: string): string {
  const json = mdManager.parse(md);
  return mdManager.serialize(json);
}

describe('I7 — cross-path consistency', () => {
  test('mdManager path === Y.Doc path for headings', () => {
    fc.assert(
      fc.property(heading, (md) => {
        expect(normalize(pathMdManager(md))).toBe(normalize(pathYDoc(md)));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('mdManager path === Y.Doc path for paragraphs', () => {
    fc.assert(
      fc.property(paragraph, (md) => {
        expect(normalize(pathMdManager(md))).toBe(normalize(pathYDoc(md)));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('mdManager path === Y.Doc path for fidelity chars', () => {
    fc.assert(
      fc.property(paragraphWithFidelityChars, (md) => {
        expect(normalize(pathMdManager(md))).toBe(normalize(pathYDoc(md)));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('mdManager path === Y.Doc path for all block constructs (fidelity attrs)', () => {
    fc.assert(
      fc.property(block, (md) => {
        expect(normalize(pathMdManager(md))).toBe(normalize(pathYDoc(md)));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('mdManager path === Y.Doc path === mdManager re-parse for paragraphs', () => {
    fc.assert(
      fc.property(paragraph, (md) => {
        const a = normalize(pathMdManager(md));
        const b = normalize(pathYDoc(md));
        const c = normalize(pathMdManagerReparse(md));
        expect(a).toBe(b);
        expect(b).toBe(c);
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});
