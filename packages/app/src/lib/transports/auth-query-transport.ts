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

function lastJsonLine(text: string): Record<string, unknown> | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const v = JSON.parse(line);
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch {}
  }
  return null;
}

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
      const data = lastJsonLine(await res.text());
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

export function ipcAuthQueryTransport(bridge: OkDesktopBridge): AuthQueryTransport {
  return {
    status: (request) => bridge.localOp.authStatus(request),
    repos: (request) => bridge.localOp.authRepos(request),
  };
}
