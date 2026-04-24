import type { HandoffPayload } from './types.ts';

/**
 * Build a `codex://new?prompt=...&path=...` URL for OpenAI Codex Desktop.
 * `docPath` is not threaded — Codex's URL scheme has no atomic file param;
 * the agent resolves the file via its own tools once loaded.
 */
export function buildCodexUrl(payload: HandoffPayload): string {
  const prompt = encodeURIComponent(payload.prompt);
  const path = encodeURIComponent(payload.projectDir);
  return `codex://new?prompt=${prompt}&path=${path}`;
}
