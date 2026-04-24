import type { Hocuspocus } from '@hocuspocus/server';
import { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core';
import { getLogger } from './logger.ts';
import {
  incrementCC1Broadcast,
  incrementCC1BroadcastDrop,
  setCC1LastSeq,
  setCC1SubscriberCount,
} from './metrics.ts';

const DEBOUNCE_MS = 100;

export { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME };

export function isSystemDoc(documentName: string): boolean {
  return documentName === SYSTEM_DOC_NAME;
}

export interface CC1Signal {
  v: typeof CC1_CONTRACT_VERSION;
  ch: string;
  seq: number;
  /**
   * Only populated on `ch === 'server-info'` broadcasts. Carries the
   * per-process serverInstanceId the clients use for restart-defense.
   * See `ServerInstance.serverInstanceId` in standalone.ts for the full
   * defense flow.
   */
  serverInstanceId?: string;
}

/** CC1 channel for the server-info broadcast (per-process instance ID). */
export const CC1_CHANNEL_SERVER_INFO = 'server-info';

export class CC1Broadcaster {
  private readonly hocuspocus: Hocuspocus;
  private readonly seqs = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly log = getLogger('cc1');
  private warnedMissing = false;

  constructor(hocuspocus: Hocuspocus) {
    this.hocuspocus = hocuspocus;
  }

  signal(channel: string): void {
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

  private broadcast(channel: string): void {
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

      const payload: CC1Signal = {
        v: CC1_CONTRACT_VERSION,
        ch: channel,
        seq,
      };

      doc.broadcastStateless(JSON.stringify(payload));

      incrementCC1Broadcast();
      setCC1LastSeq(channel, seq);
      setCC1SubscriberCount(doc.getConnectionsCount());
    } catch (err) {
      this.log.error({ err, channel }, '[cc1] broadcast failed');
    }
  }

  /**
   * Broadcast the server's per-process instance ID on the `server-info`
   * CC1 channel. Bypasses the debounce + seq machinery used by the
   * derived-view channels — instance ID does not change during a process
   * lifetime and new subscribers need an immediate signal on first
   * `__system__` connect. Call once at startup after `__system__` is
   * materialized, and additionally on every new subscriber if desired
   * (Hocuspocus's awareness replay covers late joiners without us
   * needing to re-broadcast, but a re-broadcast is cheap and idempotent).
   */
  emitServerInfo(serverInstanceId: string): void {
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
      const payload: CC1Signal = {
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_SERVER_INFO,
        seq: 0,
        serverInstanceId,
      };
      doc.broadcastStateless(JSON.stringify(payload));
      incrementCC1Broadcast();
      setCC1LastSeq(CC1_CHANNEL_SERVER_INFO, 0);
    } catch (err) {
      this.log.error({ err }, '[cc1] emitServerInfo failed');
    }
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
