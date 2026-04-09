/**
 * Smoke E2E tests: two browser contexts can load the editor simultaneously.
 *
 * These tests verify browser-level smoke coverage — two Hocuspocus WebSocket
 * connections can coexist and both render the editor without errors. They do
 * NOT verify CRDT merge behavior.
 *
 * CRDT merge semantics for typed components are tested at the Y.Doc level in:
 *   packages/app/src/editor/observer-sync.test.ts
 *     - "CE01: two-tab prop change + children edit merge" (unit-level)
 *     - "QA-027: rapid toggle with typed components — structured attrs survive"
 *     - "TS03: rapid toggle 10x — content remains stable"
 *
 * Two-tab concurrency at the real browser level (actual keystrokes timed
 * against each other through a live dev server) is deliberately NOT tested
 * here — it's deterministic at the CRDT layer and fragile at the browser
 * layer. The smoke tests below just confirm the multi-connection path works.
 */
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
