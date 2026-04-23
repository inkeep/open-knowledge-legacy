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
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import type { LocalTransactionOrigin } from '@hocuspocus/server';
import {
  MarkdownManager,
  normalizeBridge,
  prependFrontmatter,
  sharedExtensions,
} from '@inkeep/open-knowledge-core';
import {
  createServer,
  destroyShadowRepo,
  ensureProjectGit,
  initShadowRepo,
  isPairedWriteOrigin,
  OBSERVER_SYNC_ORIGIN,
  type ServerInstance,
  type ServerOptions,
  type ShadowHandle,
  swapContributors,
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
  /**
   * Shadow repo's bare git dir (e.g. `<contentDir>/.git/open-knowledge/`) when
   * the server was created with `withShadow: true`; `undefined` otherwise.
   * Consumers assert on shadow state via `simpleGit(server.shadowDir).log(...)`
   * or `simpleGit(server.shadowDir).raw('for-each-ref', ...)`.
   */
  shadowDir?: string;
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
   * When true, initialize a per-test shadow repo at `<contentDir>/.git/open-knowledge/`
   * before the server boots, and expose `shadowDir` on the returned `TestServer`.
   * Auto-drains module-state contributor-tracker entries via `swapContributors()`
   * in both setup and cleanup so concurrent tests cannot leak writers into each
   * other's assertions.
   *
   * Opt in when your assertions touch `refs/wip/*`, `refs/checkpoints/*`,
   * `/api/history`, `/api/save-version`, writer-ID attribution, or the
   * `ok-actor:` commit body. Otherwise leave off — each opt-in pays
   * ~50-200 ms of shadow init, which adds up across the Tier 1 suite.
   *
   * Default: `false`. See specs/2026-04-22-per-worker-shadow-repo-test-harness/
   * D2 for the tier-appropriate default rationale.
   *
   * STOP: tests using `withShadow: true` must NOT use `test.concurrent()` in
   * the same file. `contributor-tracker`'s `pendingContributors` Map is
   * module-level state, and the harness's auto-drain is serial-execution
   * bounded — concurrent tests would mix writers across assertions. A
   * per-server-instance contributor-tracker is the long-term fix and is
   * tracked separately; the constraint is enforced by convention until then.
   */
  withShadow?: boolean;
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

  // Per-test shadow opt-in (D2 / FR2). Default: off — 37/38 Tier 1 tests are
  // shadow-orthogonal and leaving shadow off preserves their original
  // boot-time cost. Opt-in tests initialize a real shadow at
  // `<contentDir>/.git/open-knowledge/` and drain stale contributor-tracker
  // entries atomically so cross-test bleed is impossible.
  //
  // ensureProjectGit runs ONLY under withShadow — the shadow subsystem is the
  // only consumer of a real .git/ in the harness. Shadow-orthogonal tests get
  // graceful-null `getCurrentBranch` behavior (head-watcher.ts:resolveGitDir
  // returns null + api-extension defaults to 'main'), so they don't need the
  // subprocess spawn. Errors wrap to name the harness layer so an afterEach
  // cleanup crash ("server undefined") doesn't mask the root cause.
  const withShadow = options.withShadow ?? false;
  let shadow: ShadowHandle | undefined;
  if (withShadow) {
    try {
      await ensureProjectGit(contentDir);
      shadow = await initShadowRepo(contentDir);
    } catch (err) {
      throw new Error(`[test-harness] shadow init failed for ${contentDir}`, { cause: err });
    }
    // FR7 / D10 — drain any residue from a prior test that didn't opt in
    // but still happened to call recordContributor. Discard the return
    // value; the harness owns drain semantics in this scope.
    swapContributors();
  }

  const port = await getFreePort();
  const srv = createServer({
    contentDir,
    quiet: true,
    debounce: options.debounce ?? 200,
    maxDebounce: options.maxDebounce ?? 1000,
    gitEnabled: withShadow,
    shadowRepo: shadow,
    // Harness layout is projectDir === contentDir — so the relative path from
    // one to the other is ''. Persistence's default fallback at that
    // configuration is `'content'` (it's tuned for the production layout where
    // projectDir wraps a `content/` subdir). Override to `'.'` so buildWipTree
    // does `git add .` instead of `git add content`, matching the shape every
    // harness-opt-in test exercises.
    contentRoot: withShadow ? '.' : undefined,
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
    shadowDir: shadow?.gitDir,
    cleanup: async () => {
      // Each phase runs in its own try/catch so a mid-cleanup throw does NOT
      // leak orphan state: shadow lock file, bound http server, open ws
      // listeners, contributor-tracker residue. Mirrors the production
      // shutdown pattern in standalone.ts:806-893 (CC8). Errors accumulate
      // into a single thrown aggregate at the end so signal survives.
      const errors: Array<[phase: string, error: unknown]> = [];
      try {
        await srv.destroy();
      } catch (e) {
        errors.push(['srv.destroy', e]);
      }
      try {
        wss.close();
      } catch (e) {
        errors.push(['wss.close', e]);
      }
      try {
        await new Promise<void>((resolve, reject) =>
          httpServer.close((err) => (err ? reject(err) : resolve())),
        );
      } catch (e) {
        errors.push(['httpServer.close', e]);
      }
      // destroyShadowRepo (= releaseLock — see shadow-repo.ts:131) runs
      // BEFORE rmSync so releaseLock sees the shadow dir intact; reversed
      // order would either ENOENT on the lock file or confuse releaseLock
      // with a partially-deleted .git/open-knowledge/ tree.
      if (withShadow && shadow) {
        try {
          swapContributors();
        } catch (e) {
          errors.push(['swapContributors', e]);
        }
        try {
          destroyShadowRepo(shadow);
        } catch (e) {
          errors.push(['destroyShadowRepo', e]);
        }
      }
      if (!options.keepContentDir) {
        try {
          rmSync(contentDir, { recursive: true, force: true });
        } catch (e) {
          errors.push(['rmSync', e]);
        }
      }
      if (errors.length > 0) {
        throw new Error(
          `[test-harness] cleanup partial failure: ${errors
            .map(([phase, e]) => `${phase}: ${String(e)}`)
            .join('; ')}`,
        );
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

/**
 * Narrow `TestServer.shadowDir` from `string | undefined` to `string` with a
 * descriptive error naming the harness layer. Use at the boundary between the
 * harness and any `simpleGit({ gitDir: … })` call, instead of `server.shadowDir as string`.
 *
 * Throws when the server was created without `{ withShadow: true }` — preferable
 * to a downstream `simpleGit` error like "fatal: not a git repository" because
 * the failure points at the misconfiguration (missing opt-in) rather than the
 * symptom.
 */
export function requireShadowDir(server: TestServer): string {
  if (!server.shadowDir) {
    throw new Error(
      '[test-harness] server.shadowDir is undefined — was createTestServer called with { withShadow: true }?',
    );
  }
  return server.shadowDir;
}

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
 *
 * Accepts sync or async conditions — existing sync callers return `boolean`
 * directly; async callers may return `Promise<boolean>` (e.g. waiting on
 * simple-git `rev-parse` for a shadow ref to exist). The deterministic
 * alternative to wall-clock `setTimeout` waits for L2 commit drains.
 */
export async function pollUntil(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
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
