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

import { randomUUID } from 'node:crypto';
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

async function createPage(path: string) {
  const res = await fetch(`${BASE}/api/create-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (res.status === 409) return;
  if (!res.ok) throw new Error(`create-page failed for ${path}: ${res.status}`);
}

/** Seed Y.Text via the agent-write-md API (bypasses keystroke timing). */
async function seedMarkdown(page: Page, docName: string, markdown: string) {
  const res = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, markdown, position: 'replace' }),
  });
  if (!res.ok) throw new Error(`agent-write-md failed: ${res.status}`);
  // Wait for both bridge directions: Y.Text reflects the write (CRDT propagation)
  // AND the XmlFragment has been mirrored by Observer B (text→tree, ~300ms typing-defer
  // does not apply for AGENT_WRITE_ORIGIN — settles via 50ms Observer B debounce).
  await expect.poll(() => getYText(page)).toContain(markdown.split('\n')[0]?.trim() || '');
  await expect(page.locator('.ProseMirror')).not.toBeEmpty();
}

async function openDoc(page: Page, docName: string) {
  await createPage(`${docName}.md`);
  const resetRes = await fetch(`${BASE}/api/test-reset?docName=${encodeURIComponent(docName)}`, {
    method: 'POST',
  });
  if (!resetRes.ok) throw new Error(`test-reset failed: ${resetRes.status}`);
  await page.goto(`${BASE}/#/${docName}`);
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
}

function uniqueDocName(label: string): string {
  return `test-listkeymap-${label}-${randomUUID().slice(0, 8)}`;
}

test.describe('OQ1: Tab/Shift-Tab scoping by cursor context', () => {
  test('Tab inside a listItem increases list depth', async ({ page }) => {
    const docName = uniqueDocName('tab-listitem');
    await openDoc(page, docName);
    await seedMarkdown(page, docName, '- first\n- second\n');

    // Focus the ProseMirror editor and place cursor in the second list item
    await page.locator('.ProseMirror').focus();
    // Click on the "second" text to place cursor there
    await page.locator('.ProseMirror li').nth(1).click();
    // Position at end of text
    await page.keyboard.press('End');

    // Press Tab — should indent the second item under the first
    await page.keyboard.press('Tab');

    // Observer A (XmlFragment→Y.Text) mirrors the structural change. Poll
    // until the indented form lands in Y.Text (Category D — CRDT propagation).
    await expect.poll(() => getYText(page)).toMatch(/ {2}[-*+] second/);
    const ytext = await getYText(page);
    expect(ytext).toContain('- first');
  });

  test('Shift-Tab inside a nested listItem lifts it one level', async ({ page }) => {
    const docName = uniqueDocName('shifttab-nested');
    await openDoc(page, docName);
    // Seed an already-nested list
    await seedMarkdown(page, docName, '- top\n  - nested\n');

    await page.locator('.ProseMirror').focus();
    // Click on the nested "nested" text
    const nestedLi = page.locator('.ProseMirror li li').first();
    await nestedLi.click();
    await page.keyboard.press('End');

    await page.keyboard.press('Shift+Tab');

    // Observer A mirrors the lift to Y.Text — poll until the nested item is
    // back at the top level (Category D).
    await expect.poll(() => getYText(page)).toMatch(/^- top\n- nested/m);
  });

  test('Tab inside a tableCell advances to the next cell (list keymap does NOT hijack)', async ({
    page,
  }) => {
    const docName = uniqueDocName('tab-tablecell');
    await openDoc(page, docName);
    // Seed a 2x2 table
    await seedMarkdown(page, docName, '| a | b |\n| - | - |\n| 1 | 2 |\n');

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

    // Press Tab — table extension should advance to the next cell. Poll for
    // the cursor to land inside the second body cell (textContent '2'),
    // confirming Tab moved AND we are still inside a cell (Category C).
    await page.keyboard.press('Tab');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return null;
          let el: Node | null = sel.anchorNode;
          while (el) {
            if (el.nodeType === 1 && (el as Element).matches('td,th')) {
              return (el as Element).textContent?.trim() ?? '';
            }
            el = el.parentNode;
          }
          return null;
        }),
      )
      .toBe('2');

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
    const docName = uniqueDocName('tab-codeblock');
    await openDoc(page, docName);
    await seedMarkdown(page, docName, '```\nfirst\n```\n');

    await page.locator('.ProseMirror').focus();
    // Click into the code block
    await page.locator('.ProseMirror pre code').click();
    await page.keyboard.press('End');

    await page.keyboard.press('Tab');

    // Observer A mirrors the inserted tab character to Y.Text — poll until
    // it lands inside the code block (Category D).
    await expect.poll(() => getYText(page)).toMatch(/first\t/);
    const ytext = await getYText(page);
    // The tab character should be emitted into the code block content
    expect(ytext).toMatch(/first\t/);
    // Code fence preserved (Tab did NOT trigger a list indent)
    expect(ytext).toContain('```');
    // No spurious list syntax
    expect(ytext).not.toMatch(/^- /m);
  });
});
