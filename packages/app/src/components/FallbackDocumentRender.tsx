/**
 * FallbackDocumentRender (V2 SPEC FR11) — static fumadocs-style render for
 * the Suspense fallback that shows while a cold-load editor mounts in the
 * background.
 *
 * Receives markdown bytes (typically fetched from `GET /api/document-disk`
 * in the Suspense boundary) and renders a React tree via the V2 walker
 * at `packages/app/src/editor/mdast-to-react.tsx`. The target paint budget
 * is <500 ms prod P95 (G5 target).
 *
 * Emits `ok/render/fallback` telemetry mark with `{durationMs, bytes}` at
 * mount — the fallback's paint cost is a first-class perf signal
 * (V2 spec §7 M5).
 *
 * The component is intentionally pure-render — no state, no effects beyond
 * the telemetry mark. Mount-time tracking + skip-fallback fast path + the
 * 30s hydration-timeout overlay are responsibilities of the consuming
 * Suspense wiring (wired in the editor-cache integration story) so that
 * all fallback-state decisions live in one place.
 */

import { type FC, useEffect, useState } from 'react';
import { markdownToReact } from '@/editor/mdast-to-react';
import { mark } from '@/lib/perf';

export interface FallbackDocumentRenderProps {
  /** Markdown bytes — typically from `/api/document-disk`. */
  markdown: string;
  /** Optional docName for telemetry annotation. */
  docName?: string;
}

export const FallbackDocumentRender: FC<FallbackDocumentRenderProps> = ({ markdown, docName }) => {
  // Lazy initializers so React Compiler sees pure reads during render — the
  // mount-time telemetry + the parse are both idempotent, and useState with
  // a lazy initializer is the compiler-approved shape for per-instance values.
  const [startTime] = useState(() => performance.now());
  const tree = markdownToReact(markdown);

  useEffect(() => {
    const duration = performance.now() - startTime;
    mark(
      'ok/render/fallback',
      {
        bytes: markdown.length,
        docName: docName ?? 'unknown',
      },
      { startTime, duration },
    );
  }, [markdown, docName, startTime]);

  return (
    <div className="ok-fallback-document-render" data-docname={docName}>
      {tree}
    </div>
  );
};
