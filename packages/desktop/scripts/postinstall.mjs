#!/usr/bin/env node
/**
 * Desktop postinstall — rebuilds native modules (`@parcel/watcher`, etc.) against
 * the pinned Electron Node ABI so packaged + dev loads can `dlopen` the binaries,
 * and re-rasterizes the app icon (packages/app/public/favicon.svg → build/icon.png)
 * so `app.dock.setIcon` has a PNG to point at without a manual build step.
 *
 * D33 / D34: agent-first default runs `electron-builder install-app-deps` on every
 * `bun install`. Non-desktop contributors opt out via `ELECTRON_SKIP_REBUILD=1` in
 * their shell profile — saves ~150MB of Electron headers on first install and a
 * few seconds on subsequent ones. The icon rasterize step runs regardless because
 * it's cheap (~100ms) and mtime-gated — a no-op when icon.png is newer than the SVG.
 *
 * Keeping this as a Node script (not a raw shell one-liner) so the skip-check
 * runs cross-platform (macOS / Linux / Windows) without shell-syntax surprises.
 */
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Regenerate build/icon.png from packages/app/public/favicon.svg if the SVG is
// newer. Done first because it's independent of native-module rebuild and
// shouldn't be blocked by ELECTRON_SKIP_REBUILD (the icon is small + used by
// both dev and packaged builds).
const rasterizeResult = spawnSync('node', [resolve(__dirname, 'rasterize-icon.mjs')], {
  stdio: 'inherit',
});
if (rasterizeResult.status !== 0) {
  console.warn(
    '[desktop postinstall] icon rasterize failed; dev Dock icon may be the Electron default',
  );
}

if (process.env.ELECTRON_SKIP_REBUILD === '1') {
  console.log(
    '[desktop postinstall] ELECTRON_SKIP_REBUILD=1 — skipping electron-builder install-app-deps',
  );
  process.exit(0);
}

// GitHub Actions + most CI providers set `CI=true`. We also skip on CI
// because Linux runners that don't exercise the desktop app can't
// `install-app-deps` (electron's platform binary isn't guaranteed present,
// and when it's missing electron-builder errors with "Cannot compute
// electron version from installed node modules" — that cascades into every
// downstream typecheck/test/lint job failing at `bun install`). Desktop
// contributors running CI manually can set ELECTRON_SKIP_REBUILD=0 to
// opt back in. Matches D34's "agent-first local default" scope — the
// opt-out is for machines that don't need it.
if (process.env.CI && process.env.ELECTRON_SKIP_REBUILD !== '0') {
  console.log(
    '[desktop postinstall] CI detected — skipping electron-builder install-app-deps ' +
      '(set ELECTRON_SKIP_REBUILD=0 to force). Rasterize step above still runs.',
  );
  process.exit(0);
}

// Local desktop dev — run install-app-deps but soften failures to a warning.
// A broken install shouldn't gate the whole monorepo's `bun install`.
const child = spawn('electron-builder', ['install-app-deps'], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.warn(
      `[desktop postinstall] electron-builder install-app-deps exited with code ${code} — ` +
        'continuing anyway. Native modules for the desktop app may need manual rebuild. ' +
        'Set ELECTRON_SKIP_REBUILD=1 to silence this step.',
    );
  }
  process.exit(0);
});

child.on('error', (err) => {
  console.warn(
    `[desktop postinstall] electron-builder install-app-deps failed to spawn: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
  console.warn('[desktop postinstall] Skipping — run `bun run rebuild:native` manually if needed');
  process.exit(0);
});
