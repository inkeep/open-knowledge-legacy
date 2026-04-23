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
  /**
   * Render-layer failure counters. Per-registered-descriptor + wildcard.
   * Client-only today: the events fire inside `JsxComponentView`'s
   * `ComponentErrorBoundary.componentDidCatch` and its post-error rAF
   * auto-convert; React components don't render on the server. The server
   * endpoint's row therefore stays at zero for these — but the shape is
   * wired so DevTools and unit tests can inspect the client's running
   * totals uniformly, and a future client→server push path exposes
   * aggregate fleet-wide counts through the same response shape.
   *
   * Labels are the registered descriptor name (`'Callout'`, `'Card'`, …)
   * or the literal `'wildcard'`. User-authored MDX names never land as
   * a label — the raw name is kept in a separate `rawComponentName`
   * field on the per-event `console.warn` payload (see
   * `JsxComponentView.tsx`'s emission sites) so telemetry aggregation
   * cannot explode cardinality.
   */
  jsxRenderFailure: Record<string, number>;
  jsxAutoConvertFailed: Record<string, number>;
  /**
   * Successful auto-convert counter — keyed the same way as
   * `jsxAutoConvertFailed`. Publishing both lets operators compute a
   * success rate (`succeeded / (succeeded + failed)`) rather than reading
   * the absolute failure count against an unknown denominator.
   */
  jsxAutoConvertSucceeded: Record<string, number>;
  /**
   * Dangerous-prop drops from `sanitizeComponentProps`. Keyed by lowercased
   * prop name (`'onclick'`, `'dangerouslysetinnerhtml'`, `'href'`, …).
   * Cardinality is bounded — React's `on*` namespace is ~80 names plus a
   * handful of explicit internals; URL-valued props share the `URL_PROP_NAMES`
   * set. Elevated above `console.debug` because drop volume is the primary
   * signal for targeted XSS probes against the editor surface.
   */
  jsxPropDropped: Record<string, number>;
  /**
   * Move-up / Move-down click failures on the JSX chrome bar (Mi4 review
   * fix). Keyed by direction (`'up'` or `'down'`). Elevates the structured
   * `jsx-component-move-failed` event from a one-off log line to an
   * aggregable counter so ops can compute a click-failure rate against
   * total move clicks (denominator: client-side click telemetry, not in
   * scope here). Cardinality bounded to {up, down}.
   */
  jsxMoveFailed: Record<string, number>;
  /**
   * Stuck-state recovery affordance failures (Mi4 review fix). Keyed by
   * registered descriptor name or `'wildcard'` — same low-cardinality
   * shape as `jsxRenderFailure`. Elevates the structured
   * `jsx-component-stuck-copy-failed` and `jsx-component-stuck-delete-failed`
   * events from one-off log lines to aggregable counters. The denominator
   * (number of stuck-state placeholders shown) is the existing
   * `jsxAutoConvertFailed` counter — together they let ops compute the
   * recovery success rate from the highest-friction UX moment.
   */
  jsxStuckCopyFailed: Record<string, number>;
  jsxStuckDeleteFailed: Record<string, number>;
}

const metrics: {
  parseFallback: { blockLevel: number; wholeDoc: number };
  jsxRenderFailure: Record<string, number>;
  jsxAutoConvertFailed: Record<string, number>;
  jsxAutoConvertSucceeded: Record<string, number>;
  jsxPropDropped: Record<string, number>;
  jsxMoveFailed: Record<string, number>;
  jsxStuckCopyFailed: Record<string, number>;
  jsxStuckDeleteFailed: Record<string, number>;
} = {
  parseFallback: { blockLevel: 0, wholeDoc: 0 },
  jsxRenderFailure: {},
  jsxAutoConvertFailed: {},
  jsxAutoConvertSucceeded: {},
  jsxPropDropped: {},
  jsxMoveFailed: {},
  jsxStuckCopyFailed: {},
  jsxStuckDeleteFailed: {},
};

export function incrementBlockFallback(): void {
  metrics.parseFallback.blockLevel++;
}

export function incrementWholeDocFallback(): void {
  metrics.parseFallback.wholeDoc++;
}

/**
 * Increment the counter for a jsx-render-failure emission. `component` is
 * the clamped, low-cardinality label — either a registered descriptor name
 * or the literal string `'wildcard'`. Callers MUST NOT pass user-authored
 * MDX names; those belong in the per-event payload's `rawComponentName`
 * field, not in the counter key.
 */
export function incrementJsxRenderFailure(component: string): void {
  metrics.jsxRenderFailure[component] = (metrics.jsxRenderFailure[component] ?? 0) + 1;
}

/** See {@link incrementJsxRenderFailure} — same cardinality contract. */
export function incrementJsxAutoConvertFailed(component: string): void {
  metrics.jsxAutoConvertFailed[component] = (metrics.jsxAutoConvertFailed[component] ?? 0) + 1;
}

/** See {@link incrementJsxRenderFailure} — same cardinality contract. */
export function incrementJsxAutoConvertSucceeded(component: string): void {
  metrics.jsxAutoConvertSucceeded[component] =
    (metrics.jsxAutoConvertSucceeded[component] ?? 0) + 1;
}

/**
 * Increment the dangerous-prop drop counter. `propName` MUST be lowercased
 * (matches the shape in `DANGEROUS_PROP_NAMES` / `URL_PROP_NAMES`) so aggregation
 * across React camelCase (`onClick`) and HTML lowercase (`onclick`) collapses to
 * a single row.
 */
export function incrementJsxPropDropped(propName: string): void {
  metrics.jsxPropDropped[propName] = (metrics.jsxPropDropped[propName] ?? 0) + 1;
}

/**
 * Increment the JSX chrome move-failed counter (Mi4 review fix). `direction`
 * is the bounded set `'up'` or `'down'`; passing arbitrary strings is a
 * caller bug. Pairs with the structured `jsx-component-move-failed`
 * `console.warn` event in `JsxComponentView` for human-debug visibility.
 */
export function incrementJsxMoveFailed(direction: 'up' | 'down'): void {
  metrics.jsxMoveFailed[direction] = (metrics.jsxMoveFailed[direction] ?? 0) + 1;
}

/**
 * Increment the stuck-state Copy-source failure counter (Mi4 review fix).
 * Same low-cardinality contract as {@link incrementJsxRenderFailure} —
 * `component` is a registered descriptor name or the literal `'wildcard'`.
 */
export function incrementJsxStuckCopyFailed(component: string): void {
  metrics.jsxStuckCopyFailed[component] = (metrics.jsxStuckCopyFailed[component] ?? 0) + 1;
}

/** See {@link incrementJsxStuckCopyFailed} — same low-cardinality contract. */
export function incrementJsxStuckDeleteFailed(component: string): void {
  metrics.jsxStuckDeleteFailed[component] = (metrics.jsxStuckDeleteFailed[component] ?? 0) + 1;
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
    jsxRenderFailure: { ...metrics.jsxRenderFailure },
    jsxAutoConvertFailed: { ...metrics.jsxAutoConvertFailed },
    jsxAutoConvertSucceeded: { ...metrics.jsxAutoConvertSucceeded },
    jsxPropDropped: { ...metrics.jsxPropDropped },
    jsxMoveFailed: { ...metrics.jsxMoveFailed },
    jsxStuckCopyFailed: { ...metrics.jsxStuckCopyFailed },
    jsxStuckDeleteFailed: { ...metrics.jsxStuckDeleteFailed },
  };
}

export function resetParseHealth(): void {
  metrics.parseFallback.blockLevel = 0;
  metrics.parseFallback.wholeDoc = 0;
  for (const k of Object.keys(metrics.jsxRenderFailure)) delete metrics.jsxRenderFailure[k];
  for (const k of Object.keys(metrics.jsxAutoConvertFailed)) delete metrics.jsxAutoConvertFailed[k];
  for (const k of Object.keys(metrics.jsxAutoConvertSucceeded))
    delete metrics.jsxAutoConvertSucceeded[k];
  for (const k of Object.keys(metrics.jsxPropDropped)) delete metrics.jsxPropDropped[k];
  for (const k of Object.keys(metrics.jsxMoveFailed)) delete metrics.jsxMoveFailed[k];
  for (const k of Object.keys(metrics.jsxStuckCopyFailed)) delete metrics.jsxStuckCopyFailed[k];
  for (const k of Object.keys(metrics.jsxStuckDeleteFailed)) delete metrics.jsxStuckDeleteFailed[k];
  const yps = ypsCounters();
  yps.block = 0;
  yps.inline = 0;
}
