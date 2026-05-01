
import type { OkDesktopBridge } from '@inkeep/open-knowledge-core';
import type { Page } from '@playwright/test';

export interface InstallMap {
  readonly claude: boolean;
  readonly codex: boolean;
  readonly cursor: boolean;
}

export type SpawnCursorResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error';
    };

export interface HandoffMockConfig {
  readonly host: 'electron' | 'web';
  readonly install: InstallMap;
  readonly spawnCursor?: SpawnCursorResult;
  readonly workerBaseURL: string;
  readonly workerContentDir: string;
}

export interface CapturedHandoff {
  readonly anchorClicks: ReadonlyArray<string>;
  readonly openExternalCalls: ReadonlyArray<string>;
  readonly detectProtocolCalls: ReadonlyArray<string>;
  readonly spawnCursorCalls: ReadonlyArray<string>;
  readonly recordHandoffCalls: ReadonlyArray<Record<string, unknown>>;
}

export async function installHandoffMocks(page: Page, cfg: HandoffMockConfig): Promise<void> {
  if (cfg.host === 'web') {
    await page.route('**/api/installed-agents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(cfg.install),
      });
    });
  }

  await page.addInitScript((args) => {
    const { host, install, spawnCursor, workerBaseURL, workerContentDir } =
      args as HandoffMockConfig;

    interface HandoffMocksState {
      anchorClicks: string[];
      openExternalCalls: string[];
      detectProtocolCalls: string[];
      spawnCursorCalls: string[];
      recordHandoffCalls: Record<string, unknown>[];
      install: { claude: boolean; codex: boolean; cursor: boolean };
      spawnCursorResult:
        | { ok: true }
        | {
            ok: false;
            reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error';
          };
      fakeTimeOffset: number;
      installedAgentsFetchResolved: boolean;
    }
    const mocks: HandoffMocksState = {
      anchorClicks: [],
      openExternalCalls: [],
      detectProtocolCalls: [],
      spawnCursorCalls: [],
      recordHandoffCalls: [],
      install: { ...install },
      spawnCursorResult: spawnCursor ?? { ok: true },
      fakeTimeOffset: 0,
      installedAgentsFetchResolved: false,
    };
    (window as any).__handoffMocks__ = mocks;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const res = await originalFetch(input, init);
      try {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
        if (url.includes('/api/installed-agents')) {
          mocks.installedAgentsFetchResolved = true;
        }
      } catch {
      }
      return res;
    };

    const HANDOFF_SCHEMES = new Set(['claude:', 'codex:', 'cursor:']);
    const HANDOFF_HOSTS = new Set(['claude.ai']);
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      try {
        const u = new URL(this.href);
        if (HANDOFF_SCHEMES.has(u.protocol) || HANDOFF_HOSTS.has(u.hostname)) {
          mocks.anchorClicks.push(this.href);
          return;
        }
      } catch {
      }
      return originalAnchorClick.call(this);
    };

    const realDateNow = Date.now.bind(Date);
    Date.now = () => realDateNow() + mocks.fakeTimeOffset;

    if (host === 'electron') {
      const shellStub = {
        openExternal: async (url: string): Promise<void> => {
          mocks.openExternalCalls.push(url);
        },
        detectProtocol: async (
          scheme: string,
        ): Promise<{ installed: boolean; displayName?: string }> => {
          mocks.detectProtocolCalls.push(scheme);
          const key = scheme.replace(':', '') as keyof InstallMap;
          const installed = mocks.install[key] ?? false;
          return installed
            ? { installed: true, displayName: `${scheme.replace(':', '')}-mock` }
            : { installed: false };
        },
        spawnCursor: async (
          path: string,
        ): Promise<
          | { ok: true }
          | {
              ok: false;
              reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error';
            }
        > => {
          mocks.spawnCursorCalls.push(path);
          return mocks.spawnCursorResult;
        },
        recordHandoff: async (line: Record<string, unknown>): Promise<void> => {
          mocks.recordHandoffCalls.push(line);
        },
      };

      const bridge = {
        config: {
          collabUrl: `${workerBaseURL.replace(/^http/, 'ws')}/collab`,
          apiOrigin: workerBaseURL,
          projectPath: workerContentDir,
          projectName: 'handoff-e2e-fixture',
          mode: 'editor' as const,
        },
        onProjectSwitched: () => () => {},
        onMenuAction: () => () => {},
        onGitInitNotice: () => () => {},
        onUpdateDownloaded: () => () => {},
        onWhatsNew: () => () => {},
        onUpdateStuckHint: () => () => {},
        onDeepLink: () => () => {},
        dialog: {
          openFolder: async () => null,
          createFolder: async () => null,
        },
        shell: shellStub,
        clipboard: {
          writeText: async () => {},
        },
        project: {
          listRecent: async () => [],
          open: async () => {},
          close: async () => {},
        },
        navigator: {
          open: async () => {},
        },
        seed: {
          plan: async () => ({ ok: false, error: { kind: 'no-project', message: 'test mock' } }),
          apply: async () => ({ ok: false, error: { kind: 'no-project', message: 'test mock' } }),
        },
        skill: {
          detectClaudeDesktop: async () => false,
          buildAndOpen: async () => ({ ok: false, reason: 'build-failed', message: 'test mock' }),
        },
        update: {
          relaunchNow: async () => {},
        },
        mcpWiring: {
          onShow: () => () => {},
          signalReady: () => {},
          confirm: async () => ({ ok: true }),
          skip: async () => ({ ok: true }),
        },
        platform: 'darwin' as const,
        appVersion: 'test-0.0.0',
      } satisfies OkDesktopBridge;

      (window as any).okDesktop = bridge;
    }

    try {
      const ver = (window as any).okDesktop?.appVersion ?? 'unknown';
      window.localStorage.setItem(`ok:skill:cowork:installed:v${ver}`, '1');
    } catch {
    }
  }, cfg);
}

export async function readCapturedHandoff(page: Page): Promise<CapturedHandoff> {
  return await page.evaluate(() => {
    const mocks = (window as any).__handoffMocks__ as {
      anchorClicks: string[];
      openExternalCalls: string[];
      detectProtocolCalls: string[];
      spawnCursorCalls: string[];
      recordHandoffCalls: Record<string, unknown>[];
    };
    return {
      anchorClicks: [...mocks.anchorClicks],
      openExternalCalls: [...mocks.openExternalCalls],
      detectProtocolCalls: [...mocks.detectProtocolCalls],
      spawnCursorCalls: [...mocks.spawnCursorCalls],
      recordHandoffCalls: mocks.recordHandoffCalls.map((l) => ({ ...l })),
    };
  });
}

export async function updateElectronInstallMap(page: Page, install: InstallMap): Promise<void> {
  await page.evaluate((next) => {
    const mocks = (window as any).__handoffMocks__;
    mocks.install = { ...next };
  }, install);
}

export async function updateWebInstallMap(page: Page, install: InstallMap): Promise<void> {
  await page.unroute('**/api/installed-agents');
  await page.route('**/api/installed-agents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(install),
    });
  });
}

export async function advanceHandoffFakeTime(page: Page, ms: number): Promise<void> {
  await page.evaluate((delta) => {
    const mocks = (window as any).__handoffMocks__;
    mocks.fakeTimeOffset += delta;
  }, ms);
}

export async function updateSpawnCursorResult(
  page: Page,
  result: SpawnCursorResult,
): Promise<void> {
  await page.evaluate((next) => {
    const mocks = (window as any).__handoffMocks__;
    mocks.spawnCursorResult = next;
  }, result);
}
