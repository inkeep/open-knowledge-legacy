import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { contentHash, generateCatalog, generateRootCatalog } from './catalog.ts';

describe('generateCatalog', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `content-catalog-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns valid INDEX.md for empty directory', () => {
    const result = generateCatalog(testDir, { title: 'Empty' });

    expect(result).toContain('generated: true');
    expect(result).toContain('schema_version: 1');
    expect(result).toContain('title: Empty');
    expect(result).not.toContain('## Articles');
    expect(result).not.toContain('## Subfolders');
  });

  it('lists a single article with frontmatter', () => {
    writeFileSync(
      join(testDir, 'deploy.md'),
      '---\ntitle: Deploy Process\ndescription: How we deploy\ntags:\n  - infra\n  - ci\n---\n\nContent here.',
    );

    const result = generateCatalog(testDir, { title: 'Infrastructure' });

    expect(result).toContain('## Articles');
    expect(result).toContain('**[Deploy Process](deploy.md)** — How we deploy Tags: infra, ci');
  });

  it('lists multiple articles sorted by title', () => {
    writeFileSync(
      join(testDir, 'zebra.md'),
      '---\ntitle: Zebra\ndescription: Last alphabetically\n---\n\nZ',
    );
    writeFileSync(
      join(testDir, 'alpha.md'),
      '---\ntitle: Alpha\ndescription: First alphabetically\n---\n\nA',
    );

    const result = generateCatalog(testDir);
    const alphaIdx = result.indexOf('Alpha');
    const zebraIdx = result.indexOf('Zebra');

    expect(alphaIdx).toBeLessThan(zebraIdx);
  });

  it('handles files with missing frontmatter gracefully', () => {
    writeFileSync(join(testDir, 'no-frontmatter.md'), '# Just a heading\n\nSome content.');

    const result = generateCatalog(testDir);

    expect(result).toContain('## Articles');
    expect(result).toContain('**[no-frontmatter](no-frontmatter.md)**');
  });

  it('lists nested subfolders with article counts', () => {
    const subDir = join(testDir, 'monitoring');
    mkdirSync(subDir);
    writeFileSync(join(subDir, 'alerts.md'), '---\ntitle: Alerts\n---\n\nContent.');
    writeFileSync(join(subDir, 'dashboards.md'), '---\ntitle: Dashboards\n---\n\nContent.');

    const result = generateCatalog(testDir);

    expect(result).toContain('## Subfolders');
    expect(result).toContain('**[monitoring](monitoring/INDEX.md)** (2 articles)');
  });

  it('excludes INDEX.md from article listings', () => {
    writeFileSync(join(testDir, 'INDEX.md'), '---\ntitle: Existing\n---\n\nOld catalog.');
    writeFileSync(join(testDir, 'real-article.md'), '---\ntitle: Real Article\n---\n\nContent.');

    const result = generateCatalog(testDir);

    expect(result).toContain('Real Article');
    expect(result).not.toContain('Existing');
  });
});

describe('generateRootCatalog', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `content-root-catalog-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'articles'));
    mkdirSync(join(testDir, 'external-sources'));
    mkdirSync(join(testDir, 'research'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('generates root INDEX.md with sections', () => {
    writeFileSync(join(testDir, 'articles', 'intro.md'), '---\ntitle: Intro\n---\n\nHello.');

    const result = generateRootCatalog(testDir, {
      sections: [
        { label: 'Knowledge Articles', relativePath: 'articles/INDEX.md' },
        { label: 'External Sources', relativePath: 'external-sources/INDEX.md' },
        { label: 'Research', relativePath: 'research/INDEX.md' },
      ],
    });

    expect(result).toContain('## Sections');
    expect(result).toContain('**[Knowledge Articles](articles/INDEX.md)** (1 article)');
    expect(result).toContain('**[External Sources](external-sources/INDEX.md)** (0 articles)');
    expect(result).toContain('**[Research](research/INDEX.md)** (0 articles)');
    expect(result).toContain('generated: true');
    expect(result).toContain('schema_version: 1');
  });
});

describe('contentHash', () => {
  it('returns consistent hash for same content', () => {
    const h1 = contentHash('hello world');
    const h2 = contentHash('hello world');
    expect(h1).toBe(h2);
  });

  it('returns different hash for different content', () => {
    const h1 = contentHash('hello');
    const h2 = contentHash('world');
    expect(h1).not.toBe(h2);
  });
});
