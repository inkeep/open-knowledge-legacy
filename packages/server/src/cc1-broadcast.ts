import type { Hocuspocus } from '@hocuspocus/server';
import { getLogger } from './logger.ts';
import { incrementCC1Broadcast, setCC1LastSeq, setCC1SubscriberCount } from './metrics.ts';

export const SYSTEM_DOC_NAME = '__system__';
export const CC1_CONTRACT_VERSION = 1;

const DEBOUNCE_MS = 100;

export function isSystemDoc(documentName: string): boolean {
  return documentName === SYSTEM_DOC_NAME;
}

export interface CC1Signal {
  v: typeof CC1_CONTRACT_VERSION;
  ch: string;
  seq: number;
}

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
    const doc = this.hocuspocus.documents.get(SYSTEM_DOC_NAME);
    if (!doc) {
      if (!this.warnedMissing) {
        this.log.warn(
          {},
          `[cc1] __system__ document not found — broadcasts will be dropped until it is materialized`,
        );
        this.warnedMissing = true;
      }
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
