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
export type OkDesktopMode = 'editor' | 'navigator';

/**
 * Config values injected at preload-exposure time. A frozen snapshot, not a
 * getter — mid-session project switches fire through `onProjectSwitched`
 * instead. Required fields are present before the first renderer render
 * because the main process awaits the utility's `ready` message before
 * creating the BrowserWindow.
 */
export interface OkDesktopConfig {
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

/**
 * Unsubscribe closure returned from `onProjectSwitched` / `onMenuAction`.
 * Calling it removes the listener. Per-electron#33328, the bridge's
 * preload-side wrapper is what actually tracks the listener reference so
 * callers must use this returned closure rather than trying to remove by
 * reference from their own code.
 */
export type OkUnsubscribe = () => void;

/**
 * Recent-projects row surfaced to the Project Navigator via
 * `bridge.project.listRecent()`. `missing` is computed at read time by main
 * (the folder was absent when the list was assembled) and rendered as a
 * "Missing" badge in the Navigator UI.
 */
export interface RecentProjectEntry {
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
export interface OkProjectOpenRequest {
  path: string;
  target: 'new-window';
}

/**
 * Payload delivered to `onUpdateDownloaded` subscribers. Fires after
 * electron-updater has completed the ZIP download and is waiting for
 * install-on-quit (or an imperative `autoUpdater.quitAndInstall()` via
 * Toast A's "Relaunch now" action). M3 D11.
 */
export interface OkUpdateDownloadedInfo {
  readonly version: string;
}

/**
 * Payload delivered to `onWhatsNew` subscribers. Fires once per version
 * transition on first launch post-update (main compared `app.getVersion()`
 * to `AppState.lastSeenVersion`). `releaseUrl` is the GitHub Releases page
 * for the new version — renderer opens it via `bridge.shell.openExternal`.
 * M3 D9/D11.
 */
export interface OkWhatsNewInfo {
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
export interface OkUpdateStuckHintInfo {
  readonly downloadUrl: string;
}

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

  /** Native folder-picker dialog surfaces. */
  dialog: {
    /** `dialog.showOpenDialog({ properties: ['openDirectory'] })`. Resolves to the selected path or `null` on cancel. */
    openFolder(): Promise<string | null>;
    /** `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`. */
    createFolder(): Promise<string | null>;
  };

  /**
   * IPC-relayed wrapper around `shell.openExternal`. Main-process handler
   * enforces the outbound-scheme allowlist (`https`, `http`, `mailto`,
   * `openknowledge` only — D47) before delegating to Electron's `shell`
   * module. Unauthorized schemes reject.
   */
  shell: {
    openExternal(url: string): Promise<void>;
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
   * Auto-update control surface. M3 AC18 / D3 revised: Toast A's "Relaunch
   * now" button calls `relaunchNow()` which invokes
   * `autoUpdater.quitAndInstall()` in main.
   */
  update: {
    relaunchNow(): Promise<void>;
  };

  /** Current platform — `process.platform` reported by preload. */
  readonly platform: 'darwin' | 'win32' | 'linux';
  /** Electron app version (from main's `app.getVersion()`). */
  readonly appVersion: string;
}

declare global {
  interface Window {
    /** Populated by the desktop preload script. Absent in web / CLI distribution. */
    okDesktop?: OkDesktopBridge;
  }
}
