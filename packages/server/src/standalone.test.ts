import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
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
    //
    // NOTE: removeDirectConnection() is an internal Hocuspocus API. See
    // SPEC.md §11 OQ-P2-06 for version-bump risk — any `@hocuspocus/server`
    // upgrade must re-verify this coupling along with the 7 other internals.
    const doc = server.hocuspocus.documents.get('test-doc');
    expect(doc).toBeDefined();
    doc?.removeDirectConnection();

    await server.destroy();

    const onDisk = await readFile(join(tmpDir, 'test-doc.md'), 'utf-8');
    expect(onDisk).toContain('hello world');

    // D14: behavioral contract — shutdown log emitted with documentCount >= 1
    const shutdownLogs = logCapture.getCalls('info', 'shutdown flushed');
    expect(shutdownLogs).toHaveLength(1);
    expect(shutdownLogs[0].payload.documentCount).toBeGreaterThanOrEqual(1);

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

  test('destroy() completes within destroyTimeoutMs AND rescues hung docs when onStoreDocument throws', async () => {
    // Pre-construct shadow handle so the test can assert the D15 rescue-buffer
    // file exists on disk post-destroy. Mirrors Test 2's layout.
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
      destroyTimeoutMs: 500, // D11: fast timeout for CI — not the 10s default
      shadowRepo: shadowHandle,
    });
    await server.ready;

    // Inject a failing onStoreDocument hook AFTER server construction.
    // Must throw a generic Error (not SkipFurtherHooksError) to hit the
    // "Document stays in memory to avoid data loss" branch at
    // Hocuspocus.ts:486-490 — this prevents afterUnloadDocument from
    // firing and triggers our timeout path.
    server.hocuspocus.configuration.extensions.push({
      async onStoreDocument() {
        throw new Error('simulated store failure');
      },
    });

    const conn = await server.hocuspocus.openDirectConnection('pathological-doc');
    await conn.transact((doc) => {
      const xmlFragment = doc.getXmlFragment('default');
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText('will not be flushed')]);
      xmlFragment.insert(0, [paragraph]);
    });

    // Release DirectConnection so closeConnections doesn't block unload
    const doc = server.hocuspocus.documents.get('pathological-doc');
    expect(doc).toBeDefined();
    doc?.removeDirectConnection();

    const startedAt = Date.now();
    await server.destroy();
    const elapsed = Date.now() - startedAt;

    // Behavioral contract (D11): destroy() fires the timeout path (not the 10s
    // default) when onStoreDocument throws. Widened bounds accommodate CI
    // scheduling jitter (GHA runners under load can add 100-500ms variance).
    expect(elapsed).toBeGreaterThanOrEqual(300);
    expect(elapsed).toBeLessThan(5_000);

    // D14: destroy() emits warn-level log with timeout phase error
    const warnLogs = logCapture.getCalls('warn', 'shutdown flushed');
    expect(warnLogs).toHaveLength(1);
    expect(warnLogs[0].payload.phaseErrors).toContainEqual(
      expect.objectContaining({
        phase: 'flush-all-stores',
        error: expect.stringContaining('timeout'),
      }),
    );

    // D15 / OQ-P2-02: rescue-buffer dump on flush timeout. The in-memory Y.Doc
    // state was preserved to <shadow-gitDir>/rescue/<docName>.md so the user
    // can recover via the existing /api/rescue endpoints.
    const rescuePath = join(shadowHandle.gitDir, 'rescue', 'pathological-doc.md');
    expect(existsSync(rescuePath)).toBe(true);
    expect(readFileSync(rescuePath, 'utf-8')).toContain('will not be flushed');

    // The timeout error should name the rescued doc so operators can correlate
    // the warn log's phaseErrors payload with on-disk rescue files.
    const phaseError = warnLogs[0].payload.phaseErrors as Array<{
      phase: string;
      error: string;
    }>;
    const flushErr = phaseError.find((e) => e.phase === 'flush-all-stores');
    expect(flushErr?.error).toContain('rescued [pathological-doc]');

    // Structured rescue log was emitted via the [rescue] category
    const rescueLogs = logCapture.getCalls('info', '[rescue]');
    expect(rescueLogs.length).toBeGreaterThanOrEqual(1);
    expect(rescueLogs[0].payload.docName).toBe('pathological-doc');
  });

  test('destroy() is idempotent under concurrent calls', async () => {
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
      debounce: 60_000,
    });
    await server.ready;

    // Write content so there's a non-trivial shutdown to exercise
    const conn = await server.hocuspocus.openDirectConnection('test-idempotent');
    await conn.transact((doc) => {
      const xmlFragment = doc.getXmlFragment('default');
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText('idempotent content')]);
      xmlFragment.insert(0, [paragraph]);
    });
    const doc = server.hocuspocus.documents.get('test-idempotent');
    expect(doc).toBeDefined();
    doc?.removeDirectConnection();

    // D9: fire two destroys in parallel — both should resolve, neither should throw.
    // The cached-Promise guard collapses them into one teardown.
    await Promise.all([server.destroy(), server.destroy()]);

    // Key assertion: only ONE shutdown log emitted (not two), proving the
    // cached-Promise guard prevented duplicate teardown.
    const shutdownLogs = logCapture.getCalls('info', 'shutdown flushed');
    expect(shutdownLogs).toHaveLength(1);

    // A third serial call after completion also resolves without throwing
    await server.destroy();
  });

  test('destroy() during async init — before ready resolves', async () => {
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
    });
    // DON'T await ready — call destroy() while initAsync is still running.
    // The `await ready.catch(() => {})` at the top of destroy() handles this.
    await server.destroy();

    // Should resolve cleanly without throwing and still emit a shutdown log
    const shutdownLogs = logCapture.getCalls('info', 'shutdown flushed');
    expect(shutdownLogs).toHaveLength(1);
  });

  test('destroy() with zero documents loaded (short-circuit path)', async () => {
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
    });
    await server.ready;

    // No DirectConnections opened — hocuspocus.documents is empty.
    // flushAllStoresAndWait short-circuits on documents.size === 0.
    const startedAt = Date.now();
    await server.destroy();
    const elapsed = Date.now() - startedAt;

    // Short-circuit path resolves fast. Widened from 500ms → 2_000ms to avoid
    // flake on slow disks where initAsync (shadow repo + file watcher scan)
    // dominates the destroy timeline. The behavioral contract is "no 10s
    // timeout" — 2s still proves the short-circuit fired.
    expect(elapsed).toBeLessThan(2_000);

    // Shutdown log still emitted with documentCount === 0
    const shutdownLogs = logCapture.getCalls('info', 'shutdown flushed');
    expect(shutdownLogs).toHaveLength(1);
    expect(shutdownLogs[0].payload.documentCount).toBe(0);
  });

  test('destroy() flushes multiple documents before resolving (multi-doc drain)', async () => {
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
      debounce: 60_000,
    });
    await server.ready;

    // Open 3 independent DirectConnections to different docs
    const conn1 = await server.hocuspocus.openDirectConnection('doc-a');
    const conn2 = await server.hocuspocus.openDirectConnection('doc-b');
    const conn3 = await server.hocuspocus.openDirectConnection('doc-c');

    await conn1.transact((doc) => {
      const frag = doc.getXmlFragment('default');
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText('content A')]);
      frag.insert(0, [p]);
    });
    await conn2.transact((doc) => {
      const frag = doc.getXmlFragment('default');
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText('content B')]);
      frag.insert(0, [p]);
    });
    await conn3.transact((doc) => {
      const frag = doc.getXmlFragment('default');
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText('content C')]);
      frag.insert(0, [p]);
    });

    // Release all DirectConnection holds
    for (const name of ['doc-a', 'doc-b', 'doc-c']) {
      const doc = server.hocuspocus.documents.get(name);
      expect(doc).toBeDefined();
      doc?.removeDirectConnection();
    }

    await server.destroy();

    // All three files should be on disk with their distinctive content
    expect(await readFile(join(tmpDir, 'doc-a.md'), 'utf-8')).toContain('content A');
    expect(await readFile(join(tmpDir, 'doc-b.md'), 'utf-8')).toContain('content B');
    expect(await readFile(join(tmpDir, 'doc-c.md'), 'utf-8')).toContain('content C');

    // Shutdown log reports documentCount === 3 (all docs drained)
    const shutdownLogs = logCapture.getCalls('info', 'shutdown flushed');
    expect(shutdownLogs).toHaveLength(1);
    expect(shutdownLogs[0].payload.documentCount).toBe(3);
  });
});
