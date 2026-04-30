/**
 * Server lifetime follows connected WebSocket clients, not the process that
 * initially launched the server. One remaining sibling client keeps the lock
 * alive past the idle window; after the last client disconnects, idle-shutdown
 * releases the lock.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  type BootedServer,
  bootServer,
  ConfigSchema,
  ensureProjectGit,
} from '@inkeep/open-knowledge-server';
import * as Y from 'yjs';
import { waitForSync } from './test-harness.ts';

const IDLE_SHUTDOWN_MS = 400;
const WS_CLOSE_SETTLE_MS = 150;

let booted: BootedServer | null = null;
let contentDir = '';
let lockPath = '';

beforeAll(async () => {
  contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-idle-multi-')));
  await ensureProjectGit(contentDir);
  booted = await bootServer({
    config: ConfigSchema.parse({}),
    contentDir,
    port: 0,
    quiet: true,
    gitEnabled: false,
    skipAutoInit: true,
    attachUiSibling: false,
    idleShutdownMs: IDLE_SHUTDOWN_MS,
  });
  lockPath = resolve(contentDir, '.open-knowledge', 'server.lock');
});

afterAll(async () => {
  // Idempotent — destroy may already have run via idle-shutdown's tail
  // (which only releases Hocuspocus + the lock; httpServer + telemetry
  // teardown still run here).
  await booted?.destroy();
  rmSync(contentDir, { recursive: true, force: true });
});

test('closing spawning editor leaves sibling editor connected; idle-shutdown fires only when both disconnect', async () => {
  const server = booted;
  if (server === null) {
    throw new Error('bootServer did not initialize');
  }
  const port = server.port;

  // Both clients connect before the initial scheduleShutdown timer fires.
  const docA = `idle-multi-a-${crypto.randomUUID()}`;
  const docB = `idle-multi-b-${crypto.randomUUID()}`;
  const yDocA = new Y.Doc();
  const yDocB = new Y.Doc();
  const providerA = new HocuspocusProvider({
    url: `ws://localhost:${port}/collab`,
    name: docA,
    document: yDocA,
    connect: true,
  });
  const providerB = new HocuspocusProvider({
    url: `ws://localhost:${port}/collab`,
    name: docB,
    document: yDocB,
    connect: true,
  });

  await waitForSync(providerA);
  await waitForSync(providerB);

  expect(existsSync(lockPath)).toBe(true);

  // Editor A disconnects (the editor that originally spawned `ok start`).
  // Let the WebSocket close event reach the server-side idle counter before
  // checking that the sibling keeps the lock alive.
  providerA.destroy();
  yDocA.destroy();
  await wait(WS_CLOSE_SETTLE_MS);

  // Server stays alive past the idle threshold because B is still connected.
  await wait(IDLE_SHUTDOWN_MS + 200);
  expect(existsSync(lockPath)).toBe(true);
  expect(providerB.isSynced).toBe(true);

  // Now editor B disconnects — counter goes to zero, idle-shutdown schedules,
  // and the server tears down within the configured window.
  providerB.destroy();
  yDocB.destroy();

  const deadline = Date.now() + 5_000;
  while (existsSync(lockPath) && Date.now() < deadline) {
    await wait(25);
  }
  expect(existsSync(lockPath)).toBe(false);
});
