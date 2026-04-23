/**
 * OpenTelemetry SDK initialization — loaded lazily from `telemetry.ts`
 * only when `VITE_OTEL_ENABLED === 'true'`. The dynamic import keeps this
 * file (and its ~45 KB gzipped OTel dependencies) out of the main bundle.
 *
 * Instrumentations (minimum viable set per local-dev research):
 *   - DocumentLoadInstrumentation     — page-load navigation timing
 *   - FetchInstrumentation            — /api/* requests, auto-injects traceparent
 *   - UserInteractionInstrumentation  — click / submit spans
 *
 * Skipped on purpose:
 *   - ZoneContextManager — 40 KB gzipped, not needed for React 19 / async-await.
 *   - auto-instrumentations-web meta package — pulls in XHR we don't use.
 *   - @opentelemetry/instrumentation-xml-http-request — app is fetch-only.
 *
 * Hocuspocus WebSocket trace propagation: see `editor/collab-otel.ts` —
 * the browser's native WebSocket API cannot set headers, so we inject
 * traceparent as a URL query param at HocuspocusProvider construction.
 */
import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const TRACER_NAME = 'open-knowledge-app';

let installed = false;

function collectorUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_OTEL_COLLECTOR_URL ?? 'http://localhost:4318';
}

export function install(): void {
  if (installed) return;
  installed = true;

  try {
    const baseUrl = collectorUrl();
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const provider = new WebTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'open-knowledge-app',
        [ATTR_SERVICE_VERSION]: env?.VITE_APP_VERSION ?? 'dev',
        'deployment.environment': env?.MODE ?? 'dev',
      }),
      spanProcessors: [
        new BatchSpanProcessor(new OTLPTraceExporter({ url: `${baseUrl}/v1/traces` }), {
          maxExportBatchSize: 50,
          scheduledDelayMillis: 2_000,
        }),
      ],
    });
    // Default StackContextManager — synchronous, good enough for React 19
    // + fetch + user-interaction. ZoneContextManager is not worth the 40 KB.
    provider.register();

    registerInstrumentations({
      instrumentations: [
        new DocumentLoadInstrumentation(),
        new UserInteractionInstrumentation({
          eventNames: ['click', 'submit'],
        }),
        new FetchInstrumentation({
          // Inject traceparent ONLY on loopback / relative /api/* URLs.
          // Third-party origins won't receive trace context (privacy + CORS).
          propagateTraceHeaderCorsUrls: [
            /^https?:\/\/localhost(:\d+)?\/api\//,
            /^https?:\/\/127\.0\.0\.1(:\d+)?\/api\//,
            /^\/api\//,
          ],
          clearTimingResources: true,
        }),
      ],
    });
    // eslint-disable-next-line no-console
    console.info(`[otel] frontend telemetry initialized — OTLP/HTTP → ${baseUrl}/v1/traces`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[otel] frontend telemetry init failed — continuing without', err);
    installed = false;
  }
}

export function getAppTracer() {
  return trace.getTracer(TRACER_NAME);
}
