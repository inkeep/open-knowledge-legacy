import { type FC, useEffect, useState } from 'react';

interface InteractionLayerEditor {
  editorView?: { dom: HTMLElement };
  view?: { dom: HTMLElement };
}

export interface InteractionContext {
  nodeId: string;
  type: string;
  deactivate: () => void;
}

interface InteractionPrimaryContext {
  nodeId: string;
  type: string;
  newTab: boolean;
}

export interface InteractionControls {
  propPanel?: (ctx: InteractionContext) => React.ReactNode;
  toolbar?: (ctx: InteractionContext) => React.ReactNode;
  breadcrumb?: (ctx: InteractionContext) => React.ReactNode;
}

export interface RegisterParams {
  type: string;
  nodeId: string;
  getPos?: () => number | undefined;
  controls: InteractionControls;
  handlePrimary?: (ctx: InteractionPrimaryContext) => boolean | undefined;
}

export interface InteractionLayerHandle {
  register(params: RegisterParams): void;
  deregister(nodeId: string): void;
  setActiveNode(nodeId: string | null): void;
  getActiveNode(): string | null;
  getRegistration(nodeId: string): RegisterParams | undefined;
  destroy(): void;
  store: InteractionLayerStore;
}

interface CreateInteractionLayerParams {
  editor: InteractionLayerEditor;
}

interface LayerSnapshot {
  activeNodeId: string | null;
  active: RegisterParams | null;
}

type Listener = () => void;

export class InteractionLayerStore {
  private readonly registry = new Map<string, RegisterParams>();
  private _activeNodeId: string | null = null;
  private readonly listeners = new Set<Listener>();
  private _snapshot: LayerSnapshot = { activeNodeId: null, active: null };

  register(params: RegisterParams): void {
    this.registry.set(params.nodeId, params);
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

interface InteractionLayerRootProps {
  store: InteractionLayerStore;
}

const InteractionLayerRoot: FC<InteractionLayerRootProps> = ({ store }) => {
  const [snapshot, setSnapshot] = useState<LayerSnapshot>(() => store.getSnapshot());
  useEffect(() => {
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

function getEditorDom(editor: InteractionLayerEditor): HTMLElement | null {
  return editor.editorView?.dom ?? null;
}

function isPotentialChipElement(el: HTMLElement | null, nodeId: string): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (cur.getAttribute?.('data-mark-id') === nodeId) return true;
    if (cur.getAttribute?.('data-node-id') === nodeId) return true;
    cur = cur.parentElement;
  }
  return false;
}

export function createInteractionLayer(
  params: CreateInteractionLayerParams,
): InteractionLayerHandle {
  const { editor } = params;
  const store = new InteractionLayerStore();

  let editorDom: HTMLElement | null = getEditorDom(editor);
  let clickListenerAttached = false;

  let lastActivator: HTMLElement | null = null;
  const unsubscribeFocus = store.subscribe(() => {
    const activeId = store.getActiveNode();
    if (activeId !== null) {
      if (typeof document !== 'undefined') {
        const active = document.activeElement as HTMLElement | null;
        if (active && isPotentialChipElement(active, activeId)) {
          lastActivator = active;
        } else {
          lastActivator = null;
        }
      }
      return;
    }
    if (typeof document === 'undefined') return;
    const target = lastActivator;
    lastActivator = null;
    if (target && document.contains(target) && typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch {}
      return;
    }
    const dom = editorDom ?? getEditorDom(editor);
    if (dom && typeof (dom as HTMLElement).focus === 'function') {
      try {
        (dom as HTMLElement).focus({ preventScroll: true });
      } catch {}
    }
  });

  const onPointerDown = (ev: Event): void => {
    const pe = ev as PointerEvent;
    if (pe.button === 2) return;
    const isNewTabIntent = pe.metaKey || pe.ctrlKey || pe.button === 1;
    if (isNewTabIntent) {
      if (pe.button === 1) pe.preventDefault?.();
      return;
    }
    const id = resolveClickTargetNodeId(ev.target, store);
    if (id === null) return;
    const reg = store.getRegistration(id);
    if (reg?.handlePrimary) {
      const handled = reg.handlePrimary({ nodeId: id, type: reg.type, newTab: false });
      if (handled) return;
    }
    store.setActiveNode(id);
  };

  const onMouseActivate = (ev: Event): void => {
    const me = ev as MouseEvent;
    if (me.button === 2) return;
    if (me.type === 'click' && me.button === 1) return;
    const newTab = me.metaKey || me.ctrlKey || me.button === 1;
    if (!newTab) return;
    const id = resolveClickTargetNodeId(ev.target, store);
    if (id === null) return;
    const reg = store.getRegistration(id);
    if (!reg?.handlePrimary) return;
    const handled = reg.handlePrimary({ nodeId: id, type: reg.type, newTab: true });
    if (handled) me.preventDefault?.();
  };

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
    const newTab = false;
    ke.preventDefault?.();
    if (reg?.handlePrimary) {
      const handled = reg.handlePrimary({ nodeId: id, type: reg.type, newTab });
      if (handled) return;
    }
    store.setActiveNode(id);
  };
  const onOutsideClick = (ev: Event): void => {
    if (store.getActiveNode() === null) return;
    const target = ev.target as Node | null;
    if (!target) return;
    if (editorDom?.contains(target)) return; // editor-internal → handled above
    if (target instanceof Element) {
      if (target.closest('[data-ok-interaction-layer]')) return;
      if (target.closest('[data-ok-prop-panel]')) return;
      const spawnedDialog = target.closest('[data-ok-layer-spawned]');
      if (spawnedDialog) {
        return;
      }
    }
    store.setActiveNode(null);
  };

  const attachListeners = (): void => {
    if (clickListenerAttached) return;
    editorDom = getEditorDom(editor);
    if (!editorDom) return;
    editorDom.addEventListener('pointerdown', onPointerDown, true);
    editorDom.addEventListener('click', onMouseActivate, true);
    editorDom.addEventListener('auxclick', onMouseActivate, true);
    editorDom.addEventListener('keydown', onKeyDown, true);
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', onOutsideClick, true);
    }
    clickListenerAttached = true;
  };

  const detachListeners = (): void => {
    if (!clickListenerAttached) return;
    editorDom?.removeEventListener('pointerdown', onPointerDown, true);
    editorDom?.removeEventListener('click', onMouseActivate, true);
    editorDom?.removeEventListener('auxclick', onMouseActivate, true);
    editorDom?.removeEventListener('keydown', onKeyDown, true);
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', onOutsideClick, true);
    }
    clickListenerAttached = false;
  };

  attachListeners();

  return {
    register(p) {
      store.register(p);
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
      unsubscribeFocus();
      store.clear();
    },
    store,
  };
}

export const InteractionLayerView: FC<{ store: InteractionLayerStore }> = ({ store }) => {
  return (
    <div data-ok-interaction-layer="" className="contents">
      <InteractionLayerRoot store={store} />
    </div>
  );
};
