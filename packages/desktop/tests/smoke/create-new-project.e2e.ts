import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import { expect, test } from './_helpers/smoke-test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = resolve(__dirname, '..', '..', 'out', 'main', 'index.js');

const SMOKE_ENABLED = process.env.OK_DESKTOP_E2E_SMOKE === '1';
const DARWIN = process.platform === 'darwin';
const BUILD_EXISTS = existsSync(MAIN_ENTRY);

const DESKTOP_PRODUCT_NAME = '@inkeep/open-knowledge-desktop';

function seedTmpHome(prefix: string): string {
  const tmpHome = realpathSync(mkdtempSync(join(tmpdir(), `ok-create-new-${prefix}-`)));
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
  return tmpHome;
}

interface LaunchOpts {
  pickedPath?: string;
}

async function launchApp(tmpHome: string, opts: LaunchOpts = {}): Promise<ElectronApplication> {
  const userDataDir = join(tmpHome, 'Library', 'Application Support', DESKTOP_PRODUCT_NAME);
  return electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    timeout: 30_000,
    env: {
      ...process.env,
      HOME: tmpHome,
      OK_DESKTOP_E2E_SMOKE: '1',
      ...(opts.pickedPath !== undefined ? { OK_DESKTOP_TEST_PICKED_PATH: opts.pickedPath } : {}),
    },
  });
}

async function findWindowByMode(
  app: ElectronApplication,
  mode: 'navigator' | 'editor',
  timeoutMs = 20_000,
): Promise<Page> {
  await expect
    .poll(
      async () => {
        for (const page of app.windows()) {
          const m = await page
            .evaluate(() => window.okDesktop?.config?.mode)
            .catch(() => undefined);
          if (m === mode) return true;
        }
        return false;
      },
      { timeout: timeoutMs, message: `${mode} window did not appear within timeout` },
    )
    .toBe(true);
  for (const page of app.windows()) {
    const m = await page.evaluate(() => window.okDesktop?.config?.mode).catch(() => undefined);
    if (m === mode) return page;
  }
  throw new Error(`${mode} window vanished between poll resolution and read`);
}

async function countWindowsByMode(
  app: ElectronApplication,
  mode: 'navigator' | 'editor',
): Promise<number> {
  let n = 0;
  for (const page of app.windows()) {
    const m = await page.evaluate(() => window.okDesktop?.config?.mode).catch(() => undefined);
    if (m === mode) n += 1;
  }
  return n;
}

const cleanupTargets: string[] = [];
function trackForCleanup(...paths: string[]): void {
  cleanupTargets.push(...paths);
}

test.describe('Create-new-project smoke', () => {
  test.skip(!SMOKE_ENABLED, 'Set OK_DESKTOP_E2E_SMOKE=1 to run Electron smoke tests.');
  test.skip(!DARWIN, 'Smoke harness is darwin-only.');
  test.skip(
    !BUILD_EXISTS,
    `Main build missing at ${MAIN_ENTRY} — run "bun run build:desktop" first.`,
  );

  test.afterEach(async () => {
    for (const target of cleanupTargets.splice(0)) {
      try {
        rmSync(target, { recursive: true, force: true });
      } catch {}
    }
  });

  test('creates a new project at the picked location when target is free', async ({
    captureStderrFor,
  }) => {
    const tmpHome = seedTmpHome('free');
    const parent = join(tmpHome, 'projects-free');
    mkdirSync(parent, { recursive: true });
    const projectName = 'MySmokeProject';
    const expectedTarget = join(parent, projectName);
    trackForCleanup(tmpHome);

    const app = await launchApp(tmpHome, { pickedPath: expectedTarget });
    captureStderrFor(app);
    const navigator = await findWindowByMode(app, 'navigator');

    await navigator.locator('[data-testid="nav-create-new"]').click();

    const dialog = navigator.locator('[data-testid="create-project-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(navigator.locator('[data-testid="create-name"]')).toHaveCount(0);

    await navigator.locator('[data-testid="create-browse"]').click();
    await expect(navigator.locator('[data-testid="create-target-caption"]')).toHaveText(
      expectedTarget,
      { timeout: 15_000 },
    );
    await expect(navigator.locator('[data-testid="create-banner-nested"]')).toHaveCount(0);
    await expect(navigator.locator('[data-testid="create-banner-git-confirm"]')).toHaveCount(0);
    await expect(navigator.locator('[data-testid="create-banner-nonempty"]')).toHaveCount(0);

    const submit = navigator.locator('[data-testid="create-submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect
      .poll(() => countWindowsByMode(app, 'editor'), {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => existsSync(join(expectedTarget, '.ok', 'config.yml')), { timeout: 15_000 })
      .toBe(true);
  });

  test('blocks creation when picked target is inside an existing OK project', async ({
    captureStderrFor,
  }) => {
    const tmpHome = seedTmpHome('nested');
    const rootPath = join(tmpHome, 'existing-project');
    mkdirSync(join(rootPath, '.ok'), { recursive: true });
    writeFileSync(join(rootPath, '.ok', 'config.yml'), 'schemaVersion: 1\ncontent:\n  dir: "."\n');
    const subFolder = join(rootPath, 'sub');
    mkdirSync(subFolder, { recursive: true });
    const pickedTarget = join(subFolder, 'Nested');
    trackForCleanup(tmpHome);

    const app = await launchApp(tmpHome, { pickedPath: pickedTarget });
    captureStderrFor(app);
    const navigator = await findWindowByMode(app, 'navigator');

    await navigator.locator('[data-testid="nav-create-new"]').click();
    await expect(navigator.locator('[data-testid="create-project-dialog"]')).toBeVisible({
      timeout: 15_000,
    });

    await expect(navigator.locator('[data-testid="create-name"]')).toHaveCount(0);

    await navigator.locator('[data-testid="create-browse"]').click();
    await expect(navigator.locator('[data-testid="create-target-caption"]')).toHaveText(
      pickedTarget,
      { timeout: 15_000 },
    );

    const nestedBanner = navigator.locator('[data-testid="create-banner-nested"]');
    await expect(nestedBanner).toBeVisible({ timeout: 15_000 });
    await expect(nestedBanner).toContainText(rootPath);
    await expect(navigator.locator('[data-testid="create-banner-nested-open"]')).toBeVisible();
    await expect(navigator.locator('[data-testid="create-submit"]')).toBeDisabled();
  });

  test('promotes project root to git root; content.dir defaults to the git root, not the picked sub-folder', async ({
    captureStderrFor,
  }) => {
    const tmpHome = seedTmpHome('git-confirm');
    const repoRoot = join(tmpHome, 'website');
    mkdirSync(repoRoot, { recursive: true });
    execSync('git init -q', { cwd: repoRoot });
    const pickedParent = join(repoRoot, 'notes');
    mkdirSync(pickedParent, { recursive: true });
    const projectName = 'MyProj';
    const target = join(pickedParent, projectName);
    trackForCleanup(tmpHome);

    const app = await launchApp(tmpHome, { pickedPath: target });
    captureStderrFor(app);
    const navigator = await findWindowByMode(app, 'navigator');

    await navigator.locator('[data-testid="nav-create-new"]').click();
    await expect(navigator.locator('[data-testid="create-project-dialog"]')).toBeVisible({
      timeout: 15_000,
    });

    await expect(navigator.locator('[data-testid="create-name"]')).toHaveCount(0);

    await navigator.locator('[data-testid="create-browse"]').click();
    await expect(navigator.locator('[data-testid="create-target-caption"]')).toHaveText(target, {
      timeout: 15_000,
    });

    const gitBanner = navigator.locator('[data-testid="create-banner-git-confirm"]');
    await expect(gitBanner).toBeVisible({ timeout: 15_000 });
    await expect(gitBanner).toContainText(repoRoot);
    const submit = navigator.locator('[data-testid="create-submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect
      .poll(() => countWindowsByMode(app, 'editor'), {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => existsSync(join(repoRoot, '.ok', 'config.yml')), { timeout: 15_000 })
      .toBe(true);
    expect(existsSync(join(target, '.ok', 'config.yml'))).toBe(false);
    expect(existsSync(target)).toBe(true);
    const cfg = readFileSync(join(repoRoot, '.ok', 'config.yml'), 'utf8');
    expect(cfg).not.toMatch(/^\s*dir:\s*notes\/MyProj/m);
    expect(cfg).toMatch(/^# content:/m);
  });
});
