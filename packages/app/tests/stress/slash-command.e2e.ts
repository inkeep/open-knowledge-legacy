/**
 * Slash command — Playwright E2E regression suite.
 *
 * Codifies SPEC §7 R01-R17 regression scenarios + extensibility-rendering and
 * Floating UI positioning checks. These exercise the real running editor end
 * to end, providing the runtime safety net that the
 * `tests/integration/slash-command-extension.test.ts` Bun integration tests
 * (which test option resolution headlessly) cannot.
 *
 * Each scenario uses /api/test-reset between runs to guarantee a clean editor
 * — the dev server persists CRDT state across reloads otherwise, which would
 * leak content between scenarios and produce false failures.
 *
 * Requires: Playwright browsers installed. Dev server started by
 * `playwright.config.ts` `webServer` on VITE_PORT (or default 5173).
 */

import { expect, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = process.env.STRESS_BASE_URL ?? `http://localhost:${port}`;

async function resetEditor(page: import('@playwright/test').Page) {
  const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.ProseMirror');
  await page.click('.ProseMirror');
  await page.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent === '', {
    timeout: 5_000,
  });
}

async function getEditorState(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return {
      text: pm?.textContent ?? '',
      h1Count: pm?.querySelectorAll('h1').length ?? 0,
      h2Count: pm?.querySelectorAll('h2').length ?? 0,
      h3Count: pm?.querySelectorAll('h3').length ?? 0,
      ulCount: pm?.querySelectorAll('ul').length ?? 0,
      olCount: pm?.querySelectorAll('ol').length ?? 0,
      blockquoteCount: pm?.querySelectorAll('blockquote').length ?? 0,
      tableCount: pm?.querySelectorAll('table').length ?? 0,
    };
  });
}

async function getMenuState(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const menu = document.querySelector('[role="listbox"][aria-label="Slash commands"]');
    if (!menu) return { open: false } as const;
    const items = Array.from(menu.querySelectorAll('[role="option"]'));
    const legends = Array.from(menu.querySelectorAll('legend')).map(
      (l) => l.textContent?.trim() ?? '',
    );
    return {
      open: true,
      itemCount: items.length,
      legends,
      items: items.map((i) => ({
        text: i.textContent?.trim() ?? '',
        ariaSelected: i.getAttribute('aria-selected'),
        dataSelected: i.getAttribute('data-selected'),
      })),
    } as const;
  });
}

/** Walks up from the menu element to find the body-attached fixed-position popup div. */
async function getPopupInfo(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const menu = document.querySelector('[role="listbox"][aria-label="Slash commands"]');
    if (!menu) return null;
    let el: HTMLElement | null = menu as HTMLElement;
    while (el && el !== document.body) {
      if (window.getComputedStyle(el).position === 'fixed') {
        return {
          left: el.style.left,
          top: el.style.top,
          cssVar: el.style.getPropertyValue('--suggestion-menu-max-height'),
          rawStyle: el.getAttribute('style') ?? '',
          rect: el.getBoundingClientRect().toJSON(),
        };
      }
      el = el.parentElement;
    }
    return { error: 'no fixed popup ancestor found' as const };
  });
}

async function getCursorRect(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    if (!pm) return null;
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let lastText: Text | null = null;
    let node = walker.nextNode();
    while (node) {
      if (node.textContent && node.textContent.length > 0) {
        lastText = node as Text;
      }
      node = walker.nextNode();
    }
    if (!lastText?.textContent) return null;
    const len = lastText.textContent.length;
    const range = document.createRange();
    range.setStart(lastText, len - 1);
    range.setEnd(lastText, len);
    return range.getBoundingClientRect().toJSON();
  });
}

test.describe('Slash command — regression suite (R01-R17)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => {
      throw new Error(`Uncaught page error: ${e.message}`);
    });
    await page.goto(BASE);
    await page.waitForSelector('.ProseMirror');
  });

  test('R01: slash at start of empty paragraph opens menu with all 10 items', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    expect(m.itemCount).toBe(10);
    expect(m.legends).toEqual(['Basic blocks', 'Insert']);
    expect(m.items[0]?.ariaSelected).toBe('true');
    expect(m.items[0]?.dataSelected).toBe('true');
  });

  test('R02: /heading filters to heading items only', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/heading');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    expect(m.itemCount).toBe(3);
    expect(m.items.map((i) => i.text)).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
  });

  test('R03: /h2 + Enter converts current block to H2 with no trigger remnant', async ({
    page,
  }) => {
    await resetEditor(page);
    await page.keyboard.type('/h2');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    expect(s.h2Count).toBe(1);
    expect(s.text).not.toContain('/h2');
  });

  test('R04: /table + Enter inserts 3x3 table with header row, no remnant', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/table');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const tableInfo = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      const table = pm?.querySelector('table');
      return {
        tableCount: pm?.querySelectorAll('table').length ?? 0,
        rowCount: table?.querySelectorAll('tr').length ?? 0,
        thCount: table?.querySelectorAll('th').length ?? 0,
        text: pm?.textContent ?? '',
      };
    });
    expect(tableInfo.tableCount).toBe(1);
    expect(tableInfo.rowCount).toBe(3);
    expect(tableInfo.thCount).toBeGreaterThan(0);
    expect(tableInfo.text).not.toContain('/table');
  });

  test('R05: mid-line trigger after whitespace → /bullet + Enter creates bullet list', async ({
    page,
  }) => {
    await resetEditor(page);
    await page.keyboard.type('hello world ');
    await page.waitForTimeout(150);
    await page.keyboard.type('/bullet');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    expect(s.ulCount).toBe(1);
    expect(s.text).toContain('hello world');
    expect(s.text).not.toContain('/bullet');
  });

  test('R06: / then Escape closes menu and preserves /', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);
    expect(await getMenuState(page).then((m) => m.open)).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    expect(await getMenuState(page).then((m) => m.open)).toBe(false);
    const s = await getEditorState(page);
    expect(s.text).toContain('/');
  });

  test('R07: ArrowDown x3 moves selection to 4th item', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
    }
    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    const selectedIdx = m.items.findIndex((i) => i.dataSelected === 'true');
    expect(selectedIdx).toBe(3);
    await page.keyboard.press('Escape');
  });

  test('R08: mousedown on item inserts and removes trigger range', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/quote');
    await page.waitForTimeout(300);
    // Use mousedown — onMouseDown handler in SlashCommandMenu
    const clicked = await page.evaluate(() => {
      const item = document.querySelector('[role="listbox"] [role="option"]');
      if (!item) return false;
      const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      item.dispatchEvent(ev);
      return true;
    });
    expect(clicked).toBe(true);
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    expect(s.blockquoteCount).toBe(1);
    expect(s.text).not.toContain('/quote');
  });

  test('R09: /xyz (no match) closes menu and preserves text', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/xyz');
    await page.waitForTimeout(300);

    expect(await getMenuState(page).then((m) => m.open)).toBe(false);
    const s = await getEditorState(page);
    expect(s.text).toContain('/xyz');
  });

  test('R10: ARIA roles (listbox, option, aria-selected, data-selected)', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    const aria = await page.evaluate(() => {
      const menu = document.querySelector('[role="listbox"]');
      if (!menu) return null;
      const opts = menu.querySelectorAll('[role="option"]');
      return {
        menuRole: menu.getAttribute('role'),
        menuAriaLabel: menu.getAttribute('aria-label'),
        optionCount: opts.length,
        allHaveAriaSelected: Array.from(opts).every((o) => o.hasAttribute('aria-selected')),
        allHaveDataSelected: Array.from(opts).every((o) => o.hasAttribute('data-selected')),
        exactlyOneAriaSelectedTrue:
          Array.from(opts).filter((o) => o.getAttribute('aria-selected') === 'true').length === 1,
      };
    });
    if (!aria) throw new Error('menu not rendered');
    expect(aria.menuRole).toBe('listbox');
    expect(aria.menuAriaLabel).toBe('Slash commands');
    expect(aria.optionCount).toBe(10);
    expect(aria.allHaveAriaSelected).toBe(true);
    expect(aria.allHaveDataSelected).toBe(true);
    expect(aria.exactlyOneAriaSelectedTrue).toBe(true);
    await page.keyboard.press('Escape');
  });

  test('R11: category headers render as "Basic blocks" and "Insert"', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    expect(m.legends).toEqual(['Basic blocks', 'Insert']);
    await page.keyboard.press('Escape');
  });

  test('R12: Tailwind classes + inline CSS var style preserved on menu', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    const cls = await page.evaluate(() => {
      const menu = document.querySelector('[role="listbox"]');
      return {
        className: menu?.className ?? '',
        style: menu?.getAttribute('style') ?? '',
      };
    });
    for (const c of [
      'w-56',
      'overflow-y-auto',
      'subtle-scrollbar',
      'rounded-lg',
      'border',
      'bg-popover',
      'p-1',
      'shadow-md',
    ]) {
      expect(cls.className).toContain(c);
    }
    expect(cls.style).toContain('--suggestion-menu-max-height');
    await page.keyboard.press('Escape');
  });

  test('R13: scroll-into-view keeps last item visible after navigation', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(40);
    }
    const lastVisible = await page.evaluate(() => {
      const menu = document.querySelector('[role="listbox"]');
      if (!menu) return false;
      const items = menu.querySelectorAll('[role="option"]');
      const last = items[items.length - 1];
      if (!last) return false;
      const menuRect = menu.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      return lastRect.top >= menuRect.top - 1 && lastRect.bottom <= menuRect.bottom + 10;
    });
    expect(lastVisible).toBe(true);
    await page.keyboard.press('Escape');
  });

  test('R14: Tab is an Enter alias (D10) — /h2 + Tab converts to H2', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/h2');
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    expect(s.h2Count).toBe(1);
    expect(s.text).not.toContain('/h2');
  });

  test('R15: case-insensitive trigger — /HEADING filters heading items', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/HEADING');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    expect(m.itemCount).toBe(3);
    expect(m.items.map((i) => i.text)).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
    await page.keyboard.press('Escape');
  });

  test('R16: rapid / + Enter inserts first item without stale trigger', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.press('Slash');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    expect(s.h1Count).toBe(1);
    expect(s.text).not.toContain('/');
  });

  test('R17: no /query remnant after any insertion', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/bulletList');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    expect(s.text).not.toContain('/');
    expect(s.ulCount).toBe(1);
  });
});

test.describe('Slash command — Floating UI positioning (POS-01 to POS-04)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => {
      throw new Error(`Uncaught page error: ${e.message}`);
    });
    await page.goto(BASE);
    await page.waitForSelector('.ProseMirror');
  });

  test('POS-01: menu top is exactly cursor.rect.bottom + 4px (offset middleware)', async ({
    page,
  }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(400);

    const cursor = await getCursorRect(page);
    const popup = await getPopupInfo(page);
    expect(cursor).not.toBeNull();
    expect(popup).not.toBeNull();
    if (!popup || !('left' in popup)) throw new Error('popup not found');
    if (!cursor) return;

    const offset = popup.rect.top - cursor.bottom;
    expect(Math.abs(offset - 4)).toBeLessThan(1.5);
  });

  test('POS-02: flip middleware engages when cursor near viewport bottom', async ({ page }) => {
    await resetEditor(page);
    // Push cursor to near the bottom of the viewport
    for (let i = 0; i < 18; i++) {
      await page.keyboard.type(`line ${i}`);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.type('/');
    await page.waitForTimeout(400);

    const info = await page.evaluate(() => {
      const menu = document.querySelector('[role="listbox"]');
      if (!menu) return null;
      let el: HTMLElement | null = menu as HTMLElement;
      while (el && el !== document.body) {
        if (window.getComputedStyle(el).position === 'fixed') {
          return {
            menuRect: el.getBoundingClientRect().toJSON(),
            viewportHeight: window.innerHeight,
          };
        }
        el = el.parentElement;
      }
      return null;
    });
    expect(info).not.toBeNull();
    if (!info) return;
    // Cursor was pushed to ~bottom; menu should flip above and end up in upper half
    expect(info.menuRect.top).toBeLessThan(info.viewportHeight * 0.75);
    await page.keyboard.press('Escape');
  });

  test('POS-03: --suggestion-menu-max-height CSS var set by size middleware', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(400);

    const popup = await getPopupInfo(page);
    expect(popup).not.toBeNull();
    if (!popup || !('cssVar' in popup)) throw new Error('popup not found');

    // The size middleware sets --suggestion-menu-max-height to
    // min(availableHeight, viewport.height * 0.4) + 'px'
    // With viewport 1280x720 (Playwright default), expect 288px
    const viewport = await page.evaluate(() => window.innerHeight);
    const expectedMax = viewport * 0.4;
    expect(popup.cssVar).toBeTruthy();
    expect(popup.cssVar).toMatch(/^\d+(\.\d+)?px$/);
    const cssVarPx = parseFloat(popup.cssVar);
    expect(cssVarPx).toBeLessThanOrEqual(expectedMax + 1);
    expect(cssVarPx).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
  });

  test('POS-04: autoUpdate repositions menu on inner-container scroll', async ({ page }) => {
    await resetEditor(page);
    // Build up some scrollable content
    for (let i = 0; i < 30; i++) {
      await page.keyboard.type(`line ${i}`);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.press('Control+Home');
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await page.waitForTimeout(400);

    const before = await getPopupInfo(page);
    expect(before).not.toBeNull();
    if (!before || !('rect' in before) || !before.rect) throw new Error('popup not found');
    const beforeTop = before.rect.top;

    // Scroll the inner container UP by 50px
    const scrollResult = await page.evaluate(() => {
      let el: HTMLElement | null = document.querySelector('.ProseMirror');
      while (el && el !== document.body) {
        const styles = window.getComputedStyle(el);
        if (styles.overflowY === 'auto' || styles.overflowY === 'scroll') {
          if (el.scrollTop > 50) {
            el.scrollTop -= 50;
            return { scrolled: true, newScrollTop: el.scrollTop };
          }
          // Already at top — scroll down instead
          if (el.scrollHeight - el.clientHeight - el.scrollTop > 50) {
            el.scrollTop += 50;
            return { scrolled: true, newScrollTop: el.scrollTop };
          }
        }
        el = el.parentElement;
      }
      return { scrolled: false };
    });
    expect(scrollResult.scrolled).toBe(true);
    await page.waitForTimeout(300);

    const after = await getPopupInfo(page);
    if (!after || !('rect' in after) || !after.rect) throw new Error('popup gone after scroll');
    const moved = Math.abs(after.rect.top - beforeTop);
    expect(moved).toBeGreaterThan(5);
    await page.keyboard.press('Escape');
  });
});
