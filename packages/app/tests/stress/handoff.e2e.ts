/**
 * Layer C (Tier 2): Open-in-Agent handoff — 8-cell matrix.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §13.3.
 * Each cell maps to the numbered scenarios in that section. Mocking at the
 * `window.okDesktop` bridge boundary (Electron host) + `page.route` on
 * `/api/installed-agents` (web host) via `fixtures/handoff-mocks.ts`.
 *
 * Key choices (debated at implementation time):
 *   - Real-server handoff dispatch is mocked. CI runners generally do not
 *     have Claude / Codex / Cursor installed, and even if they did, dispatching
 *     the URL would black-box the assertion. The mock lets us assert the exact
 *     dispatched URL, the call count, and the order.
 *   - Anchor-click swallowed for handoff schemes via `HTMLAnchorElement.
 *     prototype.click` override. Without this, Chromium would attempt to
 *     navigate to `claude://` etc., triggering a protocol-handler dialog
 *     (ignored in headless) OR a real navigation to `https://claude.ai/...`
 *     (would leave the app). See `handoff-mocks.ts` for the full rationale.
 *   - Cell 3 (install-state flip) uses close+reopen rather than mid-open
 *     live update. The only trigger for `refresh()` is the dropdown-open
 *     handler; there is no other natural user path to force a probe. The
 *     spec's "dropdown stays open" phrasing is a design statement (the flip
 *     doesn't close the dropdown as a side effect). We assert the transition
 *     via a reopen after clock advance past the 10s throttle.
 *
 * Host-specific notes:
 *   - Electron host cells MUST inject `window.okDesktop` via `addInitScript`
 *     BEFORE `page.goto(...)`. Setting it after hydration would race with
 *     `useCollabUrl` + `useWorkspace` boot logic.
 *   - Web host cells leave `window.okDesktop` undefined. The app falls
 *     through to `GET /api/workspace` (served by the real worker server)
 *     and `GET /api/installed-agents` (intercepted by the fixture).
 */

import { realpathSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { expect, test, waitForActiveProviderSynced } from './_helpers';
import {
  advanceHandoffFakeTime,
  type HandoffMockConfig,
  installHandoffMocks,
  readCapturedHandoff,
  updateElectronInstallMap,
  updateSpawnCursorResult,
} from './fixtures/handoff-mocks';

const DOC_NAME = 'handoff-test-doc';
const DOC_MARKDOWN = '# Handoff Test Doc\n\nBody paragraph for the handoff matrix.';

/**
 * Resolve the worker's contentDir to its canonical path. On macOS the tmpdir
 * (`/var/folders/...`) is a symlink to `/private/var/folders/...`. The server's
 * `/api/workspace` handler calls `realpathSync`, so web-host cells see the
 * resolved path; Electron-host cells see whatever we inject into
 * `bridge.config.projectPath`. Using `realpathSync` on both sides keeps the
 * test deterministic regardless of the symlink shape on the runner.
 */
function resolvedContentDir(contentDir: string): string {
  try {
    return realpathSync(contentDir);
  } catch {
    return contentDir;
  }
}

async function seedAndNavigate(
  page: Page,
  api: { seedDocs: (docs: Array<{ name: string; markdown: string }>) => Promise<void> },
): Promise<void> {
  await api.seedDocs([{ name: DOC_NAME, markdown: DOC_MARKDOWN }]);
  await page.goto(`/#/${DOC_NAME}`);
  await waitForActiveProviderSynced(page);
  await page.waitForSelector('.ProseMirror');
  // Trigger is gated on activeDocName + workspace (both host paths). Wait
  // until the trigger is both present AND enabled before exercising it.
  const trigger = page.getByTestId('open-in-agent-trigger');
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
}

async function openDropdown(page: Page): Promise<void> {
  await page.getByTestId('open-in-agent-trigger').click();
  await expect(page.getByTestId('open-in-agent-menu')).toBeVisible();
}

/**
 * Wait until the install-state probe has resolved. Before the probe lands,
 * rows render as `installed: null` which produces the "disabled, no
 * tooltip" defensive branch (AC8). A subsequent hover then finds nothing
 * in the DOM even with a generous timeout.
 *
 * - Electron host: `detectProtocolCalls.length` grows to 3 once each unique
 *   scheme has been probed (the fixture mock resolves each immediately).
 * - Web host: the fixture's `window.fetch` wrapper sets
 *   `installedAgentsFetchResolved` after the single `/api/installed-agents`
 *   response lands. The React hook's state update is microtask-cheap; we
 *   rely on Playwright's internal retry window for the hover that follows.
 */
async function waitForProbeSettled(page: Page, host: 'electron' | 'web'): Promise<void> {
  if (host === 'electron') {
    await expect
      .poll(async () => (await readCapturedHandoff(page)).detectProtocolCalls.length, {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(3);
    return;
  }
  await expect
    .poll(
      async () => {
        return await page.evaluate(() => {
          // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
          const mocks = (window as any).__handoffMocks__;
          return Boolean(mocks?.installedAgentsFetchResolved);
        });
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

/**
 * Scope a locator query to the currently-visible disabled-row sub-content.
 * The helper name is historical — the disabled-row affordance was originally
 * a Radix Tooltip-with-buttons and tests were written against that shape;
 * it's now a portaled `DropdownMenuSubContent` (WAI-ARIA-correct per Review
 * M3 fix). Any visible sub-content wins; Radix unmounts closed sub-content
 * so only one is in the DOM at a time. Preserving the name keeps the test
 * assertions scannable alongside earlier review-iteration notes.
 */
function tooltipScope(page: Page): Locator {
  return page.locator('[data-slot="dropdown-menu-sub-content"]');
}

/**
 * Assert a row is rendered in its disabled-post-probe shape (`DropdownMenuSub`
 * trigger with `data-row-disabled=""` sentinel). This replaces the old
 * `toHaveAttribute('data-disabled', '')` assertion that worked when the row
 * was a real disabled `DropdownMenuItem`. The sub-trigger pattern is the one
 * shipped for Review M3 accessibility fix — Radix does not carry
 * `data-disabled` on a sub-trigger.
 */
async function expectRowDisabled(row: Locator): Promise<void> {
  await expect(row).toHaveAttribute('data-row-disabled', '');
}

test.describe('handoff — 8-cell matrix', () => {
  test('cell 1: Electron Claude Cowork happy path dispatches correct URL + success toast', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'electron',
      install: { claude: true, codex: true, cursor: true },
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    await openDropdown(page);
    await page.getByTestId('open-in-agent-item-claude-cowork').click();

    // URL dispatch arrives via window.okDesktop.shell.openExternal.
    await expect
      .poll(async () => (await readCapturedHandoff(page)).openExternalCalls.length, {
        timeout: 5_000,
      })
      .toBe(1);

    const captured = await readCapturedHandoff(page);
    const dispatched = captured.openExternalCalls[0];
    expect(dispatched).toBeTruthy();
    const u = new URL(dispatched as string);
    expect(u.protocol).toBe('claude:');
    expect(u.hostname).toBe('cowork');
    expect(u.pathname).toBe('/new');
    expect(u.searchParams.get('q')).toContain('Open Knowledge doc');
    expect(u.searchParams.get('q')).toContain('open-knowledge MCP');
    expect(u.searchParams.get('folder')).toBe(resolvedContentDir(workerServer.contentDir));
    expect(u.searchParams.get('file')).toBe(
      `${resolvedContentDir(workerServer.contentDir)}/${DOC_NAME}.md`,
    );

    await expect(page.getByText('Opened in Claude Cowork.')).toBeVisible();

    // Telemetry: one ok line captured via the bridge mock.
    expect(captured.recordHandoffCalls.length).toBe(1);
    const [line] = captured.recordHandoffCalls;
    expect(line?.target).toBe('claude-cowork');
    expect(line?.host).toBe('electron');
    expect(line?.outcome).toBe('ok');
    expect(typeof line?.ts).toBe('string');
  });

  test('cell 2: Electron Cursor two-step spawn → single prompt URL dispatch + success toast', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'electron',
      install: { claude: true, codex: true, cursor: true },
      spawnCursor: { ok: true },
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    await openDropdown(page);
    await page.getByTestId('open-in-agent-item-cursor').click();

    // Step 1: spawnCursor called with the workspace content dir.
    await expect
      .poll(async () => (await readCapturedHandoff(page)).spawnCursorCalls.length, {
        timeout: 5_000,
      })
      .toBe(1);
    const afterSpawn = await readCapturedHandoff(page);
    expect(afterSpawn.spawnCursorCalls[0]).toBe(resolvedContentDir(workerServer.contentDir));

    // Step 2: after the cold-start settle (1500ms worst case), exactly one
    // openExternal call with the cursor:// prompt URL. The settle delay is
    // real setTimeout — our fake-time patching only affects Date.now, not
    // timers. The 5s poll covers the settle + scheduler jitter.
    await expect
      .poll(async () => (await readCapturedHandoff(page)).openExternalCalls.length, {
        timeout: 5_000,
      })
      .toBe(1);
    const afterDispatch = await readCapturedHandoff(page);
    const cursorUrl = afterDispatch.openExternalCalls[0];
    expect(cursorUrl).toBeTruthy();
    const u = new URL(cursorUrl as string);
    expect(u.protocol).toBe('cursor:');
    expect(u.hostname).toBe('anysphere.cursor-deeplink');
    expect(u.pathname).toBe('/prompt');
    expect(u.searchParams.get('mode')).toBe('agent');
    // text= is double-encoded per SPEC §6.2 + cursor-encoding-empirics.md —
    // URL.searchParams decodes once, so `.get('text')` returns the
    // single-encoded form.
    const textOnce = u.searchParams.get('text');
    expect(textOnce).toBeTruthy();
    expect(decodeURIComponent(textOnce as string)).toContain('Open Knowledge doc');

    await expect(page.getByText('Opened in Cursor.')).toBeVisible();

    // Single dispatch — no double-fire.
    expect(afterDispatch.openExternalCalls.length).toBe(1);
  });

  test('cell 3: Electron install-state flip — disabled → enabled via refresh after throttle window', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'electron',
      install: { claude: true, codex: false, cursor: true },
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    // Open: Codex row is disabled (codex:false from initial probe). Under the
    // submenu pattern (replacing the prior tooltip-with-buttons UX), the row
    // renders as a `DropdownMenuSubTrigger` with an inline "Not installed"
    // hint + chevron affordance. Enabled rows are plain `DropdownMenuItem`s
    // with neither. Assert on the hint text presence as the disabled signal.
    await openDropdown(page);
    const codexRow = page.getByTestId('open-in-agent-item-codex');
    await expect(codexRow).toContainText('Not installed');

    // Close dropdown, advance past the 10s throttle, flip mock, reopen.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('open-in-agent-menu')).toBeHidden();

    await advanceHandoffFakeTime(page, 11_000);
    await updateElectronInstallMap(page, { claude: true, codex: true, cursor: true });

    await openDropdown(page);
    // After reopen the throttle check passes + detectProtocol returns
    // codex:true → row flips to enabled. Enabled rows don't carry the
    // "Not installed" hint; poll until it disappears.
    await expect
      .poll(
        async () => {
          const text = await codexRow.textContent();
          return (text ?? '').includes('Not installed');
        },
        { timeout: 5_000 },
      )
      .toBe(false);
  });

  test('cell 4: Web Claude Cowork happy path dispatches via anchor-click + success toast', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'web',
      install: { claude: true, codex: true, cursor: true },
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    await openDropdown(page);
    await page.getByTestId('open-in-agent-item-claude-cowork').click();

    await expect
      .poll(async () => (await readCapturedHandoff(page)).anchorClicks.length, {
        timeout: 5_000,
      })
      .toBe(1);

    const captured = await readCapturedHandoff(page);
    const dispatched = captured.anchorClicks[0];
    const u = new URL(dispatched as string);
    expect(u.protocol).toBe('claude:');
    expect(u.hostname).toBe('cowork');
    expect(u.searchParams.get('folder')).toBe(resolvedContentDir(workerServer.contentDir));

    await expect(page.getByText('Opened in Claude Cowork.')).toBeVisible();

    // Web host: no bridge recordHandoff surface — telemetry is a no-op in
    // v0 (SPEC §13.1). Assert openExternalCalls are empty (no bridge to
    // forward to).
    expect(captured.openExternalCalls.length).toBe(0);
  });

  test('cell 5: Web Cursor row is ALWAYS disabled (E4) regardless of server response', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'web',
      // Deliberately claim cursor:true — the UI must still render disabled
      // because web-host Cursor is NOT supported in v0.
      install: { claude: true, codex: true, cursor: true },
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    await openDropdown(page);
    await waitForProbeSettled(page, 'web');
    const cursorRow = page.getByTestId('open-in-agent-item-cursor');
    await expectRowDisabled(cursorRow);

    // Hover opens the DropdownMenuSubContent (portaled), which carries
    // the descriptive message as a DropdownMenuLabel + install affordance.
    await cursorRow.hover();
    await expect(
      tooltipScope(page).getByText('Cursor handoff requires the desktop build.').first(),
    ).toBeVisible();

    // Click is a no-op — Radix gates `onSelect` on disabled, so no
    // dispatch can fire. `expect.poll` with a condition that returns 0
    // is the condition-based-wait shape required by D-Q14 (rule #1 in
    // `tests/integration/e2e-stop-rules.test.ts`) — we verify the capture
    // counts stay zero over a bounded poll window rather than pausing
    // for a fixed interval.
    await cursorRow.click({ force: true });
    await expect
      .poll(
        async () => {
          const c = await readCapturedHandoff(page);
          return c.anchorClicks.length + c.openExternalCalls.length;
        },
        { timeout: 1_000, intervals: [100, 200, 300, 400] },
      )
      .toBe(0);
  });

  test('cell 6: Web Claude disabled — "Open in claude.ai →" fallback dispatches https://claude.ai/new', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'web',
      install: { claude: false, codex: true, cursor: true },
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    await openDropdown(page);
    await waitForProbeSettled(page, 'web');
    const coworkRow = page.getByTestId('open-in-agent-item-claude-cowork');
    await expectRowDisabled(coworkRow);

    // Hover opens the disabled-row sub-content with the web-fallback
    // affordance (shipped as a keyboard-reachable DropdownMenuItem inside a
    // portaled DropdownMenuSubContent; see Review M3 fix).
    await coworkRow.hover();
    const webFallback = tooltipScope(page)
      .getByTestId('open-in-agent-web-fallback-claude-cowork')
      .first();
    await expect(webFallback).toBeVisible();
    await webFallback.click();

    await expect
      .poll(async () => (await readCapturedHandoff(page)).anchorClicks.length, {
        timeout: 5_000,
      })
      .toBe(1);
    const captured = await readCapturedHandoff(page);
    const u = new URL(captured.anchorClicks[0] as string);
    expect(u.hostname).toBe('claude.ai');
    expect(u.pathname).toBe('/new');
    expect(u.searchParams.get('q')).toContain('Open Knowledge doc');

    await expect(page.getByText('Opened Claude Cowork in your browser.')).toBeVisible();
  });

  test('cell 7: Web empty-dropdown — every row disabled with the right tooltip copy', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'web',
      install: { claude: false, codex: false, cursor: false },
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openDropdown(page);
    await waitForProbeSettled(page, 'web');

    // All four rows: disabled sub-trigger shape (carries data-row-disabled="").
    for (const id of ['claude-cowork', 'claude-code', 'codex', 'cursor']) {
      const row = page.getByTestId(`open-in-agent-item-${id}`);
      await expectRowDisabled(row);
    }

    // Per-row tooltip copy verification. Reopening the dropdown between
    // rows is the deterministic primitive — sequential hover within a
    // single open instance has resisted multiple micro-fixes (Radix
    // Tooltip's trigger-swap interacts poorly with DropdownMenu hover
    // semantics when delayDuration=0).
    const reopenDropdown = async (): Promise<void> => {
      if (await page.getByTestId('open-in-agent-menu').isVisible()) {
        // DismissableLayer intercepts clicks while the menu is open; the
        // trigger is also covered. Click-outside triggers Radix's
        // onInteractOutside and closes the menu cleanly.
        await page.mouse.click(10, 10);
        await expect(page.getByTestId('open-in-agent-menu')).toBeHidden();
      }
      await openDropdown(page);
    };

    await reopenDropdown();
    await page.getByTestId('open-in-agent-item-cursor').hover();
    await expect(
      tooltipScope(page).getByText('Cursor handoff requires the desktop build.').first(),
    ).toBeVisible();

    await reopenDropdown();
    await page.getByTestId('open-in-agent-item-codex').hover();
    await expect(tooltipScope(page).getByText('Requires Codex Desktop.').first()).toBeVisible();
    await expect(tooltipScope(page).getByTestId('open-in-agent-web-fallback-codex')).toHaveCount(0);

    await reopenDropdown();
    await page.getByTestId('open-in-agent-item-claude-cowork').hover();
    await expect(tooltipScope(page).getByText('Requires Claude Desktop.').first()).toBeVisible();
    await expect(
      tooltipScope(page).getByTestId('open-in-agent-web-fallback-claude-cowork').first(),
    ).toBeVisible();

    // Defensive: the open-knowledge-menu flow must not have thrown.
    expect(consoleErrors.filter((e) => !e.includes('net::') && !e.includes('favicon'))).toEqual([]);

    const captured = await readCapturedHandoff(page);
    expect(captured.anchorClicks).toEqual([]);
    expect(captured.openExternalCalls).toEqual([]);
  });

  test('cell 8: Electron Cursor spawn failure → failure toast + error telemetry line', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'electron',
      install: { claude: true, codex: true, cursor: true },
      spawnCursor: { ok: true }, // flipped below via updateSpawnCursorResult
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    // Flip spawnCursor to fail BEFORE clicking the row. Fluent-shape choice
    // (rather than bootstrap-with-failure) because the cfg initial shape has
    // a compile-time ShapeType that narrows to `{ok:true}`; updating after
    // mount via the escape hatch keeps the test's init shape simple.
    await updateSpawnCursorResult(page, { ok: false, reason: 'not-installed' });

    await openDropdown(page);
    await page.getByTestId('open-in-agent-item-cursor').click();

    // spawnCursor fires once — then the dispatcher short-circuits without
    // calling openExternal.
    await expect
      .poll(async () => (await readCapturedHandoff(page)).spawnCursorCalls.length, {
        timeout: 5_000,
      })
      .toBe(1);

    // Failure toast + Retry button visible (sonner error toast).
    await expect(page.getByText("Couldn't reach Cursor — try again?")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    const captured = await readCapturedHandoff(page);
    expect(captured.openExternalCalls).toEqual([]);

    // Telemetry: one error line with the spawn reason.
    expect(captured.recordHandoffCalls.length).toBe(1);
    const [line] = captured.recordHandoffCalls;
    expect(line?.target).toBe('cursor');
    expect(line?.host).toBe('electron');
    expect(line?.outcome).toBe('error');
    expect(line?.reason).toBe('not-installed');
  });
});
