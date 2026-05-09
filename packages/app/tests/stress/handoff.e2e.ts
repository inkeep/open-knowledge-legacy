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

  test('cell 5: Web Cursor two-step happy path → POST /api/spawn-cursor + cursor:// dispatch', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'web',
      install: { claude: true, codex: true, cursor: true },
      spawnCursor: { ok: true },
      workerBaseURL: workerServer.baseURL,
      workerContentDir: resolvedContentDir(workerServer.contentDir),
    };
    await installHandoffMocks(page, cfg);
    await seedAndNavigate(page, api);

    await openDropdown(page);
    await waitForProbeSettled(page, 'web');

    await page.getByTestId('open-in-agent-item-cursor').click();

    await expect
      .poll(async () => (await readCapturedHandoff(page)).spawnCursorCalls.length, {
        timeout: 5_000,
      })
      .toBe(1);
    const afterSpawn = await readCapturedHandoff(page);
    expect(afterSpawn.spawnCursorCalls[0]).toBe(resolvedContentDir(workerServer.contentDir));

    await expect
      .poll(async () => (await readCapturedHandoff(page)).anchorClicks.length, {
        timeout: 5_000,
      })
      .toBe(1);
    const afterDispatch = await readCapturedHandoff(page);
    const cursorUrl = afterDispatch.anchorClicks[0];
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

    expect(afterDispatch.openExternalCalls.length).toBe(0);
  });

  test('cell 6: Web Claude not installed — top-level "Open in claude.ai →" row dispatches https://claude.ai/new (v1)', async ({
    page,
    api,
    workerServer,
  }) => {
    const cfg: HandoffMockConfig = {
      host: 'web',
      install: { claude: false, codex: true, cursor: false },
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
