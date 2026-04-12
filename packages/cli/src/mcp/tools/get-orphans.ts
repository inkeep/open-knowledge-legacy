import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpGet, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find pages with no incoming wiki-links.',
  'Returns orphaned pages as JSON.',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool('get_orphans', DESCRIPTION, {}, async () => {
    if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
    const result = await httpGet(serverUrl, '/api/orphans');
    if (!result.ok) return textResult(`Error: ${result.error}`, true);
    const { ok: _ok, ...data } = result;
    return textResult(JSON.stringify(data, null, 2));
  });
}
