import type { EditorView } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Editor } from '@tiptap/core';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { mark } from '@/lib/perf';
import { readNumericOverride } from '@/lib/perf/env-override';
import { getMountId } from './mount-id-registry';
import { invalidateMountPromise } from './mount-promise';

export function readEditorUndoManager(editor: Editor): { restore?: unknown } | null {
  try {
    const state = editor.state;
    const pluginState = yUndoPluginKey.getState(state) as
      | { undoManager?: { restore?: unknown } }
      | null
      | undefined;
    return pluginState?.undoManager ?? null;
  } catch (err) {
    mark('ok/cache/undo-manager-read-failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export const CACHE_ENABLED = true;

export const MAX_CACHE = readNumericOverride('MAX_CACHE', 10);

export const VIEW_COUNT_CACHE_THRESHOLD = readNumericOverride('VIEW_COUNT_CACHE_THRESHOLD', 50);

export const BYTES_CACHE_THRESHOLD = readNumericOverride('BYTES_CACHE_THRESHOLD', 8_000_000);

interface SizeStats {
  viewCount: number;
  bytes: number;
}

export function shouldCacheEditor(stats: SizeStats): boolean {
  if (stats.viewCount > 0 && stats.viewCount >= VIEW_COUNT_CACHE_THRESHOLD) return false;
  if (stats.bytes > BYTES_CACHE_THRESHOLD) return false;
  return true;
}

export interface TiptapCacheEntry {
  editor: Editor;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
  scrollTop: number;
  hadFocus: boolean;
  activeMountKey: string | null;
  __uncached?: boolean;
}

export interface CmCacheEntry {
  view: EditorView;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
  scrollTop: number;
  hadFocus: boolean;
  activeMountKey: string | null;
  __uncached?: boolean;
}

interface TiptapFactoryResult {
  editor: Editor;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
}

type TiptapFactory = (container: HTMLElement) => TiptapFactoryResult;

interface CmFactoryResult {
  view: EditorView;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
}

type CmFactory = (container: HTMLElement) => CmFactoryResult;

interface MountTiptapParams {
  docName: string;
  container: HTMLElement;
  factory: TiptapFactory;
  sizeStats?: SizeStats;
}

interface MountCmParams {
  docName: string;
  container: HTMLElement;
  factory: CmFactory;
  sizeStats?: SizeStats;
}

const tiptapCache = new Map<string, TiptapCacheEntry>();
const cmCache = new Map<string, CmCacheEntry>();

const tiptapLru: string[] = [];
const cmLru: string[] = [];

let activityMountList: ReadonlySet<string> = new Set();

let _parkingNode: HTMLElement | null = null;

function tryGetParkingNode(): HTMLElement | null {
  if (_parkingNode) return _parkingNode;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  const el = document.createElement('div');
  el.setAttribute('data-ok-editor-parking', '');
  el.style.display = 'none';
  el.style.position = 'absolute';
  el.style.left = '-99999px';
  _parkingNode = el;
  return el;
}

export function mountTiptapEditor(params: MountTiptapParams): TiptapCacheEntry {
  const { docName, container, factory, sizeStats } = params;

  const gateRefuses = sizeStats ? !shouldCacheEditor(sizeStats) : false;
  if (!CACHE_ENABLED || gateRefuses) {
    const fresh = factory(container);
    mark('ok/cache/miss', {
      docName,
      mountId: getMountId(docName),
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
      reason: !CACHE_ENABLED ? 'kill-switch' : 'size-gate',
    });
    return {
      editor: fresh.editor,
      ydoc: fresh.ydoc,
      ytext: fresh.ytext,
      provider: fresh.provider,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: docName,
      __uncached: true,
    };
  }

  const reuse = tiptapCache.get(docName);
  if (reuse) {
    mark('ok/cache/reparent-start', {
      docName,
      mountId: getMountId(docName),
      kind: 'tiptap',
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
    });
    reparentTiptapDom(reuse, container);
    reuse.activeMountKey = docName;
    touchLru(tiptapLru, docName);
    container.scrollTop = reuse.scrollTop;
    if (reuse.hadFocus) {
      try {
        reuse.editor.commands.focus();
      } catch {}
    }
    mark('ok/cache/reparent-end', {
      docName,
      mountId: getMountId(docName),
      kind: 'tiptap',
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
    });
    mark('ok/cache/hit', { docName, mountId: getMountId(docName), kind: 'tiptap' });
    if (sizeStats) {
      mark('ok/cold/editor-mount-stats', {
        docName,
        mountId: getMountId(docName),
        viewCount: sizeStats.viewCount,
        bytes: sizeStats.bytes,
        cacheHit: true,
        kind: 'tiptap',
      });
    }
    return reuse;
  }

  while (tiptapCache.size >= MAX_CACHE) {
    const oldest = findEvictable(tiptapLru, docName);
    if (!oldest) break;
    evictTiptapEditor(oldest);
  }

  const fresh = factory(container);
  const entry: TiptapCacheEntry = {
    editor: fresh.editor,
    ydoc: fresh.ydoc,
    ytext: fresh.ytext,
    provider: fresh.provider,
    scrollTop: 0,
    hadFocus: false,
    activeMountKey: docName,
  };
  tiptapCache.set(docName, entry);
  touchLru(tiptapLru, docName);
  mark('ok/cache/miss', {
    docName,
    mountId: getMountId(docName),
    viewCount: sizeStats?.viewCount ?? -1,
    bytes: sizeStats?.bytes ?? -1,
    reason: 'cold',
    kind: 'tiptap',
  });
  if (sizeStats) {
    mark('ok/cold/editor-mount-stats', {
      docName,
      mountId: getMountId(docName),
      viewCount: sizeStats.viewCount,
      bytes: sizeStats.bytes,
      cacheHit: false,
      kind: 'tiptap',
    });
  }
  return entry;
}

export function parkTiptapEditor(entry: TiptapCacheEntry): void {
  const docName = entry.activeMountKey;
  if (!CACHE_ENABLED || entry.__uncached) {
    if (docName) {
      invalidateMountPromise(docName);
    }
    const undoManager = readEditorUndoManager(entry.editor);
    try {
      entry.editor.destroy();
    } catch (err) {
      mark('ok/cache/park-destroy-failed', {
        docName: docName ?? '',
        kind: 'tiptap',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (undoManager) {
      undoManager.restore = undefined;
    }
    entry.activeMountKey = null;
    return;
  }

  const view = getTiptapEditorView(entry.editor);
  if (view) {
    entry.hadFocus = computeHadFocus(view.dom);
    const scrollSrc = view.scrollDOM ?? view.dom.parentElement ?? view.dom;
    entry.scrollTop = (scrollSrc as HTMLElement).scrollTop ?? 0;
    const parent = view.dom.parentElement;
    if (parent) {
      parent.removeChild(view.dom);
    }
    const park = tryGetParkingNode();
    if (park) {
      park.appendChild(view.dom);
    }
  }

  entry.activeMountKey = null;
}

export function evictTiptapEditor(docName: string): boolean {
  invalidateMountPromise(docName);
  const entry = tiptapCache.get(docName);
  if (!entry) return false;

  const undoManager = readEditorUndoManager(entry.editor);
  try {
    entry.editor.destroy();
  } catch (err) {
    mark('ok/cache/evict-failed', {
      docName,
      kind: 'tiptap',
      stage: 'editor',
      message: err instanceof Error ? err.message : String(err),
    });
  }
  if (undoManager) {
    undoManager.restore = undefined;
  }
  try {
    entry.provider.destroy();
  } catch (err) {
    mark('ok/cache/evict-failed', {
      docName,
      kind: 'tiptap',
      stage: 'provider',
      message: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    entry.ydoc.destroy();
  } catch (err) {
    mark('ok/cache/evict-failed', {
      docName,
      kind: 'tiptap',
      stage: 'ydoc',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  tiptapCache.delete(docName);
  const lruIdx = tiptapLru.indexOf(docName);
  if (lruIdx !== -1) tiptapLru.splice(lruIdx, 1);
  mark('ok/cache/evict', { docName, kind: 'tiptap' });
  return true;
}

export function mountCmEditor(params: MountCmParams): CmCacheEntry {
  const { docName, container, factory, sizeStats } = params;

  const gateRefuses = sizeStats ? !shouldCacheEditor(sizeStats) : false;
  if (!CACHE_ENABLED || gateRefuses) {
    const fresh = factory(container);
    mark('ok/cache/miss', {
      docName,
      mountId: getMountId(docName),
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
      reason: !CACHE_ENABLED ? 'kill-switch' : 'size-gate',
      kind: 'cm',
    });
    return {
      view: fresh.view,
      ydoc: fresh.ydoc,
      ytext: fresh.ytext,
      provider: fresh.provider,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: docName,
      __uncached: true,
    };
  }

  const reuse = cmCache.get(docName);
  if (reuse) {
    mark('ok/cache/reparent-start', {
      docName,
      mountId: getMountId(docName),
      kind: 'cm',
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
    });
    reparentCmDom(reuse, container);
    reuse.activeMountKey = docName;
    touchLru(cmLru, docName);
    container.scrollTop = reuse.scrollTop;
    if (reuse.hadFocus) {
      try {
        reuse.view.focus();
      } catch {}
    }
    mark('ok/cache/reparent-end', {
      docName,
      mountId: getMountId(docName),
      kind: 'cm',
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
    });
    mark('ok/cache/hit', { docName, mountId: getMountId(docName), kind: 'cm' });
    if (sizeStats) {
      mark('ok/cold/editor-mount-stats', {
        docName,
        mountId: getMountId(docName),
        viewCount: sizeStats.viewCount,
        bytes: sizeStats.bytes,
        cacheHit: true,
        kind: 'cm',
      });
    }
    return reuse;
  }

  while (cmCache.size >= MAX_CACHE) {
    const oldest = findEvictable(cmLru, docName);
    if (!oldest) break;
    evictCmEditor(oldest);
  }

  const fresh = factory(container);
  const entry: CmCacheEntry = {
    view: fresh.view,
    ydoc: fresh.ydoc,
    ytext: fresh.ytext,
    provider: fresh.provider,
    scrollTop: 0,
    hadFocus: false,
    activeMountKey: docName,
  };
  cmCache.set(docName, entry);
  touchLru(cmLru, docName);
  mark('ok/cache/miss', {
    docName,
    mountId: getMountId(docName),
    viewCount: sizeStats?.viewCount ?? -1,
    bytes: sizeStats?.bytes ?? -1,
    reason: 'cold',
    kind: 'cm',
  });
  if (sizeStats) {
    mark('ok/cold/editor-mount-stats', {
      docName,
      mountId: getMountId(docName),
      viewCount: sizeStats.viewCount,
      bytes: sizeStats.bytes,
      cacheHit: false,
      kind: 'cm',
    });
  }
  return entry;
}

export function parkCmEditor(entry: CmCacheEntry): void {
  if (!CACHE_ENABLED || entry.__uncached) {
    try {
      entry.view.destroy();
    } catch (err) {
      mark('ok/cache/park-destroy-failed', {
        docName: entry.activeMountKey ?? '',
        kind: 'cm',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    entry.activeMountKey = null;
    return;
  }

  const dom = entry.view.dom;
  entry.hadFocus = computeHadFocus(dom as HTMLElement);
  const scrollSrc = entry.view.scrollDOM ?? dom;
  entry.scrollTop = (scrollSrc as HTMLElement).scrollTop ?? 0;
  const parent = dom.parentElement;
  if (parent) {
    parent.removeChild(dom);
  }
  const park = tryGetParkingNode();
  if (park) {
    park.appendChild(dom);
  }
  entry.activeMountKey = null;
}

export function evictCmEditor(docName: string): boolean {
  const entry = cmCache.get(docName);
  if (!entry) return false;

  try {
    entry.view.destroy();
  } catch (err) {
    mark('ok/cache/evict-failed', {
      docName,
      kind: 'cm',
      stage: 'view',
      message: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    entry.provider.destroy();
  } catch (err) {
    mark('ok/cache/evict-failed', {
      docName,
      kind: 'cm',
      stage: 'provider',
      message: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    entry.ydoc.destroy();
  } catch (err) {
    mark('ok/cache/evict-failed', {
      docName,
      kind: 'cm',
      stage: 'ydoc',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  cmCache.delete(docName);
  const lruIdx = cmLru.indexOf(docName);
  if (lruIdx !== -1) cmLru.splice(lruIdx, 1);
  mark('ok/cache/evict', { docName, kind: 'cm' });
  return true;
}

function getTiptapEditorView(editor: Editor): { dom: HTMLElement; scrollDOM?: HTMLElement } | null {
  const view = (editor as unknown as { editorView?: { dom: HTMLElement; scrollDOM?: HTMLElement } })
    .editorView;
  return view ?? null;
}

function computeHadFocus(root: HTMLElement): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  if (!active) return false;
  if (active === root) return true;
  return root.contains(active);
}

function reparentTiptapDom(entry: TiptapCacheEntry, container: HTMLElement): void {
  const view = getTiptapEditorView(entry.editor);
  if (!view) return;
  const dom = view.dom;
  const prevParent = dom.parentElement;
  if (prevParent && prevParent !== container) {
    prevParent.removeChild(dom);
  }
  if (dom.parentElement !== container) {
    container.appendChild(dom);
  }
}

function reparentCmDom(entry: CmCacheEntry, container: HTMLElement): void {
  const dom = entry.view.dom;
  const prevParent = dom.parentElement;
  if (prevParent && prevParent !== container) {
    prevParent.removeChild(dom);
  }
  if (dom.parentElement !== container) {
    container.appendChild(dom);
  }
}

function touchLru(lru: string[], docName: string): void {
  const idx = lru.indexOf(docName);
  if (idx !== -1) lru.splice(idx, 1);
  lru.push(docName);
}

function findEvictable(lru: string[], mountingDocName: string): string | null {
  for (const docName of lru) {
    if (docName === mountingDocName) continue;
    if (activityMountList.has(docName)) continue;
    return docName;
  }
  mark('ok/cache/evict-fallback-activity-saturated', {
    mountingDocName,
    lruLength: lru.length,
    activityMountCount: activityMountList.size,
  });
  for (const docName of lru) {
    if (docName === mountingDocName) continue;
    return docName;
  }
  return null;
}

export function setActivityMountList(docNames: readonly string[]): void {
  const prev = activityMountList;
  const next = new Set(docNames);

  for (const docName of prev) {
    if (next.has(docName)) continue;
    const provider = findProvider(docName);
    if (!provider) continue;
    try {
      provider.disconnect();
      mark('ok/cache/disconnect', { docName });
    } catch (err) {
      mark('ok/cache/disconnect-failed', {
        docName,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const docName of next) {
    if (prev.has(docName)) continue;
    const provider = findProvider(docName);
    if (!provider) continue;
    const emitFailed = (err: unknown): void => {
      mark('ok/cache/connect-failed', {
        docName,
        message: err instanceof Error ? err.message : String(err),
      });
    };
    try {
      const result = provider.connect();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).then(
          () => mark('ok/cache/connect', { docName }),
          (err) => emitFailed(err),
        );
      } else {
        mark('ok/cache/connect', { docName });
      }
    } catch (err) {
      emitFailed(err);
    }
  }

  activityMountList = next;
}

let activeProviderPool: {
  entries: ReadonlyMap<string, { provider: HocuspocusProvider }>;
} | null = null;

function findProvider(docName: string): HocuspocusProvider | null {
  const tip = tiptapCache.get(docName);
  if (tip) return tip.provider;
  const cm = cmCache.get(docName);
  if (cm) return cm.provider;
  if (activeProviderPool) {
    const entry = activeProviderPool.entries.get(docName);
    if (entry) return entry.provider;
  }
  return null;
}

export function subscribePoolEviction(pool: {
  onEvict: (cb: (docName: string) => void) => () => void;
  entries: ReadonlyMap<string, { provider: HocuspocusProvider }>;
}): () => void {
  activeProviderPool = pool;
  const unsubscribeEviction = pool.onEvict((docName) => {
    evictTiptapEditor(docName);
    evictCmEditor(docName);
  });
  return () => {
    unsubscribeEviction();
    if (activeProviderPool === pool) {
      activeProviderPool = null;
    }
  };
}

export function __getCacheSize(kind: 'tiptap' | 'cm'): number {
  return kind === 'tiptap' ? tiptapCache.size : cmCache.size;
}

export function __getCacheOrder(kind: 'tiptap' | 'cm'): string[] {
  return kind === 'tiptap' ? [...tiptapLru] : [...cmLru];
}

export function peekTiptap(docName: string): TiptapCacheEntry | undefined {
  return tiptapCache.get(docName);
}

export function __peekCm(docName: string): CmCacheEntry | undefined {
  return cmCache.get(docName);
}

export function __getActivityMountList(): string[] {
  return [...activityMountList];
}

export function __resetCacheForTests(): void {
  for (const docName of [...tiptapCache.keys()]) evictTiptapEditor(docName);
  for (const docName of [...cmCache.keys()]) evictCmEditor(docName);
  activityMountList = new Set();
  activeProviderPool = null;
}
