/**
 * Slash command menu — behavioral E2E specification.
 *
 * Describes how the slash command menu works from a user's perspective:
 * triggering, filtering, keyboard navigation, item insertion, positioning,
 * and accessibility. Each test is a behavioral statement that should remain
 * true regardless of the internal implementation.
 *
 * Requires: Playwright browsers installed. Dev server started by
 * `playwright.config.ts` `webServer` on VITE_PORT (or default 5173).
 */

import { expect, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = process.env.STRESS_BASE_URL ?? `http://localhost:${port}`;

// ---------------------------------------------------------------------------
// Helpers — thin wrappers around the editor's observable surface
// ---------------------------------------------------------------------------

async function resetEditor(page: import('@playwright/test').Page) {
  const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
  await page.reload({ waitUntil: 'networkidle' });
  // Multi-doc arch: reload drops back to the sidebar, re-select the doc.
  // Use role+name to disambiguate: the reload may leave 'test-doc.md' in both
  // the sidebar list (button) and the main-area header label.
  await page.getByRole('button', { name: 'test-doc.md' }).click({ timeout: 10_000 });
  await page.waitForSelector('.ProseMirror');
  await page.click('.ProseMirror');
  await page.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent === '', {
    timeout: 5_000,
  });
}

async function getEditorState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return {
      text: pm?.textContent ?? '',
      h1Count: pm?.querySelectorAll('h1').length ?? 0,
      h2Count: pm?.querySelectorAll('h2').length ?? 0,
      ulCount: pm?.querySelectorAll('ul').length ?? 0,
      blockquoteCount: pm?.querySelectorAll('blockquote').length ?? 0,
      tableCount: pm?.querySelectorAll('table').length ?? 0,
    };
  });
}

async function getMenuState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
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

/** Walks up from the menu to the body-attached fixed-position popup div. */
async function getPopupInfo(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const menu = document.querySelector('[role="listbox"][aria-label="Slash commands"]');
    if (!menu) return null;
    let el: HTMLElement | null = menu as HTMLElement;
    while (el && el !== document.body) {
      if (window.getComputedStyle(el).position === 'fixed') {
        return {
          cssVar: el.style.getPropertyValue('--suggestion-menu-max-height'),
          rect: el.getBoundingClientRect().toJSON(),
        };
      }
      el = el.parentElement;
    }
    return null;
  });
}

async function getCursorRect(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
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

// ---------------------------------------------------------------------------
// Triggering and filtering
// ---------------------------------------------------------------------------

test.describe('slash command — triggering and filtering', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => {
      throw new Error(`Uncaught page error: ${e.message}`);
    });
    await page.goto(BASE);
    // Multi-doc arch: must open a document from sidebar before the editor renders.
    // Landed broken in PR #51 (slash-command-generalization) which predates PR #50
    // (multi-file-document-support) — no single-doc auto-load fallback anymore.
    // Use role+name to disambiguate: after an open-doc reload, 'test-doc.md' text
    // appears in BOTH the sidebar list item (button) and the main-area header label.
    // getByText hits strict-mode violation; the button role uniquely targets the sidebar entry.
    await page.getByRole('button', { name: 'test-doc.md' }).click({ timeout: 10_000 });
    await page.waitForSelector('.ProseMirror');
  });

  test('typing / in an empty paragraph opens the command menu', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    expect(m.itemCount).toBeGreaterThan(0);
    expect(m.items[0]?.ariaSelected).toBe('true');
  });

  test('typing a query after / narrows items to those matching the query', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/heading');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    expect(m.items.every((i) => i.text.toLowerCase().includes('heading'))).toBe(true);
  });

  test('query matching is case-insensitive', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/HEADING');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    expect(m.items.every((i) => i.text.toLowerCase().includes('heading'))).toBe(true);
    await page.keyboard.press('Escape');
  });

  test('typing / after whitespace mid-line opens the menu', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('hello world ');
    await page.waitForTimeout(150);
    await page.keyboard.type('/bullet');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    await page.keyboard.press('Escape');
  });

  test('a query with no matches closes the menu and preserves the typed text', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/xyz');
    await page.waitForTimeout(300);

    expect(await getMenuState(page).then((m) => m.open)).toBe(false);
    expect(await getEditorState(page).then((s) => s.text)).toContain('/xyz');
  });
});

// ---------------------------------------------------------------------------
// Item insertion
// ---------------------------------------------------------------------------

test.describe('slash command — item insertion', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => {
      throw new Error(`Uncaught page error: ${e.message}`);
    });
    await page.goto(BASE);
    // Multi-doc arch: must open a document from sidebar before the editor renders.
    // Landed broken in PR #51 (slash-command-generalization) which predates PR #50
    // (multi-file-document-support) — no single-doc auto-load fallback anymore.
    // Use role+name to disambiguate: after an open-doc reload, 'test-doc.md' text
    // appears in BOTH the sidebar list item (button) and the main-area header label.
    // getByText hits strict-mode violation; the button role uniquely targets the sidebar entry.
    await page.getByRole('button', { name: 'test-doc.md' }).click({ timeout: 10_000 });
    await page.waitForSelector('.ProseMirror');
  });

  test('selecting an item via Enter inserts it and removes the trigger text', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/h2');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    expect(s.h2Count).toBe(1);
    expect(s.text).not.toContain('/');
  });

  test('Tab inserts the selected item (same as Enter)', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/h2');
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    expect(s.h2Count).toBe(1);
    expect(s.text).not.toContain('/h2');
  });

  test('clicking an item with the mouse inserts it', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/quote');
    await page.waitForTimeout(300);

    const clicked = await page.evaluate(() => {
      const item = document.querySelector('[role="listbox"] [role="option"]');
      if (!item) return false;
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      return true;
    });
    expect(clicked).toBe(true);
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    expect(s.blockquoteCount).toBe(1);
    expect(s.text).not.toContain('/');
  });

  test('table command inserts a table with a header row', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/table');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const info = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      const table = pm?.querySelector('table');
      return {
        exists: !!table,
        rows: table?.querySelectorAll('tr').length ?? 0,
        hasHeader: (table?.querySelectorAll('th').length ?? 0) > 0,
      };
    });
    expect(info.exists).toBe(true);
    expect(info.rows).toBeGreaterThanOrEqual(2);
    expect(info.hasHeader).toBe(true);
  });

  test('mid-line insertion converts the paragraph and preserves prior text', async ({ page }) => {
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

  test('rapid / then Enter inserts an item without leftover trigger text', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.press('Slash');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const s = await getEditorState(page);
    // Some item was inserted (first item in the menu)
    expect(s.h1Count + s.h2Count + s.ulCount + s.blockquoteCount + s.tableCount).toBeGreaterThan(0);
    expect(s.text).not.toContain('/');
  });

  test('no trigger text remains in the document after any insertion', async ({ page }) => {
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

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

test.describe('slash command — keyboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => {
      throw new Error(`Uncaught page error: ${e.message}`);
    });
    await page.goto(BASE);
    // Multi-doc arch: must open a document from sidebar before the editor renders.
    // Landed broken in PR #51 (slash-command-generalization) which predates PR #50
    // (multi-file-document-support) — no single-doc auto-load fallback anymore.
    // Use role+name to disambiguate: after an open-doc reload, 'test-doc.md' text
    // appears in BOTH the sidebar list item (button) and the main-area header label.
    // getByText hits strict-mode violation; the button role uniquely targets the sidebar entry.
    await page.getByRole('button', { name: 'test-doc.md' }).click({ timeout: 10_000 });
    await page.waitForSelector('.ProseMirror');
  });

  test('arrow keys move the selection through menu items', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    // Navigate down 3 times
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(80);
    }
    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;

    // Exactly one item is selected, and it's the 4th (index 3)
    const selected = m.items.filter((i) => i.dataSelected === 'true');
    expect(selected).toHaveLength(1);
    expect(m.items.findIndex((i) => i.dataSelected === 'true')).toBe(3);
    await page.keyboard.press('Escape');
  });

  test('ArrowUp moves selection upward and wraps around to the last item', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    // First item is selected by default (index 0). ArrowUp should wrap to the last item.
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    const selectedIdx = m.items.findIndex((i) => i.dataSelected === 'true');
    expect(selectedIdx).toBe(m.itemCount - 1);
    await page.keyboard.press('Escape');
  });

  test('selection clamps to the last item when filtering narrows the list', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    // Navigate down 5 items (selection at index 5)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(80);
    }

    // Now type a query that narrows to fewer items than current index
    // Backspace to delete '/', then type '/h' — which should match heading items only (~3)
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
    await page.keyboard.type('/heading');
    await page.waitForTimeout(400);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    // Selection should be clamped to within the narrowed list, not beyond it
    const selectedIdx = m.items.findIndex((i) => i.dataSelected === 'true');
    expect(selectedIdx).toBeGreaterThanOrEqual(0);
    expect(selectedIdx).toBeLessThan(m.itemCount);
    await page.keyboard.press('Escape');
  });

  test('Escape closes the menu without inserting anything', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);
    expect(await getMenuState(page).then((m) => m.open)).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    expect(await getMenuState(page).then((m) => m.open)).toBe(false);
    // The / character remains — nothing was inserted or deleted
    expect(await getEditorState(page).then((s) => s.text)).toContain('/');
  });

  test('navigating past the last item keeps the selected item visible', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    if (!m.open) return;
    // Press down enough times to reach the last item
    for (let i = 0; i < m.itemCount - 1; i++) {
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
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

test.describe('slash command — accessibility', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => {
      throw new Error(`Uncaught page error: ${e.message}`);
    });
    await page.goto(BASE);
    // Multi-doc arch: must open a document from sidebar before the editor renders.
    // Landed broken in PR #51 (slash-command-generalization) which predates PR #50
    // (multi-file-document-support) — no single-doc auto-load fallback anymore.
    // Use role+name to disambiguate: after an open-doc reload, 'test-doc.md' text
    // appears in BOTH the sidebar list item (button) and the main-area header label.
    // getByText hits strict-mode violation; the button role uniquely targets the sidebar entry.
    await page.getByRole('button', { name: 'test-doc.md' }).click({ timeout: 10_000 });
    await page.waitForSelector('.ProseMirror');
  });

  test('the menu uses listbox role with labeled options', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    const aria = await page.evaluate(() => {
      const menu = document.querySelector('[role="listbox"]');
      if (!menu) return null;
      const opts = menu.querySelectorAll('[role="option"]');
      return {
        menuAriaLabel: menu.getAttribute('aria-label'),
        optionCount: opts.length,
        allHaveAriaSelected: Array.from(opts).every((o) => o.hasAttribute('aria-selected')),
        exactlyOneSelected:
          Array.from(opts).filter((o) => o.getAttribute('aria-selected') === 'true').length === 1,
      };
    });
    if (!aria) throw new Error('menu not rendered');
    expect(aria.menuAriaLabel).toBe('Slash commands');
    expect(aria.optionCount).toBeGreaterThan(0);
    expect(aria.allHaveAriaSelected).toBe(true);
    expect(aria.exactlyOneSelected).toBe(true);
    await page.keyboard.press('Escape');
  });

  test('items are grouped under category headers', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    const m = await getMenuState(page);
    expect(m.open).toBe(true);
    if (!m.open) return;
    // There are category headers, and they have human-readable labels
    expect(m.legends.length).toBeGreaterThan(0);
    for (const legend of m.legends) {
      expect(legend.length).toBeGreaterThan(0);
    }
    await page.keyboard.press('Escape');
  });

  test('the menu has a constrained max-height driven by available viewport space', async ({
    page,
  }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);

    const cls = await page.evaluate(() => {
      const menu = document.querySelector('[role="listbox"]');
      return {
        hasOverflow: menu?.className.includes('overflow-y-auto') ?? false,
        style: menu?.getAttribute('style') ?? '',
      };
    });
    expect(cls.hasOverflow).toBe(true);
    expect(cls.style).toContain('max-height');
    await page.keyboard.press('Escape');
  });
});

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

test.describe('slash command — menu positioning', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => {
      throw new Error(`Uncaught page error: ${e.message}`);
    });
    await page.goto(BASE);
    // Multi-doc arch: must open a document from sidebar before the editor renders.
    // Landed broken in PR #51 (slash-command-generalization) which predates PR #50
    // (multi-file-document-support) — no single-doc auto-load fallback anymore.
    // Use role+name to disambiguate: after an open-doc reload, 'test-doc.md' text
    // appears in BOTH the sidebar list item (button) and the main-area header label.
    // getByText hits strict-mode violation; the button role uniquely targets the sidebar entry.
    await page.getByRole('button', { name: 'test-doc.md' }).click({ timeout: 10_000 });
    await page.waitForSelector('.ProseMirror');
  });

  test('the menu appears just below the cursor', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(400);

    const cursor = await getCursorRect(page);
    const popup = await getPopupInfo(page);
    expect(cursor).not.toBeNull();
    expect(popup).not.toBeNull();
    if (!popup || !cursor) return;

    const gap = popup.rect.top - cursor.bottom;
    // Small positive gap (a few pixels of offset)
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(20);
  });

  test('the menu flips above the cursor when there is not enough room below', async ({ page }) => {
    await resetEditor(page);
    // Push cursor near the bottom of the viewport
    for (let i = 0; i < 18; i++) {
      await page.keyboard.type(`line ${i}`);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.type('/');
    await page.waitForTimeout(400);

    const popup = await getPopupInfo(page);
    const viewport = await page.evaluate(() => window.innerHeight);
    expect(popup).not.toBeNull();
    if (!popup) return;
    // Menu should be in the upper portion of the viewport (flipped above cursor)
    expect(popup.rect.top).toBeLessThan(viewport * 0.75);
    await page.keyboard.press('Escape');
  });

  test('the menu max-height adapts to available viewport space', async ({ page }) => {
    await resetEditor(page);
    await page.keyboard.type('/');
    await page.waitForTimeout(400);

    const popup = await getPopupInfo(page);
    expect(popup).not.toBeNull();
    if (!popup) return;

    // The CSS variable is set by the size middleware — its value is viewport-relative
    expect(popup.cssVar).toBeTruthy();
    expect(popup.cssVar).toMatch(/^\d+(\.\d+)?px$/);
    const maxHeightPx = parseFloat(popup.cssVar);
    const viewport = await page.evaluate(() => window.innerHeight);
    expect(maxHeightPx).toBeGreaterThan(0);
    expect(maxHeightPx).toBeLessThanOrEqual(viewport * 0.5);
    await page.keyboard.press('Escape');
  });

  test('the menu repositions when the editor container is scrolled', async ({ page }) => {
    await resetEditor(page);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.type(`line ${i}`);
      await page.keyboard.press('Enter');
    }
    // Position cursor in the middle of the content
    await page.keyboard.press('Control+Home');
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await page.waitForTimeout(400);

    const before = await getPopupInfo(page);
    expect(before).not.toBeNull();
    if (!before) return;

    // Scroll the editor container
    const scrolled = await page.evaluate(() => {
      let el: HTMLElement | null = document.querySelector('.ProseMirror');
      while (el && el !== document.body) {
        const styles = window.getComputedStyle(el);
        if (styles.overflowY === 'auto' || styles.overflowY === 'scroll') {
          if (el.scrollTop > 50) {
            el.scrollTop -= 50;
            return true;
          }
          if (el.scrollHeight - el.clientHeight - el.scrollTop > 50) {
            el.scrollTop += 50;
            return true;
          }
        }
        el = el.parentElement;
      }
      return false;
    });
    expect(scrolled).toBe(true);
    await page.waitForTimeout(300);

    const after = await getPopupInfo(page);
    if (!after) return;
    // Menu position should have changed in response to scroll
    expect(Math.abs(after.rect.top - before.rect.top)).toBeGreaterThan(5);
    await page.keyboard.press('Escape');
  });
});
