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
          currentSection.locator('[data-presence-badge="agent"][aria-label="Claude"]').count(),
        { timeout: 10_000, intervals: [100, 250, 500] },
      )
      .toBe(1);
    await expect
      .poll(
        async () =>
          currentSection.locator('[data-presence-badge="agent"][aria-label="Cursor"]').count(),
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
    await page.evaluate((doc) => {
      // `ok-pin-v1` is the localStorage key DocumentContext seeds from on
      // mount; setting it via `pin()` requires a React context dance, but
      // pushing the key directly works because the existing `loadPinFromStorage`
      // in DocumentProvider re-reads on mount + on agent-nav check.
      // Cleaner: use the dev-exposed context. We set storage and also
      // dispatch a synthetic pin via the dev hook if available.
      localStorage.setItem('ok-pin-v1', doc);
    }, docFoo);
    // Reload so the pin takes effect (DocumentProvider reads it on mount).
    await page.reload();
    await expect(bar).toBeVisible();

    // Publish after navigation + pin so auto-nav is suppressed and TTL is fresh.
    await api.writeAsAgent(docBar, '# Cursor on bar', {
      agentId: agentId('cursor-bar'),
      agentName: 'Cursor',
      clientName: 'cursor',
    });
    await api.writeAsAgent(docFoo, '# Claude on foo', {
      agentId: agentId('claude-foo'),
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    // Divider should appear because at least one agent is on a different doc.
    const divider = bar.locator('[data-slot="presence-divider"]');
    await expect(divider).toBeVisible({ timeout: 10_000 });

    const currentSection = bar.locator('[data-presence-section="current"]');
    const crossDocSection = bar.locator('[data-presence-section="crossdoc"]');

    // Claude lands in current-doc (matches docFoo), Cursor in cross-doc.
    await expect
      .poll(
        async () =>
          currentSection.locator('[data-presence-badge="agent"][aria-label="Claude"]').count(),
        { timeout: 10_000, intervals: [100, 250, 500] },
      )
      .toBe(1);
    await expect
      .poll(
        async () =>
          crossDocSection.locator('[data-presence-badge="agent"][aria-label="Cursor"]').count(),
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .toBe(1);

    // Cross-doc avatar carries the data-presence-crossdoc marker.
    const crossAvatar = crossDocSection.locator(
      '[data-presence-badge="agent"][aria-label="Cursor"]',
    );
    await expect(crossAvatar.first()).toHaveAttribute('data-presence-crossdoc', 'true');
  });

  test('clicking the cross-doc tooltip wiki-link navigates to the agent doc', async ({
    page,
    api,
  }) => {
    const docFoo = 'doc-mp-nav-foo';
    const docBar = 'doc-mp-nav-bar';
    await api.seedDocs([
      { name: docFoo, markdown: '# foo' },
      { name: docBar, markdown: '# bar body' },
    ]);

    await page.goto(`/#/${docFoo}`);
    const bar = page.locator('[data-slot="presence-bar"]');
    await expect(bar).toBeVisible();

    // Pin docFoo to prevent auto-nav chasing the Cursor-on-bar write. The
    // wiki-link click sets `window.location.hash` directly, which bypasses
    // the pin guard (pin only suppresses agent-driven nav in
    // SystemDocSubscriber). So we can keep the pin on throughout.
    await page.evaluate((doc) => localStorage.setItem('ok-pin-v1', doc), docFoo);
    await page.reload();
    await expect(bar).toBeVisible();

    await api.writeAsAgent(docBar, '# Cursor on bar', {
      agentId: agentId('cursor-nav-bar'),
      agentName: 'Cursor',
      clientName: 'cursor',
    });
    await api.writeAsAgent(docFoo, '# Claude on foo', {
      agentId: agentId('claude-nav-foo'),
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const crossDocAvatar = bar.locator(
      '[data-presence-section="crossdoc"] [data-presence-badge="agent"][aria-label="Cursor"]',
    );
    await expect(crossDocAvatar).toHaveCount(1, { timeout: 10_000 });

    // Hover the cross-doc avatar to reveal the tooltip with the wiki-link.
    await crossDocAvatar.first().hover();

    // Tooltip content contains the wiki-link button. Radix Tooltip may
    // portal to 1 or 2 DOM nodes depending on radix internals; use
    // `.first()` to pick the actionable one. `[data-state="delayed-open"]`
    // on the tooltip root is the stable "open" marker.
    const navButton = page
      .getByRole('button', { name: new RegExp(`editing \\[\\[${docBar}\\]\\]`) })
      .first();
    await expect(navButton).toBeVisible({ timeout: 10_000 });
    await navButton.click();

    // Hash changes to the other doc. The onClick handler calls
    // `window.location.hash = hashFromDocName(docName)`; NavigationHandler
    // picks up the hashchange and drives the Activity mount.
    await expect
      .poll(async () => page.url(), {
        timeout: 10_000,
        intervals: [100, 250, 500],
      })
      .toContain(`#/${docBar}`);
  });
});
