/**
 * Per-worker Playwright fixture (Track A of the e2e-isolation migration).
 *
 * Replaces the previous single shared `webServer` block in
 * `playwright.config.ts` with a `{ scope: 'worker' }` fixture that spawns its
 * own `bun run dev` process on a kernel-allocated port + unique tmpdir per
 * worker. Eliminates cross-worker CPU contention on one shared Vite+Hocuspocus
 * instance (the residual flake class PR #206 mitigated but could not fully
 * eliminate).
 *
 * Architecture (research at `reports/e2e-isolation-and-broadcaster-lifecycle/`):
 *   - Primary precedent: React Router v7's `integration/playwright.config.ts`
 *     ships without a `webServer` entry; all server spawning lives in per-test
 *     fixtures using `get-port` + `cross-spawn` (no precedent for per-worker
 *     among Hocuspocus consumers — this migration is a new position).
 *   - Port allocation: kernel-assigned random port via `net.createServer(0)`
 *     (collision-free; matches the Tier 1 integration harness's
 *     `getFreePort()` primitive at `packages/app/tests/integration/test-harness.ts:62-70`).
 *   - Content dir: `mkdtempSync` keyed by `workerInfo.workerIndex` so each
 *     worker gets its own filesystem; pre-seeds `test-doc.md` +
 *     `sidebar-folder/nested-doc.md` which `reveal-on-activate.e2e.ts`
 *     depends on.
 *   - Ready detection: HTTP probe against `/` — more reliable than stdout
 *     regex parsing and consistent with the `waitForActiveProviderSynced`
 *     idiom.
 *
 * Fixtures exposed:
 *   - `workerServer` (worker-scoped): `{ port, baseURL, contentDir }` for the
 *     worker's dedicated dev server. Tests rarely consume this directly;
 *     prefer `baseURL` + `api` below.
 *   - `baseURL` (overrides Playwright built-in, test-scoped): worker's URL
 *     string. `page.goto('/foo')` automatically resolves against this.
 *   - `api` (test-scoped): seeding helpers `{ createPage, replaceDoc, seedDocs }`
 *     closed over the worker's baseURL. Replaces the previous free functions
 *     in `_helpers/editor-state.ts` that read `VITE_PORT` at call time.
 *
 * Usage in tests:
 *   ```ts
 *   import { expect, test } from './_helpers';
 *   test('foo', async ({ page, api }) => {
 *     await api.seedDocs([{ name: 'doc-a', markdown: '# A' }]);
 *     await page.goto('/#/doc-a');
 *     // ...
 *   });
 *   ```
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base } from '@playwright/test';

// Repo root — the fixture spawns `bun run dev` from `packages/app/`. ESM-only
// (`"type": "module"` per CLAUDE.md), so `__dirname` is unavailable; derive it
// from `import.meta.url` via `fileURLToPath` + `dirname`.
const HELPERS_DIR = dirname(fileURLToPath(import.meta.url));
const APP_PACKAGE_ROOT = resolve(HELPERS_DIR, '..', '..', '..');

export interface WorkerServer {
  /** Port the dev server is listening on. */
  port: number;
  /** `http://localhost:${port}` — convenience. */
  baseURL: string;
  /** Absolute path to the worker's test content directory. */
  contentDir: string;
}

export interface ApiHelpers {
  /**
   * Create an empty document at `path` (e.g. `"doc-a.md"` or `"nested/x.md"`).
   * Returns quietly on HTTP 409 (already exists) so tests can re-seed safely.
   */
  createPage(path: string): Promise<void>;
  /**
   * Replace a document's entire contents with `markdown` via
   * `/api/agent-write-md`. The `position: 'replace'` body key is the PR #185
   * contract — do NOT pass `mode: 'replace'` (silent fallback to append).
   */
  replaceDoc(docName: string, markdown: string): Promise<void>;
  /**
   * Reset a specific document (or all documents if `docName` omitted) via
   * `/api/test-reset`. Isolates per-test CRDT + persistence state without
   * tearing down the whole worker.
   */
  testReset(docName?: string): Promise<void>;
  /**
   * Reset the worker's server and seed N unique docs. Every test that needs
   * a clean workspace should call this first.
   */
  seedDocs(docs: Array<{ name: string; markdown: string }>): Promise<void>;
}

type WorkerFixtures = {
  workerServer: WorkerServer;
};

type TestFixtures = {
  api: ApiHelpers;
};

/**
 * Allocate a free TCP port via the OS. Mirrors the Tier 1 integration
 * harness's helper. Duplicated here to keep this harness self-contained
 * (no cross-dir imports from `tests/integration/`).
 */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

/**
 * Poll the dev server's `/` until it responds (200 OR 404 both indicate the
 * HTTP server is up and middleware chain is wired — Vite's SPA fallback may
 * return either depending on ready timing). Throws on timeout.
 */
async function waitForServerReady(baseURL: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseURL}/`, { signal: AbortSignal.timeout(1000) });
      // 200 (index.html) or 404 (unknown route) both prove the server is live.
      if (res.status === 200 || res.status === 404) return;
      lastErr = new Error(`unexpected status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Worker server at ${baseURL} did not become ready within ${timeoutMs}ms. Last error: ${String(lastErr)}`,
  );
}

/**
 * Pre-seed the per-worker content directory with files that specific tests
 * depend on at navigate time (not created via /api/create-page in-test).
 *
 * Currently required by:
 *   - `reveal-on-activate.e2e.ts` — depends on `test-doc.md` +
 *     `sidebar-folder/nested-doc.md` existing at sidebar-render time.
 *
 * If future tests add similar dependencies, extend this list. Prefer
 * seeding via `api.seedDocs()` inside the test instead whenever possible.
 */
function seedRequiredFixtureFiles(contentDir: string): void {
  writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
  mkdirSync(join(contentDir, 'sidebar-folder'), { recursive: true });
  writeFileSync(join(contentDir, 'sidebar-folder', 'nested-doc.md'), '', 'utf-8');
}

/**
 * Graceful kill: SIGTERM first, short wait, SIGKILL if still alive. Handles
 * Vite plugin shutdown ordering (server lock release runs in Vite's close
 * hook, which SIGTERM triggers; SIGKILL would skip it and leave a stale
 * lock).
 */
async function killGracefully(proc: ChildProcess, timeoutMs = 5000): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => {
    proc.once('exit', () => resolve());
  });
  proc.kill('SIGTERM');
  const timer = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([exited, timer]);
  if (proc.exitCode === null && proc.signalCode === null) {
    proc.kill('SIGKILL');
    await exited;
  }
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  workerServer: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object-destructuring pattern for the fixtures arg; this fixture has no dependencies so the destructure is empty by design.
    async ({}, use, workerInfo) => {
      const port = await getFreePort();
      const contentDir = mkdtempSync(join(tmpdir(), `ok-w${workerInfo.workerIndex}-`));
      seedRequiredFixtureFiles(contentDir);
      const baseURL = `http://localhost:${port}`;

      const proc = spawn('bun', ['run', 'dev'], {
        cwd: APP_PACKAGE_ROOT,
        env: {
          ...process.env,
          VITE_PORT: String(port),
          OK_TEST_CONTENT_DIR: contentDir,
          // Silence the default `bun run dev` banner noise; most of it is
          // duplicated across 4 workers and clutters CI logs.
          NO_COLOR: process.env.NO_COLOR ?? '1',
        },
        // Inherit stderr so unexpected plugin errors surface; pipe stdout to
        // avoid interleaved banner output across workers.
        stdio: ['ignore', 'pipe', 'inherit'],
      });

      proc.on('error', (err) => {
        console.error(`[fixture w${workerInfo.workerIndex}] spawn error:`, err);
      });

      try {
        await waitForServerReady(baseURL);
      } catch (err) {
        await killGracefully(proc);
        rmSync(contentDir, { recursive: true, force: true });
        throw err;
      }

      await use({ port, baseURL, contentDir });

      await killGracefully(proc);
      rmSync(contentDir, { recursive: true, force: true });
    },
    { scope: 'worker', timeout: 60_000 },
  ],

  // Override Playwright's built-in `baseURL` so `page.goto('/foo')` resolves
  // against this worker's server, not a globally-configured one.
  baseURL: async ({ workerServer }, use) => {
    await use(workerServer.baseURL);
  },

  api: async ({ workerServer }, use) => {
    const { baseURL } = workerServer;
    const helpers: ApiHelpers = {
      async createPage(path: string): Promise<void> {
        const res = await fetch(`${baseURL}/api/create-page`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        if (res.status === 409) return;
        if (!res.ok) {
          throw new Error(`create-page failed for ${path}: ${res.status}`);
        }
      },
      async replaceDoc(docName: string, markdown: string): Promise<void> {
        const res = await fetch(`${baseURL}/api/agent-write-md`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docName, markdown, position: 'replace' }),
        });
        if (!res.ok) {
          throw new Error(`agent-write-md failed for ${docName}: ${res.status}`);
        }
      },
      async testReset(docName?: string): Promise<void> {
        const url = docName
          ? `${baseURL}/api/test-reset?docName=${encodeURIComponent(docName)}`
          : `${baseURL}/api/test-reset`;
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) {
          throw new Error(`test-reset failed${docName ? ` for ${docName}` : ''}: ${res.status}`);
        }
      },
      async seedDocs(docs: Array<{ name: string; markdown: string }>): Promise<void> {
        await fetch(`${baseURL}/api/test-reset`, { method: 'POST' });
        for (const d of docs) await helpers.createPage(`${d.name}.md`);
        for (const d of docs) await helpers.replaceDoc(d.name, d.markdown);
      },
    };
    await use(helpers);
  },
});

export { expect } from '@playwright/test';
