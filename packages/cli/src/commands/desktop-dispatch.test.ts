import { describe, expect, test } from 'bun:test';
import {
  DESKTOP_BUNDLE_ID,
  type DetectDeps,
  detectDesktop,
  launchDesktop,
  notFoundMessage,
} from './desktop-dispatch.ts';

function baseDeps(overrides: Partial<DetectDeps> = {}): DetectDeps {
  return {
    platform: 'darwin',
    env: {},
    execPath: '/usr/local/bin/node',
    isTTY: true,
    statSync: () => null,
    homeDir: '/Users/andrew',
    ...overrides,
  };
}

function statForFile(path: string): DetectDeps['statSync'] {
  return (p) => (p === path ? { isFile: () => true, isDirectory: () => false } : null);
}

const APP_EXEC = '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge';
const HOME_EXEC = '/Users/andrew/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge';

describe('detectDesktop — platform gate (FR10)', () => {
  test('linux → darwin-only', () => {
    const result = detectDesktop(baseDeps({ platform: 'linux', statSync: statForFile(APP_EXEC) }));
    expect(result).toEqual({ available: false, reason: 'darwin-only' });
  });

  test('win32 → darwin-only', () => {
    const result = detectDesktop(baseDeps({ platform: 'win32', statSync: statForFile(APP_EXEC) }));
    expect(result).toEqual({ available: false, reason: 'darwin-only' });
  });
});

describe('detectDesktop — bundle resolution (FR10 D2 a/b/c)', () => {
  test('darwin + bundle in /Applications → available', () => {
    const result = detectDesktop(baseDeps({ statSync: statForFile(APP_EXEC) }));
    expect(result.available).toBe(true);
    expect(result.reason).toBe('available');
    expect(result.bundlePath).toBe('/Applications/Open Knowledge.app');
  });

  test('darwin + bundle only in ~/Applications → available, home path', () => {
    const result = detectDesktop(baseDeps({ statSync: statForFile(HOME_EXEC) }));
    expect(result.available).toBe(true);
    expect(result.bundlePath).toBe('/Users/andrew/Applications/Open Knowledge.app');
  });

  test('darwin + no bundle → no-bundle', () => {
    const result = detectDesktop(baseDeps());
    expect(result).toEqual({ available: false, reason: 'no-bundle' });
  });

  test('bundled-CLI introspection (FR10 D2 path a) — ELECTRON_RUN_AS_NODE + execPath in .app', () => {
    const result = detectDesktop(
      baseDeps({
        env: { ELECTRON_RUN_AS_NODE: '1' },
        execPath: '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge',
        statSync: () => null,
      }),
    );
    expect(result.available).toBe(true);
    expect(result.bundlePath).toBe('/Applications/Open Knowledge.app');
  });

  test('bundled-CLI introspection — execPath outside .app falls through to stat probes', () => {
    const result = detectDesktop(
      baseDeps({
        env: { ELECTRON_RUN_AS_NODE: '1' },
        execPath: '/usr/local/bin/electron',
        statSync: statForFile(APP_EXEC),
      }),
    );
    expect(result.available).toBe(true);
    expect(result.bundlePath).toBe('/Applications/Open Knowledge.app');
  });

  test('stat throws unexpectedly → no-bundle (probeBundle catches before reason can bubble)', () => {
    const result = detectDesktop(
      baseDeps({
        statSync: () => {
          throw new Error('EACCES: synthetic');
        },
      }),
    );
    expect(result).toEqual({ available: false, reason: 'no-bundle' });
  });
});

describe('detectDesktop — env overrides (FR8)', () => {
  test('OK_FORCE_BROWSER=1 wins over everything', () => {
    const result = detectDesktop(
      baseDeps({
        env: { OK_FORCE_BROWSER: '1', OK_FORCE_DESKTOP: '1' },
        statSync: statForFile(APP_EXEC),
      }),
    );
    expect(result).toEqual({ available: false, reason: 'force-browser' });
  });

  test('OK_FORCE_BROWSER=1 with darwin + bundle still returns false', () => {
    const result = detectDesktop(
      baseDeps({
        env: { OK_FORCE_BROWSER: '1' },
        statSync: statForFile(APP_EXEC),
      }),
    );
    expect(result.available).toBe(false);
    expect(result.reason).toBe('force-browser');
  });

  test('OK_FORCE_DESKTOP=1 skips headless gate when bundle present (FR10 ordering)', () => {
    const result = detectDesktop(
      baseDeps({
        env: { OK_FORCE_DESKTOP: '1', SSH_CONNECTION: '10.0.0.1 22' },
        isTTY: false,
        statSync: statForFile(APP_EXEC),
      }),
    );
    expect(result.available).toBe(true);
    expect(result.reason).toBe('available');
  });

  test('OK_FORCE_DESKTOP=1 still requires a bundle to exist', () => {
    const result = detectDesktop(
      baseDeps({
        env: { OK_FORCE_DESKTOP: '1' },
        statSync: () => null,
      }),
    );
    expect(result.available).toBe(false);
    expect(result.reason).toBe('no-bundle');
  });
});

describe('detectDesktop — headless gate (FR9 — CI is intentionally NOT a trigger)', () => {
  test('isTTY=false → headless', () => {
    const result = detectDesktop(baseDeps({ isTTY: false, statSync: statForFile(APP_EXEC) }));
    expect(result.available).toBe(false);
    expect(result.reason).toBe('headless');
    expect(result.bundlePath).toBe('/Applications/Open Knowledge.app');
  });

  test('isTTY=undefined → headless (treated as false)', () => {
    const result = detectDesktop(baseDeps({ isTTY: undefined, statSync: statForFile(APP_EXEC) }));
    expect(result.reason).toBe('headless');
  });

  test('SSH_CONNECTION set → headless', () => {
    const result = detectDesktop(
      baseDeps({
        env: { SSH_CONNECTION: '10.0.0.1 22 192.168.1.1 22' },
        statSync: statForFile(APP_EXEC),
      }),
    );
    expect(result.reason).toBe('headless');
  });

  test('SSH_TTY set → headless', () => {
    const result = detectDesktop(
      baseDeps({
        env: { SSH_TTY: '/dev/pts/0' },
        statSync: statForFile(APP_EXEC),
      }),
    );
    expect(result.reason).toBe('headless');
  });

  test('CI=1 with isTTY=true → still available (CI not a trigger per design challenge 4)', () => {
    const result = detectDesktop(
      baseDeps({
        env: { CI: '1' },
        isTTY: true,
        statSync: statForFile(APP_EXEC),
      }),
    );
    expect(result.available).toBe(true);
    expect(result.reason).toBe('available');
  });

  test('CI=true with isTTY=false → headless via isTTY (CI redundant)', () => {
    const result = detectDesktop(
      baseDeps({
        env: { CI: 'true' },
        isTTY: false,
        statSync: statForFile(APP_EXEC),
      }),
    );
    expect(result.reason).toBe('headless');
  });
});

describe('launchDesktop — spawn shape (FR11)', () => {
  test('spawns open with -b <bundle-id>, detached, stdio:ignore, unref()', () => {
    let captured: { command?: string; args?: readonly string[]; opts?: unknown } = {};
    let unrefCalled = false;

    const fakeChild = {
      unref: () => {
        unrefCalled = true;
      },
    };
    const fakeSpawn = ((command: string, args: readonly string[], opts: unknown) => {
      captured = { command, args, opts };
      return fakeChild;
    }) as unknown as Parameters<typeof launchDesktop>[0]['spawn'];

    let logged = '';
    launchDesktop({ spawn: fakeSpawn, log: (m) => (logged = m) });

    expect(captured.command).toBe('open');
    expect(captured.args).toEqual(['-b', DESKTOP_BUNDLE_ID]);
    expect(captured.opts).toEqual({ detached: true, stdio: 'ignore' });
    expect(unrefCalled).toBe(true);
    expect(logged).toContain('Launching Open Knowledge desktop…');
    expect(logged).toContain('OK_FORCE_BROWSER=1');
    expect(logged).toContain('ok start');
  });

  test('uses bundle ID com.inkeep.open-knowledge (matches electron-builder appId)', () => {
    expect(DESKTOP_BUNDLE_ID).toBe('com.inkeep.open-knowledge');
  });
});

describe('UX message helpers — FR5 contextual notFoundMessage(reason)', () => {
  test('default (no-bundle) names the install path + omit-mode hint', () => {
    const msg = notFoundMessage();
    expect(msg).toContain('/Applications/Open Knowledge.app');
    expect(msg).toContain('--mode');
  });

  test('headless reason explains the gate + names OK_FORCE_DESKTOP override', () => {
    const msg = notFoundMessage('headless');
    expect(msg).toContain('headless');
    expect(msg).toContain('OK_FORCE_DESKTOP');
    expect(msg).not.toContain('not found');
  });

  test('darwin-only reason names the platform constraint', () => {
    const msg = notFoundMessage('darwin-only');
    expect(msg).toMatch(/macOS/i);
    expect(msg).toContain('--mode=browser');
  });

  test('force-browser reason names the env override', () => {
    const msg = notFoundMessage('force-browser');
    expect(msg).toContain('OK_FORCE_BROWSER');
  });

  test('stat-error reason mentions filesystem error + bundle path', () => {
    const msg = notFoundMessage('stat-error');
    expect(msg).toContain('/Applications/Open Knowledge.app');
    expect(msg).toMatch(/filesystem|permission/i);
  });

  test("'available' is a defensive case — caller bug surfaced in the message", () => {
    const msg = notFoundMessage('available');
    expect(msg).toContain('caller bug');
  });
});
