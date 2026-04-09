import { describe, expect, test } from 'bun:test';
import { getSchema, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { componentManifest } from '../generated/components.ts';
import { createJsxComponentExtensions } from './jsx-component-factory.ts';

describe('createJsxComponentExtensions', () => {
  const { editable, void: voidExt } = createJsxComponentExtensions(componentManifest);

  test('returns two distinct extensions', () => {
    expect(editable).toBeDefined();
    expect(voidExt).toBeDefined();
    expect(editable.name).toBe('jsxComponentEditable');
    expect(voidExt.name).toBe('jsxComponentVoid');
  });

  test('editable extension has componentName attribute', () => {
    const extensions = [editable, voidExt, StarterKit.configure({ undoRedo: false })];
    const schema = getSchema(extensions);
    const nodeSpec = schema.nodes.jsxComponentEditable?.spec;
    expect(nodeSpec).toBeDefined();
    expect(nodeSpec.attrs?.componentName).toBeDefined();
  });

  test('editable extension attributes are a superset of each known component props', () => {
    const extensions = [editable, voidExt, StarterKit.configure({ undoRedo: false })];
    const schema = getSchema(extensions);
    const attrs = schema.nodes.jsxComponentEditable?.spec.attrs || {};
    for (const [, meta] of Object.entries(componentManifest)) {
      for (const prop of meta.props) {
        if (prop.type === 'reactnode') continue; // reactnode = content hole, not attribute
        expect(attrs).toHaveProperty(prop.name);
      }
    }
  });

  test('void extension has content attribute', () => {
    const extensions = [editable, voidExt, StarterKit.configure({ undoRedo: false })];
    const schema = getSchema(extensions);
    const nodeSpec = schema.nodes.jsxComponentVoid?.spec;
    expect(nodeSpec).toBeDefined();
    expect(nodeSpec.attrs?.content).toBeDefined();
  });

  test('void extension is atom: true', () => {
    const extensions = [editable, voidExt, StarterKit.configure({ undoRedo: false })];
    const schema = getSchema(extensions);
    const nodeSpec = schema.nodes.jsxComponentVoid?.spec;
    expect(nodeSpec?.atom).toBe(true);
  });

  test('editable extension has content: block+', () => {
    const extensions = [editable, voidExt, StarterKit.configure({ undoRedo: false })];
    const schema = getSchema(extensions);
    const nodeSpec = schema.nodes.jsxComponentEditable?.spec;
    expect(nodeSpec?.content).toBe('block+');
  });
});

describe('factory markdown hooks', () => {
  const { editable, void: voidExt } = createJsxComponentExtensions(componentManifest);
  const extensions = [editable, voidExt, StarterKit.configure({ undoRedo: false })];
  const mdManager = new MarkdownManager({ extensions });

  test('registered Callout parses to jsxComponentEditable', () => {
    const md = '<Callout type="warning">\n  Some content.\n</Callout>\n';
    const json = mdManager.parse(md);
    const editableNodes = (json.content || []).filter(
      (n: JSONContent) => n.type === 'jsxComponentEditable',
    );
    expect(editableNodes).toHaveLength(1);
    expect(editableNodes[0].attrs?.componentName).toBe('Callout');
  });

  test('unregistered CustomThing parses to jsxComponentVoid', () => {
    const md = '<CustomThing foo="bar">body</CustomThing>\n';
    const json = mdManager.parse(md);
    const voidNodes = (json.content || []).filter(
      (n: JSONContent) => n.type === 'jsxComponentVoid',
    );
    expect(voidNodes).toHaveLength(1);
    expect(voidNodes[0].attrs?.content).toContain('CustomThing');
  });

  test('void node round-trips byte-identically', () => {
    const md = '<CustomThing foo="bar">body</CustomThing>\n';
    const json = mdManager.parse(md);
    const output = mdManager.serialize(json);
    expect(output).toBe(md);
  });

  test('registered Callout round-trips through _rawContent carrier', () => {
    const md = '<Callout type="warning">\n  Some content.\n</Callout>\n';
    const json = mdManager.parse(md);
    const output = mdManager.serialize(json);
    expect(output).toBe(md);
  });
});
