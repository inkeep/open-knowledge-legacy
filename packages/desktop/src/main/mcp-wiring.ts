/**
 * First-launch MCP wiring — pure helpers for M6b / US-007.
 *
 * Three pure pieces, all dependency-injected for bun-test loadability:
 *
 *   1. Marker read/write at `<home>/.open-knowledge/.mcp-status.json`. The
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
  writeFileSync as fsWriteFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type {
  McpWiringConfirmRequest,
  McpWiringConfirmResult,
  McpWiringEditorDetection,
  McpWiringEditorId,
  McpWiringSkipResult,
} from '../shared/ipc-channels.ts';
import { createHandler } from '../shared/ipc-handler.ts';

/** Canonical symlink path created by M6a (`Install Command-Line Tools…`). */
export const SYMLINK_OK_PATH = '/usr/local/bin/ok';

const MCP_STATUS_DIR_NAME = '.open-knowledge';
const MCP_STATUS_FILE_NAME = '.mcp-status.json';

/**
 * Shape of `<home>/.open-knowledge/.mcp-status.json`. Either a confirmed
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
 */
export interface McpWiringFsOps {
  existsSync(path: string): boolean;
  readlinkSync(path: string): string;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, content: string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
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
 * Write the marker. Creates `<home>/.open-knowledge/` when absent so the
 * first-ever first-launch write succeeds on a machine with no prior OK
 * user-level state. Pretty-printed + trailing newline so `cat` output
 * is readable for a user inspecting their own config.
 */
export function writeMcpStatusMarker(
  home: string,
  status: McpStatusMarker,
  fs: McpWiringFsOps = defaultFsOps,
): void {
  const path = mcpStatusMarkerPath(home);
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(path, `${JSON.stringify(status, null, 2)}\n`);
}

/**
 * Bundle-absolute wrapper path. Same shape computation as
 * `cli-install.wrapperPathInBundle`; kept local so mcp-wiring doesn't
 * take a cross-module dependency for a 2-line path derivation.
 */
function wrapperPathInBundle(executablePath: string): string {
  const bundleRoot = executablePath.replace(/\/Contents\/MacOS\/.*$/, '');
  return join(bundleRoot, 'Contents', 'Resources', 'cli', 'bin', 'ok.sh');
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
 * Structurally-compatible subset of `EditorMcpTarget.isCompatible` from
 * `packages/cli/src/commands/editors.ts`. A real `EditorMcpTarget` is
 * structurally assignable to this interface, so call sites in US-008
 * can pass `EDITOR_TARGETS[id]` directly without a wrapper. Defined
 * inline here so mcp-wiring doesn't require a cross-package import
 * from `@inkeep/open-knowledge`.
 */
export interface ForceComputeTarget {
  isCompatible(
    existing: Record<string, unknown>,
    cwd: string,
    options?: { mode?: 'published' | 'dev'; cliPath?: string; cliEntryPath?: string },
  ): boolean;
}

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
 * Match any prior cliPath shape: `{command:<any-string>, args:['mcp']}`
 * where `command` is not `npx` (which would be the canonical published
 * shape, not a cliPath shape).
 *
 * Published canonical has `args.length === 2` (`[@inkeep/..., 'mcp']`),
 * dev-mode has `args.length === 2` (`[<cli.mjs>, 'mcp']`), and the
 * `-y` variant has `args.length === 3`. Only our cliPath shape has
 * exactly `['mcp']` — this makes the detection robust to the exact
 * cliPath value (which varies across auto-update + app-move).
 */
function isPriorCliPathShape(existing: Record<string, unknown>): boolean {
  if (typeof existing.command !== 'string') return false;
  if (existing.command === 'npx') return false;
  if (!Array.isArray(existing.args)) return false;
  return existing.args.length === 1 && existing.args[0] === 'mcp';
}

// ---------------------------------------------------------------------------
// Runtime orchestration — US-008 (M6b runMcpWiringOnFirstLaunch)
// ---------------------------------------------------------------------------

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
    force?: boolean | Set<McpWiringEditorId>;
    cliPath?: string;
    home?: string;
  }): Promise<
    Array<{
      editorId: McpWiringEditorId;
      label: string;
      action:
        | 'written'
        | 'skipped-existing'
        | 'skipped-conflict'
        | 'overwritten'
        | 'skipped-flag'
        | 'failed';
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
  /** `EDITOR_TARGETS[id]` keyed by editor. Structurally a superset of
   *  `ForceComputeTarget`; used for `computeForce` + label lookup. */
  editorTargets: Record<McpWiringEditorId, EditorTargetForWiring>;
}

/**
 * Shape of an `EDITOR_TARGETS[id]` value as M6b needs it. Structural subset
 * of `EditorMcpTarget` in editors.ts — we only read `id`, `label`, and call
 * `isCompatible` (via `ForceComputeTarget`). The real `EditorMcpTarget` is
 * structurally assignable.
 */
export interface EditorTargetForWiring extends ForceComputeTarget {
  readonly id: McpWiringEditorId;
  readonly label: string;
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

  // Idempotent — marker present means prior decision recorded; never re-fire.
  const marker = readMcpStatusMarker(home, fs);
  if (marker !== null) {
    logger.info('skip — marker present', { configured: marker.configured });
    return inertHandle;
  }

  const detectedIds = new Set<McpWiringEditorId>(cli.detectInstalledEditors('', home));
  const detections: McpWiringEditorDetection[] = cli.allEditorIds.map((id) => ({
    id,
    label: cli.editorTargets[id].label,
    detected: detectedIds.has(id),
  }));

  // Once-per-boot idempotence gate. Flipped on the FIRST confirm or skip.
  let handled = false;

  const confirmHandler = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): Promise<McpWiringConfirmResult> => {
    if (handled) return { ok: true };
    handled = true;
    const request = (args[0] ?? {}) as McpWiringConfirmRequest;
    const selectedEditors = Array.isArray(request.editorIds)
      ? [...request.editorIds].filter((id): id is McpWiringEditorId =>
          cli.allEditorIds.includes(id as McpWiringEditorId),
        )
      : [];

    const cliPath = resolveCliPath(executablePath, fs);

    // Per-editor force classification (D-M6-R4 refined). Foreign shapes are
    // preserved; managed shapes (canonical npx, -y variant, prior cliPath) are
    // overwritten via `force: Set<EditorId>`.
    const forceSet = new Set<McpWiringEditorId>();
    for (const editor of selectedEditors) {
      const target = cli.editorTargets[editor];
      if (!target) continue;
      const existing = cli.readExistingMcpEntry(editor, home);
      if (existing === null) continue; // absent entry → plain write, no force needed
      if (computeForce(existing, target)) {
        forceSet.add(editor);
      } else {
        logger.event({
          event: 'mcp-wiring-skip-customized',
          editor,
        });
      }
    }

    let results: Awaited<ReturnType<McpWiringCliSurface['writeUserMcpConfigs']>>;
    try {
      results = await cli.writeUserMcpConfigs({
        editors: selectedEditors,
        force: forceSet,
        cliPath,
        home,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('writeUserMcpConfigs threw — marker not written', { message });
      return { ok: false, error: message };
    }

    // Deferred-marker (OQ-19). If any per-editor write failed, leave the
    // marker absent so the next app launch re-fires the dialog.
    let anyFailed = false;
    for (const r of results) {
      if (r.action === 'failed') {
        anyFailed = true;
        logger.event({
          event: 'mcp-wiring-write-failed',
          editor: r.editorId,
          configPath: r.configPath,
          error: r.error ?? null,
        });
      }
    }
    if (anyFailed) {
      logger.info('partial failure — marker not written; dialog will re-fire next boot');
      return { ok: true };
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
      return { ok: false, error: message };
    }

    logger.info('configured', { editors: selectedEditors, cliPath });
    return { ok: true };
  };

  const skipHandler = async (_event: IpcMainInvokeEvent): Promise<McpWiringSkipResult> => {
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
      // Skip writes should not fail in practice; log and surface ok:true so
      // the dialog still closes. Marker absence → dialog re-fires next boot.
      const message = err instanceof Error ? err.message : String(err);
      logger.error('skip-marker write failed', { message });
      return { ok: true };
    }
    logger.info('skipped');
    return { ok: true };
  };

  // D-M6-R10 mount-ack handshake. The renderer-ready invoke fires AFTER
  // React has subscribed to `ok:mcp-wiring:show`, so sending show on its
  // receipt avoids the `did-finish-load` race (subscribe-order vs. send).
  // One-shot: first renderer-ready wins the dialog. Remove-then-dispatch
  // ordering means a racing second invoke sees no handler and rejects —
  // the preload swallows that rejection by design.
  const rendererReadyHandler = (event: IpcMainInvokeEvent): undefined => {
    try {
      ipcMain.removeHandler('ok:mcp-wiring:renderer-ready');
    } catch {
      // best-effort; continue dispatching even if removeHandler glitches
    }
    try {
      (event as unknown as IpcMainEventLike).sender.send('ok:mcp-wiring:show', {
        detectedEditors: detections,
      });
      logger.info('dispatched show to renderer', { detectedCount: detections.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('show dispatch failed', { message });
    }
    return undefined;
  };

  // D19: register via the typed `createHandler` wrapper (not raw
  // `ipcMain.handle`). Teardown still calls `ipcMain.removeHandler` directly —
  // that primitive isn't part of the banned surface.
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
