import type { HandoffPayload } from './types.ts';

/**
 * Build a `claude://cowork/new` or `claude://code/new` URL for the unified
 * Claude Desktop app (Cowork tab or Code/Epitaxy tab).
 *
 * Shape (single-encoded per I3):
 *   claude://<mode>/new?q=<prompt>&folder=<projectDir>&file=<docPath>
 *
 * `opts.mode` must agree with `payload.target` ('claude-cowork' → 'cowork',
 * 'claude-code' → 'code'); dispatch.ts in app-layer enforces the pairing.
 *
 * `file=` retained for Claude Code per E3-b DIRECTED (handler parses it;
 * Epitaxy-webview composition is verified at implementation — STOP_IF gate
 * in SPEC §15).
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.2.
 */
export function buildClaudeUrl(opts: { mode: 'cowork' | 'code' }, payload: HandoffPayload): string {
  const q = encodeURIComponent(payload.prompt);
  const folder = encodeURIComponent(payload.projectDir);
  const file = encodeURIComponent(payload.docPath);
  return `claude://${opts.mode}/new?q=${q}&folder=${folder}&file=${file}`;
}
