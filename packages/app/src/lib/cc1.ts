/**
 * Zod-typed parsers for CC1 (push-over-awareness) stateless payloads
 * received from the `__system__` Hocuspocus document.
 *
 * Every parser routes through a Zod v4 schema via `safeParse` — never
 * `JSON.parse` + ad-hoc field checks. Each schema is the single source
 * of truth for its channel's wire shape; consumer types are
 * `z.infer<typeof Schema>`.
 *
 * Design (per `/eng:type-safety`):
 *
 * - **Schema-first.** Adding a field to the wire format means editing
 *   one schema; the consumer type updates automatically.
 *
 * - **`.loose()` for forward-compat** (matches the precedent set by
 *   `packages/server/src/auth-token-schema.ts`). Unknown wire fields
 *   pass through to the parsed result rather than being stripped, so a
 *   future server can add fields without breaking old clients. Same
 *   semantics as v3's `.passthrough()`.
 *
 * - **Discriminated by `ch` literal.** Each schema pins `ch` to a
 *   specific literal so the three parsers are mutually exclusive — no
 *   payload can satisfy more than one. The `SystemDocSubscriber`
 *   stateless handler tries them in order and short-circuits on the
 *   first match.
 *
 * - **`null` on parse failure, never throw.** The stateless listener
 *   sees a steady stream of payloads and must skip ones it doesn't
 *   recognize without surfacing exceptions to React.
 */

import { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core';
import { z } from 'zod';

export { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME };

/**
 * Channels that carry derived-view invalidation hints (file list,
 * backlink graph, hub graph, sync-status). Distinct from the
 * `server-info` and `branch-switched` channels, which carry their own
 * payload shapes.
 */
export const DerivedViewChannelSchema = z.enum(['files', 'backlinks', 'graph', 'sync-status']);
export type DerivedViewChannel = z.infer<typeof DerivedViewChannelSchema>;

/**
 * CC1 derived-view signal. The `v` discriminator pins the contract
 * version; `seq` is monotonic per channel so debounced consumers can
 * dedupe replays.
 */
const CC1SignalSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: DerivedViewChannelSchema,
    seq: z.number(),
  })
  .loose();
type CC1Signal = z.infer<typeof CC1SignalSchema>;

export function parseCC1Signal(payload: string): CC1Signal | null {
  return safeParseJson(payload, CC1SignalSchema);
}

/**
 * Shape the CC1 `server-info` channel emits (see
 * `packages/server/src/cc1-broadcast.ts:emitServerInfo`). Distinct from
 * `CC1Signal` because `server-info` bypasses debounce + monotonic seq
 * machinery and carries the per-process `serverInstanceId` as payload.
 * Kept on its own schema so adding a new derived-view channel doesn't
 * accidentally route an instance-ID payload to a derived-view consumer.
 */
const CC1ServerInfoSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: z.literal('server-info'),
    serverInstanceId: z.string().min(1),
  })
  .loose();
type CC1ServerInfoSignal = z.infer<typeof CC1ServerInfoSchema>;

export function parseCC1ServerInfo(payload: string): CC1ServerInfoSignal | null {
  return safeParseJson(payload, CC1ServerInfoSchema);
}

/**
 * CC1 channel mirror of `packages/server/src/cc1-broadcast.ts`'s
 * `CC1_CHANNEL_BRANCH_SWITCHED`. The server emits this broadcast on
 * cross-branch normalization so live clients can invalidate their
 * IndexedDB persistence caches — pre-switch CRDT items are semantically
 * stale against the new branch's markdown-rebuilt state.
 */
export const CC1_CHANNEL_BRANCH_SWITCHED = 'branch-switched';

const CC1BranchSwitchedSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: z.literal(CC1_CHANNEL_BRANCH_SWITCHED),
    branch: z.string(),
  })
  .loose();
type CC1BranchSwitchedSignal = z.infer<typeof CC1BranchSwitchedSchema>;

export function parseCC1BranchSwitched(payload: string): CC1BranchSwitchedSignal | null {
  return safeParseJson(payload, CC1BranchSwitchedSchema);
}

/**
 * Shared safe-parse for stateless CC1 payloads. JSON parse error or Zod
 * schema mismatch yields `null` so the stateless listener can skip the
 * frame without surfacing an exception. Uses `safeParse` (never throws)
 * instead of `parse` per `/eng:type-safety` validation-narrowing
 * guidance.
 */
function safeParseJson<T extends z.ZodType>(payload: string, schema: T): z.infer<T> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function defaultCollabWsUrl(): string {
  if (typeof location === 'undefined') {
    return 'ws://localhost/collab';
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/collab`;
}
