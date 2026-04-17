/**
 * `/api/config` client — fetches the UI's collab-bootstrap payload.
 *
 * Served by `ok ui` (FR-1.13) post-lifecycle-split: `{collabUrl, previewUrl,
 * port}` where `collabUrl` is `ws://localhost:<collab-port>/collab` when
 * `server.lock` is alive, else `null`. In `bun run dev` mode everything is
 * same-origin on one port so this endpoint is absent — the fetch will 404.
 *
 * Result classification:
 *   - `{ status: 'ok', config }` — endpoint responded with a valid shape.
 *   - `{ status: 'absent' }`      — 404 / 501. Caller should fall through to
 *                                   same-origin (`bun run dev` pattern).
 *   - `{ status: 'error', code }` — 5xx, network failure, or malformed body.
 *                                   Caller retries with backoff.
 *
 * Collapsing all failures to `null` (the previous shape) masked genuine
 * misconfigurations (e.g. corrupt `server.lock`) as dev-mode 404s, producing
 * a silent fallback to the wrong WebSocket URL.
 */

export interface ApiConfig {
  collabUrl: string | null;
  previewUrl: string | null;
  port: number;
}

export type FetchApiConfigResult =
  | { status: 'ok'; config: ApiConfig }
  | { status: 'absent' }
  | { status: 'error'; code: number | 'network' | 'invalid-body' };

export async function fetchApiConfig(signal?: AbortSignal): Promise<FetchApiConfigResult> {
  let res: Response;
  try {
    res = await fetch('/api/config', {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') throw err;
    return { status: 'error', code: 'network' };
  }
  if (res.status === 404 || res.status === 501) {
    return { status: 'absent' };
  }
  if (!res.ok) {
    return { status: 'error', code: res.status };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: 'error', code: 'invalid-body' };
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 'error', code: 'invalid-body' };
  }
  const obj = body as Record<string, unknown>;
  return {
    status: 'ok',
    config: {
      collabUrl: typeof obj.collabUrl === 'string' ? obj.collabUrl : null,
      previewUrl: typeof obj.previewUrl === 'string' ? obj.previewUrl : null,
      port: typeof obj.port === 'number' ? obj.port : 0,
    },
  };
}
