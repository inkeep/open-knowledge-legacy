/**
 * CLI-on-PATH install for D52 / M6a — pure-function layer (US-002).
 *
 * Runtime wrappers (`installCli`, `uninstallCli`, `runAsAdmin`) land in US-003;
 * this file currently exports only:
 *
 *   - `isTranslocated(executablePath)`   — gatekeeper-translocation detector
 *   - `wrapperPathInBundle(executablePath)` — `.app` → wrapper-target resolver
 *   - `getInstallStatus(executablePath, fs)` — symlink-state classifier
 *
 * Each takes its dependencies by parameter — no `electron` import at module
 * top — so Bun's test runner (which loads the `electron` npm package as a
 * plain string, not as a module with named exports) can exercise them
 * directly. Runtime call sites in US-003 will pass `app.getPath('exe')` as
 * `executablePath` and a `node:fs`-backed `FsOps` from `defaultFsOps`.
 *
 * Pattern mirrors `menu.ts` (pure `buildMenuTemplate` + runtime
 * `installApplicationMenu`) and `url-scheme.ts` (pure `parseOpenKnowledgeUrl`
 * + runtime `registerProtocolHandler`).
 */

import { existsSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

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
