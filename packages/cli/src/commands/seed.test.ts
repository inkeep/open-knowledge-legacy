import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { STARTER_FOLDERS } from '@inkeep/open-knowledge-server';
import { CONFIG_FILENAME, OK_DIR } from '../constants.ts';
import { runSeed } from './seed.ts';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ok-seed-cmd-test-'));
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

function scaffoldOkDir(dir: string, configYml = 'content:\n  dir: .\n'): void {
  mkdirSync(join(dir, OK_DIR), { recursive: true });
  writeFileSync(join(dir, OK_DIR, CONFIG_FILENAME), configYml, 'utf-8');
}

function yes(): NodeJS.ReadableStream {
  return Readable.from(['y\n']);
}

function no(): NodeJS.ReadableStream {
  return Readable.from(['n\n']);
}

describe('runSeed — happy path', () => {
  test('applies plan with --yes flag', async () => {
    scaffoldOkDir(testDir);
    const result = await runSeed({ cwd: testDir, yes: true });

    expect(result.status).toBe('applied');
    expect(result.exitCode).toBe(0);
    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(testDir, folder.path))).toBe(true);
    }
    expect(existsSync(join(testDir, 'log.md'))).toBe(true);
    expect(readFileSync(join(testDir, OK_DIR, CONFIG_FILENAME), 'utf-8')).toContain(
      'external-sources/**',
    );
  });

  test('applies plan when user confirms Y via stream', async () => {
    scaffoldOkDir(testDir);
    const result = await runSeed({ cwd: testDir, confirmStream: yes() });
    expect(result.status).toBe('applied');
    expect(result.exitCode).toBe(0);
  });

  test('cancels when user responds n', async () => {
    scaffoldOkDir(testDir);
    const result = await runSeed({ cwd: testDir, confirmStream: no() });
    expect(result.status).toBe('cancelled');
    expect(result.exitCode).toBe(0);
    // No changes applied
    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(testDir, folder.path))).toBe(false);
    }
  });
});

describe('runSeed — --dry-run', () => {
  test('prints plan but does not write', async () => {
    scaffoldOkDir(testDir);
    const result = await runSeed({ cwd: testDir, dryRun: true });
    expect(result.status).toBe('dry-run');
    expect(result.exitCode).toBe(0);
    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(testDir, folder.path))).toBe(false);
    }
    expect(existsSync(join(testDir, 'log.md'))).toBe(false);
  });
});

describe('runSeed — no-op', () => {
  test('reports already-seeded on re-run', async () => {
    scaffoldOkDir(testDir);
    await runSeed({ cwd: testDir, yes: true });

    const second = await runSeed({ cwd: testDir, yes: true });
    expect(second.status).toBe('no-op');
    expect(second.exitCode).toBe(0);
    expect(second.message).toContain('already seeded');
  });
});

describe('runSeed — prerequisite', () => {
  test('exits 1 when .ok/ is absent', async () => {
    const result = await runSeed({ cwd: testDir });
    expect(result.status).toBe('prerequisite-missing');
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('ok init');
  });
});

describe('runSeed — --root', () => {
  test('scaffolds the starter pack inside a new subfolder', async () => {
    scaffoldOkDir(testDir);
    const result = await runSeed({ cwd: testDir, root: 'brain', yes: true });
    expect(result.status).toBe('applied');
    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(testDir, 'brain', folder.path))).toBe(true);
      expect(existsSync(join(testDir, folder.path))).toBe(false);
    }
    expect(existsSync(join(testDir, 'brain', 'log.md'))).toBe(true);
    const config = readFileSync(join(testDir, OK_DIR, CONFIG_FILENAME), 'utf-8');
    expect(config).toContain('brain/external-sources/**');
    expect(config).toContain('brain/research/**');
    expect(config).toContain('brain/articles/**');
  });

  test('reuses an existing subfolder without error', async () => {
    scaffoldOkDir(testDir);
    mkdirSync(join(testDir, 'knowledge'), { recursive: true });
    writeFileSync(join(testDir, 'knowledge', '.keep'), '', 'utf-8');
    const result = await runSeed({ cwd: testDir, root: 'knowledge', yes: true });
    expect(result.status).toBe('applied');
    // Pre-existing user file is untouched.
    expect(existsSync(join(testDir, 'knowledge', '.keep'))).toBe(true);
    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(testDir, 'knowledge', folder.path))).toBe(true);
    }
  });

  test('root "." matches default project-root behavior', async () => {
    scaffoldOkDir(testDir);
    const result = await runSeed({ cwd: testDir, root: '.', yes: true });
    expect(result.status).toBe('applied');
    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(testDir, folder.path))).toBe(true);
    }
  });

  test('re-running with the same root is a no-op', async () => {
    scaffoldOkDir(testDir);
    await runSeed({ cwd: testDir, root: 'brain', yes: true });
    const second = await runSeed({ cwd: testDir, root: 'brain', yes: true });
    expect(second.status).toBe('no-op');
  });

  test('two distinct roots coexist', async () => {
    scaffoldOkDir(testDir);
    await runSeed({ cwd: testDir, root: 'work', yes: true });
    const second = await runSeed({ cwd: testDir, root: 'personal', yes: true });
    expect(second.status).toBe('applied');
    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(testDir, 'work', folder.path))).toBe(true);
      expect(existsSync(join(testDir, 'personal', folder.path))).toBe(true);
    }
    const config = readFileSync(join(testDir, OK_DIR, CONFIG_FILENAME), 'utf-8');
    expect(config).toContain('work/external-sources/**');
    expect(config).toContain('personal/external-sources/**');
  });

  test('rejects absolute root paths with a failed status', async () => {
    scaffoldOkDir(testDir);
    const result = await runSeed({ cwd: testDir, root: '/tmp/escape', yes: true });
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
  });
});

describe('runSeed — path argument', () => {
  test('operates on explicit path rather than cwd', async () => {
    scaffoldOkDir(testDir);
    const previousCwd = process.cwd();
    // Move process cwd somewhere else to ensure explicit cwd wins
    const otherDir = mkdtempSync(join(tmpdir(), 'other-'));
    try {
      process.chdir(otherDir);
      const result = await runSeed({ cwd: testDir, yes: true });
      expect(result.status).toBe('applied');
      for (const folder of STARTER_FOLDERS) {
        expect(existsSync(join(testDir, folder.path))).toBe(true);
      }
    } finally {
      process.chdir(previousCwd);
      rmSync(otherDir, { recursive: true, force: true });
    }
  });
});
