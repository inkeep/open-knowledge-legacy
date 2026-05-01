import type { CDPSession } from '@playwright/test';

export interface CdpTraceEvent {
  name: string;
  cat: string;
  ts: number;
  dur?: number;
  ph: string;
  args?: Record<string, unknown>;
  tid?: number;
  pid?: number;
}

export interface TraceSummary {
  eventCount: number;
  longTaskCount: number;
  longestTaskMs: number;
  taskDurationMs: number;
  styleMs: number;
  layoutMs: number;
  scriptMs: number;
  paintEvents: number;
  userTimingMarkCount: number;
  lastLcpMs: number | null;
  cumulativeLayoutShift: number;
}

export const TRACE_CATEGORIES: readonly string[] = [
  'cc',
  'gpu',
  'blink',
  'blink.user_timing',
  'loading',
  'v8',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-v8.cpu_profiler',
] as const;

// biome-ignore lint/suspicious/noExplicitAny: Playwright's dataCollectedPayload is mistyped; cast at the boundary.
type DataCollectedHandler = (payload: any) => void;

export async function traceStart(cdp: CDPSession): Promise<TraceToken> {
  const events: CdpTraceEvent[] = [];
  const handler: DataCollectedHandler = (payload) => {
    const value = payload?.value as unknown;
    if (!Array.isArray(value)) return;
    for (const raw of value as Record<string, unknown>[]) {
      const ev = coerceEvent(raw);
      if (ev) events.push(ev);
    }
  };
  cdp.on('Tracing.dataCollected', handler);

  await cdp.send('Tracing.start', {
    categories: TRACE_CATEGORIES.join(','),
    transferMode: 'ReportEvents',
    options: 'sampling-frequency=10000',
  });

  return { cdp, events, handler };
}

export async function traceEnd(token: TraceToken): Promise<TraceSummary> {
  const { cdp, events, handler } = token;

  const completed = new Promise<void>((resolve) => {
    const onComplete: DataCollectedHandler = () => {
      cdp.off('Tracing.tracingComplete', onComplete);
      resolve();
    };
    cdp.on('Tracing.tracingComplete', onComplete);
  });

  await cdp.send('Tracing.end');
  await completed;
  cdp.off('Tracing.dataCollected', handler);

  return aggregateTrace(events);
}

export interface TraceToken {
  cdp: CDPSession;
  events: CdpTraceEvent[];
  handler: DataCollectedHandler;
}

function coerceEvent(raw: Record<string, unknown>): CdpTraceEvent | null {
  if (typeof raw.name !== 'string') return null;
  if (typeof raw.cat !== 'string') return null;
  if (typeof raw.ts !== 'number') return null;
  if (typeof raw.ph !== 'string') return null;
  return {
    name: raw.name,
    cat: raw.cat,
    ts: raw.ts,
    ph: raw.ph,
    ...(typeof raw.dur === 'number' ? { dur: raw.dur } : {}),
    ...(raw.args && typeof raw.args === 'object'
      ? { args: raw.args as Record<string, unknown> }
      : {}),
    ...(typeof raw.tid === 'number' ? { tid: raw.tid } : {}),
    ...(typeof raw.pid === 'number' ? { pid: raw.pid } : {}),
  };
}

export const LONG_TASK_THRESHOLD_MS = 50;

export function aggregateTrace(events: readonly CdpTraceEvent[]): TraceSummary {
  let longTaskCount = 0;
  let longestTaskMs = 0;
  let taskDurationMs = 0;
  let styleMs = 0;
  let layoutMs = 0;
  let scriptMs = 0;
  let paintEvents = 0;
  let userTimingMarkCount = 0;
  let lastLcpMs: number | null = null;
  let cumulativeLayoutShift = 0;

  for (const ev of events) {
    if (!ev || typeof ev.name !== 'string') continue;
    const catList = typeof ev.cat === 'string' ? ev.cat.split(',') : [];
    const durUs = typeof ev.dur === 'number' && Number.isFinite(ev.dur) ? ev.dur : 0;
    const durMs = durUs / 1000;

    if (ev.name === 'RunTask' || ev.name === 'ThreadControllerImpl::RunTask') {
      taskDurationMs += durMs;
      if (durMs >= LONG_TASK_THRESHOLD_MS) longTaskCount += 1;
      if (durMs > longestTaskMs) longestTaskMs = durMs;
      continue;
    }

    if (ev.name === 'UpdateLayoutTree' || ev.name === 'RecalcStyle') {
      styleMs += durMs;
      continue;
    }

    if (ev.name === 'Layout') {
      layoutMs += durMs;
      continue;
    }

    if (
      ev.name === 'EvaluateScript' ||
      ev.name === 'FunctionCall' ||
      ev.name === 'v8.compile' ||
      ev.name === 'V8.Execute'
    ) {
      scriptMs += durMs;
      continue;
    }

    if (ev.name === 'Paint' || ev.name === 'PaintImage' || ev.name === 'CompositeLayers') {
      paintEvents += 1;
      continue;
    }

    if (catList.includes('blink.user_timing')) {
      userTimingMarkCount += 1;
      continue;
    }

    if (ev.name === 'largestContentfulPaint::Candidate' || ev.name === 'LargestContentfulPaint') {
      const ms = typeof ev.ts === 'number' ? ev.ts / 1000 : null;
      if (ms !== null && Number.isFinite(ms)) lastLcpMs = ms;
      continue;
    }

    if (ev.name === 'LayoutShift') {
      const score =
        ev.args?.data && typeof ev.args.data === 'object'
          ? (ev.args.data as { score?: number }).score
          : undefined;
      if (typeof score === 'number' && Number.isFinite(score)) {
        cumulativeLayoutShift += score;
      }
    }
  }

  return {
    eventCount: events.length,
    longTaskCount,
    longestTaskMs: roundMs(longestTaskMs),
    taskDurationMs: roundMs(taskDurationMs),
    styleMs: roundMs(styleMs),
    layoutMs: roundMs(layoutMs),
    scriptMs: roundMs(scriptMs),
    paintEvents,
    userTimingMarkCount,
    lastLcpMs: lastLcpMs === null ? null : roundMs(lastLcpMs),
    cumulativeLayoutShift: Math.round(cumulativeLayoutShift * 10000) / 10000,
  };
}

function roundMs(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}
