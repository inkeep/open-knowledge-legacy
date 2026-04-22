/**
 * Dev-only `window.__ok_perf` collector.
 *
 * Gated on `!import.meta.env.PROD` so Vite's build-time constant folding drops
 * the buffer allocation (and the global assignment) from production bundles.
 * In production `getCollector()` returns `undefined`; `mark()` skips the push.
 *
 * The negated-PROD form (rather than DEV) is deliberate: under `bun test`,
 * neither constant exists and both are `undefined` — `!undefined === true`
 * keeps the collector live in tests, while `import.meta.env.DEV` would
 * evaluate falsy and break unit-test verification of collector behavior.
 */

import type { PerfCollector, PerfMark, WebVitalsMark } from './types';

declare global {
  interface Window {
    __ok_perf?: PerfCollector;
  }
  // eslint-disable-next-line no-var -- required for `globalThis` augmentation
  var __ok_perf: PerfCollector | undefined;
}

const GLOBAL_KEY = '__ok_perf' as const;

interface PerfGlobal {
  __ok_perf?: PerfCollector;
}

function createCollector(): PerfCollector {
  const startedAt = performance.now();
  const collector: PerfCollector = {
    marks: [],
    vitals: [],
    startedAt,
    reset() {
      collector.marks = [];
      collector.vitals = [];
      collector.startedAt = performance.now();
    },
  };
  return collector;
}

/**
 * Returns the live dev-only collector, creating it on first access.
 * Returns `undefined` in production builds.
 *
 * Storage lives on `globalThis` (which is `window` in a browser, the module
 * global in Node/Bun) so unit tests and browser scenarios share one shape.
 */
export function getCollector(): PerfCollector | undefined {
  if (import.meta.env?.PROD) return undefined;
  const g = globalThis as unknown as PerfGlobal;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createCollector();
  }
  return g[GLOBAL_KEY];
}

/**
 * Push a mark to the collector. No-op when the collector is absent
 * (non-DEV build, or non-browser environment).
 */
export function recordMark(mark: PerfMark): void {
  const c = getCollector();
  if (!c) return;
  c.marks.push(mark);
}

/**
 * Push a web vitals event to the collector.
 */
export function recordVital(v: WebVitalsMark): void {
  const c = getCollector();
  if (!c) return;
  c.vitals.push(v);
}
