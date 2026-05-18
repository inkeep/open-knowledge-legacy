import type {
  OkDesktopConfig,
  OkLocalOpAuthEvent,
  OkLocalOpCloneEvent,
  OkMenuAction,
  OkShareReceivedPayload,
} from './bridge-contract.ts';
import type { McpWiringEditorDetection, OnboardingShowPayload } from './ipc-channels.ts';

export interface EventChannels {
  'ok:project:switching': { payload: { projectPath: string } };
  'ok:project:switched': { payload: OkDesktopConfig };
  'ok:menu-action': { payload: OkMenuAction };
  'ok:update:downloaded': { payload: { version: string } };
  'ok:update:whats-new': { payload: { version: string; releaseUrl: string } };
  'ok:update:stuck-hint': { payload: { downloadUrl: string } };
  'ok:deep-link': { payload: { doc: string } };
  'ok:share:received': { payload: OkShareReceivedPayload };
  'ok:mcp-wiring:show': {
    payload: { detectedEditors: readonly McpWiringEditorDetection[] };
  };
  'ok:onboarding:show': {
    payload: OnboardingShowPayload;
  };
  'ok:onboarding:toast': {
    payload:
      | { readonly kind: 'ancestor-promote'; readonly ancestorPath: string }
      | {
          readonly kind: 'git-root-promote';
          readonly gitRoot: string;
          /** The sub-folder the user originally picked; surfaces in the
           * toast so the user can see what got promoted to what. */
          readonly pickedPath: string;
        }
      | { readonly kind: 'mcp-repaired'; readonly editors: readonly string[] }
      | { readonly kind: 'mcp-repair-failed'; readonly failedEditors: readonly string[] };
  };

  'ok:local-op:auth:event': {
    payload: { streamId: string; event: OkLocalOpAuthEvent };
  };
  'ok:local-op:clone:event': {
    payload: { streamId: string; event: OkLocalOpCloneEvent };
  };

  'ok:sidebar:expand-all': { payload: undefined };
  'ok:sidebar:collapse-all': { payload: undefined };
}
