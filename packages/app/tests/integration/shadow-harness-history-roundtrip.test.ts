/**
 * FR8 / T6 acceptance test — agent write → GET /api/history?docName=…
 * returns an entry whose commit SHA matches the commit produced by the
 * write path.
 *
 * This is the regression guard for the L245 `getCurrentBranch` leak that
 * D12 sealed: if api-extension's `getCurrentBranch` were reading the
 * dev's checkout branch (not the tmpdir's .git/HEAD), the /api/history
 * query would look up a branch that has no WIP refs and return empty
 * entries — even though the shadow DID receive the commit.
 *
 * Spec: specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md §FR8
 */

import { describe, expect, test } from 'bun:test';
import { shadowGit } from '@inkeep/open-knowledge-server';
import { agentWriteMd, createTestServer } from './test-harness';

describe('shadow harness — history read round-trip acceptance', () => {
  test('agent-write then GET /api/history returns an entry with the expected commit SHA', async () => {
    const server = await createTestServer({
      withShadow: true,
      debounce: 60_000,
      maxDebounce: 60_000,
    });
    try {
      const docName = 'shadow-harness-t6';
      const agentId = 'test-agent-t6';

      await agentWriteMd(server.port, '# T6 round-trip\n\nHello.\n', {
        docName,
        position: 'replace',
        agentId,
        agentName: 'Test Agent T6',
      });

      // Drain L1 + L2 so the WIP ref exists in the shadow BEFORE
      // /api/history queries it. Hocuspocus's public flushPendingStores
      // fires onStoreDocument which writes disk + schedules L2; we wait
      // briefly for the scheduled L2 to fire its timer and commit.
      server.instance.hocuspocus.flushPendingStores();
      await new Promise((r) => setTimeout(r, 300));

      const sg = shadowGit({
        gitDir: server.shadowDir as string,
        workTree: server.contentDir,
      });
      const writtenSha = (await sg.raw('rev-parse', `refs/wip/main/agent-${agentId}`)).trim();
      expect(writtenSha).toMatch(/^[0-9a-f]{40}$/);

      // Now read via /api/history and assert the commit appears. This is
      // the regression guard: under the sealed L245 leak (pre-D12) the
      // read path could silently read from a different branch's ref
      // namespace and return empty.
      const historyRes = await fetch(
        `http://localhost:${server.port}/api/history?docName=${encodeURIComponent(docName)}`,
      );
      expect(historyRes.ok).toBe(true);
      const historyBody = (await historyRes.json()) as {
        ok: boolean;
        entries: Array<{ sha: string }>;
      };
      expect(historyBody.ok).toBe(true);

      const shas = historyBody.entries.map((e) => e.sha);
      expect(shas).toContain(writtenSha);
    } finally {
      await server.cleanup();
    }
  });
});
