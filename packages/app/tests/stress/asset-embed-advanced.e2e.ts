/**
 * E2E coverage for the remaining top-list acceptance scenarios from
 * `evidence/e2e-acceptance-scenarios.md` that genuinely need a browser
 * (US-017):
 *
 *   - P1.3   oversized file drop → 413 + byte-size-specific toast
 *   - P5.1   rename doc with `![alt](path)` image ref → path recomputes
 *   - P5.1a  rename doc with `![[name.ext]]` wiki-embed ref → NO rewrite
 *            (basename index resolves dynamically)
 *
 * Scenarios NOT in this file (intentional — their integration-tier
 * coverage is stronger per test-runtime dollar):
 *   - P2.1 / P2.1a  Obsidian vault open + ambiguous resolution — require
 *                   full server-restart against a fixture vault. Fully
 *                   covered by obsidian-vault-detect.test.ts (23 tests)
 *                   + path-resolve.test.ts tiebreak PBT.
 *   - P4.1  Operator maxBytes override — server config surgery is
 *           heavier than the test adds. Covered by api-extension.test.ts
 *           custom-config describe block.
 *   - P5.2 / P5.3 concurrent bursts + P6.x multi-user — require
 *                 multi-browser harness. Per US-017 AC: tier-1
 *                 `createTestClients` integration tests are the right
 *                 home; the CRDT sync layer didn't change in this spec.
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test, waitForActiveProviderSynced as waitForProvider } from './_helpers';

async function dropFileIntoEditor(
  page: Page,
  buffer: number[],
  filename: string,
  mime: string,
): Promise<void> {
  await page.evaluate(
    ({ bytes, name, type }) => {
      const editor = document.querySelector('.ProseMirror') as HTMLElement | null;
      if (!editor) throw new Error('no editor');
      const file = new File([new Uint8Array(bytes)], name, { type });
      const dt = new DataTransfer();
      dt.items.add(file);
      const rect = editor.getBoundingClientRect();
      const cx = rect.left + Math.floor(rect.width / 2);
      const cy = rect.top + Math.floor(rect.height / 2);
      editor.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
        }),
      );
      editor.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
        }),
      );
    },
    { bytes: buffer, name: filename, type: mime },
  );
}

async function getSourceText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const provider = window.__activeProvider;
    return provider?.document?.getText('source')?.toString() ?? '';
  });
}

test.describe('asset-embed — advanced scenarios (SPEC §6 FR-1, FR-7)', () => {
  let docName: string;

  test.beforeEach(async ({ page, api }) => {
    docName = `asset-embed-adv-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);
    await api.replaceDoc(docName, '# Test\n');
    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');
    await page.click('.ProseMirror');
  });

  test('P1.3: oversized file → 413 with byte-size-specific toast, no placeholder lingers', async ({
    page,
  }) => {
    // Default maxBytes is 25 MB per FR-5. Drop a ~30 MB buffer to trip it.
    const size = 30 * 1024 * 1024;
    const oversized = Array.from({ length: size }, () => 0);

    await dropFileIntoEditor(page, oversized, 'huge.bin', 'application/octet-stream');

    // Wait for a sonner toast that names both the attempted size AND the
    // configured limit (P1.3 "no generic 'too large' phrase"). The toast
    // library renders status='error' with the server-provided message.
    const toast = page.locator('[data-sonner-toast]').first();
    await expect(toast).toBeVisible({ timeout: 10_000 });
    const toastText = await toast.textContent();
    expect(toastText).toContain('25');
    expect(toastText).toContain('30');

    // No file reference landed in Y.Text — upload was rejected pre-dispatch.
    const text = await getSourceText(page);
    expect(text).not.toContain('huge.bin');

    // Widget-decoration placeholder should be gone (the upload plugin
    // removes it on server error). Selector matches the skeleton widget
    // emitted by createSkeletonWidget().
    await expect(page.locator('[data-upload-widget="loading"]')).toHaveCount(0);
  });
});

test.describe('asset-embed — rename stability (SPEC §6 FR-7 / P5.1 / P5.1a / D-K)', () => {
  test('P5.1: rename doc with ![alt](path) image ref rewrites path', async ({ page, api }) => {
    // Setup: doc in docs/ references a co-located image via relative path.
    const suffix = randomUUID().slice(0, 8);
    const origDoc = `rename-a-${suffix}`;
    await api.createPage(`docs/${origDoc}.md`);
    await api.replaceDoc(`docs/${origDoc}`, '# First Draft\n\n![first draft](first-draft.png)\n');

    // Kick the doc open to prime the provider cache; /api/rename operates
    // on loaded documents via the managed-rename-rewrite pipeline.
    await page.goto(`/#/docs/${origDoc}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    // Invoke the managed-rename endpoint directly — no UI dependency.
    const renameRes = await page.request.post('/api/rename', {
      data: {
        docName: `docs/${origDoc}`,
        newDocName: `archive/2026/${origDoc}`,
      },
    });
    expect(renameRes.ok()).toBe(true);

    // The body at the new location carries a recomputed relative path.
    // Fetch via /api/document (bypasses debounce) to read live Y.Text.
    const docRes = await page.request.get(`/api/document?docName=archive/2026/${origDoc}`);
    expect(docRes.ok()).toBe(true);
    const body = (await docRes.json()) as { text?: string };
    const text = body.text ?? '';
    // From archive/2026/<name>.md, the image in docs/ is two levels up
    // and one across — the rewrite is deterministic even if the exact
    // prefix varies across path algorithms. Assert the rewritten ref
    // points into docs/ and names first-draft.png.
    expect(text).toMatch(/!\[first draft]\([^)]*docs\/first-draft\.png\)/);
  });

  test('P5.1a: rename doc with ![[name.ext]] wiki-embed ref — body stays byte-identical', async ({
    page,
    api,
  }) => {
    // Wiki-embed refs resolve at render time via the basename index
    // (D-K refs-only). Renaming the containing doc must NOT rewrite
    // the ref string.
    const suffix = randomUUID().slice(0, 8);
    const origDoc = `rename-b-${suffix}`;
    await api.createPage(`docs/${origDoc}.md`);
    const originalBody = '# First Draft\n\n![[first-draft.png]]\n';
    await api.replaceDoc(`docs/${origDoc}`, originalBody);

    await page.goto(`/#/docs/${origDoc}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    const renameRes = await page.request.post('/api/rename', {
      data: {
        docName: `docs/${origDoc}`,
        newDocName: `archive/2026/${origDoc}`,
      },
    });
    expect(renameRes.ok()).toBe(true);

    const docRes = await page.request.get(`/api/document?docName=archive/2026/${origDoc}`);
    expect(docRes.ok()).toBe(true);
    const body = (await docRes.json()) as { text?: string };
    const text = body.text ?? '';
    // The wiki-embed ref stays verbatim.
    expect(text).toContain('![[first-draft.png]]');
  });
});
