/**
 * FallbackDocumentRender (V2 SPEC FR11) — static fumadocs-style render for
 * the Suspense fallback that shows while a cold-load editor mounts in the
 * background.
 *
 * Receives markdown bytes (typically fetched from `GET /api/document-disk`
 * via `disk-markdown-cache`) and renders a React tree via the V2 walker
 * at `packages/app/src/editor/mdast-to-react.tsx`. The target paint budget
 * is <500 ms prod P95 (G5 target).
 *
 * Emits `ok/render/fallback` telemetry mark with `{durationMs, bytes}` at
 * mount — the fallback's paint cost is a first-class perf signal
 * (V2 spec §7 M5).
 *
 * The render tree is memoized per component instance via `useState` lazy
 * init (review Major #9). The fallback's lifetime is bounded by the
 * Suspense resolution, so lifetime-cache is the right shape — ancestor
 * re-renders during the fallback window don't trigger re-parse + re-walk.
 *
 * Mount-time tracking + skip-fallback fast path + the 30s hydration-
 * timeout overlay are responsibilities of the consuming Suspense wiring
 * (see `SuspenseDocumentFallback` below) so that all fallback-state
 * decisions live in one place.
 */

import { type FC, type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import {
  getDiskMarkdown,
  primeDiskMarkdown,
  subscribeDiskMarkdown,
} from '@/editor/disk-markdown-cache';
import { markdownToReact } from '@/editor/mdast-to-react';
import { mark } from '@/lib/perf';
import { EditorSkeleton } from './EditorSkeleton';

export interface FallbackDocumentRenderProps {
  /** Markdown bytes — typically from `/api/document-disk`. */
  markdown: string;
  /** Optional docName for telemetry annotation. */
  docName?: string;
}

/**
 * Above this threshold the fallback skips the mdast parse + walk and
 * falls through to `EditorSkeleton`. Symmetric with
 * `EditorActivityPool.LARGE_DOC_CHAR_THRESHOLD` (500,000 chars) — docs
 * the pool defer-mounts to amortize cold-load cost are also docs whose
 * static walk would dominate the perceived first-paint budget the
 * fallback exists to hit (review Pass-2 Major #5). The fallback's job
 * is to cover the Y.Doc-sync gap visibly; for a 2 MB doc the walk
 * itself would take longer than the sync round-trip.
 */
const FALLBACK_RENDER_MAX_BYTES = 500_000;

export const FallbackDocumentRender: FC<FallbackDocumentRenderProps> = ({ markdown, docName }) => {
  // The parse + walk is the dominant cost of this component. We memoize
  // per-instance keyed on the `markdown` identity so (a) ancestor re-
  // renders with the same markdown see O(0) cost (just reference the
  // cached tree) and (b) a markdown-prop change on the same component
  // instance triggers a fresh walk. Review Pass-1 Minor #4 — pre-fix
  // the lazy-init `useState(() => markdownToReact(markdown))` served
  // (a) but stranded (b): once `invalidateDiskMarkdown` is wired into
  // the file-watcher signal path, the same component instance would
  // keep rendering stale bytes after the cache refreshed.
  //
  // The "setState during render when derived state changed" pattern is
  // documented in React docs as compiler-safe: React discards the
  // current render and re-renders with the updated state immediately,
  // so callers never see the intermediate stale state.
  const oversize = markdown.length > FALLBACK_RENDER_MAX_BYTES;
  const [startTime] = useState(() => performance.now());
  const [cachedMarkdown, setCachedMarkdown] = useState(markdown);
  const [tree, setTree] = useState(() => (oversize ? null : markdownToReact(markdown)));
  if (markdown !== cachedMarkdown) {
    setCachedMarkdown(markdown);
    setTree(markdown.length > FALLBACK_RENDER_MAX_BYTES ? null : markdownToReact(markdown));
  }

  useEffect(() => {
    const duration = performance.now() - startTime;
    mark(
      'ok/render/fallback',
      {
        bytes: markdown.length,
        docName: docName ?? 'unknown',
        oversize,
      },
      { startTime, duration },
    );
  }, [markdown, docName, startTime, oversize]);

  // Oversize doc — cold-load path shows the skeleton while the editor
  // mounts in the background (review Pass-2 Major #5). Spending hundreds
  // of ms on a mdast parse + walk that's about to be replaced by the
  // editor anyway would defeat the perceived-first-paint budget.
  if (oversize) {
    return <EditorSkeleton />;
  }

  return (
    <div className="ok-fallback-document-render" data-docname={docName}>
      {tree}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Suspense-fallback wiring. Consumed by `EditorActivityPool` as the
// Suspense's `fallback` prop — cannot itself suspend, so it reads the
// disk-markdown cache synchronously and falls back to the plain skeleton
// if bytes haven't arrived yet.
//
// The cache is primed in an effect (not in render — that would violate
// the pure-render contract) so the first render returns the skeleton and
// subsequent renders (after the fetch resolves + subscribers notify)
// render the full fumadocs tree.
// ---------------------------------------------------------------------------

export interface SuspenseDocumentFallbackProps {
  docName: string;
  /** Optional override — for tests. */
  children?: ReactNode;
}

/**
 * Suspense-fallback component. Reads disk markdown for `docName` from the
 * module-level cache; renders FallbackDocumentRender when bytes are
 * available, otherwise EditorSkeleton.
 *
 * The component is pure-render — it MUST NOT suspend (Suspense fallbacks
 * cannot themselves suspend). The cache exposes a synchronous accessor
 * for this exact use case.
 */
export const SuspenseDocumentFallback: FC<SuspenseDocumentFallbackProps> = ({ docName }) => {
  // Kick off the fetch out of render — idempotent, safe to call every
  // render in theory, but we wrap in useEffect so React Compiler doesn't
  // complain about side effects in render body.
  useEffect(() => {
    primeDiskMarkdown(docName).catch(() => {
      // Swallow — the cache already logs. A failed fetch leaves the cache
      // empty so we keep rendering EditorSkeleton until the editor mounts.
    });
  }, [docName]);

  // Subscribe so we re-render when the fetch resolves.
  const entry = useSyncExternalStore(
    subscribeDiskMarkdown,
    () => getDiskMarkdown(docName),
    // Server snapshot — SSR/test environments without a cache return null.
    () => null,
  );

  if (!entry) {
    return <EditorSkeleton />;
  }

  return <FallbackDocumentRender markdown={entry.markdown} docName={docName} />;
};
