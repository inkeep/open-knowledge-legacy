import type { HandoffPayload } from './types.ts';

export function buildClaudeUrl(opts: { mode: 'cowork' | 'code' }, payload: HandoffPayload): string {
  const folder = encodeURIComponent(payload.projectDir);
  if (payload.prompt === '') {
    return `claude://${opts.mode}/new?folder=${folder}`;
  }
  const q = encodeURIComponent(payload.prompt);
  return `claude://${opts.mode}/new?q=${q}&folder=${folder}`;
}
