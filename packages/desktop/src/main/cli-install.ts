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

/** Classifier result for `getInstallStatus`. */
type CliInstallStatus = 'installed' | 'not-installed' | 'broken';

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
  const escapedCmd = shellCmd.replace(/"/g, '\\"');
  const escapedPrompt = promptCopy.replace(/"/g, '\\"');
  return `do shell script "${escapedCmd}" with prompt "${escapedPrompt}" with administrator privileges`;
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
 * Single-quoted paths are shell-safe for our controlled input (our
 * bundle-internal target path + the fixed `/usr/local/bin/…` targets).
 * Bundle names with embedded single quotes would break this, but our
 * product name is `Open Knowledge.app` — no quote.
 */
export function buildInstallShellCmd(target: string): string {
  const links = SYMLINK_PATHS.map((p) => `rm -f '${p}' && ln -s '${target}' '${p}'`);
  return `mkdir -p /usr/local/bin && ${links.join(' && ')}`;
}

/**
 * Build the shell command `runAsAdmin` executes on uninstall — a plain
 * `rm -f` for each path we own. Callers pre-filter via
 * `classifySymlinkState(…) === 'ours'` so this never attacks a foreign
 * file.
 */
export function buildUninstallShellCmd(paths: readonly string[]): string {
  return paths.map((p) => `rm -f '${p}'`).join(' && ');
}

/**
 * Run `shellCmd` under a macOS admin privilege prompt via `osascript`.
 *
 * Rejects with an `Error` if the child exits non-zero — the canonical
 * signal that the user dismissed the prompt (exit code 1 / OSA error
 * `-128`). Callers catch the rejection and show a manual-install fallback
 * (install path) or silently no-op (uninstall path) — see AC1.
 */
async function defaultRunAsAdmin(shellCmd: string, promptCopy: string): Promise<void> {
  const appleScript = buildAdminAppleScript(shellCmd, promptCopy);
  return new Promise<void>((resolve, reject) => {
    const child = spawn('osascript', ['-e', appleScript]);
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`osascript exited with code ${code}`));
    });
    child.on('error', (err) => reject(err));
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
  try {
    await runAsAdmin(
      shellCmd,
      'Open Knowledge needs permission to install the Command-Line Tools.',
    );
  } catch {
    // Admin prompt dismissed OR osascript failed. Show manual-install
    // fallback — adding the bundle's bin dir to PATH works equivalently
    // without needing root.
    const binDir = target.replace(/\/ok\.sh$/, '');
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
    await runAsAdmin(shellCmd, 'Open Knowledge needs permission to remove the Command-Line Tools.');
  } catch {
    // Admin prompt dismissed — silent no-op (menu label doesn't flip,
    // user can click again).
    return;
  }

  await deps.dialog.showMessageBox({
    type: 'info',
    message: 'Command-Line Tools removed.',
    buttons: ['OK'],
  });
}
