
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

describe('I15 — JSX cross-path consistency (built-in fixtures)', () => {
  const fixtures = loadBuiltInFixtures();
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
