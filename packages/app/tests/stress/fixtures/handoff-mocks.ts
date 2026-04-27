/**
 * Playwright fixture helpers for the `handoff.e2e.ts` matrix (US-013).
 *
 * Goal: drive the Open-in-Agent dispatch flow across 8 cells per SPEC §13.3
 * without dependencies on what Claude / Codex / Cursor is actually installed
 * on the CI runner, and without triggering real cross-app URL dispatch.
 *
 * Two host modes:
 *   - `host: 'electron'` — installs a mock `window.okDesktop` bridge via
 *     `page.addInitScript`. Every shell method is a capturing stub. The
 *     initial probe + on-open refresh both consult `shell.detectProtocol`
 *     which reads from the injected mock state.
 *   - `host: 'web'` — leaves `window.okDesktop` undefined so the app falls
 *     through to the web path. `GET /api/installed-agents` is intercepted
 *     via `page.route` and served from the injected mock state.
 *
 * Anchor-click capture (both hosts):
 *   Handoff URL dispatch on web host uses a short-lived `<a href=... click>`
 *   pattern (per TQ7 LOCKED in the spec). Without interception, Chromium
 *   would either navigate away (for `https://claude.ai/...`) or hit a
 *   protocol-handler dialog (for `claude://`, `codex://`, `cursor://`). This
 *   file patches `HTMLAnchorElement.prototype.click` to capture clicks on
 *   anchors whose href matches a known handoff scheme / host, record the
 *   URL into `window.__handoffMocks__.anchorClicks`, and swallow the click.
 *   All other anchor clicks (sidebar nav, install-affordance `<button>`s in
 *   tooltips when dispatched via Electron) fall through unchanged.
 *
 * Time control:
 *   The install-detect coordinator throttles `refresh()` to once per 10s per
 *   scheme. For cell 3 (install-state flip) the test must advance past the
 *   throttle window without stalling the run for 10s wall-time. The init
 *   script patches `Date.now` only (not `setTimeout` / `setInterval`) so
 *   WebSocket heartbeats + sonner toast lifecycles keep running on real
 *   time while the handoff hook's lastProbedAt check sees future-time on
 *   `advanceHandoffFakeTime(ms)`.
 */

import type { OkDesktopBridge } from '@inkeep/open-knowledge-core';
import type { Page } from '@playwright/test';

export interface InstallMap {
  /** Single `claude:` scheme covers both Claude Cowork + Claude Code rows. */
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
  /** Electron-only; ignored on web host. Defaults to `{ok:true}`. */
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

/**
 * Install the handoff mock harness onto the page.
 *
 * Call BEFORE `page.goto(...)` — `page.addInitScript` takes effect on the
 * next document load, and `page.route` must be installed before the
 * `/api/installed-agents` fetch fires (which happens on app mount when
 * `useInstalledAgents` boots).
 */
export async function installHandoffMocks(page: Page, cfg: HandoffMockConfig): Promise<void> {
  // Web-host install-detect path: intercept the HTTP probe before it hits
  // the real server. Route handlers persist for the page's lifetime; the
  // later `updateWebInstallMap` helper re-registers on top.
  if (cfg.host === 'web') {
    await page.route('**/api/installed-agents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(cfg.install),
      });
    });
  }

  // Init script: runs before ANY page script on every document load.
  // Plants the capture object + anchor-click interceptor + (Electron only)
  // the window.okDesktop bridge.
  await page.addInitScript((args) => {
    const { host, install, spawnCursor, workerBaseURL, workerContentDir } =
      args as HandoffMockConfig;

    // ---- Capture scaffold ----
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

    // ---- Fetch instrumentation for probe-settled detection (web host) ----
    // The install-detect coordinator's `probeViaFetch` strategy calls
    // `fetch('/api/installed-agents')`. Wrap window.fetch so we set a flag
    // when the response resolves — tests poll this instead of racing the
    // React state update. No-op for Electron cells (detectProtocol is the
    // probe strategy there, captured via detectProtocolCalls directly).
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
        // Defensive — never let instrumentation corrupt the real fetch.
      }
      return res;
    };

    // ---- Anchor-click interceptor (both hosts) ----
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
        // Invalid URL — fall through to real click.
      }
      return originalAnchorClick.call(this);
    };

    // ---- Date.now patching for throttle bypass (install-state-flip cell) ----
    // ONLY patch Date.now — NOT setTimeout / setInterval — so real wall-clock
    // timers (WebSocket heartbeats, sonner lifecycles, React scheduler) keep
    // running. The install-detect coordinator reads `deps.now` (bound to
    // Date.now); patching here lets us advance its view of time without
    // stalling the test for 10 real seconds.
    const realDateNow = Date.now.bind(Date);
    Date.now = () => realDateNow() + mocks.fakeTimeOffset;

    // ---- Electron-host bridge injection ----
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

      // Typed with `satisfies OkDesktopBridge` so drift between the canonical
      // bridge interface (packages/core/src/desktop-bridge.ts) and this
      // fixture surfaces at compile time rather than silently leaving a
      // handoff test cell green after a bridge-member addition (Review
      // Minor #5). `satisfies` preserves the literal shape + flags missing
      // required fields. The `addInitScript` callback body is stringified at
      // runtime but type-checked at module compile time; imported types are
      // erased at runtime so there's no serialization burden.
      const bridge = {
        config: {
          // Hocuspocus is mounted at /collab by the Vite plugin (see
          // packages/app/src/server/hocuspocus-plugin.ts line 269). Passing
          // just `ws://host:port` without the path makes the WebSocket upgrade
          // request hit Vite's HMR handler instead of Hocuspocus, and the
          // provider never reports synced.
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

      // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
      (window as any).okDesktop = bridge;
    }
  }, cfg);
}

/** Read all captured calls. */
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

/**
 * Swap the Electron-host install map mid-test. After calling, the next
 * `shell.detectProtocol(scheme)` returns the new value. Pair with
 * `advanceHandoffFakeTime(11_000)` to bypass the 10s throttle so the
 * next `refresh()` actually probes.
 */
export async function updateElectronInstallMap(page: Page, install: InstallMap): Promise<void> {
  await page.evaluate((next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
    const mocks = (window as any).__handoffMocks__;
    mocks.install = { ...next };
  }, install);
}

/**
 * Swap the web-host install response. Re-registers the page.route handler
 * so subsequent GET /api/installed-agents fetches see the new value.
 * Pair with `advanceHandoffFakeTime(11_000)` as above.
 */
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

/**
 * Advance the page's `Date.now()` view by `ms` milliseconds. Only affects
 * `Date.now` (the install-detect coordinator's throttle check reads this).
 * Real `setTimeout` / `setInterval` fire on wall-clock time.
 */
export async function advanceHandoffFakeTime(page: Page, ms: number): Promise<void> {
  await page.evaluate((delta) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global attachment.
    const mocks = (window as any).__handoffMocks__;
    mocks.fakeTimeOffset += delta;
  }, ms);
}

/**
 * Swap the Electron-host `spawnCursor` response mid-test. Used by cell 8
 * to flip a previously-configured `{ok:true}` to `{ok:false, reason:...}`
 * without reloading the page.
 */
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
