import type { CreateNewBannerKind, EditorId, OkFolderState } from '@inkeep/open-knowledge-core';

export type { OkFolderState };

/** Seed scaffolder shapes — structurally duplicated from
 * `@inkeep/open-knowledge-server`'s seed module. See core's desktop-bridge.ts
 * for rationale (avoids pulling server into the app compilation tree).
 *
 * Folder defaults moved out of `config.yml` `folders:` and into nested
 * `<folder>/.ok/frontmatter.yml` files written via the standard file-entry
 * path. The previous `OkFolderRule` / `OkScaffoldConfigEdit` mirror types +
 * the `configEdits` field on `OkScaffoldPlan` were removed alongside. */
interface OkScaffoldFileEntry {
  path: string;
  kind: 'folder' | 'file';
  contentPreview?: string;
}
interface OkScaffoldSkipEntry {
  path: string;
  reason: 'already-exists' | 'user-content' | 'glob-collision';
}
interface OkScaffoldPersonalTemplatePreview {
  willWrite: string[];
  willSkip: string[];
}
export interface OkScaffoldPersonalTemplateWriteResult {
  written: string[];
  skipped: string[];
  errors: Array<{ path: string; error: string }>;
}
export interface OkScaffoldPlan {
  created: OkScaffoldFileEntry[];
  skipped: OkScaffoldSkipEntry[];
  warnings: string[];
  personalTemplates?: OkScaffoldPersonalTemplatePreview;
}
interface OkScaffoldApplyError {
  path: string;
  error: string;
}
export interface OkScaffoldApplyResult {
  applied: number;
  errors: OkScaffoldApplyError[];
  durationMs: number;
}
export interface OkSeedError {
  kind: 'no-project' | 'prerequisite-missing' | 'invalid-root' | 'internal';
  message: string;
}

export type OkPackId =
  | 'knowledge-base'
  | 'software-lifecycle'
  | 'plain-notes'
  | 'worldbuilding'
  | 'writing-pipeline'
  | 'gbrain';

interface OkSeedPlanOptions {
  rootDir?: string;
  packId?: OkPackId;
  includePersonalTemplates?: boolean;
}

interface OkSeedApplyOptions {
  packId?: OkPackId;
  includePersonalTemplates?: boolean;
}

interface OkSeedPackFolderInfo {
  path: string;
  summary: string;
}

interface OkSeedPackEntryCounts {
  files: number;
  folders: number;
}

export interface OkSeedPackInfo {
  id: OkPackId;
  name: string;
  description: string;
  defaultSubfolder?: string;
  folders: OkSeedPackFolderInfo[];
  entryCounts: OkSeedPackEntryCounts;
}

export type OkSeedPlanResult =
  | { ok: true; plan: OkScaffoldPlan }
  | { ok: false; error: OkSeedError };
export type OkSeedApplyResult =
  | {
      ok: true;
      result: OkScaffoldApplyResult;
      personalTemplates?: OkScaffoldPersonalTemplateWriteResult;
    }
  | { ok: false; error: OkSeedError };
export type OkSeedListPacksResult =
  | { ok: true; packs: OkSeedPackInfo[] }
  | { ok: false; error: { kind: 'internal'; message: string } };

/** Pure-fs upward-walk result types mirrored from
 *  `@inkeep/open-knowledge-server`'s `fs/` module. Structurally duplicated
 *  for the same reason as the seed shapes above. */
export interface OkFindEnclosingProjectRootResult {
  readonly rootPath: string;
  readonly distance: number;
}
export interface OkFindEnclosingGitRootResult {
  readonly gitRoot: string;
  readonly distance: number;
}

type OkDesktopMode = 'editor' | 'navigator';

export interface OkDesktopConfig {
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
  | 'focus-command-palette'
  | 'new-from-template'
  | 'move-to-trash'
  | 'reveal-in-finder'
  | 'open-in-terminal'
  | 'send-to-ai'
  | 'copy-full-path'
  | 'copy-relative-path'
  | 'toggle-show-hidden-files'
  | 'toggle-show-all-files'
  | 'expand-all-tree'
  | 'collapse-all-tree';

type OkUnsubscribe = () => void;

export interface RecentProjectEntry {
  path: string;
  name: string;
  lastOpenedAt: string;
  missing?: boolean;
  gitRemoteUrl?: string;
}

export type OkProjectEntryPoint =
  | 'create-new'
  | 'create-new-nested-redirect'
  | 'pick-existing'
  | 'recents'
  | 'deep-link'
  | 'drag-drop'
  | 'share-receive';

interface ProjectSessionState {
  openTabs: string[];
  pinnedTabIds: string[];
  activeDocName: string | null;
  activeTabId: string | null;
  updatedAt: string | null;
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

export type OkShareReceivedPayload =
  | {
      readonly kind: 'ok';
      readonly owner: string;
      readonly repo: string;
      readonly branch: string;
      readonly path: string;
      readonly blobUrl: string;
    }
  | { readonly kind: 'unsupported-version' }
  | { readonly kind: 'invalid' };

export type ShareFolderValidationResult =
  | { readonly kind: 'ok'; readonly gitRemoteUrl: string }
  | { readonly kind: 'not-git' }
  | { readonly kind: 'no-origin' }
  | { readonly kind: 'wrong-repo'; readonly actualOwner: string; readonly actualRepo: string }
  | { readonly kind: 'non-github' }
  | { readonly kind: 'symlink-escape' };

type OkUpdateChannel = 'latest' | 'beta';

type OkThemeSource = 'system' | 'light' | 'dark';

interface OkStateSnapshot {
  readonly channel: OkUpdateChannel;
  readonly schemaIncompatibility: {
    readonly currentBuild: string;
    readonly persistedSchemaVersion: number;
    readonly maxSupported: number;
  } | null;
}

export type OkMcpWiringEditorId = EditorId;

/** Payload passed to `mcpWiring.onShow` subscribers. `willReplace: true`
 *  signals the editor has an existing OK-managed MCP entry (canonical npx,
 *  `-y` variant, or prior cliPath shape) that Add would overwrite (Pass 1
 *  Major #8). */
export interface OkMcpWiringShowPayload {
  readonly detectedEditors: readonly {
    readonly id: OkMcpWiringEditorId;
    readonly label: string;
    readonly detected: boolean;
    readonly willReplace: boolean;
  }[];
}

export type OkMcpWiringResult = { ok: true } | { ok: false; error: string };

export type OkOnboardingWarningKind =
  | 'root'
  | 'home'
  | 'home-documents'
  | 'home-desktop'
  | 'home-downloads'
  | 'volumes-mount'
  | 'drive-root';

type OkOnboardingGitState = 'present' | 'absent' | 'shell-only';

export interface OkOnboardingShowPayload {
  readonly pickedPath: string;
  readonly projectDir: string;
  readonly defaultContentDir: string;
  readonly gitState: OkOnboardingGitState;
  readonly gitRootPromoted: boolean;
  readonly warnings: readonly { readonly kind: OkOnboardingWarningKind }[];
  readonly editorOptions: readonly {
    readonly id: OkMcpWiringEditorId;
    readonly label: string;
    /** True when the editor exposes a per-project MCP config file; false
     *  when only the user-level config is writable. Drives the per-row
     *  scope badge in the consent dialog. */
    readonly hasProjectConfig: boolean;
  }[];
}

export interface OkOnboardingConfirmRequest {
  readonly initGit: boolean;
  readonly contentDir: string;
  readonly additionalIgnores: string;
  readonly editorIds: readonly OkMcpWiringEditorId[];
}

export type OkOnboardingResult = { ok: true } | { ok: false; error: string };

interface OkOnboardingProbeContentRequest {
  readonly contentDir: string;
}

export type OkOnboardingProbeContentResult =
  | {
      readonly ok: true;
      readonly count: number;
      readonly sample: readonly string[];
      readonly truncated: boolean;
    }
  | { readonly ok: false; readonly error: string };

export type OkLocalOpAuthEvent =
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

export type OkLocalOpCloneEvent =
  | { type: 'progress'; phase: string; pct: number }
  | { type: 'complete'; dir: string }
  | { type: 'error'; message: string };

interface OkLocalOpStream<E> {
  readonly events: AsyncIterable<E>;
  cancel(): void;
}

export type OkLocalOpAuthStatusResponse =
  | {
      authenticated: true;
      host: string;
      login: string;
      tier?: 'A' | 'B' | 'C';
      name?: string;
      email?: string;
    }
  | { authenticated: false; host: string; error?: string };

interface OkLocalOpRepoEntry {
  full_name: string;
  clone_url: string;
  private: boolean;
}

export type OkLocalOpAuthReposResponse =
  | { ok: true; host: string; repos: OkLocalOpRepoEntry[] }
  | { ok: false; error: string };

type OkEditorActiveTargetSnapshot =
  | { readonly kind: 'doc'; readonly identifier: string }
  | { readonly kind: 'folder'; readonly identifier: string }
  | { readonly kind: null };

interface OkEditorViewMenuStateSnapshot {
  readonly showHiddenFiles: boolean;
  readonly showAllFiles: boolean;
  readonly canExpandAll: boolean;
  readonly canCollapseAll: boolean;
}

interface OkKeyringSmokeResult {
  ok: boolean;
  backend?: 'keyring' | 'file';
  error?: string;
  durationMs?: number;
  timestamp: string;
}

export interface OkDesktopBridge {
  readonly config: OkDesktopConfig;
  onProjectSwitched(cb: (next: OkDesktopConfig) => void): OkUnsubscribe;
  onMenuAction(cb: (action: OkMenuAction) => void): OkUnsubscribe;
  onUpdateDownloaded(cb: (info: OkUpdateDownloadedInfo) => void): OkUnsubscribe;
  onWhatsNew(cb: (info: OkWhatsNewInfo) => void): OkUnsubscribe;
  onUpdateStuckHint(cb: (info: OkUpdateStuckHintInfo) => void): OkUnsubscribe;
  onDeepLink(cb: (evt: { doc: string }) => void): OkUnsubscribe;
  onShareReceived(cb: (payload: OkShareReceivedPayload) => void): OkUnsubscribe;
  setThemeSource(source: OkThemeSource): Promise<{ ok: true }>;
  signalThemeApplied(opts?: { reducedTransparency?: boolean }): void;
  dialog: {
    openFolder(opts?: { defaultPath?: string }): Promise<string | null>;
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
    trashItem(absPath: string): Promise<
      | { ok: true }
      | {
          ok: false;
          reason: 'not-found' | 'permission-denied' | 'system-error' | 'path-escape';
          detail?: string;
        }
    >;
    openInTerminal(
      dirAbsPath: string,
    ): Promise<
      { ok: true } | { ok: false; reason: 'not-found' | 'spawn-error' | 'timeout' | 'path-escape' }
    >;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
  };
  project: {
    listRecent(): Promise<RecentProjectEntry[]>;
    removeRecent(path: string): Promise<void>;
    getSessionState(): Promise<ProjectSessionState>;
    setSessionState(state: ProjectSessionState): Promise<void>;
    open(request: {
      path: string;
      target: 'new-window';
      entryPoint: OkProjectEntryPoint;
      pendingDeepLinkDoc?: string;
    }): Promise<void>;
    createNew(args: {
      parent: string;
      name: string;
      editors: OkMcpWiringEditorId[];
    }): Promise<void>;
    recordCreateNewBannerShown(banner: CreateNewBannerKind): Promise<void>;
    close(): Promise<void>;
  };

  fs: {
    defaultProjectsRoot(): Promise<string>;
    folderState(path: string): Promise<OkFolderState>;
    findEnclosingProjectRoot(path: string): Promise<OkFindEnclosingProjectRootResult | null>;
    findEnclosingGitRoot(path: string): Promise<OkFindEnclosingGitRootResult | null>;
    removeGitFolder(gitRoot: string): Promise<void>;
  };
  navigator: {
    open(): Promise<void>;
  };
  seed: {
    plan(options?: OkSeedPlanOptions): Promise<OkSeedPlanResult>;
    apply(plan: OkScaffoldPlan, options?: OkSeedApplyOptions): Promise<OkSeedApplyResult>;
    listPacks(): Promise<OkSeedListPacksResult>;
  };
  skill: {
    detectClaudeDesktop(): Promise<boolean>;
    buildAndOpen(opts?: { force?: boolean }): Promise<
      | { ok: true; path: string; skipped?: false; version?: string }
      | {
          ok: true;
          path?: undefined;
          skipped: true;
          version: string;
          recordedAt?: string;
        }
      | {
          ok: false;
          reason: 'build-failed' | 'open-failed' | 'no-downloads-dir';
          message?: string;
        }
    >;
  };
  update: {
    relaunchNow(): Promise<void>;
    checkNow(): Promise<void>;
  };
  state: {
    query(): Promise<OkStateSnapshot>;
    resetIncompatible(): Promise<void>;
  };
  mcpWiring: {
    onShow(cb: (payload: OkMcpWiringShowPayload) => void): OkUnsubscribe;
    signalReady(): void;
    confirm(editorIds: readonly OkMcpWiringEditorId[]): Promise<OkMcpWiringResult>;
    skip(): Promise<OkMcpWiringResult>;
  };
  onboarding: {
    onShow(cb: (payload: OkOnboardingShowPayload) => void): OkUnsubscribe;
    signalReady(): void;
    confirm(request: OkOnboardingConfirmRequest): Promise<OkOnboardingResult>;
    cancel(): Promise<OkOnboardingResult>;
    probeContent(request: OkOnboardingProbeContentRequest): Promise<OkOnboardingProbeContentResult>;
    onToast(
      cb: (
        payload:
          | { readonly kind: 'ancestor-promote'; readonly ancestorPath: string }
          | {
              readonly kind: 'git-root-promote';
              readonly gitRoot: string;
              readonly pickedPath: string;
            }
          | { readonly kind: 'mcp-repaired'; readonly editors: readonly string[] }
          | { readonly kind: 'mcp-repair-failed'; readonly failedEditors: readonly string[] },
      ) => void,
    ): OkUnsubscribe;
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
  share: {
    validateLocalFolder(args: {
      folderPath: string;
      owner: string;
      repo: string;
    }): Promise<ShareFolderValidationResult>;
  };
  editor: {
    notifyActiveTargetChanged(target: OkEditorActiveTargetSnapshot): void;
    notifyViewMenuStateChanged(state: OkEditorViewMenuStateSnapshot): void;
  };
  sidebar: {
    expandAll(cb: () => void): OkUnsubscribe;
    collapseAll(cb: () => void): OkUnsubscribe;
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
