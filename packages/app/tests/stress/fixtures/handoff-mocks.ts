import type { Page } from '@playwright/test';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

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

function spawnCursorResultToWire(result: SpawnCursorResult): {
  status: number;
  contentType: string;
  body: string;
} {
  if (result.ok) {
    return { status: 200, contentType: 'application/json', body: JSON.stringify({}) };
  }
  const map: Record<
    'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error',
    { status: number; type: string; title: string }
  > = {
    'invalid-path': {
      status: 403,
      type: 'urn:ok:error:path-escape',
      title: 'Path escapes the content directory.',
    },
    'not-installed': {
      status: 422,
      type: 'urn:ok:error:cursor-not-installed',
      title: 'Cursor CLI not found on this machine.',
    },
    timeout: {
      status: 504,
      type: 'urn:ok:error:cursor-spawn-timeout',
      title: 'Cursor spawn exceeded the deadline.',
    },
    'spawn-error': {
      status: 502,
      type: 'urn:ok:error:cursor-spawn-failed',
      title: 'Cursor spawn failed.',
    },
  };
  const entry = map[result.reason];
  return {
    status: entry.status,
    contentType: 'application/problem+json',
    body: JSON.stringify({ type: entry.type, title: entry.title, status: entry.status }),
  };
}

export interface HandoffMockConfig {
  readonly host: 'electron' | 'web';
  readonly install: InstallMap;
  readonly spawnCursor?: SpawnCursorResult;
  /** Worker's baseURL — passed so the mock bridge's `collabUrl` / `apiOrigin`
   *  point at the real Vite+Hocuspocus instance for this worker. */
  readonly workerBaseURL: string;
  /** Worker's content dir — passed so the mock bridge's `projectPath`
   *  matches the on-disk content dir and `useWorkspace()` resolves cleanly. */
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
    await page.route('**/api/spawn-cursor', async (route) => {
      const result = cfg.spawnCursor ?? { ok: true };
      const wire = spawnCursorResultToWire(result);
      await route.fulfill({
        status: wire.status,
        contentType: wire.contentType,
        body: wire.body,
      });
    });
    await page.route('**/api/install-skill', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'skip-current',
          skillVersion: '0.0.0-test-fixture',
          recordedAt: '2026-01-01T00:00:00.000Z',
        }),
      });
    });
  }

  await page.route('**/api/skill/install-state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        currentVersion: '0.0.0-test-fixture',
        targets: {
          'claude-cowork': {
            version: '0.0.0-test-fixture',
            recordedAt: '2026-01-01T00:00:00.000Z',
          },
          'cli-hosts': null,
        },
      }),
    });
  });

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
      /** Web-host only: set once `/api/installed-agents` fetch resolves so
       *  tests can poll for the probe having landed. */
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
    // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
    (window as any).__handoffMocks__ = mocks;

    const originalFetch = window.fetch.bind(window);
    const wrappedFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      try {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
        if (url.includes('/api/spawn-cursor')) {
          let path = '';
          if (init?.body && typeof init.body === 'string') {
            try {
              const parsed = JSON.parse(init.body) as { path?: string };
              path = parsed.path ?? '';
            } catch {}
          }
          mocks.spawnCursorCalls.push(path);
        }
      } catch {}
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
      } catch {}
      return res;
    };
    window.fetch = wrappedFetch as unknown as typeof window.fetch;

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
      } catch {}
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
        openAsset: async (): Promise<{ ok: true }> => ({ ok: true }),
        revealAsset: async (): Promise<{ ok: true }> => ({ ok: true }),
        showAssetMenu: async (): Promise<void> => {},
        showItemInFolder: async (): Promise<void> => {},
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
        onUpdateDownloaded: () => () => {},
        onWhatsNew: () => () => {},
        onUpdateStuckHint: () => () => {},
        onUpdateDowngradeWarning: () => () => {},
        onChannelChanged: () => () => {},
        onDeepLink: () => () => {},
        setThemeSource: async (): Promise<{ ok: true }> => ({ ok: true }),
        signalThemeApplied: (): void => {},
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
          getSessionState: async () => ({
            openTabs: [],
            activeDocName: null,
            activeTabId: null,
            updatedAt: null,
          }),
          setSessionState: async () => {},
          open: async () => {},
          close: async () => {},
        },
        navigator: {
          open: async () => {},
        },
        seed: {
          plan: async () => ({ ok: false, error: { kind: 'no-project', message: 'test mock' } }),
          apply: async () => ({ ok: false, error: { kind: 'no-project', message: 'test mock' } }),
          listPacks: async () => ({ ok: true, packs: [] }),
        },
        skill: {
          detectClaudeDesktop: async () => false,
          buildAndOpen: async () => ({ ok: false, reason: 'build-failed', message: 'test mock' }),
        },
        update: {
          relaunchNow: async () => {},
          setChannel: async () => {},
          confirmDowngrade: async () => {},
          checkNow: async () => {},
        },
        state: {
          query: async () => ({
            channel: 'latest' as const,
            schemaIncompatibility: null,
          }),
          resetIncompatible: async () => {},
        },
        mcpWiring: {
          onShow: () => () => {},
          signalReady: () => {},
          confirm: async () => ({ ok: true }),
          skip: async () => ({ ok: true }),
        },
        onboarding: {
          onShow: () => () => {},
          signalReady: () => {},
          confirm: async () => ({ ok: true }),
          cancel: async () => ({ ok: true }),
          probeContent: async () => ({
            ok: true as const,
            count: 0,
            sample: [],
            truncated: false,
          }),
          onToast: () => () => {},
        },
        localOp: {
          auth: {
            start: () => ({
              events: (async function* () {})(),
              cancel: () => {},
            }),
          },
          clone: {
            start: () => ({
              events: (async function* () {})(),
              cancel: () => {},
            }),
          },
          authStatus: async () => ({ authenticated: false as const, host: 'github.com' }),
          authRepos: async () => ({ ok: true as const, host: 'github.com', repos: [] }),
        },
        platform: 'darwin' as const,
        appVersion: 'test-0.0.0',
      } satisfies OkDesktopBridge;

      // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
      (window as any).okDesktop = bridge;
    }

    try {
      // biome-ignore lint/suspicious/noExplicitAny: matches production resolution in cowork-skill-install.ts.
      const ver = (window as any).okDesktop?.appVersion ?? 'unknown';
      window.localStorage.setItem(`ok:skill:cowork:installed:v${ver}`, '1');
    } catch {}
  }, cfg);
}

export async function readCapturedHandoff(page: Page): Promise<CapturedHandoff> {
  return await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
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
    // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
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
    // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
    const mocks = (window as any).__handoffMocks__;
    mocks.fakeTimeOffset += delta;
  }, ms);
}

export async function updateSpawnCursorResult(
  page: Page,
  result: SpawnCursorResult,
): Promise<void> {
  await page.evaluate((next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
    const mocks = (window as any).__handoffMocks__;
    mocks.spawnCursorResult = next;
  }, result);
}
