/**
 * FR1 regression-guard — proves the dev plugin's per-worker shadow-default-on
 * path works end-to-end via a real Playwright worker, not just by structural
 * code-read. Asserts:
 *
 * 1. After `bun run dev` boots under `OK_TEST_CONTENT_DIR`, the worker's
 *    contentDir has a real bare git repo at `.git/open-knowledge/`. Proves
 *    `runDevShadowInit` ran unconditionally + `gitEnabled: true` wired through
 *    to persistence.
 *
 * 2. After driving an agent write through the api fixture, `simpleGit` reads a
 *    real `refs/wip/main/agent-<id>` ref from that shadow with a `wip:` subject
 *    and an `ok-actor:` JSON body line. Proves the L2 commit pipeline ran end-
 *    to-end via the dev plugin (not via Tier 1's `createTestServer`).
 *
 * Originally added to surface and then close the FR1 race in
 * `hocuspocus-plugin.ts:174` where fire-and-forget `runDevShadowInit` left
 * `shadowRef.current === undefined` while the first agent-write was already
 * in flight, causing `commitToWipRef` to silently no-op. Fix: api-extension's
 * `flushDocToGit` + `handleSaveVersion` + `handleRollback` now `await
 * shadowReadyPromise` (passed through from the dev plugin) before reading
 * `shadowRef.current`.
 *
 * Without the fix, this test fails: the ref never appears (verified during
 * /debug). With the fix, the ref appears within ~10s.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { shadowGit } from '@inkeep/open-knowledge-server';
import { expect, test } from './_helpers';

// Generous timeout because the dev server uses production debounce defaults
// (Hocuspocus debounce 2s + L2 commit 30s, but flushDocToGit forces immediate
// drain after each write). Boot + setup + drain comfortably under 90s.
test.setTimeout(120_000);

test('FR1 — dev plugin under OK_TEST_CONTENT_DIR creates a per-worker shadow + agent writes land as wip: refs', async ({
  workerServer,
  api,
}) => {
  // (1) Shadow exists at <contentDir>/.git/open-knowledge/
  const shadowDir = join(workerServer.contentDir, '.git', 'open-knowledge');
  expect(existsSync(shadowDir), `shadow should exist at ${shadowDir}`).toBe(true);
  expect(existsSync(join(shadowDir, 'HEAD')), 'shadow should be a real git dir').toBe(true);

  // (2) Drive an agent write end-to-end through the dev plugin's HTTP API.
  // No artificial pre-write delay — the api-extension's shadowReadyPromise
  // gate ensures the shadow is ready before the L2 commit fires, even if
  // the request arrives in the ~100-200ms async-init window.
  await api.createPage('fr1-validation.md');
  await api.writeAsAgent('fr1-validation.md', '# FR1 validation body\n\nLine.\n', {
    agentId: 'fr1-test-agent',
    agentName: 'FR1 Test Agent',
    clientName: 'qa-shadow-default-on',
    colorSeed: 'fr1-test-agent',
  });

  // (3) Poll for the ref. flushDocToGit's chain forces an immediate L2 commit
  // after the write, so the ref typically appears within seconds. Cap polling
  // at ~30s to give comfortable margin without masking a real regression.
  // shadowGit sets GIT_DIR + GIT_WORK_TREE env vars correctly for a bare repo
  // (raw simpleGit({ baseDir }) works for `rev-parse` from inside the bare dir
  // but breaks on commands that need a worktree like `log -- <ref>`).
  const sg = shadowGit({ gitDir: shadowDir, workTree: workerServer.contentDir });
  const expectedRef = 'refs/wip/main/agent-fr1-test-agent';
  let refSha = '';
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      refSha = (await sg.raw('rev-parse', expectedRef)).trim();
      if (refSha) break;
    } catch {
      // ref doesn't exist yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(refSha, `expected ref ${expectedRef} to exist after agent write`).toMatch(
    /^[0-9a-f]{40}$/,
  );

  // (4) Subject prefix `wip:` (D53 commit-subject taxonomy).
  // Use `--` separator to disambiguate ref-vs-path for `git log`.
  const subject = (await sg.raw('log', '-1', '--format=%s', expectedRef, '--')).trim();
  expect(subject, 'commit subject should start with `wip:`').toMatch(/^wip:/);

  // (5) ok-actor: body line present (FR-13 / specs/2026-04-18-agent-identity-
  // attribution-foundation/SPEC.md §8.7).
  const body = (await sg.raw('log', '-1', '--format=%B', expectedRef, '--')).trim();
  expect(body, 'commit body should include ok-actor: JSON line').toMatch(/^ok-actor: \{/m);
});
