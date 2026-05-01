
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  type ApiHelpers,
  expect,
  test,
  waitForActiveProviderSynced as waitForProvider,
} from './_helpers';

async function getYText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const provider = window.__activeProvider;
    return provider?.document?.getText('source')?.toString() ?? '';
  });
}

function uniqueDocName(label: string): string {
  return `test-ux-${label}-${randomUUID().slice(0, 8)}`;
}

async function openFreshDoc(api: ApiHelpers, page: Page, label: string): Promise<string> {
  const docName = uniqueDocName(label);
  await api.createPage(`${docName}.md`);
  await api.testReset(docName);
  await page.goto(`/#/${docName}`);
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
  return docName;
}

const sourceToggle = (page: Page) => page.getByRole('radio', { name: 'Markdown source' });
const visualToggle = (page: Page) => page.getByRole('radio', { name: 'Visual editor' });


test('source mode: real pointer click + keystrokes land in CodeMirror', async ({ page, api }) => {
  await openFreshDoc(api, page, 'source-hit-test');
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');

  const cmContent = page.locator('.cm-content');
  const box = await cmContent.boundingBox();
  if (!box) throw new Error('.cm-content has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + 5);
  await expect(cmContent).toBeFocused();

  await page.keyboard.type('HITOK');
  await expect(page.locator('.cm-content')).toContainText('HITOK', { timeout: 5_000 });
});

test('visual mode: real pointer click + keystrokes land in ProseMirror', async ({ page, api }) => {
  await openFreshDoc(api, page, 'visual-hit-test');
  await expect(visualToggle(page)).toBeChecked();

  const pm = page.locator('.ProseMirror');
  const box = await pm.boundingBox();
  if (!box) throw new Error('ProseMirror has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + 30);
  await expect(pm).toBeFocused();

  await page.keyboard.type('HITPM');
  await expect(page.locator('.ProseMirror')).toContainText('HITPM', { timeout: 5_000 });
});

test('hidden-editor wrapper does not intercept pointer events (both modes)', async ({
  page,
  api,
}) => {
  await openFreshDoc(api, page, 'hidden-wrapper-invariant');

  const hiddenInVisual = page.locator('.ok-mode-hidden').first();
  await expect(hiddenInVisual).toHaveCSS('pointer-events', 'none');
  await expect(hiddenInVisual).toHaveCSS('position', 'absolute');

  await sourceToggle(page).click();
  await page.waitForSelector('.cm-editor');
  const hiddenInSource = page.locator('.ok-mode-hidden').first();
  await expect(hiddenInSource).toHaveCSS('pointer-events', 'none');
  await expect(hiddenInSource).toHaveCSS('position', 'absolute');
});

test('WYSIWYG→Source: typing in ProseMirror appears in CodeMirror', async ({ page, api }) => {
  await openFreshDoc(api, page, 'wysiwyg-to-source');
  await page.locator('.ProseMirror').click();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.insertText('Hello from WYSIWYG');

  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('Hello from WYSIWYG'),
    null,
    { timeout: 10_000 },
  );

  await sourceToggle(page).click();

  const cmContent = await page.locator('.cm-content').textContent();
  expect(cmContent).toContain('Hello from WYSIWYG');
});

test('Source→WYSIWYG: typing in CodeMirror renders in ProseMirror', async ({ page, api }) => {
  await openFreshDoc(api, page, 'source-to-wysiwyg');
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');

  await page.locator('.cm-content').click();
  await expect(page.locator('.cm-content')).toBeFocused();
  await page.keyboard.insertText('# Source Heading\n\nParagraph from source.');

  await page.waitForFunction(
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('Source Heading'),
    null,
    { timeout: 10_000 },
  );

  await visualToggle(page).click();

  await page.waitForFunction(
    () => {
      const content = document.querySelector('.ProseMirror')?.textContent ?? '';
      return content.includes('Source Heading') && content.includes('Paragraph from source');
    },
    null,
    { timeout: 10_000 },
  );

  const pmContent = await page.locator('.ProseMirror').textContent();
  expect(pmContent).toContain('Source Heading');
  expect(pmContent).toContain('Paragraph from source');
});

test('round-trip: edits in both modes survive toggle cycle', async ({ page, api }) => {
  await openFreshDoc(api, page, 'round-trip');
  await page.locator('.ProseMirror').click();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.insertText('WYSIWYG edit');

  await page.waitForFunction(
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('WYSIWYG edit'),
    null,
    { timeout: 10_000 },
  );

  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');
  await page.locator('.cm-content').click();
  await expect(page.locator('.cm-content')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.insertText('\n\nSource edit');

  await page.waitForFunction(
    () => {
      const txt = window.__activeProvider?.document?.getText('source')?.toString();
      return txt?.includes('WYSIWYG edit') && txt?.includes('Source edit');
    },
    null,
    { timeout: 10_000 },
  );

  await visualToggle(page).click();

  await page.waitForFunction(
    () => {
      const content = document.querySelector('.ProseMirror')?.textContent ?? '';
      return content.includes('WYSIWYG edit') && content.includes('Source edit');
    },
    null,
    { timeout: 10_000 },
  );

  const pmContent = await page.locator('.ProseMirror').textContent();
  expect(pmContent).toContain('WYSIWYG edit');
  expect(pmContent).toContain('Source edit');
});

test('concurrent agent write: user + agent content coexist', async ({ page, api, baseURL }) => {
  const docName = await openFreshDoc(api, page, 'concurrent-agent');
  await page.locator('.ProseMirror').click();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.insertText('User typing');

  await page.waitForFunction(
    () => window.__activeProvider?.document?.getText('source')?.toString()?.includes('User typing'),
    null,
    { timeout: 10_000 },
  );

  const res = await fetch(`${baseURL}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, markdown: '## Agent Section\n\nAgent content here.' }),
  });
  expect(res.ok).toBe(true);

  await page.waitForFunction(
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('Agent Section'),
    null,
    { timeout: 10_000 },
  );

  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');

  const sourceContent = await getYText(page);
  expect(sourceContent).toContain('User typing');
  expect(sourceContent).toContain('Agent Section');
  expect(sourceContent).toContain('Agent content here');
});

test('sidebar folder: row click navigates to folder overview; treeitem toggles expand/collapse', async ({
  page,
}) => {
  await page.goto('/');
  const folderRow = page.getByRole('treeitem', { name: 'sidebar-folder', exact: true });
  const nestedFile = page.getByRole('treeitem', { name: 'nested-doc.md', exact: true });

  await expect(folderRow).toBeVisible();
  await expect(folderRow).toHaveAttribute('aria-expanded', 'false');
  await expect(nestedFile).toHaveCount(0);

  await folderRow.focus();
  await folderRow.press('ArrowRight');
  await expect(folderRow).toHaveAttribute('aria-expanded', 'true');
  await expect(nestedFile).toBeVisible();

  await folderRow.press('ArrowLeft');
  await expect(folderRow).toHaveAttribute('aria-expanded', 'false');
  await expect(nestedFile).toHaveCount(0);

  await folderRow.press('ArrowRight');
  await expect(folderRow).toHaveAttribute('aria-expanded', 'true');
  await expect(nestedFile).toBeVisible();

  await nestedFile.click();
  await expect(page).toHaveURL(/#\/sidebar-folder\/nested-doc$/);

  await folderRow.focus();
  await folderRow.press('ArrowLeft');
  await expect(folderRow).toHaveAttribute('aria-expanded', 'true');
  await expect(nestedFile).toBeVisible();

  await folderRow.click();
  await expect(page).toHaveURL(/#\/sidebar-folder$/);
});

test('markdown link edit dialog preserves page mode while clearing and updates the href target', async ({
  page,
  api,
}) => {
  const docName = await openFreshDoc(api, page, 'link-edit');
  const doc = '[Beta page](beta.md)';

  await api.replaceDoc(docName, doc);

  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('[Beta page](beta.md)'),
    null,
    { timeout: 10_000 },
  );

  const chip = page.locator('span[data-link]').first();
  await expect(chip).toBeVisible({ timeout: 10_000 });

  await chip.click();
  const propPanel = page.locator('[data-ok-prop-panel="internal-link"]');
  await expect(propPanel).toBeVisible({ timeout: 5_000 });

  await propPanel.getByRole('button', { name: 'Edit' }).click();

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

  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('[Beta page](./sidebar-folder/nested-doc.md)'),
    null,
    { timeout: 10_000 },
  );
});
