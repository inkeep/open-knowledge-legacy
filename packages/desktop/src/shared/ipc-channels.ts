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
 * `@electron-toolkit/typed-ipc` or `@egoist/tipc`. Currently 35 — well past
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

export interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: string;
  missing?: boolean;
}

interface ProjectOpenRequest {
  path: string;
  target: 'new-window';
}

interface ProjectSessionState {
  openTabs: string[];
  activeDocName: string | null;
  updatedAt: string | null;
}

export type SpawnOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' };

export interface HandoffStatsLine {
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
}

export type McpWiringEditorId =
  | 'claude'
  | 'claude-desktop'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'codex';

export interface McpWiringEditorDetection {
  readonly id: McpWiringEditorId;
  readonly label: string;
  readonly detected: boolean;
  readonly willReplace: boolean;
}

export interface McpWiringConfirmRequest {
  readonly editorIds: readonly McpWiringEditorId[];
}

export type McpWiringConfirmResult = { ok: true } | { ok: false; error: string };
export type McpWiringSkipResult = { ok: true } | { ok: false; error: string };

export interface RequestChannels {
  'ok:dialog:open-folder': { args: []; result: string | null };
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
