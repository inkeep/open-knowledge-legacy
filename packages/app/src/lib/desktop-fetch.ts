interface FetchRewriteConfig {
  apiOrigin: string;
}

export function installDesktopFetchRewrite(config: FetchRewriteConfig): void {
  const { apiOrigin } = config;
  if (!apiOrigin) return;

  const marker = Symbol.for('ok.desktop.fetchRewrite');
  const current = window.fetch as typeof window.fetch & { [marker]?: true };
  if (current[marker]) return;

  const origFetch = window.fetch.bind(window);

  const rewritten = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      return origFetch(rewriteIfApi(input, apiOrigin), init);
    }
    if (input instanceof URL) {
      if (
        input.pathname.startsWith('/api/') &&
        (input.origin === window.location.origin || input.protocol === 'file:')
      ) {
        const rel = input.pathname + input.search + input.hash;
        return origFetch(apiOrigin + rel, init);
      }
      return origFetch(input, init);
    }
    try {
      const parsed = new URL(input.url, window.location.origin);
      if (parsed.pathname.startsWith('/api/')) {
        const rel = parsed.pathname + parsed.search + parsed.hash;
        return origFetch(new Request(apiOrigin + rel, input), init);
      }
    } catch {}
    return origFetch(input, init);
  }) as typeof window.fetch & { [marker]?: true };

  rewritten[marker] = true;
  window.fetch = rewritten;
}

function rewriteIfApi(url: string, apiOrigin: string): string {
  if (url.startsWith('/api/')) {
    return apiOrigin + url;
  }
  return url;
}
