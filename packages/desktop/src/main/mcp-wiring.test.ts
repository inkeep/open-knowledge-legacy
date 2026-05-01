import { describe, expect, test } from 'bun:test';
import { ALL_EDITOR_IDS, EDITOR_TARGETS } from '@inkeep/open-knowledge';
import {
  type ForceComputeTarget,
  formatPartialFailureMessage,
  type IpcMainEventLike,
  type IpcMainLike,
  isPublishedCanonical,
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

const INSTALLED_EXE = '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge';
const INSTALLED_BUNDLE_WRAPPER =
  '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';

const ENOENT: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
const EINVAL: NodeJS.ErrnoException = Object.assign(new Error('EINVAL'), { code: 'EINVAL' });

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
  test('resolves to <home>/.ok/mcp-status.json', () => {
    expect(mcpStatusMarkerPath('/Users/andrew')).toBe('/Users/andrew/.ok/mcp-status.json');
  });
});

describe('readMcpStatusMarker', () => {
  test('returns null when marker file is absent', () => {
    const { fs } = createVirtualFs();
    expect(readMcpStatusMarker('/Users/andrew', fs)).toBeNull();
  });

  test('returns null when marker is unparseable JSON', () => {
    const { fs, files } = createVirtualFs();
    files.set('/Users/andrew/.ok/mcp-status.json', 'not-json{{{');
    expect(readMcpStatusMarker('/Users/andrew', fs)).toBeNull();
  });

  test('returns null when shape is neither configured:true nor configured:false', () => {
    const { fs, files } = createVirtualFs();
    files.set('/Users/andrew/.ok/mcp-status.json', JSON.stringify({ foo: 'bar' }));
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
    files.set('/Users/andrew/.ok/mcp-status.json', JSON.stringify(marker));
    expect(readMcpStatusMarker('/Users/andrew', fs)).toEqual(marker);
  });

  test('returns parsed configured:false skip marker', () => {
    const { fs, files } = createVirtualFs();
    const marker: McpStatusMarker = {
      configured: false,
      skippedAt: '2026-04-23T00:00:00Z',
    };
    files.set('/Users/andrew/.ok/mcp-status.json', JSON.stringify(marker));
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
    expect(dirs.has('/Users/andrew/.ok')).toBe(true);
    const written = files.get('/Users/andrew/.ok/mcp-status.json');
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
    const written = files.get('/Users/andrew/.ok/mcp-status.json');
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
    const written = files.get('/Users/andrew/.ok/mcp-status.json');
    if (written === undefined) throw new Error('marker not written');
    expect(written.endsWith('\n')).toBe(true);
  });

  test('write is atomic via tmp+rename (no stray .tmp on success)', () => {
    const { fs, files } = createVirtualFs();
    writeMcpStatusMarker(
      '/Users/andrew',
      { configured: false, skippedAt: '2026-04-23T00:00:00Z' },
      fs,
    );
    const canonical = '/Users/andrew/.ok/mcp-status.json';
    expect(files.has(canonical)).toBe(true);
    const strayTmps = [...files.keys()].filter((p) => p.startsWith(`${canonical}.tmp-`));
    expect(strayTmps).toEqual([]);
  });

  test('rename failure cleans up the .tmp sibling and rethrows', () => {
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
    const strayTmps = [...files.keys()].filter((p) => p.includes('.tmp-'));
    expect(strayTmps).toEqual([]);
    expect(files.has('/Users/andrew/.ok/mcp-status.json')).toBe(false);
  });
});

describe('resolveCliPath — hybrid symlink-or-bundle resolution', () => {
  test('returns bundle-absolute when /usr/local/bin/ok does not exist', () => {
    const fs = stubFsForResolve({ symlinkPresent: false });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(INSTALLED_BUNDLE_WRAPPER);
  });

  test('returns bundle-absolute when readlinkSync throws EINVAL (plain file at symlink path)', () => {
    const fs = stubFsForResolve({ symlinkPresent: true, readlinkResult: EINVAL });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(INSTALLED_BUNDLE_WRAPPER);
  });

  test('returns /usr/local/bin/ok when symlink target equals bundle wrapper (canonical install)', () => {
    const fs = stubFsForResolve({
      symlinkPresent: true,
      readlinkResult: INSTALLED_BUNDLE_WRAPPER,
    });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(SYMLINK_OK_PATH);
  });

  test('returns /usr/local/bin/ok when symlink target lives anywhere under the current bundle', () => {
    const fs = stubFsForResolve({
      symlinkPresent: true,
      readlinkResult:
        '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/universal-wrapper.sh',
    });
    expect(resolveCliPath(INSTALLED_EXE, fs)).toBe(SYMLINK_OK_PATH);
  });

  test('returns bundle-absolute when symlink target lives outside the current bundle (foreign/stale)', () => {
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
    const fs = stubFsForResolve({
      symlinkPresent: true,
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

describe('isPublishedCanonical — exact canonical-shape predicate', () => {
  const claude = EDITOR_TARGETS.claude;
  const vscode = EDITOR_TARGETS.vscode;

  test('Fixture A — canonical published npx shape → true (Claude)', () => {
    const existing: Record<string, unknown> = {
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    };
    expect(isPublishedCanonical(existing, claude)).toBe(true);
  });

  test('Fixture A — canonical published npx shape → true (VS Code with type:stdio)', () => {
    const existing: Record<string, unknown> = {
      type: 'stdio',
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    };
    expect(isPublishedCanonical(existing, vscode)).toBe(true);
  });

  test('Fixture C — canonical + user-augmented env → true', () => {
    const existing: Record<string, unknown> = {
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
      env: { OK_LOG_LEVEL: 'debug' },
    };
    expect(isPublishedCanonical(existing, claude)).toBe(true);
  });

  test('historical -y variant → false (foreign-customized; left alone)', () => {
    const existing: Record<string, unknown> = {
      command: 'npx',
      args: ['-y', '@inkeep/open-knowledge', 'mcp'],
    };
    expect(isPublishedCanonical(existing, claude)).toBe(false);
  });

  test('prior cliPath shape (bundle-absolute) → false (foreign-customized; left alone)', () => {
    const existing: Record<string, unknown> = {
      command: '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh',
      args: ['mcp'],
    };
    expect(isPublishedCanonical(existing, claude)).toBe(false);
  });

  test('prior cliPath shape (symlink /usr/local/bin/ok) → false (foreign-customized)', () => {
    const existing: Record<string, unknown> = {
      command: '/usr/local/bin/ok',
      args: ['mcp'],
    };
    expect(isPublishedCanonical(existing, claude)).toBe(false);
  });

  test('Entry with non-string command → false', () => {
    const existing: Record<string, unknown> = { command: 42, args: ['mcp'] };
    expect(isPublishedCanonical(existing, claude)).toBe(false);
  });

  test('Entry with non-array args → false', () => {
    const existing: Record<string, unknown> = { command: 'npx', args: 'mcp' };
    expect(isPublishedCanonical(existing, claude)).toBe(false);
  });

  test('Empty shape → false (no command match)', () => {
    const existing: Record<string, unknown> = {};
    expect(isPublishedCanonical(existing, claude)).toBe(false);
  });

  test('Accepts any structurally-compatible target (interface assignability)', () => {
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
      isPublishedCanonical(
        { command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] },
        minimalTarget,
      ),
    ).toBe(true);
    expect(isPublishedCanonical({ command: 'custom', args: ['foo'] }, minimalTarget)).toBe(false);
  });
});

interface IpcMainStub extends IpcMainLike {
  handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>>;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  invokeWithEvent(channel: string, event: unknown, ...args: unknown[]): Promise<unknown>;
  bindSender(id?: number): Promise<Array<{ channel: string; args: unknown[] }>>;
}

function createIpcMainStub(): IpcMainStub {
  const handlers = new Map<
    string,
    (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
  >();
  let boundSenderId: number | null = null;
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
      const senderId = boundSenderId ?? 999;
      return handler({ sender: { id: senderId } }, ...args);
    },
    async invokeWithEvent(channel, event, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return handler(event, ...args);
    },
    async bindSender(id = 1): Promise<Array<{ channel: string; args: unknown[] }>> {
      const readyHandler = handlers.get('ok:mcp-wiring:renderer-ready');
      if (!readyHandler) {
        throw new Error('renderer-ready handler not registered — bindSender must run after arm');
      }
      const captured: Array<{ channel: string; args: unknown[] }> = [];
      const event = {
        sender: {
          id,
          send(channel: string, ...args: unknown[]) {
            captured.push({ channel, args });
          },
        },
      };
      await readyHandler(event);
      boundSenderId = id;
      return captured;
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

  test('returns inert handle when !isPackaged and OK_M6B_FORCE unset (dev-mode contamination guard)', () => {
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

  test('returns inert handle when executablePath does not match .app/Contents/MacOS/<name>', () => {
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
      '/Users/andrew/.ok/mcp-status.json',
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
      '/Users/andrew/.ok/mcp-status.json',
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

  test('forceShow bypasses marker-present gate and arms dispatch', () => {
    const { fs, files } = createVirtualFs();
    files.set(
      '/Users/andrew/.ok/mcp-status.json',
      JSON.stringify({
        configured: true,
        configuredAt: '2026-01-01T00:00:00Z',
        editors: ['claude'],
        cliPath: '/usr/local/bin/ok',
      }),
    );
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface({ detected: ['claude'] });
    const { logger, infos } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli,
      fs,
      logger,
      forceShow: true,
    });
    try {
      expect(handle.armed).toBe(true);
      expect(infos.some((m) => m.msg.includes('forceShow — ignoring prior marker'))).toBe(true);
    } finally {
      handle.destroy();
    }
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
        detectedEditors: Array<{
          id: string;
          label: string;
          detected: boolean;
          willReplace: boolean;
        }>;
      };
      expect(payload.detectedEditors.length).toBe(ALL_EDITOR_IDS.length);
      const claude = payload.detectedEditors.find((d) => d.id === 'claude');
      const cursor = payload.detectedEditors.find((d) => d.id === 'cursor');
      const vscode = payload.detectedEditors.find((d) => d.id === 'vscode');
      expect(claude?.detected).toBe(true);
      expect(cursor?.detected).toBe(true);
      expect(vscode?.detected).toBe(false);
      expect(claude?.willReplace).toBe(false);
      expect(cursor?.willReplace).toBe(false);
      expect(vscode?.willReplace).toBe(false);
    } finally {
      handle.destroy();
    }
  });

  test('willReplace=true when existing OK-managed entry is present', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface({
      detected: ['claude', 'cursor'],
      existingEntries: {
        claude: { command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] },
        cursor: { command: 'custom-wrapper', args: ['mcp'] },
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
      const { event, captured } = createShowCapturingEvent();
      await ipcMain.invokeWithEvent('ok:mcp-wiring:renderer-ready', event);
      const payload = captured[0]?.args[0] as {
        detectedEditors: Array<{
          id: string;
          label: string;
          detected: boolean;
          willReplace: boolean;
        }>;
      };
      const claude = payload.detectedEditors.find((d) => d.id === 'claude');
      const cursor = payload.detectedEditors.find((d) => d.id === 'cursor');
      const vscode = payload.detectedEditors.find((d) => d.id === 'vscode');
      expect(claude?.willReplace).toBe(true);
      expect(cursor?.willReplace).toBe(false);
      expect(vscode?.willReplace).toBe(false);
    } finally {
      handle.destroy();
    }
  });

  test('readExistingMcpEntry throw per-editor tolerated, willReplace defaults to false', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const throwingCli: McpWiringCliSurface = {
      detectInstalledEditors: () => ['claude'],
      writeUserMcpConfigs: async () => [],
      readExistingMcpEntry: (id) => {
        if (id === 'claude') throw new Error('simulated read failure');
        return null;
      },
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
      cli: throwingCli,
      fs,
      logger,
    });
    try {
      const { event, captured } = createShowCapturingEvent();
      await ipcMain.invokeWithEvent('ok:mcp-wiring:renderer-ready', event);
      const payload = captured[0]?.args[0] as {
        detectedEditors: Array<{ id: string; willReplace: boolean }>;
      };
      const claude = payload.detectedEditors.find((d) => d.id === 'claude');
      expect(claude?.willReplace).toBe(false);
      expect(handle.armed).toBe(true);
    } finally {
      handle.destroy();
    }
  });

  test('failed dispatch keeps handler armed for next renderer-ready invoke', async () => {
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
      await ipcMain.bindSender();
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
      const markerRaw = createVirtualFs().files.get('/Users/andrew/.ok/mcp-status.json') ?? null;
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

  test('confirm resolves /usr/local/bin/ok when CLI symlink points inside current bundle', async () => {
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
      await ipcMain.bindSender();
      await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['claude'] });
      const call = writeCalls[0];
      if (!call) throw new Error('no write call recorded');
      expect(call.cliPath).toBe(SYMLINK_OK_PATH);
    } finally {
      handle.destroy();
    }
  });

  test('confirm with existing canonical npx entry → editor is included in the write call', async () => {
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
      await ipcMain.bindSender();
      await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['claude', 'cursor'] });
      const call = writeCalls[0];
      if (!call) throw new Error('no write call recorded');
      expect(call.editors).toContain('claude');
      expect(call.editors).toContain('cursor');
    } finally {
      handle.destroy();
    }
  });

  test('confirm with foreign customization → editor is excluded from the write call + emits mcp-wiring-skip-customized event', async () => {
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
      await ipcMain.bindSender();
      await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['cursor'] });
      expect(
        events.some((e) => e.event === 'mcp-wiring-skip-customized' && e.editor === 'cursor'),
      ).toBe(true);
      for (const call of writeCalls) {
        expect(call.editors).not.toContain('cursor');
      }
    } finally {
      handle.destroy();
    }
  });

  test('confirm with partial failure → returns ok:false with user-facing error, marker NOT written, emits mcp-wiring-write-failed per failed editor', async () => {
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
      await ipcMain.bindSender();
      const result = (await ipcMain.invoke('ok:mcp-wiring:confirm', {
        editorIds: ['claude', 'cursor'],
      })) as { ok: boolean; error?: string };
      expect(result.ok).toBe(false);
      expect(result.error).toContain('cursor');
      expect(result.error).toContain('EACCES');
      expect(result.error).toContain('reappear on next launch');
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
      await ipcMain.bindSender();
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

  test('confirm with marker write failure → returns ok:false, writes succeeded but marker absent, handled reset for retry', async () => {
    const MARKER_PATH = '/Users/andrew/.ok/mcp-status.json';
    const inner = createVirtualFs();
    const fs: McpWiringFsOps = {
      ...inner.fs,
      writeFileSync(path, content) {
        if (path.includes('mcp-status.json')) {
          throw Object.assign(new Error('EACCES: permission denied, open marker'), {
            code: 'EACCES',
          });
        }
        inner.fs.writeFileSync(path, content);
      },
      renameSync(oldPath, newPath) {
        if (newPath.includes('mcp-status.json')) {
          throw Object.assign(new Error('EACCES: permission denied, rename marker'), {
            code: 'EACCES',
          });
        }
        inner.fs.renameSync(oldPath, newPath);
      },
    };
    const ipcMain = createIpcMainStub();
    const { cli, writeCalls } = createCliSurface({ detected: ['claude'] });
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
      await ipcMain.bindSender();
      const result = (await ipcMain.invoke('ok:mcp-wiring:confirm', {
        editorIds: ['claude'],
      })) as { ok: boolean; error?: string };
      expect(result.ok).toBe(false);
      expect(result.error).toContain('EACCES');
      expect(writeCalls.length).toBe(1); // CLI write fired before the marker attempt
      expect(inner.files.has(MARKER_PATH)).toBe(false); // marker NOT persisted
      expect(errors.some((e) => e.msg.includes('marker write failed'))).toBe(true);
      const retryHandle = runMcpWiringOnFirstLaunch({
        isPackaged: true,
        executablePath: INSTALLED_EXE,
        home: '/Users/andrew',
        platform: 'darwin',
        ipcMain: createIpcMainStub(), // fresh ipc so handler re-registers
        cli: createCliSurface({ detected: ['claude'] }).cli,
        fs: inner.fs, // healthy fs
        logger: createCapturedLogger().logger,
      });
      retryHandle.destroy();
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
      await ipcMain.bindSender();
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
      await ipcMain.bindSender();
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

  test('skip with marker write failure → returns ok:false with user-facing error', async () => {
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
      await ipcMain.bindSender();
      const result = (await ipcMain.invoke('ok:mcp-wiring:skip')) as {
        ok: boolean;
        error?: string;
      };
      expect(result.ok).toBe(false);
      expect(result.error).toContain('EACCES');
      expect(result.error).toContain('reappear on next launch');
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
      await ipcMain.bindSender();
      await ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: [] });
      const result = await ipcMain.invoke('ok:mcp-wiring:skip');
      expect(result).toEqual({ ok: true });
      const marker = readMcpStatusMarker('/Users/andrew', fs);
      expect(marker?.configured).toBe(true); // not flipped to false
    } finally {
      handle.destroy();
    }
  });
});

describe('runMcpWiringOnFirstLaunch — handled flag concurrency', () => {
  test('racing confirm + skip while writeUserMcpConfigs is in flight → exactly one handler runs, the other returns ok:true no-op', async () => {
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
      await ipcMain.bindSender();
      const confirmPromise = ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['claude'] });
      const skipPromise = ipcMain.invoke('ok:mcp-wiring:skip');

      const skipResult = await skipPromise;
      expect(skipResult).toEqual({ ok: true });

      resolveWrite?.();
      const confirmResult = await confirmPromise;
      expect(confirmResult).toEqual({ ok: true });

      expect(writeCalls.length).toBe(1);

      const marker = readMcpStatusMarker('/Users/andrew', fs);
      expect(marker?.configured).toBe(true);
    } finally {
      handle.destroy();
    }
  });

  test('racing two confirm calls → exactly one writeUserMcpConfigs invocation', async () => {
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
      await ipcMain.bindSender();
      const first = ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['claude'] });
      const second = ipcMain.invoke('ok:mcp-wiring:confirm', { editorIds: ['cursor'] });
      const secondResult = await second;
      expect(secondResult).toEqual({ ok: true });
      resolveWrite?.();
      await first;
      expect(writeCalls.length).toBe(1);
      const marker = readMcpStatusMarker('/Users/andrew', fs);
      expect((marker as { editors: string[] } | null)?.editors).toEqual(['claude']);
    } finally {
      handle.destroy();
    }
  });
});

describe('formatPartialFailureMessage', () => {
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

describe('runMcpWiringOnFirstLaunch — sender binding', () => {
  test('confirm from an unbound sender is rejected with "Consent must come from..." copy', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli, writeCalls } = createCliSurface();
    const { logger, warns } = createCapturedLogger();
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
      expect(result.error).toContain('Consent must come from the window');
      expect(writeCalls).toHaveLength(0);
      expect(warns.some((w) => w.msg.includes('rejecting confirm'))).toBe(true);
    } finally {
      handle.destroy();
    }
  });

  test('skip from an unbound sender is rejected and does not write the skip marker', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger, warns } = createCapturedLogger();
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
      expect(result.error).toContain('Consent must come from the window');
      expect(readMcpStatusMarker('/Users/andrew', fs)).toBeNull();
      expect(warns.some((w) => w.msg.includes('rejecting skip'))).toBe(true);
    } finally {
      handle.destroy();
    }
  });

  test('confirm from a DIFFERENT sender than the one that received show is rejected', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const { cli } = createCliSurface();
    const { logger, warns } = createCapturedLogger();
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
      await ipcMain.bindSender(1);
      const differentSenderEvent = { sender: { id: 42 } };
      const result = (await ipcMain.invokeWithEvent('ok:mcp-wiring:confirm', differentSenderEvent, {
        editorIds: ['claude'],
      })) as { ok: boolean; error?: string };
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Consent must come from the window');
      const rejectionWarn = warns.find((w) => w.msg.includes('rejecting confirm'));
      expect(rejectionWarn).toBeDefined();
      expect(
        (rejectionWarn?.ctx as { capturedSenderId?: number } | undefined)?.capturedSenderId,
      ).toBe(1);
      expect((rejectionWarn?.ctx as { gotSenderId?: number } | undefined)?.gotSenderId).toBe(42);
    } finally {
      handle.destroy();
    }
  });

  test('after sender-binding succeeds, confirm from the same sender passes the gate', async () => {
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
      await ipcMain.bindSender(7);
      const result = (await ipcMain.invoke('ok:mcp-wiring:confirm', {
        editorIds: ['claude'],
      })) as { ok: boolean };
      expect(result.ok).toBe(true);
      expect(writeCalls).toHaveLength(1);
    } finally {
      handle.destroy();
    }
  });
});

describe('runMcpWiringOnFirstLaunch — handled flag reset enables same-boot retry', () => {
  test('partial failure → second confirm with all-passing fixtures writes marker (proves handled was reset)', async () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    let callCount = 0;
    const cli: McpWiringCliSurface = {
      detectInstalledEditors: () => [],
      writeUserMcpConfigs: async (call) => {
        callCount++;
        return call.editors.map((editorId) => {
          if (callCount === 1 && editorId === 'cursor') {
            return {
              editorId,
              label: EDITOR_TARGETS[editorId].label,
              action: 'failed' as const,
              configPath: '/fake/cursor/mcp.json',
              serverName: 'open-knowledge',
              error: 'EACCES on first attempt',
            };
          }
          return {
            editorId,
            label: EDITOR_TARGETS[editorId].label,
            action: 'written' as const,
            configPath: `/fake/${editorId}/config.json`,
            serverName: 'open-knowledge',
          };
        });
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
      await ipcMain.bindSender();
      const first = (await ipcMain.invoke('ok:mcp-wiring:confirm', {
        editorIds: ['claude', 'cursor'],
      })) as { ok: boolean; error?: string };
      expect(first.ok).toBe(false);
      expect(readMcpStatusMarker('/Users/andrew', fs)).toBeNull();
      const second = (await ipcMain.invoke('ok:mcp-wiring:confirm', {
        editorIds: ['claude', 'cursor'],
      })) as { ok: boolean };
      expect(second.ok).toBe(true);
      expect(callCount).toBe(2); // both calls actually ran
      expect(readMcpStatusMarker('/Users/andrew', fs)?.configured).toBe(true);
    } finally {
      handle.destroy();
    }
  });

  test('skip failure → second skip succeeds (handled reset on skip path too)', async () => {
    let attempts = 0;
    const inner = createVirtualFs();
    const fs: McpWiringFsOps = {
      ...inner.fs,
      writeFileSync(path, content) {
        attempts++;
        if (attempts === 1) {
          throw Object.assign(new Error('EACCES first attempt'), { code: 'EACCES' });
        }
        inner.fs.writeFileSync(path, content);
      },
    };
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
      await ipcMain.bindSender();
      const first = (await ipcMain.invoke('ok:mcp-wiring:skip')) as {
        ok: boolean;
        error?: string;
      };
      expect(first.ok).toBe(false);
      const second = (await ipcMain.invoke('ok:mcp-wiring:skip')) as { ok: boolean };
      expect(second.ok).toBe(true);
      expect(attempts).toBe(2);
      expect(readMcpStatusMarker('/Users/andrew', inner.fs)?.configured).toBe(false);
    } finally {
      handle.destroy();
    }
  });
});

describe('runMcpWiringOnFirstLaunch — detection try/catch', () => {
  test('missing editorTargets entry → returns inert handle + emits mcp-wiring-detect-failed', () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const brokenCli: McpWiringCliSurface = {
      detectInstalledEditors: () => [],
      writeUserMcpConfigs: async () => [],
      readExistingMcpEntry: () => null,
      allEditorIds: [...ALL_EDITOR_IDS, 'phantom' as (typeof ALL_EDITOR_IDS)[number]],
      editorTargets: EDITOR_TARGETS, // lacks the 'phantom' entry
    };
    const { logger, errors, events } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli: brokenCli,
      fs,
      logger,
    });
    expect(handle.armed).toBe(false);
    expect(ipcMain.handlers.size).toBe(0);
    expect(errors.some((e) => e.msg.includes('detection failed'))).toBe(true);
    const detectFailed = events.find((e) => e.event === 'mcp-wiring-detect-failed');
    expect(detectFailed).toBeDefined();
    expect(detectFailed?.error).toContain('phantom');
  });

  test('detectInstalledEditors throw → returns inert handle, event fires', () => {
    const { fs } = createVirtualFs();
    const ipcMain = createIpcMainStub();
    const throwingCli: McpWiringCliSurface = {
      detectInstalledEditors: () => {
        throw new Error('detectInstalledEditors exploded');
      },
      writeUserMcpConfigs: async () => [],
      readExistingMcpEntry: () => null,
      allEditorIds: ALL_EDITOR_IDS,
      editorTargets: EDITOR_TARGETS,
    };
    const { logger, events } = createCapturedLogger();
    const handle = runMcpWiringOnFirstLaunch({
      isPackaged: true,
      executablePath: INSTALLED_EXE,
      home: '/Users/andrew',
      platform: 'darwin',
      ipcMain,
      cli: throwingCli,
      fs,
      logger,
    });
    expect(handle.armed).toBe(false);
    expect(ipcMain.handlers.size).toBe(0);
    expect(
      events.some(
        (e) =>
          e.event === 'mcp-wiring-detect-failed' &&
          typeof e.error === 'string' &&
          e.error.includes('detectInstalledEditors exploded'),
      ),
    ).toBe(true);
  });
});
