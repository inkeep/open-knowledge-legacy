/**
 * T5 — Branch switch while tab open with dirty content.
 *
 * When a user runs `git checkout <branch>` on a project directory that the
 * Open Knowledge server is watching, the head-watcher detects the HEAD move,
 * fires BatchBegin (park WIP to shadow refs) → BatchEnd (reset Y.Docs from
 * disk via applyExternalChange → updateYFragment).
 *
 * Unlike the onLoadDocument path, branch switch does NOT destroy the server's
 * Y.Doc — its clientID is preserved. But updateYFragment mass-rewrites Items
 * under the current server clientID to reflect the new branch's disk state.
 * A live client who has synced the pre-switch state holds Items under its own
 * clientID AND the server's pre-switch-contributed items under the SAME server
 * clientID. Post-switch, the server's clientID is the same but its items are
 * replaced structurally.
 *
 * Open question this test answers: does the bug class manifest on branch switch
 * in the same way as on server restart? Specifically, when the client's CRDT
 * state contains the PRE-switch server items and the server has just REPLACED
 * them wholesale, does the sync-back from client reintroduce the old items
 * alongside the new ones? (This is a subtly different mechanism from the
 * restart bug — same clientID, different items at same clocks would conflict
 * but not duplicate; different clocks would duplicate.)
 *
 * Expected outcome: UNKNOWN pre-run. The test is empirical — its result
 * determines whether branch switch is a bug-class member or exempt.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureProjectGit } from '@inkeep/open-knowledge-server';
import { ProviderPool } from '../../src/editor/provider-pool';
import {
  clientIdsInDoc,
  createRestartableServer,
  pollDiskContentStable,
  pollUntil,
  wait,
} from './test-harness';

const CONTENT_A = `# Main Branch Doc

Content on main branch.

[[main-sibling]]
`;

const CONTENT_B = `# Feature Branch Doc

Content on feature branch.

[[feature-sibling]]
`;

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

/** Run a git command in `cwd`. Forces empty global config so test identity
 *  doesn't leak into test-created commits. */
function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@test.local',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@test.local',
    },
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/** Build a git repo in `contentDir` with:
 *   - `main` branch containing `${docName}.md` = contentA
 *   - `feature` branch containing `${docName}.md` = contentB
 *   - HEAD currently on `main`
 */
async function setupGitRepoWithBranches(
  contentDir: string,
  docName: string,
  contentA: string,
  contentB: string,
): Promise<void> {
  await ensureProjectGit(contentDir);
  // ensureProjectGit initialized .git/. Now set up commits + branches.
  git(contentDir, 'config user.name test');
  git(contentDir, 'config user.email test@test.local');
  writeFileSync(join(contentDir, `${docName}.md`), contentA, 'utf-8');
  git(contentDir, 'add .');
  git(contentDir, 'commit -m content-A');
  git(contentDir, 'checkout -b feature');
  writeFileSync(join(contentDir, `${docName}.md`), contentB, 'utf-8');
  git(contentDir, 'add .');
  git(contentDir, 'commit -m content-B');
  git(contentDir, 'checkout main');
}

describe('T5: Branch switch while tab open', () => {
  test('REPRO: tab synced to main, switch to feature — content settles to B without bleed', async () => {
    // Pre-create contentDir + git setup BEFORE server starts so the initial
    // `persistence.onLoadDocument` sees content A on main.
    const contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-branch-switch-')));
    await setupGitRepoWithBranches(contentDir, 'test-doc', CONTENT_A, CONTENT_B);

    const server = await createRestartableServer({
      contentDir,
      keepContentDir: false,
      gitEnabled: true,
      commitDebounceMs: 500, // keep test brisk; default 30s blows the test budget
    });
    cleanups.push(() => server.shutdown());

    const pool = new ProviderPool(3, `ws://localhost:${server.port}/collab`);
    cleanups.push(() => pool.dispose());

    pool.open('test-doc');
    pool.setActive('test-doc');

    // Wait for sync to main-branch content.
    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);
    await pollUntil(() => pool.getActive()?.provider.unsyncedChanges === 0, 10_000, 50);

    // Confirm client sees content A.
    await pollUntil(
      () =>
        pool.getActive()?.provider.document.getText('source').toString().includes('main-sibling') ??
        false,
      8000,
      50,
    );

    const preSwitchEntry = pool.getActive();
    if (!preSwitchEntry) throw new Error('pool has no active entry pre-switch');
    const preSwitchClientIds = clientIdsInDoc(preSwitchEntry.provider.document);

    // Capture pre-switch disk content for sanity.
    const preSwitchDisk = readFileSync(join(contentDir, 'test-doc.md'), 'utf-8');
    expect(preSwitchDisk.includes('main-sibling')).toBe(true);

    // Execute the branch switch externally (simulates user running `git checkout`).
    git(contentDir, 'checkout feature');

    // Head-watcher's default QUIET_WINDOW_MS = 100ms; BatchEnd fires after that,
    // then the cross-branch reset path rewrites Y.Doc from new disk state.
    // Wait for client's Y.Doc to reflect content B.
    await pollUntil(
      () =>
        pool
          .getActive()
          ?.provider.document.getText('source')
          .toString()
          .includes('feature-sibling') ?? false,
      10_000,
      50,
    );

    // Let persistence settle after the cross-branch reset.
    await wait(500);

    const postSwitchEntry = pool.getActive();
    if (!postSwitchEntry) throw new Error('pool has no active entry post-switch');
    const postSwitchClientIds = clientIdsInDoc(postSwitchEntry.provider.document);
    // Delta across time is computed set-wise — compareClientIds compares two
    // docs at the same instant, but here we're comparing one doc at two times.
    const idsOnlyInPost = [...postSwitchClientIds].filter((id) => !preSwitchClientIds.has(id));
    const idsOnlyInPre = [...preSwitchClientIds].filter((id) => !postSwitchClientIds.has(id));

    console.log('[T5] clientID drift', {
      preSwitch: [...preSwitchClientIds],
      postSwitch: [...postSwitchClientIds],
      idsOnlyInPost,
      idsOnlyInPre,
    });

    // Behavior: client content settles to feature-branch content exactly once.
    const clientText = postSwitchEntry.provider.document.getText('source').toString();
    const featureSiblingCount = (clientText.match(/\[\[feature-sibling\]\]/g) ?? []).length;
    const mainSiblingCount = (clientText.match(/\[\[main-sibling\]\]/g) ?? []).length;
    const featureHeadingCount = (clientText.match(/# Feature Branch Doc/g) ?? []).length;
    const mainHeadingCount = (clientText.match(/# Main Branch Doc/g) ?? []).length;

    console.log('[T5] client content marker counts', {
      featureSibling: featureSiblingCount,
      mainSibling: mainSiblingCount,
      featureHeading: featureHeadingCount,
      mainHeading: mainHeadingCount,
      clientBytes: clientText.length,
    });

    // Feature branch content present exactly once.
    expect(featureSiblingCount).toBe(1);
    expect(featureHeadingCount).toBe(1);
    // Main branch content must NOT be bleeding through.
    expect(mainSiblingCount).toBe(0);
    expect(mainHeadingCount).toBe(0);

    // Disk content reflects feature-branch state (no bleed through from main).
    const diskAfter = await pollDiskContentStable(
      join(contentDir, 'test-doc.md'),
      (c) => c.includes('feature-sibling'),
      { timeoutMs: 8000, settleMs: 400 },
    );
    expect((diskAfter.match(/\[\[feature-sibling\]\]/g) ?? []).length).toBe(1);
    expect((diskAfter.match(/\[\[main-sibling\]\]/g) ?? []).length).toBe(0);

    // Mechanism: sidecars written on the pre-switch branch must be wiped on
    // branch switch (Commit 7's `deleteSidecarsForBranch` in onBatchBegin).
    // Either the ystate dir doesn't exist (never written) or it's empty of
    // `.bin` files — any leftover is a regression in the branch-switch
    // composition that T5 would otherwise miss (content-level assertions
    // above converge whether or not the delete runs).
    const ystateDir = join(contentDir, '.open-knowledge', 'ystate');
    if (existsSync(ystateDir)) {
      const binFiles = readdirSync(ystateDir).filter((f) => f.endsWith('.bin'));
      expect(binFiles).toEqual([]);
    }
  }, 45_000);
});
