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
 */

import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HocuspocusProvider } from '@hocuspocus/provider';
import { sharedExtensions } from '@inkeep/open-knowledge-core';
import { createServer } from '@inkeep/open-knowledge-server';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';

import { setupObservers } from '../../src/editor/observers';

// ─── Shared instances (created once, reused across all tests) ───

export const mdManager = new MarkdownManager({ extensions: sharedExtensions });
export const schema = getSchema(sharedExtensions);

// ─── Port allocation ───

export async function getFreePort(): Promise<number> {
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
  const { hocuspocus, destroy, ready } = createServer({
    contentDir,
    quiet: true,
    debounce: 200,
    maxDebounce: 1000,
    gitEnabled: false,
    enableTestRoutes: true,
  });

  // Wire up HTTP server + WebSocket (same pattern as packages/cli/src/commands/start.ts)
  const httpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (url?.startsWith('/api/')) {
      // biome-ignore lint/suspicious/noExplicitAny: HTTP server types don't match Hocuspocus hook signature
      hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
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
        const clientConnection = hocuspocus.handleConnection(
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
  await ready;

  return {
    port,
    contentDir,
    cleanup: async () => {
      await destroy();
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
  cleanup: () => void;
}

export async function createTestClient(port: number): Promise<TestClient> {
  const doc = new Y.Doc();
  const ytext = doc.getText('source');
  const fragment = doc.getXmlFragment('default');

  const provider = new HocuspocusProvider({
    url: `ws://localhost:${port}/collab`,
    name: 'test-doc',
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
    cleanup: () => {
      observerCleanup();
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

/** Assert bridge invariant: normalized Y.Text === serialized XmlFragment */
export function assertBridgeInvariant(ytext: Y.Text, fragment: Y.XmlFragment): void {
  const textNorm = stripTrailingWhitespace(ytext.toString());
  const fragNorm = stripTrailingWhitespace(serializeFragment(fragment));
  if (textNorm !== fragNorm) {
    throw new Error(
      `Bridge invariant violated.\n` +
        `  Y.Text (${textNorm.length} chars): ${textNorm.slice(0, 200)}...\n` +
        `  Fragment (${fragNorm.length} chars): ${fragNorm.slice(0, 200)}...`,
    );
  }
}

/** Read test-doc.md from the content directory */
export function readTestDoc(contentDir: string): string {
  return readFileSync(join(contentDir, 'test-doc.md'), 'utf-8');
}

/** POST to agent-write-md endpoint */
export async function agentWriteMd(
  port: number,
  markdown: string,
  position: 'append' | 'prepend' | 'replace' = 'append',
  docName = 'test-doc',
): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, position, docName }),
  });
  if (!res.ok) throw new Error(`agent-write-md failed: ${res.status}`);
}

/** POST to agent-undo endpoint */
export async function agentUndo(port: number): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/agent-undo`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`agent-undo failed: ${res.status}`);
}

/** POST to agent-redo endpoint */
export async function agentRedo(port: number): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/agent-redo`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`agent-redo failed: ${res.status}`);
}

/** POST to test-reset endpoint */
export async function testReset(port: number): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/test-reset`, {
    method: 'POST',
  });
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
