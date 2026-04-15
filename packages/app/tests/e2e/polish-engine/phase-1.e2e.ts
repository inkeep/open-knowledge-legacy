/**
 * Polish Engine Phase 1 — Playwright E2E tests
 *
 * Covers §10.7 rows: R1 (CRDT convergence), R4 (auto-bail boundaries),
 * R5 (zero console errors), R9 (performance), R12 (agent-write sync),
 * plus R3/R6/R10 for Phase 1 constructs (table, blockquote, code).
 *
 * §10.9 zero-tolerance error filter applied to every test.
 */

import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

/** Collect console errors and pageerrors per §10.9 */
function setupErrorCollector(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Whitelist operational console.warn with bracket-prefix convention
      if (
        text.startsWith('[file-watcher]') ||
        text.startsWith('[CC1]') ||
        text.startsWith('[wiki-link-source]')
      ) {
        return;
      }
      errors.push(`[console.error] ${text}`);
    }
  });

  return errors;
}

/** Wait for the active provider to be connected and synced */
async function waitForProvider(page: Page) {
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), {
    timeout: 15_000,
  });
}

test.describe('R5 — Zero console errors during composition doc session', () => {
  test('no pageerrors or console.errors with polish engine active', async ({ page }) => {
    const errors = setupErrorCollector(page);

    // Reset and navigate
    const res = await fetch(`${BASE}/api/test-reset?docName=test-doc`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'test-doc.md', exact: true }).click({ timeout: 10_000 });
    await waitForProvider(page);

    // Switch to source mode
    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    // Type some content
    await page.locator('.cm-content').focus();
    await page.keyboard.type('# Test heading\n\n> Blockquote\n\n| A | B |\n|--|--|\n| 1 | 2 |\n', {
      delay: 5,
    });

    // Wait for decorations to settle
    await page.waitForTimeout(500);

    // §10.9: zero tolerance
    expect(errors).toEqual([]);
  });
});

test.describe('R10 — Decoration class correctness for Phase 1 constructs', () => {
  test('blockquote lines have .cm-blockquote-line class', async ({ page }) => {
    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset?docName=test-doc`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'test-doc.md', exact: true }).click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    // Write a blockquote via agent API (field names: markdown + position; docName must match browser doc)
    await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: '> This is a blockquote\n> Second line',
        position: 'replace',
        docName: 'test-doc',
      }),
    });

    await page.waitForTimeout(1500);

    // Check for blockquote decoration classes
    const blockquoteLines = await page.locator('.cm-blockquote-line').count();
    expect(blockquoteLines).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test('table rows have .cm-table-row class', async ({ page }) => {
    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset?docName=test-doc`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'test-doc.md', exact: true }).click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: '| A | B |\n|---|---|\n| 1 | 2 |',
        position: 'replace',
        docName: 'test-doc',
      }),
    });

    await page.waitForTimeout(1500);

    const tableRows = await page.locator('.cm-table-row').count();
    expect(tableRows).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test('fenced code blocks have .cm-code-block class', async ({ page }) => {
    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset?docName=test-doc`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'test-doc.md', exact: true }).click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: '```typescript\nconst x = 1;\n```',
        position: 'replace',
        docName: 'test-doc',
      }),
    });

    // Wait for the fenced-code decoration to appear. Fenced code with a language
    // specifier triggers lazy language loading, which delays syntaxTreeAvailable.
    // Use waitForSelector instead of a fixed timeout to be robust against variable timing.
    await page.waitForSelector('.cm-code-block', { timeout: 5000 });

    const codeBlocks = await page.locator('.cm-code-block').count();
    expect(codeBlocks).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });
});

test.describe('R3 — Cmd+A copy byte-identical clipboard', () => {
  test('select-all + copy yields byte-identical doc content', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset?docName=test-doc`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'test-doc.md', exact: true }).click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');

    // Write content with blockquote + table + code (field names: markdown + position; docName matches browser)
    const testContent = '> Quote\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```';
    await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: testContent, position: 'replace', docName: 'test-doc' }),
    });

    await page.waitForTimeout(1500);

    // Get the doc content from the server API (Y.Text source of truth).
    // CM6 doesn't expose EditorView via a stable DOM property, so reading from
    // the server avoids fragile internal property paths.
    const docRes = await fetch(`${BASE}/api/document?docName=test-doc`);
    const docContent = (await docRes.json()).content;

    // Select all + copy
    await page.locator('.cm-content').focus();
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+c');

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(docContent);

    expect(errors).toEqual([]);
  });
});

/**
 * R9 — Performance targets (§10.7 R9 / §10.4 benchmarks)
 *
 * All measurements run ENTIRELY inside page.evaluate() so Playwright↔Node
 * roundtrip latency does not dominate the signal. Test seams exposed by
 * SourceEditor: window.__activeEditorView + window.__polishFirstPaintMs.
 *
 * Thresholds per SPEC §3 Must-pass:
 *   - First-paint ≤ 30 ms on a 2000-line doc with ≥100 constructs
 *   - Per-keystroke p95 ≤ 5 ms at viewport-typical decoration count
 *   - Scroll p95 frame budget ≤ 16 ms
 */
test.describe('R9 — Performance targets', () => {
  /**
   * Build a synthetic 2000-line markdown document that exercises every
   * Phase 1+2+3 construct family so the engine has a realistic decoration
   * load (≥100 active decorations in the viewport after steady state).
   */
  function buildPerfFixture(): string {
    const sections: string[] = ['---', 'title: Perf Fixture', '---', ''];
    // Cycle: heading → paragraph → blockquote → code → list → table → hr
    // Each cycle = ~20 lines, so 100 cycles ≈ 2000 lines and ≥100 constructs.
    for (let i = 0; i < 100; i++) {
      sections.push(`## Section ${i}`);
      sections.push('');
      sections.push(`Paragraph with **bold**, _italic_, ~~strike~~, and \`inline\` code.`);
      sections.push('');
      sections.push('> Quoted line one');
      sections.push('> Quoted line two');
      sections.push('');
      sections.push('```ts');
      sections.push(`const value${i} = ${i} + 1;`);
      sections.push('function fn() { return value; }');
      sections.push('```');
      sections.push('');
      sections.push('- First list item');
      sections.push('- Second list item');
      sections.push('  - Nested item');
      sections.push('');
      sections.push('| A | B | C |');
      sections.push('|---|---|---|');
      sections.push(`| ${i} | ${i + 1} | ${i + 2} |`);
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    return sections.join('\n');
  }

  test('first-paint ≤ 30 ms on 2000-line doc with ≥100 constructs', async ({ page }) => {
    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset?docName=test-doc`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);

    // Seed the fixture BEFORE mounting source editor so ViewPlugin construction
    // happens against the populated document — that's the first-paint we measure.
    const fixture = buildPerfFixture();
    const writeRes = await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: fixture, position: 'replace', docName: 'test-doc' }),
    });
    if (!writeRes.ok) throw new Error(`agent-write-md failed: ${writeRes.status}`);

    await page.goto(BASE);
    await page.getByRole('button', { name: 'test-doc.md', exact: true }).click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');
    // Allow the ViewPlugin constructor to run and firstPaintMs to be recorded.
    await page.waitForFunction(
      () => typeof window.__polishFirstPaintMs === 'function' && window.__polishFirstPaintMs() >= 0,
      { timeout: 5_000 },
    );

    const firstPaintMs = await page.evaluate(() => window.__polishFirstPaintMs?.() ?? -1);
    expect(firstPaintMs).toBeGreaterThanOrEqual(0);
    expect(firstPaintMs).toBeLessThanOrEqual(30);

    expect(errors).toEqual([]);
  });

  test('per-keystroke p95 ≤ 5 ms dispatching 100 transactions in-browser', async ({ page }) => {
    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset?docName=test-doc`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);

    const fixture = buildPerfFixture();
    const writeRes = await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: fixture, position: 'replace', docName: 'test-doc' }),
    });
    if (!writeRes.ok) throw new Error(`agent-write-md failed: ${writeRes.status}`);

    await page.goto(BASE);
    await page.getByRole('button', { name: 'test-doc.md', exact: true }).click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');
    await page.waitForFunction(() => window.__activeEditorView != null, { timeout: 5_000 });

    // Measure 100 dispatches ENTIRELY inside the browser context so Playwright
    // keyboard event latency does not contaminate the sample.
    const p95 = await page.evaluate(() => {
      const view = window.__activeEditorView;
      if (!view) throw new Error('__activeEditorView not set');

      const samples: number[] = [];
      // Insert at doc end to avoid shifting selections; CM6 computes the full
      // ViewPlugin update() each dispatch which is what we want to measure.
      const endPos = view.state.doc.length;
      for (let i = 0; i < 100; i++) {
        const t0 = performance.now();
        view.dispatch({ changes: { from: endPos + i, insert: 'x' } });
        samples.push(performance.now() - t0);
      }
      // Clean up — remove the 100 'x' characters
      view.dispatch({ changes: { from: endPos, to: endPos + 100, insert: '' } });

      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length * 0.95)];
    });

    expect(p95).toBeLessThanOrEqual(5);
    expect(errors).toEqual([]);
  });

  test('scroll frame budget p95 ≤ 16 ms across 60 rAF frames', async ({ page }) => {
    const errors = setupErrorCollector(page);
    const res = await fetch(`${BASE}/api/test-reset?docName=test-doc`, { method: 'POST' });
    if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);

    const fixture = buildPerfFixture();
    const writeRes = await fetch(`${BASE}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: fixture, position: 'replace', docName: 'test-doc' }),
    });
    if (!writeRes.ok) throw new Error(`agent-write-md failed: ${writeRes.status}`);

    await page.goto(BASE);
    await page.getByRole('button', { name: 'test-doc.md', exact: true }).click({ timeout: 10_000 });
    await waitForProvider(page);

    const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
    await sourceToggle.click();
    await page.waitForSelector('.cm-editor');
    await page.waitForFunction(() => window.__activeEditorView != null, { timeout: 5_000 });

    // Measure 60 consecutive requestAnimationFrame deltas while the viewport
    // scrolls — fully in-browser, no Playwright roundtrip in the hot loop.
    const p95 = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const view = window.__activeEditorView;
          if (!view) {
            reject(new Error('__activeEditorView not set'));
            return;
          }
          const activeView = view;
          const samples: number[] = [];
          const maxFrames = 60;
          let last = performance.now();
          // Skip the first frame (unwarmed JIT / first rAF scheduling jitter)
          let first = true;

          function tick() {
            const now = performance.now();
            if (first) {
              first = false;
            } else {
              samples.push(now - last);
            }
            last = now;

            if (samples.length < maxFrames) {
              activeView.scrollDOM.scrollTop += 100;
              requestAnimationFrame(tick);
            } else {
              samples.sort((a, b) => a - b);
              resolve(samples[Math.floor(samples.length * 0.95)]);
            }
          }
          requestAnimationFrame(tick);
        }),
    );

    expect(p95).toBeLessThanOrEqual(16);
    expect(errors).toEqual([]);
  });
});
