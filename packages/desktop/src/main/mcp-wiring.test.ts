import { describe, expect, test } from 'bun:test';
import { ALL_EDITOR_IDS, EDITOR_TARGETS } from '@inkeep/open-knowledge';
import {
  computeForce,
  type ForceComputeTarget,
  formatPartialFailureMessage,
  type IpcMainEventLike,
  type IpcMainLike,
  type McpStatusMarker,
  type McpWiringCliSurface,
  type McpWiringFsOps,
  type McpWiringLogger,
  mcpStatusMarkerPath,
  readMcpStatusMarker,
  resolveCliPath,
  runMcpWiringOnFirstLaunch,
  SYMLINK_OK_PATH,
  writeMcpStatusMarker,
} from './mcp-wiring.ts';

/**
 * Pure-function coverage for US-007 (M6b).
 *
 * Every test runs against an injected `FsOps` stub — no real filesystem
 * touched. `computeForce` tests import the real `EDITOR_TARGETS` from
 * the CLI via relative source path (CLAUDE.md worktree-local pattern)
 * so fixtures exercise the authoritative `isCompatible` implementation,
 * not a hand-rolled mirror. The US-002 precedent is followed for the
 * pure-function discipline: zero `electron` imports, zero `osascript`
 * spawns, zero `node:fs` side effects.
 */

const INSTALLED_EXE = '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge';
const INSTALLED_BUNDLE_WRAPPER =
  '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';

// ErrnoException shaped like Node's fs throws, so readlink's `.code` check
// fires on the absent-symlink branch.
const ENOENT: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
const EINVAL: NodeJS.ErrnoException = Object.assign(new Error('EINVAL'), { code: 'EINVAL' });

/**
 * Virtual filesystem stub for the marker round-trip tests. Captures
 * `writeFileSync` + `mkdirSync` calls into maps so tests can re-read
 * and assert shape without touching disk.
 *
 * `renameSync` + `unlinkSync` (Pass 0 Minor #2 — atomic write pattern)
 * are modeled identically to real fs: rename moves the file (overwriting
 * the destination if present), unlink removes it.
 */
function createVirtualFs(): {
  fs: McpWiringFsOps;
  files: Map<string, string>;
  dirs: Set<string>;
} {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const fs: McpWiringFsOps = {
    existsSync(path) {
      return files.has(path) || dirs.has(path);
    },
    readlinkSync() {
      throw ENOENT;
    },
    readFileSync(path) {
      const content = files.get(path);
      if (content === undefined) throw ENOENT;
      return content;
    },
    writeFileSync(path, content) {
      files.set(path, content);
    },
    mkdirSync(path) {
      dirs.add(path);
    },
    renameSync(oldPath, newPath) {
      const content = files.get(oldPath);
      if (content === undefined) throw ENOENT;
      files.set(newPath, content);
      files.delete(oldPath);
    },
    unlinkSync(path) {
      if (!files.has(path)) throw ENOENT;
      files.delete(path);
    },
  };
  return { fs, files, dirs };
}

/**
 * FsOps stub for `resolveCliPath` — stubs `existsSync(SYMLINK_OK_PATH)`
 * + `readlinkSync(SYMLINK_OK_PATH)` per scenario; every other path is
 * irrelevant to the branching logic.
 */
function stubFsForResolve(opts: {
  symlinkPresent?: boolean;
  readlinkResult?: string | Error;
}): McpWiringFsOps {
  return {
    existsSync(path) {
      if (path === SYMLINK_OK_PATH) return opts.symlinkPresent === true;
      return false;
    },
    readlinkSync(path) {
      if (path !== SYMLINK_OK_PATH) throw ENOENT;
      const r = opts.readlinkResult;
      if (r === undefined) throw ENOENT;
      if (r instanceof Error) throw r;
      return r;
    },
    readFileSync() {
      throw ENOENT;
    },
    writeFileSync() {},
    mkdirSync() {},
    renameSync() {},
    unlinkSync() {},
  };
}

describe('mcpStatusMarkerPath', () => {
  test('resolves to <home>/.open-knowledge/.mcp-status.json', () => {
    expect(mcpStatusMarkerPath('/Users/andrew')).toBe(
      '/Users/andrew/.open-knowledge/.mcp-status.json',
    );
  });
});

describe('readMcpStatusMarker', () => {
  test('returns null when marker file is absent', () => {
    const { fs } = createVirtualFs();
    expect(readMcpStatusMarker('/Users/andrew', fs)).toBeNull();
  });

  test('returns null when marker is unparseable JSON', () => {
    const { fs, files } = createVirtualFs();
    files.set('/Users/andrew/.open-knowledge/.mcp-status.json', 'not-json{{{');
    expect(readMcpStatusMarker('/Users/andrew', fs)).toBeNull();
  });

  test('returns null when shape is neither configured:true nor configured:false', () => {
    const { fs, files } = createVirtualFs();
    files.set('/Users/andrew/.open-knowledge/.mcp-status.json', JSON.stringify({ foo: 'bar' }));
    expect(readMcpStatusMarker('/Users/andrew', fs)).toBeNull();
  });

  test('returns parsed configured:true marker', () => {
    const { fs, files } = createVirtualFs();
    const marker: McpStatusMarker = {
      configured: true,
      configuredAt: '2026-04-23T00:00:00Z',
      editors: ['claude', 'cursor'],
      cliPath: '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh',
    };
    files.set('/Users/andrew/.open-knowledge/.mcp-status.json', JSON.stringify(marker));
    expect(readMcpStatusMarker('/Users/andrew', fs)).toEqual(marker);
  });

  test('returns parsed configured:false skip marker', () => {
    const { fs, files } = createVirtualFs();
    const marker: McpStatusMarker = {
      configured: false,
      skippedAt: '2026-04-23T00:00:00Z',
    };
    files.set('/Users/andrew/.open-knowledge/.mcp-status.json', JSON.stringify(marker));
    expect(readMcpStatusMarker('/Users/andrew', fs)).toEqual(marker);
  });
});

describe('writeMcpStatusMarker', () => {
  test('writes configured:true marker, creates parent directory', () => {
    const { fs, files, dirs } = createVirtualFs();
    const status: McpStatusMarker = {
      configured: true,
      configuredAt: '2026-04-23T00:00:00Z',
      editors: ['claude'],
      cliPath: '/usr/local/bin/ok',
    };
    writeMcpStatusMarker('/Users/andrew', status, fs);
    expect(dirs.has('/Users/andrew/.open-knowledge')).toBe(true);
    const written = files.get('/Users/andrew/.open-knowledge/.mcp-status.json');
    expect(written).toBeDefined();
    if (written === undefined) throw new Error('marker not written');
    expect(JSON.parse(written)).toEqual(status);
  });

  test('writes configured:false skip marker', () => {
    const { fs, files } = createVirtualFs();
    const status: McpStatusMarker = {
      configured: false,
      skippedAt: '2026-04-23T00:00:00Z',
    };
    writeMcpStatusMarker('/Users/andrew', status, fs);
    const written = files.get('/Users/andrew/.open-knowledge/.mcp-status.json');
    if (written === undefined) throw new Error('marker not written');
    expect(JSON.parse(written)).toEqual(status);
  });

  test('round-trips through readMcpStatusMarker', () => {
    const { fs } = createVirtualFs();
    const status: McpStatusMarker = {
      configured: true,
      configuredAt: '2026-04-23T12:34:56Z',
      editors: ['claude', 'claude-desktop', 'cursor'],
      cliPath: '/usr/local/bin/ok',
    };
    writeMcpStatusMarker('/Users/andrew', status, fs);
    expect(readMcpStatusMarker('/Users/andrew', fs)).toEqual(status);
  });

  test('writes trailing newline for human-readable cat output', () => {
    const { fs, files } = createVirtualFs();
    writeMcpStatusMarker(
      '/Users/andrew',
      { configured: false, skippedAt: '2026-04-23T00:00:00Z' },
      fs,
    );
    const written = files.get('/Users/andrew/.open-knowledge/.mcp-status.json');
    if (written === undefined) throw new Error('marker not written');
    expect(written.endsWith('\n')).toBe(true);
  });

  test('Pass 0 Minor #2: write is atomic via tmp+rename (no stray .tmp on success)', () => {
    const { fs, files } = createVirtualFs();
    writeMcpStatusMarker(
      '/Users/andrew',
      { configured: false, skippedAt: '2026-04-23T00:00:00Z' },
      fs,
    );
    const canonical = '/Users/andrew/.open-knowledge/.mcp-status.json';
    // Canonical path present.
    expect(files.has(canonical)).toBe(true);
    // No stray .tmp-<pid>-<ts> sibling — rename cleaned it up.
    const strayTmps = [...files.keys()].filter((p) => p.startsWith(`${canonical}.tmp-`));
    expect(strayTmps).toEqual([]);
  });

  test('Pass 0 Minor #2: rename failure cleans up the .tmp sibling and rethrows', () => {
    const { files, dirs } = createVirtualFs();
    let renameAttempts = 0;
    const renameFailingFs: McpWiringFsOps = {
      existsSync(path) {
        return files.has(path) || dirs.has(path);
      },
      readlinkSync() {
        throw ENOENT;
      },
      readFileSync(path) {
        const content = files.get(path);
        if (content === undefined) throw ENOENT;
        return content;
      },
      writeFileSync(path, content) {
        files.set(path, content);
      },
      mkdirSync(path) {
        dirs.add(path);
      },
      renameSync() {
        renameAttempts++;
        throw Object.assign(new Error('EXDEV: cross-device link'), { code: 'EXDEV' });
      },
      unlinkSync(path) {
        files.delete(path);
      },
    };
    expect(() =>
      writeMcpStatusMarker(
        '/Users/andrew',
        { configured: false, skippedAt: '2026-04-23T00:00:00Z' },
        renameFailingFs,
      ),
    ).toThrow(/EXDEV/);
    expect(renameAttempts).toBe(1);
    // No stray .tmp sibling — catch block cleaned it up.
    const strayTmps = [...files.keys()].filter((p) => p.includes('.tmp-'));
    expect(strayTmps).toEqual([]);
    // Canonical marker was NEVER created — failure must not leave partial state.
    expect(files.has('/Users/andrew/.open-knowledge/.mcp-status.json')).toBe(false);
  });
});

describe('resolveCliPath — hybrid per D-M6-R9', () => {
  test('returns bundle-absolute when /usr/local/bin/ok does not exist', () => {
    const fs = stubFsForResolve({ symlinkPresent: false });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(INSTALLED_BUNDLE_WRAPPER);
  });

  test('returns bundle-absolute when readlinkSync throws EINVAL (plain file at symlink path)', () => {
    const fs = stubFsForResolve({ symlinkPresent: true, readlinkResult: EINVAL });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(INSTALLED_BUNDLE_WRAPPER);
  });

  test('returns /usr/local/bin/ok when symlink target equals bundle wrapper (canonical M6a)', () => {
    const fs = stubFsForResolve({
      symlinkPresent: true,
      readlinkResult: INSTALLED_BUNDLE_WRAPPER,
    });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(SYMLINK_OK_PATH);
  });

  test('returns /usr/local/bin/ok when symlink target lives anywhere under the current bundle', () => {
    // Future M6a variant could point at a universal-binary subpath or a different
    // script inside the same bundle; the ownership check accepts any path under
    // `.app/` root, not just the exact wrapper.
    const fs = stubFsForResolve({
      symlinkPresent: true,
      readlinkResult:
        '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/universal-wrapper.sh',
    });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(SYMLINK_OK_PATH);
  });

  test('returns bundle-absolute when symlink target lives outside the current bundle (foreign/stale)', () => {
    // Most common "stale" case: an old uninstalled OK bundle's symlink that
    // outlived its owner. Ownership check MUST fail — STOP_IF (e).
    const fs = stubFsForResolve({
      symlinkPresent: true,
      readlinkResult: '/Applications/Other.app/Contents/Resources/cli/bin/ok.sh',
    });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(INSTALLED_BUNDLE_WRAPPER);
  });

  test('returns bundle-absolute for per-user ~/Applications install (mirror check)', () => {
    const perUserExe =
      '/Users/andrew/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge';
    const perUserWrapper =
      '/Users/andrew/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';
    const fs = stubFsForResolve({ symlinkPresent: true, readlinkResult: perUserWrapper });
    expect(resolveCliPath(perUserExe, fs)).toBe(SYMLINK_OK_PATH);
  });

  test('resolves relative readlink targets correctly', () => {
    // `ln -s ../../target source` produces a relative link target; resolve MUST
    // normalize relative to the symlink's parent dir, not CWD.
    const fs = stubFsForResolve({
      symlinkPresent: true,
      // Relative path from /usr/local/bin/ → /Applications/Open Knowledge.app/...
      readlinkResult: '../../../Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh',
    });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(SYMLINK_OK_PATH);
  });

  test('returns bundle-absolute on any unexpected readlink throw (EACCES etc.)', () => {
    const EACCES: NodeJS.ErrnoException = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const fs = stubFsForResolve({ symlinkPresent: true, readlinkResult: EACCES });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(INSTALLED_BUNDLE_WRAPPER);
  });
});

describe('computeForce — isCompatible-based merge classification (D-M6-R4)', () => {
  // Use real EDITOR_TARGETS from the CLI package via relative source import
  // (CLAUDE.md worktree-local pattern) so fixtures exercise the authoritative
  // `isCompatible` implementation rather than a hand-rolled mirror.
  const claude = EDITOR_TARGETS.claude;
  const vscode = EDITOR_TARGETS.vscode;

  test('Fixture A — canonical published npx shape → force=true (Claude)', () => {
    const existing: Record<string, unknown> = {
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    };
    expect(computeForce(existing, claude)).toBe(true);
  });

  test('Fixture A — canonical published npx shape → force=true (VS Code with type:stdio)', () => {
    const existing: Record<string, unknown> = {
      type: 'stdio',
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    };
    expect(computeForce(existing, vscode)).toBe(true);
  });

  test('Fixture B — historical -y variant → force=true', () => {
    // Pre-M6 CLI versions sometimes produced `npx -y @inkeep/open-knowledge mcp`.
    // `isCompatible` returns false on the 3-arg diff, so `isHistoricalNpxVariant`
    // carries the load here. AC requires this shape be OK-managed.
    const existing: Record<string, unknown> = {
      command: 'npx',
      args: ['-y', '@inkeep/open-knowledge', 'mcp'],
    };
    expect(computeForce(existing, claude)).toBe(true);
  });

  test('Fixture C — canonical + user-augmented env → force=true', () => {
    // `hasMatchingManagedFields` iterates only the managed keys (command, args);
    // existing's extra `env: {OK_LOG_LEVEL:'debug'}` is ignored by the matcher
    // AND preserved by `mergeManagedFields` on the subsequent write.
    const existing: Record<string, unknown> = {
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
      env: { OK_LOG_LEVEL: 'debug' },
    };
    expect(computeForce(existing, claude)).toBe(true);
  });

  test('Fixture D — foreign customization → force=false', () => {
    const existing: Record<string, unknown> = {
      command: 'custom-wrapper',
      args: ['--special-mode', 'run-mcp'],
    };
    expect(computeForce(existing, claude)).toBe(false);
  });

  test('Fixture D — foreign customization (VS Code with type:stdio) → force=false', () => {
    const existing: Record<string, unknown> = {
      type: 'stdio',
      command: 'custom-wrapper',
      args: ['--special-mode', 'run-mcp'],
    };
    expect(computeForce(existing, vscode)).toBe(false);
  });

  test('Prior cliPath shape (bundle-absolute from earlier M6b run) → force=true', () => {
    // User ran M6b pre-auto-update or pre-M6a-install; the prior cliPath was
    // bundle-absolute. After auto-update moves the bundle, or after the user
    // later installs M6a, the preferred cliPath shifts — overwrite it.
    const existing: Record<string, unknown> = {
      command: '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh',
      args: ['mcp'],
    };
    expect(computeForce(existing, claude)).toBe(true);
  });

  test('Prior cliPath shape (symlink /usr/local/bin/ok) → force=true', () => {
    const existing: Record<string, unknown> = {
      command: '/usr/local/bin/ok',
      args: ['mcp'],
    };
    expect(computeForce(existing, claude)).toBe(true);
  });

  test('Entry with non-string command → force=false', () => {
    const existing: Record<string, unknown> = { command: 42, args: ['mcp'] };
    expect(computeForce(existing, claude)).toBe(false);
  });

  test('Entry with non-array args → force=false', () => {
    const existing: Record<string, unknown> = { command: 'npx', args: 'mcp' };
    expect(computeForce(existing, claude)).toBe(false);
  });

  test('Empty shape → force=false (no command match)', () => {
    const existing: Record<string, unknown> = {};
    expect(computeForce(existing, claude)).toBe(false);
  });

  test('Accepts any structurally-compatible target (interface assignability)', () => {
    // Proves the `ForceComputeTarget` interface is the right structural subset
    // — a hand-rolled target that mirrors only `isCompatible` works, confirming
    // that US-008 can pass the real `EDITOR_TARGETS[id]` without a wrapper.
    const minimalTarget: ForceComputeTarget = {
      isCompatible(existing, _cwd, options) {
        if (options?.mode !== 'published') return false;
        return (
          existing.command === 'npx' &&
          Array.isArray(existing.args) &&
          existing.args.length === 2 &&
          existing.args[0] === '@inkeep/open-knowledge' &&
          existing.args[1] === 'mcp'
        );
      },
    };
    expect(
      computeForce({ command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] }, minimalTarget),
    ).toBe(true);
    expect(computeForce({ command: 'custom', args: ['foo'] }, minimalTarget)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runMcpWiringOnFirstLaunch — runtime orchestration (US-008)
// ---------------------------------------------------------------------------

/** Minimal ipcMain stub capturing handler registration for assertion. */
interface IpcMainStub extends IpcMainLike {
  handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>>;
  /** Simulate a renderer `invoke(channel, ...args)`. Event is stubbed to `{}`. */
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  /** Simulate an invoke with a custom sender event (for renderer-ready tests). */
  invokeWithEvent(channel: string, event: unknown, ...args: unknown[]): Promise<unknown>;
}

function createIpcMainStub(): IpcMainStub {
  const handlers = new Map<
    string,
    (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
  >();
  return {
    handlers,
    handle(channel, handler) {
      handlers.set(channel, handler as (e: unknown, ...a: unknown[]) => unknown);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
    async invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return handler({}, ...args);
    },
    async invokeWithEvent(channel, event, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return handler(event, ...args);
    },
  };
}

function createCapturedLogger(): {
  logger: McpWiringLogger;
  events: Array<{ event: string; [k: string]: unknown }>;
  infos: Array<{ msg: string; ctx?: object }>;
  warns: Array<{ msg: string; ctx?: object }>;
  errors: Array<{ msg: string; ctx?: object }>;
} {
  const events: Array<{ event: string; [k: string]: unknown }> = [];
  const infos: Array<{ msg: string; ctx?: object }> = [];
  const warns: Array<{ msg: string; ctx?: object }> = [];
  const errors: Array<{ msg: string; ctx?: object }> = [];
  const logger: McpWiringLogger = {
    info(msg, ctx) {
      infos.push({ msg, ctx });
    },
    warn(msg, ctx) {
      warns.push({ msg, ctx });
    },
    error(msg, ctx) {
      errors.push({ msg, ctx });
    },
    event(payload) {
      events.push(payload);
    },
  };
  return { logger, events, infos, warns, errors };
}

type WriteCall = Parameters<McpWiringCliSurface['writeUserMcpConfigs']>[0];
type WriteResult = Awaited<ReturnType<McpWiringCliSurface['writeUserMcpConfigs']>>;

function createCliSurface(opts?: {
  detected?: ReadonlyArray<(typeof ALL_EDITOR_IDS)[number]>;
  existingEntries?: Record<string, Record<string, unknown> | null>;
  writeResult?: (call: WriteCall) => WriteResult;
}): {
  cli: McpWiringCliSurface;
  writeCalls: WriteCall[];
} {
  const writeCalls: WriteCall[] = [];
  const detected = new Set<(typeof ALL_EDITOR_IDS)[number]>(opts?.detected ?? []);
  const existingEntries = opts?.existingEntries ?? {};
  const defaultWriteResult: (call: WriteCall) => WriteResult = (call) =>
    call.editors.map((editorId) => ({
      editorId,
      label: EDITOR_TARGETS[editorId].label,
      action: 'written' as const,
      configPath: `/fake/${editorId}/config.json`,
      serverName: 'open-knowledge',
    }));
  const cli: McpWiringCliSurface = {
    detectInstalledEditors() {
      return ALL_EDITOR_IDS.filter((id) => detected.has(id));
    },
    writeUserMcpConfigs: async (call) => {
      writeCalls.push(call);
      const fn = opts?.writeResult ?? defaultWriteResult;
      return fn(call);
    },
    readExistingMcpEntry(editorId) {
      return existingEntries[editorId] ?? null;
    },
    allEditorIds: ALL_EDITOR_IDS,
    editorTargets: EDITOR_TARGETS,
  };
  return { cli, writeCalls };
}

function createShowCapturingEvent(): {
  event: IpcMainEventLike;
  captured: Array<{ channel: string; args: unknown[] }>;
} {
  const captured: Array<{ channel: string; args: unknown[] }> = [];
  return {
    event: {
      sender: {
        send(channel, ...args) {
          captured.push({ channel, args });
        },
      },
    },
    captured,
  };
}

describe('runMcpWiringOnFirstLaunch — gating', () => {
  test('returns inert handle when platform !== darwin', () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger, infos } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'linux',
      ipcMain,
      cli,
      fs,
      logger,
    });
    expect(handle.armed).toBe(false);
    expect(ipcMain.handlers.size).toBe(0);
    expect(infos.some((i) => i.msg.includes('platform is not darwin'))).toBe(true);
  });

  test('returns inert handle when !isPackaged and OK_M6B_FORCE unset (D-M6-R7)', () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: false,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      forceEnv: null,
      fs,
      logger,
    });
    expect(handle.armed).toBe(false);
    expect(ipcMain.handlers.size).toBe(0);
  });

  test('proceeds when !isPackaged but OK_M6B_FORCE=1 (dev-smoke opt-in)', () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: false,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      forceEnv: '1',
      fs,
      logger,
    });
    expect(handle.armed).toBe(true);
    expect(ipcMain.handlers.has('ok:mcp-wiring:confirm')).toBe(true);
    expect(ipcMain.handlers.has('ok:mcp-wiring:skip')).toBe(true);
    expect(ipcMain.handlers.has('ok:mcp-wiring:renderer-ready')).toBe(true);
    handle.destroy();
  });

  test('returns inert handle when executablePath does not match .app/Contents/MacOS/<name> (STOP_IF c)', () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger, warns } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: '/some/other/path/to/electron',
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    expect(handle.armed).toBe(false);
    expect(warns.some((w) => w.msg.includes('executablePath does not match'))).toBe(true);
  });

  test('returns inert handle when marker is present (idempotent)', () => {
    const { fs, files } = createVirtualFs();
    files.set(
      '/Users/andrew/.open-knowledge/.mcp-status.json',
      JSON.stringify({
        configured: true,
        configuredAt: '2026-04-23T00:00:00Z',
        editors: ['claude'],
        cliPath: '/usr/local/bin/ok',
      }),
    );
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    expect(handle.armed).toBe(false);
    expect(ipcMain.handlers.size).toBe(0);
  });

  test('returns inert handle when skip marker is present (still idempotent)', () => {
    const { fs, files } = createVirtualFs();
    files.set(
      '/Users/andrew/.open-knowledge/.mcp-status.json',
      JSON.stringify({
        configured: false,
        skippedAt: '2026-04-23T00:00:00Z',
      }),
    );
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    expect(handle.armed).toBe(false);
  });
});

describe('runMcpWiringOnFirstLaunch — show dispatch via renderer-ready handshake', () => {
  test('first renderer-ready invoke sends show payload to that sender', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface({ detected: ['claude', 'cursor'] });
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      const { event, captured } = createShowCapturingEvent();
      await ipcMain.invokeWithEvent('ok:mcp-wiring:renderer-ready', event);
      expect(captured.length).toBe(1);
      expect(captured[0]?.channel).toBe('ok:mcp-wiring:show');
      const payload = captured[0]?.args[0] as {
        detectedEditors: Array<{ id: string; label: string; detected: boolean }>;
      };
      expect(payload.detectedEditors.length).toBe(ALL_EDITOR_IDS.length);
      const claude = payload.detectedEditors.find((d) => d.id === 'claude');
      const cursor = payload.detectedEditors.find((d) => d.id === 'cursor');
      const vscode = payload.detectedEditors.find((d) => d.id === 'vscode');
      expect(claude?.detected).toBe(true);
      expect(cursor?.detected).toBe(true);
      expect(vscode?.detected).toBe(false);
    } finally {
      handle.destroy();
    }
  });

  test('Pass 0 Major #6: failed dispatch keeps handler armed for next renderer-ready invoke', async () => {
    // If sendToRenderer throws (WebContents destroyed mid-handshake, channel
    // drift, etc.), the handler MUST stay armed. Without this, a failed first
    // dispatch leaves the dialog permanently undeliverable until next boot.
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface({ detected: ['claude'] });
    const { logger, errors } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      // First sender throws on send (WebContents destroyed scenario). The
      // handler logs + leaves itself armed.
      const failingEvent: IpcMainEventLike = {
        sender: {
          send() {
            throw new Error('WebContents destroyed');
          },
        },
      };
      await ipcMain.invokeWithEvent('ok:mcp-wiring:renderer-ready', failingEvent);
      expect(errors.some((e) => e.msg.includes('show dispatch failed'))).toBe(true);
      expect(ipcMain.handlers.has('ok:mcp-wiring:renderer-ready')).toBe(true);

      // Second sender (a different live WebContents) must succeed and clear
      // the one-shot.
      const second = createShowCapturingEvent();
      await ipcMain.invokeWithEvent('ok:mcp-wiring:renderer-ready', second.event);
      expect(second.captured.length).toBe(1);
      expect(second.captured[0]?.channel).toBe('ok:mcp-wiring:show');
      expect(ipcMain.handlers.has('ok:mcp-wiring:renderer-ready')).toBe(false);
    } finally {
      handle.destroy();
    }
  });

  test('second renderer-ready rejects (handler removed after first fire; one-shot)', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      const first = createShowCapturingEvent();
      const second = createShowCapturingEvent();
      await ipcMain.invokeWithEvent('ok:mcp-wiring:renderer-ready', first.event);
      expect(first.captured.length).toBe(1);
      // After the handler removes itself, a second invoke has no handler
      // and rejects — the preload-side bridge swallows that rejection.
      await expect(
        ipcMain.invokeWithEvent('ok:mcp-wiring:renderer-ready', second.event),
      ).rejects.toThrow(/no handler for ok:mcp-wiring:renderer-ready/);
      expect(second.captured.length).toBe(0);
    } finally {
      handle.destroy();
    }
  });
});

describe('runMcpWiringOnFirstLaunch — confirm flow', () => {
  test('confirm writes MCP configs, resolves bundle-absolute cliPath (no symlink), persists marker', async () => {
    const { fs } = createVirtualFs(); // no symlink → bundle-absolute
    const ipcMain = createIpcMainStub();
    const { cli, writeCalls } = createCliSurface();
    const { logger } = createCapturedLogger();
    const now = () => new Date('2026-04-23T12:34:56Z');
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      now,
      logger,
    });
    try {
      const result = await ipcMain.invoke('ok:mcp-wiring:confirm', {
        editorIds: ['claude', 'cursor'],
      });
      expect(result).toEqual({ ok: true });
      expect(writeCalls.length).toBe(1);
      const call = writeCalls[0];
      if (!call) throw new Error('no write call recorded');
      expect(call.editors).toEqual(['claude', 'cursor']);
      expect(call.cliPath).toBe(INSTALLED_BUNDLE_WRAPPER);
      expect(call.home).toBe('/Users/andrew');
      const markerRaw =
        createVirtualFs().files.get('/Users/andrew/.open-knowledge/.mcp-status.json') ?? null;
      expect(markerRaw).toBeNull(); // written to the LIVE fs, not a fresh virtual fs
      expect(readMcpStatusMarker('/Users/andrew', fs)).toEqual({
        configured: true,
        configuredAt: '2026-04-23T12:34:56.000Z',
        editors: ['claude', 'cursor'],
        cliPath: INSTALLED_BUNDLE_WRAPPER,
      });
    } finally {
      handle.destroy();
    }
  });

  test('confirm resolves /usr/local/bin/ok when M6a symlink points inside current bundle', async () => {
    const fs: McpWiringFsOps = {
      existsSync: (path) => path === SYMLINK_OK_PATH,
      readlinkSync: (path) => {
        if (path === SYMLINK_OK_PATH) return INSTALLED_BUNDLE_WRAPPER;
        throw ENOENT;
      },
      readFileSync: () => {
        throw ENOENT;
      },
      writeFileSync() {},
      mkdirSync() {},
      renameSync() {},
      unlinkSync() {},
    };
    const ipcMain = createIpcMainStub();
    const { cli, writeCalls } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['claude'] });
      const call = writeCalls[0];
      if (!call) throw new Error('no write call recorded');
      expect(call.cliPath).toBe(SYMLINK_OK_PATH);
    } finally {
      handle.destroy();
    }
  });

  test('confirm with existing canonical npx entry → force set includes that editor', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli, writeCalls } = createCliSurface({
      existingEntries: {
        claude: { command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] },
      },
    });
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['claude', 'cursor'] });
      const call = writeCalls[0];
      if (!call) throw new Error('no write call recorded');
      expect(call.force).toBeInstanceOf(Set);
      const forceSet = call.force as Set<string>;
      expect(forceSet.has('claude')).toBe(true);
      expect(forceSet.has('cursor')).toBe(false); // no existing entry → no force needed
    } finally {
      handle.destroy();
    }
  });

  test('confirm with foreign customization → force=false, emits mcp-wiring-skip-customized event', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli, writeCalls } = createCliSurface({
      existingEntries: {
        cursor: { command: 'custom-wrapper', args: ['--my-flag', 'mcp'] },
      },
    });
    const { logger, events } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['cursor'] });
      const call = writeCalls[0];
      if (!call) throw new Error('no write call recorded');
      const forceSet = call.force as Set<string>;
      expect(forceSet.has('cursor')).toBe(false);
      expect(
        events.some((e) => e.event === 'mcp-wiring-skip-customized' && e.editor === 'cursor'),
      ).toBe(true);
    } finally {
      handle.destroy();
    }
  });

  test('confirm with partial failure → returns ok:false with user-facing error, marker NOT written, emits mcp-wiring-write-failed per failed editor (Pass 0 Critical #1)', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface({
      writeResult: (call) =>
        call.editors.map((editorId) => {
          if (editorId === 'cursor') {
            return {
              editorId,
              label: EDITOR_TARGETS[editorId].label,
              action: 'failed' as const,
              configPath: '/fake/cursor/mcp.json',
              serverName: 'open-knowledge',
              error: 'EACCES: permission denied',
            };
          }
          return {
            editorId,
            label: EDITOR_TARGETS[editorId].label,
            action: 'written' as const,
            configPath: `/fake/${editorId}/config.json`,
            serverName: 'open-knowledge',
          };
        }),
    });
    const { logger, events } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      const result = (await ipcMain.invoke('ok:mcp-wiring:confirm', {
        editorIds: ['claude', 'cursor'],
      })) as { ok: boolean; error?: string };
      // Pass 0 Critical #1: previously returned `{ok:true}` which the renderer
      // store cleared the snapshot on, leaving the user with no UI signal that
      // anything failed. Now `ok:false` so the dialog body fires a sonner toast
      // before the snapshot clears.
      expect(result.ok).toBe(false);
      expect(result.error).toContain('cursor');
      expect(result.error).toContain('EACCES');
      expect(result.error).toContain('reappear on next launch');
      // Marker must NOT be written (deferred-marker per OQ-19).
      expect(readMcpStatusMarker('/Users/andrew', fs)).toBeNull();
      const failedEvents = events.filter((e) => e.event === 'mcp-wiring-write-failed');
      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0]?.editor).toBe('cursor');
      expect(failedEvents[0]?.error).toBe('EACCES: permission denied');
    } finally {
      handle.destroy();
    }
  });

  test('confirm with writeUserMcpConfigs throwing → returns ok:false, marker NOT written', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface({
      writeResult: () => {
        throw new Error('simulated write throw');
      },
    });
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      const result = (await ipcMain.invoke('ok:mcp-wiring:confirm', {
        editorIds: ['claude'],
      })) as { ok: boolean; error?: string };
      expect(result.ok).toBe(false);
      expect(result.error).toContain('simulated write throw');
      expect(readMcpStatusMarker('/Users/andrew', fs)).toBeNull();
    } finally {
      handle.destroy();
    }
  });

  test('confirm twice → second call is idempotent no-op (returns ok:true without re-writing)', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli, writeCalls } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['claude'] });
      const second = await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['cursor'] });
      expect(second).toEqual({ ok: true });
      expect(writeCalls.length).toBe(1); // second call did nothing
    } finally {
      handle.destroy();
    }
  });
});

describe('runMcpWiringOnFirstLaunch — skip flow', () => {
  test('skip writes configured:false marker, no writeUserMcpConfigs call', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli, writeCalls } = createCliSurface();
    const { logger } = createCapturedLogger();
    const now = () => new Date('2026-04-23T00:00:00Z');
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      now,
      logger,
    });
    try {
      const result = await ipcMain.invoke('ok:mcp-wiring:skip');
      expect(result).toEqual({ ok: true });
      expect(writeCalls.length).toBe(0);
      expect(readMcpStatusMarker('/Users/andrew', fs)).toEqual({
        configured: false,
        skippedAt: '2026-04-23T00:00:00.000Z',
      });
    } finally {
      handle.destroy();
    }
  });

  test('skip with marker write failure → returns ok:false with user-facing error (Pass 0 Major #9)', async () => {
    // Wrap a working virtual fs so reads succeed but writes throw — simulates
    // EACCES / EROFS on the marker path. Without this fix, the handler returned
    // `ok:true` on writeMcpStatusMarker failure; the user saw the dialog close
    // believing Skip persisted, then the dialog re-fired next boot with no
    // explanation. Now `ok:false` so the renderer surfaces a sonner toast.
    const inner = createVirtualFs();
    const fs: McpWiringFsOps = {
      ...inner.fs,
      writeFileSync() {
        throw Object.assign(new Error('EACCES: permission denied, open marker'), {
          code: 'EACCES',
        });
      },
    };
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger, errors } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      const result = (await ipcMain.invoke('ok:mcp-wiring:skip')) as {
        ok: boolean;
        error?: string;
      };
      expect(result.ok).toBe(false);
      expect(result.error).toContain('EACCES');
      expect(result.error).toContain('reappear on next launch');
      // Operator-grade structured log still fires regardless of user-facing toast.
      expect(errors.some((e) => e.msg.includes('skip-marker write failed'))).toBe(true);
    } finally {
      handle.destroy();
    }
  });

  test('skip after confirm → second call is idempotent no-op', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: [] });
      // Marker is now `configured:true, editors:[]` — exercise the idempotence
      // gate by issuing skip right after. Marker should NOT be overwritten.
      const result = await ipcMain.invoke('ok:mcp-wiring:skip');
      expect(result).toEqual({ ok: true });
      const marker = readMcpStatusMarker('/Users/andrew', fs);
      expect(marker?.configured).toBe(true); // not flipped to false
    } finally {
      handle.destroy();
    }
  });
});

describe('runMcpWiringOnFirstLaunch — handled flag concurrency (Pass 0 Major #12)', () => {
  test('racing confirm + skip while writeUserMcpConfigs is in flight → exactly one handler runs, the other returns ok:true no-op', async () => {
    // Without the `handled` flag flip happening synchronously at handler entry,
    // a rage-click of Add-then-Skip while the first write is in flight would
    // trigger TWO writeUserMcpConfigs calls and TWO competing marker writes.
    // The existing happy-path tests await between calls, which doesn't exercise
    // this race. This test stalls the write so the second invoke can land
    // before the first resolves.
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    let resolveWrite: (() => void) | null = null;
    const writePromise = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const writeCalls: WriteCall[] = [];
    const cli: McpWiringCliSurface = {
      detectInstalledEditors: () => [],
      writeUserMcpConfigs: async (call) => {
        writeCalls.push(call);
        await writePromise;
        return call.editors.map((editorId) => ({
          editorId,
          label: EDITOR_TARGETS[editorId].label,
          action: 'written' as const,
          configPath: `/fake/${editorId}/config.json`,
          serverName: 'open-knowledge',
        }));
      },
      readExistingMcpEntry: () => null,
      allEditorIds: ALL_EDITOR_IDS,
      editorTargets: EDITOR_TARGETS,
    };
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      // Fire confirm WITHOUT awaiting; immediately fire skip while confirm's
      // write is stalled. The `handled` flag MUST be flipped synchronously
      // at handler entry so skip's first line returns the no-op.
      const confirmPromise = ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['claude'] });
      const skipPromise = ipcMain.invoke('ok:mcp-wiring:skip');

      // Drain the skip first — it should resolve immediately as a no-op.
      const skipResult = await skipPromise;
      expect(skipResult).toEqual({ ok: true });

      // Now release the confirm write.
      resolveWrite?.();
      const confirmResult = await confirmPromise;
      expect(confirmResult).toEqual({ ok: true });

      // Exactly one writeUserMcpConfigs invocation must have happened.
      expect(writeCalls.length).toBe(1);

      // Marker reflects confirm — skip never wrote.
      const marker = readMcpStatusMarker('/Users/andrew', fs);
      expect(marker?.configured).toBe(true);
    } finally {
      handle.destroy();
    }
  });

  test('racing two confirm calls → exactly one writeUserMcpConfigs invocation', async () => {
    // Symmetric guard for the double-Add rage-click case.
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    let resolveWrite: (() => void) | null = null;
    const writePromise = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const writeCalls: WriteCall[] = [];
    const cli: McpWiringCliSurface = {
      detectInstalledEditors: () => [],
      writeUserMcpConfigs: async (call) => {
        writeCalls.push(call);
        await writePromise;
        return call.editors.map((editorId) => ({
          editorId,
          label: EDITOR_TARGETS[editorId].label,
          action: 'written' as const,
          configPath: `/fake/${editorId}/config.json`,
          serverName: 'open-knowledge',
        }));
      },
      readExistingMcpEntry: () => null,
      allEditorIds: ALL_EDITOR_IDS,
      editorTargets: EDITOR_TARGETS,
    };
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    try {
      const first = ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['claude'] });
      const second = ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['cursor'] });
      const secondResult = await second;
      expect(secondResult).toEqual({ ok: true });
      resolveWrite?.();
      await first;
      expect(writeCalls.length).toBe(1);
      // Marker reflects the FIRST call's editors, not the second's.
      const marker = readMcpStatusMarker('/Users/andrew', fs);
      expect((marker as { editors: string[] } | null)?.editors).toEqual(['claude']);
    } finally {
      handle.destroy();
    }
  });
});

describe('formatPartialFailureMessage (Pass 0 Critical #1)', () => {
  test('single failure → mentions the editor + error inline', () => {
    const msg = formatPartialFailureMessage(
      [{ editorId: 'cursor', error: 'EACCES: permission denied' }],
      3,
    );
    expect(msg).toContain('cursor');
    expect(msg).toContain('EACCES: permission denied');
    expect(msg).toContain('reappear on next launch');
  });

  test('multiple failures → counts + concatenates editor list', () => {
    const msg = formatPartialFailureMessage(
      [
        { editorId: 'cursor', error: 'EACCES' },
        { editorId: 'codex', error: 'invalid TOML' },
      ],
      3,
    );
    expect(msg).toContain('2 of 3');
    expect(msg).toContain('cursor');
    expect(msg).toContain('codex');
    expect(msg).toContain('1 succeeded');
  });

  test('all editors failed → no successHint', () => {
    const msg = formatPartialFailureMessage([{ editorId: 'cursor', error: 'EACCES' }], 1);
    expect(msg).not.toContain('succeeded');
  });

  test('failure without error string → omits the colon', () => {
    const msg = formatPartialFailureMessage([{ editorId: 'cursor' }], 1);
    expect(msg).toContain('cursor');
    expect(msg).not.toMatch(/cursor:\s/);
  });
});

describe('runMcpWiringOnFirstLaunch — destroy', () => {
  test('destroy removes all three handlers', () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    expect(handle.armed).toBe(true);
    expect(ipcMain.handlers.size).toBe(3);
    expect(ipcMain.handlers.has('ok:mcp-wiring:renderer-ready')).toBe(true);
    handle.destroy();
    expect(handle.armed).toBe(false);
    expect(ipcMain.handlers.size).toBe(0);
  });

  test('destroy is idempotent (calling twice does not throw)', () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
    });
    handle.destroy();
    handle.destroy();
    expect(handle.armed).toBe(false);
  });
});
