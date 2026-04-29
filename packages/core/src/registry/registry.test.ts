import { describe, expect, test } from 'bun:test';
import { emitMdxJsx } from '../markdown/serialize-helpers.ts';
import { builtInComponents, createRegistry, wildcardMeta } from './index.ts';
import type { JsxComponentMeta } from './types.ts';

describe('createRegistry', () => {
  test('returns the 5 canonical + 4 compat descriptors + wildcard', () => {
    // 5 canonicals (Callout, Image, Video, Audio, Accordion) + 4 compats
    // (GFMCallout, CommonMarkImage, HtmlDetailsAccordion, WikiEmbedImage) +
    // '*' wildcard. Compats are registered for parse + render but filtered
    // out of the slash menu; they preserve source-form fidelity through
    // round-trip edits.
    const registry = createRegistry();
    const entries = [...registry.entries()];
    expect(entries.length).toBe(10);
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
      surface: 'canonical',
      hasChildren: true,
      props: [
        { name: 'chartType', type: 'enum', enumValues: ['bar', 'line', 'pie'], required: true },
      ],
      category: 'content',
      description: 'Data visualization chart',
      serialize: (node, ctx) => emitMdxJsx('DataViz', node, ctx),
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
    expect(registry.has('img')).toBe(true);
    expect(registry.has('video')).toBe(true);
    expect(registry.has('audio')).toBe(true);
    expect(registry.has('Accordion')).toBe(true);
    expect(registry.has('*')).toBe(true);
    // Lowercase media canonicals — capitalized forms now fall through to the
    // wildcard. User content authored before the pivot would render with
    // generic chrome but isn't registered as a fresh-insert canonical.
    expect(registry.has('Image')).toBe(false);
    expect(registry.has('Video')).toBe(false);
    expect(registry.has('Audio')).toBe(false);
    // Other unregistered descriptors fall through to wildcard via getOrWildcard.
    expect(registry.has('Steps')).toBe(false);
    expect(registry.has('DataViz')).toBe(false);
  });
});

describe('builtInComponents manifest', () => {
  test('contains 5 canonical + 4 compat entries (5-pack + source-form preservation)', () => {
    expect(builtInComponents.length).toBe(9);
    const canonical = builtInComponents.filter((m) => m.surface === 'canonical');
    const compat = builtInComponents.filter((m) => m.surface === 'compat');
    expect(canonical.length).toBe(5);
    expect(compat.length).toBe(4);
  });

  test('all entries have required fields', () => {
    for (const meta of builtInComponents) {
      expect(meta.name).toBeTruthy();
      expect(typeof meta.hasChildren).toBe('boolean');
      expect(Array.isArray(meta.props)).toBe(true);
    }
  });

  test('all canonical entries have description and searchTerms (slash-menu surface)', () => {
    // Compat descriptors are filtered out of the slash menu, so searchTerms
    // (which power slash-menu discoverability) are only required on canonicals.
    // Description is required on both — surfaces in agent discovery / MCP.
    for (const meta of builtInComponents) {
      expect(meta.description).toBeTruthy();
      if (meta.surface === 'canonical') {
        expect(Array.isArray(meta.searchTerms)).toBe(true);
        expect(meta.searchTerms?.length).toBeGreaterThan(0);
      }
    }
  });

  test('every enum PropDef defaultValue is in enumValues (Mi1 manifest-drift guard)', () => {
    // Mi1 review fix: PropDefEnum.defaultValue is typed loose (`string`),
    // not as `enumValues[number]`, so a typo'd default would compile but
    // ship as a runtime-invalid manifest entry. A type-generic refactor
    // would propagate through every PropDef-array authoring site; this
    // test-time guard catches the same drift class with no source-shape
    // change. Add new descriptors with `defaultValue` that exists in
    // their `enumValues` — anything else is a manifest defect.
    for (const meta of builtInComponents) {
      for (const prop of meta.props) {
        if (prop.type !== 'enum') continue;
        if (prop.defaultValue === undefined) continue;
        expect(
          prop.enumValues,
          `${meta.name}.${prop.name} defaultValue '${prop.defaultValue}' must appear in enumValues ${JSON.stringify(prop.enumValues)}`,
        ).toContain(prop.defaultValue);
      }
    }
  });

  test('no registered descriptor has emptyChildName (5-pack is standalone-first — no compound parents)', () => {
    // US-002/US-003 retired the compound-components bridge (precedent #29
    // retracted on this branch). The surviving 5-pack descriptors ship without
    // `emptyChildName` — they render standalone, not as compound parents.
    // NG19 preserves the compound-tier revival path via PR #165 branch.
    //
    // Gate for A11Y07: the `.jsx-empty-child-placeholder` affordance (and
    // its keyboard-activation coverage) only fires when a descriptor declares
    // `emptyChildName`. `packages/app/tests/a11y/component-blocks.e2e.ts`
    // carries `A11Y07` as `test.skip` while no such descriptor ships. If this
    // assertion fails, a compound parent has landed — **re-enable A11Y07**
    // so the keyboard-activation invariant gets live coverage again.
    const containers = builtInComponents.filter((m) => m.emptyChildName);
    const names = containers.map((c) => `${c.name}→${c.emptyChildName}`).sort();
    expect(
      names,
      names.length > 0
        ? `Compound descriptor(s) with emptyChildName detected: ${names.join(', ')}. Re-enable A11Y07 in packages/app/tests/a11y/component-blocks.e2e.ts.`
        : undefined,
    ).toEqual([]);
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

  test('img exposes the 12-prop HTML-native surface (4 common + 8 advanced)', () => {
    // Lowercase media canonical pivot. Drops the OK-specific `caption` and
    // `zoom` props from the descriptor — caption belongs on a future Frame
    // wrapper; zoom is always-on inside the Image React component.
    // Common: src + alt + width + height. Advanced: srcset + sizes + loading
    // + title + decoding + fetchpriority + crossorigin + referrerpolicy.
    // Order-insensitive — a future reshuffle should not break this.
    const img = builtInComponents.find((m) => m.name === 'img');
    expect(img).toBeDefined();
    if (!img) return;
    const propNames = img.props.map((p) => p.name).sort();
    expect(propNames).toEqual(
      [
        'src',
        'alt',
        'width',
        'height',
        'srcset',
        'sizes',
        'loading',
        'title',
        'decoding',
        'fetchpriority',
        'crossorigin',
        'referrerpolicy',
      ].sort(),
    );
  });

  test('img has `loading` as a 2-value enum with lazy default (advanced-tagged)', () => {
    const img = builtInComponents.find((m) => m.name === 'img');
    const loading = img?.props.find((p) => p.name === 'loading');
    expect(loading).toBeDefined();
    if (loading?.type === 'enum') {
      expect([...loading.enumValues].sort()).toEqual(['eager', 'lazy'].sort());
      expect(loading.defaultValue).toBe('lazy');
      expect(loading.advanced).toBe(true);
    } else {
      throw new Error('img.loading must be an enum');
    }
  });

  test('img drops the `zoom` and `caption` props (Frame v2 will host)', () => {
    // Greenfield pivot: zoom is now always-on inside the Image React
    // component; caption belongs on a compositional Frame wrapper.
    const img = builtInComponents.find((m) => m.name === 'img');
    expect(img?.props.find((p) => p.name === 'zoom')).toBeUndefined();
    expect(img?.props.find((p) => p.name === 'caption')).toBeUndefined();
  });

  test('img stays `isSelfClosing: true` (no children slot)', () => {
    // The CommonMark image bridge (NG23) requires the canonical descriptor
    // to declare `hasChildren: false` + `isSelfClosing: true` so the
    // promotion path can map paragraph>image into a leaf descriptor cleanly.
    const img = builtInComponents.find((m) => m.name === 'img');
    expect(img?.hasChildren).toBe(false);
    expect(img?.isSelfClosing).toBe(true);
  });

  test('video exposes the 11-prop HTML-native surface (6 common + 5 advanced)', () => {
    // Lowercase media canonical pivot. Adds `width` / `height` (today's
    // canonical lacked them); HTML-attr lowercase names (`autoplay`,
    // `playsinline`) so the rendered MDX matches the spec exactly.
    // Order-insensitive — a future reshuffle should not break this guard.
    const video = builtInComponents.find((m) => m.name === 'video');
    expect(video).toBeDefined();
    if (!video) return;
    const propNames = video.props.map((p) => p.name).sort();
    expect(propNames).toEqual(
      [
        'src',
        'controls',
        'autoplay',
        'poster',
        'width',
        'height',
        'title',
        'muted',
        'loop',
        'playsinline',
        'preload',
      ].sort(),
    );
  });

  test('video has `controls` as a boolean with `true` default', () => {
    // The default matches browser HTML5 authoring intuition — a video
    // inserted via slash-menu renders with controls visible. Authors who
    // want a chrome-less video (background loop, hero autoplay) set
    // controls={false} explicitly.
    const video = builtInComponents.find((m) => m.name === 'video');
    const controls = video?.props.find((p) => p.name === 'controls');
    expect(controls).toBeDefined();
    if (controls?.type === 'boolean') {
      expect(controls.defaultValue).toBe(true);
    } else {
      throw new Error('video.controls must be a boolean');
    }
  });

  test('video has `preload` as a 3-value enum (advanced-tagged)', () => {
    const video = builtInComponents.find((m) => m.name === 'video');
    const preload = video?.props.find((p) => p.name === 'preload');
    expect(preload).toBeDefined();
    if (preload?.type === 'enum') {
      expect([...preload.enumValues].sort()).toEqual(['auto', 'metadata', 'none'].sort());
      expect(preload.advanced).toBe(true);
    } else {
      throw new Error('video.preload must be an enum');
    }
  });

  test('video is a self-closing leaf (no PM children)', () => {
    // HTML5 `<track>` / `<source>` require direct-child placement under
    // `<video>`, but PM NodeViews mandate a wrapper DOM element — the two
    // contracts are structurally incompatible. Authors who need captions /
    // codec fallback write raw `<video>` + `<track>` HTML in MDX, which
    // flows through rawMdxFallback.
    const video = builtInComponents.find((m) => m.name === 'video');
    expect(video?.hasChildren).toBe(false);
    expect(video?.isSelfClosing).toBe(true);
  });

  test('video has no `start` prop (matches Mintlify / Fumadocs)', () => {
    // Runtime seek is not a persisted authoring concern.
    const video = builtInComponents.find((m) => m.name === 'video');
    const start = video?.props.find((p) => p.name === 'start');
    expect(start).toBeUndefined();
  });

  test('audio exposes the 7-prop HTML-native surface (3 common + 4 advanced)', () => {
    // Lowercase media canonical pivot. `controls` is now an explicit prop
    // (default true) — Audio.tsx no longer hardcodes always-on; authors who
    // want a chrome-less audio set controls={false} from the descriptor.
    const audio = builtInComponents.find((m) => m.name === 'audio');
    expect(audio).toBeDefined();
    if (!audio) return;
    const propNames = audio.props.map((p) => p.name).sort();
    expect(propNames).toEqual(
      ['src', 'controls', 'autoplay', 'title', 'muted', 'loop', 'preload'].sort(),
    );
  });

  test('audio has `preload` as a 3-value enum (advanced-tagged)', () => {
    const audio = builtInComponents.find((m) => m.name === 'audio');
    const preload = audio?.props.find((p) => p.name === 'preload');
    expect(preload).toBeDefined();
    if (preload?.type === 'enum') {
      expect([...preload.enumValues].sort()).toEqual(['auto', 'metadata', 'none'].sort());
      expect(preload.advanced).toBe(true);
    } else {
      throw new Error('audio.preload must be an enum');
    }
  });

  test('audio is a self-closing leaf (symmetric with video)', () => {
    const audio = builtInComponents.find((m) => m.name === 'audio');
    expect(audio?.hasChildren).toBe(false);
    expect(audio?.isSelfClosing).toBe(true);
  });

  test('audio has `controls` as a boolean with `true` default (was hardcoded always-on)', () => {
    // Lowercase pivot promotes controls to an explicit prop. Default true
    // preserves the prior always-on behavior for the common case.
    const audio = builtInComponents.find((m) => m.name === 'audio');
    const controls = audio?.props.find((p) => p.name === 'controls');
    expect(controls).toBeDefined();
    if (controls?.type === 'boolean') {
      expect(controls.defaultValue).toBe(true);
    } else {
      throw new Error('audio.controls must be a boolean');
    }
  });

  test('Accordion exposes the 6-prop FR-5 surface', () => {
    // US-009 adds Accordion with the FR-5 6-prop shape — standalone per
    // D-MF14/D-MF16 (no `variant`; renamed from Toggle). Order-insensitive.
    const accordion = builtInComponents.find((m) => m.name === 'Accordion');
    expect(accordion).toBeDefined();
    if (!accordion) return;
    const propNames = accordion.props.map((p) => p.name).sort();
    expect(propNames).toEqual(['title', 'defaultOpen', 'icon', 'description', 'id', 'name'].sort());
  });

  test('Accordion has `title` as a required string', () => {
    // `title` is the only required prop — ensures a freshly-inserted Accordion
    // always has a visible affordance in the summary.
    const accordion = builtInComponents.find((m) => m.name === 'Accordion');
    const title = accordion?.props.find((p) => p.name === 'title');
    expect(title).toBeDefined();
    expect(title?.type).toBe('string');
    expect(title?.required).toBe(true);
  });

  test('Accordion has `defaultOpen` as a boolean with `false` default', () => {
    // Defaults to closed so slash-menu insertions don't immediately dominate
    // page layout. Authors flip true for sections they want expanded up front.
    const accordion = builtInComponents.find((m) => m.name === 'Accordion');
    const defaultOpen = accordion?.props.find((p) => p.name === 'defaultOpen');
    expect(defaultOpen).toBeDefined();
    if (defaultOpen?.type === 'boolean') {
      expect(defaultOpen.defaultValue).toBe(false);
    } else {
      throw new Error('Accordion.defaultOpen must be a boolean');
    }
  });

  test('Accordion has `hasChildren: true` and no `isSelfClosing` (FR-5)', () => {
    // Per FR-5: Accordion body is a content hole — the descriptor MUST
    // declare hasChildren: true so the NodeView mounts a NodeViewContent
    // slot. Flipping to self-closing would strip the body on re-serialize.
    const accordion = builtInComponents.find((m) => m.name === 'Accordion');
    expect(accordion?.hasChildren).toBe(true);
    expect(accordion?.isSelfClosing).toBeUndefined();
  });

  test('Accordion has no `variant` prop (D-MF14 — NG30 preserves Notion color-map path)', () => {
    // D-MF14: the research-recommended 7-prop descriptor included a `variant`
    // enum absorbing Notion's color map (default/gray/brown/_background) —
    // those come from the de-prioritized Notion audience. Dropping now (when
    // nothing consumes it) avoids permanent lock-in under precedent #9; NG30
    // preserves the Notion color-map absorption path. Schema-add-only makes
    // extension free later.
    const accordion = builtInComponents.find((m) => m.name === 'Accordion');
    const variant = accordion?.props.find((p) => p.name === 'variant');
    expect(variant).toBeUndefined();
  });

  test('Accordion has no `emptyChildName` (D-MF16 — ships standalone, not compound)', () => {
    // D-MF16: Accordion ships standalone, not as a compound parent. The
    // foundation does NOT require an `<Accordions>` parent wrapper —
    // diverges from Fumadocs's Radix-requires-parent pattern. NG19 revives
    // the compound tier for grouped-UX demand; standalone stays first.
    const accordion = builtInComponents.find((m) => m.name === 'Accordion');
    expect(accordion?.emptyChildName).toBeUndefined();
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
