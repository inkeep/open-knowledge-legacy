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

  // Explicit visibility of the coverage gap — appears in test-run output as
  // a named skip so the missing coverage can't be overlooked when scanning
  // CI logs. See file-level comment for the full rationale (signed DMG +
  // Launch Services binding required). Tracked alongside M2 packaged-build
  // harness per the same file-level rationale.
  test.skip('cold-start Apple-Event delivery — deferred until signed DMG enables Launch Services binding', () => {
    // Intentionally empty. Implementation requires:
    //   1. Signed + notarized DMG so macOS Launch Services binds
    //      `openknowledge://` to this bundle instead of the generic
    //      Electron shell.
    //   2. A harness that fires `open openknowledge://...` against a
    //      not-yet-running installed .app (i.e. no `_electron.launch`
    //      pre-boot) and asserts the queue-then-flush path catches the
    //      Apple Event that fires before `whenReady`.
  });

  test('open(1) shell-out post-launch routes extension-less docName to renderer hash', async () => {
    // Regression: smoke must mirror the real MCP producer contract.
    // `preview-url.ts` normalizes docNames via `normalizeDocName` /
    // `docNameFromPath` → extension is stripped before encodeURIComponent.
    // Hardcoding `doc=target.md` here would exercise a path the producer
    // never emits, so a regression that strips / doesn't strip correctly
    // on the producer side would go uncaught. We seed `target.md` on disk
    // (the on-disk form) but fire the deep-link with `doc=target` (the
    // wire form) and assert the renderer hash matches the wire form.
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-m4-deep-link-'));
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, '.ok', 'config.yml'),
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

      // Fire the deep-link via `open(1)` — dispatches through macOS Launch
      // Services → Apple Event → the app's `open-url` listener.  `-g` keeps
      // focus off to reduce flake under CI display servers.
      const deepLink = `openknowledge://open?project=${encodeURIComponent(projectDir)}&doc=target`;
      execSync(`open -g "${deepLink}"`, { stdio: 'pipe' });

      // Wait up to 5s for SOME window in the app to have a hash ending in
      // `target` (exact renderer-side form). The install-deep-link-listener
      // writes `#/<encodeURIComponent(doc)>` — no extension, matching the
      // producer. Cross-worker Playwright poll all windows because the main
      // process may have spawned a new window for the project.
      await expect(async () => {
        for (const page of app.windows()) {
          const hash = await page.evaluate(() => window.location.hash).catch(() => '');
          if (hash.endsWith('#/target')) return;
        }
        throw new Error('no window has hash matching the extension-less producer form yet');
      }).toPass({ timeout: 5_000 });
    } finally {
      await app.close();
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('open(1) shell-out with nested docName round-trips encoded slash', async () => {
    // Regression for the pass-1 Critical fix (US-003 AC4 — nested docNames
    // like `notes/meeting` are the common MCP producer shape). Guards
    // against any regression that would re-narrow the `doc` validator or
    // break encodeURIComponent round-tripping through the renderer's
    // hash-route listener.
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-m4-deep-link-nested-'));
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, '.ok', 'config.yml'),
      "content:\n  dir: '.'\n  include: ['**/*.md']\n  exclude: []\n",
    );
    mkdirSync(join(projectDir, 'notes'), { recursive: true });
    writeFileSync(
      join(projectDir, 'notes', 'meeting.md'),
      '# Meeting Notes\n\nNested doc smoke.\n',
    );

    const app = await electron.launch({
      args: [MAIN_ENTRY],
      timeout: 30_000,
    });

    try {
      const firstWindow = await app.firstWindow({ timeout: 15_000 });
      expect(firstWindow).toBeDefined();

      // Nested docName — `/` encoded as `%2F` on the wire. Matches what
      // `preview-url.ts` emits via `encodeURIComponent(docName)`.
      const deepLink = `openknowledge://open?project=${encodeURIComponent(projectDir)}&doc=notes%2Fmeeting`;
      execSync(`open -g "${deepLink}"`, { stdio: 'pipe' });

      // Renderer encodes via `encodeURIComponent(doc)` before setting hash,
      // so `notes/meeting` → `#/notes%2Fmeeting`. Alternative form `#/notes/meeting`
      // is also acceptable if the install-deep-link-listener ever switches to
      // per-segment encoding; assert either shape to avoid brittle coupling.
      await expect(async () => {
        for (const page of app.windows()) {
          const hash = await page.evaluate(() => window.location.hash).catch(() => '');
          if (hash === '#/notes%2Fmeeting' || hash === '#/notes/meeting') return;
        }
        throw new Error('no window has nested-doc hash yet');
      }).toPass({ timeout: 5_000 });
    } finally {
      await app.close();
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
