/**
 * Zod-typed shape of the JSON token browsers and agent clients send in the
 * Hocuspocus WebSocket `token` field. Every `onAuthenticate` hook that parses
 * a token MUST route through `HocuspocusAuthTokenSchema.safeParse` — never
 * call `JSON.parse` + ad-hoc field checks.
 *
 * Design decisions:
 *
 * - **All fields optional.** Legacy clients and test harnesses that never
 *   set a token (or set a minimal token) must continue to authenticate
 *   cleanly. A parse error or a fully-optional schema both lead to the
 *   same `principalId: undefined` path downstream.
 *
 * - **`.loose()` (v4 idiom for v3's `.passthrough()`).** Unknown fields
 *   are preserved rather than stripped so a new client sending an
 *   undiscovered field against an old server doesn't lose information
 *   (forward-compat). Equally, old clients omitting newer fields hit the
 *   `.optional()` branches (backward-compat).
 *
 * - **String types, not branded.** `principalId`/`tabSessionId`/
 *   `expectedServerInstanceId` are transport-layer identifiers; they are
 *   consumed immediately by the auth hook and don't travel further. Zod
 *   branding earns its weight on long-lived domain types, not on
 *   here-and-gone auth payloads.
 *
 * - **Schema IS the single source of truth.** `HocuspocusAuthToken` is
 *   `z.infer<typeof HocuspocusAuthTokenSchema>` — adding a field to the
 *   schema automatically picks up in the type.
 *
 * Fields:
 * - `principalId` — browser-principal identity (stable UUID from
 *   `.open-knowledge/principal.json`). Empty/absent → write falls through
 *   to SERVICE_WRITER attribution.
 * - `tabSessionId` — per-tab UUID, generated once at tab open. Used by the
 *   server only for telemetry/correlation today.
 * - `expectedServerInstanceId` — defense-in-depth for the CRDT clientID-
 *   mismatch bug class. Clients cache the last-observed server instance ID
 *   and claim it on every reconnect; server rejects on mismatch so a
 *   stale-client reconnect is recycled BEFORE Yjs sync can merge.
 * - `expectedBranch` — late-join backstop for the cross-branch invalidation
 *   flow. Mirrors `expectedServerInstanceId`. Clients cache the last
 *   observed branch (boot HTTP fetch + CC1 server-info) and claim it on
 *   every reconnect; server rejects with `reason: 'branch-mismatch'` on
 *   non-empty mismatch so a client reconnecting after a branch switch they
 *   missed (offline window, fresh tab restored from stale IDB) is forced
 *   through `handleBranchSwitched` BEFORE Yjs sync can union-merge stale
 *   branch state. Empty / absent claims are accepted (legacy / non-git).
 */
import { z } from 'zod';

export const HocuspocusAuthTokenSchema = z
  .object({
    // String fields are NOT `.min(1)` — empty fields are treated as
    // "absent" by individual consumers, but the rest of a partial token
    // (`{principalId, tabSessionId, expectedServerInstanceId: ''}`) must
    // still parse so the principal claim flows through. Schema-level
    // `.min(1)` would discard every field of such tokens.
    principalId: z.string().optional(),
    tabSessionId: z.string().optional(),
    expectedServerInstanceId: z.string().optional(),
    expectedBranch: z.string().optional(),
  })
  .loose();

export type HocuspocusAuthToken = z.infer<typeof HocuspocusAuthTokenSchema>;

/**
 * Reasons the server may attach to an `Error` thrown from `onAuthenticate`.
 * Hocuspocus surfaces the `reason` field to the client as the second
 * argument of `provider.on('authenticationFailed', ({ reason }) => …)`.
 *
 * Defining the union as a const-string and the carrier as a typed
 * subclass closes the cross-process drift gap: a rename on either side
 * now fails the TypeScript build instead of silently letting the client
 * see `reason: undefined` and skipping its recycle path.
 */
export const HOCUSPOCUS_AUTH_REJECTION_REASONS = [
  'server-instance-mismatch',
  'branch-mismatch',
] as const;
export type HocuspocusAuthRejectionReason = (typeof HOCUSPOCUS_AUTH_REJECTION_REASONS)[number];

/**
 * Trust-boundary type guard for wire-foreign reason strings. The
 * Hocuspocus provider emits `reason: string` from
 * `provider.on('authenticationFailed', ...)` — a future server-side
 * addition (e.g. `principal-revoked`) would silently fall through an
 * `as` cast. Callers should narrow before switching so unknown reasons
 * surface as observable structured warns instead of silent no-ops.
 */
export function isHocuspocusAuthRejectionReason(
  reason: string,
): reason is HocuspocusAuthRejectionReason {
  return (HOCUSPOCUS_AUTH_REJECTION_REASONS as readonly string[]).includes(reason);
}

export class HocuspocusAuthRejection extends Error {
  readonly reason: HocuspocusAuthRejectionReason;

  constructor(reason: HocuspocusAuthRejectionReason, message: string) {
    super(message);
    this.name = 'HocuspocusAuthRejection';
    this.reason = reason;
  }
}

/**
 * Parse a token string into the typed shape. Returns `undefined` on any
 * parse failure (malformed JSON, schema mismatch) — callers should treat
 * `undefined` identically to "no token provided" per the existing legacy
 * compatibility path.
 *
 * Using a dedicated helper (rather than inlining `safeParse`) keeps the
 * error-swallow behavior consistent across every consumer.
 */
export function parseHocuspocusAuthToken(
  tokenStr: string | undefined | null,
): HocuspocusAuthToken | undefined {
  if (typeof tokenStr !== 'string' || tokenStr.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(tokenStr);
  } catch {
    return undefined;
  }
  const result = HocuspocusAuthTokenSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}
