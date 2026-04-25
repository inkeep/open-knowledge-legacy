/**
 * Project Navigator return-affordance smoke test — drives an Electron launch
 * with a `lastOpenedProject` so the editor window opens first (Navigator
 * window is NOT initially present), then triggers `bridge.navigator.open()`
 * from the editor renderer and asserts that the Navigator window appears.
 *
 * Coverage:
 *   1. Editor opens FIRST (lastOpenedProject path).
 *   2. After invoking `bridge.navigator.open()`, a window with mode=navigator
 *      appears in `app.windows()`.
 *   3. Re-invoking the bridge while the navigator is already open does NOT
 *      spawn a duplicate (focus-or-create idempotency from `openNavigator()`).
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

const DESKTOP_PRODUCT_NAME = '@inkeep/open-knowledge-desktop';

interface SeededHome {
  tmpHome: string;
  projectDir: string;
}

function seedHomeWithLastOpenedProject(prefix: string): SeededHome {
  const tmpHome = mkdtempSync(join(tmpdir(), `ok-navigator-return-${prefix}-`));
  const projectDir = mkdtempSync(join(tmpdir(), `ok-navigator-return-${prefix}-project-`));
  mkdirSync(join(projectDir, '.open-knowledge'), { recursive: true });
  writeFileSync(
    join(projectDir, '.open-knowledge', 'config.yml'),
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

async function closeAppSafely(app: ElectronApplication | null): Promise<void> {
  if (app === null) return;
  try {
    await app.close();
  } catch {
    // best-effort
  }
}

test.describe('Project Navigator return-affordance smoke', () => {
  test.skip(!SMOKE_ENABLED, 'Set OK_DESKTOP_E2E_SMOKE=1 to run Electron smoke tests.');
  test.skip(!DARWIN, 'Smoke harness is darwin-only in v0.');
  test.skip(
    !BUILD_EXISTS,
    `Main build missing at ${MAIN_ENTRY} — run "bun run build:desktop" first.`,
  );

  test('bridge.navigator.open() opens navigator from editor; second invoke is idempotent', async () => {
    const { tmpHome, projectDir } = seedHomeWithLastOpenedProject('happy');
    let app: ElectronApplication | null = null;
    try {
      app = await launchApp(tmpHome);

      const editor = await findEditorWindow(app);
      // Editor should be the only window initially — Navigator did NOT spawn
      // because lastOpenedProject was set.
      await expect.poll(() => countNavigatorWindows(app as ElectronApplication)).toBe(0);

      // Invoke the bridge IPC and assert the Navigator window appears.
      await editor.evaluate(async () => {
        await window.okDesktop?.navigator.open();
      });

      await expect
        .poll(() => countNavigatorWindows(app as ElectronApplication), {
          timeout: 15_000,
          message: 'navigator window did not appear after bridge.navigator.open()',
        })
        .toBe(1);

      // Re-invoke; focus-or-create must NOT spawn a second navigator window.
      await editor.evaluate(async () => {
        await window.okDesktop?.navigator.open();
      });
      // Give Electron a beat to settle any window state updates.
      await editor.waitForTimeout(1_000);
      await expect.poll(() => countNavigatorWindows(app as ElectronApplication)).toBe(1);
    } finally {
      await closeAppSafely(app);
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
