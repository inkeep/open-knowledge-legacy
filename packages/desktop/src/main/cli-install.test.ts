import { describe, expect, test } from 'bun:test';
import {
  type FsOps,
  getInstallStatus,
  isTranslocated,
  SYMLINK_PATHS,
  wrapperPathInBundle,
} from './cli-install.ts';

/**
 * Pure-function coverage for US-002 (M6a).
 *
 * Runtime wrappers (`installCli`/`uninstallCli`) and their osascript admin
 * prompts are exercised by the US-013 unsigned-DMG manual smoke + US-003's
 * runtime layer tests — not here. This file proves the Bun-test-friendly
 * boundary: no `electron` import, no real filesystem reads.
 */

const INSTALLED_EXE = '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge';
const INSTALLED_TARGET = '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';

// ENOENT error shaped like Node's fs throws it, so the classifier's
// `.code === 'ENOENT'` check fires on the "never installed" path.
const ENOENT: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), {
  code: 'ENOENT',
});

/**
 * Build an `FsOps` stub from simple maps of each symlink path's behavior.
 * Anything not named in `readlink` throws ENOENT (matches real fs semantics
 * when the path doesn't exist). Anything not named in `exists` returns true
 * (covers the happy path where the symlink target is present on disk).
 */
function stubFs(opts: {
  readlink?: Record<string, string | Error>;
  exists?: Record<string, boolean>;
}): FsOps {
  const readlink = opts.readlink ?? {};
  const exists = opts.exists ?? {};
  return {
    readlinkSync(path) {
      const entry = readlink[path];
      if (entry === undefined) throw ENOENT;
      if (entry instanceof Error) throw entry;
      return entry;
    },
    existsSync(path) {
      return path in exists ? exists[path] === true : true;
    },
  };
}

describe('isTranslocated', () => {
  test('detects /AppTranslocation/ prefix', () => {
    expect(
      isTranslocated(
        '/private/var/folders/lp/abc/T/AppTranslocation/UUID/d/Open Knowledge.app/Contents/MacOS/Open Knowledge',
      ),
    ).toBe(true);
  });

  test('detects /private/var/folders path without explicit AppTranslocation token', () => {
    expect(
      isTranslocated(
        '/private/var/folders/lp/xyz/Open Knowledge.app/Contents/MacOS/Open Knowledge',
      ),
    ).toBe(true);
  });

  test('accepts canonical /Applications install', () => {
    expect(isTranslocated(INSTALLED_EXE)).toBe(false);
  });

  test('accepts per-user ~/Applications install', () => {
    expect(
      isTranslocated('/Users/andrew/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge'),
    ).toBe(false);
  });
});

describe('wrapperPathInBundle', () => {
  test('resolves wrapper path from canonical /Applications executable', () => {
    expect(wrapperPathInBundle(INSTALLED_EXE)).toBe(INSTALLED_TARGET);
  });

  test('resolves wrapper path when bundle contains spaces', () => {
    // Spec path contains `Open Knowledge.app`; guards against regex
    // greediness on the space.
    expect(wrapperPathInBundle(INSTALLED_EXE)).toContain('/Open Knowledge.app/');
  });

  test('resolves wrapper path for per-user ~/Applications install', () => {
    expect(
      wrapperPathInBundle(
        '/Users/andrew/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge',
      ),
    ).toBe('/Users/andrew/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh');
  });
});

describe('getInstallStatus', () => {
  test("returns 'not-installed' when both symlinks are ENOENT", () => {
    const fs = stubFs({});
    expect(getInstallStatus(INSTALLED_EXE, fs)).toBe('not-installed');
  });

  test("returns 'installed' when both symlinks point at our wrapper AND target exists", () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
    });
    expect(getInstallStatus(INSTALLED_EXE, fs)).toBe('installed');
  });

  test("returns 'broken' when a symlink points at a foreign target", () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': '/usr/local/bin/some-other-ok',
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
    });
    expect(getInstallStatus(INSTALLED_EXE, fs)).toBe('broken');
  });

  test("returns 'broken' when symlink points at our target but file is missing on disk (drag-to-Trash)", () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
      exists: { [INSTALLED_TARGET]: false },
    });
    expect(getInstallStatus(INSTALLED_EXE, fs)).toBe('broken');
  });

  test("returns 'broken' on partial install (one symlink ok, the other ENOENT)", () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        // open-knowledge omitted → ENOENT from the stub
      },
    });
    expect(getInstallStatus(INSTALLED_EXE, fs)).toBe('broken');
  });

  test("returns 'broken' when readlinkSync throws non-ENOENT error (e.g. EACCES)", () => {
    const EACCES: NodeJS.ErrnoException = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    });
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': EACCES,
      },
    });
    expect(getInstallStatus(INSTALLED_EXE, fs)).toBe('broken');
  });

  test('inspects both canonical symlink paths', () => {
    // Belt-and-suspenders — if SYMLINK_PATHS is ever reordered or extended,
    // this test surfaces the impact on consumers of the classifier.
    expect(SYMLINK_PATHS).toEqual(['/usr/local/bin/ok', '/usr/local/bin/open-knowledge']);
  });
});
