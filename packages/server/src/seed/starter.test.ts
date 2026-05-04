import { describe, expect, test } from 'bun:test';
import { LOG_MD_TEMPLATE, STARTER_FOLDERS, starterFolderRule } from './starter.ts';

describe('STARTER_FOLDERS — Karpathy three-layer starter pack', () => {
  test('ships exactly three starter folders in Karpathy-layer order', () => {
    expect(STARTER_FOLDERS).toHaveLength(3);
    expect(STARTER_FOLDERS.map((f) => f.path)).toEqual([
      'external-sources',
      'research',
      'articles',
    ]);
  });

  test('each entry has all required fields and non-empty values', () => {
    for (const folder of STARTER_FOLDERS) {
      expect(folder.path).toMatch(/^[a-z][a-z-]*$/);
      expect(folder.match).toBe(`${folder.path}/**`);
      expect(folder.title.length).toBeGreaterThan(0);
      expect(folder.description.length).toBeGreaterThan(20);
      expect(folder.tags.length).toBeGreaterThan(0);
    }
  });

  test('external-sources description references save-verbatim + ingest + immutability + traceability', () => {
    const entry = STARTER_FOLDERS.find((f) => f.path === 'external-sources');
    expect(entry).toBeDefined();
    expect(entry?.description).toContain('SAVED verbatim');
    expect(entry?.description).toContain('Immutable');
    expect(entry?.description).toContain('ingest');
    expect(entry?.description.toLowerCase()).toMatch(/cite|traceab/);
    expect(entry?.tags).toEqual(['source', 'immutable', 'layer-ingest']);
  });

  test('research description references research tool + provisional status + sources + grounding rule', () => {
    const entry = STARTER_FOLDERS.find((f) => f.path === 'research');
    expect(entry).toBeDefined();
    expect(entry?.description).toContain('Provisional analysis');
    expect(entry?.description).toContain('research');
    expect(entry?.description).toContain('status: provisional');
    expect(entry?.description).toContain('sources:');
    expect(entry?.description).toContain('consolidate');
    expect(entry?.description.toLowerCase()).toMatch(/cite|sourced/);
    expect(entry?.tags).toEqual(['research', 'provisional', 'layer-research']);
  });

  test('articles description references consolidate + canonical status + supersedes chain + traceable evidence', () => {
    const entry = STARTER_FOLDERS.find((f) => f.path === 'articles');
    expect(entry).toBeDefined();
    expect(entry?.description).toContain('Canonical knowledge');
    expect(entry?.description).toContain('consolidate');
    expect(entry?.description).toContain('status: canonical');
    expect(entry?.description).toContain('supersedes:');
    expect(entry?.description).toContain('external-sources');
    expect(entry?.tags).toEqual(['article', 'canonical', 'layer-consolidate']);
  });

  test('all entries are shape-valid FolderRule objects', () => {
    for (const folder of STARTER_FOLDERS) {
      const rule = starterFolderRule(folder);
      expect(typeof rule.match).toBe('string');
      expect(rule.match.length).toBeGreaterThan(0);
      expect(typeof rule.frontmatter).toBe('object');
      expect(rule.frontmatter).not.toBeNull();
      expect(typeof rule.frontmatter.title).toBe('string');
      expect(typeof rule.frontmatter.description).toBe('string');
      expect(Array.isArray(rule.frontmatter.tags)).toBe(true);
    }
  });

  test('STARTER_FOLDERS is a readonly constant (cannot be mutated)', () => {
    expect(Object.isFrozen(STARTER_FOLDERS)).toBe(false); // spec-style const, not Object.freeze'd
  });
});

describe('LOG_MD_TEMPLATE', () => {
  test('has frontmatter with title and description', () => {
    expect(LOG_MD_TEMPLATE).toContain('---');
    expect(LOG_MD_TEMPLATE).toContain('title: Work Log');
    expect(LOG_MD_TEMPLATE).toContain('description:');
  });

  test('has H1 heading', () => {
    expect(LOG_MD_TEMPLATE).toContain('# Work Log');
  });

  test('includes example entry shape as HTML comment (not active content)', () => {
    expect(LOG_MD_TEMPLATE).toContain('<!-- Example entry shape:');
    expect(LOG_MD_TEMPLATE).toContain('-->');
  });
});

describe('starterFolderRule()', () => {
  test('converts a StarterFolder to a FolderRule with correct shape', () => {
    const folder = STARTER_FOLDERS[0];
    const rule = starterFolderRule(folder);
    expect(rule).toEqual({
      match: folder.match,
      frontmatter: {
        title: folder.title,
        description: folder.description,
        tags: folder.tags,
      },
    });
  });

  test('output is structurally a FolderRule (match + frontmatter keys only)', () => {
    const rule = starterFolderRule(STARTER_FOLDERS[0]);
    expect(Object.keys(rule).sort()).toEqual(['frontmatter', 'match']);
    expect(Object.keys(rule.frontmatter).sort()).toEqual(['description', 'tags', 'title']);
  });
});
