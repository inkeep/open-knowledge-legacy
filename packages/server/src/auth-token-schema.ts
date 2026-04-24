/**
 * Zod-typed shape of the JSON token browsers and agent clients send in the
 * Hocuspocus WebSocket `token` field. Every `onAuthenticate` hook that parses
 * a token MUST route through `HocuspocusAuthTokenSchema.safeParse` — never
 * call `JSON.parse` + ad-hoc field checks.
 *
 * Design decisions (see /eng:typescript-api-design + /eng:type-safety):
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
 *   consumed immediately by the auth hook and don't travel further. The
 *   branding ceremony from `/eng:type-safety` (`.brand()` on Zod) earns
 *   its weight on long-lived domain types, not on here-and-gone auth
 *   payloads.
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
 */
import { z } from 'zod';

export const HocuspocusAuthTokenSchema = z
  .object({
    principalId: z.string().optional(),
    tabSessionId: z.string().optional(),
    expectedServerInstanceId: z.string().optional(),
  })
  .loose();

export type HocuspocusAuthToken = z.infer<typeof HocuspocusAuthTokenSchema>;

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
