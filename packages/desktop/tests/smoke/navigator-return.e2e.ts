/**
 * Project Navigator return-affordance smoke test — drives an Electron launch
 * with a `lastOpenedProject` so the editor window opens first (Navigator
 * window is NOT initially present), then triggers `bridge.navigator.open()`
 * from the editor renderer and asserts that the Navigator window appears.
 *
 * Coverage (one test per FR5 branch where the branches are observably distinct):
 *   1. Editor opens FIRST (lastOpenedProject path).
 *   2. FR5(c) — closed → create: `bridge.navigator.open()` spawns a navigator window.
 *   3. FR5(a)/(b) — count never exceeds 1 across re-invokes (poll-based, not
 *      a fixed sleep). FR5(a) and FR5(b) are not separately distinguishable
 *      from window-count alone, but the count-stability poll catches the
 *      regression class both branches are intended to prevent (duplicate spawn).
 *   4. FR5(d) — closing the navigator leaves the editor window alive.
 *
 * The test calls `bridge.navigator.open()` directly via `page.evaluate(...)`
 * rather than clicking the dropdown trigger — exercising the IPC contract is
 * the goal here; full DOM-driven affordance coverage (dropdown click,
 * CommandPalette `Cmd+K` keystroke) belongs to component-level Playwright
 * runs that also need the `bun run dev` server, not the smoke harness.
 *
 * Skip gates mirror `deep-link.e2e.ts` and `mcp-wiring.e2e.ts`:
 *   - `OK_DESKTOP_E2E_SMOKE !== '1'` — opt-in so `bunx playwright test` on
 *     the whole repo doesn't try to launch Electron in headless CI.
 *   - `process.platform !== 'darwin'` — the smoke harness is darwin-only in
 *     v0; the IPC plumbing is platform-agnostic and remains exercised by the
 *     Bun unit/integration tests on every platform.
 *   - `out/main/index.js` missing — `bun run build:desktop` must have run.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElectronApplication, Page } from '@playwright/test';
import { _electron as electron, expect, test } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = resolve(__dirname, '..', '..', 'out', 'main', 'index.js');

const SMOKE_ENABLED = process.env.OK_DESKTOP_E2E_SMOKE === '1';
const DARWIN = process.platform === 'darwin';
const BUILD_EXISTS = existsSync(MAIN_ENTRY);

const DESKTOP_PRODUCT_NAME = 'Open Knowledge';

interface SeededHome {
  tmpHome: string;
  projectDir: string;
}

function seedHomeWithLastOpenedProject(prefix: string): SeededHome {
  const tmpHome = mkdtempSync(join(tmpdir(), `ok-navigator-return-${prefix}-`));
  const projectDir = mkdtempSync(join(tmpdir(), `ok-navigator-return-${prefix}-project-`));
  mkdirSync(join(projectDir, '.ok'), { recursive: true });
  writeFileSync(
    join(projectDir, '.ok', 'config.yml'),
    "content:\n  dir: '.'\n  include: ['**/*.md']\n  exclude: []\n",
  );
  const userDataDir = join(tmpHome, 'Library', 'Application Support', DESKTOP_PRODUCT_NAME);
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(
    join(userDataDir, 'state.json'),
    JSON.stringify({
      recentProjects: [
        {
          path: projectDir,
          name: 'Navigator Return Smoke',
          lastOpenedAt: new Date().toISOString(),
        },
      ],
      lastOpenedProject: projectDir,
      versionPendingInstall: null,
      lastSeenVersion: null,
      lastSuccessfulCheckAt: null,
      stuckHintShown: false,
    }),
  );
  return { tmpHome, projectDir };
}

async function launchApp(tmpHome: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [MAIN_ENTRY],
    timeout: 30_000,
    env: {
      ...process.env,
      HOME: tmpHome,
      OK_DESKTOP_E2E_SMOKE: '1',
    },
  });
}

async function findEditorWindow(app: ElectronApplication, timeoutMs = 20_000): Promise<Page> {
  return await expect
    .poll(
      async () => {
        for (const page of app.windows()) {
          const mode = await page
            .evaluate(() => window.okDesktop?.config?.mode)
            .catch(() => undefined);
          if (mode === 'editor') return page;
        }
        return null;
      },
      {
        timeout: timeoutMs,
        message: 'editor window did not appear within timeout',
      },
    )
    .not.toBeNull()
    .then(async () => {
      for (const page of app.windows()) {
        const mode = await page
          .evaluate(() => window.okDesktop?.config?.mode)
          .catch(() => undefined);
        if (mode === 'editor') return page;
      }
      throw new Error('editor window vanished between poll resolution and read');
    });
}

async function countNavigatorWindows(app: ElectronApplication): Promise<number> {
  let count = 0;
  for (const page of app.windows()) {
    const mode = await page.evaluate(() => window.okDesktop?.config?.mode).catch(() => undefined);
    if (mode === 'navigator') count++;
  }
  return count;
}

async function countEditorWindows(app: ElectronApplication): Promise<number> {
  let count = 0;
  for (const page of app.windows()) {
    const mode = await page.evaluate(() => window.okDesktop?.config?.mode).catch(() => undefined);
    if (mode === 'editor') count++;
  }
  return count;
}

async function findNavigatorWindow(app: ElectronApplication, timeoutMs = 15_000): Promise<Page> {
  await expect
    .poll(() => countNavigatorWindows(app), {
      timeout: timeoutMs,
      message: 'navigator window did not appear within timeout',
    })
    .toBe(1);
  for (const page of app.windows()) {
    const mode = await page.evaluate(() => window.okDesktop?.config?.mode).catch(() => undefined);
    if (mode === 'navigator') return page;
  }
  throw new Error('navigator window vanished between poll resolution and read');
}

async function closeAppSafely(app: ElectronApplication | null): Promise<void> {
  if (app === null) return;
  try {
    await app.close();
  } catch {}
}

test.describe('Project Navigator return-affordance smoke', () => {
  test.skip(!SMOKE_ENABLED, 'Set OK_DESKTOP_E2E_SMOKE=1 to run Electron smoke tests.');
  test.skip(!DARWIN, 'Smoke harness is darwin-only in v0.');
  test.skip(
    !BUILD_EXISTS,
    `Main build missing at ${MAIN_ENTRY} — run "bun run build:desktop" first.`,
  );

  test('bridge.navigator.open() opens navigator from editor; re-invokes never spawn a duplicate', async () => {
    const { tmpHome, projectDir } = seedHomeWithLastOpenedProject('happy');
    let app: ElectronApplication | null = null;
    try {
      app = await launchApp(tmpHome);

      const editor = await findEditorWindow(app);
      await expect.poll(() => countNavigatorWindows(app as ElectronApplication)).toBe(0);

      await editor.evaluate(async () => {
        await window.okDesktop?.navigator.open();
      });

      await expect
        .poll(() => countNavigatorWindows(app as ElectronApplication), {
          timeout: 15_000,
          message: 'navigator window did not appear after bridge.navigator.open()',
        })
        .toBe(1);

      await editor.evaluate(async () => {
        await window.okDesktop?.navigator.open();
      });
      await editor.evaluate(async () => {
        await window.okDesktop?.navigator.open();
      });
      await expect
        .poll(() => countNavigatorWindows(app as ElectronApplication), {
          timeout: 2_000,
          intervals: [50, 100, 200, 400],
          message: 'navigator window count exceeded 1 across re-invokes',
        })
        .toBe(1);
    } finally {
      await closeAppSafely(app);
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('FR5(d) — closing the navigator window leaves the editor window alive', async () => {
    const { tmpHome, projectDir } = seedHomeWithLastOpenedProject('close');
    let app: ElectronApplication | null = null;
    try {
      app = await launchApp(tmpHome);

      const editor = await findEditorWindow(app);
      await expect.poll(() => countEditorWindows(app as ElectronApplication)).toBe(1);

      await editor.evaluate(async () => {
        await window.okDesktop?.navigator.open();
      });
      const navigatorPage = await findNavigatorWindow(app);

      await navigatorPage.close();

      await expect
        .poll(() => countNavigatorWindows(app as ElectronApplication), {
          timeout: 5_000,
          message: 'navigator window did not close',
        })
        .toBe(0);

      await expect
        .poll(() => countEditorWindows(app as ElectronApplication), {
          timeout: 2_000,
          message: 'editor window disappeared when navigator closed',
        })
        .toBe(1);
      const stillEditorMode = await editor
        .evaluate(() => window.okDesktop?.config?.mode)
        .catch(() => null);
      expect(stillEditorMode).toBe('editor');
    } finally {
      await closeAppSafely(app);
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
