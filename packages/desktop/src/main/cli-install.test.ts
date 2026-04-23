import { describe, expect, test } from 'bun:test';
import {
  AdminFailureError,
  type AdminFailureReason,
  buildAdminAppleScript,
  buildAdminFailureError,
  buildInstallShellCmd,
  buildUninstallShellCmd,
  type CliInstallDeps,
  classifyOsascriptExitCode,
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

describe('classifyOsascriptExitCode (Pass 0 Major #7)', () => {
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

describe('buildAdminFailureError (Pass 0 Major #7)', () => {
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

  test('Pass 0 Major #11: is a real class, not an `as` cast — instanceof narrows correctly', () => {
    // Plain `Error` must NOT match the narrowing path that reads `.reason`.
    // If this slipped to `true`, the install-failure dialog would read
    // `.reason = undefined` and mis-classify plain errors as shell-error.
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

  test('Pass 0 Major #1: target paths containing apostrophes are POSIX-escaped, no shell injection', () => {
    // macOS users can rename `.app` bundles freely AND user account names can
    // contain apostrophes (e.g. `/Users/Bob's Mac/Applications/...`). Without
    // escaping, an apostrophe inside `target` closes the single-quote literal
    // early — anything after is evaluated as bash. Since the result feeds
    // `osascript ... do shell script "..." with administrator privileges`
    // (root execution), this is a real privilege-escalation surface even
    // though the user must consent at the admin prompt.
    //
    // Attacker payload: an apostrophe inside the bundle path that, without
    // escaping, would close the `'...'` literal and inject `; touch ...; echo`
    // as separate shell commands. POSIX-correct escaping replaces each `'`
    // with `'\''` (close, literal apostrophe, reopen) so the shell parses
    // the entire payload as ONE quoted string argument to `ln -s` / `rm -f`.
    const malicious =
      "/Users/foo/Downloads/My'; touch /tmp/pwned; echo '.app/Contents/Resources/cli/bin/ok.sh";
    const cmd = buildInstallShellCmd(malicious);

    // Behavioral assertion: the cmd, when fed to a shell, MUST run exactly
    // 5 statements separated by `&&` — `mkdir`, `rm -f ok`, `ln -s`,
    // `rm -f open-knowledge`, `ln -s`. Any unescaped `;` from the payload
    // would inject extra statements between the legitimate ones. We split on
    // unquoted top-level operators and count.
    expect(countTopLevelStatements(cmd)).toBe(5);

    // Structural assertion: the escaped substring must appear surrounding
    // every embedded apostrophe via the POSIX `'\''` close-escape-reopen
    // pattern. If a future refactor swaps escape strategies (e.g. shell-
    // quote pkg), this test fails — at which point a maintainer must verify
    // the new strategy is also POSIX-compliant.
    expect(cmd).toContain(`Downloads/My'\\''; touch /tmp/pwned; echo '\\''.app`);

    // Negative assertion against the most obvious naive-escape regression
    // (e.g., re-enabling unsafe template-literal interpolation). The
    // unescaped `My'; touch` shape — apostrophe followed by `;` outside
    // any escape — is exactly the byte sequence that closes `'` and starts
    // a new statement. Asserting its absence makes a regression load-bearing.
    expect(cmd).not.toMatch(/(?<!\\)My';\s*touch/);
  });

  test('plain bundle paths without apostrophes are emitted byte-identically (no over-escape)', () => {
    // Defense-in-depth — POSIX-safe escaping must not corrupt clean inputs.
    const clean = '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';
    const cmd = buildInstallShellCmd(clean);
    expect(cmd).toContain(`'${clean}'`);
    expect(cmd).not.toContain("'\\''"); // the escape sequence must not appear at all
  });
});

/**
 * Count top-level shell statements separated by `&&` outside any quoted
 * region. Used by the shell-injection regression tests to verify the
 * payload is one argument, not several. A single-quoted region in POSIX
 * shell cannot contain `'` — a literal apostrophe must close the quote,
 * escape, and reopen — so `'` toggles in/out of quote state.
 */
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

  test('Pass 0 Major #1: POSIX-escapes apostrophes in arbitrary paths', () => {
    // Defense-in-depth — uninstallCli filters via classifySymlinkState before
    // calling here, so the input list shouldn't contain hostile paths in
    // practice. But the function is exported and a future caller might pass
    // raw user-controlled paths; keep escaping symmetric with install.
    const malicious = "/usr/local/bin/foo'; rm -rf /tmp/oops; echo '";
    const cmd = buildUninstallShellCmd([malicious]);
    // Behavioral: exactly ONE statement (the rm -f). The injection's `;`
    // would split into multiple statements without escaping.
    expect(countTopLevelStatements(cmd)).toBe(1);
    // Each `'` in the input was replaced with the POSIX `'\''` close-escape-
    // reopen sequence, leaving the original `;` chars inside the quoted region.
    expect(cmd).toContain(`bin/foo'\\''; rm -rf /tmp/oops; echo '\\''`);
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
  /** Whether runAsAdmin resolves (success) or rejects, and how it rejects.
   *  - 'ok' → resolves
   *  - 'cancel' → rejects with reason='user-cancel' (Touch ID dismiss)
   *  - 'spawn-error' → rejects with reason='spawn-error' (osascript ENOENT)
   *  - 'shell-error' → rejects with reason='shell-error' (mid-flow shell fail) */
  adminOutcome?: 'ok' | 'cancel' | 'spawn-error' | 'shell-error';
  /** Stderr to surface in the AdminFailureError on `shell-error` / `spawn-error`. */
  adminStderr?: string;
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
    // Pass 0 Major #3: admin prompt names the concrete symlink paths so the
    // user sees what root will create, not a generic "install" phrasing.
    expect(adminCalls[0].promptCopy).toContain('/usr/local/bin/ok');
    expect(adminCalls[0].promptCopy).toContain('/usr/local/bin/open-knowledge');
    expect(adminCalls[0].promptCopy).toMatch(/administrator/i);
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

  test('Pass 0 Major #7: spawn-error surfaces warning dialog with stderr (NOT soft cancel copy)', async () => {
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

  test('Pass 0 Major #7: shell-error surfaces warning dialog with stderr', async () => {
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

  test('Pass 0 Major #7: user-cancel still gets the soft "cancelled" fallback (existing UX preserved)', async () => {
    const fs = stubFs({});
    const { deps, dialogCalls } = makeDeps({ fs, adminOutcome: 'cancel' });
    await installCli(deps);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].type).toBe('info');
    expect(dialogCalls[0].message).toBe('Installation cancelled.');
    // No "could not start" / "returned an error" wording — that's reserved
    // for spawn / shell errors per the new branching.
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

  test('Pass 0 Major #8: spawn-error surfaces warning with manual rm instruction', async () => {
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

  test('Pass 0 Major #8: shell-error (e.g. partial-rm) surfaces warning with stderr', async () => {
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

  test('Pass 0 Major #3: admin prompt names the concrete symlink paths on uninstall', async () => {
    const fs = stubFs({
      readlink: {
        '/usr/local/bin/ok': INSTALLED_TARGET,
        '/usr/local/bin/open-knowledge': INSTALLED_TARGET,
      },
    });
    const { deps, adminCalls } = makeDeps({ fs, adminOutcome: 'ok' });
    await uninstallCli(deps);
    // Symmetric with install — user sees what root will delete, not a
    // generic "Open Knowledge needs permission" string.
    expect(adminCalls[0].promptCopy).toContain('/usr/local/bin/ok');
    expect(adminCalls[0].promptCopy).toContain('/usr/local/bin/open-knowledge');
    expect(adminCalls[0].promptCopy).toMatch(/administrator/i);
  });
});
