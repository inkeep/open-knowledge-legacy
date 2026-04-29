/**
 * Integration tests for handleFrontmatterPatch telemetry wiring (US-012).
 *
 * Verifies the HTTP route emits the expected spans and counters for both
 * MCP (`source` omitted → labeled `mcp-patch`) and form-driven
 * (`source: 'form'` + `op` hint → labeled `form` + `frontmatter.form_write`
 * child span) call paths.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Hocuspocus } from '@hocuspocus/server';
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
import { AgentSessionManager } from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';
import { __resetFrontmatterTelemetryForTests } from './frontmatter-telemetry.ts';

interface CapturedResponse {
  status: number;
  body: string;
}

function makeJsonPostReq(url: string, body: unknown): IncomingMessage {
  const readable = Readable.from(Buffer.from(JSON.stringify(body))) as unknown as IncomingMessage;
  readable.method = 'POST';
  readable.url = url;
  readable.headers = { host: 'localhost', 'content-type': 'application/json' };
  return readable;
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: '' };
  const res = {
    writeHead(status: number) {
      captured.status = status;
    },
    end(body?: string) {
      captured.body = body ?? '';
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

async function callApi(
  hocuspocus: Hocuspocus,
  sessionManager: AgentSessionManager,
  contentDir: string,
  url: string,
  body: unknown,
): Promise<CapturedResponse> {
  const ext = createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir,
    getFileIndex: () => new Map(),
  });
  const req = makeJsonPostReq(url, body);
  const { res, captured } = makeRes();
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return captured;
}

interface Harness {
  projectDir: string;
  contentDir: string;
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  metricExporter: InMemoryMetricExporter;
  spanExporter: InMemorySpanExporter;
  meterProvider: MeterProvider;
  tracerProvider: BasicTracerProvider;
  flushMetrics: () => Promise<void>;
  cleanup: () => Promise<void>;
}

function setupHarness(): Harness {
  const projectDir = mkdtempSync(join(tmpdir(), 'ok-fm-patch-tel-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  const hocuspocus = new Hocuspocus({ quiet: true });
  const sessionManager = new AgentSessionManager(hocuspocus);

  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
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

  __resetFrontmatterTelemetryForTests();

  return {
    projectDir,
    contentDir,
    hocuspocus,
    sessionManager,
    metricExporter,
    spanExporter,
    meterProvider,
    tracerProvider,
    async flushMetrics() {
      await metricReader.forceFlush();
    },
    async cleanup() {
      await sessionManager.closeAll();
      await meterProvider.shutdown();
      await tracerProvider.shutdown();
      metrics.disable();
      trace.disable();
      __resetFrontmatterTelemetryForTests();
      rmSync(projectDir, { recursive: true, force: true });
    },
  };
}

interface CounterPoint {
  attributes: Record<string, unknown>;
  value: number;
}

function readCounterPoints(harness: Harness, name: string): CounterPoint[] {
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

function readHistogramSampleCount(harness: Harness, name: string): number {
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

describe('POST /api/frontmatter-patch — telemetry (US-012)', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = setupHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  test('MCP call (no source hint) emits frontmatter.patch span + mcp-patch counter + duration', async () => {
    const response = await callApi(
      harness.hocuspocus,
      harness.sessionManager,
      harness.contentDir,
      '/api/frontmatter-patch',
      {
        docName: 'test-doc',
        patch: { title: 'New', draft: null, tags: ['a', 'b'] },
      },
    );

    expect(response.status).toBe(200);
    await harness.flushMetrics();

    // Span: frontmatter.patch
    const patchSpans = harness.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'frontmatter.patch');
    expect(patchSpans).toHaveLength(1);
    const patchSpan = patchSpans[0];
    expect(patchSpan.attributes['doc.name']).toBe('test-doc');
    expect(patchSpan.attributes['frontmatter.patch_keys_count']).toBe(3);
    expect(patchSpan.attributes['frontmatter.patch_ops_set']).toBe(2);
    expect(patchSpan.attributes['frontmatter.patch_ops_delete']).toBe(1);
    expect(patchSpan.attributes['frontmatter.source']).toBe('mcp-patch');

    // No frontmatter.form_write span — MCP path doesn't emit one.
    const formSpans = harness.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'frontmatter.form_write');
    expect(formSpans).toHaveLength(0);

    // Counter: ok.frontmatter.edit_surface_total{source=mcp-patch} = 1
    const editPoints = readCounterPoints(harness, 'ok.frontmatter.edit_surface_total');
    expect(editPoints).toHaveLength(1);
    expect(editPoints[0].attributes.source).toBe('mcp-patch');
    expect(editPoints[0].value).toBe(1);

    // Histogram: ok.frontmatter.patch.duration recorded one sample
    expect(readHistogramSampleCount(harness, 'ok.frontmatter.patch.duration')).toBe(1);
  });

  test('form call emits frontmatter.form_write span + form counter', async () => {
    const response = await callApi(
      harness.hocuspocus,
      harness.sessionManager,
      harness.contentDir,
      '/api/frontmatter-patch',
      {
        docName: 'test-doc',
        patch: { title: 'Edited' },
        source: 'form',
        op: 'set',
      },
    );

    expect(response.status).toBe(200);
    await harness.flushMetrics();

    // Outer span: frontmatter.patch labeled with source=form
    const patchSpans = harness.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'frontmatter.patch');
    expect(patchSpans).toHaveLength(1);
    expect(patchSpans[0].attributes['frontmatter.source']).toBe('form');

    // Inner span: frontmatter.form_write
    const formSpans = harness.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'frontmatter.form_write');
    expect(formSpans).toHaveLength(1);
    const formSpan = formSpans[0];
    expect(formSpan.attributes['doc.name']).toBe('test-doc');
    expect(formSpan.attributes['frontmatter.op']).toBe('set');
    // Cardinality guard — never emit user-controlled key names
    expect(formSpan.attributes['frontmatter.key']).toBeUndefined();

    // Counter labeled `source=form` not `mcp-patch`
    const editPoints = readCounterPoints(harness, 'ok.frontmatter.edit_surface_total');
    expect(editPoints).toHaveLength(1);
    expect(editPoints[0].attributes.source).toBe('form');
  });

  test('invalid op hint silently treated as no op (no form_write span)', async () => {
    const response = await callApi(
      harness.hocuspocus,
      harness.sessionManager,
      harness.contentDir,
      '/api/frontmatter-patch',
      {
        docName: 'test-doc',
        patch: { title: 'OK' },
        source: 'form',
        op: 'unknown-garbage',
      },
    );

    // The patch still applies — invalid op is observability-only.
    expect(response.status).toBe(200);
    await harness.flushMetrics();

    const formSpans = harness.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'frontmatter.form_write');
    expect(formSpans).toHaveLength(0);

    // Counter still labeled form (since source=form was provided)
    const editPoints = readCounterPoints(harness, 'ok.frontmatter.edit_surface_total');
    expect(editPoints).toHaveLength(1);
    expect(editPoints[0].attributes.source).toBe('form');
  });

  test('failed validation does not increment counter and does not emit form_write span', async () => {
    const response = await callApi(
      harness.hocuspocus,
      harness.sessionManager,
      harness.contentDir,
      '/api/frontmatter-patch',
      {
        docName: 'test-doc',
        patch: { title: { nested: 'object' } },
        source: 'form',
        op: 'set',
      },
    );

    expect(response.status).toBe(400);
    await harness.flushMetrics();

    const formSpans = harness.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'frontmatter.form_write');
    expect(formSpans).toHaveLength(0);

    const editPoints = readCounterPoints(harness, 'ok.frontmatter.edit_surface_total');
    expect(editPoints).toHaveLength(0);

    // Histogram: also no record on failure path (early-exit before withSpan wrapper)
    expect(readHistogramSampleCount(harness, 'ok.frontmatter.patch.duration')).toBe(0);
  });

  test('all four implemented FrontmatterFormOp values flow through as attribute', async () => {
    // `reorder` stays in the FrontmatterFormOp union for spec parity but is
    // intentionally absent from the runtime accept-set (D31/NG13 deferred
    // reorder from MVP, and no UI emits it). Sending `op: 'reorder'` over
    // the HTTP boundary is silently no-op'd — verified separately below.
    for (const op of ['set', 'add', 'remove', 'rename']) {
      await callApi(
        harness.hocuspocus,
        harness.sessionManager,
        harness.contentDir,
        '/api/frontmatter-patch',
        {
          docName: 'test-doc',
          patch: { [`k_${op}`]: 'v' },
          source: 'form',
          op,
        },
      );
    }
    await harness.flushMetrics();

    const ops = harness.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'frontmatter.form_write')
      .map((s) => String(s.attributes['frontmatter.op']));
    expect(ops.sort()).toEqual(['add', 'remove', 'rename', 'set']);
  });

  test('reorder op is silently no-op via the HTTP boundary (no form_write span)', async () => {
    await callApi(
      harness.hocuspocus,
      harness.sessionManager,
      harness.contentDir,
      '/api/frontmatter-patch',
      { docName: 'test-doc', patch: { k_reorder: 'v' }, source: 'form', op: 'reorder' },
    );
    await harness.flushMetrics();

    // Outer `frontmatter.patch` span fires (the patch IS applied — only the
    // op-labeled inner `frontmatter.form_write` span is gated on FORM_OPS).
    const formSpans = harness.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'frontmatter.form_write');
    expect(formSpans).toHaveLength(0);
  });
});
