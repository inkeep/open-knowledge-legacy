import { defineScenario } from '../lib/scenario';

const BIG_DOC = process.env.OK_PERF_BIG_DOC ?? 'PROJECT';

const PM_READY_CHARS = 500;

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
      } catch {}
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

    if (rendered) {
      const pmLen = await page.evaluate(() => {
        const el = document.querySelector('.ProseMirror');
        return el ? (el.textContent ?? '').length : 0;
      });
      ctx.recordMetric('proseMirrorTextLen', pmLen);
    }
  },
});
