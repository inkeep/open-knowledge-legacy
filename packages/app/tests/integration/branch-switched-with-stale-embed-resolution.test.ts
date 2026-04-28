/**
 * T17 — branch-switched cross-branch reseed-ordering regression gate.
 *
 * The cross-branch path in `standalone.ts`'s `onBatchEnd` callback runs:
 *   1. Discard buffered file-watcher events.
 *   2. Reset every open Y.Doc from the new branch's disk via `applyToDoc` →
 *      `applyExternalChange` → mdast→PM with `resolveEmbed`.
 *   3. Then `basenameIndex.clear()` + `seedBasenameIndex()` for the new branch.
 *
 * The reseed at step 3 is the only mechanism by which post-batch
 * `basenameIndex` reflects the new branch's content (step 1 discards the
 * file-watcher's buffered create/delete events — they're "wrong-branch" state).
 * But the doc-reset at step 2 calls `resolveEmbed` against the STALE pre-switch
 * `basenameIndex`, so PM image `src` for `![[photo.png]]` carries the
 * pre-switch resolved path. The disk markdown is untouched (`![[photo.png]]`
 * round-trips byte-identical), but the rendered preview is stale until the
 * user edits the doc.
 *
 * Fix: move the reseed (step 3) to run BEFORE the doc-reset loop (step 2). The
 * test asserts the post-fix invariant: post-switch PM image `src` matches the
 * NEW branch's resolved path, not the pre-switch one.
 *
 * Composition boundary: head-watcher × git-batch detection × basenameIndex ×
 * applyToDoc × resolveEmbed. Not reachable from unit tests alone (would
 * require mocking 4+ collaborators). Not duplicated by T5 (which exercises
 * cross-branch convergence on Y.Text content but doesn't touch embeds) or by
 * T15 (server-restart × resolveEmbed, no branch switch).
 *
 * Hermetic: per-test tmpdir + per-test git repo + per-test docName.
 *
 * @see packages/server/src/standalone.ts onBatchEnd cross-branch path
 * @see packages/app/tests/integration/branch-switch-live-client.test.ts (T5)
 * @see packages/app/tests/integration/restart-with-embed-doc.test.ts (T15)
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { ensureProjectGit } from '@inkeep/open-knowledge-server';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import { ProviderPool } from '../../src/editor/provider-pool';
import { createRestartableServer, getServerState, pollUntil, schema } from './test-harness';

// ── Local helpers ─────────────────────────────────────────────────────

interface PmJsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PmJsonNode[];
}

function collectNodes(json: PmJsonNode, type: string, out: PmJsonNode[] = []): PmJsonNode[] {
  if (json.type === type) out.push(json);
  for (const child of json.content ?? []) collectNodes(child, type, out);
  return out;
}

function writeRel(root: string, rel: string, body: string | Uint8Array): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

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

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DOC_BODY = '# Heading\n\n![[photo.png]]\n';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe('T17: branch switch with `![[photo.png]]` doc — reseed-before-reset', () => {
  test('post-switch PM image src reflects NEW branch resolved path, not pre-switch', async () => {
    // Layout:
    //   main:    test-doc.md (root, `![[photo.png]]`) + photo.png (root, sibling)
    //   feature: test-doc.md (root, `![[photo.png]]`) + assets/photo.png +
    //            assets/cover.md (sibling so ContentFilter admits the asset)
    //
    // basenameIndex resolution differs between branches:
    //   main    → photo.png  → '/photo.png'
    //   feature → photo.png  → '/assets/photo.png'
    //
    // The cross-branch reseed at standalone.ts:1645 IS the only mechanism by
    // which the post-switch basenameIndex reflects 'assets/photo.png'
    // (line 1553 discards the file-watcher's buffered events). Before the
    // fix, the doc-reset at line 1559 runs with the stale main-branch
    // basenameIndex; after the fix, the reseed runs first and the doc-reset
    // sees the new branch's mapping.
    const contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-t17-')));
    cleanups.push(() => {
      try {
        rmSync(contentDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    });

    // Build initial main-branch state on disk.
    writeRel(contentDir, 'test-doc.md', DOC_BODY);
    writeRel(contentDir, 'photo.png', PNG_BYTES);
    await ensureProjectGit(contentDir);
    git(contentDir, 'config user.name test');
    git(contentDir, 'config user.email test@test.local');
    git(contentDir, 'add .');
    git(contentDir, 'commit -m main-state');

    // Build feature-branch state: photo.png moved into assets/, sibling
    // assets/cover.md added so ContentFilter's sibling-asset rule admits.
    git(contentDir, 'checkout -b feature');
    rmSync(join(contentDir, 'photo.png'));
    writeRel(contentDir, 'assets/cover.md', '# Cover\n');
    writeRel(contentDir, 'assets/photo.png', PNG_BYTES);
    git(contentDir, 'add -A');
    git(contentDir, 'commit -m feature-state');
    git(contentDir, 'checkout main');

    // Boot the server on main. seedBasenameIndex runs at boot and walks the
    // root-level photo.png; PM image src on first onLoadDocument carries
    // '/photo.png'.
    const server = await createRestartableServer({
      contentDir,
      keepContentDir: false,
      gitEnabled: true,
      commitDebounceMs: 500,
    });
    cleanups.push(() => server.shutdown());

    const pool = new ProviderPool(3, `ws://localhost:${server.port}/collab`);
    cleanups.push(() => pool.dispose());

    pool.open('test-doc');
    pool.setActive('test-doc');
    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);
    await pollUntil(() => pool.getActive()?.provider.unsyncedChanges === 0, 10_000, 50);

    // Pre-switch sanity: server-side PM image carries main-branch resolved src.
    const preState = getServerState(server, 'test-doc');
    if (!preState) throw new Error('server has no test-doc loaded pre-switch');
    const preJson = yXmlFragmentToProseMirrorRootNode(
      preState.fragment,
      schema,
    ).toJSON() as PmJsonNode;
    const preImages = collectNodes(preJson, 'image');
    expect(preImages.length).toBe(1);
    expect(preImages[0]?.attrs?.src).toBe('/photo.png');

    await wait(300);

    // Execute the branch switch externally (simulates user `git checkout`).
    git(contentDir, 'checkout feature');

    // Wait for the cross-branch path to settle: the head-watcher fires
    // BatchBegin/BatchEnd, the doc-reset loop applies feature-branch disk
    // content, and basenameIndex eventually reflects assets/photo.png. The
    // server-side Y.XmlFragment's PM image src is the one the user-facing
    // preview renders — the assertion target. Polling guards against
    // arbitrary head-watcher debounce; the timeout is generous to absorb CI
    // contention.
    await pollUntil(
      () => {
        const state = getServerState(server, 'test-doc');
        if (!state) return false;
        const json = yXmlFragmentToProseMirrorRootNode(
          state.fragment,
          schema,
        ).toJSON() as PmJsonNode;
        const images = collectNodes(json, 'image');
        // First settlement gate: doc-reset has run (PM image is present
        // post-switch). Whether the src is correct is the actual assertion
        // below; polling on src-correctness would loop until timeout in the
        // RED case, masking the bug.
        return images.length === 1;
      },
      15_000,
      100,
    );

    // Belt-and-suspenders settlement window — give post-batch file-watcher
    // events time to land. If they update basenameIndex via the regular
    // add/remove path, the bug is masked when later assertions read state.
    // 800ms is well past the head-watcher's QUIET_WINDOW_MS (100ms) and
    // parcel-watcher's typical event-delivery window.
    await wait(800);

    // Post-switch assertion (the regression gate): PM image src reflects the
    // FEATURE branch's resolved path. Under the bug, the doc-reset at
    // standalone.ts:1559 runs BEFORE the basenameIndex reseed at line 1645,
    // so resolveEmbed returns 'photo.png' (stale main-branch path) and the
    // PM image src is '/photo.png' instead of '/assets/photo.png'.
    const postState = getServerState(server, 'test-doc');
    if (!postState) throw new Error('server has no test-doc loaded post-switch');
    const postJson = yXmlFragmentToProseMirrorRootNode(
      postState.fragment,
      schema,
    ).toJSON() as PmJsonNode;
    const postImages = collectNodes(postJson, 'image');
    expect(postImages.length).toBe(1);
    expect(postImages[0]?.attrs?.src).toBe('/assets/photo.png');
    expect(postImages[0]?.attrs?.sourceForm).toBe('wikiembed');

    // Disk markdown round-trips identically — the storage layer sees no
    // change. Only the rendered preview's src changes.
    const postSource = postState.fragment.doc?.getText('source').toString() ?? '';
    expect((postSource.match(/!\[\[photo\.png\]\]/g) ?? []).length).toBe(1);
  }, 45_000);
});
