/**
 * WikiEmbed* compat descriptors — convergence on the canonical img/video/audio
 * render path. `![[file.ext]]` parsed from external sources lands as one of
 * three compat descriptors (WikiEmbedImage / WikiEmbedVideo / WikiEmbedAudio)
 * keyed by extension. Each renders through its canonical sibling
 * (`rendersAs: 'img' | 'video' | 'audio'`) via `translateProps` and serializes
 * back to source-form `wikiLinkEmbed` mdast so the round-trip is
 * byte-identical.
 *
 * PropPanel narrows automatically because each descriptor declares only the
 * single user-editable prop the source syntax can encode (`alias`).
 */
import { describe, expect, test } from 'bun:test';
import type { Node as PmNode } from '@tiptap/pm/model';
import { builtInComponents } from './index.ts';
import type { CompatMeta } from './types.ts';

function makeMockNode(props: Record<string, unknown>): PmNode {
  return {
    attrs: { props, componentName: 'WikiEmbedImage' },
  } as unknown as PmNode;
}

const wikiEmbedImage = builtInComponents.find(
  (m): m is CompatMeta => m.surface === 'compat' && m.name === 'WikiEmbedImage',
);

describe('WikiEmbedImage descriptor — registration', () => {
  test('is registered in builtInComponents as a compat descriptor', () => {
    expect(wikiEmbedImage).toBeDefined();
    expect(wikiEmbedImage?.surface).toBe('compat');
  });

  test('rendersAs the canonical `img`', () => {
    expect(wikiEmbedImage?.rendersAs).toBe('img');
  });

  test('declares hasChildren=false and isSelfClosing=true (matches img)', () => {
    expect(wikiEmbedImage?.hasChildren).toBe(false);
    expect(wikiEmbedImage?.isSelfClosing).toBe(true);
  });

  test('exposes exactly one editable prop (alias)', () => {
    expect(wikiEmbedImage?.props.length).toBe(1);
    expect(wikiEmbedImage?.props[0]?.name).toBe('alias');
    expect(wikiEmbedImage?.props[0]?.type).toBe('string');
    expect(wikiEmbedImage?.props[0]?.required).toBe(false);
  });
});

describe('WikiEmbedImage.translateProps — render-time prop translation', () => {
  test('alias non-empty → alt = alias', () => {
    if (!wikiEmbedImage) throw new Error('descriptor missing');
    const out = wikiEmbedImage.translateProps({
      src: '/photo.png',
      target: 'photo.png',
      alias: 'a cute cat',
      anchor: null,
    });
    expect(out.src).toBe('/photo.png');
    expect(out.alt).toBe('a cute cat');
  });

  test('alias empty string → alt = target (filename fallback)', () => {
    if (!wikiEmbedImage) throw new Error('descriptor missing');
    const out = wikiEmbedImage.translateProps({
      src: '/photo.png',
      target: 'photo.png',
      alias: '',
      anchor: null,
    });
    expect(out.alt).toBe('photo.png');
  });

  test('alias missing → alt = target', () => {
    if (!wikiEmbedImage) throw new Error('descriptor missing');
    const out = wikiEmbedImage.translateProps({
      src: '/photo.png',
      target: 'photo.png',
    });
    expect(out.alt).toBe('photo.png');
  });

  test('alias is non-string (null) → alt = target', () => {
    if (!wikiEmbedImage) throw new Error('descriptor missing');
    const out = wikiEmbedImage.translateProps({
      src: '/photo.png',
      target: 'photo.png',
      alias: null,
    });
    expect(out.alt).toBe('photo.png');
  });
});

describe('WikiEmbedImage.serialize — source-form mdast emit', () => {
  function callSerialize(node: PmNode) {
    if (!wikiEmbedImage) throw new Error('descriptor missing');
    return wikiEmbedImage.serialize(node, {
      all: () => [],
      registry: { getOrWildcard: () => wikiEmbedImage },
      serializeChildren: () => '',
    });
  }

  test('plain target (no alias, no anchor) → wikiLinkEmbed with target as label', () => {
    const out = callSerialize(makeMockNode({ src: '/photo.png', target: 'photo.png' }));
    const cast = out as unknown as {
      type: string;
      value: string;
      data: { target: string; anchor: string | null; alias: string | null };
      children: Array<{ type: string; value: string }>;
    };
    expect(cast.type).toBe('wikiLinkEmbed');
    expect(cast.value).toBe('photo.png');
    expect(cast.data.target).toBe('photo.png');
    expect(cast.data.anchor).toBeNull();
    expect(cast.data.alias).toBeNull();
    expect(cast.children).toEqual([{ type: 'text', value: 'photo.png' }]);
  });

  test('alias set → label uses alias', () => {
    const out = callSerialize(
      makeMockNode({ src: '/photo.png', target: 'photo.png', alias: 'caption', anchor: null }),
    );
    const cast = out as unknown as { value: string; data: { alias: string | null } };
    expect(cast.value).toBe('caption');
    expect(cast.data.alias).toBe('caption');
  });

  test('anchor set, no alias → label is target#anchor', () => {
    const out = callSerialize(
      makeMockNode({ src: '/photo.png', target: 'photo.png', alias: null, anchor: 'frag' }),
    );
    const cast = out as unknown as {
      value: string;
      data: { target: string; anchor: string | null };
    };
    expect(cast.value).toBe('photo.png#frag');
    expect(cast.data.anchor).toBe('frag');
  });

  test('alias + anchor present → alias wins for label, anchor preserved in data', () => {
    const out = callSerialize(
      makeMockNode({ src: '/photo.png', target: 'photo.png', alias: 'caption', anchor: 'frag' }),
    );
    const cast = out as unknown as {
      value: string;
      data: { alias: string | null; anchor: string | null };
    };
    expect(cast.value).toBe('caption');
    expect(cast.data.alias).toBe('caption');
    expect(cast.data.anchor).toBe('frag');
  });

  test('empty alias string → falls back to target as label (alias treated as absent)', () => {
    const out = callSerialize(
      makeMockNode({ src: '/photo.png', target: 'photo.png', alias: '', anchor: null }),
    );
    const cast = out as unknown as { value: string };
    expect(cast.value).toBe('photo.png');
  });

  test('missing target → empty label (defensive — parser always supplies one)', () => {
    const out = callSerialize(makeMockNode({ src: '/photo.png' }));
    const cast = out as unknown as {
      value: string;
      data: { target: string };
    };
    expect(cast.value).toBe('');
    expect(cast.data.target).toBe('');
  });
});
