import { describe, expect, test } from 'bun:test';
import { Schema } from '@tiptap/pm/model';
import type { PropDef } from '../registry/types.ts';
import { emitMdxJsx } from './serialize-helpers.ts';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    jsxComponent: {
      group: 'block',
      content: '',
      atom: true,
      attrs: {
        componentName: { default: '' },
        kind: { default: 'element' },
        attributes: { default: [] },
        sourceRaw: { default: '' },
        sourceDirty: { default: true },
        props: { default: {} },
      },
    },
  },
});

const stubCtx = {
  all: () => [] as never[],
  registry: {
    getOrWildcard: () => {
      throw new Error('not used in these tests');
    },
  },
} as unknown as Parameters<typeof emitMdxJsx>[2];

function makeNode(props: Record<string, unknown>) {
  return schema.nodes.jsxComponent.create({
    componentName: 'img',
    kind: 'element',
    attributes: [],
    sourceRaw: '',
    sourceDirty: true,
    props,
  });
}

describe('emitMdxJsx — omitOnDefault behavior', () => {
  test('omits attribute when value strictly matches declared default and flag is set', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      {
        name: 'loading',
        type: 'enum',
        enumValues: ['eager', 'lazy'],
        defaultValue: 'lazy',
        required: false,
        omitOnDefault: true,
      },
    ];
    const node = makeNode({ src: '/x.png', loading: 'lazy' });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
    expect(names).not.toContain('loading');
  });

  test('keeps attribute when value differs from declared default', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      {
        name: 'loading',
        type: 'enum',
        enumValues: ['eager', 'lazy'],
        defaultValue: 'lazy',
        required: false,
        omitOnDefault: true,
      },
    ];
    const node = makeNode({ src: '/x.png', loading: 'eager' });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('loading');
  });

  test('keeps attribute when omitOnDefault is absent even if value matches default', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      {
        name: 'alt',
        type: 'string',
        required: false,
        defaultValue: '',
      },
    ];
    const node = makeNode({ src: '/x.png', alt: '' });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('alt');
  });

  test('omits boolean default-true (controls=true on video/audio)', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      {
        name: 'controls',
        type: 'boolean',
        required: false,
        defaultValue: true,
        omitOnDefault: true,
      },
    ];
    const node = makeNode({ src: '/clip.mp4', controls: true });
    const result = emitMdxJsx('video', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
    expect(names).not.toContain('controls');
  });

  test('keeps boolean false even when default is true', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      {
        name: 'controls',
        type: 'boolean',
        required: false,
        defaultValue: true,
        omitOnDefault: true,
      },
    ];
    const node = makeNode({ src: '/clip.mp4', controls: false });
    const result = emitMdxJsx('video', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('controls');
  });

  test('strips matching default from preserved attrs (re-save stability)', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      {
        name: 'loading',
        type: 'enum',
        enumValues: ['eager', 'lazy'],
        defaultValue: 'lazy',
        required: false,
        omitOnDefault: true,
      },
    ];
    const node = schema.nodes.jsxComponent.create({
      componentName: 'img',
      kind: 'element',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: '/x.png' },
        { type: 'mdxJsxAttribute', name: 'loading', value: 'lazy' },
      ],
      sourceRaw: '',
      sourceDirty: true,
      props: { src: '/x.png', loading: 'lazy' },
    });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
    expect(names).not.toContain('loading');
  });

  test('without props arg, no omission applies (back-compat with non-canonical callers)', () => {
    const node = makeNode({ src: '/x.png', loading: 'lazy' });
    const result = emitMdxJsx('img', node, stubCtx /* no props */);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
    expect(names).toContain('loading');
  });
});

describe('emitMdxJsx — empty-string-omission for optional strings', () => {
  test('omits empty string for optional prop without explicit defaultValue', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      { name: 'srcset', type: 'string', required: false },
      { name: 'sizes', type: 'string', required: false },
      { name: 'title', type: 'string', required: false },
    ];
    const node = makeNode({ src: '/x.png', srcset: '', sizes: '', title: '' });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
    expect(names).not.toContain('srcset');
    expect(names).not.toContain('sizes');
    expect(names).not.toContain('title');
  });

  test('preserves empty string for prop with explicit defaultValue: "" (alt="" WCAG decorative)', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      { name: 'alt', type: 'string', required: false, defaultValue: '' },
    ];
    const node = makeNode({ src: '/x.png', alt: '' });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('alt');
  });

  test('keeps empty string for required string prop (validation-loud failure)', () => {
    const props: PropDef[] = [{ name: 'src', type: 'string', required: true }];
    const node = makeNode({ src: '' });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
  });

  test('keeps non-empty string regardless of defaultValue', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      { name: 'srcset', type: 'string', required: false },
    ];
    const node = makeNode({ src: '/x.png', srcset: '/x@2x.png 2x' });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('srcset');
  });

  test('strips empty string from preserved attrs (re-save stability)', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      { name: 'srcset', type: 'string', required: false },
    ];
    const node = schema.nodes.jsxComponent.create({
      componentName: 'img',
      kind: 'element',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: '/x.png' },
        { type: 'mdxJsxAttribute', name: 'srcset', value: '' },
      ],
      sourceRaw: '',
      sourceDirty: true,
      props: { src: '/x.png', srcset: '' },
    });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
    expect(names).not.toContain('srcset');
  });

  test('numeric 0 and boolean false are NOT stripped (only empty strings on string PropDefs)', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      { name: 'width', type: 'number', required: false },
      { name: 'controls', type: 'boolean', required: false, defaultValue: true },
    ];
    const node = makeNode({ src: '/x.png', width: 0, controls: false });
    const result = emitMdxJsx('img', node, stubCtx, props);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('width');
    expect(names).toContain('controls');
  });
});

describe('emitMdxJsx — img.align byte-stability invariant', () => {
  const alignPropDefs: PropDef[] = [
    { name: 'src', type: 'string', required: true },
    {
      name: 'align',
      type: 'enum',
      enumValues: ['center', 'left', 'right'],
      defaultValue: 'center',
      required: false,
      omitOnDefault: true,
    },
  ];

  test('omits align when value matches default (center)', () => {
    const node = makeNode({ src: '/x.png', align: 'center' });
    const result = emitMdxJsx('img', node, stubCtx, alignPropDefs);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
    expect(names).not.toContain('align');
  });

  test('omits align when value is unset (treated as default)', () => {
    const node = makeNode({ src: '/x.png' });
    const result = emitMdxJsx('img', node, stubCtx, alignPropDefs);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
    expect(names).not.toContain('align');
  });

  test('emits align="left" verbatim', () => {
    const node = makeNode({ src: '/x.png', align: 'left' });
    const result = emitMdxJsx('img', node, stubCtx, alignPropDefs);
    const alignAttr = result.attributes.find((a) => 'name' in a && a.name === 'align') as
      | { value?: unknown }
      | undefined;
    expect(alignAttr).toBeDefined();
    expect(alignAttr?.value).toBe('left');
  });

  test('emits align="right" verbatim', () => {
    const node = makeNode({ src: '/x.png', align: 'right' });
    const result = emitMdxJsx('img', node, stubCtx, alignPropDefs);
    const alignAttr = result.attributes.find((a) => 'name' in a && a.name === 'align') as
      | { value?: unknown }
      | undefined;
    expect(alignAttr).toBeDefined();
    expect(alignAttr?.value).toBe('right');
  });
});
