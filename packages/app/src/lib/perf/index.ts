/**
 * Public surface of the perf emission layer.
 *
 * Import from `@/lib/perf` (or the relative path) — never reach into the
 * individual files, so we can refactor the internals without breaking callers.
 *
 * See CLAUDE.md precedent #20 (appended in US-010) + `reports/perf-profiling-landscape-2026/`.
 */

export { getCollector } from './collector';
export { type MarkOptions, mark, validatePerfMarkName } from './mark';
export { ProfilerBoundary, type ProfilerBoundaryProps } from './profiler-boundary';
export type {
  DevToolsColor,
  DevToolsTrackEntry,
  PerfCollector,
  PerfMark,
  PerfMarkDetail,
  ProfilerPhase,
  ProfilerRenderEvent,
  WebVitalName,
  WebVitalsMark,
} from './types';
export { initWebVitals } from './web-vitals';
