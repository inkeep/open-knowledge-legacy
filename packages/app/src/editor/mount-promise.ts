/**
 * mountTiptapEditorPromise — Suspense + `use(promise)` primitive that splits
 * TipTap's monolithic `new Editor({ element })` cold-mount task into
 * [construct → yield → mount] so the longest synchronous task drops below
 * the perception band on PROJECT-class docs.
 *
 * Mirrors precedent #18(d) (`sync-promise.ts`) shape — one Suspense-async
 * substrate for "wait for one-shot lifecycle event" across the codebase, not
 * two. Module-level `Map<docName, Entry>` cache; promise identity stable
 * across renders (React Compiler-safe — module state is out of compiler
 * scope, and `use(promise)` requires the same reference across remounts /
 * StrictMode double-invoke to avoid infinite suspension).
 *
 * Differs from `sync-promise.ts` by intentional omission: no
 * `rejectMountPromise` external-injection helper. All mount-promise failures
 * originate inside its own body (construct / yield / mount / register), so
 * the test surface that sync-promise needs for ProviderPool's
 * `BridgeSetupError` injection has no equivalent here.
 *
 * Lifecycle:
 *   - `mountTiptapEditorPromise({ docName, construct, sizeStats })`
 *     - V2 cache HIT (entry already cached): returns Promise.resolve(entry)
 *       after delegating to `mountTiptapEditor` for the reparent path. No
 *       construction, no yield, no mount() call.
 *     - V2 cache MISS: runs `construct()` → `await scheduler.yield()`
 *       (native on Chromium/Electron, polyfilled via MessageChannel →
 *       requestIdleCallback → setTimeout on Safari/Firefox) →
 *       `editor.mount(transientDiv)` → registers with V2 cache via
 *       `mountTiptapEditor` with a no-op factory → resolves with entry.
 *   - `invalidateMountPromise(docName)` removes the entry without settling
 *     the promise (matches sync-promise's invalidate semantics) AND aborts
 *     any in-flight construction via `controller.abort()` so the body
 *     destroys the pre-mount editor and rejects with `MountAbortError`.
 *
 * Cache-entry persistence — load-bearing for two correctness properties
 * (mirrors `syncPromise` lifecycle docstring rationale):
 *   1. Rejection survives React re-render so use() re-throws synchronously
 *      to DocumentErrorBoundary instead of fresh warm-path-resolving on a
 *      next render.
 *   2. Resolved entry stays in cache so repeat calls return the same
 *      reference — once React has marked it `.status='fulfilled'`,
 *      subsequent use() calls short-circuit without a Suspense cycle.
 *
 * Pre-mount editors count toward `ACTIVITY_MOUNT_LIMIT` from the moment
 * `mountTiptapEditorPromise` returns the promise — the V2 cache treats the
 * factory-return point as the activity boundary, not mount-completion. This
 * keeps the concurrent-active-editor budget bounded across the construction-
 * to-mount window.
 */

import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Editor } from '@tiptap/core';
import type * as Y from 'yjs';
import { mark } from '@/lib/perf';
import '@/lib/perf/scheduler-polyfill-shim';
import {
  mountTiptapEditor,
  peekTiptap,
  readEditorUndoManager,
  type TiptapCacheEntry,
} from './editor-cache';

interface ConstructedTiptapBundle {
  editor: Editor;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
}

interface MountTiptapEditorPromiseParams {
  docName: string;
  construct: () => ConstructedTiptapBundle;
  sizeStats?: { viewCount: number; bytes: number };
}

export class MountAbortError extends Error {
  readonly docName: string;
  constructor(docName: string) {
    super(`Mount aborted for "${docName}"`);
    this.name = 'MountAbortError';
    this.docName = docName;
  }
}

export const MOUNT_TIMEOUT_MS = 30_000;

export class MountTimeoutError extends Error {
  readonly docName: string;
  readonly elapsedMs: number;
  constructor(docName: string, elapsedMs: number) {
    super(`Mount timed out for "${docName}" after ${elapsedMs}ms`);
    this.name = 'MountTimeoutError';
    this.docName = docName;
    this.elapsedMs = elapsedMs;
  }
}

interface MountPromiseEntry {
  promise: Promise<TiptapCacheEntry>;
  rejectFn: (error: Error) => void;
  controller: AbortController;
  createdAt: number;
  settled: boolean;
  resolved: boolean;
  preMountEditor: Editor | null;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

function clearMountTimeout(entry: MountPromiseEntry): void {
  if (entry.timeoutHandle !== null) {
    clearTimeout(entry.timeoutHandle);
    entry.timeoutHandle = null;
  }
}

const cache = new Map<string, MountPromiseEntry>();

export function mountTiptapEditorPromise(
  params: MountTiptapEditorPromiseParams,
): Promise<TiptapCacheEntry> {
  const { docName, construct, sizeStats } = params;

  const existing = cache.get(docName);
  if (existing) return existing.promise;

  const controller = new AbortController();
  const createdAt = Date.now();
  let resolveFn: (entry: TiptapCacheEntry) => void = () => {};
  let rejectFn: (error: Error) => void = () => {};
  const promise = new Promise<TiptapCacheEntry>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });

  const entry: MountPromiseEntry = {
    promise,
    rejectFn,
    controller,
    createdAt,
    settled: false,
    resolved: false,
    preMountEditor: null,
    timeoutHandle: null,
  };

  entry.timeoutHandle = setTimeout(() => {
    if (entry.settled) return;
    entry.settled = true;
    const elapsed = Date.now() - entry.createdAt;
    entry.controller.abort();
    if (entry.preMountEditor) {
      destroyPreMountEditor(docName, entry.preMountEditor, 'timeout');
      entry.preMountEditor = null;
    }
    cache.delete(docName);
    mark('ok/mount/reject', { docName, reason: 'timeout', elapsedMs: elapsed });
    rejectFn(new MountTimeoutError(docName, elapsed));
  }, MOUNT_TIMEOUT_MS);

  cache.set(docName, entry);
  mark('ok/mount/create', { docName });

  runMountBody({
    docName,
    construct,
    sizeStats,
    entry,
    resolveFn,
    rejectFn,
  }).catch((err) => {
    if (entry.preMountEditor) {
      destroyPreMountEditor(docName, entry.preMountEditor, 'backstop');
      entry.preMountEditor = null;
    }
    if (entry.settled) {
      mark('ok/mount/post-settle-throw', {
        docName,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    entry.settled = true;
    clearMountTimeout(entry);
    const wrapped = err instanceof Error ? err : new Error(String(err));
    mark('ok/mount/reject', { docName, reason: 'unhandled-body-throw' });
    rejectFn(wrapped);
  });

  return promise;
}

export function mountPromiseHasResolved(docName: string): boolean {
  return cache.get(docName)?.resolved === true;
}

export function invalidateMountPromise(docName: string): void {
  const entry = cache.get(docName);
  if (!entry) return;
  const wasSettled = entry.settled;
  entry.settled = true;
  clearMountTimeout(entry);
  entry.controller.abort();
  cache.delete(docName);
  mark('ok/mount/invalidate', { docName });
  if (!wasSettled) {
    entry.rejectFn(new MountAbortError(docName));
  }
}

interface MountBodyParams {
  docName: string;
  construct: () => ConstructedTiptapBundle;
  sizeStats?: { viewCount: number; bytes: number };
  entry: MountPromiseEntry;
  resolveFn: (entry: TiptapCacheEntry) => void;
  rejectFn: (error: Error) => void;
}

function destroyPreMountEditor(
  docName: string,
  editor: Editor,
  stage: 'aborted' | 'mount-failed' | 'v2-register-failed' | 'backstop' | 'timeout',
): void {
  const undoManager = readEditorUndoManager(editor);
  try {
    editor.destroy();
  } catch (err) {
    mark('ok/mount/destroy-failed', {
      docName,
      stage,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  if (undoManager) {
    undoManager.restore = undefined;
  }
}

async function runMountBody(params: MountBodyParams): Promise<void> {
  const { docName, construct, sizeStats, entry, resolveFn, rejectFn } = params;

  const transient = document.createElement('div');

  if (peekTiptap(docName) !== undefined) {
    const v2HitEntry = mountTiptapEditor({
      docName,
      container: transient as unknown as HTMLElement,
      factory: () => {
        throw new Error(
          `mount-promise: V2 cache contract violation — factory invoked on HIT for "${docName}"`,
        );
      },
    });
    entry.settled = true;
    entry.resolved = true;
    clearMountTimeout(entry);
    mark('ok/mount/cache-hit', { docName });
    resolveFn(v2HitEntry);
    return;
  }

  let constructed: ConstructedTiptapBundle | null = null;
  try {
    constructed = construct();
  } catch (err) {
    entry.settled = true;
    clearMountTimeout(entry);
    const wrapped = err instanceof Error ? err : new Error(String(err));
    mark('ok/mount/reject', { docName, reason: 'construct-failed' });
    rejectFn(wrapped);
    return;
  }
  entry.preMountEditor = constructed.editor;

  await scheduler.yield();

  if (entry.controller.signal.aborted) {
    destroyPreMountEditor(docName, constructed.editor, 'aborted');
    entry.preMountEditor = null;
    entry.settled = true;
    clearMountTimeout(entry);
    const abortErr = new MountAbortError(docName);
    mark('ok/mount/reject', { docName, reason: 'aborted' });
    rejectFn(abortErr);
    return;
  }

  try {
    constructed.editor.mount(transient);
  } catch (err) {
    destroyPreMountEditor(docName, constructed.editor, 'mount-failed');
    entry.preMountEditor = null;
    entry.settled = true;
    clearMountTimeout(entry);
    const wrapped = err instanceof Error ? err : new Error(String(err));
    mark('ok/mount/reject', { docName, reason: 'mount-failed' });
    rejectFn(wrapped);
    return;
  }

  let v2MissEntry: TiptapCacheEntry;
  try {
    v2MissEntry = mountTiptapEditor({
      docName,
      container: transient as unknown as HTMLElement,
      sizeStats,
      factory: () => constructed,
    });
  } catch (err) {
    destroyPreMountEditor(docName, constructed.editor, 'v2-register-failed');
    entry.preMountEditor = null;
    entry.settled = true;
    clearMountTimeout(entry);
    const wrapped = err instanceof Error ? err : new Error(String(err));
    mark('ok/mount/reject', { docName, reason: 'v2-register-failed' });
    rejectFn(wrapped);
    return;
  }

  entry.preMountEditor = null;
  entry.settled = true;
  entry.resolved = true;
  clearMountTimeout(entry);
  const elapsed = Date.now() - entry.createdAt;
  mark('ok/mount/resolve', { docName, elapsedMs: elapsed });
  resolveFn(v2MissEntry);
}

export function __resetMountPromiseCache(): void {
  for (const entry of cache.values()) {
    entry.settled = true;
    clearMountTimeout(entry);
    entry.controller.abort();
  }
  cache.clear();
}

export function __mountPromiseSettled(docName: string): boolean {
  return cache.get(docName)?.settled ?? false;
}

export function __mountPromiseCacheSize(): number {
  return cache.size;
}
