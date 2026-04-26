/**
 * Tier 1 integration test harness.
 *
 * Spins up a real Hocuspocus server on a random OS-assigned port with all
 * production extensions (persistence, API, agent sessions, file watcher).
 * Connects a real HocuspocusProvider client over WebSocket with setupObservers()
 * wired — the exact same observer code path as the browser.
 *
 * Key design decisions:
 *   - getFreePort() pre-allocates a port because Hocuspocus Server.listen(port)
 *     has `if(port)` guard that's falsy for 0.
 *   - debounce: 200 for fast disk tests (D8)
 *   - Real @parcel/watcher for full production path
 *   - Content-based polling with timeout for disk assertions (D4)
 *   - Per-test docName via randomUUID() for test isolation (R1/R5)
 *   - Client lifecycle in test body via try/finally — NOT via beforeEach/afterEach
 *     (required for test.concurrent() correctness per R8a)
 */

import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { type AddressInfo, createServer as createNetServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import type { LocalTransactionOrigin } from '@hocuspocus/server';
import {
  MarkdownManager,
  normalizeBridge,
  prependFrontmatter,
  ServerInfoResponseSchema,
  sharedExtensions,
} from '@inkeep/open-knowledge-core';
import {
  createServer,
  ensureProjectGit,
  isPairedWriteOrigin,
  OBSERVER_SYNC_ORIGIN,
  type ServerInstance,
  type ServerOptions,
} from '@inkeep/open-knowledge-server';
import { getSchema } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import {
  ORIGIN_TEXT_TO_TREE,
  ORIGIN_TREE_TO_TEXT,
  setupObservers,
} from '../../src/editor/observers';
import type { ProviderPool } from '../../src/editor/provider-pool';
import {
  parseCC1BranchSwitched,
  parseCC1DiskAck,
  parseCC1ServerInfo,
  SYSTEM_DOC_NAME,
} from '../../src/lib/cc1';
import { ControllableWebSocket } from './network-control';

// ─── Shared instances (created once, reused across all tests) ───

export const mdManager = new MarkdownManager({ extensions: sharedExtensions });
export const schema = getSchema(sharedExtensions);

// ─── Port allocation ───

async function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

// ─── Server factory ───

export interface TestServer {
  port: number;
  contentDir: string;
  /** The underlying ServerInstance — exposes hocuspocus, sessionManager, cc1Broadcaster for direct-access tests. */
  instance: ServerInstance;
  cleanup: () => Promise<void>;
}

export interface CreateTestServerOptions {
  debounce?: ServerOptions['debounce'];
  maxDebounce?: ServerOptions['maxDebounce'];
  /** Reuse an existing content directory (for server-restart tests that need
   *  persistence to load canonical state written by a prior test-server instance).
   *  When provided, the caller owns directory lifecycle — cleanup() will not
   *  rm the directory. Pair with `keepContentDir: true` across all servers
   *  sharing this directory. */
  contentDir?: string;
  /** When true, `cleanup()` skips the `rmSync(contentDir)` so the directory
   *  survives for a subsequent test-server instance. Defaults to false
   *  (random-tmpdir behavior preserved). */
  keepContentDir?: boolean;
  /**
   * Grace period (ms) before keepalive-close triggers session cleanup. Default 10 000.
   * Integration tests pass a small value (e.g. 150) for fast teardown.
   */
  keepaliveGraceMs?: number;
  /**
   * Enable shadow-repo git commits. Default false (avoids git overhead in most tests).
   * Pass true to test paths gated on gitEnabled (e.g. CC1 session-activity signal).
   */
  gitEnabled?: boolean;
  /** Git commit debounce in ms. Only relevant when gitEnabled: true. Default 200 for tests. */
  commitDebounceMs?: number;
}

export async function createTestServer(options: CreateTestServerOptions = {}): Promise<TestServer> {
  // realpathSync resolves macOS /var → /private/var symlink so that
  // @parcel/watcher event paths match the contentDir used by pathToDocName.
  const contentDir =
    options.contentDir !== undefined
      ? realpathSync(options.contentDir)
      : realpathSync(mkdtempSync(join(tmpdir(), 'ok-test-')));
  // Ensure test-doc.md exists (persistence expects it for initial load).
  // On restart with pre-existing contentDir, the file is already present and
  // overwriting with '' would wipe the canonical state we're trying to reload.
  if (options.contentDir === undefined) {
    writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
  }

  // Mirror the production auto-git-init path (SPEC R2 / Q3 resolution): every
  // fresh tmpDir gets a real .git/ so the single-mode shadow-repo layout in
  // US-003 can locate the shadow at <contentDir>/.git/open-knowledge/ without
  // a standalone-mode fallback. On contentDir reuse (restart tests) the second
  // call is a cheap no-op because .git/ already exists.
  await ensureProjectGit(contentDir);

  const port = await getFreePort();
  const srv = createServer({
    contentDir,
    quiet: true,
    debounce: options.debounce ?? 200,
    maxDebounce: options.maxDebounce ?? 1000,
    gitEnabled: options.gitEnabled ?? false,
    commitDebounceMs: options.commitDebounceMs ?? 200,
    // When gitEnabled: true, the test-harness contentDir IS the tmpdir root (no
    // `content/` subdir). Persistence defaults contentRoot to 'content' when
    // `relative(projectDir, contentDir)` is empty — which breaks the
    // `git add content` call in buildWipTree. Override to '.' so the shadow-repo
    // pathspec matches the single-directory layout tests use.
    contentRoot: options.gitEnabled === true ? '.' : undefined,
    enableTestRoutes: true,
  });

  // R19: await file watcher readiness before returning so test.concurrent()
  // doesn't race the watcher startup
  await srv.ready;

  // Wire up HTTP server + WebSocket (same pattern as packages/cli/src/commands/start.ts)
  const httpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (url?.startsWith('/api/')) {
      srv.hocuspocus
        // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus `hooks()` has no exported payload type for onRequest
        .hooks('onRequest', { request: req, response: res } as any)
        .then(() => {
          if (res.writableEnded) return;
          // Unhandled /api/* route — 404 JSON. Matches production CLI and
          // dev-plugin behavior.
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'API route not found', path: url }));
        })
        .catch((err) => {
          console.error('[api] Unhandled onRequest error:', err);
          if (!res.writableEnded) {
            res.writeHead(500);
            res.end('Internal server error');
          }
        });
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  const wss = new WebSocketServer({ noServer: true });
  const KEEPALIVE_GRACE_MS = options.keepaliveGraceMs ?? 10_000;
  const keepaliveGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  httpServer.on('upgrade', (req, socket, head) => {
    // D-034 keepalive route (mirrors boot.ts logic — configurable grace for tests).
    if (req.url?.startsWith('/collab/keepalive')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        let connectionId: string | undefined;
        try {
          const sp = new URL(req.url ?? '', 'http://localhost').searchParams;
          connectionId = sp.get('connectionId') ?? undefined;
        } catch {
          // ignore malformed URL
        }
        if (connectionId) {
          const existing = keepaliveGraceTimers.get(connectionId);
          if (existing !== undefined) {
            clearTimeout(existing);
            keepaliveGraceTimers.delete(connectionId);
          }
        }
        ws.on('close', () => {
          if (!connectionId) return;
          const timer = setTimeout(async () => {
            keepaliveGraceTimers.delete(connectionId as string);
            try {
              await srv.sessionManager.closeAllForAgent(connectionId as string);
            } catch {
              // best-effort
            }
            try {
              srv.agentFocusBroadcaster?.clearFocus(connectionId as string);
            } catch {
              // best-effort
            }
          }, KEEPALIVE_GRACE_MS);
          timer.unref?.();
          keepaliveGraceTimers.set(connectionId, timer);
        });
        ws.on('error', () => ws.terminate());
      });
      return;
    }
    if (req.url?.startsWith('/collab')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        const clientConnection = srv.hocuspocus.handleConnection(
          ws as unknown as WebSocket,
          req as unknown as Request,
        );
        ws.on('message', (data: ArrayBuffer | Buffer) => {
          clientConnection.handleMessage(
            data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data),
          );
        });
        ws.on('close', (code: number, reason: Buffer) => {
          clientConnection.handleClose({ code, reason: reason.toString() });
        });
        ws.on('error', () => {
          ws.terminate();
        });
      });
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });

  return {
    port,
    contentDir,
    instance: srv,
    cleanup: async () => {
      await srv.destroy();
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      if (!options.keepContentDir) {
        rmSync(contentDir, { recursive: true, force: true });
      }
    },
  };
}

// ─── Client factory ───

export interface TestClient {
  doc: Y.Doc;
  ytext: Y.Text;
  fragment: Y.XmlFragment;
  provider: HocuspocusProvider;
  cleanup: () => Promise<void>;
  docName: string;
  /** Pause inbound CRDT sync. Only available when syncControl: true. */
  pauseSync: () => void;
  /** Resume inbound CRDT sync, draining queued messages. Only available when syncControl: true. */
  resumeSync: () => void;
}

export interface CreateTestClientOptions {
  /** Skip attaching the bridge invariant watcher. Use for tests that
   *  deliberately drive divergence (e.g., Bug-D skip-guarded test). */
  skipInvariantWatcher?: boolean;
  /** Wrap the WebSocket with a ControllableWebSocket for pause/resume sync. */
  syncControl?: boolean;
}

export async function createTestClient(
  port: number,
  docName?: string,
  options?: CreateTestClientOptions,
): Promise<TestClient> {
  const resolvedDocName = docName ?? `test-${crypto.randomUUID()}`;

  const doc = new Y.Doc();
  const ytext = doc.getText('source');
  const fragment = doc.getXmlFragment('default');

  // FR-16: optionally wrap WebSocket with ControllableWebSocket for pause/resume
  let controllableWs: ControllableWebSocket | undefined;
  const providerOpts: Record<string, unknown> = {
    url: `ws://localhost:${port}/collab`,
    name: resolvedDocName,
    document: doc,
    connect: true,
  };
  if (options?.syncControl) {
    providerOpts.WebSocketPolyfill = class extends ControllableWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        controllableWs = this;
      }
    };
  }

  const provider = new HocuspocusProvider(
    providerOpts as ConstructorParameters<typeof HocuspocusProvider>[0],
  );

  await waitForSync(provider);

  const observerCleanup = setupObservers({
    doc,
    xmlFragment: fragment,
    ytext,
    mdManager,
    schema,
  });

  // FR-11: attach bridge invariant watcher by default
  const watcherDetach = options?.skipInvariantWatcher
    ? undefined
    : attachBridgeInvariantWatcher(doc);

  return {
    doc,
    ytext,
    fragment,
    provider,
    docName: resolvedDocName,
    pauseSync: () => {
      if (!controllableWs) throw new Error('pauseSync requires syncControl: true');
      controllableWs.pauseInbound();
    },
    resumeSync: () => {
      if (!controllableWs) throw new Error('resumeSync requires syncControl: true');
      controllableWs.resumeInbound();
    },
    cleanup: async () => {
      watcherDetach?.();
      observerCleanup();
      // R9: unload the per-test doc on the server to prevent memory growth.
      // Best-effort — if the server is already shutting down or the network
      // fails during test.concurrent() teardown, a failed testReset must not
      // throw out of cleanup(). provider.destroy() + doc.destroy() are the
      // critical local-state cleanups and must still run.
      try {
        await testReset(port, resolvedDocName);
      } catch {
        // Cleanup is best-effort — the server-side doc will be reaped on
        // next onStoreDocument or process exit.
      }
      provider.destroy();
      doc.destroy();
    },
  };
}

// ─── Utilities ───
export function waitForSync(provider: HocuspocusProvider, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Provider sync timeout')), timeoutMs);
    provider.on('synced', () => {
      clearTimeout(timer);
      resolve();
    });
    if (provider.isSynced) {
      clearTimeout(timer);
      resolve();
    }
  });
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wipe every `ok-ydoc:` IDB database in the fake-indexeddb backend so
 * subsequent tests in the same bun process start from a clean slate.
 * fake-indexeddb persists state across tests within a single process;
 * integration tests that share doc names (e.g., the common `'test-doc'`
 * harness name) need this helper in `afterEach` to avoid hydrating the
 * next test from stale state.
 */
export async function resetFakeIndexedDB(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const dbs = await indexedDB.databases();
  await Promise.all(
    dbs.map((info) => {
      if (info.name === undefined) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(info.name as string);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }),
  );
}

/**
 * Pre-populate the fake-IDB database at `ok-ydoc:${branch}:${docName}`
 * with the given Y.Doc updates, simulating a browser tab that had
 * previously connected and persisted some content. Used by T14
 * (populated-IDB meets stale server) to stage the precondition.
 *
 * The default branch `'main'` matches what tests use when they don't
 * exercise the cross-branch axis. Pass a different branch to set up
 * cross-branch scenarios (e.g., seed a stale branch-A IDB, then have
 * the pool open against branch-B).
 *
 * Spins up an ephemeral `ClientPersistenceProvider`, applies each
 * update via `Y.applyUpdate`, lets the upstream y-indexeddb
 * `_storeUpdate` listener flush to IDB, then cleanly destroys the
 * provider + doc. On return the IDB data survives — the next
 * `new IndexeddbPersistence(sameName, ...)` will hydrate from it.
 */
export async function seedClientPersistenceState(
  docName: string,
  updates: Uint8Array[],
  branch: string = 'main',
): Promise<void> {
  const { createClientPersistence } = await import('../../src/editor/client-persistence');
  const doc = new Y.Doc();
  const persistence = createClientPersistence(branch, docName, doc);
  try {
    await persistence.whenSynced;
    for (const update of updates) {
      Y.applyUpdate(doc, update);
    }
    // Let the y-indexeddb `_storeUpdate` listener flush pending writes to
    // fake-indexeddb before we tear down — otherwise destroy() can race the
    // last addAutoKey.
    await wait(0);
  } finally {
    await persistence.destroy();
    doc.destroy();
  }
}

/**
 * Assert that the fake-IDB database at `ok-ydoc:${branch}:${docName}` is
 * empty — either the database doesn't exist at all (the `clearData`
 * happy path: `deleteDB` removed it), or it exists but has zero records
 * in the `updates` store (defensive: if a schema quirk leaves the DB
 * with a fresh empty store).
 *
 * Default branch `'main'` matches the integration-test seed default.
 * Throws if the DB exists AND has at least one persisted update, with a
 * count in the error message.
 */
export async function assertIDBEmpty(docName: string, branch: string = 'main'): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const dbName = `ok-ydoc:${branch}:${docName}`;
  const dbs = await indexedDB.databases();
  const info = dbs.find((d) => d.name === dbName);
  if (info === undefined) return;

  const count = await new Promise<number>((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('updates')) {
        db.close();
        resolve(0);
        return;
      }
      try {
        const tx = db.transaction('updates', 'readonly');
        const store = tx.objectStore('updates');
        const countReq = store.count();
        countReq.onsuccess = () => {
          db.close();
          resolve(countReq.result);
        };
        countReq.onerror = () => {
          db.close();
          reject(countReq.error);
        };
      } catch (err) {
        db.close();
        if ((err as Error)?.name === 'NotFoundError') {
          resolve(0);
          return;
        }
        reject(err);
      }
    };
  });

  if (count !== 0) {
    throw new Error(`assertIDBEmpty: expected ${dbName} to have 0 updates, found ${count}`);
  }
}

/**
 * Structural quiescence gate — resolves once the doc has NO in-flight
 * transactions AND no `afterAllTransactions` listener fires for N
 * consecutive microtasks. Use instead of wall-clock `wait(ms)` when a test
 * needs to wait for a local doc's pending observer work (including the
 * settlement dispatcher's inner OBSERVER_SYNC_ORIGIN writes) to settle.
 *
 * Precedent #13(b): settlement-based, NOT wall-clock. Under the
 * server-authoritative bridge (SPEC §6 R4), observer work fires
 * synchronously inside `afterAllTransactions` — but some paths kick a
 * follow-up `doc.transact(..., OBSERVER_SYNC_ORIGIN)` which starts a new
 * drain. This helper waits until a short quiet window passes with no new
 * drains to catch that cascade deterministically.
 *
 * The `idleTicks` count (default 2) must be >= 2 so the first tick can
 * observe an in-flight drain and the second confirms the drain finished
 * without a follow-up. `idleTicks: 1` is INSUFFICIENT for the seed-class
 * races this helper exists to catch: Observer A's inner
 * `OBSERVER_SYNC_ORIGIN` write scheduled via `queueMicrotask` can land on
 * a later tick than the outer drain, so a single idle observation can
 * return before the cascade completes. Raise `idleTicks` for particularly
 * nested observer cascades; lower is unsafe.
 *
 * `timeoutMs` (default 2000) guards against hangs; throws a clear error
 * pointing at the doc if quiescence is never reached.
 *
 * Does NOT cover inter-doc / inter-client WebSocket propagation — for
 * multi-client convergence, combine with `assertAllConverged` or equivalent
 * polling gates.
 */
export async function awaitDocQuiescence(
  doc: Y.Doc,
  opts?: { timeoutMs?: number; idleTicks?: number },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 2000;
  const idleTicks = Math.max(2, opts?.idleTicks ?? 2);

  let dirty = false;
  const markDirty = (): void => {
    dirty = true;
  };
  doc.on('afterAllTransactions', markDirty);
  try {
    const start = Date.now();
    let consecutiveIdle = 0;
    while (Date.now() - start < timeoutMs) {
      if (dirty) {
        dirty = false;
        consecutiveIdle = 0;
      } else {
        consecutiveIdle++;
        if (consecutiveIdle >= idleTicks) return;
      }
      // Yield to the microtask queue + one macro tick — lets pending
      // transacts drain and observer follow-ups fire.
      await wait(0);
    }
    throw new Error(`awaitDocQuiescence: doc did not settle within ${timeoutMs} ms`);
  } finally {
    doc.off('afterAllTransactions', markDirty);
  }
}

/** Serialize XmlFragment to markdown string */
export function serializeFragment(fragment: Y.XmlFragment): string {
  return mdManager.serialize(yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON());
}

/** Strip trailing whitespace per line + trailing newlines */
export function stripTrailingWhitespace(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

/** Assert bridge invariant: normalized Y.Text === serialized XmlFragment.
 * Normalization includes NG1: blank-line count between blocks may normalize
 * (ProseMirror schema limitation). Collapse 3+ consecutive newlines to 2. */
export function assertBridgeInvariant(ytext: Y.Text, fragment: Y.XmlFragment): void {
  const textNorm = normalizeBridge(ytext.toString());
  const fragNorm = normalizeBridge(serializeFragment(fragment));
  if (textNorm !== fragNorm) {
    throw new Error(
      `Bridge invariant violated.\n` +
        `  Y.Text (${textNorm.length} chars): ${textNorm.slice(0, 200)}...\n` +
        `  Fragment (${fragNorm.length} chars): ${fragNorm.slice(0, 200)}...`,
    );
  }
}

// normalizeBridge imported from @inkeep/open-knowledge-core (precedent #4:
// shared computation, per-surface rendering).

/** Read a document's .md file from the content directory */
export function readTestDoc(contentDir: string, docName = 'test-doc'): string {
  try {
    return readFileSync(join(contentDir, `${docName}.md`), 'utf-8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw err;
  }
}

/** POST to agent-write-md endpoint. Identity fields are optional — omit to use server defaults. */
export async function agentWriteMd(
  port: number,
  markdown: string,
  opts?: {
    docName?: string;
    position?: 'append' | 'prepend' | 'replace';
    agentId?: string;
    agentName?: string;
    clientName?: string;
    colorSeed?: string;
  },
): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      markdown,
      position: opts?.position ?? 'append',
      docName: opts?.docName,
      agentId: opts?.agentId,
      agentName: opts?.agentName,
      clientName: opts?.clientName,
      colorSeed: opts?.colorSeed,
    }),
  });
  if (!res.ok) throw new Error(`agent-write-md failed: ${res.status}`);
}

/** POST to agent-patch endpoint (find-and-replace) */
export async function agentPatch(
  port: number,
  find: string,
  replace: string,
  docName?: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const res = await fetch(`http://localhost:${port}/api/agent-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ find, replace, docName }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, status: res.status, error: body.error ?? 'unknown' };
  }
  return { ok: true };
}

/** POST to agent-undo endpoint (V0-14 per-session undo) */
export async function agentUndo(
  port: number,
  opts: { docName?: string; connectionId: string; scope?: 'last' | 'session' },
): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/agent-undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docName: opts.docName,
      connectionId: opts.connectionId,
      scope: opts.scope ?? 'last',
    }),
  });
  if (!res.ok) throw new Error(`agent-undo failed: ${res.status}`);
}

/** POST to test-reset endpoint */
export async function testReset(port: number, docName?: string): Promise<void> {
  const url = docName
    ? `http://localhost:${port}/api/test-reset?docName=${encodeURIComponent(docName)}`
    : `http://localhost:${port}/api/test-reset`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
}

/**
 * Poll a condition until it returns true, with timeout.
 * Used for content-based assertions on async propagation (D4).
 */
export async function pollUntil(
  condition: () => boolean,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await wait(intervalMs);
  }
  throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
}

/**
 * Poll the server's in-memory file index (via `GET /api/documents`) until
 * the given `docPath` appears. Replaces the `await wait(N)` anti-pattern
 * after `seedDoc(server.contentDir, docName, …)` — the file watcher
 * (chokidar / @parcel/watcher) batches create events asynchronously, so a
 * wall-clock sleep is both slow (overly conservative) and flaky
 * (occasionally insufficient under CI load).
 *
 * `docPath` is the canonical doc name as the server indexes it — i.e. the
 * path relative to `contentDir`, WITHOUT the `.md` suffix (matches what
 * `/api/documents` returns in each entry's `docName` field). E.g. for a
 * file at `<contentDir>/folder/README.md`, pass `"folder/README"`.
 *
 * Usage:
 *
 *   seedDoc(server.contentDir, `${folder}/README`, '# Hub\n…');
 *   await awaitFileWatcherIndexed(server, `${folder}/README`);
 *   // …now safe to call /api/agent-write-md and expect the hub to be
 *   //   visible to findHubCandidates / backlinkIndex lookups.
 */
export async function awaitFileWatcherIndexed(
  server: TestServer,
  docPath: string,
  // 45_000 matches the CI-worst-case budget already documented at the call
  // sites (e.g. `ORPHAN_HINT_TEST_TIMEOUT_MS` in agent-focus-wiring.test.ts).
  // parcel-watcher on Linux CI occasionally dispatches inotify events for
  // files in newly-created subdirectories with >30s latency under load.
  // Per precedent set by PR #220 ("bump integration test timeouts").
  timeoutMs = 45_000,
): Promise<void> {
  const start = Date.now();
  let lastStatus = 0;
  let lastBodyPreview = '';
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`http://localhost:${server.port}/api/documents`).catch((err) => {
      lastStatus = -1;
      lastBodyPreview = `fetch error: ${String(err).slice(0, 80)}`;
      return null;
    });
    if (res?.ok) {
      lastStatus = res.status;
      const data = (await res.json()) as { ok: boolean; documents?: Array<{ docName: string }> };
      lastBodyPreview = `ok, docs=${data.documents?.length ?? 0}`;
      if (data.ok && data.documents?.some((d) => d.docName === docPath)) {
        return;
      }
    } else if (res) {
      lastStatus = res.status;
      lastBodyPreview = `non-ok status`;
    }
    await wait(50);
  }
  throw new Error(
    `awaitFileWatcherIndexed: ${docPath} not indexed within ${timeoutMs}ms (last status=${lastStatus}, ${lastBodyPreview})`,
  );
}

/**
 * Poll the server's backlink index (via `GET /api/backlinks?docName=…`)
 * until `targetDocName` has a backlink from `sourceDocName`. Replaces the
 * `await wait(N)` anti-pattern after seeding a doc whose body contains
 * `[[${targetDocName}]]` — the file watcher publishes the file first, then
 * the backlink index asynchronously parses the body to update its
 * source→target map. Two-stage async gap that a single wall-clock sleep
 * cannot robustly close.
 *
 * Watcher-drop recovery: on Linux CI, `@parcel/watcher` can drop `create`
 * events for files rapidly written into freshly-created subdirectories
 * (inotify subwatch registration race — PR #234 documents the same class
 * at the workflow level). If the target's backlink hasn't shown up by
 * `rescueAfterMs`, this helper POSTs to the test-only
 * `/api/test-rescan-backlinks` endpoint once — which forces
 * `backlinkIndex.rebuildFromDisk()` and covers dropped events. The rescue
 * is a one-shot: if polling still fails after rescue, the timeout error
 * surfaces (indicating a real setup bug, not a watcher flake).
 *
 * Usage:
 *
 *   seedDoc(server.contentDir, `${folder}/README`, `[[${target}]]`);
 *   seedDoc(server.contentDir, target, '# body');
 *   await awaitBacklinkIndexed(server, target, `${folder}/README`);
 *   // …now safe to assume the backlink index reflects the README→target
 *   //   link; computeOrphanHints will see `target` as non-orphan.
 */
export async function awaitBacklinkIndexed(
  server: TestServer,
  targetDocName: string,
  sourceDocName: string,
  timeoutMs = 30_000,
  rescueAfterMs = 2_000,
): Promise<void> {
  const start = Date.now();
  let lastStatus = 0;
  let rescueTriggered = false;
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `http://localhost:${server.port}/api/backlinks?docName=${encodeURIComponent(targetDocName)}`,
    ).catch(() => null);
    if (res?.ok) {
      lastStatus = res.status;
      const data = (await res.json()) as {
        ok: boolean;
        backlinks?: Array<{ source: string }>;
      };
      if (data.ok && data.backlinks?.some((b) => b.source === sourceDocName)) return;
    } else if (res) {
      lastStatus = res.status;
    }
    if (!rescueTriggered && Date.now() - start >= rescueAfterMs) {
      rescueTriggered = true;
      await fetch(`http://localhost:${server.port}/api/test-rescan-backlinks`, {
        method: 'POST',
      }).catch(() => null);
    }
    await wait(50);
  }
  throw new Error(
    `awaitBacklinkIndexed: ${sourceDocName} → ${targetDocName} not indexed within ${timeoutMs}ms (last status=${lastStatus}, rescueTriggered=${rescueTriggered})`,
  );
}

// ─── Server-side state inspector (FR-13) ───

export type ServerDocState = {
  ytext: Y.Text;
  fragment: Y.XmlFragment;
  /** Body only (no frontmatter) — serialized from the server's XmlFragment */
  md: string;
  /** Frontmatter + body — full markdown as would be persisted to disk */
  fullMd: string;
  frontmatter: string;
  metaMap: Y.Map<unknown>;
  activityMap: Y.Map<unknown>;
  connectionCount: number;
};

/**
 * Inspect the server's internal Y.Doc state for a given docName.
 *
 * Encapsulates `server.instance.hocuspocus.documents.get(docName)` behind a
 * typed, documented surface. Returns null when the doc is not loaded on the
 * server (observable via pollUntil when tests need to wait for doc init).
 */
export function getServerState(server: TestServer, docName: string): ServerDocState | null {
  const document = server.instance.hocuspocus.documents.get(docName);
  if (!document) return null;

  const ytext = document.getText('source');
  const fragment = document.getXmlFragment('default');
  const metaMap = document.getMap('metadata');
  const activityMap = document.getMap('agent-flash');
  const frontmatter = (metaMap.get('frontmatter') as string | undefined) ?? '';
  const md = mdManager.serialize(yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON());
  const fullMd = prependFrontmatter(frontmatter, md);
  const connectionCount = document.getConnectionsCount?.() ?? 0;

  return {
    ytext,
    fragment,
    md,
    fullMd,
    frontmatter,
    metaMap,
    activityMap,
    connectionCount,
  };
}

// ─── Bridge invariant watcher (FR-11) ───

/**
 * Non-paired origins that the bridge-invariant watcher enforces via identity
 * match. Paired origins (context.paired === true — including all per-session
 * origins created by F1, FILE_WATCHER_ORIGIN, ROLLBACK_ORIGIN, etc.) are
 * covered by the structural `isPairedWriteOrigin(tx.origin)` check in
 * `attachBridgeInvariantWatcher` — no need to list them here.
 *
 * Deliberately excludes `undefined` (local WYSIWYG typing) — its invariant
 * satisfaction comes via a subsequent ORIGIN_TREE_TO_TEXT tx from Observer A.
 */
const BRIDGE_ENFORCING_NON_PAIRED_ORIGINS: Set<LocalTransactionOrigin> = new Set([
  ORIGIN_TREE_TO_TEXT,
  ORIGIN_TEXT_TO_TREE,
  OBSERVER_SYNC_ORIGIN,
]);

export interface InvariantViolation {
  origin: unknown;
  ytextSnapshot: string;
  fragmentMdSnapshot: string;
  unifiedDiff: string;
  stack: string | undefined;
}

export class BridgeInvariantViolationError extends Error {
  readonly violation: InvariantViolation;
  constructor(info: InvariantViolation) {
    const originLabel =
      typeof info.origin === 'string'
        ? info.origin
        : ((info.origin as { context?: { origin?: string } })?.context?.origin ?? 'unknown-object');
    super(
      `Bridge invariant violated after tx with origin '${originLabel}'.\n` +
        `  Y.Text (${info.ytextSnapshot.length} chars): ${info.ytextSnapshot.slice(0, 200)}...\n` +
        `  Fragment (${info.fragmentMdSnapshot.length} chars): ${info.fragmentMdSnapshot.slice(0, 200)}...\n` +
        `  Diff:\n${info.unifiedDiff}`,
    );
    this.name = 'BridgeInvariantViolationError';
    this.violation = info;
  }
}

/**
 * Attach a per-transaction bridge invariant watcher to a Y.Doc.
 *
 * After every transaction whose origin is in the enforcing set, asserts:
 *   normalizeBridge(ytext) === normalizeBridge(prependFrontmatter(fm, serialize(fragment)))
 *
 * where normalizeBridge strips trailing whitespace per line and collapses
 * 3+ consecutive newlines to 2 (NG1: blank-line count normalization).
 *
 * Returns a detach function that removes the observer.
 */
export function attachBridgeInvariantWatcher(
  doc: Y.Doc,
  opts: {
    onViolation?: (info: InvariantViolation) => void;
    /** Extra non-paired origins to enforce on in addition to the defaults.
     *  Paired origins (context.paired === true) are always covered by the
     *  structural isPairedWriteOrigin check and do not need to be listed. */
    enforcingOrigins?: Set<unknown>;
  } = {},
): () => void {
  const fragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  const extraNonPaired = opts.enforcingOrigins;

  const afterTx = (tx: Y.Transaction): void => {
    // Enforce on: (a) any paired-write origin (covers all per-session origins
    // from F1 + FILE_WATCHER_ORIGIN, ROLLBACK_ORIGIN, MANAGED_RENAME_ORIGIN,
    // PARK_SNAPSHOT_ORIGIN, etc. — structural check, precedent #1/D18), OR
    // (b) the well-known non-paired origins (ORIGIN_TREE_TO_TEXT, ORIGIN_TEXT_TO_TREE,
    // OBSERVER_SYNC_ORIGIN) identified by object-identity, OR (c) any extra
    // non-paired origin passed in opts.enforcingOrigins.
    const shouldEnforce =
      isPairedWriteOrigin(tx.origin) ||
      BRIDGE_ENFORCING_NON_PAIRED_ORIGINS.has(tx.origin as LocalTransactionOrigin) ||
      extraNonPaired?.has(tx.origin);
    if (!shouldEnforce) return;

    const ytextStr = ytext.toString();
    const fm = (doc.getMap('metadata').get('frontmatter') as string | undefined) ?? '';
    const fragBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON(),
    );
    const fragMd = prependFrontmatter(fm, fragBody);

    const ytextNorm = normalizeBridge(ytextStr);
    const fragNorm = normalizeBridge(fragMd);

    if (ytextNorm === fragNorm) return;

    const info: InvariantViolation = {
      origin: tx.origin,
      ytextSnapshot: ytextStr,
      fragmentMdSnapshot: fragMd,
      unifiedDiff: `  ytext: ${ytextNorm.slice(0, 300)}\n  frag:  ${fragNorm.slice(0, 300)}`,
      stack: new Error().stack,
    };
    opts.onViolation?.(info);
    throw new BridgeInvariantViolationError(info);
  };

  doc.on('afterTransaction', afterTx);
  return () => {
    doc.off('afterTransaction', afterTx);
  };
}

// ─── Origin-preservation probe (FR-12) ───

export interface ItemOriginProbe {
  recordCapture(label?: string): void;
  assertCaptureIntact(label?: string): void;
  capturedContent(): string;
  undoStackLength(): number;
  /** Origins observed at capture time via `'stack-item-added'` events.
   *  Returns the set of distinct tx.origin values the UM has tracked.
   *  Empty if no items have been captured yet. */
  getCapturedOrigins(): ReadonlySet<unknown>;
  /** Assert that every captured origin is in the `trackedOrigins` set
   *  provided at construction. Throws if a stray origin appears — which
   *  would indicate origin-laundering (a non-tracked origin's Items ended
   *  up in the UM stack, e.g., user content under a different session's origin).
   *
   *  Safe to call when no items have been captured (silently returns).
   *  Call AFTER convergence, not mid-sequence — the UM may legitimately
   *  capture items from a tracked origin that hasn't fully settled yet. */
  assertOnlyTrackedOrigins(): void;
  cleanup(): void;
}

/**
 * Create a probe wrapping Y.UndoManager that records stack state and asserts
 * Items-remained-captured. Replaces scattered inline `new Y.UndoManager(...)`
 * in test code.
 *
 * `trackedOrigins` must contain `LocalTransactionOrigin` OBJECT references per
 * precedent #1 (AGENTS.md) — e.g., per-session `session.origin`, `ORIGIN_TREE_TO_TEXT`,
 * `ORIGIN_TEXT_TO_TREE`, `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`. `Y.UndoManager`'s
 * internal `trackedOrigins.has(tx.origin)` is identity-based for objects — a raw
 * string literal would silently fail to match the production tx.origin object.
 * Note: in multi-client server-authoritative tests, server-side writes arrive
 * at clients as remote transactions (undefined origin) — pass `session.origin`
 * from a server-side `AgentSessionManager.getSession()` call to track local writes.
 */
export function createItemOriginProbe(
  ytext: Y.Text,
  opts: { trackedOrigins: Array<LocalTransactionOrigin>; captureTimeout?: number },
): ItemOriginProbe {
  const trackedSet = new Set(opts.trackedOrigins);
  const um = new Y.UndoManager(ytext, {
    trackedOrigins: trackedSet,
    captureTimeout: opts.captureTimeout ?? 0,
  });
  const captures = new Map<string, { stackLength: number; content: string }>();

  // FR-6 origin-laundering detection: accumulate distinct tx.origin values
  // observed at capture time. Y.UndoManager's StackItem has no public
  // `.origin` field (verified from UndoManager.d.ts); the only public API
  // that exposes origin is the `'stack-item-added'` event at capture time.
  const capturedOrigins = new Set<unknown>();
  const onStackItemAdded = (event: { origin: unknown }) => {
    capturedOrigins.add(event.origin);
  };
  um.on('stack-item-added', onStackItemAdded);

  return {
    recordCapture(label = 'default') {
      captures.set(label, {
        stackLength: um.undoStack.length,
        content: ytext.toString(),
      });
    },
    assertCaptureIntact(label = 'default') {
      const cap = captures.get(label);
      if (!cap) throw new Error(`No capture recorded for label: ${label}`);
      if (um.undoStack.length < cap.stackLength) {
        throw new Error(
          `Origin probe: tracked Items disappeared from UM stack. ` +
            `Expected >=${cap.stackLength}, got ${um.undoStack.length}.`,
        );
      }
    },
    capturedContent: () => ytext.toString(),
    undoStackLength: () => um.undoStack.length,
    getCapturedOrigins: () => capturedOrigins,
    assertOnlyTrackedOrigins() {
      for (const origin of capturedOrigins) {
        if (!trackedSet.has(origin as LocalTransactionOrigin)) {
          const originLabel =
            typeof origin === 'object' && origin !== null && 'context' in origin
              ? ((origin as { context?: { origin?: string } }).context?.origin ?? 'unknown-object')
              : String(origin);
          throw new Error(
            `Origin probe: captured a stray origin '${originLabel}' not in trackedOrigins set. ` +
              `This indicates origin-laundering — Items under an untracked origin ended up ` +
              `in the UM stack. trackedOrigins: [${opts.trackedOrigins.map((o) => (o as { context?: { origin?: string } }).context?.origin ?? '?').join(', ')}]`,
          );
        }
      }
    },
    cleanup() {
      um.off('stack-item-added', onStackItemAdded);
      um.destroy();
    },
  };
}

// ─── Multi-client factory + convergence assert (FR-14) ──��

export class ClientConvergenceError extends Error {
  constructor(details: string) {
    super(`Client convergence timed out.\n${details}`);
    this.name = 'ClientConvergenceError';
  }
}

/**
 * Create multiple TestClients all joined to the same docName.
 * Auto-generates docName if not provided.
 */
export async function createTestClients(
  port: number,
  opts: { count: number; docName?: string; perClientOptions?: CreateTestClientOptions },
): Promise<TestClient[]> {
  const docName = opts.docName ?? `test-${crypto.randomUUID()}`;
  const clients: TestClient[] = [];
  for (let i = 0; i < opts.count; i++) {
    clients.push(await createTestClient(port, docName, opts.perClientOptions));
  }
  return clients;
}

/**
 * Poll until all clients have converged: identical ytext, identical fragment
 * serialization, and bridge invariant holds on each. Throws on timeout.
 */
export async function assertAllConverged(
  clients: TestClient[],
  opts: { timeout?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const timeout = opts.timeout ?? 2000;
  const pollMs = opts.pollIntervalMs ?? 50;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ytexts = clients.map((c) => c.ytext.toString());
    const fragMds = clients.map((c) => serializeFragment(c.fragment));
    const allYtextSame = ytexts.every((t) => t === ytexts[0]);
    const allFragSame = fragMds.every((m) => m === fragMds[0]);
    if (allYtextSame && allFragSame) {
      // Also verify bridge invariant on each
      for (const c of clients) {
        assertBridgeInvariant(c.ytext, c.fragment);
      }
      return;
    }
    await wait(pollMs);
  }
  // Build per-client diff for error message
  const details = clients
    .map(
      (c, i) =>
        `  Client ${i} (${c.docName}):\n` +
        `    ytext (${c.ytext.toString().length}): ${c.ytext.toString().slice(0, 200)}\n` +
        `    frag  (${serializeFragment(c.fragment).length}): ${serializeFragment(c.fragment).slice(0, 200)}`,
    )
    .join('\n');
  throw new ClientConvergenceError(details);
}

// ═══════════════════════════════════════════════════════════════════════════
// T0.1 — RestartableServer: restart-scenario test helper
// ═══════════════════════════════════════════════════════════════════════════
//
// The CRDT content-duplication bug class (documented in /Users/edwingomezcuellar/.claude/plans/
// ok-makes-sense-can-abstract-boole.md) requires tests that tear down and restart the
// Hocuspocus server on the SAME port while a client tab holds its Y.Doc in memory.
// `createTestServer` alone cannot express this — its `cleanup` does a full graceful
// shutdown. This helper adds two new moves:
//
//   - `killNetwork()` closes HTTP + WS sockets fast (fire-and-forget), leaving the
//     in-process ServerInstance timers running. Simulates a crash where the process
//     dies without running shutdown. Port release is asynchronous — pair with
//     `waitForPortFree` or the retry-loop inside `killAndRestartOnSamePort`.
//
//   - `killAndRestartOnSamePort({ downtimeMs })` calls `killNetwork()`, waits
//     downtimeMs (so TCP TIME_WAIT can clear and the client's HocuspocusProvider
//     can observe the disconnect), then binds a new server to the SAME port with
//     the SAME contentDir. Retries `listen(port)` on EADDRINUSE for up to 2.5s.
//     Returns a fresh RestartableServer; the OLD one's `instance` timers still
//     run in the background until the test's final cleanup.
//
// Retired servers tracked inside the new instance — calling `shutdown()` on the
// latest handle cascades cleanup to every prior instance.
// ═══════════════════════════════════════════════════════════════════════════

export interface RestartableServer {
  port: number;
  contentDir: string;
  instance: ServerInstance;
  /**
   * Close HTTP + WSS sockets fast. Port release is asynchronous; the in-process
   * ServerInstance (persistence debounce, file watcher, shadow-lock) is NOT torn
   * down. Used to simulate a process crash. After calling, this handle is unusable
   * for further `killNetwork`/`shutdown` sequences — call `killAndRestartOnSamePort`
   * to get a fresh handle, or `shutdown()` once for final cleanup.
   */
  killNetwork(): void;
  /**
   * Graceful shutdown: `instance.destroy()` + close HTTP + close WSS + await in-flight.
   * Also shuts down any prior retired instances (cascade). Respects `keepContentDir`.
   */
  shutdown(): Promise<void>;
  /**
   * Kill the network, wait `downtimeMs`, then bind a new server on the same port
   * with the same contentDir. Returns a fresh RestartableServer; callers should
   * replace their reference. The old handle is retired inside the new one — the
   * new `shutdown()` will cascade-teardown both.
   *
   * `downtimeMs` should be shorter than `ProviderPool`'s `RECYCLE_DEBOUNCE_MS` (4000)
   * to exercise the fast-restart bug path, or longer to exercise the recycle path.
   */
  killAndRestartOnSamePort(opts: { downtimeMs: number }): Promise<RestartableServer>;
}

export interface CreateRestartableServerOptions extends CreateTestServerOptions {
  /** Specific port to listen on. Default: kernel-assigned via getFreePort. */
  port?: number;
  /** Enable git persistence for tests that exercise branch switch / rollback / shadow repo. */
  gitEnabled?: boolean;
  /** Git commit debounce override (ms). For mid-drain restart tests. */
  commitDebounceMs?: number;
  /** @internal — retired predecessor instances that this new instance should cascade-teardown on shutdown. */
  _retired?: RestartableServer[];
}

/**
 * Wait up to `timeoutMs` for a TCP port to be bindable. Polls by attempting to
 * `listen(port)` on a throwaway server; closes the probe immediately on success.
 * Throws if the port never frees. Used by `killAndRestartOnSamePort` to absorb
 * TCP TIME_WAIT after a socket close.
 */
export async function waitForPortFree(port: number, timeoutMs = 2500): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const probe = createNetServer();
      probe.once('error', (err) => {
        lastErr = err;
        resolve(false);
      });
      probe.listen(port, () => {
        probe.close(() => resolve(true));
      });
    });
    if (ok) return;
    await wait(50);
  }
  throw new Error(
    `waitForPortFree: port ${port} still bound after ${timeoutMs}ms; last error: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

export async function createRestartableServer(
  options: CreateRestartableServerOptions = {},
): Promise<RestartableServer> {
  const contentDir =
    options.contentDir !== undefined
      ? realpathSync(options.contentDir)
      : realpathSync(mkdtempSync(join(tmpdir(), 'ok-restartable-')));

  // Only write the seed test-doc.md on first boot — restarts reuse existing content.
  if (options.contentDir === undefined) {
    writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
  }

  await ensureProjectGit(contentDir);

  const port = options.port ?? (await getFreePort());
  const srv = createServer({
    contentDir,
    quiet: true,
    debounce: options.debounce ?? 200,
    maxDebounce: options.maxDebounce ?? 1000,
    gitEnabled: options.gitEnabled ?? false,
    enableTestRoutes: true,
    ...(options.commitDebounceMs !== undefined
      ? { commitDebounceMs: options.commitDebounceMs }
      : {}),
  });

  await srv.ready;

  // Track live sockets so killNetwork can force-destroy them for fast port release.
  const sockets = new Set<Socket>();
  const httpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (url?.startsWith('/api/')) {
      srv.hocuspocus
        // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus hooks() has no exported payload type for onRequest
        .hooks('onRequest', { request: req, response: res } as any)
        .then(() => {
          if (res.writableEnded) return;
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'API route not found', path: url }));
        })
        .catch((err) => {
          console.error('[api] Unhandled onRequest error:', err);
          if (!res.writableEnded) {
            res.writeHead(500);
            res.end('Internal server error');
          }
        });
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });
  httpServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  const wss = new WebSocketServer({ noServer: true });
  const KEEPALIVE_GRACE_MS = options.keepaliveGraceMs ?? 10_000;
  const keepaliveGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/collab/keepalive')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        let connectionId: string | undefined;
        try {
          const sp = new URL(req.url ?? '', 'http://localhost').searchParams;
          connectionId = sp.get('connectionId') ?? undefined;
        } catch {
          // ignore malformed URL
        }
        if (connectionId) {
          const existing = keepaliveGraceTimers.get(connectionId);
          if (existing !== undefined) {
            clearTimeout(existing);
            keepaliveGraceTimers.delete(connectionId);
          }
        }
        ws.on('close', () => {
          if (!connectionId) return;
          const timer = setTimeout(async () => {
            keepaliveGraceTimers.delete(connectionId as string);
            try {
              await srv.sessionManager.closeAllForAgent(connectionId as string);
            } catch {
              // best-effort
            }
            try {
              srv.agentFocusBroadcaster?.clearFocus(connectionId as string);
            } catch {
              // best-effort
            }
          }, KEEPALIVE_GRACE_MS);
          timer.unref?.();
          keepaliveGraceTimers.set(connectionId, timer);
        });
        ws.on('error', () => ws.terminate());
      });
      return;
    }
    if (req.url?.startsWith('/collab')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        const clientConnection = srv.hocuspocus.handleConnection(
          ws as unknown as WebSocket,
          req as unknown as Request,
        );
        ws.on('message', (data: ArrayBuffer | Buffer) => {
          clientConnection.handleMessage(
            data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data),
          );
        });
        ws.on('close', (code: number, reason: Buffer) => {
          clientConnection.handleClose({ code, reason: reason.toString() });
        });
        ws.on('error', () => {
          ws.terminate();
        });
      });
    }
  });

  // Bind with retry on EADDRINUSE — restart paths race TCP TIME_WAIT on the
  // same port. Use listen(port) first; on error, wait + retry up to 2500ms.
  const listenWithRetry = async (): Promise<void> => {
    const deadline = Date.now() + 2500;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      try {
        await new Promise<void>((resolve, reject) => {
          const onErr = (err: Error): void => {
            httpServer.off('error', onErr);
            reject(err);
          };
          httpServer.once('error', onErr);
          httpServer.listen(port, () => {
            httpServer.off('error', onErr);
            resolve();
          });
        });
        return;
      } catch (err) {
        lastErr = err;
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'EADDRINUSE') throw err;
        await wait(100);
      }
    }
    throw new Error(
      `createRestartableServer: could not bind port ${port} within 2500ms; last error: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`,
    );
  };
  await listenWithRetry();

  const retired: RestartableServer[] = [...(options._retired ?? [])];
  let networkKilled = false;

  const killNetwork = (): void => {
    if (networkKilled) return;
    networkKilled = true;
    // Clear pending keepalive grace timers — they reference `srv` which we're
    // leaving dangling; letting them fire would call closeAllForAgent on the
    // abandoned ServerInstance and leak errors into later tests.
    for (const timer of keepaliveGraceTimers.values()) clearTimeout(timer);
    keepaliveGraceTimers.clear();
    // Terminate live WS clients so HocuspocusProvider observes the disconnect
    // immediately (rather than waiting on TCP keepalive).
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {
        /* best-effort */
      }
    }
    try {
      wss.close();
    } catch {
      /* best-effort */
    }
    // Fire-and-forget httpServer.close() — synchronous close completion is not
    // guaranteed across Node versions for sockets in TIME_WAIT. Force-destroy
    // any live sockets to accelerate port release.
    for (const socket of sockets) {
      try {
        socket.destroy();
      } catch {
        /* best-effort */
      }
    }
    try {
      httpServer.close();
    } catch {
      /* best-effort */
    }
  };

  const shutdown = async (): Promise<void> => {
    if (!networkKilled) killNetwork();
    // Full destroy of this instance's ServerInstance.
    try {
      await srv.destroy();
    } catch (err) {
      console.warn('[restartable-server] srv.destroy() failed:', err);
    }
    // Cascade to retired predecessors.
    for (const prev of retired) {
      try {
        await prev.shutdown();
      } catch {
        /* best-effort */
      }
    }
    if (!options.keepContentDir) {
      rmSync(contentDir, { recursive: true, force: true });
    }
  };

  const handle: RestartableServer = {
    port,
    contentDir,
    instance: srv,
    killNetwork,
    shutdown,
    killAndRestartOnSamePort: async ({ downtimeMs }) => {
      killNetwork();
      await wait(downtimeMs);
      // If downtimeMs was very short, the OS may still hold the port in TIME_WAIT.
      // Poll until free, with timeout budget proportional to downtimeMs.
      await waitForPortFree(port, Math.max(2500, downtimeMs + 500));
      // Spin up a fresh server on the same port + contentDir. Inherit keepContentDir
      // so the cascade shutdown in the returned handle behaves correctly.
      return createRestartableServer({
        ...options,
        port,
        contentDir,
        keepContentDir: true, // the NEW handle's shutdown will rm the dir if the original caller wanted
        _retired: [handle, ...retired],
      });
    },
  };

  return handle;
}

// ═══════════════════════════════════════════════════════════════════════════
// CC1 system-doc subscriber for integration tests
// ═══════════════════════════════════════════════════════════════════════════
//
// Production wiring lives in `packages/app/src/components/SystemDocSubscriber.tsx`
// and routes CC1 stateless frames into `DocumentContext` dispatchers. That
// component depends on React + the `DocumentContext` provider, so tests that
// run in bare `bun test` (no jsdom) can't mount it.
//
// This helper opens a `__system__` HocuspocusProvider against the test
// server and dispatches the four CC1 channels that affect pool state
// (`server-info`, `branch-switched`, `disk-ack`) directly into the supplied
// pool. Tests that assert post-disk-ack behavior (T11 mid-drain) or
// branch-mismatch invalidation (T5 cross-branch) opt in by calling this once
// and pushing `dispose` onto their cleanup stack.
//
// `derived-view` payloads (files / backlinks / graph) are deliberately
// IGNORED — they invalidate TanStack Query caches in production, which has
// no analog in the harness. Tests that need to assert derived-view emit
// shape should hit the channel directly via `cc1-broadcast.test.ts` style
// in-process assertions, not this helper.

interface SystemDocSubscriberHandle {
  dispose: () => Promise<void>;
}

export function attachSystemDocSubscriber(
  pool: ProviderPool,
  port: number,
): SystemDocSubscriberHandle {
  const url = `ws://localhost:${port}/collab`;
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url,
    name: SYSTEM_DOC_NAME,
    document: doc,
    onStateless: ({ payload }: { payload: string }) => {
      const serverInfo = parseCC1ServerInfo(payload);
      if (serverInfo) {
        pool.setExpectedServerInstanceId(serverInfo.serverInstanceId);
        if (serverInfo.currentBranch !== undefined) {
          pool.setObservedBranch(serverInfo.currentBranch);
        }
        return;
      }
      const branchSwitched = parseCC1BranchSwitched(payload);
      if (branchSwitched) {
        pool.setObservedBranch(branchSwitched.branch);
        // Don't fire handleBranchSwitched here — tests that exercise the
        // branch-switch path own that wiring explicitly (cf
        // branch-switch-live-client.test.ts). This helper only mirrors the
        // production CC1 dispatcher's pool-state side-effects.
        return;
      }
      const diskAck = parseCC1DiskAck(payload);
      if (diskAck) {
        pool.observeDiskAck(diskAck.docName, diskAck.sv);
        return;
      }
      // derived-view payloads ignored — see header comment.
    },
  });

  return {
    dispose: async () => {
      provider.destroy();
      doc.destroy();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// T0.2 — clientID probe primitives
// ═══════════════════════════════════════════════════════════════════════════
//
// Yjs identifies Items by `(clientID, clock)` — never by content. The CRDT
// content-duplication bug class manifests when the server's Y.Doc is rebuilt
// with a fresh clientID while a client retains items under the pre-restart
// clientID. These primitives let tests observe the mechanism (clientID set
// growth, distribution of items across clientIDs) in addition to the
// downstream behavior (marker counts on disk).
//
// `Y.Doc.store.clients` is a public Map<clientID, Item[]> defined at
// node_modules/yjs/src/utils/StructStore.js. The map is populated only with
// clientIDs that have contributed items — a doc whose clientID has produced
// zero items will NOT appear in its own store.clients map.
// ═══════════════════════════════════════════════════════════════════════════

/** Every clientID that has contributed at least one Item to this Y.Doc. */
export function clientIdsInDoc(doc: Y.Doc): Set<number> {
  return new Set(doc.store.clients.keys());
}

/** Per-clientID Item count. Useful for asserting "only one clientID authored content." */
export function itemCountsByClient(doc: Y.Doc): Map<number, number> {
  const out = new Map<number, number>();
  for (const [clientID, items] of doc.store.clients) {
    out.set(clientID, items.length);
  }
  return out;
}

/**
 * Compare two docs' clientID sets. Returns:
 *   - `both`: clientIDs present in both
 *   - `onlyInA`: clientIDs in `a` not in `b`
 *   - `onlyInB`: clientIDs in `b` not in `a`
 *
 * After a clean sync, `onlyInA` and `onlyInB` should both be empty. A non-empty
 * `onlyInB` on a client-vs-server comparison means the server has items under
 * clientIDs the client has never seen — signal of clientID-mismatch-class drift.
 */
export function compareClientIds(
  a: Y.Doc,
  b: Y.Doc,
): { both: Set<number>; onlyInA: Set<number>; onlyInB: Set<number> } {
  const aSet = clientIdsInDoc(a);
  const bSet = clientIdsInDoc(b);
  const both = new Set<number>();
  const onlyInA = new Set<number>();
  const onlyInB = new Set<number>();
  for (const id of aSet) (bSet.has(id) ? both : onlyInA).add(id);
  for (const id of bSet) if (!aSet.has(id)) onlyInB.add(id);
  return { both, onlyInA, onlyInB };
}

/**
 * Assert the doc's clientID set matches `expected` exactly. Use after a
 * restart-plus-reconnect cycle to verify no new clientIDs leaked in.
 */
export function assertSameClientIds(doc: Y.Doc, expected: Set<number>, context?: string): void {
  const actual = clientIdsInDoc(doc);
  const missing = [...expected].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));
  if (missing.length > 0 || extra.length > 0) {
    const prefix = context ? `[${context}] ` : '';
    throw new Error(
      `${prefix}clientID drift: expected ${[...expected].sort().join(',')} but got ${[...actual]
        .sort()
        .join(',')}. Missing: [${missing.join(',')}], Extra: [${extra.join(',')}]`,
    );
  }
}

/**
 * Assert no clientID drift between a client and its server-side peer doc.
 * After a clean sync, the two clientID sets should be identical. A non-empty
 * `onlyInB` (server has clientIDs the client doesn't) indicates the server
 * merged items from a prior Y.Doc instance (the bug-class signature).
 */
export function assertNoClientIdDrift(
  client: TestClient,
  serverDoc: Y.Doc,
  context?: string,
): void {
  const { onlyInA, onlyInB } = compareClientIds(client.doc, serverDoc);
  if (onlyInA.size === 0 && onlyInB.size === 0) return;
  const prefix = context ? `[${context}] ` : '';
  throw new Error(
    `${prefix}clientID drift between client '${client.docName}' and server doc. ` +
      `client-only: [${[...onlyInA].join(',')}] | server-only: [${[...onlyInB].join(',')}]. ` +
      `Client total: ${client.doc.store.clients.size}. Server total: ${serverDoc.store.clients.size}.`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// T0.3 — MultiClientRestartContext
// ═══════════════════════════════════════════════════════════════════════════
//
// `createTestClients` wires N direct HocuspocusProvider instances — it does NOT
// exercise ProviderPool's 4s recycle debounce, unsynced-changes defense, or
// LRU eviction. Multi-client restart tests require N POOLS each owning a tab,
// so the pool lifecycle runs for each simulated tab. This helper spins up
// N independent pools + drives each to first-sync, returning the handles a
// test needs.
//
// NB: `ProviderPool.open` instantiates a new HocuspocusProvider internally,
// which allocates its own Y.Doc (fresh clientID). Every simulated tab has a
// distinct clientID — matching production behavior.
// ═══════════════════════════════════════════════════════════════════════════

// Lazy import to avoid a compile-time cycle between test-harness.ts and the
// ProviderPool implementation; tests that don't need the multi-client helper
// don't pay the cost of loading it.
type ProviderPoolCtor = typeof import('../../src/editor/provider-pool').ProviderPool;

export interface MultiClientContext {
  pools: InstanceType<ProviderPoolCtor>[];
  docName: string;
  cleanup(): Promise<void>;
}

export async function createMultiClientContext(opts: {
  server: RestartableServer;
  docName: string;
  clientCount: number;
  /** Per-pool `recycleDebounceMs` override. Mirrors ProviderPool constructor arg. */
  recycleDebounceMs?: number;
}): Promise<MultiClientContext> {
  const { ProviderPool } = await import('../../src/editor/provider-pool');
  const wsUrl = `ws://localhost:${opts.server.port}/collab`;
  const pools: InstanceType<ProviderPoolCtor>[] = [];
  for (let i = 0; i < opts.clientCount; i++) {
    const pool = new ProviderPool(3, wsUrl, { recycleDebounceMs: opts.recycleDebounceMs });
    // Seed the per-pool instance-ID cache the same way DocumentContext does
    // in production (US-001 / Commit 3). Without this, the server's
    // onAuthenticate (US-002 / Commit 4) treats the pool as legacy and
    // accepts stale-client reconnects — exactly what the bug-class tests
    // are trying to guard against.
    await seedPoolServerInstanceId(opts.server, pool);
    pool.open(opts.docName);
    pool.setActive(opts.docName);
    pools.push(pool);
  }
  // Wait for all pools to report synced.
  await pollUntil(() => pools.every((p) => p.getActive()?.provider.isSynced === true), 10_000, 50);
  // Wait for ack roundtrip so unsyncedChanges drops to 0 on each.
  await pollUntil(
    () => pools.every((p) => p.getActive()?.provider.unsyncedChanges === 0),
    10_000,
    50,
  );

  return {
    pools,
    docName: opts.docName,
    cleanup: async () => {
      for (const pool of pools) {
        try {
          pool.dispose();
        } catch {
          /* best-effort */
        }
      }
    },
  };
}

/**
 * Poll a disk file until its content matches `predicate`, with a settle period
 * to absorb persistence debounce. Resolves when the predicate holds for two
 * consecutive reads `settleMs` apart — ensures we don't sample a mid-debounce
 * state. Replacement for `await wait(1000)` before reading file content.
 */
/**
 * Fetch `/api/server-info` from a running server and seed the pool's
 * `cachedServerInstanceId` — mirroring the DocumentContext boot flow that
 * runs in the real browser. Integration tests that exercise the CRDT
 * server-restart recovery defense MUST call this after constructing the
 * pool; otherwise the pool sends anonymous claims and the server's
 * `onAuthenticate` mismatch enforcement never fires.
 *
 * Returns the fetched serverInstanceId for convenience (tests that assert
 * the claim landed correctly).
 */
export async function seedPoolServerInstanceId(
  server: { port: number },
  pool: {
    setExpectedServerInstanceId: (id: string | null) => void;
  },
): Promise<string> {
  const res = await fetch(`http://localhost:${server.port}/api/server-info`);
  if (!res.ok) {
    throw new Error(`seedPoolServerInstanceId: /api/server-info returned ${res.status}`);
  }
  const body = ServerInfoResponseSchema.parse(await res.json());
  pool.setExpectedServerInstanceId(body.serverInstanceId);
  return body.serverInstanceId;
}

export async function pollDiskContentStable(
  filePath: string,
  predicate: (content: string) => boolean,
  opts: { timeoutMs?: number; settleMs?: number; pollIntervalMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const settleMs = opts.settleMs ?? 300;
  const pollIntervalMs = opts.pollIntervalMs ?? 50;
  const start = Date.now();
  let lastMatchAt: number | null = null;
  let lastContent = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      if (predicate(content)) {
        lastContent = content;
        if (lastMatchAt !== null && Date.now() - lastMatchAt >= settleMs) {
          return content;
        }
        if (lastMatchAt === null) lastMatchAt = Date.now();
      } else {
        lastMatchAt = null;
      }
    } catch {
      lastMatchAt = null;
    }
    await wait(pollIntervalMs);
  }
  throw new Error(
    `pollDiskContentStable: predicate never held for ${settleMs}ms within ${timeoutMs}ms budget on ${filePath}. Last content length: ${lastContent.length}`,
  );
}
