/**
 * Context Bridge Store (FR-27, §9.15, Precedent #19).
 *
 * Pure JS store that enables React Context values to cross TipTap
 * NodeView portal boundaries. Each compound-parent NodeView (Tabs,
 * Accordion) publishes its scope-resolved Context values here;
 * descendant NodeViews subscribe and re-provide them.
 *
 * Implements `useSyncExternalStore` protocol: subscribe + getSnapshot.
 * One store per editor instance via WeakMap<Editor, BridgeStore>.
 */

import type { Editor } from '@tiptap/core';
import type { Context } from 'react';

export interface ContextEntry {
  context: Context<unknown>;
  value: unknown;
}

export interface BridgeStore {
  /** Publish context entries for a bridgeId */
  publish(bridgeId: string, entries: ContextEntry[]): void;
  /** Remove context entries for a bridgeId */
  unpublish(bridgeId: string): void;
  /** Get context entries for a bridgeId */
  get(bridgeId: string): ContextEntry[] | undefined;
  /** Subscribe for changes (useSyncExternalStore protocol) */
  subscribe(callback: () => void): () => void;
  /** Monotonic version (useSyncExternalStore protocol) */
  getSnapshot(): number;
}

export function createContextBridgeStore(): BridgeStore {
  const entries = new Map<string, ContextEntry[]>();
  const listeners = new Set<() => void>();
  let version = 0;

  function notify(): void {
    version++;
    for (const cb of listeners) {
      cb();
    }
  }

  return {
    publish(bridgeId: string, e: ContextEntry[]) {
      // Skip notify when entries haven't changed (shallow equality).
      // Prevents cascading re-renders when usePublishContexts fires
      // on every committed render with identical data.
      const existing = entries.get(bridgeId);
      if (
        existing &&
        existing.length === e.length &&
        existing.every((entry, i) => entry.context === e[i].context && entry.value === e[i].value)
      ) {
        return;
      }
      entries.set(bridgeId, e);
      notify();
    },

    unpublish(bridgeId: string) {
      if (entries.delete(bridgeId)) {
        notify();
      }
    },

    get(bridgeId: string) {
      return entries.get(bridgeId);
    },

    subscribe(callback: () => void) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },

    getSnapshot() {
      return version;
    },
  };
}

/**
 * Editor-scoped store lookup. Stores are GC'd when editors are destroyed
 * (WeakMap key is the Editor instance).
 */
const editorStores = new WeakMap<Editor, BridgeStore>();

export function getStoreForEditor(editor: Editor): BridgeStore {
  let store = editorStores.get(editor);
  if (!store) {
    store = createContextBridgeStore();
    editorStores.set(editor, store);
  }
  return store;
}
