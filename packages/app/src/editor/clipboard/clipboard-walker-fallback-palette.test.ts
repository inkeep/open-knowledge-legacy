/**
 * Co-located unit tests for the per-descriptor static fallback palette.
 *
 * The palette is a parallel descriptor registry — `paletteFor` switches on
 * `componentName` and returns hand-built DOM elements for the v1 5-pack
 * canonical + 3-pack compat descriptors. A new descriptor added to the
 * registry without a palette entry would silently produce `null` here,
 * which the walker appends as a no-op — Activity-hidden copies would lose
 * the descriptor entirely.
 *
 * bun-test has no DOM (`document.createElement` is unavailable), so the
 * DOM-shape behavior of the palette functions is covered by Playwright
 * E2E (US-009) — see CLAUDE.md note about "DOM behavior → Playwright;
 * pure helpers tested via DI / exported lists." This file pins the
 * **structural** contracts that are testable without a DOM:
 *
 * - `PALETTE_DESCRIPTOR_NAMES` covers every v1 canonical / compat descriptor.
 * - `toneForType` resolves known types and falls back safely for unknown /
 *   prototype-pollution-style names.
 * - `TYPE_TO_TONE` shape pins the supported callout type set.
 */

import { describe, expect, test } from 'bun:test';
import {
  PALETTE_DESCRIPTOR_NAMES,
  TYPE_TO_TONE,
  toneForType,
} from './clipboard-walker-fallback-palette.ts';

describe('PALETTE_DESCRIPTOR_NAMES — registry coverage', () => {
  test('covers every v1 canonical descriptor', () => {
    // Adding a new canonical descriptor to the registry requires adding
    // a case here — without it, Activity-hidden cross-app paste would
    // silently lose the descriptor.
    expect([...PALETTE_DESCRIPTOR_NAMES]).toEqual(
      expect.arrayContaining(['Callout', 'img', 'video', 'audio', 'Accordion']),
    );
  });

  test('covers every v1 compat descriptor', () => {
    expect([...PALETTE_DESCRIPTOR_NAMES]).toEqual(
      expect.arrayContaining(['GFMCallout', 'CommonMarkImage', 'HtmlDetailsAccordion']),
    );
  });

  test('exact size — adding a name requires intentional update of this list', () => {
    // Hard count anchor. If a descriptor is added or removed, this
    // failing test becomes the prompt to also update the palette switch
    // and PALETTE_DESCRIPTOR_NAMES together.
    expect(PALETTE_DESCRIPTOR_NAMES.length).toBe(8);
  });
});

describe('TYPE_TO_TONE — callout tone mapping', () => {
  test('covers the documented callout type set', () => {
    expect(Object.keys(TYPE_TO_TONE).sort()).toEqual(
      ['caution', 'important', 'note', 'tip', 'warning'].sort(),
    );
  });

  test('every tone defines color + bg without undefined values', () => {
    for (const [type, tone] of Object.entries(TYPE_TO_TONE)) {
      expect(tone.color, `tone[${type}].color`).toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(tone.bg, `tone[${type}].bg`).toMatch(/^#[0-9a-f]{3,6}$/i);
    }
  });
});

describe('toneForType — type-to-tone lookup with prototype-pollution guard', () => {
  test('resolves known types to their tone', () => {
    expect(toneForType('note')).toBe(TYPE_TO_TONE.note);
    expect(toneForType('warning')).toBe(TYPE_TO_TONE.warning);
    expect(toneForType('caution')).toBe(TYPE_TO_TONE.caution);
  });

  test('falls back to "note" for unknown types', () => {
    expect(toneForType('unrecognized')).toBe(TYPE_TO_TONE.note);
    expect(toneForType('')).toBe(TYPE_TO_TONE.note);
  });

  test('Object.hasOwn guard blocks prototype-pollution names', () => {
    // Without the guard, `TYPE_TO_TONE['__proto__']` would walk the
    // prototype chain and return Object.prototype methods — the palette
    // would then emit `border-left: 3px solid undefined`, a DoS vector
    // a co-editing peer could trigger by setting `type="__proto__"`.
    // Mirrors the same guard at Callout.tsx + Accordion.tsx.
    for (const polluted of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const tone = toneForType(polluted);
      expect(tone, polluted).toBe(TYPE_TO_TONE.note);
      expect(tone.color).not.toBeUndefined();
      expect(tone.bg).not.toBeUndefined();
    }
  });
});
