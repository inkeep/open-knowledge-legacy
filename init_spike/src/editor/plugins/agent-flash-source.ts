/**
 * Agent Flash Plugin — Source (CodeMirror)
 *
 * Observes Y.Map('activity') for new agent write entries and highlights
 * affected lines with a CSS animation (agent-flash class).
 *
 * Uses CodeMirror StateField + StateEffect pattern for flash decorations.
 * Activity entries older than 30s are auto-evicted on each observation.
 */
import { type Extension, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type * as Y from 'yjs';
import type { ActivityEntry } from '../../presence/identity';

const FLASH_DURATION_MS = 2000;
const FLASH_DEBOUNCE_MS = 500;
const ACTIVITY_TTL_MS = 30_000;

/** Effect to add flash decorations for a line range */
const addFlash = StateEffect.define<{ from: number; to: number }>();

/** Effect to remove all flash decorations */
const removeFlash = StateEffect.define<null>();

const flashDecoration = Decoration.line({ class: 'agent-flash' });

/** StateField that manages flash decorations */
const flashField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Map existing decorations through document changes
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(addFlash)) {
        const { from, to } = effect.value;
        const builder: Array<ReturnType<typeof flashDecoration.range>> = [];
        // Add decoration to each line in the range
        for (let pos = from; pos <= to; ) {
          const line = tr.state.doc.lineAt(pos);
          builder.push(flashDecoration.range(line.from));
          pos = line.to + 1;
        }
        decorations = decorations.update({ add: builder, sort: true });
      } else if (effect.is(removeFlash)) {
        decorations = Decoration.none;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Auto-evict activity entries older than 30s.
 */
function evictStaleEntries(activityMap: Y.Map<unknown>): void {
  const now = Date.now();
  for (const [key, value] of activityMap.entries()) {
    const entry = value as ActivityEntry;
    if (entry.timestamp && now - entry.timestamp > ACTIVITY_TTL_MS) {
      activityMap.delete(key);
    }
  }
}

/**
 * Creates a CodeMirror extension that flashes lines when agent activity is detected.
 */
export function createAgentFlashSourceExtension(doc: Y.Doc): Extension {
  const activityMap = doc.getMap('activity');

  const flashViewPlugin = ViewPlugin.define((view) => {
    let lastFlashTime = 0;
    let lastSeenTimestamp = Date.now();
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

    function flashAllLines() {
      const docLength = view.state.doc.length;
      if (docLength === 0) return;
      view.dispatch({
        effects: addFlash.of({ from: 0, to: docLength }),
      });
      // Remove flash after duration
      setTimeout(() => {
        view.dispatch({
          effects: removeFlash.of(null),
        });
      }, FLASH_DURATION_MS);
    }

    const activityObserver = (_event: Y.YMapEvent<unknown>) => {
      evictStaleEntries(activityMap);

      // Check for new entries since last seen
      let hasNew = false;
      for (const [, value] of activityMap.entries()) {
        const entry = value as ActivityEntry;
        if (entry.timestamp && entry.timestamp > lastSeenTimestamp) {
          hasNew = true;
          break;
        }
      }

      if (!hasNew) return;

      lastSeenTimestamp = Date.now();

      // Debounce: skip if last flash was too recent
      const now = Date.now();
      if (now - lastFlashTime < FLASH_DEBOUNCE_MS) {
        if (!pendingTimeout) {
          const delay = FLASH_DEBOUNCE_MS - (now - lastFlashTime);
          pendingTimeout = setTimeout(() => {
            pendingTimeout = null;
            lastFlashTime = Date.now();
            flashAllLines();
          }, delay);
        }
        return;
      }

      lastFlashTime = now;
      flashAllLines();
    };

    activityMap.observe(activityObserver);

    // Visibility change handler for FR15 (flash on tab refocus)
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        let hasNew = false;
        for (const [, value] of activityMap.entries()) {
          const entry = value as ActivityEntry;
          if (entry.timestamp && entry.timestamp > lastSeenTimestamp) {
            hasNew = true;
            break;
          }
        }
        if (hasNew) {
          lastSeenTimestamp = Date.now();
          lastFlashTime = Date.now();
          flashAllLines();
        }
      } else {
        lastSeenTimestamp = Date.now();
      }
    };

    document.addEventListener('visibilitychange', visibilityHandler);

    return {
      update(_update: ViewUpdate) {
        // No-op — flash is driven by Y.Map observation, not editor updates
      },
      destroy() {
        activityMap.unobserve(activityObserver);
        document.removeEventListener('visibilitychange', visibilityHandler);
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
        }
      },
    };
  });

  return [flashField, flashViewPlugin];
}
