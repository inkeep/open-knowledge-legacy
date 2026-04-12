import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { loggerFactory, type PinoLogger } from './logger.ts';
import { initShadowRepo, shadowGit } from './shadow-repo.ts';
import { createServer } from './standalone.ts';

// ─── CaptureLogger infrastructure ───────────────────────────────────────────
// Uses loggerFactory.configure() pattern from logger.test.ts:27-36.
// NOT monkey-patching — injects a capture logger via the factory.

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  msg: string;
  payload: Record<string, unknown>;
}

class CaptureLogger {
  readonly entries: LogEntry[] = [];

  info(data: unknown, message: string): void {
    this.entries.push({
      level: 'info',
      msg: message,
      payload: (data as Record<string, unknown>) ?? {},
    });
  }

  warn(data: unknown, message: string): void {
    this.entries.push({
      level: 'warn',
      msg: message,
      payload: (data as Record<string, unknown>) ?? {},
    });
  }

  error(data: unknown, message: string): void {
    this.entries.push({
      level: 'error',
      msg: message,
      payload: (data as Record<string, unknown>) ?? {},
    });
  }

  debug(data: unknown, message: string): void {
    this.entries.push({
      level: 'debug',
      msg: message,
      payload: (data as Record<string, unknown>) ?? {},
    });
  }
}

/** All loggers created during the test share this map, keyed by logger name. */
const captureLoggers = new Map<string, CaptureLogger>();

function captureAllLoggers(): {
  getCalls: (level?: string, msgContains?: string) => LogEntry[];
  getLoggerEntries: (name: string) => LogEntry[];
  reset: () => void;
} {
  captureLoggers.clear();
  loggerFactory.configure({
    loggerFactory: (name: string) => {
      const capture = new CaptureLogger();
      captureLoggers.set(name, capture);
      return capture as unknown as PinoLogger;
    },
  });

  return {
    getCalls(level?: string, msgContains?: string) {
      const all: LogEntry[] = [];
      for (const logger of captureLoggers.values()) {
        all.push(...logger.entries);
      }
      return all.filter((e) => {
        if (level && e.level !== level) return false;
        if (msgContains && !e.msg.includes(msgContains)) return false;
        return true;
      });
    },
    getLoggerEntries(name: string) {
      return captureLoggers.get(name)?.entries ?? [];
    },
    reset() {
      captureLoggers.clear();
    },
  };
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('createServer().destroy() — graceful shutdown flush', () => {
  let tmpDir: string;
  let logCapture: ReturnType<typeof captureAllLoggers>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ok-destroy-test-'));
    logCapture = captureAllLoggers();
  });

  afterEach(async () => {
    loggerFactory.reset();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('flushes L1 markdown writes before destroy() resolves + emits shutdown log', async () => {
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
      debounce: 60_000, // Prevent natural debounce from firing — proves destroy-time flush
    });
    await server.ready;

    const conn = await server.hocuspocus.openDirectConnection('test-doc');
    // Write to XmlFragment('default') — the Y.Doc shape the persistence layer
    // reads from in onStoreDocument. getText('source') is synced to XmlFragment
    // by browser-side observers that don't exist in server-only tests.
    await conn.transact((doc) => {
      const xmlFragment = doc.getXmlFragment('default');
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText('hello world')]);
      xmlFragment.insert(0, [paragraph]);
    });

    // Release the DirectConnection's hold on the document WITHOUT triggering an
    // immediate store (conn.disconnect() would store with debounce=0, bypassing
    // the destroy-time flush path we want to test). removeDirectConnection()
    // decrements the connection count so the document can unload when
    // flushAllStoresAndWait fires flushPendingStores during destroy().
    const doc = server.hocuspocus.documents.get('test-doc');
    expect(doc).toBeDefined();
    doc?.removeDirectConnection();

    await server.destroy();

    const onDisk = await readFile(join(tmpDir, 'test-doc.md'), 'utf-8');
    expect(onDisk).toContain('hello world');

    // D14: behavioral contract — shutdown log emitted with flushedCount >= 1
    const shutdownLogs = logCapture.getCalls('info', 'shutdown flushed');
    expect(shutdownLogs).toHaveLength(1);
    expect(shutdownLogs[0].payload.flushedCount).toBeGreaterThanOrEqual(1);

    // No warn-level shutdown log means zero phaseErrors
    const warnShutdownLogs = logCapture.getCalls('warn', 'shutdown');
    expect(warnShutdownLogs).toHaveLength(0);
  });

  test('flushes L2 git commit after L1 drain', async () => {
    // Shadow repo needs contentDir to be a subdirectory of projectDir so
    // `git add <contentRoot>` has a valid pathspec. Mirror real-world layout.
    const { mkdirSync } = await import('node:fs');
    const projectDir = tmpDir;
    const contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    const shadowHandle = await initShadowRepo(projectDir);

    const server = createServer({
      contentDir,
      projectDir,
      contentRoot: 'content',
      quiet: true,
      debounce: 60_000,
      shadowRepo: shadowHandle,
    });
    await server.ready;

    const conn = await server.hocuspocus.openDirectConnection('test-doc-2');
    await conn.transact((doc) => {
      const xmlFragment = doc.getXmlFragment('default');
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText('commit me')]);
      xmlFragment.insert(0, [paragraph]);
    });

    // Release DirectConnection hold — same pattern as Test 1
    const doc = server.hocuspocus.documents.get('test-doc-2');
    expect(doc).toBeDefined();
    doc?.removeDirectConnection();

    await server.destroy();

    // Verify L2 git commit landed in shadow repo
    const sg = shadowGit(shadowHandle);
    const refSha = (await sg.raw('rev-parse', 'refs/wip/main/server')).trim();
    expect(refSha).toBeTruthy();
  });
});
