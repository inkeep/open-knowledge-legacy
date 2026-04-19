/**
 * Layer C (Tier 2): Playwright UX integration tests.
 *
 * Critical UX flows that require a real browser: WYSIWYG↔Source sync,
 * round-trip toggle, and concurrent agent writes during editing.
 *
 * Requires: Playwright browsers installed. Dev server started by
 * playwright.config.ts webServer on VITE_PORT (or default 5173).
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  type ApiHelpers,
  expect,
  test,
  waitForActiveProviderSynced as waitForProvider,
} from './_helpers';

/** Get the current Y.Text content from the provider */
async function getYText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const provider = window.__activeProvider;
    return provider?.document?.getText('source')?.toString() ?? '';
  });
}

function uniqueDocName(label: string): string {
  return `test-ux-${label}-${randomUUID().slice(0, 8)}`;
}

/**
 * Create a per-test doc, reset it on the server, open it, and wait for sync.
 * Returns the docName so tests can pass it to agent-write-md.
 */
async function openFreshDoc(api: ApiHelpers, page: Page, label: string): Promise<string> {
  const docName = uniqueDocName(label);
  await api.createPage(`${docName}.md`);
  await api.testReset(docName);
  await page.goto(`/#/${docName}`);
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
  return docName;
}

// Editor mode toggle is a Radix ToggleGroup with type="single" — items render
// as role="radio" (not "button") and carry aria-label="Visual editor" / "Markdown source".
// PR #35 restructured the header; these helpers centralize the selector so a future
// redesign only needs one update site.
const sourceToggle = (page: Page) => page.getByRole('radio', { name: 'Markdown source' });
const visualToggle = (page: Page) => page.getByRole('radio', { name: 'Visual editor' });

test('WYSIWYG→Source: typing in ProseMirror appears in CodeMirror', async ({ page, api }) => {
  await openFreshDoc(api, page, 'wysiwyg-to-source');
  // Type in WYSIWYG mode. `.click()` + `toBeFocused()` is load-bearing under
  // full-suite parallel load: `.focus()` does not await focus-transfer in
  // Chromium, and keystrokes dispatched before focus lands can be reordered or
  // misdelivered to the wrong target (the prior active element or body). The
  // hard sync on `toBeFocused()` eliminates the race.
  await page.locator('.ProseMirror').click();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.type('Hello from WYSIWYG', { delay: 10 });

  // Wait for Observer A to sync to Y.Text
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('Hello from WYSIWYG'),
    { timeout: 10_000 },
  );

  // Switch to Source mode
  await sourceToggle(page).click();

  // Verify CodeMirror shows the typed content
  const cmContent = await page.locator('.cm-content').textContent();
  expect(cmContent).toContain('Hello from WYSIWYG');
});

test('Source→WYSIWYG: typing in CodeMirror renders in ProseMirror', async ({ page, api }) => {
  await openFreshDoc(api, page, 'source-to-wysiwyg');
  // Switch to Source mode
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');

  // Type markdown in CodeMirror. See line 57 comment — `click()` + `toBeFocused()`
  // is the canonical pattern; bare `.focus()` races with `keyboard.type` under
  // full-suite parallel CI load and produces reordered/misdelivered keystrokes
  // (evidence at commit 7e0f2c47's successor: CodeMirror rendered
  // `#\n\nource Heading\n\nParagraph from source.\nS\n` on one CI run).
  await page.locator('.cm-content').click();
  await expect(page.locator('.cm-content')).toBeFocused();
  await page.keyboard.type('# Source Heading\n\nParagraph from source.', { delay: 10 });

  // Wait for Y.Text to have the content
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('Source Heading'),
    { timeout: 10_000 },
  );

  // Switch back to WYSIWYG
  await visualToggle(page).click();

  // Wait for ProseMirror to render the FULL synced content. Checking only
  // for 'Source Heading' is too permissive: y-prosemirror applies XmlFragment
  // → PM mutations incrementally over ~50-100ms under CPU contention, so PM
  // transiently shows a partial render like "Source HeadingParagraph fro"
  // where the heading substring is already present but the paragraph is
  // truncated mid-word. The wait condition must match every substring the
  // subsequent assertion will read — otherwise waitForFunction resolves on
  // the partial state and the `textContent()` read below catches PM
  // mid-render. Mirrors the round-trip test's pattern at line 144-148.
  await page.waitForFunction(
    () => {
      const content = document.querySelector('.ProseMirror')?.textContent ?? '';
      return content.includes('Source Heading') && content.includes('Paragraph from source');
    },
    { timeout: 10_000 },
  );

  // Verify ProseMirror renders the content
  const pmContent = await page.locator('.ProseMirror').textContent();
  expect(pmContent).toContain('Source Heading');
  expect(pmContent).toContain('Paragraph from source');
});

test('round-trip: edits in both modes survive toggle cycle', async ({ page, api }) => {
  await openFreshDoc(api, page, 'round-trip');
  // Type in WYSIWYG — see line 57 comment for the focus-race rationale.
  await page.locator('.ProseMirror').click();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.type('WYSIWYG edit', { delay: 10 });

  // Wait for sync
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('WYSIWYG edit'),
    { timeout: 10_000 },
  );

  // Switch to Source, type there
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');
  await page.locator('.cm-content').focus();
  // Move to end before typing
  await page.keyboard.press('End');
  await page.keyboard.type('\n\nSource edit', { delay: 10 });

  // Wait for Y.Text to have both edits
  await page.waitForFunction(
    () => {
      const txt = window.__activeProvider?.document?.getText('source')?.toString();
      return txt?.includes('WYSIWYG edit') && txt?.includes('Source edit');
    },
    { timeout: 10_000 },
  );

  // Switch back to WYSIWYG
  await visualToggle(page).click();

  // Wait for ProseMirror to render both edits
  await page.waitForFunction(
    () => {
      const content = document.querySelector('.ProseMirror')?.textContent ?? '';
      return content.includes('WYSIWYG edit') && content.includes('Source edit');
    },
    { timeout: 10_000 },
  );

  // Both edits should be present
  const pmContent = await page.locator('.ProseMirror').textContent();
  expect(pmContent).toContain('WYSIWYG edit');
  expect(pmContent).toContain('Source edit');
});

test('concurrent agent write: user + agent content coexist', async ({ page, api, baseURL }) => {
  const docName = await openFreshDoc(api, page, 'concurrent-agent');
  // Type in WYSIWYG — see line 57 comment for the focus-race rationale.
  await page.locator('.ProseMirror').click();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.type('User typing', { delay: 10 });

  // Wait for user content to sync
  await page.waitForFunction(
    () => window.__activeProvider?.document?.getText('source')?.toString()?.includes('User typing'),
    { timeout: 10_000 },
  );

  // Agent writes via API while user is editing. Uses default `position: append`
  // (omitted) to stack on top of the user's typing — the whole point of this
  // test is coexistence, not replace.
  const res = await fetch(`${baseURL}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, markdown: '## Agent Section\n\nAgent content here.' }),
  });
  expect(res.ok).toBe(true);

  // Wait for agent content to propagate
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('Agent Section'),
    { timeout: 10_000 },
  );

  // Switch to Source to see both
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');

  const sourceContent = await getYText(page);
  expect(sourceContent).toContain('User typing');
  expect(sourceContent).toContain('Agent Section');
  expect(sourceContent).toContain('Agent content here');
});

test('sidebar folder: row click navigates to folder overview; chevron toggles expand/collapse', async ({
  page,
}) => {
  // Contract (post-PR #175 folder-aware link handling): the folder row button
  // navigates to the folder's resolved target (#/<folderPath>) on click, and
  // the SidebarMenuAction chevron carries the `aria-expanded` affordance +
  // toggle. Pre-#175 the row itself toggled — that version of this test lived
  // at this path and was failing post-merge (two main commits red before the
  // rewrite) until it was updated to the new contract here.
  //
  // Ancestor-priority UX (US-011): while a doc inside sidebar-folder is
  // active, the folder is unconditionally expanded — clicking the collapse
  // chevron is a no-op for the derived state because `ancestors` takes
  // priority over `userCollapsed`. The test exercises the toggle BEFORE
  // navigating into the folder (where toggle IS honored) and asserts the
  // ancestor-priority behavior after navigation. See reveal-on-activate.e2e.ts
  // for Model A semantics coverage.
  //
  // This test relies only on the pre-seeded sidebar-folder/nested-doc.md
  // fixture (see `_helpers/fixtures.ts`'s per-worker seeding). It does not
  // write content, so no per-test doc is required.
  await page.goto('/');
  const folderRow = page.getByRole('button', { name: 'sidebar-folder', exact: true });
  const chevron = page.getByRole('button', { name: 'Expand sidebar-folder' });
  // Scope to the sidebar — `getByText('nested-doc.md')` would also match the
  // EditorHeader's `${activeDocName}.md` label after navigating into the file,
  // causing toHaveCount(0) to fail on collapse even though the sidebar entry is
  // correctly hidden.
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  const nestedFile = sidebar.getByText('nested-doc.md');

  // Starts collapsed — chevron reflects state, nested child not visible
  await expect(folderRow).toBeVisible();
  await expect(chevron).toHaveAttribute('aria-expanded', 'false');
  await expect(nestedFile).toHaveCount(0);

  // Chevron click toggles expand/collapse when folder is NOT an active-doc
  // ancestor (pre-nav state). The chevron is intentionally the toggle
  // affordance (keyboard-reachable, state-bearing); the row itself is the
  // navigation affordance.
  await chevron.click();
  // After expand, the chevron's accessible name flips to "Collapse sidebar-folder"
  const chevronCollapse = page.getByRole('button', { name: 'Collapse sidebar-folder' });
  await expect(chevronCollapse).toHaveAttribute('aria-expanded', 'true');
  await expect(nestedFile).toBeVisible();

  // Pre-nav toggle: clicking collapse BEFORE navigating into the folder IS
  // honored (not an active-doc ancestor yet).
  await chevronCollapse.click();
  await expect(chevron).toHaveAttribute('aria-expanded', 'false');
  await expect(nestedFile).toHaveCount(0);

  // Re-expand so we can navigate to the nested doc.
  await chevron.click();
  await expect(chevronCollapse).toHaveAttribute('aria-expanded', 'true');
  await expect(nestedFile).toBeVisible();

  // Nested file click navigates to the doc — the folder becomes an ancestor.
  await nestedFile.click();
  await expect(page).toHaveURL(/#\/sidebar-folder\/nested-doc$/);

  // Ancestor priority: clicking the collapse chevron does NOT collapse the
  // folder because it's an active-doc ancestor. aria-expanded stays true;
  // nested-doc.md stays visible in the sidebar.
  await chevronCollapse.click();
  await expect(chevronCollapse).toHaveAttribute('aria-expanded', 'true');
  await expect(nestedFile).toBeVisible();

  // Row click navigates to the folder's resolved target (overview URL shape is
  // `#/<folderPath>`, same as a doc URL — folder vs doc resolution happens in
  // the editor layer via `resolveNavigationTarget` per PR #175).
  await folderRow.click();
  await expect(page).toHaveURL(/#\/sidebar-folder$/);
});

test('markdown link edit dialog preserves page mode while clearing and updates the href target', async ({
  page,
  api,
}) => {
  const docName = await openFreshDoc(api, page, 'link-edit');
  const doc = '[Beta page](beta.md)';

  await api.replaceDoc(docName, doc);

  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('[Beta page](beta.md)'),
    { timeout: 10_000 },
  );

  const chip = page.locator('[data-internal-link]').first();
  await expect(chip).toHaveAttribute('data-doc-name', 'beta');

  // The `Link options` button is hidden via Tailwind `hidden` (display:
  // none) and revealed on `:hover` or `:focus-within` of the `.group`
  // ancestor (InternalLinkView.tsx). Playwright's hover + focus
  // primitives are unreliable for triggering these pseudo-classes
  // across headless Chromium / WebKit / Firefox — pointer-state
  // inference differs per browser and display:none elements have no
  // geometry, so `{ force: true }` can't target them either. This test
  // verifies the button's onClick behavior (opens Edit-link dialog and
  // preserves page mode), NOT the CSS visibility transition. Surgically
  // remove the `hidden` class so the click target is deterministically
  // interactable in all three browsers.
  await chip.evaluate((el) => {
    const btn = el.querySelector('button[aria-label="Link options"]');
    if (btn) btn.classList.remove('hidden');
  });
  await chip.getByRole('button', { name: 'Link options' }).click();
  await page.getByText('Edit link', { exact: true }).click();

  const pageLabel = page.locator('label').filter({ hasText: 'Page' }).first();
  const sectionLabel = page.locator('label').filter({ hasText: 'Section' }).first();
  const targetInput = page
    .locator('input[placeholder="guides/install or https://example.com"]')
    .first();
  await expect(pageLabel).toBeVisible();
  await expect(sectionLabel).toBeVisible();

  await targetInput.fill('');
  await expect(pageLabel).toBeVisible();
  await expect(sectionLabel).toBeVisible();

  await targetInput.fill('sidebar-folder/nested-doc');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(chip).toHaveAttribute('data-doc-name', 'sidebar-folder/nested-doc');
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('[Beta page](./sidebar-folder/nested-doc.md)'),
    { timeout: 10_000 },
  );

  await chip.hover();
  const tooltip = page.locator('[data-slot="tooltip-content"]').last();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('./sidebar-folder/nested-doc.md');
});
