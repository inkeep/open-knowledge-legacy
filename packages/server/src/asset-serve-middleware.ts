import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { mimes } from 'mrmime';

Object.assign(mimes, {
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  flac: 'audio/flac',
});

export function assetContentTypeForPath(path: string): string | null {
  return mimes[extname(path).slice(1).toLowerCase()] ?? null;
}

export interface AssetServeFilter {
  isPathIgnored(relativePath: string): boolean;
}

export type SirvLikeMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  fallback: () => void,
) => void;

interface AssetServeMiddlewareDeps {
  contentFilter: AssetServeFilter;
  contentSirv: SirvLikeMiddleware;
  inlineExtensions: ReadonlySet<string>;
  assetExtensions: ReadonlySet<string>;
  blocklistExtensions: ReadonlySet<string>;
}

export function createAssetServeMiddleware(
  deps: AssetServeMiddlewareDeps,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  const { contentFilter, contentSirv, inlineExtensions, assetExtensions, blocklistExtensions } =
    deps;

  return (req, res, next) => {
    let rel: string;
    try {
      rel = decodeURIComponent(req.url?.split('?')[0]?.replace(/^\//, '') ?? '');
    } catch {
      return next();
    }
    const ext = extname(rel).slice(1).toLowerCase();
    const isDocExt = ext === 'md' || ext === 'mdx';
    if (!rel || contentFilter.isPathIgnored(rel) || (!isDocExt && !assetExtensions.has(ext)))
      return next();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!isDocExt) {
      if (inlineExtensions.has(ext)) {
        res.setHeader('Content-Disposition', 'inline');
      } else {
        res.setHeader('Content-Disposition', 'attachment');
      }
    }
    if (ext === 'svg') {
      res.setHeader(
        'Content-Security-Policy',
        "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      );
    }
    contentSirv(req, res, () => {
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
