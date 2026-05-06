/**
 * Layer C (Tier 2): Open-in-Agent handoff — 8-cell matrix.
 *
 * Governing specs:
 *   - v0: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §13.3 (mock setup,
 *     dispatch correctness, telemetry shape — all installed-target paths).
 *   - v1: `specs/2026-05-05-handoff-v1-installed-only-rendering/SPEC.md`
 *     (uninstalled rows are filtered out of the dropdown; the Claude web
 *     fallback is promoted from a per-row submenu affordance to a top-level
 *     menu row when Claude Desktop isn't installed).
 *
 * Cell coverage after v1:
 *   - Cells 1, 2, 4, 8: happy paths for installed targets — unchanged.
 *   - Cell 3: install-state flip — row is HIDDEN pre-flip (filter removes
 *     `installed:false` rows) and APPEARS post-flip.
 *   - Cell 5: Web Cursor — row is HIDDEN (filter removes the
 *     forced-`installed:false` web-host case).
 *   - Cell 6: Claude web fallback — clicks the top-level
 *     `open-in-agent-claude-web-fallback` row.
 *   - Cell 7: empty-state — menu shows only the Claude web fallback row.
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
import type { Page } from '@playwright/test';
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
  const trigger = page.getByTestId('open-in-agent-trigger');
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
}

async function openDropdown(page: Page): Promise<void> {
  await page.getByTestId('open-in-agent-trigger').click();
  await expect(page.getByTestId('open-in-agent-menu')).toBeVisible();
}

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

function skipElectronCellsInCI() {
  test.skip(
    process.env.CI === 'true',
    'Electron-mock cells deterministically time out on GitHub Actions ubuntu-64gb under workers=4 (passes locally 8/8 + in nightly --workers=1). See comment above for hypothesis + signal-loss bound.',
  );
}

test.describe('handoff — 8-cell matrix', () => {
  test('cell 1: Electron Claude Cowork happy path dispatches correct URL + success toast', async ({
    page,
    api,
    workerServer,
  }) => {
    skipElectronCellsInCI();
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
    skipElectronCellsInCI();
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

    await expect
      .poll(async () => (await readCapturedHandoff(page)).spawnCursorCalls.length, {
        timeout: 5_000,
      })
      .toBe(1);
    const afterSpawn = await readCapturedHandoff(page);
    expect(afterSpawn.spawnCursorCalls[0]).toBe(resolvedContentDir(workerServer.contentDir));

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
    const textOnce = u.searchParams.get('text');
    expect(textOnce).toBeTruthy();
    expect(decodeURIComponent(textOnce as string)).toContain('Open Knowledge doc');

    await expect(page.getByText('Opened in Cursor.')).toBeVisible();

    expect(afterDispatch.openExternalCalls.length).toBe(1);
  });

  test('cell 3: Electron install-state flip — disabled → enabled via refresh after throttle window', async ({
    page,
    api,
    workerServer,
  }) => {
    skipElectronCellsInCI();
    const cfg: HandoffMockConfig = {
      host: 'electron',
      install: { claude: true, codex: false, cursor: true },
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    await openDropdown(page);
    const codexRow = page.getByTestId('open-in-agent-item-codex');
    await expect(codexRow).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('open-in-agent-menu')).toBeHidden();

    await advanceHandoffFakeTime(page, 11_000);
    await updateElectronInstallMap(page, { claude: true, codex: true, cursor: true });

    await openDropdown(page);
    await expect(codexRow).toBeVisible({ timeout: 5_000 });
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
    await waitForProbeSettled(page, 'web');
    await page.getByTestId('open-in-agent-item-claude-cowork').click();

    await expect
      .poll(async () => (await readCapturedHandoff(page)).anchorClicks.length, {
        timeout: 15_000,
      })
      .toBe(1);

    const captured = await readCapturedHandoff(page);
    const dispatched = captured.anchorClicks[0];
    const u = new URL(dispatched as string);
    expect(u.protocol).toBe('claude:');
    expect(u.hostname).toBe('cowork');
    expect(u.searchParams.get('folder')).toBe(resolvedContentDir(workerServer.contentDir));

    await expect(page.getByText('Opened in Claude Cowork.')).toBeVisible();

    expect(captured.openExternalCalls.length).toBe(0);
  });

  test('cell 5: Web Cursor row is HIDDEN (v1) regardless of server response', async ({
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
    await waitForProbeSettled(page, 'web');

    await expect(page.getByTestId('open-in-agent-item-cursor')).toHaveCount(0);

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

  test('cell 6: Web Claude not installed — top-level "Open in claude.ai →" row dispatches https://claude.ai/new (v1)', async ({
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

    await expect(page.getByTestId('open-in-agent-item-claude-cowork')).toHaveCount(0);
    await expect(page.getByTestId('open-in-agent-item-claude-code')).toHaveCount(0);
    await expect(page.getByTestId('open-in-agent-item-cursor')).toHaveCount(0);
    await expect(page.getByTestId('open-in-agent-item-codex')).toBeVisible();

    const fallback = page.getByTestId('open-in-agent-claude-web-fallback');
    await expect(fallback).toBeVisible();
    await fallback.click();

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

    await expect(page.getByText('Opened claude.ai in your browser.')).toBeVisible();
  });

  test('cell 7: Web empty-state — menu shows only the Claude web fallback row (v1-AC4)', async ({
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

    for (const id of ['claude-cowork', 'claude-code', 'codex', 'cursor']) {
      await expect(page.getByTestId(`open-in-agent-item-${id}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('open-in-agent-claude-web-fallback')).toBeVisible();

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
    skipElectronCellsInCI();
    const cfg: HandoffMockConfig = {
      host: 'electron',
      install: { claude: true, codex: true, cursor: true },
      spawnCursor: { ok: true }, // flipped below via updateSpawnCursorResult
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    await updateSpawnCursorResult(page, { ok: false, reason: 'not-installed' });

    await openDropdown(page);
    await page.getByTestId('open-in-agent-item-cursor').click();

    await expect
      .poll(async () => (await readCapturedHandoff(page)).spawnCursorCalls.length, {
        timeout: 5_000,
      })
      .toBe(1);

    await expect(page.getByText("Couldn't reach Cursor — try again?")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    const captured = await readCapturedHandoff(page);
    expect(captured.openExternalCalls).toEqual([]);

    expect(captured.recordHandoffCalls.length).toBe(1);
    const [line] = captured.recordHandoffCalls;
    expect(line?.target).toBe('cursor');
    expect(line?.host).toBe('electron');
    expect(line?.outcome).toBe('error');
    expect(line?.reason).toBe('not-installed');
  });
});
