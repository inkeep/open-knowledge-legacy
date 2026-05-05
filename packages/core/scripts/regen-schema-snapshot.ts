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
interface MarkShape {
  attrs: Record<string, AttrShape>;
  excludes: string;
  group: string;
  inclusive: boolean;
  spanning: boolean;
}
interface SchemaSnapshot {
  nodes: Record<string, NodeShape>;
  marks: Record<string, MarkShape>;
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
const marks: Record<string, MarkShape> = {};
for (const [name, markType] of Object.entries(schema.marks)) {
  const attrs: Record<string, AttrShape> = {};
  for (const [attrName, attrSpec] of Object.entries(markType.spec.attrs ?? {})) {
    attrs[attrName] = {
      hasDefault: 'default' in (attrSpec as Record<string, unknown>),
    };
  }
  marks[name] = {
    attrs,
    excludes: typeof markType.spec.excludes === 'string' ? markType.spec.excludes : name,
    group: markType.spec.group ?? '',
    inclusive: markType.spec.inclusive !== false,
    spanning: markType.spec.spanning !== false,
  };
}
const extensionOrder = sharedExtensions.map((ext) => {
  if ('name' in ext && typeof ext.name === 'string') return ext.name;
  if ('configure' in ext) return '(configured)';
  return String(ext);
});

const snap: SchemaSnapshot = { nodes, marks, extensionOrder };
const out = new URL('../src/schema-snapshot.json', import.meta.url).pathname;
writeFileSync(out, `${JSON.stringify(snap, null, 2)}\n`);
console.log(`Wrote ${out}`);
