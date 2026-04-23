import { describe, expect, test } from 'bun:test';
import { builtInComponents, createRegistry, wildcardMeta } from './index.ts';
import type { JsxComponentMeta } from './types.ts';

describe('createRegistry', () => {
  test('returns the partial 5-pack (4 registered + wildcard) after US-007 adds Video', () => {
    // US-003 cut 14 fumadocs descriptors; US-005/US-006 widened Callout/Image;
    // US-007 adds Video. Accordion lands in US-009 to complete the 5-pack.
    const registry = createRegistry();
    const entries = [...registry.entries()];
    expect(entries.length).toBe(5);
  });

  test('get returns registered component by name', () => {
    const registry = createRegistry();
    const callout = registry.get('Callout');
    expect(callout).toBeDefined();
    expect(callout?.name).toBe('Callout');
    expect(callout?.hasChildren).toBe(true);
    expect(callout?.props.length).toBeGreaterThan(0);
    expect(callout?.category).toBe('content');
  });

  test('get returns undefined for unregistered names', () => {
    const registry = createRegistry();
    expect(registry.get('DataViz')).toBeUndefined();
  });

  test('getOrWildcard returns wildcard meta for unregistered names', () => {
    const registry = createRegistry();
    const unknown = registry.getOrWildcard('DataViz');
    expect(unknown.name).toBe('*');
    expect(unknown.hasChildren).toBe(true);
    expect(unknown.props.length).toBe(0);
  });

  test('registry.set() followed by get() picks up new descriptor (M3 hot-add)', () => {
    const registry = createRegistry();

    // Before: DataViz is unregistered
    expect(registry.get('DataViz')).toBeUndefined();
    expect(registry.getOrWildcard('DataViz').name).toBe('*');

    // Hot-add
    const dataVizMeta: JsxComponentMeta = {
      name: 'DataViz',
      hasChildren: true,
      props: [
        { name: 'chartType', type: 'enum', enumValues: ['bar', 'line', 'pie'], required: true },
      ],
      category: 'data',
      description: 'Data visualization chart',
    };
    registry.set('DataViz', dataVizMeta);

    // After: DataViz returns the new descriptor
    const result = registry.get('DataViz');
    expect(result).toBeDefined();
    expect(result?.name).toBe('DataViz');
    expect(result?.props.length).toBe(1);
    expect(result?.props[0].name).toBe('chartType');
  });

  test("wildcard has name '*', hasChildren:true, empty props", () => {
    expect(wildcardMeta.name).toBe('*');
    expect(wildcardMeta.hasChildren).toBe(true);
    expect(wildcardMeta.props).toEqual([]);
  });

  test('registry.has returns true for registered, false for unknown', () => {
    const registry = createRegistry();
    expect(registry.has('Callout')).toBe(true);
    expect(registry.has('Image')).toBe(true);
    expect(registry.has('Video')).toBe(true);
    expect(registry.has('Audio')).toBe(true);
    expect(registry.has('*')).toBe(true);
    // Cut-in-US-003 descriptors (Steps, Cards, Tabs, etc.) are no longer registered —
    // user content using those names falls through to wildcard via `getOrWildcard`.
    expect(registry.has('Steps')).toBe(false);
    expect(registry.has('DataViz')).toBe(false);
  });
});

describe('builtInComponents manifest', () => {
  test('contains exactly 4 entries (partial 5-pack — Accordion in US-009)', () => {
    expect(builtInComponents.length).toBe(4);
  });

  test('all entries have required fields', () => {
    for (const meta of builtInComponents) {
      expect(meta.name).toBeTruthy();
      expect(typeof meta.hasChildren).toBe('boolean');
      expect(Array.isArray(meta.props)).toBe(true);
    }
  });

  test('all entries have description and searchTerms', () => {
    for (const meta of builtInComponents) {
      expect(meta.description).toBeTruthy();
      expect(Array.isArray(meta.searchTerms)).toBe(true);
      expect(meta.searchTerms?.length).toBeGreaterThan(0);
    }
  });

  test('no registered descriptor has emptyChildName (5-pack is standalone-first — no compound parents)', () => {
    // US-002/US-003 retired the compound-components bridge (precedent #27
    // retracted on this branch). The surviving 5-pack descriptors ship without
    // `emptyChildName` — they render standalone, not as compound parents.
    // NG19 preserves the compound-tier revival path via PR #165 branch.
    const containers = builtInComponents.filter((m) => m.emptyChildName);
    const names = containers.map((c) => `${c.name}→${c.emptyChildName}`).sort();
    expect(names).toEqual([]);
  });

  test('Callout has GFM 5-type enum values for type prop', () => {
    // US-005 narrows the enum to GFM's 5 canonical types per D-MF11.
    // Parser alias map (US-010 callout-transformer) folds broader inputs
    // (Obsidian/Mintlify `success`/`danger`/`idea`/etc.) into this subset
    // pre-descriptor lookup. Precedent #9 schema-add-only makes future
    // enum extension free if NG26 promotes.
    const callout = builtInComponents.find((m) => m.name === 'Callout');
    expect(callout).toBeDefined();
    if (!callout) return;
    const typeProp = callout.props.find((p) => p.name === 'type');
    expect(typeProp).toBeDefined();
    expect(typeProp?.type).toBe('enum');
    if (typeProp?.type === 'enum') {
      expect([...typeProp.enumValues].sort()).toEqual(
        ['caution', 'important', 'note', 'tip', 'warning'].sort(),
      );
      expect(typeProp.defaultValue).toBe('note');
    }
  });

  test('Callout exposes the 7-prop FR-1 surface', () => {
    // D-MF17 added `collapsible` + `defaultOpen` within the GFM 5-type scope.
    // Together with `type`, `title`, `icon`, `color`, and `children` that's
    // the FR-1 surface — order-insensitive; a future PropPanel reshuffle
    // should not break this guard.
    const callout = builtInComponents.find((m) => m.name === 'Callout');
    expect(callout).toBeDefined();
    if (!callout) return;
    const propNames = callout.props.map((p) => p.name).sort();
    expect(propNames).toEqual(
      ['children', 'collapsible', 'color', 'defaultOpen', 'icon', 'title', 'type'].sort(),
    );
  });

  test('Image exposes the 8-prop FR-2 surface', () => {
    // US-006 widens the Image descriptor from the pre-narrow 5 props
    // (src/alt/width/height/children) to the FR-2 8-prop shape. `caption`
    // becomes a typed string (not a reactnode) so γ round-trips it through
    // PropPanel edits byte-identical; `loading` is an `'eager'|'lazy'` enum;
    // `zoom` is a boolean with default `true` driving the click-to-zoom
    // wrapper. Order-insensitive — a future reshuffle should not break this.
    const image = builtInComponents.find((m) => m.name === 'Image');
    expect(image).toBeDefined();
    if (!image) return;
    const propNames = image.props.map((p) => p.name).sort();
    expect(propNames).toEqual(
      ['alt', 'caption', 'height', 'loading', 'src', 'title', 'width', 'zoom'].sort(),
    );
  });

  test('Image has `loading` as a 2-value enum with lazy default', () => {
    const image = builtInComponents.find((m) => m.name === 'Image');
    const loading = image?.props.find((p) => p.name === 'loading');
    expect(loading).toBeDefined();
    if (loading?.type === 'enum') {
      expect([...loading.enumValues].sort()).toEqual(['eager', 'lazy'].sort());
      expect(loading.defaultValue).toBe('lazy');
    } else {
      throw new Error('Image.loading must be an enum');
    }
  });

  test('Image has `zoom` as a boolean with `true` default', () => {
    const image = builtInComponents.find((m) => m.name === 'Image');
    const zoom = image?.props.find((p) => p.name === 'zoom');
    expect(zoom).toBeDefined();
    if (zoom?.type === 'boolean') {
      expect(zoom.defaultValue).toBe(true);
    } else {
      throw new Error('Image.zoom must be a boolean');
    }
  });

  test('Image stays `isSelfClosing: true` after US-006 widen (caption is a typed string, not a reactnode)', () => {
    // D-MF15: `caption` round-trips as a typed string prop, not a React node,
    // so γ + PropPanel can edit it losslessly. The descriptor MUST NOT flip
    // `hasChildren: true` / drop `isSelfClosing` — that would make the
    // CommonMark image bridge (NG23 / PR #270 consolidation) treat Image as
    // a compound container.
    const image = builtInComponents.find((m) => m.name === 'Image');
    expect(image?.hasChildren).toBe(false);
    expect(image?.isSelfClosing).toBe(true);
  });

  test('Video exposes the 9-prop FR-3 surface', () => {
    // US-007 adds Video as the first pure-HTML5 descriptor (D-MF12 —
    // no URL sniffing, no iframe emission, no `start` prop). The 9 props
    // mirror the native <video> attrs consumers expect: src, title,
    // controls (default true), autoPlay, muted, loop, playsInline, poster,
    // preload. Order-insensitive — a future PropPanel reshuffle should
    // not break this guard.
    const video = builtInComponents.find((m) => m.name === 'Video');
    expect(video).toBeDefined();
    if (!video) return;
    const propNames = video.props.map((p) => p.name).sort();
    expect(propNames).toEqual(
      [
        'src',
        'title',
        'controls',
        'autoPlay',
        'muted',
        'loop',
        'playsInline',
        'poster',
        'preload',
      ].sort(),
    );
  });

  test('Video has `controls` as a boolean with `true` default', () => {
    // The default matches browser HTML5 authoring intuition — a video
    // inserted via slash-menu renders with controls visible. Authors who
    // want a chrome-less video (background loop, hero autoplay) set
    // controls={false} explicitly.
    const video = builtInComponents.find((m) => m.name === 'Video');
    const controls = video?.props.find((p) => p.name === 'controls');
    expect(controls).toBeDefined();
    if (controls?.type === 'boolean') {
      expect(controls.defaultValue).toBe(true);
    } else {
      throw new Error('Video.controls must be a boolean');
    }
  });

  test('Video has `preload` as a 3-value enum (none|metadata|auto)', () => {
    const video = builtInComponents.find((m) => m.name === 'Video');
    const preload = video?.props.find((p) => p.name === 'preload');
    expect(preload).toBeDefined();
    if (preload?.type === 'enum') {
      expect([...preload.enumValues].sort()).toEqual(['auto', 'metadata', 'none'].sort());
    } else {
      throw new Error('Video.preload must be an enum');
    }
  });

  test('Video has `hasChildren: true` for <track>/<source> passthrough (D-MF12)', () => {
    // Per FR-3: `children` is a reactnode for <track> / <source> passthrough.
    // Editability + γ round-trip over runtime media semantics (QA-009 is
    // best-effort). The descriptor MUST NOT flip to self-closing — that
    // would strip authored track/source tags on re-serialize.
    const video = builtInComponents.find((m) => m.name === 'Video');
    expect(video?.hasChildren).toBe(true);
    expect(video?.isSelfClosing).toBeUndefined();
  });

  test('Video has no `start` prop (D-MF12 — matches Mintlify / Fumadocs)', () => {
    // Runtime seek is not a persisted authoring concern. NG27 / NG28 cover
    // future extensions (YouTube/Vimeo auto-embed, rich iframe UX);
    // schema-add-only makes additive props free later.
    const video = builtInComponents.find((m) => m.name === 'Video');
    const start = video?.props.find((p) => p.name === 'start');
    expect(start).toBeUndefined();
  });

  test('Audio exposes the 7-prop FR-4 surface', () => {
    // US-008 widens Audio from the pre-narrow 2-prop shape (src/title) to
    // the FR-4 7-prop shape (src/title/autoplay/loop/muted/preload +
    // children). Order-insensitive — a future PropPanel reshuffle should
    // not break this guard.
    const audio = builtInComponents.find((m) => m.name === 'Audio');
    expect(audio).toBeDefined();
    if (!audio) return;
    const propNames = audio.props.map((p) => p.name).sort();
    expect(propNames).toEqual(['src', 'title', 'autoplay', 'loop', 'muted', 'preload'].sort());
  });

  test('Audio has `preload` as a 3-value enum (none|metadata|auto)', () => {
    const audio = builtInComponents.find((m) => m.name === 'Audio');
    const preload = audio?.props.find((p) => p.name === 'preload');
    expect(preload).toBeDefined();
    if (preload?.type === 'enum') {
      expect([...preload.enumValues].sort()).toEqual(['auto', 'metadata', 'none'].sort());
    } else {
      throw new Error('Audio.preload must be an enum');
    }
  });

  test('Audio has `hasChildren: true` for <source>/<track> passthrough (FR-4)', () => {
    // Per FR-4: `children` is a reactnode for <source> / <track> passthrough.
    // Pre-US-008 state was a bug — the inline renderer passed children but
    // the descriptor declared `hasChildren: false` + `isSelfClosing: true`.
    // US-008 flips both flags to match the rendered behavior.
    const audio = builtInComponents.find((m) => m.name === 'Audio');
    expect(audio?.hasChildren).toBe(true);
    expect(audio?.isSelfClosing).toBeUndefined();
  });

  test('Audio has no `controls` prop (FR-4 — controls always on, NG7)', () => {
    // Per FR-4: controls are ALWAYS on (NG7 "no confidently-broken chrome").
    // Authors who want a chrome-less audio write raw <audio> in MDX; the
    // descriptor-dispatched Audio is always a visible player.
    const audio = builtInComponents.find((m) => m.name === 'Audio');
    const controls = audio?.props.find((p) => p.name === 'controls');
    expect(controls).toBeUndefined();
  });

  test('each name is unique', () => {
    const names = builtInComponents.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('category is always a valid value', () => {
    const validCategories = new Set(['content', 'layout', 'media', 'data']);
    for (const meta of builtInComponents) {
      if (meta.category) {
        expect(validCategories.has(meta.category)).toBe(true);
      }
    }
  });

  test("no name collides with wildcard '*'", () => {
    const names = builtInComponents.map((m) => m.name);
    expect(names).not.toContain('*');
  });
});
