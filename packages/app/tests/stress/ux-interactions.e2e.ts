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

// --------------------------------------------------------------------------
// Dual-editor hit-testing regression (2026-04-21).
//
// EditorActivityPool mounts BOTH SourceEditor and TiptapEditor concurrently
// so mode toggle stays CSS-only. The non-active editor wears `.ok-mode-hidden`
// (content-visibility:hidden + contain-intrinsic-size:8000px). The hidden
// editor must NOT intercept pointer events intended for the visible one.
//
// Bug class: prior to the fix, `.ok-mode-hidden` had no pointer-events
// override, and a grid-stacking wrapper placed both children in the same
// cell — so the hidden editor's wrapper sat above the visible one in
// source order (no z-index). Real pointer clicks anywhere in the editor
// region hit the hidden wrapper first; CM6 never received focus/keydown.
// `locator.click()` + `keyboard.insertText` bypassed this (the existing
// Source→WYSIWYG test above) because insertText dispatches `beforeinput`
// directly on the target element without going through pointer hit-testing.
// These tests exercise the real user path: `page.mouse.click(x, y)` at a
// coordinate inside the visible editor's bounding box + `keyboard.type`.
//
// Fix: `.ok-mode-hidden` sets `position:absolute; inset:0; pointer-events:none`
// in `globals.css`, and `EditorActivityPool` wraps the dual-editor pair in
// `position:relative` so the hidden editor goes out-of-flow instead of
// sizing a shared grid row to its 8000px intrinsic.
// --------------------------------------------------------------------------

test('source mode: real pointer click + keystrokes land in CodeMirror', async ({ page, api }) => {
  await openFreshDoc(api, page, 'source-hit-test');
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');

  // Real pointer hit-test: click at a pixel coordinate INSIDE the
  // `.cm-content` box specifically (not `.cm-editor`, which includes
  // gutters + scroller margins where a 20px inset may miss the
  // contenteditable region on an empty doc). Goes through the browser's
  // real z-order hit-testing, unlike `locator.click()`+`keyboard.insertText`
  // which target a specific element directly. If a hidden sibling wrapper
  // (e.g. `.ok-mode-hidden` without pointer-events:none) is stacked above
  // the visible editor, the click lands on the wrapper and `.cm-content`
  // never focuses.
  const cmContent = page.locator('.cm-content');
  const box = await cmContent.boundingBox();
  if (!box) throw new Error('.cm-content has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + 5);
  await expect(cmContent).toBeFocused();

  // `keyboard.type` — per-character keydown/keypress/keyup through the
  // real focus path. A short string avoids the parallel-CPU reorder race
  // documented in `Source→WYSIWYG` below (which uses `insertText` to
  // sidestep that race). For this test, per-character is load-bearing:
  // we want to exercise the full keydown → CM state.update path, not a
  // single synthetic beforeinput event.
  await page.keyboard.type('HITOK');
  await expect(page.locator('.cm-content')).toContainText('HITOK', { timeout: 5_000 });
});

test('visual mode: real pointer click + keystrokes land in ProseMirror', async ({ page, api }) => {
  await openFreshDoc(api, page, 'visual-hit-test');
  // `openFreshDoc` leaves the page in visual mode; re-assert for clarity.
  await expect(visualToggle(page)).toBeChecked();

  const pm = page.locator('.ProseMirror');
  const box = await pm.boundingBox();
  if (!box) throw new Error('ProseMirror has no bounding box');
  // Click well inside the PM content region (center-x, a bit inside top).
  // Small fresh docs have minimal content; clicking the horizontal center
  // with a modest y-inset lands inside the first writable paragraph.
  await page.mouse.click(box.x + box.width / 2, box.y + 30);
  await expect(pm).toBeFocused();

  await page.keyboard.type('HITPM');
  await expect(page.locator('.ProseMirror')).toContainText('HITPM', { timeout: 5_000 });
});

test('hidden-editor wrapper does not intercept pointer events (both modes)', async ({
  page,
  api,
}) => {
  await openFreshDoc(api, page, 'hidden-wrapper-invariant');

  // Visual mode: the source editor's wrapper carries `.ok-mode-hidden`.
  // Invariant: computed `pointer-events: none` — otherwise a real click
  // anywhere the hidden wrapper overlaps the visible editor would be
  // intercepted. `position: absolute` is the out-of-flow complement; it
  // keeps the hidden wrapper from sizing a shared parent row (the prior
  // bug stretched the visible editor to 8000px via grid-row intrinsic).
  const hiddenInVisual = page.locator('.ok-mode-hidden').first();
  await expect(hiddenInVisual).toHaveCSS('pointer-events', 'none');
  await expect(hiddenInVisual).toHaveCSS('position', 'absolute');

  // Source mode: role flips — the visual editor's wrapper now carries
  // `.ok-mode-hidden`. Invariant holds symmetrically.
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-editor');
  const hiddenInSource = page.locator('.ok-mode-hidden').first();
  await expect(hiddenInSource).toHaveCSS('pointer-events', 'none');
  await expect(hiddenInSource).toHaveCSS('position', 'absolute');
});

test('WYSIWYG→Source: typing in ProseMirror appears in CodeMirror', async ({ page, api }) => {
  await openFreshDoc(api, page, 'wysiwyg-to-source');
  // Insert text in WYSIWYG mode. Two invariants:
  //   1. `.click()` + `toBeFocused()` before any keyboard call — `.focus()`
  //      does not await focus-transfer in Chromium, and events dispatched
  //      before focus lands go to the prior active element. See precedent
  //      §20(a) category C.
  //   2. `keyboard.insertText` (atomic single `beforeinput`/`input` event)
  //      instead of `keyboard.type` (per-character keydown/keypress/keyup).
  //      Under full-suite parallel CPU contention, per-character dispatch
  //      can reorder at CM6/PM's async input pipeline — characters can land
  //      out of order in the editor's internal buffer. `insertText` bypasses
  //      the per-character race entirely. See precedent §20(i).
  await page.locator('.ProseMirror').click();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.insertText('Hello from WYSIWYG');

  // Wait for Observer A to sync to Y.Text
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('Hello from WYSIWYG'),
    null,
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

  // Insert markdown in CodeMirror. See the comment at the first test's
  // keyboard block — same two invariants apply: `.click()+toBeFocused()`
  // for focus, `keyboard.insertText` for atomic input. Historical evidence
  // for the keystroke-reorder race this avoids: CI run 24623506375 on PR
  // #212 captured CodeMirror rendering `#\n\nource Heading\n\nParagraph
  // from source.\nS\n` when `keyboard.type` was used — the `S` character
  // reordered past the rest of the string. `insertText` dispatches one
  // `beforeinput` event with the full payload, making the race
  // structurally impossible. See precedent §20(i).
  await page.locator('.cm-content').click();
  await expect(page.locator('.cm-content')).toBeFocused();
  await page.keyboard.insertText('# Source Heading\n\nParagraph from source.');

  // Wait for Y.Text to have the content
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('Source Heading'),
    null,
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
    null,
    { timeout: 10_000 },
  );

  // Verify ProseMirror renders the content
  const pmContent = await page.locator('.ProseMirror').textContent();
  expect(pmContent).toContain('Source Heading');
  expect(pmContent).toContain('Paragraph from source');
});

test('round-trip: edits in both modes survive toggle cycle', async ({ page, api }) => {
  await openFreshDoc(api, page, 'round-trip');
  // Insert in WYSIWYG — `.click()+toBeFocused()` + `insertText` per the
  // comment block at the first test in this file.
  await page.locator('.ProseMirror').click();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.insertText('WYSIWYG edit');

  // Wait for sync
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document?.getText('source')?.toString()?.includes('WYSIWYG edit'),
    null,
    { timeout: 10_000 },
  );

  // Switch to Source, insert there
  await sourceToggle(page).click();
  await page.waitForSelector('.cm-content');
  await page.locator('.cm-content').click();
  await expect(page.locator('.cm-content')).toBeFocused();
  // Move to end before inserting. Bare `End` is end-of-line cross-platform
  // (no modifier required); single-line content makes it equivalent to
  // end-of-document here.
  await page.keyboard.press('End');
  await page.keyboard.insertText('\n\nSource edit');

  // Wait for Y.Text to have both edits
  await page.waitForFunction(
    () => {
      const txt = window.__activeProvider?.document?.getText('source')?.toString();
      return txt?.includes('WYSIWYG edit') && txt?.includes('Source edit');
    },
    null,
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
    null,
    { timeout: 10_000 },
  );

  // Both edits should be present
  const pmContent = await page.locator('.ProseMirror').textContent();
  expect(pmContent).toContain('WYSIWYG edit');
  expect(pmContent).toContain('Source edit');
});

test('concurrent agent write: user + agent content coexist', async ({ page, api, baseURL }) => {
  const docName = await openFreshDoc(api, page, 'concurrent-agent');
  // Insert in WYSIWYG — `.click()+toBeFocused()` + `insertText` per the
  // comment block at the first test in this file.
  await page.locator('.ProseMirror').click();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.insertText('User typing');

  // Wait for user content to sync
  await page.waitForFunction(
    () => window.__activeProvider?.document?.getText('source')?.toString()?.includes('User typing'),
    null,
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
    null,
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

test('sidebar folder: row click navigates to folder overview; treeitem toggles expand/collapse', async ({
  page,
}) => {
  // Contract: the folder treeitem navigates to the folder's resolved target
  // (#/<folderPath>) on click, and exposes the `aria-expanded` disclosure
  // affordance for keyboard expand/collapse.
  //
  // Ancestor-priority UX: while a doc inside sidebar-folder is active, the
  // folder is unconditionally expanded — collapsing the treeitem is a no-op
  // for the derived state because `ancestors` takes
  // priority over `userCollapsed`. The test exercises the toggle BEFORE
  // navigating into the folder (where toggle IS honored) and asserts the
  // ancestor-priority behavior after navigation. See reveal-on-activate.e2e.ts
  // for Model A semantics coverage.
  //
  // This test relies only on the pre-seeded sidebar-folder/nested-doc.md
  // fixture (see `_helpers/fixtures.ts`'s per-worker seeding). It does not
  // write content, so no per-test doc is required.
  await page.goto('/');
  const folderRow = page.getByRole('treeitem', { name: 'sidebar-folder', exact: true });
  const nestedFile = page.getByRole('treeitem', { name: 'nested-doc.md', exact: true });

  // Starts collapsed — treeitem reflects state, nested child not visible.
  await expect(folderRow).toBeVisible();
  await expect(folderRow).toHaveAttribute('aria-expanded', 'false');
  await expect(nestedFile).toHaveCount(0);

  // Keyboard disclosure toggles expand/collapse when folder is NOT an
  // active-doc ancestor (pre-nav state).
  await folderRow.focus();
  await folderRow.press('ArrowRight');
  await expect(folderRow).toHaveAttribute('aria-expanded', 'true');
  await expect(nestedFile).toBeVisible();

  // Pre-nav toggle: clicking collapse BEFORE navigating into the folder IS
  // honored (not an active-doc ancestor yet).
  await folderRow.press('ArrowLeft');
  await expect(folderRow).toHaveAttribute('aria-expanded', 'false');
  await expect(nestedFile).toHaveCount(0);

  // Re-expand so we can navigate to the nested doc.
  await folderRow.press('ArrowRight');
  await expect(folderRow).toHaveAttribute('aria-expanded', 'true');
  await expect(nestedFile).toBeVisible();

  // Nested file click navigates to the doc — the folder becomes an ancestor.
  await nestedFile.click();
  await expect(page).toHaveURL(/#\/sidebar-folder\/nested-doc$/);

  // Ancestor priority: collapsing the treeitem does NOT hide the folder
  // because it's an active-doc ancestor. aria-expanded stays true;
  // nested-doc.md stays visible.
  await folderRow.focus();
  await folderRow.press('ArrowLeft');
  await expect(folderRow).toHaveAttribute('aria-expanded', 'true');
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
    null,
    { timeout: 10_000 },
  );

  // V2 (US-005): chips render as plain DOM via renderHTML. The link mark gets
  // a `data-link` attr; the link-resolution decoration plugin adds
  // `data-resolution-state`; the mark-identity decoration plugin adds
  // `data-mark-id`. There is no longer a `data-internal-link` /
  // `data-doc-name` attribute on the chip itself — those lived on the
  // pre-V2 React MarkView. Resolution state is checked via the decoration
  // attribute instead.
  const chip = page.locator('span[data-link]').first();
  await expect(chip).toBeVisible({ timeout: 10_000 });

  // V2 click semantics (US-005, greenfield): clicking the chip activates
  // the InteractionLayer and surfaces the singleton PropPanel at editor root,
  // replacing the pre-V2 split-button (anchor-navigates + ellipsis-opens-menu)
  // pattern. The PropPanel exposes Open / Edit / Remove (and Create-page
  // when unresolved) as plain buttons.
  await chip.click();
  const propPanel = page.locator('[data-ok-prop-panel="internal-link"]');
  await expect(propPanel).toBeVisible({ timeout: 5_000 });

  // The "Edit" button in the PropPanel opens the EditMarkdownLinkDialog.
  await propPanel.getByRole('button', { name: 'Edit' }).click();

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

  // Verify the underlying markdown was updated. V2 does NOT mirror the doc
  // name into a chip attribute (data-doc-name is gone) — the source-of-truth
  // is the Y.Text + the link mark's href attr.
  await page.waitForFunction(
    () =>
      window.__activeProvider?.document
        ?.getText('source')
        ?.toString()
        ?.includes('[Beta page](./sidebar-folder/nested-doc.md)'),
    null,
    { timeout: 10_000 },
  );
});
