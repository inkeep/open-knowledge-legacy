import type { Hocuspocus } from '@hocuspocus/server';
import {
  CC1_CHANNEL_BRANCH_SWITCHED,
  CC1_CHANNEL_DISK_ACK,
  CC1_CHANNEL_SERVER_INFO,
  CC1_CONTRACT_VERSION,
  CC1BranchSwitchedPayloadSchema,
  CC1DerivedViewPayloadSchema,
  CC1DiskAckPayloadSchema,
  CC1ServerInfoPayloadSchema,
  CONFIG_DOC_NAMES,
  type DerivedViewChannel,
  SYSTEM_DOC_NAME,
} from '@inkeep/open-knowledge-core';
import { getLogger } from './logger.ts';
import {
  incrementCC1Broadcast,
  incrementCC1BroadcastDrop,
  setCC1LastSeq,
  setCC1SubscriberCount,
} from './metrics.ts';

const DEBOUNCE_MS = 100;

/**
 * LRU cap on the per-process `latestDiskAckSVs` map. Bounds the JSON size
 * shipped on every `/api/server-info` request — at ~50-100 bytes per
 * entry (base64-encoded SV + docName), 1000 entries fits comfortably in
 * the ~100 KB range while covering active workspaces of any plausible
 * size. Evicted entries fall back to the client's `lastServerSyncedSV`
 * (the pre-disk-ack baseline), a safe degradation.
 */
const MAX_DISK_ACK_SVS = 1000;

export { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME };

export function isSystemDoc(documentName: string): boolean {
  return documentName === SYSTEM_DOC_NAME;
}

const CONFIG_DOC_NAME_SET: ReadonlySet<string> = new Set(CONFIG_DOC_NAMES);

/**
 * True for the bounded set of well-known config document names
 * (`__config__/workspace`, `__user__/config.yml`).
 *
 * Subsystems keyed off `documentName` MUST short-circuit on this predicate
 * the same way they do on `isSystemDoc`. Config docs are admitted Y.Text-only
 * via `hocuspocus.openDirectConnection()`; the markdown observer bridge,
 * agent-session bookkeeping, file-watcher content classification, derived-
 * index updates, and reconciliation paths all bypass.
 *
 * The membership set is a public contract per spec D39/D40 — adding more
 * names requires explicit re-decision (ASK_FIRST per spec §16).
 */
export function isConfigDoc(documentName: string): boolean {
  return CONFIG_DOC_NAME_SET.has(documentName);
}

export class CC1Broadcaster {
  private readonly hocuspocus: Hocuspocus;
  private readonly seqs = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly log = getLogger('cc1');
  private warnedMissing = false;
  /**
   * Latest disk-ack state vector per documentName. Updated synchronously
   * inside `emitDiskAck` BEFORE the broadcast so the in-process snapshot
   * never lags the wire format.
   *
   * Late-join recovery: CC1 stateless broadcasts have no replay, so a
   * client whose `__system__` WebSocket dropped during a write burst
   * misses every disk-ack frame from that window forever. Without a
   * recovery path, the client's `lastDiskAckedSV` would stay at the last
   * received frame's SV and silently fall behind the actual durable
   * state. The mismatch-recycle path then over-includes durably-persisted
   * bytes in the buffer → re-replays them onto the post-restart server's
   * markdown-rebuilt Y.Doc → content duplication (re-opens the bug class
   * T11 was strengthened to prevent).
   *
   * `getLatestDiskAckSVsAsBase64()` exposes this map for the
   * `GET /api/server-info` handler so the client can refresh its
   * watermarks on every `__system__` reconnect, closing the missed-frame
   * gap. Map is per-process (lifetime = server instance), which is the
   * correct scope: a server restart issues a new `serverInstanceId`,
   * triggers full recycle, and rebuilds the Y.Docs from disk.
   *
   * LRU-bounded at `MAX_DISK_ACK_SVS` entries. `JS Map` preserves
   * insertion order, so `delete` + `set` on each emit promotes the entry
   * to MRU. When the map reaches the cap, the oldest entry is evicted on
   * next set. Clients that miss the watermark for an evicted doc fall
   * back to `lastServerSyncedSV` (the in-memory-acked SV) per the
   * existing baseline-selection — that's the pre-disk-ack behavior, a
   * safe (if slightly less conservative) degradation.
   */
  private readonly latestDiskAckSVs = new Map<string, Uint8Array>();

  constructor(hocuspocus: Hocuspocus) {
    this.hocuspocus = hocuspocus;
  }

  signal(channel: DerivedViewChannel): void {
    const existing = this.timers.get(channel);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    this.timers.set(
      channel,
      setTimeout(() => {
        this.timers.delete(channel);
        this.broadcast(channel);
      }, DEBOUNCE_MS),
    );
  }

  private broadcast(channel: DerivedViewChannel): void {
    try {
      const doc = this.hocuspocus.documents.get(SYSTEM_DOC_NAME);
      if (!doc) {
        if (!this.warnedMissing) {
          this.log.warn(
            {},
            `[cc1] __system__ document not found — broadcasts will be dropped until it is materialized`,
          );
          this.warnedMissing = true;
        }
        incrementCC1BroadcastDrop();
        return;
      }

      const seq = (this.seqs.get(channel) ?? 0) + 1;
      this.seqs.set(channel, seq);

      const payload = CC1DerivedViewPayloadSchema.parse({
        v: CC1_CONTRACT_VERSION,
        ch: channel,
        seq,
      });

      doc.broadcastStateless(JSON.stringify(payload));

      incrementCC1Broadcast();
      setCC1LastSeq(channel, seq);
      setCC1SubscriberCount(doc.getConnectionsCount());
    } catch (err) {
      this.log.error({ err, channel }, '[cc1] broadcast failed');
    }
  }

  /**
   * Broadcast the server's per-process instance ID + active branch on
   * the `server-info` CC1 channel. Bypasses the debounce + seq machinery
   * used by the derived-view channels — instance ID is per-process
   * stable and the branch only changes via the explicit
   * `emitBranchSwitched` path.
   *
   * `broadcastStateless` reaches only the `__system__` subscribers
   * connected at the moment of emit — there is no Hocuspocus-side
   * replay for stateless frames (distinct from awareness state, which
   * does replay on connect). Late joiners receive the values via the
   * `/api/server-info` HTTP boot fetch and the auth-token
   * `expectedServerInstanceId` / `expectedBranch` claims, both of which
   * are validated server-side per connect — the auth path is the
   * actual late-join backstop, not this broadcast.
   *
   * Call once at startup after `__system__` is materialized to seed any
   * subscribers connected during the boot window.
   */
  emitServerInfo(serverInstanceId: string, currentBranch?: string): void {
    try {
      const doc = this.hocuspocus.documents.get(SYSTEM_DOC_NAME);
      if (!doc) {
        if (!this.warnedMissing) {
          this.log.warn({}, `[cc1] __system__ document not found at emitServerInfo — dropped`);
          this.warnedMissing = true;
        }
        incrementCC1BroadcastDrop();
        return;
      }
      const payload = CC1ServerInfoPayloadSchema.parse({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_SERVER_INFO,
        seq: 0,
        serverInstanceId,
        ...(currentBranch !== undefined ? { currentBranch } : {}),
      });
      doc.broadcastStateless(JSON.stringify(payload));
      incrementCC1Broadcast();
      setCC1LastSeq(CC1_CHANNEL_SERVER_INFO, 0);
    } catch (err) {
      this.log.error({ err }, '[cc1] emitServerInfo failed');
    }
  }

  /**
   * Broadcast a `branch-switched` CC1 signal. Fired on the server's
   * cross-branch normalization path so clients can invalidate their
   * IDB persistence caches — after a branch switch the new branch's
   * markdown-rebuilt Y.Doc is the only valid source, and any cached
   * IDB state from the prior branch would produce a phantom merge
   * if replayed.
   *
   * Emit is synchronous (no debounce): cross-branch switches are
   * discrete, non-coalescable events and clients need the signal
   * before they send a stale sync-vector to the new state.
   */
  emitBranchSwitched(branch: string): void {
    try {
      const doc = this.hocuspocus.documents.get(SYSTEM_DOC_NAME);
      if (!doc) {
        if (!this.warnedMissing) {
          this.log.warn({}, `[cc1] __system__ document not found at emitBranchSwitched — dropped`);
          this.warnedMissing = true;
        }
        incrementCC1BroadcastDrop();
        return;
      }
      const seq = (this.seqs.get(CC1_CHANNEL_BRANCH_SWITCHED) ?? 0) + 1;
      this.seqs.set(CC1_CHANNEL_BRANCH_SWITCHED, seq);
      const payload = CC1BranchSwitchedPayloadSchema.parse({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_BRANCH_SWITCHED,
        seq,
        branch,
      });
      doc.broadcastStateless(JSON.stringify(payload));
      incrementCC1Broadcast();
      setCC1LastSeq(CC1_CHANNEL_BRANCH_SWITCHED, seq);
    } catch (err) {
      this.log.error({ err }, '[cc1] emitBranchSwitched failed');
    }
  }

  /**
   * Broadcast a `disk-ack` CC1 signal — per-document state-vector
   * watermark advancing the client's `lastDiskAckedSV`.
   *
   * Fired synchronously (no debounce, mirrors `emitBranchSwitched`)
   * after each successful `onStoreDocument` write. The state vector is
   * captured PRE-WRITE in `persistence.ts` — capturing post-write
   * would race against subsequent updates landing between the write
   * returning and the snapshot, producing a watermark that overstates
   * what's on disk.
   *
   * `sv` is base64-encoded. The wire schema validates `min(1)` so an
   * empty SV (impossible for a non-empty Y.Doc) is rejected by Zod
   * before broadcast.
   */
  emitDiskAck(docName: string, sv: Uint8Array): void {
    // Update the in-process snapshot BEFORE the broadcast so a same-tick
    // `getLatestDiskAckSVsAsBase64()` call (e.g. /api/server-info served
    // synchronously after disk flush) reflects the latest state. The
    // map updates run regardless of broadcast success because the
    // snapshot's purpose is recovery — clients that missed the
    // broadcast read it via /api/server-info instead.
    //
    // LRU promotion: delete-then-set moves the entry to the back of
    // Map's insertion order so the oldest entries fall off first when
    // the cap is hit.
    this.latestDiskAckSVs.delete(docName);
    this.latestDiskAckSVs.set(docName, sv);
    if (this.latestDiskAckSVs.size > MAX_DISK_ACK_SVS) {
      // Evict the oldest entry (front of insertion order).
      const oldest = this.latestDiskAckSVs.keys().next().value;
      if (oldest !== undefined) {
        this.latestDiskAckSVs.delete(oldest);
      }
    }
    try {
      const doc = this.hocuspocus.documents.get(SYSTEM_DOC_NAME);
      if (!doc) {
        if (!this.warnedMissing) {
          this.log.warn({}, `[cc1] __system__ document not found at emitDiskAck — dropped`);
          this.warnedMissing = true;
        }
        incrementCC1BroadcastDrop();
        return;
      }
      const seq = (this.seqs.get(CC1_CHANNEL_DISK_ACK) ?? 0) + 1;
      this.seqs.set(CC1_CHANNEL_DISK_ACK, seq);
      const payload = CC1DiskAckPayloadSchema.parse({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_DISK_ACK,
        seq,
        docName,
        sv: Buffer.from(sv).toString('base64'),
      });
      doc.broadcastStateless(JSON.stringify(payload));
      incrementCC1Broadcast();
      setCC1LastSeq(CC1_CHANNEL_DISK_ACK, seq);
    } catch (err) {
      this.log.error({ err, docName }, '[cc1] emitDiskAck failed');
    }
  }

  /**
   * Snapshot of the latest disk-ack state vector for every doc the
   * server has flushed at least once since startup, encoded as base64
   * for transport via `GET /api/server-info`'s `currentDiskAckSVs`
   * field. Same wire format as the per-frame broadcast `sv`.
   *
   * Returns a fresh object on every call — caller-owned, safe to
   * include in JSON responses. Empty `{}` is a valid return for a
   * cold server (no disks flushed yet).
   */
  getLatestDiskAckSVsAsBase64(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [docName, sv] of this.latestDiskAckSVs) {
      out[docName] = Buffer.from(sv).toString('base64');
    }
    return out;
  }

  get subscriberCount(): number {
    const doc = this.hocuspocus.documents.get(SYSTEM_DOC_NAME);
    return doc ? doc.getConnectionsCount() : 0;
  }

  destroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
