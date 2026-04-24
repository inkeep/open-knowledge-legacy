import { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core';
import type { CC1Signal as ServerCC1Signal } from '@inkeep/open-knowledge-server';

export { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME };

export type DerivedViewChannel = 'files' | 'backlinks' | 'graph' | 'sync-status';

interface CC1Signal extends ServerCC1Signal {
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

/**
 * Shape the CC1 `server-info` channel emits (see
 * `packages/server/src/cc1-broadcast.ts:emitServerInfo`). Distinct from
 * `CC1Signal` because `server-info` bypasses debounce + monotonic seq
 * machinery and carries the per-process `serverInstanceId` as payload.
 * Kept separate from the `DerivedViewChannel` union so adding a new
 * derived-view channel doesn't accidentally create a channel whose
 * downstream treats an instance-ID payload as a cache-invalidation hint.
 */
interface CC1ServerInfoSignal {
  serverInstanceId: string;
}

/**
 * Try to parse a `__system__` stateless payload as a CC1 `server-info`
 * broadcast. Returns the extracted `serverInstanceId` or `null` when the
 * payload is on a different channel, malformed, or missing the field.
 *
 * Called from `SystemDocSubscriber` alongside `parseCC1Signal`. The two
 * parsers are mutually exclusive by channel — no payload can match both.
 * Unparseable JSON or mismatched contract version yields `null`, not a
 * throw, so the stateless listener can cleanly skip.
 */
export function parseCC1ServerInfo(payload: string): CC1ServerInfoSignal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  if (parsed.v !== CC1_CONTRACT_VERSION) return null;
  if (parsed.ch !== 'server-info') return null;
  if (typeof parsed.serverInstanceId !== 'string' || parsed.serverInstanceId.length === 0) {
    return null;
  }
  return { serverInstanceId: parsed.serverInstanceId };
}

export function defaultCollabWsUrl(): string {
  if (typeof location === 'undefined') {
    return 'ws://localhost/collab';
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/collab`;
}
