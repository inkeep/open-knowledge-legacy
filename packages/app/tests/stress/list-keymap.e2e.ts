/**
 * Layer C (Tier 2): Playwright E2E for OQ1 Tab/Shift-Tab keymap scoping.
 *
 * R19 / OQ1 acceptance gate (SPEC.md §6 R19):
 *   (1) Tab inside listItem indents (increases list depth)
 *   (2) Tab inside tableCell advances to next cell (existing table extension
 *       behavior NOT hijacked by the list keymap)
 *   (3) Tab inside codeBlock inserts a literal \t character
 *   Shift-Tab is the reverse operation in each context.
 *
 * Implementation reference: packages/core/src/extensions/list.ts:426-447 —
 * the Tab/Shift-Tab handlers walk up the resolved position and only fire
 * sinkListItem/liftListItem when a listItem ancestor is found; otherwise
 * return false to let other extensions handle the key.
 *
 * Requires: Playwright browsers installed. Dev server started by
 * playwright.config.ts webServer on VITE_PORT (or default 5173).
 */

import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

async function waitForProvider(page: Page) {
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), { timeout: 15_000 });
}

async function getYText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const provider = window.__activeProvider;
    return provider?.document?.getText('source')?.toString() ?? '';
  });
}

/** Seed Y.Text via the agent-write-md API (bypasses keystroke timing). */
async function seedMarkdown(page: Page, markdown: string) {
  const res = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName: 'test-doc', markdown, mode: 'replace' }),
  });
  if (!res.ok) throw new Error(`agent-write-md failed: ${res.status}`);
  // Wait for Observer B (text→tree) to settle
  await page.waitForTimeout(600);
}

test.beforeEach(async ({ page }) => {
  const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
  await page.goto(BASE);
  await page.getByText('test-doc.md').click({ timeout: 10_000 });
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
});

test.describe('OQ1: Tab/Shift-Tab scoping by cursor context', () => {
  test('Tab inside a listItem increases list depth', async ({ page }) => {
    await seedMarkdown(page, '- first\n- second\n');

    // Focus the ProseMirror editor and place cursor in the second list item
    await page.locator('.ProseMirror').focus();
    // Click on the "second" text to place cursor there
    await page.locator('.ProseMirror li').nth(1).click();
    // Position at end of text
    await page.keyboard.press('End');

    // Press Tab — should indent the second item under the first
    await page.keyboard.press('Tab');

    // Give Observer A time to sync the structural change to Y.Text
    await page.waitForTimeout(400);
    const ytext = await getYText(page);

    // Indented second item appears with leading whitespace in markdown source
    expect(ytext).toContain('- first');
    expect(ytext).toMatch(/ {2}[-*+] second/);
  });

  test('Shift-Tab inside a nested listItem lifts it one level', async ({ page }) => {
    // Seed an already-nested list
    await seedMarkdown(page, '- top\n  - nested\n');

    await page.locator('.ProseMirror').focus();
    // Click on the nested "nested" text
    const nestedLi = page.locator('.ProseMirror li li').first();
    await nestedLi.click();
    await page.keyboard.press('End');

    await page.keyboard.press('Shift+Tab');

    await page.waitForTimeout(400);
    const ytext = await getYText(page);

    // After lifting, nested is back at top-level
    expect(ytext).toMatch(/^- top\n- nested/m);
  });

  test('Tab inside a tableCell advances to the next cell (list keymap does NOT hijack)', async ({
    page,
  }) => {
    // Seed a 2x2 table
    await seedMarkdown(page, '| a | b |\n| - | - |\n| 1 | 2 |\n');

    await page.locator('.ProseMirror').focus();
    // Click into the first body cell (content '1')
    const firstBodyCell = page.locator('.ProseMirror td').nth(0);
    await firstBodyCell.click();
    await page.keyboard.press('End');

    // Verify we are inside a table cell
    const inTableBefore = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      let el: Node | null = sel.anchorNode;
      while (el) {
        if (el.nodeType === 1 && (el as Element).matches('td,th')) return true;
        el = el.parentNode;
      }
      return false;
    });
    expect(inTableBefore).toBe(true);

    // Press Tab — table extension should advance to the next cell
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    // After Tab, cursor should still be inside a table cell (second body cell, content '2')
    const stillInTable = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      let el: Node | null = sel.anchorNode;
      while (el) {
        if (el.nodeType === 1 && (el as Element).matches('td,th')) return true;
        el = el.parentNode;
      }
      return false;
    });
    expect(stillInTable).toBe(true);

    // Y.Text must not have been structurally mutated (no list indent occurred)
    const ytext = await getYText(page);
    expect(ytext).toContain('| 1 | 2 |');
    expect(ytext).not.toMatch(/^ {2}/m);
  });

  test('Tab inside a codeBlock inserts a literal tab character', async ({ page }) => {
    await seedMarkdown(page, '```\nfirst\n```\n');

    await page.locator('.ProseMirror').focus();
    // Click into the code block
    await page.locator('.ProseMirror pre code').click();
    await page.keyboard.press('End');

    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);

    const ytext = await getYText(page);
    // The tab character should be emitted into the code block content
    expect(ytext).toMatch(/first\t/);
    // Code fence preserved (Tab did NOT trigger a list indent)
    expect(ytext).toContain('```');
    // No spurious list syntax
    expect(ytext).not.toMatch(/^- /m);
  });
});
