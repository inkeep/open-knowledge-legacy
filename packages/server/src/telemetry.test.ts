import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { context, metrics, trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { getMeter, getTracer, initTelemetry, shutdownTelemetry } from './telemetry.ts';

describe('Telemetry', () => {
  beforeEach(() => {
    trace.disable();
    metrics.disable();
    context.disable();
  });

  afterEach(async () => {
    await shutdownTelemetry();
    trace.disable();
    metrics.disable();
    context.disable();
  });

  describe('initTelemetry with OTEL_SDK_DISABLED (default behavior)', () => {
    it('returns working no-op tracer and meter when OTEL_SDK_DISABLED=true', () => {
      const saved = process.env.OTEL_SDK_DISABLED;
      process.env.OTEL_SDK_DISABLED = 'true';
      try {
        const { tracer, meter } = initTelemetry();
        expect(tracer).toBeDefined();
        expect(meter).toBeDefined();

        const span = tracer.startSpan('test-span');
        expect(span).toBeDefined();
        expect(span.isRecording()).toBe(false);
        span.end();
      } finally {
        process.env.OTEL_SDK_DISABLED = saved;
      }
    });

    it('returns no-op when OTEL_SDK_DISABLED is unset', () => {
      const saved = process.env.OTEL_SDK_DISABLED;
      delete process.env.OTEL_SDK_DISABLED;
      try {
        const { tracer } = initTelemetry();
        const span = tracer.startSpan('test-span');
        expect(span.isRecording()).toBe(false);
        span.end();
      } finally {
        process.env.OTEL_SDK_DISABLED = saved;
      }
    });

    it('returns no-op when OTEL_SDK_DISABLED=anything-else', () => {
      const saved = process.env.OTEL_SDK_DISABLED;
      process.env.OTEL_SDK_DISABLED = 'yes';
      try {
        const { tracer } = initTelemetry();
        const span = tracer.startSpan('test-span');
        expect(span.isRecording()).toBe(false);
        span.end();
      } finally {
        process.env.OTEL_SDK_DISABLED = saved;
      }
    });
  });

  describe('initTelemetry with OTEL_SDK_DISABLED=false (enabled path)', () => {
    it('registers real providers that produce recording spans', () => {
      const saved = process.env.OTEL_SDK_DISABLED;
      process.env.OTEL_SDK_DISABLED = 'false';
      try {
        const { tracer } = initTelemetry();
        const span = tracer.startSpan('test-enabled');
        expect(span.isRecording()).toBe(true);
        span.end();
      } finally {
        process.env.OTEL_SDK_DISABLED = saved;
      }
    });

    it('is idempotent — calling twice returns same providers', () => {
      const saved = process.env.OTEL_SDK_DISABLED;
      process.env.OTEL_SDK_DISABLED = 'false';
      try {
        const first = initTelemetry();
        const second = initTelemetry();
        const span1 = first.tracer.startSpan('idempotent-1');
        const span2 = second.tracer.startSpan('idempotent-2');
        expect(span1.isRecording()).toBe(true);
        expect(span2.isRecording()).toBe(true);
        span1.end();
        span2.end();
      } finally {
        process.env.OTEL_SDK_DISABLED = saved;
      }
    });
  });

  describe('shutdownTelemetry', () => {
    it('is idempotent — calling twice does not throw', async () => {
      await shutdownTelemetry();
      await shutdownTelemetry();
    });

    it('completes after enabled init without throwing', async () => {
      const saved = process.env.OTEL_SDK_DISABLED;
      process.env.OTEL_SDK_DISABLED = 'false';
      try {
        initTelemetry();
      } finally {
        process.env.OTEL_SDK_DISABLED = saved;
      }
      await shutdownTelemetry();
    });
  });

  describe('getTracer and getMeter convenience functions', () => {
    it('returns tracer and meter instances', () => {
      const tracer = getTracer();
      const meter = getMeter();
      expect(tracer).toBeDefined();
      expect(meter).toBeDefined();
      expect(typeof tracer.startSpan).toBe('function');
    });
  });

  describe('InMemorySpanExporter integration', () => {
    it('captures spans with correct name and attributes when SDK is registered', () => {
      const exporter = new InMemorySpanExporter();
      const provider = new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      });
      trace.setGlobalTracerProvider(provider);

      try {
        const tracer = getTracer();
        const span = tracer.startSpan('test.operation', {
          attributes: {
            'test.key': 'test-value',
            'test.number': 42,
          },
        });
        expect(span.isRecording()).toBe(true);
        span.end();

        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0].name).toBe('test.operation');
        expect(spans[0].attributes['test.key']).toBe('test-value');
        expect(spans[0].attributes['test.number']).toBe(42);
      } finally {
        provider.shutdown();
      }
    });

    it('captures multiple spans in correct order', () => {
      const exporter = new InMemorySpanExporter();
      const provider = new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      });
      trace.setGlobalTracerProvider(provider);

      try {
        const tracer = getTracer();
        const span1 = tracer.startSpan('span-1');
        span1.end();
        const span2 = tracer.startSpan('span-2');
        span2.end();

        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(2);
        expect(spans[0].name).toBe('span-1');
        expect(spans[1].name).toBe('span-2');
      } finally {
        provider.shutdown();
      }
    });
  });
});
