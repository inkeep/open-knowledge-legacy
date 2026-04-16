/**
 * useBlockSelection — React hook for subscribing to `SelectionStatePlugin`
 * state (Precedent #15).
 *
 * Thin `useSyncExternalStore` wrapper over the plugin's imperative subscribe /
 * getSnapshot API. Concurrent-mode safe; bails out on referentially identical
 * state (plugin guarantees reference preservation via deep-equality check).
 *
 * Returns `null` for a null editor (safe pre-mount rendering); SSR snapshot
 * is also `null` — selection is a browser-only concept.
 */

import type { Editor } from '@tiptap/core';
import { useSyncExternalStore } from 'react';
import {
  type BlockSelection,
  getBlockSelection,
  subscribeBlockSelection,
} from '../extensions/selection-state-plugin.ts';

const NOOP_SUBSCRIBE = (): (() => void) => {
  return () => {
    // no-op teardown
  };
};

const NULL_SNAPSHOT = (): null => null;

export function useBlockSelection(editor: Editor | null): BlockSelection | null {
  return useSyncExternalStore(
    editor ? (cb) => subscribeBlockSelection(editor, cb) : NOOP_SUBSCRIBE,
    editor ? () => getBlockSelection(editor) : NULL_SNAPSHOT,
    NULL_SNAPSHOT,
  );
}
