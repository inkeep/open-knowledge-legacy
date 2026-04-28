/**
 * Telemetry primitives for frontmatter edit surfaces.
 *
 * Lazy-init meters so registration runs against a real meter post-`initTelemetry`
 * (not the pre-init no-op). Same pattern as `api-extension.ts:httpDurationHist`
 * and `file-watcher.ts:_fileWatcherEventsCounter`. Co-located here so all four
 * edit-surface sites (handleFrontmatterPatch, applyAgentMarkdownWrite,
 * applyExternalChange, server-observers Observer B) call into one set of
 * instruments.
 */
import type { Counter, Histogram } from '@opentelemetry/api';
import { getMeter, withSpanSync } from './telemetry.ts';

/**
 * Bounded label set for `ok.frontmatter.edit_surface_total`. Matches SPEC §7
 * adoption metric. NEVER add free-form values here — labels feed the
 * Prometheus index.
 */
export type FrontmatterEditSource =
  | 'form'
  | 'source-mode'
  | 'mcp-write'
  | 'mcp-patch'
  | 'file-watcher';

/**
 * Bounded label set for `frontmatter.form_write` span's `frontmatter.op` attr.
 * Reorder is in the type for spec parity (SPEC §6 FR11) but never fires —
 * D31/NG13 dropped reorder from MVP.
 */
export type FrontmatterFormOp = 'set' | 'add' | 'remove' | 'rename' | 'reorder';

let _editSurfaceCounter: Counter | null = null;
function editSurfaceCounter(): Counter {
  if (!_editSurfaceCounter) {
    _editSurfaceCounter = getMeter().createCounter('ok.frontmatter.edit_surface_total', {
      description:
        'Count of frontmatter edits by surface. Bounded label: source ∈ {form, source-mode, mcp-write, mcp-patch, file-watcher}.',
    });
  }
  return _editSurfaceCounter;
}

let _patchDurationHist: Histogram | null = null;
function patchDurationHist(): Histogram {
  if (!_patchDurationHist) {
    _patchDurationHist = getMeter().createHistogram('ok.frontmatter.patch.duration', {
      description: 'Duration of POST /api/frontmatter-patch handler in seconds.',
      unit: 's',
    });
  }
  return _patchDurationHist;
}

/** Increment the edit-surface counter. No-op when OTel SDK is disabled. */
export function recordFrontmatterEditSurface(source: FrontmatterEditSource): void {
  editSurfaceCounter().add(1, { source });
}

/** Record a patch-handler duration in seconds. No-op when OTel SDK is disabled. */
export function recordFrontmatterPatchDuration(seconds: number): void {
  patchDurationHist().record(seconds);
}

/**
 * Drop the cached lazy-init instruments so the next call rebinds against the
 * currently-registered global MeterProvider. Test-only — production code
 * never needs this because the global provider is set once via
 * `initTelemetry()`.
 */
export function __resetFrontmatterTelemetryForTests(): void {
  _editSurfaceCounter = null;
  _patchDurationHist = null;
}

/**
 * Emit a `frontmatter.form_write` span around `fn`. Synchronous because every
 * call site runs entirely within a doc.transact block. Attributes are bounded:
 * `doc.name` (pre-validated docName) and `frontmatter.op` (enum).
 *
 * Per the unbounded-cardinality STOP rule (CLAUDE.md "OTel"), `frontmatter.key`
 * is intentionally NOT an attribute — key names are user-controlled and
 * unbounded. SPEC §7 originally listed `frontmatter.key`; US-012 AC drops it
 * to comply with the cardinality rule.
 */
export function withFormWriteSpan<T>(docName: string, op: FrontmatterFormOp, fn: () => T): T {
  return withSpanSync(
    'frontmatter.form_write',
    {
      attributes: {
        'doc.name': docName,
        'frontmatter.op': op,
      },
    },
    fn,
  );
}
