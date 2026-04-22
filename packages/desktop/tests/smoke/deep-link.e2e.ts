/**
 * M4 deep-link smoke test — proves that an `openknowledge://` URL arriving
 * after the desktop app is already running (warm-start) routes through the
 * main-process handler → `ok:deep-link` IPC event → renderer hash navigation.
 *
 * **Scope: warm-start only.** Phase-1 investigation established that
 * `_electron.launch({ args: [url] })` on macOS delivers the URL via
 * `process.argv`, NOT via the `open-url` Apple Event. This means
 * `_electron.launch` args can exercise the `second-instance` argv parsing
 * path but cannot exercise the cold-start Apple Event path. For the
 * Apple-Event path, `execSync('open openknowledge://...')` is the canonical
 * driver because it dispatches through macOS Launch Services just like a
 * real user click. That's what this test uses.
 *
 * Per the parent spec's §9 STOP_IF:
 *   > If `_electron.launch` doesn't support custom URL scheme args on macOS
 *   > (unverified), fall back to `execSync('open "openknowledge://..."')`
 *   > based smoke and document.
 *
 * True cold-start Apple-Event simulation (launching a not-yet-running app
 * via `open(1)` and asserting the queue-then-flush path delivers the URL)
 * is a deferred gap — it requires a signed/notarized DMG so macOS Launch
 * Services binds the scheme to this specific app bundle, rather than the
 * generic Electron shell. Tracked in M2's packaged-build harness.
 *
 * Skip conditions:
 *   - Not on macOS (`process.platform !== 'darwin'`) — the `open` command
 *     is macOS-specific, and the URL-scheme handler is darwin-only in v0.
 *   - Main-process build output missing (`out/main/index.js` absent) — the
 *     app must be built via `bun run build:desktop` before this test runs.
 *     CI runs without a pre-build skip gracefully rather than misreporting.
 *   - `OK_DESKTOP_E2E_SMOKE !== '1'` — gate so `bunx playwright test` on the
 *     entire repo without explicit opt-in doesn't attempt to launch Electron
 *     (which crashes headless CI that lacks a display server).
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = resolve(__dirname, '..', '..', 'out', 'main', 'index.js');

// Environment gate: opt-in only. Default-off keeps the test harmless on CI.
const SMOKE_ENABLED = process.env.OK_DESKTOP_E2E_SMOKE === '1';
const DARWIN = process.platform === 'darwin';
const BUILD_EXISTS = existsSync(MAIN_ENTRY);

test.describe('deep-link warm-start smoke (M4 US-009 / AC7)', () => {
  test.skip(!SMOKE_ENABLED, 'Set OK_DESKTOP_E2E_SMOKE=1 to run Electron smoke tests.');
  test.skip(!DARWIN, 'Deep-link URL scheme is macOS-only in v0 (D51 NOT NOW).');
  test.skip(
    !BUILD_EXISTS,
    `Main build missing at ${MAIN_ENTRY} — run "bun run build:desktop" first.`,
  );

  test('open(1) shell-out post-launch updates renderer hash to target doc', async () => {
    // Seed a temp project with a real .open-knowledge/ + target doc so the
    // window-manager spawn path can boot an editor window for it.
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-m4-deep-link-'));
    mkdirSync(join(projectDir, '.open-knowledge'), { recursive: true });
    writeFileSync(
      join(projectDir, '.open-knowledge', 'config.yml'),
      "content:\n  dir: '.'\n  include: ['**/*.md']\n  exclude: []\n",
    );
    writeFileSync(join(projectDir, 'target.md'), '# Target Doc\n\nDeep-link smoke content.\n');

    const app = await electron.launch({
      args: [MAIN_ENTRY],
      timeout: 30_000,
    });

    try {
      // Wait for the first window to appear — the Navigator spawns at boot in
      // v0 (no prior `lastOpenedProject`). Any window is sufficient for the
      // deep-link test since `open-url` → focus/spawn handles routing.
      const firstWindow = await app.firstWindow({ timeout: 15_000 });
      expect(firstWindow).toBeDefined();

      // Fire the deep-link via `open(1)` — this dispatches through macOS
      // Launch Services → Apple Event → the app's `open-url` listener. We
      // can't use `app.context().newPage()` to navigate because Electron
      // deep-link routing happens at the MAIN process level, not renderer.
      //
      // `-g` keeps focus off to reduce flake under CI display servers.
      const deepLink = `openknowledge://open?project=${encodeURIComponent(projectDir)}&doc=target.md`;
      execSync(`open -g "${deepLink}"`, { stdio: 'pipe' });

      // Wait up to 5s for SOME window in the app to have a hash ending in
      // `target.md`. We poll across all windows because the main process may
      // have spawned a new window for the project (when the initial window
      // was the Navigator, which is not project-scoped).
      await expect(async () => {
        for (const page of app.windows()) {
          const hash = await page.evaluate(() => window.location.hash).catch(() => '');
          if (hash.endsWith('target.md')) return;
        }
        throw new Error('no window has hash ending in target.md yet');
      }).toPass({ timeout: 5_000 });
    } finally {
      await app.close();
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
