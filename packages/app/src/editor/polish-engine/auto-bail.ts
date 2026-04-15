/**
 * Polish Engine — Auto-bail predicate
 *
 * Silent safety net: if a document exceeds the line-count ceiling or
 * the first paint takes too long, reconfigure the polish Compartment
 * to [] (empty). No user UI. Internal-only.
 *
 * Trigger conditions (evaluated once per document):
 * 1. doc.lines > 5000
 * 2. First ViewPlugin update() exceeds 200ms wall-clock
 *
 * Once bailed, the engine stays off for that doc until reload.
 */

import type { Compartment } from '@codemirror/state';
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';

const LINE_CEILING = 5000;
const FIRST_PAINT_CEILING_MS = 200;

export function createAutoBailPlugin(compartment: Compartment) {
  return ViewPlugin.fromClass(
    class {
      bailed = false;
      checked = false;

      update(update: ViewUpdate) {
        if (this.bailed || this.checked) return;
        this.checked = true;

        const view = update.view;
        const doc = view.state.doc;

        // Check line-count ceiling
        if (doc.lines > LINE_CEILING) {
          this.bailed = true;
          // Defer the dispatch to avoid dispatching during an update
          queueMicrotask(() => {
            view.dispatch({
              effects: compartment.reconfigure([]),
            });
          });
          return;
        }

        // Check first-paint latency
        const start = performance.now();
        // The ViewPlugin already computed decorations in its constructor;
        // measure the duration from the time this update fires.
        // If we're here in the first update and it took too long, bail.
        requestAnimationFrame(() => {
          if (this.bailed) return;
          const elapsed = performance.now() - start;
          if (elapsed > FIRST_PAINT_CEILING_MS) {
            this.bailed = true;
            view.dispatch({
              effects: compartment.reconfigure([]),
            });
          }
        });
      }
    },
  );
}
