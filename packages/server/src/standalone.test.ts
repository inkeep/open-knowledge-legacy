/**
 * Tests for createServer() — degraded signal from initAsync.
 *
 * Verifies that ServerInstance.degraded correctly reports which subsystems
 * failed to initialize.
 *
 * Failure injection:
 *   - shadow-repo: forced via invalid path (file-as-dir). This subsystem's
 *     init throws on invalid paths, so the SPEC's preferred technique works.
 *   - file-watcher + head-watcher: cannot be forced via invalid paths because
 *     startWatcher falls back from @parcel/watcher to chokidar (tolerates
 *     invalid paths) and startHeadWatcher returns a no-op handle on missing
 *     .git. The degraded.push wiring for these subsystems is verified by
 *     the shadow-repo test (same push pattern) + code-level assertions below.
 *     mock.module was attempted but leaks across all test files in the same
 *     `bun test` process, breaking file-watcher.test.ts. See PR #62.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { ServerInstance } from './standalone.ts';
import { createServer } from './standalone.ts';

describe('createServer() degraded signal', () => {
  let testProjectDir: string;

  beforeEach(() => {
    testProjectDir = mkdtempSync(resolve(tmpdir(), 'ok-degraded-test-'));
  });

  afterEach(() => {
    rmSync(testProjectDir, { recursive: true, force: true });
  });

  test('clean init — degraded is empty array', async () => {
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
    expect(srv.degraded.filter((s) => s === 'shadow-repo')).toHaveLength(1);

    await srv.destroy();
  });

  test('degraded push wiring exists for all three subsystems', () => {
    // Verify at the source level that the degraded.push calls exist in
    // initAsync for file-watcher and head-watcher. This is a code-level
    // assertion — not as strong as a runtime test, but mock.module leaks
    // make runtime testing impractical without process isolation.
    const dir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
    const src = readFileSync(resolve(dir, 'standalone.ts'), 'utf-8');

    // Each subsystem's catch block should push to the degraded array
    expect(src).toContain("degraded.push('shadow-repo')");
    expect(src).toContain("degraded.push('file-watcher')");
    expect(src).toContain("degraded.push('head-watcher')");

    // The factory return should include degraded
    expect(src).toMatch(/return\s*\{[^}]*degraded[^}]*\}/s);
  });

  test('degraded is readonly — push and reassignment are compile-time errors', async () => {
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
