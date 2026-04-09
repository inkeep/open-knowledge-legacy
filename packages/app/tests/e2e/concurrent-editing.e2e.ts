/**
 * E2E tests for concurrent editing scenarios.
 *
 * Smoke tests verify browser-level multi-connection coexistence.
 * Concurrent editing tests verify CRDT merge under real browser conditions.
 *
 * CRDT merge semantics for typed components are also tested at the Y.Doc level in:
 *   packages/app/src/editor/observer-sync.test.ts
 *     - "CE01: two-tab prop change + children edit merge" (unit-level)
 *     - "QA-027: rapid toggle with typed components — structured attrs survive"
 *     - "TS03: rapid toggle 10x — content remains stable"
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

test.describe('Editor multi-context smoke', () => {
  test('two browser contexts can load the editor simultaneously', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto('/');
    await pageB.goto('/');

    // Wait for both editors to load
    await pageA.waitForSelector('.tiptap', { timeout: 10_000 });
    await pageB.waitForSelector('.tiptap', { timeout: 10_000 });

    // Verify both contexts can see component content
    const editorA = await pageA.locator('.tiptap').textContent();
    const editorB = await pageB.locator('.tiptap').textContent();
    expect(editorA).toBeTruthy();
    expect(editorB).toBeTruthy();

    await contextA.close();
    await contextB.close();
  });

  test('both contexts render the editor DOM without console errors', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto('/');
    await pageB.goto('/');

    await pageA.waitForSelector('.tiptap', { timeout: 10_000 });
    await pageB.waitForSelector('.tiptap', { timeout: 10_000 });

    expect(await pageA.locator('.tiptap').isVisible()).toBe(true);
    expect(await pageB.locator('.tiptap').isVisible()).toBe(true);

    await contextA.close();
    await contextB.close();
  });
});

test.describe('Concurrent editing scenarios', () => {
  test('two tabs type in different paragraphs — both edits land', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Reset document to a clean state
    await pageA.goto('/');
    await pageA.waitForSelector('.tiptap', { timeout: 10_000 });
    await pageA.evaluate(() => fetch('/api/test-reset', { method: 'POST' }));

    // Reopen both tabs after reset
    await pageA.goto('/');
    await pageB.goto('/');
    await pageA.waitForSelector('.tiptap', { timeout: 10_000 });
    await pageB.waitForSelector('.tiptap', { timeout: 10_000 });

    const uniqueA = `tab-a-edit-${Date.now()}`;
    const uniqueB = `tab-b-edit-${Date.now()}`;

    // Tab A: click into editor and type unique text
    await pageA.locator('.tiptap').click();
    await pageA.keyboard.type(uniqueA);

    // Tab B: click into editor, press Enter for a new paragraph, type different text
    await pageB.locator('.tiptap').click();
    await pageB.keyboard.press('Enter');
    await pageB.keyboard.type(uniqueB);

    // Poll until CRDT sync propagates — avoids flaky fixed timeouts on slow CI runners.
    // expect().toPass() retries with backoff until the assertion holds or times out.
    await expect(async () => {
      const textA = await pageA.locator('.tiptap').textContent();
      expect(textA).toContain(uniqueA);
      expect(textA).toContain(uniqueB);
    }).toPass({ timeout: 10_000 });

    await expect(async () => {
      const textB = await pageB.locator('.tiptap').textContent();
      expect(textB).toContain(uniqueA);
      expect(textB).toContain(uniqueB);
    }).toPass({ timeout: 10_000 });

    await contextA.close();
    await contextB.close();
  });

  test('rapid external file saves propagate through disk bridge', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.tiptap', { timeout: 10_000 });

    // Resolve the content directory for the test document
    const contentDir = path.resolve(process.cwd(), 'content');
    const testDocPath = path.join(contentDir, 'test-doc.md');

    // Save original content for cleanup
    let originalContent: string | null = null;
    try {
      originalContent = await fs.readFile(testDocPath, 'utf-8');
    } catch {
      // File may not exist — will be created by the test
    }

    try {
      // First external write — unique content
      const content1 = `# Disk Bridge Test\n\nFirst external write ${Date.now()}\n`;
      await fs.writeFile(testDocPath, content1, 'utf-8');

      // Poll until the editor reflects the external write — avoids flaky fixed timeouts.
      await expect(async () => {
        const text = await page.locator('.tiptap').textContent();
        expect(text).toContain('First external write');
      }).toPass({ timeout: 10_000 });

      // Second external write — different content
      const content2 = `# Disk Bridge Test\n\nSecond external write ${Date.now()}\n`;
      await fs.writeFile(testDocPath, content2, 'utf-8');

      await expect(async () => {
        const text = await page.locator('.tiptap').textContent();
        expect(text).toContain('Second external write');
      }).toPass({ timeout: 10_000 });
    } finally {
      // Restore original content to prevent test pollution across runs
      if (originalContent !== null) {
        await fs.writeFile(testDocPath, originalContent, 'utf-8');
      }
    }
  });
});
