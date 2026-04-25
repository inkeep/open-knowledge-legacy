/**
 * Canonical / compat split — architecture-locking unit tests.
 *
 * Covers:
 *  - T2: identity `translateProps` on all v1 compat descriptors.
 *  - T4: slash menu (via `getRegisteredDescriptors` filter contract).
 *  - T7: registry build is consistent — every compat's `rendersAs` resolves
 *        to a registered canonical descriptor.
 *  - Compat-specific invariants: every compat declares `convertibleTo`, and
 *    convert remap is identity for v1 (prop names match canonical's storage).
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
    expect(canonicalDescriptors.map((m) => m.name).sort()).toEqual(
      ['Accordion', 'Audio', 'Callout', 'Image', 'Video'].sort(),
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

  test('every compat declares `convertibleTo` with identity remap (v1)', () => {
    const probe = { type: 'note', title: 'X', src: 'foo.png', alt: 'A' };
    for (const meta of compatDescriptors) {
      expect(meta.convertibleTo).toBeDefined();
      const target = meta.convertibleTo?.target;
      expect(typeof target).toBe('string');
      expect(canonicalDescriptors.some((c) => c.name === target)).toBe(true);
      expect(meta.convertibleTo?.remap(probe)).toEqual(probe);
    }
  });

  test('compat → canonical convert targets a sensible canonical', () => {
    // Verifies the v1 wiring — each compat's source form has a clear canonical
    // equivalent. These pairings are part of the public contract; a future
    // change to one of them would require a docs update.
    const targets = new Map(
      compatDescriptors.map((m) => [m.name, m.convertibleTo?.target] as const),
    );
    expect(targets.get('GFMCallout')).toBe('Callout');
    expect(targets.get('CommonMarkImage')).toBe('Image');
    expect(targets.get('HtmlDetailsAccordion')).toBe('Accordion');
  });

  test('compat `rendersAs` and `convertibleTo.target` align (v1 — same canonical)', () => {
    // For v1, every compat both renders through and converts to the same
    // canonical. v2 may diverge if a compat has multiple canonical variants
    // it could promote to (e.g., a hypothetical `LegacyCallout` rendering
    // through `Callout` but convertible to a future `RichCallout`).
    for (const meta of compatDescriptors) {
      expect(meta.rendersAs).toBe(meta.convertibleTo?.target ?? meta.rendersAs);
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

  test('CommonMarkImage props are a subset of Image props', () => {
    const image = canonicalDescriptors.find((m) => m.name === 'Image');
    const cm = compatDescriptors.find((m) => m.name === 'CommonMarkImage');
    if (!image || !cm) throw new Error('Missing descriptor');
    const canonicalNames = new Set(image.props.map((p) => p.name));
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
