/**
 * Agent-write summary normalization — single truncation point for the
 * five agent-write API handlers (spec D5/D24: 80-char cap at the API
 * boundary; Zod 200-char cap in the MCP layer is a separate transport-
 * safety bound per D21).
 *
 * Contract: three-state result that lets each handler distinguish
 *   - `absent` → no-op (no summary was provided; no metric increment)
 *   - `invalid` → caller responds 400 (summary was present but not a string)
 *   - `value` → caller records the (possibly truncated) summary and counts it
 *
 * Keeping the "present but empty string" case classified as `absent`
 * matches the §6 FR2 acceptance: empty strings are treated as missing
 * (so `summary: ""` doesn't produce a zero-length bullet and doesn't
 * inflate the M1 adoption metric).
 *
 * Truncation policy (spec D20): `truncatedFrom` is set ONLY when the
 * input length exceeds the cap. An input of exactly MAX_SUMMARY_LENGTH
 * characters is returned as-is with no `truncatedFrom`.
 */

/** API-boundary cap (spec D24 — supersedes the prior 50 from D5). */
export const MAX_SUMMARY_LENGTH = 80;

/** Truncation suffix — a single U+2026 HORIZONTAL ELLIPSIS, not three ASCII dots. */
const ELLIPSIS = '…';

export type NormalizedSummary =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: string; truncatedFrom?: number };

/**
 * Normalize a raw body value into a truncated summary or a sentinel.
 *
 * - `undefined` / `''` / whitespace-only → `{ kind: 'absent' }`
 * - non-string (number, object, boolean, null, array) → `{ kind: 'invalid' }`
 * - string of length ≤ 80 → `{ kind: 'value', value: raw }`
 * - string of length > 80 → `{ kind: 'value', value: raw.slice(0, 79) + '…', truncatedFrom: raw.length }`
 *
 * Whitespace-only values are classified as absent rather than forwarded: a
 * whitespace string would render as a blank bullet in the TimelinePanel and
 * inflate the M1 adoption counter with zero signal. Non-whitespace-only
 * values are preserved verbatim (leading/trailing whitespace intact) — only
 * the "entirely whitespace" case short-circuits.
 */
export function normalizeSummary(raw: unknown): NormalizedSummary {
  if (raw === undefined) return { kind: 'absent' };
  if (typeof raw !== 'string') return { kind: 'invalid' };
  if (raw.length === 0 || raw.trim().length === 0) return { kind: 'absent' };
  if (raw.length <= MAX_SUMMARY_LENGTH) {
    return { kind: 'value', value: raw };
  }
  return {
    kind: 'value',
    value: raw.slice(0, MAX_SUMMARY_LENGTH - 1) + ELLIPSIS,
    truncatedFrom: raw.length,
  };
}
