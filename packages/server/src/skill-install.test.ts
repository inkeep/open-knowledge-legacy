import { beforeEach, describe, expect, test } from 'bun:test';
import type { SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import {
  buildAndOpenSkill,
  type InstallUserSkillOptions,
  installUserSkill,
  type SkillInstallLogger,
  type SpawnLike,
} from './skill-install.ts';

async function readServerVersion(): Promise<string> {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf-8');
  return (JSON.parse(raw) as { version: string }).version;
}

interface FakeChildScript {
  stderr?: string;
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

const YAML_REL = ['.ok', 'skill-state.yml'] as const;
function yamlPathFor(home: string): string {
  return join(home, ...YAML_REL);
}

const CENTRAL_SKILL_REL = ['.agents', 'skills', 'open-knowledge'] as const;
function centralSkillDirFor(home: string): string {
  return join(home, ...CENTRAL_SKILL_REL);
}

function writeCentralSkill(home: string): void {
  const dir = centralSkillDirFor(home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '# stub\n', 'utf-8');
}

function writeSidecar(home: string, content: string): void {
  const dir = join(home, '.ok');
  mkdirSync(dir, { recursive: true });
  const trimmed = content.replace(/\n+$/, '');
  const yaml = [
    'schema: 1',
    'targets:',
    '  cli-hosts:',
    `    version: ${JSON.stringify(trimmed)}`,
    `    recordedAt: ${JSON.stringify(new Date().toISOString())}`,
    '',
  ].join('\n');
  writeFileSync(yamlPathFor(home), yaml, 'utf-8');
}

function readSidecarIfExists(home: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(yamlPathFor(home), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const m = raw.match(/cli-hosts:\s*[\r\n]+\s*version:\s*"?([^\n"]+?)"?\s*[\r\n]/);
  if (!m) return null;
  const version = m[1]?.trim() ?? '';
  if (version.length === 0) return null;
  return `${version}\n`;
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
  test('sidecar matches current version + central skill present → subprocess NOT invoked, returns "skip-current"', async () => {
    const home = freshHome();
    writeSidecar(home, `${currentVersion}\n`);
    writeCentralSkill(home);
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });

    const result = await installUserSkill({ home, spawn });

    expect(result).toBe('skip-current');
    expect(calls.length).toBe(0);
    expect(readSidecarIfExists(home)).toBe(`${currentVersion}\n`);
  });

  test('sidecar without trailing newline still matches (tolerant parse)', async () => {
    const home = freshHome();
    writeSidecar(home, currentVersion);
    writeCentralSkill(home);
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });

    const result = await installUserSkill({ home, spawn });
    expect(result).toBe('skip-current');
    expect(calls.length).toBe(0);
  });

  test('sidecar matches but central skill dir is missing → reinstall fires, sidecar rewritten', async () => {
    const home = freshHome();
    writeSidecar(home, `${currentVersion}\n`);
    const { spawn, calls } = makeSpawnFake({ outcome: { kind: 'exit', code: 0 } });
    const { logger, records } = makeRecordingLogger();

    const result = await installUserSkill({ home, logger, spawn });

    expect(result).toBe('installed');
    expect(calls.length).toBe(1);
    expect(readSidecarIfExists(home)).toBe(`${currentVersion}\n`);
    const reinstallLog = records.find(
      (r) =>
        r.level === 'info' &&
        (r.data as { event?: string }).event === 'skill-install.reinstall-missing',
    );
    expect(reinstallLog).toBeDefined();
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

    expect((calls[0]?.opts.env as NodeJS.ProcessEnv)?.HOME).toBe(host(calls).HOME);
  });
});

function host(calls: ReadonlyArray<{ opts: { env?: NodeJS.ProcessEnv } }>): NodeJS.ProcessEnv {
  return (calls[0]?.opts.env ?? {}) as NodeJS.ProcessEnv;
}

describe('buildAndOpenSkill', () => {
  function makeFakeSpawn(capture: {
    command?: string;
    args?: readonly string[];
    threw?: Error;
  }): SpawnLike {
    return ((command: string, args: readonly string[]) => {
      if (capture.threw) throw capture.threw;
      capture.command = command;
      capture.args = args;
      return { unref: () => {} } as ReturnType<SpawnLike>;
    }) as SpawnLike;
  }

  test('--no-open: builds the file and returns status="built" without spawning', async () => {
    const home = freshHome();
    const capture: { command?: string; args?: readonly string[] } = {};

    const result = await buildAndOpenSkill({
      home,
      out: join(home, 'no-open.skill'),
      noOpen: true,
      spawnFn: makeFakeSpawn(capture),
    });

    expect(result.status).toBe('built');
    expect(result.outputPath).toBe(join(home, 'no-open.skill'));
    expect(capture.command).toBeUndefined();
    expect(result.handoffError).toBeUndefined();
  });

  test('darwin: spawns `open <path>` and returns status="installed"', async () => {
    const home = freshHome();
    const capture: { command?: string; args?: readonly string[] } = {};
    const out = join(home, 'darwin.skill');

    const result = await buildAndOpenSkill({
      home,
      out,
      platformName: 'darwin',
      spawnFn: makeFakeSpawn(capture),
    });

    expect(result.status).toBe('installed');
    expect(capture.command).toBe('open');
    expect(capture.args).toEqual([out]);
  });

  test('win32: spawns `cmd /c start "" <path>` and returns status="installed"', async () => {
    const home = freshHome();
    const capture: { command?: string; args?: readonly string[] } = {};
    const out = join(home, 'win32.skill');

    const result = await buildAndOpenSkill({
      home,
      out,
      platformName: 'win32',
      spawnFn: makeFakeSpawn(capture),
    });

    expect(result.status).toBe('installed');
    expect(capture.command).toBe('cmd');
    expect(capture.args?.[0]).toBe('/c');
    expect(capture.args?.[1]).toBe('start');
    expect(capture.args?.[3]).toBe(out);
  });

  test('linux: spawns `xdg-open <path>` and returns status="installed"', async () => {
    const home = freshHome();
    const capture: { command?: string; args?: readonly string[] } = {};

    const result = await buildAndOpenSkill({
      home,
      out: join(home, 'linux.skill'),
      platformName: 'linux',
      spawnFn: makeFakeSpawn(capture),
    });

    expect(result.status).toBe('installed');
    expect(capture.command).toBe('xdg-open');
  });

  test('unsupported platform: status="built" with handoffError reason=unsupported-platform', async () => {
    const home = freshHome();

    const result = await buildAndOpenSkill({
      home,
      out: join(home, 'aix.skill'),
      platformName: 'aix' as NodeJS.Platform,
      spawnFn: makeFakeSpawn({
        threw: new Error('spawn should not have been called'),
      }),
    });

    expect(result.status).toBe('built');
    expect(result.handoffError?.reason).toBe('unsupported-platform');
    expect(result.handoffError?.message).toContain("'aix'");
  });

  test('spawn throws: status="built" with handoffError reason=spawn-error', async () => {
    const home = freshHome();

    const result = await buildAndOpenSkill({
      home,
      out: join(home, 'spawn-error.skill'),
      platformName: 'darwin',
      spawnFn: makeFakeSpawn({ threw: new Error('EACCES: permission denied') }),
    });

    expect(result.status).toBe('built');
    expect(result.handoffError?.reason).toBe('spawn-error');
    expect(result.handoffError?.message).toContain('EACCES');
    expect(result.outputPath).toBeDefined();
  });
});

describe('buildAndOpenSkill — install-state gate', () => {
  function makeNoopSpawn(): SpawnLike {
    return ((command: string) => {
      throw new Error(`spawn should not have been called (cmd=${command})`);
    }) as unknown as SpawnLike;
  }
  function writeCoworkState(home: string, version: string): void {
    const dir = join(home, '.ok');
    mkdirSync(dir, { recursive: true });
    const yaml = [
      'schema: 1',
      'targets:',
      '  claude-cowork:',
      `    version: ${JSON.stringify(version)}`,
      `    recordedAt: ${JSON.stringify(new Date().toISOString())}`,
      '',
    ].join('\n');
    writeFileSync(join(dir, 'skill-state.yml'), yaml, 'utf-8');
  }
  function readCoworkState(home: string): string | null {
    let raw: string;
    try {
      raw = readFileSync(join(home, '.ok', 'skill-state.yml'), 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    const m = raw.match(/claude-cowork:\s*[\r\n]+\s*version:\s*"?([^\n"]+?)"?\s*[\r\n]/);
    if (!m) return null;
    const version = m[1]?.trim() ?? '';
    if (version.length === 0) return null;
    return `${version}\n`;
  }

  test('recorded claude-cowork matches current → status="skip-current"; no build, no spawn', async () => {
    const home = freshHome();
    writeCoworkState(home, currentVersion);

    const result = await buildAndOpenSkill({
      home,
      out: join(home, 'should-not-build.skill'),
      platformName: 'darwin',
      spawnFn: makeNoopSpawn(),
    });

    expect(result.status).toBe('skip-current');
    expect(result.skillVersion).toBe(currentVersion);
    expect(typeof result.recordedAt).toBe('string');
    let outExists = false;
    try {
      readFileSync(join(home, 'should-not-build.skill'));
      outExists = true;
    } catch {}
    expect(outExists).toBe(false);
  });

  test('force=true bypasses gate even when recorded matches', async () => {
    const home = freshHome();
    writeCoworkState(home, currentVersion);
    const capture: { command?: string; args?: readonly string[] } = {};
    const out = join(home, 'forced.skill');

    const result = await buildAndOpenSkill({
      home,
      out,
      platformName: 'darwin',
      spawnFn: ((command: string, args: readonly string[]) => {
        capture.command = command;
        capture.args = args;
        return {
          unref: () => {},
        } as unknown as ReturnType<Parameters<SpawnLike>[2] extends never ? never : SpawnLike>;
      }) as unknown as SpawnLike,
      force: true,
    });

    expect(result.status).toBe('installed');
    expect(capture.command).toBe('open');
  });

  test('successful build writes claude-cowork install-state', async () => {
    const home = freshHome();
    expect(readCoworkState(home)).toBeNull();
    const out = join(home, 'fresh.skill');

    const result = await buildAndOpenSkill({
      home,
      out,
      noOpen: true,
    });

    expect(result.status).toBe('built');
    expect(readCoworkState(home)).toBe(`${currentVersion}\n`);
  });

  test('subsequent invocation after a successful build hits the gate', async () => {
    const home = freshHome();
    const first = await buildAndOpenSkill({
      home,
      out: join(home, 'first.skill'),
      noOpen: true,
    });
    expect(first.status).toBe('built');
    const second = await buildAndOpenSkill({
      home,
      out: join(home, 'second.skill'),
      noOpen: true,
    });
    expect(second.status).toBe('skip-current');
  });
});
