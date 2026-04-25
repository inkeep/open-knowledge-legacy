import { describe, expect, test } from 'bun:test';
import { emitMdxJsx } from '../markdown/serialize-helpers.ts';
import { builtInComponents, createRegistry, wildcardMeta } from './index.ts';
import type { JsxComponentMeta } from './types.ts';

describe('createRegistry', () => {
  test('returns the 5 canonical + 3 compat descriptors + wildcard', () => {
    // 5 canonicals (Callout, Image, Video, Audio, Accordion) + 3 compats
    // (GFMCallout, CommonMarkImage, HtmlDetailsAccordion) + '*' wildcard.
    // Compats are registered for parse + render but filtered out of the slash
    // menu; they preserve source-form fidelity through round-trip edits.
    const registry = createRegistry();
    const entries = [...registry.entries()];
    expect(entries.length).toBe(9);
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
    expect(registry.has('Image')).toBe(true);
    expect(registry.has('Video')).toBe(true);
    expect(registry.has('Audio')).toBe(true);
    expect(registry.has('Accordion')).toBe(true);
    expect(registry.has('*')).toBe(true);
    // Cut-in-US-003 descriptors (Steps, Cards, Tabs, etc.) are no longer registered —
    // user content using those names falls through to wildcard via `getOrWildcard`.
    expect(registry.has('Steps')).toBe(false);
    expect(registry.has('DataViz')).toBe(false);
  });
});

describe('builtInComponents manifest', () => {
  test('contains 5 canonical + 3 compat entries (5-pack + source-form preservation)', () => {
    expect(builtInComponents.length).toBe(8);
    const canonical = builtInComponents.filter((m) => m.surface === 'canonical');
    const compat = builtInComponents.filter((m) => m.surface === 'compat');
    expect(canonical.length).toBe(5);
    expect(compat.length).toBe(3);
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

  test('Video is a self-closing leaf (no PM children; NG31 for tracks/sources)', () => {
    // Per FR-3 post-QA-resolution: Video is a self-closing leaf descriptor
    // symmetric with Image. HTML5 `<track>` / `<source>` require direct-
    // child placement under `<video>`, but PM NodeViews mandate a wrapper
    // DOM element — the two contracts are structurally incompatible, so
    // promising children passthrough was a category error. Authors who
    // need captions / codec fallback write raw `<video>` + `<track>` HTML
    // in MDX, which flows through rawMdxFallback. NG31 (Future Work)
    // tracks the additive replacement: typed `tracks` / `sources` props
    // gated on an `array` PropDef extension.
    const video = builtInComponents.find((m) => m.name === 'Video');
    expect(video?.hasChildren).toBe(false);
    expect(video?.isSelfClosing).toBe(true);
  });

  test('Video has no `start` prop (D-MF12 — matches Mintlify / Fumadocs)', () => {
    // Runtime seek is not a persisted authoring concern. NG27 / NG28 cover
    // future extensions (YouTube/Vimeo auto-embed, rich iframe UX);
    // schema-add-only makes additive props free later.
    const video = builtInComponents.find((m) => m.name === 'Video');
    const start = video?.props.find((p) => p.name === 'start');
    expect(start).toBeUndefined();
  });

  test('Audio exposes the 6-prop FR-4 surface', () => {
    // Post-QA-resolution: Audio is a self-closing leaf descriptor (6 props).
    // Drops `children` from the prop list alongside the Video refactor —
    // see the hasChildren/isSelfClosing test below for rationale.
    // Order-insensitive — a future PropPanel reshuffle should not break
    // this guard. Fix-pass 2 (post-Pass-1 review) standardized on
    // camelCase `autoPlay` to match Video (FR-3) + React MDX-JSX canon.
    const audio = builtInComponents.find((m) => m.name === 'Audio');
    expect(audio).toBeDefined();
    if (!audio) return;
    const propNames = audio.props.map((p) => p.name).sort();
    expect(propNames).toEqual(['src', 'title', 'autoPlay', 'loop', 'muted', 'preload'].sort());
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

  test('Audio is a self-closing leaf (symmetric with Video; NG31 for sources)', () => {
    // Audio follows the same self-closing contract as Video — see the
    // corresponding Video test above for the PM-vs-HTML5-direct-child
    // rationale. The pre-QA state declared `hasChildren: true` but the
    // shipped rendering path couldn't deliver native `<source>` as a
    // direct child of `<audio>` through the PM NodeView wrapper; the
    // descriptor is now honest about the contract.
    const audio = builtInComponents.find((m) => m.name === 'Audio');
    expect(audio?.hasChildren).toBe(false);
    expect(audio?.isSelfClosing).toBe(true);
  });

  test('Audio has no `controls` prop (FR-4 — controls always on, NG7)', () => {
    // Per FR-4: controls are ALWAYS on (NG7 "no confidently-broken chrome").
    // Authors who want a chrome-less audio write raw <audio> in MDX; the
    // descriptor-dispatched Audio is always a visible player.
    const audio = builtInComponents.find((m) => m.name === 'Audio');
    const controls = audio?.props.find((p) => p.name === 'controls');
    expect(controls).toBeUndefined();
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
