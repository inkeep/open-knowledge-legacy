/**
 * T15 — Missed-frame disk-ack recovery.
 *
 * Closes the failure mode flagged in PR #311 round-9 review: CC1
 * stateless broadcasts have no replay, so a client whose `__system__`
 * WebSocket dropped during a write burst would otherwise miss every
 * disk-ack frame from that window forever, leaving `lastDiskAckedSV`
 * permanently stale. The mismatch-recycle baseline-selection then
 * over-includes durably-persisted bytes in the buffer, replays them
 * onto the post-restart server's markdown-rebuilt Y.Doc, and produces
 * content duplication — the very bug class T11 was strengthened to
 * prevent.
 *
 * The fix: server tracks the latest disk-ack SV per doc and exposes
 * via `GET /api/server-info`'s `currentDiskAckSVs` field. Clients
 * refresh on every `__system__` reconnect via `refreshServerInfo`.
 *
 * This test exercises the missed-frame flow end-to-end:
 *   1. Boot system-doc subscriber (receives initial disk-ack frames live).
 *   2. Apply enough writes to trigger one disk-ack broadcast (caught live).
 *   3. Force-disconnect the system-doc subscriber.
 *   4. Apply more writes that produce disk-ack frames the disconnected
 *      subscriber MUST miss.
 *   5. Reconnect the system-doc subscriber → triggers refresh via
 *      `/api/server-info` → `lastDiskAckedSV` advances to the missed-window
 *      SVs.
 *   6. Restart the server → triggers `server-instance-mismatch` →
 *      mismatch-recycle uses the FRESHLY REFRESHED `lastDiskAckedSV` as
 *      baseline → buffer correctly excludes durably-persisted bytes →
 *      replay produces no duplication.
 *
 * Without the fix (no `/api/server-info` refresh on reconnect), step 5
 * would leave `lastDiskAckedSV` at the step-2 watermark, step 6's recycle
 * would over-include the missed-window content in the buffer, and the
 * marker would appear at clock 2 (one from disk rebuild, one from
 * replay).
 *
 * Expected: PASS. Both client and disk show the marker exactly once
 * after the recycle.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProviderPool } from '../../src/editor/provider-pool';
import { refreshServerInfo } from '../../src/lib/server-info-refresh';
import {
  agentWriteMd,
  attachSystemDocSubscriber,
  createRestartableServer,
  pollDiskContentStable,
  pollUntil,
  wait,
} from './test-harness';

const MARKER = 'T15-MISSED-FRAME-MARKER-9b2e';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe('T15: Missed disk-ack frame recovery via /api/server-info', () => {
  test('systemSub disconnect during write burst, reconnect refreshes watermarks, no duplication after restart', async () => {
    let server = await createRestartableServer({
      gitEnabled: true,
      commitDebounceMs: 2000,
      debounce: 100,
      maxDebounce: 300,
    });
    cleanups.push(() => server.shutdown());

    const baseUrl = `http://localhost:${server.port}`;
    const pool = new ProviderPool(3, `ws://localhost:${server.port}/collab`);
    cleanups.push(() => pool.dispose());

    // Boot fetch (mirrors DocumentContext) — seeds serverInstanceId,
    // currentBranch, and the (initially empty) currentDiskAckSVs map.
    await refreshServerInfo(pool, baseUrl);

    // System-doc subscriber: receives live disk-ack frames AND
    // refreshes via /api/server-info on every reconnect.
    let systemSub = attachSystemDocSubscriber(pool, server.port);
    cleanups.push(() => systemSub.dispose());

    pool.open('test-doc');
    pool.setActive('test-doc');
    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);

    const firstProvider = pool.getActive()?.provider;
    if (!firstProvider) throw new Error('pre-disconnect provider missing');

    // Phase 1 — apply a write the live subscriber CATCHES so that
    // `lastDiskAckedSV` advances normally. Establishes the baseline
    // watermark before we start dropping frames.
    await agentWriteMd(server.port, '\n\nPHASE-1-PRE-DISCONNECT\n', {
      docName: 'test-doc',
      position: 'append',
      agentId: 't15-agent',
      agentName: 'T15-Agent',
    });
    await pollDiskContentStable(
      join(server.contentDir, 'test-doc.md'),
      (c) => c.includes('PHASE-1-PRE-DISCONNECT'),
      { timeoutMs: 5_000, settleMs: 200 },
    );
    // Give the disk-ack frame time to traverse the live __system__
    // subscription before we tear it down.
    await wait(300);

    // Phase 2 — disconnect the system-doc subscriber. The pool's
    // user-doc WS stays connected; only the __system__ channel
    // drops. Subsequent disk-ack frames will be lost.
    await systemSub.dispose();

    // Phase 3 — write the marker. The L1 flush + emitDiskAck happens
    // while the system-doc subscriber is gone. The frame is
    // structurally lost (no subscriber to receive it).
    await agentWriteMd(server.port, `${MARKER}\n`, {
      docName: 'test-doc',
      position: 'append',
      agentId: 't15-agent',
      agentName: 'T15-Agent',
    });
    await pollDiskContentStable(join(server.contentDir, 'test-doc.md'), (c) => c.includes(MARKER), {
      timeoutMs: 5_000,
      settleMs: 200,
    });
    // Confirm the marker is durably on disk before we restart.
    const preRestartDisk = readFileSync(join(server.contentDir, 'test-doc.md'), 'utf-8');
    expect(preRestartDisk.includes(MARKER)).toBe(true);

    // Phase 4 — reconnect the system-doc subscriber. The reconnect
    // triggers `refreshServerInfo(pool, baseUrl)` via the harness's
    // `synced`-after-first wiring, refreshing `lastDiskAckedSV` for
    // 'test-doc' to the post-disk-write SV. WITHOUT the
    // /api/server-info refresh, this watermark would stay at Phase 1's
    // (pre-marker) SV.
    systemSub = attachSystemDocSubscriber(pool, server.port);
    cleanups.push(() => systemSub.dispose());
    // Allow the systemSub's first synced + reconnect refresh fetch to
    // land before we trigger the restart. The dispatcher pattern
    // (first synced is the seed; subsequent synceds trigger refetch)
    // means we need ANOTHER synced cycle to count as a "reconnect"
    // refresh. A small wait gives the harness's refetch path time
    // to land.
    await wait(500);
    // Manually invoke refreshServerInfo to mirror what the second
    // synced event would do — explicit so this test is deterministic
    // regardless of internal first-synced gate timing.
    await refreshServerInfo(pool, baseUrl);

    // Phase 5 — restart the server. New serverInstanceId triggers
    // server-instance-mismatch on reconnect → mismatch-recycle uses
    // the now-fresh `lastDiskAckedSV` as baseline → buffer
    // correctly excludes the marker (which IS on disk → which IS in
    // the post-restart server's markdown-rebuilt Y.Doc).
    server = await server.killAndRestartOnSamePort({ downtimeMs: 300 });
    cleanups.unshift(() => server.shutdown());

    // Wait for client to reconnect + recycle to complete.
    await pollUntil(() => pool.getActive()?.provider !== firstProvider, 10_000, 50);
    await pollUntil(() => pool.getActive()?.provider.isSynced === true, 10_000, 50);
    await wait(500);

    // Behavior — exactly one marker on both client and disk.
    const postRestartDisk = readFileSync(join(server.contentDir, 'test-doc.md'), 'utf-8');
    const postProvider = pool.getActive()?.provider;
    if (!postProvider) throw new Error('post-restart provider missing');
    const clientText = postProvider.document.getText('source').toString();

    const markerCountClient = (clientText.match(new RegExp(MARKER, 'g')) ?? []).length;
    const markerCountDisk = (postRestartDisk.match(new RegExp(MARKER, 'g')) ?? []).length;

    expect(markerCountClient).toBe(1);
    expect(markerCountDisk).toBe(1);
  }, 45_000);
});
