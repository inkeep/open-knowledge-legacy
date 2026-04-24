/**
 * Sidebar push-mode UX at viewport widths < 1280px.
 *
 * Verifies:
 *   - Opening the sidebar at small width does NOT render a Sheet overlay
 *     (no `[data-slot="sheet-overlay"]` exists; backdrop-filter on the
 *     document area is none).
 *   - SidebarInset translates right by the sidebar width when openMobile
 *     is true; returns to translateX(0) when closed.
 *   - ESC, click on the visible inset, and Cmd/Ctrl-\ all dismiss the
 *     sidebar at small width.
 *   - Clicking the SidebarTrigger button does NOT double-fire the inset's
 *     click handler.
 *   - Resize from desktop (open) to small-width carries the open state
 *     across (push-mode visible at the new width).
 *   - Desktop behavior (>= 1280px) is unchanged: no translateX transform
 *     on the inset.
 *
 * Per CLAUDE.md STOP rule: each test creates its own unique doc — no
 * hardcoded `'test-doc'` — to avoid cross-worker CRDT corruption.
 */

import type { Page } from '@playwright/test';
import { expect, test } from './_helpers';

const SMALL_VIEWPORT = { width: 1024, height: 800 } as const;
const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
const SIDEBAR_WIDTH_PX = 288; // 18rem at 16px root font

async function getInsetTranslateX(page: Page): Promise<number> {
  const transform = await page
    .locator('[data-slot="sidebar-inset"]')
    .evaluate((el) => window.getComputedStyle(el).transform);
  if (!transform || transform === 'none') return 0;
  const match = transform.match(/matrix\(([^)]+)\)/);
  if (!match) return 0;
  const parts = match[1]?.split(',').map((p) => Number.parseFloat(p.trim())) ?? [];
  // matrix(a, b, c, d, tx, ty) — translateX is the 5th value
  return parts[4] ?? 0;
}

async function isSidebarOpen(page: Page): Promise<boolean> {
  const dataState = await page.locator('[data-slot="sidebar"]').first().getAttribute('data-state');
  return dataState === 'expanded';
}

test.describe('sidebar push-mode (small width)', () => {
  test('opening sidebar at < 1280px does NOT render a Sheet overlay', async ({ page, api }) => {
    await api.seedDocs([{ name: 'a', markdown: '# Doc A\n\nBody content.' }]);
    await page.setViewportSize(SMALL_VIEWPORT);
    await page.goto('/#/a');

    // Open via the trigger.
    await page.locator('[data-sidebar="trigger"]').click();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-slot="sidebar"]');
      return el?.getAttribute('data-state') === 'expanded';
    });

    // No Sheet overlay element should exist anywhere in the DOM.
    expect(await page.locator('[data-slot="sheet-overlay"]').count()).toBe(0);

    // Document area must have no backdrop-filter applied.
    const backdropFilter = await page
      .locator('[data-slot="sidebar-inset"]')
      .evaluate((el) => window.getComputedStyle(el).backdropFilter);
    expect(backdropFilter === 'none' || backdropFilter === '').toBeTruthy();
  });

  test('SidebarInset translates right by --sidebar-width when sidebar opens at small width', async ({
    page,
    api,
  }) => {
    await api.seedDocs([{ name: 'b', markdown: '# Doc B\n\nBody.' }]);
    await page.setViewportSize(SMALL_VIEWPORT);
    await page.goto('/#/b');

    // Closed → no translate.
    expect(await getInsetTranslateX(page)).toBe(0);

    // Open via trigger → translateX = sidebar width.
    await page.locator('[data-sidebar="trigger"]').click();
    await expect
      .poll(() => getInsetTranslateX(page), { timeout: 1500 })
      .toBeGreaterThan(SIDEBAR_WIDTH_PX - 1);
  });

  test('ESC dismisses small-width sidebar', async ({ page, api }) => {
    await api.seedDocs([{ name: 'c', markdown: '# Doc C\n\nBody.' }]);
    await page.setViewportSize(SMALL_VIEWPORT);
    await page.goto('/#/c');

    await page.locator('[data-sidebar="trigger"]').click();
    await expect.poll(() => isSidebarOpen(page)).toBe(true);

    await page.keyboard.press('Escape');
    await expect.poll(() => isSidebarOpen(page)).toBe(false);
    await expect.poll(() => getInsetTranslateX(page), { timeout: 1500 }).toBe(0);
  });

  test('clicking the visible inset dismisses small-width sidebar', async ({ page, api }) => {
    await api.seedDocs([{ name: 'd', markdown: '# Doc D\n\nBody.' }]);
    await page.setViewportSize(SMALL_VIEWPORT);
    await page.goto('/#/d');

    await page.locator('[data-sidebar="trigger"]').click();
    await expect.poll(() => isSidebarOpen(page)).toBe(true);

    // Click on the editor area (inside the inset, but not the trigger).
    // Use force:true because the click target may be partially translated
    // off-screen at small viewport widths — the click event is what matters.
    await page.locator('.ProseMirror').first().click({ force: true });
    await expect.poll(() => isSidebarOpen(page)).toBe(false);
  });

  test('clicking the SidebarTrigger does not double-fire dismiss', async ({ page, api }) => {
    await api.seedDocs([{ name: 'e', markdown: '# Doc E\n\nBody.' }]);
    await page.setViewportSize(SMALL_VIEWPORT);
    await page.goto('/#/e');

    // Closed state — clicking trigger should OPEN, not stay closed (would
    // happen if the inset's click handler fired in addition to the trigger's).
    expect(await isSidebarOpen(page)).toBe(false);
    await page.locator('[data-sidebar="trigger"]').click();
    await expect.poll(() => isSidebarOpen(page)).toBe(true);
  });

  test('desktop viewport >= 1280px keeps SidebarInset un-translated', async ({ page, api }) => {
    await api.seedDocs([{ name: 'f', markdown: '# Doc F\n\nBody.' }]);
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/#/f');

    // Sidebar is open by default at desktop.
    await expect.poll(() => isSidebarOpen(page)).toBe(true);
    expect(await getInsetTranslateX(page)).toBe(0);

    // Toggle closed.
    await page.locator('[data-sidebar="trigger"]').click();
    await expect.poll(() => isSidebarOpen(page)).toBe(false);
    expect(await getInsetTranslateX(page)).toBe(0);
  });

  test('resize from desktop (open) to small width preserves open state', async ({ page, api }) => {
    await api.seedDocs([{ name: 'g', markdown: '# Doc G\n\nBody.' }]);
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/#/g');

    // Desktop sidebar starts open by default.
    await expect.poll(() => isSidebarOpen(page)).toBe(true);

    // Resize down → should remain open in push-mode (translate appears).
    await page.setViewportSize(SMALL_VIEWPORT);
    await expect.poll(() => isSidebarOpen(page)).toBe(true);
    await expect
      .poll(() => getInsetTranslateX(page), { timeout: 1500 })
      .toBeGreaterThan(SIDEBAR_WIDTH_PX - 1);
  });

  test('Cmd/Ctrl + \\ keyboard shortcut toggles at small width', async ({ page, api }) => {
    await api.seedDocs([{ name: 'h', markdown: '# Doc H\n\nBody.' }]);
    await page.setViewportSize(SMALL_VIEWPORT);
    await page.goto('/#/h');

    expect(await isSidebarOpen(page)).toBe(false);

    // Mac uses meta, others use control. Playwright's 'ControlOrMeta' is the
    // platform-aware modifier.
    await page.keyboard.press('ControlOrMeta+\\');
    await expect.poll(() => isSidebarOpen(page)).toBe(true);

    await page.keyboard.press('ControlOrMeta+\\');
    await expect.poll(() => isSidebarOpen(page)).toBe(false);
  });
});
