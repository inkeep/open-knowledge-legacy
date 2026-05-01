/**
 * Transport abstraction for one-shot auth queries — `auth status` (is the
 * user signed in?) and `auth repos` (list of accessible repositories).
 *
 * Two implementations:
 *   - `httpAuthQueryTransport` — wraps `fetch('/api/local-op/auth/...')`.
 *     Default for editor windows + web distribution.
 *   - `ipcAuthQueryTransport` — wraps `bridge.localOp.authStatus()` /
 *     `.authRepos()`. Used by the Project Navigator window where there
 *     is no backing API server (apiOrigin is empty).
 *
 * Bounded responses on both methods (status: one line; repos: bounded
 * list), so no streaming surface is needed.
 */

import type {
  OkDesktopBridge,
  OkLocalOpAuthReposResponse,
  OkLocalOpAuthStatusResponse,
} from '@/lib/desktop-bridge-types';

export interface AuthQueryTransport {
  status(request?: { host?: string }): Promise<OkLocalOpAuthStatusResponse>;
  repos(request?: { host?: string }): Promise<OkLocalOpAuthReposResponse>;
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

/**
 * Pull the last parseable JSON line out of an NDJSON-ish body. The HTTP
 * relays for status / repos emit one structured line; older builds may
 * prefix with non-JSON log output.
 */
function lastJsonLine(text: string): Record<string, unknown> | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const v = JSON.parse(line);
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch {
      /* skip non-JSON */
    }
  }
  return null;
}

/** HTTP transport — wraps the `/api/local-op/auth/{status,repos}` endpoints. */
export function httpAuthQueryTransport(): AuthQueryTransport {
  return {
    async status(request) {
      const host = request?.host ?? 'github.com';
      const res = await postJson('/api/local-op/auth/status', request);
      if (!res.ok) return { authenticated: false, host };
      const data = (await res.json()) as Record<string, unknown>;
      const h = typeof data.host === 'string' ? data.host : host;
      if (data.authenticated === true && typeof data.login === 'string') {
        return {
          authenticated: true,
          host: h,
          login: data.login,
          name: typeof data.name === 'string' ? data.name : undefined,
          email: typeof data.email === 'string' ? data.email : undefined,
        };
      }
      return {
        authenticated: false,
        host: h,
        error: typeof data.error === 'string' ? data.error : undefined,
      };
    },
    async repos(request) {
      const host = request?.host ?? 'github.com';
      const res = await postJson('/api/local-op/auth/repos', request);
      if (!res.ok) return { ok: false, error: 'Failed to fetch repositories' };
      // CLI emits a single `{repos: [...]}` line; relay forwards as-is.
      // No streaming reader needed — read the whole body and parse.
      const data = lastJsonLine(await res.text());
      // Surface mid-stream RFC 9457 streaming-error envelope so the UI
      // shows the typed reason (rate limit, auth error) instead of a
      // generic "Failed to fetch" when the server emitted a problem.
      if (data && data.type === 'error' && data.problem && typeof data.problem === 'object') {
        const p = data.problem as { title?: string; detail?: string };
        return { ok: false, error: p.detail || p.title || 'Failed to fetch repositories' };
      }
      if (!data || !Array.isArray(data.repos)) {
        return { ok: false, error: 'Failed to fetch repositories' };
      }
      const repos: { full_name: string; clone_url: string; private: boolean }[] = [];
      for (const r of data.repos) {
        const rec = r as Record<string, unknown>;
        if (typeof rec?.full_name === 'string' && typeof rec.clone_url === 'string') {
          repos.push({
            full_name: rec.full_name,
            clone_url: rec.clone_url,
            private: rec.private === true,
          });
        }
      }
      return { ok: true, host: typeof data.host === 'string' ? data.host : host, repos };
    },
  };
}

/** IPC transport — wraps `bridge.localOp.{authStatus,authRepos}` directly. */
export function ipcAuthQueryTransport(bridge: OkDesktopBridge): AuthQueryTransport {
  return {
    status: (request) => bridge.localOp.authStatus(request),
    repos: (request) => bridge.localOp.authRepos(request),
  };
}
