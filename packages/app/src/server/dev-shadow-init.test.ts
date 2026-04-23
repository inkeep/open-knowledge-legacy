import { describe, expect, test } from 'bun:test';
import { ProjectGitInitError, type ShadowHandle } from '@inkeep/open-knowledge-server';
import {
  type DevShadowInitIo,
  handleDevShadowInitError,
  runDevShadowInit,
} from './dev-shadow-init.ts';

// ─── Test helpers ────────────────────────────────────────────────────────────

interface RecordedIo {
  io: DevShadowInitIo;
  infos: string[];
  warns: Array<{ msg: string; err?: unknown }>;
  exits: number[];
}

function makeIo(): RecordedIo {
  const infos: string[] = [];
  const warns: Array<{ msg: string; err?: unknown }> = [];
  const exits: number[] = [];
  const io: DevShadowInitIo = {
    logInfo: (msg) => {
      infos.push(msg);
    },
    logWarn: (msg, err) => {
      warns.push({ msg, err });
    },
    exit: (code) => {
      exits.push(code);
      // Return never-typed value via throw so downstream code treats exit as
      // terminal in production. Tests catch this to assert post-exit
      // behavior.
      throw new ExitCalled(code);
    },
  };
  return { io, infos, warns, exits };
}

class ExitCalled extends Error {
  constructor(public code: number) {
    super(`exit(${code}) called`);
  }
}

// Stable ShadowHandle fixture for the success path.
const FAKE_SHADOW: ShadowHandle = { gitDir: '/fake/.git/open-knowledge', workTree: '/fake' };

// ─── handleDevShadowInitError ────────────────────────────────────────────────

describe('handleDevShadowInitError', () => {
  test('ProjectGitInitError — logs warn + stderr dump + calls exit(1)', () => {
    const { io, warns, exits } = makeIo();
    const err = new ProjectGitInitError('git: command not found', 'git: not found\n');
    expect(() => handleDevShadowInitError(err, io)).toThrow('exit(1) called');
    expect(warns).toEqual([
      { msg: '[dev] ensureProjectGit failed: git: command not found', err: undefined },
      { msg: '[dev] git stderr: git: not found', err: undefined },
    ]);
    expect(exits).toEqual([1]);
  });

  test('ProjectGitInitError with empty stderr — single warn, no stderr dump', () => {
    const { io, warns, exits } = makeIo();
    const err = new ProjectGitInitError('git init failed (spawn ENOENT)', '');
    expect(() => handleDevShadowInitError(err, io)).toThrow('exit(1) called');
    expect(warns).toEqual([
      {
        msg: '[dev] ensureProjectGit failed: git init failed (spawn ENOENT)',
        err: undefined,
      },
    ]);
    expect(exits).toEqual([1]);
  });

  test('plain Error — degraded warn, NOT exit (matches CLI degraded shadow semantics)', () => {
    const { io, warns, exits } = makeIo();
    const err = new Error('disk full');
    handleDevShadowInitError(err, io);
    expect(warns).toEqual([
      { msg: '[dev] Shadow repo init failed (timeline features unavailable):', err },
    ]);
    expect(exits).toEqual([]);
  });

  test('non-Error thrown value — degraded warn still surfaces the value', () => {
    const { io, warns, exits } = makeIo();
    handleDevShadowInitError('string error', io);
    expect(warns).toEqual([
      {
        msg: '[dev] Shadow repo init failed (timeline features unavailable):',
        err: 'string error',
      },
    ]);
    expect(exits).toEqual([]);
  });

  test('plain Error under isTestIsolated — fail-fast warn + exit(1) per D13', () => {
    const { io, warns, exits } = makeIo();
    const err = new Error('disk full');
    expect(() => handleDevShadowInitError(err, io, { isTestIsolated: true })).toThrow(
      'exit(1) called',
    );
    expect(warns).toEqual([
      { msg: '[dev] Shadow repo init failed under test isolation (fail-fast per D13):', err },
    ]);
    expect(exits).toEqual([1]);
  });

  test('non-Error thrown value under isTestIsolated — fail-fast warn + exit(1) per D13', () => {
    const { io, warns, exits } = makeIo();
    expect(() => handleDevShadowInitError('string error', io, { isTestIsolated: true })).toThrow(
      'exit(1) called',
    );
    expect(warns).toEqual([
      {
        msg: '[dev] Shadow repo init failed under test isolation (fail-fast per D13):',
        err: 'string error',
      },
    ]);
    expect(exits).toEqual([1]);
  });
});

// ─── runDevShadowInit ────────────────────────────────────────────────────────

describe('runDevShadowInit', () => {
  test('happy path — ensureProjectGit → initShadowRepo → onReady + log', async () => {
    const { io, infos, warns, exits } = makeIo();
    const calls: string[] = [];
    const deps = {
      ensureProjectGit: async (root: string) => {
        calls.push(`ensureProjectGit(${root})`);
        return { didInit: true };
      },
      initShadowRepo: async (root: string) => {
        calls.push(`initShadowRepo(${root})`);
        return FAKE_SHADOW;
      },
    };
    const captured: ShadowHandle[] = [];
    await runDevShadowInit('/project', (shadow) => captured.push(shadow), { io, deps });
    expect(calls).toEqual(['ensureProjectGit(/project)', 'initShadowRepo(/project)']);
    expect(captured).toEqual([FAKE_SHADOW]);
    expect(infos).toEqual([`[dev] Shadow repo initialized at ${FAKE_SHADOW.gitDir}`]);
    expect(warns).toEqual([]);
    expect(exits).toEqual([]);
  });

  test('ensureProjectGit rejects with ProjectGitInitError — fails fast, initShadowRepo NOT called', async () => {
    const { io, infos, warns, exits } = makeIo();
    const calls: string[] = [];
    const deps = {
      ensureProjectGit: async () => {
        calls.push('ensureProjectGit');
        throw new ProjectGitInitError('git not on PATH', 'spawn ENOENT');
      },
      initShadowRepo: async () => {
        calls.push('initShadowRepo');
        return FAKE_SHADOW;
      },
    };
    const onReadyCalls: ShadowHandle[] = [];
    // `io.exit` throws `ExitCalled` in tests — in production it'd be `process.exit`
    // which never returns. The thrown exit propagates out of `runDevShadowInit`.
    await expect(
      runDevShadowInit('/project', (s) => onReadyCalls.push(s), { io, deps }),
    ).rejects.toThrow('exit(1) called');
    // initShadowRepo MUST NOT be called — that's the fail-fast guarantee.
    expect(calls).toEqual(['ensureProjectGit']);
    expect(onReadyCalls).toEqual([]);
    expect(infos).toEqual([]);
    expect(warns).toEqual([
      { msg: '[dev] ensureProjectGit failed: git not on PATH', err: undefined },
      { msg: '[dev] git stderr: spawn ENOENT', err: undefined },
    ]);
    expect(exits).toEqual([1]);
  });

  test('initShadowRepo rejects with non-ProjectGitInitError — degraded warn, no exit (production path)', async () => {
    const { io, infos, warns, exits } = makeIo();
    const shadowErr = new Error('lock acquisition failed');
    const deps = {
      ensureProjectGit: async () => ({ didInit: false }),
      initShadowRepo: async () => {
        throw shadowErr;
      },
    };
    const onReadyCalls: ShadowHandle[] = [];
    await runDevShadowInit('/project', (s) => onReadyCalls.push(s), { io, deps });
    expect(onReadyCalls).toEqual([]);
    expect(infos).toEqual([]);
    expect(warns).toEqual([
      { msg: '[dev] Shadow repo init failed (timeline features unavailable):', err: shadowErr },
    ]);
    expect(exits).toEqual([]);
  });

  test('initShadowRepo rejects with non-ProjectGitInitError under isTestIsolated — fail-fast exit(1) per D13', async () => {
    const { io, infos, warns, exits } = makeIo();
    const shadowErr = new Error('lock acquisition failed');
    const deps = {
      ensureProjectGit: async () => ({ didInit: false }),
      initShadowRepo: async () => {
        throw shadowErr;
      },
    };
    const onReadyCalls: ShadowHandle[] = [];
    await expect(
      runDevShadowInit('/project', (s) => onReadyCalls.push(s), {
        io,
        deps,
        isTestIsolated: true,
      }),
    ).rejects.toThrow('exit(1) called');
    expect(onReadyCalls).toEqual([]);
    expect(infos).toEqual([]);
    expect(warns).toEqual([
      {
        msg: '[dev] Shadow repo init failed under test isolation (fail-fast per D13):',
        err: shadowErr,
      },
    ]);
    expect(exits).toEqual([1]);
  });
});
