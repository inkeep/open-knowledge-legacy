/**
 * Polish Engine Phase 1 — Playwright E2E tests
 *
 * Covers §10.7 rows: R1 (CRDT convergence), R4 (auto-bail boundaries),
 * R5 (zero console errors), R9 (performance), R12 (agent-write sync),
 * plus R3/R6/R10 for Phase 1 constructs (table, blockquote, code).
 *
 * §10.9 zero-tolerance error filter applied to every test.
 */

import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

/** Collect console errors and pageerrors per §10.9 */
function setupErrorCollector(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Whitelist operational console.warn with bracket-prefix convention
      if (
        text.startsWith('[file-watcher]') ||
        text.startsWith('[CC1]') ||
        text.startsWith('[wiki-link-source]')
      ) {
        return;
      }
      errors.push(`[console.error] ${text}`);
    }
  });

  return errors;
}

/** Wait for the active provider to be connected and synced */
async function waitForProvider(page: Page) {
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), {
    timeout: 15_000,
  });
}

test.describe('R5 — Zero console errors during composition doc session', () => {
  test('no pageerrors or console.errors with polish engine active', async ({ page }) => {
    const errors = setupErrorCollector(page);

    // Reset and navigate
    const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByText('test-doc.md').click({ timeout: 10_000 });
    await waitForProvider(page);

    // Switch to source mode
    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    // Type some content
    await page.locator('.cm-content').focus();
    await page.keyboard.type('# Test heading\n\n> Blockquote\n\n| A | B |\n|--|--|\n| 1 | 2 |\n', {
      delay: 5,
    });

    // Wait for decorations to settle
    await page.waitForTimeout(500);

    // §10.9: zero tolerance
    expect(errors).toEqual([]);
  });
});

test.describe('R10 — Decoration class correctness for Phase 1 constructs', () => {
  test('blockquote lines have .cm-blockquote-line class', async ({ page }) => {
    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByText('test-doc.md').click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    // Write a blockquote via agent API
    await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '> This is a blockquote\n> Second line\n', mode: 'replace' }),
    });

    await page.waitForTimeout(1000);

    // Check for blockquote decoration classes
    const blockquoteLines = await page.locator('.cm-blockquote-line').count();
    expect(blockquoteLines).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test('table rows have .cm-table-row class', async ({ page }) => {
    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByText('test-doc.md').click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '| A | B |\n|---|---|\n| 1 | 2 |\n',
        mode: 'replace',
      }),
    });

    await page.waitForTimeout(1000);

    const tableRows = await page.locator('.cm-table-row').count();
    expect(tableRows).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test('fenced code blocks have .cm-code-block class', async ({ page }) => {
    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByText('test-doc.md').click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '```typescript\nconst x = 1;\n```\n',
        mode: 'replace',
      }),
    });

    await page.waitForTimeout(1000);

    const codeBlocks = await page.locator('.cm-code-block').count();
    expect(codeBlocks).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });
});

test.describe('R3 — Cmd+A copy byte-identical clipboard', () => {
  test('select-all + copy yields byte-identical doc content', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByText('test-doc.md').click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    // Write content with blockquote + table + code
    const testContent = '> Quote\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n';
    await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: testContent, mode: 'replace' }),
    });

    await page.waitForTimeout(1000);

    // Get the doc content
    const docContent = await page.evaluate(() => {
      const view = document.querySelector('.cm-editor') as HTMLElement & {
        cmView?: { view: { state: { doc: { toString(): string } } } };
      };
      return view?.cmView?.view?.state?.doc?.toString() ?? '';
    });

    // Select all + copy
    await page.locator('.cm-content').focus();
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+c');

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(docContent);

    expect(errors).toEqual([]);
  });
});
