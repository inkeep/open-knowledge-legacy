/**
 * FR8 / T1 acceptance test — agent write → refs/wip/<branch>/agent-<connId>
 * with `wip:` commit subject (D53 taxonomy).
 *
 * Proves the createTestServer({ withShadow: true }) harness covers the
 * first of three primary write surfaces (US-007 AC).
 *
 * Spec: specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md
 */

import { describe, expect, test } from 'bun:test';
import { shadowGit } from '@inkeep/open-knowledge-server';
import { agentWriteMd, createTestServer } from './test-harness';

describe('shadow harness — agent write acceptance', () => {
  test('POST /api/agent-write-md produces refs/wip/<branch>/agent-<connId> with wip: subject', async () => {
    const server = await createTestServer({
      withShadow: true,
      debounce: 60_000,
      maxDebounce: 60_000,
    });
    try {
      // Explicit identity so the resulting ref path is deterministic.
      const agentId = 'test-agent-001';
      await agentWriteMd(server.port, '# T1 agent write\n\nBody from agent.\n', {
        docName: 'shadow-harness-t1',
        position: 'replace',
        agentId,
        agentName: 'Test Agent',
        clientName: 'vitest',
        colorSeed: agentId,
      });

      // Drain the debounced L2 commit deterministically. destroy() triggers
      // Phase 3 flushPendingStores + Phase 4 flushPendingGitCommit; the harness
      // cleanup then wraps up the shadow + rm the tmpdir.
      await server.instance.destroy();

      const sg = shadowGit({
        gitDir: server.shadowDir as string,
        workTree: server.contentDir,
      });
      const ref = `refs/wip/main/agent-${agentId}`;
      const sha = (await sg.raw('rev-parse', ref)).trim();
      expect(sha).toMatch(/^[0-9a-f]{40}$/);

      const subject = (await sg.raw('log', '-1', '--format=%s', ref)).trim();
      expect(subject.startsWith('wip:')).toBe(true);
      // Subject should reference the doc that was written (D53).
      expect(subject).toContain('shadow-harness-t1');

      // Body must carry an ok-actor: JSON line (FR-8 / §8.7).
      const body = await sg.raw('log', '-1', '--format=%B', ref);
      expect(body).toContain('ok-actor:');
      expect(body).toContain(`agent-${agentId}`);
    } finally {
      await server.cleanup();
    }
  });
});
