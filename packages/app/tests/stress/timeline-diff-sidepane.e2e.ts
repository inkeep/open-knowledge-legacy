/**
 * E2E coverage for the Timeline inline-diff side-pane (US-008).
 *
 * Each test creates its own uniquely-named doc via the `api` fixture —
 * STOP rule: never hardcode 'test-doc'; workers share a dev-server instance
 * and parallel tests would corrupt shared CRDT state.
 *
 * Reference patterns:
 *   - agent-activity-panel.e2e.ts  (per-test seeding + writeAsAgent)
 *   - outline-navigation.e2e.ts    (DocPanel tab panel selectors)
 */
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from './_helpers';

// Unique doc-name generator — prefix keeps failures easy to grep in CI logs.
function uid() {
  return `tl-${randomUUID().slice(0, 8)}`;
}

// Stable agent identity reused across tests in this suite.
const AGENT = {
  agentId: `agent-${randomUUID().slice(0, 8)}`,
  agentName: 'Claude',
  clientName: 'claude' as const,
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function navigateToDoc(page: Page, docName: string) {
  await page.goto(`/#/${docName}`);
  await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15_000 });
}

/** Click the Timeline tab in DocPanel and wait for the loading skeleton to settle. */
async function openTimelineTab(page: Page) {
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.locator('#panel-timeline')).toBeVisible();
  await expect(page.locator('[aria-label="Loading timeline history"]')).toBeHidden({
    timeout: 15_000,
  });
}

/** All EntryRow expand-zone buttons (div[role="button"]) in the Timeline panel. */
function expandButtons(page: Page) {
  return page.locator('[data-testid="timeline-entry-expand"]');
}

/** All open diff content panels (present in DOM only while a row is expanded). */
function diffPanels(page: Page) {
  return page.locator('[data-testid="timeline-entry-diff"]');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Timeline inline diff — side pane', () => {
  // ── AC-D1 ──────────────────────────────────────────────────────────────────
  test('AC-D1: click entry expands inline diff; click again collapses; main editor untouched', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1\n\nInitial content.' }]);
    await api.writeAsAgent(doc, '# v2\n\nSecond version.', AGENT);

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });
    const row = expandButtons(page).first();

    // Initially collapsed
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(diffPanels(page)).toHaveCount(0);

    // Expand
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(diffPanels(page)).toHaveCount(1);

    // Main editor is still visible — no hijack
    await expect(page.locator('.ProseMirror')).toBeVisible();

    // Collapse
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(diffPanels(page)).toHaveCount(0);
  });

  // ── AC-D2 ──────────────────────────────────────────────────────────────────
  test('AC-D2: multiple entries can be open simultaneously (multi-expand)', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1\n\nInitial.' }]);
    await api.writeAsAgent(doc, '# v2\n\nVersion 2.', AGENT);
    await api.writeAsAgent(doc, '# v3\n\nVersion 3.', AGENT);

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    // Wait for at least three entry rows
    await expect(expandButtons(page).nth(2)).toBeVisible({ timeout: 10_000 });

    await expandButtons(page).nth(0).click();
    await expandButtons(page).nth(1).click();
    await expandButtons(page).nth(2).click();

    await expect(expandButtons(page).nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(expandButtons(page).nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(expandButtons(page).nth(2)).toHaveAttribute('aria-expanded', 'true');
    await expect(diffPanels(page)).toHaveCount(3);
  });

  // ── AC-D3 ──────────────────────────────────────────────────────────────────
  test('AC-D3: second expand of same entry uses cache — no second GET /api/history/{sha}', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1\n\nInitial.' }]);
    await api.writeAsAgent(doc, '# v2\n\nSecond version.', AGENT);

    let historyShaCalls = 0;
    // Count per-SHA history fetches (path has an extra segment: /api/history/{sha}).
    // The list endpoint (/api/history?...) has no extra segment — excluded by the
    // `\/\w+` guard.
    page.on('request', (req) => {
      if (/\/api\/history\/\w+/.test(req.url())) historyShaCalls++;
    });

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });
    const row = expandButtons(page).first();

    // First expand — triggers the SHA fetch
    await row.click();
    await page.waitForResponse(/\/api\/history\/\w+/, { timeout: 10_000 });
    // Wait for loading state to clear so cache is populated
    await expect(page.getByText('Loading diff…')).toBeHidden({ timeout: 10_000 });
    expect(historyShaCalls).toBe(1);

    // Collapse
    await row.click();
    await expect(diffPanels(page)).toHaveCount(0);

    // Re-expand — cache hit, no new request
    await row.click();
    await expect(diffPanels(page)).toHaveCount(1);
    // Wait deterministically for the cached diff to render — the loading
    // skeleton cycles to hidden in the same tick on a cache hit, but we want
    // to observe the diff DOM landing before asserting no extra request fired.
    await expect(page.getByText('Loading diff…')).toBeHidden({ timeout: 5_000 });
    expect(historyShaCalls).toBe(1);
  });

  // ── AC-D5 ──────────────────────────────────────────────────────────────────
  test('AC-D5: Restore icon (aria-label + tooltip) is visible on every row — collapsed and expanded', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1' }]);
    await api.writeAsAgent(doc, '# v2', AGENT);
    await api.writeAsAgent(doc, '# v3', AGENT);

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).nth(2)).toBeVisible({ timeout: 10_000 });

    const rowCount = await expandButtons(page).count();
    const restoreButtons = page.locator('[data-testid="timeline-entry-restore"]');

    // Every visible row has a Restore button with the correct aria-label
    await expect(restoreButtons).toHaveCount(rowCount);
    for (let i = 0; i < rowCount; i++) {
      await expect(restoreButtons.nth(i)).toHaveAttribute('aria-label', 'Restore this version');
    }

    // After expanding row 0, all Restore buttons remain (no count change)
    await expandButtons(page).first().click();
    await expect(restoreButtons).toHaveCount(rowCount);
    await expect(restoreButtons.first()).toBeVisible();
  });

  // ── AC-D6 ──────────────────────────────────────────────────────────────────
  test('AC-D6: Restore icon click does NOT expand the row (stopPropagation)', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1' }]);
    await api.writeAsAgent(doc, '# v2', AGENT);

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });
    const row = expandButtons(page).first();

    await expect(row).toHaveAttribute('aria-expanded', 'false');

    // Click the Restore icon — must NOT expand the row
    await page.locator('[data-testid="timeline-entry-restore"]').first().click();

    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(diffPanels(page)).toHaveCount(0);

    // Dialog opened (shadcn Dialog, NOT AlertDialog)
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('[role="alertdialog"]')).toHaveCount(0);
  });

  // ── AC-D7 ──────────────────────────────────────────────────────────────────
  test('AC-D7: Dialog confirm fires POST /api/rollback with correct body; dialog closes on success', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1\n\nInitial.' }]);
    await api.writeAsAgent(doc, '# v2\n\nUpdated.', AGENT);

    let capturedBody: Record<string, unknown> | null = null;
    await page.route('/api/rollback', async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });

    // Open the restore Dialog
    await page.locator('[data-testid="timeline-entry-restore"]').first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    // Must be Dialog not AlertDialog
    await expect(page.locator('[role="alertdialog"]')).toHaveCount(0);

    // Footer buttons present
    await expect(dialog.getByTestId('timeline-entry-restore-confirm')).toBeVisible();
    await expect(dialog.getByTestId('timeline-entry-restore-cancel')).toBeVisible();

    // Confirm — fires POST /api/rollback
    await dialog.getByTestId('timeline-entry-restore-confirm').click();

    // Request body has correct shape
    await expect(async () => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody?.docName).toBe(doc);
      expect(typeof capturedBody?.commitSha).toBe('string');
      expect((capturedBody?.commitSha as string).length).toBeGreaterThan(0);
    }).toPass({ timeout: 5_000 });

    // Dialog closes after success
    await expect(dialog).toBeHidden();
  });

  // ── AC-D8 ──────────────────────────────────────────────────────────────────
  test('AC-D8: split/unified toggle in EditorHeader re-renders expanded diff layout', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1\n\nInitial content here.' }]);
    await api.writeAsAgent(doc, '# v2\n\nUpdated content here.', AGENT);

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });

    // Expand an entry to get a diff
    await expandButtons(page).first().click();
    await expect(diffPanels(page)).toHaveCount(1);
    // Wait for diff to render (not just loading state)
    await expect(page.getByText('Loading diff…')).toBeHidden({ timeout: 10_000 });

    // The split/unified ToggleGroup appears in EditorHeader when Timeline tab is active
    const layoutGroup = page.getByRole('group', { name: 'Diff layout' });
    await expect(layoutGroup).toBeVisible();

    // The diff renderer (react-diff-view) emits a single root <table> with
    // class `diff diff-{viewType}` — we assert against the rendered structure
    // so a future regression that drops the prop chain (e.g. hardcoding
    // `viewType="unified"` on ActivityPanelDiffView) fails this test.
    const diffRoot = diffPanels(page).first().locator('table.diff').first();

    // Switch to split → DOM reflects split layout
    await layoutGroup.getByRole('button', { name: 'Split diff' }).click();
    await expect(layoutGroup.getByRole('button', { name: 'Split diff' })).toHaveAttribute(
      'data-state',
      'on',
    );
    await expect(diffRoot).toHaveClass(/diff-split/);

    // Diff panel still showing (not collapsed by toggle)
    await expect(diffPanels(page)).toHaveCount(1);

    // Switch back to unified → DOM reflects unified layout
    await layoutGroup.getByRole('button', { name: 'Unified diff' }).click();
    await expect(layoutGroup.getByRole('button', { name: 'Unified diff' })).toHaveAttribute(
      'data-state',
      'on',
    );
    await expect(diffRoot).toHaveClass(/diff-unified/);
  });

  // ── AC-D9 ──────────────────────────────────────────────────────────────────
  test('AC-D9: navigating to a different doc resets per-entry expanded state', async ({
    page,
    api,
  }) => {
    const docA = uid();
    const docB = uid();

    // Seed docA
    await api.seedDocs([{ name: docA, markdown: '# Doc A v1' }]);
    await api.writeAsAgent(docA, '# Doc A v2', AGENT);

    // Seed docB without resetting (createPage + replaceDoc, no testReset)
    await api.createPage(`${docB}.md`);
    await api.replaceDoc(docB, '# Doc B v1');
    await api.writeAsAgent(docB, '# Doc B v2', AGENT);

    // Navigate to docA, expand an entry
    await navigateToDoc(page, docA);
    await openTimelineTab(page);
    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });
    await expandButtons(page).first().click();
    await expect(diffPanels(page)).toHaveCount(1);

    // Navigate to docB — Timeline tab stays active (activeTab state lives in EditorPane)
    await page.goto(`/#/${docB}`);
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[aria-label="Loading timeline history"]')).toBeHidden({
      timeout: 15_000,
    });
    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });

    // No diff panels — docB's entries are all collapsed (rows remounted with new keys)
    await expect(diffPanels(page)).toHaveCount(0);
    const count = await expandButtons(page).count();
    for (let i = 0; i < count; i++) {
      await expect(expandButtons(page).nth(i)).toHaveAttribute('aria-expanded', 'false');
    }
  });

  // ── AC-D10 ─────────────────────────────────────────────────────────────────
  test('AC-D10: main editor is never replaced; no sticky "Viewing:" bar appears', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1' }]);
    await api.writeAsAgent(doc, '# v2', AGENT);

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });

    // Editor present before any interaction
    await expect(page.locator('.ProseMirror')).toBeVisible();

    // Expand entry and click Restore icon
    await expandButtons(page).first().click();
    await page.locator('[data-testid="timeline-entry-restore"]').first().click();

    // Editor still visible — not replaced by a CM6 DiffView
    await expect(page.locator('.ProseMirror')).toBeVisible();
    // No sticky "Viewing: …" bar
    await expect(page.getByText(/^Viewing:/)).toHaveCount(0);
  });

  // ── AC-D11 ─────────────────────────────────────────────────────────────────
  test('AC-D11: expanded entry has no Close button; only the Restore icon action button', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1' }]);
    await api.writeAsAgent(doc, '# v2', AGENT);

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });
    await expandButtons(page).first().click();
    await expect(diffPanels(page)).toHaveCount(1);

    // No "Close" button anywhere inside the Timeline panel
    await expect(
      page.locator('#panel-timeline').getByRole('button', { name: /close/i }),
    ).toHaveCount(0);

    // The Restore icon is present
    await expect(page.locator('[data-testid="timeline-entry-restore"]').first()).toBeVisible();
  });

  // ── FR-D17 ─────────────────────────────────────────────────────────────────
  test('FR-D17: all expanded entries collapse after a successful restore', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1\n\nInitial.' }]);
    await api.writeAsAgent(doc, '# v2\n\nVersion 2.', AGENT);
    await api.writeAsAgent(doc, '# v3\n\nVersion 3.', AGENT);

    // Mock rollback to succeed without actually changing doc content
    await page.route('/api/rollback', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) }),
    );

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).nth(2)).toBeVisible({ timeout: 10_000 });

    // Expand entries 0 and 1
    await expandButtons(page).nth(0).click();
    await expandButtons(page).nth(1).click();
    await expect(diffPanels(page)).toHaveCount(2);

    // Confirm restore via entry 0's Restore icon
    await page.locator('[data-testid="timeline-entry-restore"]').first().click();
    await page.getByTestId('timeline-entry-restore-confirm').click();

    // Both expanded entries must collapse (collapseAllSignal increments)
    await expect(diffPanels(page)).toHaveCount(0, { timeout: 5_000 });
    await expect(expandButtons(page).nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(expandButtons(page).nth(1)).toHaveAttribute('aria-expanded', 'false');
  });

  // ── Restore failure ─────────────────────────────────────────────────────────
  test('restore failure: toast appears, dialog stays open, both confirm + outer Restore re-enable', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1' }]);
    await api.writeAsAgent(doc, '# v2', AGENT);

    await page.route('/api/rollback', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });

    await page.locator('[data-testid="timeline-entry-restore"]').first().click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('timeline-entry-restore-confirm').click();

    // Toast with failure message appears
    await expect(page.getByText('Restore failed — document unchanged')).toBeVisible({
      timeout: 5_000,
    });

    // Dialog stays open so the user can retry without re-finding the row
    await expect(dialog).toBeVisible();

    // Confirm button inside the dialog re-enables — the user can retry the action
    await expect(dialog.getByTestId('timeline-entry-restore-confirm')).not.toBeDisabled({
      timeout: 5_000,
    });

    // Outer Restore icon re-enables — the row's button is no longer in `restoring` state
    await expect(page.locator('[data-testid="timeline-entry-restore"]').first()).not.toBeDisabled({
      timeout: 5_000,
    });
  });

  // ── Cancel aborts in-flight restore ────────────────────────────────────────
  test('Cancel during a slow rollback aborts the request — no side effects fire on late response', async ({
    page,
    api,
  }) => {
    const doc = uid();
    await api.seedDocs([{ name: doc, markdown: '# v1' }]);
    await api.writeAsAgent(doc, '# v2', AGENT);
    await api.writeAsAgent(doc, '# v3', AGENT);

    // Hold the rollback response open until the test releases it
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let rollbackHits = 0;
    await page.route('/api/rollback', async (route) => {
      rollbackHits++;
      await released;
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    await navigateToDoc(page, doc);
    await openTimelineTab(page);

    await expect(expandButtons(page).nth(1)).toBeVisible({ timeout: 10_000 });

    // Expand a second row so we can verify it stays expanded if the cancel
    // truly aborts (auto-collapse only fires on rollback success).
    await expandButtons(page).nth(1).click();
    await expect(diffPanels(page)).toHaveCount(1);

    // Open the dialog on row 0 and click Confirm — this fires the held POST
    await page.locator('[data-testid="timeline-entry-restore"]').first().click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByTestId('timeline-entry-restore-confirm').click();

    // Wait until the route handler has actually been hit
    await expect.poll(() => rollbackHits, { timeout: 5_000 }).toBe(1);

    // Cancel mid-flight — should abort the controller
    await dialog.getByTestId('timeline-entry-restore-cancel').click();
    await expect(dialog).toBeHidden();

    // Release the held response — by now the AbortController has aborted
    release();

    // Wait a beat for any (incorrect) side effects to fire if the abort failed
    await page.waitForTimeout(500);

    // No success-side-effects: the previously expanded row stays expanded
    await expect(diffPanels(page)).toHaveCount(1);
    await expect(expandButtons(page).nth(1)).toHaveAttribute('aria-expanded', 'true');

    // Outer Restore button re-enables (restoring cleared)
    await expect(page.locator('[data-testid="timeline-entry-restore"]').first()).not.toBeDisabled({
      timeout: 5_000,
    });
  });

  // ── Real (un-mocked) rollback round-trip ───────────────────────────────────
  test('un-mocked rollback round-trip: confirming Restore actually replaces editor content with the historical version', async ({
    page,
    api,
  }) => {
    const doc = uid();
    const v1 = '# Doc\n\nVersion-one body that we will restore to.';
    const v2 = '# Doc\n\nVersion-two body that we are throwing away.';
    await api.seedDocs([{ name: doc, markdown: v1 }]);
    await api.writeAsAgent(doc, v2, AGENT);

    await navigateToDoc(page, doc);

    // Editor shows v2 currently
    await expect(page.locator('.ProseMirror')).toContainText('Version-two body');

    await openTimelineTab(page);
    await expect(expandButtons(page).first()).toBeVisible({ timeout: 10_000 });

    // The OLDEST entry (last in the list) is the v1 seed — that's what we
    // want to restore to.
    const lastRestoreIcon = page.locator('[data-testid="timeline-entry-restore"]').last();
    await lastRestoreIcon.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('timeline-entry-restore-confirm').click();

    // Editor content updates via the CRDT bridge to the v1 body
    await expect(page.locator('.ProseMirror')).toContainText('Version-one body', {
      timeout: 10_000,
    });
    // And the v2 body is gone (it's preserved in the timeline as a NEW row,
    // but the editor itself reflects v1)
    await expect(page.locator('.ProseMirror')).not.toContainText('Version-two body');
  });
});
