/**
 * Layer C: Playwright E2E at large-realistic scale.
 *
 * One test: S6 multi-turn — 3 turns of agent-write → user-typing → undo.
 * Uses stock @playwright/test APIs with page.waitForFunction for deterministic
 * condition-based waits. No helper dependencies.
 *
 * Requires: dev server running (bun run dev) + Playwright browsers installed.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const BASE = process.env.STRESS_BASE_URL ?? 'http://localhost:5173';
const FIXTURE = readFileSync(
  resolve(import.meta.dirname, '../fixtures/large-realistic.md'),
  'utf8',
);

test('S6: multi-turn stress — large content + user edits + undos', async ({ page }) => {
  // 1. Capture console errors during the full flow
  const logs: Array<{ type: string; text: string }> = [];
  page.on('console', (m) => logs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => logs.push({ type: 'uncaught', text: e.message }));

  // 2. Reset server state
  await fetch(`${BASE}/api/test-reset`, { method: 'POST' });

  // 3. Navigate + wait for singleton provider
  await page.goto(BASE);
  await page.waitForFunction(() => Boolean((window as any).__hocuspocusProvider), {
    timeout: 15_000,
  });
  await page.waitForSelector('.ProseMirror');

  // 4-9. Three turns
  const markers = ['USER-E2E-MARK-1', 'USER-E2E-MARK-2', 'USER-E2E-MARK-3'];

  for (const marker of markers) {
    // Inject large content via agent API
    const writeRes = await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: FIXTURE }),
    });
    expect(writeRes.ok).toBe(true);

    // Wait for content to propagate to Y.Text
    await page.waitForFunction(
      (expected: number) =>
        (window as any).__hocuspocusProvider?.document?.getText('source')?.toString()?.length >=
        expected,
      FIXTURE.length - 200, // tolerance for whitespace normalization
      { timeout: 30_000 },
    );

    // Simulate user typing (real keyboard events)
    await page.locator('.ProseMirror').focus();
    await page.keyboard.type(marker, { delay: 5 });

    // Wait for Observer A to sync user typing to Y.Text
    await page.waitForFunction(
      (m: string) =>
        (window as any).__hocuspocusProvider?.document?.getText('source')?.toString()?.includes(m),
      marker,
      { timeout: 10_000 },
    );

    // Click undo button
    const undoButton = page.locator('[data-undo-state="ready"]');
    if ((await undoButton.count()) > 0) {
      await undoButton.click();

      // Wait for undo propagation — agent content length should drop significantly
      // and user marker should still be present. Large-realistic undo can take 30s+.
      await page.waitForFunction(
        (m: string) => {
          const txt = (window as any).__hocuspocusProvider?.document?.getText('source')?.toString();
          // After undo, text should be much shorter (agent content removed) and marker preserved
          return txt && txt.length < 5000 && txt.includes(m);
        },
        marker,
        { timeout: 60_000 },
      );
    }
  }

  // 10. Final assertions
  const errors = logs.filter((l) => l.type === 'error' || l.type === 'uncaught');
  // Filter out known non-critical errors
  const criticalErrors = errors.filter(
    (e) => !e.text.includes('favicon') && !e.text.includes('HMR') && !e.text.includes('[vite]'),
  );
  expect(criticalErrors).toEqual([]);

  const finalState = await page.evaluate(() => {
    const provider = (window as any).__hocuspocusProvider;
    return {
      ytext: provider.document.getText('source').toString(),
    };
  });

  // All three user markers preserved
  for (const marker of markers) {
    expect(finalState.ytext).toContain(marker);
  }
});
