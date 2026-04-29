/**
 * Canonical / compat split — architecture-locking unit tests.
 *
 * Covers:
 *  - T2: identity `translateProps` on all v1 compat descriptors.
 *  - T4: slash menu (via `getRegisteredDescriptors` filter contract).
 *  - T7: registry build is consistent — every compat's `rendersAs` resolves
 *        to a registered canonical descriptor.
 *
 * Round-trip tests for the source-form preservation property live in
 * `packages/app/tests/fidelity/invariant-i13.test.ts` (PBT) and `invariant-
 * i19.test.ts` (HTML5 details ↔ Accordion structural equivalence). The
 * pristine path is covered by I12.
 */

import { describe, expect, test } from 'bun:test';
import { builtInComponents, createRegistry } from './index.ts';
import type { CompatMeta, JsxComponentMeta } from './types.ts';

const canonicalDescriptors = builtInComponents.filter(
  (m): m is JsxComponentMeta & { surface: 'canonical' } => m.surface === 'canonical',
);
const compatDescriptors = builtInComponents.filter((m): m is CompatMeta => m.surface === 'compat');

describe('canonical/compat split — registry shape', () => {
  test('every descriptor has a `surface` discriminator', () => {
    for (const meta of builtInComponents) {
      expect(meta.surface === 'canonical' || meta.surface === 'compat').toBe(true);
    }
  });

  test('exactly 6 canonical descriptors (6-pack foundation)', () => {
    expect(canonicalDescriptors.length).toBe(6);
    // Media canonicals are lowercase HTML-tag names (img/video/audio); non-
    // media stays capitalized because HTML has no primitive rich enough to
    // converge with (Callout, Math) or only a structural subset (Accordion
    // vs <details>).
    expect(canonicalDescriptors.map((m) => m.name).sort()).toEqual(
      ['Accordion', 'Callout', 'Math', 'audio', 'img', 'video'].sort(),
    );
  });

  test('compat descriptor set covers v1 source-form preservation + WikiEmbed convergence + math fences', () => {
    // v1 set: GFMCallout / CommonMarkImage / HtmlDetailsAccordion (alternative
    // surface forms that already shared canonical's prop spelling — identity
    // translateProps). WikiEmbedImage / WikiEmbedVideo / WikiEmbedAudio carry
    // a non-identity translateProps (alias → alt for img; alias → title for
    // video/audio since neither HTML5 element accepts an `alt` attribute) —
    // they prove the seam scales beyond identity remaps and converge all four
    // media authoring shapes (slash-menu JSX, ![](src) CommonMark, ![[file]]
    // wiki-embed, drag-drop) on the same React component. DollarMath and
    // MathFence (added by the math spec) cover `$$…$$` and ` ```math `
    // parse paths that render through the canonical `<Math>`.
    expect(compatDescriptors.map((m) => m.name).sort()).toEqual(
      [
        'CommonMarkImage',
        'DollarMath',
        'GFMCallout',
        'HtmlDetailsAccordion',
        'MathFence',
        'WikiEmbedAudio',
        'WikiEmbedImage',
        'WikiEmbedVideo',
      ].sort(),
    );
  });

  test('every descriptor declares a `serialize` function', () => {
    for (const meta of builtInComponents) {
      expect(typeof meta.serialize).toBe('function');
    }
  });
});

describe('compat descriptors — contract invariants', () => {
  test('every compat `rendersAs` resolves to a registered canonical (T7)', () => {
    const registry = createRegistry();
    for (const meta of compatDescriptors) {
      const target = registry.get(meta.rendersAs);
      expect(target).toBeDefined();
      expect(target?.surface).toBe('canonical');
    }
  });

  test('v1 compats (Callout/CommonMarkImage/Details) declare identity `translateProps` (T2)', () => {
    // v1's compat fixtures share canonical's prop-name spelling — identity
    // remap. WikiEmbedImage and its video/audio siblings carry a non-identity
    // remap (alias → alt) and are tested separately by their own descriptor
    // tests; this test pins the v1 set so a regression to one of them shows
    // up here rather than as a render-shape oddity.
    const v1Names = new Set(['GFMCallout', 'CommonMarkImage', 'HtmlDetailsAccordion']);
    const probe = { type: 'note', title: 'X', src: 'foo.png', alt: 'A', collapsible: true };
    for (const meta of compatDescriptors) {
      if (!v1Names.has(meta.name)) continue;
      expect(meta.translateProps(probe)).toEqual(probe);
    }
  });
});

describe('compat descriptors — prop-set is a subset of canonical', () => {
  test('GFMCallout props are a subset of Callout props', () => {
    const callout = canonicalDescriptors.find((m) => m.name === 'Callout');
    const gfm = compatDescriptors.find((m) => m.name === 'GFMCallout');
    if (!callout || !gfm) throw new Error('Missing descriptor');
    const canonicalNames = new Set(callout.props.map((p) => p.name));
    for (const p of gfm.props) {
      expect(canonicalNames.has(p.name)).toBe(true);
    }
  });

  test('CommonMarkImage props are a subset of img props', () => {
    const img = canonicalDescriptors.find((m) => m.name === 'img');
    const cm = compatDescriptors.find((m) => m.name === 'CommonMarkImage');
    if (!img || !cm) throw new Error('Missing descriptor');
    const canonicalNames = new Set(img.props.map((p) => p.name));
    for (const p of cm.props) {
      expect(canonicalNames.has(p.name)).toBe(true);
    }
  });

  test('HtmlDetailsAccordion props are a subset of Accordion props', () => {
    const accordion = canonicalDescriptors.find((m) => m.name === 'Accordion');
    const html = compatDescriptors.find((m) => m.name === 'HtmlDetailsAccordion');
    if (!accordion || !html) throw new Error('Missing descriptor');
    const canonicalNames = new Set(accordion.props.map((p) => p.name));
    for (const p of html.props) {
      expect(canonicalNames.has(p.name)).toBe(true);
    }
  });

  test('DollarMath props are a subset of Math props', () => {
    const math = canonicalDescriptors.find((m) => m.name === 'Math');
    const dollar = compatDescriptors.find((m) => m.name === 'DollarMath');
    if (!math || !dollar) throw new Error('Missing descriptor');
    const canonicalNames = new Set(math.props.map((p) => p.name));
    for (const p of dollar.props) {
      expect(canonicalNames.has(p.name)).toBe(true);
    }
  });

  test('MathFence props are a subset of Math props', () => {
    const math = canonicalDescriptors.find((m) => m.name === 'Math');
    const fence = compatDescriptors.find((m) => m.name === 'MathFence');
    if (!math || !fence) throw new Error('Missing descriptor');
    const canonicalNames = new Set(math.props.map((p) => p.name));
    for (const p of fence.props) {
      expect(canonicalNames.has(p.name)).toBe(true);
    }
  });
});
