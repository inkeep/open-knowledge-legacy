import { describe, expect, test } from 'bun:test';
import { EDITOR_TARGETS } from '../../../cli/src/commands/editors.ts';
import {
  computeForce,
  type ForceComputeTarget,
  type McpStatusMarker,
  type McpWiringFsOps,
  mcpStatusMarkerPath,
  readMcpStatusMarker,
  resolveCliPath,
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
