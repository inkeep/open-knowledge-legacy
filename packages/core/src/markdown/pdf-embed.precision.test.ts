import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { parsePdfAnchor } from '../utils/pdf-anchor.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function findNodes(json: JSONContent, type: string): JSONContent[] {
  const out: JSONContent[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === type) out.push(n);
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

describe('pdf embed — basic round-trip', () => {
  test('plain `![[Document.pdf]]` round-trips byte-stable', () => {
    const src = '![[Document.pdf]]\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`![[Document.pdf#page=3]]` round-trips', () => {
    const src = '![[Document.pdf#page=3]]\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`![[Document.pdf#height=400]]` round-trips', () => {
    const src = '![[Document.pdf#height=400]]\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`![[Document.pdf#page=3&height=600]]` round-trips', () => {
    const src = '![[Document.pdf#page=3&height=600]]\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });
});

describe('pdf embed — parse correctness', () => {
  test('parses to PM jsxComponent atom carrying the WikiEmbedPdf descriptor', () => {
    const json = mdManager.parse('![[Document.pdf]]\n');
    const components = findNodes(json, 'jsxComponent');
    expect(components.length).toBe(1);
    expect(components[0].attrs?.componentName).toBe('WikiEmbedPdf');
  });

  test('props bag carries target / anchor / alias from the wikiLinkEmbed mdast', () => {
    const json = mdManager.parse('![[Document.pdf#page=3|Spec]]\n');
    const components = findNodes(json, 'jsxComponent');
    expect(components.length).toBe(1);
    const props = components[0].attrs?.props as Record<string, unknown>;
    expect(props.target).toBe('Document.pdf');
    expect(props.anchor).toBe('page=3');
    expect(props.alias).toBe('Spec');
  });

  test('non-pdf extensions do NOT promote to WikiEmbedPdf', () => {
    const json = mdManager.parse('![[image.png]]\n');
    const components = findNodes(json, 'jsxComponent');
    expect(components.length).toBeGreaterThan(0);
    expect(components[0].attrs?.componentName).toBe('WikiEmbedImage');
  });

  test('inline-position `![[doc.pdf]]` mid-prose does NOT promote to WikiEmbedPdf', () => {
    const json = mdManager.parse('Inline ![[doc.pdf]] embed.\n');
    const components = findNodes(json, 'jsxComponent');
    expect(components.find((c) => c.attrs?.componentName === 'WikiEmbedPdf')).toBeUndefined();
  });
});

describe('pdf anchor parser', () => {
  test('empty anchor returns null height + empty viewer fragment', () => {
    expect(parsePdfAnchor('')).toEqual({ height: null, viewerFragment: '' });
    expect(parsePdfAnchor(undefined)).toEqual({ height: null, viewerFragment: '' });
  });

  test('`page=3` passes through to viewer fragment, height stays null', () => {
    expect(parsePdfAnchor('page=3')).toEqual({ height: null, viewerFragment: 'page=3' });
  });

  test('`height=400` extracts height, viewer fragment is empty', () => {
    expect(parsePdfAnchor('height=400')).toEqual({ height: 400, viewerFragment: '' });
  });

  test('`page=3&height=600` extracts height + keeps page in viewer fragment', () => {
    expect(parsePdfAnchor('page=3&height=600')).toEqual({
      height: 600,
      viewerFragment: 'page=3',
    });
  });

  test('unknown keys pass through to the viewer fragment unchanged', () => {
    expect(parsePdfAnchor('zoom=200&search=foo')).toEqual({
      height: null,
      viewerFragment: 'zoom=200&search=foo',
    });
  });

  test('malformed `height=` (non-numeric) is ignored, height stays null', () => {
    expect(parsePdfAnchor('height=tall')).toEqual({ height: null, viewerFragment: '' });
  });

  test('negative / zero height is rejected (stays null)', () => {
    expect(parsePdfAnchor('height=-100')).toEqual({ height: null, viewerFragment: '' });
    expect(parsePdfAnchor('height=0')).toEqual({ height: null, viewerFragment: '' });
  });
});
