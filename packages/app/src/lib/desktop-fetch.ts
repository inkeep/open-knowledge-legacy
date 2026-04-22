/**
 * Desktop-mode fetch wrapper — rewrites relative `/api/*` requests to target
 * `window.okDesktop.config.apiOrigin` instead of the page origin.
 *
 * Why this exists: in Electron, the renderer is served by a different origin
 * than the API. Dev path: electron-vite's own Vite instance serves the React
 * bundle (electron.vite.config.ts pins `configFile: false`, so packages/app's
 * `hocuspocusPlugin` — the in-Vite /api handler — is NOT loaded). Packaged
 * path: the HTML is loaded from `file://` (or `resource://` in future) and
 * there's no /api surface on that origin either. The REST API lives on the
 * utility process's kernel-assigned port, exposed via
 * `window.okDesktop.config.apiOrigin = 'http://localhost:<utility-port>'`.
 *
 * Without this wrapper, every app fetch to `/api/*` (FileTree documents list,
 * BacklinksPanel, GraphPanel, etc.) hits the renderer host and gets back the
 * Vite HTML fallback — which parses as null JSON and surfaces as
 * "Server error (HTTP 200)" in the UI. This is the symptom the user saw when
 * the sidebar loaded with no files for dragon-wiki.
 *
 * Web / CLI distribution: `window.okDesktop` is undefined → `installDesktopFetchRewrite`
 * is a no-op; relative fetches hit the same-origin Vite/CLI server as before.
 *
 * CORS: the Hocuspocus API extension allows loopback Origins (localhost/127.x.x.x/[::1])
 * and the opaque `"null"` origin (file:// packaged Electron per Fetch spec §4.3). The
 * allowed Origin is reflected verbatim in ACAO; all other Origins receive a 403. The
 * rewriter itself only changes the URL, not headers or body.
 */

/** Minimal shape we read from the bridge config; avoids importing the full type. */
interface FetchRewriteConfig {
  apiOrigin: string;
}

/**
 * Install the wrapper. Idempotent: a second call is a no-op if the original
 * `fetch` has already been replaced (detected via a marker symbol). Safe to
 * call before React renders.
 */
export function installDesktopFetchRewrite(config: FetchRewriteConfig): void {
  const { apiOrigin } = config;
  if (!apiOrigin) return;

  // Prevent double-wrapping (e.g. under React StrictMode double-invoke of a
  // top-level side effect, or a future HMR reload path).
  const marker = Symbol.for('ok.desktop.fetchRewrite');
  const current = window.fetch as typeof window.fetch & { [marker]?: true };
  if (current[marker]) return;

  const origFetch = window.fetch.bind(window);

  const rewritten = ((input: RequestInfo | URL, init?: RequestInit) => {
    // String URL — by far the most common case in app code.
    if (typeof input === 'string') {
      return origFetch(rewriteIfApi(input, apiOrigin), init);
    }
    // URL object.
    if (input instanceof URL) {
      // Only rewrite when it's a same-origin /api/* URL; absolute externals
      // (e.g. image CDNs) pass through.
      if (
        input.pathname.startsWith('/api/') &&
        (input.origin === window.location.origin || input.protocol === 'file:')
      ) {
        const rel = input.pathname + input.search + input.hash;
        return origFetch(apiOrigin + rel, init);
      }
      return origFetch(input, init);
    }
    // Request object — currently nothing in app code builds /api/* Requests
    // manually, but we handle it defensively so adding one later doesn't
    // silently bypass the wrapper.
    try {
      const parsed = new URL(input.url, window.location.origin);
      if (parsed.pathname.startsWith('/api/')) {
        const rel = parsed.pathname + parsed.search + parsed.hash;
        return origFetch(new Request(apiOrigin + rel, input), init);
      }
    } catch {
      // URL parse failed — pass through unchanged.
    }
    return origFetch(input, init);
  }) as typeof window.fetch & { [marker]?: true };

  rewritten[marker] = true;
  window.fetch = rewritten;
}

function rewriteIfApi(url: string, apiOrigin: string): string {
  // Only rewrite URLs that are clearly same-origin relative `/api/*` paths.
  // Absolute URLs (`http://`, `https://`, `ws://`, `file://`) pass through
  // untouched — including the HocuspocusProvider WebSocket URL.
  if (url.startsWith('/api/')) {
    return apiOrigin + url;
  }
  return url;
}
