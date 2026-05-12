import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './_helpers';

type DeleteKind = 'file' | 'folder';

async function deletePathIfExists(baseURL: string, kind: DeleteKind, path: string): Promise<void> {
  const res = await fetch(`${baseURL}/api/delete-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, path }),
  });

  if (res.ok || res.status === 404) return;
  throw new Error(`delete-path failed for ${kind}:${path}: ${res.status} ${await res.text()}`);
}

async function createFolder(baseURL: string, path: string): Promise<void> {
  const res = await fetch(`${baseURL}/api/create-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });

  if (res.ok) return;
  throw new Error(`create-folder failed for ${path}: ${res.status} ${await res.text()}`);
}

async function expectDocumentLoads(baseURL: string, docName: string): Promise<void> {
  const res = await fetch(`${baseURL}/api/document?docName=${encodeURIComponent(docName)}`);
  const data: { docName?: string } = await res.json();

  expect(res.status).toBe(200);
  expect(data.docName).toBe(docName);
}

function sidebarTreeItem(page: Page, name: string) {
  return page
    .locator('[data-slot="sidebar-container"]')
    .getByRole('treeitem', { name, exact: true });
}

function sidebarTree(page: Page) {
  return page.locator('[data-slot="sidebar-container"]').getByRole('tree');
}

function defaultName(base: string, index: number) {
  return index === 0 ? base : `${base} ${index + 1}`;
}

async function installDelayedDesktopSessionBridge(
  page: Page,
  workerServer: { baseURL: string; port: number; contentDir: string },
  initialSession: { openTabs: string[]; activeDocName: string | null; activeTabId: string | null },
): Promise<void> {
  await page.addInitScript(
    ({ baseURL, contentDir, initialSession, port }) => {
      const sessionKey = '__okFakeDesktopSession';
      const readSession = () => {
        const raw = window.localStorage.getItem(sessionKey);
        return raw ? JSON.parse(raw) : { ...initialSession, updatedAt: '2026-05-08T00:00:00.000Z' };
      };
      const unsubscribe = () => {};
      const okDesktop = {
        appVersion: 'test',
        platform: 'darwin',
        config: {
          apiOrigin: baseURL,
          collabUrl: `ws://localhost:${port}/collab`,
          mode: 'editor',
          projectName: 'session-restore-test',
          projectPath: contentDir,
        },
        onProjectSwitched: () => unsubscribe,
        onMenuAction: () => unsubscribe,
        onUpdateDownloaded: () => unsubscribe,
        onWhatsNew: () => unsubscribe,
        onUpdateStuckHint: () => unsubscribe,
        onDeepLink: () => unsubscribe,
        dialog: {
          openFolder: async () => null,
        },
        shell: {
          openExternal: async () => {},
          detectProtocol: async () => ({ installed: false }),
          spawnCursor: async () => ({ ok: false, reason: 'not-installed' }),
          recordHandoff: async () => {},
          openAsset: async () => ({ ok: false, reason: 'not-found' }),
          revealAsset: async () => ({ ok: false, reason: 'not-found' }),
          showAssetMenu: async () => {},
          showItemInFolder: async () => {},
        },
        clipboard: { writeText: async () => {} },
        project: {
          listRecent: async () => [],
          getSessionState: () =>
            new Promise((resolve) => {
              window.setTimeout(() => resolve(readSession()), 250);
            }),
          setSessionState: async (state: unknown) => {
            window.localStorage.setItem(sessionKey, JSON.stringify(state));
          },
          open: async () => {},
          createNew: async () => {},
          recordCreateNewBannerShown: async () => {},
          close: async () => {},
        },
        navigator: { open: async () => {} },
        seed: {
          plan: async () => ({ ok: false, error: { kind: 'no-project', message: 'test' } }),
          apply: async () => ({ ok: false, error: { kind: 'no-project', message: 'test' } }),
        },
        skill: {
          detectClaudeDesktop: async () => false,
          buildAndOpen: async () => ({ ok: false, reason: 'build-failed' }),
        },
        update: {
          relaunchNow: async () => {},
          checkNow: async () => {},
        },
        state: {
          query: async () => ({ channel: 'latest', schemaIncompatibility: null }),
          resetIncompatible: async () => {},
        },
        mcpWiring: {
          onShow: () => unsubscribe,
          signalReady: () => {},
          confirm: async () => ({ ok: true }),
          skip: async () => ({ ok: true }),
        },
        localOp: {
          auth: {
            start: () => ({ events: [][Symbol.asyncIterator](), cancel: () => {} }),
          },
          clone: {
            start: () => ({ events: [][Symbol.asyncIterator](), cancel: () => {} }),
          },
          authStatus: async () => ({ authenticated: false, host: 'github.com' }),
          authRepos: async () => ({ ok: true, host: 'github.com', repos: [] }),
        },
        setThemeSource: async () => ({ ok: true as const }),
        signalThemeApplied: () => {},
      };
      (window as unknown as { okDesktop: typeof okDesktop }).okDesktop = okDesktop;
    },
    { ...workerServer, initialSession },
  );
}

test.describe('FileTree sidebar create', () => {
  test.describe.configure({ mode: 'serial' });

  test('desktop refresh preserves restored tabs while hash navigation is opening', async ({
    page,
    workerServer,
  }) => {
    await installDelayedDesktopSessionBridge(page, workerServer, {
      openTabs: ['test-doc', 'sidebar-folder/nested-doc'],
      activeDocName: 'sidebar-folder/nested-doc',
      activeTabId: 'sidebar-folder/nested-doc',
    });

    await page.goto('/#/test-doc');
    await expect(page.getByRole('button', { name: 'test-doc.md', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('button', { name: 'sidebar-folder/nested-doc.md', exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByRole('button', { name: 'test-doc.md', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('button', { name: 'sidebar-folder/nested-doc.md', exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('deletes the selected sidebar items from a selected item context menu', async ({
    page,
    workerServer,
    api,
  }) => {
    await api.createPage('zz-bulk-delete-a.md');
    await api.createPage('zz-bulk-delete-b.md');

    try {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      await sidebarTreeItem(page, 'zz-bulk-delete-a.md').click();
      await sidebarTreeItem(page, 'zz-bulk-delete-b.md').click({
        modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'],
      });
      await expect(sidebarTreeItem(page, 'zz-bulk-delete-a.md')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(sidebarTreeItem(page, 'zz-bulk-delete-b.md')).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await sidebarTreeItem(page, 'zz-bulk-delete-a.md').click({ button: 'right' });
      await page.getByRole('menuitem', { name: /^Delete/ }).click({ timeout: 5_000 });
      await expect(page.getByRole('dialog', { name: /Delete selected items/i })).toBeVisible({
        timeout: 5_000,
      });
      await page.getByRole('button', { name: /^Delete$/ }).click();

      await expect(sidebarTreeItem(page, 'zz-bulk-delete-a.md')).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect(sidebarTreeItem(page, 'zz-bulk-delete-b.md')).toHaveCount(0);
      expect(existsSync(join(workerServer.contentDir, 'zz-bulk-delete-a.md'))).toBe(false);
      expect(existsSync(join(workerServer.contentDir, 'zz-bulk-delete-b.md'))).toBe(false);
    } finally {
      await api.createPage('test-doc.md');
      await api.createPage('sidebar-folder/nested-doc.md');
    }
  });

  test('cmd+a bulk delete closes selected file and folder tabs', async ({
    page,
    workerServer,
    api,
  }) => {
    const docNames = ['zz-tab-delete-a', 'zz-tab-delete-b'];
    const folderNames = ['zz-tab-delete-folder-a', 'zz-tab-delete-folder-b'];

    for (const docName of docNames) {
      await deletePathIfExists(workerServer.baseURL, 'file', docName);
    }
    for (const folderName of folderNames) {
      await deletePathIfExists(workerServer.baseURL, 'folder', folderName);
    }
    await Promise.all(docNames.map((docName) => api.createPage(`${docName}.md`)));
    await Promise.all(
      folderNames.map((folderName) => createFolder(workerServer.baseURL, folderName)),
    );

    try {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      for (const docName of docNames) {
        await sidebarTreeItem(page, `${docName}.md`).click();
        await expect(page.getByRole('button', { name: `${docName}.md`, exact: true })).toBeVisible({
          timeout: 10_000,
        });
      }
      for (const folderName of folderNames) {
        await sidebarTreeItem(page, folderName).click();
        await expect(page.getByRole('button', { name: `${folderName}/`, exact: true })).toBeVisible(
          { timeout: 10_000 },
        );
      }

      await sidebarTreeItem(page, `${docNames[0]}.md`).click();
      await sidebarTree(page).focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      for (const docName of docNames) {
        await expect(sidebarTreeItem(page, `${docName}.md`)).toHaveAttribute(
          'aria-selected',
          'true',
        );
      }
      for (const folderName of folderNames) {
        await expect(sidebarTreeItem(page, folderName)).toHaveAttribute('aria-selected', 'true');
      }

      await sidebarTreeItem(page, `${docNames[0]}.md`).click({ button: 'right' });
      await page.getByRole('menuitem', { name: /^Delete/ }).click({ timeout: 5_000 });
      await expect(page.getByRole('dialog', { name: /Delete selected items/i })).toBeVisible({
        timeout: 5_000,
      });
      await page.getByRole('button', { name: /^Delete$/ }).click();

      for (const docName of docNames) {
        await expect(sidebarTreeItem(page, `${docName}.md`)).toHaveCount(0, { timeout: 10_000 });
        await expect(page.getByRole('button', { name: `${docName}.md`, exact: true })).toHaveCount(
          0,
        );
        expect(existsSync(join(workerServer.contentDir, `${docName}.md`))).toBe(false);
      }
      for (const folderName of folderNames) {
        await expect(sidebarTreeItem(page, folderName)).toHaveCount(0, { timeout: 10_000 });
        await expect(page.getByRole('button', { name: `${folderName}/`, exact: true })).toHaveCount(
          0,
        );
        expect(existsSync(join(workerServer.contentDir, folderName))).toBe(false);
      }
    } finally {
      await api.createPage('test-doc.md');
      await api.createPage('sidebar-folder/nested-doc.md');
    }
  });

  test('bulk delete closes tabs already deleted before a later delete fails', async ({
    page,
    workerServer,
    api,
  }) => {
    const firstDoc = 'zz-partial-delete-a';
    const secondDoc = 'zz-partial-delete-b';

    await deletePathIfExists(workerServer.baseURL, 'file', firstDoc);
    await deletePathIfExists(workerServer.baseURL, 'file', secondDoc);
    await api.createPage(`${firstDoc}.md`);
    await api.createPage(`${secondDoc}.md`);

    await page.route('**/api/delete-path', async (route) => {
      const body = route.request().postDataJSON() as { path?: string } | null;
      if (body?.path === secondDoc) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Injected delete failure' }),
        });
        return;
      }
      await route.fallback();
    });

    try {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      await sidebarTreeItem(page, `${firstDoc}.md`).click();
      await expect(page.getByRole('button', { name: `${firstDoc}.md`, exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await sidebarTreeItem(page, `${secondDoc}.md`).click();
      await expect(page.getByRole('button', { name: `${secondDoc}.md`, exact: true })).toBeVisible({
        timeout: 10_000,
      });

      await sidebarTreeItem(page, `${firstDoc}.md`).click();
      await sidebarTreeItem(page, `${secondDoc}.md`).click({
        modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'],
      });
      await expect(sidebarTreeItem(page, `${firstDoc}.md`)).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(sidebarTreeItem(page, `${secondDoc}.md`)).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await sidebarTreeItem(page, `${firstDoc}.md`).click({ button: 'right' });
      await page.getByRole('menuitem', { name: /^Delete/ }).click({ timeout: 5_000 });
      await expect(page.getByRole('dialog', { name: /Delete selected items/i })).toBeVisible({
        timeout: 5_000,
      });
      await page.getByRole('button', { name: /^Delete$/ }).click();

      await expect(page.getByRole('button', { name: `${firstDoc}.md`, exact: true })).toHaveCount(
        0,
        { timeout: 10_000 },
      );
      await expect(sidebarTreeItem(page, `${firstDoc}.md`)).toHaveCount(0, { timeout: 10_000 });
      await expect(sidebarTreeItem(page, `${secondDoc}.md`)).toBeVisible();
      expect(existsSync(join(workerServer.contentDir, `${firstDoc}.md`))).toBe(false);
      expect(existsSync(join(workerServer.contentDir, `${secondDoc}.md`))).toBe(true);
    } finally {
      await page.unroute('**/api/delete-path');
      await deletePathIfExists(workerServer.baseURL, 'file', firstDoc);
      await deletePathIfExists(workerServer.baseURL, 'file', secondDoc);
      await api.createPage('test-doc.md');
      await api.createPage('sidebar-folder/nested-doc.md');
    }
  });

  test('cmd+a bulk delete closes many default-created file and folder tabs', async ({
    page,
    workerServer,
    api,
  }) => {
    const fileNames = Array.from({ length: 8 }, (_, index) => defaultName('Untitled', index));
    const folderNames = Array.from({ length: 8 }, (_, index) => defaultName('New Folder', index));

    for (const docName of fileNames) {
      await deletePathIfExists(workerServer.baseURL, 'file', docName);
    }
    for (const folderName of folderNames) {
      await deletePathIfExists(workerServer.baseURL, 'folder', folderName);
    }

    try {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      for (const docName of fileNames) {
        await page.getByRole('button', { name: 'New File', exact: true }).click();
        const input = page.getByRole('textbox', {
          name: new RegExp(`rename ${docName}\\.md`, 'i'),
        });
        await expect(input).toBeVisible({ timeout: 10_000 });
        await input.press('Enter');
        await expect(page.getByRole('button', { name: `${docName}.md`, exact: true })).toBeVisible({
          timeout: 10_000,
        });
      }

      for (const folderName of folderNames) {
        await page.getByRole('button', { name: 'New Folder', exact: true }).click();
        const input = page.getByRole('textbox', { name: new RegExp(`rename ${folderName}`, 'i') });
        await expect(input).toBeVisible({ timeout: 10_000 });
        await input.press('Enter');
        await expect(page.getByRole('button', { name: `${folderName}/`, exact: true })).toBeVisible(
          { timeout: 10_000 },
        );
      }

      await sidebarTreeItem(page, `${fileNames[0]}.md`).click();
      await sidebarTree(page).focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await sidebarTreeItem(page, `${fileNames[0]}.md`).click({ button: 'right' });
      await page.getByRole('menuitem', { name: /^Delete/ }).click({ timeout: 5_000 });
      await expect(page.getByRole('dialog', { name: /Delete selected items/i })).toBeVisible({
        timeout: 5_000,
      });
      await page.getByRole('button', { name: /^Delete$/ }).click();

      for (const docName of fileNames) {
        await expect(sidebarTreeItem(page, `${docName}.md`)).toHaveCount(0, { timeout: 10_000 });
        await expect(page.getByRole('button', { name: `${docName}.md`, exact: true })).toHaveCount(
          0,
        );
        expect(existsSync(join(workerServer.contentDir, `${docName}.md`))).toBe(false);
      }
      for (const folderName of folderNames) {
        await expect(sidebarTreeItem(page, folderName)).toHaveCount(0, { timeout: 10_000 });
        await expect(page.getByRole('button', { name: `${folderName}/`, exact: true })).toHaveCount(
          0,
        );
        expect(existsSync(join(workerServer.contentDir, folderName))).toBe(false);
      }
    } finally {
      for (const docName of fileNames) {
        await deletePathIfExists(workerServer.baseURL, 'file', docName);
      }
      for (const folderName of folderNames) {
        await deletePathIfExists(workerServer.baseURL, 'folder', folderName);
      }
      await api.createPage('test-doc.md');
      await api.createPage('sidebar-folder/nested-doc.md');
    }
  });

  test('cmd+a bulk delete closes named folders plus a default-created folder tab', async ({
    page,
    workerServer,
    api,
  }) => {
    const folderNames = ['hello', 'hello2', 'New Folder'];

    for (const folderName of folderNames) {
      await deletePathIfExists(workerServer.baseURL, 'folder', folderName);
    }

    try {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      for (const folderName of folderNames.slice(0, 2)) {
        await page.getByRole('button', { name: 'New Folder', exact: true }).click();
        const input = page.getByRole('textbox', { name: /rename New Folder/i });
        await expect(input).toBeVisible({ timeout: 10_000 });
        await input.fill(folderName);
        await input.press('Enter');
        await expect(sidebarTreeItem(page, folderName)).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole('button', { name: `${folderName}/`, exact: true })).toBeVisible(
          { timeout: 10_000 },
        );
      }

      await page.getByRole('button', { name: 'New Folder', exact: true }).click();
      await expect(page.getByRole('textbox', { name: /rename New Folder/i })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole('button', { name: 'New Folder/', exact: true })).toBeVisible({
        timeout: 10_000,
      });

      await sidebarTree(page).focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      for (const folderName of folderNames) {
        await expect(sidebarTreeItem(page, folderName)).toHaveAttribute('aria-selected', 'true');
      }

      await sidebarTreeItem(page, 'New Folder').click({ button: 'right' });
      await page.getByRole('menuitem', { name: /^Delete/ }).click({ timeout: 5_000 });
      await expect(page.getByRole('dialog', { name: /Delete selected items/i })).toBeVisible({
        timeout: 5_000,
      });
      await page.getByRole('button', { name: /^Delete$/ }).click();

      for (const folderName of folderNames) {
        await expect(sidebarTreeItem(page, folderName)).toHaveCount(0, { timeout: 10_000 });
        await expect(page.getByRole('button', { name: `${folderName}/`, exact: true })).toHaveCount(
          0,
        );
        expect(existsSync(join(workerServer.contentDir, folderName))).toBe(false);
      }
    } finally {
      for (const folderName of folderNames) {
        await deletePathIfExists(workerServer.baseURL, 'folder', folderName);
      }
      await api.createPage('test-doc.md');
      await api.createPage('sidebar-folder/nested-doc.md');
    }
  });

  test('cmd+a bulk delete does not restore a stale tab from a pending create', async ({
    page,
    workerServer,
    api,
  }) => {
    const fileNames = Array.from({ length: 6 }, (_, index) => defaultName('Untitled', index));
    const pendingFolderName = 'New Folder';

    for (const docName of fileNames) {
      await deletePathIfExists(workerServer.baseURL, 'file', docName);
    }
    await deletePathIfExists(workerServer.baseURL, 'folder', pendingFolderName);

    try {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      for (const docName of fileNames) {
        await page.getByRole('button', { name: 'New File', exact: true }).click();
        const input = page.getByRole('textbox', {
          name: new RegExp(`rename ${docName}\\.md`, 'i'),
        });
        await expect(input).toBeVisible({ timeout: 10_000 });
        await input.press('Enter');
        await expect(page.getByRole('button', { name: `${docName}.md`, exact: true })).toBeVisible({
          timeout: 10_000,
        });
      }

      await page.getByRole('button', { name: 'New Folder', exact: true }).click();
      await expect(page.getByRole('textbox', { name: /rename New Folder/i })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole('button', { name: 'New Folder/', exact: true })).toBeVisible({
        timeout: 10_000,
      });

      await sidebarTreeItem(page, `${fileNames[0]}.md`).click();
      await sidebarTree(page).focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await sidebarTreeItem(page, `${fileNames[0]}.md`).click({ button: 'right' });
      await page.getByRole('menuitem', { name: /^Delete/ }).click({ timeout: 5_000 });
      await expect(page.getByRole('dialog', { name: /Delete selected items/i })).toBeVisible({
        timeout: 5_000,
      });
      await page.getByRole('button', { name: /^Delete$/ }).click();

      for (const docName of fileNames) {
        await expect(sidebarTreeItem(page, `${docName}.md`)).toHaveCount(0, { timeout: 10_000 });
        await expect(page.getByRole('button', { name: `${docName}.md`, exact: true })).toHaveCount(
          0,
        );
        expect(existsSync(join(workerServer.contentDir, `${docName}.md`))).toBe(false);
      }
      await expect(sidebarTreeItem(page, pendingFolderName)).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'New Folder/', exact: true })).toHaveCount(0);
      expect(existsSync(join(workerServer.contentDir, pendingFolderName))).toBe(false);
    } finally {
      for (const docName of fileNames) {
        await deletePathIfExists(workerServer.baseURL, 'file', docName);
      }
      await deletePathIfExists(workerServer.baseURL, 'folder', pendingFolderName);
      await api.createPage('test-doc.md');
      await api.createPage('sidebar-folder/nested-doc.md');
    }
  });

  test('renaming a new folder remaps the folder tab without opening a markdown tab', async ({
    page,
    workerServer,
    api,
  }) => {
    await deletePathIfExists(workerServer.baseURL, 'folder', 'New Folder');
    await deletePathIfExists(workerServer.baseURL, 'folder', 'hello');
    await deletePathIfExists(workerServer.baseURL, 'file', 'New Folder');

    try {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      await page.getByRole('button', { name: 'New Folder', exact: true }).click();
      const input = page.getByRole('textbox', { name: /rename New Folder/i });
      await expect(input).toBeVisible({ timeout: 10_000 });
      await input.fill('hello');
      await input.press('Enter');

      await expect(sidebarTreeItem(page, 'hello')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'hello/', exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole('button', { name: 'New Folder/', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'New Folder.md', exact: true })).toHaveCount(0);
      expect(existsSync(join(workerServer.contentDir, 'hello'))).toBe(true);
      expect(existsSync(join(workerServer.contentDir, 'New Folder'))).toBe(false);
      expect(existsSync(join(workerServer.contentDir, 'New Folder.md'))).toBe(false);
    } finally {
      await deletePathIfExists(workerServer.baseURL, 'folder', 'New Folder');
      await deletePathIfExists(workerServer.baseURL, 'folder', 'hello');
      await deletePathIfExists(workerServer.baseURL, 'file', 'New Folder');
      await api.createPage('test-doc.md');
      await api.createPage('sidebar-folder/nested-doc.md');
    }
  });

  test('allows a file and folder with the same basename and routes them distinctly', async ({
    page,
    workerServer,
    api,
  }) => {
    const name = 'zz-same-basename';

    await deletePathIfExists(workerServer.baseURL, 'file', name);
    await deletePathIfExists(workerServer.baseURL, 'folder', name);

    try {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      await page.getByRole('button', { name: 'New Folder', exact: true }).click();
      const folderInput = page.getByRole('textbox', { name: /rename New Folder/i });
      await expect(folderInput).toBeVisible({ timeout: 10_000 });
      await folderInput.fill(name);
      await folderInput.press('Enter');

      await expect(sidebarTreeItem(page, name)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: `${name}/`, exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page).toHaveURL(new RegExp(`#/${name}/$`));

      await page.getByRole('button', { name: 'New File', exact: true }).click();
      const fileInput = page.getByRole('textbox', { name: /rename Untitled\.md/i });
      await expect(fileInput).toBeVisible({ timeout: 10_000 });
      await fileInput.fill(name);
      await fileInput.press('Enter');

      await expect(sidebarTreeItem(page, `${name}.md`)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: `${name}.md`, exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole('button', { name: `${name}/`, exact: true })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`#/${name}$`));

      await sidebarTreeItem(page, name).click();
      await expect(page.getByRole('button', { name: `${name}/`, exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page).toHaveURL(new RegExp(`#/${name}/$`));

      await sidebarTreeItem(page, `${name}.md`).click();
      await expect(page.getByRole('button', { name: `${name}.md`, exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page).toHaveURL(new RegExp(`#/${name}$`));

      expect(existsSync(join(workerServer.contentDir, name))).toBe(true);
      expect(statSync(join(workerServer.contentDir, name)).isDirectory()).toBe(true);
      expect(existsSync(join(workerServer.contentDir, `${name}.md`))).toBe(true);
    } finally {
      await deletePathIfExists(workerServer.baseURL, 'file', name);
      await deletePathIfExists(workerServer.baseURL, 'folder', name);
      await api.createPage('test-doc.md');
      await api.createPage('sidebar-folder/nested-doc.md');
    }
  });

  test('starts another create action after a default new file is committed by blur', async ({
    page,
    workerServer,
  }) => {
    await deletePathIfExists(workerServer.baseURL, 'file', 'Untitled');
    await deletePathIfExists(workerServer.baseURL, 'folder', 'New Folder');

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'New File', exact: true }).click();
    const fileRenameInput = page.getByRole('textbox', { name: /rename Untitled\.md/i });
    await expect(fileRenameInput).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'New Folder', exact: true }).click();
    const folderRenameInput = page.getByRole('textbox', { name: /rename New Folder/i });
    await expect(folderRenameInput).toBeVisible({ timeout: 10_000 });

    await expect(sidebarTreeItem(page, 'Untitled.md')).toBeVisible({ timeout: 10_000 });
    expect(existsSync(join(workerServer.contentDir, 'Untitled.md'))).toBe(true);

    await folderRenameInput.press('Escape');
    await expect(sidebarTreeItem(page, 'New Folder')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New Folder/', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New Folder.md', exact: true })).toHaveCount(0);
    expect(existsSync(join(workerServer.contentDir, 'New Folder'))).toBe(false);
  });

  test('creates default file and empty folder on disk, then survives refresh/delete', async ({
    page,
    workerServer,
  }) => {
    await deletePathIfExists(workerServer.baseURL, 'file', 'Untitled');
    await deletePathIfExists(workerServer.baseURL, 'folder', 'New Folder');

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'New File', exact: true }).click();
    const canceledFileInput = page.getByRole('textbox', { name: /rename Untitled\.md/i });
    await expect(canceledFileInput).toBeVisible({ timeout: 10_000 });
    await canceledFileInput.press('Escape');
    await expect(sidebarTreeItem(page, 'Untitled.md')).toHaveCount(0);
    expect(existsSync(join(workerServer.contentDir, 'Untitled.md'))).toBe(false);

    await page.getByRole('button', { name: 'New Folder', exact: true }).click();
    const canceledFolderInput = page.getByRole('textbox', { name: /rename New Folder/i });
    await expect(canceledFolderInput).toBeVisible({ timeout: 10_000 });
    await canceledFolderInput.press('Escape');
    await expect(sidebarTreeItem(page, 'New Folder')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New Folder/', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New Folder.md', exact: true })).toHaveCount(0);
    expect(existsSync(join(workerServer.contentDir, 'New Folder'))).toBe(false);

    await page.getByRole('button', { name: 'New File', exact: true }).click();
    const fileRenameInput = page.getByRole('textbox', { name: /rename Untitled\.md/i });
    await expect(fileRenameInput).toBeVisible({ timeout: 10_000 });
    await fileRenameInput.press('Enter');

    await expect(sidebarTreeItem(page, 'Untitled.md')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/#\/Untitled$/);
    expect(existsSync(join(workerServer.contentDir, 'Untitled.md'))).toBe(true);
    await expectDocumentLoads(workerServer.baseURL, 'Untitled');

    await page.getByRole('button', { name: 'New Folder', exact: true }).click();
    const folderRenameInput = page.getByRole('textbox', { name: /rename New Folder/i });
    await expect(folderRenameInput).toBeVisible({ timeout: 10_000 });
    await folderRenameInput.press('Enter');

    const folderPath = join(workerServer.contentDir, 'New Folder');
    await expect(sidebarTreeItem(page, 'New Folder')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'New Folder/', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'New Folder.md', exact: true })).toHaveCount(0);
    expect(existsSync(folderPath)).toBe(true);
    expect(statSync(folderPath).isDirectory()).toBe(true);
    expect(existsSync(join(folderPath, 'index.md'))).toBe(false);

    await page.reload();
    await expect(sidebarTreeItem(page, 'Untitled.md')).toBeVisible({ timeout: 10_000 });
    await expect(sidebarTreeItem(page, 'New Folder')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'New Folder/', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'New Folder.md', exact: true })).toHaveCount(0);
    expect(existsSync(join(folderPath, 'index.md'))).toBe(false);

    await sidebarTreeItem(page, 'New Folder').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Delete$/ }).click({ timeout: 5_000 });
    await expect(page.getByRole('dialog', { name: /Delete New Folder\// })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('button', { name: /^Delete$/ }).click();

    await expect(sidebarTreeItem(page, 'New Folder')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'New Folder/', exact: true })).toHaveCount(0);
    expect(existsSync(folderPath)).toBe(false);
  });
});
