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
 *   - Resize carries the desktop open state DOWN, but a closed desktop
 *     stays closed at small width (no spurious open).
 *   - ESC defers to any open Radix dismissable layer (Dialog, DropdownMenu)
 *     instead of closing the sidebar — the sidebar's ESC handler is the
 *     last one to fire.
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
  // Tailwind v4's translate utilities set the modern `translate:` CSS property
  // (not the legacy combined `transform:`). Inspect both — `translate:` first,
  // and fall back to parsing the matrix in `transform:` for code that mixes
  // both. Returning 0 means no horizontal translate is in effect.
  const styles = await page.locator('[data-slot="sidebar-inset"]').evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return { translate: cs.translate, transform: cs.transform };
  });
  if (styles.translate && styles.translate !== 'none') {
    const tx = Number.parseFloat(styles.translate.split(/\s+/)[0] ?? '');
    if (!Number.isNaN(tx) && tx !== 0) return tx;
  }
  if (styles.transform && styles.transform !== 'none') {
    const match = styles.transform.match(/matrix\(([^)]+)\)/);
    const parts = match?.[1]?.split(',').map((p) => Number.parseFloat(p.trim())) ?? [];
    return parts[4] ?? 0;
  }
  return 0;
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

    // Install a probe so the assertion proves the inset's own click handler
    // fired — not some other side-effect path that would also flip
    // openMobile to false. The probe wrapper uses capture phase so it sees
    // the event regardless of stopPropagation in the React handler.
    await page.evaluate(() => {
      const el = document.querySelector('[data-slot="sidebar-inset"]');
      if (!el) throw new Error('inset not found');
      (window as unknown as { __insetClicked?: boolean }).__insetClicked = false;
      el.addEventListener(
        'click',
        () => {
          (window as unknown as { __insetClicked?: boolean }).__insetClicked = true;
        },
        { capture: true, once: true },
      );
    });

    // Click on the editor area (inside the inset, but not the trigger).
    await page.locator('.ProseMirror').first().click({ force: true });
    await expect.poll(() => isSidebarOpen(page)).toBe(false);

    const insetClicked = await page.evaluate(
      () => (window as unknown as { __insetClicked?: boolean }).__insetClicked,
    );
    expect(insetClicked).toBe(true);
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

  test('ESC defers to an open Radix DropdownMenu instead of closing sidebar', async ({
    page,
    api,
  }) => {
    await api.seedDocs([{ name: 'i', markdown: '# Doc I\n\nBody.' }]);
    await page.setViewportSize(SMALL_VIEWPORT);
    await page.goto('/#/i');

    // Open the sidebar.
    await page.locator('[data-sidebar="trigger"]').click();
    await expect.poll(() => isSidebarOpen(page)).toBe(true);

    // The "Tree view options" button in FileSidebar is a Radix DropdownMenu
    // trigger (role="menu" content). Open it.
    await page.getByRole('button', { name: 'Tree view options' }).click();
    await expect(page.locator('[role="menu"][data-state="open"]')).toBeVisible();

    // Press Escape — the DropdownMenu's DismissableLayer should consume it
    // first; the sidebar's ESC handler must defer.
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="menu"][data-state="open"]')).toBeHidden();
    expect(await isSidebarOpen(page)).toBe(true);

    // Press Escape again — now no layer is open, so the sidebar closes.
    await page.keyboard.press('Escape');
    await expect.poll(() => isSidebarOpen(page)).toBe(false);
  });

  test('resize from desktop (closed) to small width keeps sidebar closed', async ({
    page,
    api,
  }) => {
    await api.seedDocs([{ name: 'j', markdown: '# Doc J\n\nBody.' }]);
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/#/j');

    // Close the desktop sidebar.
    await expect.poll(() => isSidebarOpen(page)).toBe(true);
    await page.locator('[data-sidebar="trigger"]').click();
    await expect.poll(() => isSidebarOpen(page)).toBe(false);

    // Resize down — closed state must carry. No spurious open at small width.
    await page.setViewportSize(SMALL_VIEWPORT);
    await expect.poll(() => isSidebarOpen(page)).toBe(false);
    expect(await getInsetTranslateX(page)).toBe(0);
  });

  test('SidebarTrigger exposes aria-expanded reflecting the active sidebar state', async ({
    page,
    api,
  }) => {
    await api.seedDocs([{ name: 'k', markdown: '# Doc K\n\nBody.' }]);
    await page.setViewportSize(SMALL_VIEWPORT);
    await page.goto('/#/k');

    const trigger = page.locator('[data-sidebar="trigger"]');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
