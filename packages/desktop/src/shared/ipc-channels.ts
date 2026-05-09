/**
 * Typed IPC request channel map (renderer → main, request/response pattern).
 *
 * Hand-rolled discriminated union (not tRPC/tipc): every channel name is a
 * top-level key in `RequestChannels`; each key maps to
 * `{ args: [...]; result: T }`. The preload-side `invoke<K>()` helper (see
 * `./ipc-invoke.ts`) uses these types for full autocomplete + compile-time
 * safety. Grep-able channel names are the primary observability — a
 * channel name tells you exactly where the handler lives in main and where
 * the caller lives in renderer without touching a debugger.
 *
 * Scale-match trigger: at >20 channels, migrate baseline to
 * `@electron-toolkit/typed-ipc` or `@egoist/tipc`. Currently 42 — well past
 * the trigger; migrate before adding another batch.
 */

import type { ScaffoldPlan } from '@inkeep/open-knowledge-server';
import type { BuildAndOpenResult } from '../main/ipc/install-skill.ts';
import type { SeedApplyResult, SeedPlanResult } from '../main/ipc/seed.ts';
import type { KeyringSmokeResult } from '../utility/keyring-smoke.ts';
import type {
  OkDesktopConfig,
  OkLocalOpAuthReposResponse,
  OkLocalOpAuthStatusResponse,
  OkUpdateChannel,
} from './bridge-contract.ts';
import type { EntryPoint } from './entry-point.ts';

export interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: string;
  missing?: boolean;
}

interface ProjectOpenRequest {
  path: string;
  target: 'new-window';
  entryPoint: EntryPoint;
}

interface ProjectSessionState {
  openTabs: string[];
  activeDocName: string | null;
  activeTabId: string | null;
  updatedAt: string | null;
}

export type SpawnOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' };

export interface HandoffStatsLine {
  readonly target: 'claude-cowork' | 'claude-code' | 'codex' | 'cursor';
  readonly host: 'electron' | 'web';
  readonly outcome: 'ok' | 'error';
  /** ISO 8601 timestamp from the caller — not generated server-side so tests
   *  can supply a deterministic value. */
  readonly ts: string;
  readonly reason?:
    | 'not-installed'
    | 'scheme-blocked'
    | 'web-endpoint-error'
    | 'invalid-payload'
    | 'dispatch-error'
    | 'web-host-cursor-unsupported';
}

/** Editor IDs known to the first-launch MCP consent flow. Mirrors
 *  `EditorId` in `packages/cli/src/commands/editors.ts`. Desktop `main/` DOES
 *  dep `@inkeep/open-knowledge` (workspace dep for the
 *  `writeUserMcpConfigs` / `EDITOR_TARGETS` surface), but `shared/` modules
 *  stay zero-dep — any cross-package value import from the IPC surface
 *  forces every preload / renderer consumer to pull CLI internals into its
 *  bundle. Keeping the literal-union local preserves that split; drift with
 *  the CLI's `EditorId` is caught at typecheck via the `McpWiringCliSurface`
 *  interface in `main/mcp-wiring.ts` (which references BOTH types). */
export type McpWiringEditorId = 'claude' | 'claude-desktop' | 'cursor' | 'codex';

/** Sensitive-path warning category mirrored across the IPC boundary —
 *  literal-union form so the renderer can switch on `kind` without pulling
 *  the main-side helper module. Matches `SensitivePathWarning['kind']` in
 *  `packages/desktop/src/main/folder-admission.ts`. */
type OnboardingWarningKind =
  | 'root'
  | 'home'
  | 'home-documents'
  | 'home-desktop'
  | 'home-downloads'
  | 'volumes-mount'
  | 'drive-root';

type OnboardingGitState = 'present' | 'absent' | 'shell-only';

/** Show payload pushed to the renderer when main decides to render the
 *  consent dialog. Carries everything the dialog renders without further IPC
 *  round-trips — except the file-count preview, which is throttled and
 *  fetched on demand. */
export interface OnboardingShowPayload {
  readonly pickedPath: string;
  readonly projectDir: string;
  readonly defaultContentDir: string;
  readonly gitState: OnboardingGitState;
  readonly gitRootPromoted: boolean;
  readonly warnings: readonly { readonly kind: OnboardingWarningKind }[];
  readonly editorOptions: readonly {
    readonly id: McpWiringEditorId;
    readonly label: string;
    /** True when this editor scaffolds a per-project MCP config; false when
     *  only the user-level config is writable. Surfaced as a per-row badge
     *  in the consent dialog so the user can distinguish project-scoped vs
     *  user-only editors before clicking Start. */
    readonly hasProjectConfig: boolean;
  }[];
}

export interface OnboardingConfirmRequest {
  readonly initGit: boolean;
  readonly contentDir: string;
  readonly additionalIgnores: string;
  readonly editorIds: readonly McpWiringEditorId[];
}

/** Confirm result. `ok: false` includes a user-facing error string the
 *  dialog renders inline. */
export type OnboardingConfirmResult = { ok: true } | { ok: false; error: string };

/** Cancel result is always `ok: true` — cancel can't fail meaningfully (no
 *  fs writes happen). The shape is symmetric with confirm so the renderer
 *  store can use a single result type. */
export type OnboardingCancelResult = { ok: true } | { ok: false; error: string };

/** File-count probe request — the renderer asks main for an updated count
 *  after the user types into the Content directory field. The walk root is
 *  pinned to the projectDir main captured when it dispatched
 *  `ok:onboarding:show`; the renderer doesn't get to supply it. */
export interface OnboardingProbeContentRequest {
  readonly contentDir: string;
}

/** Probe response. `truncated` is true when the walk hit the cap before
 *  finishing (`count` reads as `≥ 50,000`). `error` carries the inline
 *  message; renderer renders it as `Preview unavailable: <error>` but
 *  doesn't block Start. */
export type OnboardingProbeContentResult =
  | {
      readonly ok: true;
      readonly count: number;
      readonly sample: readonly string[];
      readonly truncated: boolean;
    }
  | { readonly ok: false; readonly error: string };

/** Single entry in the consent dialog — one per editor in `ALL_EDITOR_IDS`.
 *  `detected: true` preselects the checkbox.
 *  `willReplace: true` signals that this editor has an existing OK-managed
 *  entry (canonical npx, historical `-y` variant, or prior cliPath shape)
 *  that clicking Add would overwrite — surfaced per-row in the dialog so
 *  long-time CLI users who ran `ok init` months ago aren't surprised to
 *  find their entry silently stomped by a bundle-absolute cliPath. */
export interface McpWiringEditorDetection {
  readonly id: McpWiringEditorId;
  readonly label: string;
  readonly detected: boolean;
  readonly willReplace: boolean;
}

/** Confirm payload from renderer → main. Editors the user checked when they
 *  clicked "Add". Subset of `McpWiringEditorId`. */
export interface McpWiringConfirmRequest {
  readonly editorIds: readonly McpWiringEditorId[];
}

/** Confirm / skip response shape. `ok:false` surfaces when (a)
 *  `writeUserMcpConfigs` throws, (b) any per-editor write returns
 *  `action:'failed'` (deferred-marker — caller fires a sonner toast since
 *  the dialog itself unmounts on result), or (c) the skip-marker write
 *  fails. The `error` string is user-facing copy. */
export type McpWiringConfirmResult = { ok: true } | { ok: false; error: string };
export type McpWiringSkipResult = { ok: true } | { ok: false; error: string };

/** Options for the open-folder native picker. `defaultPath` seeds the initial
 *  directory shown to the user (e.g., the project root for the consent dialog's
 *  Browse button). */
interface DialogOpenFolderOpts {
  readonly defaultPath?: string;
}

export interface RequestChannels {
  'ok:dialog:open-folder': {
    args: [opts?: DialogOpenFolderOpts];
    result: string | null;
  };
  'ok:dialog:create-folder': { args: []; result: string | null };
  'ok:shell:open-external': { args: [url: string]; result: undefined };
  'ok:shell:detect-protocol': {
    args: [scheme: string];
    result: { installed: boolean; displayName?: string };
  };
  'ok:shell:spawn-cursor': { args: [path: string]; result: SpawnOutcome };
  'ok:shell:show-item-in-folder': { args: [path: string]; result: undefined };
  'ok:shell:record-handoff': { args: [line: HandoffStatsLine]; result: undefined };
  'ok:shell:open-asset': {
    args: [relPath: string];
    result:
      | { ok: true }
      | { ok: false; reason: 'extension-blocked' | 'path-escape' | 'not-found' | 'resolve-error' };
  };
  'ok:shell:reveal-asset': {
    args: [relPath: string];
    result: { ok: true } | { ok: false; reason: 'path-escape' | 'not-found' | 'resolve-error' };
  };
  'ok:shell:show-asset-menu': {
    args: [
      params: {
        readonly relPath: string;
        readonly title: string;
        readonly kind: 'asset' | 'wiki-link' | 'image';
      },
    ];
    result: undefined;
  };
  'ok:clipboard:write-text': { args: [text: string]; result: undefined };
  'ok:project:get-info': { args: []; result: OkDesktopConfig };
  'ok:project:list-recent': { args: []; result: RecentProject[] };
  'ok:project:get-session-state': { args: []; result: ProjectSessionState };
  'ok:project:set-session-state': { args: [state: ProjectSessionState]; result: undefined };
  'ok:project:open': { args: [request: ProjectOpenRequest]; result: undefined };
  'ok:project:close': { args: []; result: undefined };
  'ok:navigator:open': { args: []; result: undefined };
  'ok:update:relaunch-now': { args: []; result: undefined };
  'ok:update:set-channel': { args: [request: { channel: OkUpdateChannel }]; result: undefined };
  'ok:update:confirm-downgrade': { args: []; result: undefined };
  'ok:update:check-now': { args: []; result: undefined };
  'ok:state:query': {
    args: [];
    result: {
      channel: OkUpdateChannel;
      schemaIncompatibility: {
        currentBuild: string;
        persistedSchemaVersion: number;
        maxSupported: number;
      } | null;
    };
  };
  'ok:state:reset-incompatible': { args: []; result: undefined };
  'ok:debug:keyring-smoke': { args: []; result: KeyringSmokeResult };
  'ok:seed:plan': { args: [rootDir?: string]; result: SeedPlanResult };
  'ok:seed:apply': { args: [plan: ScaffoldPlan]; result: SeedApplyResult };
  'ok:mcp-wiring:confirm': {
    args: [request: McpWiringConfirmRequest];
    result: McpWiringConfirmResult;
  };
  'ok:mcp-wiring:skip': { args: []; result: McpWiringSkipResult };
  'ok:mcp-wiring:renderer-ready': { args: []; result: undefined };

  'ok:onboarding:confirm': {
    args: [request: OnboardingConfirmRequest];
    result: OnboardingConfirmResult;
  };
  'ok:onboarding:cancel': { args: []; result: OnboardingCancelResult };
  'ok:onboarding:renderer-ready': { args: []; result: undefined };
  /** Async probe for the file-count preview line in the dialog. The walk
   *  caps at 50,000 entries. 750 ms throttle is enforced renderer-side;
   *  main runs the probe synchronously but yields each request to a
   *  `setImmediate` boundary so the IPC reply doesn't block the main loop
   *  on huge trees. */
  'ok:onboarding:probe-content': {
    args: [request: OnboardingProbeContentRequest];
    result: OnboardingProbeContentResult;
  };

  'ok:skill:detect-claude-desktop': { args: []; result: boolean };

  'ok:skill:build-and-open': { args: [opts?: { force?: boolean }]; result: BuildAndOpenResult };

  'ok:local-op:auth:start': {
    args: [];
    result: { ok: true; streamId: string } | { ok: false; error: string };
  };
  'ok:local-op:auth:cancel': { args: [streamId: string]; result: undefined };
  'ok:local-op:clone:start': {
    args: [request: { url: string; dir: string }];
    result: { ok: true; streamId: string } | { ok: false; error: string };
  };
  'ok:local-op:clone:cancel': { args: [streamId: string]; result: undefined };

  'ok:local-op:auth:status': {
    args: [request?: { host?: string }];
    result: OkLocalOpAuthStatusResponse;
  };
  'ok:local-op:auth:repos': {
    args: [request?: { host?: string }];
    result: OkLocalOpAuthReposResponse;
  };
}
