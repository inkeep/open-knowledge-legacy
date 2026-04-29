/**
 * Regression coverage for two related bugs surfaced by sidebar inline rename:
 *
 * 1. **Data-loss in editor & on disk after rename** (FileTree fix).
 *    @pierre/trees fires `onSelectionChange` with the renamed item's new path
 *    BEFORE `onRename` fires our handler — and BEFORE `applyRenamedDocuments`
 *    updates the local `documents` list. The selection-driven navigation
 *    opens a HocuspocusProvider for the new docName before the file exists
 *    at the new path, producing an empty server-side Y.Doc that subsequently
 *    overwrites the file with 0 bytes via the persistence debounce.
 *    Fix: `handleSelectionChange` ignores selections whose docName isn't in
 *    `documents` yet — the rename flow updates `documents` and sets the hash
 *    explicitly via `applyRenamedDocuments` after the API succeeds.
 *
 * 2. **Phantom file creation from any openDirectConnection on a missing doc**
 *    (persistence fix). Opening a Y.Doc for a docName whose file doesn't
 *    exist would, on next debounced `onStoreDocument`, materialize a 0-byte
 *    file at that path. Reachable via `/api/document?docName=<missing>`,
 *    MCP queries on deleted docs, or any future code path that opens
 *    a connection without verifying the file exists.
 *    Fix: `onStoreDocument` refuses to write when there is no reconciled
 *    base (no successful onLoadDocument) AND the serialized markdown is
 *    empty. Legitimate first-writes are unaffected (`create-page`
 *    pre-creates the file; agent writes fill the fragment first).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { expect, test } from './_helpers';

const MARKER = 'zebra-marker-7892';
const DOC_CONTENT = `# Hello

This file has memorable content: ${MARKER}.
`;

// Persistence debounce is 2s. Wait past it with a small buffer so any late
// phantom store would have completed by the time we assert disk state.
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

    // Inline-rename via the sidebar context menu — exercises the @pierre/trees
    // selection-follows-rename path that triggered the data-loss bug.
    const sourceItem = page.getByRole('treeitem', { name: /source-doc\.md/ });
    await sourceItem.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /rename/i }).click({ timeout: 5_000 });
    const renameInput = page.getByRole('textbox', { name: /rename source-doc\.md/i });
    await renameInput.fill('renamed-doc.md');
    await renameInput.press('Enter');

    // Editor displays the renamed doc with the original content.
    await expect(page.locator('.ProseMirror')).toContainText(MARKER, { timeout: 15_000 });

    // Wait past the persistence debounce so any late phantom-write would
    // have landed before we assert disk state.
    await wait(PERSISTENCE_SETTLE_MS);

    // File on disk at the new path holds the content.
    const renamedContent = readFileSync(join(workerServer.contentDir, 'renamed-doc.md'), 'utf-8');
    expect(renamedContent).toContain(MARKER);

    // No orphan at the original path.
    const oldPath = join(workerServer.contentDir, 'source-doc.md');
    expect(existsSync(oldPath)).toBe(false);
  });

  test('phantom guard: opening a non-existent doc does NOT create a file', async ({
    page,
    workerServer,
  }) => {
    // No seed — the doc has never existed.
    await page.goto(workerServer.baseURL);
    await page.waitForLoadState('domcontentloaded');

    // Trigger an openDirectConnection on a non-existent docName via the
    // public read endpoint. Without the persistence guard, the resulting
    // empty Y.Doc would be persisted as a 0-byte file at the corresponding
    // path on the next debounced onStoreDocument.
    await page.evaluate(async () => {
      await fetch('/api/document?docName=nonexistent-ghost').then((r) => r.json());
    });

    // Wait past the persistence debounce window.
    await wait(PERSISTENCE_SETTLE_MS);

    const ghostPath = join(workerServer.contentDir, 'nonexistent-ghost.md');
    expect(existsSync(ghostPath)).toBe(false);
  });
});
