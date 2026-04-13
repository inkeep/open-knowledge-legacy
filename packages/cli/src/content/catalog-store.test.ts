import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IndexMdCatalogStore, parentDirOf, toProjectRelative } from './catalog-store.ts';

describe('parentDirOf', () => {
  it('returns empty string for root-level files', () => {
    expect(parentDirOf('README.md')).toBe('');
  });

  it('returns the directory for nested files', () => {
    expect(parentDirOf('articles/auth/sso.md')).toBe('articles/auth');
  });

  it('returns the immediate parent for one level deep', () => {
    expect(parentDirOf('articles/index.md')).toBe('articles');
  });
});

describe('toProjectRelative', () => {
  const projectDir = '/project';

  it('returns relative path for input inside project', () => {
    expect(toProjectRelative(projectDir, 'articles/foo.md')).toBe('articles/foo.md');
  });

  it('throws for path escaping the project', () => {
    expect(() => toProjectRelative(projectDir, '../outside.md')).toThrow(/outside project root/);
  });

  it('strips absolute path back to relative when inside project', () => {
    expect(toProjectRelative(projectDir, '/project/articles/foo.md')).toBe('articles/foo.md');
  });
});

describe('IndexMdCatalogStore', () => {
  let root: string;
  let store: IndexMdCatalogStore;

  beforeAll(() => {
    root = join(tmpdir(), `catalog-store-test-${Date.now()}`);
    mkdirSync(join(root, '.open-knowledge/catalogs/articles/auth'), { recursive: true });
    mkdirSync(join(root, 'articles/auth'), { recursive: true });

    // Root catalog
    writeFileSync(
      join(root, '.open-knowledge/catalogs/INDEX.md'),
      `---
title: Test Project
description: "A test project"
generated: true
schema_version: 1
---

## Subfolders

- **[articles](.open-knowledge/catalogs/articles/INDEX.md)** (2 articles)
`,
    );

    // articles/ catalog
    writeFileSync(
      join(root, '.open-knowledge/catalogs/articles/INDEX.md'),
      `---
title: articles
description: Knowledge articles
generated: true
schema_version: 1
---

## Articles

- **[Architecture](articles/architecture.md)** — System architecture Tags: architecture, overview

## Subfolders

- **[auth](.open-knowledge/catalogs/articles/auth/INDEX.md)** (1 article) — Authentication docs
`,
    );

    // articles/auth/ catalog
    writeFileSync(
      join(root, '.open-knowledge/catalogs/articles/auth/INDEX.md'),
      `---
title: auth
description: Authentication
generated: true
schema_version: 1
---

## Articles

- **[SSO Migration](articles/auth/sso.md)** — How SSO works Tags: auth, sso
`,
    );

    // Real content file for getArticleMeta
    writeFileSync(
      join(root, 'articles/auth/sso.md'),
      `---
title: SSO Migration
description: How SSO works
tags:
  - auth
  - sso
---

# SSO Migration

Content here.
`,
    );

    // Content file without frontmatter
    writeFileSync(
      join(root, 'articles/architecture.md'),
      `# Architecture

No frontmatter in this one.
`,
    );

    store = new IndexMdCatalogStore({ projectDir: root });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('getCatalog', () => {
    it('reads the root catalog', async () => {
      const catalog = await store.getCatalog('');
      expect(catalog).not.toBeNull();
      expect(catalog?.title).toBe('Test Project');
      expect(catalog?.subfolders).toHaveLength(1);
      expect(catalog?.subfolders[0]?.name).toBe('articles');
      expect(catalog?.subfolders[0]?.articleCount).toBe(2);
    });

    it('reads a nested catalog with articles and subfolders', async () => {
      const catalog = await store.getCatalog('articles');
      expect(catalog).not.toBeNull();
      expect(catalog?.title).toBe('articles');
      expect(catalog?.articles).toHaveLength(1);
      expect(catalog?.articles[0]?.title).toBe('Architecture');
      expect(catalog?.articles[0]?.description).toBe('System architecture');
      expect(catalog?.articles[0]?.tags).toEqual(['architecture', 'overview']);
      expect(catalog?.subfolders).toHaveLength(1);
      expect(catalog?.subfolders[0]?.description).toBe('Authentication docs');
    });

    it('reads a leaf catalog with only articles', async () => {
      const catalog = await store.getCatalog('articles/auth');
      expect(catalog).not.toBeNull();
      expect(catalog?.articles).toHaveLength(1);
      expect(catalog?.articles[0]?.title).toBe('SSO Migration');
      expect(catalog?.articles[0]?.tags).toEqual(['auth', 'sso']);
      expect(catalog?.subfolders).toHaveLength(0);
    });

    it('returns null for a directory with no catalog', async () => {
      const catalog = await store.getCatalog('does/not/exist');
      expect(catalog).toBeNull();
    });
  });

  describe('getArticleMeta', () => {
    it('extracts frontmatter from a real content file', async () => {
      const meta = await store.getArticleMeta('articles/auth/sso.md');
      expect(meta).not.toBeNull();
      expect(meta?.title).toBe('SSO Migration');
      expect(meta?.description).toBe('How SSO works');
      expect(meta?.tags).toEqual(['auth', 'sso']);
    });

    it('derives title from filename when no frontmatter', async () => {
      const meta = await store.getArticleMeta('articles/architecture.md');
      expect(meta).not.toBeNull();
      expect(meta?.title).toBe('architecture');
      expect(meta?.description).toBe('');
      expect(meta?.tags).toEqual([]);
    });

    it('returns null for missing file', async () => {
      const meta = await store.getArticleMeta('does/not/exist.md');
      expect(meta).toBeNull();
    });

    it('returns null for path escaping project root', async () => {
      const meta = await store.getArticleMeta('../outside.md');
      expect(meta).toBeNull();
    });
  });
});
