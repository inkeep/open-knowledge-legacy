
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { expect, test } from './_helpers';

const MARKER = 'zebra-marker-7892';
const DOC_CONTENT = `# Hello

This file has memorable content: ${MARKER}.
`;

const PERSISTENCE_SETTLE_MS = 3_000;

test.describe('FileTree sidebar rename — content preservation', () => {
  test('content stays in editor and on disk; no orphan at old path', async ({
    page,
    api,
    workerServer,
  }) => {
    await api.seedDocs([{ name: 'source-doc', markdown: DOC_CONTENT }]);
    await page.goto('/#/source-doc');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.ProseMirror')).toContainText(MARKER, { timeout: 15_000 });

    const sourceItem = page.getByRole('treeitem', { name: /source-doc\.md/ });
    await sourceItem.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /rename/i }).click({ timeout: 5_000 });
    const renameInput = page.getByRole('textbox', { name: /rename source-doc\.md/i });
    await renameInput.fill('renamed-doc.md');
    await renameInput.press('Enter');

    await expect(page.locator('.ProseMirror')).toContainText(MARKER, { timeout: 15_000 });

    await wait(PERSISTENCE_SETTLE_MS);

    const renamedContent = readFileSync(join(workerServer.contentDir, 'renamed-doc.md'), 'utf-8');
    expect(renamedContent).toContain(MARKER);

    const oldPath = join(workerServer.contentDir, 'source-doc.md');
    expect(existsSync(oldPath)).toBe(false);
  });

  test('phantom guard: opening a non-existent doc does NOT create a file', async ({
    page,
    workerServer,
  }) => {
    await page.goto(workerServer.baseURL);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      await fetch('/api/document?docName=nonexistent-ghost').then((r) => r.json());
    });

    await wait(PERSISTENCE_SETTLE_MS);

    const ghostPath = join(workerServer.contentDir, 'nonexistent-ghost.md');
    expect(existsSync(ghostPath)).toBe(false);
  });
});
