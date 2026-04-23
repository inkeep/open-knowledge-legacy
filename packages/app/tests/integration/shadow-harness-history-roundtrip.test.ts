/**
 * FR8 / T6 acceptance test — agent write → GET /api/history?docName=…
 * returns an entry whose commit SHA matches the commit produced by the
 * write path.
 *
 * What this test actually proves: the write-side → read-side round-trip
 * through /api/history uses a branch source consistent with the write
 * side, against a real shadow produced by the test harness. The harness
 * runs `createServer({ projectDir: contentDir })`, so `getCurrentBranch`
 * reads the tmpdir's `.git/HEAD` on BOTH the write path (persistence L2
 * commit) and the read path (/api/history handler). If that consistency
 * ever regresses — e.g., one side reads from a different source — T6
 * fails even on a `main`-checkout dev environment.
 *
 * Scope note: this test does NOT directly exercise the dev plugin's
 * L267 (post-D12) api-extension `projectDir` leak — that leak lives in
 * the Vite plugin's module scope, and the test harness uses
 * `standalone.ts:createServer` directly with explicit `projectDir ===
 * contentDir`. The primary guard for that leak class is T2's
 * `ok/v<N>`-tag-lands-in-tmpdir assertion (see shadow-harness-save-version)
 * plus the `AGENTS.md` STOP rule on new `projectRoot` consumers.
 *
 * Spec: specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md §FR8
 */

import { describe, expect, test } from 'bun:test';
import { shadowGit } from '@inkeep/open-knowledge-server';
import { agentWriteMd, createTestServer, pollUntil, requireShadowDir } from './test-harness';

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
      // /api/history queries it. Hocuspocus's public `flushPendingStores()`
      // is fire-and-forget (`void` return — see
      // specs/2026-04-11-server-destroy-flush-fix/SPEC.md for why awaiting
      // it is a footgun: `await server.instance.hocuspocus.flushPendingStores()`
      // awaits `undefined`). It fires onStoreDocument which writes disk +
      // schedules L2; we poll for the ref rather than sleeping so a slow
      // runner (CI parallelism, parcel-watcher inotify pressure) can't
      // flake the regression guard.
      server.instance.hocuspocus.flushPendingStores();
      const sg = shadowGit({
        gitDir: requireShadowDir(server),
        workTree: server.contentDir,
      });
      const ref = `refs/wip/main/agent-${agentId}`;
      await pollUntil(async () => {
        try {
          await sg.raw('rev-parse', ref);
          return true;
        } catch {
          return false;
        }
      }, 5_000);
      const writtenSha = (await sg.raw('rev-parse', ref)).trim();
      expect(writtenSha).toMatch(/^[0-9a-f]{40}$/);

      // Now read via /api/history and assert the commit appears. This is
      // the consistency guard for the harness's createServer topology —
      // both the write path (persistence L2 commit) and the /api/history
      // read path must use the same `getCurrentBranch` source. The L267
      // (post-D12) dev-plugin leak class is guarded by T2's
      // `ok/v<N>`-tag-lands-in-tmpdir assertion + the `AGENTS.md` STOP
      // rule on new `projectRoot` consumers, not here (see the Scope
      // note in this file's header).
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
