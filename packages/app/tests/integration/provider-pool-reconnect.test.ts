import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { type AddressInfo, createServer as createNetServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hocuspocus } from '@hocuspocus/server';
import { createPersistenceExtension } from '@inkeep/open-knowledge-server';
import { WebSocketServer } from 'ws';
import { ProviderPool } from '../../src/editor/provider-pool';
import { pollUntil, wait } from './test-harness';

const SMALL_FIXTURE = `[[asdf]]

# Test Documentasdfasdf

## Status

Status: complete

## Notes

Notes added by agent.

## Next Steps

Review patch behavior

# Test Document

## Status

Status: complete

## Notes

Notes added by agent.

## Next Steps

Review patch behavior

  Alpha
  Beta
  Gamma

  [[test-doc]]
  [[Nonexistent Page]]

[[blahboop]]

[[asdfasdfasdf]]
`;

interface RestartableServer {
  disconnect: () => void;
  shutdown: () => Promise<void>;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

async function startServer(contentDir: string, port: number): Promise<RestartableServer> {
  const persistence = createPersistenceExtension({
    contentDir,
    projectDir: contentDir,
    gitEnabled: false,
  });
  const hocuspocus = new Hocuspocus({
    quiet: true,
    debounce: 100,
    maxDebounce: 300,
    extensions: [persistence.extension],
  });

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
  const sockets = new Set<Socket>();

  httpServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/collab')) return;

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
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });

  let networkClosed = false;

  const disconnect = () => {
    if (networkClosed) return;
    networkClosed = true;

    for (const client of wss.clients) {
      client.terminate();
    }
    for (const socket of sockets) {
      socket.destroy();
    }
    wss.close();
    // Fire-and-forget close: the reconnect test only needs the listener torn down so
    // the port can be rebound. Awaiting Node's close callbacks here can hang on half-
    // closed upgrade sockets and masks the provider restart behavior we actually want
    // to verify.
    httpServer.close();
  };

  return {
    disconnect,
    shutdown: async () => {
      disconnect();
      hocuspocus.closeConnections();
      hocuspocus.flushPendingStores();
      await wait(50);

      const docs = [...hocuspocus.documents.values()];
      for (const doc of docs) {
        await hocuspocus.unloadDocument(doc);
      }

      await persistence.flushPendingGitCommit();
      await persistence.waitForPendingCommits();
    },
  };
}

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe('ProviderPool reconnects', () => {
  test('recycles the active provider after server restart to avoid whole-doc duplication', async () => {
    const contentDir = mkdtempSync(join(tmpdir(), 'ok-provider-pool-'));
    cleanups.push(() => rmSync(contentDir, { recursive: true, force: true }));

    writeFileSync(join(contentDir, 'test-doc.md'), SMALL_FIXTURE, 'utf-8');
    const port = await getFreePort();

    let server = await startServer(contentDir, port);
    const retiredServers: RestartableServer[] = [];
    cleanups.push(async () => {
      await server.shutdown();
      while (retiredServers.length > 0) {
        await retiredServers.pop()?.shutdown();
      }
    });

    const pool = new ProviderPool(3, `ws://localhost:${port}/collab`);
    cleanups.push(() => pool.dispose());

    pool.open('test-doc');
    pool.setActive('test-doc');

    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);
    await pollUntil(() => pool.getActive()?.provider.unsyncedChanges === 0, 10_000, 50);
    await wait(300);

    const firstProvider = pool.getActive()?.provider;
    expect(firstProvider).toBeDefined();

    const firstDisk = readFileSync(join(contentDir, 'test-doc.md'), 'utf-8');
    expect((firstDisk.match(/\[\[test-doc\]\]/g) ?? []).length).toBe(1);
    expect((firstDisk.match(/# Test Document/g) ?? []).length).toBe(2);

    server.disconnect();
    await pollUntil(() => pool.getActive()?.provider !== firstProvider, 10_000, 50);
    retiredServers.push(server);
    server = await startServer(contentDir, port);

    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);
    await wait(500);

    const afterRestart = readFileSync(join(contentDir, 'test-doc.md'), 'utf-8');
    expect((afterRestart.match(/\[\[test-doc\]\]/g) ?? []).length).toBe(1);
    expect((afterRestart.match(/# Test Document/g) ?? []).length).toBe(2);
  }, 20_000);
});
