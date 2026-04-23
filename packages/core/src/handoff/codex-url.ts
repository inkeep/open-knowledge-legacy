import type { HandoffPayload } from './types.ts';

/**
 * Build a `codex://new` URL for OpenAI Codex Desktop.
 *
 * Shape (single-encoded per I3):
 *   codex://new?prompt=<prompt>&path=<projectDir>
 *
 * `docPath` is NOT threaded — Codex's URL scheme has no atomic file param.
 * The agent resolves the file via its own tools once the workspace is loaded.
 * `originUrl=<git>` is omitted in v0 (OQ-Codex-originUrl DIRECTED; Future Work).
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.2.
 */
export function buildCodexUrl(payload: HandoffPayload): string {
  const prompt = encodeURIComponent(payload.prompt);
  const path = encodeURIComponent(payload.projectDir);
  return `codex://new?prompt=${prompt}&path=${path}`;
}
