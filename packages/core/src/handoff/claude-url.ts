import type { HandoffPayload } from './types.ts';

export function buildClaudeUrl(opts: { mode: 'cowork' | 'code' }, payload: HandoffPayload): string {
  const folder = encodeURIComponent(payload.projectDir);
  const params: string[] = [];
  if (payload.prompt !== '') {
    params.push(`q=${encodeURIComponent(payload.prompt)}`);
  }
  params.push(`folder=${folder}`);
  if (payload.docPath !== '') {
    params.push(`file=${encodeURIComponent(payload.docPath)}`);
  }
  return `claude://${opts.mode}/new?${params.join('&')}`;
}
