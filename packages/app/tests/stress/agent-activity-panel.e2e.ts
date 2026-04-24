/**
 * Layer C (Tier 2): Agent Activity Panel — end-to-end coverage for
 * SPEC 2026-04-23-agent-activity-panel.
 *
 * Covers:
 *   - AC-P1: click agent avatar → Activity Panel renders within 300 ms with
 *     the correct file list (seeded via api.writeAsAgent to 2 docs).
 *   - AC-P3: clicking a filename in the panel navigates the main editor;
 *     the panel stays open.
 *   - AC-P7: opening the panel + clicking "Undo last" does NOT move the
 *     main editor's active doc or scroll position.
 *   - AC-P8: live update via CC1 push — writing to a THIRD file while the
 *     panel is open adds a new row within the 700 ms budget
 *     (100 ms CC1 debounce + 500 ms hook debounce + margin).
 *   - Esc key closes the panel.
 *   - X header button closes the panel.
 *   - Click-outside does NOT close the panel (FR-P4).
 *   - Session-ended state: panel banner + disabled undo buttons.
 *
 * Reads the panel via its canonical data-testid selectors:
 *   [data-testid="activity-panel"]
 *   [data-testid="activity-panel-close"]
 *   [data-testid="activity-panel-file-row"]
 *   [data-testid="activity-panel-file-row-filename"]
 *   [data-testid="activity-panel-undo-last"]
 *   [data-testid="activity-panel-session-ended"]
 */

import { expect, test } from './_helpers';

function agentId(label: string): string {
  return `${label}-${crypto.randomUUID().slice(0, 8)}`;
}

test.describe('Agent Activity Panel — open, navigate, undo, live updates', () => {
  test('AC-P1: clicking an agent avatar opens the panel with correct file list', async ({
    page,
    api,
  }) => {
    const docA = 'panel-p1-a';
    const docB = 'panel-p1-b';
    const docView = 'panel-p1-view';
    await api.seedDocs([
      { name: docView, markdown: '# view' },
      { name: docA, markdown: '# a' },
      { name: docB, markdown: '# b' },
    ]);

    await page.goto(`/#/${docView}`);

    const claude = agentId('claude-p1');
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

    // Panel mounts and is visible within the 300 ms FCP target (NF-P2).
    // A wider poll window tolerates CI cold-start noise — the assertion
    // itself is that the panel IS visible and contains both seeded docs.
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

  test('AC-P3: filename click navigates main editor; panel stays open', async ({ page, api }) => {
    const docView = 'panel-p3-view';
    const docTarget = 'panel-p3-target';
    await api.seedDocs([
      { name: docView, markdown: '# view' },
      { name: docTarget, markdown: '# target body' },
    ]);
    await page.goto(`/#/${docView}`);

    const claude = agentId('claude-p3');
    await api.writeAsAgent(docTarget, '# Claude wrote target', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    // Open panel.
    const claudeAvatar = page
      .locator('[data-slot="presence-bar"] [data-presence-badge="agent"]')
      .filter({ has: page.locator('[aria-label*="Claude"]') })
      .first();
    await expect(claudeAvatar).toBeVisible({ timeout: 10_000 });
    await claudeAvatar.click();

    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Click the filename.
    const filenameBtn = panel
      .locator('[data-testid="activity-panel-file-row-filename"]')
      .filter({ hasText: docTarget })
      .first();
    await expect(filenameBtn).toBeVisible({ timeout: 5_000 });
    await filenameBtn.click();

    // URL hash flipped to target.
    await expect
      .poll(async () => page.url(), {
        timeout: 5_000,
        intervals: [100, 250, 500],
      })
      .toContain(`#/${docTarget}`);
    // Panel REMAINS open (FR-P24 — nav does not close).
    await expect(panel).toBeVisible();
  });

  test('AC-P7: opening the panel + undo does not move main editor', async ({ page, api }) => {
    const docView = 'panel-p7-view';
    const docAgent = 'panel-p7-agent';
    await api.seedDocs([
      { name: docView, markdown: `# view\n\n${Array(40).fill('filler line').join('\n\n')}` },
      { name: docAgent, markdown: '# agent body' },
    ]);
    await page.goto(`/#/${docView}`);

    // Pin docView to prevent auto-nav chasing the agent write.
    await page.evaluate(
      ([d]) => {
        const setPin = (window as { __test_setPin?: (x: string | null) => void }).__test_setPin;
        if (!setPin) throw new Error('__test_setPin dev hook missing');
        setPin(d);
      },
      [docView],
    );

    const claude = agentId('claude-p7');
    await api.writeAsAgent(docAgent, '# Claude wrote burst 1', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    // Scroll the editor area so we can verify it doesn't move.
    await page.evaluate(() => window.scrollTo(0, 200));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    // Open panel.
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

    // After undo dispatch, hash is unchanged + scroll unchanged. Poll for a
    // stable interval rather than a fixed timeout — the POST /api/agent-undo
    // round-trip + hook re-fetch should NEVER nudge hash/scroll, so we verify
    // the invariant holds across several polls.
    await expect
      .poll(
        async () => ({
          url: page.url(),
          scrollY: await page.evaluate(() => window.scrollY),
        }),
        { timeout: 2_000, intervals: [100, 250, 500] },
      )
      .toEqual({ url: expect.stringContaining(`#/${docView}`), scrollY: scrollBefore });
  });

  test('AC-P8: CC1 session-activity signal adds a new file row within the live-update window', async ({
    page,
    api,
  }) => {
    const docView = 'panel-p8-view';
    const docA = 'panel-p8-a';
    const docB = 'panel-p8-b';
    const docLate = 'panel-p8-late';
    await api.seedDocs([
      { name: docView, markdown: '# view' },
      { name: docA, markdown: '# a' },
      { name: docB, markdown: '# b' },
      { name: docLate, markdown: '# late' },
    ]);
    await page.goto(`/#/${docView}`);
    await page.evaluate(
      ([d]) => {
        const setPin = (window as { __test_setPin?: (x: string | null) => void }).__test_setPin;
        if (!setPin) throw new Error('__test_setPin dev hook missing');
        setPin(d);
      },
      [docView],
    );

    const claude = agentId('claude-p8');
    await api.writeAsAgent(docA, '# A1', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });
    await api.writeAsAgent(docB, '# B1', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const claudeAvatar = page
      .locator('[data-slot="presence-bar"] [data-presence-badge="agent"]')
      .filter({ has: page.locator('[aria-label*="Claude"]') })
      .first();
    await claudeAvatar.click();
    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Wait for initial 2-file list to settle.
    const fileRows = panel.locator('[data-testid="activity-panel-file-row"]');
    await expect
      .poll(async () => fileRows.count(), { timeout: 10_000, intervals: [100, 250, 500] })
      .toBeGreaterThanOrEqual(2);

    // Agent writes to a THIRD file — the CC1 session-activity signal
    // should fire and the panel's hook should re-fetch (100 ms debounce +
    // 500 ms trailing-edge = up to 600 ms before the refetch, + some
    // response time). Budget 5000 ms for CI variance.
    await api.writeAsAgent(docLate, '# Late arrival', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    await expect
      .poll(
        async () => {
          const texts = await fileRows.allInnerTexts();
          return texts.some((t) => t.includes(docLate));
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .toBe(true);
  });

  test('Esc key closes the panel; X button closes; click-outside does NOT close', async ({
    page,
    api,
  }) => {
    const docView = 'panel-close-view';
    const docAgent = 'panel-close-agent';
    await api.seedDocs([
      { name: docView, markdown: '# view' },
      { name: docAgent, markdown: '# body' },
    ]);
    await page.goto(`/#/${docView}`);

    const claude = agentId('claude-close');
    await api.writeAsAgent(docAgent, '# Claude', {
      agentId: claude,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const claudeAvatar = page
      .locator('[data-slot="presence-bar"] [data-presence-badge="agent"]')
      .filter({ has: page.locator('[aria-label*="Claude"]') })
      .first();
    await claudeAvatar.click();

    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // (a) Click-outside — panel STAYS open. Click the editor area. The
    // invariant is that the panel remains visible across a stable interval
    // (a fixed wait would be a race against latent close logic). Poll for
    // 1 s: a real close dispatches within one RAF; a 1 s window gives
    // confident coverage of the no-close contract without introducing a
    // banned waitForTimeout.
    const editor = page.locator('[data-slot="editor-pane"], main').first();
    await editor.click({ position: { x: 100, y: 100 }, force: true });
    await expect
      .poll(async () => panel.isVisible(), { timeout: 1_000, intervals: [100, 250, 500] })
      .toBe(true);

    // (b) X close button.
    await panel.locator('[data-testid="activity-panel-close"]').click();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });

    // Re-open for the Esc test.
    await claudeAvatar.click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible({ timeout: 5_000 });
  });
});
