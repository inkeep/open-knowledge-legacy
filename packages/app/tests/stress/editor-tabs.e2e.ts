import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { type ApiHelpers, expect, test } from './_helpers';

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

async function installLocalTabSession(
  page: Page,
  state: { openTabs: string[]; activeDocName: string | null; activeTabId: string | null },
) {
  await page.addInitScript((sessionState) => {
    window.localStorage.setItem(
      `ok-editor-tabs-v1:${window.location.origin}`,
      JSON.stringify({ ...sessionState, updatedAt: '2026-05-12T00:00:00.000Z' }),
    );
  }, state);
}

function editorTabButtons(page: Page, accessibleLabel: string): Locator {
  return page.getByRole('main').getByRole('button', { name: accessibleLabel, exact: true });
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
    const closeNewTabs = closeNewTabButtons(page);
    await expect(newTabs).toHaveCount(3);
    await expectActiveTab(newTabs.nth(2));
    await expectInactiveTab(docTab.first());

    await newTabs.nth(1).click();
    await expectActiveTab(newTabs.nth(1));

    await closeNewTabs.nth(0).click();
    await expect(newTabs).toHaveCount(2);
    await expectActiveTab(newTabs.nth(0));
    await expectInactiveTab(newTabs.nth(1));

    await closeNewTabs.nth(0).click();
    await expect(newTabs).toHaveCount(1);
    await expectActiveTab(newTabs.first());

    await closeNewTabs.first().click();
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
  }) => {
    const id = testId();
    const folder = `tab-${id}`;
    const barDoc = `${folder}/bar-${id}`;
    const bazDoc = `${folder}/baz-${id}`;
    const helloDoc = `hello-${id}`;
    const barLabel = `${folder}/bar-${id}.mdx`;
    const helloLabel = `hello-${id}.mdx`;

    await seedMdxDocs(api, [
      { name: barDoc, markdown: `# Bar ${id}` },
      { name: bazDoc, markdown: `# Baz ${id}` },
      { name: helloDoc, markdown: `# Hello ${id}` },
    ]);

    await page.goto(`/#/${barDoc}`);
    await expect(editorTabButtons(page, barLabel)).toHaveCount(1, { timeout: 10_000 });

    await page.getByRole('main').getByRole('button', { name: 'New tab', exact: true }).click();
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
});
