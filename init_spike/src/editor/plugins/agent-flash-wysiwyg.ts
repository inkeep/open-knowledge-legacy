/**
 * Agent Flash Plugin — WYSIWYG (ProseMirror)
 *
 * Observes Y.Map('activity') for new agent write entries and highlights
 * affected paragraph nodes with a CSS animation (agent-flash class).
 *
 * Uses direct DOM manipulation (not ProseMirror decorations) because
 * decorations don't survive re-renders (A6 from spec).
 *
 * Flash is debounced to max 1 per 500ms for rapid agent writes.
 * Activity entries older than 30s are auto-evicted on each observation.
 */
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type * as Y from 'yjs';
import type { ActivityEntry } from '../../presence/identity';

const FLASH_DURATION_MS = 2000;
const FLASH_DEBOUNCE_MS = 500;
const ACTIVITY_TTL_MS = 30_000;

export const agentFlashPluginKey = new PluginKey('agentFlash');

interface FlashPluginState {
  lastFlashTime: number;
  lastSeenTimestamp: number;
  pendingTimeout: ReturnType<typeof setTimeout> | null;
}

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
 * Apply agent-flash class to all top-level paragraph-like nodes in the editor.
 * Since agent writes are batch diffs (not character-level), we flash all
 * paragraphs that were affected. For v0, we flash all visible paragraphs
 * when an activity entry arrives — the activity map doesn't carry position info
 * (D10: flash plugin resolves position via observation).
 */
function applyFlash(view: EditorView): void {
  const dom = view.dom;
  // Find all top-level block nodes (paragraphs, headings, etc.)
  const blocks = dom.querySelectorAll(':scope > *');
  for (const block of blocks) {
    const el = block as HTMLElement;
    // Remove existing animation so it can restart
    el.classList.remove('agent-flash');
    // Force reflow to restart animation
    void el.offsetHeight;
    el.classList.add('agent-flash');

    // Remove class after animation completes
    setTimeout(() => {
      el.classList.remove('agent-flash');
    }, FLASH_DURATION_MS);
  }
}

export function createAgentFlashPlugin(doc: Y.Doc): Plugin {
  const activityMap = doc.getMap('activity');

  return new Plugin({
    key: agentFlashPluginKey,

    state: {
      init(): FlashPluginState {
        return {
          lastFlashTime: 0,
          lastSeenTimestamp: Date.now(),
          pendingTimeout: null,
        };
      },
      apply(_tr, value): FlashPluginState {
        return value;
      },
    },

    view(view: EditorView) {
      const state = agentFlashPluginKey.getState(view.state) as FlashPluginState;

      const activityObserver = (_event: Y.YMapEvent<unknown>) => {
        evictStaleEntries(activityMap);

        // Check for new entries since last seen
        let hasNew = false;
        for (const [, value] of activityMap.entries()) {
          const entry = value as ActivityEntry;
          if (entry.timestamp && entry.timestamp > state.lastSeenTimestamp) {
            hasNew = true;
            break;
          }
        }

        if (!hasNew) return;

        // Update last seen timestamp
        state.lastSeenTimestamp = Date.now();

        // Debounce: skip if last flash was too recent
        const now = Date.now();
        if (now - state.lastFlashTime < FLASH_DEBOUNCE_MS) {
          // Schedule a delayed flash if not already pending
          if (!state.pendingTimeout) {
            const delay = FLASH_DEBOUNCE_MS - (now - state.lastFlashTime);
            state.pendingTimeout = setTimeout(() => {
              state.pendingTimeout = null;
              state.lastFlashTime = Date.now();
              applyFlash(view);
            }, delay);
          }
          return;
        }

        state.lastFlashTime = now;
        applyFlash(view);
      };

      activityMap.observe(activityObserver);

      // Visibility change handler for FR15 (flash on tab refocus)
      const visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          // Check for activity entries newer than lastSeenTimestamp
          let hasNew = false;
          for (const [, value] of activityMap.entries()) {
            const entry = value as ActivityEntry;
            if (entry.timestamp && entry.timestamp > state.lastSeenTimestamp) {
              hasNew = true;
              break;
            }
          }
          if (hasNew) {
            state.lastSeenTimestamp = Date.now();
            state.lastFlashTime = Date.now();
            applyFlash(view);
          }
        } else {
          // Tab hidden — update timestamp
          state.lastSeenTimestamp = Date.now();
        }
      };

      document.addEventListener('visibilitychange', visibilityHandler);

      return {
        destroy() {
          activityMap.unobserve(activityObserver);
          document.removeEventListener('visibilitychange', visibilityHandler);
          if (state.pendingTimeout) {
            clearTimeout(state.pendingTimeout);
          }
        },
      };
    },
  });
}
