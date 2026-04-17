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

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { loadLargeRealistic } from '../../../core/src/markdown/fixtures/index.ts';

const port = process.env.VITE_PORT || '5173';
const BASE = process.env.STRESS_BASE_URL ?? `http://localhost:${port}`;
const FIXTURE = loadLargeRealistic();

test('S6: multi-turn stress — large content + user edits', async ({ page }) => {
  // 1. Capture console errors during the full flow
  //    US-012 F1: capture message.location() URL + lineNumber so generic
  //    "Failed to load resource: 404" errors can be triaged by URL pattern,
  //    not just the opaque text body.
  const logs: Array<{ type: string; text: string; url?: string; line?: number }> = [];
  page.on('console', (m) => {
    const loc = m.location();
    logs.push({ type: m.type(), text: m.text(), url: loc.url, line: loc.lineNumber });
  });
  page.on('pageerror', (e) => logs.push({ type: 'uncaught', text: e.message }));

  // 2. Create a per-test doc + reset its server state (avoids racing with
  //    parallel tests that would otherwise share the global `test-doc` name).
  const docName = `test-crdtstress-${randomUUID().slice(0, 8)}`;
  const createRes = await fetch(`${BASE}/api/create-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: `${docName}.md` }),
  });
  if (!createRes.ok && createRes.status !== 409) {
    throw new Error(`create-page failed: ${createRes.status}`);
  }
  const resetRes = await fetch(`${BASE}/api/test-reset?docName=${encodeURIComponent(docName)}`, {
    method: 'POST',
  });
  if (!resetRes.ok) throw new Error(`test-reset failed: ${resetRes.status}`);

  // 3. Navigate directly to the per-test doc via hash routing.
  await page.goto(`${BASE}/#/${docName}`);
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
      body: JSON.stringify({ docName, markdown: FIXTURE }),
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
  // Filter out known non-critical errors.
  // - favicon / HMR / [vite]: dev-server noise unrelated to CRDT behavior.
  // - WebSocket / ws://.../collab / Firefox can't establish: benign
  //   race during `/api/test-reset` — the Hocuspocus WebSocket is
  //   closed by the server mid-handshake as state is torn down and
  //   reconnected by the client automatically. Chromium logs this at
  //   `debug` level and it doesn't reach our error stream; WebKit and
  //   Firefox both log at `error`. Since our multi-browser projects
  //   were added (QA-046), we see these on the non-Chromium browsers
  //   too. The subsequent assertions verify actual CRDT convergence —
  //   if the reconnect didn't heal, ytext/fragment state would be
  //   wrong, not just the transient log line.
  const criticalErrors = errors.filter(
    (e) =>
      !e.text.includes('favicon') &&
      !e.text.includes('HMR') &&
      !e.text.includes('[vite]') &&
      !e.text.includes('WebSocket') &&
      !e.text.includes('ws://') &&
      !e.text.includes("can't establish a connection") &&
      !e.text.includes('can’t establish a connection') &&
      !e.url?.endsWith('.map') &&
      !e.url?.includes('/favicon') &&
      !e.url?.includes('.hot-update.') &&
      // Vite HMR / dev-server pre-bundling requests occasionally 404 during
      // heavy pages (e.g., on-demand dep re-optimize). These are dev-only
      // and don't reach production. Filter by the `/@` or `/node_modules/.vite`
      // URL prefixes that Vite uses for its internal requests.
      !e.url?.includes('/@vite/') &&
      !e.url?.includes('/@fs/') &&
      !e.url?.includes('/@id/') &&
      !e.url?.includes('/node_modules/.vite/') &&
      // `/api/config` is intentionally absent in `bun run dev` mode (see
      // `src/lib/api-config.ts` header). The app classifies the 404 as
      // `{status: 'absent'}` and falls back to same-origin WebSocket — the
      // network 404 is a by-design signal, not a failure mode.
      !e.url?.endsWith('/api/config'),
  );
  if (criticalErrors.length > 0) {
    // Include full URL + line info in the assertion failure so the flake is
    // diagnosable from CI logs alone.
    console.error('[Layer C] Critical errors detected:', JSON.stringify(criticalErrors, null, 2));
  }
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
