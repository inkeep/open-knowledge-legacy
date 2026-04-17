/**
 * Layer C (Tier 2): Outline panel heading navigation.
 *
 * Clicking an outline entry should scroll the matching heading into view in
 * WYSIWYG mode and jump the CodeMirror cursor to the matching heading line in
 * source mode. Source-mode indexing must skip YAML frontmatter so alignment
 * matches the server's extractHeadings output.
 *
 * Requires: Playwright browsers installed. Dev server started by
 * playwright.config.ts webServer on VITE_PORT (or default 5173).
 */

import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

const sourceToggle = (page: Page) => page.getByRole('radio', { name: 'Markdown source' });

const FILLER = 'Filler paragraph to force scrollable content. '.repeat(10);

// Frontmatter is intentionally present to exercise the source-mode frontmatter
// skip. "First" / "Second" / "Third" are distinct so we can disambiguate which
// heading got scrolled/focused.
const DOC = [
  '---',
  'title: Outline Navigation Test',
  '---',
  '',
  '# First Heading',
  '',
  FILLER,
  FILLER,
  FILLER,
  FILLER,
  FILLER,
  '',
  '## Second Heading',
  '',
  FILLER,
  FILLER,
  FILLER,
  FILLER,
  FILLER,
  '',
  '### Third Heading',
  '',
  FILLER,
  FILLER,
].join('\n');

async function createPage(path: string) {
  const res = await fetch(`${BASE}/api/create-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (res.status === 409) return;
  if (!res.ok) throw new Error(`create-page failed for ${path}: ${res.status}`);
}

async function seedDoc(page: Page): Promise<string> {
  const docName = `outline-${Date.now().toString(36)}`;
  await createPage(`${docName}.md`);
  await page.goto(`${BASE}/#/${docName}`);
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), {
    timeout: 15_000,
  });
  await page.waitForSelector('.ProseMirror');

  // Write content via agent-write-md (replace) so it lands in Y.Text and
  // (after the 2s persistence debounce) on disk where page-headings reads.
  const writeRes = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, markdown: DOC, position: 'replace' }),
  });
  if (!writeRes.ok) throw new Error(`agent-write-md failed: ${writeRes.status}`);

  // Poll page-headings until the 3 headings are observed from disk.
  await expect
    .poll(
      async () => {
        const r = await fetch(`${BASE}/api/page-headings?docName=${docName}`);
        if (!r.ok) return 0;
        const d = (await r.json()) as { ok: boolean; headings?: unknown[] };
        return d.ok ? (d.headings?.length ?? 0) : 0;
      },
      { timeout: 10_000, intervals: [200, 500, 1000] },
    )
    .toBe(3);

  // The WYSIWYG DOM also needs the 3 rendered headings for the click handler
  // to resolve by index.
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3').length === 3,
    { timeout: 10_000 },
  );

  return docName;
}

test('outline click scrolls to the matching heading in WYSIWYG mode', async ({ page }) => {
  await seedDoc(page);

  const outlinePanel = page.locator('#panel-outline');
  await expect(outlinePanel.getByRole('button', { name: 'Third Heading' })).toBeVisible();

  // "Third Heading" lives below a lot of filler, so before the click the
  // editor scroll container should still be near the top.
  const scroller = page.locator('.subtle-scrollbar').first();
  const scrollBefore = await scroller.evaluate((el) => el.scrollTop);
  expect(scrollBefore).toBeLessThan(50);

  await outlinePanel.getByRole('button', { name: 'Third Heading' }).click();

  // Smooth scroll — poll on the heading's viewport-relative top until the
  // animation settles at "near the top of the editor viewport".
  await expect
    .poll(
      async () =>
        page
          .locator('.ProseMirror h3')
          .first()
          .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
      { timeout: 5_000, intervals: [100, 200, 400] },
    )
    .toBeLessThan(200);

  // Sanity check that the scroll actually moved.
  const scrollAfter = await scroller.evaluate((el) => el.scrollTop);
  expect(scrollAfter).toBeGreaterThan(scrollBefore + 100);
});

test('outline click in source mode puts cursor on the heading line, skipping frontmatter', async ({
  page,
}) => {
  await seedDoc(page);

  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');

  const outlinePanel = page.locator('#panel-outline');
  await outlinePanel.getByRole('button', { name: 'Second Heading' }).click();

  // CodeMirror's active line highlight should now be on the `## Second Heading`
  // source line. If the frontmatter-skip were broken, index 1 would land on
  // `# First Heading` (or worse, a frontmatter line).
  const activeLineText = await page
    .locator('.cm-activeLine')
    .first()
    .evaluate((el) => el.textContent ?? '');
  expect(activeLineText).toContain('## Second Heading');
});
