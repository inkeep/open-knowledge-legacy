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

/**
 * CC1 channel mirror of `packages/server/src/cc1-broadcast.ts`'s
 * `CC1_CHANNEL_BRANCH_SWITCHED`. The server emits this broadcast on
 * cross-branch normalization so live clients can invalidate their
 * IndexedDB persistence caches — pre-switch CRDT items are semantically
 * stale against the new branch's markdown-rebuilt state.
 */
export const CC1_CHANNEL_BRANCH_SWITCHED = 'branch-switched';

/**
 * Shape consumers receive for a successfully-parsed `branch-switched`
 * broadcast. Carries only the fields call-sites act on; unknown wire
 * fields are dropped, which keeps the parse result forward-compatible
 * without tying consumers to future additions.
 */
interface CC1BranchSwitchedSignal {
  branch: string;
}

/**
 * Try to parse a `__system__` stateless payload as a CC1 `branch-switched`
 * broadcast. Returns the branch name payload or `null` when the message
 * is on a different channel, malformed, or missing the `branch` field.
 *
 * Called from `SystemDocSubscriber` alongside `parseCC1ServerInfo` and
 * `parseCC1Signal`. All three parsers are mutually exclusive by channel —
 * no payload can match more than one. Structural over-match is fine:
 * unknown fields pass through because the parser reads only the fields
 * it recognizes (forward-compat; mirrors the `.loose()` zod idiom used
 * by the server-side auth-token schema).
 */
export function parseCC1BranchSwitched(payload: string): CC1BranchSwitchedSignal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  if (parsed.v !== CC1_CONTRACT_VERSION) return null;
  if (parsed.ch !== CC1_CHANNEL_BRANCH_SWITCHED) return null;
  if (typeof parsed.branch !== 'string') return null;
  return { branch: parsed.branch };
}

export function defaultCollabWsUrl(): string {
  if (typeof location === 'undefined') {
    return 'ws://localhost/collab';
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/collab`;
}
