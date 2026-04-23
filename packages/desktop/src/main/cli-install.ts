/**
 * CLI-on-PATH install for D52 / M6a.
 *
 * Two layers, both in this one file:
 *
 *   1. Pure (US-002) — no `electron`, no filesystem side effects unless an
 *      `FsOps` is injected:
 *         - `isTranslocated(executablePath)`
 *         - `wrapperPathInBundle(executablePath)`
 *         - `getInstallStatus(executablePath, fs)`
 *         - `classifySymlinkState(path, ourTarget, fs)`
 *         - `buildAdminAppleScript(shellCmd, promptCopy)`
 *         - `buildInstallShellCmd(target)`
 *         - `buildUninstallShellCmd(paths)`
 *
 *   2. Runtime (US-003) — spawn `osascript` + call `dialog.showMessageBox`:
 *         - `installCli(deps)` / `uninstallCli(deps)`
 *
 * The runtime functions take their Electron surface (`dialog`) by parameter
 * rather than importing at module top, so the pure layer stays Bun-test-
 * loadable (`electron` has no named exports under the test runner) and the
 * runtime layer stays unit-testable via a DI stub.
 *
 * Pattern mirrors `menu.ts` (pure `buildMenuTemplate` + runtime
 * `installApplicationMenu`) and `url-scheme.ts` (pure `parseOpenKnowledgeUrl`
 * + runtime `registerProtocolHandler`).
 */

import { spawn } from 'node:child_process';
import { existsSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Dialog } from 'electron';

/**
 * Both symlinks our installer creates — the long form `open-knowledge` and
 * the short alias `ok`. Both point at the same wrapper inside the `.app`.
 * Ordering is not semantically meaningful; keep `ok` first so installed-state
 * inspection errors surface on the canonical name.
 */
export const SYMLINK_PATHS = ['/usr/local/bin/ok', '/usr/local/bin/open-knowledge'] as const;

/** Classifier result for `getInstallStatus`. Exported so `menu.ts` can type
 *  the `cliInstallStatus` dependency it consumes from the runtime wiring. */
export type CliInstallStatus = 'installed' | 'not-installed' | 'broken';

/**
 * Minimal `fs` surface the classifier needs. Tests inject a mock; runtime
 * passes `defaultFsOps` (below) which delegates to `node:fs`.
 */
export interface FsOps {
  /**
   * Resolve the target of a symlink. MUST throw an `ErrnoException` whose
   * `.code === 'ENOENT'` when the path does not exist — this is how the
   * classifier distinguishes "never installed" from other failure modes.
   */
  readlinkSync(path: string): string;
  /** Check whether a file exists on disk. Used to detect dangling targets. */
  existsSync(path: string): boolean;
}

/** Runtime `FsOps` — thin wrapper over `node:fs`. Runtime-only. */
const defaultFsOps: FsOps = {
  readlinkSync: (path) => readlinkSync(path),
  existsSync: (path) => existsSync(path),
};

/**
 * Detect macOS App Translocation.
 *
 * When a user launches the `.app` from a non-canonical location (a DMG
 * mount, the Downloads folder before drag-to-/Applications, or via an
 * Alfred/Raycast hot-launcher), Gatekeeper copies the bundle to a random
 * `/private/var/folders/.../AppTranslocation/<UUID>/d/...` path and runs
 * it from there. If we install a symlink INTO that path, the symlink is
 * dangling on next launch — the temp dir is gone. VS Code #209356 and
 * Zed #5276 shipped this bug; D52 requires we refuse installation instead.
 */
export function isTranslocated(executablePath: string): boolean {
  return (
    executablePath.includes('/AppTranslocation/') ||
    executablePath.startsWith('/private/var/folders/')
  );
}

/**
 * Resolve the wrapper-script path inside the `.app` bundle that both
 * symlinks should point at.
 *
 * Input shape: `.../<Bundle>.app/Contents/MacOS/<Bundle>` (the value of
 * `app.getPath('exe')` in a packaged build).
 * Output shape: `.../<Bundle>.app/Contents/Resources/cli/bin/ok.sh` — the
 * script shipped by US-001's `extraResources` entry.
 *
 * Signed+notarized builds embed this in the code-resource seal, so a
 * foreign-written `ok.sh` at this path would fail bundle verification —
 * no integrity check needed at install time.
 */
export function wrapperPathInBundle(executablePath: string): string {
  // `/Applications/Foo.app/Contents/MacOS/Foo` → `/Applications/Foo.app`
  const bundleRoot = executablePath.replace(/\/Contents\/MacOS\/.*$/, '');
  return join(bundleRoot, 'Contents', 'Resources', 'cli', 'bin', 'ok.sh');
}

/**
 * Classify the current `/usr/local/bin/{ok,open-knowledge}` symlink state.
 *
 * The menu-label flip in US-004 consumes this: `'installed'` → "Uninstall
 * Command-Line Tools"; `'not-installed'` → "Install Command-Line Tools…";
 * `'broken'` drives the launch-time repair prompt (G5 / AC1.6).
 *
 * Per SPEC AC2 of US-002, `'installed'` requires BOTH symlinks to be
 * present AND point at our wrapper path. A partial install (only `ok`
 * exists, `open-knowledge` is ENOENT) is classified `'broken'` — a half-
 * installed state is never something we want to silently accept.
 *
 * Resolution rules:
 *   - Both symlinks ENOENT → `'not-installed'`.
 *   - Both symlinks exist AND both point at `wrapperPathInBundle(exe)` AND
 *     that target exists on disk → `'installed'`.
 *   - Anything else (foreign target, dangling target, partial install,
 *     non-ENOENT fs errors) → `'broken'`.
 */
export function getInstallStatus(
  executablePath: string,
  fs: FsOps = defaultFsOps,
): CliInstallStatus {
  const target = wrapperPathInBundle(executablePath);
  let okCount = 0;
  let missingCount = 0;

  for (const symlink of SYMLINK_PATHS) {
    let linkTarget: string;
    try {
      linkTarget = fs.readlinkSync(symlink);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        missingCount++;
        continue;
      }
      // Any other error (EACCES, EINVAL from a plain file, corrupt fs) —
      // classify as broken so the user is steered to the repair flow
      // rather than an opaque install-attempt failure downstream.
      return 'broken';
    }

    if (linkTarget !== target) return 'broken'; // foreign / stale
    if (!fs.existsSync(target)) return 'broken'; // dangling — bundle moved or deleted
    okCount++;
  }

  if (missingCount === SYMLINK_PATHS.length) return 'not-installed';
  if (okCount === SYMLINK_PATHS.length) return 'installed';
  // Mixed — at least one ok + at least one missing. Partial install.
  return 'broken';
}

/**
 * Discriminated state of a single candidate symlink path.
 *
 * `installCli` dispatches per-path based on this: `absent` / `ours` are
 * silent (create or no-op), `foreign-symlink` / `foreign-file` trigger
 * the collision-prompt dialog before we stomp them. Uninstall only
 * removes paths classified `ours`, never foreign anything (G6).
 */
type SymlinkState =
  | { kind: 'ours' }
  | { kind: 'foreign-symlink'; target: string }
  | { kind: 'foreign-file' }
  | { kind: 'absent' };

/**
 * Classify what's currently at `path`, relative to the target wrapper
 * we'd want it to point at.
 *
 * `readlink` on Node semantics:
 *   - Symlink: resolves, returns its literal target string.
 *   - Plain file / directory: throws `EINVAL` (not a symlink).
 *   - Missing: throws `ENOENT`.
 *   - Permission denied / other: throws with some other `code`.
 *
 * We collapse `EINVAL` and any non-`ENOENT` failure into
 * `{ kind: 'foreign-file' }` so the collision prompt fires — the
 * conservative direction. Silently stomping a path we can't characterize
 * would be the G4 anti-pattern.
 */
export function classifySymlinkState(
  path: string,
  ourTarget: string,
  fs: FsOps = defaultFsOps,
): SymlinkState {
  try {
    const linkTarget = fs.readlinkSync(path);
    return linkTarget === ourTarget
      ? { kind: 'ours' }
      : { kind: 'foreign-symlink', target: linkTarget };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { kind: 'absent' };
    return { kind: 'foreign-file' };
  }
}

/**
 * Build the AppleScript payload that `osascript -e` evaluates to invoke
 * a shell command with administrator privileges (surfaces the macOS
 * password / Touch ID prompt).
 *
 * Both `shellCmd` and `promptCopy` are embedded inside AppleScript string
 * literals, so embedded double-quotes must be escaped as `\"` to close
 * the literal correctly. Extracted from `runAsAdmin` so the escaping
 * rule is unit-testable without spawning.
 */
export function buildAdminAppleScript(shellCmd: string, promptCopy: string): string {
  // AppleScript string literals treat `\\` as a literal backslash and `\"`
  // as a literal double-quote. Escaping MUST happen backslash-first:
  // otherwise a `\` inserted by the `"` escape gets re-escaped on the next
  // pass, corrupting the literal. macOS file paths can contain `\` (APFS /
  // HFS+ both permit it), so even though the only current caller routes
  // `shellCmd` through `shellEscapeSingleQuoted` first (which produces no
  // `\`), the exported helper's contract must be total for future callers.
  // Named `escapeAppleScriptLiteral` (not `escape`) to avoid shadowing the
  // deprecated global.
  const escapeAppleScriptLiteral = (s: string): string =>
    s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `do shell script "${escapeAppleScriptLiteral(shellCmd)}" with prompt "${escapeAppleScriptLiteral(promptCopy)}" with administrator privileges`;
}

/**
 * POSIX-safe single-quote shell escape for embedding an arbitrary string
 * inside `'...'` literals (Pass 0 Major #1).
 *
 * macOS users can rename `.app` bundles freely AND user account names can
 * contain apostrophes (e.g. `/Users/Bob's Mac/Applications/...`). Without
 * escaping, an apostrophe inside `target` closes the single-quote literal
 * early — anything after is evaluated as bash. Since the result feeds
 * `osascript ... do shell script "..." with administrator privileges`
 * (root execution), this is a real privilege-escalation surface even though
 * the user must consent at the admin prompt.
 *
 * Escape rule per POSIX shell grammar: replace each `'` inside the value
 * with `'\''` — close the quote, escape one literal apostrophe, reopen the
 * quote. The wrapper `'...'` literals around the call site stay unchanged.
 */
function shellEscapeSingleQuoted(value: string): string {
  return value.replace(/'/g, "'\\''");
}

/**
 * Build the shell command `runAsAdmin` executes on install.
 *
 *   mkdir -p /usr/local/bin && \
 *   rm -f '/usr/local/bin/ok' && ln -s '<target>' '/usr/local/bin/ok' && \
 *   rm -f '/usr/local/bin/open-knowledge' && ln -s '<target>' '/usr/local/bin/open-knowledge'
 *
 * `mkdir -p` handles the fresh-macOS-without-Homebrew case where
 * `/usr/local/bin` may not exist at all. `rm -f` handles the replace
 * case (after collision-dialog confirmation) — works whether the
 * existing entry is a symlink or a plain file.
 *
 * Both `target` and the fixed `/usr/local/bin/...` paths are routed through
 * `shellEscapeSingleQuoted` so an apostrophe in the bundle path can't
 * close-and-reopen the literal to inject root commands (Pass 0 Major #1).
 */
export function buildInstallShellCmd(target: string): string {
  const escapedTarget = shellEscapeSingleQuoted(target);
  const links = SYMLINK_PATHS.map((p) => {
    const escapedPath = shellEscapeSingleQuoted(p);
    return `rm -f '${escapedPath}' && ln -s '${escapedTarget}' '${escapedPath}'`;
  });
  return `mkdir -p /usr/local/bin && ${links.join(' && ')}`;
}

/**
 * Build the shell command `runAsAdmin` executes on uninstall — a plain
 * `rm -f` for each path we own. Callers pre-filter via
 * `classifySymlinkState(…) === 'ours'` so this never attacks a foreign
 * file. Paths are POSIX-escaped symmetric with install (Pass 0 Major #1).
 */
export function buildUninstallShellCmd(paths: readonly string[]): string {
  return paths.map((p) => `rm -f '${shellEscapeSingleQuoted(p)}'`).join(' && ');
}

/**
 * Reasons `runAsAdmin` can fail. `installCli` / `uninstallCli` branch on
 * the kind so user-cancel surfaces as the soft "Installation cancelled."
 * dialog while spawn / shell failures surface as actionable error dialogs
 * with the underlying message (Pass 0 Major #7 + #8). Without the
 * distinction the user sees identical "cancelled" copy regardless of
 * actual cause, including for the worst case (mid-install partial write
 * leaves /usr/local/bin in a broken state with no signal).
 */
export type AdminFailureReason = 'user-cancel' | 'spawn-error' | 'shell-error';

/**
 * Real class (not an `as` cast onto a plain `Error`) so consumers can
 * branch via `err instanceof AdminFailureError` and get sound narrowing of
 * `.reason` / `.stderr`. Previously constructed via
 * `new Error(msg) as AdminFailureError + mutation` which let a plain
 * `Error` from an injected `runAsAdmin` test stub silently pass through
 * the cast — consumers would then read `.reason === undefined` and fall
 * through to the `'shell-error'` default, showing users a shell-error
 * dialog for what may have been a spawn error or programmer bug. The
 * class + `instanceof` path makes the unsoundness impossible (Pass 0
 * Major #11).
 */
export class AdminFailureError extends Error {
  readonly reason: AdminFailureReason;
  /** stderr from osascript when available — surfaced in error dialogs. */
  readonly stderr?: string;
  constructor(reason: AdminFailureReason, message: string, stderr?: string) {
    super(message);
    this.name = 'AdminFailureError';
    this.reason = reason;
    if (stderr !== undefined && stderr !== '') this.stderr = stderr;
  }
}

/**
 * Construct an `AdminFailureError`. Legacy helper kept for the exported
 * unit-test surface; wraps `new AdminFailureError(...)` directly.
 */
export function buildAdminFailureError(
  reason: AdminFailureReason,
  message: string,
  stderr?: string,
): AdminFailureError {
  return new AdminFailureError(reason, message, stderr);
}

/**
 * Classify an osascript exit code. macOS conventions:
 *   - exit 1 / `-128` → AppleScript "user cancelled" (Touch ID dismiss,
 *     Cancel on the password prompt, OSA error -128). Treat as user-cancel.
 *   - other non-zero → shell command inside `do shell script` returned
 *     non-zero, OR osascript itself failed. Treat as shell-error so the
 *     stderr message reaches the user.
 */
export function classifyOsascriptExitCode(code: number | null): AdminFailureReason {
  if (code === 1) return 'user-cancel';
  return 'shell-error';
}

/**
 * Run `shellCmd` under a macOS admin privilege prompt via `osascript`.
 *
 * Rejects with `AdminFailureError` whose `reason` distinguishes:
 *   - `user-cancel` — user dismissed the Touch ID / password prompt.
 *   - `spawn-error` — `osascript` failed to launch (ENOENT / sandbox / MDM).
 *   - `shell-error` — the wrapped shell command returned non-zero (mid-
 *     install partial write, EROFS, EACCES, etc.).
 *
 * Stderr is captured and attached to the error so the caller can surface
 * it in the user-facing dialog (Pass 0 Major #7).
 */
async function defaultRunAsAdmin(shellCmd: string, promptCopy: string): Promise<void> {
  const appleScript = buildAdminAppleScript(shellCmd, promptCopy);
  return new Promise<void>((resolve, reject) => {
    const child = spawn('osascript', ['-e', appleScript]);
    let stderrBuf = '';
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrBuf += chunk.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(
        buildAdminFailureError(
          classifyOsascriptExitCode(code),
          `osascript exited with code ${code}`,
          stderrBuf.trim(),
        ),
      );
    });
    child.on('error', (err) => {
      reject(buildAdminFailureError('spawn-error', err.message));
    });
  });
}

/**
 * Dependencies for the runtime install/uninstall flows (US-003).
 *
 * `executablePath` is what Electron's `app.getPath('exe')` returns —
 * `/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge` for a
 * canonical install. `dialog` is narrowed via `Pick` so tests can inject
 * a minimal stub. `runAsAdmin` and `fs` default to real implementations
 * so production callers can pass just `{ executablePath, dialog }`.
 */
export interface CliInstallDeps {
  executablePath: string;
  dialog: Pick<Dialog, 'showMessageBox'>;
  runAsAdmin?: (shellCmd: string, promptCopy: string) => Promise<void>;
  fs?: FsOps;
}

/**
 * Install `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge` symlinks
 * pointing at the bundled wrapper. Full flow (each step able to abort):
 *
 *   1. Refuse if the `.app` is App-Translocated (Gatekeeper sandbox).
 *      Symlinks into a random `/private/var/folders/…` path would break
 *      on next launch when the temp dir vanishes.
 *   2. Verify the wrapper script exists in the bundle. Catches the
 *      "extraResources didn't ship ok.sh" build regression early — we
 *      refuse to install a dangling symlink.
 *   3. Classify each target path; if any is a foreign symlink or non-
 *      symlink file (likely npm-installed `ok`), prompt Cancel/Replace.
 *      Cancel aborts the whole flow.
 *   4. Run the `mkdir -p && rm -f && ln -s` shell under an admin prompt.
 *      If the user dismisses the prompt, show a manual-PATH fallback
 *      dialog — silent completion (per OQ-7, lower-surprise option).
 *   5. On success, confirm with a "open a new terminal and run
 *      `ok --version`" dialog.
 */
export async function installCli(deps: CliInstallDeps): Promise<void> {
  const fs = deps.fs ?? defaultFsOps;
  const runAsAdmin = deps.runAsAdmin ?? defaultRunAsAdmin;

  if (isTranslocated(deps.executablePath)) {
    await deps.dialog.showMessageBox({
      type: 'warning',
      message: 'Please move Open Knowledge to your Applications folder first.',
      detail:
        'Open Knowledge is running from a temporary location. Command-Line Tools can only be installed when the app is in /Applications. Move the app using Finder and try again.',
      buttons: ['OK'],
    });
    return;
  }

  const target = wrapperPathInBundle(deps.executablePath);
  if (!fs.existsSync(target)) {
    await deps.dialog.showMessageBox({
      type: 'error',
      message: 'Command-Line Tools wrapper is missing from this build.',
      detail: `Expected: ${target}`,
      buttons: ['OK'],
    });
    return;
  }

  for (const path of SYMLINK_PATHS) {
    const state = classifySymlinkState(path, target, fs);
    if (state.kind === 'ours' || state.kind === 'absent') continue;
    const detail =
      state.kind === 'foreign-symlink'
        ? `The existing symlink points at: ${state.target}\n\nReplace it with the Open Knowledge bundled CLI?`
        : 'This is likely an npm-installed ok binary. Replace it with the bundled CLI?';
    const { response } = await deps.dialog.showMessageBox({
      type: 'question',
      message: `Another file exists at ${path}.`,
      detail,
      buttons: ['Cancel', 'Replace'],
      cancelId: 0,
      defaultId: 0,
    });
    if (response === 0) return;
  }

  const shellCmd = buildInstallShellCmd(target);
  // Admin-prompt copy names the destination paths so the user sees what
  // root will write. VS Code's "Install code command in PATH" lists its
  // path too; Docker Desktop's helper enumerates its writes. A bare
  // "install the Command-Line Tools" string, when the user later finds a
  // rogue symlink at /usr/local/bin/ok from a different app, gives no
  // audit trail for why they granted root access (Pass 0 Major #3).
  try {
    await runAsAdmin(
      shellCmd,
      `Open Knowledge will create symlinks at ${SYMLINK_PATHS.join(' and ')} so you can run 'ok' from your terminal. This requires administrator access.`,
    );
  } catch (err) {
    // Distinguish user-cancel from spawn-error / shell-error so the user
    // sees actionable copy instead of "cancelled" for every failure mode
    // (Pass 0 Major #7). user-cancel → soft manual-install fallback dialog;
    // spawn-error / shell-error → red error dialog with the underlying
    // message AND the manual-install fallback so the user has a path
    // forward. `instanceof` narrowing (Pass 0 Major #11) — an injected
    // `runAsAdmin` stub that throws a plain `Error` falls through to the
    // shell-error branch with the underlying message preserved, instead of
    // silently masquerading as one of our three classified reasons.
    const adminErr = err instanceof AdminFailureError ? err : null;
    const reason: AdminFailureReason = adminErr?.reason ?? 'shell-error';
    const stderr = adminErr?.stderr ?? '';
    const binDir = target.replace(/\/ok\.sh$/, '');
    if (reason === 'user-cancel') {
      await deps.dialog.showMessageBox({
        type: 'info',
        message: 'Installation cancelled.',
        detail:
          `You can install manually by adding this to your ~/.zprofile:\n\n` +
          `  export PATH="$PATH:${binDir}"\n\n` +
          `Then restart your terminal.`,
        buttons: ['OK'],
      });
      return;
    }
    // spawn-error / shell-error — surface the underlying signal. A
    // shell-error mid-flow can leave /usr/local/bin half-written; the
    // launch-time G5 repair hook will re-detect and offer recovery on
    // next boot, but the user deserves to know NOW.
    const detailLines = [
      `The installer ${reason === 'spawn-error' ? 'could not start' : 'returned an error'}.`,
      stderr ? `\nDetails: ${stderr}` : '',
      `\nYou can install manually by adding this to your ~/.zprofile:\n\n  export PATH="$PATH:${binDir}"\n\nThen restart your terminal.`,
    ];
    console.warn('[cli-install] admin install failed', { reason, message: adminErr?.message });
    await deps.dialog.showMessageBox({
      type: 'warning',
      message: 'Could not install Command-Line Tools.',
      detail: detailLines.join(''),
      buttons: ['OK'],
    });
    return;
  }

  await deps.dialog.showMessageBox({
    type: 'info',
    message: 'Command-Line Tools installed.',
    detail:
      'Open a new terminal window and run `ok --version` to verify. Both `ok` and `open-knowledge` are available.',
    buttons: ['OK'],
  });
}

/**
 * Uninstall — remove only symlinks whose `readlink` target equals OUR
 * wrapper path (G6: foreign files untouched). Empty-toRemove path shows
 * an info dialog rather than silently succeeding, so the user knows the
 * menu click wasn't a no-op due to UI lag.
 */
export async function uninstallCli(deps: CliInstallDeps): Promise<void> {
  const fs = deps.fs ?? defaultFsOps;
  const runAsAdmin = deps.runAsAdmin ?? defaultRunAsAdmin;

  const target = wrapperPathInBundle(deps.executablePath);
  const toRemove = SYMLINK_PATHS.filter((p) => classifySymlinkState(p, target, fs).kind === 'ours');

  if (toRemove.length === 0) {
    await deps.dialog.showMessageBox({
      type: 'info',
      message: 'Command-Line Tools are not installed.',
      buttons: ['OK'],
    });
    return;
  }

  const shellCmd = buildUninstallShellCmd(toRemove);
  try {
    // Symmetric-with-install copy (Pass 0 Major #3): name the paths so the
    // user sees what root will delete.
    await runAsAdmin(
      shellCmd,
      `Open Knowledge will remove the symlinks at ${toRemove.join(' and ')}. This requires administrator access.`,
    );
  } catch (err) {
    // user-cancel → silent no-op (the menu label stays "Uninstall", user
    // can click again). spawn-error / shell-error → surface a warning so
    // the user knows the menu click landed somewhere bad — without this,
    // a partial-uninstall (e.g., `ok` removed but `open-knowledge` failed)
    // leaves the install in a 'broken' state with no signal that anything
    // happened (Pass 0 Major #8). `instanceof` narrowing (Pass 0 Major #11):
    // plain `Error` from an injected `runAsAdmin` falls to shell-error with
    // its message preserved rather than silently adopting `.reason = undefined`.
    const adminErr = err instanceof AdminFailureError ? err : null;
    const reason: AdminFailureReason = adminErr?.reason ?? 'shell-error';
    if (reason === 'user-cancel') return;
    const stderr = adminErr?.stderr ?? '';
    console.warn('[cli-install] admin uninstall failed', {
      reason,
      message: adminErr?.message,
    });
    await deps.dialog.showMessageBox({
      type: 'warning',
      message: 'Could not remove Command-Line Tools.',
      detail: [
        `The uninstaller ${reason === 'spawn-error' ? 'could not start' : 'returned an error'}.`,
        stderr ? `\nDetails: ${stderr}` : '',
        `\nIf needed, remove manually:\n\n  sudo rm /usr/local/bin/ok /usr/local/bin/open-knowledge`,
      ].join(''),
      buttons: ['OK'],
    });
    return;
  }

  await deps.dialog.showMessageBox({
    type: 'info',
    message: 'Command-Line Tools removed.',
    buttons: ['OK'],
  });
}

// ---------------------------------------------------------------------------
// Launch-time broken-symlink repair (G5 / AC1.6 — extracted per Pass 1 Major #4)
// ---------------------------------------------------------------------------

/**
 * Dependencies for `createBrokenSymlinkRepairHandler`. All Electron touches
 * are injected so the handler is bun-test loadable without spinning up an
 * Electron runtime. Mirrors `CliInstallDeps` + the existing DI pattern from
 * `mcp-wiring.runMcpWiringOnFirstLaunch`.
 *
 * `getStatus` defaults to `getInstallStatus` and is exposed as a dep so a
 * test can synthesize 'broken' / 'installed' / 'not-installed' without
 * stubbing the full `FsOps` surface. `refreshMenu` runs after a successful
 * repair so the `File → Uninstall Command-Line Tools…` label reflects the
 * newly-installed state.
 *
 * Pass 1 Major #4 rationale: this function is privilege-escalation-adjacent
 * (the Repair branch leads to an osascript admin prompt). Inline in
 * `main/index.ts` it had ZERO test coverage — a regression that dropped
 * `!isPackaged` would install dev-path symlinks into the user's
 * `/usr/local/bin`, and the M6 e2e runs unpackaged with `OK_M6B_FORCE` so
 * it couldn't catch packaging-gate regressions either. The factory + DI
 * pattern unlocks deterministic unit coverage.
 */
export interface BrokenSymlinkRepairDeps {
  executablePath: string;
  platform: NodeJS.Platform | string;
  /** `app.isPackaged` — packaging-gate. Dev mode must never offer repair
   *  because `app.getPath('exe')` resolves to the electron dev binary and
   *  a prior DMG's symlinks would always classify 'broken' against it;
   *  running the repair would install dev-path symlinks into the user's
   *  system (M6a analogue of M6b's STOP_IF (e) contamination guard). */
  isPackaged: boolean;
  dialog: Pick<Dialog, 'showMessageBox'>;
  /** Callable-once installer for the Repair branch. Defaults to `installCli`
   *  in production; injected as a stub in tests so we can assert it fires
   *  without actually spawning osascript. */
  install: (deps: CliInstallDeps) => Promise<void>;
  /** Rebuild the application menu after a successful repair so the label
   *  flips from "Install Command-Line Tools…" to "Uninstall Command-Line
   *  Tools". Injected so tests can assert the ordering (refresh AFTER
   *  install resolves). */
  refreshMenu: () => void;
  getStatus?: (executablePath: string) => CliInstallStatus;
  /**
   * Per-bundle dismissal token (Pass 1 Major #3). A value of
   * `<appVersion>:<executablePath>` means the user dismissed the repair
   * modal on THIS bundle — skip silently. An auto-update or app-move
   * shifts the computed token, invalidating any prior dismissal so the
   * modal fires once against the new bundle. Null means no prior dismiss.
   * Tests pass a matching / non-matching token to exercise both branches.
   */
  getDismissedToken?: () => string | null;
  /**
   * Persist the dismissal token when the user clicks Skip on the modal.
   * The value passed is the same `<appVersion>:<executablePath>` shape
   * that `getDismissedToken` returns — constructed in `index.ts`'s
   * runtime wrapper so tests don't need to know the format.
   */
  setDismissedToken?: (token: string) => void;
  /**
   * Version string forming the first half of the dismissal token
   * (`app.getVersion()` in production). Injected so tests can assert
   * post-update re-prompt without stubbing Electron's `app`.
   */
  appVersion?: string;
}

/**
 * Factory that returns an async handler fit for `app.whenReady().then(...)`.
 * Called once per boot; the internal guards (`platform`, `isPackaged`,
 * `status === 'broken'`, dismissal-token match) short-circuit to a no-op
 * on every path except the one it was designed for — drag-to-Trash-then-
 * reinstall recovery on a packaged macOS build the user hasn't opted out
 * of for THIS bundle.
 *
 * Pass 2 Major #3: per-bundle dismissal token — users who don't care
 * about CLI tools can Skip once and stay un-nagged for the life of that
 * bundle. Auto-update shifts `appVersion`; app-move shifts
 * `executablePath`; either rebuilds the token, so the prompt fires once
 * on the new bundle. Rationale in `BrokenSymlinkRepairDeps`.
 *
 * Pass 1 Major #3 flipped `defaultId` to 0 (Skip) so Enter-reflex is safe.
 */
export function createBrokenSymlinkRepairHandler(
  deps: BrokenSymlinkRepairDeps,
): () => Promise<void> {
  const getStatus = deps.getStatus ?? getInstallStatus;
  return async () => {
    if (deps.platform !== 'darwin') return;
    if (!deps.isPackaged) return;
    const status = getStatus(deps.executablePath);
    if (status !== 'broken') return;

    // Per-bundle dismissal gate (Pass 2 Major #3). The token shape
    // `<appVersion>:<executablePath>` means auto-update (version shift)
    // OR app-move (exe path shift) invalidates a prior dismissal — the
    // modal fires once on the new bundle, respects Skip for the rest
    // of that bundle's life. Optional dep so the simpler callers +
    // existing tests don't need to plumb it.
    const currentToken =
      deps.appVersion !== undefined ? `${deps.appVersion}:${deps.executablePath}` : null;
    if (currentToken !== null && deps.getDismissedToken?.() === currentToken) {
      return;
    }

    const { response } = await deps.dialog.showMessageBox({
      type: 'question',
      message: 'Command-Line Tools are broken — repair?',
      detail:
        "The Command-Line Tools for Open Knowledge point at a path that's no longer valid. This happens if the app was moved or reinstalled from a new DMG. Repair to re-link them at this bundle, or skip to dismiss.",
      buttons: ['Skip', 'Repair'],
      cancelId: 0,
      // Pass 1 Major #3: Enter-default = Skip. Repair leads into the
      // osascript admin-password prompt — a user reflexively dismissing
      // a startup modal with Enter should land on the no-op path, not
      // on a root-write they didn't intend.
      defaultId: 0,
    });
    if (response === 0) {
      // Skip — persist the per-bundle dismissal token if the caller
      // plumbed it in. Without setDismissedToken the skip is per-boot
      // only (prior behavior).
      if (currentToken !== null) deps.setDismissedToken?.(currentToken);
      return;
    }
    // response === 1 → Repair.
    await deps.install({ executablePath: deps.executablePath, dialog: deps.dialog });
    deps.refreshMenu();
  };
}
