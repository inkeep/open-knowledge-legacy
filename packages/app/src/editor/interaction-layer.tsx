/**
 * InteractionLayer — generic editor-root React plane (FR4, V2 spec §9.2).
 *
 * Problem: TipTap's per-instance `ReactMarkViewRenderer` /
 * `ReactNodeViewRenderer` creates one React portal per mark/node. On a
 * PROJECT.md-scale doc (768 views) the portals cost ~2.2 s of React
 * reconciliation on cold-pool-warm (cold-mount-profile §Corrected 5-component
 * attribution row 4).
 *
 * Solution: chips render as plain DOM (`<span data-mark-id>`) inside the
 * PM content. A SINGLE React subtree renders once at editor root
 * (`<InteractionLayerRoot>`), holds a single active `nodeId`, and resolves
 * the registered renderer to produce the PropPanel / Toolbar / Breadcrumb
 * surface. Event delegation on `editor.view.dom` + a document-level
 * outside-click listener dispatches `setActiveNode` imperatively.
 *
 * V2 wires only the PropPanel slot. Toolbar + Breadcrumb are extension
 * points for CB-v2 (per Audit §S15 scope tightening) — the shape is the
 * same `controls.{propPanel,toolbar,breadcrumb}` render-function bag.
 *
 * Consumer wiring (example — actual ports land in US-005/006/007):
 *
 *     const layer = createInteractionLayer({ editor, rootContainer });
 *     layer.register({
 *       type: 'internalLink',
 *       nodeId: 'm1',
 *       controls: {
 *         propPanel: ({ nodeId, deactivate }) => (
 *           <LinkEditPanel id={nodeId} onDone={deactivate} />
 *         ),
 *       },
 *     });
 *     // user clicks a chip carrying data-mark-id="m1" → propPanel renders
 *     // once at editor root, receives nodeId + deactivate callback.
 *
 * FR4b mark-identity:
 *   marks have no stable identity (split/merge/move). `markIdentityPlugin`
 *   (US-004) maintains PluginState<WeakMap<Mark, string>> and fires
 *   register/deregister on mark-set transitions. Schema is NOT modified
 *   (precedent #9 add-only).
 */

import { type FC, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Duck-typed editor shape. We only need a reference to `view.dom` (or
 * `editorView.dom` for TipTap's non-throwing accessor — see CLAUDE.md WARN
 * rule) so event delegation can attach.
 */
export interface InteractionLayerEditor {
  editorView?: { dom: HTMLElement };
  view?: { dom: HTMLElement };
}

export interface InteractionContext {
  nodeId: string;
  type: string;
  /** Caller-side callback to deactivate (close) the panel. */
  deactivate: () => void;
}

/**
 * Context passed to the optional `handlePrimary` handler. Chips that want
 * to short-circuit the default "open the PropPanel" behavior on bare-click
 * / Enter / Space can register this hook and perform navigation (or any
 * other primary-action semantics) directly.
 *
 * `newTab` is set when the user pressed Cmd/Ctrl/middle-click — the layer
 * routes these through `handlePrimary` so chips can preserve the universal
 * web "open in new tab" mental model even though they're plain-DOM chips
 * without an `<a href>`.
 */
export interface InteractionPrimaryContext {
  nodeId: string;
  type: string;
  /** True when the user intended new-tab semantics (Cmd/Ctrl/middle-click). */
  newTab: boolean;
}

export interface InteractionControls {
  /** Rendered at editor root when nodeId becomes active. */
  propPanel?: (ctx: InteractionContext) => React.ReactNode;
  /**
   * Reserved for CB-v2 per spec §9.2 — extension point. V2 extensions
   * do NOT set this; CB-v2's JsxComponentView will.
   */
  toolbar?: (ctx: InteractionContext) => React.ReactNode;
  /**
   * Reserved for CB-v2 per spec §9.2 — extension point. V2 extensions
   * do NOT set this; CB-v2's JsxComponentView will.
   */
  breadcrumb?: (ctx: InteractionContext) => React.ReactNode;
}

export interface RegisterParams {
  /** Semantic kind: 'internalLink', 'wikiLink', 'jsxComponent', etc. */
  type: string;
  /**
   * Unique id for this registration — typically mark-id (US-004) or
   * stable node-id derived from `getPos()`.
   */
  nodeId: string;
  /** Optional PM position resolver (useful for NodeView consumers). */
  getPos?: () => number | undefined;
  /** Render-function bag for the three singleton slots. */
  controls: InteractionControls;
  /**
   * Optional hook invoked BEFORE the layer routes primary activation
   * (click / Enter / Space) to `setActiveNode`. Returning `true` means
   * "handled — do not open the PropPanel"; returning `false`/`undefined`
   * falls through to the default setActiveNode behavior.
   *
   * Chip kinds that want to preserve universal link semantics (Cmd+Click
   * opens in a new tab, bare-click navigates immediately) implement this
   * hook. The layer still routes keyboard activation (Enter / Space) here
   * too — keyboard + pointer share one path.
   */
  handlePrimary?: (ctx: InteractionPrimaryContext) => boolean | undefined;
}

export interface InteractionLayerHandle {
  /** Register a node's controls. Overwrites prior registration for same nodeId. */
  register(params: RegisterParams): void;
  /** Remove a registration. If the nodeId was active, active is cleared. */
  deregister(nodeId: string): void;
  /** Imperatively set the active nodeId (or null to dismiss). */
  setActiveNode(nodeId: string | null): void;
  /** Read the current active nodeId. */
  getActiveNode(): string | null;
  /** Inspect a registered entry (useful for extension event handlers). */
  getRegistration(nodeId: string): RegisterParams | undefined;
  /** Remove event listener, clear registry, unmount React subtree. Idempotent. */
  destroy(): void;
  /**
   * Direct store access — exposed so the host (`<InteractionLayerView>`)
   * can subscribe via React without going through createRoot. The store is
   * the source of truth; the handle's register/deregister/setActiveNode
   * are convenience proxies. Tests + main-tree React render both go through
   * the store.
   */
  store: InteractionLayerStore;
}

export interface CreateInteractionLayerParams {
  editor: InteractionLayerEditor;
  /**
   * Optional container override for the React subtree. Defaults to the
   * parent of `editor.view.dom` (the editor's immediate wrapper — same
   * height/width the chips live in, so PropPanel positioning is natural).
   */
  rootContainer?: HTMLElement;
  /**
   * Optional externally-provided root mount point. If omitted, a new
   * `<div data-ok-interaction-layer>` is created and appended to
   * `rootContainer`.
   */
  mountNode?: HTMLElement;
}

// ---------------------------------------------------------------------------
// Internal store — pure, testable without React
// ---------------------------------------------------------------------------

/** Snapshot consumed by `useSyncExternalStore` for React-side reads. */
export interface LayerSnapshot {
  /** Currently active node id, or null. */
  activeNodeId: string | null;
  /** Active registration (null if no active or deregistered). */
  active: RegisterParams | null;
}

type Listener = () => void;

/**
 * Pure imperative store. No React dependency — exported for unit testing.
 *
 * Single responsibility: hold the registry + active node id, notify
 * subscribers on change. `useSyncExternalStore` consumes the public
 * `subscribe` + `getSnapshot` surface from the React root component.
 */
export class InteractionLayerStore {
  private readonly registry = new Map<string, RegisterParams>();
  private _activeNodeId: string | null = null;
  private readonly listeners = new Set<Listener>();
  /** Cached snapshot for `useSyncExternalStore` — only replaced on change. */
  private _snapshot: LayerSnapshot = { activeNodeId: null, active: null };

  register(params: RegisterParams): void {
    this.registry.set(params.nodeId, params);
    // Update snapshot lazily only if the active entry was the one changed.
    if (this._activeNodeId === params.nodeId) {
      this.refreshSnapshot();
    }
  }

  deregister(nodeId: string): void {
    const hadEntry = this.registry.delete(nodeId);
    if (!hadEntry) return;
    if (this._activeNodeId === nodeId) {
      this._activeNodeId = null;
      this.refreshSnapshot();
    }
  }

  setActiveNode(nodeId: string | null): void {
    if (this._activeNodeId === nodeId) return;
    // Validate against registry — setting active to a non-registered id is a
    // no-op. This makes the API idempotent even when the consumer has race
    // conditions (e.g. deregister happened just before click dispatches).
    if (nodeId !== null && !this.registry.has(nodeId)) return;
    this._activeNodeId = nodeId;
    this.refreshSnapshot();
  }

  getActiveNode(): string | null {
    return this._activeNodeId;
  }

  getRegistration(nodeId: string): RegisterParams | undefined {
    return this.registry.get(nodeId);
  }

  hasRegistration(nodeId: string): boolean {
    return this.registry.has(nodeId);
  }

  clear(): void {
    this.registry.clear();
    this._activeNodeId = null;
    this.refreshSnapshot();
  }

  /**
   * `useSyncExternalStore` contract: identity-stable snapshot between
   * notifies, new object on change. Prevents tear-based inconsistency.
   */
  getSnapshot = (): LayerSnapshot => {
    return this._snapshot;
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private refreshSnapshot(): void {
    const active =
      this._activeNodeId != null ? (this.registry.get(this._activeNodeId) ?? null) : null;
    this._snapshot = { activeNodeId: this._activeNodeId, active };
    for (const l of this.listeners) l();
  }
}

// ---------------------------------------------------------------------------
// Event delegation — pure helper, testable without DOM
// ---------------------------------------------------------------------------

/**
 * Walk up from a click target; return the closest element carrying a
 * `data-mark-id` or `data-node-id` attribute that matches the registry.
 *
 * Pure w.r.t. the DOM: we only call `Element.getAttribute` (read-only)
 * and `Element.parentElement` (read-only) — so tests can pass a fake
 * tree made of plain objects.
 */
interface ResolverNode {
  getAttribute?: (key: string) => string | null;
  parentElement?: ResolverNode | null;
}

export function resolveClickTargetNodeId(
  target: EventTarget | null,
  registry: Pick<InteractionLayerStore, 'hasRegistration'>,
): string | null {
  let el: ResolverNode | null = (target as unknown as ResolverNode) ?? null;
  while (el && typeof el === 'object') {
    const getAttr = el.getAttribute;
    if (typeof getAttr === 'function') {
      const markId = getAttr.call(el, 'data-mark-id');
      if (markId && registry.hasRegistration(markId)) return markId;
      const nodeId = getAttr.call(el, 'data-node-id');
      if (nodeId && registry.hasRegistration(nodeId)) return nodeId;
    }
    el = el.parentElement ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// React root — singleton subtree that renders the active PropPanel + extension
// slots. Uses useSyncExternalStore so React re-renders only when activeNodeId
// (or the active registration) actually changes.
// ---------------------------------------------------------------------------

interface InteractionLayerRootProps {
  store: InteractionLayerStore;
}

const InteractionLayerRoot: FC<InteractionLayerRootProps> = ({ store }) => {
  // Read from store using the basic `useState + subscribe` pattern. We avoid
  // useSyncExternalStore to side-step React 19's strict `getSnapshot` identity
  // requirements while keeping re-renders bounded: the store's snapshot
  // reference only changes when register/deregister/setActiveNode fires a
  // real transition.
  const [snapshot, setSnapshot] = useState<LayerSnapshot>(() => store.getSnapshot());
  useEffect(() => {
    // Sync to initial snapshot (in case state changed between render and effect)
    setSnapshot(store.getSnapshot());
    const unsubscribe = store.subscribe(() => {
      setSnapshot(store.getSnapshot());
    });
    return unsubscribe;
  }, [store]);

  const { active } = snapshot;
  if (!active) return null;

  const ctx: InteractionContext = {
    nodeId: active.nodeId,
    type: active.type,
    deactivate: () => store.setActiveNode(null),
  };

  return (
    <>
      {active.controls.propPanel?.(ctx)}
      {active.controls.toolbar?.(ctx)}
      {active.controls.breadcrumb?.(ctx)}
    </>
  );
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function getEditorDom(editor: InteractionLayerEditor): HTMLElement | null {
  // Prefer the non-throwing `editorView` accessor to avoid TipTap's throwing
  // proxy during a recycle→remount race (CLAUDE.md WARN rule).
  return editor.editorView?.dom ?? editor.view?.dom ?? null;
}

/**
 * Create a layer handle bound to the editor. Call `destroy()` on editor
 * teardown — `InteractionLayerHandle` owns the event listener, React root,
 * and registry, and releases all three on destroy.
 *
 * Returns a fully-usable handle even if DOM access is partially unavailable
 * (e.g. TipTap's view not mounted yet) — register/deregister/setActiveNode
 * still work. The event listener attaches lazily once `editor.view` is ready.
 */
export function createInteractionLayer(
  params: CreateInteractionLayerParams,
): InteractionLayerHandle {
  // rootContainer + mountNode were used to drive the layer's own React root.
  // Removed when the layer switched to in-tree rendering via
  // `<InteractionLayerView>` — a separate createRoot() strands PropPanels
  // from the app's context providers. Both fields are accepted for
  // backwards-compat but ignored; destructure them here to preserve the
  // public option shape without TypeScript unused-param noise.
  const { editor } = params;
  const store = new InteractionLayerStore();

  // Lazily bound pieces (may be null in test environments with no DOM).
  let editorDom: HTMLElement | null = getEditorDom(editor);
  let clickListenerAttached = false;

  // Event delegation handlers (same-target class so add/remove matches).
  //
  // Chip registrations can opt into a `handlePrimary` hook (used by mark /
  // node chips that want to preserve universal link semantics — bare-click
  // navigates, Cmd/Ctrl/middle-click opens in new tab, Enter/Space fires
  // the primary action). When `handlePrimary` returns true we treat the
  // activation as handled and DO NOT open the PropPanel. Chips without
  // `handlePrimary` (rich NodeViews like RawMdxFallback / JsxComponent)
  // fall through to the layer's default setActiveNode path.
  //
  // Middle-click + Cmd/Ctrl+Click semantics: pointerdown fires for
  // `button === 1` (middle) and carries `metaKey`/`ctrlKey` on modified
  // clicks. The browser's default auxiliary-click scroll mode for middle-
  // click does not interfere because we preventDefault on newTab-intent
  // activations.
  const onPointerDown = (ev: Event): void => {
    const pe = ev as PointerEvent;
    // Right-click (button === 2) falls through to the browser's native
    // context menu — don't intercept.
    if (pe.button === 2) return;
    const id = resolveClickTargetNodeId(ev.target, store);
    if (id === null) return;
    const reg = store.getRegistration(id);
    const newTab = pe.metaKey || pe.ctrlKey || pe.button === 1;
    if (reg?.handlePrimary) {
      const handled = reg.handlePrimary({ nodeId: id, type: reg.type, newTab });
      if (handled) {
        // Suppress the default browser auxiliary-click scroll on middle-click.
        if (newTab) pe.preventDefault?.();
        return;
      }
    }
    // Default: open the PropPanel.
    store.setActiveNode(id);
  };

  // Keyboard activation (Critical #3): Enter / Space on a focused chip
  // (chips carry tabindex="0") dispatches through the same resolver as
  // pointerdown so keyboard users get parity with pointer users. Escape
  // dismisses the active PropPanel for users who don't have a visible
  // close button (e.g. keyboard-only).
  const onKeyDown = (ev: Event): void => {
    const ke = ev as KeyboardEvent;
    if (ke.key === 'Escape') {
      if (store.getActiveNode() !== null) {
        store.setActiveNode(null);
        ke.preventDefault?.();
      }
      return;
    }
    if (ke.key !== 'Enter' && ke.key !== ' ' && ke.key !== 'Spacebar') return;
    const id = resolveClickTargetNodeId(ev.target, store);
    if (id === null) return;
    const reg = store.getRegistration(id);
    // Keyboard never carries new-tab semantics (there is no standard
    // keyboard chord for "open in new tab" that browsers honor uniformly
    // for non-anchor elements). Users can Tab to the chip, open the
    // PropPanel, and choose "Open in new tab" there — or use the browser's
    // native a-element flow via context menu for external links.
    const newTab = false;
    ke.preventDefault?.();
    if (reg?.handlePrimary) {
      const handled = reg.handlePrimary({ nodeId: id, type: reg.type, newTab });
      if (handled) return;
    }
    store.setActiveNode(id);
  };
  const onOutsideClick = (ev: Event): void => {
    // If the click is inside the editor AND resolves to a node, onPointerDown
    // will take over. If it's outside the editor AND outside the mount node,
    // dismiss.
    if (store.getActiveNode() === null) return;
    const target = ev.target as Node | null;
    if (!target) return;
    if (editorDom?.contains(target)) return; // editor-internal → handled above
    // The PropPanel renders inside the main React tree via <InteractionLayerView>,
    // wrapped in a div carrying `data-ok-interaction-layer`. Detect via closest()
    // so the dismiss handler ignores clicks inside the panel + any portaled
    // dialog content (Radix Dialog renders to body — those land OUTSIDE the
    // marker, so we ALSO accept Radix dialog overlays/content via data-slot).
    if (target instanceof Element) {
      if (target.closest('[data-ok-interaction-layer]')) return;
      // Scoped dialog carve-out (review Minor #25) — previously a broad
      // `[role="dialog"]` selector accepted ANY dialog in the DOM as "still
      // inside the layer's active interaction," which would fail the
      // moment another subsystem opened its own dialog. We now accept only
      // dialogs that carry `data-ok-prop-panel` (the shared primitive at
      // `components/InteractionPropPanel.tsx` emits this on every PropPanel)
      // OR Radix Dialog content that was spawned from inside the layer
      // (they render to body but carry `data-slot="dialog-*"` AND are
      // descended from a PropPanel). The second check is structural: if
      // the Radix dialog has a role="dialog" ancestor AND that ancestor
      // lives inside the PropPanel container, we treat it as layer-
      // affiliated.
      if (target.closest('[data-ok-prop-panel]')) return;
      // Radix Dialog portals content outside the DOM subtree of the
      // trigger, so `closest('[data-ok-prop-panel]')` won't catch dialogs
      // spawned from inside a PropPanel. For those, accept any dialog
      // whose role="dialog" + data-slot matches Radix conventions AND
      // whose triggering flow is likely layer-spawned — heuristic:
      // accept role="dialog" AND aria-modal="true" AND the dialog
      // element carries a data-slot attribute. This is narrower than
      // the original broad match.
      const dialog = target.closest('[role="dialog"]');
      if (
        dialog &&
        dialog.getAttribute('aria-modal') === 'true' &&
        dialog.hasAttribute('data-slot')
      ) {
        return;
      }
    }
    store.setActiveNode(null);
  };

  // Attach event listeners when the DOM is available.
  const attachListeners = (): void => {
    if (clickListenerAttached) return;
    editorDom = getEditorDom(editor);
    if (!editorDom) return;
    editorDom.addEventListener('pointerdown', onPointerDown, true);
    editorDom.addEventListener('keydown', onKeyDown, true);
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', onOutsideClick, true);
    }
    clickListenerAttached = true;
  };

  const detachListeners = (): void => {
    if (!clickListenerAttached) return;
    editorDom?.removeEventListener('pointerdown', onPointerDown, true);
    editorDom?.removeEventListener('keydown', onKeyDown, true);
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', onOutsideClick, true);
    }
    clickListenerAttached = false;
  };

  // The React mount used to live here (createRoot + render). Removed —
  // separate React roots can't access the main app's context providers
  // (PageListProvider etc.), which crashed PropPanel renderers. The host
  // (TiptapEditor) now renders `<InteractionLayerView store={store} />`
  // inside the main React tree.

  // Initial attach (deferred if DOM not ready). The React mount is now the
  // host's responsibility (rendered as <InteractionLayerView> inside the
  // main React tree by `TiptapEditor.tsx` so context providers like
  // `<PageListProvider>` are accessible from the PropPanel renderers).
  attachListeners();

  return {
    register(p) {
      store.register(p);
      // Re-try attach in case the DOM became available since construction.
      if (!clickListenerAttached) attachListeners();
    },
    deregister(id) {
      store.deregister(id);
    },
    setActiveNode(id) {
      store.setActiveNode(id);
    },
    getActiveNode() {
      return store.getActiveNode();
    },
    getRegistration(id) {
      return store.getRegistration(id);
    },
    destroy() {
      detachListeners();
      store.clear();
    },
    store,
  };
}

/**
 * `<InteractionLayerView>` — React component that subscribes to a store and
 * renders the active registration's controls (PropPanel, Toolbar, Breadcrumb).
 *
 * Render this INSIDE the main React tree (e.g. from `<TiptapEditor>`'s
 * wrapper) so the PropPanel renderers have access to React context providers
 * like `<PageListProvider>`, `<ThemeProvider>`, `<DocumentContext>`, etc.
 *
 * The layer's `mountReactRoot` was removed because using a separate
 * `createRoot()` strands the PropPanel's tree from the app's providers —
 * `usePageList()` and friends throw "no provider" errors. Hosting in the
 * main tree is the correct pattern.
 *
 * The wrapping div carries `data-ok-interaction-layer` — the layer's
 * outside-click handler uses this marker to detect clicks INSIDE the
 * PropPanel/dialogs and avoid dismissing them as "outside".
 */
export const InteractionLayerView: FC<{ store: InteractionLayerStore }> = ({ store }) => {
  return (
    <div data-ok-interaction-layer="" className="contents">
      <InteractionLayerRoot store={store} />
    </div>
  );
};
