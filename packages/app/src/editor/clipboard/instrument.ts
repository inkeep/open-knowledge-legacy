/**
 * Performance + source-detection instrumentation.
 *
 * Structured JSON `console.warn` — shape mirrors existing
 * `mdx-block-fallback` / `unknown-mdast-type` events in the repo
 * (packages/core/src/markdown/parse-with-fallback.ts:36,59,69). Field
 * names are camelCase to match the codebase-wide convention for
 * structured events (`originalSpan`, `regionSize`, `originalType`, etc.).
 *
 * Event shapes:
 *
 *   { event: 'clipboard-slow-op', op, view, elapsedMs, branch, source,
 *     htmlBytes? }
 *   { event: 'clipboard-source-detected', view, source, branch }
 *   { event: 'clipboard-html-conversion-fail', view, stage, source,
 *     reason, htmlBytes? }
 *   { event: 'clipboard-serialize-fail', view, kind, reason }
 *   { event: 'clipboard-chunked-insert-failed', view, chunksCompleted,
 *     totalChunks, bytesWritten, bytesRemaining, reason }
 *
 * Consumers: log aggregators (Datadog / Grafana Loki) derive distributions
 * and error rates; tests assert the shape directly via paste-fidelity.e2e.ts
 * when we want to prove branch routing worked.
 *
 * `clipboard-source-detected` intentionally does NOT carry `htmlBytes` —
 * the value has unbounded cardinality and the SPEC (§7 Observability,
 * FR-18) names only `source` / `branch` on this event. Size distributions
 * live on `clipboard-slow-op` instead, which only fires above threshold.
 */

export interface ClipboardTiming {
  op: 'copy' | 'cut' | 'paste';
  view: 'wysiwyg' | 'source';
  branch: string;
  source: string;
  htmlBytes?: number;
}

export interface ClipboardLogEvent {
  op?: 'copy' | 'cut' | 'paste';
  view: 'wysiwyg' | 'source';
  branch: string;
  source: string;
}

export interface ConversionFailInfo {
  view: 'wysiwyg' | 'source';
  /** Which stage of the pipeline threw: `htmlToMdast`, `mdastToMarkdown`, `mdManagerParse`, `applyJsonSlice`, or `branchA`. */
  stage: string;
  /** Vendor source identifier as produced by `detectSource` (gdocs/gmail/notion/etc.) — kept as a separate dimension from `branch` so Datadog/Loki queries can filter on either axis independently. */
  source: string;
  /** Dispatcher branch label (A/B/C/D/E) the stage was running inside. Optional: copy-side serializers do not have branches. */
  branch?: string;
  /** Error message — free-text, use for human debugging. */
  reason: string;
  /** Optional typed error class (e.g. `HtmlPayloadTooLargeError`) so aggregators can distinguish expected-large-input from bug-class failures without string-matching `reason`. */
  errorClass?: string;
  htmlBytes?: number;
}

export interface SerializeFailInfo {
  view: 'wysiwyg' | 'source';
  /** `text` for text/plain serialization, `html` for text/html serialization. */
  kind: 'text' | 'html';
  reason: string;
}

export interface ChunkedInsertFailInfo {
  view: 'wysiwyg' | 'source';
  chunksCompleted: number;
  totalChunks: number;
  bytesWritten: number;
  bytesRemaining: number;
  reason: string;
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
      elapsedMs: Math.round(elapsed),
      branch: timing.branch,
      source: timing.source,
      ...(timing.htmlBytes != null ? { htmlBytes: timing.htmlBytes } : {}),
    }),
  );
}

/**
 * Log `clipboard-source-detected` once per paste event — useful for
 * tracking which vendor sources our users actually paste from.
 *
 * Does not carry payload size: cardinality-safe dimensions only.
 */
export function logSourceDetected(ev: ClipboardLogEvent): void {
  console.warn(
    JSON.stringify({
      event: 'clipboard-source-detected',
      view: ev.view,
      source: ev.source,
      branch: ev.branch,
    }),
  );
}

/**
 * Emit when a pipeline stage throws and the dispatcher falls through to
 * the next branch. Per SPEC §7 Observability — aggregators derive
 * failure rates from this event.
 */
export function logConversionFail(info: ConversionFailInfo): void {
  console.warn(
    JSON.stringify({
      event: 'clipboard-html-conversion-fail',
      view: info.view,
      stage: info.stage,
      source: info.source,
      ...(info.branch != null ? { branch: info.branch } : {}),
      reason: info.reason,
      ...(info.errorClass != null ? { errorClass: info.errorClass } : {}),
      ...(info.htmlBytes != null ? { htmlBytes: info.htmlBytes } : {}),
    }),
  );
}

/**
 * Emit when the copy-side serializer fails and the dispatcher falls back
 * to a degraded path (textBetween / default DOMSerializer).
 */
export function logSerializeFail(info: SerializeFailInfo): void {
  console.warn(
    JSON.stringify({
      event: 'clipboard-serialize-fail',
      view: info.view,
      kind: info.kind,
      reason: info.reason,
    }),
  );
}

/**
 * Emit when chunked Y.Text insertion fails mid-stream. Partial-progress
 * fields allow a UI layer to surface a non-modal "N of M chunks landed"
 * notice to the user.
 */
export function logChunkedInsertFail(info: ChunkedInsertFailInfo): void {
  console.warn(
    JSON.stringify({
      event: 'clipboard-chunked-insert-failed',
      view: info.view,
      chunksCompleted: info.chunksCompleted,
      totalChunks: info.totalChunks,
      bytesWritten: info.bytesWritten,
      bytesRemaining: info.bytesRemaining,
      reason: info.reason,
    }),
  );
}
