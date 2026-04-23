import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { CONFIG_FILENAME, OK_DIR } from '../constants.ts';
import { STARTER_FOLDERS } from '../seed/starter.ts';
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
  test('exits 1 when .open-knowledge/ is absent', async () => {
    const result = await runSeed({ cwd: testDir });
    expect(result.status).toBe('prerequisite-missing');
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('ok init');
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
