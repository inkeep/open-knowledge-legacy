/**
 * Canonical Zod schemas for HTTP API response shapes served by
 * `packages/server/src/api-extension.ts`.
 *
 * Schemas live in `packages/core` (browser-safe) so both the server
 * route handlers and client consumers (`DocumentContext`,
 * `test-harness`) import the same shape — single source of truth,
 * no cross-process drift, no Node deps leaking into the browser
 * bundle.
 *
 * Convention per `/eng:type-safety`: `.loose()` preserves unknown
 * fields for forward-compat; inferred types via `z.infer`.
 */

import { z } from 'zod';

/**
 * Response shape for `GET /api/server-info`.
 *
 * The per-process `serverInstanceId` is a UUID generated at server start;
 * the client's `ProviderPool` caches it and uses it in
 * `expectedServerInstanceId` claims on every WebSocket reconnect.
 * Mismatch triggers the client-side restart-recovery recycle path (see
 * `provider-pool.ts:handleServerInstanceMismatch`).
 *
 * `currentBranch` is the late-join backstop for the CC1 `branch-switched`
 * stateless broadcast. Stateless frames have no replay, so a client
 * briefly offline during a branch switch silently re-syncs against the
 * new branch with stale-branch IDB. The boot fetch and every reconnect
 * fetch compare against the last-observed branch; a change triggers
 * `handleBranchSwitched` exactly as the live broadcast would. Optional
 * for backwards-compat with non-git deployments where branch is
 * meaningless.
 *
 * `currentDiskAckSVs` is the late-join backstop for the CC1 `disk-ack`
 * stateless broadcasts. Same gap as `branch-switched` (no replay), with
 * a stronger correctness consequence: a stale `lastDiskAckedSV` would
 * cause the mismatch-recycle baseline-selection to over-include
 * durably-persisted bytes in the buffer, re-replaying them onto the
 * post-restart server's markdown-rebuilt Y.Doc and producing
 * duplication. The map is keyed by `documentName`; values are
 * base64-encoded `Uint8Array` state vectors (same wire shape as
 * `CC1DiskAckPayload.sv`). Clients refresh their per-entry
 * `lastDiskAckedSV` on every `__system__` reconnect via this fetch.
 * Empty `{}` is valid (cold server with no flushed docs).
 */
export const ServerInfoResponseSchema = z
  .object({
    ok: z.literal(true),
    serverInstanceId: z.string().min(1),
    currentBranch: z.string().min(1).optional(),
    currentDiskAckSVs: z.record(z.string().min(1), z.string().min(1)).optional(),
  })
  .loose();
export type ServerInfoResponse = z.infer<typeof ServerInfoResponseSchema>;

/**
 * Response shape for `GET /api/principal`.
 *
 * The Zod schema is the single source of truth for the wire shape; the
 * `Principal` type alias re-exported from `../types/principal.ts` is
 * `z.infer<typeof PrincipalResponseSchema>`. Schema-first eliminates the
 * "two parallel declarations + cast at trust boundary" failure class.
 *
 * `display_name` and `display_email` are `.min(1)` so an empty git-config
 * value (template-rendered configs, mis-quoted setup scripts) routes
 * through the `safeParse` failure path to the random-identity fallback
 * rather than rendering an empty initial / blank tooltip / blank cursor
 * label downstream.
 *
 * `.loose()` preserves unknown fields for forward-compat — new server
 * fields don't break older clients. Parse failures fall back silently to
 * the random-identity fallback; presence remains functional.
 */
export const PrincipalResponseSchema = z
  .object({
    id: z.string().min(1),
    display_name: z.string().min(1),
    display_email: z.string().min(1),
    source: z.enum(['git-config', 'synthesized']),
    created_at: z.string().min(1),
  })
  .loose();
export type PrincipalResponse = z.infer<typeof PrincipalResponseSchema>;
