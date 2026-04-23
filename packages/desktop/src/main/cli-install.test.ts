import { describe, expect, test } from 'bun:test';
import {
  buildAdminAppleScript,
  buildInstallShellCmd,
  buildUninstallShellCmd,
  type CliInstallDeps,
  classifySymlinkState,
  type FsOps,
  getInstallStatus,
  installCli,
  isTranslocated,
  SYMLINK_PATHS,
  uninstallCli,
  wrapperPathInBundle,
} from './cli-install.ts';

/**
 * Pure-function + runtime-layer coverage for US-002 + US-003 (M6a).
 *
 * US-002 pieces (isTranslocated / wrapperPathInBundle / getInstallStatus)
 * need no `electron` import and no real filesystem. US-003 runtime wrappers
 * (`installCli` / `uninstallCli`) run with injected `dialog` + `runAsAdmin`
 * + `fs` stubs so this file still doesn't touch `osascript` or the real
 * `node:fs` — the unsigned-DMG smoke (AC1.4 / AC1.5 / AC1.7 / AC1.8) is
 * the end-to-end verification layer.
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

describe('classifySymlinkState', () => {
  test("returns { kind: 'absent' } on ENOENT", () => {
    const fs = stubFs({});
    expect(classifySymlinkState('/usr/local/bin/ok', INSTALLED_TARGET, fs)).toEqual({
      kind: 'absent',
    });
  });

  test("returns { kind: 'ours' } when symlink target matches our wrapper", () => {
    const fs = stubFs({ readlink: { '/usr/local/bin/ok': INSTALLED_TARGET } });
    expect(classifySymlinkState('/usr/local/bin/ok', INSTALLED_TARGET, fs)).toEqual({
      kind: 'ours',
    });
  });

  test("returns { kind: 'foreign-symlink' } when symlink target differs, carries the foreign target", () => {
    const fs = stubFs({
      readlink: { '/usr/local/bin/ok': '/opt/homebrew/Cellar/ok/1.2.3/bin/ok' },
    });
    expect(classifySymlinkState('/usr/local/bin/ok', INSTALLED_TARGET, fs)).toEqual({
      kind: 'foreign-symlink',
      target: '/opt/homebrew/Cellar/ok/1.2.3/bin/ok',
    });
  });

  test("returns { kind: 'foreign-file' } on EINVAL (readlink on a plain file)", () => {
    const EINVAL: NodeJS.ErrnoException = Object.assign(new Error('not a symlink'), {
      code: 'EINVAL',
    });
    const fs = stubFs({ readlink: { '/usr/local/bin/ok': EINVAL } });
    expect(classifySymlinkState('/usr/local/bin/ok', INSTALLED_TARGET, fs)).toEqual({
      kind: 'foreign-file',
    });
  });

  test("collapses other fs errors into { kind: 'foreign-file' } (conservative: prompt before stomping)", () => {
    const EACCES: NodeJS.ErrnoException = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    });
    const fs = stubFs({ readlink: { '/usr/local/bin/ok': EACCES } });
    expect(classifySymlinkState('/usr/local/bin/ok', INSTALLED_TARGET, fs)).toEqual({
      kind: 'foreign-file',
    });
  });
});

describe('buildAdminAppleScript', () => {
  test('embeds the shell command inside `do shell script "<cmd>"`', () => {
    const script = buildAdminAppleScript('ls /Applications', 'Needs admin');
    expect(script).toContain('do shell script "ls /Applications"');
  });

  test('escapes embedded double quotes in shellCmd', () => {
    const script = buildAdminAppleScript('echo "hi"', 'Prompt');
    expect(script).toContain('do shell script "echo \\"hi\\""');
    // The un-escaped `"hi"` must not appear verbatim in the cmd slot —
    // that would close the outer AppleScript literal early.
    expect(script).not.toContain('do shell script "echo "hi""');
  });

  test('escapes embedded double quotes in promptCopy', () => {
    const script = buildAdminAppleScript('ls', 'Prompt with "embedded" quotes');
    expect(script).toContain('with prompt "Prompt with \\"embedded\\" quotes"');
  });

  test('ends with the administrator privileges suffix', () => {
    expect(buildAdminAppleScript('ls', 'p')).toMatch(/with administrator privileges$/);
  });
});

describe('buildInstallShellCmd', () => {
  test('prefixes with mkdir -p /usr/local/bin to handle fresh-macOS case', () => {
    expect(buildInstallShellCmd(INSTALLED_TARGET)).toMatch(/^mkdir -p \/usr\/local\/bin && /);
  });

  test('creates symlinks for both `ok` and `open-knowledge`', () => {
    const cmd = buildInstallShellCmd(INSTALLED_TARGET);
    expect(cmd).toContain(`ln -s '${INSTALLED_TARGET}' '/usr/local/bin/ok'`);
    expect(cmd).toContain(`ln -s '${INSTALLED_TARGET}' '/usr/local/bin/open-knowledge'`);
  });

  test('rm -f precedes each ln -s so the replace case is handled', () => {
    const cmd = buildInstallShellCmd(INSTALLED_TARGET);
    // `rm -f '…/ok'` MUST come before `ln -s … '…/ok'` in the chain.
    expect(cmd.indexOf(`rm -f '/usr/local/bin/ok'`)).toBeLessThan(
      cmd.indexOf(`ln -s '${INSTALLED_TARGET}' '/usr/local/bin/ok'`),
    );
  });
});

describe('buildUninstallShellCmd', () => {
  test('emits `rm -f` for each supplied path', () => {
    expect(buildUninstallShellCmd(['/usr/local/bin/ok', '/usr/local/bin/open-knowledge'])).toBe(
      `rm -f '/usr/local/bin/ok' && rm -f '/usr/local/bin/open-knowledge'`,
    );
  });

  test('returns empty string when given no paths (upstream filtered nothing to remove)', () => {
    expect(buildUninstallShellCmd([])).toBe('');
  });
});

/**
 * Test harness for the runtime install/uninstall functions.
 *
 * Builds a DI stub that records every `dialog.showMessageBox` call and
 * scripts the returned `response` via a queue — so a test can say "first
 * prompt: Replace; second prompt: Cancel" and assert on the transcript
 * afterward. `runAsAdmin` is a recorded spy that either resolves or
 * rejects based on the `adminOutcome` flag.
 */
interface DialogCall {
  type?: string;
  message: string;
  detail?: string;
  buttons?: string[];
}

function makeDeps(opts: {
  executablePath?: string;
  fs?: FsOps;
  /** Queue of `response` numbers returned by successive showMessageBox calls.
   *  Missing entries default to 0 (Cancel). */
  responses?: number[];
  /** Whether runAsAdmin resolves (success) or rejects (user cancelled admin prompt). */
  adminOutcome?: 'ok' | 'cancel';
  /** When true, no runAsAdmin stub is installed — lets the test observe whether
   *  the runtime ever reached the admin-prompt stage. */
  omitRunAsAdmin?: boolean;
}): {
  deps: CliInstallDeps;
  dialogCalls: DialogCall[];
  adminCalls: Array<{ shellCmd: string; promptCopy: string }>;
} {
  const dialogCalls: DialogCall[] = [];
  const adminCalls: Array<{ shellCmd: string; promptCopy: string }> = [];
  const responses = opts.responses ?? [];
  let responseIdx = 0;

  const deps: CliInstallDeps = {
    executablePath: opts.executablePath ?? INSTALLED_EXE,
    dialog: {
      showMessageBox(options) {
        dialogCalls.push({
          type: options.type,
          message: options.message,
          detail: options.detail,
          buttons: options.buttons,
        });
        const response = responses[responseIdx++] ?? 0;
        return Promise.resolve({
          response,
          checkboxChecked: false,
        } satisfies { response: number; checkboxChecked: boolean });
      },
    },
    fs: opts.fs,
    runAsAdmin: opts.omitRunAsAdmin
      ? undefined
      : (shellCmd, promptCopy) => {
          adminCalls.push({ shellCmd, promptCopy });
          return opts.adminOutcome === 'cancel'
            ? Promise.reject(new Error('user cancelled'))
            : Promise.resolve();
        },
  };

  return { deps, dialogCalls, adminCalls };
}

describe('installCli', () => {
  test('aborts with warning dialog when app is translocated (never invokes osascript)', async () => {
    const { deps, dialogCalls, adminCalls } = makeDeps({
      executablePath:
        '/private/var/folders/lp/abc/AppTranslocation/UUID/d/Open Knowledge.app/Contents/MacOS/Open Knowledge',
    });
    await installCli(deps);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('warning');
    expect(dialogCalls[0].message).toContain('Applications folder');
    expect(adminCalls).toHaveLength(0);
  });

  test('aborts with error dialog when wrapper script is missing from bundle', async () => {
    const fs = stubFs({ exists: { [INSTALLED_TARGET]: false } });
    const { deps, dialogCalls, adminCalls } = makeDeps({ fs });
    await installCli(deps);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('error');
    expect(dialogCalls[0].detail).toContain(INSTALLED_TARGET);
    expect(adminCalls).toHaveLength(0);
  });

  test('prompts collision dialog for a foreign file and aborts on Cancel (no admin prompt)', async () => {
    const EINVAL: NodeJS.ErrnoException = Object.assign(new Error('not a symlink'), {
      code: 'EINVAL',
    });
    const fs = stubFs({
      readlink: { '/usr/local/bin/ok': EINVAL },
    });
    // responses[0] = 0 (Cancel) on the collision dialog for /usr/local/bin/ok
    const { deps, dialogCalls, adminCalls } = makeDeps({ fs, responses: [0] });
    await installCli(deps);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('question');
    expect(dialogCalls[0].buttons).toEqual(['Cancel', 'Replace']);
    expect(dialogCalls[0].detail).toContain('npm-installed');
    expect(adminCalls).toHaveLength(0);
  });

  test('prompts collision dialog for a foreign symlink and shows its current target', async () => {
    const fs = stubFs({
      readlink: { '/usr/local/bin/ok': '/opt/homebrew/Cellar/ok/1.2.3/bin/ok' },
    });
    const { deps, dialogCalls } = makeDeps({ fs, responses: [0] });
    await installCli(deps);
    expect(dialogCalls[0].detail).toContain('/opt/homebrew/Cellar/ok/1.2.3/bin/ok');
  });

  test('shows manual-install fallback dialog when user dismisses admin prompt', async () => {
    const fs = stubFs({}); // both paths ENOENT → no collision prompt
    const { deps, dialogCalls, adminCalls } = makeDeps({ fs, adminOutcome: 'cancel' });
    await installCli(deps);
    // Admin prompt WAS invoked once even though it was cancelled.
    expect(adminCalls).toHaveLength(1);
    expect(adminCalls[0].shellCmd).toContain('mkdir -p /usr/local/bin');
    expect(adminCalls[0].promptCopy).toMatch(/install/i);
    // One dialog — the manual-install fallback (no pre-admin collision
    // prompt because both paths are absent).
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('info');
    expect(dialogCalls[0].message).toBe('Installation cancelled.');
    expect(dialogCalls[0].detail).toContain('~/.zprofile');
    expect(dialogCalls[0].detail).toContain(
      '/Applications/Open Knowledge.app/Contents/Resources/cli/bin',
    );
  });

  test('shows success dialog after admin prompt resolves', async () => {
    const fs = stubFs({});
    const { deps, dialogCalls, adminCalls } = makeDeps({ fs, adminOutcome: 'ok' });
    await installCli(deps);
    expect(adminCalls).toHaveLength(1);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('info');
    expect(dialogCalls[0].message).toBe('Command-Line Tools installed.');
    expect(dialogCalls[0].detail).toContain('ok --version');
  });

  test('skips collision prompts entirely when both paths are already ours (idempotent re-install)', async () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
    });
    const { deps, dialogCalls, adminCalls } = makeDeps({ fs, adminOutcome: 'ok' });
    await installCli(deps);
    // No collision dialogs — only the final success dialog.
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].message).toBe('Command-Line Tools installed.');
    expect(adminCalls).toHaveLength(1);
  });
});

describe('uninstallCli', () => {
  test('shows info dialog and skips admin prompt when nothing to remove', async () => {
    const fs = stubFs({}); // both paths ENOENT
    const { deps, dialogCalls, adminCalls } = makeDeps({ fs });
    await uninstallCli(deps);
    expect(adminCalls).toHaveLength(0);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].message).toBe('Command-Line Tools are not installed.');
  });

  test('removes only symlinks we own — foreign entries untouched (G6)', async () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET, // ours
        '/usr/local/bin/open-knowledge': '/some/foreign/target', // not ours
      },
    });
    const { deps, adminCalls } = makeDeps({ fs, adminOutcome: 'ok' });
    await uninstallCli(deps);
    expect(adminCalls).toHaveLength(1);
    expect(adminCalls[0].shellCmd).toBe(`rm -f '/usr/local/bin/ok'`);
    // The foreign open-knowledge path does NOT appear in the rm command.
    expect(adminCalls[0].shellCmd).not.toContain('/usr/local/bin/open-knowledge');
  });

  test('silent no-op on admin-prompt cancel (menu label will not flip)', async () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
    });
    const { deps, dialogCalls, adminCalls } = makeDeps({ fs, adminOutcome: 'cancel' });
    await uninstallCli(deps);
    // Admin was invoked, but no success dialog surfaced (silent return).
    expect(adminCalls).toHaveLength(1);
    expect(dialogCalls).toHaveLength(0);
  });

  test('shows confirmation dialog after admin-prompt resolves', async () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
    });
    const { deps, dialogCalls, adminCalls } = makeDeps({ fs, adminOutcome: 'ok' });
    await uninstallCli(deps);
    expect(adminCalls[0].shellCmd).toContain(`rm -f '/usr/local/bin/ok'`);
    expect(adminCalls[0].shellCmd).toContain(`rm -f '/usr/local/bin/open-knowledge'`);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].message).toBe('Command-Line Tools removed.');
  });
});
