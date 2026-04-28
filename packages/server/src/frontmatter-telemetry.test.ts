/**
 * Tests for frontmatter telemetry helpers (US-012).
 *
 * Verifies:
 *   - `recordFrontmatterEditSurface` increments the bounded-label counter
 *   - `recordFrontmatterPatchDuration` records into the duration histogram
 *   - `withFormWriteSpan` emits a `frontmatter.form_write` span with
 *     `doc.name` + `frontmatter.op` attributes (and no high-cardinality
 *     attributes like `frontmatter.key`)
 *
 * Uses the InMemoryMetricExporter / InMemorySpanExporter test pattern from
 * `telemetry.test.ts` — registers a test provider, resets the lazy-init
 * caches so the helpers rebind, runs the operation, asserts the recorded
 * data.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { metrics, trace } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  __resetFrontmatterTelemetryForTests,
  recordFrontmatterEditSurface,
  recordFrontmatterPatchDuration,
  withFormWriteSpan,
} from './frontmatter-telemetry.ts';

interface TelemetryHarness {
  metricExporter: InMemoryMetricExporter;
  meterProvider: MeterProvider;
  spanExporter: InMemorySpanExporter;
  tracerProvider: BasicTracerProvider;
  flush: () => Promise<void>;
  cleanup: () => Promise<void>;
}

function setupTelemetryHarness(): TelemetryHarness {
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  // Long export interval — we drive flush manually via forceFlush().
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60_000,
  });
  const meterProvider = new MeterProvider({ readers: [metricReader] });
  metrics.setGlobalMeterProvider(meterProvider);

  const spanExporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
  });
  trace.setGlobalTracerProvider(tracerProvider);

  // Force the lazy-init helpers to rebind against the new global meter.
  __resetFrontmatterTelemetryForTests();

  return {
    metricExporter,
    meterProvider,
    spanExporter,
    tracerProvider,
    async flush() {
      await metricReader.forceFlush();
    },
    async cleanup() {
      await meterProvider.shutdown();
      await tracerProvider.shutdown();
      metrics.disable();
      trace.disable();
      __resetFrontmatterTelemetryForTests();
    },
  };
}

interface CounterPoint {
  attributes: Record<string, unknown>;
  value: number;
}

function readCounterPoints(harness: TelemetryHarness, name: string): CounterPoint[] {
  const out: CounterPoint[] = [];
  for (const rm of harness.metricExporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        if (metric.descriptor.name !== name) continue;
        for (const dp of metric.dataPoints) {
          out.push({ attributes: dp.attributes, value: dp.value as number });
        }
      }
    }
  }
  return out;
}

function readHistogramSampleCount(harness: TelemetryHarness, name: string): number {
  let count = 0;
  for (const rm of harness.metricExporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        if (metric.descriptor.name !== name) continue;
        for (const dp of metric.dataPoints) {
          const value = dp.value as { count?: number };
          if (typeof value?.count === 'number') count += value.count;
        }
      }
    }
  }
  return count;
}

describe('frontmatter-telemetry', () => {
  let harness: TelemetryHarness;

  beforeEach(() => {
    harness = setupTelemetryHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  test('recordFrontmatterEditSurface increments counter with bounded source label', async () => {
    recordFrontmatterEditSurface('form');
    recordFrontmatterEditSurface('form');
    recordFrontmatterEditSurface('mcp-patch');
    recordFrontmatterEditSurface('mcp-write');
    recordFrontmatterEditSurface('file-watcher');
    recordFrontmatterEditSurface('source-mode');

    await harness.flush();

    const points = readCounterPoints(harness, 'ok.frontmatter.edit_surface_total');
    const bySource = new Map<string, number>();
    for (const p of points) {
      const source = String(p.attributes.source);
      bySource.set(source, (bySource.get(source) ?? 0) + p.value);
    }
    expect(bySource.get('form')).toBe(2);
    expect(bySource.get('mcp-patch')).toBe(1);
    expect(bySource.get('mcp-write')).toBe(1);
    expect(bySource.get('file-watcher')).toBe(1);
    expect(bySource.get('source-mode')).toBe(1);
    // Verify cardinality is bounded — only the `source` label, no others
    for (const p of points) {
      expect(Object.keys(p.attributes).sort()).toEqual(['source']);
    }
  });

  test('recordFrontmatterPatchDuration records into histogram', async () => {
    recordFrontmatterPatchDuration(0.001);
    recordFrontmatterPatchDuration(0.05);
    recordFrontmatterPatchDuration(0.2);

    await harness.flush();

    const sampleCount = readHistogramSampleCount(harness, 'ok.frontmatter.patch.duration');
    expect(sampleCount).toBe(3);
  });

  test('withFormWriteSpan emits frontmatter.form_write span with bounded attributes', () => {
    let returnedFromInner = '';
    const result = withFormWriteSpan('test-doc', 'set', () => {
      returnedFromInner = 'inner-ran';
      return 42;
    });
    expect(result).toBe(42);
    expect(returnedFromInner).toBe('inner-ran');

    const spans = harness.spanExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span.name).toBe('frontmatter.form_write');
    expect(span.attributes['doc.name']).toBe('test-doc');
    expect(span.attributes['frontmatter.op']).toBe('set');
    // Bounded-cardinality enforcement: NEVER emit `frontmatter.key`
    // (user-controlled, unbounded). SPEC §7 originally listed it; US-012
    // AC drops it per the cardinality rule.
    expect(span.attributes['frontmatter.key']).toBeUndefined();
  });

  test('withFormWriteSpan supports each enum value of FrontmatterFormOp', () => {
    withFormWriteSpan('a', 'set', () => undefined);
    withFormWriteSpan('a', 'add', () => undefined);
    withFormWriteSpan('a', 'remove', () => undefined);
    withFormWriteSpan('a', 'rename', () => undefined);
    withFormWriteSpan('a', 'reorder', () => undefined);

    const ops = harness.spanExporter
      .getFinishedSpans()
      .map((s) => String(s.attributes['frontmatter.op']));
    expect(ops.sort()).toEqual(['add', 'remove', 'rename', 'reorder', 'set']);
  });

  test('withFormWriteSpan rethrows from inner and ends the span', () => {
    const err = new Error('boom');
    expect(() =>
      withFormWriteSpan('test-doc', 'set', () => {
        throw err;
      }),
    ).toThrow('boom');

    const spans = harness.spanExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('frontmatter.form_write');
    // Status code 2 = ERROR per OTel
    expect(spans[0].status.code).toBe(2);
  });
});
