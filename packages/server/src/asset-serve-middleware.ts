/**
 * Middleware that serves contentDir assets via sirv with a
 * Content-Disposition policy and a fail-closed 404 guard.
 *
 * Both surfaces consume this single implementation:
 *   - `bun run dev` Vite plugin (combines Vite + collab + asset serving
 *     on one port) — `packages/app/src/server/hocuspocus-plugin.ts`.
 *   - `ok ui` production server — `packages/cli/src/commands/ui.ts`.
 *
 * Extracted as a pure factory so it can be unit-tested without spinning
 * up an HTTP server. The consumer supplies the real `contentFilter` +
 * sirv instance; tests supply stubs (unit tier) or a real filter + sirv
 * against a tmpdir (narrow-integration tier).
 *
 * Policy:
 *   1. Reject paths excluded by the content filter → fall through to
 *      `next()` so the next middleware (Vite's static serve, then SPA
 *      fallback) can handle them. This is load-bearing for `/src/...`
 *      Vite-internal paths.
 *   2. Always set `X-Content-Type-Options: nosniff`.
 *   3. For `.md` / `.mdx` direct-URL requests: skip Content-Disposition
 *      dispatch entirely. Normal editor flow uses hash routing; forcing
 *      `attachment` would break dev-tool `curl` of markdown paths.
 *   4. For inline-renderable extensions (images, PDF, video, audio):
 *      `Content-Disposition: inline` → browser renders in the new-tab
 *      built-in viewer.
 *   5. For everything else admitted by the content filter (office docs,
 *      archives, fonts, tabular/text data): `Content-Disposition:
 *      attachment` → browser prompts download rather than rendering
 *      ambiguously. Aligns with HedgeDoc's GHSA-x74j-jmf9-534w posture.
 *   6. sirv fall-through (file not found on disk) for asset-extension
 *      or executable-blocklist paths → explicit `404` BEFORE calling
 *      `next()`. Prevents Vite's `htmlFallbackMiddleware` (or sirv's
 *      `single: true` SPA fallback in `ok ui`) from returning
 *      `index.html` as `text/html` for missing asset URLs.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { mimes } from 'mrmime';

/**
 * Close 3 gaps in mrmime's default mime table that break browser inline
 * rendering for common user-drop formats. Without these, sirv serves the
 * bytes with an empty `Content-Type` header — combined with our
 * `Content-Disposition: inline` policy, Chromium renders the binary
 * bytes as garbled text rather than dispatching to its built-in video /
 * audio viewer.
 *
 * The fix is documented idiomatic usage per mrmime's README: "Exposes
 * the `mimes` dictionary for easy additions or overrides." Three
 * extensions need coverage:
 *
 *   - `.m4v` → `video/mp4`. Apple's MP4 variant is structurally MP4;
 *     `video/mp4` is standards-recommended (WordPress Trac #24993,
 *     Mozilla bug 875573). mrmime deliberately filters `x-` types, so
 *     the historical `video/x-m4v` is not in its default table.
 *   - `.mkv` → `video/x-matroska`. De-facto type (no IANA registration
 *     exists); Chromium recognizes it. Only non-`x-` alternative would
 *     be `application/octet-stream` which blocks inline rendering.
 *   - `.flac` → `audio/flac`. IANA-registered (RFC 9639);
 *     `audio/x-flac` is the deprecated legacy alias.
 *
 * Security posture: setting extension-derived Content-Type on
 * video/audio with `X-Content-Type-Options: nosniff` is NOT a stored-
 * XSS vector. Browsers refuse to treat `video/*` / `audio/*` as
 * scriptable regardless of file contents under nosniff (MDN
 * X-Content-Type-Options, Beyond XSS ch5). The SVG polyglot class
 * (`image/svg+xml`) is the real risk and is separately covered by
 * `EXECUTABLE_BLOCKLIST_EXTENSIONS` barring `.svg` from the
 * `openAssetSafely` click path.
 *
 * Module-load mutation runs once per Node process. Multiple dev-server
 * invocations in the same process (Vite restart) re-assign idempotently.
 *
 * If a future inline-renderable extension lands without a mrmime entry,
 * the narrow-integration test for `.m4v` will flag it (currently pinned
 * to `video/mp4`). Extend this map in lockstep.
 */
Object.assign(mimes, {
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  flac: 'audio/flac',
});

/**
 * Minimal contract the middleware depends on. The real
 * `@inkeep/open-knowledge-server` ContentFilter satisfies this; tests can
 * pass a stub.
 */
export interface AssetServeFilter {
  isExcluded(relativePath: string): boolean;
}

/**
 * Sirv-shaped middleware. The real `sirv(contentDir, {...})` result
 * satisfies this signature; tests can pass a stub that synchronously
 * invokes the fallback to simulate a file-not-found.
 */
export type SirvLikeMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  fallback: () => void,
) => void;

interface AssetServeMiddlewareDeps {
  /** Content filter (from `createServer()`'s returned `ServerInstance`). */
  contentFilter: AssetServeFilter;
  /** Sirv instance over the content directory. */
  contentSirv: SirvLikeMiddleware;
  /** Extensions that render safely inline in the browser. */
  inlineExtensions: ReadonlySet<string>;
  /**
   * Extensions admitted for asset-serve. Sirv fall-through for these
   * returns 404 (rather than falling through to Vite's SPA fallback).
   */
  assetExtensions: ReadonlySet<string>;
  /**
   * Executable-class extensions. Sirv fall-through for these also
   * returns 404 — mirrors the main-process `openAssetSafely` blocklist
   * so the serve surface refuses what the click surface refuses.
   */
  blocklistExtensions: ReadonlySet<string>;
}

export function createAssetServeMiddleware(
  deps: AssetServeMiddlewareDeps,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  const { contentFilter, contentSirv, inlineExtensions, assetExtensions, blocklistExtensions } =
    deps;

  return (req, res, next) => {
    const rel = decodeURIComponent(req.url?.split('?')[0]?.replace(/^\//, '') ?? '');
    if (!rel || contentFilter.isExcluded(rel)) return next();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const ext = extname(rel).slice(1).toLowerCase();
    const isDocExt = ext === 'md' || ext === 'mdx';
    if (!isDocExt) {
      if (inlineExtensions.has(ext)) {
        res.setHeader('Content-Disposition', 'inline');
      } else {
        res.setHeader('Content-Disposition', 'attachment');
      }
    }
    contentSirv(req, res, () => {
      // If sirv already wrote the response (it shouldn't normally call
      // fallback after writing headers, but guard defensively), don't
      // double-handle — the response is already owned.
      if (res.headersSent) return;
      if (assetExtensions.has(ext) || blocklistExtensions.has(ext)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      next();
    });
  };
}
