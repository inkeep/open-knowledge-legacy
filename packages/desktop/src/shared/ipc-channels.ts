import type { ScaffoldPlan } from '@inkeep/open-knowledge-server';
import type { BuildAndOpenResult } from '../main/ipc/install-skill.ts';
import type { SeedApplyResult, SeedPlanResult } from '../main/ipc/seed.ts';
import type { KeyringSmokeResult } from '../utility/keyring-smoke.ts';
import type {
  OkDesktopConfig,
  OkLocalOpAuthReposResponse,
  OkLocalOpAuthStatusResponse,
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
  'ok:project:open': { args: [request: ProjectOpenRequest]; result: undefined };
  'ok:project:close': { args: []; result: undefined };
  'ok:navigator:open': { args: []; result: undefined };
  'ok:update:relaunch-now': { args: []; result: undefined };
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

  'ok:skill:build-and-open': { args: []; result: BuildAndOpenResult };

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
