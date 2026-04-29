/**
 * One-shot regenerator for `src/schema-snapshot.json`. Mirror of
 * `captureSchemaShape` in `src/schema-invariant.test.ts`. Run via:
 *
 *   bun run packages/core/scripts/regen-schema-snapshot.ts
 *
 * After running, diff the snapshot file — landing it requires the diff to
 * be purely additive (R10 / precedent #9).
 */
import { writeFileSync } from 'node:fs';
import { getSchema } from '@tiptap/core';
import { sharedExtensions } from '../src/extensions/shared.ts';

interface AttrShape {
  hasDefault: boolean;
}
interface NodeShape {
  attrs: Record<string, AttrShape>;
  content: string;
  group: string;
  inline: boolean;
  atom: boolean;
}
interface SchemaSnapshot {
  nodes: Record<string, NodeShape>;
  extensionOrder: string[];
}

const schema = getSchema(sharedExtensions);
const nodes: Record<string, NodeShape> = {};
for (const [name, nodeType] of Object.entries(schema.nodes)) {
  const attrs: Record<string, AttrShape> = {};
  for (const [attrName, attrSpec] of Object.entries(nodeType.spec.attrs ?? {})) {
    attrs[attrName] = {
      hasDefault: 'default' in (attrSpec as Record<string, unknown>),
    };
  }
  nodes[name] = {
    attrs,
    content: nodeType.spec.content ?? '',
    group: nodeType.spec.group ?? '',
    inline: !!nodeType.spec.inline,
    atom: !!nodeType.spec.atom,
  };
}
const extensionOrder = sharedExtensions.map((ext) => {
  if ('name' in ext && typeof ext.name === 'string') return ext.name;
  if ('configure' in ext) return '(configured)';
  return String(ext);
});

const snap: SchemaSnapshot = { nodes, extensionOrder };
const out = new URL('../src/schema-snapshot.json', import.meta.url).pathname;
writeFileSync(out, `${JSON.stringify(snap, null, 2)}\n`);
console.log(`Wrote ${out}`);
