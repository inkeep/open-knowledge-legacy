import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as Y from 'yjs';
import { loggerFactory, type PinoLogger } from './logger.ts';
import {
  createManagedRenameRecoveryJournal,
  managedRenameJournalPath,
  writeManagedRenameJournal,
} from './managed-rename-journal.ts';
import { ensureProjectGit } from './project-git.ts';
import { createServer, type ServerInstance } from './server-factory.ts';
import { initShadowRepo, shadowGit } from './shadow-repo.ts';

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
    await ensureProjectGit(projectDir);
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

    // Verify L2 git commit landed in shadow repo — check for any WIP ref
    // (the exact writer ID depends on contributor-tracker state shared across tests)
    const sg = shadowGit(shadowHandle);
    const wipRefs = (await sg.raw('for-each-ref', '--format=%(refname)', 'refs/wip/')).trim();
    expect(wipRefs).toBeTruthy();
  });

  test('shutdown order: lock release happens AFTER L1 disk flush completes', async () => {
    // Locks in the invariant from specs/2026-04-24-cross-install-version-handshake
    // §6.4 + AC A6: phase 6 (`releaseServerLock`) must run AFTER phase 3
    // (`flushAllStoresAndWait`). Reordering them would let a concurrent
    // acquirer boot before in-flight writes have landed, racing two servers
    // against the same disk file.
    //
    // Strategy: hook `afterUnloadDocument` (fires from inside phase 3 for each
    // unloaded doc) and capture lock-file + content-file presence at that
    // exact moment. Phase-3 → phase-6 ordering means the lock MUST still
    // exist when this hook fires, and the disk write MUST have already
    // landed.
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
      debounce: 60_000, // Suppress natural flush — proves destroy-time path
    });
    await server.ready;

    const lockPath = join(tmpDir, '.open-knowledge', 'server.lock');
    const docName = 'shutdown-order';
    const contentPath = join(tmpDir, `${docName}.md`);
    const captures: Array<{ lockExists: boolean; contentOnDisk: boolean; payload: string }> = [];

    server.hocuspocus.configuration.extensions.push({
      async afterUnloadDocument(payload: { documentName: string }) {
        if (payload.documentName !== docName) return;
        captures.push({
          lockExists: existsSync(lockPath),
          contentOnDisk: existsSync(contentPath),
          payload: existsSync(contentPath) ? readFileSync(contentPath, 'utf-8') : '',
        });
      },
    });

    const conn = await server.hocuspocus.openDirectConnection(docName);
    await conn.transact((doc) => {
      const xmlFragment = doc.getXmlFragment('default');
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText('order-marker')]);
      xmlFragment.insert(0, [paragraph]);
    });
    const doc = server.hocuspocus.documents.get(docName);
    expect(doc).toBeDefined();
    doc?.removeDirectConnection();

    expect(existsSync(lockPath)).toBe(true);
    await server.destroy();

    // Phase-3 capture: at unload-time, the lock was still held AND the L1
    // write had already landed. If phase 6 ran before phase 3 finished, this
    // capture would see `lockExists: false`.
    expect(captures.length).toBe(1);
    expect(captures[0]?.lockExists).toBe(true);
    expect(captures[0]?.contentOnDisk).toBe(true);
    expect(captures[0]?.payload).toContain('order-marker');

    // Post-destroy: lock is gone, content survived. The standard end-state.
    expect(existsSync(lockPath)).toBe(false);
    expect(readFileSync(contentPath, 'utf-8')).toContain('order-marker');
  });

  test('destroy() completes within destroyTimeoutMs AND rescues hung docs when onStoreDocument throws', async () => {
    // Pre-construct shadow handle so the test can assert the D15 rescue-buffer
    // file exists on disk post-destroy. Mirrors Test 2's layout.
    const { mkdirSync } = await import('node:fs');
    const projectDir = tmpDir;
    const contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    await ensureProjectGit(projectDir);
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
    // state was preserved to <history-gitDir>/rescue/<docName>.md so the user
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

    // Only the boot-admitted synthetic DirectConnections — no content
    // documents loaded. flushAllStoresAndWait runs over them but the
    // persistence config-doc/system-doc short-circuits make each flush a
    // no-op. The short-circuit path completes fast.
    const startedAt = Date.now();
    await server.destroy();
    const elapsed = Date.now() - startedAt;

    // Short-circuit path resolves fast. Widened from 500ms → 2_000ms to avoid
    // flake on slow disks where initAsync (shadow repo + file watcher scan)
    // dominates the destroy timeline. The behavioral contract is "no 10s
    // timeout" — 2s still proves the short-circuit fired.
    expect(elapsed).toBeLessThan(2_000);

    // Shutdown log still emitted — documentCount counts the boot-admitted
    // synthetic docs (__system__, __config__/project, __user__/config.yml).
    const shutdownLogs = logCapture.getCalls('info', 'shutdown flushed');
    expect(shutdownLogs).toHaveLength(1);
    expect(shutdownLogs[0].payload.documentCount).toBe(3);
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

    // Shutdown log reports documentCount === 6 (3 content docs +
    // __system__ + 2 boot-admitted config docs).
    const shutdownLogs = logCapture.getCalls('info', 'shutdown flushed');
    expect(shutdownLogs).toHaveLength(1);
    expect(shutdownLogs[0].payload.documentCount).toBe(6);
  });
});

// ─── createServer() degraded signal tests (from PR #62) ─────────────────────
// These verify that ServerInstance.degraded correctly reports which subsystems
// failed to initialize. Combined into this file during the PR #62 ↔ PR #61
// merge so both test suites share the `server-factory.test.ts` filename.
//
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
    const src = readFileSync(resolve(dir, 'server-factory.ts'), 'utf-8');

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

// ─── US-005: config-doc admission + bridge bypass ──────────────────────────
//
// Spec: D39/D40/FR-29 (synthetic config docs admitted Y.Text-only at boot)
//       + D41/FR-30 (markdown observer bridge bypass for non-content docs).
// Subsystem short-circuits (persistence, agent-sessions, file-watcher,
// content-filter, etc.) are unit-tested in their respective files. This
// suite proves the boot-time admission + the bridge bypass end-to-end
// against a real Hocuspocus instance.

describe('createServer() — config-doc admission (US-005)', () => {
  let testProjectDir: string;

  beforeEach(() => {
    testProjectDir = mkdtempSync(resolve(tmpdir(), 'ok-config-admission-test-'));
  });

  afterEach(() => {
    rmSync(testProjectDir, { recursive: true, force: true });
  });

  test('boot admits both config docs alongside __system__', async () => {
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
    });

    await srv.ready;

    expect(srv.hocuspocus.documents.has('__system__')).toBe(true);
    expect(srv.hocuspocus.documents.has('__config__/project')).toBe(true);
    expect(srv.hocuspocus.documents.has('__user__/config.yml')).toBe(true);
    // Admission failures would surface as `degraded` entries — none expected
    // for a clean init.
    expect(srv.degraded.filter((s) => s.startsWith('config-doc:'))).toEqual([]);

    await srv.destroy();
  });

  test('Y.Text mutation on a config doc does NOT engage the markdown bridge (D41)', async () => {
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
    });

    await srv.ready;

    const configDoc = srv.hocuspocus.documents.get('__config__/project');
    expect(configDoc).toBeDefined();
    if (!configDoc) return;

    // Bridge contract: Observer B (Y.Text → XmlFragment) would populate the
    // 'default' XmlFragment from a Y.Text mutation. With the bypass in
    // server-observer-extension.ts, the bridge never attaches for config
    // docs, so the XmlFragment stays empty regardless of Y.Text content.
    const ytext = configDoc.getText('source');
    const xmlFragment = configDoc.getXmlFragment('default');
    expect(xmlFragment.length).toBe(0);

    configDoc.transact(() => {
      ytext.insert(0, 'theme: dark\n');
    });

    // Allow any debounced observer scheduling to settle (bridge would fire
    // synchronously inside the transact, but await one microtask round to
    // be safe).
    await new Promise((r) => setTimeout(r, 50));

    expect(ytext.toString()).toBe('theme: dark\n');
    // Bridge bypass verified: the XmlFragment was never populated.
    expect(xmlFragment.length).toBe(0);

    await srv.destroy();
  });

  test('connecting a transient client to a config doc succeeds via existing collab WS (D49)', async () => {
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
    });

    await srv.ready;

    // openDirectConnection is the in-process equivalent of a client
    // attaching over the collab WS — it goes through the same auth
    // extension. No additional gating needed for config docs (D49).
    const conn = await srv.hocuspocus.openDirectConnection('__config__/project');
    try {
      const document = conn.document;
      expect(document).toBeDefined();
      const text = document.getText('source');
      expect(typeof text.toString()).toBe('string');
    } finally {
      await conn.disconnect();
    }

    await srv.destroy();
  });
});

// ─── US-007: config file watcher ───────────────────────────────────────────
//
// Spec: FR-15 / D52 — chokidar single-file watch with awaitWriteFinish for
// atomic-rename detection, server-origin Y.Text update on external change,
// LKG-equality short-circuit prevents persistence-hook self-write feedback.

async function waitFor(predicate: () => boolean, timeoutMs = 4_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return predicate();
}

describe('createServer() — config file watcher (US-007)', () => {
  let testProjectDir: string;
  let testHomedir: string;

  beforeEach(() => {
    testProjectDir = mkdtempSync(resolve(tmpdir(), 'ok-cfg-watcher-test-'));
    testHomedir = mkdtempSync(resolve(tmpdir(), 'ok-cfg-watcher-home-'));
  });

  afterEach(() => {
    rmSync(testProjectDir, { recursive: true, force: true });
    rmSync(testHomedir, { recursive: true, force: true });
  });

  test('external write to project config.yml propagates to Y.Text within 4s', async () => {
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
      configHomedirOverride: testHomedir,
    });
    await srv.ready;

    const configDoc = srv.hocuspocus.documents.get('__config__/project');
    expect(configDoc).toBeDefined();
    if (!configDoc) {
      await srv.destroy();
      return;
    }
    const ytext = configDoc.getText('source');

    // Y.Text starts empty (no prior config.yml on disk).
    expect(ytext.toString()).toBe('');

    // Simulate a CLI / IDE / hand-edit creating the project config.
    const configPath = join(testProjectDir, '.open-knowledge', 'config.yml');
    mkdirSync(join(testProjectDir, '.open-knowledge'), { recursive: true });
    const newContent = 'mcp:\n  autoStart: false\n';
    writeFileSync(configPath, newContent, 'utf-8');

    const fired = await waitFor(() => ytext.toString() === newContent);
    expect(fired).toBe(true);

    await srv.destroy();
  });

  test('external broken-YAML write keeps Y.Text at LKG and does not crash the server', async () => {
    // Pre-seed a valid project config so the watcher's first read populates
    // LKG with valid content; then write broken YAML and assert Y.Text stays.
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const configPath = join(testProjectDir, '.open-knowledge', 'config.yml');
    mkdirSync(join(testProjectDir, '.open-knowledge'), { recursive: true });
    const validContent = 'mcp:\n  autoStart: false\n';
    writeFileSync(configPath, validContent, 'utf-8');

    const srv = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
      configHomedirOverride: testHomedir,
    });
    await srv.ready;

    const configDoc = srv.hocuspocus.documents.get('__config__/project');
    expect(configDoc).toBeDefined();
    if (!configDoc) {
      await srv.destroy();
      return;
    }
    const ytext = configDoc.getText('source');

    // Initial seed put validContent into Y.Text.
    expect(ytext.toString()).toBe(validContent);

    // Externally write broken YAML. Watcher fires, validation rejects;
    // Y.Text MUST stay at LKG.
    writeFileSync(configPath, 'mcp:\n  autoStart: !!!!!!!\n', 'utf-8');
    // Give the watcher a generous window to fire + reject.
    await new Promise((r) => setTimeout(r, 1_500));

    expect(ytext.toString()).toBe(validContent);

    await srv.destroy();
  });

  test('persistence-hook write does not produce a feedback-loop mutation (LKG-equality short-circuit)', async () => {
    const contentDir = mkdtempSync(resolve(testProjectDir, 'content-'));
    const srv = createServer({
      contentDir,
      projectDir: testProjectDir,
      quiet: true,
      configHomedirOverride: testHomedir,
    });
    await srv.ready;

    const configDoc = srv.hocuspocus.documents.get('__config__/project');
    expect(configDoc).toBeDefined();
    if (!configDoc) {
      await srv.destroy();
      return;
    }
    const ytext = configDoc.getText('source');

    // Mutate Y.Text under a normal origin so the persistence-hook fires
    // (no skipStoreHooks) and writes disk + updates LKG.
    const newContent = 'mcp:\n  autoStart: false\n';
    configDoc.transact(() => {
      ytext.insert(0, newContent);
    });

    const configPath = join(testProjectDir, '.open-knowledge', 'config.yml');
    const fileLanded = await waitFor(
      () => existsSync(configPath) && readFileSync(configPath, 'utf-8') === newContent,
    );
    expect(fileLanded).toBe(true);

    // Track all subsequent transactions for ~1s. The watcher will fire
    // because the disk file changed; applyExternalConfigChange must
    // short-circuit (LKG === content) and NOT mutate Y.Text again.
    const observedOrigins: unknown[] = [];
    configDoc.on('afterTransaction', (tx: { origin: unknown }) => {
      observedOrigins.push(tx.origin);
    });
    await new Promise((r) => setTimeout(r, 1_500));

    // Y.Text content must not have changed.
    expect(ytext.toString()).toBe(newContent);

    // No transactions fired with the file-watcher origin (which is what we
    // would see on a feedback loop).
    const filewatcherOrigins = observedOrigins.filter(
      (o) =>
        o !== null &&
        typeof o === 'object' &&
        'context' in o &&
        typeof (o as { context: unknown }).context === 'object' &&
        (o as { context: { origin?: unknown } }).context.origin === 'config-file-watcher',
    );
    expect(filewatcherOrigins).toEqual([]);

    await srv.destroy();
  });
});

describe('createServer() managed rename recovery', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ok-managed-rename-recovery-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('replays a pending managed rename journal before watcher startup', async () => {
    writeFileSync(join(tmpDir, 'beta.md'), '# Alpha\n', 'utf-8');
    writeFileSync(join(tmpDir, 'referrer.md'), 'See [[beta]].\n', 'utf-8');
    writeManagedRenameJournal(
      tmpDir,
      createManagedRenameRecoveryJournal({
        fromPath: 'alpha',
        toPath: 'beta',
        affectedDocs: [{ from: 'alpha', to: 'beta' }],
        snapshots: [
          { docName: 'alpha', content: '# Alpha\n' },
          { docName: 'referrer', content: 'See [[alpha]].\n' },
        ],
      }),
    );

    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
    });
    await server.ready;

    expect(readFileSync(join(tmpDir, 'alpha.md'), 'utf-8')).toBe('# Alpha\n');
    expect(readFileSync(join(tmpDir, 'referrer.md'), 'utf-8')).toBe('See [[alpha]].\n');
    expect(existsSync(join(tmpDir, 'beta.md'))).toBe(false);
    expect(existsSync(managedRenameJournalPath(tmpDir))).toBe(false);

    await server.destroy();
  });

  test('marks the server degraded when the managed rename journal is corrupt', async () => {
    mkdirSync(join(tmpDir, '.open-knowledge'), { recursive: true });
    writeFileSync(managedRenameJournalPath(tmpDir), '{not valid json', 'utf-8');

    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
    });
    await server.ready;

    expect(server.degraded).toContain('managed-rename-recovery');

    await server.destroy();
  });
});

// ─── V0-1: server-lock integration ──────────────────────────────────────────

describe('createServer() server-lock integration (V0-1)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ok-server-lock-int-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('acquires server.lock at createServer(), releases on destroy()', async () => {
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
    });
    await server.ready;

    const lockPath = join(tmpDir, '.open-knowledge', 'server.lock');
    expect(existsSync(lockPath)).toBe(true);
    const md = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(md.pid).toBe(process.pid);
    expect(md.worktreeRoot).toBe(tmpDir);

    await server.destroy();

    expect(existsSync(lockPath)).toBe(false);
  });

  test('exposes lockDir on ServerInstance', async () => {
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
    });
    await server.ready;

    expect(server.lockDir).toBe(join(tmpDir, '.open-knowledge'));

    await server.destroy();
  });

  test('second createServer() on same contentDir rejects with collision error', async () => {
    const first = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
    });
    await first.ready;

    // Seed a lock file with PID 1 (always alive) to simulate a foreign holder
    // (same process pid gets the idempotent path)
    const { hostname } = await import('node:os');
    const lockPath = join(tmpDir, '.open-knowledge', 'server.lock');
    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 1,
        hostname: hostname(),
        port: 9999,
        startedAt: new Date().toISOString(),
        worktreeRoot: tmpDir,
      }),
      'utf-8',
    );

    expect(() => createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true })).toThrow(
      /already running on port 9999/,
    );

    // Restore our own lock so destroy() cleans up
    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        hostname: hostname(),
        port: 0,
        startedAt: new Date().toISOString(),
        worktreeRoot: tmpDir,
      }),
      'utf-8',
    );

    await first.destroy();
  });

  test('updateServerLockPort through createServer().lockDir updates on-disk port', async () => {
    const { updateServerLockPort, readServerLock } = await import('./server-lock.ts');
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
    });
    await server.ready;

    const lockPath = join(tmpDir, '.open-knowledge', 'server.lock');
    const before = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(before.port).toBe(0);

    updateServerLockPort(server.lockDir, 5173);

    const after = readServerLock(server.lockDir);
    expect(after).not.toBeNull();
    expect(after?.port).toBe(5173);
    expect(after?.pid).toBe(process.pid);

    await server.destroy();
  });

  test('destroy() releases server.lock even when a shutdown phase throws (CC8)', async () => {
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      quiet: true,
    });
    await server.ready;

    const lockPath = join(tmpDir, '.open-knowledge', 'server.lock');
    expect(existsSync(lockPath)).toBe(true);

    // Inject Phase 2 failure: sessionManager.closeAll throws after normal cleanup
    const origCloseAll = server.sessionManager.closeAll.bind(server.sessionManager);
    server.sessionManager.closeAll = async () => {
      await origCloseAll();
      throw new Error('Injected Phase 2 failure');
    };

    await server.destroy();
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe('createServer() — serverInstanceId', () => {
  let tmpDirA: string;
  let tmpDirB: string;

  beforeEach(async () => {
    tmpDirA = await mkdtemp(join(tmpdir(), 'ok-iid-a-'));
    tmpDirB = await mkdtemp(join(tmpdir(), 'ok-iid-b-'));
  });

  afterEach(async () => {
    await rm(tmpDirA, { recursive: true, force: true });
    await rm(tmpDirB, { recursive: true, force: true });
  });

  test('each createServer() call produces a distinct serverInstanceId (UUID)', async () => {
    const serverA = createServer({ contentDir: tmpDirA, projectDir: tmpDirA, quiet: true });
    const serverB = createServer({ contentDir: tmpDirB, projectDir: tmpDirB, quiet: true });
    try {
      await serverA.ready;
      await serverB.ready;

      // Both IDs are non-empty strings.
      expect(typeof serverA.serverInstanceId).toBe('string');
      expect(serverA.serverInstanceId.length).toBeGreaterThan(0);
      expect(typeof serverB.serverInstanceId).toBe('string');
      expect(serverB.serverInstanceId.length).toBeGreaterThan(0);

      // UUID v4 shape (8-4-4-4-12 hex with the `-4` version nibble).
      expect(serverA.serverInstanceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(serverB.serverInstanceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      // Distinct between instances — this is the load-bearing property for
      // the CRDT restart-recovery defense: every server process advertises
      // a fresh ID so a client's cached prior ID will mismatch and force a
      // recycle before Yjs sync can merge stale state.
      expect(serverA.serverInstanceId).not.toBe(serverB.serverInstanceId);
    } finally {
      await serverA.destroy();
      await serverB.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// US-002 / Commit 4: onAuthenticate enforcement for expectedServerInstanceId.
// Exercises the principalAuthExtension directly rather than through a live
// WebSocket — the hook is deterministic and the onAuthenticate contract is
// "throw with reason X → client sees authenticationFailed({reason: X})".
// Full end-to-end behavior is covered by the bug-class integration tests
// (T1/T2/T6/T9 flip from FAIL→PASS at this commit).
// ---------------------------------------------------------------------------
describe("createServer() — onAuthenticate rejects 'server-instance-mismatch'", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ok-auth-mismatch-'));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Pull the principalAuthExtension out of the configured Hocuspocus
  // extensions list via its `__kind: 'principal-auth'` marker. Matching on a
  // named marker is robust against future additions of other extensions
  // that also implement `onAuthenticate` — the `find` by function existence
  // alone would silently pick the wrong one.
  function getAuthExtension(server: Awaited<ReturnType<typeof createServer>>): {
    onAuthenticate: (payload: unknown) => Promise<void>;
  } {
    const ext = server.hocuspocus.configuration.extensions.find(
      (e) => (e as { __kind?: string }).__kind === 'principal-auth',
    ) as { onAuthenticate: (payload: unknown) => Promise<void> } | undefined;
    if (!ext) throw new Error('expected principalAuthExtension on hocuspocus.configuration');
    return ext;
  }

  test('token claiming a mismatched expectedServerInstanceId is rejected', async () => {
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const authExt = getAuthExtension(server);

      const staleToken = JSON.stringify({
        principalId: 'p-1',
        tabSessionId: 's-1',
        expectedServerInstanceId: 'stale-server-id-from-prior-process',
      });
      const context: Record<string, unknown> = {};

      let thrown: unknown = null;
      try {
        await authExt.onAuthenticate({
          token: staleToken,
          context,
          documentName: 'test-doc',
        });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).not.toBeNull();
      expect((thrown as { reason?: string }).reason).toBe('server-instance-mismatch');
      // Rejection happens before context mutation — no partial state leaks
      // through to the connection's identity.
      expect(context.principalId).toBeUndefined();
      expect(context.kind).toBeUndefined();
    } finally {
      await server.destroy();
    }
  });

  test('token claiming the matching serverInstanceId is accepted', async () => {
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const authExt = getAuthExtension(server);

      const goodToken = JSON.stringify({
        principalId: 'p-1',
        tabSessionId: 's-1',
        expectedServerInstanceId: server.serverInstanceId,
      });
      const context: Record<string, unknown> = {};

      await authExt.onAuthenticate({
        token: goodToken,
        context,
        documentName: 'test-doc',
      });

      // No throw, and the principal path still hoisted the identity into ctx.
      expect(context.kind).toBe('human');
      expect(context.tabSessionId).toBe('s-1');
    } finally {
      await server.destroy();
    }
  });

  test('legacy token without expectedServerInstanceId is accepted (backward compat)', async () => {
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const authExt = getAuthExtension(server);

      const legacyToken = JSON.stringify({
        principalId: 'p-1',
        tabSessionId: 's-1',
      });
      const context: Record<string, unknown> = {};

      await authExt.onAuthenticate({
        token: legacyToken,
        context,
        documentName: 'test-doc',
      });

      expect(context.kind).toBe('human');
      expect(context.tabSessionId).toBe('s-1');
    } finally {
      await server.destroy();
    }
  });

  test('missing token is accepted (anonymous legacy path)', async () => {
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const authExt = getAuthExtension(server);
      const context: Record<string, unknown> = {};

      await authExt.onAuthenticate({
        token: undefined,
        context,
        documentName: 'test-doc',
      });

      // Anonymous path — no principal, no kind.
      expect(context.principalId).toBeUndefined();
      expect(context.kind).toBeUndefined();
    } finally {
      await server.destroy();
    }
  });

  test('empty-string expectedServerInstanceId claim is treated as absent (not rejected)', async () => {
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const authExt = getAuthExtension(server);

      const emptyClaimToken = JSON.stringify({
        principalId: 'p-1',
        tabSessionId: 's-1',
        expectedServerInstanceId: '',
      });
      const context: Record<string, unknown> = {};

      await authExt.onAuthenticate({
        token: emptyClaimToken,
        context,
        documentName: 'test-doc',
      });

      // No throw — empty claim is legacy-equivalent and accepted.
      expect(context.kind).toBe('human');
    } finally {
      await server.destroy();
    }
  });
});

// expectedBranch is the late-join backstop for cross-branch invalidation:
// CC1 `branch-switched` is stateless (no replay), so a client offline
// during the broadcast misses it. The auth-token claim mirrors
// expectedServerInstanceId — server rejects on mismatch, client routes
// the rejection through handleBranchSwitched.
describe("createServer() — onAuthenticate rejects 'branch-mismatch'", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ok-auth-branch-'));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function getAuthExtension(server: Awaited<ReturnType<typeof createServer>>): {
    onAuthenticate: (payload: unknown) => Promise<void>;
  } {
    const ext = server.hocuspocus.configuration.extensions.find(
      (e) => (e as { __kind?: string }).__kind === 'principal-auth',
    ) as { onAuthenticate: (payload: unknown) => Promise<void> } | undefined;
    if (!ext) throw new Error('expected principalAuthExtension on hocuspocus.configuration');
    return ext;
  }

  test('token claiming a mismatched expectedBranch is rejected', async () => {
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const authExt = getAuthExtension(server);
      // Server defaults activeBranch to 'main' when git is disabled or
      // not yet initialized — claim 'feature' to force the mismatch.
      const staleToken = JSON.stringify({
        principalId: 'p-1',
        tabSessionId: 's-1',
        expectedBranch: 'feature',
      });
      const context: Record<string, unknown> = {};

      let thrown: unknown = null;
      try {
        await authExt.onAuthenticate({
          token: staleToken,
          context,
          documentName: 'test-doc',
        });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).not.toBeNull();
      expect((thrown as { reason?: string }).reason).toBe('branch-mismatch');
      // Rejection runs before context hoisting.
      expect(context.principalId).toBeUndefined();
    } finally {
      await server.destroy();
    }
  });

  test('token claiming the matching branch is accepted', async () => {
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const authExt = getAuthExtension(server);

      const goodToken = JSON.stringify({
        principalId: 'p-1',
        tabSessionId: 's-1',
        expectedBranch: 'main', // server default
      });
      const context: Record<string, unknown> = {};

      await authExt.onAuthenticate({
        token: goodToken,
        context,
        documentName: 'test-doc',
      });

      expect(context.kind).toBe('human');
      expect(context.tabSessionId).toBe('s-1');
    } finally {
      await server.destroy();
    }
  });

  test('empty-string expectedBranch is treated as absent (legacy path)', async () => {
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const authExt = getAuthExtension(server);

      const emptyClaimToken = JSON.stringify({
        principalId: 'p-1',
        tabSessionId: 's-1',
        expectedBranch: '',
      });
      const context: Record<string, unknown> = {};

      await authExt.onAuthenticate({
        token: emptyClaimToken,
        context,
        documentName: 'test-doc',
      });

      // No throw — empty claim is legacy-equivalent and accepted.
      expect(context.kind).toBe('human');
    } finally {
      await server.destroy();
    }
  });

  test('legacy token without expectedBranch is accepted', async () => {
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const authExt = getAuthExtension(server);

      const legacyToken = JSON.stringify({
        principalId: 'p-1',
        tabSessionId: 's-1',
      });
      const context: Record<string, unknown> = {};

      await authExt.onAuthenticate({
        token: legacyToken,
        context,
        documentName: 'test-doc',
      });

      expect(context.kind).toBe('human');
    } finally {
      await server.destroy();
    }
  });
});
