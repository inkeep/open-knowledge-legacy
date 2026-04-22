/**
 * S1 reproduction — cold-load a large markdown doc and measure TTI.
 *
 * Fresh browser context → goto `#/<BIG_DOC>` → wait for ProseMirror to have
 * meaningful text content visible. The driver captures long tasks, LCP, and
 * layout+style totals via CDP tracing; we additionally install a
 * `PerformanceObserver` for `longtask` so the scenario-side metrics carry
 * the browser's own long-task accounting for cross-check.
 *
 * Pre-fix baseline (AC12): coldLoadMs ≥ 10000 on PROJECT.md (workhorse doc).
 * Post-fix target (AC20):  coldLoadMs < 5000 OR documented as
 * architecturally-bounded in `evidence/s1-diagnosis.md`.
 *
 * The big doc is parameterized via OK_PERF_BIG_DOC so the scenario can be
 * re-targeted without editing code (e.g. `OK_PERF_BIG_DOC=CLAUDE bun run
 * perf:profile --scenario=cold-load-big-doc`).
 */

import { defineScenario } from '../lib/scenario';

const BIG_DOC = process.env.OK_PERF_BIG_DOC ?? 'PROJECT';

// ProseMirror textContent threshold that counts as "doc visible". PROJECT.md
// is multi-MB — rendering even the first few blocks exceeds this. README.md
// (5 KB) also clears it trivially, so the threshold is not doc-specific.
const PM_READY_CHARS = 500;

// Upper bound on our wait. Pre-fix S1 is ~20s on PROJECT; 90s gives slow
// hardware headroom without hanging the scenario indefinitely.
const PM_READY_TIMEOUT_MS = 90_000;

interface LongTaskRecord {
  startTime: number;
  duration: number;
  name: string;
}

export default defineScenario({
  name: 'cold-load-big-doc',
  description:
    'S1 repro: cold-load a large doc (default PROJECT.md) and measure TTI + longest task.',

  async run(ctx) {
    const { page, opts } = ctx;

    // Install a PerformanceObserver before navigation so `buffered: true`
    // back-fills any long tasks that landed before the script runs.
    await page.addInitScript(() => {
      const store: { startTime: number; duration: number; name: string }[] = [];
      (globalThis as unknown as { __okScenLongTasks: typeof store }).__okScenLongTasks = store;
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            store.push({ startTime: e.startTime, duration: e.duration, name: e.name });
          }
        });
        obs.observe({ type: 'longtask', buffered: true });
      } catch {
        // longtask API unsupported — not fatal.
      }
    });

    const url = `${opts.target}/#/${encodeURIComponent(BIG_DOC)}`;
    const startWall = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    let rendered = false;
    try {
      await page.waitForSelector('.ProseMirror', {
        state: 'attached',
        timeout: PM_READY_TIMEOUT_MS,
      });
      await page.waitForFunction(
        (chars: number) => {
          const el = document.querySelector('.ProseMirror');
          return Boolean(el && (el.textContent ?? '').length >= chars);
        },
        PM_READY_CHARS,
        { timeout: PM_READY_TIMEOUT_MS },
      );
      rendered = true;
    } catch {
      ctx.note(
        `ProseMirror did not render ≥${PM_READY_CHARS} chars within ${PM_READY_TIMEOUT_MS}ms — doc may be missing or navigation stalled`,
      );
    }

    const coldLoadMs = Date.now() - startWall;
    ctx.recordMetric('docName', BIG_DOC);
    ctx.recordMetric('coldLoadMs', rendered ? coldLoadMs : -1);
    ctx.recordMetric('rendered', rendered);

    const longTasks = await page.evaluate(() => {
      const store = (globalThis as unknown as { __okScenLongTasks?: LongTaskRecord[] })
        .__okScenLongTasks;
      return store ?? [];
    });
    const longestTaskMs = longTasks.reduce((m, t) => Math.max(m, t.duration), 0);
    ctx.recordMetric('observedLongTaskCount', longTasks.length);
    ctx.recordMetric('observedLongestTaskMs', Math.round(longestTaskMs));

    // Sample editor text length as a sanity check — if it is tiny the doc
    // wasn't PROJECT (or whatever was configured) and the coldLoad number
    // will be uninterpretable.
    if (rendered) {
      const pmLen = await page.evaluate(() => {
        const el = document.querySelector('.ProseMirror');
        return el ? (el.textContent ?? '').length : 0;
      });
      ctx.recordMetric('proseMirrorTextLen', pmLen);
    }
  },
});
