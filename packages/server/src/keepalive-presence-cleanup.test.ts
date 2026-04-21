/**
 * Integration test for US-004 — deterministic presence cleanup via the MCP
 * keepalive WS close event (SPEC §6.4 FR-4 + D14, plus identity-attribution
 * D28 grace timer).
 *
 * Boots a real `bootServer` instance on an OS-assigned port with a short
 * `keepaliveGraceMs`, publishes a presence entry, opens a raw WS to
 * `/collab/keepalive?connectionId=<id>`, closes it, and asserts the server's
 * `getPresenceMap()` no longer contains the entry after the grace period.
 *
 * `connectionId` is the unified identifier for both per-agent session cleanup
 * (`closeAllForAgent` + `clearFocus`) and presence cleanup (`clearPresence`).
 *
 * Uses `bootServer` (not the app-package test-harness) because only
 * `bootServer` wires the keepalive-close → grace-timer → cleanup handler
 * (that's the exact wiring under test).
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket as WsClient } from 'ws';
import { type BootedServer, bootServer } from './boot.ts';

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll<T>(
  read: () => T,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs = 20,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = read();
  while (!predicate(last) && Date.now() < deadline) {
    await wait(intervalMs);
    last = read();
  }
  return last;
}

async function bootTestServer(
  opts: { keepaliveGraceMs?: number } = {},
): Promise<{ booted: BootedServer; contentDir: string }> {
  const contentDir = mkdtempSync(join(tmpdir(), 'ok-keepalive-test-'));
  writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
  const booted = await bootServer({
    contentDir,
    attachUiSibling: false,
    idleShutdownMs: null,
    gitEnabled: false,
    quiet: true,
    debounce: 200,
    maxDebounce: 1000,
    keepaliveGraceMs: opts.keepaliveGraceMs ?? 100,
  });
  await booted.ready;
  return { booted, contentDir };
}

async function tearDown({
  booted,
  contentDir,
}: {
  booted: BootedServer;
  contentDir: string;
}): Promise<void> {
  await booted.destroy();
  rmSync(contentDir, { recursive: true, force: true });
}

// Harness registry so `afterAll` can clean up even on test throw.
const servers: Array<{ booted: BootedServer; contentDir: string }> = [];

afterAll(async () => {
  for (const s of servers) {
    try {
      await tearDown(s);
    } catch {
      // best-effort cleanup
    }
  }
});

describe('keepalive WS close → grace timer → clearPresence (US-004)', () => {
  test('closing the keepalive WS clears the presence entry after the grace period', async () => {
    const s = await bootTestServer({ keepaliveGraceMs: 100 });
    servers.push(s);
    const { booted } = s;
    const broadcaster = booted.serverInstance.agentPresenceBroadcaster;
    const connectionId = 'test-agent-close';

    // Seed the presence entry — something for the WS-close handler to clear.
    broadcaster.setPresence(connectionId, {
      displayName: 'Claude',
      icon: 'claude',
      color: '#D97757',
      currentDoc: 'foo.md',
      mode: 'idle',
      ts: Date.now(),
    });
    expect(broadcaster.getPresenceMap()[connectionId]).toBeDefined();

    // Open a real WS to the keepalive endpoint with the matching connectionId.
    const ws = new WsClient(
      `ws://localhost:${booted.port}/collab/keepalive?pid=${process.pid}&connectionId=${connectionId}`,
    );
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));
    });

    // Close the WS — the server's upgrade handler arms a grace timer
    // (keepaliveGraceMs=100 above), and on expiry it calls clearPresence.
    ws.close();

    // Budget: graceMs (100) + async close + clearPresence dispatch.
    const finalMap = await poll(
      () => broadcaster.getPresenceMap(),
      (map) => !(connectionId in map),
      1000,
      10,
    );
    expect(finalMap[connectionId]).toBeUndefined();
  });

  test('reconnect within the grace window cancels the timer (no premature clear)', async () => {
    const s = await bootTestServer({ keepaliveGraceMs: 200 });
    servers.push(s);
    const { booted } = s;
    const broadcaster = booted.serverInstance.agentPresenceBroadcaster;
    const connectionId = 'reconnect-agent';

    broadcaster.setPresence(connectionId, {
      displayName: 'Claude',
      icon: 'claude',
      color: '#D97757',
      currentDoc: 'foo.md',
      mode: 'idle',
      ts: Date.now(),
    });

    // First connect + close — arms a 200ms grace timer.
    const ws1 = new WsClient(
      `ws://localhost:${booted.port}/collab/keepalive?pid=${process.pid}&connectionId=${connectionId}`,
    );
    await new Promise<void>((resolve, reject) => {
      ws1.once('open', () => resolve());
      ws1.once('error', (err) => reject(err));
    });
    ws1.close();

    // Reconnect before the grace window expires (~50ms in).
    await wait(50);
    const ws2 = new WsClient(
      `ws://localhost:${booted.port}/collab/keepalive?pid=${process.pid}&connectionId=${connectionId}`,
    );
    await new Promise<void>((resolve, reject) => {
      ws2.once('open', () => resolve());
      ws2.once('error', (err) => reject(err));
    });

    // Wait past the original grace window. Presence must still be present
    // because the reconnect cancelled the timer.
    await wait(300);
    expect(broadcaster.getPresenceMap()[connectionId]).toBeDefined();

    ws2.close();
  });

  test('legacy keepalive URL without connectionId does not crash on close', async () => {
    const s = await bootTestServer({ keepaliveGraceMs: 100 });
    servers.push(s);
    const { booted } = s;
    const broadcaster = booted.serverInstance.agentPresenceBroadcaster;

    // Seed an entry so we can confirm it's NOT cleared by the no-id close.
    const survivingAgent = 'survivor';
    broadcaster.setPresence(survivingAgent, {
      displayName: 'Cursor',
      icon: 'cursor',
      color: '#888',
      currentDoc: 'bar.md',
      mode: 'idle',
      ts: Date.now(),
    });

    const ws = new WsClient(`ws://localhost:${booted.port}/collab/keepalive?pid=${process.pid}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));
    });
    ws.close();
    // Give the server a moment past the grace window to confirm no fire.
    await wait(200);
    expect(broadcaster.getPresenceMap()[survivingAgent]).toBeDefined();
  });
});
