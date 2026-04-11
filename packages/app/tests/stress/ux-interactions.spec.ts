/**
 * Layer C (Tier 2): Playwright UX integration tests.
 *
 * Critical UX flows that require a real browser: WYSIWYG↔Source sync,
 * round-trip toggle, and concurrent agent writes during editing.
 *
 * Requires: Playwright browsers installed. Dev server started by
 * playwright.config.ts webServer on VITE_PORT (or default 5173).
 */

import { expect, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

/** Wait for the Hocuspocus provider to be connected and synced */
async function waitForProvider(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    // biome-ignore lint/suspicious/noExplicitAny: accessing Hocuspocus provider from window
    () => Boolean((window as any).__hocuspocusProvider?.isSynced),
    { timeout: 15_000 },
  );
}

/** Get the current Y.Text content from the provider */
async function getYText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing Hocuspocus provider from window
    const provider = (window as any).__hocuspocusProvider;
    return provider?.document?.getText('source')?.toString() ?? '';
  });
}

test.beforeEach(async ({ page }) => {
  // Reset server state and navigate
  const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
  await page.goto(BASE);
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
});

// Editor mode toggle is a Radix ToggleGroup with type="single" — items render
// as role="radio" (not "button") and carry aria-label="Visual editor" / "Markdown source".
// PR #35 restructured the header; these helpers centralize the selector so a future
// redesign only needs one update site.
const sourceToggle = (page: import('@playwright/test').Page) =>
  page.getByRole('radio', { name: 'Markdown source' });
const visualToggle = (page: import('@playwright/test').Page) =>
  page.getByRole('radio', { name: 'Visual editor' });

test('WYSIWYG→Source: typing in ProseMirror appears in CodeMirror', async ({ page }) => {
  // Type in WYSIWYG mode
  await page.locator('.ProseMirror').focus();
  await page.keyboard.type('Hello from WYSIWYG', { delay: 10 });

  // Wait for Observer A to sync to Y.Text
  await page.waitForFunction(
    // biome-ignore lint/suspicious/noExplicitAny: accessing Hocuspocus provider from window
    () =>
      (window as any).__hocuspocusProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('Hello from WYSIWYG'),
    { timeout: 10_000 },
  );

  // Switch to Source mode
  await sourceToggle(page).click();

  // Verify CodeMirror shows the typed content
  const cmContent = await page.locator('.cm-content').textContent();
  expect(cmContent).toContain('Hello from WYSIWYG');
});

test('Source→WYSIWYG: typing in CodeMirror renders in ProseMirror', async ({ page }) => {
  // Switch to Source mode
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');

  // Type markdown in CodeMirror
  await page.locator('.cm-content').focus();
  await page.keyboard.type('# Source Heading\n\nParagraph from source.', { delay: 10 });

  // Wait for Y.Text to have the content
  await page.waitForFunction(
    // biome-ignore lint/suspicious/noExplicitAny: accessing Hocuspocus provider from window
    () =>
      (window as any).__hocuspocusProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('Source Heading'),
    { timeout: 10_000 },
  );

  // Switch back to WYSIWYG
  await visualToggle(page).click();

  // Wait for ProseMirror to render the synced content
  await page.waitForFunction(
    () => document.querySelector('.ProseMirror')?.textContent?.includes('Source Heading'),
    { timeout: 10_000 },
  );

  // Verify ProseMirror renders the content
  const pmContent = await page.locator('.ProseMirror').textContent();
  expect(pmContent).toContain('Source Heading');
  expect(pmContent).toContain('Paragraph from source');
});

test('round-trip: edits in both modes survive toggle cycle', async ({ page }) => {
  // Type in WYSIWYG
  await page.locator('.ProseMirror').focus();
  await page.keyboard.type('WYSIWYG edit', { delay: 10 });

  // Wait for sync
  await page.waitForFunction(
    // biome-ignore lint/suspicious/noExplicitAny: accessing Hocuspocus provider from window
    () =>
      (window as any).__hocuspocusProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('WYSIWYG edit'),
    { timeout: 10_000 },
  );

  // Switch to Source, type there
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');
  await page.locator('.cm-content').focus();
  // Move to end before typing
  await page.keyboard.press('End');
  await page.keyboard.type('\n\nSource edit', { delay: 10 });

  // Wait for Y.Text to have both edits
  await page.waitForFunction(
    // biome-ignore lint/suspicious/noExplicitAny: accessing Hocuspocus provider from window
    () => {
      const txt = (window as any).__hocuspocusProvider?.document?.getText('source')?.toString();
      return txt?.includes('WYSIWYG edit') && txt?.includes('Source edit');
    },
    { timeout: 10_000 },
  );

  // Switch back to WYSIWYG
  await visualToggle(page).click();

  // Wait for ProseMirror to render both edits
  await page.waitForFunction(
    () => {
      const content = document.querySelector('.ProseMirror')?.textContent ?? '';
      return content.includes('WYSIWYG edit') && content.includes('Source edit');
    },
    { timeout: 10_000 },
  );

  // Both edits should be present
  const pmContent = await page.locator('.ProseMirror').textContent();
  expect(pmContent).toContain('WYSIWYG edit');
  expect(pmContent).toContain('Source edit');
});

test('concurrent agent write: user + agent content coexist', async ({ page }) => {
  // Type in WYSIWYG
  await page.locator('.ProseMirror').focus();
  await page.keyboard.type('User typing', { delay: 10 });

  // Wait for user content to sync
  await page.waitForFunction(
    // biome-ignore lint/suspicious/noExplicitAny: accessing Hocuspocus provider from window
    () =>
      (window as any).__hocuspocusProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('User typing'),
    { timeout: 10_000 },
  );

  // Agent writes via API while user is editing
  const res = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown: '## Agent Section\n\nAgent content here.' }),
  });
  expect(res.ok).toBe(true);

  // Wait for agent content to propagate
  await page.waitForFunction(
    // biome-ignore lint/suspicious/noExplicitAny: accessing Hocuspocus provider from window
    () =>
      (window as any).__hocuspocusProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('Agent Section'),
    { timeout: 10_000 },
  );

  // Switch to Source to see both
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');

  const sourceContent = await getYText(page);
  expect(sourceContent).toContain('User typing');
  expect(sourceContent).toContain('Agent Section');
  expect(sourceContent).toContain('Agent content here');
});
