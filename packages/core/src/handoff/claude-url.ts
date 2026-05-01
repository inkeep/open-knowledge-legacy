import type { HandoffPayload } from './types.ts';

export function buildClaudeUrl(opts: { mode: 'cowork' | 'code' }, payload: HandoffPayload): string {
  const q = encodeURIComponent(payload.prompt);
  const folder = encodeURIComponent(payload.projectDir);
  const file = encodeURIComponent(payload.docPath);
  return `claude://${opts.mode}/new?q=${q}&folder=${folder}&file=${file}`;
}
