/**
 * Telemetry primitives for frontmatter edit surfaces.
 *
 * Lazy-init meter so registration runs against a real provider post-
 * `initTelemetry` (not the pre-init no-op). Same pattern as
 * `api-extension.ts:httpDurationHist` and
 * `file-watcher.ts:_fileWatcherEventsCounter`. Co-located here so all
 * edit-surface sites (`applyAgentMarkdownWrite`, `applyExternalChange`,
 * server-observers Observer B) call into one set of instruments.
 *
 * Form writes flow through the CRDT via `bindFrontmatterDoc`; the originating
 * client is responsible for any client-side span. The MCP `frontmatter_patch`
 * surface is parked pending a server-side CRDT migration. Neither emits a
 * telemetry value today, so the bounded label set excludes both.
 */
import type { Counter } from '@opentelemetry/api';
import { getMeter } from './telemetry.ts';

/**
 * Bounded label set for `ok.frontmatter.edit_surface_total`. NEVER add
 * free-form values here — labels feed the Prometheus index.
 */
type FrontmatterEditSource = 'source-mode' | 'mcp-write' | 'file-watcher';

let _editSurfaceCounter: Counter | null = null;
function editSurfaceCounter(): Counter {
  if (!_editSurfaceCounter) {
    _editSurfaceCounter = getMeter().createCounter('ok.frontmatter.edit_surface_total', {
      description:
        'Count of frontmatter edits by surface. Bounded label: source ∈ {source-mode, mcp-write, file-watcher}.',
    });
  }
  return _editSurfaceCounter;
}

/** Increment the edit-surface counter. No-op when OTel SDK is disabled. */
export function recordFrontmatterEditSurface(source: FrontmatterEditSource): void {
  editSurfaceCounter().add(1, { source });
}

/**
 * Drop the cached lazy-init counter so the next call rebinds against the
 * currently-registered global MeterProvider. Test-only — production code
 * never needs this because the global provider is set once via
 * `initTelemetry()`.
 */
export function __resetFrontmatterTelemetryForTests(): void {
  _editSurfaceCounter = null;
}
