/**
 * Layer C (Tier 2): Multi-agent presence — FR-9 E2E coverage.
 *
 * End-to-end verification of the bug-bash repro scenario: two distinct
 * agents writing to the same doc must render as two badges (never stomp).
 * Third test exercises the cross-doc sectioned-bar UX (D12 Design B) and
 * the tooltip wiki-link nav (FR-14 / D11).
 *
 * Timing note: publish agent presence AFTER `page.goto` so entries are
 * fresh when the assertion runs. The client-side TTL filter
 * (AGENT_PRESENCE_STALE_MS = 5_000ms) means writes older than 5s get
 * filtered out — seeding before navigation + Playwright's cold-boot wait
 * + a final polling wait easily blows past 5s.
 *
 * Reads from the sectioned bar's data attributes:
 *   [data-slot="presence-bar"]
 *   [data-presence-section="current"|"crossdoc"]
 *   [data-presence-badge="agent"|"human"]
 *   [data-presence-crossdoc="true"]
 *   [data-slot="presence-divider"]
 */

import { expect, test } from './_helpers';

function agentId(label: string): string {
  // UUID-shape with `label` embedded so test logs are readable. Must match
  // AGENT_ID_RE `/^[a-zA-Z0-9_-]+$/` on the server.
  return `${label}-${crypto.randomUUID().slice(0, 8)}`;
}

test.describe('multi-agent presence — sectioned PresenceBar (FR-9)', () => {
  test('two distinct agents on the same doc render as two badges (bug-bash repro)', async ({
    page,
    api,
  }) => {
    const docFoo = 'doc-mp-foo';
    await api.seedDocs([{ name: docFoo, markdown: '# foo' }]);

    await page.goto(`/#/${docFoo}`);
    const bar = page.locator('[data-slot="presence-bar"]');
    await expect(bar).toBeVisible();

    // Publish agents AFTER navigation so the TTL window hasn't elapsed by
    // the time the assertion polls.
    const claudeId = agentId('claude');
    const cursorId = agentId('cursor');
    await api.writeAsAgent(docFoo, '# Claude was here', {
      agentId: claudeId,
      agentName: 'Claude',
      clientName: 'claude-code',
    });
    await api.writeAsAgent(docFoo, '# Cursor was here', {
      agentId: cursorId,
      agentName: 'Cursor',
      clientName: 'cursor',
    });

    // Both named agents MUST render in the current-doc section. The bug
    // being fixed would have collapsed them to a single entry. Asserting
    // on specific aria-labels avoids depending on the seed-agent's
    // (claude-1) TTL race — seedDocs publishes as default 'claude-1' and
    // it either ages out mid-test (5s TTL) or still shows up, so we
    // filter by name rather than counting total agents.
    const currentSection = bar.locator('[data-presence-section="current"]');
    await expect
      .poll(
        async () =>
          currentSection
            .locator('[data-presence-badge="agent"][aria-label="Open activity panel for Claude"]')
            .count(),
        { timeout: 10_000, intervals: [100, 250, 500] },
      )
      .toBe(1);
    await expect
      .poll(
        async () =>
          currentSection
            .locator('[data-presence-badge="agent"][aria-label="Open activity panel for Cursor"]')
            .count(),
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .toBe(1);
  });

  test('cross-doc agent renders in dimmed section with divider', async ({ page, api }) => {
    const docFoo = 'doc-mp-cross-foo';
    const docBar = 'doc-mp-cross-bar';
    await api.seedDocs([
      { name: docFoo, markdown: '# foo' },
      { name: docBar, markdown: '# bar' },
    ]);

    await page.goto(`/#/${docFoo}`);
    const bar = page.locator('[data-slot="presence-bar"]');
    await expect(bar).toBeVisible();

    // Pin docFoo before any agent writes — SystemDocSubscriber's auto-nav
    // would otherwise follow the latest agent write (pickPrimary) and
    // relocate the browser to docBar, inverting which section each agent
    // lands in. Pin is respected unconditionally (DocumentContext.pin).
    // Uses the dev-only `__test_setPin` hook rather than poking
    // `localStorage['ok-pin-v1']` directly — keeps the test off the
    // private storage-key shape. No reload needed: the hook writes to
    // both React state and localStorage in one shot.
    await page.evaluate(
      ([doc]) => {
        const setPin = (window as { __test_setPin?: (d: string | null) => void }).__test_setPin;
        if (!setPin) throw new Error('__test_setPin dev hook missing');
        setPin(doc);
      },
      [docFoo],
    );

    // Publish after navigation + pin so auto-nav is suppressed and TTL is fresh.
    // Write order: Claude (current-doc) first, Cursor (cross-doc) last. Cursor
    // is the tighter constraint because its assertion runs LAST and its `ts`
    // ages linearly against the 5s TTL filter. Writing Cursor last puts its
    // freshest timestamp closest to the cross-doc poll, reducing the race.
    await api.writeAsAgent(docFoo, '# Claude on foo', {
      agentId: agentId('claude-foo'),
      agentName: 'Claude',
      clientName: 'claude-code',
    });
    await api.writeAsAgent(docBar, '# Cursor on bar', {
      agentId: agentId('cursor-bar'),
      agentName: 'Cursor',
      clientName: 'cursor',
    });

    const divider = bar.locator('[data-slot="presence-divider"]');
    const currentSection = bar.locator('[data-presence-section="current"]');
    const crossDocSection = bar.locator('[data-presence-section="crossdoc"]');

    // Atomic polling loop: divider visible + Claude in current + Cursor in
    // cross-doc all at once. Individual polls back-to-back risked burning
    // through Cursor's 5s TTL budget (AGENT_PRESENCE_STALE_MS) between the
    // divider/Claude checks and the Cursor check — under CI load the Cursor
    // entry aged out before the last assertion fired (see PR #246 review).
    // A unified poll catches the valid-state snapshot within a single 100ms
    // tick, eliminating the TTL-vs-sequential-assertion race.
    //
    // Selector uses aria-label^="Name" (starts-with) because cross-doc
    // avatars render as interactive <button>s whose aria-label carries the
    // target doc ("Cursor, editing doc-mp-cross-bar"). Current-doc avatars
    // render as <div role="img"> with just the name ("Claude"). Starts-with
    // matches both shapes and survives the a11y evolution — review pass 2
    // finding #6 dropped a redundant "Press Enter to open" suffix; the
    // prior exact-match selector `[aria-label="Open activity panel for Cursor"]` had been silently
    // broken since US-008's pass-1 accessibility refactor made the
    // cross-doc avatar a <button> (CI's retries: 2 masked the failure).
    await expect
      .poll(
        async () => ({
          divider: await divider.count(),
          claude: await currentSection
            .locator('[data-presence-badge="agent"][aria-label*="Claude"]')
            .count(),
          cursor: await crossDocSection
            .locator('[data-presence-badge="agent"][aria-label*="Cursor"]')
            .count(),
        }),
        { timeout: 10_000, intervals: [100, 250, 500] },
      )
      .toEqual({ divider: 1, claude: 1, cursor: 1 });

    // Cross-doc avatar carries the data-presence-crossdoc marker.
    const crossAvatar = crossDocSection.locator(
      '[data-presence-badge="agent"][aria-label*="Cursor"]',
    );
    await expect(crossAvatar.first()).toHaveAttribute('data-presence-crossdoc', 'true');
  });

  test('clicking the cross-doc avatar opens the Activity Panel (D-P9 LOCKED replaces nav)', async ({
    page,
    api,
  }) => {
    // SPEC 2026-04-23-agent-activity-panel D-P9 LOCKED. The prior UX wired
    // cross-doc avatar clicks to `window.location.hash = hashFromDocName(docName)`;
    // that path was REMOVED in US-008 so that clicking any agent avatar —
    // current OR cross-doc — opens the Activity Panel keyed to that agent's
    // connectionId. Equivalent nav is available via the panel's filename-click
    // affordance (covered in agent-activity-panel.e2e.ts).
    const docFoo = 'doc-mp-nav-foo';
    const docBar = 'doc-mp-nav-bar';
    await api.seedDocs([
      { name: docFoo, markdown: '# foo' },
      { name: docBar, markdown: '# bar body' },
    ]);

    await page.goto(`/#/${docFoo}`);
    const bar = page.locator('[data-slot="presence-bar"]');
    await expect(bar).toBeVisible();

    // Pin docFoo to prevent auto-nav chasing the Cursor-on-bar write.
    await page.evaluate(
      ([doc]) => {
        const setPin = (window as { __test_setPin?: (d: string | null) => void }).__test_setPin;
        if (!setPin) throw new Error('__test_setPin dev hook missing');
        setPin(doc);
      },
      [docFoo],
    );

    await api.writeAsAgent(docFoo, '# Claude on foo', {
      agentId: agentId('claude-nav-foo'),
      agentName: 'Claude',
      clientName: 'claude-code',
    });
    await api.writeAsAgent(docBar, '# Cursor on bar', {
      agentId: agentId('cursor-nav-bar'),
      agentName: 'Cursor',
      clientName: 'cursor',
    });

    const crossDocAvatar = bar.locator(
      '[data-presence-section="crossdoc"] [data-presence-badge="agent"][data-presence-crossdoc="true"]',
      { hasText: '' },
    );
    await expect(crossDocAvatar.first()).toBeVisible({ timeout: 10_000 });
    await crossDocAvatar.first().click();

    // Activity Panel opens. URL hash is UNCHANGED — clicking the cross-doc
    // avatar no longer navigates. (Previous behavior flipped hash to docBar.)
    const panel = page.locator('[data-testid="activity-panel"]');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain(`#/${docFoo}`);
    expect(page.url()).not.toContain(`#/${docBar}`);
  });

  // Note: the prior `.mdx target doc` cross-doc-nav test was removed when
  // D-P9 (agent-activity-panel SPEC) flipped the cross-doc-avatar click
  // contract from "navigate to target doc" to "open activity panel for that
  // agent". The `.md` sibling test above now asserts the new contract;
  // adding a parallel `.mdx`-target variant would test the activity-panel
  // feature, not the `.mdx` extension. `.mdx`-extension nav coverage stays
  // through F0-mdx in `docs-open.e2e.ts` (sidebar click → .mdx file loads).
});
