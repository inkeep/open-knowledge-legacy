/**
 * Transport abstraction for one-shot auth queries — `auth status` (is the
 * user signed in?) and `auth repos` (list of accessible repositories).
 *
 * Two implementations:
 *   - `httpAuthQueryTransport` — wraps `fetch('/api/local-op/auth/...')`
 *     (existing path). Default for editor windows + web distribution.
 *   - `ipcAuthQueryTransport` — wraps `bridge.localOp.authStatus()` /
 *     `.authRepos()`. Used by the Project Navigator window where there
 *     is no backing API server (apiOrigin is empty).
 *
 * Bounded responses on both methods (status: one line; repos: bounded
 * list), so no streaming surface is needed — these are plain Promises
 * unlike the start/event/cancel pattern of the auth + clone transports.
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

/**
 * HTTP transport — wraps `fetch('/api/local-op/auth/{status,repos}')`.
 * The HTTP relay's response shapes match the IPC types exactly, so no
 * adaptation needed beyond JSON parsing.
 */
export function httpAuthQueryTransport(): AuthQueryTransport {
  return {
    async status(request) {
      const res = await fetch('/api/local-op/auth/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request ?? {}),
      });
      if (!res.ok) {
        return { authenticated: false, host: request?.host ?? 'github.com' };
      }
      // The HTTP relay forwards the CLI's parsed status JSON. Older
      // builds emit `{type:'status', authenticated, ...}`; the relay
      // strips the envelope and returns the inner shape.
      const data = (await res.json()) as Record<string, unknown>;
      const host = typeof data.host === 'string' ? data.host : (request?.host ?? 'github.com');
      if (data.authenticated === true && typeof data.login === 'string') {
        return {
          authenticated: true,
          host,
          login: data.login,
          name: typeof data.name === 'string' ? data.name : undefined,
          email: typeof data.email === 'string' ? data.email : undefined,
        };
      }
      return {
        authenticated: false,
        host,
        error: typeof data.error === 'string' ? data.error : undefined,
      };
    },
    async repos(request) {
      const res = await fetch('/api/local-op/auth/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request ?? {}),
      });
      if (!res.ok || !res.body) {
        return { ok: false, error: 'Failed to fetch repositories' };
      }
      // The HTTP relay streams NDJSON; each line is `{repos: [...]}`. We
      // accumulate then return the full bounded list.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const repos: { full_name: string; clone_url: string; private: boolean }[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as { repos?: unknown };
            if (Array.isArray(event.repos)) {
              for (const r of event.repos) {
                if (
                  r &&
                  typeof r === 'object' &&
                  typeof (r as Record<string, unknown>).full_name === 'string' &&
                  typeof (r as Record<string, unknown>).clone_url === 'string'
                ) {
                  const rec = r as Record<string, unknown>;
                  repos.push({
                    full_name: rec.full_name as string,
                    clone_url: rec.clone_url as string,
                    private: rec.private === true,
                  });
                }
              }
            }
          } catch {
            /* ignore malformed line */
          }
        }
      }
      return { ok: true, host: request?.host ?? 'github.com', repos };
    },
  };
}

/**
 * IPC transport — wraps `bridge.localOp.authStatus()` / `.authRepos()`.
 * The bridge methods return the same shapes this transport exposes, so
 * the calls are direct.
 */
export function ipcAuthQueryTransport(bridge: OkDesktopBridge): AuthQueryTransport {
  return {
    status: (request) => bridge.localOp.authStatus(request),
    repos: (request) => bridge.localOp.authRepos(request),
  };
}
