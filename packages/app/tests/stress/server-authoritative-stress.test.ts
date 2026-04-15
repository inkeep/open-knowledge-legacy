/**
 * US-013 / FR-13: Server-authoritative bridge stress test.
 *
 * 5 clients x 30s of randomized mixed WYSIWYG + source edits against a real
 * Hocuspocus server. Measures end-to-end convergence timing after edit bursts
 * rather than instrumenting internal observer debounce callbacks.
 *
 * G7 budget rationale:
 *   The convergence budget is generous because 5 concurrent clients produce
 *   significant cross-client CRDT merge load. Observer A debounce is 50ms,
 *   Observer B typing-defer is 300ms, CRDT WebSocket propagation is <50ms per
 *   hop. With 5 clients the full propagation chain is:
 *     edit → local observer → WebSocket → server merge → broadcast → 4 peers
 *       → each peer observer → settle
 *   Under load, this chain takes 1-3s typical. The 25s final convergence gate
 *   accounts for macOS scheduler jitter and accumulated edit volume.
 *
 * Design:
 *   - Each client makes a random edit (WYSIWYG paragraph append or Y.Text
 *     insert) every 200-500ms for 30s total
 *   - After edits stop, convergence is measured with a generous timeout
 *   - Final assertions: all clients converged, no duplicate markers, bridge
 *     invariant holds on all clients
 *   - skipInvariantWatcher: true (stress tests drive transient divergence)
 *
 * Deterministic enough to pass reliably: edits are append-only (no conflicting
 * overwrites), convergence is measured only after ALL edits stop (no mid-burst
 * measurement that races with in-flight ops).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as Y from 'yjs';

import {
  assertBridgeInvariant,
  createTestClients,
  createTestServer,
  serializeFragment,
  type TestClient,
  type TestServer,
  wait,
} from '../integration/test-harness';

// ─── Seeded PRNG (xorshift32 — consistent with bridge-convergence.fuzz.test.ts) ───

function createPRNG(seed: number) {
  let state = seed | 0 || 1;
  return {
    next(): number {
      state ^= state << 13;
      state ^= state >> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    },
    nextInt(max: number): number {
      return Math.floor(this.next() * max);
    },
  };
}

// ─── Edit helpers ───

function wysiwygAppend(client: TestClient, text: string): void {
  const paragraph = new Y.XmlElement('paragraph');
  const ytext = new Y.XmlText();
  ytext.applyDelta([{ insert: text }]);
  paragraph.insert(0, [ytext]);
  client.fragment.push([paragraph]);
}

function sourceAppend(client: TestClient, text: string): void {
  client.doc.transact(() => {
    client.ytext.insert(client.ytext.length, `\n\n${text}\n`);
  });
}

// ─── Active convergence driver ───

/**
 * Drive all clients to convergence using the same pattern as the fuzz test's
 * driveToConvergence:
 * 1. Wait for CRDT sync to settle (1.5s initial)
 * 2. Tickle ONE client at a time (round-robin) to force Observer A debounce
 * 3. Poll until all clients agree on ytext + fragment + bridge invariant
 *
 * Returns convergence time in ms, or null on timeout.
 */
async function driveToConvergence(
  clients: TestClient[],
  timeoutMs: number,
): Promise<number | null> {
  const start = Date.now();

  // Phase 1: initial settle for CRDT sync
  await wait(1500);

  // Phase 2: tickle + poll loop
  let attempts = 0;
  while (Date.now() - start < timeoutMs) {
    const ytexts = clients.map((c) => c.ytext.toString());
    const fragMds = clients.map((c) => serializeFragment(c.fragment));
    const allYtextSame = ytexts.every((t) => t === ytexts[0]);
    const allFragSame = fragMds.every((m) => m === fragMds[0]);

    if (allYtextSame && allFragSame) {
      let allBridgeOk = true;
      for (const c of clients) {
        try {
          assertBridgeInvariant(c.ytext, c.fragment);
        } catch {
          allBridgeOk = false;
          break;
        }
      }
      if (allBridgeOk) return Date.now() - start;
    }

    // Tickle ONE client to trigger Observer A reconciliation (round-robin).
    // Limit tickle attempts to avoid adding too much content.
    if (attempts < 8) {
      const target = clients[attempts % clients.length];
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.applyDelta([{ insert: `r${attempts}` }]);
      paragraph.insert(0, [text]);
      target.fragment.push([paragraph]);
    }
    attempts++;
    await wait(800);
  }
  return null;
}

// ─── No-duplicates oracle ───

/**
 * Check that no marker text appears more than once in a client's Y.Text.
 * Stress edits use unique markers, so any duplicate indicates a CRDT merge
 * or observer bug.
 */
function findDuplicates(ytext: string, markers: Set<string>): string[] {
  const duplicates: string[] = [];
  for (const marker of markers) {
    const firstIdx = ytext.indexOf(marker);
    if (firstIdx !== -1) {
      const secondIdx = ytext.indexOf(marker, firstIdx + marker.length);
      if (secondIdx !== -1) {
        duplicates.push(marker);
      }
    }
  }
  return duplicates;
}

// ─── Main test ───

describe('server-authoritative stress (US-013)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server?.cleanup();
  });

  test('5-client stress: 30s mixed WYSIWYG + source edits converge', async () => {
    const seed = Date.now();
    const rng = createPRNG(seed);
    const clientCount = 5;
    const docName = `stress-${crypto.randomUUID()}`;
    const durationMs = 30_000;

    const clients = await createTestClients(server.port, {
      count: clientCount,
      docName,
      perClientOptions: { skipInvariantWatcher: true },
    });

    try {
      const allMarkers = new Set<string>();
      let editCount = 0;
      const testStart = Date.now();

      // ── Edit phase: 30s of continuous random edits ──
      while (Date.now() - testStart < durationMs) {
        const clientIdx = rng.nextInt(clientCount);
        const client = clients[clientIdx];
        // 80% WYSIWYG, 20% source — WYSIWYG-heavy because source edits
        // trigger Observer B which needs typing-defer (300ms) to settle,
        // and under 5-client load the Observer A→B chain is the slowest
        // convergence path.
        const editType = rng.next() < 0.8 ? 'wysiwyg' : 'source';
        const marker = `s-${editCount}-c${clientIdx}-${editType === 'wysiwyg' ? 'w' : 's'}-${rng.nextInt(10000)}`;
        allMarkers.add(marker);

        if (editType === 'wysiwyg') {
          wysiwygAppend(client, marker);
        } else {
          sourceAppend(client, marker);
        }

        editCount++;
        const delay = 200 + rng.nextInt(300); // 200-500ms
        await wait(delay);
      }

      // ── Convergence phase: wait for all edits to propagate ──
      // 25s timeout: 5 clients with ~90 accumulated edits need the full
      // Observer A debounce (50ms) + Observer B typing-defer (300ms) +
      // CRDT WebSocket propagation chain to settle across all peers.
      // The tickle loop forces Observer A on lagging clients.
      const converged = await driveToConvergence(clients, 25_000);

      if (converged === null) {
        // Diagnostic: log per-client state for debugging
        for (let i = 0; i < clients.length; i++) {
          const c = clients[i];
          console.warn(
            `[stress] Client ${i}: ytext=${c.ytext.toString().length}ch, ` +
              `frag=${serializeFragment(c.fragment).length}ch`,
          );
        }
      }

      expect(converged).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: guarded by expect above
      const convergenceMs = converged!;

      // ── Bridge invariant on all clients ──
      for (const c of clients) {
        assertBridgeInvariant(c.ytext, c.fragment);
      }

      // ── No-duplicates oracle ──
      for (const c of clients) {
        const dupes = findDuplicates(c.ytext.toString(), allMarkers);
        expect(dupes).toEqual([]);
      }

      // ── Summary ──
      console.log(
        `[stress] Complete: ${editCount} edits across ${clientCount} clients, ` +
          `convergence in ${convergenceMs}ms, seed=${seed}`,
      );
    } finally {
      for (const c of clients) await c.cleanup();
    }
  }, 90_000);
});
