/**
 * PropPanel upload affordance — end-to-end coverage for img/video/audio.
 *
 * Covers the full UI → server → disk → render path that no lower tier
 * exercises:
 *
 *  - The PropUploadButton's hidden `<input type="file">` is wired through
 *    `runUpload` → `uploadFile` → real fetch to `/api/upload-{image,video,audio}`.
 *  - The server's magic-byte sniffing accepts a real multipart body shaped
 *    by Chromium's file-input + FormData (not a hand-crafted Buffer like
 *    the unit test).
 *  - The returned `{ src }` propagates through `onUploaded` → `onChange`
 *    → Y.Doc → re-render of the descriptor's React component with new src.
 *  - Cross-medium parity: each descriptor's wiring is independent (different
 *    `accept` array, different endpoint) and a video-specific regression
 *    won't show in image-only coverage.
 *
 * Initial-insert AND replace-src are both exercised in the same flow per
 * medium: seed a doc with a placeholder src, upload one buffer (replaces
 * src), upload a second buffer (replaces again). The PropUploadButton
 * code path is the same for empty-initial-src vs populated-initial-src;
 * the bug class unique to "replace existing" is `PropPanel.onChange
 * mutating attrs of an existing block` which is already covered by every
 * existing PropPanel-attr-change test.
 *
 * The ERROR-PATH variant on UPLOAD-IMG exercises the catch arm in
 * `runUpload` (server-side magic-byte rejection → 400 → toast) without
 * needing a `Promise.reject(...)` mock at the unit tier — that's the
 * `bun:test` unhandled-rejection observer trap from the runUpload-tests
 * removal in `PropPanel.test.tsx:396-407`.
 *
 * This file is NOT in the CI `test:e2e` file list
 * (`packages/app/package.json` dispatches a fixed subset for PR-tier runs);
 * generic `bunx playwright test` invocations run it for pre-push coverage,
 * and the nightly E2E stability surveillance picks up flakes.
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
  createMp3Buffer,
  createMp4Buffer,
  createPdfBuffer,
  createPngBuffer,
  expect,
  test,
  waitForActiveProviderSynced,
} from './_helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Open the PropPanel for the (only) component block on the page by
 *  clicking its settings gear. Returns the panel locator scoped to the
 *  Radix portal under document.body.
 *
 *  Chrome opacity is 0 by default and only goes to 1 on `:hover` or when
 *  the wrapper has `data-selected="true"` (`globals.css`). For img blocks,
 *  the inner `<span data-rmiz>` (medium-zoom wrapper) intercepts pointer
 *  events on the image content itself — so we hover the wrapper to surface
 *  the chrome, then click the gear with `force: true` to bypass the
 *  pointer-events-intercept check (Playwright's actionability gate). The
 *  gear button is positioned at top:-11px above the wrapper, OUTSIDE the
 *  medium-zoom span's bounding box, so the click lands cleanly on it. */
async function openPropPanel(page: Page): Promise<ReturnType<Page['locator']>> {
  const wrapper = page.locator('[data-jsx-component]').first();
  await wrapper.waitFor({ state: 'visible', timeout: 5000 });
  await wrapper.hover();
  const gear = wrapper.locator('button[aria-label*="properties"]').first();
  await gear.waitFor({ state: 'visible', timeout: 5000 });
  await gear.click({ force: true });
  const panel = page.locator('[data-prop-panel]').first();
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  return panel;
}

/** Read the current `src` value of the (single) media element on the page.
 *  Works for `<img>`, `<video>`, `<audio>` — each renders with an `src`
 *  attribute on the tag itself or on a child source element. */
async function readSrc(page: Page, tag: 'img' | 'video' | 'audio'): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLMediaElement | HTMLImageElement | null;
    if (!el) return '';
    // For <video>/<audio>, the src may be on the element OR on a <source>
    // child. PropPanel sets it on the element directly (no <source>
    // children) so the attribute read suffices.
    return el.getAttribute('src') ?? '';
  }, tag);
}

/** Wait for the media element's `src` attribute to differ from the prior
 *  value. Polls via the page's MutationObserver-equivalent (Playwright's
 *  `waitForFunction`). */
async function waitForSrcChange(
  page: Page,
  tag: 'img' | 'video' | 'audio',
  prior: string,
  timeoutMs = 8000,
): Promise<string> {
  await page.waitForFunction(
    ([sel, prev]) => {
      const el = document.querySelector(sel as string);
      const cur = el?.getAttribute('src') ?? '';
      return cur && cur !== prev;
    },
    [tag, prior],
    { timeout: timeoutMs },
  );
  return readSrc(page, tag);
}

interface UploadCase {
  tag: 'img' | 'video' | 'audio';
  endpoint: '/api/upload-image' | '/api/upload-video' | '/api/upload-audio';
  initialMarkdown: string;
  initialSrc: string;
  /** Two distinct payloads — the test uploads both in sequence to exercise
   *  initial replace AND second replace through the same wiring. */
  payloads: Array<{ name: string; mimeType: string; buffer: Buffer }>;
}

const cases: Record<'img' | 'video' | 'audio', UploadCase> = {
  img: {
    tag: 'img',
    endpoint: '/api/upload-image',
    initialMarkdown: '<img src="initial.png" alt="initial" />',
    initialSrc: 'initial.png',
    payloads: [
      { name: 'first.png', mimeType: 'image/png', buffer: createPngBuffer() },
      { name: 'second.png', mimeType: 'image/png', buffer: createPngBuffer() },
    ],
  },
  video: {
    tag: 'video',
    endpoint: '/api/upload-video',
    initialMarkdown: '<video src="initial.mp4" controls />',
    initialSrc: 'initial.mp4',
    payloads: [
      { name: 'first.mp4', mimeType: 'video/mp4', buffer: createMp4Buffer() },
      { name: 'second.mp4', mimeType: 'video/mp4', buffer: createMp4Buffer() },
    ],
  },
  audio: {
    tag: 'audio',
    endpoint: '/api/upload-audio',
    initialMarkdown: '<audio src="initial.mp3" controls />',
    initialSrc: 'initial.mp3',
    payloads: [
      { name: 'first.mp3', mimeType: 'audio/mpeg', buffer: createMp3Buffer() },
      { name: 'second.mp3', mimeType: 'audio/mpeg', buffer: createMp3Buffer() },
    ],
  },
};

// ---------------------------------------------------------------------------
// UPLOAD-{IMG,VID,AUD}-01 — happy path: replace src twice through PropPanel
// ---------------------------------------------------------------------------

for (const kind of ['img', 'video', 'audio'] as const) {
  const c = cases[kind];

  test(`UPLOAD-${kind.toUpperCase()}-01: PropPanel upload replaces src and lands on disk`, async ({
    page,
    api,
    workerServer,
  }) => {
    const docName = `prop-upload-${kind}-${randomUUID().slice(0, 8)}`;
    await api.seedDocs([{ name: docName, markdown: c.initialMarkdown }]);
    await page.goto(`/#/${docName}`);
    await page.waitForSelector('.ProseMirror');
    await waitForActiveProviderSynced(page);

    // Initial src is the seeded placeholder.
    expect(await readSrc(page, c.tag)).toBe(c.initialSrc);

    const panel = await openPropPanel(page);
    const fileInput = panel.locator('[data-prop-upload-input]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 5000 });

    // First upload — initial → first payload.
    await fileInput.setInputFiles({
      name: c.payloads[0].name,
      mimeType: c.payloads[0].mimeType,
      buffer: c.payloads[0].buffer,
    });
    const srcAfterFirst = await waitForSrcChange(page, c.tag, c.initialSrc);
    expect(srcAfterFirst).not.toBe(c.initialSrc);
    // Server returns server-absolute URLs (leading slash, contentDir-relative).
    expect(srcAfterFirst).toMatch(/^\//);
    expect(srcAfterFirst).toContain(c.payloads[0].name.replace(/\.\w+$/, ''));
    expect(existsSync(join(workerServer.contentDir, srcAfterFirst))).toBe(true);

    // Second upload — first payload → second payload. Same wiring path,
    // but starting from a populated src (initial-vs-update parity).
    await fileInput.setInputFiles({
      name: c.payloads[1].name,
      mimeType: c.payloads[1].mimeType,
      buffer: c.payloads[1].buffer,
    });
    const srcAfterSecond = await waitForSrcChange(page, c.tag, srcAfterFirst);
    expect(srcAfterSecond).not.toBe(srcAfterFirst);
    expect(srcAfterSecond).toMatch(/^\//);
    expect(srcAfterSecond).toContain(c.payloads[1].name.replace(/\.\w+$/, ''));
    expect(existsSync(join(workerServer.contentDir, srcAfterSecond))).toBe(true);
  });
}

// ---------------------------------------------------------------------------
// UPLOAD-IMG-SUBDIR-01 — doc in a subdir uploads + browser-fetches the file
//
// Regression guard for the doc-relative-URL bug: if the server returns a
// bare filename (`foo.png`) instead of a server-absolute path
// (`/subdir/foo.png`), the renderer's `<img src="foo.png">` resolves
// against the page base (`http://localhost:5173/` — hash fragment doesn't
// affect URL base) and fetches `localhost:5173/foo.png`. sirv looks at
// contentDir root, doesn't find it, falls through to Vite's SPA fallback
// which returns index.html with text/html — the `<img>` shows broken-icon.
//
// UPLOAD-IMG-01 above doesn't catch this because it seeds at contentDir
// root (no subdir), so bare-filename and server-absolute paths happen to
// coincide. This test puts the doc in a subdir so the two paths diverge,
// and verifies the rendered <img>'s src actually resolves to the file
// (Content-Type starts with image/, not text/html).
//
// Uses the worker fixture's pre-seeded `sidebar-folder/` (created at
// `_helpers/fixtures.ts:171` `seedRequiredFixtureFiles`, which writes
// `sidebar-folder/nested-doc.md` at worker boot) so the content
// filter's `dirCount[sidebar-folder]` is warm by the time the test
// runs. Freshly-created subdirs
// hit a separate filter race (parcel-watcher's async `create` event lags
// the synchronous `/api/create-page` response by hundreds of ms, leaving
// dirCount stale during the upload window). That race is fixed in
// PR #270's `e9c2c034` (synchronous `incrementMdDir` in `handleCreatePage`)
// — out of scope for this PR; document and pin to a pre-warmed subdir.
// ---------------------------------------------------------------------------

test('UPLOAD-IMG-SUBDIR-01: subdir-doc upload renders <img> that fetches the asset (not SPA fallback)', async ({
  page,
  api,
  workerServer,
}) => {
  // Pre-condition guard: the worker fixture seeds `sidebar-folder/nested-doc.md`
  // at boot (see `_helpers/fixtures.ts:171` `seedRequiredFixtureFiles`). If the
  // seed is missing, the content filter's `dirCount[sidebar-folder]` is cold
  // and the upload returns 400 from the filter rather than from the path-escape
  // / MIME validation under test. Fail-fast here so the failure points at the
  // missing prerequisite instead of the upload step.
  expect(existsSync(join(workerServer.contentDir, 'sidebar-folder', 'nested-doc.md'))).toBe(true);

  const docName = `sidebar-folder/upload-${randomUUID().slice(0, 8)}`;
  await api.seedDocs([{ name: docName, markdown: cases.img.initialMarkdown }]);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);

  expect(await readSrc(page, 'img')).toBe(cases.img.initialSrc);

  const panel = await openPropPanel(page);
  const fileInput = panel.locator('[data-prop-upload-input]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 5000 });

  await fileInput.setInputFiles({
    name: cases.img.payloads[0].name,
    mimeType: cases.img.payloads[0].mimeType,
    buffer: cases.img.payloads[0].buffer,
  });

  const newSrc = await waitForSrcChange(page, 'img', cases.img.initialSrc);
  expect(newSrc).not.toBe(cases.img.initialSrc);

  // Server-absolute URL shape — leading slash + contains the doc's subdir.
  expect(newSrc).toMatch(/^\/sidebar-folder\//);

  // The file must exist on disk under the doc's subdir.
  expect(existsSync(join(workerServer.contentDir, newSrc))).toBe(true);

  // Critical: when the browser resolves <img src=...>, it must hit the
  // actual file (Content-Type: image/*), not Vite's SPA fallback
  // (Content-Type: text/html). This is the regression that bare-filename
  // src would silently fail.
  const baseURL = page.url().split('#')[0]; // strip hash
  const resolved = new URL(newSrc, baseURL).toString();
  const response = await page.request.get(resolved);
  expect(response.status()).toBe(200);
  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType).toMatch(/^image\//);
});

// ---------------------------------------------------------------------------
// UPLOAD-IMG-ERR — server-side magic-byte rejection surfaces toast.error,
// src unchanged. Exercises runUpload's catch arm (`String(err)` fallback)
// without a mock-driven `Promise.reject(...)` (the Bun observer-bleed trap).
// ---------------------------------------------------------------------------

test('UPLOAD-IMG-ERR: PDF masquerading as PNG → magic-byte 400 → toast.error → src unchanged', async ({
  page,
  api,
}) => {
  const docName = `prop-upload-err-${randomUUID().slice(0, 8)}`;
  await api.seedDocs([{ name: docName, markdown: cases.img.initialMarkdown }]);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);

  expect(await readSrc(page, 'img')).toBe(cases.img.initialSrc);

  const panel = await openPropPanel(page);
  const fileInput = panel.locator('[data-prop-upload-input]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 5000 });

  // PDF magic bytes + .png filename + image/png MIME hint. Server's
  // `fileTypeFromBuffer` ignores the client MIME, detects application/pdf
  // from the magic bytes, rejects with 400 because pdf is not in
  // ALLOWED_IMAGE_MIME_TYPES.
  await fileInput.setInputFiles({
    name: 'malicious.png',
    mimeType: 'image/png',
    buffer: createPdfBuffer(),
  });

  // Sonner toast surfaces with `Upload failed: <server message>` per
  // runUpload's catch arm. The toast lives outside the editor in a
  // top-level container; selector matches sonner's default DOM shape.
  const toast = page.locator('[data-sonner-toast]', { hasText: /upload failed/i }).first();
  await toast.waitFor({ state: 'visible', timeout: 5000 });

  // src must NOT have changed — the rejection short-circuited before
  // `onUploaded(url)` could run.
  expect(await readSrc(page, 'img')).toBe(cases.img.initialSrc);
});
