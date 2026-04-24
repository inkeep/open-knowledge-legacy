/**
 * Narrow-integration tests for the asset-serve middleware.
 *
 * Builds a minimal HTTP stack against a real `createContentFilter` + real
 * `sirv` + a real `http.createServer` on an ephemeral port, then asserts
 * full HTTP response shape (status, Content-Type, Content-Disposition,
 * body) via `fetch`.
 *
 * Why narrow-integration rather than unit-only: `sirv` + `mrmime`
 * determine the Content-Type header (empty string for unknown extensions
 * like `.m4v` — that's a real contract we want to pin). The unit tests
 * stub sirv and can't see that behavior. A sirv/mrmime upgrade that
 * shifts the mime map is a silent contract break; this tier catches it.
 *
 * Determinism: all files are seeded on disk BEFORE `createContentFilter`
 * is constructed so the synchronous `populateDirCount` walk at
 * `content-filter.ts:186` picks them up at startup. No file watcher,
 * no async dirCount updates. Same pattern as
 * `packages/server/src/content-filter.test.ts:496-539`.
 *
 * Precedents: `packages/cli/src/commands/ui.test.ts` (real HTTP + sirv
 * + Content-Disposition assertions), `packages/server/src/api-extension.test.ts:160-539`
 * (real HTTP + listen-on-0 + fetch).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ASSET_EXTENSIONS,
  EXECUTABLE_BLOCKLIST_EXTENSIONS,
  INLINE_RENDERABLE_EXTENSIONS,
} from '@inkeep/open-knowledge-core';
import { createContentFilter } from '@inkeep/open-knowledge-server';
import sirv from 'sirv';
import { createAssetServeMiddleware } from './asset-serve-middleware.ts';

interface Harness {
  baseURL: string;
  close: () => Promise<void>;
}

/**
 * Spin up a real HTTP server with the asset-serve middleware over a
 * tmpdir. Files must be seeded BEFORE calling this — the content filter
 * captures dirCount at construct time.
 */
async function startHarness(contentDir: string): Promise<Harness> {
  const contentFilter = createContentFilter({
    projectDir: contentDir,
    contentDir,
    includePatterns: ['**/*.md'],
    excludePatterns: [],
  });
  const middleware = createAssetServeMiddleware({
    contentFilter,
    contentSirv: sirv(contentDir, { dev: true, dotfiles: false }),
    inlineExtensions: INLINE_RENDERABLE_EXTENSIONS,
    assetExtensions: ASSET_EXTENSIONS,
    blocklistExtensions: EXECUTABLE_BLOCKLIST_EXTENSIONS,
  });

  const server: Server = createServer((req, res) => {
    middleware(req, res, () => {
      // No further middleware in this harness. Fall-through path —
      // simulating what Vite's htmlFallbackMiddleware would do in
      // production — returns 200 text/html with a sentinel body so we
      // can distinguish "fell through" from "sirv served" vs "404 guard
      // fired" in assertions.
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end('<!-- spa fallback sentinel -->');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('server did not bind to a port');
  }
  const baseURL = `http://127.0.0.1:${address.port}`;

  return {
    baseURL,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('asset-serve middleware (narrow integration)', () => {
  let contentDir: string;
  let harness: Harness;

  beforeEach(async () => {
    contentDir = mkdtempSync(join(tmpdir(), 'ok-asset-serve-'));

    // Seed a subdirectory doc + representative assets. Populated BEFORE
    // filter construction so dirCount['docs'] starts at 1.
    mkdirSync(join(contentDir, 'docs'));
    writeFileSync(join(contentDir, 'docs', 'guide.md'), '# Guide');

    // Inline-renderable (each class)
    writeFileSync(join(contentDir, 'docs', 'photo.png'), 'fake-png-bytes');
    writeFileSync(join(contentDir, 'docs', 'doc.pdf'), 'fake-pdf-bytes');
    writeFileSync(join(contentDir, 'docs', 'clip.m4v'), 'fake-m4v-bytes');
    writeFileSync(join(contentDir, 'docs', 'song.flac'), 'fake-flac-bytes');

    // Admitted non-inline (office + tabular + archive)
    writeFileSync(join(contentDir, 'docs', 'spec.docx'), 'fake-docx-bytes');
    writeFileSync(join(contentDir, 'docs', 'data.csv'), 'a,b\n1,2\n');
    writeFileSync(join(contentDir, 'docs', 'notes.txt'), 'some text');
    writeFileSync(join(contentDir, 'docs', 'archive.zip'), 'fake-zip-bytes');

    harness = await startHarness(contentDir);
  });

  afterEach(async () => {
    await harness.close();
    rmSync(contentDir, { recursive: true, force: true });
  });

  describe('Content-Disposition dispatch for existing assets', () => {
    test('inline-renderable extensions get `Content-Disposition: inline`', async () => {
      // Each representative class: image, PDF, video, audio
      for (const path of [
        '/docs/photo.png',
        '/docs/doc.pdf',
        '/docs/clip.m4v',
        '/docs/song.flac',
      ]) {
        const res = await fetch(`${harness.baseURL}${path}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toBe('inline');
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      }
    });

    test('non-inline admitted extensions get `Content-Disposition: attachment`', async () => {
      for (const path of [
        '/docs/spec.docx',
        '/docs/data.csv',
        '/docs/notes.txt',
        '/docs/archive.zip',
      ]) {
        const res = await fetch(`${harness.baseURL}${path}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toBe('attachment');
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      }
    });

    test('markdown direct-URL request bypasses Content-Disposition', async () => {
      // .md is neither inline nor non-inline for this policy — the editor
      // fetches via /api/document. Direct URL should stream raw markdown
      // with NO Content-Disposition (no forced download).
      const res = await fetch(`${harness.baseURL}/docs/guide.md`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toBeNull();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });
  });

  describe('Content-Type correctness (sirv + mrmime map)', () => {
    test('PDF gets application/pdf', async () => {
      const res = await fetch(`${harness.baseURL}/docs/doc.pdf`);
      expect(res.headers.get('content-type')).toMatch(/^application\/pdf/);
    });

    test('PNG gets image/png', async () => {
      const res = await fetch(`${harness.baseURL}/docs/photo.png`);
      expect(res.headers.get('content-type')).toMatch(/^image\/png/);
    });

    test('CSV gets text/csv', async () => {
      const res = await fetch(`${harness.baseURL}/docs/data.csv`);
      expect(res.headers.get('content-type')).toMatch(/^text\/csv/);
    });

    test('M4V gets empty Content-Type (mrmime gap — current behavior pin)', async () => {
      // `.m4v` is NOT in mrmime's default mime table. sirv emits empty
      // Content-Type. With `X-Content-Type-Options: nosniff` this is
      // safe (no inline script execution risk) but the browser's built-
      // in video viewer can't decide to render. Documented as future
      // work in the 2026-04-24b amendment — "Explicit
      // application/octet-stream fallback for sirv+mrmime misses."
      //
      // This test PINS the current behavior so a future mime-table
      // extension is an intentional change rather than an invisible
      // side effect. When the follow-up lands, flip this to the chosen
      // fallback.
      const res = await fetch(`${harness.baseURL}/docs/clip.m4v`);
      expect(res.status).toBe(200);
      const ct = res.headers.get('content-type');
      // Empty or null (sirv + mrmime behavior). Both safe under nosniff.
      expect(ct === null || ct === '').toBe(true);
    });
  });

  describe('Fail-closed 404 guard', () => {
    test('missing asset path returns 404, NOT the SPA fallback sentinel', async () => {
      const res = await fetch(`${harness.baseURL}/docs/missing.m4v`);
      expect(res.status).toBe(404);
      // Must NOT be the fall-through path that returns text/html.
      const ct = res.headers.get('content-type') ?? '';
      expect(ct).not.toMatch(/^text\/html/);
      const body = await res.text();
      expect(body).not.toContain('spa fallback sentinel');
    });

    test('missing asset at root (no sibling .md) falls through to SPA fallback', async () => {
      // Root has no .md siblings in this fixture (guide.md is in docs/).
      // `missing.m4v` at root fails contentFilter.isExcluded — excluded →
      // next() → SPA fallback fires. Distinct behavior from dir-with-md.
      const res = await fetch(`${harness.baseURL}/missing.m4v`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('spa fallback sentinel');
    });

    test('blocklisted-extension paths are excluded by the content filter (defense in depth)', async () => {
      // `.dmg` is in EXECUTABLE_BLOCKLIST_EXTENSIONS but NOT in
      // ASSET_EXTENSIONS — the content filter excludes it at step 3
      // before reaching the middleware's 404 guard. Result: falls
      // through to next(), which in production hits Vite's
      // htmlFallbackMiddleware. In this test harness, the fall-through
      // hits our sentinel.
      //
      // This is the RIGHT behavior: the Electron `openAssetSafely`
      // blocklist refuses click dispatch for `.dmg`; the serve layer
      // similarly refuses to admit it (via exclusion, not 404). A user
      // navigating `/docs/malicious.dmg` directly in the browser gets
      // HTML (editor shell), which is a benign dead end — the file
      // never streams back.
      //
      // The middleware's blocklist branch of the 404 guard only fires
      // if someone explicitly INCLUDES a blocklisted extension via
      // include patterns (unusual config). Pinning this so future
      // admission-rule changes don't silently admit exec paths.
      const res = await fetch(`${harness.baseURL}/docs/malicious.dmg`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('spa fallback sentinel');
    });

    test('unknown extension (not in asset or blocklist set) falls through to SPA fallback', async () => {
      // `.xyz` was admitted by isExcluded? NO — our include pattern is
      // `**/*.md` and `.xyz` is outside ASSET_EXTENSIONS, so the content
      // filter excludes it. The middleware returns next() before sirv
      // ever runs.
      const res = await fetch(`${harness.baseURL}/docs/anything.xyz`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('spa fallback sentinel');
    });
  });

  describe('Regression guards for the serve-side contract', () => {
    test('query strings are stripped from path resolution', async () => {
      const res = await fetch(`${harness.baseURL}/docs/doc.pdf?t=42`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toBe('inline');
    });

    test('URL-encoded paths are decoded', async () => {
      mkdirSync(join(contentDir, 'docs', 'has space'));
      writeFileSync(join(contentDir, 'docs', 'has space', 'notes.md'), '# N');
      writeFileSync(join(contentDir, 'docs', 'has space', 'file.pdf'), 'fake');
      // Need a fresh harness — filter dirCount for `docs/has space` was 0
      // when the original harness started. Re-seed + re-start.
      await harness.close();
      harness = await startHarness(contentDir);

      const res = await fetch(`${harness.baseURL}/docs/has%20space/file.pdf`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toBe('inline');
    });

    test('nosniff header is set on every served response, regardless of disposition', async () => {
      // Inline, attachment, and .md bypass all set nosniff. Only excluded
      // paths (which fall through to next() immediately without setting
      // headers) skip it — and that's correct, since next() is supposed
      // to serve a different response entirely.
      const paths = ['/docs/photo.png', '/docs/data.csv', '/docs/guide.md'];
      for (const path of paths) {
        const res = await fetch(`${harness.baseURL}${path}`);
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      }
    });
  });
});
