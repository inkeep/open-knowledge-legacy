import type { HandoffPayload } from './types.ts';

export function buildCodexUrl(payload: HandoffPayload): string {
  const prompt = encodeURIComponent(payload.prompt);
  const path = encodeURIComponent(payload.projectDir);
  return `codex://new?prompt=${prompt}&path=${path}`;
}
