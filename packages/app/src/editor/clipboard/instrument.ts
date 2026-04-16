/**
 * Performance + source-detection instrumentation.
 *
 * Structured JSON `console.warn` — shape mirrors existing
 * `mdx-block-fallback` / `unknown-mdast-type` events in the repo
 * (packages/core/src/markdown/parse-with-fallback.ts:36,59,69).
 *
 * Two event shapes:
 *
 *   { event: 'clipboard-slow-op', op, view, elapsed_ms, branch, source,
 *     html_bytes? }
 *   { event: 'clipboard-source-detected', view, source, branch, html_bytes? }
 *
 * Consumers: log aggregators (Datadog / Grafana Loki) derive distributions;
 * tests assert the shape directly via paste-fidelity.e2e.ts when we want
 * to prove branch routing worked.
 */

export interface ClipboardTiming {
  op: 'copy' | 'cut' | 'paste';
  view: 'wysiwyg' | 'source';
  branch: string;
  source: string;
  htmlBytes?: number;
}

export interface ClipboardEvent {
  op?: 'copy' | 'cut' | 'paste';
  view: 'wysiwyg' | 'source';
  branch: string;
  source: string;
  htmlBytes?: number;
  elapsed_ms?: number;
}

const SLOW_PASTE_MS = 250;
const SLOW_COPY_MS = 100;

/**
 * Log `clipboard-slow-op` when an operation exceeds its threshold
 * (250ms for paste, 100ms for copy). No log for fast ops.
 */
export function logIfSlow(start: number, timing: ClipboardTiming): void {
  const elapsed = performance.now() - start;
  const threshold = timing.op === 'paste' ? SLOW_PASTE_MS : SLOW_COPY_MS;
  if (elapsed < threshold) return;
  console.warn(
    JSON.stringify({
      event: 'clipboard-slow-op',
      op: timing.op,
      view: timing.view,
      elapsed_ms: Math.round(elapsed),
      branch: timing.branch,
      source: timing.source,
      ...(timing.htmlBytes != null ? { html_bytes: timing.htmlBytes } : {}),
    }),
  );
}

/**
 * Log `clipboard-source-detected` once per paste event — useful for
 * tracking which vendor sources our users actually paste from.
 */
export function logSourceDetected(ev: ClipboardEvent): void {
  console.warn(
    JSON.stringify({
      event: 'clipboard-source-detected',
      view: ev.view,
      source: ev.source,
      branch: ev.branch,
      ...(ev.htmlBytes != null ? { html_bytes: ev.htmlBytes } : {}),
    }),
  );
}
