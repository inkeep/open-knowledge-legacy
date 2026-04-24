/**
 * Frontend OpenTelemetry init — lazy-loaded.
 *
 * The actual SDK code is in `telemetry-impl.ts` and loaded via dynamic
 * `import()` only when `VITE_OTEL_ENABLED === 'true'`. This keeps the
 * ~45 KB gzipped OTel bundle OUT of the main chunk — it becomes its own
 * lazy chunk that only ships when a dev explicitly opts in via env var.
 *
 * Called FIRST by `main.tsx`. Runs async but the promise is intentionally
 * fire-and-forget — no await. Subsequent module loads race against the
 * OTel init, which is fine: any spans emitted before init completes become
 * no-ops (trace API returns a NoopTracer when no provider is registered).
 */
export function initFrontendTelemetry(): void {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_OTEL_ENABLED !== 'true') return;
  // Fire-and-forget. Failure is logged by the impl module and doesn't block
  // anything else — the tracer falls back to the no-op implementation.
  void import('./telemetry-impl').then((m) => m.install());
}
