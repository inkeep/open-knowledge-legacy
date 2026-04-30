/**
 * Unit tests for `emitMdxJsx`'s opt-in default-omission behavior. The
 * `omitOnDefault` PropDef flag (combined with a declared `defaultValue`)
 * tells the emitter to drop redundant attribute values that match the
 * browser-equivalent default — `<img loading="lazy">` becomes `<img>` on
 * dirty serialize, since the renderer applies `lazy` whether or not the
 * attribute is present.
 *
 * Pristine sourceRaw round-trips byte-identically (descriptor-pattern
 * invariant, precedent #9), so this canonicalization is bounded to the
 * dirty serialize path.
 */
import { describe, expect, test } from 'bun:test';
import { Schema } from '@tiptap/pm/model';
import type { PropDef } from '../registry/types.ts';
import { emitMdxJsx } from './serialize-helpers.ts';

// Minimal PM schema with a single `jsxComponent` block node carrying the
// attrs we exercise. Keeps the test free of the production schema's
// transitive deps (StarterKit, etc.).
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
        // No omitOnDefault — `alt=""` is semantically distinct from absent
        // alt (decorative-image vs. no-info per WCAG), so opt-in matters.
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
    // `controls={false}` is the explicit "no chrome" choice — distinct from
    // absent (which renders WITH controls per the descriptor's true default).
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
    // A previous parse populated `attributes` from the source `<img loading="lazy">`.
    // The current dirty path must drop it on re-emit so the on-disk shape
    // converges to `<img />`.
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
    // Wildcard descriptor + compat descriptors that fall through to
    // emitMdxJsx without a props array see the pre-flag behavior.
    const node = makeNode({ src: '/x.png', loading: 'lazy' });
    const result = emitMdxJsx('img', node, stubCtx /* no props */);
    const names = result.attributes.map((a) => ('name' in a ? a.name : '<expr>'));
    expect(names).toContain('src');
    expect(names).toContain('loading');
  });
});
