/**
 * Unit tests for installUserSkill (SPEC 2026-04-22 §6 FR6 / FR7 / FR9).
 *
 * Subprocess invocation is mocked via the injectable `spawn` option (SPEC FR6).
 * Each test uses a fresh `mkdtempSync`-backed HOME so the sidecar write path
 * touches only the tmpdir — never the real `~/` (SPEC D15).
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import {
  type InstallUserSkillOptions,
  installUserSkill,
  type SkillInstallLogger,
  type SpawnLike,
} from './skill-install.ts';

async function readServerVersion(): Promise<string> {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf-8');
  return (JSON.parse(raw) as { version: string }).version;
}

/**
 * Build a fake ChildProcess that scripts one emit() lifecycle — enough to
 * exercise `installUserSkill`'s listener contract without spawning a real
 * subprocess.
 */
interface FakeChildScript {
  /** Bytes to push to the stderr stream before exit. */
  stderr?: string;
  /** How the process terminates. */
  outcome: { kind: 'exit'; code: number } | { kind: 'error'; error: Error } | { kind: 'hang' };
}

function makeFakeChild(script: FakeChildScript): ReturnType<SpawnLike> {
  const child = new EventEmitter() as unknown as ReturnType<SpawnLike>;
  const stderr = new PassThrough();
  Object.assign(child, {
    stderr,
    stdout: new PassThrough(),
    stdin: null,
    kill: (_sig?: NodeJS.Signals | number) => {
      // Mirror real ChildProcess: kill triggers an exit/error event unless we've already settled.
      return true;
    },
  });

  queueMicrotask(() => {
    if (script.stderr) stderr.emit('data', Buffer.from(script.stderr, 'utf-8'));
    if (script.outcome.kind === 'exit') {
      (child as unknown as EventEmitter).emit('exit', script.outcome.code, null);
    } else if (script.outcome.kind === 'error') {
      (child as unknown as EventEmitter).emit('error', script.outcome.error);
    }
    // 'hang' — emit nothing. installUserSkill should hit its timeout.
  });

  return child;
}

interface CapturedSpawn {
  command: string;
  args: readonly string[];
  opts: SpawnOptions;
}

function makeSpawnFake(script: FakeChildScript): {
  spawn: SpawnLike;
  calls: CapturedSpawn[];
} {
  const calls: CapturedSpawn[] = [];
  const spawn: SpawnLike = (command, args, opts) => {
    calls.push({ command, args, opts });
    return makeFakeChild(script);
  };
  return { spawn, calls };
}

function makeThrowingSpawn(err: Error): { spawn: SpawnLike; calls: CapturedSpawn[] } {
  const calls: CapturedSpawn[] = [];
  const spawn: SpawnLike = (command, args, opts) => {
    calls.push({ command, args, opts });
    throw err;
  };
  return { spawn, calls };
}

interface RecordedLog {
  level: 'warn' | 'info';
  data: unknown;
  message: string;
}

function makeRecordingLogger(): { logger: SkillInstallLogger; records: RecordedLog[] } {
  const records: RecordedLog[] = [];
  const logger: SkillInstallLogger = {
    warn: (data, message) => records.push({ level: 'warn', data, message }),
    info: (data, message) => records.push({ level: 'info', data, message }),
  };
  return { logger, records };
}

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), 'ok-skill-install-'));
}

const SIDECAR_REL = ['.open-knowledge', 'skill-installed-version'] as const;
function sidecarPathFor(home: string): string {
  return join(home, ...SIDECAR_REL);
}

function writeSidecar(home: string, content: string): void {
  const dir = join(home, '.open-knowledge');
  mkdirSync(dir, { recursive: true });
  writeFileSync(sidecarPathFor(home), content, 'utf-8');
}

function readSidecarIfExists(home: string): string | null {
  try {
    return readFileSync(sidecarPathFor(home), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

let currentVersion: string;

beforeEach(async () => {
  currentVersion = await readServerVersion();
});

describe('installUserSkill — fresh install', () => {
  test('no sidecar + subprocess exits 0 → writes sidecar, returns "installed"', async () => {
    const home = freshHome();
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });
    const { logger, records } = makeRecordingLogger();

    const result = await installUserSkill({ home, logger, spawn });

    expect(result).toBe('installed');
    expect(calls.length).toBe(1);
    expect(calls[0]?.command).toBe('npx');
    expect(calls[0]?.args).toEqual([
      '-y',
      'skills@~1.5.0',
      'add',
      expect.stringContaining('assets/skills/open-knowledge') as unknown as string,
      '--agent',
      '*',
      '-g',
      '-y',
      '--copy',
    ]);
    expect((calls[0]?.opts.env as NodeJS.ProcessEnv)?.HOME).toBe(home);
    expect(readSidecarIfExists(home)).toBe(`${currentVersion}\n`);
    expect(records.some((r) => r.level === 'info' && /installed/i.test(r.message))).toBe(true);
  });
});

describe('installUserSkill — idempotency (skip-current)', () => {
  test('sidecar matches current version → subprocess NOT invoked, returns "skip-current"', async () => {
    const home = freshHome();
    writeSidecar(home, `${currentVersion}\n`);
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });

    const result = await installUserSkill({ home, spawn });

    expect(result).toBe('skip-current');
    expect(calls.length).toBe(0);
    expect(readSidecarIfExists(home)).toBe(`${currentVersion}\n`);
  });

  test('sidecar without trailing newline still matches (tolerant parse)', async () => {
    const home = freshHome();
    writeSidecar(home, currentVersion);
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });

    const result = await installUserSkill({ home, spawn });
    expect(result).toBe('skip-current');
    expect(calls.length).toBe(0);
  });
});

describe('installUserSkill — stale sidecar', () => {
  test('sidecar version differs from package version → subprocess invoked, sidecar rewritten', async () => {
    const home = freshHome();
    writeSidecar(home, '0.0.1\n');
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });

    const result = await installUserSkill({ home, spawn });

    expect(result).toBe('installed');
    expect(calls.length).toBe(1);
    expect(readSidecarIfExists(home)).toBe(`${currentVersion}\n`);
  });
});

describe('installUserSkill — failure modes', () => {
  test('subprocess non-zero exit → warning logged, sidecar NOT written, returns "failed"', async () => {
    const home = freshHome();
    const { spawn } = makeSpawnFake({
      stderr: 'no compatible agents detected',
      outcome: { kind: 'exit', code: 1 },
    });
    const { logger, records } = makeRecordingLogger();

    const result = await installUserSkill({ home, logger, spawn });

    expect(result).toBe('failed');
    expect(readSidecarIfExists(home)).toBeNull();
    const warnRecord = records.find((r) => r.level === 'warn');
    expect(warnRecord).toBeDefined();
    expect(warnRecord?.data).toMatchObject({
      event: 'skill-install.failed',
      reason: 'nonzero-exit',
      exitCode: 1,
    });
  });

  test('subprocess hangs past timeout → killed, warning logged, returns "failed"', async () => {
    const home = freshHome();
    const { spawn } = makeSpawnFake({ outcome: { kind: 'hang' } });
    const { logger, records } = makeRecordingLogger();

    const result = await installUserSkill({ home, logger, spawn, timeoutMs: 25 });

    expect(result).toBe('failed');
    expect(readSidecarIfExists(home)).toBeNull();
    const warnRecord = records.find((r) => r.level === 'warn');
    expect(warnRecord?.data).toMatchObject({ event: 'skill-install.failed', reason: 'timeout' });
  });

  test('spawn throws ENOENT (npx missing) → warning logged, returns "failed"', async () => {
    const home = freshHome();
    const enoent = Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' });
    const { spawn } = makeThrowingSpawn(enoent);
    const { logger, records } = makeRecordingLogger();

    const result = await installUserSkill({ home, logger, spawn });

    expect(result).toBe('failed');
    expect(readSidecarIfExists(home)).toBeNull();
    const warnRecord = records.find((r) => r.level === 'warn');
    expect(warnRecord?.data).toMatchObject({
      event: 'skill-install.failed',
      reason: 'spawn-error',
    });
  });

  test('child emits "error" (ENOENT surfaced async) → warning logged, returns "failed"', async () => {
    const home = freshHome();
    const { spawn } = makeSpawnFake({
      outcome: { kind: 'error', error: new Error('spawn ENOENT') },
    });
    const { logger, records } = makeRecordingLogger();

    const result = await installUserSkill({ home, logger, spawn });

    expect(result).toBe('failed');
    expect(readSidecarIfExists(home)).toBeNull();
    const warnRecord = records.find((r) => r.level === 'warn');
    expect(warnRecord?.data).toMatchObject({
      event: 'skill-install.failed',
      reason: 'spawn-error',
    });
  });
});

describe('installUserSkill — sidecar tolerant parse', () => {
  test('empty sidecar → treated as fresh install, subprocess invoked', async () => {
    const home = freshHome();
    writeSidecar(home, '');
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });

    const result = await installUserSkill({ home, spawn });

    expect(result).toBe('installed');
    expect(calls.length).toBe(1);
  });

  test('malformed sidecar content → treated as fresh install, subprocess invoked', async () => {
    const home = freshHome();
    writeSidecar(home, 'not-a-version-string\n');
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });

    const result = await installUserSkill({ home, spawn });

    expect(result).toBe('installed');
    expect(calls.length).toBe(1);
    expect(readSidecarIfExists(home)).toBe(`${currentVersion}\n`);
  });
});

describe('installUserSkill — HOME propagates to subprocess env', () => {
  test('opts.home is passed as HOME env var to spawn', async () => {
    const home = freshHome();
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });
    const opts: InstallUserSkillOptions = { home, spawn };

    await installUserSkill(opts);

    expect((calls[0]?.opts.env as NodeJS.ProcessEnv)?.HOME).toBe(home);
  });
});
