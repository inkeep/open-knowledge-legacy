/**
 * Parse-health metrics — in-memory counters for R6 block-level fallback,
 * R13 y-prosemirror schema-throw substitution, and parseSafe whole-doc fallback.
 *
 * Two channels (R14):
 *   - Structured console.warn per event (developer-facing)
 *   - Aggregate counters exposed via GET /api/metrics/parse-health (test + ops)
 *
 * Deliberately NOT a Y.Map — server memory, lost on restart. Parse events don't
 * need CRDT convergence (each client re-parses independently). See SPEC §9 R14.
 */

export interface ParseHealthMetrics {
  parseFallback: { blockLevel: number; wholeDoc: number };
  ypsMismatch: { block: number; inline: number };
}

const metrics: ParseHealthMetrics = {
  parseFallback: { blockLevel: 0, wholeDoc: 0 },
  ypsMismatch: { block: 0, inline: 0 },
};

export function incrementBlockFallback(): void {
  metrics.parseFallback.blockLevel++;
}

export function incrementWholeDocFallback(): void {
  metrics.parseFallback.wholeDoc++;
}

export function incrementYpsMismatchBlock(): void {
  metrics.ypsMismatch.block++;
}

export function incrementYpsMismatchInline(): void {
  metrics.ypsMismatch.inline++;
}

export function getParseHealth(): ParseHealthMetrics {
  return {
    parseFallback: { ...metrics.parseFallback },
    ypsMismatch: { ...metrics.ypsMismatch },
  };
}

export function resetParseHealth(): void {
  metrics.parseFallback.blockLevel = 0;
  metrics.parseFallback.wholeDoc = 0;
  metrics.ypsMismatch.block = 0;
  metrics.ypsMismatch.inline = 0;
}
