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
import { createPortal } from 'react-dom';

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
  const { editor, rootContainer, mountNode } = params;
  const store = new InteractionLayerStore();

  // Lazily bound pieces (may be null in test environments with no DOM).
  let editorDom: HTMLElement | null = getEditorDom(editor);
  let layerMount: HTMLElement | null = null;
  let reactRoot: { unmount: () => void } | null = null;
  let clickListenerAttached = false;

  // Event delegation handlers (same-target class so add/remove matches).
  const onPointerDown = (ev: Event): void => {
    const id = resolveClickTargetNodeId(ev.target, store);
    if (id !== null) {
      store.setActiveNode(id);
    }
  };
  const onOutsideClick = (ev: Event): void => {
    // If the click is inside the editor AND resolves to a node, onPointerDown
    // will take over. If it's outside the editor AND outside the mount node,
    // dismiss.
    if (store.getActiveNode() === null) return;
    const target = ev.target as Node | null;
    if (!target) return;
    if (editorDom?.contains(target)) return; // editor-internal → handled above
    if (layerMount?.contains(target)) return; // inside PropPanel itself → ignore
    store.setActiveNode(null);
  };

  // Attach event listeners when the DOM is available.
  const attachListeners = (): void => {
    if (clickListenerAttached) return;
    editorDom = getEditorDom(editor);
    if (!editorDom) return;
    editorDom.addEventListener('pointerdown', onPointerDown, true);
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', onOutsideClick, true);
    }
    clickListenerAttached = true;
  };

  const detachListeners = (): void => {
    if (!clickListenerAttached) return;
    editorDom?.removeEventListener('pointerdown', onPointerDown, true);
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', onOutsideClick, true);
    }
    clickListenerAttached = false;
  };

  // Mount React root — deferred when document is unavailable (test env).
  const mountReactRoot = (): void => {
    if (reactRoot) return;
    if (typeof document === 'undefined') return;
    // Resolve container preference:
    //   1. Caller-provided mountNode (owned externally)
    //   2. Fresh div appended to rootContainer (owned by layer, destroyed on teardown)
    //   3. Fresh div appended to editorDom's parent (fallback)
    if (mountNode) {
      layerMount = mountNode;
    } else {
      const parent = rootContainer ?? editorDom?.parentElement ?? null;
      if (!parent) return;
      const own = document.createElement('div');
      own.setAttribute('data-ok-interaction-layer', '');
      parent.appendChild(own);
      layerMount = own;
    }
    // Lazy dynamic import avoids pulling react-dom's `createRoot` into the
    // module graph for pure-logic consumers (tests). In production this is
    // a same-tick resolve so there's no first-mount delay.
    void import('react-dom/client').then((mod) => {
      // Guard against destroy() racing the dynamic import: layerMount is
      // cleared in destroy() so we check here.
      if (!layerMount) return;
      const root = mod.createRoot(layerMount);
      root.render(createPortal(<InteractionLayerRoot store={store} />, layerMount));
      reactRoot = root;
    });
  };

  // Initial attach (deferred if DOM not ready).
  attachListeners();
  mountReactRoot();

  return {
    register(p) {
      store.register(p);
      // Re-try attach in case the DOM became available since construction.
      if (!clickListenerAttached) attachListeners();
      if (!reactRoot) mountReactRoot();
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
      if (reactRoot) {
        try {
          reactRoot.unmount();
        } catch {
          // React already torn down — safe to ignore.
        }
        reactRoot = null;
      }
      // Remove our own mount node (don't destroy a caller-provided mountNode).
      if (layerMount && !mountNode) {
        try {
          layerMount.parentElement?.removeChild(layerMount);
        } catch {
          // detached already
        }
      }
      layerMount = null;
      store.clear();
    },
  };
}
