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
 * Matches construction at `api-extension.ts:handleServerInfo`, which
 * writes `{ ok: true, serverInstanceId }`. The per-process
 * `serverInstanceId` is a UUID generated at server start; the client's
 * `ProviderPool` caches it and uses it in `expectedServerInstanceId`
 * claims on every WebSocket reconnect. Mismatch triggers the
 * client-side restart-recovery recycle path (see
 * `provider-pool.ts:handleServerInstanceMismatch`).
 */
export const ServerInfoResponseSchema = z
  .object({
    ok: z.literal(true),
    serverInstanceId: z.string().min(1),
  })
  .loose();
export type ServerInfoResponse = z.infer<typeof ServerInfoResponseSchema>;
