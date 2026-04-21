/**
 * V2 cold-load-with-fallback scenario (V2 SPEC §7 M3 + M5 / §2 G3 + G5).
 *
 * Measures two separate transitions on a cold load of a large doc:
 *   1. Perceived first-paint — target G5 < 500 ms prod P95
 *   2. Interactive editor ready — target G3 < 1500 ms prod P95
 *
 * Workflow (post-US-010 + US-011 integration):
 *   1. Fresh page navigate to docName (no pool entry — truly cold).
 *   2. Measure t1 = time until FallbackDocumentRender's DOM is visible
 *      (the static fumadocs-style render that paints via /api/document-disk
 *      bytes BEFORE the Hocuspocus sync completes).
 *   3. Measure t2 = time until the interactive ProseMirror editor replaces
 *      the fallback and contains content.
 *
 * STATUS: requires US-008 integration to wire the Suspense fallback into
 * EditorActivityPool. Until that lands, the scenario records
 * `fallbackFirstPaintMs: -1` (fallback never visible) and measures only
 * the interactive-ready transition (same as existing cold-load-big-doc).
 */

import { markerFor } from '../lib/doc-markers';
import { defineScenario } from '../lib/scenario';

const COLD_DOC = process.env.OK_PERF_COLD_DOC ?? 'STORIES';
const WAIT_CONTENT_MS = 60_000;

async function waitForFallbackVisible(
  page: import('@playwright/test').Page,
  timeoutMs: number,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.ok-fallback-document-render');
      if (!el) return false;
      const rect = (el as HTMLElement).getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },
    null,
    { timeout: timeoutMs },
  );
}

async function waitForInteractiveEditorForDoc(
  page: import('@playwright/test').Page,
  docName: string,
  timeoutMs: number,
): Promise<void> {
  const marker = markerFor(docName);
  if (!marker) return;
  await page.waitForFunction(
    (needle: string) => {
      const nodes = document.querySelectorAll('.ProseMirror');
      for (const n of Array.from(nodes)) {
        const rect = (n as HTMLElement).getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0;
        if (visible && (n.textContent ?? '').includes(needle)) return true;
      }
      return false;
    },
    marker,
    { timeout: timeoutMs },
  );
}

export default defineScenario({
  name: 'cold-load-with-fallback',
  description:
    'V2 G3 + G5 repro: cold-load a large doc and measure (a) Suspense fallback first-paint, (b) interactive editor ready.',

  async run(ctx) {
    const { page, opts } = ctx;
    const t0 = Date.now();
    await page.goto(`${opts.target}/#/${encodeURIComponent(COLD_DOC)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // G5 — perceived first paint (fallback visible). Tolerates the case
    // where the fallback isn't wired yet (pre-US-008 integration).
    let fallbackFirstPaintMs = -1;
    try {
      await waitForFallbackVisible(page, 5_000);
      fallbackFirstPaintMs = Date.now() - t0;
    } catch {
      ctx.note('fallback not visible within 5s — Suspense fallback not wired (pre-US-008)');
    }

    // G3 — interactive editor ready
    let interactiveReadyMs = -1;
    try {
      await waitForInteractiveEditorForDoc(page, COLD_DOC, WAIT_CONTENT_MS);
      interactiveReadyMs = Date.now() - t0;
    } catch {
      ctx.note(`could not confirm ${COLD_DOC} interactive content in ${WAIT_CONTENT_MS}ms`);
    }

    ctx.recordMetric('coldDoc', COLD_DOC);
    ctx.recordMetric('fallbackFirstPaintMs', fallbackFirstPaintMs);
    ctx.recordMetric('interactiveReadyMs', interactiveReadyMs);
  },
});
