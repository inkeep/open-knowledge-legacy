import type { HandoffPayload } from './types.ts';

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx < 0 ? p : p.substring(idx + 1);
}

export function buildCursorUrl(payload: HandoffPayload): string {
  const text = encodeURIComponent(encodeURIComponent(payload.prompt));
  const workspace = encodeURIComponent(basename(payload.projectDir));
  return `cursor://anysphere.cursor-deeplink/prompt?text=${text}&workspace=${workspace}&mode=agent`;
}
