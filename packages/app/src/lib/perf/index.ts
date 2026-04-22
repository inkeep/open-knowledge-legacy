/**
 * Public surface of the perf emission layer.
 *
 * Import from `@/lib/perf` (or the relative path) — never reach into the
 * individual files, so we can refactor the internals without breaking callers.
 *
 * See CLAUDE.md precedent #20 (appended in US-010) + `reports/perf-profiling-landscape-2026/`.
 */

export { mark } from './mark';
export { ProfilerBoundary } from './profiler-boundary';

export { initWebVitals } from './web-vitals';
