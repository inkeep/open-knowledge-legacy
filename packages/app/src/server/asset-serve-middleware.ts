/**
 * Dev-plugin middleware that serves contentDir assets via sirv with a
 * Content-Disposition policy and a fail-closed 404 guard.
 *
 * In production the equivalent policy is served by `ok ui`
 * (`packages/cli/src/commands/ui.ts:178-282`) using the same sirv
 * + `isScriptedDocumentExtension` attachment guard pattern. `bun run dev`
 * combines Vite + collab + asset serving on one port, so it needs its
 * own middleware that layers the same attachment-vs-inline dispatch.
 *
 * Extracted as a pure factory so it can be unit-tested without spinning
 * up Vite. Mirrors the `api-config-handler.ts` extraction precedent. The
 * Vite plugin supplies the real `contentFilter` + sirv instance; tests
 * supply stubs (unit tier) or a real filter + sirv against a tmpdir
 * (narrow-integration tier).
 *
 * Policy (enforces SPEC 2026-04-24b — D-M accept-all + R7 alignment):
 *   1. Reject paths excluded by the content filter → fall through to
 *      `next()` so the next middleware (Vite's static serve, then SPA
 *      fallback) can handle them. This is load-bearing for `/src/...`
 *      Vite-internal paths.
 *   2. Always set `X-Content-Type-Options: nosniff`.
 *   3. For `.md` / `.mdx` direct-URL requests: skip Content-Disposition
 *      dispatch entirely. Normal editor flow uses hash routing; forcing
 *      `attachment` would break dev-tool `curl` of markdown paths.
 *   4. For `INLINE_RENDERABLE_EXTENSIONS` members (images, PDF, video,
 *      audio): `Content-Disposition: inline` → browser renders in the
 *      new-tab built-in viewer.
 *   5. For everything else admitted by the content filter (office docs,
 *      archives, fonts, tabular/text data): `Content-Disposition:
 *      attachment` → browser prompts download rather than rendering
 *      ambiguously. Aligns with HedgeDoc's GHSA-x74j-jmf9-534w posture.
 *   6. sirv fall-through (file not found on disk) for `ASSET_EXTENSIONS`
 *      or `EXECUTABLE_BLOCKLIST_EXTENSIONS` paths → explicit `404`
 *      BEFORE calling `next()`. Prevents Vite's `htmlFallbackMiddleware`
 *      from returning `index.html` as `text/html` for missing asset
 *      URLs (the exact failure the user surfaced for `.m4v` before this
 *      amendment).
 *
 * @see packages/app/src/server/hocuspocus-plugin.ts — the consumer
 * @see packages/app/src/server/asset-serve-middleware.test.ts — unit tier
 * @see packages/app/src/server/asset-serve-middleware.integration.test.ts
 *   — narrow-integration tier (real sirv + http.createServer + fetch)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';

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
