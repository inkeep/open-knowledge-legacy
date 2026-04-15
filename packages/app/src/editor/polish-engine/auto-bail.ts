/**
 * Polish Engine — Auto-bail predicate
 *
 * Silent safety net: if a document exceeds the line-count ceiling or
 * the first decoration build took too long, reconfigure the polish
 * Compartment to [] (empty). No user UI. Internal-only.
 *
 * Trigger conditions:
 * 1. doc.lines > 5000 (checked on every update — O(1))
 * 2. First buildDecorations() wall-clock > 200ms (read from ViewPlugin)
 *
 * Once bailed, the engine stays off for that doc until reload.
 */

import type { Compartment } from '@codemirror/state';
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { getFirstPaintMs } from './view-plugin';

export const LINE_CEILING = 5000;
export const FIRST_PAINT_CEILING_MS = 200;

export function createAutoBailPlugin(compartment: Compartment) {
  return ViewPlugin.fromClass(
    class {
      bailed = false;

      update(update: ViewUpdate) {
        if (this.bailed) return;

        const doc = update.view.state.doc;

        // Check line-count ceiling (O(1) — safe to run on every update)
        if (doc.lines > LINE_CEILING) {
          this.bailed = true;
          queueMicrotask(() => {
            update.view.dispatch({
              effects: compartment.reconfigure([]),
            });
          });
          return;
        }

        // Check first-paint latency (measured by the ViewPlugin constructor)
        const paintMs = getFirstPaintMs();
        if (paintMs >= 0 && paintMs > FIRST_PAINT_CEILING_MS) {
          this.bailed = true;
          queueMicrotask(() => {
            update.view.dispatch({
              effects: compartment.reconfigure([]),
            });
          });
        }
      }
    },
  );
}
