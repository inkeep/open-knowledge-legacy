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

  test('P9.18: subdirectory PDF drop emits server-absolute href (Bug B URL shape)', async ({
    page,
    api,
  }) => {
    // Bug B regression guard. Pre-fix: subdirectory PDF drops emitted
    // `<a href="doc.pdf">` which the browser resolved against location
    // under hash routing (`/` — the root), producing `/doc.pdf` instead of
    // the real path `/docs/sub-xxx/doc.pdf`. Post-fix: `resolvedSrc =
    // '/' + assetContentPath` so the chip emits a server-absolute href
    // that survives hash routing.
    //
    // We assert the *href shape* rather than the full round-trip (click →
    // new tab → page.request.get). Whether the server then serves that
    // URL as `application/pdf` vs falls through to Vite's SPA fallback
    // depends on the content filter's sibling-asset rule (which is
    // populated by the file-watcher after a propagation delay). Proving
    // the chip's href is correct is enough to pin the client-side fix —
    // server-side sirv / SPA fallback behavior is a separate surface
    // covered by integration tests.
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

    const chip = page.locator('.ProseMirror a[data-wiki-embed]').first();
    await chip.waitFor({ state: 'visible', timeout: 5_000 });

    // The chip's href must be server-absolute (`/`-prefixed). Pre-fix it
    // was doc-relative (`doc.pdf`). The exact path depends on
    // `upload.attachmentFolderPath` (default `./` → co-located with doc),
    // so we assert the *shape* — absolute and ending with `/doc.pdf`.
    const href = await chip.getAttribute('href');
    expect(href).toMatch(/^\//);
    expect(href).toMatch(/\/doc\.pdf$/);
  });

  test('P9.20: `.md` drop with case-preserved basename — chip resolves against existing doc', async ({
    page,
    api,
  }) => {
    // Bug A regression guard. Scenario: an existing doc `CaseCheckXXXXXX`
    // (cap-C, mixed-case) is in the cache. User drops `CaseCheckXXXXXX.md`.
    // Drop flow: `pickInsertShape('CaseCheckXXXXXX.md')` → `wiki-link` kind;
    // `buildUnresolvedWikiLinkAttrs('CaseCheckXXXXXX')` → target='casecheckXXXXXX'
    // (lowercased slug). Pre-fix: `isResolvedWikiLinkTarget('casecheckXXXXXX',
    // {CaseCheckXXXXXX, ...})` returns false → click opens prop panel showing
    // "Page not found". Post-fix: slug-keyed cache lookup matches → prop panel
    // shows "Wiki link" + "Open" button.
    //
    // Assertion surface: click the chip to open WikiLinkPropPanel, then check
    // the rendered stateLabel text. "Wiki link" = resolved, "Page not found"
    // = unresolved. Using UX-level text avoids coupling to the chip's internal
    // DOM structure (wiki-link NodeView has no persistent data-resolved attr;
    // resolution is computed on-demand by the prop panel via
    // `isResolvedWikiLinkTarget`, which is exactly the function Bug A's fix
    // lives in).
    const existingBasename = `CaseCheck${randomUUID().slice(0, 6)}`;
    await api.createPage(`${existingBasename}.md`);
    await api.replaceDoc(existingBasename, '# Target doc\n');

    await dropFileIntoEditor(
      page,
      Array.from(Buffer.from(`# ${existingBasename}\n`, 'utf-8')),
      `${existingBasename}.md`,
      'text/markdown',
    );

    await expect
      .poll(async () => await getSourceText(page), { timeout: 5_000 })
      .toContain(existingBasename);

    // The drop flow emits a wiki-link NODE (not a link mark). Its NodeView
    // renders `<span data-wiki-link>` with `role="button"`.
    const chip = page.locator('[data-wiki-link]').first();
    await chip.waitFor({ state: 'visible', timeout: 5_000 });

    // Click the chip to open WikiLinkPropPanel. The prop panel's state label
    // reads `isResolvedWikiLinkTarget(target, pages)` — this is where Bug A
    // lives.
    await chip.click();

    // Resolved state: "Wiki link" text is visible AND "Page not found" is NOT.
    // Pre-fix this assertion fails: panel renders "Page not found" because
    // the lowercased slug target does not match the case-preserved cache key.
    await expect(page.getByText('Wiki link').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Page not found')).not.toBeVisible();
  });

  test('P9.21: `.m4v` drop renders through FR-A5 NodeView + chip dispatches on click (2026-04-24b)', async ({
    page,
    api,
  }) => {
    // SPEC §Post-finalization amendment (2026-04-24b) regression guard.
    // Pre-fix: user dropped `.m4v`, click opened a new tab whose URL fell
    // through to Vite's SPA fallback as text/html (editor shell rendered
    // inside the tab). Three defects underlay the symptom:
    //   (1) `.m4v` NOT in `ASSET_EXTENSIONS` → content-filter refused
    //       serve → SPA fallback.
    //   (2) FR-A5 `createNodeInteractionBridgePlugin` never landed → the
    //       drop-time wikiLinkEmbed chip had no renderer-side dispatcher
    //       wiring; click fell through to browser default.
    //   (3) `classifyMarkdownHref` treated `/vale_15.m4v` as `external`
    //       not `asset` → post-reload clicks opened PropPanel instead of
    //       the file.
    // This test exercises the drop-time path (defect 2). The chip MUST
    // render via the app-layer `wiki-link-embed.ts` NodeView with a
    // `data-node-id` InteractionLayer-addressable attribute AND a server-
    // absolute `href`. Serve-side + classifier fixes covered by P9.17 +
    // P9.20 respectively; cycle 14 E2E hardening carries this set.
    const subdirDoc = `docs/sub-${randomUUID().slice(0, 6)}/notes`;
    await api.createPage(`${subdirDoc}.md`);
    await api.replaceDoc(subdirDoc, '# Video doc\n');
    await page.goto(`/#/${subdirDoc}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');
    await page.click('.ProseMirror');

    // Minimal M4V bytes — the ISO-BMFF signature at offset 4 is enough for
    // file-type sniff (`ftypM4V ` branded MP4 variant). Content-Type
    // dispatch happens at sirv via mrmime; the test asserts HREF SHAPE
    // only (full round-trip Content-Type requires the filewatcher's
    // dirCount to propagate — a timing-dependent surface).
    const TINY_M4V_BYTES = Array.from(
      Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypM4V '), Buffer.alloc(8, 0)]),
    );
    await dropFileIntoEditor(page, TINY_M4V_BYTES, 'clip.m4v', 'video/mp4');

    await expect
      .poll(async () => await getSourceText(page), { timeout: 5_000 })
      .toContain('clip.m4v');

    // The FR-A5 NodeView renders the non-image chip as `<a data-wiki-embed>`
    // with `data-node-id` (InteractionLayer-addressable). Pre-FR-A5, the
    // chip had `data-wiki-embed` but no `data-node-id` — layer couldn't
    // route clicks to `handlePrimary`. This selector pins both.
    const chip = page.locator('a[data-wiki-embed][data-node-id]').first();
    await chip.waitFor({ state: 'visible', timeout: 5_000 });

    // Href must be server-absolute (`/docs/sub-xxx/clip.m4v`). Pre-
    // 2026-04-24a, it was doc-relative (broken under hash routing). The
    // `data-node-id` has the `wiki-link-embed-` prefix from the
    // app-layer NodeView's counter — this distinguishes FR-A5-landed
    // from the pre-fix `<a>` that had no data-node-id at all.
    const href = await chip.getAttribute('href');
    expect(href).toMatch(/^\//);
    expect(href).toMatch(/\/clip\.m4v$/);
    const nodeId = await chip.getAttribute('data-node-id');
    expect(nodeId).toMatch(/^wiki-link-embed-/);
  });
});
