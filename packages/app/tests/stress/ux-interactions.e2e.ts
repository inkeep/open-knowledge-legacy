/**
 * Layer C (Tier 2): Playwright UX integration tests.
 *
 * Critical UX flows that require a real browser: WYSIWYG↔Source sync,
 * round-trip toggle, and concurrent agent writes during editing.
 *
 * Requires: Playwright browsers installed. Dev server started by
 * playwright.config.ts webServer on VITE_PORT (or default 5173).
 */

import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

/** Wait for the active provider to be connected and synced */
async function waitForProvider(page: Page) {
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), { timeout: 15_000 });
}

/** Get the current Y.Text content from the provider */
async function getYText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const provider = window.__activeProvider;
    return provider?.document?.getText('source')?.toString() ?? '';
  });
}

test.beforeEach(async ({ page }) => {
  // Reset server state and navigate
  const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
  await page.goto(BASE);
  // Multi-doc arch: must open a document from sidebar before provider is active
  await page.getByText('test-doc.md').click({ timeout: 10_000 });
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
});

// Editor mode toggle is a Radix ToggleGroup with type="single" — items render
// as role="radio" (not "button") and carry aria-label="Visual editor" / "Markdown source".
// PR #35 restructured the header; these helpers centralize the selector so a future
// redesign only needs one update site.
const sourceToggle = (page: Page) => page.getByRole('radio', { name: 'Markdown source' });
const visualToggle = (page: Page) => page.getByRole('radio', { name: 'Visual editor' });

test('WYSIWYG→Source: typing in ProseMirror appears in CodeMirror', async ({ page }) => {
  // Type in WYSIWYG mode
  await page.locator('.ProseMirror').focus();
  await page.keyboard.type('Hello from WYSIWYG', { delay: 10 });

  // Wait for Observer A to sync to Y.Text
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
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
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('Source Heading'),
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
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('WYSIWYG edit'),
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
    () => {
      const txt = window.__activeProvider?.document?.getText('source')?.toString();
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
    () => window.__activeProvider?.document?.getText('source')?.toString()?.includes('User typing'),
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
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('Agent Section'),
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

test('sidebar folder row: clicking anywhere on the row toggles expand/collapse', async ({
  page,
}) => {
  const folderRow = page.getByRole('button', { name: 'sidebar-folder' });
  // Scope to the sidebar — `getByText('nested-doc.md')` would also match the
  // EditorHeader's `${activeDocName}.md` label after navigating into the file,
  // causing toHaveCount(0) to fail on collapse even though the sidebar entry is
  // correctly hidden.
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  const nestedFile = sidebar.getByText('nested-doc.md');

  // Starts collapsed — nested child is not visible, aria-expanded reflects state
  await expect(folderRow).toBeVisible();
  await expect(folderRow).toHaveAttribute('aria-expanded', 'false');
  await expect(nestedFile).toHaveCount(0);

  // Click the label (not the chevron) — the whole row should be the hit target
  await folderRow.click();
  await expect(folderRow).toHaveAttribute('aria-expanded', 'true');
  await expect(nestedFile).toBeVisible();

  // Nested file click still navigates (not shadowed by folder toggle)
  await nestedFile.click();
  await expect(page).toHaveURL(/#\/sidebar-folder\/nested-doc$/);

  // Click the row again to collapse
  await folderRow.click();
  await expect(folderRow).toHaveAttribute('aria-expanded', 'false');
  await expect(nestedFile).toHaveCount(0);
});

test('markdown link edit dialog preserves page mode while clearing and updates the href target', async ({
  page,
}) => {
  const doc = '[Beta page](beta.md)';

  const writeRes = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown: doc, position: 'replace' }),
  });
  expect(writeRes.ok).toBe(true);

  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('[Beta page](beta.md)'),
    { timeout: 10_000 },
  );

  const chip = page.locator('[data-internal-link]').first();
  await expect(chip).toHaveAttribute('data-doc-name', 'beta');

  // Firefox headless doesn't always fire the CSS :hover state from
  // locator.hover() reliably enough for React to show the hover-only
  // button. Explicit mouse.move over the chip's center fires
  // pointerenter/pointermove events that every browser honors, which
  // React respond-to consistently. Chromium + WebKit also tolerate this
  // pattern, so no per-browser branching.
  const chipBox = await chip.boundingBox();
  if (chipBox) {
    await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  } else {
    await chip.hover();
  }
  await chip.getByRole('button', { name: 'Link options' }).click();
  await page.getByText('Edit link', { exact: true }).click();

  const pageLabel = page.locator('label').filter({ hasText: 'Page' }).first();
  const sectionLabel = page.locator('label').filter({ hasText: 'Section' }).first();
  const targetInput = page
    .locator('input[placeholder="guides/install or https://example.com"]')
    .first();
  await expect(pageLabel).toBeVisible();
  await expect(sectionLabel).toBeVisible();

  await targetInput.fill('');
  await expect(pageLabel).toBeVisible();
  await expect(sectionLabel).toBeVisible();

  await targetInput.fill('sidebar-folder/nested-doc');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(chip).toHaveAttribute('data-doc-name', 'sidebar-folder/nested-doc');
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('[Beta page](./sidebar-folder/nested-doc.md)'),
    { timeout: 10_000 },
  );

  await chip.hover();
  const tooltip = page.locator('[data-slot="tooltip-content"]').last();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('./sidebar-folder/nested-doc.md');
});
