
import { describe, expect, test } from 'bun:test';
import {
  PALETTE_DESCRIPTOR_NAMES,
  TYPE_TO_TONE,
  toneForType,
} from './clipboard-walker-fallback-palette.ts';

describe('PALETTE_DESCRIPTOR_NAMES — registry coverage', () => {
  test('covers every v1 canonical descriptor', () => {
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
    for (const polluted of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const tone = toneForType(polluted);
      expect(tone, polluted).toBe(TYPE_TO_TONE.note);
      expect(tone.color).not.toBeUndefined();
      expect(tone.bg).not.toBeUndefined();
    }
  });
});
