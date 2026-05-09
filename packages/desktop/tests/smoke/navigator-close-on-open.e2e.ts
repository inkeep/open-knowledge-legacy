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

interface SeededHomeWithEditor {
  tmpHome: string;
  projectAPath: string;
  projectBPath: string;
}

function createProjectDir(prefix: string): string {
  const projectDir = mkdtempSync(join(tmpdir(), `ok-navigator-close-${prefix}-project-`));
  mkdirSync(join(projectDir, '.ok'), { recursive: true });
  writeFileSync(
    join(projectDir, '.ok', 'config.yml'),
    "content:\n  dir: '.'\n  include: ['**/*.md']\n  exclude: []\n",
  );
  return projectDir;
}

function seedHomeWithoutLastOpenedProject(prefix: string): SeededHome {
  const tmpHome = mkdtempSync(join(tmpdir(), `ok-navigator-close-${prefix}-`));
  const projectDir = createProjectDir(prefix);
  const userDataDir = join(tmpHome, 'Library', 'Application Support', DESKTOP_PRODUCT_NAME);
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(
    join(userDataDir, 'state.json'),
    JSON.stringify({
      recentProjects: [],
      lastOpenedProject: null,
      versionPendingInstall: null,
      lastSeenVersion: null,
      lastSuccessfulCheckAt: null,
      stuckHintShown: false,
    }),
  );
  return { tmpHome, projectDir };
}

function seedHomeWithLastOpenedProjectAndExtra(prefix: string): SeededHomeWithEditor {
  const tmpHome = mkdtempSync(join(tmpdir(), `ok-navigator-close-${prefix}-`));
  const projectAPath = createProjectDir(`${prefix}-A`);
  const projectBPath = createProjectDir(`${prefix}-B`);
  const userDataDir = join(tmpHome, 'Library', 'Application Support', DESKTOP_PRODUCT_NAME);
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(
    join(userDataDir, 'state.json'),
    JSON.stringify({
      recentProjects: [
        {
          path: projectAPath,
          name: 'Project A',
          lastOpenedAt: new Date().toISOString(),
        },
      ],
      lastOpenedProject: projectAPath,
      versionPendingInstall: null,
      lastSeenVersion: null,
      lastSuccessfulCheckAt: null,
      stuckHintShown: false,
    }),
  );
  return { tmpHome, projectAPath, projectBPath };
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

async function countWindowsByMode(
  app: ElectronApplication,
  mode: 'editor' | 'navigator',
): Promise<number> {
  let count = 0;
  for (const page of app.windows()) {
    const observed = await page
      .evaluate(() => window.okDesktop?.config?.mode)
      .catch(() => undefined);
    if (observed === mode) count++;
  }
  return count;
}

async function findFirstWindowByMode(
  app: ElectronApplication,
  mode: 'editor' | 'navigator',
): Promise<Page> {
  for (const page of app.windows()) {
    const observed = await page
      .evaluate(() => window.okDesktop?.config?.mode)
      .catch(() => undefined);
    if (observed === mode) return page;
  }
  throw new Error(`${mode} window vanished between poll resolution and read`);
}

async function closeAppSafely(app: ElectronApplication | null): Promise<void> {
  if (app === null) return;
  try {
    await app.close();
  } catch {}
}

test.describe('Project Navigator close-on-project-open smoke', () => {
  test.skip(!SMOKE_ENABLED, 'Set OK_DESKTOP_E2E_SMOKE=1 to run Electron smoke tests.');
  test.skip(!DARWIN, 'Smoke harness is darwin-only in v0.');
  test.skip(
    !BUILD_EXISTS,
    `Main build missing at ${MAIN_ENTRY} — run "bun run build:desktop" first.`,
  );

  test('Navigator boots first, closes once a project window resolves', async () => {
    const { tmpHome, projectDir } = seedHomeWithoutLastOpenedProject('happy');
    let app: ElectronApplication | null = null;
    try {
      app = await launchApp(tmpHome);

      await expect
        .poll(() => countWindowsByMode(app as ElectronApplication, 'navigator'), {
          timeout: 20_000,
          message: 'navigator window did not appear at cold boot',
        })
        .toBe(1);
      const navigator = await findFirstWindowByMode(app, 'navigator');

      expect(await countWindowsByMode(app, 'editor')).toBe(0);

      await navigator.evaluate(async (path) => {
        await window.okDesktop?.project.open({ path, target: 'new-window', entryPoint: 'recents' });
      }, projectDir);

      await expect
        .poll(() => countWindowsByMode(app as ElectronApplication, 'editor'), {
          timeout: 30_000,
          message: 'editor window did not appear after project.open()',
        })
        .toBe(1);

      await expect
        .poll(() => countWindowsByMode(app as ElectronApplication, 'navigator'), {
          timeout: 10_000,
          message: 'navigator window did not close after project window resolved',
        })
        .toBe(0);

      expect(await countWindowsByMode(app, 'editor')).toBe(1);
      expect(await countWindowsByMode(app, 'navigator')).toBe(0);
    } finally {
      await closeAppSafely(app);
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('Switch-Project flow: Editor A summons Navigator, picks Project B, both editors persist', async () => {
    const { tmpHome, projectAPath, projectBPath } = seedHomeWithLastOpenedProjectAndExtra('switch');
    let app: ElectronApplication | null = null;
    try {
      app = await launchApp(tmpHome);

      await expect
        .poll(() => countWindowsByMode(app as ElectronApplication, 'editor'), {
          timeout: 30_000,
          message: 'Editor A did not appear from lastOpenedProject',
        })
        .toBe(1);
      const editorA = await findFirstWindowByMode(app, 'editor');
      expect(await countWindowsByMode(app, 'navigator')).toBe(0);

      await editorA.evaluate(async () => {
        await window.okDesktop?.navigator.open();
      });
      await expect
        .poll(() => countWindowsByMode(app as ElectronApplication, 'navigator'), {
          timeout: 15_000,
          message: 'navigator window did not appear after bridge.navigator.open()',
        })
        .toBe(1);
      const navigator = await findFirstWindowByMode(app, 'navigator');

      await navigator.evaluate(async (path) => {
        await window.okDesktop?.project.open({ path, target: 'new-window', entryPoint: 'recents' });
      }, projectBPath);

      await expect
        .poll(() => countWindowsByMode(app as ElectronApplication, 'editor'), {
          timeout: 30_000,
          message: 'Editor B did not appear after Navigator picked Project B',
        })
        .toBe(2);

      await expect
        .poll(() => countWindowsByMode(app as ElectronApplication, 'navigator'), {
          timeout: 10_000,
          message: 'navigator window did not close after Project B opened',
        })
        .toBe(0);

      expect(editorA.isClosed()).toBe(false);
      expect(await countWindowsByMode(app, 'editor')).toBe(2);
    } finally {
      await closeAppSafely(app);
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(projectAPath, { recursive: true, force: true });
      rmSync(projectBPath, { recursive: true, force: true });
    }
  });

  test('Navigator stays visible when project open fails', async () => {
    const { tmpHome, projectDir } = seedHomeWithoutLastOpenedProject('failure');
    const bogusProjectPath = join(tmpHome, 'no-such-project');
    let app: ElectronApplication | null = null;
    try {
      app = await launchApp(tmpHome);

      await expect
        .poll(() => countWindowsByMode(app as ElectronApplication, 'navigator'), {
          timeout: 20_000,
          message: 'navigator window did not appear at cold boot',
        })
        .toBe(1);
      const navigator = await findFirstWindowByMode(app, 'navigator');

      await app.evaluate(({ dialog }) => {
        const wrapped = dialog as unknown as {
          __showErrorBoxCalls?: number;
          __lastErrorTitle?: string;
          showErrorBox: (t: string, c: string) => void;
        };
        wrapped.__showErrorBoxCalls = 0;
        wrapped.__lastErrorTitle = undefined;
        wrapped.showErrorBox = (title) => {
          wrapped.__showErrorBoxCalls = (wrapped.__showErrorBoxCalls ?? 0) + 1;
          wrapped.__lastErrorTitle = title;
        };
      });

      await navigator.evaluate(async (path) => {
        await window.okDesktop?.project.open({ path, target: 'new-window', entryPoint: 'recents' });
      }, bogusProjectPath);

      await expect
        .poll(() => countWindowsByMode(app as ElectronApplication, 'editor'), {
          timeout: 10_000,
          message: 'editor window appeared even though project.open() failed',
        })
        .toBe(0);
      expect(await countWindowsByMode(app, 'navigator')).toBe(1);

      const dialogState = await app.evaluate(({ dialog }) => {
        const wrapped = dialog as unknown as {
          __showErrorBoxCalls?: number;
          __lastErrorTitle?: string;
        };
        return {
          calls: wrapped.__showErrorBoxCalls ?? 0,
          title: wrapped.__lastErrorTitle,
        };
      });
      expect(dialogState.calls).toBeGreaterThan(0);
      expect(dialogState.title).toBe('Unable to open project');
    } finally {
      await closeAppSafely(app);
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
