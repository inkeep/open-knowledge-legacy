/**
 * First-launch MCP wiring — pure helpers for M6b / US-007.
 *
 * Three pure pieces, all dependency-injected for bun-test loadability:
 *
 *   1. Marker read/write at `<home>/.open-knowledge/mcp-status.json`. The
 *      user-scoped marker fires the consent dialog exactly once per user per
 *      Mac (D-M6-R1). Shape is either `{configured: true, configuredAt,
 *      editors, cliPath}` on Add, or `{configured: false, skippedAt}` on
 *      Skip. `null` return means "no prior decision" — run the consent flow.
 *
 *   2. `resolveCliPath(executablePath, fs)` — hybrid per D-M6-R9. Prefers
 *      `/usr/local/bin/ok` when the symlink exists AND `readlink` resolves
 *      to a target inside the current `.app` bundle (ownership check
 *      against `app.getPath('exe')`). Falls through to bundle-absolute
 *      (`<bundle>/Contents/Resources/cli/bin/ok.sh`) otherwise. This gives
 *      auto-update + app-move robustness when M6a is installed AND self-
 *      contained working MCP when M6a is NOT installed (STOP_IF (e)).
 *
 *   3. `computeForce(existing, target)` — classifies each editor's existing
 *      MCP entry against the OK-managed shapes (D-M6-R4 refined via
 *      `isCompatible`). Returns `true` for:
 *        - Published canonical `{command:'npx', args:['@inkeep/open-knowledge','mcp']}`
 *          (verified via `target.isCompatible(existing, '', {mode:'published'})`)
 *        - Historical `-y` variant `{command:'npx', args:['-y','@inkeep/open-knowledge','mcp']}`
 *        - Any prior cliPath shape `{command:<path>, args:['mcp']}` (from
 *          an earlier M6b run before auto-update / app-move / M6a-install
 *          changed the preferred cliPath)
 *      Returns `false` for user customizations — call site preserves the
 *      entry and emits a structured `mcp-wiring-skip-customized` log.
 *
 * The runtime orchestration (`runMcpWiringOnFirstLaunch`, IPC handlers, the
 * whenRendererReady three-case dispatch per D-M6-R10) lands in US-008 and
 * will call these helpers with the real `app.getPath('exe')` + `node:fs`.
 *
 * Pattern mirrors `cli-install.ts`: pure layer uses `electron`-free imports
 * + an injectable `FsOps` so bun-test can load the module without an
 * Electron runtime; runtime functions that need `dialog` / `app.getPath`
 * land separately with dynamic `await import('electron')`.
 */

import {
  existsSync as fsExistsSync,
  mkdirSync as fsMkdirSync,
  readFileSync as fsReadFileSync,
  readlinkSync as fsReadlinkSync,
  renameSync as fsRenameSync,
  unlinkSync as fsUnlinkSync,
  writeFileSync as fsWriteFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { EditorMcpTarget } from '@inkeep/open-knowledge';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type {
  McpWiringConfirmRequest,
  McpWiringConfirmResult,
  McpWiringEditorDetection,
  McpWiringEditorId,
  McpWiringSkipResult,
} from '../shared/ipc-channels.ts';
import { createHandler } from '../shared/ipc-handler.ts';
import { sendToRenderer } from '../shared/ipc-send.ts';
import { wrapperPathInBundle } from './cli-install.ts';

/** Canonical symlink path created by M6a (`Install Command-Line Tools…`). */
export const SYMLINK_OK_PATH = '/usr/local/bin/ok';

const MCP_STATUS_DIR_NAME = '.open-knowledge';
const MCP_STATUS_FILE_NAME = 'mcp-status.json';

/**
 * Shape of `<home>/.open-knowledge/mcp-status.json`. Either a confirmed
 * wiring (`configured: true`) or a recorded skip (`configured: false`).
 * Absence of the file means "no prior decision" — distinct from a
 * persisted skip, which suppresses the dialog forever.
 *
 * `cliPath` on the confirmed shape is a diagnostic aid for OQ-8: an `ok`
 * invocation can read the marker and classify "configured-but-broken"
 * vs "never-configured" scenarios when a user drag-to-Trashes the bundle.
 */
export type McpStatusMarker =
  | {
      configured: true;
      configuredAt: string;
      editors: string[];
      cliPath: string;
    }
  | {
      configured: false;
      skippedAt: string;
    };

/**
 * Minimal `fs` surface the pure helpers need. Runtime wraps `node:fs`;
 * tests inject a stub. Kept narrow so test stubs stay compact.
 *
 * `readlinkSync` MUST throw an `ErrnoException` with `.code === 'ENOENT'`
 * when the path is absent — this is how `resolveCliPath` distinguishes
 * "no symlink" from "foreign file at that path" (EINVAL) vs other errors.
 *
 * `renameSync` + `unlinkSync` are added for the atomic marker write
 * pattern (Pass 0 Minor #2 — mirrors `state-store.saveAppStateToDir`):
 * write to a `.tmp-<pid>-<ts>` sibling, then `rename` over the canonical
 * path so a power-loss between write and fsync can't leave a truncated
 * marker on disk.
 */
export interface McpWiringFsOps {
  existsSync(path: string): boolean;
  readlinkSync(path: string): string;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, content: string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  renameSync(oldPath: string, newPath: string): void;
  unlinkSync(path: string): void;
}

/** Runtime FsOps — thin wrapper over `node:fs`. */
const defaultFsOps: McpWiringFsOps = {
  existsSync: (path) => fsExistsSync(path),
  readlinkSync: (path) => fsReadlinkSync(path),
  readFileSync: (path, encoding) => fsReadFileSync(path, encoding),
  writeFileSync: (path, content) => {
    fsWriteFileSync(path, content);
  },
  mkdirSync: (path, options) => {
    fsMkdirSync(path, options);
  },
  renameSync: (oldPath, newPath) => {
    fsRenameSync(oldPath, newPath);
  },
  unlinkSync: (path) => {
    fsUnlinkSync(path);
  },
};

/** Absolute path of the user-scoped marker file under `home`. */
export function mcpStatusMarkerPath(home: string): string {
  return join(home, MCP_STATUS_DIR_NAME, MCP_STATUS_FILE_NAME);
}

/**
 * Read the marker if present. Returns `null` when the file is absent,
 * unreadable, or not valid JSON matching either marker shape — either
 * case means "no prior decision recorded, run the consent flow".
 *
 * Tolerant on purpose: a corrupt marker must not permanently lock a user
 * out of the consent prompt. A subsequent successful write via
 * `writeMcpStatusMarker` will replace the corrupted file.
 */
export function readMcpStatusMarker(
  home: string,
  fs: McpWiringFsOps = defaultFsOps,
): McpStatusMarker | null {
  const path = mcpStatusMarkerPath(home);
  if (!fs.existsSync(path)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isValidMarker(parsed) ? parsed : null;
}

function isValidMarker(value: unknown): value is McpStatusMarker {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.configured === true) {
    return (
      typeof v.configuredAt === 'string' &&
      Array.isArray(v.editors) &&
      v.editors.every((e) => typeof e === 'string') &&
      typeof v.cliPath === 'string'
    );
  }
  if (v.configured === false) {
    return typeof v.skippedAt === 'string';
  }
  return false;
}

/**
 * Write the marker atomically. Creates `<home>/.open-knowledge/` when absent
 * so the first-ever first-launch write succeeds on a machine with no prior
 * OK user-level state. Pretty-printed + trailing newline so `cat` output is
 * readable for a user inspecting their own config.
 *
 * Pass 0 Minor #2 — atomic write via tmp+rename. Mirrors
 * `state-store.saveAppStateToDir`: write to a `<path>.tmp-<pid>-<now>`
 * sibling, then `rename` over the canonical path. A power-loss between
 * `writeFileSync` and `rename` leaves the canonical marker untouched
 * (or absent) and a stray `.tmp-…` sibling — both safer failure modes
 * than a truncated marker. `readMcpStatusMarker` already tolerates the
 * truncated-marker case (returns `null`, dialog re-fires) so atomicity
 * is defense-in-depth, not a correctness requirement; consistency with
 * the rest of the desktop main process is the primary win.
 */
export function writeMcpStatusMarker(
  home: string,
  status: McpStatusMarker,
  fs: McpWiringFsOps = defaultFsOps,
): void {
  const path = mcpStatusMarkerPath(home);
  fs.mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(status, null, 2)}\n`);
  try {
    fs.renameSync(tmpPath, path);
  } catch (err) {
    // Best-effort tmp cleanup — if the rename failed, leave no stray .tmp.
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // tmp file may not exist — the rename may have partially succeeded.
    }
    throw err;
  }
}

/**
 * Hybrid `cliPath` resolution (D-M6-R9). Decides which path M6b writes
 * into MCP config entries at consent-confirm time.
 *
 *   - Returns `/usr/local/bin/ok` when the symlink exists AND its
 *     `readlink` target resolves to a path inside the current bundle
 *     (i.e., the symlink was created by this bundle's M6a install).
 *     Benefit: stable across Squirrel.Mac atomic-swap auto-update and
 *     across user-initiated `.app` move — LaunchServices resolves the
 *     `.app` via bundle ID and the symlink target follows.
 *   - Returns the bundle-absolute wrapper path in every other case —
 *     no symlink at `/usr/local/bin/ok`, a plain file at that path
 *     (EINVAL from readlink), a symlink pointing OUTSIDE the current
 *     bundle (ownership-check failure — foreign / stale from a previous
 *     uninstalled OK bundle), or any `readlink` throw (ENOENT, EACCES).
 *
 * STOP_IF (e): never trust a symlink we can't confirm we own. The
 * ownership check compares the resolved target against the current
 * bundle's prefix — a symlink pointing into a different bundle (e.g.,
 * an old unsigned install that was never cleaned up) is treated as
 * foreign and falls through to bundle-absolute.
 */
export function resolveCliPath(executablePath: string, fs: McpWiringFsOps = defaultFsOps): string {
  const bundleAbsolute = wrapperPathInBundle(executablePath);
  const bundleRoot = bundleAbsolute.replace(/\/Contents\/Resources\/cli\/bin\/ok\.sh$/, '');

  try {
    if (!fs.existsSync(SYMLINK_OK_PATH)) return bundleAbsolute;
    const linkTarget = fs.readlinkSync(SYMLINK_OK_PATH);
    // `readlink` returns either an absolute path or a path relative to
    // the symlink's containing directory. `resolve` normalizes both.
    const resolved = resolve(dirname(SYMLINK_OK_PATH), linkTarget);
    if (resolved === bundleAbsolute) return SYMLINK_OK_PATH;
    // Future M6a variants could point at a different file inside the
    // bundle (e.g., a universal-binary subpath). Accept any target that
    // lives under this bundle's root — ownership is what we're verifying,
    // not a specific filename.
    if (resolved.startsWith(`${bundleRoot}/`)) return SYMLINK_OK_PATH;
    return bundleAbsolute;
  } catch {
    // EINVAL (plain file at symlink path), ENOENT (raced — existed then
    // gone), EACCES (sandbox), or unexpected. Bundle-absolute is always
    // safe because M6b's AC1.2 guarantees it ships in `extraResources`.
    return bundleAbsolute;
  }
}

/**
 * Subset of `EditorMcpTarget` that `computeForce` needs — just
 * `isCompatible`. Kept as a type alias rather than a hand-rolled
 * structural interface (Pass 0 Minor #17) now that desktop has a real
 * workspace dep on `@inkeep/open-knowledge` (the M6b substrate), so the
 * authoritative type shape comes from the CLI package rather than a
 * duplicated interface that can drift.
 */
export type ForceComputeTarget = Pick<EditorMcpTarget, 'isCompatible'>;

/**
 * Decide whether to overwrite an editor's existing entry with the new
 * cliPath shape (D-M6-R4 refined).
 *
 * Returns `true` for every OK-managed shape:
 *
 *   - **Fixture A** — published canonical `{command:'npx',
 *     args:['@inkeep/open-knowledge','mcp']}` → matched by
 *     `target.isCompatible(existing, '', {mode:'published'})`.
 *   - **Fixture B** — historical `-y` variant `{command:'npx',
 *     args:['-y','@inkeep/open-knowledge','mcp']}` → caught by
 *     `isHistoricalNpxVariant` because the 3-arg shape diverges from
 *     the 2-arg canonical that `isCompatible` encodes.
 *   - **Fixture C** — canonical + user-augmented env `{command:'npx',
 *     args:[...'canonical'], env:{OK_LOG_LEVEL:'debug'}}` → matched by
 *     `isCompatible` because `hasMatchingManagedFields` iterates only
 *     the managed keys (`command`, `args`); existing's extra `env` is
 *     ignored, so the fixture passes the compatibility check. Caller's
 *     subsequent `target.mergeManagedFields` preserves `env`.
 *   - **Prior cliPath** — `{command:<path>, args:['mcp']}` from an
 *     earlier M6b run before an auto-update / app-move / M6a-install
 *     shifted the preferred cliPath. Caught by `isPriorCliPathShape`.
 *
 * Returns `false` for:
 *
 *   - **Fixture D** — custom wrappers `{command:'custom-wrapper', args:[...]}`
 *     or any user-edited shape that doesn't match the above. Caller
 *     preserves the entry and logs `mcp-wiring-skip-customized`.
 */
export function computeForce(
  existing: Record<string, unknown>,
  target: ForceComputeTarget,
): boolean {
  if (target.isCompatible(existing, '', { mode: 'published' })) return true;
  if (isHistoricalNpxVariant(existing)) return true;
  if (isPriorCliPathShape(existing)) return true;
  return false;
}

/**
 * Match `{command:'npx', args:['-y','@inkeep/open-knowledge','mcp']}`
 * — the `-y` variant a pre-M6 CLI user might have accumulated. `npm`
 * / `npx` aliases sometimes produced this shape; we treat it as
 * managed because its semantics are identical to the canonical
 * 2-arg form.
 */
function isHistoricalNpxVariant(existing: Record<string, unknown>): boolean {
  if (existing.command !== 'npx') return false;
  if (!Array.isArray(existing.args)) return false;
  return (
    existing.args.length === 3 &&
    existing.args[0] === '-y' &&
    existing.args[1] === '@inkeep/open-knowledge' &&
    existing.args[2] === 'mcp'
  );
}

/**
 * Match a PRIOR OK cliPath shape: `{command:<path-ending-in-ok-wrapper-basename>, args:['mcp']}`
 * where the basename identifies the binary as an OK bin (not some
 * third-party tool that happens to take `mcp` as its sole argument).
 *
 * The arg-shape discriminator (`['mcp']` — exactly one element, value
 * `'mcp'`) is necessary but NOT sufficient. Published canonical has
 * `args.length === 2` (`[@inkeep/..., 'mcp']`), dev-mode has
 * `args.length === 2` (`[<cli.mjs>, 'mcp']`), and the `-y` variant has
 * `args.length === 3` — all distinct from our cliPath shape. But a
 * foreign tool like `{command:'/opt/homebrew/bin/some-other-mcp-tool',
 * args:['mcp']}` would also match the arg shape alone. Pass 0 Major #12
 * tightens the command match to the OK-owned wrapper basenames so a
 * non-OK binary with incidental `['mcp']` args is not silently stomped.
 *
 * Accepted basenames:
 *   - `ok` / `ok.sh` — the short-form symlink created by M6a + the
 *     bundled wrapper script.
 *   - `open-knowledge` — the long-form symlink.
 *
 * This stays robust to path variation: auto-update moves the bundle but
 * the basename is stable; user installs to `/Applications/` or
 * `~/Applications/` — same basename; M6a symlink at `/usr/local/bin/ok`
 * or `/usr/local/bin/open-knowledge` — same basenames. Non-OK binaries
 * like `mcp-tool`, `llm-gateway`, or `some-mcp-wrapper.sh` fall through
 * to foreign-shape preservation.
 */
function isPriorCliPathShape(existing: Record<string, unknown>): boolean {
  if (typeof existing.command !== 'string') return false;
  if (existing.command === 'npx') return false;
  if (!Array.isArray(existing.args)) return false;
  if (existing.args.length !== 1 || existing.args[0] !== 'mcp') return false;
  const basename = existing.command.split('/').pop();
  return basename === 'ok' || basename === 'ok.sh' || basename === 'open-knowledge';
}

/**
 * Format the user-facing partial-failure message rendered via sonner toast
 * (Review Pass 0 Critical #1). Lists each failed editor + its underlying
 * error reason, then notes the deferred-marker recovery path so the user
 * knows what to expect on next launch (OQ-19).
 *
 * Pure helper — exported for direct unit testing without standing up the
 * full IPC handler.
 */
export function formatPartialFailureMessage(
  failures: ReadonlyArray<{ editorId: string; error?: string }>,
  totalCount: number,
): string {
  const okCount = totalCount - failures.length;
  const detail = failures.map((f) => `${f.editorId}${f.error ? `: ${f.error}` : ''}`).join('; ');
  const summary =
    failures.length === 1
      ? `Couldn't add MCP to ${detail}.`
      : `${failures.length} of ${totalCount} MCP writes failed (${detail}).`;
  const successHint = okCount > 0 ? ` ${okCount} succeeded.` : '';
  return `${summary}${successHint} The dialog will reappear on next launch so you can retry.`;
}

// ---------------------------------------------------------------------------
// Runtime orchestration — US-008 (M6b runMcpWiringOnFirstLaunch)
// ---------------------------------------------------------------------------

/**
 * Pass 0 Major #1 — sender-binding predicate. Returns true iff the
 * invoking `WebContents.id` matches the captured show-dispatch sender,
 * OR if no dispatch has captured a sender yet (binding is null during
 * the inert-handle / pre-dispatch window but both handlers self-guard
 * via `handled` so this branch is unreachable in practice — see comment
 * in `runMcpWiringOnFirstLaunch`).
 *
 * Pure helper so unit tests can assert the binding logic without
 * threading a closure-scoped variable through the test harness.
 */
function isPermittedSender(
  event: Pick<IpcMainInvokeEvent, 'sender'>,
  capturedSenderId: number | null,
): boolean {
  // Null binding means no dispatch has succeeded yet — refuse all
  // confirms/skips so a fast renderer can't call confirm/skip before
  // the show event has been delivered anywhere.
  if (capturedSenderId === null) return false;
  return event.sender.id === capturedSenderId;
}

/**
 * Structurally-compatible subset of Electron's `IpcMain`. Declared inline
 * so tests can inject a stub without pulling in the real Electron runtime.
 * Only `handle` + `removeHandler` are needed now that `renderer-ready` is
 * modeled as an invoke-style channel (D19: no `ipcMain.on` outside the
 * allowlisted wrappers).
 */
export interface IpcMainLike extends Pick<IpcMain, 'handle' | 'removeHandler'> {}

/** Matches `IpcMainInvokeEvent.sender.send` for the show-dispatch reply. */
export interface IpcMainEventLike {
  sender: { send(channel: string, ...args: unknown[]): void };
}

/**
 * Shape consumed from the CLI side (`@inkeep/open-knowledge`). Injected so
 * tests can stub without spinning up a real CLI, and main/index.ts can
 * hand the real functions in at boot time. Member-set intentionally minimal:
 * every helper we need to classify + write per-editor configs.
 */
export interface McpWiringCliSurface {
  /** Mirrors `detectInstalledEditors(cwd, home)` from init.ts. */
  detectInstalledEditors(cwd: string, home?: string): McpWiringEditorId[];
  /** Mirrors `writeUserMcpConfigs(opts)` from init.ts. */
  writeUserMcpConfigs(opts: {
    editors: McpWiringEditorId[];
    cliPath?: string;
    home?: string;
  }): Promise<
    Array<{
      editorId: McpWiringEditorId;
      label: string;
      // Main PR #282 reconciliation (2026-04-23): the CLI now always-overwrites,
      // so `skipped-existing` / `skipped-conflict` are gone. `skipped-missing`
      // is new; `skipAvailabilityCheck: true` in `writeUserMcpConfigs` means
      // M6b shouldn't actually produce it in practice (user explicitly toggled
      // the checkbox). Listed here anyway so the type matches `EditorMcpResult`
      // byte-for-byte — see `packages/cli/src/commands/init.ts`.
      action: 'written' | 'overwritten' | 'skipped-missing' | 'skipped-flag' | 'failed';
      configPath: string;
      serverName: string;
      error?: string;
    }>
  >;
  /** Look up an editor's existing MCP entry (format-aware). `null` when the
   *  config file is absent or has no entry for this editor. The editorId
   *  surface avoids a cross-package `EditorMcpTarget` type in this module. */
  readExistingMcpEntry(editorId: McpWiringEditorId, home: string): Record<string, unknown> | null;
  /** Full `ALL_EDITOR_IDS` — used to build the dialog-payload detection list. */
  allEditorIds: readonly McpWiringEditorId[];
  /** `EDITOR_TARGETS[id]` keyed by editor. Imported directly from
   *  `@inkeep/open-knowledge` (Pass 0 Minor #17) so drift with the CLI's
   *  authoritative `EditorMcpTarget` shape is a compile error, not a
   *  runtime surprise. */
  editorTargets: Record<McpWiringEditorId, EditorMcpTarget>;
}

/** Minimal logger surface — bracket-prefix operational + structured events. */
export interface McpWiringLogger {
  info(msg: string, ctx?: object): void;
  warn(msg: string, ctx?: object): void;
  error(msg: string, ctx?: object): void;
  /** Structured JSON event — tests assert on this. */
  event(payload: { event: string; [k: string]: unknown }): void;
}

const DEFAULT_LOGGER: McpWiringLogger = {
  info: (msg, ctx) => console.info('[mcp-wiring]', msg, ctx ?? ''),
  warn: (msg, ctx) => console.warn('[mcp-wiring]', msg, ctx ?? ''),
  error: (msg, ctx) => console.error('[mcp-wiring]', msg, ctx ?? ''),
  event: (payload) => console.warn(JSON.stringify(payload)),
};

interface RunMcpWiringOpts {
  /** `app.isPackaged` — D-M6-R7 dev-mode contamination guard. */
  isPackaged: boolean;
  /** `app.getPath('exe')` — must end in `.app/Contents/MacOS/<name>` (STOP_IF c). */
  executablePath: string;
  /** `os.homedir()` in production; an isolated tmpdir under Playwright smoke. */
  home: string;
  /** `process.platform` — M6a/M6b are macOS-only in v0 (NG4). */
  platform: 'darwin' | 'win32' | 'linux' | string;
  ipcMain: IpcMainLike;
  cli: McpWiringCliSurface;
  /** Value of `process.env.OK_M6B_FORCE` — `'1'` bypasses the packaged gate for dev smokes. */
  forceEnv?: string | null | undefined;
  /**
   * Pass 2 Major #5: ignore a pre-existing marker and re-arm the dialog.
   * Wired to the File menu's "Configure AI Tool Integrations…" item so a
   * user who previously Skip'd (or wants to add an editor that wasn't
   * installed at consent time) can re-trigger from the GUI instead of
   * hand-deleting `~/.open-knowledge/mcp-status.json`.
   *
   * The other guards stay active even under forceShow: non-darwin still
   * no-ops (NG4), dev-mode still no-ops without OK_M6B_FORCE (D-M6-R7
   * contamination guard), bad executablePath shape still aborts (STOP_IF
   * (c)). Only the marker-present gate is bypassed.
   */
  forceShow?: boolean;
  fs?: McpWiringFsOps;
  now?: () => Date;
  logger?: McpWiringLogger;
}

export interface RunMcpWiringHandle {
  /** Tear down IPC handlers + event listener. Safe to call multiple times. */
  destroy(): void;
  /** Test-only introspection: true if the module has armed its IPC surface. */
  readonly armed: boolean;
}

/** Entry-point invoked from `app.whenReady()` in main/index.ts. */
export function runMcpWiringOnFirstLaunch(opts: RunMcpWiringOpts): RunMcpWiringHandle {
  const {
    isPackaged,
    executablePath,
    home,
    platform,
    ipcMain,
    cli,
    forceEnv,
    forceShow = false,
    fs,
    now,
    logger = DEFAULT_LOGGER,
  } = opts;
  const nowDate = (): Date => (now ? now() : new Date());
  const inertHandle: RunMcpWiringHandle = { destroy() {}, armed: false };

  // NG4 — macOS-only in v0. Windows / Linux parity deferred to M7.
  if (platform !== 'darwin') {
    logger.info('skip — platform is not darwin', { platform });
    return inertHandle;
  }

  // STOP_IF (b) / D-M6-R7 — dev-mode contamination guard. In `electron-vite dev`,
  // `app.getPath('exe')` points at the dev Electron binary and `extraResources`
  // are not mounted; computing + writing `cliPath` would contaminate the
  // developer's real user MCP configs irrecoverably. `OK_M6B_FORCE=1` is an
  // explicit opt-in for developer testing with an isolated HOME.
  if (!isPackaged && forceEnv !== '1') {
    logger.info('skip — app not packaged and OK_M6B_FORCE not set');
    return inertHandle;
  }

  // STOP_IF (c) — if executablePath doesn't match `.app/Contents/MacOS/<name>`,
  // the bundle-absolute cliPath derivation would produce garbage. Abort rather
  // than write something the renderer would later fail to spawn.
  if (!/\.app\/Contents\/MacOS\/[^/]+$/.test(executablePath)) {
    logger.warn('skip — executablePath does not match .app/Contents/MacOS/<name> shape', {
      executablePath,
    });
    return inertHandle;
  }

  // Idempotent — marker present means prior decision recorded; never
  // re-fire UNLESS the caller asked for forceShow (Pass 2 Major #5 —
  // the "Configure AI Tool Integrations…" File-menu path). On forceShow
  // we log-and-continue; on first-launch-only (default) the prior
  // decision is respected as a one-way gate.
  const marker = readMcpStatusMarker(home, fs);
  if (marker !== null && !forceShow) {
    logger.info('skip — marker present', { configured: marker.configured });
    return inertHandle;
  }
  if (marker !== null && forceShow) {
    logger.info('forceShow — ignoring prior marker', { configured: marker.configured });
  }

  // Detection + payload construction under try/catch (Pass 0 Major #5). A
  // drift between `cli.allEditorIds` and `cli.editorTargets` (CLI refactor
  // that adds an id without the matching target, or a future platform-
  // conditional getter that throws) must NOT crash `app.whenReady()` and
  // leave the user with a failing boot. Treat any detection error as
  // "wiring inert for this boot" — marker stays absent → dialog re-fires
  // next launch after the CLI is fixed. Emits a structured event so ops
  // can correlate "dialog never appeared" reports to the drift that caused
  // it.
  let detections: McpWiringEditorDetection[];
  try {
    const detectedIds = new Set<McpWiringEditorId>(cli.detectInstalledEditors('', home));
    detections = cli.allEditorIds.map((id) => {
      const target = cli.editorTargets[id];
      if (!target) {
        throw new Error(`editorTargets missing entry for id=${id}`);
      }
      // Pass 1 Major #8: compute `willReplace` at arming time using the
      // same classifier the confirm handler runs at write time — any
      // OK-managed shape (canonical npx, `-y` variant, prior cliPath)
      // resolves `computeForce → true`, meaning Add would overwrite.
      // Surfaced in the dialog so long-time CLI users who wrote their
      // MCP entry via an earlier `ok init` see which rows will be
      // stomped BEFORE clicking Add, not as a silent after-the-fact
      // side effect. `readExistingMcpEntry` returns null when the
      // config file is absent or has no entry for this editor — those
      // rows render as "Not yet configured" rather than "Will replace".
      let willReplace = false;
      try {
        const existing = cli.readExistingMcpEntry(id, home);
        if (existing !== null) {
          willReplace = computeForce(existing, target);
        }
      } catch {
        // Tolerant on purpose: a read failure in one editor's config
        // must not pull the whole dialog down. Default to `false` —
        // the confirm-time classification is the authoritative source;
        // this arming-time probe is purely a disclosure aid.
      }
      return { id, label: target.label, detected: detectedIds.has(id), willReplace };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('detection failed — wiring inert for this boot', { message });
    logger.event({ event: 'mcp-wiring-detect-failed', error: message });
    return inertHandle;
  }

  // Once-per-boot idempotence for SUCCESSFUL handler runs. Flipped
  // synchronously at handler entry on first confirm/skip so a rage-click
  // race (Add+Skip in quick succession) collapses to at most one effective
  // run. Reset to false on failure branches (Pass 0 Major #2) so the user
  // can retry the SAME dialog without waiting for a next-boot re-fire —
  // the store keeps the dialog mounted on `ok:false` results, so the user
  // clicks Add again and the retry flows through. Set and left true on
  // ok:true to prevent double-write on success-then-rage-click.
  let handled = false;

  // Pass 0 Major #1 — bind confirm/skip acceptance to the WebContents that
  // actually received `ok:mcp-wiring:show`. Captured inside the one-shot
  // renderer-ready handler after a successful dispatch. Before capture
  // (happy-path cold boot) the binding is null — confirm/skip from any
  // renderer is rejected. After capture, only the same sender id is
  // accepted. This closes the window where any future BrowserWindow with
  // bridge access (e.g. M3 update-toast relaunch, a second-instance spawn
  // that hasn't received the show event) could pre-empt the user's choice
  // by calling `mcpWiring.confirm({editorIds: ALL_EDITOR_IDS})` before the
  // dialog is even visible.
  let capturedSenderId: number | null = null;

  const confirmHandler = async (
    event: IpcMainInvokeEvent,
    request: McpWiringConfirmRequest,
  ): Promise<McpWiringConfirmResult> => {
    if (!isPermittedSender(event, capturedSenderId)) {
      logger.warn('rejecting confirm — sender is not the renderer that received show', {
        capturedSenderId,
        gotSenderId: event.sender.id,
      });
      return {
        ok: false,
        error: 'Consent must come from the window that displayed the dialog.',
      };
    }
    if (handled) return { ok: true };
    handled = true;
    const selectedEditors = Array.isArray(request?.editorIds)
      ? [...request.editorIds].filter((id): id is McpWiringEditorId =>
          cli.allEditorIds.includes(id as McpWiringEditorId),
        )
      : [];

    const cliPath = resolveCliPath(executablePath, fs);

    // Per-editor customized-entry classification (D-M6-R4 refined). After
    // main PR #282 + the post-rebase reconciliation, `writeUserMcpConfigs`
    // no longer takes a `force` parameter — it always overwrites every
    // editor it receives. So we FILTER here: editors with a foreign
    // (non-OK-managed) existing entry are excluded from the write call,
    // preserving their customization. Editors with no existing entry OR
    // with an OK-managed shape (canonical npx, -y variant, prior cliPath)
    // are passed through for overwrite.
    const editorsToWrite: McpWiringEditorId[] = [];
    for (const editor of selectedEditors) {
      const target = cli.editorTargets[editor];
      if (!target) continue;
      const existing = cli.readExistingMcpEntry(editor, home);
      if (existing === null) {
        // No prior entry → plain write.
        editorsToWrite.push(editor);
        continue;
      }
      if (computeForce(existing, target)) {
        // OK-managed shape → overwrite.
        editorsToWrite.push(editor);
      } else {
        // Foreign customization → preserve, skip the write.
        logger.event({
          event: 'mcp-wiring-skip-customized',
          editor,
        });
      }
    }

    let results: Awaited<ReturnType<McpWiringCliSurface['writeUserMcpConfigs']>>;
    try {
      results = await cli.writeUserMcpConfigs({
        editors: editorsToWrite,
        cliPath,
        home,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('writeUserMcpConfigs threw — marker not written', { message });
      // Pass 0 Major #2 — reset `handled` on failure so user can retry
      // from the SAME still-mounted dialog (store keeps it open on
      // ok:false).
      handled = false;
      return { ok: false, error: message };
    }

    // Deferred-marker (OQ-19). If any per-editor write failed, leave the
    // marker absent so the next app launch re-fires the dialog. Return
    // `ok:false` with a user-readable error so the renderer's sonner toast
    // surfaces the failure; the store keeps the dialog mounted (Pass 0
    // Major #2) so the user can adjust selections and click Add again
    // without waiting for next-boot re-fire.
    const failedResults = results.filter((r) => r.action === 'failed');
    for (const r of failedResults) {
      logger.event({
        event: 'mcp-wiring-write-failed',
        editor: r.editorId,
        configPath: r.configPath,
        error: r.error ?? null,
      });
    }
    if (failedResults.length > 0) {
      logger.info('partial failure — marker not written; dialog will re-fire next boot');
      // Pass 0 Major #2 — reset handled so a same-boot retry lands.
      handled = false;
      return {
        ok: false,
        error: formatPartialFailureMessage(failedResults, results.length),
      };
    }

    try {
      writeMcpStatusMarker(
        home,
        {
          configured: true,
          configuredAt: nowDate().toISOString(),
          editors: [...selectedEditors],
          cliPath,
        },
        fs,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('marker write failed', { message });
      // Pass 0 Major #2 — reset handled so a same-boot retry lands.
      handled = false;
      return { ok: false, error: message };
    }

    logger.info('configured', { editors: selectedEditors, cliPath });
    return { ok: true };
  };

  const skipHandler = async (event: IpcMainInvokeEvent): Promise<McpWiringSkipResult> => {
    if (!isPermittedSender(event, capturedSenderId)) {
      logger.warn('rejecting skip — sender is not the renderer that received show', {
        capturedSenderId,
        gotSenderId: event.sender.id,
      });
      return {
        ok: false,
        error: 'Consent must come from the window that displayed the dialog.',
      };
    }
    if (handled) return { ok: true };
    handled = true;
    try {
      writeMcpStatusMarker(
        home,
        {
          configured: false,
          skippedAt: nowDate().toISOString(),
        },
        fs,
      );
    } catch (err) {
      // Marker write failed (EACCES / EROFS / ENOSPC). Surface `ok:false`
      // so the renderer can fire a sonner toast — without this signal the
      // user sees the dialog close and assumes Skip persisted, then the
      // dialog re-fires next boot with no explanation (Review Pass 0
      // Major #9). Reset `handled` so the user can retry Skip from the
      // still-mounted dialog (Pass 0 Major #2 — same-boot retry).
      const message = err instanceof Error ? err.message : String(err);
      logger.error('skip-marker write failed', { message });
      handled = false;
      return {
        ok: false,
        error: `Could not record your preference (${message}). The consent dialog may reappear on next launch.`,
      };
    }
    logger.info('skipped');
    return { ok: true };
  };

  // D-M6-R10 mount-ack handshake. The renderer-ready invoke fires AFTER
  // React has subscribed to `ok:mcp-wiring:show`, so sending show on its
  // receipt avoids the `did-finish-load` race (subscribe-order vs. send).
  // One-shot: first renderer-ready wins the dialog AND captures its
  // WebContents sender id (Pass 0 Major #1), which confirm/skip both
  // validate against before accepting. Remove ordering: dispatch FIRST,
  // then `removeHandler` + `capturedSenderId` update only on success — so
  // if `sendToRenderer` throws (WebContents destroyed mid-handshake,
  // channel-name drift, etc.) the handler stays armed AND no binding is
  // captured, so a second renderer's signalReady invoke gets a fresh
  // attempt with fresh sender binding. Without this swap, a failed first
  // dispatch would leave the dialog permanently undeliverable until next
  // boot (Pass 0 Major #6).
  //
  // TODO (post-M6, Pass 1 Minor #2): no watchdog. Today's boot opens exactly
  // one window (Navigator OR editor — branching on lastOpenedProject) so the
  // ordering swap above bounds the failure surface tightly. Future M3 auto-
  // update relaunch + M4 cold-start deep-link + multi-window flows can
  // interleave window creation; if every renderer's signalReady() fails
  // (catastrophic preload bundle drift, every window destroyed before React
  // mounts), the handler stays armed indefinitely and the dialog never shows
  // for this boot. Marker stays absent → next-boot re-fire still recovers,
  // but the user gets zero same-boot signal. When multi-window flows land,
  // add a 30-60s setTimeout that emits `mcp-wiring-mount-ack-timeout` via
  // `logger.event` and either fallback-broadcasts to all visible windows OR
  // writes a skip-marker so the loop doesn't re-arm forever.
  const rendererReadyHandler = (event: IpcMainInvokeEvent): undefined => {
    try {
      // Route through `sendToRenderer` (the D19 typed wrapper) so the
      // channel name + payload shape are validated against
      // `EventChannels['ok:mcp-wiring:show']`. `event.sender` is the same
      // `WebContents` the renderer mount-ack arrived from — i.e. the window
      // that called `okDesktop.mcpWiring.signalReady()`, guaranteeing the
      // `McpConsentDialog` subscriber is mounted when the event lands.
      sendToRenderer(event.sender, 'ok:mcp-wiring:show', {
        detectedEditors: detections,
      });
      logger.info('dispatched show to renderer', {
        detectedCount: detections.length,
        senderId: event.sender.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('show dispatch failed — handler remains armed for next renderer', {
        message,
      });
      return undefined;
    }
    // Successful dispatch — bind the sender id AND drop the one-shot now
    // so a second renderer's signalReady doesn't double-fire the show
    // event. Binding must be set BEFORE handler removal so a confirm
    // arriving concurrently on the event loop sees the captured id.
    capturedSenderId = event.sender.id;
    try {
      ipcMain.removeHandler('ok:mcp-wiring:renderer-ready');
    } catch {
      // best-effort; the handler may have been removed by destroy() racing
    }
    return undefined;
  };

  // D19: register via the typed `createHandler` wrapper (not raw
  // `ipcMain.handle`). Handler parameters are now typed against
  // `RequestChannels[K]['args']` (Pass 0 Major #10) rather than
  // `...args: unknown[]` so a future channel-shape change produces a
  // compile error at the handler signature, not a silent `.as` cast.
  // Teardown still calls `ipcMain.removeHandler` directly — that primitive
  // isn't part of the banned surface.
  const register = createHandler(ipcMain as IpcMain);
  register('ok:mcp-wiring:confirm', confirmHandler);
  register('ok:mcp-wiring:skip', skipHandler);
  register('ok:mcp-wiring:renderer-ready', rendererReadyHandler);

  logger.info('armed — waiting for renderer mount-ack', {
    detectedCount: detections.filter((d) => d.detected).length,
  });

  let destroyed = false;
  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      try {
        ipcMain.removeHandler('ok:mcp-wiring:confirm');
      } catch (err) {
        logger.warn('removeHandler(confirm) threw', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        ipcMain.removeHandler('ok:mcp-wiring:skip');
      } catch (err) {
        logger.warn('removeHandler(skip) threw', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        ipcMain.removeHandler('ok:mcp-wiring:renderer-ready');
      } catch (err) {
        logger.warn('removeHandler(renderer-ready) threw', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    get armed(): boolean {
      return !destroyed;
    },
  };
}
