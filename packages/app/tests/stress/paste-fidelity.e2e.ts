/**
 * V1 Playwright paste baseline tests — documents current paste behavior.
 *
 * Acts as a regression baseline for the future paste-UX spec. Tests verify
 * pasted text/plain content survives round-trip through the WYSIWYG editor.
 *
 * Uses DataTransfer + dispatchEvent for clipboard injection (the
 * navigator.clipboard API is blocked in headless Chromium without
 * explicit permission grants).
 *
 * Requires: Playwright browsers installed. Dev server started by
 * playwright.config.ts webServer on VITE_PORT (or default 5173).
 */

import { expect, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

/** Wait for the active provider to be connected and synced */
async function waitForProvider(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    // biome-ignore lint/suspicious/noExplicitAny: accessing active provider from window
    () => Boolean((window as any).__activeProvider?.isSynced),
    { timeout: 15_000 },
  );
}

/** Get the current Y.Text content from the provider */
async function getYText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing active provider from window
    const provider = (window as any).__activeProvider;
    return provider?.document?.getText('source')?.toString() ?? '';
  });
}

/**
 * Inject text/plain content by dispatching a synthetic paste event with a
 * DataTransfer payload. This bypasses the navigator.clipboard permission
 * gate that blocks headless Chromium.
 */
async function pasteText(page: import('@playwright/test').Page, text: string) {
  await page.evaluate((content) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) throw new Error('ProseMirror editor not found');
    const dt = new DataTransfer();
    dt.setData('text/plain', content);
    const event = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(event);
  }, text);
}

// ─── Paste baseline tests ───

test.describe('V1 paste baseline — text/plain content through WYSIWYG', () => {
  test.beforeEach(async ({ page }) => {
    // Reset server state
    const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    // Navigate to root and open doc via sidebar (app has no ?doc= URL routing)
    await page.goto(BASE);
    await page.getByText('test-doc.md').click({ timeout: 10_000 });
    await waitForProvider(page);
    // Focus the editor
    await page.click('.ProseMirror');
  });

  test('plain text paste survives round-trip', async ({ page }) => {
    await pasteText(page, 'Hello world');
    await page.waitForTimeout(500);
    const content = await getYText(page);
    expect(content).toContain('Hello world');
  });

  test('markdown with heading paste', async ({ page }) => {
    await pasteText(page, '# Pasted Heading');
    await page.waitForTimeout(500);
    const content = await getYText(page);
    // With always-parse (R18), heading should be parsed as structured content
    expect(content).toContain('Pasted Heading');
  });

  test('markdown with emphasis paste', async ({ page }) => {
    await pasteText(page, 'This is **bold** and *italic* text');
    await page.waitForTimeout(500);
    const content = await getYText(page);
    expect(content).toContain('bold');
    expect(content).toContain('italic');
  });

  test('markdown with code block paste', async ({ page }) => {
    await pasteText(page, '```js\nconst x = 1;\n```');
    await page.waitForTimeout(500);
    const content = await getYText(page);
    expect(content).toContain('const x = 1');
  });

  test('markdown with link paste', async ({ page }) => {
    await pasteText(page, 'Visit [example](https://example.com) for more');
    await page.waitForTimeout(500);
    const content = await getYText(page);
    expect(content).toContain('example');
  });

  test('markdown with list paste', async ({ page }) => {
    await pasteText(page, '- Item 1\n- Item 2\n- Item 3');
    await page.waitForTimeout(500);
    const content = await getYText(page);
    expect(content).toContain('Item 1');
    expect(content).toContain('Item 2');
  });
});
