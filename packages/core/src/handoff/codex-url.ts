import type { HandoffPayload } from './types.ts';

export function buildCodexUrl(payload: HandoffPayload): string {
  const path = encodeURIComponent(payload.projectDir);
  if (payload.prompt === '') {
    return `codex://new?path=${path}`;
  }
  const prompt = encodeURIComponent(payload.prompt);
  return `codex://new?prompt=${prompt}&path=${path}`;
}
