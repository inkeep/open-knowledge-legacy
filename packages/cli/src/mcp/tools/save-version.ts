/**
 * `save_version` MCP tool — create a named checkpoint in the shadow repo.
 *
 * Calls POST /api/save-version to snapshot the current state of all documents
 * into a checkpoint commit in the shadow repo (and optionally the project repo).
 * The resulting checkpoint ref can later be found via `get_history`.
 *
 * previewUrl is always `null` per FR-2.1 / US-011: save_version operates on the
 * whole workspace (all documents), not a single docName, and the UI has no
 * checkpoint-level URL shape. Emitting null keeps the 21-tool contract uniform
 * without misleading agents into a nonexistent per-doc preview.
 */
import type { AgentIdentity } from '../agent-identity.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Save a version checkpoint of all documents.',
  'Creates a checkpoint commit in the shadow repo and project repo,',
  'preserving the current state of all documents. The checkpoint can later',
  'be found via `get_history` and restored via `rollback_to_version`.',
].join('\n');

export function register(
  server: ServerInstance,
  config: ConfigOrResolver,
  serverUrl: ServerUrlOrResolver,
  resolveCwd: (explicit?: string) => Promise<string>,
  identityRef?: { current: AgentIdentity },
): void {
  server.tool('save_version', DESCRIPTION, {}, async () => {
    const context = await resolveProjectServerContext(resolveCwd, config, serverUrl);
    if (!context.ok) return textResult(`Error: ${context.error}`, true);
    if (!context.url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
    const { url } = context;

    const identity = identityRef?.current;
    const result = await httpPost(url, '/api/save-version', {
      ...(identity
        ? {
            writers: [
              {
                id: `agent-${identity.connectionId}`,
                name: identity.displayName,
                email: `agent-${identity.connectionId}@openknowledge.local`,
              },
            ],
          }
        : {}),
    });
    if (!result.ok) return textResult(`Error: ${result.error}`, true);

    return textPlusStructured(`Version saved. Checkpoint ref: ${result.checkpointRef}`, {
      checkpointRef: result.checkpointRef,
      previewUrl: null,
    });
  });
}
