/**
 * V2 editor cache — module-level `Map<docName, Entry>` that survives React
 * unmount, SPA navigation, Activity mode flips, StrictMode double-invoke, HMR.
 *
 * Contract (US-001, V2 spec §9.1, §10 D3 / precedent #18(g)/(h)):
 *
 *   mount{Tiptap,Cm}Editor({ docName, container, factory })
 *     — CACHE HIT: reparent editor.editorView.dom / view.dom into `container`,
 *       restore scrollTop + focus, set activeMountKey = docName.
 *     — CACHE MISS: factory(container) constructs a fresh editor that mounts
 *       itself into container; the returned tuple is cached.
 *     — CACHE_ENABLED=false: always calls factory, never caches (pre-V2 path).
 *
 *   park{Tiptap,Cm}Editor(entry)
 *     — detach DOM from parent, capture scrollTop, clear activeMountKey.
 *       NEVER destroys. Editor keeps running — local Y.js observers still
 *       fire, plugin state survives, only DOM painting stops.
 *     — CACHE_ENABLED=false: destroys (restores pre-V2 destroy-on-unmount
 *       semantic — the consumer's cleanup path still runs).
 *
 *   evict{Tiptap,Cm}Editor(docName)
 *     — THE ONLY PATH that calls editor.destroy() / view.destroy() /
 *       provider.destroy() / ydoc.destroy(). Called on LRU eviction
 *       (MAX_CACHE) or explicit tear-down.
 *
 * Why raw `editor.editorView.dom` reparent and NOT `Editor.mount()/unmount()`:
 *   @tiptap/extension-drag-handle@4.x captures the `editor` ref in a plugin
 *   closure, reads `editor.view.dom.parentElement` from the `view(view)`
 *   lifecycle callback, and hits TipTap's throwing-proxy during the
 *   re-create path (the proxy throws while the new `EditorView` is
 *   mid-construction). See `specs/2026-04-20-perf-v2-editor-cache-and-cold-
 *   load-ux/evidence/tiptap-reparent-probe.md` §3 for the full stack trace
 *   + source-level root cause. V2 SPEC §16 STOP rule: this module MUST NOT
 *   call `editor.mount()` / `editor.unmount()`.
 *
 * Why CM6 uses the symmetric pattern: `EditorView.setRoot()` is only needed
 *   for cross-Document reparent (iframe/ShadowRoot); within-Document reparent
 *   needs no API call at all — W3C DOM observers (Mutation / Resize /
 *   Intersection) survive reparent by spec. H1 probe 12/12 pass. Full
 *   contract in `evidence/cm6-reparent-contract.md`.
 *
 * FR15 emergency kill switch: flip `CACHE_ENABLED = false` at this module's
 *   top, redeploy. mount() short-circuits to factory-only (no storage);
 *   park() destroys immediately. This is NOT a feature flag — no config
 *   system, no rollout percentage, no user targeting. One-line edit for
 *   fire-drill rollback during a production incident.
 */

import type { EditorView } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Editor } from '@tiptap/core';
import type * as Y from 'yjs';
import { mark } from '@/lib/perf';

/**
 * Emergency kill switch. When `false`:
 *   - mount() does NOT cache; always calls factory()
 *   - park() destroys immediately (pre-V2 destroy-on-unmount behavior)
 *   - evict() remains safe but has fewer entries to evict
 *
 * Greenfield directive: NOT a feature flag. Flipping this is a 1-line
 * code edit + normal deploy. Reserved for production incident response.
 */
export const CACHE_ENABLED = true;

/**
 * Maximum number of cached editor instances per kind (TipTap / CM6),
 * enforced via LRU eviction. Coupled to ACTIVITY_MOUNT_LIMIT=3
 * (EditorActivityPool) + MAX_POOL=10 (ProviderPool). Changing this is an
 * ASK_FIRST per V2 SPEC §16.
 */
export const MAX_CACHE = 10;

/**
 * FR3 primary gate: view-count threshold above which a doc refuses to cache.
 * Derived from `grey-zone-and-prod-floor.md` §Part A scaling fit:
 * ~2 ms / view marginal cost × 50 views ≈ 100 ms CPW delta — comfortably
 * within the "Acceptable" band. Keeps V2 savings targeted at docs where
 * the editor can actually be cached cheaply; multi-hundred-view docs
 * fall through to pre-V2 destroy-on-unmount behavior (no cache bloat).
 */
export const VIEW_COUNT_CACHE_THRESHOLD = 50;

/**
 * FR3 secondary gate: byte-count threshold for multi-MB prose-only docs
 * whose view counts are low but whose raw size would still inflate the
 * cache's memory footprint. Matches the existing LARGE_DOC_CHAR_THRESHOLD
 * in `EditorActivityPool`.
 */
export const BYTES_CACHE_THRESHOLD = 500_000;

/** Per-doc size stats captured at mount time to decide whether to cache. */
export interface SizeStats {
  /** Count of React MarkView/NodeView targets in the editor at parse time. */
  viewCount: number;
  /** Y.Text byte-length at mount time (used as a proxy for on-disk size). */
  bytes: number;
}

/**
 * FR3 gate: evaluated ONCE at mount time. Entry is tagged `__uncached`
 * when this returns false, so all later park/evict/LRU transitions
 * correctly skip caching operations for the entry.
 *
 * Post-mount size changes (user edits push viewCount past 50) do NOT
 * evict an already-cached entry. Eviction is purely LRU-driven per
 * V2 SPEC §6 FR3 — "gate evaluated ONCE at mount time".
 */
export function shouldCacheEditor(stats: SizeStats): boolean {
  if (stats.viewCount >= VIEW_COUNT_CACHE_THRESHOLD) return false;
  if (stats.bytes > BYTES_CACHE_THRESHOLD) return false;
  return true;
}

/** TipTap editor cache entry. */
export interface TiptapCacheEntry {
  editor: Editor;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
  /**
   * Container-level `scrollTop` captured at park time, restored at mount
   * time. Preserves the user's reading position across Activity mode flips.
   */
  scrollTop: number;
  /**
   * The docName whose mount is currently displaying this editor. Null when
   * parked. Consumers reading editor state from non-render contexts (async
   * callbacks, extension handlers) MUST guard on
   * `entry.activeMountKey === currentDocName` (WARN rule in CLAUDE.md
   * §Architectural precedents — editor outlives React subtree under V2).
   */
  activeMountKey: string | null;
  /**
   * Set when CACHE_ENABLED=false at mount time. park() destroys this entry
   * instead of parking. Production flips it back to absent by flipping
   * CACHE_ENABLED back to true at module top.
   */
  __uncached?: boolean;
}

/** CodeMirror 6 cache entry. */
export interface CmCacheEntry {
  view: EditorView;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
  scrollTop: number;
  activeMountKey: string | null;
  __uncached?: boolean;
}

/** Factory result for TipTap — consumer builds the editor bound to container. */
export interface TiptapFactoryResult {
  editor: Editor;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
}

export type TiptapFactory = (container: HTMLElement) => TiptapFactoryResult;

/** Factory result for CM6. */
export interface CmFactoryResult {
  view: EditorView;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
}

export type CmFactory = (container: HTMLElement) => CmFactoryResult;

export interface MountTiptapParams {
  docName: string;
  container: HTMLElement;
  factory: TiptapFactory;
  /**
   * Size stats at mount time. When provided and `shouldCacheEditor` returns
   * false, the returned entry is `__uncached: true` — park() will destroy
   * it rather than stashing it in the cache (FR3 pre-V2 fallthrough).
   * When omitted, the editor enters the cache unconditionally (legacy path
   * for callers that don't measure size).
   */
  sizeStats?: SizeStats;
}

export interface MountCmParams {
  docName: string;
  container: HTMLElement;
  factory: CmFactory;
  sizeStats?: SizeStats;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const tiptapCache = new Map<string, TiptapCacheEntry>();
const cmCache = new Map<string, CmCacheEntry>();

/** LRU order — most-recently-used at the END; oldest at index 0. */
const tiptapLru: string[] = [];
const cmLru: string[] = [];

/**
 * Shared activity-mount list across TipTap + CM caches. Single source of
 * truth for "which cached docs are currently Activity-visible." The
 * consumer (EditorActivityPool, US-008) computes the list as the top
 * ACTIVITY_MOUNT_LIMIT MRU entries and calls setActivityMountList on
 * every change.
 *
 * FR3b — Activity-hidden observer CPU cap:
 *   Cached docs NOT in this list have their HocuspocusProvider
 *   disconnected so peer CRDT updates stop arriving. Local Y.js observers
 *   still fire (Y.Doc-driven), preserving user-local edit UX. When a doc
 *   is re-promoted into the list, we reconnect the provider.
 *
 * Providers are shared between TipTap + CM entries for the same docName
 * (ProviderPool owns the provider; both caches hold refs). So this
 * tracking is keyed by docName, not by entry kind.
 */
let activityMountList: ReadonlySet<string> = new Set();

/**
 * Lazy detached parking node. Keeps the detached DOM reachable (helps W3C
 * observers retain their subscriptions without any inconvenience) without
 * painting it. Created on first park when `document.createElement` is
 * available. In test environments without a DOM (pure Bun unit test),
 * detached-orphan mode is used — H1 probe test 11 empirically validates
 * this works (MutationObserver subscriptions survive fully orphan DOM).
 */
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

// ---------------------------------------------------------------------------
// TipTap API
// ---------------------------------------------------------------------------

/**
 * Mount the editor for `docName` into `container`. On cache hit, reparents
 * the existing DOM via raw `editor.editorView.dom` reparent (per Phase 1.0
 * probe §5.1). On cache miss, calls `factory(container)` to construct a
 * fresh editor.
 *
 * When CACHE_ENABLED=false: always constructs via factory, never caches.
 * The returned entry carries `__uncached: true` so park() destroys it.
 */
export function mountTiptapEditor(params: MountTiptapParams): TiptapCacheEntry {
  const { docName, container, factory, sizeStats } = params;

  // Size gate + kill-switch — either path returns an __uncached entry so
  // park() destroys it (pre-V2 destroy-on-unmount behavior).
  const gateRefuses = sizeStats ? !shouldCacheEditor(sizeStats) : false;
  if (!CACHE_ENABLED || gateRefuses) {
    const fresh = factory(container);
    mark('ok/cache/miss', {
      docName,
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
      activeMountKey: docName,
      __uncached: true,
    };
  }

  const existing = tiptapCache.get(docName);
  if (existing) {
    reparentTiptapDom(existing, container);
    existing.activeMountKey = docName;
    touchLru(tiptapLru, docName);
    // Restore scroll AFTER DOM is re-attached (scrollTop on detached nodes
    // is a no-op in real browsers).
    container.scrollTop = existing.scrollTop;
    try {
      existing.editor.commands.focus();
    } catch {
      // Editor may be mid-transition or destroyed; focus is best-effort.
    }
    mark('ok/cache/hit', { docName, kind: 'tiptap' });
    return existing;
  }

  // Cache miss — enforce capacity BEFORE inserting the new entry so the
  // new entry never races against its own eviction.
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
    activeMountKey: docName,
  };
  tiptapCache.set(docName, entry);
  touchLru(tiptapLru, docName);
  mark('ok/cache/miss', {
    docName,
    viewCount: sizeStats?.viewCount ?? -1,
    bytes: sizeStats?.bytes ?? -1,
    reason: 'cold',
    kind: 'tiptap',
  });
  return entry;
}

/**
 * Park the editor: detach DOM from its current parent, capture scrollTop,
 * clear activeMountKey. Editor instance is preserved in the cache.
 *
 * When CACHE_ENABLED=false (or entry is __uncached): destroys the editor
 * immediately, restoring pre-V2 destroy-on-unmount semantics.
 */
export function parkTiptapEditor(entry: TiptapCacheEntry): void {
  if (!CACHE_ENABLED || entry.__uncached) {
    // Kill-switch / uncached fallthrough: destroy the editor now. Provider
    // + ydoc are NOT destroyed — they're owned by the ProviderPool which
    // has its own eviction logic.
    try {
      entry.editor.destroy();
    } catch {
      // already destroyed or proxy is in a throwing state — safe to ignore
    }
    entry.activeMountKey = null;
    return;
  }

  const view = getTiptapEditorView(entry.editor);
  if (view) {
    const scrollSrc = view.scrollDOM ?? view.dom.parentElement ?? view.dom;
    entry.scrollTop = (scrollSrc as HTMLElement).scrollTop ?? 0;
    const parent = view.dom.parentElement;
    if (parent) {
      parent.removeChild(view.dom);
    }
    // Attach to detached parking node if one can be created (keeps DOM
    // observers subscribed with slightly less churn than a fully-orphan
    // node, per cm6-reparent-contract §6 / H1 probe).
    const park = tryGetParkingNode();
    if (park) {
      park.appendChild(view.dom);
    }
  }

  entry.activeMountKey = null;
}

/**
 * Evict the editor for `docName` — THE ONLY path that calls destroy()
 * on the editor / provider / ydoc. Safe no-op if docName is not cached.
 * Returns true if an entry was destroyed, false otherwise.
 */
export function evictTiptapEditor(docName: string): boolean {
  const entry = tiptapCache.get(docName);
  if (!entry) return false;

  try {
    entry.editor.destroy();
  } catch {
    // proxy-throwing state during mid-teardown is acceptable here
  }
  try {
    entry.provider.destroy();
  } catch {
    // provider may already be in tear-down
  }
  try {
    entry.ydoc.destroy();
  } catch {
    // ydoc.destroy is idempotent in practice but defensive try/catch is cheap
  }

  tiptapCache.delete(docName);
  const lruIdx = tiptapLru.indexOf(docName);
  if (lruIdx !== -1) tiptapLru.splice(lruIdx, 1);
  mark('ok/cache/evict', { docName, kind: 'tiptap' });
  return true;
}

// ---------------------------------------------------------------------------
// CodeMirror 6 API — symmetric to TipTap
// ---------------------------------------------------------------------------

/**
 * Mount the CM6 editor for `docName` into `container`. On cache hit,
 * reparents the existing `view.dom` (H1 probe 12/12 pass). On cache miss,
 * calls `factory(container)` to construct a fresh `EditorView`.
 *
 * When CACHE_ENABLED=false: always constructs via factory, never caches.
 */
export function mountCmEditor(params: MountCmParams): CmCacheEntry {
  const { docName, container, factory, sizeStats } = params;

  const gateRefuses = sizeStats ? !shouldCacheEditor(sizeStats) : false;
  if (!CACHE_ENABLED || gateRefuses) {
    const fresh = factory(container);
    mark('ok/cache/miss', {
      docName,
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
      activeMountKey: docName,
      __uncached: true,
    };
  }

  const existing = cmCache.get(docName);
  if (existing) {
    reparentCmDom(existing, container);
    existing.activeMountKey = docName;
    touchLru(cmLru, docName);
    container.scrollTop = existing.scrollTop;
    try {
      existing.view.focus();
    } catch {
      // best-effort focus
    }
    mark('ok/cache/hit', { docName, kind: 'cm' });
    return existing;
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
    activeMountKey: docName,
  };
  cmCache.set(docName, entry);
  touchLru(cmLru, docName);
  mark('ok/cache/miss', {
    docName,
    viewCount: sizeStats?.viewCount ?? -1,
    bytes: sizeStats?.bytes ?? -1,
    reason: 'cold',
    kind: 'cm',
  });
  return entry;
}

/**
 * Park the CM6 editor — detach `view.dom`, save scrollTop, clear
 * activeMountKey. Does NOT call `view.destroy()`.
 */
export function parkCmEditor(entry: CmCacheEntry): void {
  if (!CACHE_ENABLED || entry.__uncached) {
    try {
      entry.view.destroy();
    } catch {
      // safe to ignore — already destroyed etc.
    }
    entry.activeMountKey = null;
    return;
  }

  const dom = entry.view.dom;
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

/**
 * Evict the CM6 editor — THE ONLY path that calls view.destroy() /
 * provider.destroy() / ydoc.destroy().
 */
export function evictCmEditor(docName: string): boolean {
  const entry = cmCache.get(docName);
  if (!entry) return false;

  try {
    entry.view.destroy();
  } catch {
    // safe to ignore
  }
  try {
    entry.provider.destroy();
  } catch {
    // safe to ignore
  }
  try {
    entry.ydoc.destroy();
  } catch {
    // safe to ignore
  }

  cmCache.delete(docName);
  const lruIdx = cmLru.indexOf(docName);
  if (lruIdx !== -1) cmLru.splice(lruIdx, 1);
  mark('ok/cache/evict', { docName, kind: 'cm' });
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * TipTap exposes `view` as a throwing proxy pre-mount; `editorView` is the
 * non-throwing private ref. Code that reads DOM state from arbitrary
 * contexts (async callbacks, extension lifecycle, Activity flips) MUST go
 * through this accessor — see CLAUDE.md WARN rule at §Markdown pipeline.
 */
function getTiptapEditorView(editor: Editor): { dom: HTMLElement; scrollDOM?: HTMLElement } | null {
  const view = (editor as unknown as { editorView?: { dom: HTMLElement; scrollDOM?: HTMLElement } })
    .editorView;
  return view ?? null;
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

/**
 * Find the oldest entry in `lru` that is NOT the one being mounted AND
 * NOT currently Activity-mounted. Returns null if no evictable candidate
 * exists (rare in practice — MAX_CACHE=10 with ACTIVITY_MOUNT_LIMIT=3
 * always leaves 7 parkable slots).
 *
 * If every entry is Activity-mounted (edge case: user somehow navigated
 * to more tabs than the limit without setActivityMountList being called),
 * fall back to pure-LRU ordering so capacity enforcement isn't blocked.
 */
function findEvictable(lru: string[], mountingDocName: string): string | null {
  // Prefer NON-active evictees.
  for (const docName of lru) {
    if (docName === mountingDocName) continue;
    if (activityMountList.has(docName)) continue;
    return docName;
  }
  // Degenerate fallback — pure LRU.
  for (const docName of lru) {
    if (docName === mountingDocName) continue;
    return docName;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Activity-mount list + FR3b provider connect/disconnect
// ---------------------------------------------------------------------------

/**
 * Update the activity-mount list. Any cached editor whose docName was in
 * the previous list but is NOT in the new list has its HocuspocusProvider
 * disconnected (peer CRDT updates stop arriving — FR3b observer CPU cap).
 * Any docName newly promoted from hidden → active has its provider
 * reconnected.
 *
 * Single-writer API: called by `EditorActivityPool` on every
 * `computeActivityMountList` change (US-008 integration).
 *
 * Transitions are keyed by docName because the HocuspocusProvider is
 * shared across the TipTap + CM cache entries for a given doc (owned
 * by ProviderPool). Connect/disconnect fires at most once per doc per
 * transition, regardless of which/how-many cache kinds hold a ref.
 */
export function setActivityMountList(docNames: readonly string[]): void {
  const prev = activityMountList;
  const next = new Set(docNames);

  // Demotion — fired for docs that were active, now aren't.
  for (const docName of prev) {
    if (next.has(docName)) continue;
    const provider = findProvider(docName);
    if (!provider) continue;
    try {
      provider.disconnect();
    } catch {
      // provider may already be in tear-down — safe to ignore
    }
    mark('ok/cache/disconnect', { docName });
  }

  // Promotion — fired for docs that are newly active.
  for (const docName of next) {
    if (prev.has(docName)) continue;
    const provider = findProvider(docName);
    if (!provider) continue;
    try {
      // connect() returns a Promise but we don't await; sync happens
      // asynchronously and the existing `'synced'` listener will re-run
      // setupObservers' initialization idempotently.
      void provider.connect();
    } catch {
      // provider may be destroyed — safe to ignore
    }
    mark('ok/cache/connect', { docName });
  }

  activityMountList = next;
}

/** Lookup the provider for a docName via either cache (they share the ref). */
function findProvider(docName: string): HocuspocusProvider | null {
  const tip = tiptapCache.get(docName);
  if (tip) return tip.provider;
  const cm = cmCache.get(docName);
  if (cm) return cm.provider;
  return null;
}

// ---------------------------------------------------------------------------
// Test helpers (not part of production API)
// ---------------------------------------------------------------------------

/** Test-only: total cache size for one kind. */
export function __getCacheSize(kind: 'tiptap' | 'cm'): number {
  return kind === 'tiptap' ? tiptapCache.size : cmCache.size;
}

/** Test-only: LRU order (oldest first) for one kind. */
export function __getCacheOrder(kind: 'tiptap' | 'cm'): string[] {
  return kind === 'tiptap' ? [...tiptapLru] : [...cmLru];
}

/** Test-only: inspect a cached entry by name. */
export function __peekTiptap(docName: string): TiptapCacheEntry | undefined {
  return tiptapCache.get(docName);
}

export function __peekCm(docName: string): CmCacheEntry | undefined {
  return cmCache.get(docName);
}

/** Test-only: inspect the current activity mount list. */
export function __getActivityMountList(): string[] {
  return [...activityMountList];
}

/** Test-only: reset all cache state. Destroys live entries. */
export function __resetCache(): void {
  for (const docName of [...tiptapCache.keys()]) evictTiptapEditor(docName);
  for (const docName of [...cmCache.keys()]) evictCmEditor(docName);
  activityMountList = new Set();
  // parking node lives on — it's a plain detached div with no listeners.
}
