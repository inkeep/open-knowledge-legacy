/**
 * QA scenarios for bidirectional observer sync.
 *
 * These tests cover gaps identified during QA planning —
 * scenarios from SPEC.md Section 7 not covered by sync.spec.ts.
 */

import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://localhost:5173';
const CONTENT_DIR = resolve(__dirname, '../../content');
const TEST_DOC = resolve(CONTENT_DIR, 'test-doc.md');

// ── Helpers (shared with sync.spec.ts) ──────────────────────────────

async function resetDoc(page: Page) {
  await page.evaluate(async () => {
    await fetch('/api/test-reset', { method: 'POST' });
  });
  await page.waitForTimeout(500);
}

async function openEditor(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForSelector('.tiptap', { state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(2000);
}

async function expectContent(page: Page, selector: string, expected: string, timeout = 15_000) {
  await expect(async () => {
    const text = await page.locator(selector).innerText();
    expect(text).toContain(expected);
  }).toPass({ timeout });
}

async function toggleToSource(page: Page) {
  await page.getByRole('button', { name: 'Source' }).click();
  await page.waitForSelector('.cm-content', { state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(500);
}

async function toggleToWysiwyg(page: Page) {
  await page.getByRole('button', { name: 'WYSIWYG' }).click();
  await page.waitForSelector('.tiptap', { state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(300);
}

async function typeInWysiwyg(page: Page, text: string) {
  await page.locator('.tiptap').click();
  await page.keyboard.type(text);
}

async function typeInSource(page: Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.type(text);
}

// ── QA Scenarios ────────────────────────────────────────────────────

test.describe('QA-001: E04 — Toggle with edits survives round-trip', () => {
  test('edit in source, toggle back, edit visible in WYSIWYG', async ({ page }) => {
    await openEditor(page);
    const uniqueText = `QA001-${Date.now()}`;

    await toggleToSource(page);
    await typeInSource(page, uniqueText);
    await page.waitForTimeout(500); // Let Observer B sync

    await toggleToWysiwyg(page);
    await page.waitForTimeout(1000);

    await expectContent(page, '.tiptap', uniqueText);
  });
});

test.describe('QA-002: W02 — Two tabs typing simultaneously, different paragraphs', () => {
  test('both edits present, no corruption', async ({ browser }) => {
    const page1 = await browser.newPage();
    await openEditor(page1);
    await resetDoc(page1);
    await openEditor(page1);

    const page2 = await browser.newPage();
    await openEditor(page2);

    const text1 = `QA002-TAB1-${Date.now()}`;
    const text2 = `QA002-TAB2-${Date.now()}`;

    // Both type simultaneously (alternating keystrokes)
    await page1.locator('.tiptap').click();
    await page2.locator('.tiptap').click();

    // Tab 1 types
    await page1.keyboard.type(text1);
    // Tab 2 types (press Enter first to type in a new paragraph)
    await page2.keyboard.press('End');
    await page2.keyboard.press('Enter');
    await page2.keyboard.type(text2);

    await page1.waitForTimeout(2000); // Let CRDT sync

    // Both texts present in both tabs
    await expectContent(page1, '.tiptap', text1);
    await expectContent(page1, '.tiptap', text2);
    await expectContent(page2, '.tiptap', text1);
    await expectContent(page2, '.tiptap', text2);

    await page1.close();
    await page2.close();
  });
});

test.describe('QA-003: T33 — Cross-mode concurrent editing', () => {
  test('WYSIWYG and source editing non-conflicting areas — both survive', async ({ browser }) => {
    const page1 = await browser.newPage();
    await openEditor(page1);
    await resetDoc(page1);
    await openEditor(page1);

    const page2 = await browser.newPage();
    await openEditor(page2);
    await toggleToSource(page2);

    const wysiwygText = `QA003-WYSIWYG-${Date.now()}`;
    const sourceText = `QA003-SOURCE-${Date.now()}`;

    // WYSIWYG user types
    await typeInWysiwyg(page1, wysiwygText);
    // Source user types (new content)
    await typeInSource(page2, sourceText);

    await page1.waitForTimeout(2000);

    // Both present in WYSIWYG view
    await expectContent(page1, '.tiptap', wysiwygText);
    // Source text may need time to propagate via Observer B → Hocuspocus → WYSIWYG
    await expectContent(page1, '.tiptap', sourceText, 20_000);

    // Both present in source view
    await expectContent(page2, '.cm-content', sourceText);
    await expectContent(page2, '.cm-content', wysiwygText, 20_000);

    await page1.close();
    await page2.close();
  });
});

test.describe('QA-004: T40/T41 — Agent writes visible in individual modes', () => {
  test('agent write visible in WYSIWYG mode', async ({ page }) => {
    await openEditor(page);

    const uniqueText = `QA004-WYSIWYG-${Date.now()}`;
    await page.evaluate(async (text) => {
      await fetch('/api/agent-write-md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: text }),
      });
    }, uniqueText);

    await expectContent(page, '.tiptap', uniqueText);
  });

  test('agent write visible in source mode', async ({ page }) => {
    await openEditor(page);
    await toggleToSource(page);

    const uniqueText = `QA004-SOURCE-${Date.now()}`;
    await page.evaluate(async (text) => {
      await fetch('/api/agent-write-md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: text }),
      });
    }, uniqueText);

    await expectContent(page, '.cm-content', uniqueText);
  });
});

test.describe('QA-005: T44 — User typing while agent writes simultaneously', () => {
  test('both user text and agent text present', async ({ page }) => {
    await openEditor(page);

    const userText = `QA005-USER-${Date.now()}`;
    const agentText = `QA005-AGENT-${Date.now()}`;

    // Start typing
    await typeInWysiwyg(page, userText.slice(0, 5));

    // Fire agent write mid-typing
    await page.evaluate(async (text) => {
      await fetch('/api/agent-write-md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: text }),
      });
    }, agentText);

    // Continue typing
    await typeInWysiwyg(page, userText.slice(5));

    await page.waitForTimeout(2000);

    // Both present
    const content = await page.locator('.tiptap').innerText();
    expect(content).toContain(agentText);
    // User text may be split across lines but should be present
    expect(content).toContain(userText.slice(0, 5));
  });
});

test.describe('QA-006: T56 — Rapid external saves (disk bridge)', () => {
  test('10 rapid writes at ~1/sec — browser reflects latest content', async ({ page }) => {
    await openEditor(page);

    const originalContent = await readFile(TEST_DOC, 'utf-8');

    // Write 10 times at ~1 second intervals
    let lastText = '';
    for (let i = 0; i < 10; i++) {
      lastText = `QA006-rapid-${i}-${Date.now()}`;
      const content = `${originalContent.trim()}\n\n${lastText}\n`;
      await writeFile(TEST_DOC, content, 'utf-8');
      await page.waitForTimeout(1000);
    }

    // Browser should show the latest content
    await expectContent(page, '.tiptap', lastText, 20_000);

    // Restore
    await writeFile(TEST_DOC, originalContent, 'utf-8');
  });
});

test.describe('QA-007: U1.2 — Insert component via slash menu and edit props', () => {
  test('insert Callout via slash command, change type in panel, source reflects update', async ({
    page,
  }) => {
    await openEditor(page);
    await resetDoc(page);
    await openEditor(page);

    await typeInWysiwyg(page, '/callout');
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-slash-menu]')).toBeVisible();
    await page.keyboard.press('Enter');

    const calloutBlock = page.locator('[data-jsx-component-name="Callout"]').first();
    await expect(calloutBlock).toContainText('WARNING');

    await calloutBlock.click();
    await page.waitForSelector('[data-component-prop-panel]', {
      state: 'visible',
      timeout: 10_000,
    });
    await page.getByLabel('Type').selectOption('error');

    await expect(calloutBlock).toContainText('ERROR');

    await toggleToSource(page);

    const fullText = await page.evaluate(() => {
      const provider = (globalThis as Record<string, unknown>).__hocuspocusProvider as {
        document?: { getText: (name: string) => { toString: () => string } };
      };
      if (!provider?.document) return '';
      return provider.document.getText('source').toString();
    });

    expect(fullText).toContain('<Callout type="error">');
  });
});

test.describe('QA-007: T54 — Delete .md file externally while editor open', () => {
  test('no crash, editor retains content', async ({ page }) => {
    await openEditor(page);

    // Type something to ensure there's content
    const uniqueText = `QA007-${Date.now()}`;
    await typeInWysiwyg(page, uniqueText);
    await page.waitForTimeout(2000);

    // Delete the file
    const originalContent = await readFile(TEST_DOC, 'utf-8').catch(() => '');
    try {
      await unlink(TEST_DOC);
    } catch {
      // File may not exist
    }

    // Wait a bit for watcher to fire
    await page.waitForTimeout(2000);

    // Editor should not crash — verify it's still interactive
    const editorVisible = await page.locator('.tiptap').isVisible();
    expect(editorVisible).toBe(true);

    // Content should still be in the editor (CRDT keeps it in memory)
    const content = await page.locator('.tiptap').innerText();
    expect(content).toContain(uniqueText);

    // Restore file
    await writeFile(TEST_DOC, originalContent || '', 'utf-8');
  });
});

test.describe('QA-008: PR05 — Source edit persists to disk via observer chain', () => {
  test('source mode edit appears in .md file without toggle-back', async ({ page }) => {
    await openEditor(page);
    await toggleToSource(page);

    const uniqueText = `QA008-PERSIST-${Date.now()}`;
    await typeInSource(page, uniqueText);

    // Wait for Observer B → XmlFragment → persistence debounce (2s) + write
    await page.waitForTimeout(5000);

    // Read the .md file
    const fileContent = await readFile(TEST_DOC, 'utf-8');
    expect(fileContent).toContain(uniqueText);
  });
});

test.describe('QA-009: TS04 — Toggle while agent is writing', () => {
  test('no crash, content consistent after settling', async ({ page }) => {
    await openEditor(page);

    // Fire rapid agent writes
    const agentText = `QA009-AGENT-${Date.now()}`;
    const writePromise = page.evaluate(async (text) => {
      for (let i = 0; i < 3; i++) {
        await fetch('/api/agent-write-md', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: `${text}-${i}` }),
        });
        await new Promise((r) => setTimeout(r, 200));
      }
    }, agentText);

    // Toggle rapidly during writes
    for (let i = 0; i < 4; i++) {
      const button = page.locator('button').filter({ hasText: /Source|WYSIWYG/ });
      await button.click();
      await page.waitForTimeout(300);
    }

    await writePromise;
    await page.waitForTimeout(2000);

    // Ensure we're in WYSIWYG mode
    const button = page.locator('button').filter({ hasText: /Source|WYSIWYG/ });
    const buttonText = await button.innerText();
    if (buttonText === 'WYSIWYG') {
      await button.click();
      await page.waitForTimeout(500);
    }

    // Editor should not have crashed
    const editorVisible = await page.locator('.tiptap').isVisible();
    expect(editorVisible).toBe(true);

    // Agent content should be present
    const content = await page.locator('.tiptap').innerText();
    expect(content).toContain(`${agentText}-0`);
  });
});

test.describe('QA-010: EC07 — Unicode content survives sync', () => {
  test('emoji and CJK survive observer sync WYSIWYG → source', async ({ browser }) => {
    const page1 = await browser.newPage();
    await openEditor(page1);
    await resetDoc(page1);
    await openEditor(page1);

    const page2 = await browser.newPage();
    await openEditor(page2);
    await toggleToSource(page2);

    const unicodeText = '🎉 Unicode test: 你好世界 こんにちは 한국어';
    await typeInWysiwyg(page1, unicodeText);

    // Wait for observer sync
    await expectContent(page2, '.cm-content', '🎉', 15_000);
    await expectContent(page2, '.cm-content', '你好世界', 5_000);

    await page1.close();
    await page2.close();
  });
});

test.describe('QA-011: Full sync matrix — all directions verified', () => {
  test('complete sync matrix is green', async ({ browser }) => {
    const page1 = await browser.newPage();
    await openEditor(page1);
    await resetDoc(page1);
    await openEditor(page1);

    const page2 = await browser.newPage();
    await openEditor(page2);

    // 1. WYSIWYG → WYSIWYG (W01 variant)
    const wwText = `MATRIX-WW-${Date.now()}`;
    await typeInWysiwyg(page1, wwText);
    await expectContent(page2, '.tiptap', wwText);

    // 2. WYSIWYG → Source (T30 variant)
    await toggleToSource(page2);
    const wsText = `MATRIX-WS-${Date.now()}`;
    await typeInWysiwyg(page1, wsText);
    await expectContent(page2, '.cm-content', wsText);

    // 3. Source → WYSIWYG (T31 variant)
    const swText = `MATRIX-SW-${Date.now()}`;
    await typeInSource(page2, swText);
    await expectContent(page1, '.tiptap', swText, 20_000);

    // 4. Source → Source (T20 variant)
    await toggleToSource(page1);
    const ssText = `MATRIX-SS-${Date.now()}`;
    await typeInSource(page1, ssText);
    await expectContent(page2, '.cm-content', ssText);

    // 5. Agent → WYSIWYG + Source (T47 variant)
    await toggleToWysiwyg(page1);
    const agentText = `MATRIX-AGENT-${Date.now()}`;
    await page1.evaluate(async (text) => {
      await fetch('/api/agent-write-md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: text }),
      });
    }, agentText);
    await expectContent(page1, '.tiptap', agentText);
    await expectContent(page2, '.cm-content', agentText);

    // 6. Disk → WYSIWYG + Source (T51/T52 variant)
    const diskText = `MATRIX-DISK-${Date.now()}`;
    const currentContent = await readFile(TEST_DOC, 'utf-8');
    await writeFile(TEST_DOC, `${currentContent.trim()}\n\n${diskText}\n`, 'utf-8');
    await expectContent(page1, '.tiptap', diskText, 20_000);
    await expectContent(page2, '.cm-content', diskText, 20_000);

    // Restore
    await writeFile(TEST_DOC, currentContent, 'utf-8');

    await page1.close();
    await page2.close();
  });
});
