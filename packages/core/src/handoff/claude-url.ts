import type { HandoffPayload } from './types.ts';

/**
 * Build a `claude://cowork/new` or `claude://code/new` URL for the unified
 * Claude Desktop app (Cowork tab or Code/Epitaxy tab).
 *
 *   claude://<mode>/new?q=<prompt>&folder=<projectDir>&file=<docPath>
 *
 * `opts.mode` must agree with `payload.target` ('claude-cowork' → 'cowork',
 * 'claude-code' → 'code'); dispatch.ts enforces the pairing.
 */
export function buildClaudeUrl(opts: { mode: 'cowork' | 'code' }, payload: HandoffPayload): string {
  const q = encodeURIComponent(payload.prompt);
  const folder = encodeURIComponent(payload.projectDir);
  const file = encodeURIComponent(payload.docPath);
  return `claude://${opts.mode}/new?q=${q}&folder=${folder}&file=${file}`;
}
