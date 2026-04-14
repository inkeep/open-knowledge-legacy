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
 *
 * ## ypsMismatch wiring (CJS ↔ ESM bridge)
 *
 * The R13 y-prosemirror patch lives in the package's CJS dist (and its ESM
 * sibling). Both runtimes execute in the same Node.js process, but CJS
 * `require()` cannot directly load this ESM module. The patch and this module
 * share state via `globalThis.__okYpsCounters` — the standard cross-module
 * mechanism for instrumentation that crosses module-system boundaries. Both
 * the patch and `getParseHealth()` read/write the same object reference, so
 * `/api/metrics/parse-health` reports real values from both surfaces.
 */

interface YpsCounters {
  block: number;
  inline: number;
}

interface YpsCountersHost {
  __okYpsCounters?: YpsCounters;
}

/**
 * Cross-module-system counter store for ypsMismatch. Initialized lazily on
 * first access so import order between this module and the patched CJS does
 * not matter — whichever runs first creates the object, the other binds to
 * the same reference via globalThis.
 *
 * The cast to YpsCountersHost is a structural-typing lookup, not a global
 * declaration — keeps the interaction with globalThis localized to this
 * helper rather than augmenting the global namespace.
 */
function ypsCounters(): YpsCounters {
  const host = globalThis as YpsCountersHost;
  if (!host.__okYpsCounters) {
    host.__okYpsCounters = { block: 0, inline: 0 };
  }
  return host.__okYpsCounters;
}

export interface ParseHealthMetrics {
  parseFallback: { blockLevel: number; wholeDoc: number };
  ypsMismatch: { block: number; inline: number };
}

const metrics = {
  parseFallback: { blockLevel: 0, wholeDoc: 0 },
};

export function incrementBlockFallback(): void {
  metrics.parseFallback.blockLevel++;
}

export function incrementWholeDocFallback(): void {
  metrics.parseFallback.wholeDoc++;
}

/**
 * Increment ypsMismatch.block counter.
 *
 * Reads through globalThis so test code and the y-prosemirror CJS patch share
 * one counter store. The patch increments via `globalThis.__okYpsCounters.block++`
 * directly — this exported helper is for ESM-side test seeding only.
 */
export function incrementYpsMismatchBlock(): void {
  ypsCounters().block++;
}

/** See {@link incrementYpsMismatchBlock} — same globalThis-shared store. */
export function incrementYpsMismatchInline(): void {
  ypsCounters().inline++;
}

export function getParseHealth(): ParseHealthMetrics {
  const yps = ypsCounters();
  return {
    parseFallback: { ...metrics.parseFallback },
    ypsMismatch: { block: yps.block, inline: yps.inline },
  };
}

export function resetParseHealth(): void {
  metrics.parseFallback.blockLevel = 0;
  metrics.parseFallback.wholeDoc = 0;
  const yps = ypsCounters();
  yps.block = 0;
  yps.inline = 0;
}
