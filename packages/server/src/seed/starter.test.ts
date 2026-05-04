import { describe, expect, test } from 'bun:test';
import {
  buildStarterFolderFrontmatterYaml,
  LOG_MD_TEMPLATE,
  STARTER_FOLDER_FRONTMATTER_FILENAME,
  STARTER_FOLDERS,
  STARTER_TEMPLATES,
} from './starter.ts';

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
      expect(folder.title.length).toBeGreaterThan(0);
      expect(folder.description.length).toBeGreaterThan(20);
      expect(folder.tags.length).toBeGreaterThan(0);
      expect(STARTER_TEMPLATES[folder.starterTemplate]).toBeDefined();
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
    expect(entry?.starterTemplate).toBe('clip');
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
    expect(entry?.starterTemplate).toBe('research-log');
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
    expect(entry?.starterTemplate).toBe('article');
  });
});

describe('STARTER_TEMPLATES', () => {
  test('ships exactly the three starter templates', () => {
    expect(Object.keys(STARTER_TEMPLATES).sort()).toEqual(['article', 'clip', 'research-log']);
  });

  test('each template has a non-empty body with frontmatter + title + tags', () => {
    for (const [name, body] of Object.entries(STARTER_TEMPLATES)) {
      expect(body.length).toBeGreaterThan(50);
      expect(body.startsWith('---\n')).toBe(true);
      expect(body).toContain('title:');
      expect(body).toContain('tags:');
      expect(body.toLowerCase()).toContain(name.replace('-', ' ').slice(0, 3));
    }
  });

  test('templates use only the v1 substitution allowlist tokens ({{date}} / {{user}})', () => {
    const ALLOWED = new Set(['date', 'user']);
    for (const [name, body] of Object.entries(STARTER_TEMPLATES)) {
      const tokens = [...body.matchAll(/\{\{([^{}\n]+?)\}\}/g)].map((m) => (m[1] ?? '').trim());
      for (const token of tokens) {
        expect(
          ALLOWED.has(token),
          `Template "${name}" uses unknown token "{{${token}}}" — only {{date}} and {{user}} are allowed in v1.`,
        ).toBe(true);
      }
    }
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

describe('STARTER_FOLDER_FRONTMATTER_FILENAME', () => {
  test('is the canonical literal expected by the cascade resolver', () => {
    expect(STARTER_FOLDER_FRONTMATTER_FILENAME).toBe('frontmatter.yml');
  });
});

describe('buildStarterFolderFrontmatterYaml()', () => {
  test('emits title + description + tags for a folder', () => {
    const folder = STARTER_FOLDERS[0];
    if (!folder) throw new Error('STARTER_FOLDERS is empty');
    const yaml = buildStarterFolderFrontmatterYaml(folder);
    expect(yaml).toContain(`title: `);
    expect(yaml).toContain(`description:`);
    expect(yaml).toContain('tags:');
    for (const tag of folder.tags) {
      expect(yaml).toContain(`  - ${tag}`);
    }
    expect(yaml.endsWith('\n')).toBe(true);
  });

  test('quotes scalars containing colons (description prose)', () => {
    const yaml = buildStarterFolderFrontmatterYaml({
      path: 'x',
      title: 'X',
      description: 'A description: with a colon',
      tags: [],
      starterTemplate: 'clip',
    });
    expect(yaml).toContain('description: "A description: with a colon"');
  });
});
