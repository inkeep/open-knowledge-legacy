import { describe, expect, test } from 'bun:test';
import {
  type BuiltInFixture,
  loadBuiltInFixtures,
  loadNgPinnedCases,
  type NgPinnedCase,
} from './index.ts';

describe('fixture loaders — count + shape contracts', () => {
  test('loadBuiltInFixtures returns 37 entries (26 5-pack + 11 parse-path per US-012 narrow)', () => {
    // US-012 narrowed the pre-existing corpus to 5-pack-only: dropped 6
    // fumadocs-specific fixtures (Card, Cards, Steps, Tabs, Banner,
    // Card-with-unknown-attrs) and ADDED widened-shape + nested-composition
    // fixtures for the 5-pack descriptors (~13 new entries including I16
    // nested-dirty compositions per D-MF18).
    //
    // Current breakdown:
    //   - 6 Callout fixtures (base + self-closing + info-alias + boolean-shorthand
    //     + widened-foldable + color-override)
    //   - 3 Accordion fixtures (title-only + name-grouping + defaultOpen-id)
    //   - 2 Image fixtures (basic + widened-caption-zoom)
    //   - 2 Video fixtures (basic + with-poster-autoplay)
    //   - 2 Audio fixtures (basic + widened-preload)
    //   - 5 nested-composition fixtures (D-MF18 I16: Callout>Accordion,
    //     Accordion>Callout, Accordion>Accordion, Callout>Callout,
    //     Callout-collapsible>Accordion)
    //   - 3 wildcard/expression fixtures (Unregistered-CustomThing,
    //     Comp-expression-attr, Comp-spread-attr)
    //   - 3 inline thin-shape fixtures (Icon, Badge, Comp-inline-expression)
    //   - 7 GFM-alert fixtures (US-010: 5 GFM + 2 Obsidian foldable)
    //   - 4 <details>→Accordion fixtures (US-011)
    const fixtures = loadBuiltInFixtures();
    expect(fixtures).toHaveLength(37);
  });

  test('every BuiltInFixture has non-empty componentName + blockForm', () => {
    for (const f of loadBuiltInFixtures()) {
      expect(typeof f.componentName).toBe('string');
      expect(f.componentName.length).toBeGreaterThan(0);
      expect(typeof f.blockForm).toBe('string');
      expect(f.blockForm.length).toBeGreaterThan(0);
    }
  });

  test('BuiltInFixture JSON deserializes into the exported interface shape', () => {
    const fixtures: BuiltInFixture[] = loadBuiltInFixtures();
    // At least one should demonstrate the `notes` optional field populated.
    const withNotes = fixtures.filter((f) => typeof f.notes === 'string' && f.notes.length > 0);
    expect(withNotes.length).toBeGreaterThan(0);
  });

  test('loadNgPinnedCases returns the 10 probe cases from serialize-roundtrip-probe evidence', () => {
    const cases = loadNgPinnedCases();
    expect(cases).toHaveLength(10);
  });

  test('NG12 cases have exactly 4 highlighted (cases 2, 5, 6, 7 per CONSIDER §5)', () => {
    const cases = loadNgPinnedCases();
    const highlighted = cases.filter((c) => c.highlighted);
    expect(highlighted).toHaveLength(4);
    // IDs that must be highlighted:
    const highlightedIds = new Set(highlighted.map((c) => c.id));
    expect(highlightedIds.has('case-2')).toBe(true);
    expect(highlightedIds.has('case-5')).toBe(true);
    expect(highlightedIds.has('case-6')).toBe(true);
    expect(highlightedIds.has('case-7')).toBe(true);
  });

  test('every NG12 case has unique id + non-empty input + idempotent flag', () => {
    const cases: NgPinnedCase[] = loadNgPinnedCases();
    const ids = new Set<string>();
    for (const c of cases) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.input.length).toBeGreaterThan(0);
      expect(typeof c.idempotent).toBe('boolean');
      expect(typeof c.highlighted).toBe('boolean');
    }
  });
});
