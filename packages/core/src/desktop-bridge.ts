type OkDesktopMode = 'editor' | 'navigator';

interface OkDesktopConfig {
  readonly collabUrl: string;
  readonly apiOrigin: string;
  readonly projectPath: string;
  readonly projectName: string;
  readonly mode: OkDesktopMode;
}

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

type OkUnsubscribe = () => void;

interface RecentProjectEntry {
  path: string;
  name: string;
  lastOpenedAt: string;
  missing?: boolean;
}

interface OkProjectOpenRequest {
  path: string;
  target: 'new-window';
}

interface OkUpdateDownloadedInfo {
  readonly version: string;
}

interface OkWhatsNewInfo {
  readonly version: string;
  readonly releaseUrl: string;
}

interface OkUpdateStuckHintInfo {
  readonly downloadUrl: string;
}

type OkMcpWiringEditorId = 'claude' | 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'codex';

interface OkMcpWiringShowPayload {
  readonly detectedEditors: readonly {
    readonly id: OkMcpWiringEditorId;
    readonly label: string;
    readonly detected: boolean;
    readonly willReplace: boolean;
  }[];
}

type OkMcpWiringResult = { ok: true } | { ok: false; error: string };

interface OkKeyringSmokeResult {
  ok: boolean;
  backend?: 'keyring' | 'file';
  error?: string;
  durationMs?: number;
  timestamp: string;
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
interface OkScaffoldPlan {
  created: OkScaffoldFileEntry[];
  skipped: OkScaffoldSkipEntry[];
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

type OkLocalOpAuthEvent =
  | {
      type: 'verification';
      user_code: string;
      verification_uri: string;
      expires_in: number;
    }
  | {
      type: 'complete';
      host: string;
      login: string;
      name?: string;
      email?: string;
      avatarUrl?: string;
    }
  | { type: 'error'; message: string };

type OkLocalOpCloneEvent =
  | { type: 'progress'; phase: string; pct: number }
  | { type: 'complete'; dir: string }
  | { type: 'error'; message: string };

interface OkLocalOpStream<E> {
  readonly events: AsyncIterable<E>;
  cancel(): void;
}

type OkLocalOpAuthStatusResponse =
  | { authenticated: true; host: string; login: string; name?: string; email?: string }
  | { authenticated: false; host: string; error?: string };

interface OkLocalOpRepoEntry {
  full_name: string;
  clone_url: string;
  private: boolean;
}

type OkLocalOpAuthReposResponse =
  | { ok: true; host: string; repos: OkLocalOpRepoEntry[] }
  | { ok: false; error: string };

export interface OkDesktopBridge {
  readonly config: OkDesktopConfig;

  onProjectSwitched(cb: (next: OkDesktopConfig) => void): OkUnsubscribe;
  onMenuAction(cb: (action: OkMenuAction) => void): OkUnsubscribe;
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

    openAsset(
      relPath: string,
    ): Promise<
      | { ok: true }
      | { ok: false; reason: 'extension-blocked' | 'path-escape' | 'not-found' | 'resolve-error' }
    >;

    revealAsset(
      relPath: string,
    ): Promise<{ ok: true } | { ok: false; reason: 'path-escape' | 'not-found' | 'resolve-error' }>;

    showAssetMenu(params: {
      readonly relPath: string;
      readonly title: string;
      readonly kind: 'asset' | 'wiki-link' | 'image';
    }): Promise<void>;
    showItemInFolder(path: string): Promise<void>;
  };

  clipboard: {
    writeText(text: string): Promise<void>;
  };

  project: {
    listRecent(): Promise<RecentProjectEntry[]>;
    open(request: OkProjectOpenRequest): Promise<void>;
    close(): Promise<void>;
  };

  navigator: {
    open(): Promise<void>;
  };

  seed: {
    plan(rootDir?: string): Promise<OkSeedPlanResult>;
    apply(plan: OkScaffoldPlan): Promise<OkSeedApplyResult>;
  };

  skill: {
    detectClaudeDesktop(): Promise<boolean>;
    buildAndOpen(): Promise<
      | { ok: true; path: string }
      | {
          ok: false;
          reason: 'build-failed' | 'open-failed' | 'no-downloads-dir';
          message?: string;
        }
    >;
  };

  update: {
    relaunchNow(): Promise<void>;
  };

  mcpWiring: {
    onShow(cb: (payload: OkMcpWiringShowPayload) => void): OkUnsubscribe;
    signalReady(): void;
    confirm(editorIds: readonly OkMcpWiringEditorId[]): Promise<OkMcpWiringResult>;
    skip(): Promise<OkMcpWiringResult>;
  };

  localOp: {
    auth: {
      start(): OkLocalOpStream<OkLocalOpAuthEvent>;
    };
    clone: {
      start(request: { url: string; dir: string }): OkLocalOpStream<OkLocalOpCloneEvent>;
    };
    authStatus(request?: { host?: string }): Promise<OkLocalOpAuthStatusResponse>;
    authRepos(request?: { host?: string }): Promise<OkLocalOpAuthReposResponse>;
  };

  readonly platform: 'darwin' | 'win32' | 'linux';
  readonly appVersion: string;

  debug?: {
    keyringSmoke(): Promise<OkKeyringSmokeResult>;
  };
}

declare global {
  interface Window {
    okDesktop?: OkDesktopBridge;
  }
}
