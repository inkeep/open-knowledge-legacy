#!/usr/bin/env node
/**
 * Desktop postinstall — rebuilds native modules (`@parcel/watcher`, etc.) against
 * the pinned Electron Node ABI so packaged + dev loads can `dlopen` the binaries.
 *
 * D33 / D34: agent-first default runs `electron-builder install-app-deps` on every
 * `bun install`. Non-desktop contributors opt out via `ELECTRON_SKIP_REBUILD=1` in
 * their shell profile — saves ~150MB of Electron headers on first install and a
 * few seconds on subsequent ones.
 *
 * Keeping this as a Node script (not a raw shell one-liner) so the skip-check
 * runs cross-platform (macOS / Linux / Windows) without shell-syntax surprises.
 */
import { spawn } from 'node:child_process';

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
