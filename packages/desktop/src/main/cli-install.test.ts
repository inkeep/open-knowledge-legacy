import { describe, expect, test } from 'bun:test';
import {
  AdminFailureError,
  type AdminFailureReason,
  type BrokenSymlinkRepairDeps,
  buildAdminAppleScript,
  buildAdminFailureError,
  buildInstallShellCmd,
  buildUninstallShellCmd,
  type CliInstallDeps,
  type CliInstallStatus,
  classifyOsascriptExitCode,
  classifySymlinkState,
  createBrokenSymlinkRepairHandler,
  type FsOps,
  getInstallStatus,
  installCli,
  isTranslocated,
  SYMLINK_PATHS,
  uninstallCli,
  wrapperPathInBundle,
} from './cli-install.ts';

const INSTALLED_EXE = '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge';
const INSTALLED_TARGET = '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';

const ENOENT: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), {
  code: 'ENOENT',
});

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

describe('classifyOsascriptExitCode', () => {
  test("exit 1 → 'user-cancel' (Touch ID dismiss / OSA error -128)", () => {
    expect(classifyOsascriptExitCode(1)).toBe('user-cancel');
  });

  test("any other non-zero exit → 'shell-error'", () => {
    expect(classifyOsascriptExitCode(2)).toBe('shell-error');
    expect(classifyOsascriptExitCode(127)).toBe('shell-error');
    expect(classifyOsascriptExitCode(-1)).toBe('shell-error');
  });

  test("null exit code → 'shell-error' (signal-killed / unknown)", () => {
    expect(classifyOsascriptExitCode(null)).toBe('shell-error');
  });
});

describe('buildAdminFailureError', () => {
  test('shapes the error with reason + message + optional stderr', () => {
    const err: AdminFailureError = buildAdminFailureError(
      'shell-error',
      'osascript exited with code 2',
      'rm: /usr/local/bin/ok: EROFS',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe('shell-error');
    expect(err.message).toBe('osascript exited with code 2');
    expect(err.stderr).toBe('rm: /usr/local/bin/ok: EROFS');
  });

  test('omits stderr when caller passes empty string (avoids confusing "Details:" with empty body)', () => {
    const err = buildAdminFailureError('user-cancel', 'cancelled', '');
    expect(err.stderr).toBeUndefined();
  });

  test('omits stderr when caller passes undefined', () => {
    const err = buildAdminFailureError('spawn-error', 'ENOENT');
    expect(err.stderr).toBeUndefined();
  });

  test('is a real class, not an `as` cast — instanceof narrows correctly', () => {
    const plain = new Error('boom');
    expect(plain instanceof AdminFailureError).toBe(false);
    const classified = buildAdminFailureError('spawn-error', 'boom');
    expect(classified instanceof AdminFailureError).toBe(true);
    expect(classified instanceof Error).toBe(true);
    expect(classified.name).toBe('AdminFailureError');
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
    expect(script).not.toContain('do shell script "echo "hi""');
  });

  test('escapes embedded double quotes in promptCopy', () => {
    const script = buildAdminAppleScript('ls', 'Prompt with "embedded" quotes');
    expect(script).toContain('with prompt "Prompt with \\"embedded\\" quotes"');
  });

  test('ends with the administrator privileges suffix', () => {
    expect(buildAdminAppleScript('ls', 'p')).toMatch(/with administrator privileges$/);
  });

  test('escapes embedded backslashes before double-quotes (total-contract invariant)', () => {
    const script = buildAdminAppleScript('ls /Users/Bob\\Mac/app', 'Needs admin');
    expect(script).toContain('do shell script "ls /Users/Bob\\\\Mac/app"');
  });

  test('escapes embedded newlines so multi-line prompt/shell inputs stay on one AppleScript literal (PR #289 review)', () => {
    const script = buildAdminAppleScript('echo a\nb', 'line1\nline2');
    expect(script).toContain('do shell script "echo a\\nb"');
    expect(script).toContain('with prompt "line1\\nline2"');
    expect(script).not.toContain('\n');
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
    expect(cmd.indexOf(`rm -f '/usr/local/bin/ok'`)).toBeLessThan(
      cmd.indexOf(`ln -s '${INSTALLED_TARGET}' '/usr/local/bin/ok'`),
    );
  });

  test('target paths containing apostrophes are POSIX-escaped — no shell injection', () => {
    const malicious =
      "/Users/foo/Downloads/My'; touch /tmp/pwned; echo '.app/Contents/Resources/cli/bin/ok.sh";
    const cmd = buildInstallShellCmd(malicious);

    expect(countTopLevelStatements(cmd)).toBe(5);

    expect(cmd).toContain(`Downloads/My'\\''; touch /tmp/pwned; echo '\\''.app`);

    expect(cmd).not.toMatch(/(?<!\\)My';\s*touch/);
  });

  test('plain bundle paths without apostrophes are emitted byte-identically (no over-escape)', () => {
    const clean = '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';
    const cmd = buildInstallShellCmd(clean);
    expect(cmd).toContain(`'${clean}'`);
    expect(cmd).not.toContain("'\\''"); // the escape sequence must not appear at all
  });
});

function countTopLevelStatements(cmd: string): number {
  let inQuote = false;
  let count = 1;
  for (let i = 0; i < cmd.length; i++) {
    if (cmd[i] === "'") {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && cmd[i] === '&' && cmd[i + 1] === '&') {
      count++;
      i++;
    }
  }
  return count;
}

describe('buildUninstallShellCmd', () => {
  test('emits `rm -f` for each supplied path', () => {
    expect(buildUninstallShellCmd(['/usr/local/bin/ok', '/usr/local/bin/open-knowledge'])).toBe(
      `rm -f '/usr/local/bin/ok' && rm -f '/usr/local/bin/open-knowledge'`,
    );
  });

  test('returns empty string when given no paths (upstream filtered nothing to remove)', () => {
    expect(buildUninstallShellCmd([])).toBe('');
  });

  test('POSIX-escapes apostrophes in arbitrary paths (shell-injection guard)', () => {
    const malicious = "/usr/local/bin/foo'; rm -rf /tmp/oops; echo '";
    const cmd = buildUninstallShellCmd([malicious]);
    expect(countTopLevelStatements(cmd)).toBe(1);
    expect(cmd).toContain(`bin/foo'\\''; rm -rf /tmp/oops; echo '\\''`);
  });
});

interface DialogCall {
  type?: string;
  message: string;
  detail?: string;
  buttons?: string[];
}

function makeDeps(opts: {
  executablePath?: string;
  fs?: FsOps;
  responses?: number[];
  adminOutcome?: 'ok' | 'cancel' | 'spawn-error' | 'shell-error';
  adminStderr?: string;
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

  const reasonForOutcome = (outcome: typeof opts.adminOutcome): AdminFailureReason => {
    if (outcome === 'cancel') return 'user-cancel';
    if (outcome === 'spawn-error') return 'spawn-error';
    return 'shell-error';
  };

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
          if (opts.adminOutcome === 'ok' || opts.adminOutcome === undefined) {
            return Promise.resolve();
          }
          const reason = reasonForOutcome(opts.adminOutcome);
          return Promise.reject(
            buildAdminFailureError(reason, `osascript reason=${reason}`, opts.adminStderr),
          );
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
    expect(adminCalls).toHaveLength(1);
    expect(adminCalls[0].shellCmd).toContain('mkdir -p /usr/local/bin');
    expect(adminCalls[0].promptCopy).toContain('/usr/local/bin/ok');
    expect(adminCalls[0].promptCopy).toContain('/usr/local/bin/open-knowledge');
    expect(adminCalls[0].promptCopy).toMatch(/administrator/i);
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

  test('spawn-error surfaces warning dialog with stderr (NOT soft cancel copy)', async () => {
    const fs = stubFs({});
    const { deps, dialogCalls } = makeDeps({
      fs,
      adminOutcome: 'spawn-error',
      adminStderr: 'osascript: command not found',
    });
    await installCli(deps);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('warning');
    expect(dialogCalls[0].message).toBe('Could not install Command-Line Tools.');
    expect(dialogCalls[0].detail).toContain('could not start');
    expect(dialogCalls[0].detail).toContain('osascript: command not found');
    expect(dialogCalls[0].detail).toContain('~/.zprofile');
  });

  test('shell-error surfaces warning dialog with stderr', async () => {
    const fs = stubFs({});
    const { deps, dialogCalls } = makeDeps({
      fs,
      adminOutcome: 'shell-error',
      adminStderr: 'mkdir: /usr/local/bin: Read-only file system',
    });
    await installCli(deps);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('warning');
    expect(dialogCalls[0].message).toBe('Could not install Command-Line Tools.');
    expect(dialogCalls[0].detail).toContain('returned an error');
    expect(dialogCalls[0].detail).toContain('Read-only file system');
  });

  test('user-cancel still gets the soft "cancelled" fallback (existing UX preserved)', async () => {
    const fs = stubFs({});
    const { deps, dialogCalls } = makeDeps({ fs, adminOutcome: 'cancel' });
    await installCli(deps);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('info');
    expect(dialogCalls[0].message).toBe('Installation cancelled.');
    expect(dialogCalls[0].detail).not.toContain('could not start');
    expect(dialogCalls[0].detail).not.toContain('returned an error');
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
    expect(adminCalls).toHaveLength(1);
    expect(dialogCalls).toHaveLength(0);
  });

  test('spawn-error surfaces warning with manual rm instruction', async () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
    });
    const { deps, dialogCalls } = makeDeps({
      fs,
      adminOutcome: 'spawn-error',
      adminStderr: 'osascript missing',
    });
    await uninstallCli(deps);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('warning');
    expect(dialogCalls[0].message).toBe('Could not remove Command-Line Tools.');
    expect(dialogCalls[0].detail).toContain('could not start');
    expect(dialogCalls[0].detail).toContain(
      'sudo rm /usr/local/bin/ok /usr/local/bin/open-knowledge',
    );
  });

  test('shell-error (e.g. partial-rm) surfaces warning with stderr', async () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
    });
    const { deps, dialogCalls } = makeDeps({
      fs,
      adminOutcome: 'shell-error',
      adminStderr: 'rm: /usr/local/bin/ok: Operation not permitted',
    });
    await uninstallCli(deps);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('warning');
    expect(dialogCalls[0].message).toBe('Could not remove Command-Line Tools.');
    expect(dialogCalls[0].detail).toContain('returned an error');
    expect(dialogCalls[0].detail).toContain('Operation not permitted');
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

  test('admin prompt names the concrete symlink paths on uninstall', async () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
    });
    const { deps, adminCalls } = makeDeps({ fs, adminOutcome: 'ok' });
    await uninstallCli(deps);
    expect(adminCalls[0].promptCopy).toContain('/usr/local/bin/ok');
    expect(adminCalls[0].promptCopy).toContain('/usr/local/bin/open-knowledge');
    expect(adminCalls[0].promptCopy).toMatch(/administrator/i);
  });
});

describe('createBrokenSymlinkRepairHandler', () => {
  interface StubDeps {
    deps: BrokenSymlinkRepairDeps;
    dialogCalls: DialogCall[];
    installCalls: CliInstallDeps[];
    refreshCalls: number;
  }

  function makeRepairDeps(
    opts: {
      platform?: NodeJS.Platform | string;
      isPackaged?: boolean;
      status?: CliInstallStatus;
      response?: number;
      appVersion?: string;
      getDismissedToken?: () => string | null;
      setDismissedToken?: (token: string) => void;
    } = {},
  ): StubDeps {
    const dialogCalls: DialogCall[] = [];
    const installCalls: CliInstallDeps[] = [];
    let refreshCalls = 0;
    const deps: BrokenSymlinkRepairDeps = {
      executablePath: INSTALLED_EXE,
      platform: opts.platform ?? 'darwin',
      isPackaged: opts.isPackaged ?? true,
      dialog: {
        showMessageBox(options) {
          dialogCalls.push({
            type: options.type,
            message: options.message,
            detail: options.detail,
            buttons: options.buttons,
          });
          return Promise.resolve({
            response: opts.response ?? 0,
            checkboxChecked: false,
          } satisfies { response: number; checkboxChecked: boolean });
        },
      },
      install: async (d) => {
        installCalls.push(d);
      },
      refreshMenu: () => {
        refreshCalls++;
      },
      getStatus: () => opts.status ?? 'broken',
      ...(opts.appVersion !== undefined ? { appVersion: opts.appVersion } : {}),
      ...(opts.getDismissedToken !== undefined
        ? { getDismissedToken: opts.getDismissedToken }
        : {}),
      ...(opts.setDismissedToken !== undefined
        ? { setDismissedToken: opts.setDismissedToken }
        : {}),
    };
    return {
      deps,
      dialogCalls,
      installCalls,
      get refreshCalls() {
        return refreshCalls;
      },
    } as StubDeps;
  }

  test('no-op when platform !== "darwin" (Windows/Linux deferred)', async () => {
    const { deps, dialogCalls, installCalls } = makeRepairDeps({ platform: 'win32' });
    const handler = createBrokenSymlinkRepairHandler(deps);
    await handler();
    expect(dialogCalls).toHaveLength(0);
    expect(installCalls).toHaveLength(0);
  });

  test('no-op when !isPackaged (dev-mode contamination guard)', async () => {
    const { deps, dialogCalls, installCalls } = makeRepairDeps({ isPackaged: false });
    const handler = createBrokenSymlinkRepairHandler(deps);
    await handler();
    expect(dialogCalls).toHaveLength(0);
    expect(installCalls).toHaveLength(0);
  });

  test("no-op when status !== 'broken' (no prompt on fresh install)", async () => {
    const { deps, dialogCalls, installCalls } = makeRepairDeps({ status: 'not-installed' });
    const handler = createBrokenSymlinkRepairHandler(deps);
    await handler();
    expect(dialogCalls).toHaveLength(0);
    expect(installCalls).toHaveLength(0);
  });

  test("no-op when status is 'installed' (happy path)", async () => {
    const { deps, dialogCalls, installCalls } = makeRepairDeps({ status: 'installed' });
    const handler = createBrokenSymlinkRepairHandler(deps);
    await handler();
    expect(dialogCalls).toHaveLength(0);
    expect(installCalls).toHaveLength(0);
  });

  test("fires repair prompt when platform=darwin + isPackaged=true + status='broken'", async () => {
    const stub = makeRepairDeps({ status: 'broken', response: 0 });
    const handler = createBrokenSymlinkRepairHandler(stub.deps);
    await handler();
    expect(stub.dialogCalls).toHaveLength(1);
    expect(stub.dialogCalls[0].type).toBe('question');
    expect(stub.dialogCalls[0].message).toBe('Command-Line Tools are broken — repair?');
    expect(stub.dialogCalls[0].buttons).toEqual(['Skip', 'Repair']);
  });

  test('Skip response (0) does NOT invoke installCli or refresh menu', async () => {
    const stub = makeRepairDeps({ status: 'broken', response: 0 });
    const handler = createBrokenSymlinkRepairHandler(stub.deps);
    await handler();
    expect(stub.installCalls).toHaveLength(0);
    expect(stub.refreshCalls).toBe(0);
  });

  test('Repair response (1) invokes installCli with executablePath + dialog, then refreshes menu', async () => {
    const stub = makeRepairDeps({ status: 'broken', response: 1 });
    const handler = createBrokenSymlinkRepairHandler(stub.deps);
    await handler();
    expect(stub.installCalls).toHaveLength(1);
    expect(stub.installCalls[0].executablePath).toBe(INSTALLED_EXE);
    expect(stub.installCalls[0].dialog).toBe(stub.deps.dialog);
    expect(stub.refreshCalls).toBe(1);
  });

  test('menu refresh fires AFTER installCli resolves (ordering invariant)', async () => {
    const order: string[] = [];
    const deps: BrokenSymlinkRepairDeps = {
      executablePath: INSTALLED_EXE,
      platform: 'darwin',
      isPackaged: true,
      dialog: {
        showMessageBox() {
          return Promise.resolve({ response: 1, checkboxChecked: false });
        },
      },
      install: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('install');
      },
      refreshMenu: () => {
        order.push('refresh');
      },
      getStatus: () => 'broken',
    };
    await createBrokenSymlinkRepairHandler(deps)();
    expect(order).toEqual(['install', 'refresh']);
  });

  test('defaultId=0 so Enter-default is Skip (safe cancel path)', async () => {
    const stub = makeRepairDeps({ status: 'broken', response: 0 });
    const handler = createBrokenSymlinkRepairHandler(stub.deps);
    await handler();
    const captured: Parameters<Dialog['showMessageBox']>[0][] = [];
    const probingDeps: BrokenSymlinkRepairDeps = {
      ...stub.deps,
      dialog: {
        showMessageBox(options) {
          captured.push(options);
          return Promise.resolve({ response: 0, checkboxChecked: false });
        },
      },
    };
    await createBrokenSymlinkRepairHandler(probingDeps)();
    expect(captured).toHaveLength(1);
    expect(captured[0].cancelId).toBe(0);
    expect(captured[0].defaultId).toBe(0);
  });

  test('falls back to production getInstallStatus when getStatus dep is omitted', async () => {
    const dialogCalls: DialogCall[] = [];
    const deps: BrokenSymlinkRepairDeps = {
      executablePath: INSTALLED_EXE,
      platform: 'darwin',
      isPackaged: false,
      dialog: {
        showMessageBox(options) {
          dialogCalls.push({
            type: options.type,
            message: options.message,
            buttons: options.buttons,
          });
          return Promise.resolve({ response: 0, checkboxChecked: false });
        },
      },
      install: async () => {},
      refreshMenu: () => {},
    };
    await createBrokenSymlinkRepairHandler(deps)();
    expect(dialogCalls).toHaveLength(0);
  });

  test('short-circuits when dismissed token matches current token', async () => {
    const currentToken = `0.1.0:${INSTALLED_EXE}`;
    const stub = makeRepairDeps({
      status: 'broken',
      response: 0, // irrelevant — dialog should never fire
      appVersion: '0.1.0',
      getDismissedToken: () => currentToken,
    });
    const handler = createBrokenSymlinkRepairHandler(stub.deps);
    await handler();
    expect(stub.dialogCalls).toHaveLength(0);
    expect(stub.installCalls).toHaveLength(0);
    expect(stub.refreshCalls).toBe(0);
  });

  test('dismissed token mismatch (different version) still fires dialog', async () => {
    const staleToken = `0.1.0:${INSTALLED_EXE}`;
    const stub = makeRepairDeps({
      status: 'broken',
      response: 0, // Skip
      appVersion: '0.1.1', // NEW version → token is `0.1.1:${INSTALLED_EXE}`
      getDismissedToken: () => staleToken,
    });
    const handler = createBrokenSymlinkRepairHandler(stub.deps);
    await handler();
    expect(stub.dialogCalls).toHaveLength(1);
  });

  test('Skip (response=0) persists dismissal token via setDismissedToken', async () => {
    let savedToken: string | null = null;
    const stub = makeRepairDeps({
      status: 'broken',
      response: 0, // Skip
      appVersion: '0.1.0',
      getDismissedToken: () => null,
      setDismissedToken: (t) => {
        savedToken = t;
      },
    });
    const handler = createBrokenSymlinkRepairHandler(stub.deps);
    await handler();
    expect(savedToken).toBe(`0.1.0:${INSTALLED_EXE}`);
    expect(stub.installCalls).toHaveLength(0);
    expect(stub.refreshCalls).toBe(0);
  });

  test('Repair (response=1) does NOT persist dismissal token', async () => {
    let savedToken: string | null = null;
    const stub = makeRepairDeps({
      status: 'broken',
      response: 1, // Repair
      appVersion: '0.1.0',
      getDismissedToken: () => null,
      setDismissedToken: (t) => {
        savedToken = t;
      },
    });
    const handler = createBrokenSymlinkRepairHandler(stub.deps);
    await handler();
    expect(savedToken).toBeNull();
    expect(stub.installCalls).toHaveLength(1);
    expect(stub.refreshCalls).toBe(1);
  });

  test('dismissal plumbing absent → prompt fires per-boot (back-compat)', async () => {
    const stub = makeRepairDeps({ status: 'broken', response: 0 });
    const handler = createBrokenSymlinkRepairHandler(stub.deps);
    await handler();
    expect(stub.dialogCalls).toHaveLength(1);
    await handler();
    expect(stub.dialogCalls).toHaveLength(2);
  });
});
