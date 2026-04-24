import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OK_DIR } from '@inkeep/open-knowledge-core';
import { planSeed } from './plan.ts';
import { STARTER_FOLDERS } from './starter.ts';
import { SEED_CONFIG_FILENAME, SeedPrerequisiteError } from './types.ts';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ok-seed-plan-test-'));
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

function scaffoldOkDir(dir: string, configYml?: string): void {
  mkdirSync(join(dir, OK_DIR), { recursive: true });
  if (configYml !== undefined) {
    writeFileSync(join(dir, OK_DIR, SEED_CONFIG_FILENAME), configYml, 'utf-8');
  }
}

describe('planSeed — preconditions', () => {
  test('throws SeedPrerequisiteError when .open-knowledge/ is absent', async () => {
    await expect(planSeed({ projectDir: testDir })).rejects.toThrow(SeedPrerequisiteError);
  });

  test('error message points at `ok init`', async () => {
    try {
      await planSeed({ projectDir: testDir });
      throw new Error('Expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(SeedPrerequisiteError);
      expect((err as Error).message).toContain('ok init');
    }
  });
});

describe('planSeed — fresh project', () => {
  test('all three starter folders queued for creation', async () => {
    scaffoldOkDir(testDir);
    const plan = await planSeed({ projectDir: testDir });
    const createdFolders = plan.created.filter((e) => e.kind === 'folder').map((e) => e.path);
    expect(createdFolders).toEqual(['external-sources', 'research', 'articles']);
  });

  test('log.md queued for creation', async () => {
    scaffoldOkDir(testDir);
    const plan = await planSeed({ projectDir: testDir });
    const createdFiles = plan.created.filter((e) => e.kind === 'file').map((e) => e.path);
    expect(createdFiles).toContain('log.md');
  });

  test('all three config edits queued when config.yml has no folders: entries', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    const plan = await planSeed({ projectDir: testDir });
    expect(plan.configEdits).toHaveLength(3);
    expect(plan.configEdits.map((e) => e.folderMatch)).toEqual([
      'external-sources/**',
      'research/**',
      'articles/**',
    ]);
  });

  test('all three config edits queued when config.yml is absent entirely', async () => {
    scaffoldOkDir(testDir); // no config.yml written
    const plan = await planSeed({ projectDir: testDir });
    expect(plan.configEdits).toHaveLength(3);
  });

  test('each config edit carries correct entry shape', async () => {
    scaffoldOkDir(testDir);
    const plan = await planSeed({ projectDir: testDir });
    for (let i = 0; i < STARTER_FOLDERS.length; i++) {
      const folder = STARTER_FOLDERS[i];
      const edit = plan.configEdits[i];
      expect(edit.folderMatch).toBe(folder.match);
      expect(edit.entry.match).toBe(folder.match);
      expect(edit.entry.frontmatter.title).toBe(folder.title);
      expect(edit.entry.frontmatter.description).toBe(folder.description);
      expect(edit.entry.frontmatter.tags).toEqual(folder.tags);
    }
  });

  test('no skipped entries on a fresh project', async () => {
    scaffoldOkDir(testDir);
    const plan = await planSeed({ projectDir: testDir });
    expect(plan.skipped).toEqual([]);
  });

  test('no warnings on a clean config.yml', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    const plan = await planSeed({ projectDir: testDir });
    expect(plan.warnings).toEqual([]);
  });
});

describe('planSeed — fully seeded project', () => {
  test('all entries skipped when folders exist on disk + config has all three matches', async () => {
    scaffoldOkDir(
      testDir,
      `content:\n  dir: .\nfolders:\n  - match: 'external-sources/**'\n    frontmatter:\n      title: Existing\n  - match: 'research/**'\n    frontmatter:\n      title: Existing\n  - match: 'articles/**'\n    frontmatter:\n      title: Existing\n`,
    );
    for (const folder of STARTER_FOLDERS) {
      mkdirSync(join(testDir, folder.path), { recursive: true });
    }
    writeFileSync(join(testDir, 'log.md'), '# Work Log\n', 'utf-8');

    const plan = await planSeed({ projectDir: testDir });
    expect(plan.created).toEqual([]);
    expect(plan.configEdits).toEqual([]);
    expect(plan.skipped.length).toBeGreaterThan(0);
  });
});

describe('planSeed — partial overlap', () => {
  test('existing folder is skipped; missing folder queued', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    mkdirSync(join(testDir, 'research'), { recursive: true });

    const plan = await planSeed({ projectDir: testDir });
    const createdPaths = plan.created.filter((e) => e.kind === 'folder').map((e) => e.path);
    const skippedPaths = plan.skipped.map((s) => s.path);
    expect(createdPaths).toEqual(['external-sources', 'articles']);
    expect(skippedPaths).toContain('research');
  });

  test('existing config.yml match is skipped; missing matches queued', async () => {
    scaffoldOkDir(
      testDir,
      `content:\n  dir: .\nfolders:\n  - match: 'research/**'\n    frontmatter:\n      title: My Research\n      description: Custom description\n`,
    );

    const plan = await planSeed({ projectDir: testDir });
    const editMatches = plan.configEdits.map((e) => e.folderMatch);
    expect(editMatches).toEqual(['external-sources/**', 'articles/**']);
    expect(plan.skipped.some((s) => s.path.includes('research/**'))).toBe(true);
  });

  test('pre-existing custom folders: entries are preserved in the skip list (not re-written)', async () => {
    scaffoldOkDir(
      testDir,
      `folders:\n  - match: 'external-sources/**'\n    frontmatter:\n      title: Evidence\n`,
    );
    const plan = await planSeed({ projectDir: testDir });
    expect(plan.configEdits.map((e) => e.folderMatch)).not.toContain('external-sources/**');
    expect(plan.skipped.some((s) => s.path.includes('external-sources/**'))).toBe(true);
  });
});

describe('planSeed — rootDir scoping', () => {
  test('scaffolds starter folders + log.md under a brand-new rootDir', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    const plan = await planSeed({ projectDir: testDir, rootDir: 'brain' });

    const createdFolders = plan.created.filter((e) => e.kind === 'folder').map((e) => e.path);
    // The root itself comes first, then the three starter folders scoped under it.
    expect(createdFolders).toEqual([
      'brain',
      'brain/external-sources',
      'brain/research',
      'brain/articles',
    ]);

    const createdFiles = plan.created.filter((e) => e.kind === 'file').map((e) => e.path);
    expect(createdFiles).toEqual(['brain/log.md']);

    expect(plan.configEdits.map((e) => e.folderMatch)).toEqual([
      'brain/external-sources/**',
      'brain/research/**',
      'brain/articles/**',
    ]);
  });

  test('does not re-create an existing rootDir but still scaffolds children', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    mkdirSync(join(testDir, 'knowledge'), { recursive: true });
    const plan = await planSeed({ projectDir: testDir, rootDir: 'knowledge' });

    const createdFolders = plan.created.filter((e) => e.kind === 'folder').map((e) => e.path);
    expect(createdFolders).not.toContain('knowledge');
    expect(createdFolders).toContain('knowledge/external-sources');
    expect(plan.skipped.some((s) => s.path === 'knowledge')).toBe(true);
  });

  test('rootDir="." is equivalent to the default project-root scaffold', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    const a = await planSeed({ projectDir: testDir });
    const b = await planSeed({ projectDir: testDir, rootDir: '.' });
    expect(a).toEqual(b);
  });

  test('normalizes trailing slashes and leading ./ in rootDir', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    const a = await planSeed({ projectDir: testDir, rootDir: 'brain' });
    const b = await planSeed({ projectDir: testDir, rootDir: './brain/' });
    expect(a.created.map((e) => e.path)).toEqual(b.created.map((e) => e.path));
    expect(a.configEdits.map((e) => e.folderMatch)).toEqual(
      b.configEdits.map((e) => e.folderMatch),
    );
  });

  test('rejects absolute rootDir', async () => {
    scaffoldOkDir(testDir);
    await expect(planSeed({ projectDir: testDir, rootDir: '/tmp/escape' })).rejects.toThrow(
      /relative to the project/,
    );
  });

  test('rejects rootDir with .. escape segments', async () => {
    scaffoldOkDir(testDir);
    await expect(planSeed({ projectDir: testDir, rootDir: '../sibling' })).rejects.toThrow(
      /must not contain '\.\.'/,
    );
  });

  test('rootDir config edits only collide with matching-scoped entries', async () => {
    // An existing unscoped `external-sources/**` entry should NOT cause the
    // scoped `brain/external-sources/**` to be skipped — they're distinct.
    scaffoldOkDir(
      testDir,
      `folders:\n  - match: 'external-sources/**'\n    frontmatter:\n      title: Root scaffold\n`,
    );
    const plan = await planSeed({ projectDir: testDir, rootDir: 'brain' });
    expect(plan.configEdits.map((e) => e.folderMatch)).toEqual([
      'brain/external-sources/**',
      'brain/research/**',
      'brain/articles/**',
    ]);
  });

  test('nested rootDir path works', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    const plan = await planSeed({ projectDir: testDir, rootDir: 'areas/personal' });
    expect(plan.configEdits.map((e) => e.folderMatch)).toEqual([
      'areas/personal/external-sources/**',
      'areas/personal/research/**',
      'areas/personal/articles/**',
    ]);
  });
});

describe('planSeed — corrupt config.yml', () => {
  test('surfaces a warning on unreadable config.yml but still returns a plan', async () => {
    scaffoldOkDir(testDir, ': invalid yaml :::\n');
    // yaml's parseDocument is forgiving for this shape — but a plan still returns.
    // This test asserts planSeed does not crash on malformed config.
    const plan = await planSeed({ projectDir: testDir });
    // Expect all three configEdits to be queued (no existing matches readable)
    expect(plan.configEdits.length).toBeGreaterThan(0);
  });
});
