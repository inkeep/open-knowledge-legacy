import { describe, expect, test } from 'bun:test';
import { getHeadingSlug, toWikiLinkSlug } from './slug.ts';

describe('toWikiLinkSlug', () => {
  test('normalizes ASCII names to kebab-case slugs', () => {
    expect(toWikiLinkSlug('Nonexistent Page')).toBe('nonexistent-page');
    expect(toWikiLinkSlug('  Mixed_CASE  Page  ')).toBe('mixed-case-page');
  });

  test('preserves Unicode letters while removing accent marks safely', () => {
    expect(toWikiLinkSlug('Café Menu')).toBe('cafe-menu');
    expect(toWikiLinkSlug('Ångström Notes')).toBe('angstrom-notes');
    expect(toWikiLinkSlug('東京 2026')).toBe('東京-2026');
    expect(toWikiLinkSlug('Привет, мир!')).toBe('привет-мир');
    expect(toWikiLinkSlug('مرحبا بالعالم')).toBe('مرحبا-بالعالم');
  });

  test('is idempotent once a slug has been produced', () => {
    const samples = ['nonexistent-page', 'cafe-menu', '東京-2026', 'привет-мир', 'مرحبا-بالعالم'];
    for (const sample of samples) {
      expect(toWikiLinkSlug(toWikiLinkSlug(sample))).toBe(sample);
    }
  });
});

describe('getHeadingSlug', () => {
  test('deduplicates repeated headings in document order', () => {
    const slugCounts = new Map<string, number>();
    expect(getHeadingSlug('Notes', slugCounts)).toBe('notes');
    expect(getHeadingSlug('Notes', slugCounts)).toBe('notes-1');
    expect(getHeadingSlug('Notes', slugCounts)).toBe('notes-2');
  });

  test('deduplicates repeated Unicode headings using the same shared logic', () => {
    const slugCounts = new Map<string, number>();
    expect(getHeadingSlug('東京', slugCounts)).toBe('東京');
    expect(getHeadingSlug('東京', slugCounts)).toBe('東京-1');
    expect(getHeadingSlug('Café', slugCounts)).toBe('cafe');
    expect(getHeadingSlug('Café', slugCounts)).toBe('cafe-1');
  });
});
