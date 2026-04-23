/**
 * FR8 / T2 acceptance test — POST /api/save-version produces a
 * `refs/checkpoints/<n>` ref in the test's shadow repo AND an `ok/v<N>`
 * tag in the TEST'S tmpdir .git/ (not the developer's actual OK repo).
 *
 * The isolation invariant (ok/v* tags land in the tmpdir, not dev's repo)
 * is load-bearing for FR4 — it verifies the D12 single-binding collapse in
 * the dev plugin and the harness's projectDir === contentDir wiring.
 *
 * Spec: specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md §FR8
 */

import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { shadowGit } from '@inkeep/open-knowledge-server';
import { agentWriteMd, createTestServer } from './test-harness';

// Minimal parent-git reader — avoids pulling simple-git into the app's
// dep graph (it's a server-only dep) and keeps the T2 assertions scoped
// to read-only tag / log queries.
function parentGitTags(cwd: string, pattern: string): string[] {
  const out = execFileSync('git', ['tag', '--list', pattern], { cwd }).toString();
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
function parentGitLogSubject(cwd: string, ref: string): string {
  return execFileSync('git', ['log', '-1', '--format=%s', ref], { cwd }).toString().trim();
}

describe('shadow harness — save version acceptance', () => {
  test('POST /api/save-version → refs/checkpoints/<n> in shadow + ok/v<N> tag in tmpdir parent-git', async () => {
    const server = await createTestServer({
      withShadow: true,
      debounce: 60_000,
      maxDebounce: 60_000,
    });
    try {
      // Perform one agent write so the checkpoint has a non-empty WIP state
      // to snapshot.
      await agentWriteMd(server.port, '# Version 1\n', {
        docName: 'shadow-harness-t2',
        position: 'replace',
        agentId: 'test-agent-t2',
        agentName: 'Test Agent T2',
      });

      // Drain L1 before POSTing save-version — saveVersion builds its tree
      // from disk via buildWipTree, so the L1 debounce must fire first. No
      // ServerInstance.persistence export today, so force the store cycle
      // via Hocuspocus's public API. The small wait below lets the async
      // onStoreDocument promise settle.
      server.instance.hocuspocus.flushPendingStores();
      await new Promise((r) => setTimeout(r, 200));

      const saveRes = await fetch(`http://localhost:${server.port}/api/save-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'T2 acceptance checkpoint',
          agentId: 'test-agent-t2',
          agentName: 'Test Agent T2',
        }),
      });
      expect(saveRes.ok).toBe(true);
      const saveBody = (await saveRes.json()) as {
        ok: boolean;
        checkpointRef: string;
        versionTag?: string;
      };
      expect(saveBody.ok).toBe(true);
      // saveVersion returns `refs/checkpoints/<branch>/<sha>` per shadow-repo.ts:1176.
      expect(saveBody.checkpointRef).toMatch(/^refs\/checkpoints\/main\/[0-9a-f]{40}$/);
      // versionTag is produced by the parent-git branch. Harness layout
      // (contentDir === projectDir + ensureProjectGit-initialized .git/)
      // gives save-version a real repo to commit into.
      expect(saveBody.versionTag).toBe('ok/v1');

      // Checkpoint ref resolves in the shadow repo.
      const sg = shadowGit({
        gitDir: server.shadowDir as string,
        workTree: server.contentDir,
      });
      const checkpointSha = (await sg.raw('rev-parse', saveBody.checkpointRef)).trim();
      expect(checkpointSha).toMatch(/^[0-9a-f]{40}$/);

      // The checkpoint's commit subject uses the `checkpoint:` prefix per D53.
      const checkpointSubject = (
        await sg.raw('log', '-1', '--format=%s', saveBody.checkpointRef)
      ).trim();
      expect(checkpointSubject.startsWith('checkpoint:')).toBe(true);

      // FR4 invariant: the ok/v1 tag MUST exist in the test's tmpdir .git,
      // NOT in any other git repo on the developer's machine. Reading the
      // tag from the tmpdir's own .git/ proves it's scoped correctly.
      const tags = parentGitTags(server.contentDir, 'ok/v*');
      expect(tags).toContain('ok/v1');

      // Sanity: the tag points at a commit whose subject carries the
      // checkpoint: prefix, matching the shadow checkpoint message.
      const tagSubject = parentGitLogSubject(server.contentDir, 'ok/v1');
      expect(tagSubject.startsWith('checkpoint:')).toBe(true);
    } finally {
      await server.cleanup();
    }
  });
});
