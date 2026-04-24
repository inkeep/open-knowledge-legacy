/**
 * `window.okDesktop` bridge contract — desktop-side canonical source.
 *
 * The same shape is also defined at `@inkeep/open-knowledge-core`'s
 * `desktop-bridge.ts` (consumed by the app package via its existing core
 * dependency) and app-locally at `packages/app/src/lib/desktop-bridge-types.ts`.
 * Drift across the three copies is caught by the `M1 invariant: bridge
 * contract drift catcher` test in
 * `packages/desktop/tests/integration/m1-smoke.test.ts`, which asserts
 * top-level `OkDesktopBridge` member parity AND the `KeyringSmokeResult` /
 * `OkKeyringSmokeResult` field shape across all three files.
 *
 * Why duplicated: moving the types to core's `exports` map + re-exports from
 * the core barrel pulls core's full compilation tree (markdown, CRDT bridge,
 * etc.) into desktop's TypeScript program via `moduleResolution: bundler`.
 * Desktop doesn't have core's mdast-adjacent dependencies declared, so the
 * module augmentation in core's `mdast-augmentation.ts` fails to resolve in
 * desktop's context. Duplication avoids the cross-package module-resolution
 * issue while preserving a single logical contract.
 */

import type { ApplyResult, ScaffoldPlan } from '@inkeep/open-knowledge-server';
import type { KeyringSmokeResult } from '../utility/keyring-smoke.ts';

export type { KeyringSmokeResult } from '../utility/keyring-smoke.ts';

/** Renderer-facing result of `okDesktop.seed.plan()`. Mirrors `SeedPlanResult` in main. */
export type OkSeedPlanResult =
  | { ok: true; plan: ScaffoldPlan }
  | {
      ok: false;
      error: { kind: 'no-project' | 'prerequisite-missing' | 'internal'; message: string };
    };

/** Renderer-facing result of `okDesktop.seed.apply(plan)`. Mirrors `SeedApplyResult` in main. */
export type OkSeedApplyResult =
  | { ok: true; result: ApplyResult }
  | {
      ok: false;
      error: { kind: 'no-project' | 'prerequisite-missing' | 'internal'; message: string };
    };

/** Render mode picked by the main process when creating a BrowserWindow. */
export type OkDesktopMode = 'editor' | 'navigator';

/** Frozen snapshot of window-level config injected at preload-exposure time. */
export interface OkDesktopConfig {
  readonly collabUrl: string;
  readonly apiOrigin: string;
  readonly projectPath: string;
  readonly projectName: string;
  readonly mode: OkDesktopMode;
}

/** Menu-action IDs fired by main → renderer on user menu selection. */
export type OkMenuAction =
  | 'new-doc'
  | 'new-folder'
  | 'rename'
  | 'delete'
  | 'toggle-sidebar'
  | 'toggle-source'
  | 'save-version'
  | 'version-history'
  | 'focus-search'
  | 'focus-command-palette';

/** Returned by `onProjectSwitched` / `onMenuAction`. Call to detach the listener. */
export type OkUnsubscribe = () => void;

export interface RecentProjectEntry {
  path: string;
  name: string;
  lastOpenedAt: string;
  missing?: boolean;
}

/** Payload passed to `onUpdateDownloaded` subscribers. Mirrors ok:update:downloaded. */
export interface OkUpdateDownloadedInfo {
  readonly version: string;
}

/** Payload passed to `onWhatsNew` subscribers. Mirrors ok:update:whats-new. */
export interface OkWhatsNewInfo {
  readonly version: string;
  readonly releaseUrl: string;
}

/** Payload passed to `onUpdateStuckHint` subscribers. Mirrors ok:update:stuck-hint. */
export interface OkUpdateStuckHintInfo {
  readonly downloadUrl: string;
}

/**
 * Editor IDs surfaced through the M6b first-launch MCP consent bridge.
 * Mirrors `McpWiringEditorId` in `./ipc-channels.ts` and the canonical
 * `EditorId` in `packages/cli/src/commands/editors.ts`. Drift across the
 * three bridge-contract copies is caught by the M1 invariant test.
 */
export type OkMcpWiringEditorId =
  | 'claude'
  | 'claude-desktop'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'codex';

/** Payload passed to `onShow` subscribers. Mirrors ok:mcp-wiring:show.
 *  `willReplace: true` signals the editor has an existing OK-managed entry
 *  that Add would overwrite (Pass 1 Major #8 — per-editor disclosure). */
export interface OkMcpWiringShowPayload {
  readonly detectedEditors: readonly {
    readonly id: OkMcpWiringEditorId;
    readonly label: string;
    readonly detected: boolean;
    readonly willReplace: boolean;
  }[];
}

/** Result shape for `mcpWiring.confirm` / `skip`. */
export type OkMcpWiringResult = { ok: true } | { ok: false; error: string };

/** Renderer-facing Electron bridge. Populated on `window.okDesktop` by the desktop preload script. */
export interface OkDesktopBridge {
  readonly config: OkDesktopConfig;

  onProjectSwitched(cb: (next: OkDesktopConfig) => void): OkUnsubscribe;
  onMenuAction(cb: (action: OkMenuAction) => void): OkUnsubscribe;
  /**
   * Subscribe to `git-init-notice` — fired at most once per window, right after
   * `ensureProjectGit` ran `git init` during the utility's boot. Renderer uses
   * this to surface a sonner toast (SPEC R5b / D10).
   */
  onGitInitNotice(cb: (evt: { gitDir: string }) => void): OkUnsubscribe;
  onUpdateDownloaded(cb: (info: OkUpdateDownloadedInfo) => void): OkUnsubscribe;
  onWhatsNew(cb: (info: OkWhatsNewInfo) => void): OkUnsubscribe;
  onUpdateStuckHint(cb: (info: OkUpdateStuckHintInfo) => void): OkUnsubscribe;
  /**
   * Subscribe to `ok:deep-link` — fired when an `openknowledge://` URL routed
   * to this window (M4). Renderer updates `location.hash` to open the target
   * doc via the existing hash-route listener.
   */
  onDeepLink(cb: (evt: { doc: string }) => void): OkUnsubscribe;

  dialog: {
    openFolder(): Promise<string | null>;
    createFolder(): Promise<string | null>;
  };

  shell: {
    openExternal(url: string): Promise<void>;
    /**
     * Probe whether a URL scheme has a registered handler on this OS.
     * Used by the "Open in Agent Desktop" dropdown (SPEC 2026-04-21) to
     * render disabled-with-tooltip rows when the target app isn't installed.
     * Returns `{installed: false}` on timeout or platform-API error.
     *
     * **Scheme format contract:** `scheme` is the scheme NAME without
     * trailing colon (e.g. `'claude'`, not `'claude:'`). Matches the Linux
     * `xdg-mime query default x-scheme-handler/<name>` shell-command form
     * and the main-process shell-injection sanitizer — callers with a
     * colonful scheme MUST strip the trailing `:` first.
     */
    detectProtocol(scheme: string): Promise<{ installed: boolean; displayName?: string }>;
    /**
     * Step 1 of the Cursor two-step handoff — spawns `cursor <path>` via a
     * validated argv (shell:false, 2s timeout). Dedicated channel because
     * the threat model is a command allowlist distinct from the URL-scheme
     * allowlist. See SPEC §6.5 TQ4b LOCKED.
     */
    spawnCursor(
      path: string,
    ): Promise<
      | { ok: true }
      | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' }
    >;
    /**
     * Append a local-only telemetry line to `~/.open-knowledge/stats.jsonl`
     * (SPEC 2026-04-21 §5.1 / E5b). Zero phone-home (XQ3 LOCKED). Resolves
     * even if HOME is unwritable — telemetry failure must never bubble up
     * and affect the dispatch path. The literal-union shape mirrors
     * `HandoffTarget` + `HandoffFailureReason` from the core handoff types.
     */
    recordHandoff(line: {
      readonly target: 'claude-cowork' | 'claude-code' | 'codex' | 'cursor';
      readonly host: 'electron' | 'web';
      readonly outcome: 'ok' | 'error';
      readonly ts: string;
      readonly reason?:
        | 'not-installed'
        | 'scheme-blocked'
        | 'web-endpoint-error'
        | 'invalid-payload'
        | 'dispatch-error'
        | 'web-host-cursor-unsupported';
    }): Promise<void>;
  };

  clipboard: {
    writeText(text: string): Promise<void>;
  };

  project: {
    listRecent(): Promise<RecentProjectEntry[]>;
    open(request: { path: string; target: 'new-window' }): Promise<void>;
    close(): Promise<void>;
  };

  seed: {
    /** Compute a scaffold plan for the current window's project (read-only). */
    plan(): Promise<OkSeedPlanResult>;
    /** Apply a ScaffoldPlan — writes folders, log.md, and config.yml entries. */
    apply(plan: ScaffoldPlan): Promise<OkSeedApplyResult>;
  };

  update: {
    /** Invokes `autoUpdater.quitAndInstall()` in main. Triggered by Toast A's "Relaunch now" action. */
    relaunchNow(): Promise<void>;
  };

  /**
   * M6b first-launch MCP consent surface. Renderer mounts `<McpConsentDialog>`
   * when `onShow` fires; calls `confirm` / `skip` on user action; calls
   * `signalReady()` once on app mount so main knows a renderer is subscribed
   * (D-M6-R10 mount-ack handshake). Available in every Electron host window
   * (Navigator + editor) — first-ack wins per D-M6-R10.
   */
  mcpWiring: {
    /** Subscribe to the consent-dialog-show event. Returns unsubscribe. */
    onShow(cb: (payload: OkMcpWiringShowPayload) => void): OkUnsubscribe;
    /** Fire a one-way mount-ack event — main's whenRendererReady gate. */
    signalReady(): void;
    /** User clicked Add. `editorIds` is the subset the user checked. */
    confirm(editorIds: readonly OkMcpWiringEditorId[]): Promise<OkMcpWiringResult>;
    /** User clicked Skip (or pressed ESC). */
    skip(): Promise<OkMcpWiringResult>;
  };

  readonly platform: 'darwin' | 'win32' | 'linux';
  readonly appVersion: string;

  /**
   * Debug-only namespace — populated by preload ONLY when
   * `process.env.OK_DEBUG_KEYRING_SMOKE === '1'` OR `app.isPackaged === false`
   * (SPEC D-M5-8). Absent in normal production runs, so a typo in renderer
   * code calling a non-existent method surfaces at TypeScript compile time.
   */
  debug?: {
    /**
     * Run the utility-process keyring smoke and return the result. Rejects
     * with 'debug-channel disabled in production' when the runtime gate is
     * closed (app packaged + env var unset).
     */
    keyringSmoke(): Promise<KeyringSmokeResult>;
  };
}

declare global {
  interface Window {
    /** Populated by the desktop preload script. Absent in web / CLI distribution. */
    okDesktop?: OkDesktopBridge;
  }
}
