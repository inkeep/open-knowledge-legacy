/**
 * L1 integration test for US-002 — agent focus publication on writes.
 *
 * Verifies that POST /api/agent-write-md and POST /api/agent-patch populate
 * the server's AgentFocusBroadcaster with the correct entry shape. Path A
 * scope: single entry keyed by DEFAULT_AGENT_ID='claude-1'.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { agentPatch, agentWriteMd, createTestServer, type TestServer, wait } from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('agent-focus wiring — L1 integration', () => {
  test('POST /api/agent-write-md publishes focus with writeKind=write', async () => {
    const docName = `focus-write-${crypto.randomUUID().slice(0, 8)}`;
    const before = Date.now();

    await agentWriteMd(server.port, '# test', { docName, position: 'replace' });

    // Focus is published synchronously after the Y.Text mutation; no debounce.
    const focusMap = server.instance.agentFocusBroadcaster.getFocusMap();
    expect(focusMap['claude-1']).toBeDefined();
    expect(focusMap['claude-1'].agentName).toBe('Claude');
    expect(focusMap['claude-1'].currentDoc).toBe(docName);
    expect(focusMap['claude-1'].writeKind).toBe('write');
    expect(focusMap['claude-1'].ts).toBeGreaterThanOrEqual(before);
    expect(focusMap['claude-1'].ts).toBeLessThanOrEqual(Date.now());
  });

  test('POST /api/agent-patch publishes focus with writeKind=edit', async () => {
    const docName = `focus-patch-${crypto.randomUUID().slice(0, 8)}`;
    // Seed the doc so the patch has something to find
    await agentWriteMd(server.port, 'hello world', { docName, position: 'replace' as const });
    await wait(50);

    const res = await agentPatch(server.port, 'world', 'there', docName);
    expect(res.ok).toBe(true);

    const focusMap = server.instance.agentFocusBroadcaster.getFocusMap();
    expect(focusMap['claude-1'].currentDoc).toBe(docName);
    expect(focusMap['claude-1'].writeKind).toBe('edit');
  });

  test('successive writes advance ts — latest-wins ready', async () => {
    const docA = `focus-a-${crypto.randomUUID().slice(0, 8)}`;
    const docB = `focus-b-${crypto.randomUUID().slice(0, 8)}`;

    await agentWriteMd(server.port, '# a', { docName: docA, position: 'replace' });
    const tsA = server.instance.agentFocusBroadcaster.getFocusMap()['claude-1'].ts;

    await wait(20);
    await agentWriteMd(server.port, '# b', { docName: docB, position: 'replace' });
    const entryB = server.instance.agentFocusBroadcaster.getFocusMap()['claude-1'];

    expect(entryB.currentDoc).toBe(docB);
    expect(entryB.ts).toBeGreaterThan(tsA);
  });
});
