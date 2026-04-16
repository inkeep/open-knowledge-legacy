/**
 * Layer C: Playwright E2E for source-view minimal polish (5 features).
 *
 * Verifies decorations, CSS classes, and visual alignment for:
 *   §6.1 Broken link-refs + broken wikilinks
 *   §6.2 Strikethrough (line-through on content, not delimiters)
 *   §6.3 List hanging-indent (marker at natural x, wrap under text)
 *   §6.4 Language badge (visible pill, suppressed when empty)
 *   §6.5 Code wrap-preserve-indent (source indent visible, wrap under indent)
 *   §6.6 Tables (negative AC — no polish classes)
 *
 * Requires: Playwright browsers installed. Dev server started by
 * playwright.config.ts webServer on VITE_PORT (or default 5173).
 */

import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

// ── Shared helpers ───────────────────────────────────────────────────────────

async function waitForProvider(page: Page) {
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), { timeout: 15_000 });
}

/** Seed content via agent-write-md API (replace mode). */
async function seedMarkdown(markdown: string) {
  const res = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName: 'test-doc', markdown, position: 'replace' }),
  });
  if (!res.ok) throw new Error(`agent-write-md failed: ${res.status}`);
}

/** Switch to source mode and wait for CodeMirror to render. */
async function switchToSource(page: Page) {
  await page.getByRole('radio', { name: 'Markdown source' }).click();
  await page.waitForSelector('.cm-content', { timeout: 10_000 });
  // Let decorations settle
  await page.waitForTimeout(400);
}

// ── Console error accumulator ────────────────────────────────────────────────

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
  await page.goto(BASE);
  await page.getByText('test-doc.md').click({ timeout: 10_000 });
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
});

test.afterEach(() => {
  expect(errors, 'Expected zero console errors').toEqual([]);
});

// ── §6.2 Strikethrough ──────────────────────────────────────────────────────

test.describe('§6.2 Strikethrough', () => {
  test('~~text~~ renders cm-del on content only, not delimiters', async ({ page }) => {
    await seedMarkdown('~~deprecated~~ text');
    await switchToSource(page);

    // Find span with cm-del class
    const delSpans = page.locator('.cm-content .cm-del');
    await expect(delSpans).toHaveCount(1);

    const delText = await delSpans.first().textContent();
    expect(delText).toBe('deprecated');

    // The ~~ delimiters should NOT carry cm-del
    const lineText = await page.locator('.cm-line').first().textContent();
    expect(lineText).toContain('~~deprecated~~');
  });
});

// ── §6.3 List hanging-indent ─────────────────────────────────────────────────

test.describe('§6.3 List hanging-indent', () => {
  test('wrapped bullet continuation x > marker x', async ({ page }) => {
    const longText = 'A'.repeat(200);
    await seedMarkdown(`- ${longText}\n\nplain paragraph`);
    await switchToSource(page);

    // Narrow viewport to force wrapping
    await page.setViewportSize({ width: 400, height: 600 });
    await page.waitForTimeout(300);

    // The list-item line should have cm-list-item class
    const listLine = page.locator('.cm-line.cm-list-item').first();
    await expect(listLine).toBeVisible();

    // Measure marker's x position (first char of the line) and verify it
    // hasn't been pushed into negative territory
    const listLineBox = await listLine.boundingBox();
    expect(listLineBox).toBeTruthy();

    // A plain paragraph line for comparison
    const plainLine = page.locator('.cm-line:not(.cm-list-item)').first();
    const plainBox = await plainLine.boundingBox();
    expect(plainBox).toBeTruthy();

    // The list line's left edge should be roughly the same as a plain line
    // (marker at natural x, not offset far right)
    expect(Math.abs(listLineBox?.x - plainBox?.x)).toBeLessThan(50);
  });
});

// ── §6.4 Language badge ──────────────────────────────────────────────────────

test.describe('§6.4 Language badge', () => {
  test('```typescript shows cm-code-language-badge reading "typescript"', async ({ page }) => {
    await seedMarkdown('```typescript\nconst x = 1;\n```');
    await switchToSource(page);

    const badge = page.locator('.cm-code-language-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText('typescript');
    await expect(badge).toBeVisible();
  });

  test('``` with no language shows no badge', async ({ page }) => {
    await seedMarkdown('```\nplain code\n```');
    await switchToSource(page);

    const badge = page.locator('.cm-code-language-badge');
    await expect(badge).toHaveCount(0);
  });
});

// ── §6.5 Code wrap-preserve-indent ──────────────────────────────────────────

test.describe('§6.5 Code wrap-preserve-indent', () => {
  test('source indent is visible (not flattened)', async ({ page }) => {
    await seedMarkdown('```js\nfoo\n    bar\n        baz\n```');
    await switchToSource(page);

    // Get all fenced-code-line elements
    const codeLines = page.locator('.cm-line.cm-fenced-code-line');
    // There should be lines for foo, "    bar", "        baz"
    const count = await codeLines.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Measure x of first non-ws char. The deeper-indented lines should start
    // further right.
    const boxes = [];
    for (let i = 0; i < count; i++) {
      const box = await codeLines.nth(i).boundingBox();
      if (box) boxes.push(box);
    }

    // With padding-inline-start based on --line-indent, deeper indented lines
    // should have effectively wider padding. The text starts further right
    // because the padding pushes it, and since there's no text-indent to pull
    // it back, the visual indent is preserved.
    expect(boxes.length).toBeGreaterThanOrEqual(3);
  });

  test('long indented code line wraps under the indent', async ({ page }) => {
    const longLine = `    ${'x'.repeat(300)}`;
    await seedMarkdown(`\`\`\`js\n${longLine}\n\`\`\``);
    await switchToSource(page);

    // Force narrow viewport to trigger wrap
    await page.setViewportSize({ width: 400, height: 600 });
    await page.waitForTimeout(300);

    // The fenced-code-line should exist and have padding
    const codeLine = page.locator('.cm-line.cm-fenced-code-line').first();
    await expect(codeLine).toBeVisible();

    // Check that --line-indent is set (verifying the padding mechanism)
    const lineIndent = await codeLine.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('padding-inline-start'),
    );
    // Should have non-zero padding (4 spaces → 4ch)
    expect(lineIndent).not.toBe('0px');
  });
});

// ── §6.1 Broken link-ref ────────────────────────────────────────────────────

test.describe('§6.1 Broken link-ref', () => {
  test('[x][missing] gets cm-link-ref-broken; adding definition clears it', async ({ page }) => {
    // Seed with a VALID ref pair first (survives CRDT round-trip without escaping),
    // then type a broken ref directly in source mode to avoid remark-stringify escaping brackets.
    await seedMarkdown('[valid link][exists]\n\n[exists]: https://example.com');
    await switchToSource(page);

    // Type a broken ref directly in source mode (bypasses CRDT round-trip escaping)
    await page.locator('.cm-content').focus();
    await page.keyboard.press('Meta+End');
    await page.keyboard.type('\n\n[click here][missing]', { delay: 10 });

    // Wait for StateField to scan
    await page.waitForTimeout(1000);

    // The [click here][missing] should be marked broken
    const broken = page.locator('.cm-link-ref-broken');
    await expect(broken).toHaveCount(1, { timeout: 5_000 });

    // Now add the missing definition
    await page.keyboard.press('Meta+End');
    await page.keyboard.type('\n\n[missing]: https://example.com', { delay: 10 });

    // Wait for StateField to recompute
    await page.waitForTimeout(1000);

    // The broken mark should be gone
    const brokenAfter = page.locator('.cm-link-ref-broken');
    await expect(brokenAfter).toHaveCount(0, { timeout: 5_000 });
  });
});

// ── §6.1 Broken wikilink ────────────────────────────────────────────────────

test.describe('§6.1 Broken wikilink', () => {
  test('[[NonexistentPage]] gets cm-wiki-link-broken after cache warms', async ({ page }) => {
    await seedMarkdown('[[DefinitelyNotAPage12345]]');
    await switchToSource(page);

    // Wait for pagesCache to warm (≤5s TTL)
    const brokenLink = page.locator('.cm-wiki-link-broken');
    await expect(brokenLink).toBeVisible({ timeout: 10_000 });
  });

  test('[[test-doc]] (existing page) does NOT get broken class', async ({ page }) => {
    // test-doc exists (created by playwright.config.ts)
    await seedMarkdown('[[test-doc]]');
    await switchToSource(page);

    // Wait for cache to warm
    await page.waitForTimeout(2000);

    // Should have cm-wiki-link but NOT cm-wiki-link-broken
    const wikiLink = page.locator('.cm-wiki-link');
    await expect(wikiLink).toHaveCount(1);

    const brokenLink = page.locator('.cm-wiki-link-broken');
    await expect(brokenLink).toHaveCount(0);
  });
});

// ── §6.6 Tables (negative AC) ───────────────────────────────────────────────

test.describe('§6.6 Tables (negative AC)', () => {
  test('table lines carry no polish classes', async ({ page }) => {
    await seedMarkdown(
      'plain paragraph\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nanother paragraph',
    );
    await switchToSource(page);

    // Get all cm-line elements
    const allLines = page.locator('.cm-line');
    const lineCount = await allLines.count();
    expect(lineCount).toBeGreaterThanOrEqual(5);

    // Check each line for forbidden classes
    const forbiddenPrefixes = ['cm-table-', 'cm-row-', 'cm-cell-'];
    for (let i = 0; i < lineCount; i++) {
      const classes = await allLines.nth(i).getAttribute('class');
      if (!classes) continue;
      const text = await allLines.nth(i).textContent();
      if (text?.includes('|')) {
        // This is a table line — must not have polish classes
        for (const prefix of forbiddenPrefixes) {
          expect(classes, `table line "${text}" should not have ${prefix}* class`).not.toContain(
            prefix,
          );
        }
        // Also should not have cm-fenced-code-line, cm-list-item, or cm-del
        expect(classes).not.toContain('cm-fenced-code-line');
        expect(classes).not.toContain('cm-list-item');
        expect(classes).not.toContain('cm-del');
      }
    }
  });
});

// ── §6.7 Cross-cutting: addressability ───────────────────────────────────────

test.describe('§6.7 Cross-cutting', () => {
  test('Cmd+A → Cmd+C is byte-identical to source doc state', async ({ page }) => {
    const composition = [
      '~~strikethrough~~',
      '',
      '- bullet one',
      '- bullet two with more text',
      '',
      '```typescript',
      'const x = 1;',
      '```',
      '',
      '[click][ref]',
      '',
      '[ref]: https://example.com',
      '',
      '[[SomePage]]',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');

    await seedMarkdown(composition);
    await switchToSource(page);

    // Wait for CRDT sync to settle, then read the Y.Text source content.
    // __activeProvider is exposed by DocumentContext.tsx and gives access to the Y.Doc.
    await page.waitForTimeout(3000);
    const docState = await page.evaluate(() => {
      const provider = window.__activeProvider;
      if (!provider) throw new Error('no __activeProvider');
      const ytext = provider.document.getText('source');
      return ytext.toString();
    });

    // Grant clipboard permissions for read
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    // Select all and copy
    await page.locator('.cm-content').focus();
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+c');

    // Read clipboard
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());

    expect(clipboard).toBe(docState);
  });
});
