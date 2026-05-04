import { describe, expect, test } from 'bun:test';
import {
  aggregateTrace,
  type CdpTraceEvent,
  LONG_TASK_THRESHOLD_MS,
  TRACE_CATEGORIES,
} from './cdp-tracer';

function ev(
  name: string,
  cat: string,
  durUs: number,
  extra: Partial<CdpTraceEvent> = {},
): CdpTraceEvent {
  return {
    name,
    cat,
    ts: 0,
    ph: 'X',
    dur: durUs,
    ...extra,
  };
}

describe('aggregateTrace', () => {
  test('empty input → zeroed summary', () => {
    const s = aggregateTrace([]);
    expect(s.eventCount).toBe(0);
    expect(s.longTaskCount).toBe(0);
    expect(s.longestTaskMs).toBe(0);
    expect(s.taskDurationMs).toBe(0);
    expect(s.styleMs).toBe(0);
    expect(s.layoutMs).toBe(0);
    expect(s.scriptMs).toBe(0);
    expect(s.paintEvents).toBe(0);
    expect(s.lastLcpMs).toBeNull();
    expect(s.cumulativeLayoutShift).toBe(0);
  });

  test('RunTask events ≥ 50ms count as long tasks; taskDurationMs sums all', () => {
    const events: CdpTraceEvent[] = [
      ev('RunTask', 'disabled-by-default-devtools.timeline', 30_000),
      ev('RunTask', 'disabled-by-default-devtools.timeline', 60_000),
      ev('RunTask', 'disabled-by-default-devtools.timeline', 150_000),
    ];
    const s = aggregateTrace(events);
    expect(s.longTaskCount).toBe(2);
    expect(s.longestTaskMs).toBe(150);
    expect(s.taskDurationMs).toBe(240);
  });

  test('LONG_TASK_THRESHOLD_MS is the 50ms inclusive boundary', () => {
    const events: CdpTraceEvent[] = [
      ev('RunTask', 'disabled-by-default-devtools.timeline', LONG_TASK_THRESHOLD_MS * 1000),
      ev(
        'RunTask',
        'disabled-by-default-devtools.timeline',
        (LONG_TASK_THRESHOLD_MS - 0.01) * 1000,
      ),
    ];
    const s = aggregateTrace(events);
    expect(s.longTaskCount).toBe(1);
  });

  test('ThreadControllerImpl::RunTask treated as RunTask equivalent', () => {
    const events: CdpTraceEvent[] = [
      ev('ThreadControllerImpl::RunTask', 'disabled-by-default-devtools.timeline', 100_000),
    ];
    const s = aggregateTrace(events);
    expect(s.longTaskCount).toBe(1);
    expect(s.longestTaskMs).toBe(100);
  });

  test('UpdateLayoutTree and RecalcStyle contribute to styleMs', () => {
    const events: CdpTraceEvent[] = [
      ev('UpdateLayoutTree', 'blink', 200_000), // 200ms
      ev('RecalcStyle', 'blink', 50_000), // 50ms
    ];
    const s = aggregateTrace(events);
    expect(s.styleMs).toBe(250);
  });

  test('Layout events contribute to layoutMs', () => {
    const events: CdpTraceEvent[] = [
      ev('Layout', 'blink', 400_000),
      ev('Layout', 'blink', 100_000),
    ];
    const s = aggregateTrace(events);
    expect(s.layoutMs).toBe(500);
  });

  test('Script-execution family contributes to scriptMs', () => {
    const events: CdpTraceEvent[] = [
      ev('EvaluateScript', 'v8', 200_000),
      ev('FunctionCall', 'v8', 100_000),
      ev('v8.compile', 'v8', 50_000),
      ev('V8.Execute', 'v8', 10_000),
    ];
    const s = aggregateTrace(events);
    expect(s.scriptMs).toBe(360);
  });

  test('Paint events count, do not sum duration', () => {
    const events: CdpTraceEvent[] = [
      ev('Paint', 'blink', 1000),
      ev('PaintImage', 'blink', 2000),
      ev('CompositeLayers', 'cc', 5000),
    ];
    const s = aggregateTrace(events);
    expect(s.paintEvents).toBe(3);
  });

  test('user-timing marks counted via cat:blink.user_timing', () => {
    const events: CdpTraceEvent[] = [
      ev('ok/nav/hash-change', 'blink.user_timing', 0),
      ev('ok/render/editor-area', 'blink.user_timing', 0),
      ev('ok/sync/resolve', 'blink.user_timing,other', 0),
    ];
    const s = aggregateTrace(events);
    expect(s.userTimingMarkCount).toBe(3);
  });

  test('LargestContentfulPaint tracks lastLcpMs from ts', () => {
    const events: CdpTraceEvent[] = [
      { name: 'largestContentfulPaint::Candidate', cat: 'loading', ts: 1_200_000, ph: 'I' },
      { name: 'LargestContentfulPaint', cat: 'loading', ts: 3_400_000, ph: 'I' },
    ];
    const s = aggregateTrace(events);
    expect(s.lastLcpMs).toBe(3400);
  });

  test('LayoutShift accumulates args.data.score into cumulativeLayoutShift', () => {
    const events: CdpTraceEvent[] = [
      { name: 'LayoutShift', cat: 'loading', ts: 0, ph: 'I', args: { data: { score: 0.125 } } },
      { name: 'LayoutShift', cat: 'loading', ts: 0, ph: 'I', args: { data: { score: 0.0625 } } },
    ];
    const s = aggregateTrace(events);
    expect(s.cumulativeLayoutShift).toBeCloseTo(0.1875, 4);
  });

  test('malformed events skipped without throwing', () => {
    const events = [
      { name: undefined, cat: 'x', ts: 0, ph: 'X', dur: 100 } as unknown as CdpTraceEvent,
      ev('RunTask', 'disabled-by-default-devtools.timeline', Number.NaN),
      ev('RunTask', 'disabled-by-default-devtools.timeline', Number.POSITIVE_INFINITY),
      ev('RunTask', 'disabled-by-default-devtools.timeline', 200_000),
    ];
    const s = aggregateTrace(events);
    expect(s.longTaskCount).toBe(1);
    expect(s.longestTaskMs).toBe(200);
  });

  test('eventCount reflects total including events we did not aggregate', () => {
    const events: CdpTraceEvent[] = [
      ev('UnrelatedEvent', 'metadata', 0),
      ev('Layout', 'blink', 10_000),
    ];
    const s = aggregateTrace(events);
    expect(s.eventCount).toBe(2);
    expect(s.layoutMs).toBe(10);
  });

  test('TRACE_CATEGORIES contains blink.user_timing + devtools.timeline', () => {
    expect(TRACE_CATEGORIES).toContain('blink.user_timing');
    expect(TRACE_CATEGORIES).toContain('devtools.timeline');
    expect(TRACE_CATEGORIES).toContain('disabled-by-default-devtools.timeline');
  });
});
