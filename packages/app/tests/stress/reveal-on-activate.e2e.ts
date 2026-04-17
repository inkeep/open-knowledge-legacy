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
// Targets the chevron (SidebarMenuAction) whose aria-label is
// "Expand sidebar-folder" or "Collapse sidebar-folder" — NOT the
// folder-row button whose accessible name is the plain "sidebar-folder".
// Regex anchors disambiguate under strict-mode locator matching.
const folderButton = (page: Page) =>
  page.getByRole('button', { name: /^(Expand|Collapse) sidebar-folder$/ });

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

test('active-doc ancestor stays expanded despite chevron clicks (Model A ancestor priority)', async ({
  page,
}) => {
  // Contract (US-011): ancestors of the active doc are UNCONDITIONALLY
  // expanded. Clicking the collapse chevron on an active-doc-ancestor is a
  // no-op for the derived expansion state — userCollapsed is set but the
  // derivation (`ancestors ∪ (userExpanded \ userCollapsed)`) re-adds the
  // ancestor. This matches VS Code / Finder: active file's context is
  // always visible. See SPEC.md §10 D-Q?? for rationale + US-011 implementation.
  await page.goto(`${BASE}/#/sidebar-folder/nested-doc`);
  await sidebar(page).getByText('nested-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');

  // Click the chevron. Under Model A ancestor priority, the folder stays
  // expanded because it's the active doc's ancestor.
  await folderButton(page).click();
  // Yield a few frames so any state flip would have committed.
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
  // Folder remains expanded; nested-doc.md still visible in sidebar.
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
  // Under Model A ancestor priority, user-collapse is only honored for
  // non-ancestor folders. This test verifies: user collapses folder while
  // it's NOT an active-doc ancestor, then navigates INTO the folder —
  // activation wins, folder expands automatically.
  await page.goto(`${BASE}/#/test-doc`);
  await sidebar(page).getByText('test-doc.md').waitFor({ state: 'visible', timeout: 15_000 });

  // While test-doc is active (sidebar-folder is NOT an ancestor), expand
  // then collapse it — this is a non-ancestor manual collapse, which IS
  // honored.
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'false');
  await folderButton(page).click(); // expand
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'true');
  await folderButton(page).click(); // collapse (honored — non-ancestor)
  await expect(folderButton(page)).toHaveAttribute('aria-expanded', 'false');

  // Now navigate INTO sidebar-folder. It becomes an ancestor — should
  // auto-expand via ancestor priority, overriding the userCollapsed entry.
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
