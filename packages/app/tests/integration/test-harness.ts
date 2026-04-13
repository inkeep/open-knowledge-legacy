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
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { createServer } from '@inkeep/open-knowledge-server';
import { getSchema } from '@tiptap/core';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';

import { setupObservers } from '../../src/editor/observers';

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
  cleanup: () => Promise<void>;
}

export async function createTestServer(): Promise<TestServer> {
  // realpathSync resolves macOS /var → /private/var symlink so that
  // @parcel/watcher event paths match the contentDir used by pathToDocName.
  const contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-test-')));
  // Ensure test-doc.md exists (persistence expects it for initial load)
  writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');

  const port = await getFreePort();
  const srv = createServer({
    contentDir,
    quiet: true,
    debounce: 200,
    maxDebounce: 1000,
    gitEnabled: false,
    enableTestRoutes: true,
  });

  // R19: await file watcher readiness before returning so test.concurrent()
  // doesn't race the watcher startup
  await srv.ready;

  // Wire up HTTP server + WebSocket (same pattern as packages/cli/src/commands/start.ts)
  const httpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (url?.startsWith('/api/')) {
      // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus `hooks()` has no exported payload type for onRequest
      srv.hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
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
  httpServer.on('upgrade', (req, socket, head) => {
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
    cleanup: async () => {
      await srv.destroy();
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      rmSync(contentDir, { recursive: true, force: true });
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
}

export async function createTestClient(port: number, docName?: string): Promise<TestClient> {
  const resolvedDocName = docName ?? `test-${crypto.randomUUID()}`;

  const doc = new Y.Doc();
  const ytext = doc.getText('source');
  const fragment = doc.getXmlFragment('default');

  const provider = new HocuspocusProvider({
    url: `ws://localhost:${port}/collab`,
    name: resolvedDocName,
    document: doc,
    connect: true,
  });

  await waitForSync(provider);

  const observerCleanup = setupObservers({
    doc,
    xmlFragment: fragment,
    ytext,
    mdManager,
    schema,
  });

  return {
    doc,
    ytext,
    fragment,
    provider,
    docName: resolvedDocName,
    cleanup: async () => {
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

function waitForSync(provider: HocuspocusProvider, timeoutMs = 10_000): Promise<void> {
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

/** Serialize XmlFragment to markdown string */
export function serializeFragment(fragment: Y.XmlFragment): string {
  return mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
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

/** Normalize for bridge invariant comparison: strip trailing whitespace per line,
 * trailing newlines, and collapse 3+ consecutive newlines to exactly 2
 * (NG1: blank-line count between blocks normalizes). */
function normalizeBridge(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

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

/** POST to agent-write-md endpoint */
export async function agentWriteMd(
  port: number,
  markdown: string,
  opts?: { docName?: string; position?: 'append' | 'prepend' | 'replace' },
): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      markdown,
      position: opts?.position ?? 'append',
      docName: opts?.docName,
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

/** POST to agent-undo endpoint */
export async function agentUndo(port: number, docName?: string): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/agent-undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName }),
  });
  if (!res.ok) throw new Error(`agent-undo failed: ${res.status}`);
}

/** POST to agent-redo endpoint */
export async function agentRedo(port: number, docName?: string): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/agent-redo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName }),
  });
  if (!res.ok) throw new Error(`agent-redo failed: ${res.status}`);
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
