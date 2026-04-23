import { describe, expect, test } from 'bun:test';
import {
  type BuiltInFixture,
  loadBuiltInFixtures,
  loadNgPinnedCases,
  type NgPinnedCase,
} from './index.ts';

describe('fixture loaders — count + shape contracts', () => {
  test('loadBuiltInFixtures returns 29 entries (18 legacy + 7 GFM-alert + 4 <details>-Accordion per US-010/US-011)', () => {
    // US-010 added 7 GFM-alert fixtures (5 GFM types + 2 Obsidian foldable)
    // to exercise the callout-transformer parse path + γ pristine preservation.
    // US-011 added 4 HTML5 <details>→Accordion fixtures covering single-line,
    // multi-paragraph, `name` attr, and `id` attr forms.
    // The legacy 18-entry corpus pre-dates narrowing — it still rides on I12
    // byte-identity and NG12 idempotence. US-012 will narrow the pre-existing
    // cases to 5-pack-only; until then the entry count is additive.
    const fixtures = loadBuiltInFixtures();
    expect(fixtures).toHaveLength(29);
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
