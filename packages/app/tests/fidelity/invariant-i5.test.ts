
import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as fc from 'fast-check';
import * as Y from 'yjs';
import { block, markdownDoc, paragraphWithFidelityChars } from './arbitraries';
import { NUM_RUNS, normalize } from './helpers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

function layerA(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

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
