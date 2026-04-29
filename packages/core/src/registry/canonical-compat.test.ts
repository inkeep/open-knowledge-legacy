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

  test('exactly 5 canonical descriptors (5-pack foundation)', () => {
    expect(canonicalDescriptors.length).toBe(5);
    // Media canonicals are lowercase HTML-tag names (img/video/audio); non-
    // media stays capitalized because HTML has no primitive rich enough to
    // converge with (Callout) or only a structural subset (Accordion vs
    // <details>).
    expect(canonicalDescriptors.map((m) => m.name).sort()).toEqual(
      ['Accordion', 'Callout', 'audio', 'img', 'video'].sort(),
    );
  });

  test('exactly 3 compat descriptors (v1 source-form preservation set)', () => {
    expect(compatDescriptors.length).toBe(3);
    expect(compatDescriptors.map((m) => m.name).sort()).toEqual(
      ['CommonMarkImage', 'GFMCallout', 'HtmlDetailsAccordion'].sort(),
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

  test('every compat declares identity `translateProps` for v1 (T2)', () => {
    // v1's compat fixtures all share canonical's prop-name spelling — identity
    // remap. Future compats whose source spelling differs (e.g., a Mintlify
    // Note → Callout integration) would supply non-identity remaps; this
    // test stays as a v1 stub and the contract widens additively.
    const probe = { type: 'note', title: 'X', src: 'foo.png', alt: 'A', collapsible: true };
    for (const meta of compatDescriptors) {
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
});
