/**
 * Context Bridge hooks (FR-27, §9.15, Precedent #13).
 *
 * usePublishContexts — publisher-side: publishes captured Context values
 *   to the bridge store in useLayoutEffect (committed renders only).
 *
 * useAncestorContexts — consumer-side: walks PM $pos.node(depth) from
 *   nearest PM ancestor to root, collects published entries with push
 *   ordering (nearest-last → innermost React provider, matching React
 *   Context shadowing semantics).
 *
 * ContextBridgeProvider — wraps children in <Context.Provider> chains.
 *   Zero-cost no-op when entries is empty.
 *
 * ContextCapture — helper rendered INSIDE the real compound component's
 *   React subtree. Reads scope-resolved Context values via use() and
 *   publishes them to the store.
 */

import type { Editor } from '@tiptap/core';
import React, {
  type Context,
  type ReactNode,
  use,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react';
import { getBridgeId } from '../extensions/bridge-id-plugin';
import type { BridgeStore, ContextEntry } from './store';
import { getStoreForEditor } from './store';

/**
 * Publish context entries for a bridgeId to the store.
 * Only fires on committed renders (useLayoutEffect); never on aborted ones.
 * Cleans up on unmount (unpublish).
 */
export function usePublishContexts(
  store: BridgeStore,
  bridgeId: string | undefined,
  entries: ContextEntry[],
): void {
  useLayoutEffect(() => {
    if (!bridgeId || entries.length === 0) return;
    store.publish(bridgeId, entries);
    return () => {
      store.unpublish(bridgeId);
    };
  }); // no dep array — re-publishes on every committed render (entries may change)
}

/**
 * Collect ancestor context entries by walking $pos.node(depth) from
 * the nearest PM ancestor down to the doc root. Uses push ordering
 * so nearest-ancestor entries are last → innermost React provider
 * (matching React Context shadowing: nearest ancestor wins).
 *
 * Subscribes to the store via useSyncExternalStore for re-renders
 * on publish/unpublish events.
 */
export function useAncestorContexts(
  editor: Editor,
  getPos: (() => number | undefined) | number | undefined,
): ContextEntry[] {
  const store = getStoreForEditor(editor);

  // Subscribe to store changes for reactive updates
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const pos = typeof getPos === 'function' ? getPos() : getPos;
  if (pos === undefined) return [];

  try {
    const $pos = editor.state.doc.resolve(pos);
    const collected: ContextEntry[] = [];

    // Walk from depth-1 (nearest PM ancestor, excluding self) down to 0 (doc root).
    // Push ordering: depth-1 entries pushed LAST → become INNERMOST React providers
    // → matches React Context shadowing (nearest ancestor wins).
    for (let depth = 1; depth < $pos.depth; depth++) {
      const ancestorNode = $pos.node(depth);
      if (ancestorNode.type.name !== 'jsxComponent') continue;

      const ancestorPos = $pos.before(depth);
      const ancestorBridgeId = getBridgeId(editor.state, ancestorPos);
      if (!ancestorBridgeId) continue;

      const e = store.get(ancestorBridgeId);
      if (e) collected.push(...e);
    }

    return collected;
  } catch {
    // $pos.resolve can throw if the position is invalid during editor teardown
    return [];
  }
}

/**
 * Wrap children in <Context.Provider> chains for bridged contexts.
 * Entries are ordered outermost-first, so the first entry becomes the
 * OUTERMOST provider and the last entry (nearest ancestor) becomes
 * the INNERMOST provider — matching React Context shadowing.
 *
 * When entries is empty, renders children unchanged (zero-cost no-op).
 */
export function ContextBridgeProvider({
  entries,
  children,
}: {
  entries: ContextEntry[];
  children: ReactNode;
}): ReactNode {
  if (entries.length === 0) return children;

  let result = children;
  // Wrap from last to first so the first entry is outermost
  for (let i = entries.length - 1; i >= 0; i--) {
    const { context, value } = entries[i];
    const Provider = context.Provider as React.FC<{ value: unknown; children: ReactNode }>;
    result = <Provider value={value}>{result}</Provider>;
  }
  return result;
}

/**
 * Helper component rendered INSIDE a compound component's React subtree
 * (e.g., inside the real fumadocs <Tabs>) to capture scope-resolved
 * Context values and publish them to the bridge store.
 *
 * Reads each context via use() from the live React tree — we capture
 * what React actually provides, not abstract Context objects from the
 * descriptor (critical for Radix's createContextScope).
 */
export function ContextCapture({
  bridgeId,
  contexts,
  store,
}: {
  bridgeId: string | undefined;
  contexts: Array<Context<unknown>>;
  store: BridgeStore;
}): null {
  // Read live scope-resolved values from each context via use() (React 19).
  // The contexts array is stable per descriptor — never changes between renders
  // for the same NodeView instance, satisfying the hook-call-order invariant.
  const entries: ContextEntry[] = [];
  for (const ctx of contexts) {
    const value = use(ctx);
    entries.push({ context: ctx, value });
  }

  usePublishContexts(store, bridgeId, entries);

  return null;
}
