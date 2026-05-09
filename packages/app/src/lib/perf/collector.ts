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

export function getCollector(): PerfCollector | undefined {
  if (import.meta.env?.PROD) return undefined;
  const g = globalThis as unknown as PerfGlobal;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createCollector();
  }
  return g[GLOBAL_KEY];
}

export function recordMark(mark: PerfMark): void {
  const c = getCollector();
  if (!c) return;
  c.marks.push(mark);
}

export function recordVital(v: WebVitalsMark): void {
  const c = getCollector();
  if (!c) return;
  c.vitals.push(v);
}
