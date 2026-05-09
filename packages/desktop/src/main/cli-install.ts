import { spawn } from 'node:child_process';
import { existsSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Dialog } from 'electron';

export const SYMLINK_PATHS = ['/usr/local/bin/ok', '/usr/local/bin/open-knowledge'] as const;

/** Classifier result for `getInstallStatus`. Exported so `menu.ts` can type
 *  the `cliInstallStatus` dependency it consumes from the runtime wiring. */
export type CliInstallStatus = 'installed' | 'not-installed' | 'broken';

export interface FsOps {
  readlinkSync(path: string): string;
  existsSync(path: string): boolean;
}

const defaultFsOps: FsOps = {
  readlinkSync: (path) => readlinkSync(path),
  existsSync: (path) => existsSync(path),
};

export function isTranslocated(executablePath: string): boolean {
  return (
    executablePath.includes('/AppTranslocation/') ||
    executablePath.startsWith('/private/var/folders/')
  );
}

export function wrapperPathInBundle(executablePath: string): string {
  const bundleRoot = executablePath.replace(/\/Contents\/MacOS\/.*$/, '');
  return join(bundleRoot, 'Contents', 'Resources', 'cli', 'bin', 'ok.sh');
}

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
      return 'broken';
    }

    if (linkTarget !== target) return 'broken'; // foreign / stale
    if (!fs.existsSync(target)) return 'broken'; // dangling — bundle moved or deleted
    okCount++;
  }

  if (missingCount === SYMLINK_PATHS.length) return 'not-installed';
  if (okCount === SYMLINK_PATHS.length) return 'installed';
  return 'broken';
}

type SymlinkState =
  | { kind: 'ours' }
  | { kind: 'foreign-symlink'; target: string }
  | { kind: 'foreign-file' }
  | { kind: 'absent' };

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

export function buildAdminAppleScript(shellCmd: string, promptCopy: string): string {
  const escapeAppleScriptLiteral = (s: string): string =>
    s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `do shell script "${escapeAppleScriptLiteral(shellCmd)}" with prompt "${escapeAppleScriptLiteral(promptCopy)}" with administrator privileges`;
}

function shellEscapeSingleQuoted(value: string): string {
  return value.replace(/'/g, "'\\''");
}

export function buildInstallShellCmd(target: string): string {
  const escapedTarget = shellEscapeSingleQuoted(target);
  const links = SYMLINK_PATHS.map((p) => {
    const escapedPath = shellEscapeSingleQuoted(p);
    return `rm -f '${escapedPath}' && ln -s '${escapedTarget}' '${escapedPath}'`;
  });
  return `mkdir -p /usr/local/bin && ${links.join(' && ')}`;
}

export function buildUninstallShellCmd(paths: readonly string[]): string {
  return paths.map((p) => `rm -f '${shellEscapeSingleQuoted(p)}'`).join(' && ');
}

export type AdminFailureReason = 'user-cancel' | 'spawn-error' | 'shell-error';

export class AdminFailureError extends Error {
  readonly reason: AdminFailureReason;
  readonly stderr?: string;
  constructor(reason: AdminFailureReason, message: string, stderr?: string) {
    super(message);
    this.name = 'AdminFailureError';
    this.reason = reason;
    if (stderr !== undefined && stderr !== '') this.stderr = stderr;
  }
}

export function buildAdminFailureError(
  reason: AdminFailureReason,
  message: string,
  stderr?: string,
): AdminFailureError {
  return new AdminFailureError(reason, message, stderr);
}

export function classifyOsascriptExitCode(code: number | null): AdminFailureReason {
  if (code === 1) return 'user-cancel';
  return 'shell-error';
}

const OSASCRIPT_TIMEOUT_MS = 60_000;

async function defaultRunAsAdmin(shellCmd: string, promptCopy: string): Promise<void> {
  const appleScript = buildAdminAppleScript(shellCmd, promptCopy);
  return new Promise<void>((resolve, reject) => {
    const child = spawn('osascript', ['-e', appleScript]);
    let stderrBuf = '';
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => {
        try {
          child.kill('SIGTERM');
        } catch {}
        reject(
          buildAdminFailureError(
            'spawn-error',
            `osascript timed out after ${OSASCRIPT_TIMEOUT_MS}ms`,
            stderrBuf.trim() || undefined,
          ),
        );
      });
    }, OSASCRIPT_TIMEOUT_MS);
    timer.unref?.();
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrBuf += chunk.toString();
    });
    child.on('exit', (code) => {
      settle(() => {
        if (code === 0) return resolve();
        reject(
          buildAdminFailureError(
            classifyOsascriptExitCode(code),
            `osascript exited with code ${code}`,
            stderrBuf.trim(),
          ),
        );
      });
    });
    child.on('error', (err) => {
      settle(() => {
        try {
          child.kill();
        } catch {}
        reject(buildAdminFailureError('spawn-error', err.message));
      });
    });
  });
}

export interface CliInstallDeps {
  executablePath: string;
  dialog: Pick<Dialog, 'showMessageBox'>;
  runAsAdmin?: (shellCmd: string, promptCopy: string) => Promise<void>;
  fs?: FsOps;
}

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
      `Open Knowledge will create symlinks at ${SYMLINK_PATHS.join(' and ')} so you can run 'ok' from your terminal. This requires administrator access.`,
    );
  } catch (err) {
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
    await runAsAdmin(
      shellCmd,
      `Open Knowledge will remove the symlinks at ${toRemove.join(' and ')}. This requires administrator access.`,
    );
  } catch (err) {
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

export interface BrokenSymlinkRepairDeps {
  executablePath: string;
  platform: NodeJS.Platform | string;
  /** `app.isPackaged` — packaging-gate. Dev mode must never offer repair
   *  because `app.getPath('exe')` resolves to the electron dev binary and
   *  a prior DMG's symlinks would always classify 'broken' against it;
   *  running the repair would install dev-path symlinks into the user's
   *  system (contamination guard). */
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
  getDismissedToken?: () => string | null;
  setDismissedToken?: (token: string) => void;
  appVersion?: string;
}

export function createBrokenSymlinkRepairHandler(
  deps: BrokenSymlinkRepairDeps,
): () => Promise<void> {
  const getStatus = deps.getStatus ?? getInstallStatus;
  return async () => {
    if (deps.platform !== 'darwin') return;
    if (!deps.isPackaged) return;
    const status = getStatus(deps.executablePath);
    if (status !== 'broken') return;

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
      defaultId: 0,
    });
    if (response === 0) {
      if (currentToken !== null) deps.setDismissedToken?.(currentToken);
      return;
    }
    await deps.install({ executablePath: deps.executablePath, dialog: deps.dialog });
    deps.refreshMenu();
  };
}
