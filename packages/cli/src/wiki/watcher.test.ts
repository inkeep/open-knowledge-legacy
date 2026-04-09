import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadWikiConfig } from './config.ts';
import { rebuildCatalogs } from './watcher.ts';

describe('rebuildCatalogs', () => {
  let testDir: string;
  let okDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `wiki-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    okDir = join(testDir, '.openknowledge');
    mkdirSync(join(okDir, 'articles', 'auth'), { recursive: true });
    mkdirSync(join(okDir, 'external-sources'), { recursive: true });
    mkdirSync(join(okDir, 'research'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('regenerates INDEX.md files when articles exist', () => {
    writeFileSync(
      join(okDir, 'articles', 'auth', 'sso-migration.md'),
      '---\ntitle: SSO Migration\ndescription: How we migrated to SSO\ntags:\n  - auth\n---\n\nContent.',
    );

    const config = loadWikiConfig(okDir);
    rebuildCatalogs(okDir, config);

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

  it('skips write when INDEX.md content is unchanged', () => {
    const config = loadWikiConfig(okDir);

    // First rebuild
    rebuildCatalogs(okDir, config);
    const indexPath = join(okDir, 'articles', 'INDEX.md');
    const firstContent = readFileSync(indexPath, 'utf-8');
    const firstMtime = Bun.file(indexPath).lastModified;

    // Small delay to ensure mtime would change if written
    Bun.sleepSync(50);

    // Second rebuild with no changes
    rebuildCatalogs(okDir, config);
    const secondMtime = Bun.file(indexPath).lastModified;

    // mtime should be the same since content didn't change
    expect(secondMtime).toBe(firstMtime);
    expect(readFileSync(indexPath, 'utf-8')).toBe(firstContent);
  });
});
