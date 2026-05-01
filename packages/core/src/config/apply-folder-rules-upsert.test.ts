import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFolderRulesUpsert } from './apply-folder-rules-upsert.ts';
import { isKnownConfigError } from './errors.ts';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ok-folder-upsert-'));
  mkdirSync(join(testDir, '.ok'), { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

function configPath(): string {
  return join(testDir, '.ok', 'config.yml');
}

function readConfig(): string {
  return readFileSync(configPath(), 'utf-8');
}

describe('applyFolderRulesUpsert — append', () => {
  test('appends a single rule when folders[] is empty', async () => {
    const result = await applyFolderRulesUpsert({
      cwd: testDir,
      rules: [{ match: 'specs/**', frontmatter: { description: 'Specs' } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.effective.folders).toHaveLength(1);
    expect(result.effective.folders[0].match).toBe('specs/**');
    expect(result.effective.folders[0].frontmatter.description).toBe('Specs');
  });

  test('appends multiple rules in array order', async () => {
    const result = await applyFolderRulesUpsert({
      cwd: testDir,
      rules: [
        { match: 'specs/**', frontmatter: { title: 'Specs' } },
        { match: 'docs/**', frontmatter: { title: 'Docs' } },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.effective.folders.map((r) => r.match)).toEqual(['specs/**', 'docs/**']);
  });
});

describe('applyFolderRulesUpsert — upsert (replace existing)', () => {
  test('replaces frontmatter on an existing match key', async () => {
    writeFileSync(
      configPath(),
      `folders:
  - match: 'specs/**'
    frontmatter:
      title: Old Title
`,
      'utf-8',
    );

    const result = await applyFolderRulesUpsert({
      cwd: testDir,
      rules: [{ match: 'specs/**', frontmatter: { title: 'New Title', description: 'Specs dir' } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.effective.folders).toHaveLength(1);
    expect(result.effective.folders[0].frontmatter.title).toBe('New Title');
    expect(result.effective.folders[0].frontmatter.description).toBe('Specs dir');
  });

  test('preserves array order on in-place update', async () => {
    writeFileSync(
      configPath(),
      `folders:
  - match: 'a/**'
    frontmatter:
      title: A
  - match: 'b/**'
    frontmatter:
      title: B
  - match: 'c/**'
    frontmatter:
      title: C
`,
      'utf-8',
    );

    const result = await applyFolderRulesUpsert({
      cwd: testDir,
      rules: [{ match: 'b/**', frontmatter: { title: 'B-NEW' } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.effective.folders.map((r) => r.match)).toEqual(['a/**', 'b/**', 'c/**']);
    expect(result.effective.folders[1].frontmatter.title).toBe('B-NEW');
  });
});

describe('applyFolderRulesUpsert — rename via new_match', () => {
  test('renames the match key when new_match is provided', async () => {
    writeFileSync(
      configPath(),
      `folders:
  - match: 'old/**'
    frontmatter:
      title: Old
`,
      'utf-8',
    );

    const result = await applyFolderRulesUpsert({
      cwd: testDir,
      rules: [{ match: 'old/**', new_match: 'new/**', frontmatter: { title: 'Renamed' } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.effective.folders).toHaveLength(1);
    expect(result.effective.folders[0].match).toBe('new/**');
    expect(result.effective.folders[0].frontmatter.title).toBe('Renamed');
  });

  test('rename collision: dropping the rename target preserves the source', async () => {
    writeFileSync(
      configPath(),
      `folders:
  - match: 'src/**'
    frontmatter:
      title: Source
  - match: 'dst/**'
    frontmatter:
      title: PreExisting
`,
      'utf-8',
    );

    const result = await applyFolderRulesUpsert({
      cwd: testDir,
      rules: [{ match: 'src/**', new_match: 'dst/**', frontmatter: { title: 'Renamed' } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.effective.folders).toHaveLength(1);
    expect(result.effective.folders[0].match).toBe('dst/**');
    expect(result.effective.folders[0].frontmatter.title).toBe('Renamed');
  });
});

describe('applyFolderRulesUpsert — transactional all-or-nothing', () => {
  test('invalid rule rejects the whole batch; no file written', async () => {
    // No file exists yet
    expect(existsSync(configPath())).toBe(false);

    const result = await applyFolderRulesUpsert({
      cwd: testDir,
      rules: [
        { match: 'specs/**', frontmatter: { title: 'Specs' } },
        // Empty match string violates `match: z.string().min(1)`
        { match: '', frontmatter: { title: 'Invalid' } },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    if (!isKnownConfigError(result.error)) throw new Error('expected known error');
    expect(result.error.code).toBe('SCHEMA_INVALID');
    // Critically: no file written because validation runs against the merged result
    expect(existsSync(configPath())).toBe(false);
  });

  test('invalid rule does not partially mutate existing config', async () => {
    writeFileSync(
      configPath(),
      `folders:
  - match: 'pre-existing/**'
    frontmatter:
      title: Original
`,
      'utf-8',
    );
    const before = readConfig();

    const result = await applyFolderRulesUpsert({
      cwd: testDir,
      rules: [
        { match: 'specs/**', frontmatter: { title: 'Specs' } },
        { match: '', frontmatter: { title: 'Invalid' } },
      ],
    });
    expect(result.ok).toBe(false);
    // File on disk unchanged byte-for-byte
    expect(readConfig()).toBe(before);
  });
});

describe('applyFolderRulesUpsert — scope', () => {
  test('user scope writes to homedirOverride/.ok/config.yml', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-folder-upsert-home-'));
    try {
      const result = await applyFolderRulesUpsert({
        cwd: testDir,
        scope: 'user',
        rules: [
          { match: 'global-conventions/**', frontmatter: { description: 'For all projects' } },
        ],
        homedirOverride: home,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.path).toBe(join(home, '.ok', 'config.yml'));
      // project config not written
      expect(existsSync(configPath())).toBe(false);
    } finally {
      if (existsSync(home)) rmSync(home, { recursive: true, force: true });
    }
  });
});
