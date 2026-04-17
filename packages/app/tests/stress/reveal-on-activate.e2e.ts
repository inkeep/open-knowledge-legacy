// These tests assert sidebar UI state only — they never write content. They
// read-only against the pre-seeded fixtures (`test-doc.md`, `sidebar-folder/
// nested-doc.md`) from playwright.config.ts, which is why this file has no
// beforeEach reset. Do not re-introduce a blanket /api/test-reset — it
// interferes with parallel tests in other files (see spec §6 AC6). If a future
// test here needs to assert doc *content*, migrate that specific test to the
// per-test unique-docName pattern instead.
import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

const sidebar = (page: Page) => page.locator('[data-slot="sidebar-container"]');
const folderButton = (page: Page) => page.getByRole('button', { name: 'sidebar-folder' });

test('direct URL load reveals nested doc on first paint', async ({ page }) => {
  await page.goto(`${BASE}/#/sidebar-folder/nested-doc`);
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');

  const activeRow = sidebar(page).locator('[aria-current="page"]');
  await expect(activeRow).toHaveCount(1);
  await expect(activeRow).toContainText('nested-doc.md');
});

test('hash navigation reveals nested doc (simulates graph/wikilink click)', async ({ page }) => {
  await page.goto(BASE);
  await page.getByText('test-doc.md').click({ timeout: 10_000 });

  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => {
    window.location.hash = '#/sidebar-folder/nested-doc';
  });

  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 10_000 });
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');

  const activeRow = sidebar(page).locator('[aria-current="page"]');
  await expect(activeRow).toHaveCount(1);
  await expect(activeRow).toContainText('nested-doc.md');
});

test('manual collapse is honored until next activation', async ({ page }) => {
  await page.goto(`${BASE}/#/sidebar-folder/nested-doc`);
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');

  await folderButton(page).click();
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar(page).getByText('nested-doc.md')).toHaveCount(0);

  // Stability assertion: install a MutationObserver to catch any flip back
  // to 'true', yield several frames, then assert no auto-restoration race
  // fired. Replaces a fixed-sleep "wait 1s then re-check" pattern with a
  // signal-based check that catches even sub-frame flips.
  await page.evaluate(() => {
    window.__ariaFlippedToTrue = false;
    const btn = document.querySelector('button[aria-label="sidebar-folder"]');
    if (!btn) return;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (
          m.attributeName === 'aria-expanded' &&
          (m.target as Element).getAttribute('aria-expanded') === 'true'
        ) {
          window.__ariaFlippedToTrue = true;
        }
      }
    });
    obs.observe(btn, { attributes: true, attributeFilter: ['aria-expanded'] });
    window.__ariaObsCleanup = () => obs.disconnect();
  });
  // Yield ~10 frames (~160ms at 60fps) — long enough for any
  // commit-phase render-time race to fire.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 10;
        const tick = () => {
          if (--frames <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const flipped = await page.evaluate(() => {
    window.__ariaObsCleanup?.();
    return window.__ariaFlippedToTrue;
  });
  expect(flipped).toBe(false);
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'false');
});

declare global {
  interface Window {
    __ariaFlippedToTrue?: boolean;
    __ariaObsCleanup?: () => void;
  }
}

test('activation overrides prior manual collapse (D1)', async ({ page }) => {
  await page.goto(`${BASE}/#/sidebar-folder/nested-doc`);
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await folderButton(page).click();
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => {
    window.location.hash = '#/test-doc';
  });
  // Wait for the first nav to settle (active row updates) before issuing
  // the second nav — confirms the test exercises the override sequence
  // rather than coalescing both navs into a single transition.
  await expect(sidebar(page).locator('[aria-current="page"]')).toContainText('test-doc.md');

  await page.evaluate(() => {
    window.location.hash = '#/sidebar-folder/nested-doc';
  });

  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 10_000 });
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');
});

test('user-expanded non-ancestor folder persists across navigation (D4)', async ({ page }) => {
  await page.goto(`${BASE}/#/test-doc`);
  await sidebar(page).getByText('test-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'false');
  await folderButton(page).click();
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');

  await page.evaluate(() => {
    window.location.hash = '#/sidebar-folder/nested-doc';
  });
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => {
    window.location.hash = '#/test-doc';
  });
  await sidebar(page).getByText('test-doc.md').waitFor({ state: 'visible', timeout: 10_000 });

  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');
});

test('exactly one aria-current="page" row, matching activeDocName (D9)', async ({ page }) => {
  await page.goto(`${BASE}/#/sidebar-folder/nested-doc`);
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  const current = sidebar(page).locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText('nested-doc.md');

  await page.evaluate(() => {
    window.location.hash = '#/test-doc';
  });
  await sidebar(page).getByText('test-doc.md').waitFor({ state: 'visible', timeout: 10_000 });

  await expect(current).toHaveCount(1);
  await expect(current).toContainText('test-doc.md');
});

test('activation does not steal focus from the editor', async ({ page }) => {
  await page.goto(`${BASE}/#/test-doc`);
  await sidebar(page).getByText('test-doc.md').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForSelector('.ProseMirror', { timeout: 15_000 });

  await page.locator('.ProseMirror').focus();
  const editorFocused = await page.evaluate(() =>
    document.activeElement?.classList.contains('ProseMirror'),
  );
  expect(editorFocused).toBe(true);

  await page.evaluate(() => {
    window.location.hash = '#/sidebar-folder/nested-doc';
  });
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 10_000 });

  const focusInSidebar = await page.evaluate(() => {
    const active = document.activeElement;
    return !!active?.closest('[data-slot="sidebar-container"]');
  });
  expect(focusInSidebar).toBe(false);
});
