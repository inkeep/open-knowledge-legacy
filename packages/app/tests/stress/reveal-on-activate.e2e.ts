import type { Page } from '@playwright/test';
import { expect, test } from './_helpers';

test.beforeEach(async ({ api }) => {
  await api.createPage('test-doc.md');
  await api.createPage('sidebar-folder/nested-doc.md');
});

const sidebar = (page: Page) => page.locator('[data-slot="sidebar-container"]');
const fileRow = (page: Page, fileName: string) =>
  sidebar(page).getByRole('treeitem', { name: fileName, exact: true });
const folderRow = (page: Page) =>
  sidebar(page).getByRole('treeitem', { name: 'sidebar-folder', exact: true });
const selectedRow = (page: Page) => sidebar(page).locator('[aria-selected="true"]');

async function expandFolder(page: Page) {
  await folderRow(page).focus();
  await folderRow(page).press('ArrowRight');
}

async function collapseFolder(page: Page) {
  await folderRow(page).focus();
  await folderRow(page).press('ArrowLeft');
}

test('direct URL load reveals nested doc on first paint', async ({ page }) => {
  await page.goto(`/#/sidebar-folder/nested-doc`);
  await fileRow(page, 'nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'true');

  await expect(selectedRow(page)).toHaveCount(1);
  await expect(selectedRow(page)).toHaveAttribute('aria-label', 'nested-doc.md');
});

test('hash navigation reveals nested doc (simulates graph/wikilink click)', async ({ page }) => {
  await page.goto('/');
  await fileRow(page, 'test-doc.md').click({ timeout: 10_000 });

  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => {
    window.location.hash = '#/sidebar-folder/nested-doc';
  });

  await fileRow(page, 'nested-doc.md').waitFor({ state: 'visible', timeout: 10_000 });
  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'true');

  await expect(selectedRow(page)).toHaveCount(1);
  await expect(selectedRow(page)).toHaveAttribute('aria-label', 'nested-doc.md');
});

test('active-doc ancestor stays expanded despite chevron clicks (Model A ancestor priority)', async ({
  page,
}) => {
  await page.goto(`/#/sidebar-folder/nested-doc`);
  await fileRow(page, 'nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'true');

  await collapseFolder(page);
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
  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(fileRow(page, 'nested-doc.md')).toBeVisible();
});

declare global {
  interface Window {
    __ariaFlippedToTrue?: boolean;
    __ariaObsCleanup?: () => void;
  }
}

test('activation auto-expands prior-collapsed non-ancestor folder (D1)', async ({ page }) => {
  await page.goto(`/#/test-doc`);
  await fileRow(page, 'test-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'false');
  await expandFolder(page);
  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'true');
  await collapseFolder(page);
  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => {
    window.location.hash = '#/sidebar-folder/nested-doc';
  });
  await fileRow(page, 'nested-doc.md').waitFor({ state: 'visible', timeout: 10_000 });
  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'true');
});

test('user-expanded non-ancestor folder persists across navigation (D4)', async ({ page }) => {
  await page.goto(`/#/test-doc`);
  await fileRow(page, 'test-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'false');
  await expandFolder(page);
  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'true');

  await page.evaluate(() => {
    window.location.hash = '#/sidebar-folder/nested-doc';
  });
  await fileRow(page, 'nested-doc.md').waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => {
    window.location.hash = '#/test-doc';
  });
  await fileRow(page, 'test-doc.md').waitFor({ state: 'visible', timeout: 10_000 });

  await expect(folderRow(page)).toHaveAttribute('aria-expanded', 'true');
});

test('exactly one selected row, matching activeDocName (D9)', async ({ page }) => {
  await page.goto(`/#/sidebar-folder/nested-doc`);
  await fileRow(page, 'nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(selectedRow(page)).toHaveCount(1);
  await expect(selectedRow(page)).toHaveAttribute('aria-label', 'nested-doc.md');

  await page.evaluate(() => {
    window.location.hash = '#/test-doc';
  });
  await fileRow(page, 'test-doc.md').waitFor({ state: 'visible', timeout: 10_000 });

  await expect(selectedRow(page)).toHaveCount(1);
  await expect(selectedRow(page)).toHaveAttribute('aria-label', 'test-doc.md');
});

test('activation does not steal focus from the editor', async ({ page }) => {
  await page.goto(`/#/test-doc`);
  await fileRow(page, 'test-doc.md').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForSelector('.ProseMirror', { timeout: 15_000 });

  await page.locator('.ProseMirror').focus();
  const editorFocused = await page.evaluate(() =>
    document.activeElement?.classList.contains('ProseMirror'),
  );
  expect(editorFocused).toBe(true);

  await page.evaluate(() => {
    window.location.hash = '#/sidebar-folder/nested-doc';
  });
  await fileRow(page, 'nested-doc.md').waitFor({ state: 'visible', timeout: 10_000 });

  const focusInSidebar = await page.evaluate(() => {
    const active = document.activeElement;
    return !!active?.closest('[data-slot="sidebar-container"]');
  });
  expect(focusInSidebar).toBe(false);
});
