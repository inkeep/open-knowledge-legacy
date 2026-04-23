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
});
