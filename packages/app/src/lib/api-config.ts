/**
 * `/api/config` client — fetches the UI's collab-bootstrap payload.
 *
 * Served by `ok ui` (FR-1.13) post-lifecycle-split: `{collabUrl, previewUrl,
 * port}` where `collabUrl` is `ws://localhost:<collab-port>/collab` when
 * `server.lock` is alive, else `null`. In `bun run dev` mode everything is
 * same-origin on one port so this endpoint is absent — the fetch will 404.
 *
 * Consumers (DocumentContext, SystemDocSubscriber) use this via the
 * `useCollabUrl` hook which handles null/404/error retry semantics. The
 * same-origin fallback (for `bun run dev`) lives in the hook, not here.
 */

export interface ApiConfig {
  collabUrl: string | null;
  previewUrl: string | null;
  port: number;
}

export async function fetchApiConfig(signal?: AbortSignal): Promise<ApiConfig | null> {
  const res = await fetch('/api/config', {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as unknown;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  return {
    collabUrl: typeof obj.collabUrl === 'string' ? obj.collabUrl : null,
    previewUrl: typeof obj.previewUrl === 'string' ? obj.previewUrl : null,
    port: typeof obj.port === 'number' ? obj.port : 0,
  };
}
