/**
 * Single source of truth for `GET /api/server-info` fetch + dispatch.
 *
 * Used by both:
 *   - `DocumentContext` boot fetch (one-shot when the pool first opens)
 *   - `SystemDocSubscriber` reconnect refresh (every subsequent
 *     `__system__` sync event)
 *
 * The two callers exist because CC1 stateless broadcasts (`server-info`,
 * `branch-switched`, `disk-ack`) have no replay — a client briefly
 * offline during a server-side state change misses the broadcast and
 * needs an alternate recovery path. The auth-token claim defense
 * covers `serverInstanceId` and `currentBranch` (the next reconnect's
 * mismatched claim triggers the recycle), but `disk-ack` has no
 * equivalent backstop because the SV is per-document and not in the
 * auth token. This refresher is the late-join recovery path for
 * disk-ack: every `__system__` reconnect re-syncs the per-doc
 * `lastDiskAckedSV` watermark so the mismatch-recycle baseline-
 * selection always operates on fresh data.
 *
 * Idempotent: every dispatch path no-ops on unchanged inputs
 * (`setExpectedServerInstanceId` early-returns on matching IDs;
 * `compareAndUpdateObservedBranch` returns false unless the branch
 * actually changed; `observeDiskAckBatch` overwrites in-place). Safe
 * to call on every `synced` event without producing redundant
 * recycles.
 *
 * Silent on failure: endpoint unavailability falls back to the
 * existing recovery paths (auth-token-claim mismatch on next provider
 * connect, CC1 broadcasts when reachable).
 */

import { ServerInfoResponseSchema } from '@inkeep/open-knowledge-core';
import { handleBranchSwitched } from '../editor/branch-invalidation';
import type { ProviderPool } from '../editor/provider-pool';

/**
 * Decode a base64 string to `Uint8Array`. Browser-safe (uses `atob`).
 * Throws on invalid base64 — callers wrap in try/catch to honor the
 * helper's "never throws" contract.
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Fetch `/api/server-info` and dispatch every recognized field into
 * the pool. Returns silently on any failure (network error, non-2xx,
 * malformed JSON, schema mismatch); the caller does not need a
 * `try`/`catch`.
 *
 * `baseUrl` is empty for production (relative URL uses the current
 * page's origin) and the test-server URL for integration tests.
 */
export async function refreshServerInfo(pool: ProviderPool, baseUrl = ''): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/server-info`);
  } catch {
    return;
  }
  if (!response.ok) return;
  let info: unknown;
  try {
    info = await response.json();
  } catch {
    return;
  }
  const result = ServerInfoResponseSchema.safeParse(info);
  if (!result.success) return;

  pool.setExpectedServerInstanceId(result.data.serverInstanceId);

  if (result.data.currentBranch !== undefined) {
    if (pool.compareAndUpdateObservedBranch(result.data.currentBranch)) {
      void handleBranchSwitched(pool, result.data.currentBranch);
    }
  }

  if (result.data.currentDiskAckSVs !== undefined) {
    const decoded: Record<string, Uint8Array> = {};
    for (const [docName, svBase64] of Object.entries(result.data.currentDiskAckSVs)) {
      try {
        decoded[docName] = base64ToBytes(svBase64);
      } catch {
        // Skip malformed entries — same "never throws" discipline as
        // `parseCC1DiskAck`. A misbehaving emitter or downgraded WS
        // frame can't take down the dispatch path.
      }
    }
    pool.observeDiskAckBatch(decoded);
  }
}
