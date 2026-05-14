import { randomUUID } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { type ApiHelpers, createPngBuffer, expect, test, type WorkerServer } from './_helpers';

function testId(): string {
  return randomUUID().slice(0, 8);
}

async function seedDocs(
  api: ApiHelpers,
  docs: Array<{ name: string; path: string; markdown: string }>,
) {
  await api.testReset();
  for (const doc of docs) {
    await api.createPage(doc.path);
  }
  for (const doc of docs) {
    await api.replaceDoc(doc.name, doc.markdown);
  }
}

async function seedMarkdownDocs(api: ApiHelpers, docs: Array<{ name: string; markdown: string }>) {
  await seedDocs(
    api,
    docs.map((doc) => ({ ...doc, path: `${doc.name}.md` })),
  );
}

async function seedMdxDocs(api: ApiHelpers, docs: Array<{ name: string; markdown: string }>) {
  await seedDocs(
    api,
    docs.map((doc) => ({ ...doc, path: `${doc.name}.mdx` })),
  );
}

async function deletePathIfExists(
  baseURL: string,
  kind: 'file' | 'folder',
  path: string,
): Promise<void> {
  const response = await fetch(`${baseURL}/api/delete-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, path }),
  });
  if (response.ok || response.status === 404) return;
  throw new Error(`delete-path failed for ${kind}:${path}: ${response.status}`);
}

async function clearVisibleContentEntries(workerServer: WorkerServer): Promise<void> {
  for (const entry of readdirSync(workerServer.contentDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      await deletePathIfExists(workerServer.baseURL, 'folder', entry.name);
      continue;
    }
    const docPath = entry.name.replace(/\.(md|mdx)$/i, '');
    if (docPath !== entry.name) {
      await deletePathIfExists(workerServer.baseURL, 'file', docPath);
      continue;
    }
    rmSync(join(workerServer.contentDir, entry.name), { recursive: true, force: true });
  }
}

async function installLocalTabSession(
  page: Page,
  state: {
    openTabs: string[];
    pinnedTabIds?: string[];
    activeDocName: string | null;
    activeTabId: string | null;
  },
) {
  await page.addInitScript((sessionState) => {
    window.localStorage.setItem(
      `ok-editor-tabs-v1:${window.location.origin}`,
      JSON.stringify({
        pinnedTabIds: [],
        ...sessionState,
        updatedAt: '2026-05-12T00:00:00.000Z',
      }),
    );
  }, state);
}

function editorTabButtons(page: Page, accessibleLabel: string): Locator {
  return page.getByRole('main').getByRole('button', { name: accessibleLabel, exact: true });
}

function activeEditorTabButtons(page: Page, accessibleLabel: string): Locator {
  return page
    .getByRole('main')
    .locator('[data-active-tab="true"]')
    .getByRole('button', { name: accessibleLabel, exact: true });
}

function activateNewTabButtons(page: Page): Locator {
  return page.getByRole('main').getByRole('button', { name: 'Activate new tab', exact: true });
}

function closeNewTabButtons(page: Page): Locator {
  return page.getByRole('main').getByRole('button', { name: 'Close new tab', exact: true });
}

function sidebarTreeItem(page: Page, accessibleLabel: string): Locator {
  return page
    .locator('[data-slot="sidebar-container"]')
    .getByRole('treeitem', { name: accessibleLabel, exact: true });
}

function editorTabChrome(tabButton: Locator): Locator {
  return tabButton.locator('xpath=ancestor::div[@role="presentation"][1]');
}

async function expectActiveTab(tabButton: Locator) {
  await expect(editorTabChrome(tabButton)).toHaveAttribute('data-active-tab', 'true');
}

async function expectInactiveTab(tabButton: Locator) {
  await expect(editorTabChrome(tabButton)).not.toHaveAttribute('data-active-tab', 'true');
}

async function clickNewTabCloseButton(page: Page, index: number) {
  const tabButton = activateNewTabButtons(page).nth(index);
  const closeButton = closeNewTabButtons(page).nth(index);
  await editorTabChrome(tabButton).hover();
  await closeButton.click();
}

async function expectPersistedTabSession(
  page: Page,
  expected: { openTabs: string[]; activeTabId: string | null },
) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem(`ok-editor-tabs-v1:${window.location.origin}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { openTabs?: unknown; activeTabId?: unknown };
        return {
          openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs : null,
          activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
        };
      }),
    )
    .toEqual(expected);
}

async function expectPersistedPinnedTabs(page: Page, expected: string[]) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem(`ok-editor-tabs-v1:${window.location.origin}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { pinnedTabIds?: unknown };
        return Array.isArray(parsed.pinnedTabIds) ? parsed.pinnedTabIds : null;
      }),
    )
    .toEqual(expected);
}

async function editorTabOrder(page: Page): Promise<string[]> {
  return page.locator('header div[role="presentation"]').evaluateAll((tabEls) =>
    tabEls.flatMap((tabEl) => {
      const newTabButton = tabEl.querySelector('button[aria-label="Activate new tab"]');
      if (newTabButton) return ['new-tab'];
      const primaryButton = [...tabEl.querySelectorAll('button[aria-label]')].find((button) => {
        const label = button.getAttribute('aria-label') ?? '';
        return label.length > 0 && !label.startsWith('Close ');
      });
      const label = primaryButton?.getAttribute('aria-label');
      return label ? [label] : [];
    }),
  );
}

async function expectDocumentListContainsAsset(baseURL: string, assetPath: string) {
  await expect
    .poll(
      async () => {
        const response = await fetch(`${baseURL}/api/documents`);
        const body = (await response.json()) as {
          documents?: Array<{ kind?: string; path?: string }>;
        };
        return body.documents?.some((entry) => entry.kind === 'asset' && entry.path === assetPath);
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

async function seedReferencedAssetDoc(
  api: ApiHelpers,
  workerServer: WorkerServer,
  docName: string,
  assetPath: string,
) {
  const markdown = `![Asset tab](${assetPath})\n`;

  await api.testReset();
  writeFileSync(join(workerServer.contentDir, assetPath), createPngBuffer(assetPath));
  await api.createPage(`${docName}.md`);
  await api.replaceDoc(docName, markdown);

  writeFileSync(join(workerServer.contentDir, `${docName}.md`), markdown);
  await api.createPage(`${docName}-asset-index-bump.md`);
  await expectDocumentListContainsAsset(workerServer.baseURL, assetPath);
}

test.describe('Editor tabs', () => {
  test('clicking New tab repeatedly creates multiple blank tabs', async ({ page, api }) => {
    const id = testId();
    const docName = `new-tab-repeat-${id}`;

    await seedMarkdownDocs(api, [{ name: docName, markdown: `# New Tab Repeat ${id}` }]);

    await page.goto(`/#/${docName}`);
    await expect(editorTabButtons(page, `${docName}.md`)).toHaveCount(1, { timeout: 10_000 });

    const newTabButton = page
      .getByRole('main')
      .getByRole('button', { name: 'New tab', exact: true });
    await newTabButton.click();
    await newTabButton.click();
    await newTabButton.click();

    await expect(closeNewTabButtons(page)).toHaveCount(3);
  });

  test('closing multiple new tabs preserves active placeholder and falls back to document tab', async ({
    page,
    api,
  }) => {
    const id = testId();
    const docName = `new-tab-close-${id}`;
    const label = `${docName}.md`;

    await seedMarkdownDocs(api, [{ name: docName, markdown: `# New Tab Close ${id}` }]);

    await page.goto(`/#/${docName}`);
    const docTab = editorTabButtons(page, label);
    await expect(docTab).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(docTab.first());

    const newTabButton = page
      .getByRole('main')
      .getByRole('button', { name: 'New tab', exact: true });
    await newTabButton.click();
    await newTabButton.click();
    await newTabButton.click();

    const newTabs = activateNewTabButtons(page);
    await expect(newTabs).toHaveCount(3);
    await expectActiveTab(newTabs.nth(2));
    await expectInactiveTab(docTab.first());

    await newTabs.nth(1).click();
    await expectActiveTab(newTabs.nth(1));

    await clickNewTabCloseButton(page, 0);
    await expect(newTabs).toHaveCount(2);
    await expectActiveTab(newTabs.nth(0));
    await expectInactiveTab(newTabs.nth(1));

    await clickNewTabCloseButton(page, 0);
    await expect(newTabs).toHaveCount(1);
    await expectActiveTab(newTabs.first());

    await clickNewTabCloseButton(page, 0);
    await expect(newTabs).toHaveCount(0);
    await expectActiveTab(docTab.first());
  });

  test('clicking New tab clears the active sidebar file selection', async ({ page, api }) => {
    const id = testId();
    const docName = `new-tab-sidebar-${id}`;
    const label = `${docName}.md`;

    await seedMarkdownDocs(api, [{ name: docName, markdown: `# New Tab Sidebar ${id}` }]);

    await page.goto(`/#/${docName}`);
    const sidebarItem = sidebarTreeItem(page, label);
    await expect(editorTabButtons(page, label)).toHaveCount(1, { timeout: 10_000 });
    await expect(sidebarItem).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('main').getByRole('button', { name: 'New tab', exact: true }).click();

    await expect(activateNewTabButtons(page)).toHaveCount(1);
    await expect(sidebarItem).not.toHaveAttribute('aria-selected', 'true');
  });

  test('sidebar click fills the active third new tab in place', async ({ page, api }) => {
    const id = testId();
    const firstDoc = `new-tab-fill-first-${id}`;
    const selectedDoc = `new-tab-fill-selected-${id}`;
    const firstLabel = `${firstDoc}.md`;
    const selectedLabel = `${selectedDoc}.md`;

    await seedMarkdownDocs(api, [
      { name: firstDoc, markdown: `# First ${id}` },
      { name: selectedDoc, markdown: `# Selected ${id}` },
    ]);

    await page.goto(`/#/${firstDoc}`);
    const firstTab = editorTabButtons(page, firstLabel);
    await expect(firstTab).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(firstTab.first());

    const newTabButton = page
      .getByRole('main')
      .getByRole('button', { name: 'New tab', exact: true });
    await newTabButton.click();
    await newTabButton.click();
    await newTabButton.click();

    const newTabs = activateNewTabButtons(page);
    await expect(newTabs).toHaveCount(3);
    await newTabs.nth(2).click();
    await expectActiveTab(newTabs.nth(2));

    await sidebarTreeItem(page, selectedLabel).click();

    const selectedTab = editorTabButtons(page, selectedLabel);
    await expect(selectedTab).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(selectedTab.first());
    await expect(activateNewTabButtons(page)).toHaveCount(2);
    await expect
      .poll(() => editorTabOrder(page))
      .toEqual([firstLabel, 'new-tab', 'new-tab', selectedLabel]);
  });

  test('sidebar folder click replaces the active file tab with the folder tab', async ({
    page,
    api,
  }) => {
    const id = testId();
    const fileDoc = `folder-click-file-${id}`;
    const folder = `folder-click-${id}`;
    const nestedDoc = `${folder}/nested-${id}`;
    const fileLabel = `${fileDoc}.md`;
    const folderLabel = `${folder}/`;

    await seedMarkdownDocs(api, [
      { name: fileDoc, markdown: `# File ${id}` },
      { name: nestedDoc, markdown: `# Nested ${id}` },
    ]);

    await page.goto(`/#/${fileDoc}`);
    const fileTabs = editorTabButtons(page, fileLabel);
    const folderTabs = editorTabButtons(page, folderLabel);
    await expect(fileTabs).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(fileTabs.first());

    await sidebarTreeItem(page, folder).click();

    await expect(page).toHaveURL(new RegExp(`#/${folder}/$`));
    await expect(fileTabs).toHaveCount(0);
    await expect(folderTabs).toHaveCount(1);
    await expectActiveTab(folderTabs.first());
  });

  test('sidebar asset click replaces the active file tab with an asset tab', async ({
    page,
    api,
    workerServer,
  }) => {
    const id = testId();
    const docName = `asset-tab-doc-${id}`;
    const docLabel = `${docName}.md`;
    const assetPath = `asset-tab-${id}.png`;

    await seedReferencedAssetDoc(api, workerServer, docName, assetPath);

    await page.goto(`/#/${docName}`);
    const docTab = editorTabButtons(page, docLabel);
    await expect(docTab).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(docTab.first());

    await sidebarTreeItem(page, assetPath).click();

    const assetTab = editorTabButtons(page, assetPath);
    await expect(docTab).toHaveCount(0);
    await expect(assetTab).toHaveCount(1);
    await expectActiveTab(assetTab.first());
    await expect.poll(() => editorTabOrder(page)).toEqual([assetPath]);
    await expect(page).toHaveURL(new RegExp(`#/__asset__/${assetPath.replace('.', '\\.')}$`));
  });

  test('sidebar asset click fills an active new tab even when that asset is already open', async ({
    page,
    api,
    workerServer,
  }) => {
    const id = testId();
    const docName = `asset-new-tab-doc-${id}`;
    const assetPath = `asset-new-tab-${id}.png`;
    const assetTabId = `\u0000asset:${assetPath}`;
    const duplicateAssetTabId = `${assetTabId}\u0000doc-tab:1`;

    await seedReferencedAssetDoc(api, workerServer, docName, assetPath);

    await page.goto(`/#/__asset__/${assetPath}`);
    const assetTabs = editorTabButtons(page, assetPath);
    await expect(assetTabs).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(assetTabs.first());

    await page.getByRole('main').getByRole('button', { name: 'New tab', exact: true }).click();
    await expect(activateNewTabButtons(page)).toHaveCount(1);
    await expectActiveTab(activateNewTabButtons(page).first());

    await sidebarTreeItem(page, assetPath).click();

    await expect(assetTabs).toHaveCount(2);
    await expect(activateNewTabButtons(page)).toHaveCount(0);
    await expect(activeEditorTabButtons(page, assetPath)).toHaveCount(1);
    await expect.poll(() => editorTabOrder(page)).toEqual([assetPath, assetPath]);
    await expectPersistedTabSession(page, {
      openTabs: [assetTabId, duplicateAssetTabId],
      activeTabId: duplicateAssetTabId,
    });
  });

  test('sidebar folder click fills an active new tab even when that folder is already open', async ({
    page,
    api,
  }) => {
    const id = testId();
    const folder = `folder-new-tab-${id}`;
    const nestedDoc = `${folder}/nested-${id}`;
    const folderLabel = `${folder}/`;
    const folderTabId = `\u0000folder:${folder}`;
    const duplicateFolderTabId = `${folderTabId}\u0000doc-tab:1`;

    await seedMarkdownDocs(api, [{ name: nestedDoc, markdown: `# Nested ${id}` }]);

    await page.goto(`/#/${folder}/`);
    const folderTabs = editorTabButtons(page, folderLabel);
    await expect(folderTabs).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(folderTabs.first());

    await page.getByRole('main').getByRole('button', { name: 'New tab', exact: true }).click();
    await expect(activateNewTabButtons(page)).toHaveCount(1);
    await expectActiveTab(activateNewTabButtons(page).first());

    await sidebarTreeItem(page, folder).click();

    await expect(folderTabs).toHaveCount(2);
    await expect(activateNewTabButtons(page)).toHaveCount(0);
    await expect(activeEditorTabButtons(page, folderLabel)).toHaveCount(1);
    await expect.poll(() => editorTabOrder(page)).toEqual([folderLabel, folderLabel]);
    await expectPersistedTabSession(page, {
      openTabs: [folderTabId, duplicateFolderTabId],
      activeTabId: duplicateFolderTabId,
    });
  });

  test('sidebar click replaces active bar.md with a second foo.md tab', async ({ page, api }) => {
    const id = testId();
    const fooDoc = `foo-${id}`;
    const barDoc = `bar-${id}`;
    const fooLabel = `${fooDoc}.md`;
    const barLabel = `${barDoc}.md`;

    await seedMarkdownDocs(api, [
      { name: fooDoc, markdown: `# Foo ${id}` },
      { name: barDoc, markdown: `# Bar ${id}` },
    ]);

    await page.goto(`/#/${fooDoc}`);
    const fooTabs = editorTabButtons(page, fooLabel);
    const barTabs = editorTabButtons(page, barLabel);
    await expect(fooTabs).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(fooTabs.first());

    await page.getByRole('main').getByRole('button', { name: 'New tab', exact: true }).click();
    await sidebarTreeItem(page, barLabel).click();
    await expect(barTabs).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(barTabs.first());
    await expectInactiveTab(fooTabs.first());

    await sidebarTreeItem(page, fooLabel).click();

    await expect(fooTabs).toHaveCount(2);
    await expect(barTabs).toHaveCount(0);
    await expectInactiveTab(fooTabs.nth(0));
    await expectActiveTab(fooTabs.nth(1));
  });

  test('sidebar click from a restored foo.md/bar.md session replaces bar.md with a duplicate foo.md tab', async ({
    page,
    api,
  }) => {
    const id = testId();
    const fooDoc = `foo-restored-${id}`;
    const barDoc = `bar-restored-${id}`;
    const fooLabel = `${fooDoc}.md`;
    const barLabel = `${barDoc}.md`;

    await seedMarkdownDocs(api, [
      { name: fooDoc, markdown: `# Foo Restored ${id}` },
      { name: barDoc, markdown: `# Bar Restored ${id}` },
    ]);

    await installLocalTabSession(page, {
      openTabs: [fooDoc, barDoc],
      activeDocName: barDoc,
      activeTabId: barDoc,
    });

    await page.goto(`/#/${barDoc}`);
    const fooTabs = editorTabButtons(page, fooLabel);
    const barTabs = editorTabButtons(page, barLabel);
    await expect(fooTabs).toHaveCount(1, { timeout: 10_000 });
    await expect(barTabs).toHaveCount(1);
    await expectInactiveTab(fooTabs.first());
    await expectActiveTab(barTabs.first());

    await sidebarTreeItem(page, fooLabel).click();

    await expect(fooTabs).toHaveCount(2);
    await expect(barTabs).toHaveCount(0);
    await expectInactiveTab(fooTabs.nth(0));
    await expectActiveTab(fooTabs.nth(1));
    await expectPersistedTabSession(page, {
      openTabs: [fooDoc, `${fooDoc}\u0000doc-tab:1`],
      activeTabId: `${fooDoc}\u0000doc-tab:1`,
    });
  });

  test('refresh preserves three tabs when two point at the same file', async ({ page, api }) => {
    const id = testId();
    const fooDoc = `foo-refresh-${id}`;
    const barDoc = `bar-refresh-${id}`;
    const fooLabel = `${fooDoc}.md`;
    const barLabel = `${barDoc}.md`;

    await seedMarkdownDocs(api, [
      { name: fooDoc, markdown: `# Foo Refresh ${id}` },
      { name: barDoc, markdown: `# Bar Refresh ${id}` },
    ]);

    await page.goto(`/#/${fooDoc}`);
    const fooTabs = editorTabButtons(page, fooLabel);
    const barTabs = editorTabButtons(page, barLabel);
    await expect(fooTabs).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(fooTabs.first());

    await page.getByRole('main').getByRole('button', { name: 'New tab', exact: true }).click();
    await sidebarTreeItem(page, barLabel).click();
    await expect(fooTabs).toHaveCount(1);
    await expect(barTabs).toHaveCount(1);
    await expectActiveTab(barTabs.first());

    await page.getByRole('main').getByRole('button', { name: 'New tab', exact: true }).click();
    await sidebarTreeItem(page, fooLabel).click();
    await expect(fooTabs).toHaveCount(2);
    await expect(barTabs).toHaveCount(1);
    await expectInactiveTab(fooTabs.nth(0));
    await expectActiveTab(fooTabs.nth(1));
    await expectPersistedTabSession(page, {
      openTabs: [fooDoc, barDoc, `${fooDoc}\u0000doc-tab:1`],
      activeTabId: `${fooDoc}\u0000doc-tab:1`,
    });

    await page.reload();

    await expect(fooTabs).toHaveCount(2, { timeout: 10_000 });
    await expect(barTabs).toHaveCount(1);
    await expectInactiveTab(fooTabs.nth(0));
    await expectActiveTab(fooTabs.nth(1));
    await expectPersistedTabSession(page, {
      openTabs: [fooDoc, barDoc, `${fooDoc}\u0000doc-tab:1`],
      activeTabId: `${fooDoc}\u0000doc-tab:1`,
    });
  });

  test('renaming one duplicate file tab does not restyle the sibling duplicate tab', async ({
    page,
    api,
  }) => {
    const id = testId();
    const fooDoc = `foo-duplicate-rename-${id}`;
    const duplicateFooTabId = `${fooDoc}\u0000doc-tab:1`;
    const fooLabel = `${fooDoc}.md`;

    await seedMarkdownDocs(api, [{ name: fooDoc, markdown: `# Foo Duplicate Rename ${id}` }]);

    await installLocalTabSession(page, {
      openTabs: [fooDoc, duplicateFooTabId],
      activeDocName: fooDoc,
      activeTabId: fooDoc,
    });

    await page.goto(`/#/${fooDoc}`);
    const fooTabs = editorTabButtons(page, fooLabel);
    await expect(fooTabs).toHaveCount(2, { timeout: 10_000 });

    await fooTabs.nth(0).dblclick();

    await expect(
      page.getByRole('main').getByRole('textbox', { name: `Rename ${fooLabel}` }),
    ).toHaveCount(1);
    await expect(fooTabs).toHaveCount(1);
  });

  test('tab click selects the already-open foo.md tab without rewriting the bar.md tab', async ({
    page,
    api,
  }) => {
    const id = testId();
    const fooDoc = `foo-click-${id}`;
    const barDoc = `bar-click-${id}`;
    const fooLabel = `${fooDoc}.md`;
    const barLabel = `${barDoc}.md`;

    await seedMarkdownDocs(api, [
      { name: fooDoc, markdown: `# Foo Click ${id}` },
      { name: barDoc, markdown: `# Bar Click ${id}` },
    ]);

    await page.goto(`/#/${fooDoc}`);
    const fooTabs = editorTabButtons(page, fooLabel);
    const barTabs = editorTabButtons(page, barLabel);
    await expect(fooTabs).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(fooTabs.first());

    await page.getByRole('main').getByRole('button', { name: 'New tab', exact: true }).click();
    await sidebarTreeItem(page, barLabel).click();
    await expect(barTabs).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(barTabs.first());
    await expectInactiveTab(fooTabs.first());

    await fooTabs.first().click();

    await expect(fooTabs).toHaveCount(1);
    await expect(barTabs).toHaveCount(1);
    await expectActiveTab(fooTabs.first());
    await expectInactiveTab(barTabs.first());
  });

  test('sidebar click replaces the active .mdx tab with a duplicate of an already-open .mdx tab', async ({
    page,
    api,
    workerServer,
  }) => {
    const id = testId();
    const folder = `tab-${id}`;
    const barDoc = `${folder}/bar-${id}`;
    const bazDoc = `${folder}/baz-${id}`;
    const helloDoc = `hello-${id}`;
    const barLabel = `${folder}/bar-${id}.mdx`;
    const helloLabel = `hello-${id}.mdx`;

    await clearVisibleContentEntries(workerServer);
    await seedMdxDocs(api, [
      { name: barDoc, markdown: `# Bar ${id}` },
      { name: bazDoc, markdown: `# Baz ${id}` },
      { name: helloDoc, markdown: `# Hello ${id}` },
    ]);
    await installLocalTabSession(page, {
      openTabs: [barDoc],
      activeDocName: barDoc,
      activeTabId: barDoc,
    });

    await page.goto(`/#/${barDoc}`);
    await expect(editorTabButtons(page, barLabel)).toHaveCount(1, { timeout: 10_000 });

    await page.getByRole('main').getByRole('button', { name: 'New tab', exact: true }).click();
    await expect(closeNewTabButtons(page)).toHaveCount(1, { timeout: 10_000 });
    await sidebarTreeItem(page, `hello-${id}.mdx`).click();
    await expect(editorTabButtons(page, helloLabel)).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(editorTabButtons(page, helloLabel).first());

    await sidebarTreeItem(page, `bar-${id}.mdx`).click();

    const barTabs = editorTabButtons(page, barLabel);
    await expect(barTabs).toHaveCount(2);
    await expect(editorTabButtons(page, helloLabel)).toHaveCount(0);
    await expectInactiveTab(barTabs.nth(0));
    await expectActiveTab(barTabs.nth(1));
  });

  test('clicking the second duplicate .mdx tab activates that exact tab instance', async ({
    page,
    api,
  }) => {
    const id = testId();
    const folder = `dup-${id}`;
    const barDoc = `${folder}/bar-${id}`;
    const barLabel = `${folder}/bar-${id}.mdx`;

    await seedMdxDocs(api, [{ name: barDoc, markdown: `# Duplicate Bar ${id}` }]);

    await installLocalTabSession(page, {
      openTabs: [barDoc, `${barDoc}\u0000doc-tab:1`],
      activeDocName: barDoc,
      activeTabId: barDoc,
    });

    const duplicateTabs = editorTabButtons(page, barLabel);
    await page.goto(`/#/${barDoc}`);
    await expect(duplicateTabs).toHaveCount(2, { timeout: 10_000 });
    await expectActiveTab(duplicateTabs.nth(0));
    await expectInactiveTab(duplicateTabs.nth(1));

    await duplicateTabs.nth(1).click();
    await expectActiveTab(duplicateTabs.nth(1));
    await expectInactiveTab(duplicateTabs.nth(0));

    await duplicateTabs.nth(0).click();
    await expectActiveTab(duplicateTabs.nth(0));
    await expectInactiveTab(duplicateTabs.nth(1));
  });

  test('pinning a tab replaces close with pin and bulk close keeps it open', async ({
    page,
    api,
  }) => {
    const id = testId();
    const pinnedDoc = `pinned-${id}`;
    const otherDoc = `other-${id}`;
    const pinnedLabel = `${pinnedDoc}.md`;
    const otherLabel = `${otherDoc}.md`;

    await seedMarkdownDocs(api, [
      { name: pinnedDoc, markdown: `# Pinned ${id}` },
      { name: otherDoc, markdown: `# Other ${id}` },
    ]);

    await installLocalTabSession(page, {
      openTabs: [pinnedDoc, otherDoc],
      activeDocName: otherDoc,
      activeTabId: otherDoc,
    });

    await page.goto(`/#/${otherDoc}`);
    const pinnedTab = editorTabButtons(page, pinnedLabel);
    const otherTab = editorTabButtons(page, otherLabel);
    await expect(pinnedTab).toHaveCount(1, { timeout: 10_000 });
    await expect(otherTab).toHaveCount(1);

    await pinnedTab.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Pin tab', exact: true }).click();

    await expect(
      editorTabChrome(pinnedTab.first()).getByRole('button', { name: `Unpin ${pinnedLabel}` }),
    ).toHaveCount(1);
    await expect(
      editorTabChrome(pinnedTab.first()).getByRole('button', { name: `Close ${pinnedLabel}` }),
    ).toHaveCount(0);
    await expectPersistedPinnedTabs(page, [pinnedDoc]);

    await otherTab.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Close all unpinned', exact: true }).click();

    await expect(pinnedTab).toHaveCount(1);
    await expect(otherTab).toHaveCount(0);
    await expectActiveTab(pinnedTab.first());
    await expectPersistedTabSession(page, {
      openTabs: [pinnedDoc],
      activeTabId: pinnedDoc,
    });
    await expectPersistedPinnedTabs(page, [pinnedDoc]);

    await editorTabChrome(pinnedTab.first())
      .getByRole('button', { name: `Unpin ${pinnedLabel}` })
      .click();
    await expectPersistedPinnedTabs(page, []);
    await expect(
      editorTabChrome(pinnedTab.first()).getByRole('button', { name: `Close ${pinnedLabel}` }),
    ).toHaveCount(1);
  });

  test('sidebar click from an active pinned tab opens a new tab instead of replacing it', async ({
    page,
    api,
  }) => {
    const id = testId();
    const pinnedDoc = `active-pinned-${id}`;
    const otherDoc = `sidebar-open-${id}`;
    const pinnedLabel = `${pinnedDoc}.md`;
    const otherLabel = `${otherDoc}.md`;

    await seedMarkdownDocs(api, [
      { name: pinnedDoc, markdown: `# Active Pinned ${id}` },
      { name: otherDoc, markdown: `# Sidebar Open ${id}` },
    ]);

    await installLocalTabSession(page, {
      openTabs: [pinnedDoc],
      activeDocName: pinnedDoc,
      activeTabId: pinnedDoc,
    });

    await page.goto(`/#/${pinnedDoc}`);
    const pinnedTab = editorTabButtons(page, pinnedLabel);
    const otherTab = editorTabButtons(page, otherLabel);
    await expect(pinnedTab).toHaveCount(1, { timeout: 10_000 });
    await expectActiveTab(pinnedTab.first());

    await pinnedTab.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Pin tab', exact: true }).click();
    await expectPersistedPinnedTabs(page, [pinnedDoc]);

    await sidebarTreeItem(page, otherLabel).click();

    await expect(pinnedTab).toHaveCount(1);
    await expect(otherTab).toHaveCount(1);
    await expectInactiveTab(pinnedTab.first());
    await expectActiveTab(otherTab.first());
    await expectPersistedTabSession(page, {
      openTabs: [pinnedDoc, otherDoc],
      activeTabId: otherDoc,
    });
    await expectPersistedPinnedTabs(page, [pinnedDoc]);
  });
});
