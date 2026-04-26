/**
 * Timeline-in-DocPanel E2E coverage. Locks three behavioral invariants:
 *
 *   File-switch diff-clear — navigating from doc A to doc B while previewing
 *   a historical version exits diff mode and the Timeline tab refetches for
 *   the new document. (The prior cleanup only fired on folder navigation, not
 *   file-to-file transitions — fixed by the `activeDocName` cleanup effect in
 *   EditorPane.)
 *
 *   Tab-switch diff-persistence — switching from the Timeline tab to another
 *   DocPanel tab while a historical entry is selected keeps the diff and the
 *   EditorHeader banner visible; returning to the Timeline tab finds the same
 *   entry still highlighted.
 *
 *   Tab-local exit — the in-tab "Current version" row is the tab-local exit
 *   affordance. Clicking it returns the editor to the prior editing mode.
 *
 * Pre-existing implementation:
 * `packages/app/src/components/{TimelinePanel,DocPanel,EditorPane,EditorArea}.tsx`.
 *
 * Why we mock `/api/history` rather than seeding via `/api/save-version`:
 * the per-worker dev-server fixture in `_helpers/fixtures.ts` runs with
 * `gitEnabled: false` (`hocuspocus-plugin.ts:91` `isTestIsolated`), so the
 * shadow repo is intentionally not configured for E2E test isolation. That
 * means `/api/save-version` returns 400 ("Shadow repo not configured") and
 * `/api/history` would return no entries — there would be nothing to click.
 * The same reasoning is documented in `agent-activity-panel.e2e.ts` (which
 * relies on integration coverage at
 * `packages/app/tests/integration/c11-activity-panel-undo.test.ts` for the
 * git-dependent paths). For the pure UI lifecycle (entry click → diff mode,
 * file switch → exit diff, tab switch → diff persists, current version → exit
 * diff), Playwright's `page.route()` is the idiomatic seam: it isolates the
 * React state machine under test from the shadow-repo subsystem that's already
 * covered by integration tests.
 */

import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { expect, test, waitForActiveProviderSynced } from './_helpers';

/** Build a minimal valid TimelineEntry for the timeline list mock. */
function mkEntry(docName: string, idx: number, type: 'wip' | 'checkpoint'): TimelineEntry {
  // Backdate timestamps in 60s steps so "X min ago" formatting renders sensibly
  // and entries appear stable in deterministic chronological order (newest first).
  const minutesAgo = (idx + 1) * 60_000;
  return {
    sha: `${docName}-${type}-${idx}`,
    timestamp: new Date(Date.now() - minutesAgo).toISOString(),
    author: 'Test User',
    authorEmail: 'test@example.com',
    type,
    message: type === 'checkpoint' ? 'Save Version' : 'WIP',
    contributors: [],
    checkpoint: null,
  };
}

// Per-doc mocked timeline. Three-entry shape ensures the grouping logic
// produces an expanded pre-checkpoint WIP, a visible checkpoint row, and a
// collapsed between-checkpoints WIP — same shape the real shadow repo
// produces after one save-version + one revision.
const HISTORY_BY_DOC: Record<string, TimelineEntry[]> = {
  'doc-a': [
    mkEntry('doc-a', 0, 'wip'), // newest WIP (pre-checkpoint, expanded by default)
    mkEntry('doc-a', 1, 'checkpoint'), // visible checkpoint row
    mkEntry('doc-a', 2, 'wip'), // older WIP (collapsed behind "Show 1 auto-save")
  ],
  'doc-b': [
    mkEntry('doc-b', 0, 'wip'),
    mkEntry('doc-b', 1, 'checkpoint'),
    mkEntry('doc-b', 2, 'wip'),
  ],
};

// Historical content for SHA lookup. Only the SHAs actually clicked in tests
// are included; doc-b entries are never diff-previewed across this suite.
const HISTORICAL_BY_SHA: Record<string, string> = {
  'doc-a-wip-0': '# Doc A\n\nHistorical body — wip 0.',
  'doc-a-checkpoint-1': '# Doc A\n\nHistorical body — checkpoint 1.',
};

const DOC_A_CURRENT = '# Doc A\n\nDoc A current content.';
const DOC_B_CURRENT = '# Doc B\n\nDoc B current content.';

test.describe('timeline-docpanel — diff lifecycle through DocPanel timeline tab', () => {
  test.beforeEach(async ({ api, page }) => {
    await api.seedDocs([
      { name: 'doc-a', markdown: DOC_A_CURRENT },
      { name: 'doc-b', markdown: DOC_B_CURRENT },
    ]);

    // GET /api/history?docName=<doc>&limit=<N> — timeline entry list per doc.
    await page.route(/\/api\/history\?docName=/, async (route) => {
      const url = new URL(route.request().url());
      const docName = url.searchParams.get('docName') ?? '';
      const entries = HISTORY_BY_DOC[docName] ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, entries }),
      });
    });

    // GET /api/history/<sha>?docName=<doc> — historical content for diff.
    await page.route(/\/api\/history\/[^/?]+\?docName=/, async (route) => {
      const url = new URL(route.request().url());
      // Path is `/api/history/<sha>` — the last segment is the sha.
      const sha = url.pathname.split('/').pop() ?? '';
      const content = HISTORICAL_BY_SHA[sha] ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, content }),
      });
    });
  });

  test('file switch exits diff mode and Timeline tab refetches for the new doc', async ({
    page,
  }) => {
    // Override beforeEach route to capture which docNames are fetched.
    // This distinguishes "doc-b history was loaded" from "stale doc-a entries
    // still mounted" — both show a "Current version" row (renders whenever
    // entries.length > 0), so visibility alone is not a sufficient assertion.
    const fetchedDocNames: string[] = [];
    await page.unroute(/\/api\/history\?docName=/);
    await page.route(/\/api\/history\?docName=/, async (route) => {
      const url = new URL(route.request().url());
      const docName = url.searchParams.get('docName') ?? '';
      fetchedDocNames.push(docName);
      const entries = HISTORY_BY_DOC[docName] ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, entries }),
      });
    });

    await page.goto('/#/doc-a');
    await waitForActiveProviderSynced(page);
    await expect(page.locator('.ProseMirror')).toContainText('Doc A');

    // Activate the Timeline tab. Each DocPanel tab carries
    // `role="tab"` + `aria-label="Timeline"` — DocPanel.tsx renders this via
    // shadcn ToggleGroup.
    await page.getByRole('tab', { name: 'Timeline' }).click();

    const timelinePanel = page.locator('#panel-timeline');
    await expect(timelinePanel).toBeVisible();
    // Wait for at least one mocked historical entry to render.
    await expect(timelinePanel.getByText('Test User').first()).toBeVisible();

    // Click the first visible EntryRow. The pre-checkpoint WIP group (wip-0)
    // renders expanded by default (`isPreCheckpoint=true`), so it appears
    // before the checkpoint row in DOM order — `.filter({ hasText: 'Test User' })
    // .first()` resolves to wip-0. Any historical row exercises the same
    // onEntrySelect path these tests care about.
    const historicalRow = timelinePanel
      .getByRole('button')
      .filter({ hasText: 'Test User' })
      .first();
    await historicalRow.click();

    // Editor enters diff mode — DiffView renders with the .diff-view class
    // and the EditorPane diff-mode banner shows "Viewing:".
    await expect(page.locator('.diff-view')).toBeVisible();
    await expect(page.getByText(/^Viewing: /)).toBeVisible();

    // Navigate to doc-b via hash routing. seedDocs writes `doc-b.md`; hash
    // routing addresses it by extension-less docName.
    await page.goto('/#/doc-b');
    await waitForActiveProviderSynced(page);

    // Diff exits — `.diff-view` is gone, "Viewing:" banner is gone, the
    // editor is back to the wysiwyg surface.
    await expect(page.locator('.diff-view')).toHaveCount(0);
    await expect(page.getByText(/^Viewing: /)).toHaveCount(0);
    await expect(page.locator('.ProseMirror')).toContainText('Doc B');

    // Timeline tab is still active (DocPanel state persists across docName
    // changes) and the tab refetched for doc-b. The "Current version" row
    // is selected (the implicit "now" state).
    await expect(timelinePanel).toBeVisible();
    await expect(timelinePanel.getByText('Current version')).toBeVisible();
    // doc-b history was actually fetched — not just stale doc-a entries mounted.
    expect(fetchedDocNames).toContain('doc-b');
  });

  test('diff persists across DocPanel tab switches and survives return to Timeline', async ({
    page,
  }) => {
    await page.goto('/#/doc-a');
    await waitForActiveProviderSynced(page);
    await page.getByRole('tab', { name: 'Timeline' }).click();

    const timelinePanel = page.locator('#panel-timeline');
    await expect(timelinePanel).toBeVisible();
    await expect(timelinePanel.getByText('Test User').first()).toBeVisible();
    const historicalRow = timelinePanel
      .getByRole('button')
      .filter({ hasText: 'Test User' })
      .first();
    await historicalRow.click();

    await expect(page.locator('.diff-view')).toBeVisible();
    await expect(page.getByText(/^Viewing: /)).toBeVisible();

    // Switch to Backlinks — diff stays. The Timeline tabpanel is removed
    // from the DOM (DocPanel renders only the active tab's tabpanel) but
    // the editor area continues to render the diff and its banner.
    await page.getByRole('tab', { name: 'Backlinks' }).click();
    await expect(page.locator('#panel-backlinks')).toBeVisible();
    await expect(page.locator('.diff-view')).toBeVisible();
    await expect(page.getByText(/^Viewing: /)).toBeVisible();

    // Return to Timeline — diff still shows; the previously-selected entry
    // is still visible and highlighted (bg-muted confirms selectedSha is
    // still wired through EditorArea → DocPanel → TimelineContent).
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await expect(timelinePanel).toBeVisible();
    await expect(page.locator('.diff-view')).toBeVisible();
    await expect(historicalRow).toBeVisible();
    await expect(historicalRow).toHaveClass(/bg-muted/);
  });

  test('clicking the in-tab "Current version" row exits diff mode', async ({ page }) => {
    await page.goto('/#/doc-a');
    await waitForActiveProviderSynced(page);
    await page.getByRole('tab', { name: 'Timeline' }).click();

    const timelinePanel = page.locator('#panel-timeline');
    await expect(timelinePanel).toBeVisible();
    await expect(timelinePanel.getByText('Test User').first()).toBeVisible();
    const historicalRow = timelinePanel
      .getByRole('button')
      .filter({ hasText: 'Test User' })
      .first();
    await historicalRow.click();
    await expect(page.locator('.diff-view')).toBeVisible();

    // Clicking the pinned "Current version" row dispatches an empty-sha
    // sentinel entry that EditorPane.handleEntrySelect maps to exit-diff
    // (clears previewEntry, restores modeBeforeDiffRef).
    await timelinePanel.getByRole('button', { name: 'Current version' }).click();

    await expect(page.locator('.diff-view')).toHaveCount(0);
    await expect(page.getByText(/^Viewing: /)).toHaveCount(0);
    await expect(page.locator('.ProseMirror')).toBeVisible();
  });

  test('clicking a second entry while in diff updates diff without panel close', async ({
    page,
  }) => {
    await page.goto('/#/doc-a');
    await waitForActiveProviderSynced(page);
    await page.getByRole('tab', { name: 'Timeline' }).click();

    const timelinePanel = page.locator('#panel-timeline');
    await expect(timelinePanel).toBeVisible();
    await expect(timelinePanel.getByText('Test User').first()).toBeVisible();

    // Click first entry (the wip-0 row in the expanded pre-checkpoint group).
    const allEntryRows = timelinePanel.getByRole('button').filter({ hasText: 'Test User' });
    await allEntryRows.first().click();
    await expect(page.locator('.diff-view')).toBeVisible();

    // Click a different entry (the checkpoint row, which is the second
    // EntryRow with 'Test User' text — the prominent 'Save Version' row).
    const checkpointRow = timelinePanel
      .getByRole('button')
      .filter({ hasText: 'Save Version' })
      .filter({ hasText: 'Test User' })
      .first();
    await checkpointRow.click();

    // Timeline tab still visible; diff still shown (now updated to the
    // checkpoint entry); no panel open/close cycle.
    await expect(timelinePanel).toBeVisible();
    await expect(page.locator('.diff-view')).toBeVisible();
    await expect(page.getByText(/^Viewing: /)).toBeVisible();
  });

  test('Timeline tab shows loading skeleton while fetch is in flight', async ({ page }) => {
    // Use a causal gate so the mock only resolves after the skeleton has been
    // asserted — no wall-clock delay needed.
    let gateResolve!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      gateResolve = resolve;
    });
    await page.unroute(/\/api\/history\?docName=/);
    await page.route(/\/api\/history\?docName=/, async (route) => {
      const url = new URL(route.request().url());
      const docName = url.searchParams.get('docName') ?? '';
      const entries = HISTORY_BY_DOC[docName] ?? [];
      await historyGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, entries }),
      });
    });

    await page.goto('/#/doc-a');
    await waitForActiveProviderSynced(page);
    await page.getByRole('tab', { name: 'Timeline' }).click();

    const timelinePanel = page.locator('#panel-timeline');
    // Skeleton: status role with aria-label 'Loading timeline history'.
    await expect(
      timelinePanel.getByRole('status', { name: 'Loading timeline history' }),
    ).toBeVisible();
    gateResolve();

    // After the gate resolves, entries arrive; skeleton goes away.
    await expect(timelinePanel.getByText('Test User').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('Timeline tab shows "No history yet" when entries list is empty', async ({ page }) => {
    await page.unroute(/\/api\/history\?docName=/);
    await page.route(/\/api\/history\?docName=/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, entries: [] }),
      });
    });

    await page.goto('/#/doc-a');
    await waitForActiveProviderSynced(page);
    await page.getByRole('tab', { name: 'Timeline' }).click();

    const timelinePanel = page.locator('#panel-timeline');
    await expect(timelinePanel.getByText('No history yet')).toBeVisible();
  });

  test('Timeline tab shows "History unavailable" on fetch failure', async ({ page }) => {
    await page.unroute(/\/api\/history\?docName=/);
    await page.route(/\/api\/history\?docName=/, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Internal Server Error' }),
      });
    });

    await page.goto('/#/doc-a');
    await waitForActiveProviderSynced(page);
    await page.getByRole('tab', { name: 'Timeline' }).click();

    const timelinePanel = page.locator('#panel-timeline');
    await expect(timelinePanel.getByText('History unavailable')).toBeVisible();

    // Editing remains unaffected: the editor surface still renders the doc.
    await expect(page.locator('.ProseMirror')).toContainText('Doc A');
  });

  test('DocPanel tab bar fits all 5 tabs at the 300px minimum width without overflow', async ({
    page,
  }) => {
    // Resize viewport so 25% defaultSize = 270px < 300px minSize, forcing the
    // panel to clamp to its 300px floor — the actual minimum rendering width.
    await page.setViewportSize({ width: 1080, height: 720 });
    await page.goto('/#/doc-a');
    await waitForActiveProviderSynced(page);

    // All five tabs should be visible inside the document-panels group.
    const tabsGroup = page.getByRole('group', { name: 'Document panels' });
    await expect(tabsGroup).toBeVisible();
    for (const label of ['Outline', 'Backlinks', 'Outgoing Links', 'Graph', 'Timeline']) {
      await expect(tabsGroup.getByRole('tab', { name: label })).toBeVisible();
    }

    // Verify no horizontal overflow on the tabs group at the 300px minimum.
    const overflow = await tabsGroup.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
