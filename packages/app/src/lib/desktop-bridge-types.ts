/**
 * Local copy of the OkDesktopBridge contract types — see comment in
 * `packages/core/src/desktop-bridge.ts` and `packages/desktop/src/shared/
 * bridge-contract.ts` for why the contract is duplicated rather than
 * exported through core's barrel.
 *
 * This file's purpose is twofold:
 *   1. Type the optional `window.okDesktop` global so `useCollabUrl` and any
 *      future Electron-aware app code can read it with full type safety.
 *   2. Stay in sync with the desktop preload's contract — drift caught by a
 *      contract-equality test promised in US-013.
 *
 * Web / CLI distribution: `window.okDesktop` is `undefined` and the optional
 * chaining + `if (window.okDesktop?.config.collabUrl)` guards in `useCollabUrl`
 * fall through to the existing /api/config poll path.
 */

export type OkDesktopMode = 'editor' | 'navigator';

export interface OkDesktopConfig {
  readonly collabUrl: string;
  readonly apiOrigin: string;
  readonly projectPath: string;
  readonly projectName: string;
  readonly mode: OkDesktopMode;
}

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

export type OkUnsubscribe = () => void;

export interface RecentProjectEntry {
  path: string;
  name: string;
  lastOpenedAt: string;
  missing?: boolean;
}

export interface OkUpdateDownloadedInfo {
  readonly version: string;
}

export interface OkWhatsNewInfo {
  readonly version: string;
  readonly releaseUrl: string;
}

export interface OkUpdateStuckHintInfo {
  readonly downloadUrl: string;
}

export interface OkDesktopBridge {
  readonly config: OkDesktopConfig;
  onProjectSwitched(cb: (next: OkDesktopConfig) => void): OkUnsubscribe;
  onMenuAction(cb: (action: OkMenuAction) => void): OkUnsubscribe;
  onGitInitNotice(cb: (evt: { gitDir: string }) => void): OkUnsubscribe;
  onUpdateDownloaded(cb: (info: OkUpdateDownloadedInfo) => void): OkUnsubscribe;
  onWhatsNew(cb: (info: OkWhatsNewInfo) => void): OkUnsubscribe;
  onUpdateStuckHint(cb: (info: OkUpdateStuckHintInfo) => void): OkUnsubscribe;
  onDeepLink(cb: (evt: { doc: string }) => void): OkUnsubscribe;
  dialog: {
    openFolder(): Promise<string | null>;
    createFolder(): Promise<string | null>;
  };
  shell: {
    openExternal(url: string): Promise<void>;
    /**
     * Scheme format contract: `scheme` is the scheme NAME without trailing
     * colon (e.g. `'claude'`, not `'claude:'`). Matches the main-process
     * shell-injection sanitizer and the Linux `xdg-mime` shell-command form
     * — callers with a colonful scheme MUST strip the trailing `:` first.
     * See `packages/desktop/src/shared/bridge-contract.ts` for canonical JSDoc.
     */
    detectProtocol(scheme: string): Promise<{ installed: boolean; displayName?: string }>;
    spawnCursor(
      path: string,
    ): Promise<
      | { ok: true }
      | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' }
    >;
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
  update: {
    relaunchNow(): Promise<void>;
  };
  readonly platform: 'darwin' | 'win32' | 'linux';
  readonly appVersion: string;
}

declare global {
  interface Window {
    /** Populated by the desktop preload script. Absent in web / CLI distribution. */
    okDesktop?: OkDesktopBridge;
  }
}
