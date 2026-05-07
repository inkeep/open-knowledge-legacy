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

export const MAX_SUMMARY_LENGTH = 80;

const ELLIPSIS = '…';

// biome-ignore lint/complexity/useRegexLiterals: see docblock above for the constraint that forces `new RegExp`.
const LINE_TERMINATOR_RE = new RegExp('[\\r\\n\\v\\f\\u0085\\u2028\\u2029]', 'g');

export type NormalizedSummary =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: string; truncatedFrom?: number };

export function normalizeSummary(raw: unknown): NormalizedSummary {
  if (raw === undefined) return { kind: 'absent' };
  if (typeof raw !== 'string') return { kind: 'invalid' };
  if (raw.length === 0 || raw.trim().length === 0) return { kind: 'absent' };
  const sanitized = raw.replace(LINE_TERMINATOR_RE, ' ');
  if (sanitized.length <= MAX_SUMMARY_LENGTH) {
    return { kind: 'value', value: sanitized };
  }
  return {
    kind: 'value',
    value: sanitized.slice(0, MAX_SUMMARY_LENGTH - 1) + ELLIPSIS,
    truncatedFrom: raw.length,
  };
}
