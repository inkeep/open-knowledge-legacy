/**
 * Invariant I5 — Layer A === Layer B: the mdManager serialization path
 * produces the same output as the Y.Doc observer path on the same input.
 *
 * Layer A: serialize(parse(md))
 * Layer B: md → parse → nodeFromJSON → updateYFragment → yXmlFragmentToProsemirrorJSON → serialize
 */

import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as fc from 'fast-check';
import * as Y from 'yjs';
import { block, markdownDoc, paragraphWithFidelityChars } from './arbitraries';
import { NUM_RUNS } from './helpers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

function normalize(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

/** Layer A: direct md round-trip via mdManager. */
function layerA(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

/** Layer B: Y.Doc path — parse → node → Y.XmlFragment → serialize. */
function layerB(md: string): string {
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

describe('I5 — Layer A === Layer B', () => {
  test('single blocks', () => {
    fc.assert(
      fc.property(block, (md) => {
        expect(normalize(layerA(md))).toBe(normalize(layerB(md)));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('multi-block documents', () => {
    fc.assert(
      fc.property(markdownDoc, (md) => {
        expect(normalize(layerA(md))).toBe(normalize(layerB(md)));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('fidelity chars (& < >)', () => {
    fc.assert(
      fc.property(paragraphWithFidelityChars, (md) => {
        expect(normalize(layerA(md))).toBe(normalize(layerB(md)));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});
