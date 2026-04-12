/**
 * Tests for createServer() — degraded signal from initAsync.
 *
 * Verifies that ServerInstance.degraded correctly reports which subsystems
 * failed to initialize. Uses two failure-injection techniques:
 *   - Invalid paths (SPEC §S3.R4 preferred technique) for subsystems whose
 *     init surface reacts to path validity — e.g. shadow-repo.
 *   - `mock.module` for subsystems that are path-resilient by design — e.g.
 *     the file watcher, which falls back from @parcel/watcher to chokidar
 *     and chokidar itself tolerates missing paths via event emission rather
 *     than synchronous throw.
 *
 * Tests use dynamic imports so `mock.module` calls take effect on subsequent
 * imports of `./standalone.ts`. See `references/bun-mock-semantics.md` in
 * this repo for the cache invalidation behavior we rely on.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
// Type-only import — erased at runtime, does not trigger module evaluation,
// so does not interfere with mock.module-based failure injection below.
import type { ServerInstance } from './standalone.ts';

describe('createServer() degraded signal', () => {
  let testProjectDir: string;

  beforeEach(() => {
    testProjectDir = mkdtempSync(resolve(tmpdir(), 'ok-degraded-test-'));
  });

  afterEach(() => {
    rmSync(testProjectDir, { recursive: true, force: true });
  });

  test('clean init — degraded is empty array', async () => {
    const { createServer } = await import('./standalone.ts');
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
    });

    await srv.ready;

    expect(Array.isArray(srv.degraded)).toBe(true);
    expect(srv.degraded).toEqual([]);

    await srv.destroy();
  });

  test('shadow-repo init failure — degraded includes "shadow-repo"', async () => {
    const { createServer } = await import('./standalone.ts');
    // Force shadow-repo failure by making projectDir a file (not a directory).
    // initShadowRepo resolves .git/ under projectDir → stat fails, falls back to
    // .openknowledge/ under projectDir → mkdirSync fails because projectDir is a file.
    const fileAsDir = resolve(testProjectDir, 'not-a-dir');
    writeFileSync(fileAsDir, 'I am a file, not a directory');

    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv = createServer({
      contentDir,
      projectDir: fileAsDir,
      quiet: true,
    });

    await srv.ready;

    expect(srv.degraded).toContain('shadow-repo');
    // Shadow-repo appears exactly once (dedup guards the reinit path).
    expect(srv.degraded.filter((s) => s === 'shadow-repo')).toHaveLength(1);

    await srv.destroy();
  });

  test('file-watcher init failure — degraded includes "file-watcher"', async () => {
    // startWatcher is resilient to invalid paths by design: @parcel/watcher
    // failures fall back to chokidar, and chokidar tolerates missing dirs
    // via event emission rather than synchronous throw. So path-based
    // forcing (the SPEC's primary technique) cannot reach the catch arm.
    //
    // Instead, mock the file-watcher module to force startWatcher to reject.
    // We re-import every symbol standalone.ts consumes from this module to
    // keep the mock complete — an incomplete mock would break createServer
    // at import time rather than inside the catch block we're testing.
    const real = await import('./file-watcher.ts');
    mock.module('./file-watcher.ts', () => ({
      ...real,
      startWatcher: async () => {
        throw new Error('synthetic file-watcher init failure');
      },
    }));

    const { createServer } = await import('./standalone.ts');
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
    });

    await srv.ready;

    expect(srv.degraded).toContain('file-watcher');
    // ready still resolves on degraded boot (NG9 — do not reject on failure).
    // The shadow-repo init should succeed in this test, so only 'file-watcher'
    // is expected in the array.
    expect(srv.degraded).toEqual(['file-watcher']);

    await srv.destroy();
  });

  test('head-watcher init failure — degraded includes "head-watcher"', async () => {
    const real = await import('./head-watcher.ts');
    mock.module('./head-watcher.ts', () => ({
      ...real,
      startHeadWatcher: async () => {
        throw new Error('synthetic head-watcher init failure');
      },
    }));

    const { createServer } = await import('./standalone.ts');
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
    });

    await srv.ready;

    expect(srv.degraded).toContain('head-watcher');

    await srv.destroy();
  });

  test('degraded is readonly — push and reassignment are compile-time errors', async () => {
    // This test runs AFTER the file-watcher mock from the previous test.
    // Bun's mock.module persists across tests in the same file, but this
    // test only exercises type-level properties and the factory's return
    // shape — it does not depend on the real startWatcher behavior.
    const { createServer } = await import('./standalone.ts');
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv: ServerInstance = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
    });

    // @ts-expect-error — readonly array: push is not allowed
    srv.degraded.push('test');

    // @ts-expect-error — readonly field: reassignment is not allowed
    srv.degraded = [];

    await srv.ready;
    await srv.destroy();
  });
});
