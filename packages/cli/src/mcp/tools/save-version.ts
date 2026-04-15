/**
 * `save_version` MCP tool — create a named checkpoint in the shadow repo.
 *
 * Calls POST /api/save-version to snapshot the current state of all documents
 * into a checkpoint commit in the shadow repo (and optionally the project repo).
 * The resulting checkpoint ref can later be found via `get_history`.
 */
import type { AgentIdentity } from '../agent-identity.ts';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpPost, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Save a version checkpoint of all documents.',
  'Creates a checkpoint commit in the shadow repo and project repo,',
  'preserving the current state of all documents. The checkpoint can later',
  'be found via `get_history` and restored via `rollback_to_version`.',
].join('\n');

export function register(
  server: ServerInstance,
  serverUrl: string | undefined,
  identityRef?: { current: AgentIdentity },
): void {
  server.tool('save_version', DESCRIPTION, {}, async () => {
    if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

    const identity = identityRef?.current;
    const result = await httpPost(serverUrl, '/api/save-version', {
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

    return textResult(`Version saved. Checkpoint ref: ${result.checkpointRef}`);
  });
}
