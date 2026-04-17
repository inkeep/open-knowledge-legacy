import { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core';
import type { CC1Signal as ServerCC1Signal } from '@inkeep/open-knowledge-server';

export { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME };

export type DerivedViewChannel = 'files' | 'backlinks' | 'graph' | 'sync-status';

export interface CC1Signal extends ServerCC1Signal {
  ch: DerivedViewChannel;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDerivedViewChannel(value: unknown): value is DerivedViewChannel {
  return value === 'files' || value === 'backlinks' || value === 'graph' || value === 'sync-status';
}

export function parseCC1Signal(payload: string): CC1Signal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!isObject(parsed)) return null;
  if (parsed.v !== CC1_CONTRACT_VERSION) return null;
  if (!isDerivedViewChannel(parsed.ch) || typeof parsed.seq !== 'number') {
    return null;
  }

  return {
    v: CC1_CONTRACT_VERSION,
    ch: parsed.ch,
    seq: parsed.seq,
  };
}

export function defaultCollabWsUrl(): string {
  if (typeof location === 'undefined') {
    return 'ws://localhost/collab';
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/collab`;
}
