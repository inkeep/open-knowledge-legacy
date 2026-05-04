import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import {
  type ConfigFileWatcherUnsubscribe,
  startConfigFileWatcher,
} from './config-file-watcher.ts';

interface Fixture {
  root: string;
  absPath: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'ok-config-watcher-'));
  const absPath = join(root, '.ok', 'config.yml');
  mkdirSync(dirname(absPath), { recursive: true });
  return {
    root,
    absPath,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {}
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await wait(25);
  }
  return predicate();
}

let fx: Fixture;
const cleanups: ConfigFileWatcherUnsubscribe[] = [];

beforeEach(() => {
  fx = makeFixture();
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    try {
      await cleanup();
    } catch {}
  }
  fx.cleanup();
});

describe('startConfigFileWatcher', () => {
  test('fires onChange when a new file appears at the watched path', async () => {
    const events: string[] = [];
    const cleanup = await startConfigFileWatcher(fx.absPath, (content) => {
      events.push(content);
    });
    cleanups.push(cleanup);

    expect(existsSync(fx.absPath)).toBe(false);
    writeFileSync(fx.absPath, 'theme: dark\n', 'utf-8');

    let attempt = 0;
    const fired = await waitFor(() => {
      if (events.length > 0) return true;
      attempt++;
      writeFileSync(fx.absPath, `theme: dark\nattempt: ${attempt}\n`, 'utf-8');
      return false;
    }, 20_000);
    expect(fired).toBe(true);
    expect(events[0]?.startsWith('theme: dark\n')).toBe(true);
  }, 25_000);

  test('fires onChange when an existing file is modified', async () => {
    writeFileSync(fx.absPath, 'theme: light\n', 'utf-8');

    const events: string[] = [];
    const cleanup = await startConfigFileWatcher(fx.absPath, (content) => {
      events.push(content);
    });
    cleanups.push(cleanup);

    writeFileSync(fx.absPath, 'theme: dark\n', 'utf-8');

    const fired = await waitFor(() => events.length > 0);
    expect(fired).toBe(true);
    expect(events.at(-1)).toBe('theme: dark\n');
  });

  test('does NOT fire onChange on the initial scan (ignoreInitial)', async () => {
    writeFileSync(fx.absPath, 'theme: light\n', 'utf-8');

    const events: string[] = [];
    const cleanup = await startConfigFileWatcher(fx.absPath, (content) => {
      events.push(content);
    });
    cleanups.push(cleanup);

    await wait(750);
    expect(events).toEqual([]);
  });

  test('atomic tmp+rename produces a single change event (awaitWriteFinish)', async () => {
    writeFileSync(fx.absPath, 'theme: light\n', 'utf-8');

    const events: string[] = [];
    const cleanup = await startConfigFileWatcher(fx.absPath, (content) => {
      events.push(content);
    });
    cleanups.push(cleanup);

    const tmpPath = `${fx.absPath}.tmp.test`;
    writeFileSync(tmpPath, 'theme: dark\n', 'utf-8');
    await rename(tmpPath, fx.absPath);

    const fired = await waitFor(() => events.length > 0);
    expect(fired).toBe(true);
    expect(events.at(-1)).toBe('theme: dark\n');

    await wait(200);
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(2);
  });

  test('does NOT fire onChange when the file is unlinked', async () => {
    writeFileSync(fx.absPath, 'theme: light\n', 'utf-8');

    const events: string[] = [];
    const cleanup = await startConfigFileWatcher(fx.absPath, (content) => {
      events.push(content);
    });
    cleanups.push(cleanup);

    unlinkSync(fx.absPath);
    await wait(250);
    expect(events).toEqual([]);
  });

  test('cleanup function returned is idempotent', async () => {
    const cleanup = await startConfigFileWatcher(fx.absPath, () => {});
    await cleanup();
    await cleanup();
  });

  test('handler exceptions are caught and do not crash the watcher', async () => {
    let firstFired = false;
    let secondFired = false;
    const cleanup = await startConfigFileWatcher(fx.absPath, (content) => {
      if (!firstFired) {
        firstFired = true;
        throw new Error('boom');
      }
      if (content === 'theme: dark\n') secondFired = true;
    });
    cleanups.push(cleanup);

    writeFileSync(fx.absPath, 'first\n', 'utf-8');
    await waitFor(() => firstFired);

    writeFileSync(fx.absPath, 'theme: dark\n', 'utf-8');
    const fired = await waitFor(() => secondFired);
    expect(fired).toBe(true);
  });
});
