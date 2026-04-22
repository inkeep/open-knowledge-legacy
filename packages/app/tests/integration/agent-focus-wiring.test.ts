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
import {
  agentPatch,
  agentUndo,
  agentWriteMd,
  awaitBacklinkIndexed,
  awaitFileWatcherIndexed,
  createTestServer,
  type TestServer,
  wait,
} from './test-harness';

/**
 * Seed a .md file into the test server's content directory.
 *
 * **Why async + the `parcelWatcherSubdirRaceGap`:** parcel-watcher on Linux
 * CI occasionally misses file-creation inotify events for files written into
 * a brand-new subdirectory when the subdir's watch hasn't yet propagated
 * into the kernel inotify fd. Observed signature: `awaitFileWatcherIndexed`
 * eventually times out because the event never fires (not delayed — lost).
 * Splitting the mkdir from the writeFile with a small gap gives the watcher
 * time to register the new subdir before files are written into it. Local
 * runs are fast enough that 0ms works; CI needs ~50–100ms under load.
 */
async function seedDoc(contentDir: string, docName: string, body: string): Promise<void> {
  const filePath = join(contentDir, `${docName}.md`);
  mkdirSync(dirname(filePath), { recursive: true });
  // parcelWatcherSubdirRaceGap — see JSDoc above.
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
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

  test('POST /api/agent-undo publishes focus with writeKind=undo (US-025, D43)', async () => {
    const docName = `focus-undo-${crypto.randomUUID().slice(0, 8)}`;
    const rawId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const connectionId = `agent-${rawId}`;

    // Write to create a session under connectionId
    await agentWriteMd(server.port, '# original', { docName, position: 'replace', agentId: rawId });
    await wait(50);

    // Undo — this fires agentFocusBroadcaster.setFocus with writeKind='undo'
    await agentUndo(server.port, { docName, connectionId });

    const focusMap = server.instance.agentFocusBroadcaster.getFocusMap();
    expect(focusMap[connectionId]).toBeDefined();
    expect(focusMap[connectionId].currentDoc).toBe(docName);
    expect(focusMap[connectionId].writeKind).toBe('undo');
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

  // 45s per-test budget. The two `await` stages (file-watcher index population,
  // then backlink-index body parse) each have a 30s primitive-level timeout.
  // Under CI concurrent-job CPU contention on the shared runner the primitive's
  // inner 50ms polling loop plus `agent-write-md` post time has been observed
  // to cross 15s (e.g. 15019.08ms on a recent main-branch CI failure; PR #165
  // saw 15032ms twice in a row). The outer budget must exceed the inner so the
  // helper's targeted error surfaces before bun:test's generic timeout. Sub-
  // second happy-path still fast-fails a real bug; the 45s tail is proportional
  // to CI worst-case observed.
  const ORPHAN_HINT_TEST_TIMEOUT_MS = 45_000;

  test(
    'orphan doc in folder with a hub gets a hint',
    async () => {
      const folder = `orph-${crypto.randomUUID().slice(0, 8)}`;
      // Seed a hub doc on disk so the file watcher + backlink index pick it up.
      // Condition-based wait on the server's file index — replaces the prior
      // `await wait(400)` wall-clock sleep which was occasionally insufficient
      // under CI file-watcher backend latency (chokidar / @parcel/watcher
      // batching). See the `awaitFileWatcherIndexed` JSDoc for the pattern.
      await seedDoc(server.contentDir, `${folder}/README`, '# README\n\nHub of the folder.\n');
      await awaitFileWatcherIndexed(server, `${folder}/README`);

      const orphanName = `${folder}/orphan`;
      const body = await postWrite(orphanName, '# Orphan body without any wiki-links');
      expect(body.ok).toBe(true);
      expect(body.hints).toBeDefined();
      expect(body.hints?.length).toBe(1);
      expect(body.hints?.[0].type).toBe('orphan');
      expect(body.hints?.[0].parentCandidates).toContain(`${folder}/README`);
      expect(body.hints?.[0].message).toContain('[[');
    },
    ORPHAN_HINT_TEST_TIMEOUT_MS,
  );

  test(
    'doc with an existing backlink gets no hint',
    async () => {
      const folder = `bl-${crypto.randomUUID().slice(0, 8)}`;
      // A hub exists AND it already links to the target — so target is not orphaned
      const target = `${folder}/linked`;
      await seedDoc(server.contentDir, `${folder}/README`, `# README\n\nSee [[${target}]].\n`);
      await seedDoc(server.contentDir, target, '# Linked\n\nBody.\n');
      // Two-stage wait: file watcher must index README, AND backlink index
      // must process the [[target]] link so target has a recorded backlink.
      // `awaitBacklinkIndexed` gates on the exact invariant `computeOrphanHints`
      // depends on — target is non-orphan iff its backlinks list is non-empty.
      await awaitBacklinkIndexed(server, target, `${folder}/README`);

      const body = await postWrite(target, '# Linked body v2');
      expect(body.ok).toBe(true);
      expect(body.hints).toBeUndefined();
    },
    ORPHAN_HINT_TEST_TIMEOUT_MS,
  );

  test('orphan in folder without a hub gets no hint', async () => {
    const folder = `nohub-${crypto.randomUUID().slice(0, 8)}`;
    // No hub doc seeded; orphan is truly alone
    const orphanName = `${folder}/solo`;
    const body = await postWrite(orphanName, '# Solo body');
    expect(body.ok).toBe(true);
    expect(body.hints).toBeUndefined();
  });
});
