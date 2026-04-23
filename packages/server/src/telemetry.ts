import type { Attributes, Meter, Span, SpanOptions, Tracer } from '@opentelemetry/api';
import { context, metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getLogger } from './logger.ts';

const TRACER_NAME = 'open-knowledge-server';

let tracerProvider: BasicTracerProvider | null = null;
let meterProvider: MeterProvider | null = null;

function noopResult(): { tracer: Tracer; meter: Meter } {
  return {
    tracer: trace.getTracer(TRACER_NAME),
    meter: metrics.getMeter(TRACER_NAME),
  };
}

/**
 * Initialize OpenTelemetry tracing and metrics.
 *
 * When `OTEL_SDK_DISABLED` is not `'false'` (the default), returns no-op
 * tracer and meter from the OTel API — zero overhead.
 *
 * When enabled, registers a BasicTracerProvider with BatchSpanProcessor +
 * OTLP/HTTP exporter, a MeterProvider with PeriodicExportingMetricReader +
 * OTLP/HTTP exporter, and an AsyncLocalStorageContextManager.
 *
 * Exporter endpoints default to `http://localhost:4318` (OTLP/HTTP) — override
 * via `OTEL_EXPORTER_OTLP_ENDPOINT` or the signal-specific variants.
 *
 * Idempotent — calling twice returns the same providers.
 * If SDK construction fails, falls back to no-op (telemetry never crashes the server).
 */
export function initTelemetry(): { tracer: Tracer; meter: Meter } {
  if (process.env.OTEL_SDK_DISABLED !== 'false') {
    return noopResult();
  }

  if (tracerProvider) {
    return noopResult();
  }

  try {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'open-knowledge-server',
      [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION || '0.2.0',
    });

    // Context manager — Bun supports AsyncLocalStorage
    const contextManager = new AsyncLocalStorageContextManager();
    context.setGlobalContextManager(contextManager);

    // Traces — sdk-trace-base (not sdk-trace-node) for Bun compatibility
    const traceExporter = new OTLPTraceExporter();
    const tp = new BasicTracerProvider({
      resource,
      spanProcessors: [new BatchSpanProcessor(traceExporter)],
    });
    trace.setGlobalTracerProvider(tp);

    // Metrics
    const metricExporter = new OTLPMetricExporter();
    const mp = new MeterProvider({
      resource,
      readers: [new PeriodicExportingMetricReader({ exporter: metricExporter })],
    });
    metrics.setGlobalMeterProvider(mp);

    // Only assign after both providers succeed — prevents partial init
    tracerProvider = tp;
    meterProvider = mp;

    const log = getLogger('telemetry');
    log.info(
      {
        otlp_endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
        service_name: resource.attributes[ATTR_SERVICE_NAME],
      },
      'OpenTelemetry initialized — traces + metrics exporting via OTLP/HTTP',
    );
  } catch (e) {
    const log = getLogger('telemetry');
    log.error({ err: e }, 'failed to initialize OpenTelemetry — falling back to no-op');
    tracerProvider = null;
    meterProvider = null;
  }

  return noopResult();
}

const SHUTDOWN_TIMEOUT_MS = 5_000;

/** Graceful shutdown — flush pending spans and metrics. Idempotent. */
export async function shutdownTelemetry(): Promise<void> {
  if (!tracerProvider && !meterProvider) return;
  const log = getLogger('telemetry');
  const shutdownPromise = Promise.all([
    tracerProvider?.shutdown().catch((e: unknown) => {
      log.warn({ err: e }, 'tracer provider shutdown failed');
    }),
    meterProvider?.shutdown().catch((e: unknown) => {
      log.warn({ err: e }, 'meter provider shutdown failed');
    }),
  ]);
  const timedOut = await Promise.race([
    shutdownPromise.then(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), SHUTDOWN_TIMEOUT_MS)),
  ]);
  if (timedOut) {
    log.warn({}, `telemetry shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms — data may be lost`);
  }
  tracerProvider = null;
  meterProvider = null;
  trace.disable();
  metrics.disable();
  context.disable();
}

/** Get the tracer instance (no-op if SDK not registered). */
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/** Get the meter instance (no-op if SDK not registered). */
export function getMeter(): Meter {
  return metrics.getMeter(TRACER_NAME);
}

/**
 * Run `fn` inside a new span. Automatically records exceptions, sets status,
 * and ends the span when `fn` resolves or rejects.
 *
 * The span is activated in the current context so any child work (awaits,
 * nested `withSpan` calls, `getTracer().startSpan(...)`) inherits it as parent.
 */
export async function withSpan<T>(
  name: string,
  options: SpanOptions | undefined,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, options ?? {}, async (span) => {
    try {
      const result = await fn(span);
      if (span.isRecording()) {
        // Leave status unset (implicitly OK) — callers can override.
      }
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Synchronous variant of `withSpan` for non-async code paths.
 */
export function withSpanSync<T>(
  name: string,
  options: SpanOptions | undefined,
  fn: (span: Span) => T,
): T {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, options ?? {}, (span) => {
    try {
      const result = fn(span);
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Safely add attributes to the currently active span without a reference.
 * No-op if no active span.
 */
export function setActiveSpanAttributes(attrs: Attributes): void {
  const span = trace.getSpan(context.active());
  if (span) span.setAttributes(attrs);
}
