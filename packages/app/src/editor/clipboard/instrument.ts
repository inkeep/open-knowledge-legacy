import { ChunkedInsertError, HtmlPayloadTooLargeError } from '@inkeep/open-knowledge-core';
import type { ClipboardSource } from './detect-source.ts';

/**
 * Performance + source-detection instrumentation.
 *
 * Structured JSON `console.warn` — shape mirrors existing
 * `mdx-block-fallback` / `unknown-mdast-type` events in the repo
 * (packages/core/src/markdown/parse-with-fallback.ts:36,59,69). Field
 * names are camelCase to match the codebase-wide convention for
 * structured events (`originalSpan`, `regionSize`, `originalType`, etc.).
 *
 * ## Event names
 *
 * Telemetry event names are a contract — dashboards and alert rules key
 * off exact strings. Every `clipboard-*` event uses a past-tense suffix
 * so the namespace has one convention (matches `clipboard-source-detected`
 * and `clipboard-chunked-insert-failed`; the earlier drafts had a mix of
 * `-fail` and `-failed` which we normalized pre-ship). The
 * `ClipboardEventName` literal union below is the canonical list —
 * adding a new event requires adding a key here.
 *
 * ## Cardinality
 *
 * The `source`, `branch`, `stage`, `kind`, `op`, and `view` fields are
 * typed as literal unions rather than `string` so a typo at a call site
 * becomes a compile error. This also gives log-aggregator dashboards a
 * static schema to render against.
 *
 * ## Event shapes
 *
 *   { event: 'clipboard-slow-op', op, view, elapsedMs, branch, source,
 *     htmlBytes? }
 *   { event: 'clipboard-source-detected', view, source, branch }
 *   { event: 'clipboard-html-conversion-failed', view, stage, source,
 *     reason, htmlBytes? }
 *   { event: 'clipboard-serialize-failed', view, kind, reason }
 *   { event: 'clipboard-chunked-insert-failed', view, chunksCompleted,
 *     totalChunks, bytesWritten, bytesRemaining, reason }
 *
 * `clipboard-source-detected` intentionally does NOT carry `htmlBytes` —
 * the value has unbounded cardinality and the SPEC (§7 Observability,
 * FR-18) names only `source` / `branch` on this event. Size distributions
 * live on `clipboard-slow-op` instead, which only fires above threshold.
 */

/**
 * Exhaustive list of telemetry events the clipboard module emits. New
 * events must be added here first — downstream consumers treat this as
 * the source of truth for dashboard + alert configuration.
 */
type ClipboardEventName =
  | 'clipboard-slow-op'
  | 'clipboard-source-detected'
  | 'clipboard-html-conversion-failed'
  | 'clipboard-serialize-failed'
  | 'clipboard-chunked-insert-failed'
  // Reserved: emitted by `descriptor.toClipboardHast` override invocations
  // when the first descriptor with hidden state declares one. v1's 5-pack
  // + 3 compat descriptors all use the walker default (Layer 2), which is
  // intentionally NOT instrumented (would explode telemetry volume on
  // every copy). The helper that emits this event lands with the first
  // override; the name is registered here so dashboards know it exists.
  | 'clipboard-hast-override-invoked'
  // Emitted when the live-DOM walker hits `view.nodeDOM(pos) === null`
  // and falls back to the per-descriptor static palette. Expected only
  // for Activity-hidden subtrees; presence in normal copy operations
  // signals a real bug per the walker STOP_IF rule.
  | 'clipboard-walker-fallback-fired'
  // Emitted when the live-DOM walker drops or rewrites a value at the
  // FR-20 escape boundary — unsafe URL scheme on `href`/`src`/`srcset`/...,
  // dangerous `on*` event-handler attribute, unsafe `url(javascript:...)` /
  // `expression(...)` payload in `style`, or an embedded unsafe URL inside
  // `aria-label`/`title` that was substituted with `[blocked]`. Cardinality
  // bounded: `attr` is one of the URL_SCHEME_ATTRS / URL_BEARING_TEXT_ATTRS
  // members or the literal `style` / `on*`; `reason` is a fixed taxonomy.
  | 'clipboard-walker-url-blocked';

/** View identifier — one per clipboard-bearing editor surface. */
type ClipboardView = 'wysiwyg' | 'source';

/** Operation that triggered the event. */
type ClipboardOp = 'copy' | 'cut' | 'paste';

/**
 * Dispatcher branch the event was emitted from. `A`–`E` match the 5-
 * branch WYSIWYG paste dispatcher + the 4-branch Source paste dispatcher
 * (Source's Branch B collapses into CM6's text/plain default). `shift`
 * is the FR-17 Cmd+Shift+V escape hatch; `codeblock` is the FR-10 cursor-
 * inside-code short-circuit; `serialize` is the copy/cut path where the
 * concept of "paste branch" doesn't apply.
 */
export type ClipboardBranch = 'A' | 'B' | 'C' | 'D' | 'E' | 'shift' | 'codeblock' | 'serialize';

/**
 * Pipeline stage that produced a conversion failure. `htmlToMdast` is the
 * rehype walk; `mdastToMarkdown` is remark-stringify; `mdManagerParse` is
 * the markdown → PM conversion; `applyJsonSlice` is the PM dispatch;
 * `branchA` is the VS-Code-fenced-block path; `chunkedYTextInsert` is the
 * FR-21 partial-insert failure (also surfaces as the typed
 * `ChunkedInsertError`).
 */
type ClipboardStage =
  | 'htmlToMdast'
  | 'mdastToMarkdown'
  | 'mdManagerParse'
  | 'applyJsonSlice'
  | 'branchA'
  | 'chunkedYTextInsert';

/** Serialization path — `text` is text/plain, `html` is text/html. */
type SerializeKind = 'text' | 'html';

interface ClipboardTiming {
  op: ClipboardOp;
  view: ClipboardView;
  branch: ClipboardBranch;
  source: ClipboardSource;
  htmlBytes?: number;
}

interface ClipboardLogEvent {
  op?: ClipboardOp;
  view: ClipboardView;
  branch: ClipboardBranch;
  source: ClipboardSource;
}

interface ConversionFailInfo {
  view: ClipboardView;
  /** Which stage of the pipeline threw. */
  stage: ClipboardStage;
  /** Vendor source identifier as produced by `detectSource` (gdocs/gmail/notion/etc.) — kept as a separate dimension from `branch` so Datadog/Loki queries can filter on either axis independently. */
  source: ClipboardSource;
  /** Dispatcher branch label the stage was running inside. Optional: copy-side serializers do not have branches. */
  branch?: ClipboardBranch;
  /** Error message — free-text, use for human debugging. */
  reason: string;
  /** Optional typed error class (e.g. `HtmlPayloadTooLargeError`) so aggregators can distinguish expected-large-input from bug-class failures without string-matching `reason`. */
  errorClass?: string;
  htmlBytes?: number;
}

interface SerializeFailInfo {
  view: ClipboardView;
  kind: SerializeKind;
  reason: string;
}

interface ChunkedInsertFailInfo {
  view: ClipboardView;
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
      event: 'clipboard-slow-op' satisfies ClipboardEventName,
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
      event: 'clipboard-source-detected' satisfies ClipboardEventName,
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
      event: 'clipboard-html-conversion-failed' satisfies ClipboardEventName,
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
      event: 'clipboard-serialize-failed' satisfies ClipboardEventName,
      view: info.view,
      kind: info.kind,
      reason: info.reason,
    }),
  );
}

/**
 * Emit when the live-DOM clipboard walker hits a `null` from
 * `view.nodeDOM(pos)` and falls back to the per-descriptor static palette.
 * Expected behavior for Activity-hidden subtrees; presence on a top-level
 * descriptor in a normally-mounted editor signals a real bug per the
 * walker STOP_IF rule. Bounded-cardinality: `descriptor` is a PM node
 * type name (statically defined) and `view` is a fixed enum.
 */
export function logWalkerFallback(info: { descriptor: string; view: ClipboardView }): void {
  console.warn(
    JSON.stringify({
      event: 'clipboard-walker-fallback-fired' satisfies ClipboardEventName,
      descriptor: info.descriptor,
      view: info.view,
    }),
  );
}

/**
 * Reasons the walker rejected an attribute or value at the FR-20 escape
 * boundary. Bounded enum so log-aggregator dashboards can render a static
 * schema; `attr` is constrained at the call site to URL_SCHEME_ATTRS /
 * URL_BEARING_TEXT_ATTRS members or the literal `style` / `on*`.
 */
type WalkerUrlBlockedReason =
  | 'scheme'
  | 'srcset-candidate'
  | 'embedded-url'
  | 'event-handler'
  | 'unsafe-url-or-expression';

/**
 * Emit when the walker drops or rewrites a value at the FR-20 escape
 * boundary. Defense-in-depth at the cross-app re-emit layer — sibling
 * sanitizers (`sanitize-url.ts:emitPropDroppedEvent`) emit on the same
 * cadence, so attack-surface visibility is symmetric across the codebase.
 */
export function logWalkerUrlBlocked(info: {
  attr: string;
  reason: WalkerUrlBlockedReason;
  view: ClipboardView;
}): void {
  console.warn(
    JSON.stringify({
      event: 'clipboard-walker-url-blocked' satisfies ClipboardEventName,
      view: info.view,
      attr: info.attr,
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
      event: 'clipboard-chunked-insert-failed' satisfies ClipboardEventName,
      view: info.view,
      chunksCompleted: info.chunksCompleted,
      totalChunks: info.totalChunks,
      bytesWritten: info.bytesWritten,
      bytesRemaining: info.bytesRemaining,
      reason: info.reason,
    }),
  );
}

/**
 * Map an unknown thrown value to a stable class name for telemetry so
 * aggregators can distinguish expected-large-input (`HtmlPayloadTooLargeError`)
 * and partial-progress failures (`ChunkedInsertError`) from bug-class errors
 * without string-matching `reason`. Single source of truth for the
 * `errorClass` taxonomy — both clipboard dispatchers import from here so new
 * typed error classes need to be registered in exactly one place.
 *
 * Default `Error` name is elided: untyped `new Error(msg)` carries `name
 * === 'Error'` which provides no signal beyond what `reason` already
 * conveys. Typed subclasses (set via class constructor or explicit `name =`)
 * produce a discriminating value; untyped errors omit the field entirely.
 */
export function classifyError(err: unknown): string | undefined {
  if (err instanceof HtmlPayloadTooLargeError) return 'HtmlPayloadTooLargeError';
  if (err instanceof ChunkedInsertError) return 'ChunkedInsertError';
  if (err instanceof Error && err.name && err.name !== 'Error') return err.name;
  return undefined;
}
