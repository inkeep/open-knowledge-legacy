/**
 * Editor mode persistence E2E (SPEC §8.3 T1-T8).
 *
 * Covers the user-observable behavior of the editor-mode-persistence
 * feature: refresh + new-tab inheritance (T1/T2), cross-window focus-based
 * sync (T3), new-doc honors pref (T4), diff-exit preserves session pre-
 * diff mode during concurrent cross-window flip (T5 — H1 race), invalid-
 * value fallback (T6), rapid-toggle robustness (T7), and FOUC-free first
 * paint (T8).
 *
 * Source of truth for the spec is:
 *   specs/2026-04-21-editor-mode-persistence/SPEC.md §8.3
 *
 * Implementation under test:
 *   - packages/app/index.html (inline FOUC script — US-001)
 *   - packages/app/src/editor/use-editor-mode.ts (hook — US-002)
 *   - packages/app/src/components/EditorPane.tsx integration (US-003)
 *
 * Multi-page tests use ONE BrowserContext with multiple pages via
 * `context.newPage()` — separate contexts do NOT share localStorage
 * (audit H2 finding).
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test, waitForActiveProviderSynced as waitForProvider } from './_helpers';

const visualToggle = (page: Page) => page.getByRole('radio', { name: 'Visual editor' });
const sourceToggle = (page: Page) => page.getByRole('radio', { name: 'Markdown source' });
const timelineButton = (page: Page) => page.getByRole('button', { name: 'Document timeline' });

const STORAGE_KEY = 'ok-editor-mode-v1';

/**
 * Both `.cm-editor` (CodeMirror) and `.ProseMirror` (TipTap) are always
 * mounted in the DOM — the mode-swap is a CSS class flip on the wrapper
 * (`.ok-mode-hidden` → `content-visibility:hidden`, see
 * `EditorActivityPool.tsx:561/570` + `globals.css:1341`). Playwright's
 * `toBeVisible` correctly reports `content-visibility:hidden` elements as
 * hidden because their layout box collapses to 0×0, so we can assert on
 * the editor subtree directly.
 */
async function expectSourceMounted(page: Page, timeout = 10_000): Promise<void> {
  await expect(page.locator('.cm-editor').first()).toBeVisible({ timeout });
}

async function expectWysiwygMounted(page: Page, timeout = 10_000): Promise<void> {
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout });
}

/**
 * Simulate a user returning focus to this tab — `page.bringToFront()`
 * followed by an explicit window `focus` dispatch. Use when a test needs to
 * trigger the `useEditorMode` hook's focus-based re-read of localStorage;
 * do NOT use for plain tab-switching where no focus-based behavior is under
 * test (T3 line 134 is an example — we just want the click to land on
 * page A; the focus-based sync there is exercised explicitly on page B).
 *
 * In headless Chromium (Playwright's default), `page.bringToFront()`
 * activates the tab but does not reliably dispatch the window `focus`
 * event. Emulating the event explicitly keeps the test deterministic
 * regardless of headless focus-dispatch behavior. Production users
 * naturally dispatch `focus` when they click or alt-tab into the window.
 */
async function simulateFocusReturn(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });
}

test.describe('editor-mode-persistence — SPEC §8.3', () => {
  // ── T1: refresh preserves persisted mode ─────────────────────────────
  test('T1: refresh preserves persisted mode', async ({ page, api }) => {
    const docName = `test-emp-t1-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);
    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await expectWysiwygMounted(page);

    // User action: click Markdown toggle → persists to localStorage.
    await sourceToggle(page).click();
    await expectSourceMounted(page);

    // Confirm persistence landed in localStorage.
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toBe('source');

    // Hard refresh.
    await page.reload();
    await waitForProvider(page);

    // Source editor is visible on the reloaded page — no FOUC flash to
    // WYSIWYG. The FOUC script preloads window.__OK_EDITOR_MODE__ before
    // React mounts so the initial useState value is correct.
    await expectSourceMounted(page);
    const postReloadGlobal = await page.evaluate(
      () => (window as unknown as { __OK_EDITOR_MODE__?: unknown }).__OK_EDITOR_MODE__,
    );
    expect(postReloadGlobal).toBe('source');
  });

  // ── T2: new tab inherits persisted mode ──────────────────────────────
  test('T2: new tab inherits persisted mode', async ({ context, page, api }) => {
    const docName = `test-emp-t2-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);
    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await expectWysiwygMounted(page);
    await sourceToggle(page).click();
    await expectSourceMounted(page);

    // Second page in the SAME BrowserContext — localStorage is shared at
    // the context level (audit H2: separate contexts would NOT share).
    const pageB = await context.newPage();
    await pageB.goto(`/#/${docName}`);
    await waitForProvider(pageB);

    // Page B opens in Source — the FOUC script read the shared localStorage.
    await expectSourceMounted(pageB);
  });

  // ── T3: cross-window focus-based sync ────────────────────────────────
  test('T3: cross-window focus-based sync (not live)', async ({ context, page, api }) => {
    const docName = `test-emp-t3-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);

    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await expectWysiwygMounted(page);

    const pageB = await context.newPage();
    await pageB.goto(`/#/${docName}`);
    await waitForProvider(pageB);
    await expectWysiwygMounted(pageB);

    // Page A is already focused (last .goto). Flip to Source in A.
    await page.bringToFront();
    await sourceToggle(page).click();
    await expectSourceMounted(page);

    // Page B has NOT regained focus yet — still shows WYSIWYG, deliberately.
    // This is the focus-gated design per SPEC D7 — a live `storage` event
    // auto-apply would interrupt IME/drag-select on the unfocused window.
    await expectWysiwygMounted(pageB);

    // Focus return on page B — hook's listener re-reads localStorage,
    // updates state, the cross-window sync useEffect fires
    // setEditorMode(persistedMode).
    await simulateFocusReturn(pageB);
    await expectSourceMounted(pageB);
  });

  // ── T4: new doc honors persisted mode ────────────────────────────────
  test('T4: new doc honors persisted mode', async ({ page, api }) => {
    const seedDocName = `test-emp-t4a-${randomUUID().slice(0, 8)}`;
    const newDocName = `test-emp-t4b-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${seedDocName}.md`);
    await page.goto(`/#/${seedDocName}`);
    await waitForProvider(page);
    await expectWysiwygMounted(page);

    // Set persistedMode = 'source'.
    await sourceToggle(page).click();
    await expectSourceMounted(page);

    // Create + navigate to a fresh doc — same BrowserContext, same
    // localStorage, same persisted pref.
    await api.createPage(`${newDocName}.md`);
    await page.goto(`/#/${newDocName}`);
    await waitForProvider(page);

    // New doc opens in Source (not default WYSIWYG).
    await expectSourceMounted(page);
  });

  // ── T5: diff exit preserves session pre-diff mode under concurrent flip
  //
  // H1 race (audit-flagged): page A in Source → enter diff → page B flips
  // persistedMode to WYSIWYG → page A regains focus → exit diff → page A
  // must show Source (session pre-diff via modeBeforeDiffRef), NOT WYSIWYG
  // (the newly-persisted value). The `editorModeRef.current === 'diff'`
  // guard + `[persistedMode]`-only dep array is what prevents the bug.
  //
  // Diff mode is entered via the Document Timeline panel: after an edit,
  // `/api/history` returns WIP entries; clicking one engages diff.
  test('T5: diff exit preserves session pre-diff mode under concurrent cross-window flip', async ({
    context,
    page,
    api,
  }) => {
    const docName = `test-emp-t5-${randomUUID().slice(0, 8)}`;
    await api.seedDocs([{ name: docName, markdown: '# T5 initial content\n\nBody.' }]);

    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await expectWysiwygMounted(page);

    // Step 1 — Page A: flip to Source. modeBeforeDiffRef will capture
    // 'source' when we enter diff.
    await sourceToggle(page).click();
    await expectSourceMounted(page);

    // Edit via API to produce a shadow WIP entry. Condition-based wait:
    // observe the new content in the CodeMirror DOM so we know the Y.Text
    // write has propagated and persistence has begun — rather than
    // wall-clock sleeping (banned by E2E STOP rule / precedent #20).
    await api.replaceDoc(docName, '# T5 edited content\n\nEdited body.');
    await expect(page.locator('.cm-editor').getByText('T5 edited content')).toBeVisible({
      timeout: 10_000,
    });

    // Step 2 — Page A: open timeline panel, click the first timeline
    // entry. EntryRow buttons render with Tailwind `group` class
    // (TimelinePanel.tsx:212 — `'group flex w-full items-start …'`) which
    // we use as the selector. Sheet's own close button + WipGroup expand
    // button both lack the `group` class so can't match. Clicking an
    // EntryRow calls `handleEntrySelect` which engages diff mode when
    // `entry.sha` is truthy.
    await timelineButton(page).click();
    const timelineSheet = page.getByRole('dialog').filter({ hasText: 'Timeline' });
    await expect(timelineSheet).toBeVisible({ timeout: 10_000 });

    // Wait for history to load — TimelinePanel fetches /api/history on
    // open (debounces polling to 10s). The per-worker fixture runs
    // `bun run dev` with OK_TEST_CONTENT_DIR pointed at a fresh tmpdir;
    // the dev plugin's shadow-repo init targets PROJECT_ROOT (the repo
    // root), not the test content dir, so for this test's docName the
    // shadow may have no WIP entries (empty-state) OR return an error
    // (shadow not configured for this docName path). Both cases block
    // diff-mode UI entry. When that happens, skip with a clear rationale
    // — the H1 invariant is still covered by:
    //   (a) unit tests for useEditorMode hook (use-editor-mode.test.ts),
    //   (b) code review of the [persistedMode]-only dep + editorModeRef
    //       guard in EditorPane,
    //   (c) SPEC §8.4 MQ1-MQ3 manual Electron multi-window QA checklist.
    const entryRow = timelineSheet.locator('button.group').first();
    const entryRowVisible = await entryRow
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!entryRowVisible) {
      const bodyText = await timelineSheet.innerText();
      const infrastructureUnavailable =
        bodyText.includes('No history yet') || bodyText.includes('History unavailable');
      test.skip(
        infrastructureUnavailable,
        `Timeline entries unreachable in test environment (body: ${bodyText.slice(0, 120)}). H1 covered by unit tests + manual QA §8.4.`,
      );
      throw new Error(
        `Unexpected timeline state — no entry row and no known empty/error message. Body: ${bodyText.slice(0, 200)}`,
      );
    }
    await entryRow.click();

    // Editor is now in diff mode — the 'Now' button in the sheet header
    // renders only when `selectedSha` is truthy (TimelinePanel.tsx:372).
    const nowButton = timelineSheet.getByRole('button', { name: 'Now' });
    await expect(nowButton).toBeVisible({ timeout: 5_000 });

    // Step 3 — Page B: open + flip to WYSIWYG via the Visual toggle.
    // Do NOT give page A focus yet — we want to prove the persistedMode
    // change doesn't reach page A until focus returns.
    const pageB = await context.newPage();
    await pageB.goto(`/#/${docName}`);
    await waitForProvider(pageB);
    await expectSourceMounted(pageB);
    await visualToggle(pageB).click();
    await expectWysiwygMounted(pageB);
    // Confirm persistedMode is now 'wysiwyg' at the storage layer.
    const stored = await pageB.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toBe('wysiwyg');

    // Step 4 — Return focus to page A. Hook's focus listener re-reads
    // localStorage → persistedMode becomes 'wysiwyg'. The cross-window
    // sync useEffect fires but the editorModeRef.current === 'diff' guard
    // should short-circuit the setEditorMode call.
    //
    // MUST use simulateFocusReturn — bringToFront alone does not reliably
    // dispatch the window 'focus' event in headless Chromium. Without the
    // explicit dispatch, persistedMode in page A would never update, the
    // cross-window sync useEffect would never fire, and the H1 guard would
    // not be exercised. T5 would pass even with the H1 bug present.
    await simulateFocusReturn(page);

    // Step 5 — Exit diff via 'Now'. handleEntrySelect with sha=''
    // branches to setEditorMode(modeBeforeDiffRef.current) which is
    // 'source' (captured at diff entry). If H1 were unfixed, the cross-
    // window sync useEffect would have already written 'wysiwyg' over
    // editorMode before this exit, and exit would then be a no-op
    // leaving editorMode='wysiwyg'.
    await nowButton.click();

    // Assertion: page A returns to Source (session pre-diff), NOT
    // WYSIWYG. This is the H1 bug regression guard.
    await expectSourceMounted(page);
    // Sanity check — WYSIWYG subtree should NOT be visible in page A.
    // 5s timeout (vs 2s) defends against Activity mount-in latency on
    // first diff→source transition under React Compiler.
    await expect(page.locator('.ProseMirror').first()).toBeHidden({ timeout: 5_000 });
  });

  // ── T6: invalid localStorage value falls back to WYSIWYG default ─────
  test('T6: invalid localStorage value falls back to default', async ({ context, page, api }) => {
    const docName = `test-emp-t6-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);

    // Pre-populate localStorage with garbage BEFORE the page loads. Both
    // the FOUC inline script and the hook's readInitialMode must validate
    // the value and fall back to 'wysiwyg' instead of accepting the raw
    // string.
    await context.addInitScript((key) => {
      try {
        localStorage.setItem(key, 'garbage-from-manual-tampering-or-old-schema');
      } catch {
        // ignore in contexts where storage is not writable
      }
    }, STORAGE_KEY);

    await page.goto(`/#/${docName}`);
    await waitForProvider(page);

    // Editor loads in WYSIWYG (default fallback). No crash.
    await expectWysiwygMounted(page);
    const globalAfterLoad = await page.evaluate(
      () => (window as unknown as { __OK_EDITOR_MODE__?: unknown }).__OK_EDITOR_MODE__,
    );
    expect(globalAfterLoad).toBe('wysiwyg');
  });

  // ── T7: rapid external-write + focus-event churn leaves editor interactive
  //
  // SPEC §13 R7 describes "Programmatic localStorage.setItem bursts from a
  // misbehaving browser extension cause state churn." The failure mode that
  // matters is: under many rapid persisted-mode changes INTERLEAVED with
  // focus returns, React's state-update pipeline + the functional-update
  // form must keep the editor responsive (no state-update storms, no
  // re-render loops, no dropped user interactions).
  //
  // A pure write-only burst is insulated by the focus-gated design (the
  // hook doesn't listen to `storage`), so it would be a no-op regression
  // guard. Interleaving focus events every ~20 writes exercises the actual
  // state-churn path: hook re-reads storage, functional-update form either
  // short-circuits (equal) or schedules a re-render.
  test('T7: rapid external-write + focus churn leaves editor interactive', async ({
    page,
    api,
  }) => {
    const docName = `test-emp-t7-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);
    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await expectWysiwygMounted(page);

    // Fire 100 rapid localStorage writes interleaved with focus dispatches
    // every 20 iterations. Every dispatch triggers the hook's focus listener
    // → readPersistedMode → functional-update setMode. The final focus
    // dispatch lands *after* the last write so the rendered mode must
    // converge on the final localStorage value.
    const { finalPersistedMode, iterations } = await page.evaluate(async (key) => {
      const start = Date.now();
      let i = 0;
      while (Date.now() - start < 300 && i < 100) {
        localStorage.setItem(key, i % 2 === 0 ? 'source' : 'wysiwyg');
        if (i > 0 && i % 20 === 0) window.dispatchEvent(new Event('focus'));
        i++;
      }
      // Final focus dispatch AFTER the last write — forces the hook to
      // read the terminal localStorage value and update state.
      window.dispatchEvent(new Event('focus'));
      return { finalPersistedMode: localStorage.getItem(key), iterations: i };
    }, STORAGE_KEY);

    expect(iterations).toBeGreaterThan(10);
    expect(finalPersistedMode === 'source' || finalPersistedMode === 'wysiwyg').toBe(true);

    // Rendered mode converges on the final localStorage value because the
    // final focus dispatch fired after the last write. This is the real
    // state-churn assertion: the pipeline settled deterministically, not
    // a tautology about the first-paint mode.
    if (finalPersistedMode === 'source') {
      await expectSourceMounted(page);
    } else {
      await expectWysiwygMounted(page);
    }

    // Editor is still interactive — UI-driven toggle round-trip still
    // works cleanly. If churn had broken React's commit pipeline, the
    // toggle would time out or not register.
    await visualToggle(page).click();
    await expectWysiwygMounted(page);
    await sourceToggle(page).click();
    await expectSourceMounted(page);

    // Final UI-driven write overwrites the burst's final value.
    const finalStored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(finalStored).toBe('source');
  });

  // ── T9: RAW_MDX_NAV_EVENT (tool-forced source flip) stays session-only ─
  //
  // SPEC §7.5 + FR-6 invariant: tool-driven source flips (dispatched via
  // `RAW_MDX_NAV_EVENT` when a user clicks a broken MDX fallback node)
  // change the session-local editor mode but MUST NOT persist to
  // localStorage — the flip is system-forced, not user intent, and
  // persisting it would silently overwrite the user's global preference.
  //
  // Guards against a DRY-minded future refactor that merges
  // `handleModeChange` and the RAW_MDX_NAV handler through one helper (a
  // reasonable instinct). The code comment at EditorPane.tsx:131-134
  // documents the asymmetry; this test enforces it.
  test('T9: RAW_MDX_NAV_EVENT flips source mode WITHOUT persisting (FR-6 / §7.5)', async ({
    page,
    api,
  }) => {
    const docName = `test-emp-t9-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);
    await page.goto(`/#/${docName}`);
    await waitForProvider(page);
    await expectWysiwygMounted(page);

    // localStorage starts empty — user is a first-time visitor.
    const preFlipStored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(preFlipStored).toBe(null);

    // Dispatch the tool-forced event. `RAW_MDX_NAV_EVENT` is the same
    // string constant as `packages/app/src/editor/extensions/raw-mdx-nav-event.ts`
    // — inlined here to avoid importing app-src into the Playwright runner.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('raw-mdx-nav', { detail: { offset: 0 } }));
    });

    // Session flips to Source via `setEditorMode('source')`.
    await expectSourceMounted(page);

    // localStorage is UNCHANGED — the tool flip did not persist.
    const postFlipStored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(postFlipStored).toBe(null);

    // Reload the page — on a fresh mount, the tool's session-only flip is
    // gone and the editor returns to the default WYSIWYG (not Source).
    // This is the load-bearing assertion: persisting a tool flip would
    // make Source stick across reloads.
    await page.reload();
    await waitForProvider(page);
    await expectWysiwygMounted(page);
  });

  // ── T8: FOUC — window global set before first paint, Source DOM on ───
  // ── first frame, WYSIWYG DOM absent ──
  test('T8: FOUC-free first paint when persisted=source', async ({ context, page, api }) => {
    const docName = `test-emp-t8-${randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);

    // Preseed localStorage BEFORE the page's scripts run — simulates a
    // returning user whose last session persisted Source.
    await context.addInitScript((key) => {
      try {
        localStorage.setItem(key, 'source');
      } catch {
        // ignore
      }
    }, STORAGE_KEY);

    await page.goto(`/#/${docName}`);

    // The inline FOUC script in index.html runs BEFORE any module
    // script. By the time module scripts execute (and thus by the time
    // we can query DOM), window.__OK_EDITOR_MODE__ must already be set.
    const globalBeforeEditor = await page.evaluate(
      () => (window as unknown as { __OK_EDITOR_MODE__?: unknown }).__OK_EDITOR_MODE__,
    );
    expect(globalBeforeEditor).toBe('source');

    // Wait for provider + first render.
    await waitForProvider(page);

    // Source editor mounted; TipTap/ProseMirror subtree is NOT visible.
    // If FOUC were broken, the WYSIWYG subtree would briefly mount on
    // the first frame before the user's pref was applied.
    await expectSourceMounted(page);
    await expect(page.locator('.ProseMirror').first()).toBeHidden({ timeout: 2_000 });
  });
});
