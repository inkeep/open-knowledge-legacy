import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProviderPool } from '../../src/editor/provider-pool';
import {
  assertNoClientIdDrift,
  createRestartableServer,
  pollDiskContentStable,
  pollUntil,
  type RestartableServer,
  seedPoolServerInstanceId,
  wait,
} from './test-harness';

// Fixture with markers that appear at known counts: 2 `# Test Document`,
// 1 `[[test-doc]]`, 1 `[[asdf]]`. The bug class would double each marker.
const SMALL_FIXTURE = `[[asdf]]

# Test Documentasdfasdf

## Status

Status: complete

## Notes

Notes added by agent.

## Next Steps

Review patch behavior

# Test Document

## Status

Status: complete

## Notes

Notes added by agent.

## Next Steps

Review patch behavior

  Alpha
  Beta
  Gamma

  [[test-doc]]
  [[Nonexistent Page]]

[[blahboop]]

[[asdfasdfasdf]]
`;

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

/** Seed the fixture on disk and wait for the pool's active provider to reach
 *  synced + zero unsynced changes. Returns the first provider instance so
 *  tests can assert reference identity after a restart. */
async function seedAndSyncSingleClient(
  server: RestartableServer,
  pool: ProviderPool,
  docName: string,
): Promise<import('@hocuspocus/provider').HocuspocusProvider> {
  writeFileSync(join(server.contentDir, `${docName}.md`), SMALL_FIXTURE, 'utf-8');
  pool.open(docName);
  pool.setActive(docName);
  await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);
  await pollUntil(() => pool.getActive()?.provider.unsyncedChanges === 0, 10_000, 50);
  // Let persistence settle its load-time reconciledBase. 150ms matches prior
  // test's empirical "just enough" window; the first onStoreDocument-short-circuit
  // needs the reconciledBase set before any unrelated write fires.
  await wait(150);
  const first = pool.getActive()?.provider;
  if (!first) throw new Error('seedAndSyncSingleClient: provider missing after sync');
  return first;
}

describe('ProviderPool reconnects', () => {
  // T3 — Slow restart >4s: pool.RECYCLE_DEBOUNCE_MS fires, provider is rebuilt,
  //      fresh Y.Doc replaces the stale one, and sync with the fresh server
  //      produces canonical on-disk content.
  test('slow server restart (>4s): pool recycles, no duplication', async () => {
    let server = await createRestartableServer();
    cleanups.push(() => server.shutdown());

    const pool = new ProviderPool(3, `ws://localhost:${server.port}/collab`);
    cleanups.push(() => pool.dispose());
    await seedPoolServerInstanceId(server, pool);

    const firstProvider = await seedAndSyncSingleClient(server, pool, 'test-doc');

    // Baseline fixture counts on disk.
    const baseline = readFileSync(join(server.contentDir, 'test-doc.md'), 'utf-8');
    expect((baseline.match(/\[\[test-doc\]\]/g) ?? []).length).toBe(1);
    expect((baseline.match(/# Test Document/g) ?? []).length).toBe(2);

    // Slow restart — 5s downtime exceeds ProviderPool.RECYCLE_DEBOUNCE_MS (4000ms).
    // The pool's recycle timer fires before the new server comes back up, so the
    // client's stale Y.Doc is discarded and a fresh provider connects to the
    // rebuilt server Y.Doc. No clientID drift possible.
    server = await server.killAndRestartOnSamePort({ downtimeMs: 5000 });
    cleanups.unshift(() => server.shutdown());

    // Wait for pool to have recycled (provider reference changed) + resynced.
    await pollUntil(() => pool.getActive()?.provider !== firstProvider, 10_000, 50);
    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);

    // Mechanism confirmation: pool recycled as expected for slow-restart path.
    expect(pool.getActive()?.provider).not.toBe(firstProvider);

    // Behavior: disk content matches baseline exactly once (persistence may
    // have re-serialized post-sync; wait for stability via content predicate).
    const afterRestart = await pollDiskContentStable(
      join(server.contentDir, 'test-doc.md'),
      (c) =>
        (c.match(/# Test Document/g) ?? []).length === 2 &&
        (c.match(/\[\[test-doc\]\]/g) ?? []).length === 1,
      { timeoutMs: 8000 },
    );
    expect((afterRestart.match(/\[\[test-doc\]\]/g) ?? []).length).toBe(1);
    expect((afterRestart.match(/# Test Document/g) ?? []).length).toBe(2);
    expect((afterRestart.match(/\[\[asdf\]\]/g) ?? []).length).toBe(1);
  }, 30_000);

  // T1 — Fast restart <4s: the bug-class repro.
  //
  // The pool's RECYCLE_DEBOUNCE_MS = 4000ms window is designed to absorb typical
  // server restarts (1-3s). Inside that window the existing client Y.Doc survives
  // and reconnects to the freshly-rebuilt server Y.Doc — which has a different
  // clientID. Yjs merges item streams across disjoint clientID sets additively
  // (union, not dedup-by-content), so disk content appears twice after the first
  // persistence flush post-reconnect.
  //
  // This test is expected to FAIL until the fix lands. When a fix makes it pass,
  // the `expect(...).toBe(baseline)` assertions flip from red to green.
  test('REPRO: fast server restart (<4s) keeps the same provider and duplicates content', async () => {
    let server = await createRestartableServer();
    cleanups.push(() => server.shutdown());

    const pool = new ProviderPool(3, `ws://localhost:${server.port}/collab`);
    cleanups.push(() => pool.dispose());
    await seedPoolServerInstanceId(server, pool);

    await seedAndSyncSingleClient(server, pool, 'test-doc');

    // Baseline on disk.
    const baseline = readFileSync(join(server.contentDir, 'test-doc.md'), 'utf-8');
    const baselineTestDocLinks = (baseline.match(/\[\[test-doc\]\]/g) ?? []).length;
    const baselineHeadings = (baseline.match(/# Test Document/g) ?? []).length;
    const baselineAsdfLinks = (baseline.match(/\[\[asdf\]\]/g) ?? []).length;
    expect(baselineTestDocLinks).toBe(1);
    expect(baselineHeadings).toBe(2);
    expect(baselineAsdfLinks).toBe(1);

    // Capture the client's pre-restart clientID set — this is the mechanism
    // baseline. After a clean restart, the client's clientID set should not
    // grow (no new Items got added under a foreign clientID).
    const preRestartClientIds = new Set(pool.getActive()?.provider.document.store.clients.keys());

    // Fast restart — 500ms downtime, well under RECYCLE_DEBOUNCE_MS = 4000.
    // Pre-fix the pool's pending recycle timer would have been cancelled by
    // onSynced and the stale Y.Doc would survive. Post-fix (US-002 / Commit
    // 4), the server's onAuthenticate rejects on server-instance-mismatch,
    // the client's authenticationFailed handler fires, and every pool entry
    // recycles BEFORE Yjs sync can merge ghost state. Either way the test's
    // real assertion — no content duplication on disk — is the behavior we
    // care about.
    server = await server.killAndRestartOnSamePort({ downtimeMs: 500 });
    cleanups.unshift(() => server.shutdown());

    // Wait for the pool to resume a synced active provider — whether same
    // or fresh (post-fix recycle). The identity check at line 183 used to
    // gate this test on "bug-class reached," but the fix makes recycling
    // mandatory; a fresh provider is now the correct post-restart shape.
    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);

    // Mechanism-level observability: pre-fix the client's clientID set grew
    // (it learned about the server's fresh clientID post-restart). Post-fix
    // the client's Y.Doc has been replaced entirely, so its clientID set
    // reflects the new Y.Doc's clientID — which is itself post-restart. The
    // log stays for debugging; no assertion on same-provider.
    const postRestartClientIds = new Set(pool.getActive()?.provider.document.store.clients.keys());
    const grewBy = postRestartClientIds.size - preRestartClientIds.size;
    console.log('[REPRO] clientID set', {
      preRestart: [...preRestartClientIds],
      postRestart: [...postRestartClientIds],
      grewBy,
    });

    // Behavior-level signal: disk content materializes duplicated after the
    // persistence debounce flushes the merged Y.Doc. Wait for stability — we
    // don't want to sample mid-debounce.
    const afterRestart = await pollDiskContentStable(
      join(server.contentDir, 'test-doc.md'),
      // Accept as "stable" any state that includes at least one copy of each
      // marker — passes for both pre-fix (duplicated) and post-fix (canonical).
      (c) => c.includes('# Test Document') && c.includes('[[test-doc]]'),
      { timeoutMs: 5000, settleMs: 400 },
    );
    const afterTestDocLinks = (afterRestart.match(/\[\[test-doc\]\]/g) ?? []).length;
    const afterHeadings = (afterRestart.match(/# Test Document/g) ?? []).length;
    const afterAsdfLinks = (afterRestart.match(/\[\[asdf\]\]/g) ?? []).length;

    console.log('[REPRO] counts', {
      baseline: {
        testDocLinks: baselineTestDocLinks,
        headings: baselineHeadings,
        asdf: baselineAsdfLinks,
      },
      after: {
        testDocLinks: afterTestDocLinks,
        headings: afterHeadings,
        asdf: afterAsdfLinks,
      },
      diskBytes: afterRestart.length,
    });

    // Expect NO duplication. Currently fails (the bug); the fix must make this pass.
    expect(afterTestDocLinks).toBe(baselineTestDocLinks);
    expect(afterHeadings).toBe(baselineHeadings);
    expect(afterAsdfLinks).toBe(baselineAsdfLinks);

    // Also assert no clientID drift — the mechanism assertion.
    const serverDoc = server.instance.hocuspocus.documents.get('test-doc');
    if (!serverDoc) throw new Error('server doc missing post-restart');
    const activeEntry = pool.getActive();
    if (!activeEntry) throw new Error('pool has no active entry after reconnect');
    assertNoClientIdDrift(
      {
        docName: 'test-doc',
        doc: activeEntry.provider.document,
        ytext: activeEntry.provider.document.getText('source'),
        fragment: activeEntry.provider.document.getXmlFragment('default'),
        provider: activeEntry.provider,
        pauseSync: () => {
          throw new Error('pauseSync not available');
        },
        resumeSync: () => {
          throw new Error('resumeSync not available');
        },
        cleanup: async () => {
          /* pool owns teardown */
        },
      },
      serverDoc,
      'post fast-restart',
    );
  }, 30_000);

  // T4 — Unsynced local changes during disconnect/restart.
  //
  // Under `provider.unsyncedChanges > 0`, provider-pool.ts:260 SKIPS the
  // recycle scheduling entirely (not just cancels on reconnect). So the pool
  // ALWAYS keeps the stale Y.Doc in this scenario, regardless of restart timing.
  // The test asserts (a) the local unsynced edit survives and (b) pre-disconnect
  // content is not duplicated.
  //
  // Expected: FAIL until fix. The unsynced-changes path has no content-level
  // defense today.
  test('REPRO: unsynced local changes during restart preserve edit and avoid duplication', async () => {
    let server = await createRestartableServer();
    cleanups.push(() => server.shutdown());

    const pool = new ProviderPool(3, `ws://localhost:${server.port}/collab`);
    cleanups.push(() => pool.dispose());
    await seedPoolServerInstanceId(server, pool);

    const firstProvider = await seedAndSyncSingleClient(server, pool, 'test-doc');

    // Make a local WYSIWYG-style edit to bump unsyncedChanges.
    // Use the fragment directly so the edit is a real Y.js mutation (producing
    // an Item under the client's clientID).
    const UNIQUE_LOCAL_MARKER = 'T4-LOCAL-EDIT-MARKER-9f3a';
    const doc = firstProvider.document;
    const Y = await import('yjs');
    const paragraph = new Y.XmlElement('paragraph');
    const ytext = new Y.XmlText();
    ytext.applyDelta([{ insert: UNIQUE_LOCAL_MARKER }]);
    paragraph.insert(0, [ytext]);
    doc.getXmlFragment('default').push([paragraph]);

    // Kill the network fast enough that the SyncStatus ack can't round-trip.
    // 50ms window between edit and killNetwork — tighter than Hocuspocus's
    // typical ack latency on loopback (~1-5ms), so this is best-effort; if the
    // ack lands first, unsyncedChanges will be 0 and the scenario degrades to
    // the T1 fast-restart case. We assert the scenario precondition below.
    server.killNetwork();
    // Small wait so the client's websocket observes the disconnect.
    await wait(100);

    // Precondition: disconnect was observed.
    expect(pool.getActive()?.syncState).toBe('disconnected');

    // Restart on same port, fast window.
    server = await server.killAndRestartOnSamePort({ downtimeMs: 400 });
    cleanups.unshift(() => server.shutdown());

    // Wait for re-sync.
    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);

    // Pre-fix mechanism precondition was `expect(pool.getActive()?.provider).toBe(firstProvider)`
    // — the unsynced-changes disconnect path never recycled. Post-Commit-4,
    // the authenticationFailed handler recycles unconditionally, losing the
    // unsynced edit (this is the "degraded path" the plan calls out as
    // out-of-scope for v1 and expects to remain FAIL at this commit). The
    // behavior assertion below (marker count = 1) is what flips PASS at
    // Commit 6 when the server-side sidecar preserves the edit across
    // restart; the client then syncs from sidecar-restored state and sees
    // its own marker again.

    // The local edit survives in the client's Y.Doc.
    await pollUntil(
      () =>
        pool
          .getActive()
          ?.provider.document.getText('source')
          .toString()
          .includes(UNIQUE_LOCAL_MARKER) ?? false,
      5000,
      50,
    );

    // Behavior: disk content matches baseline + exactly one copy of the local
    // marker (no duplication).
    const afterRestart = await pollDiskContentStable(
      join(server.contentDir, 'test-doc.md'),
      (c) => c.includes(UNIQUE_LOCAL_MARKER),
      { timeoutMs: 8000, settleMs: 400 },
    );
    const afterHeadings = (afterRestart.match(/# Test Document/g) ?? []).length;
    const afterTestDocLinks = (afterRestart.match(/\[\[test-doc\]\]/g) ?? []).length;
    const afterLocalMarker = (afterRestart.match(new RegExp(UNIQUE_LOCAL_MARKER, 'g')) ?? [])
      .length;

    console.log('[T4] counts', {
      afterHeadings,
      afterTestDocLinks,
      afterLocalMarker,
      diskBytes: afterRestart.length,
    });

    expect(afterHeadings).toBe(2);
    expect(afterTestDocLinks).toBe(1);
    expect(afterLocalMarker).toBe(1);
  }, 30_000);
});
