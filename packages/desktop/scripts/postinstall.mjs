#!/usr/bin/env node
import { spawn } from 'node:child_process';

if (process.env.ELECTRON_SKIP_REBUILD === '1') {
  console.log(
    '[desktop postinstall] ELECTRON_SKIP_REBUILD=1 — skipping electron-builder install-app-deps',
  );
  process.exit(0);
}

if (process.env.CI && process.env.ELECTRON_SKIP_REBUILD !== '0') {
  console.log(
    '[desktop postinstall] CI detected — skipping electron-builder install-app-deps ' +
      '(set ELECTRON_SKIP_REBUILD=0 to force).',
  );
  process.exit(0);
}

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
