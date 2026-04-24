/**
 * T11 — Mid-drain server restart.
 *
 * The persistence module has two debounce layers:
 *   L1: Hocuspocus's onStoreDocument debounce (default 2000ms; tests 200ms)
 *       — flushes Y.Doc markdown to disk.
 *   L2: Shadow-repo commit debounce (`commitDebounceMs`, default 15s; tests
 *       use a short override) — after L1 disk write lands, buildWipTree +
 *       commitWipFromTree is scheduled. The contributor snapshot is drained
 *       atomically at the start of L2.
 *
 * If the server process dies BETWEEN `swapContributors()` and successful
 * `commitWipFromTree` completion, the snapshot is lost. Per Agent-3 brief §8,
 * this is attribution-loss, NOT content-loss — the markdown was already on
 * disk before the drain cycle started.
 *
 * This test codifies the accepted failure mode: content survives; attribution
 * for the crashed drain cycle is forfeit. Any future change that upgrades
 * this to content-loss must flip this test RED.
 *
 * Expected: PASS. Content durable on disk; client Y.Doc reflects content
 * once after reconnect.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProviderPool } from '../../src/editor/provider-pool';
import {
  agentWriteMd,
  createRestartableServer,
  pollDiskContentStable,
  pollUntil,
  wait,
} from './test-harness';

const DURABILITY_MARKER = 'T11-DURABILITY-MARKER-7a3f';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe('T11: Mid-drain server restart', () => {
  test('content written shortly before crash survives restart; attribution may be forfeit', async () => {
    // Short L1 debounce so the markdown lands on disk fast; gitEnabled true so
    // the L2 drain has work to do; short commitDebounce so we can provoke a
    // mid-drain scenario within the test budget.
    let server = await createRestartableServer({
      gitEnabled: true,
      commitDebounceMs: 2000, // L2 drain scheduled 2s after L1 disk write
      debounce: 100, // L1 flush fast
      maxDebounce: 300,
    });
    cleanups.push(() => server.shutdown());

    const pool = new ProviderPool(3, `ws://localhost:${server.port}/collab`);
    cleanups.push(() => pool.dispose());

    pool.open('test-doc');
    pool.setActive('test-doc');
    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);

    const firstProvider = pool.getActive()?.provider;
    if (!firstProvider) throw new Error('pre-restart provider missing');

    // Agent write — content + marker appears on disk when L1 flushes. L2
    // commit fires ~2s later.
    await agentWriteMd(server.port, `\n\n${DURABILITY_MARKER}\n`, {
      docName: 'test-doc',
      position: 'append',
      agentId: 't11-agent',
      agentName: 'T11-Agent',
    });

    // Wait for L1 disk flush.
    await pollDiskContentStable(
      join(server.contentDir, 'test-doc.md'),
      (c) => c.includes(DURABILITY_MARKER),
      { timeoutMs: 5000, settleMs: 200 },
    );

    // Sanity: marker IS on disk right now.
    const contentDir = server.contentDir;
    const preRestartDisk = readFileSync(join(contentDir, 'test-doc.md'), 'utf-8');
    expect(preRestartDisk.includes(DURABILITY_MARKER)).toBe(true);

    // Wait 500ms — L2 drain is scheduled at T+2000ms relative to L1 flush,
    // so we're inside the drain debounce window but BEFORE it fires. Then
    // killAndRestart with 300ms downtime = total ~800ms since L1, well under
    // 2000ms L2 debounce. If we kill here, the git commit for this drain
    // is definitionally lost (was never scheduled before the fresh restart).
    await wait(500);
    server = await server.killAndRestartOnSamePort({ downtimeMs: 300 });
    cleanups.unshift(() => server.shutdown());

    // Client reconnects.
    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);

    // Let server's onLoadDocument + server-observer initial sync fully settle
    // on the post-restart side.
    await wait(500);

    // Content durability: disk still has the marker.
    const postRestartDisk = readFileSync(join(contentDir, 'test-doc.md'), 'utf-8');
    expect(postRestartDisk.includes(DURABILITY_MARKER)).toBe(true);

    // Client sees the content. Because of the bug class (unfixed), we accept
    // that the marker may appear MORE than once — that's T1's duplication,
    // not T11's concern. The invariant for T11 is "marker appears AT LEAST
    // once" — content is not lost.
    const clientText = firstProvider.document.getText('source').toString();
    const markerCountClient = (clientText.match(new RegExp(DURABILITY_MARKER, 'g')) ?? []).length;
    const markerCountDisk = (postRestartDisk.match(new RegExp(DURABILITY_MARKER, 'g')) ?? [])
      .length;

    console.log('[T11] durability counts', {
      client: markerCountClient,
      disk: markerCountDisk,
      diskBytes: postRestartDisk.length,
    });

    expect(markerCountClient).toBeGreaterThanOrEqual(1);
    expect(markerCountDisk).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
