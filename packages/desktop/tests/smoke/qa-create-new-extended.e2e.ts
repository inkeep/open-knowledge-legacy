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
import { captureAppProcess, closeAppBounded } from './_helpers/electron-cleanup';
import { expect, test } from './_helpers/smoke-test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = resolve(__dirname, '..', '..', 'out', 'main', 'index.js');

const SMOKE_ENABLED = process.env.OK_DESKTOP_E2E_SMOKE === '1';
const DARWIN = process.platform === 'darwin';
const BUILD_EXISTS = existsSync(MAIN_ENTRY);
const DESKTOP_PRODUCT_NAME = '@inkeep/open-knowledge-desktop';

function seedTmpHome(prefix: string, stateOverride?: Record<string, unknown>): string {
  const tmpHome = realpathSync(mkdtempSync(join(tmpdir(), `ok-qa-${prefix}-`)));
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
      ...stateOverride,
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

test.describe('QA extended create-new-project', () => {
  test.skip(!SMOKE_ENABLED, 'Set OK_DESKTOP_E2E_SMOKE=1 to run.');
  test.skip(!DARWIN, 'Darwin-only.');
  test.skip(!BUILD_EXISTS, 'Run "bun run build:desktop" first.');

  test.afterEach(async () => {
    for (const target of cleanupTargets.splice(0)) {
      try {
        rmSync(target, { recursive: true, force: true });
      } catch {}
    }
  });

  test('QA-005 editor customization writes only checked editors', async ({ captureStderrFor }) => {
    const tmpHome = seedTmpHome('editors');
    const parent = join(tmpHome, 'projects');
    mkdirSync(parent, { recursive: true });
    const expected = join(parent, 'Customized');
    trackForCleanup(tmpHome);

    const app = await launchApp(tmpHome, { pickedPath: expected });
    captureStderrFor(app);
    const navigator = await findWindowByMode(app, 'navigator');
    await navigator.locator('[data-testid="nav-create-new"]').click();
    await expect(navigator.locator('[data-testid="create-project-dialog"]')).toBeVisible({
      timeout: 15_000,
    });

    await expect(navigator.locator('[data-testid="create-name"]')).toHaveCount(0);

    await navigator.locator('[data-testid="create-browse"]').click();
    await expect(navigator.locator('[data-testid="create-target-caption"]')).toHaveText(expected, {
      timeout: 15_000,
    });

    await navigator.locator('[data-testid="create-editor-cursor"]').click();
    await navigator.locator('[data-testid="create-editor-codex"]').click();
    await expect(navigator.locator('[data-testid="create-editor-claude"]')).toBeChecked();
    await expect(navigator.locator('[data-testid="create-editor-claude-desktop"]')).toBeChecked();
    await expect(navigator.locator('[data-testid="create-editor-cursor"]')).not.toBeChecked();
    await expect(navigator.locator('[data-testid="create-editor-codex"]')).not.toBeChecked();

    const submit = navigator.locator('[data-testid="create-submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect
      .poll(() => countWindowsByMode(app, 'editor'), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);

    await expect
      .poll(() => existsSync(join(expected, '.ok', 'config.yml')), { timeout: 15_000 })
      .toBe(true);

    expect(existsSync(join(expected, '.cursor'))).toBe(false);
    expect(existsSync(join(expected, '.codex'))).toBe(false);
  });

  test('QA-010 dialog UX — focus, caption, checkboxes, ARIA', async ({ captureStderrFor }) => {
    const tmpHome = seedTmpHome('uxshape');
    const parent = join(tmpHome, 'projects');
    mkdirSync(parent, { recursive: true });
    const pickedTarget = join(parent, 'Live Preview');
    trackForCleanup(tmpHome);

    const app = await launchApp(tmpHome, { pickedPath: pickedTarget });
    captureStderrFor(app);
    const navigator = await findWindowByMode(app, 'navigator');
    await navigator.locator('[data-testid="nav-create-new"]').click();
    const dialog = navigator.locator('[data-testid="create-project-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(navigator.locator('[data-testid="create-name"]')).toHaveCount(0);
    await expect(navigator.locator('[data-testid="create-browse"]')).toBeFocused();

    const caption = navigator.locator('[data-testid="create-target-caption"]');

    const ariaLive = await caption.getAttribute('aria-live');
    expect(ariaLive).toBe('polite');

    await expect(navigator.locator('[data-testid="create-editor-claude"]')).toBeChecked();
    await expect(navigator.locator('[data-testid="create-editor-claude-desktop"]')).toBeChecked();
    await expect(navigator.locator('[data-testid="create-editor-cursor"]')).toBeChecked();
    await expect(navigator.locator('[data-testid="create-editor-codex"]')).toBeChecked();

    await navigator.locator('[data-testid="create-browse"]').click();
    await expect(caption).toHaveText(pickedTarget, { timeout: 15_000 });
  });

  test('QA-011 + QA-016 — lastUsedProjectParent persists across opens; transient form state resets on reopen', async ({
    captureStderrFor,
  }) => {
    if (process.env.CI) {
      test.setTimeout(240_000);
    }
    const tmpHome = seedTmpHome('persist');
    const parent = join(tmpHome, 'projects-persist');
    mkdirSync(parent, { recursive: true });
    const userDataDir = join(tmpHome, 'Library', 'Application Support', DESKTOP_PRODUCT_NAME);
    const pickedTarget = join(parent, 'First');
    trackForCleanup(tmpHome);

    const app1 = await launchApp(tmpHome, { pickedPath: pickedTarget });
    captureStderrFor(app1);
    const app1Proc = captureAppProcess(app1);
    const navigator = await findWindowByMode(app1, 'navigator');
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
    const submit = navigator.locator('[data-testid="create-submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect
      .poll(() => countWindowsByMode(app1, 'editor'), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);

    await closeAppBounded(app1Proc, { gracefulMs: 5_000 });

    const stateAfterSubmit = JSON.parse(readFileSync(join(userDataDir, 'state.json'), 'utf8'));
    expect(stateAfterSubmit.lastUsedProjectParent).toBe(parent);

    const persistedParent = stateAfterSubmit.lastUsedProjectParent;
    writeFileSync(
      join(userDataDir, 'state.json'),
      JSON.stringify({
        recentProjects: [],
        lastOpenedProject: null,
        lastUsedProjectParent: persistedParent,
        versionPendingInstall: null,
        lastSeenVersion: null,
        lastSuccessfulCheckAt: null,
        stuckHintShown: false,
      }),
    );

    const app2 = await launchApp(tmpHome);
    captureStderrFor(app2);
    const navigator2 = await findWindowByMode(app2, 'navigator', 30_000);
    await navigator2.locator('[data-testid="nav-create-new"]').click();
    await expect(navigator2.locator('[data-testid="create-project-dialog"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(navigator2.locator('[data-testid="create-name"]')).toHaveCount(0);
    const caption2 = navigator2.locator('[data-testid="create-target-caption"]');
    await expect(caption2).toContainText('Click Browse to pick or create a project folder', {
      timeout: 5_000,
    });
    await expect(navigator2.locator('[data-testid="create-editor-claude"]')).toBeChecked();
    await expect(navigator2.locator('[data-testid="create-editor-claude-desktop"]')).toBeChecked();
    await expect(navigator2.locator('[data-testid="create-editor-cursor"]')).toBeChecked();
    await expect(navigator2.locator('[data-testid="create-editor-codex"]')).toBeChecked();
  });

  test('submit is disabled until Browse picks a target', async ({ captureStderrFor }) => {
    const tmpHome = seedTmpHome('disabled-when-empty');
    const parent = join(tmpHome, 'projects-san');
    mkdirSync(parent, { recursive: true });
    trackForCleanup(tmpHome);

    const app = await launchApp(tmpHome, { pickedPath: join(parent, 'AfterPick') });
    captureStderrFor(app);
    const navigator = await findWindowByMode(app, 'navigator');
    await navigator.locator('[data-testid="nav-create-new"]').click();
    await expect(navigator.locator('[data-testid="create-project-dialog"]')).toBeVisible({
      timeout: 15_000,
    });

    await expect(navigator.locator('[data-testid="create-name"]')).toHaveCount(0);
    await expect(navigator.locator('[data-testid="create-submit"]')).toBeDisabled();
    const caption = navigator.locator('[data-testid="create-target-caption"]');
    await expect(caption).toContainText('Click Browse to pick or create a project folder', {
      timeout: 5_000,
    });

    await navigator.locator('[data-testid="create-browse"]').click();
    await expect(caption).toHaveText(join(parent, 'AfterPick'), { timeout: 15_000 });
    await expect(navigator.locator('[data-testid="create-submit"]')).toBeEnabled();
  });

  test('QA-019 — double-click Create produces exactly one project', async ({
    captureStderrFor,
  }) => {
    const tmpHome = seedTmpHome('dblclick');
    const parent = join(tmpHome, 'projects-dbl');
    mkdirSync(parent, { recursive: true });
    const pickedTarget = join(parent, 'Unique');
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

    const submit = navigator.locator('[data-testid="create-submit"]');
    await expect(submit).toBeEnabled();

    await submit.click();
    try {
      await submit.click({ timeout: 1_000, force: true });
    } catch {}

    await expect
      .poll(() => countWindowsByMode(app, 'editor'), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    await new Promise((r) => setTimeout(r, 2_000));
    const editorCount = await countWindowsByMode(app, 'editor');
    expect(editorCount).toBe(1);
    expect(existsSync(join(parent, 'Unique', '.ok', 'config.yml'))).toBe(true);
  });

  test('QA-025 — banner ARIA roles per severity', async ({ captureStderrFor }) => {
    const tmpHome = seedTmpHome('aria');
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
    const nestedRole = await nestedBanner.getAttribute('role');
    expect(nestedRole).toBe('alert');
  });

  test('QA-025b — git-confirm banner role=status, aria-live=polite', async ({
    captureStderrFor,
  }) => {
    const tmpHome = seedTmpHome('aria-git');
    const repoRoot = join(tmpHome, 'website');
    mkdirSync(repoRoot, { recursive: true });
    execSync('git init -q', { cwd: repoRoot });
    const pickedParent = join(repoRoot, 'notes');
    mkdirSync(pickedParent, { recursive: true });
    const pickedTarget = join(pickedParent, 'MyProj');
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

    const gitBanner = navigator.locator('[data-testid="create-banner-git-confirm"]');
    await expect(gitBanner).toBeVisible({ timeout: 15_000 });
    const role = await gitBanner.getAttribute('role');
    expect(role).toBe('status');
    const ariaLive = await gitBanner.getAttribute('aria-live');
    expect(ariaLive).toBe('polite');
  });

  test('Enter on Submit button submits the form', async ({ captureStderrFor }) => {
    const tmpHome = seedTmpHome('kbd');
    const parent = join(tmpHome, 'projects-kbd');
    mkdirSync(parent, { recursive: true });
    const pickedTarget = join(parent, 'KbdSubmit');
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

    const submit = navigator.locator('[data-testid="create-submit"]');
    await expect(submit).toBeEnabled({ timeout: 10_000 });

    await submit.focus();
    await submit.press('Enter');

    await expect
      .poll(() => countWindowsByMode(app, 'editor'), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    expect(existsSync(join(pickedTarget, '.ok', 'config.yml'))).toBe(true);
  });

  test('QA-002 — clicking Open <basename> dispatches openProject and closes dialog', async ({
    captureStderrFor,
  }) => {
    const tmpHome = seedTmpHome('open-nested');
    const rootPath = join(tmpHome, 'NestedTarget');
    mkdirSync(join(rootPath, '.ok'), { recursive: true });
    writeFileSync(join(rootPath, '.ok', 'config.yml'), 'schemaVersion: 1\ncontent:\n  dir: "."\n');
    const subFolder = join(rootPath, 'sub');
    mkdirSync(subFolder, { recursive: true });
    const pickedTarget = join(subFolder, 'Anything');
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

    const openBtn = navigator.locator('[data-testid="create-banner-nested-open"]');
    await expect(openBtn).toBeVisible({ timeout: 15_000 });
    await expect(openBtn).toHaveText(/Open NestedTarget/);
    await openBtn.click();

    await expect
      .poll(() => countWindowsByMode(app, 'editor'), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    const navStillAlive = !navigator.isClosed();
    if (navStillAlive) {
      await expect(navigator.locator('[data-testid="create-project-dialog"]')).not.toBeVisible({
        timeout: 5_000,
      });
    }
  });
});
