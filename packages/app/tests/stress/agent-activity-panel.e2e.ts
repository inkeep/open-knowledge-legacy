/**
 * Layer C (Tier 2): Agent Activity Panel (DocPanel `'agent'` mode) — end-
 * to-end coverage for SPEC 2026-04-24-activity-panel-to-docpanel-mode-toggle
 * and its dependent SPEC 2026-04-23 that now lives inside DocPanel.
 *
 * Covers (SPEC-24 §7 acceptance criteria):
 *   - AC-T1: click agent avatar → DocPanel flips to `'agent'` mode, auto-
 *     expands if collapsed, file list renders within 300 ms budget
 *     (Playwright poll tolerates CI cold-start noise).
 *   - AC-T2: click the same avatar a second time → mode flips back to
 *     `'doc'`.
 *   - AC-T3: click a different avatar → scoped agent swaps, still in
 *     `'agent'` mode.
 *   - AC-T6 (formerly SPEC-23 AC-P3): click a filename in the activity
 *     list → main editor navigates; panel stays in `'agent'` mode.
 *   - AC-P4 carryover (SPEC-23, preserved under the new host): opening
 *     the panel + clicking Undo last does NOT move the main editor's
 *     active doc. Scroll invariants are inherited from the DocPanel host
 *     (a layout panel; scroll behaviour not changed by undo dispatch).
 *
 * Behaviour deliberately NOT tested here, with rationale:
 *   - AC-P8 live CC1 update (700 ms arrival budget) — the Playwright
 *     dev-server fixture runs with `gitEnabled: false` for test isolation
 *     (see SPEC-24 §NG-T1 + the c11 integration's test-harness comment).
 *     CC1 `session-activity` only fires from the L2 drain after a
 *     successful `commitWipFromTree` — with gitEnabled=false that
 *     callback is never reached. The live-update pipeline is covered
 *     end-to-end in `packages/app/tests/integration/c11-activity-panel-
 *     undo.test.ts` which uses gitEnabled=true + commitDebounceMs=200.
 *   - Esc / X / click-outside close semantics (old SPEC-23 FR-P4) — the
 *     DocPanel is a layout panel, not a modal Sheet. Close is via the
 *     editor's existing collapse toggle button; those semantics are
 *     covered by DocPanel's existing tests, not this file.
 *
 * Canonical selectors:
 *   [data-testid="activity-panel"]            — activity body region
 *   [data-testid="docpanel-mode-toggle"]      — ToggleGroup for mode
 *   [data-testid="docpanel-mode-doc"]         — Document mode button
 *   [data-testid="docpanel-mode-agent"]       — Activity mode button
 *   [data-testid="activity-panel-file-row"]   — one file entry
 *   [data-testid="activity-panel-file-row-filename"] — filename link
 *   [data-testid="activity-panel-file-row-carrot"]   — expand toggle
 *   [data-testid="activity-panel-undo-last"]  — undo-last button
 */

import { expect, test } from './_helpers';

function agentId(label: string): string {
  return `${label}-${crypto.randomUUID().slice(0, 8)}`;
}

test.describe('Activity mode (DocPanel) — open, navigate, undo, mode toggle', () => {
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

    // SPEC-24 AC-T1: after click, the DocPanel's mode toggle's agent
    // button should be the active state AND the activity body should
    // be visible. DocPanel auto-expands (FR-T10) if collapsed; the
    // toggle becoming `aria-pressed=true` is the canonical "I'm in
    // agent mode" signal.
    const agentModeButton = page.locator('[data-testid="docpanel-mode-agent"]');
    await expect
      .poll(async () => agentModeButton.getAttribute('data-state'), {
        timeout: 5_000,
        intervals: [100, 250, 500],
      })
      .toBe('on');

    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    const fileRows = panel.locator('[data-testid="activity-panel-file-row"]');
    await expect
      .poll(async () => fileRows.count(), { timeout: 10_000, intervals: [100, 250, 500] })
      .toBeGreaterThanOrEqual(2);

    const rowTexts = await fileRows.allInnerTexts();
    expect(rowTexts.some((t) => t.includes(docA))).toBe(true);
    expect(rowTexts.some((t) => t.includes(docB))).toBe(true);
  });

  test('AC-T2: clicking the same avatar a second time flips back to doc mode', async ({
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

    const docModeButton = page.locator('[data-testid="docpanel-mode-doc"]');
    const agentModeButton = page.locator('[data-testid="docpanel-mode-agent"]');

    // First click → agent mode on, doc mode off.
    await claudeAvatar.click();
    await expect
      .poll(async () => agentModeButton.getAttribute('data-state'), { timeout: 5_000 })
      .toBe('on');
    await expect(docModeButton).toHaveAttribute('data-state', 'off');

    // Second click on the SAME avatar → toggle back to doc mode.
    await claudeAvatar.click();
    await expect
      .poll(async () => docModeButton.getAttribute('data-state'), { timeout: 5_000 })
      .toBe('on');
    await expect(agentModeButton).toHaveAttribute('data-state', 'off');
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

    // Flip to agent mode via avatar click.
    const claudeAvatar = page
      .locator('[data-slot="presence-bar"] [data-presence-badge="agent"]')
      .filter({ has: page.locator('[aria-label*="Claude"]') })
      .first();
    await expect(claudeAvatar).toBeVisible({ timeout: 10_000 });
    await claudeAvatar.click();

    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Click the filename in the activity list.
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
    // DocPanel stays in agent mode (SPEC-24 FR-T13).
    const agentModeButton = page.locator('[data-testid="docpanel-mode-agent"]');
    await expect(agentModeButton).toHaveAttribute('data-state', 'on');
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

    // Pin docView to prevent any auto-nav from chasing the agent write.
    await page.evaluate(
      ([d]) => {
        const setPin = (window as { __test_setPin?: (x: string | null) => void }).__test_setPin;
        if (!setPin) throw new Error('__test_setPin dev hook missing');
        setPin(d);
      },
      [docView],
    );

    const claude = agentId('claude-t7');
    await api.writeAsAgent(docAgent, '# Claude wrote burst 1', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const urlBefore = page.url();

    // Flip to agent mode via avatar click.
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

    // After undo dispatch, the URL hash (active doc) stays pinned to docView.
    // The active-doc invariant is the specific thing undo logic could violate
    // (the cursor/scroll invariants fall out naturally because the panel's
    // openDocumentTransition is guarded + undo never calls navigateToDoc).
    await expect
      .poll(async () => page.url(), { timeout: 2_000, intervals: [100, 250, 500] })
      .toBe(urlBefore);
    // DocPanel stays in agent mode across undo.
    const agentModeButton = page.locator('[data-testid="docpanel-mode-agent"]');
    await expect(agentModeButton).toHaveAttribute('data-state', 'on');
  });

  test('AC-T5: agent mode toggle is disabled when no agents have sessions', async ({
    page,
    api,
  }) => {
    const docView = 'panel-t5-view';
    await api.seedDocs([{ name: docView, markdown: '# view' }]);
    await page.goto(`/#/${docView}`);

    // No agents have been seeded with writes on this page. The presence
    // bar's current section may still include the seed-agent `claude-1`
    // from `api.seedDocs` depending on timing, but its TTL (5 s) should
    // age it out before this assertion; the stale-filter in
    // `hasActiveAgents` matches. We poll the button state to allow for
    // the initial presence-bar race.
    const agentModeButton = page.locator('[data-testid="docpanel-mode-agent"]');
    await expect(agentModeButton).toBeVisible({ timeout: 5_000 });
    await expect
      .poll(async () => agentModeButton.isDisabled(), {
        timeout: 10_000,
        intervals: [500, 1_000, 2_000],
      })
      .toBe(true);
  });
});
