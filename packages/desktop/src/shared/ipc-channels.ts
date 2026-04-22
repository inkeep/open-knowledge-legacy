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
}
