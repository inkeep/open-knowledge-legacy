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

const child = spawn('electron-builder', ['install-app-deps'], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
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
