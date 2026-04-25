/**
 * Canonical Zod schemas for CC1 (push-over-awareness) stateless payloads.
 *
 * Schemas live in `packages/core` so both `packages/server` (emit) and
 * `packages/app` (parse) import the same shape definitions — single
 * source of truth across the process boundary. `packages/core` is
 * browser-safe (no Node dependencies), so importing these schemas from
 * the client Vite bundle does not pull in server-only deps.
 *
 * Convention (per `/eng:type-safety`):
 *
 * - **Schema-first.** Adding a field means editing one schema here; the
 *   inferred type updates automatically in every consumer.
 *
 * - **`.loose()` for forward-compat** (matches `auth-token-schema.ts`).
 *   Unknown fields pass through rather than being stripped, so a future
 *   server version can extend a payload without breaking older clients.
 *
 * - **Each schema pins `ch` to a specific literal** (or enum for the
 *   derived-view variants) so the three parsers remain mutually
 *   exclusive — the client's stateless handler tries them in order and
 *   short-circuits on the first match.
 */

import { z } from 'zod';
import { CC1_CONTRACT_VERSION } from '../constants/cc1.ts';

/** CC1 channel identifier for the per-process `serverInstanceId` broadcast. */
export const CC1_CHANNEL_SERVER_INFO = 'server-info' as const;

/**
 * CC1 channel identifier for the cross-branch invalidation broadcast.
 * Fired on the server's cross-branch normalization path; clients clear
 * their IndexedDB persistence caches on receipt because the new
 * branch's markdown-rebuilt state is the only valid source.
 */
export const CC1_CHANNEL_BRANCH_SWITCHED = 'branch-switched' as const;

/**
 * Channels that carry derived-view invalidation hints (file list,
 * backlink graph, hub graph, sync-status). Debounced + seq-incrementing
 * on the server; invalidates TanStack Query caches on the client.
 */
export const DerivedViewChannelSchema = z.enum([
  'files',
  'backlinks',
  'graph',
  'sync-status',
  'session-activity',
]);
export type DerivedViewChannel = z.infer<typeof DerivedViewChannelSchema>;

/** `server-info` broadcast shape.
 *
 * `currentBranch` is the late-join backstop for the cross-branch
 * invalidation flow — clients reconnecting after a branch switch
 * compare it against their last-observed branch and trigger
 * `handleBranchSwitched` on mismatch (`branch-switched` is stateless
 * and has no replay). Optional for backwards compat with non-git
 * deployments. */
export const CC1ServerInfoPayloadSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: z.literal(CC1_CHANNEL_SERVER_INFO),
    seq: z.number(),
    serverInstanceId: z.string().min(1),
    currentBranch: z.string().min(1).optional(),
  })
  .loose();
export type CC1ServerInfoPayload = z.infer<typeof CC1ServerInfoPayloadSchema>;

/** `branch-switched` broadcast shape. */
export const CC1BranchSwitchedPayloadSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: z.literal(CC1_CHANNEL_BRANCH_SWITCHED),
    seq: z.number(),
    branch: z.string().min(1),
  })
  .loose();
export type CC1BranchSwitchedPayload = z.infer<typeof CC1BranchSwitchedPayloadSchema>;

/** Derived-view broadcast shape (`files` / `backlinks` / `graph` / `sync-status`). */
export const CC1DerivedViewPayloadSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: DerivedViewChannelSchema,
    seq: z.number(),
  })
  .loose();
export type CC1DerivedViewPayload = z.infer<typeof CC1DerivedViewPayloadSchema>;
