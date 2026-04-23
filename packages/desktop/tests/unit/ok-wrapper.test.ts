// AC2.12 — self-diagnosing wrapper (D-M6-R6). Exercises the stderr
// shape + exit code the wrapper emits when the bundled CLI or
// Electron binary is missing (drag-to-Trash lifecycle).
//
// See specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md §5 AC2.12.

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

const WRAPPER = join(import.meta.dir, '..', '..', 'resources', 'cli', 'bin', 'ok.sh');

describe('ok.sh wrapper', () => {
  test('is committed with executable bit set', () => {
    expect(() => accessSync(WRAPPER, constants.X_OK)).not.toThrow();
  });

  test('missing bundle emits two-line stderr and exits 69', () => {
    const result = spawnSync(WRAPPER, [], {
      env: { ...process.env, APP_BUNDLE_DIR: '/nonexistent/fake.app' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(69);
    const lines = result.stderr.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'Open Knowledge has been removed. Reinstall from the Open Knowledge DMG.',
    );
    const parsed = JSON.parse(lines[1] ?? '');
    expect(parsed).toEqual({
      error: 'ok-bundle-missing',
      hint: 'Open Knowledge app appears to have been removed. Reinstall from the DMG, or remove OK entries from your MCP config and rerun ok init.',
    });
  });

  test('missing Electron binary but present CLI also diagnoses missing-bundle', async () => {
    // Build a fixture where Contents/Resources/cli/dist/cli.mjs exists
    // but Contents/MacOS/Open Knowledge does not — the `-x` check on
    // ELECTRON should fail and short-circuit to exit 69.
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const fixture = mkdtempSync(join(tmpdir(), 'ok-wrapper-'));
    const appRoot = join(fixture, 'Open Knowledge.app');
    mkdirSync(join(appRoot, 'Contents', 'Resources', 'cli', 'dist'), { recursive: true });
    writeFileSync(join(appRoot, 'Contents', 'Resources', 'cli', 'dist', 'cli.mjs'), '// stub');

    const result = spawnSync(WRAPPER, [], {
      env: { ...process.env, APP_BUNDLE_DIR: appRoot },
      encoding: 'utf8',
    });
    expect(result.status).toBe(69);
    expect(result.stderr).toContain('ok-bundle-missing');
  });

  test('Pass 0 Major #10: empty APP_PATH branch emits structured stderr + exit 69', async () => {
    // The wrapper falls into this branch when `app_realpath` returns empty —
    // i.e., the script runs from a location whose path doesn't contain `.app`.
    // Before Pass 0 Major #10 the branch printed plain text + exit 1; MCP
    // clients parsing stderr JSON got nothing actionable. Now it mirrors the
    // exit-69 self-diagnosing pattern with a distinct error code.
    const { mkdtempSync, copyFileSync, chmodSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'ok-wrapper-empty-'));
    const wrapperCopy = join(dir, 'ok.sh');
    copyFileSync(WRAPPER, wrapperCopy);
    chmodSync(wrapperCopy, 0o755);

    const result = spawnSync(wrapperCopy, [], {
      // Note: APP_BUNDLE_DIR not set, so app_realpath runs against the copy.
      // Since `dir` contains no `.app`, the realpath helper returns empty.
      env: { ...process.env, APP_BUNDLE_DIR: '' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(69);
    const lines = result.stderr.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'Open Knowledge CLI cannot find its app bundle. Reinstall from the Open Knowledge DMG.',
    );
    const parsed = JSON.parse(lines[1] ?? '');
    expect(parsed.error).toBe('ok-wrapper-resolution-failed');
    expect(parsed.hint).toContain('symlink chain may be broken');
    expect(parsed.source).toBe(wrapperCopy);
  });

  test('NODE_OPTIONS is rescoped to OK_NODE_OPTIONS before exec', () => {
    // We cannot observe the unset within the final exec since the
    // wrapper short-circuits on missing bundle before exec fires.
    // Instead, inspect the script source — the rescope + unset is a
    // compile-time invariant, not a runtime one, so a source-level
    // assertion is the right tier for this.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const script = readFileSync(WRAPPER, 'utf8');
    expect(script).toContain('export OK_NODE_OPTIONS=$NODE_OPTIONS');
    expect(script).toContain('unset NODE_OPTIONS');
    // Re-export must come before unset so OK_NODE_OPTIONS captures
    // the user's value rather than the empty post-unset value.
    const rescopeIdx = script.indexOf('export OK_NODE_OPTIONS=$NODE_OPTIONS');
    const unsetIdx = script.indexOf('unset NODE_OPTIONS');
    expect(rescopeIdx).toBeGreaterThan(0);
    expect(unsetIdx).toBeGreaterThan(rescopeIdx);
  });
});
