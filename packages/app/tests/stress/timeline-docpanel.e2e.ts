/**
 * Timeline-in-DocPanel E2E coverage.
 *
 * Locks the three behavioral invariants from
 * `specs/2026-04-20-timeline-to-docpanel/SPEC.md`:
 *
 *   FR-3 (D3 LOCKED) — file-to-file navigation while previewing a historical
 *   version exits diff mode and the Timeline tab refetches for the new doc
 *   (replaces the prior folder-only `useEffect` at `EditorPane.tsx:101-108`
 *   that silently left a stale diff visible).
 *
 *   D6 LOCKED — diff mode persists across DocPanel tab switches. Switching
 *   from Timeline to another tab while a historical entry is selected
 *   keeps the diff and the EditorHeader banner visible; returning to the
 *   Timeline tab finds the same entry still highlighted.
 *
 *   FR-8 — the in-tab "Current version" row is the tab-local exit affordance.
 *   Clicking it returns the editor to the prior editing mode.
 *
 * Pre-existing implementation lives at
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
 * git-dependent paths). For the spec's pure UI lifecycle (entry click →
 * diff mode, file switch → exit diff, tab switch → diff persists, current
 * version → exit diff), Playwright's `page.route()` is the idiomatic seam:
 * it isolates the React state machine under test from the shadow-repo
 * subsystem that's already covered by integration tests.
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
    checkpoint: type === 'checkpoint' ? { kind: 'save', size: null, version: null } : null,
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

// Per-sha historical content. Bodies deliberately differ from the current
// seeded content so DiffView's `norm(historical) === norm(current)` short-
// circuit (which fires `onNoDiff` and exits diff) does not trigger.
const HISTORICAL_BY_SHA: Record<string, string> = {
  'doc-a-wip-0': '# Doc A\n\nHistorical body — wip 0.',
  'doc-a-checkpoint-1': '# Doc A\n\nHistorical body — checkpoint 1.',
  'doc-a-wip-2': '# Doc A\n\nHistorical body — wip 2.',
  'doc-b-wip-0': '# Doc B\n\nHistorical body — wip 0.',
  'doc-b-checkpoint-1': '# Doc B\n\nHistorical body — checkpoint 1.',
  'doc-b-wip-2': '# Doc B\n\nHistorical body — wip 2.',
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
        body: JSON.stringify({ entries }),
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
        body: JSON.stringify({ content }),
      });
    });
  });

  test('FR-3: file switch exits diff mode and Timeline tab refetches for the new doc', async ({
    page,
  }) => {
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
  });

  test('D6: diff persists across DocPanel tab switches and survives return to Timeline', async ({
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
    // is still in the entry list and clickable.
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await expect(timelinePanel).toBeVisible();
    await expect(page.locator('.diff-view')).toBeVisible();
    await expect(historicalRow).toBeVisible();
  });

  test('FR-8: clicking the in-tab "Current version" row exits diff mode', async ({ page }) => {
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
});
