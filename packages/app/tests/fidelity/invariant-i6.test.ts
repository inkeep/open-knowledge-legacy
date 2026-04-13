/**
 * Invariant I6 — Multi-client preservation: content survives
 * Y.Doc state sync between two clients.
 *
 * Creates a source Y.Doc, syncs its state to a second doc, and
 * verifies the serialized output is equivalent on both sides.
 */

import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as fc from 'fast-check';
import * as Y from 'yjs';
import { block, paragraph } from './arbitraries';
import { NUM_RUNS, normalize } from './helpers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

function serializeDoc(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment('default');
  return mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
}

describe('I6 — multi-client preservation: state sync', () => {
  test('content synced to second client is preserved', () => {
    fc.assert(
      fc.property(block, (md) => {
        // Source doc
        const doc1 = new Y.Doc();
        const frag1 = doc1.getXmlFragment('default');
        const json = mdManager.parse(md);
        const pmNode = schema.nodeFromJSON(json);
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(doc1, frag1, pmNode, meta);

        // Second client receives state from source
        const doc2 = new Y.Doc();
        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

        const output1 = normalize(serializeDoc(doc1));
        const output2 = normalize(serializeDoc(doc2));

        expect(output2).toBe(output1);

        doc1.destroy();
        doc2.destroy();
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('concurrent edits on synced clients converge', () => {
    fc.assert(
      fc.property(paragraph, paragraph, (md1, md2) => {
        // Both clients start from same state
        const doc1 = new Y.Doc();
        const frag1 = doc1.getXmlFragment('default');
        const json1 = mdManager.parse(md1);
        const pmNode1 = schema.nodeFromJSON(json1);
        updateYFragment(doc1, frag1, pmNode1, { mapping: new Map(), isOMark: new Map() });

        const doc2 = new Y.Doc();
        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

        // Client 2 makes an edit
        const frag2 = doc2.getXmlFragment('default');
        const json2 = mdManager.parse(md2);
        const pmNode2 = schema.nodeFromJSON(json2);
        updateYFragment(doc2, frag2, pmNode2, { mapping: new Map(), isOMark: new Map() });

        // Bidirectional sync
        Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

        // Both must converge
        const output1 = normalize(serializeDoc(doc1));
        const output2 = normalize(serializeDoc(doc2));
        expect(output1).toBe(output2);

        doc1.destroy();
        doc2.destroy();
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});
