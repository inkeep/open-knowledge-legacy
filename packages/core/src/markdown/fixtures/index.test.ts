import { describe, expect, test } from 'bun:test';
import {
  type BuiltInFixture,
  loadBuiltInFixtures,
  loadNgPinnedCases,
  type NgPinnedCase,
} from './index.ts';

describe('fixture loaders — count + shape contracts', () => {
  test('loadBuiltInFixtures returns 18 entries (16 fumadocs + 2 shadcn wrappers per SPEC D3)', () => {
    const fixtures = loadBuiltInFixtures();
    expect(fixtures).toHaveLength(18);
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
