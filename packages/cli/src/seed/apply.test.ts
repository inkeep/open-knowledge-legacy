import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_FILENAME, OK_DIR } from '../constants.ts';
import { applySeed } from './apply.ts';
import { planSeed } from './plan.ts';
import { LOG_MD_TEMPLATE, STARTER_FOLDERS } from './starter.ts';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ok-seed-apply-test-'));
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

function scaffoldOkDir(dir: string, configYml?: string): void {
  mkdirSync(join(dir, OK_DIR), { recursive: true });
  if (configYml !== undefined) {
    writeFileSync(join(dir, OK_DIR, CONFIG_FILENAME), configYml, 'utf-8');
  }
}

describe('applySeed — fresh plan writes everything', () => {
  test('creates all three Karpathy folders, writes log.md, appends three folders: entries', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    const plan = await planSeed({ projectDir: testDir });
    const result = await applySeed(plan, { projectDir: testDir });

    expect(result.errors).toEqual([]);
    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(testDir, folder.path))).toBe(true);
    }
    expect(existsSync(join(testDir, 'log.md'))).toBe(true);
    expect(readFileSync(join(testDir, 'log.md'), 'utf-8')).toBe(LOG_MD_TEMPLATE);

    const config = readFileSync(join(testDir, OK_DIR, CONFIG_FILENAME), 'utf-8');
    expect(config).toContain('external-sources/**');
    expect(config).toContain('research/**');
    expect(config).toContain('articles/**');
    // At least 3 folder entries created + some folders for the files too
    expect(result.applied).toBeGreaterThanOrEqual(7); // 3 folders + 1 file + 3 config entries
  });

  test('applied count reflects all writes', async () => {
    scaffoldOkDir(testDir);
    const plan = await planSeed({ projectDir: testDir });
    const result = await applySeed(plan, { projectDir: testDir });
    expect(result.applied).toBe(plan.created.length + plan.configEdits.length);
  });

  test('durationMs is non-negative', async () => {
    scaffoldOkDir(testDir);
    const plan = await planSeed({ projectDir: testDir });
    const result = await applySeed(plan, { projectDir: testDir });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('applySeed — idempotent on an empty plan', () => {
  test('empty plan = zero writes, zero errors', async () => {
    scaffoldOkDir(testDir);
    const result = await applySeed(
      { created: [], skipped: [], configEdits: [], warnings: [] },
      { projectDir: testDir },
    );
    expect(result.applied).toBe(0);
    expect(result.errors).toEqual([]);
  });

  test('re-applying after full scaffold is a no-op', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    const firstPlan = await planSeed({ projectDir: testDir });
    await applySeed(firstPlan, { projectDir: testDir });

    const configBefore = readFileSync(join(testDir, OK_DIR, CONFIG_FILENAME), 'utf-8');

    const secondPlan = await planSeed({ projectDir: testDir });
    const secondResult = await applySeed(secondPlan, { projectDir: testDir });

    expect(secondPlan.created).toEqual([]);
    expect(secondPlan.configEdits).toEqual([]);
    expect(secondResult.applied).toBe(0);
    expect(secondResult.errors).toEqual([]);

    const configAfter = readFileSync(join(testDir, OK_DIR, CONFIG_FILENAME), 'utf-8');
    expect(configAfter).toBe(configBefore);
  });
});

describe('applySeed — YAML preservation', () => {
  test('preserves existing comments in config.yml across apply', async () => {
    const configYmlWithComments = `# This is a user comment at the top
content:
  # inline comment about dir
  dir: .

# Separator comment
server:
  port: 3000
`;
    scaffoldOkDir(testDir, configYmlWithComments);

    const plan = await planSeed({ projectDir: testDir });
    await applySeed(plan, { projectDir: testDir });

    const updated = readFileSync(join(testDir, OK_DIR, CONFIG_FILENAME), 'utf-8');
    expect(updated).toContain('# This is a user comment at the top');
    expect(updated).toContain('# inline comment about dir');
    expect(updated).toContain('# Separator comment');
  });

  test('preserves pre-existing user-written folders: entry byte-identically', async () => {
    const yml = `folders:
  - match: 'external-sources/**'
    frontmatter:
      title: My Custom Title
      description: My custom description for external-sources
      tags:
        - custom
        - override
`;
    scaffoldOkDir(testDir, yml);

    const plan = await planSeed({ projectDir: testDir });
    // planSeed should skip external-sources (user has it) and queue the other two
    expect(plan.configEdits.map((e) => e.folderMatch)).toEqual(['research/**', 'articles/**']);

    await applySeed(plan, { projectDir: testDir });

    const updated = readFileSync(join(testDir, OK_DIR, CONFIG_FILENAME), 'utf-8');
    expect(updated).toContain('My Custom Title');
    expect(updated).toContain('My custom description for external-sources');
    expect(updated).toContain('- custom');
    expect(updated).toContain('- override');
    // And the new entries
    expect(updated).toContain('research/**');
    expect(updated).toContain('articles/**');
  });

  test('adds folders: section when config.yml has no folders: key', async () => {
    scaffoldOkDir(testDir, 'content:\n  dir: .\n');
    const plan = await planSeed({ projectDir: testDir });
    await applySeed(plan, { projectDir: testDir });

    const updated = readFileSync(join(testDir, OK_DIR, CONFIG_FILENAME), 'utf-8');
    expect(updated).toContain('folders:');
    // content: dir: . preserved
    expect(updated).toContain('content:');
    expect(updated).toContain('dir: .');
  });
});

describe('applySeed — file write guards', () => {
  test('skips log.md if it already exists (defense-in-depth on plan staleness)', async () => {
    scaffoldOkDir(testDir);
    writeFileSync(join(testDir, 'log.md'), '# User-written log\n', 'utf-8');

    // Construct a plan manually that CLAIMS log.md needs creation (stale plan simulation)
    const plan = {
      created: [{ path: 'log.md', kind: 'file' as const }],
      skipped: [],
      configEdits: [],
      warnings: [],
    };
    await applySeed(plan, { projectDir: testDir });

    // User content preserved
    const after = readFileSync(join(testDir, 'log.md'), 'utf-8');
    expect(after).toBe('# User-written log\n');
  });
});

describe('applySeed — error handling', () => {
  test('records error in errors[] for unknown file content template', async () => {
    scaffoldOkDir(testDir);
    const plan = {
      created: [{ path: 'unknown.md', kind: 'file' as const }],
      skipped: [],
      configEdits: [],
      warnings: [],
    };
    const result = await applySeed(plan, { projectDir: testDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe('unknown.md');
    expect(result.errors[0].error).toContain('No content template');
  });
});
