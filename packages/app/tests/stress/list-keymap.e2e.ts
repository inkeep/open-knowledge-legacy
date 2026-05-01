
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  type ApiHelpers,
  expect,
  test,
  waitForPmSelectionInNode,
  waitForActiveProviderSynced as waitForProvider,
} from './_helpers';

async function getYText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const provider = window.__activeProvider;
    return provider?.document?.getText('source')?.toString() ?? '';
  });
}

async function seedMarkdown(api: ApiHelpers, page: Page, docName: string, markdown: string) {
  await api.replaceDoc(docName, markdown);
  await expect.poll(() => getYText(page)).toContain(markdown.split('\n')[0]?.trim() || '');
  await expect(page.locator('.ProseMirror')).not.toBeEmpty();
}

async function openDoc(api: ApiHelpers, page: Page, docName: string) {
  await api.createPage(`${docName}.md`);
  await api.testReset(docName);
  await page.goto(`/#/${docName}`);
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
}

function uniqueDocName(label: string): string {
  return `test-listkeymap-${label}-${randomUUID().slice(0, 8)}`;
}

test.describe('OQ1: Tab/Shift-Tab scoping by cursor context', () => {
  test('Tab inside a listItem increases list depth', async ({ page, api }) => {
    const docName = uniqueDocName('tab-listitem');
    await openDoc(api, page, docName);
    await seedMarkdown(api, page, docName, '- first\n- second\n');

    await page.locator('.ProseMirror').focus();
    await page.locator('.ProseMirror li').nth(1).click();
    await page.keyboard.press('End');

    await waitForPmSelectionInNode(page, 'listItem');

    await page.keyboard.press('Tab');

    await expect.poll(() => getYText(page)).toMatch(/ {2}[-*+] second/);
    const ytext = await getYText(page);
    expect(ytext).toContain('- first');
  });

  test('Shift-Tab inside a nested listItem lifts it one level', async ({ page, api }) => {
    const docName = uniqueDocName('shifttab-nested');
    await openDoc(api, page, docName);
    await seedMarkdown(api, page, docName, '- top\n  - nested\n');

    await page.locator('.ProseMirror').focus();
    const nestedLi = page.locator('.ProseMirror li li').first();
    await nestedLi.click();
    await page.keyboard.press('End');

    await waitForPmSelectionInNode(page, 'listItem');

    await page.keyboard.press('Shift+Tab');

    await expect.poll(() => getYText(page)).toMatch(/^- top\n- nested/m);
  });

  test('Tab inside a tableCell advances to the next cell (list keymap does NOT hijack)', async ({
    page,
    api,
  }) => {
    const docName = uniqueDocName('tab-tablecell');
    await openDoc(api, page, docName);
    await seedMarkdown(api, page, docName, '| a | b |\n| - | - |\n| 1 | 2 |\n');

    const editor = page.locator('.ProseMirror');
    const cellOne = editor.locator('td').filter({ hasText: /^1$/ });
    await cellOne.click();
    await expect(editor).toBeFocused();
    await page.keyboard.press('End');

    await waitForPmSelectionInNode(page, 'tableCell');

    const cellBeforeText = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      let el: Node | null = sel.anchorNode;
      while (el) {
        if (el.nodeType === 1 && (el as Element).matches('td,th')) {
          return (el as Element).textContent?.trim() ?? '';
        }
        el = el.parentNode;
      }
      return null;
    });
    expect(cellBeforeText).toBe('1');

    await editor.press('Tab');

    await expect
      .poll(() =>
        page.evaluate(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return null;
          let el: Node | null = sel.anchorNode;
          while (el) {
            if (el.nodeType === 1 && (el as Element).matches('td,th')) {
              return (el as Element).textContent?.trim() ?? '';
            }
            el = el.parentNode;
          }
          return null;
        }),
      )
      .toBe('2');

    const stillInTable = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      let el: Node | null = sel.anchorNode;
      while (el) {
        if (el.nodeType === 1 && (el as Element).matches('td,th')) return true;
        el = el.parentNode;
      }
      return false;
    });
    expect(stillInTable).toBe(true);

    const ytext = await getYText(page);
    expect(ytext).toContain('| 1 | 2 |');
    expect(ytext).not.toMatch(/^ {2}/m);
  });

  test.fixme('Tab inside a codeBlock inserts a literal tab character', async ({ page, api }) => {
    const docName = uniqueDocName('tab-codeblock');
    await openDoc(api, page, docName);
    await seedMarkdown(api, page, docName, '```\nfirst\n```\n');

    await page.locator('.ProseMirror').focus();
    await page.locator('.ProseMirror pre code').click();
    await page.keyboard.press('End');

    await page.keyboard.press('Tab');

    await expect.poll(() => getYText(page)).toMatch(/first\t/);
    const ytext = await getYText(page);
    expect(ytext).toMatch(/first\t/);
    expect(ytext).toContain('```');
    expect(ytext).not.toMatch(/^- /m);
  });
});
