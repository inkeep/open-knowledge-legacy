
interface YpsCounters {
  block: number;
  inline: number;
}

interface YpsCountersHost {
  __okYpsCounters?: YpsCounters;
}

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
  jsxRenderFailure: Record<string, number>;
  jsxAutoConvertFailed: Record<string, number>;
  jsxAutoConvertSucceeded: Record<string, number>;
  jsxPropDropped: Record<string, number>;
  jsxMoveFailed: Record<string, number>;
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

export function incrementJsxRenderFailure(component: string): void {
  metrics.jsxRenderFailure[component] = (metrics.jsxRenderFailure[component] ?? 0) + 1;
}

export function incrementJsxAutoConvertFailed(component: string): void {
  metrics.jsxAutoConvertFailed[component] = (metrics.jsxAutoConvertFailed[component] ?? 0) + 1;
}

export function incrementJsxAutoConvertSucceeded(component: string): void {
  metrics.jsxAutoConvertSucceeded[component] =
    (metrics.jsxAutoConvertSucceeded[component] ?? 0) + 1;
}

export function incrementJsxPropDropped(propName: string): void {
  metrics.jsxPropDropped[propName] = (metrics.jsxPropDropped[propName] ?? 0) + 1;
}

export function incrementJsxMoveFailed(direction: 'up' | 'down'): void {
  metrics.jsxMoveFailed[direction] = (metrics.jsxMoveFailed[direction] ?? 0) + 1;
}

export function incrementJsxStuckCopyFailed(component: string): void {
  metrics.jsxStuckCopyFailed[component] = (metrics.jsxStuckCopyFailed[component] ?? 0) + 1;
}

export function incrementJsxStuckDeleteFailed(component: string): void {
  metrics.jsxStuckDeleteFailed[component] = (metrics.jsxStuckDeleteFailed[component] ?? 0) + 1;
}

export function incrementYpsMismatchBlock(): void {
  ypsCounters().block++;
}

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
