import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { runInit } from '../../../cli/src/commands/init.ts';
import { CORPUS, corpusDocName } from '../integration/_fixtures/init-load-byte-stable-corpus.ts';
import {
  diffManifest,
  mutationsOf,
  snapshotMarkdownOnly,
} from '../integration/_fixtures/init-load-byte-stable-snapshot.ts';
import {
  getFreePort,
  killGracefully,
  waitForActiveProviderSynced,
  waitForHttpReady,
} from './_helpers';

const HELPERS_DIR = dirname(fileURLToPath(import.meta.url));
const APP_PACKAGE_ROOT = resolve(HELPERS_DIR, '..', '..');

const PROD_MAX_DEBOUNCE_MS = 10_000;
const POST_MOUNT_WAIT_MS = PROD_MAX_DEBOUNCE_MS * 2 + 500; // 21 500 ms

interface OkFixture {
  port: number;
  baseURL: string;
  contentDir: string;
}

const test = base.extend<{ okFixture: OkFixture }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object-destructuring pattern for the fixtures arg; this fixture has no dependencies so the destructure is empty by design (matches the convention used by the `workerServer` fixture in `_helpers/fixtures.ts`).
  okFixture: async ({}, use) => {
    const port = await getFreePort();
    const contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-init-load-e2e-')));

    for (const entry of CORPUS) {
      writeFileSync(join(contentDir, entry.filename), entry.body, 'utf-8');
    }

    await runInit({
      cwd: contentDir,
      mcp: false,
      installUserSkill: async () => 'skip-current',
    });

    const baseURL = `http://localhost:${port}`;
    const proc = spawn('bun', ['run', '--silent', 'dev'], {
      cwd: APP_PACKAGE_ROOT,
      env: {
        ...process.env,
        VITE_PORT: String(port),
        OK_TEST_CONTENT_DIR: contentDir,
        NO_COLOR: process.env.NO_COLOR ?? '1',
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    try {
      await Promise.race([
        waitForHttpReady(baseURL, 60_000),
        new Promise<never>((_, reject) => {
          proc.once('error', (err) => reject(err));
          proc.once('exit', (code, signal) => {
            if (code !== 0 && code !== null)
              reject(new Error(`dev server exited early: code=${code} signal=${signal}`));
          });
        }),
      ]);
    } catch (err) {
      await killGracefully(proc);
      rmSync(contentDir, { recursive: true, force: true });
      throw err;
    }

    try {
      await use({ port, baseURL, contentDir });
    } finally {
      try {
        await killGracefully(proc);
      } finally {
        rmSync(contentDir, { recursive: true, force: true });
      }
    }
  },
  baseURL: async ({ okFixture }, use) => {
    await use(okFixture.baseURL);
  },
});

const E2E_TARGET_FILENAME = 'mega-combo-8ng.md';

test.describe('init-load-byte-stable: full-UI mount produces zero disk mutations', () => {
  test('mounting mega-combo-8ng.md in WYSIWYG produces zero disk mutations across the corpus', async ({
    page,
    okFixture,
  }) => {
    test.setTimeout(120_000);

    const target = CORPUS.find((c) => c.filename === E2E_TARGET_FILENAME);
    if (!target) {
      throw new Error(`corpus invariant violated: ${E2E_TARGET_FILENAME} not found in CORPUS`);
    }

    const baseline = snapshotMarkdownOnly(okFixture.contentDir);
    expect(Object.keys(baseline.files).length).toBe(CORPUS.length);

    await page.goto('/');

    await page.goto(`/#/${corpusDocName(target)}`);
    await waitForActiveProviderSynced(page, { timeout: 60_000 });
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 60_000 });
    await expect(editor.locator('h1').first()).toContainText('Mega-combo', {
      timeout: 30_000,
    });

    const samplingStart = Date.now();
    while (Date.now() - samplingStart < POST_MOUNT_WAIT_MS) {
      const sample = snapshotMarkdownOnly(okFixture.contentDir);
      const sampleMutations = mutationsOf(diffManifest(baseline, sample));
      expect(
        sampleMutations,
        `mutation detected at t=${Date.now() - samplingStart}ms after editor mount`,
      ).toEqual([]);
      await wait(2000);
    }

    const afterLoad = snapshotMarkdownOnly(okFixture.contentDir);
    const diff = diffManifest(baseline, afterLoad);
    const muts = mutationsOf(diff);
    if (muts.length > 0) {
      console.error(
        '[init-load-byte-stable.e2e] mutations detected:',
        JSON.stringify(muts, null, 2),
      );
    }
    expect(muts).toEqual([]);
    for (const entry of CORPUS) {
      const before = baseline.files[entry.filename];
      const after = afterLoad.files[entry.filename];
      expect(after?.hash, `hash drifted for ${entry.filename}`).toBe(before?.hash);
      expect(after?.size, `size drifted for ${entry.filename}`).toBe(before?.size);
    }
  });
});

test.describe('init-load-byte-stable.e2e: negative-case control (diff harness has teeth)', () => {
  test('direct mutation of a corpus file IS detected by the diff harness', async ({
    okFixture,
  }) => {
    const baseline = snapshotMarkdownOnly(okFixture.contentDir);
    const target = CORPUS[0];
    if (!target) throw new Error('CORPUS empty (fixture invariant violated)');
    const targetPath = join(okFixture.contentDir, target.filename);
    expect(existsSync(targetPath)).toBe(true);
    writeFileSync(targetPath, `${target.body}\nMUTATED\n`, 'utf-8');
    const after = snapshotMarkdownOnly(okFixture.contentDir);
    const muts = mutationsOf(diffManifest(baseline, after));
    expect(muts.length).toBe(1);
    expect(muts[0]?.relPath).toBe(target.filename);
    expect(muts[0]?.status).toBe('modified');
  });
});
