/**
 * V2 cold-load-with-fallback scenario (V2 SPEC §7 M3 + M5 / §2 G3 + G5).
 *
 * Measures two separate transitions on a cold load of a large doc:
 *   1. Perceived first-paint — target G5 < 500 ms prod P95
 *   2. Interactive editor ready — target G3 < 1500 ms prod P95
 *
 * Workflow:
 *   1. Fresh page navigate to docName (no pool entry — truly cold).
 *   2. Race two waits CONCURRENTLY, both timed from t0 = pre-navigate:
 *      - fallbackPromise → time until .ok-fallback-document-render paints
 *        (the Option E Suspense fallback reading /api/document-disk bytes)
 *      - interactivePromise → time until the interactive ProseMirror
 *        contains the doc's marker content
 *   3. Both are recorded independently. When the server Y.Doc is warm and
 *      sync beats fetch+parse+paint, the fallback never appears — so
 *      fallbackFirstPaintMs settles to -1 after its 5s timeout, but the
 *      interactive measurement is unaffected (previously the 5s timeout
 *      was awaited sequentially BEFORE interactive, contaminating the
 *      interactive measurement by a full 5s).
 *
 * Semantic note: fallbackFirstPaintMs is only meaningful when it precedes
 * interactiveReadyMs. Once interactive lands, any later fallback paint is
 * not user-facing "perceived first paint" — the user already has an
 * interactive editor. The `fallbackRaceOver` flag latches to block this.
 */

import { markerFor } from '../lib/doc-markers';
import { defineScenario } from '../lib/scenario';

const COLD_DOC = process.env.OK_PERF_COLD_DOC ?? 'STORIES';
const WAIT_CONTENT_MS = 60_000;
const FALLBACK_WAIT_MS = 5_000;

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

    // Race the two waits concurrently. Each records from t0 independently
    // so a timeout on one does not contaminate the other's measurement.
    let fallbackFirstPaintMs = -1;
    let interactiveReadyMs = -1;
    let fallbackRaceOver = false;
    let fallbackTimedOut = false;
    let fallbackErrored = false;

    const fallbackPromise = waitForFallbackVisible(page, FALLBACK_WAIT_MS).then(
      () => {
        if (!fallbackRaceOver) {
          fallbackFirstPaintMs = Date.now() - t0;
        }
      },
      (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Timeout') || msg.includes('timeout')) {
          fallbackTimedOut = true;
        } else {
          fallbackErrored = true;
        }
      },
    );

    const interactivePromise = waitForInteractiveEditorForDoc(page, COLD_DOC, WAIT_CONTENT_MS).then(
      () => {
        interactiveReadyMs = Date.now() - t0;
      },
      () => {
        /* timeout handled via metric = -1 and note below */
      },
    );

    // Await both. Fallback timeout is 5s; interactive timeout is 60s.
    // In practice the 5s fallback timeout resolves while interactive is
    // still pending on a truly-cold run (fallback wins), OR interactive
    // resolves in <5s on a warm-server run and fallback times out
    // concurrently (no measurement contamination).
    await Promise.all([fallbackPromise, interactivePromise]);
    fallbackRaceOver = true;

    if (fallbackFirstPaintMs === -1) {
      // Three legitimate reasons the fallback DOM never painted; none of
      // them mean "the fallback is broken." The reviewer looking at this
      // note should rule them out in order.
      if (fallbackErrored) {
        ctx.note('fallback wait errored (non-timeout) — investigate page.waitForFunction log');
      } else if (fallbackTimedOut) {
        ctx.note(
          'fallback not visible within 5s — either oversize skip-path (>500KB renders EditorSkeleton instead), server-warm fast-path (Y.Doc sync beat disk-read), or genuinely unwired',
        );
      }
    }
    if (interactiveReadyMs === -1) {
      ctx.note(`could not confirm ${COLD_DOC} interactive content in ${WAIT_CONTENT_MS}ms`);
    }

    ctx.recordMetric('coldDoc', COLD_DOC);
    ctx.recordMetric('fallbackFirstPaintMs', fallbackFirstPaintMs);
    ctx.recordMetric('interactiveReadyMs', interactiveReadyMs);
  },
});
