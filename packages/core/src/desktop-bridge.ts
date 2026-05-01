/**
 * `window.okDesktop` — the preload-exposed bridge that packages/app consumes
 * to detect Electron-host mode and resolve its collab URL without a /api/config
 * HTTP round-trip (D37).
 *
 * Shape lives in core so both the desktop package (who exposes it via
 * `contextBridge.exposeInMainWorld`) and the app package (who short-circuits
 * `useCollabUrl` on its presence) can import the same type. Zero desktop or
 * app deps — pure interface.
 */

/** Render mode picked by the main process when creating a BrowserWindow. */
type OkDesktopMode = 'editor' | 'navigator';

/**
 * Config values injected at preload-exposure time. A frozen snapshot, not a
 * getter — mid-session project switches fire through `onProjectSwitched`
 * instead. Required fields are present before the first renderer render
 * because the main process awaits the utility's `ready` message before
 * creating the BrowserWindow.
 */
interface OkDesktopConfig {
  /** WebSocket URL for the HocuspocusProvider (ws://localhost:<port>/collab). */
  readonly collabUrl: string;
  /** Origin for HTTP /api/* fetches (http://localhost:<port>). */
  readonly apiOrigin: string;
  /** Realpath of the project's content directory. */
  readonly projectPath: string;
  /** Display name for the project (usually basename of projectPath). */
  readonly projectName: string;
  /** Render mode — `navigator` renders the Project Navigator, `editor` renders the doc editor. */
  readonly mode: OkDesktopMode;
}

/**
 * Menu-action IDs fired by main → renderer via `ok:menu-action` after a user
 * selects a menu bar item. The renderer dispatches the action into the editor
 * store. Keep this union flat and strongly typed — a single `kind` field
 * discriminates without payload.
 */
type OkMenuAction =
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

/**
 * Unsubscribe closure returned from `onProjectSwitched` / `onMenuAction`.
 * Calling it removes the listener. Per-electron#33328, the bridge's
 * preload-side wrapper is what actually tracks the listener reference so
 * callers must use this returned closure rather than trying to remove by
 * reference from their own code.
 */
type OkUnsubscribe = () => void;

/**
 * Recent-projects row surfaced to the Project Navigator via
 * `bridge.project.listRecent()`. `missing` is computed at read time by main
 * (the folder was absent when the list was assembled) and rendered as a
 * "Missing" badge in the Navigator UI.
 */
interface RecentProjectEntry {
  path: string;
  name: string;
  lastOpenedAt: string;
  missing?: boolean;
}

/**
 * Payload accepted by `bridge.project.open(...)`. `target` stays in the
 * contract for forward-compat even though `'new-window'` is the only value
 * in v0 (D3 revised — no switch-in-place).
 */
interface OkProjectOpenRequest {
  path: string;
  target: 'new-window';
}

/**
 * Payload delivered to `onUpdateDownloaded` subscribers. Fires after
 * electron-updater has completed the ZIP download and is waiting for
 * install-on-quit (or an imperative `autoUpdater.quitAndInstall()` via
 * Toast A's "Relaunch now" action). M3 D11.
 */
interface OkUpdateDownloadedInfo {
  readonly version: string;
}

/**
 * Payload delivered to `onWhatsNew` subscribers. Fires once per version
 * transition on first launch post-update (main compared `app.getVersion()`
 * to `AppState.lastSeenVersion`). `releaseUrl` is the GitHub Releases page
 * for the new version — renderer opens it via `bridge.shell.openExternal`.
 * M3 D9/D11.
 */
interface OkWhatsNewInfo {
  readonly version: string;
  readonly releaseUrl: string;
}

/**
 * Payload delivered to `onUpdateStuckHint` subscribers. Fires at most once
 * per installation after 7 consecutive calendar days of failed update
 * checks. `downloadUrl` is the manual-download page (inkeep.com's
 * Open Knowledge download CTA); renderer opens it via
 * `bridge.shell.openExternal`. M3 D12.
 */
interface OkUpdateStuckHintInfo {
  readonly downloadUrl: string;
}

/**
 * Editor IDs surfaced through the M6b first-launch MCP consent bridge.
 * Mirrors `EditorId` in `packages/cli/src/commands/editors.ts`. Duplicated
 * across the three bridge-contract copies (desktop, core, app) and caught
 * by the M1 invariant test if any copy diverges.
 */
type OkMcpWiringEditorId = 'claude' | 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'codex';

/**
 * Payload delivered to `mcpWiring.onShow` subscribers on first-launch MCP
 * consent. Every editor in `ALL_EDITOR_IDS` appears; `detected: true`
 * preselects the checkbox in `<McpConsentDialog>` per D-M6-R4 (OQ-14 DIRECTED).
 * `willReplace: true` signals that the editor has an existing OK-managed
 * entry that Add would overwrite — surfaced per-row so long-time CLI users
 * aren't surprised to find their pre-existing entry stomped (Pass 1 Major #8).
 */
interface OkMcpWiringShowPayload {
  readonly detectedEditors: readonly {
    readonly id: OkMcpWiringEditorId;
    readonly label: string;
    readonly detected: boolean;
    readonly willReplace: boolean;
  }[];
}

/**
 * Result shape for `mcpWiring.confirm` / `skip`. `ok:false` surfaces only when
 * `writeUserMcpConfigs` throws — per-editor failures still resolve `ok:true`
 * and are surfaced to operator logs via structured `mcp-wiring-write-failed`
 * events (per OQ-19 deferred-marker semantics).
 */
type OkMcpWiringResult = { ok: true } | { ok: false; error: string };

/**
 * Result shape for `bridge.debug?.keyringSmoke()` — mirrors
 * `KeyringSmokeResult` in `packages/desktop/src/utility/keyring-smoke.ts`
 * (identical field set). Duplicated here (not imported) because core has no
 * dep on desktop. Drift across the three copies (desktop, core, app) is
 * caught by the `M1 invariant: bridge contract drift catcher` test in
 * `packages/desktop/tests/integration/m1-smoke.test.ts`, which walks the
 * interface body of each file and asserts field-name set equality.
 */
interface OkKeyringSmokeResult {
  ok: boolean;
  backend?: 'keyring' | 'file';
  error?: string;
  durationMs?: number;
  timestamp: string;
}

/**
 * Seed scaffolder shapes duplicated structurally (same rationale as
 * `OkKeyringSmokeResult` above — avoids pulling the server package into
 * core's compilation tree). Structural shape tracks
 * `@inkeep/open-knowledge-server`'s `ScaffoldPlan` / `ApplyResult` /
 * `ApplyError` / `FileEntry` / `SkipEntry` / `ConfigEdit` / `FolderRule`.
 */
interface OkFolderRule {
  match: string;
  frontmatter: {
    title?: string;
    description?: string;
    tags?: string[];
  };
}
interface OkScaffoldFileEntry {
  path: string;
  kind: 'folder' | 'file';
  contentPreview?: string;
}
interface OkScaffoldSkipEntry {
  path: string;
  reason: 'already-exists' | 'user-content' | 'glob-collision';
}
interface OkScaffoldConfigEdit {
  configPath: string;
  folderMatch: string;
  entry: OkFolderRule;
}
interface OkScaffoldPlan {
  created: OkScaffoldFileEntry[];
  skipped: OkScaffoldSkipEntry[];
  configEdits: OkScaffoldConfigEdit[];
  warnings: string[];
}
interface OkScaffoldApplyError {
  path: string;
  error: string;
}
interface OkScaffoldApplyResult {
  applied: number;
  errors: OkScaffoldApplyError[];
  durationMs: number;
}

interface OkSeedError {
  kind: 'no-project' | 'prerequisite-missing' | 'invalid-root' | 'internal';
  message: string;
}
type OkSeedPlanResult = { ok: true; plan: OkScaffoldPlan } | { ok: false; error: OkSeedError };
type OkSeedApplyResult =
  | { ok: true; result: OkScaffoldApplyResult }
  | { ok: false; error: OkSeedError };

/**
 * Renderer-facing Electron bridge. Populated on `window.okDesktop` by the
 * desktop preload script (§8.4.2 of the spec). Web distribution omits the
 * global entirely — consumers MUST use `window.okDesktop?.` optional chaining.
 *
 * Method surface is intentionally small: dialog pickers, outbound URL /
 * clipboard relays, project subscriptions, and the readonly config snapshot.
 * Broad APIs (window sizing, system info, raw ipcRenderer) are deliberately
 * omitted — new capabilities cross the preload boundary deliberately, one at
 * a time, via new typed methods.
 */
export interface OkDesktopBridge {
  readonly config: OkDesktopConfig;

  /** Subscribe to project-switch events. Returns unsubscribe. */
  onProjectSwitched(cb: (next: OkDesktopConfig) => void): OkUnsubscribe;
  /** Subscribe to menu-bar actions. Returns unsubscribe. */
  onMenuAction(cb: (action: OkMenuAction) => void): OkUnsubscribe;
  /**
   * Subscribe to `git-init-notice` — fired at most once per window, right after
   * `ensureProjectGit` ran `git init` during the utility's boot. Renderer uses
   * this to surface a sonner toast (SPEC 2026-04-21-shadow-repo-single-mode
   * R5b / D10). Returns unsubscribe.
   */
  onGitInitNotice(cb: (evt: { gitDir: string }) => void): OkUnsubscribe;
  /**
   * Subscribe to `autoUpdater` `update-downloaded` events. Fires once per
   * pending-update version (gated in main by `AppState.versionPendingInstall`).
   * Returns unsubscribe. M3 Toast A.
   */
  onUpdateDownloaded(cb: (info: OkUpdateDownloadedInfo) => void): OkUnsubscribe;
  /**
   * Subscribe to post-update "What's new" events. Fires once per version
   * transition on first launch (gated in main by `AppState.lastSeenVersion`).
   * Returns unsubscribe. M3 Toast B.
   */
  onWhatsNew(cb: (info: OkWhatsNewInfo) => void): OkUnsubscribe;
  /**
   * Subscribe to `stuck-update` hints (D12). Fires at most once per
   * installation after 7 consecutive failed-check days. Returns unsubscribe.
   * M3 Toast C.
   */
  onUpdateStuckHint(cb: (info: OkUpdateStuckHintInfo) => void): OkUnsubscribe;
  /**
   * Subscribe to `ok:deep-link` — fired when an `openknowledge://open?project=…
   * &doc=<name>` URL routed to this window (M4 SPEC 2026-04-21-m4-url-scheme).
   * Renderer updates `location.hash` to open the target doc via the existing
   * hash-route listener. Returns unsubscribe.
   */
  onDeepLink(cb: (evt: { doc: string }) => void): OkUnsubscribe;

  /** Native folder-picker dialog surfaces. */
  dialog: {
    /** `dialog.showOpenDialog({ properties: ['openDirectory'] })`. Resolves to the selected path or `null` on cancel. */
    openFolder(): Promise<string | null>;
    /** `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`. */
    createFolder(): Promise<string | null>;
  };

  /**
   * IPC-relayed wrappers around Electron's `shell` module. Main-process
   * handlers enforce the outbound-scheme allowlist (`https`, `http`,
   * `mailto`, `openknowledge`, plus `claude`, `codex`, `cursor` added by
   * SPEC 2026-04-21 for the "Open in Agent Desktop" dropdown — D47) before
   * delegating. Unauthorized schemes reject.
   */
  shell: {
    openExternal(url: string): Promise<void>;
    /**
     * Probe whether a URL scheme has a registered handler on this OS.
     * Used by the "Open in Agent Desktop" dropdown to render disabled-
     * with-tooltip rows when the target app isn't installed. Returns
     * `{installed: false}` on timeout or platform-API error.
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
     * the threat model is a command allowlist (PATH hijacking, arg
     * injection) distinct from the URL-scheme allowlist above.
     */
    spawnCursor(
      path: string,
    ): Promise<
      | { ok: true }
      | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' }
    >;
    /**
     * Append a local-only telemetry line to `~/.ok/stats.jsonl`
     * (SPEC 2026-04-21 §5.1 / E5b). Zero phone-home (XQ3 LOCKED). Resolves
     * even if HOME is unwritable — telemetry failure must never bubble up
     * and affect the dispatch path. Literal-union shape mirrors
     * `HandoffTarget` + `HandoffFailureReason` from `core/handoff/types.ts`.
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

    /**
     * Open an asset via the OS default handler. `relPath` is project-relative
     * (main-process resolves against `ProjectContext.projectPath` + `realpath` +
     * `isPathWithinProject`). Executable extensions (`.exe`, `.sh`, `.app`, …)
     * hard-refuse at the main handler — see D-A5 in the 2026-04-23 asset-embed
     * amendment for the full blocklist. Asset-click-dispatcher surface (FR-A6).
     */
    openAsset(
      relPath: string,
    ): Promise<
      | { ok: true }
      | { ok: false; reason: 'extension-blocked' | 'path-escape' | 'not-found' | 'resolve-error' }
    >;

    /**
     * Reveal an asset in the native file manager (macOS Finder / Windows
     * Explorer / Linux xdg-open → default). Parent-only — does NOT invoke the
     * OS default handler for content. Lower-risk than `openAsset`; the
     * executable blocklist does NOT apply. Asset-click-dispatcher surface (FR-A6).
     */
    revealAsset(
      relPath: string,
    ): Promise<{ ok: true } | { ok: false; reason: 'path-escape' | 'not-found' | 'resolve-error' }>;

    /**
     * Display the native right-click context menu for an on-disk reference
     * (`asset`, `wiki-link`, or `image`). Built from `Menu.buildFromTemplate`
     * in main — the gesture-attested pattern (D11 of electron-os-integration-
     * patterns research: main observes the click directly; the gesture bit
     * does NOT cross IPC). Entries: Reveal in Finder + Open in default app +
     * Copy link. Asset-click-dispatcher surface (FR-A8).
     */
    showAssetMenu(params: {
      readonly relPath: string;
      readonly title: string;
      readonly kind: 'asset' | 'wiki-link' | 'image';
    }): Promise<void>;
    /**
     * Reveal a file or folder in the OS file manager (Finder / Explorer /
     * Linux default). Path is validated against the caller window's project
     * directory in main; out-of-project, non-absolute, or null-byte-bearing
     * paths are silently refused at the wire (channel returns `undefined`
     * regardless; refusals emit a main-process `console.warn` for debugging).
     */
    showItemInFolder(path: string): Promise<void>;
  };

  /** IPC-relayed clipboard writer (sandboxed renderer cannot call clipboard directly). */
  clipboard: {
    writeText(text: string): Promise<void>;
  };

  /**
   * Project-management surface consumed by the Navigator component.
   * `listRecent` reads the LRU-capped recent list from app state; `open`
   * spawns a NEW editor window for `request.path` (D3 revised — no switch-
   * in-place in v0); `close` tears down the window hosting the call site.
   */
  project: {
    listRecent(): Promise<RecentProjectEntry[]>;
    open(request: OkProjectOpenRequest): Promise<void>;
    close(): Promise<void>;
  };

  /**
   * Re-summon the Project Navigator window from inside an editor window.
   * Backed by main's `openNavigator()` helper — focus-existing-or-create
   * with no toggle semantics. Renderer call sites: `ProjectSwitcher`
   * dropdown's "Switch Project…" item and `CommandPalette`'s "Switch
   * Project" entry. The File menu's "Switch Project…" item invokes
   * `openNavigator()` directly inside main without crossing the bridge.
   */
  navigator: {
    open(): Promise<void>;
  };

  /**
   * `ok seed` scaffolder surface consumed by the FileSidebar + menu.
   * `plan()` is read-only and returns what the scaffolder would write;
   * `apply(plan)` performs the writes. Mirrors the shadcn-3.0 shared-
   * implementation pattern — same functions run under the Commander CLI
   * (`ok seed`). See SPEC 2026-04-23-ok-seed-scaffold.
   */
  seed: {
    plan(rootDir?: string): Promise<OkSeedPlanResult>;
    apply(plan: OkScaffoldPlan): Promise<OkSeedApplyResult>;
  };

  /**
   * Claude Chat & Cowork skill install-dialog hooks (SPEC 2026-04-24 Ship
   * 1e/1j). Drives the 2-click install via Claude.app's `.skill`
   * `CFBundleDocumentType`. Local-build design: `.skill` is produced on
   * demand from the app-bundled SKILL.md; no GitHub Releases dep.
   */
  skill: {
    /** True when Claude Desktop's config dir exists on this machine. */
    detectClaudeDesktop(): Promise<boolean>;
    /**
     * Build `openknowledge.skill` from the bundled source, save to
     * Downloads, invoke the OS file association. Fire-and-forget —
     * Claude's native install dialog takes over on `ok: true`.
     */
    buildAndOpen(): Promise<
      | { ok: true; path: string }
      | {
          ok: false;
          reason: 'build-failed' | 'open-failed' | 'no-downloads-dir';
          message?: string;
        }
    >;
  };

  /**
   * Auto-update control surface. M3 AC18 / D3 revised: Toast A's "Relaunch
   * now" button calls `relaunchNow()` which invokes
   * `autoUpdater.quitAndInstall()` in main.
   */
  update: {
    relaunchNow(): Promise<void>;
  };

  /**
   * M6b first-launch MCP consent surface. Renderer mounts `<McpConsentDialog>`
   * when `onShow` fires; calls `confirm` / `skip` on user action; calls
   * `signalReady()` once on app mount so main knows a renderer is subscribed
   * (D-M6-R10 mount-ack handshake).
   */
  mcpWiring: {
    /** Subscribe to the consent-dialog-show event. Returns unsubscribe. */
    onShow(cb: (payload: OkMcpWiringShowPayload) => void): OkUnsubscribe;
    /** Fire a one-way mount-ack event so main's whenRendererReady gate opens. */
    signalReady(): void;
    /** User clicked Add. `editorIds` is the subset the user checked. */
    confirm(editorIds: readonly OkMcpWiringEditorId[]): Promise<OkMcpWiringResult>;
    /** User clicked Skip (or pressed ESC). */
    skip(): Promise<OkMcpWiringResult>;
  };

  /** Current platform — `process.platform` reported by preload. */
  readonly platform: 'darwin' | 'win32' | 'linux';
  /** Electron app version (from main's `app.getVersion()`). */
  readonly appVersion: string;

  /**
   * Debug-only namespace — populated by preload ONLY when the
   * `OK_DEBUG_KEYRING_SMOKE=1` env var is set OR the app is unpacked (dev
   * mode). Absent in normal production runs. M5 SPEC D-M5-8.
   */
  debug?: {
    keyringSmoke(): Promise<OkKeyringSmokeResult>;
  };
}

declare global {
  interface Window {
    /** Populated by the desktop preload script. Absent in web / CLI distribution. */
    okDesktop?: OkDesktopBridge;
  }
}
