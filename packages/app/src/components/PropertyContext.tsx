/**
 * PropertyContext — cross-tree signal bus for the property-panel surface.
 *
 * The "Add property" affordance lives in the editor toolbar (`EditorArea`),
 * but the form it opens lives inside `PropertyPanel` — three Activity / error
 * / Suspense boundaries deeper in the tree. Window events (the prior
 * approach) bypassed React's render model and broadcast globally, hitting
 * every mounted PropertyPanel including hidden Activities — a ghost-state
 * leak. This context replaces them with a typed, doc-scoped signal that
 * stays inside React.
 *
 * Pattern: a per-doc counter that increments when the toolbar requests an
 * add. PropertyPanel watches its own doc's counter via `useEffect` and runs
 * `beginAdd` on each tick. Counters (not booleans) so consecutive clicks
 * still fire even if the panel hasn't consumed the prior signal yet.
 *
 * Stale-entry cleanup: panels prune their own entry on unmount via
 * `clearAddProperty`. Pool eviction unmounts the corresponding panel
 * naturally (Activity isn't enough — the limit-3 Activity mount list still
 * unmounts evicted entries), so this catches the eviction case too.
 *
 * Scope: intentionally narrow. Each cross-tree property-panel signal that
 * lands here should look like another `request*` / `signal` pair on this
 * context — not a fattening of `DocumentContext`, which already mixes
 * navigation, pooling, presence, and pinning. Keep this surface single-
 * concern: cross-tree property-panel UX.
 */
import { createContext, type ReactNode, use, useState } from 'react';

interface PropertyContextValue {
  /** Per-doc counter — increments on each `requestAddProperty(docName)`. */
  addPropertySignal: ReadonlyMap<string, number>;
  /** Toolbar dispatcher — bumps the counter for `docName`. */
  requestAddProperty: (docName: string) => void;
  /** Panel cleanup — drop the entry on unmount / eviction. */
  clearAddProperty: (docName: string) => void;
}

const PropertyContext = createContext<PropertyContextValue | null>(null);

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [addPropertySignal, setAddPropertySignal] = useState<Map<string, number>>(() => new Map());

  // React Compiler memoizes; no useMemo / useCallback needed (CLAUDE.md).
  const requestAddProperty = (docName: string) => {
    setAddPropertySignal((prev) => {
      const next = new Map(prev);
      next.set(docName, (prev.get(docName) ?? 0) + 1);
      return next;
    });
  };

  const clearAddProperty = (docName: string) => {
    setAddPropertySignal((prev) => {
      if (!prev.has(docName)) return prev;
      const next = new Map(prev);
      next.delete(docName);
      return next;
    });
  };

  // React Compiler hoists this object so consumers re-render only when
  // `addPropertySignal` actually changes (CLAUDE.md: no useMemo).
  const value: PropertyContextValue = {
    addPropertySignal,
    requestAddProperty,
    clearAddProperty,
  };

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function useProperties(): PropertyContextValue {
  const ctx = use(PropertyContext);
  if (ctx === null) {
    throw new Error('useProperties must be used within <PropertyProvider />');
  }
  return ctx;
}
