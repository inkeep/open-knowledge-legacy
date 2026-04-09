import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { WikiPaths } from './paths.ts';
import { rebuildCatalogs } from './watcher.ts';

describe('rebuildCatalogs', () => {
  let testDir: string;
  let okDir: string;
  let paths: WikiPaths;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `wiki-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    okDir = join(testDir, '.open-knowledge');
    mkdirSync(join(okDir, 'articles', 'auth'), { recursive: true });
    mkdirSync(join(okDir, 'external-sources'), { recursive: true });
    mkdirSync(join(okDir, 'research'), { recursive: true });
    paths = {
      articlesDir: join(okDir, 'articles'),
      externalSourcesDir: join(okDir, 'external-sources'),
      researchDir: join(okDir, 'research'),
    };
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('regenerates INDEX.md files when articles exist', () => {
    writeFileSync(
      join(okDir, 'articles', 'auth', 'sso-migration.md'),
      '---\ntitle: SSO Migration\ndescription: How we migrated to SSO\ntags:\n  - auth\n---\n\nContent.',
    );

    rebuildCatalogs(okDir, paths);

    // auth/INDEX.md should list the article
    const authIndex = readFileSync(join(okDir, 'articles', 'auth', 'INDEX.md'), 'utf-8');
    expect(authIndex).toContain('SSO Migration');
    expect(authIndex).toContain('generated: true');

    // articles/INDEX.md should list auth subfolder
    const articlesIndex = readFileSync(join(okDir, 'articles', 'INDEX.md'), 'utf-8');
    expect(articlesIndex).toContain('auth');

    // root INDEX.md should have sections
    const rootIndex = readFileSync(join(okDir, 'INDEX.md'), 'utf-8');
    expect(rootIndex).toContain('## Sections');
    expect(rootIndex).toContain('Knowledge Articles');
  });

  it('preserves sticky title/description in subfolder INDEX.md across rebuilds', () => {
    // Create a subfolder with one article
    writeFileSync(
      join(okDir, 'articles', 'auth', 'sso-migration.md'),
      '---\ntitle: SSO Migration\ndescription: How we migrated to SSO\n---\n\nContent.',
    );

    // First rebuild produces a subfolder INDEX.md with empty sticky fields
    rebuildCatalogs(okDir, paths);
    const authIndexPath = join(okDir, 'articles', 'auth', 'INDEX.md');
    const firstAuthIndex = readFileSync(authIndexPath, 'utf-8');
    expect(firstAuthIndex).toContain('title: auth'); // default: dirname
    expect(firstAuthIndex).toContain('description: ""');

    // Author edits the subfolder INDEX.md frontmatter to set sticky fields
    const editedAuthIndex = firstAuthIndex
      .replace('title: auth', 'title: Authentication')
      .replace('description: ""', 'description: How auth works in this codebase');
    writeFileSync(authIndexPath, editedAuthIndex, 'utf-8');

    // Subsequent rebuild must preserve the sticky fields…
    rebuildCatalogs(okDir, paths);
    const secondAuthIndex = readFileSync(authIndexPath, 'utf-8');
    expect(secondAuthIndex).toContain('title: Authentication');
    expect(secondAuthIndex).toContain('description: How auth works in this codebase');
    // …while still regenerating the Articles body from disk
    expect(secondAuthIndex).toContain('SSO Migration');

    // …and the parent catalog must surface the subfolder's title + description
    const articlesIndex = readFileSync(join(okDir, 'articles', 'INDEX.md'), 'utf-8');
    expect(articlesIndex).toContain('[Authentication](auth/INDEX.md)');
    expect(articlesIndex).toContain('— How auth works in this codebase');
  });

  it('skips write when INDEX.md content is unchanged', () => {
    // First rebuild
    rebuildCatalogs(okDir, paths);
    const indexPath = join(okDir, 'articles', 'INDEX.md');
    const firstContent = readFileSync(indexPath, 'utf-8');
    const firstMtime = Bun.file(indexPath).lastModified;

    // Small delay to ensure mtime would change if written
    Bun.sleepSync(50);

    // Second rebuild with no changes
    rebuildCatalogs(okDir, paths);
    const secondMtime = Bun.file(indexPath).lastModified;

    // mtime should be the same since content didn't change
    expect(secondMtime).toBe(firstMtime);
    expect(readFileSync(indexPath, 'utf-8')).toBe(firstContent);
  });
});
