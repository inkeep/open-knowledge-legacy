/**
 * Tier 1 regression gate for FR-8 — N-agent presence survives the
 * __system__ broadcaster without stomping.
 *
 * Pre-fix (when agents published per-doc awareness), two writes from
 * distinct agentIds collapsed into one presence entry. The bar dropped
 * the earlier writer's icon. This test spins real server-side writes
 * with distinct `agentId` / `agentName` / `clientName` values and asserts
 * the broadcaster's map carries ALL agents.
 *
 * Covers:
 *   - two agents on same doc → two entries in `getPresenceMap()`
 *   - agent B moves to a different doc → B's `currentDoc` updates, A's
 *     stays pinned to the original doc
 *   - after every write, `mode === 'idle'` (FR-6 end-state — the finally
 *     block in `handleAgentWriteMd` ran)
 *   - handleAgentWrite (simple variant) also publishes — closes the
 *     pre-existing gap where the simple handler did not populate presence
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { agentWriteMd, createTestServer, type TestServer } from './test-harness';

/**
 * Map a raw agentId (the value sent in POST body `agentId` or in the
 * keepalive URL) to the broadcaster-map key. Server-side
 * `extractAgentIdentity` prepends `agent-`; tests must use the same
 * convention when indexing into `getPresenceMap()`.
 */
function toBroadcasterKey(rawAgentId: string): string {
  return `agent-${rawAgentId}`;
}

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('multi-agent presence — Tier 1 regression gate (FR-8)', () => {
  test('two agents on the same doc coexist as distinct presence entries', async () => {
    const doc = `mp-same-doc-${crypto.randomUUID().slice(0, 8)}`;
    const uuidA = `uuid-a-${crypto.randomUUID().slice(0, 8)}`;
    const uuidB = `uuid-b-${crypto.randomUUID().slice(0, 8)}`;

    await agentWriteMd(server.port, '# Claude was here', {
      docName: doc,
      position: 'replace',
      agentId: uuidA,
      agentName: 'Claude',
      clientName: 'claude-code',
    });
    await agentWriteMd(server.port, '# Cursor was here', {
      docName: doc,
      position: 'append',
      agentId: uuidB,
      agentName: 'Cursor',
      clientName: 'cursor',
    });

    const keyA = toBroadcasterKey(uuidA);
    const keyB = toBroadcasterKey(uuidB);
    const map = server.instance.agentPresenceBroadcaster.getPresenceMap();
    expect(map[keyA]).toBeDefined();
    expect(map[keyB]).toBeDefined();

    // Shape: both entries fully populated with expected icon/color derivation.
    expect(map[keyA].displayName).toBe('Claude');
    expect(map[keyA].icon).toBe('claude');
    expect(map[keyA].currentDoc).toBe(doc);
    expect(map[keyA].mode).toBe('idle');
    expect(typeof map[keyA].color).toBe('string');
    expect(map[keyA].color.length).toBeGreaterThan(0);

    expect(map[keyB].displayName).toBe('Cursor');
    expect(map[keyB].icon).toBe('cursor');
    expect(map[keyB].currentDoc).toBe(doc);
    expect(map[keyB].mode).toBe('idle');

    // ts is monotonic — agent B wrote after agent A.
    expect(map[keyB].ts).toBeGreaterThanOrEqual(map[keyA].ts);
  });

  test("agent moves to a different doc — their currentDoc updates, other agent's stays", async () => {
    const docFoo = `mp-foo-${crypto.randomUUID().slice(0, 8)}`;
    const docBar = `mp-bar-${crypto.randomUUID().slice(0, 8)}`;
    const uuidA = `uuid-a-${crypto.randomUUID().slice(0, 8)}`;
    const uuidB = `uuid-b-${crypto.randomUUID().slice(0, 8)}`;

    await agentWriteMd(server.port, '# A on foo', {
      docName: docFoo,
      position: 'replace',
      agentId: uuidA,
      agentName: 'Claude',
      clientName: 'claude-code',
    });
    await agentWriteMd(server.port, '# B on foo', {
      docName: docFoo,
      position: 'append',
      agentId: uuidB,
      agentName: 'Cursor',
      clientName: 'cursor',
    });

    // Agent B moves to bar.md
    await agentWriteMd(server.port, '# B on bar', {
      docName: docBar,
      position: 'replace',
      agentId: uuidB,
      agentName: 'Cursor',
      clientName: 'cursor',
    });

    const map = server.instance.agentPresenceBroadcaster.getPresenceMap();
    expect(map[toBroadcasterKey(uuidA)].currentDoc).toBe(docFoo);
    expect(map[toBroadcasterKey(uuidB)].currentDoc).toBe(docBar);
  });

  test('handleAgentWrite (simple /api/agent-write variant) publishes presence — closes pre-existing gap', async () => {
    const doc = `mp-simple-${crypto.randomUUID().slice(0, 8)}`;
    const uuid = `uuid-simple-${crypto.randomUUID().slice(0, 8)}`;

    const res = await fetch(`http://localhost:${server.port}/api/agent-write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'hello from the simple handler',
        docName: doc,
        agentId: uuid,
        agentName: 'Claude',
        clientName: 'claude-code',
      }),
    });
    expect(res.ok).toBe(true);

    const key = toBroadcasterKey(uuid);
    const map = server.instance.agentPresenceBroadcaster.getPresenceMap();
    expect(map[key]).toBeDefined();
    expect(map[key].displayName).toBe('Claude');
    expect(map[key].icon).toBe('claude');
    expect(map[key].currentDoc).toBe(doc);
    expect(map[key].mode).toBe('idle');
  });

  test('GET /api/metrics/agent-presence returns the broadcaster map', async () => {
    const doc = `mp-metrics-${crypto.randomUUID().slice(0, 8)}`;
    const uuid = `uuid-metrics-${crypto.randomUUID().slice(0, 8)}`;

    await agentWriteMd(server.port, '# metrics probe', {
      docName: doc,
      position: 'replace',
      agentId: uuid,
      agentName: 'Claude',
      clientName: 'claude-code',
    });

    const res = await fetch(`http://localhost:${server.port}/api/metrics/agent-presence`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      presence: Record<
        string,
        {
          displayName: string;
          icon: string;
          color: string;
          currentDoc: string | null;
          mode: string;
          ts: number;
        }
      >;
    };
    const key = toBroadcasterKey(uuid);
    expect(body.presence[key]).toBeDefined();
    expect(body.presence[key].displayName).toBe('Claude');
    expect(body.presence[key].currentDoc).toBe(doc);
  });
});
