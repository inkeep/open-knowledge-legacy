/**
 * E2E tests for bidirectional observer sync.
 *
 * Real browser tests: two Chromium pages connected via the same
 * Hocuspocus server, verifying multi-tab collaboration, cross-mode
 * sync, agent writes, disk bridge, and shimmer measurement.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://localhost:5173';
const CONTENT_DIR = resolve(__dirname, '../../content');
const TEST_DOC = resolve(CONTENT_DIR, 'test-doc.md');
const TEST_FIXTURE = resolve(CONTENT_DIR, 'test-fixture.md');

// ── Helpers ──────────────────────────────────────────────────────────

/** Reset the Hocuspocus document so tests start with clean state. */
async function resetDoc(page: Page) {
  await page.evaluate(async () => {
    await fetch('/api/test-reset', { method: 'POST' });
  });
  await page.waitForTimeout(500);
}

/** Navigate and wait for TipTap editor + WebSocket sync. */
async function openEditor(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForSelector('.tiptap', { state: 'attached', timeout: 10_000 });
  // Wait for HocuspocusProvider to connect and sync
  await page.waitForTimeout(2000);
}

/** Poll until content appears (Playwright best practice for async sync). */
async function expectContent(page: Page, selector: string, expected: string, timeout = 15_000) {
  await expect(async () => {
    const text = await page.locator(selector).innerText();
    expect(text).toContain(expected);
  }).toPass({ timeout });
}

/** Toggle to source mode. */
async function toggleToSource(page: Page) {
  await page.getByRole('button', { name: 'Source' }).click();
  await page.waitForSelector('.cm-content', { state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(500); // Wait for yCollab binding
}

/** Toggle back to WYSIWYG. */
async function toggleToWysiwyg(page: Page) {
  await page.getByRole('button', { name: 'WYSIWYG' }).click();
  await page.waitForSelector('.tiptap', { state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(300);
}

/** Type in WYSIWYG editor. */
async function typeInWysiwyg(page: Page, text: string) {
  await page.locator('.tiptap').click();
  await page.keyboard.type(text);
}

/** Type in source editor. */
async function typeInSource(page: Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.type(text);
}

// ── Tests ────────────────────────────────────────────────────────────

test.describe('Multi-tab WYSIWYG sync', () => {
  test('W01: two pages in WYSIWYG — page 1 types, page 2 sees it', async ({ browser }) => {
    const page1 = await browser.newPage();
    await openEditor(page1);
    await resetDoc(page1);
    await openEditor(page1);

    const page2 = await browser.newPage();
    await openEditor(page2);

    const uniqueText = `W01-${Date.now()}`;
    await typeInWysiwyg(page1, uniqueText);

    await expectContent(page2, '.tiptap', uniqueText);

    await page1.close();
    await page2.close();
  });
});

test.describe('Multi-tab source mode sync', () => {
  test('T20: two pages in source mode — collaborative editing', async ({ browser }) => {
    const page1 = await browser.newPage();
    await openEditor(page1);
    await resetDoc(page1);
    await openEditor(page1);

    const page2 = await browser.newPage();
    await openEditor(page2);

    await toggleToSource(page1);
    await toggleToSource(page2);

    const uniqueText = `T20-${Date.now()}`;
    await typeInSource(page1, uniqueText);

    await expectContent(page2, '.cm-content', uniqueText);

    await page1.close();
    await page2.close();
  });
});

test.describe('Cross-mode sync', () => {
  test('T30: WYSIWYG types → source sees markdown', async ({ browser }) => {
    const page1 = await browser.newPage();
    await openEditor(page1);
    await resetDoc(page1);
    await openEditor(page1);

    const page2 = await browser.newPage();
    await openEditor(page2);
    await toggleToSource(page2);

    const uniqueText = `T30-${Date.now()}`;
    await typeInWysiwyg(page1, uniqueText);

    await expectContent(page2, '.cm-content', uniqueText);

    await page1.close();
    await page2.close();
  });

  test('T31: source types markdown → WYSIWYG sees rendered content', async ({ browser }) => {
    const page1 = await browser.newPage();
    await openEditor(page1);
    await resetDoc(page1);
    await openEditor(page1);

    const page2 = await browser.newPage();
    await openEditor(page2);

    await toggleToSource(page1);

    const uniqueText = `T31-${Date.now()}`;
    await typeInSource(page1, uniqueText);

    // Observer B debounce (50ms) + Hocuspocus sync + render
    await expectContent(page2, '.tiptap', uniqueText);

    await page1.close();
    await page2.close();
  });
});

test.describe('Toggle round-trip', () => {
  test('E03: WYSIWYG → source → WYSIWYG — content identical', async ({ page }) => {
    await openEditor(page);

    await typeInWysiwyg(page, 'E03-stable');
    await page.waitForTimeout(500);

    const beforeContent = await page.locator('.tiptap').innerText();

    await toggleToSource(page);
    await page.waitForTimeout(500);
    await toggleToWysiwyg(page);
    await page.waitForTimeout(500);

    const afterContent = await page.locator('.tiptap').innerText();
    expect(afterContent).toBe(beforeContent);
  });

  test('TS03: toggle 10 times rapidly — content stable', async ({ page }) => {
    await openEditor(page);

    await typeInWysiwyg(page, 'TS03-stable');
    await page.waitForTimeout(500);

    const beforeContent = await page.locator('.tiptap').innerText();

    for (let i = 0; i < 10; i++) {
      await page
        .locator('button')
        .filter({ hasText: /Source|WYSIWYG/ })
        .click();
      await page.waitForTimeout(100);
    }

    // Ensure we're back in WYSIWYG
    const button = page.locator('button').filter({ hasText: /Source|WYSIWYG/ });
    const buttonText = await button.innerText();
    if (buttonText === 'WYSIWYG') {
      await button.click();
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(500);
    const afterContent = await page.locator('.tiptap').innerText();
    expect(afterContent).toBe(beforeContent);
  });
});

test.describe('Agent writes', () => {
  test('T47: agent write via /api/agent-write-md appears in both modes', async ({ browser }) => {
    const page1 = await browser.newPage();
    await openEditor(page1);
    await resetDoc(page1);
    await openEditor(page1);

    const page2 = await browser.newPage();
    await openEditor(page2);
    await toggleToSource(page2);

    // Agent write via API
    const uniqueText = `T47-agent-${Date.now()}`;
    await page1.evaluate(async (text) => {
      await fetch('/api/agent-write-md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: text }),
      });
    }, uniqueText);

    // Check WYSIWYG page — Observer B must propagate Y.Text→XmlFragment
    await expectContent(page1, '.tiptap', uniqueText);

    // Check source page — Y.Text updated directly
    await expectContent(page2, '.cm-content', uniqueText);

    await page1.close();
    await page2.close();
  });
});

test.describe('Disk bridge', () => {
  test('T51: edit .md file on disk → content appears in WYSIWYG', async ({ page }) => {
    await openEditor(page);

    // Write unique content to test-doc.md (the file backing the open Hocuspocus doc)
    const uniqueText = `T51-disk-${Date.now()}`;
    const currentContent = await readFile(TEST_DOC, 'utf-8');

    const newContent = `${currentContent.trim()}\n\n${uniqueText}\n`;
    await writeFile(TEST_DOC, newContent, 'utf-8');

    // Wait for file watcher + observer propagation
    await expectContent(page, '.tiptap', uniqueText, 20_000);

    // Restore original content
    await writeFile(TEST_DOC, currentContent, 'utf-8');
  });

  test('T52: edit .md file on disk → content appears in source mode', async ({ page }) => {
    await openEditor(page);
    await toggleToSource(page);

    const uniqueText = `T52-disk-${Date.now()}`;
    const currentContent = await readFile(TEST_DOC, 'utf-8');

    const newContent = `${currentContent.trim()}\n\n${uniqueText}\n`;
    await writeFile(TEST_DOC, newContent, 'utf-8');

    await expectContent(page, '.cm-content', uniqueText, 20_000);

    // Restore original content
    await writeFile(TEST_DOC, currentContent, 'utf-8');
  });
});

test.describe('Shimmer measurement', () => {
  test('S01: WYSIWYG keystroke — observer firings ≤ 2', async ({ page }) => {
    await openEditor(page);

    // Instrument observer firings via console
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('[Observer')) {
        consoleLogs.push(msg.text());
      }
    });

    // Type a single character
    await typeInWysiwyg(page, 'x');
    await page.waitForTimeout(2000);

    // Observer A fires at most once, Observer B fires at most once = max 2 total
    const observerAFirings = consoleLogs.filter((l) => l.includes('[Observer A]')).length;
    const observerBFirings = consoleLogs.filter((l) => l.includes('[Observer B]')).length;

    // Verify content stability (no shimmer)
    const content = await page.locator('.tiptap').innerText();
    expect(content).toBeTruthy();
    expect(observerAFirings + observerBFirings).toBeLessThanOrEqual(2);
  });

  test('S02: source keystroke — observer firings ≤ 2', async ({ page }) => {
    await openEditor(page);
    await toggleToSource(page);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('[Observer')) {
        consoleLogs.push(msg.text());
      }
    });

    await typeInSource(page, 'y');
    await page.waitForTimeout(2000);

    const observerAFirings = consoleLogs.filter((l) => l.includes('[Observer A]')).length;
    const observerBFirings = consoleLogs.filter((l) => l.includes('[Observer B]')).length;

    const content = await page.locator('.cm-content').innerText();
    expect(content).toBeTruthy();
    expect(observerAFirings + observerBFirings).toBeLessThanOrEqual(2);
  });
});

test.describe('Void node fidelity', () => {
  test('T61: jsx-component survives observer cycle — visible in source', async ({ page }) => {
    // Load fixture content into test-doc so the app has jsx-component content
    const fixtureContent = await readFile(TEST_FIXTURE, 'utf-8');

    // Reset doc first, then write fixture content, then reload
    await openEditor(page);
    await resetDoc(page);
    await writeFile(TEST_DOC, fixtureContent, 'utf-8');
    await openEditor(page);

    // Wait for persistence to load the fixture content
    await page.waitForTimeout(1500);

    await toggleToSource(page);
    await page.waitForTimeout(1000);

    // CM6 virtualizes long content — .innerText() only shows viewport.
    // Read Y.Text('source') directly for the complete content.
    const fullText = await page.evaluate(() => {
      const provider = (globalThis as Record<string, unknown>).__hocuspocusProvider as any;
      if (!provider) return '';
      return provider.document.getText('source').toString();
    });

    expect(fullText).toContain('jsx-component');

    // Restore empty test-doc
    await writeFile(TEST_DOC, '', 'utf-8');

    await page.close();
  });
});
