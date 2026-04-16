/**
 * Layer C: Playwright E2E at large-realistic scale.
 *
 * One test: S6 multi-turn — 3 turns of agent-write → user-typing coexistence.
 * Agent undo capability deferred to V0-14 (TQ13 removed broken scaffold).
 * Uses stock @playwright/test APIs with page.waitForFunction for deterministic
 * condition-based waits. No helper dependencies.
 *
 * Requires: Playwright browsers installed. Dev server started by playwright.config.ts
 * webServer on VITE_PORT (or default 5173).
 */

import { expect, test } from '@playwright/test';
import { loadLargeRealistic } from '../../../core/src/markdown/fixtures/index.ts';

const port = process.env.VITE_PORT || '5173';
const BASE = process.env.STRESS_BASE_URL ?? `http://localhost:${port}`;
const FIXTURE = loadLargeRealistic();

test('S6: multi-turn stress — large content + user edits', async ({ page }) => {
  // 1. Capture console errors during the full flow
  const logs: Array<{ type: string; text: string }> = [];
  page.on('console', (m) => logs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => logs.push({ type: 'uncaught', text: e.message }));

  // 2. Reset server state
  const resetRes = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!resetRes.ok) throw new Error(`test-reset failed: ${resetRes.status}`);

  // 3. Navigate + open test-doc from sidebar (multi-doc arch requires explicit selection)
  await page.goto(BASE);
  await page.getByText('test-doc.md').click({ timeout: 10_000 });
  await page.waitForFunction(() => Boolean(window.__activeProvider), {
    timeout: 15_000,
  });
  await page.waitForSelector('.ProseMirror');

  // 4. Three turns: agent-write → user-typing coexistence
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
        window.__activeProvider?.document?.getText('source')?.toString()?.length >= expected,
      FIXTURE.length - 200, // tolerance for whitespace normalization
      { timeout: 30_000 },
    );

    // Simulate user typing (real keyboard events)
    await page.locator('.ProseMirror').focus();
    await page.keyboard.type(marker, { delay: 5 });

    // Wait for Observer A to sync user typing to Y.Text
    await page.waitForFunction(
      (m: string) => window.__activeProvider?.document?.getText('source')?.toString()?.includes(m),
      marker,
      { timeout: 10_000 },
    );

    // Diagnostic: capture turn state
    const turnState = await page.evaluate(() => {
      const provider = window.__activeProvider;
      const ytext = provider?.document?.getText('source');
      const frag = provider?.document?.getXmlFragment('default');
      return {
        ytextLen: ytext?.toString()?.length ?? 0,
        fragChildren: frag?.length ?? 0,
      };
    });
    console.log(
      `[Layer C] Turn complete: ytext=${turnState.ytextLen}, fragment=${turnState.fragChildren}`,
    );
  }

  // 5. Final assertions
  const errors = logs.filter((l) => l.type === 'error' || l.type === 'uncaught');
  // Filter out known non-critical errors
  const criticalErrors = errors.filter(
    (e) => !e.text.includes('favicon') && !e.text.includes('HMR') && !e.text.includes('[vite]'),
  );
  expect(criticalErrors).toEqual([]);

  const finalState = await page.evaluate(() => {
    const provider = window.__activeProvider;
    return {
      ytext: provider.document.getText('source').toString(),
    };
  });

  // All three user markers preserved
  for (const marker of markers) {
    expect(finalState.ytext).toContain(marker);
  }
});
