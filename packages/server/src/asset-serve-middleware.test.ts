/**
 * Unit tests for `createAssetServeMiddleware`.
 *
 * Verifies the pure-logic branches of the Content-Disposition + fail-
 * closed 404 policy using stubbed `contentFilter` + `contentSirv`. The
 * `makeReq/makeRes` pattern mirrors `packages/server/src/api-file-ops.test.ts:24-51`.
 *
 * Narrow-integration coverage (real sirv + real contentFilter + real
 * `http.createServer` + `fetch`) lives in
 * `asset-serve-middleware.integration.test.ts`.
 */

import { describe, expect, test } from 'bun:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import {
  type AssetServeFilter,
  createAssetServeMiddleware,
  type SirvLikeMiddleware,
} from './asset-serve-middleware.ts';

function makeReq(url: string): IncomingMessage {
  const readable = Readable.from(Buffer.alloc(0)) as unknown as IncomingMessage;
  readable.method = 'GET';
  readable.url = url;
  readable.headers = { host: 'localhost' };
  return readable;
}

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  headersSent: boolean;
  ended: boolean;
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, headersSent: false, ended: false };
  const res = {
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status;
      captured.headersSent = true;
      if (headers) Object.assign(captured.headers, headers);
    },
    end(_body?: string) {
      captured.ended = true;
    },
    get headersSent() {
      return captured.headersSent;
    },
    get statusCode() {
      return captured.status;
    },
    set statusCode(value: number) {
      captured.status = value;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

/** A sirv stub that always falls through (simulating file-not-found). */
const sirvFallThrough: SirvLikeMiddleware = (_req, _res, fallback) => fallback();

/** A sirv stub that "serves" — marks headersSent + ended without calling fallback. */
const sirvServes: SirvLikeMiddleware = (_req, res, _fallback) => {
  res.writeHead(200);
  res.end();
};

/** Filter that admits everything. */
const admitAll: AssetServeFilter = { isExcluded: () => false };

/** Filter that excludes everything. */
const excludeAll: AssetServeFilter = { isExcluded: () => true };

/** Realistic extension sets (subset of the production ones — enough to drive the branches). */
const INLINE = new Set(['png', 'jpg', 'pdf', 'mp4', 'm4v', 'svg']);
const ASSETS = new Set([...INLINE, 'docx', 'csv', 'json', 'txt', 'zip']);
const BLOCKLIST = new Set(['exe', 'dmg', 'sh', 'html']);

function buildMiddleware(sirv: SirvLikeMiddleware, filter: AssetServeFilter = admitAll) {
  return createAssetServeMiddleware({
    contentFilter: filter,
    contentSirv: sirv,
    inlineExtensions: INLINE,
    assetExtensions: ASSETS,
    blocklistExtensions: BLOCKLIST,
  });
}

describe('createAssetServeMiddleware', () => {
  describe('filter exclusion', () => {
    test('excluded path falls through to next() immediately without setting headers', () => {
      let nextCalled = false;
      const middleware = buildMiddleware(sirvServes, excludeAll);
      const { res, captured } = makeRes();
      middleware(makeReq('/foo.m4v'), res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
      expect(captured.headers).toEqual({});
      expect(captured.headersSent).toBe(false);
    });

    test('empty URL path falls through (rel === "")', () => {
      let nextCalled = false;
      const middleware = buildMiddleware(sirvServes);
      const { res } = makeRes();
      middleware(makeReq('/'), res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });
  });

  describe('Content-Disposition dispatch', () => {
    test('INLINE_RENDERABLE extension gets `inline` disposition', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/clip.m4v'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBe('inline');
      expect(captured.headers['X-Content-Type-Options']).toBe('nosniff');
    });

    test('admitted non-inline extension gets `attachment` disposition', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/data.csv'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBe('attachment');
      expect(captured.headers['X-Content-Type-Options']).toBe('nosniff');
    });

    test('office doc gets `attachment` (HedgeDoc stored-XSS posture)', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/spec.docx'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBe('attachment');
    });

    test('PDF gets `inline` — browser built-in viewer renders', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/doc.pdf'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBe('inline');
    });
  });

  describe('.md / .mdx doc-ext bypass', () => {
    test('.md direct-URL request skips Content-Disposition entirely', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/notes.md'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBeUndefined();
      // Other headers still set.
      expect(captured.headers['X-Content-Type-Options']).toBe('nosniff');
    });

    test('.mdx direct-URL request also bypasses disposition', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/doc.mdx'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBeUndefined();
    });

    test('uppercase extensions normalize to lowercase (case-insensitive ext)', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/Notes.MD'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBeUndefined();
    });
  });

  describe('fail-closed 404 guard', () => {
    test('sirv fall-through on ASSET_EXTENSIONS path returns 404, not next()', () => {
      let nextCalled = false;
      const middleware = buildMiddleware(sirvFallThrough);
      const { res, captured } = makeRes();
      middleware(makeReq('/missing.m4v'), res, () => {
        nextCalled = true;
      });
      expect(captured.status).toBe(404);
      expect(captured.ended).toBe(true);
      expect(nextCalled).toBe(false);
    });

    test('sirv fall-through on EXECUTABLE_BLOCKLIST path returns 404', () => {
      let nextCalled = false;
      const middleware = buildMiddleware(sirvFallThrough);
      const { res, captured } = makeRes();
      middleware(makeReq('/malicious.dmg'), res, () => {
        nextCalled = true;
      });
      expect(captured.status).toBe(404);
      expect(captured.ended).toBe(true);
      expect(nextCalled).toBe(false);
    });

    test('sirv fall-through on unknown extension falls through to next() (SPA fallback will handle)', () => {
      let nextCalled = false;
      const middleware = buildMiddleware(sirvFallThrough);
      const { res, captured } = makeRes();
      middleware(makeReq('/route.unknown'), res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
      // Headers were still set pre-sirv (Content-Disposition: attachment
      // for unknown ext, nosniff always). But status stays 0 — we
      // delegated to next(), not emitted 404.
      expect(captured.status).toBe(0);
      expect(captured.ended).toBe(false);
    });

    test('sirv fall-through on .md falls through to next() (doc-path, not asset)', () => {
      // Regression guard: markdown paths that sirv didn't serve must NOT
      // hit the 404 branch — .md is neither in ASSET_EXTENSIONS nor in
      // EXECUTABLE_BLOCKLIST_EXTENSIONS, so the guard should not fire.
      let nextCalled = false;
      const middleware = buildMiddleware(sirvFallThrough);
      const { res, captured } = makeRes();
      middleware(makeReq('/missing.md'), res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
      expect(captured.status).toBe(0);
    });

    test('404 guard is skipped if sirv already sent headers (race safety)', () => {
      // If sirv started writing the response before calling fallback
      // (unlikely but not impossible), the guard must not double-write.
      const sirvRaced: SirvLikeMiddleware = (_req, res, fallback) => {
        res.writeHead(200);
        fallback();
      };
      let nextCalled = false;
      const middleware = buildMiddleware(sirvRaced);
      const { res, captured } = makeRes();
      middleware(makeReq('/clip.m4v'), res, () => {
        nextCalled = true;
      });
      // headersSent was true before the fallback, so neither 404 nor
      // next() fires.
      expect(captured.status).toBe(200);
      expect(nextCalled).toBe(false);
    });
  });

  describe('URL parsing', () => {
    test('query string is stripped from relative path', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/clip.m4v?t=42'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBe('inline');
    });

    test('URL-encoded path is decoded', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/my%20file.m4v'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBe('inline');
    });

    test('extensionless path routes to attachment (admitted-non-inline branch)', () => {
      const middleware = buildMiddleware(sirvServes);
      const { res, captured } = makeRes();
      middleware(makeReq('/README'), res, () => {});
      expect(captured.headers['Content-Disposition']).toBe('attachment');
    });
  });
});
