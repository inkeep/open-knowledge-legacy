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

/**
 * Destroy a pre-mount editor with the same UndoManager-restore cleanup that
 * `editor-cache.ts` applies at park / evict (precedent #18(c) leak-cleanup).
 * Capturing the UndoManager BEFORE `editor.destroy()` is required because
 * `editor.state` is only safely readable while the editor is alive; clearing
 * `restore` AFTER destroy breaks the @tiptap/extension-collaboration closure
 * that retains the full editor graph (~30 MB per cycle on multi-MB docs).
 *
 * Idempotent on pre-mount editors per TipTap source verification. Emits a
 * telemetry mark on destroy() failure so a regression in TipTap's pre-mount-
 * destroy idempotency surfaces in traces rather than vanishing — mirrors
 * `editor-cache.ts`'s `ok/cache/evict-failed` discipline.
 */
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
