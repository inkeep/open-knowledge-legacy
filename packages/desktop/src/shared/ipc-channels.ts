/**
 * Typed IPC request channel map (renderer → main, request/response pattern).
 *
 * D14 (hand-rolled discriminated union, not tRPC/tipc): every channel name is
 * a top-level key in `RequestChannels`; each key maps to `{ args: [...]; result: T }`.
 * The preload-side `invoke<K>()` helper (see `./ipc-invoke.ts`) uses these
 * types for full autocomplete + compile-time safety. Grep-able channel names
 * are the primary observability — a channel name tells you exactly where the
 * handler lives in main and where the caller lives in renderer without touching
 * a debugger.
 *
 * Scale-match trigger (FU-3): at >20 channels, migrate baseline to
 * `@electron-toolkit/typed-ipc` or `@egoist/tipc`. Currently ~8 channels.
 */

import type { KeyringSmokeResult } from '../utility/keyring-smoke.ts';
import type { OkDesktopConfig } from './bridge-contract.ts';

/** Recent-project row as surfaced to the Navigator. */
export interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: string;
  /** true if the folder no longer exists on disk (rendered dimmed with "Missing" badge). */
  missing?: boolean;
}

/** Project-open request payload (IPC `ok:project:open`). */
export interface ProjectOpenRequest {
  path: string;
  /**
   * Per D3 revised: every project open spawns a new editor BrowserWindow.
   * `target: 'new-window'` is the only supported value in M1 — the field is
   * kept for forward-compat if a future spec re-introduces switch-in-current-window.
   */
  target: 'new-window';
}

/** Outcome of a spawn probe — narrow shape so renderer can branch cleanly without inspecting strings. */
export type SpawnOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' };

/**
 * Append-only telemetry payload — one JSONL line per Open-in-Agent dispatch
 * written to `~/.open-knowledge/stats.jsonl` (SPEC 2026-04-21 §5.1 / E5b).
 * Zero phone-home (XQ3 LOCKED). Local-only diagnostic counter — when a
 * dogfood user reports "it didn't work," the file gives target / outcome /
 * reason history without any network egress.
 *
 * Literal-union fields mirror `HandoffTarget` + `HandoffFailureReason` from
 * `@inkeep/open-knowledge-core/handoff/types.ts`. Duplication is deliberate —
 * shared/ipc-channels.ts deliberately has no app-package dependencies (same
 * pattern as `SpawnOutcome` above and the `bridge-contract.ts` mirroring).
 */
export interface HandoffStatsLine {
  readonly target: 'claude-cowork' | 'claude-code' | 'codex' | 'cursor';
  readonly host: 'electron' | 'web';
  readonly outcome: 'ok' | 'error';
  /** ISO 8601 timestamp from the caller — not generated server-side so tests
   *  can supply a deterministic value. */
  readonly ts: string;
  /** Mirrors `HandoffFailureReason` literal union — present only on `outcome:'error'`. */
  readonly reason?:
    | 'not-installed'
    | 'scheme-blocked'
    | 'web-endpoint-error'
    | 'invalid-payload'
    | 'dispatch-error'
    | 'web-host-cursor-unsupported';
}

/** Editor IDs known to the first-launch MCP consent flow (M6b). Mirrors
 *  `EditorId` in `packages/cli/src/commands/editors.ts`. Duplicated here so
 *  the IPC surface stays self-contained — desktop does NOT dep `@inkeep/open-knowledge`
 *  as a package. Drift caught at typecheck if the CLI adds a new editor. */
export type McpWiringEditorId =
  | 'claude'
  | 'claude-desktop'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'codex';

/** Single entry in the consent dialog — one per editor in `ALL_EDITOR_IDS`.
 *  `detected: true` preselects the checkbox (OQ-14 DIRECTED). */
export interface McpWiringEditorDetection {
  readonly id: McpWiringEditorId;
  readonly label: string;
  readonly detected: boolean;
}

/** Confirm payload from renderer → main. Editors the user checked when they
 *  clicked "Add". Subset of `McpWiringEditorId`. */
export interface McpWiringConfirmRequest {
  readonly editorIds: readonly McpWiringEditorId[];
}

/** Confirm / skip response shape. `ok:false` currently only surfaces when
 *  `writeUserMcpConfigs` throws — per-editor failures still resolve `ok:true`
 *  and are surfaced via `mcp-wiring-write-failed` structured log events. */
export type McpWiringConfirmResult = { ok: true } | { ok: false; error: string };
export type McpWiringSkipResult = { ok: true };

export interface RequestChannels {
  /** Open native folder-picker (`showOpenDialog({ properties: ['openDirectory'] })`). */
  'ok:dialog:open-folder': { args: []; result: string | null };
  /** Open native folder-picker with create-directory enabled. */
  'ok:dialog:create-folder': { args: []; result: string | null };
  /** Outbound URL via `shell.openExternal` (D47 scheme allowlist enforced in main handler). */
  'ok:shell:open-external': { args: [url: string]; result: undefined };
  /**
   * Detect whether a URL scheme has a registered handler on this OS — used by
   * the "Open in Agent Desktop" dropdown to render disabled-with-tooltip rows
   * when the target app is not installed. Returns `{installed: false}` on any
   * failure (timeout, platform-API error) — conservative default per SPEC §6.4.
   *
   * **Scheme format contract:** `scheme` is the scheme NAME without trailing
   * colon (e.g. `'claude'`, not `'claude:'`). This matches the Linux
   * `xdg-mime query default x-scheme-handler/<name>` shell-command form AND
   * the main-process handler's shell-injection sanitizer `^[a-z][a-z0-9+.-]*$`
   * which rejects colons by design. Callers with a colonful scheme (as in
   * `KNOWN_TARGETS.schemes` / `URL.protocol` / `ALLOWED_SCHEMES`) must strip
   * the trailing `:` before invoking — see `probeViaElectron` in
   * `packages/app/src/lib/handoff/install-detect.ts`.
   */
  'ok:shell:detect-protocol': {
    args: [scheme: string];
    result: { installed: boolean; displayName?: string };
  };
  /**
   * Cursor IDE step-1 folder spawn (pair of the cursor:// prompt URL that
   * fires from `shell.openExternal` after a settle delay). Dedicated channel —
   * not overloading `ok:shell:open-external` — because the threat model is a
   * command allowlist (PATH hijacking, arg injection) distinct from the URL-
   * scheme allowlist. See SPEC §6.5 TQ4b LOCKED.
   */
  'ok:shell:spawn-cursor': { args: [path: string]; result: SpawnOutcome };
  /**
   * Append a local-only telemetry line to `~/.open-knowledge/stats.jsonl`.
   * Zero phone-home (XQ3 LOCKED). Resolves on success; resolves (without
   * throwing) when HOME is unwritable so the dispatch path is never affected
   * by telemetry failure (SPEC 2026-04-21 §13.1 / E5b).
   *
   * Channel name is `ok:shell:record-handoff` (not `ok:handoff:record`) so it
   * matches the `ok:<surface>:<verb>` convention that maps 1:1 to the
   * `shell.recordHandoff` bridge location. Grep-based channel-to-handler
   * navigation stays within one namespace (`ok:shell:*`).
   */
  'ok:shell:record-handoff': { args: [line: HandoffStatsLine]; result: undefined };
  /** Clipboard text write (IPC-relay — renderer is sandboxed). */
  'ok:clipboard:write-text': { args: [text: string]; result: undefined };
  /** Read the current window's config (projectPath, collabUrl, etc.). */
  'ok:project:get-info': { args: []; result: OkDesktopConfig };
  /** Read the LRU-capped recent-projects list from app state. */
  'ok:project:list-recent': { args: []; result: RecentProject[] };
  /** Request main to open a project (always spawns new editor window per D3 revised). */
  'ok:project:open': { args: [request: ProjectOpenRequest]; result: undefined };
  /** Request main to close the current project's window. */
  'ok:project:close': { args: []; result: undefined };
  /**
   * M3 Toast A "Relaunch now" action: renderer invokes this after the user
   * clicks the sonner action button. Main handler calls
   * `autoUpdater.quitAndInstall()` which triggers Squirrel.Mac's ZIP swap
   * and relaunches on the new version. AC18 / D3 revised.
   */
  'ok:update:relaunch-now': { args: []; result: undefined };
  /**
   * Debug-only keyring smoke — relays into the window's utility process and
   * round-trips setPassword/getPassword/deletePassword against a namespace-
   * scoped keychain entry (SPEC D-M5-1). Gated at runtime: disabled in
   * packaged builds unless `OK_DEBUG_KEYRING_SMOKE=1` (D-M5-7). Renderer
   * surface is populated only when the same gate allows (D-M5-8).
   */
  'ok:debug:keyring-smoke': { args: []; result: KeyringSmokeResult };
  /**
   * M6b first-launch MCP consent — user clicked "Add" in `<McpConsentDialog>`.
   * Main resolves the hybrid `cliPath` per D-M6-R9, classifies each editor's
   * existing entry via `computeForce`, calls `writeUserMcpConfigs`, and writes
   * the user-scoped marker at `<home>/.open-knowledge/.mcp-status.json` IFF
   * every per-editor write succeeds (deferred-marker per OQ-19). Per-editor
   * failures emit `mcp-wiring-write-failed` structured logs and leave the
   * marker absent so the dialog re-fires next launch. Foreign (user-customized)
   * entries are preserved and logged as `mcp-wiring-skip-customized`.
   */
  'ok:mcp-wiring:confirm': {
    args: [request: McpWiringConfirmRequest];
    result: McpWiringConfirmResult;
  };
  /**
   * M6b first-launch MCP consent — user clicked "Skip" (or ESC). Main writes
   * `{configured: false, skippedAt}` to the user-scoped marker so the dialog
   * never re-fires. Re-triggering the consent flow requires manually deleting
   * the marker file (OQ-5).
   */
  'ok:mcp-wiring:skip': { args: []; result: McpWiringSkipResult };
  /**
   * M6b mount-ack handshake (D-M6-R10). Every renderer (Navigator + editor)
   * invokes this once on React-app first mount. The FIRST invoke per boot
   * tells main a renderer is subscribed to `ok:mcp-wiring:show`; main
   * responds by dispatching the show event back to the invoking webContents
   * and removes the handler so subsequent mounts don't re-fire the dialog.
   * Modeled as invoke/result (not a one-way event) so it composes through
   * the typed `createHandler` / `createInvoker` wrappers (D19 enforcement).
   * Result is `undefined` — the renderer discards it.
   */
  'ok:mcp-wiring:renderer-ready': { args: []; result: undefined };
}
