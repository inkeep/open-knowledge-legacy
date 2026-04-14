/**
 * L1 integration tests for US-002 (agent focus publication on writes) and
 * US-003 (orphan + parent-candidate hint on write_document response).
 *
 * US-002: POST /api/agent-write-md and POST /api/agent-patch populate the
 * server's AgentFocusBroadcaster with the correct entry shape. Path A
 * scope: single entry keyed by DEFAULT_AGENT_ID='claude-1'.
 *
 * US-003: the `hints` array in the write response surfaces hub candidates
 * for orphaned writes; absent when the doc has backlinks or no hub exists.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { agentPatch, agentWriteMd, createTestServer, type TestServer, wait } from './test-harness';

function seedDoc(contentDir: string, docName: string, body: string): void {
  const filePath = join(contentDir, `${docName}.md`);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, body, 'utf-8');
}

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

describe('orphan-hint response shape — L1 integration (US-003)', () => {
  async function postWrite(
    docName: string,
    body: string,
  ): Promise<{
    ok: boolean;
    hints?: Array<{ type: string; parentCandidates: string[]; message: string }>;
  }> {
    const res = await fetch(`http://localhost:${server.port}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: body, position: 'replace', docName }),
    });
    return res.json() as Promise<{
      ok: boolean;
      hints?: Array<{ type: string; parentCandidates: string[]; message: string }>;
    }>;
  }

  test('orphan doc in folder with a hub gets a hint', async () => {
    const folder = `orph-${crypto.randomUUID().slice(0, 8)}`;
    // Seed a hub doc on disk so the file watcher + backlink index pick it up
    seedDoc(server.contentDir, `${folder}/README`, '# README\n\nHub of the folder.\n');
    await wait(400); // wait for file watcher to index

    const orphanName = `${folder}/orphan`;
    const body = await postWrite(orphanName, '# Orphan body without any wiki-links');
    expect(body.ok).toBe(true);
    expect(body.hints).toBeDefined();
    expect(body.hints?.length).toBe(1);
    expect(body.hints?.[0].type).toBe('orphan');
    expect(body.hints?.[0].parentCandidates).toContain(`${folder}/README`);
    expect(body.hints?.[0].message).toContain('[[');
  });

  test('doc with an existing backlink gets no hint', async () => {
    const folder = `bl-${crypto.randomUUID().slice(0, 8)}`;
    // A hub exists AND it already links to the target — so target is not orphaned
    const target = `${folder}/linked`;
    seedDoc(server.contentDir, `${folder}/README`, `# README\n\nSee [[${target}]].\n`);
    seedDoc(server.contentDir, target, '# Linked\n\nBody.\n');
    await wait(400);

    const body = await postWrite(target, '# Linked body v2');
    expect(body.ok).toBe(true);
    expect(body.hints).toBeUndefined();
  });

  test('orphan in folder without a hub gets no hint', async () => {
    const folder = `nohub-${crypto.randomUUID().slice(0, 8)}`;
    // No hub doc seeded; orphan is truly alone
    const orphanName = `${folder}/solo`;
    const body = await postWrite(orphanName, '# Solo body');
    expect(body.ok).toBe(true);
    expect(body.hints).toBeUndefined();
  });
});
