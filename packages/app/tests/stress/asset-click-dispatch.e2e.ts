/**
 * E2E coverage for the asset-click dispatcher (SPEC 2026-04-23 amendment
 * FR-A1..A8; `evidence/e2e-acceptance-scenarios.md` Path P9).
 *
 * Focuses on real-Chromium scenarios that can't be covered by unit /
 * integration tests:
 *
 *   - P9.1   Post-reload click on `![[file.pdf]]` → new tab opens
 *   - P9.9   [[foo]] wiki-link navigation UNCHANGED (regression guard)
 *   - P9.10  Hand-authored `[spec](./file.pdf)` click fires dispatcher
 *   - P9.11  Image inline render — click is a no-op (regression guard)
 *   - P9.15  Path-escape (`../../etc/passwd`) doesn't open new tab
 *
 * Electron-specific scenarios (P9.2 / P9.4 / P9.6 / P9.7 / P9.8 / P9.16)
 * require the Electron test harness (not available in the Playwright
 * web-tier); /qa invocation is gated on them per the plan's fidelity-
 * ladder protocol. Integration coverage of the main-process pieces
 * (openAssetSafely / revealAssetSafely / showAssetMenu / safety net)
 * lives in:
 *   - packages/desktop/tests/main/asset-open-handlers.test.ts
 *   - packages/desktop/tests/main/asset-menu.test.ts
 *   - packages/desktop/tests/main/asset-safety-net.test.ts
 *   - packages/desktop/tests/integration/asset-open-ipc.test.ts
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test, waitForActiveProviderSynced as waitForProvider } from './_helpers';

async function getSourceText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const provider = window.__activeProvider;
    return provider?.document?.getText('source')?.toString() ?? '';
  });
}

/**
 * Synthetic drag-drop of a File into the editor. Mirrors
 * `asset-embed.e2e.ts`'s dropFileIntoEditor — dispatches dragover then
 * drop so TipTap's FileHandler extension completes its event sequence.
 */
async function dropFileIntoEditor(
  page: Page,
  bytes: number[],
  filename: string,
  mime: string,
): Promise<void> {
  await page.evaluate(
    ({ bytes: byteArr, filename: fn, mime: mt }) => {
      const editor = document.querySelector('.ProseMirror') as HTMLElement | null;
      if (!editor) throw new Error('no editor');
      const file = new File([new Uint8Array(byteArr)], fn, { type: mt });
      const dt = new DataTransfer();
      dt.items.add(file);
      const rect = editor.getBoundingClientRect();
      const cx = rect.left + Math.floor(rect.width / 2);
      const cy = rect.top + Math.floor(rect.height / 2);
      editor.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
        }),
      );
      editor.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
        }),
      );
    },
    { bytes, filename, mime },
  );
}

// 1x1 transparent PNG — valid bytes, minimal size. Byte-identical across
// test runs so dedup is predictable.
const TINY_PNG_BYTES = Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQrkJggg==',
    'base64',
  ),
);

// Minimal valid PDF bytes — PDF 1.4 header + catalog + trailer. Chromium's
// built-in PDF viewer accepts this shape; adversarial tests would want a
// larger corpus but a valid 1-page PDF is enough to verify server Content-
// Type + URL resolution.
const TINY_PDF_BYTES = Array.from(
  Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
xref
0 4
0000000000 65535 f
0000000010 00000 n
0000000050 00000 n
0000000090 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
140
%%EOF`,
    'utf-8',
  ),
);

test.describe('asset-click dispatcher — P9 E2E scenarios (SPEC 2026-04-23)', () => {
  let docName: string;

  test.beforeEach(async ({ page, api }) => {
    docName = `asset-dispatch-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);
    await api.replaceDoc(docName, '# Dispatch test\n');
    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');
    await page.click('.ProseMirror');
  });

  test('P9.1: post-reload PDF click → new browser tab opens; editor window preserved', async ({
    page,
    api,
    context,
  }) => {
    // Seed with `![[meeting.pdf]]` directly via the API. Loading the doc
    // exercises the server Observer B parse → mdast → PM dispatch, which
    // emits a text + link mark with sourceForm='wikiembed' for PDF
    // extensions. That's the exact post-roundtrip shape the Gap 3b fix
    // targets — clicking it pre-fix opened the doc-link PropPanel; post-
    // fix, `internal-link.ts` handlePrimary's asset branch fires and
    // routes through dispatchAssetClick → web fallback window.open.
    await api.replaceDoc(docName, `# Source\n\n![[meeting.pdf]]\n`);
    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    // Chip should be rendered as `<span data-link>` (plain-DOM V2).
    const chip = page.locator('span[data-link]').first();
    await chip.waitFor({ state: 'visible', timeout: 5_000 });

    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 5_000 }),
      chip.click(),
    ]);
    expect(newPage.url()).toContain('meeting.pdf');
    // Editor window stays on the original doc — no same-tab nav.
    expect(page.url()).toContain(docName);
  });

  test('P9.9: [[foo]] wiki-link chip — bare click does NOT fire dispatcher (regression guard)', async ({
    page,
    api,
    context,
  }) => {
    // Regression invariant: clicking a doc-to-doc wiki-link chip (`[[foo]]`)
    // should NOT fire the asset dispatcher — the existing wiki-link
    // handler has its own flow (bare click opens the WikiLinkPropPanel;
    // Cmd+click navigates to the target doc via hash nav). The 2026-04-23
    // amendment must not accidentally route wiki-links through the asset
    // dispatcher. We assert via no-new-page-opened: if the dispatcher
    // fired, its web fallback would window.open() → context 'page' event.
    const targetDoc = `foo-target-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${targetDoc}.md`);
    await api.replaceDoc(targetDoc, '# Target\n');
    await api.replaceDoc(docName, `# Source\n\n[[${targetDoc}]]\n`);

    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    const chip = page.locator('[data-wiki-link]').first();
    await chip.waitFor({ state: 'visible', timeout: 5_000 });
    await chip.click();

    const openedPage = await context.waitForEvent('page', { timeout: 1_000 }).catch(() => null);
    expect(openedPage).toBeNull();
  });

  test('P9.10: hand-authored [spec](./file.pdf) click → dispatcher fires → new tab', async ({
    page,
    api,
    context,
  }) => {
    // Seed source with a hand-authored markdown link to a PDF. Post-
    // roundtrip classifyMarkdownHref returns {kind:'asset'} for this.
    await api.replaceDoc(
      docName,
      `# Markdown link test\n\nSee [the spec](./reference.pdf) for details.\n`,
    );

    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 5_000 }),
      page.click('span[data-link]'),
    ]);
    expect(newPage.url()).toContain('reference.pdf');
  });

  test('P9.11: inline image click is a no-op (regression guard — dispatcher does not fire)', async ({
    page,
  }) => {
    // Seed with a PM image node (drop a PNG).
    const TINY_PNG = Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQrkJggg==',
        'base64',
      ),
    );
    await page.evaluate(
      ({ bytes }) => {
        const editor = document.querySelector('.ProseMirror') as HTMLElement | null;
        if (!editor) throw new Error('no editor');
        const file = new File([new Uint8Array(bytes)], 'photo.png', { type: 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file);
        const rect = editor.getBoundingClientRect();
        const cx = rect.left + Math.floor(rect.width / 2);
        const cy = rect.top + Math.floor(rect.height / 2);
        editor.dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: dt,
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
          }),
        );
      },
      { bytes: TINY_PNG },
    );

    await expect
      .poll(async () => await getSourceText(page), { timeout: 5_000 })
      .toContain('photo.png');

    const img = page.locator('img').first();
    await img.waitFor({ state: 'visible', timeout: 5_000 });

    // Clicking an image should NOT open a new tab. `waitForEvent` rejects
    // on timeout; a null result confirms no new-page event fired — no
    // wall-clock `page.waitForTimeout` needed (precedent #20(a)).
    await img.click();
    const openedPage = await page
      .context()
      .waitForEvent('page', { timeout: 1_000 })
      .catch(() => null);
    expect(openedPage).toBeNull();
  });

  test('P9.15: path-escape `../..` does NOT open a new tab (renderer refuses)', async ({
    page,
    api,
    context,
  }) => {
    // Relative escape with an asset extension — classifier returns
    // `asset` kind, but `resolveAssetProjectPath` detects the `..` pop
    // past project root and returns null → handlePrimary returns false
    // → PropPanel opens instead of dispatcher. No new tab.
    await api.replaceDoc(
      docName,
      `# Escape attempt\n\n[evil](../../etc/config.pdf) should refuse.\n`,
    );
    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    await page.click('span[data-link]');
    const openedPage = await context.waitForEvent('page', { timeout: 1_000 }).catch(() => null);
    expect(openedPage).toBeNull();
  });

  // ── 2026-04-24 additions (Bug B/C + Bug A regression guards) ───────────
  //
  // The existing P9.1..P9.15 scenarios all seed docs at the content ROOT,
  // where the doc-relative `<img src>` / `<a href>` coincidentally matches
  // the server-absolute URL (everything is at `/`). Under hash routing
  // (editor URL `http://localhost:<port>/#/docs/sub/notes`), the browser
  // resolves relative URLs against `location.pathname === '/'`, not
  // against the doc's subdirectory. The bugs surface only when the doc
  // lives at a non-root path.
  //
  // These scenarios pin the user-observable behavior: subdir asset drops
  // must render (image decodes, PDF tab serves application/pdf), and
  // `.md` drops must resolve against case-preserved cache entries.

  test('P9.17: subdirectory PNG drop — rendered <img> actually loads (naturalWidth > 0)', async ({
    page,
    api,
  }) => {
    // Override the root-level docName from beforeEach — use a subdir doc.
    const subdirDoc = `docs/sub-${randomUUID().slice(0, 6)}/notes`;
    await api.createPage(`${subdirDoc}.md`);
    await api.replaceDoc(subdirDoc, '# Subdir doc\n');
    await page.goto(`/#/${subdirDoc}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');
    await page.click('.ProseMirror');

    await dropFileIntoEditor(page, TINY_PNG_BYTES, 'photo.png', 'image/png');

    // Wait for Y.Text to carry the `![[photo.png]]` ref — confirms drop
    // was consumed by the editor (no client-side crash / wrong shape).
    await expect
      .poll(async () => await getSourceText(page), { timeout: 5_000 })
      .toContain('photo.png');

    const img = page.locator('.ProseMirror img').first();
    await img.waitFor({ state: 'attached', timeout: 5_000 });

    // THE assertion: naturalWidth > 0 means the bytes loaded + decoded.
    // Pre-fix the <img src> points at root-level `/photo.png` which is
    // served by Vite's SPA fallback as text/html (not image/png) — the
    // browser fails to decode, naturalWidth stays 0. The regression
    // guard catches any future change that breaks subdir-doc image URLs.
    await expect
      .poll(
        async () => {
          return await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
        },
        { timeout: 5_000, message: 'Subdir-doc PNG drop must render (bytes decoded)' },
      )
      .toBeGreaterThan(0);
  });

  test('P9.18: subdirectory PDF drop — new tab URL serves application/pdf (not text/html SPA fallback)', async ({
    page,
    api,
    context,
  }) => {
    // Parallel scenario for non-image asset. PDF drops emit a text + link
    // mark (wikiembed post-roundtrip) or a transient <a data-wiki-embed>
    // at drop time. Clicking opens via window.open() → resolves against
    // location.origin + hash-path-is-`/` → wrong URL → SPA fallback →
    // blank tab.
    const subdirDoc = `docs/sub-${randomUUID().slice(0, 6)}/notes`;
    await api.createPage(`${subdirDoc}.md`);
    await api.replaceDoc(subdirDoc, '# Subdir doc\n');
    await page.goto(`/#/${subdirDoc}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');
    await page.click('.ProseMirror');

    await dropFileIntoEditor(page, TINY_PDF_BYTES, 'doc.pdf', 'application/pdf');

    await expect
      .poll(async () => await getSourceText(page), { timeout: 5_000 })
      .toContain('doc.pdf');

    // The chip is the transient wikiLinkEmbed `<a>` at drop time. Its
    // `target="_blank"` makes click open a new tab via window.open.
    const chip = page.locator('.ProseMirror a[data-wiki-embed]').first();
    await chip.waitFor({ state: 'visible', timeout: 5_000 });

    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 5_000 }),
      chip.click(),
    ]);
    await newPage.waitForLoadState('load').catch(() => {
      // PDF tabs don't always fire a traditional 'load' — the built-in
      // viewer runs its own pipeline. Fallback: request the URL directly
      // to verify Content-Type.
    });

    // Verify the server served the PDF, not a text/html SPA fallback. The
    // response headers are authoritative — the actual render depends on
    // Chromium's built-in PDF viewer which we can't introspect directly.
    const response = await page.request.get(newPage.url());
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type'] ?? '').toMatch(/^application\/pdf/);
  });

  test('P9.20: `.md` drop with case-preserved basename — chip resolves against existing doc', async ({
    page,
    api,
  }) => {
    // Bug A regression guard. Scenario: an existing doc `CaseSensitive`
    // (cap-C, mixed-case) is in the cache. User drops `CaseSensitive.md`.
    // Drop flow: `pickInsertShape('CaseSensitive.md')` → `wiki-link` kind;
    // `buildUnresolvedWikiLinkAttrs('CaseSensitive')` → target='casesensitive'
    // (lowercased). Pre-fix: `isResolvedWikiLinkTarget('casesensitive',
    // {CaseSensitive, ...})` returns false → chip shows as unresolved
    // (data-resolution-state="unresolved" or missing). Post-fix: case-
    // insensitive match returns true → chip resolved.
    //
    // Use a unique cap-case basename so no case-collision with pre-existing
    // docs in the fixture.
    const existingBasename = `CaseCheck${randomUUID().slice(0, 6)}`;
    await api.createPage(`${existingBasename}.md`);
    await api.replaceDoc(existingBasename, '# Target doc\n');

    // Drop an .md file whose basename matches the case-preserved existing
    // docName. beforeEach already navigated to `docName` and clicked into
    // the editor.
    await dropFileIntoEditor(
      page,
      Array.from(Buffer.from(`# ${existingBasename}\n`, 'utf-8')),
      `${existingBasename}.md`,
      'text/markdown',
    );

    // Y.Text should contain the wiki-link ref. Exact serialization is
    // `[[<lowercased-slug>|<case-preserved-alias>]]` today (target slug +
    // alias) — assert via substring so future slug-format changes don't
    // brittle-break this regression guard.
    await expect
      .poll(async () => await getSourceText(page), { timeout: 5_000 })
      .toContain(existingBasename);

    // Chip rendered with `data-link role="link"`. Resolution state is
    // exposed as `data-resolution-state` attribute on the chip (see
    // `link-resolution-decoration.ts`). Pre-fix: 'unresolved'; post-fix:
    // 'resolved'.
    const chip = page.locator('span[data-link]').first();
    await chip.waitFor({ state: 'visible', timeout: 5_000 });

    await expect
      .poll(
        async () => {
          return await chip.getAttribute('data-resolution-state');
        },
        {
          timeout: 5_000,
          message: `Chip for dropped ${existingBasename}.md must resolve against case-preserved cache entry`,
        },
      )
      .toBe('resolved');
  });
});
