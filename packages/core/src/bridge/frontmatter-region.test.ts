import { describe, expect, test } from 'bun:test';
import { applyPatchToFm, parseFmRegion } from './frontmatter-region.ts';

describe('parseFmRegion — mixed-scalar array coercion', () => {
  test('flow array with integer element coerces to string and surfaces no parseError', () => {
    const yaml = 'tags: [travel, spain, 2026]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', 'spain', '2026']);
  });

  test('flow array with boolean element coerces to string and surfaces no parseError', () => {
    const yaml = 'tags: [travel, true, spain]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', 'true', 'spain']);
  });

  test('flow array with float element coerces to string and surfaces no parseError', () => {
    const yaml = 'tags: [travel, 2.5, spain]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', '2.5', 'spain']);
  });

  test('block array with integer element coerces to string and surfaces no parseError', () => {
    const yaml = 'tags:\n  - travel\n  - spain\n  - 2026\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', 'spain', '2026']);
  });

  test('flow array of all-string elements still parses cleanly (control)', () => {
    const yaml = 'tags: [travel, spain, "2026"]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', 'spain', '2026']);
  });

  test('null array element is rejected (out of scope per FrontmatterValueSchema)', () => {
    const yaml = 'tags: [travel, ~, spain]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeDefined();
    expect(result.map).toBeNull();
  });

  test("user's reported fixture (8-element flow array with unquoted year) coerces and parses", () => {
    const yaml = 'tags: [travel, spain, barcelona, mallorca, palma, balearics, sailing, 2026]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual([
      'travel',
      'spain',
      'barcelona',
      'mallorca',
      'palma',
      'balearics',
      'sailing',
      '2026',
    ]);
  });
});

describe('applyPatchToFm — array style preservation', () => {
  test('flow-style input preserves flow style when patch replaces the array', () => {
    const fenced = '---\ntags: [travel, spain, 2026]\n---\n';
    const result = applyPatchToFm(fenced, { tags: ['travel', 'spain', '2026', 'paris'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('tags: [');
  });

  test('block-style input preserves block style when patch replaces the array', () => {
    const fenced = '---\ntags:\n  - travel\n  - spain\n  - "2026"\n---\n';
    const result = applyPatchToFm(fenced, { tags: ['travel', 'spain', '2026', 'paris'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toMatch(/tags:\s*\n\s*-\s/);
  });
});
