import type {
  OkDesktopConfig,
  OkLocalOpAuthEvent,
  OkLocalOpCloneEvent,
  OkMenuAction,
} from './bridge-contract.ts';
import type { McpWiringEditorDetection } from './ipc-channels.ts';

export interface EventChannels {
  'ok:project:switching': { payload: { projectPath: string } };
  'ok:project:switched': { payload: OkDesktopConfig };
  'ok:menu-action': { payload: OkMenuAction };
  'ok:update:downloaded': { payload: { version: string } };
  'ok:update:whats-new': { payload: { version: string; releaseUrl: string } };
  'ok:update:stuck-hint': { payload: { downloadUrl: string } };
  'ok:deep-link': { payload: { doc: string } };
  'ok:mcp-wiring:show': {
    payload: { detectedEditors: readonly McpWiringEditorDetection[] };
  };

  'ok:local-op:auth:event': {
    payload: { streamId: string; event: OkLocalOpAuthEvent };
  };
  'ok:local-op:clone:event': {
    payload: { streamId: string; event: OkLocalOpCloneEvent };
  };
}
