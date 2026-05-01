import type { Page } from '@playwright/test';
import { expect, test } from './_helpers';

const sidebar = (page: Page) => page.locator('[data-slot="sidebar-container"]');
const folderButton = (page: Page) =>
  page.getByRole('button', { name: /^(Expand|Collapse) sidebar-folder$/ });

test('direct URL load reveals nested doc on first paint', async ({ page }) => {
  await page.goto(`/#/sidebar-folder/nested-doc`);
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');

  const activeRow = sidebar(page).locator('[aria-current="page"]');
  await expect(activeRow).toHaveCount(1);
  await expect(activeRow).toContainText('nested-doc.md');
});

test('hash navigation reveals nested doc (simulates graph/wikilink click)', async ({ page }) => {
  await page.goto('/');
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

test('active-doc ancestor stays expanded despite chevron clicks (Model A ancestor priority)', async ({
  page,
}) => {
  await page.goto(`/#/sidebar-folder/nested-doc`);
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');

  await folderButton(page).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 5;
        const tick = () => {
          if (--frames <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar(page).getByText('nested-doc.md')).toBeVisible();
});

declare global {
  interface Window {
    __ariaFlippedToTrue?: boolean;
    __ariaObsCleanup?: () => void;
  }
}

test('activation auto-expands prior-collapsed non-ancestor folder (D1)', async ({ page }) => {
  await page.goto(`/#/test-doc`);
  await sidebar(page).getByText('test-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'false');
  await folderButton(page).click(); // expand
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');
  await folderButton(page).click(); // collapse (honored — non-ancestor)
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => {
    window.location.hash = '#/sidebar-folder/nested-doc';
  });
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 10_000 });
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');
});

test('user-expanded non-ancestor folder persists across navigation (D4)', async ({ page }) => {
  await page.goto(`/#/test-doc`);
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
  await page.goto(`/#/sidebar-folder/nested-doc`);
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
  await page.goto(`/#/test-doc`);
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
