export const MAX_SUMMARY_LENGTH = 80;

const ELLIPSIS = '…';

export type NormalizedSummary =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: string; truncatedFrom?: number };

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
