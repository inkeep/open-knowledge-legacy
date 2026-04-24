/**
 * Layer C (Tier 2): Agent Activity Panel (DocPanel `'agent'` mode) — end-
 * to-end coverage for the drill-in model introduced when the persistent
 * doc/activity mode toggle was removed. The activity view is now entered
 * exclusively via avatar click and exited via the back-arrow button.
 *
 * Covers:
 *   - AC-T1: click agent avatar → DocPanel flips to `'agent'` mode, activity
 *     body renders (Playwright poll tolerates CI cold-start noise).
 *   - AC-T2: click the same avatar a second time → exits back to `'doc'` mode.
 *   - AC-T3 (back arrow): click the activity view's back arrow → exits to
 *     `'doc'` mode. Tooltip copy is verified.
 *   - AC-T6: click a filename in the activity list → main editor navigates;
 *     panel stays in `'agent'` mode.
 *   - AC-P4 carryover: Undo last dispatch does not move the main editor's
 *     active doc and does not exit the activity view.
 *
 * Behaviour deliberately NOT tested here, with rationale:
 *   - AC-P8 live CC1 update (700 ms arrival budget) — the Playwright
 *     dev-server fixture runs with `gitEnabled: false` for test isolation.
 *     CC1 `session-activity` only fires from the L2 drain after a
 *     successful `commitWipFromTree`; with gitEnabled=false that callback
 *     is never reached. The live-update pipeline is covered in
 *     `packages/app/tests/integration/c11-activity-panel-undo.test.ts`.
 *   - Esc / X / click-outside close semantics — the DocPanel is a layout
 *     panel, not a modal Sheet. Close is via the back-arrow button.
 *
 * Canonical selectors:
 *   [data-testid="activity-panel"]                   — activity body region
 *   [data-testid="docpanel-exit-agent-mode"]         — back-arrow button
 *   [data-testid="activity-panel-file-row"]          — one file entry
 *   [data-testid="activity-panel-file-row-filename"] — filename link
 *   [data-testid="activity-panel-file-row-carrot"]   — expand toggle
 *   [data-testid="activity-panel-undo-last"]         — undo-last button
 */

import { expect, test } from './_helpers';

function agentId(label: string): string {
  return `${label}-${crypto.randomUUID().slice(0, 8)}`;
}

test.describe('Activity mode (DocPanel) — avatar drill-in, back-arrow exit', () => {
  test('AC-T1: clicking an agent avatar flips DocPanel to agent mode with correct file list', async ({
    page,
    api,
  }) => {
    const docA = 'panel-t1-a';
    const docB = 'panel-t1-b';
    const docView = 'panel-t1-view';
    await api.seedDocs([
      { name: docView, markdown: '# view' },
      { name: docA, markdown: '# a' },
      { name: docB, markdown: '# b' },
    ]);

    await page.goto(`/#/${docView}`);

    const claude = agentId('claude-t1');
    await api.writeAsAgent(docA, '# Claude wrote to A', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });
    await api.writeAsAgent(docB, '# Claude also wrote to B', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const bar = page.locator('[data-slot="presence-bar"]');
    await expect(bar).toBeVisible();

    const claudeAvatar = bar
      .locator('[data-presence-badge="agent"]')
      .filter({ has: page.locator('[aria-label*="Claude"]') })
      .first();
    await expect(claudeAvatar).toBeVisible({ timeout: 10_000 });
    await claudeAvatar.click();

    // After click, the activity body should be visible and the back-arrow
    // button should be present (canonical signal that we're in agent mode).
    const backButton = page.locator('[data-testid="docpanel-exit-agent-mode"]');
    await expect(backButton).toBeVisible({ timeout: 5_000 });

    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    const fileRows = panel.locator('[data-testid="activity-panel-file-row"]');
    await expect
      .poll(async () => fileRows.count(), { timeout: 10_000, intervals: [100, 250, 500] })
      .toBeGreaterThanOrEqual(2);

    const rowTexts = await fileRows.allInnerTexts();
    expect(rowTexts.some((t) => t.includes(docA))).toBe(true);
    expect(rowTexts.some((t) => t.includes(docB))).toBe(true);

    // Scoped avatar carries the `data-presence-scoped="true"` marker so
    // the ring highlight is verifiable without color assertions.
    await expect(claudeAvatar).toHaveAttribute('data-presence-scoped', 'true');
  });

  test('AC-T2: clicking the same avatar a second time exits back to doc mode', async ({
    page,
    api,
  }) => {
    const docView = 'panel-t2-view';
    const docAgent = 'panel-t2-agent';
    await api.seedDocs([
      { name: docView, markdown: '# view' },
      { name: docAgent, markdown: '# body' },
    ]);
    await page.goto(`/#/${docView}`);

    const claude = agentId('claude-t2');
    await api.writeAsAgent(docAgent, '# Claude', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const claudeAvatar = page
      .locator('[data-slot="presence-bar"] [data-presence-badge="agent"]')
      .filter({ has: page.locator('[aria-label*="Claude"]') })
      .first();
    await expect(claudeAvatar).toBeVisible({ timeout: 10_000 });

    const backButton = page.locator('[data-testid="docpanel-exit-agent-mode"]');
    const panel = page.locator('[data-testid="activity-panel"]');

    // First click → agent mode: back-arrow + activity body visible.
    await claudeAvatar.click();
    await expect(backButton).toBeVisible({ timeout: 5_000 });
    await expect(panel).toBeVisible();

    // Second click on the SAME avatar → back to doc mode.
    await claudeAvatar.click();
    await expect(backButton).toBeHidden({ timeout: 5_000 });
    await expect(panel).toBeHidden();
  });

  test('AC-T3: back-arrow button exits agent mode; tooltip copy is descriptive', async ({
    page,
    api,
  }) => {
    const docView = 'panel-t3-view';
    const docAgent = 'panel-t3-agent';
    await api.seedDocs([
      { name: docView, markdown: '# view' },
      { name: docAgent, markdown: '# body' },
    ]);
    await page.goto(`/#/${docView}`);

    const claude = agentId('claude-t3');
    await api.writeAsAgent(docAgent, '# Claude', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const claudeAvatar = page
      .locator('[data-slot="presence-bar"] [data-presence-badge="agent"]')
      .filter({ has: page.locator('[aria-label*="Claude"]') })
      .first();
    await expect(claudeAvatar).toBeVisible({ timeout: 10_000 });
    await claudeAvatar.click();

    const backButton = page.locator('[data-testid="docpanel-exit-agent-mode"]');
    await expect(backButton).toBeVisible({ timeout: 5_000 });
    await expect(backButton).toHaveAccessibleName('Back to document view');

    await backButton.click();
    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeHidden({ timeout: 5_000 });
    await expect(backButton).toBeHidden();
  });

  test('AC-T6 (was AC-P3): filename click navigates main editor; panel stays in agent mode', async ({
    page,
    api,
  }) => {
    const docView = 'panel-t6-view';
    const docTarget = 'panel-t6-target';
    await api.seedDocs([
      { name: docView, markdown: '# view' },
      { name: docTarget, markdown: '# target body' },
    ]);
    await page.goto(`/#/${docView}`);

    const claude = agentId('claude-t6');
    await api.writeAsAgent(docTarget, '# Claude wrote target', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const claudeAvatar = page
      .locator('[data-slot="presence-bar"] [data-presence-badge="agent"]')
      .filter({ has: page.locator('[aria-label*="Claude"]') })
      .first();
    await expect(claudeAvatar).toBeVisible({ timeout: 10_000 });
    await claudeAvatar.click();

    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    const filenameBtn = panel
      .locator('[data-testid="activity-panel-file-row-filename"]')
      .filter({ hasText: docTarget })
      .first();
    await expect(filenameBtn).toBeVisible({ timeout: 5_000 });
    await filenameBtn.click();

    // Main editor navigates.
    await expect
      .poll(async () => page.url(), {
        timeout: 5_000,
        intervals: [100, 250, 500],
      })
      .toContain(`#/${docTarget}`);
    // DocPanel stays in agent mode.
    const backButton = page.locator('[data-testid="docpanel-exit-agent-mode"]');
    await expect(backButton).toBeVisible();
    await expect(panel).toBeVisible();
  });

  test('AC-P4 (carryover): undo does not move main editor active doc', async ({ page, api }) => {
    const docView = 'panel-t7-view';
    const docAgent = 'panel-t7-agent';
    await api.seedDocs([
      { name: docView, markdown: `# view\n\n${Array(40).fill('filler line').join('\n\n')}` },
      { name: docAgent, markdown: '# agent body' },
    ]);
    await page.goto(`/#/${docView}`);

    const claude = agentId('claude-t7');
    await api.writeAsAgent(docAgent, '# Claude wrote burst 1', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const urlBefore = page.url();

    const claudeAvatar = page
      .locator('[data-slot="presence-bar"] [data-presence-badge="agent"]')
      .filter({ has: page.locator('[aria-label*="Claude"]') })
      .first();
    await claudeAvatar.click();
    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Expand the file row, then click Undo last.
    const row = panel.locator('[data-testid="activity-panel-file-row"]').first();
    await row.locator('[data-testid="activity-panel-file-row-carrot"]').click();
    const undoLast = panel.locator('[data-testid="activity-panel-undo-last"]');
    await expect(undoLast).toBeVisible({ timeout: 5_000 });
    await undoLast.click();

    // After undo dispatch, the URL hash (active doc) stays on docView.
    await expect
      .poll(async () => page.url(), { timeout: 2_000, intervals: [100, 250, 500] })
      .toBe(urlBefore);
    // DocPanel stays in agent mode across undo.
    const backButton = page.locator('[data-testid="docpanel-exit-agent-mode"]');
    await expect(backButton).toBeVisible();
  });
});
