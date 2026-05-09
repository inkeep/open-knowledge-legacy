/**
 * Unit tests for mount-promise: module-level promise cache for the Pattern D
 * (Suspense + `use(promise)`) TipTap mount-split. Mirrors precedent #18(d)
 * sync-promise.test.ts shape.
 *
 * Tests use the same fake-DOM + fake-Editor harness as editor-cache.test.ts
 * (Bun test env has no DOM globals; we install a minimal `globalThis.document`
 * stub before the suites that exercise the cache-MISS path).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { getCollector } from '../lib/perf/collector';
import { __getCacheSize, __resetCacheForTests, mountTiptapEditor } from './editor-cache';
import {
  __mountPromiseCacheSize,
  __mountPromiseSettled,
  __resetMountPromiseCache,
  invalidateMountPromise,
  MOUNT_TIMEOUT_MS,
  MountAbortError,
  MountTimeoutError,
  mountPromiseHasResolved,
  mountTiptapEditorPromise,
} from './mount-promise';

interface FakeNode {
  parentElement: FakeNode | null;
  scrollTop: number;
  children: FakeNode[];
  appendChild(child: FakeNode): FakeNode;
  removeChild(child: FakeNode): FakeNode;
  setAttribute(key: string, value: string): void;
  style: Record<string, string>;
}

function makeNode(): FakeNode {
  const node: FakeNode = {
    parentElement: null,
    scrollTop: 0,
    children: [],
    style: {},
    setAttribute(_key, _value) {},
    appendChild(child) {
      if (child.parentElement) child.parentElement.removeChild(child);
      node.children.push(child);
      child.parentElement = node;
      return child;
    },
    removeChild(child) {
      const idx = node.children.indexOf(child);
      if (idx !== -1) node.children.splice(idx, 1);
      child.parentElement = null;
      return child;
    },
  };
  return node;
}

interface FakeTiptapSpies {
  destroyCalls: number;
  mountCalls: number;
  mountThrows: boolean;
  destroyThrows: boolean;
}

function makeFakeTiptap(dom: FakeNode): {
  editor: Editor;
  spies: FakeTiptapSpies;
} {
  const spies: FakeTiptapSpies = {
    destroyCalls: 0,
    mountCalls: 0,
    mountThrows: false,
    destroyThrows: false,
  };
  const editor = {
    editorView: {
      dom,
      scrollDOM: dom,
    },
    commands: {
      focus() {},
    },
    mount(target: FakeNode) {
      spies.mountCalls++;
      if (spies.mountThrows) {
        throw new Error('synthetic mount failure');
      }
      target.appendChild(dom);
    },
    destroy() {
      spies.destroyCalls++;
      if (spies.destroyThrows) {
        throw new Error('synthetic destroy failure');
      }
    },
    isDestroyed: false,
  } as unknown as Editor;
  return { editor, spies };
}

function makeFakeProvider(ydoc: Y.Doc): HocuspocusProvider {
  return {
    document: ydoc,
    destroy() {},
    connect() {
      return Promise.resolve();
    },
    disconnect() {},
  } as unknown as HocuspocusProvider;
}

interface MountPromiseHarness {
  docName: string;
  ydoc: Y.Doc;
  ytext: Y.Text;
  editor: Editor;
  provider: HocuspocusProvider;
  editorDom: FakeNode;
  spies: FakeTiptapSpies;
  constructCallCount: number;
  construct: () => {
    editor: Editor;
    ydoc: Y.Doc;
    ytext: Y.Text;
    provider: HocuspocusProvider;
  };
}

function makeHarness(docName: string): MountPromiseHarness {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('source');
  const editorDom = makeNode();
  const { editor, spies } = makeFakeTiptap(editorDom);
  const provider = makeFakeProvider(ydoc);
  let constructCallCount = 0;
  const harness: MountPromiseHarness = {
    docName,
    ydoc,
    ytext,
    editor,
    provider,
    editorDom,
    spies,
    constructCallCount: 0,
    construct: () => {
      constructCallCount++;
      harness.constructCallCount = constructCallCount;
      return { editor, ydoc, ytext, provider };
    },
  };
  return harness;
}

let documentStubInstalled = false;
function installDocumentStub(): void {
  if (typeof globalThis.document !== 'undefined') return;
  // biome-ignore lint/suspicious/noExplicitAny: minimal test-only stub for `document.createElement`
  (globalThis as any).document = {
    createElement: (_tag: string) => makeNode(),
  };
  documentStubInstalled = true;
}

function uninstallDocumentStub(): void {
  if (!documentStubInstalled) return;
  // biome-ignore lint/suspicious/noExplicitAny: tearing down the test-only stub installed above
  delete (globalThis as any).document;
  documentStubInstalled = false;
}

beforeEach(() => {
  __resetMountPromiseCache();
  __resetCacheForTests();
  installDocumentStub();
});

afterEach(async () => {
  __resetMountPromiseCache();
  __resetCacheForTests();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  uninstallDocumentStub();
});

describe('cache HIT short-circuit (V2 cache pre-populated)', () => {
  test('V2 cache HIT: resolves to the same entry without calling construct', async () => {
    const h = makeHarness('doc-hit');

    const v2container = makeNode();
    const v2entry = mountTiptapEditor({
      docName: h.docName,
      container: v2container as unknown as HTMLElement,
      factory: (el) => {
        (el as unknown as FakeNode).appendChild(h.editorDom);
        return { editor: h.editor, ydoc: h.ydoc, ytext: h.ytext, provider: h.provider };
      },
    });
    expect(__getCacheSize('tiptap')).toBe(1);

    const promise = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });

    const got = await promise;
    expect(got).toBe(v2entry);
    expect(h.constructCallCount).toBe(0); // construct NEVER called on HIT
    expect(h.spies.mountCalls).toBe(0); // mount() NEVER called on HIT
    expect(h.spies.destroyCalls).toBe(0);
    expect(__mountPromiseCacheSize()).toBe(1);
    expect(__mountPromiseSettled(h.docName)).toBe(true);
  });
});

describe('cache MISS: construct → yield → mount sequence', () => {
  test('cache MISS: runs construct, yields, then calls editor.mount(transient)', async () => {
    const h = makeHarness('doc-miss');

    const promise = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });

    const entry = await promise;
    expect(h.constructCallCount).toBe(1);
    expect(h.spies.mountCalls).toBe(1);
    expect(h.spies.destroyCalls).toBe(0);
    expect(entry.editor).toBe(h.editor);
    expect(entry.ydoc).toBe(h.ydoc);
    expect(entry.ytext).toBe(h.ytext);
    expect(entry.provider).toBe(h.provider);
    expect(__getCacheSize('tiptap')).toBe(1);
    expect(__mountPromiseSettled(h.docName)).toBe(true);
  });

  test('cache MISS: editor is mounted into a transient detached div, NOT the V2 container directly', async () => {
    const h = makeHarness('doc-transient-mount');

    await mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });

    expect(h.editorDom.parentElement).not.toBeNull();
  });
});

describe('concurrent-call promise reference stability', () => {
  test('repeated calls with same docName during pending construction return the same promise reference', () => {
    const h = makeHarness('doc-concurrent');

    const a = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    const b = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    const c = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(__mountPromiseCacheSize()).toBe(1);

    a.catch(() => {});
  });

  test('repeated calls after resolution return the same resolved promise', async () => {
    const h = makeHarness('doc-resolved-stable');

    const first = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    const entry = await first;

    const second = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    expect(second).toBe(first);
    await expect(second).resolves.toBe(entry);
    expect(h.constructCallCount).toBe(1);
    expect(h.spies.mountCalls).toBe(1);
  });

  test('different docNames produce different promises', () => {
    const ha = makeHarness('doc-a');
    const hb = makeHarness('doc-b');

    const pa = mountTiptapEditorPromise({ docName: ha.docName, construct: ha.construct });
    const pb = mountTiptapEditorPromise({ docName: hb.docName, construct: hb.construct });

    expect(pa).not.toBe(pb);
    expect(__mountPromiseCacheSize()).toBe(2);

    pa.catch(() => {});
    pb.catch(() => {});
  });
});

describe('invalidate-during-construction abort path', () => {
  test('invalidateMountPromise during the yield-window aborts the body, destroys pre-mount editor, and rejects', async () => {
    const h = makeHarness('doc-abort');

    const promise = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });
    const settled = promise.catch((err: unknown) => err);

    invalidateMountPromise(h.docName);

    const result = await settled;
    expect(result).toBeInstanceOf(MountAbortError);
    expect((result as MountAbortError).docName).toBe(h.docName);
    expect(h.constructCallCount).toBe(1);
    expect(h.spies.mountCalls).toBe(0);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(h.spies.destroyCalls).toBe(1);
    expect(__mountPromiseCacheSize()).toBe(0);
  });

  test('after invalidate, next call returns a fresh promise (re-mount succeeds)', async () => {
    const h = makeHarness('doc-reinvalidate');

    const aborted = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });
    aborted.catch(() => {});
    invalidateMountPromise(h.docName);
    await aborted.catch(() => {});

    const h2 = makeHarness(h.docName);
    const fresh = mountTiptapEditorPromise({
      docName: h2.docName,
      construct: h2.construct,
    });
    expect(fresh).not.toBe(aborted);
    const entry = await fresh;
    expect(entry.editor).toBe(h2.editor);
    expect(h2.spies.mountCalls).toBe(1);
  });
});

describe('mount-failure error path', () => {
  test('editor.mount throws → editor.destroy() called, promise rejects with the original error', async () => {
    const h = makeHarness('doc-mount-fail');
    h.spies.mountThrows = true;

    const promise = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });

    await expect(promise).rejects.toThrow('synthetic mount failure');
    expect(h.constructCallCount).toBe(1);
    expect(h.spies.mountCalls).toBe(1);
    expect(h.spies.destroyCalls).toBe(1);
    expect(__getCacheSize('tiptap')).toBe(0);
  });

  test('rejected entry stays in mount-promise cache so re-entry returns same rejected thenable', async () => {
    const h = makeHarness('doc-rejected-stable');
    h.spies.mountThrows = true;

    const first = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    await first.catch(() => {});

    const second = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    expect(second).toBe(first);
    await expect(second).rejects.toThrow('synthetic mount failure');
    expect(h.constructCallCount).toBe(1);
    expect(h.spies.mountCalls).toBe(1);
    expect(__mountPromiseSettled(h.docName)).toBe(true);
  });

  test('after rejection + invalidate, next call re-attempts construction', async () => {
    const h = makeHarness('doc-recover-after-fail');
    h.spies.mountThrows = true;

    const first = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    await first.catch(() => {});

    invalidateMountPromise(h.docName);
    expect(__mountPromiseCacheSize()).toBe(0);

    const h2 = makeHarness(h.docName);
    const second = mountTiptapEditorPromise({ docName: h2.docName, construct: h2.construct });
    const entry = await second;
    expect(entry.editor).toBe(h2.editor);
    expect(h2.constructCallCount).toBe(1);
    expect(h2.spies.mountCalls).toBe(1);
  });

  test('construct() throws → promise rejects with the original error, no mount call', async () => {
    const constructError = new Error('synthetic construct failure');
    const promise = mountTiptapEditorPromise({
      docName: 'doc-construct-fail',
      construct: () => {
        throw constructError;
      },
    });
    await expect(promise).rejects.toBe(constructError);
    expect(__getCacheSize('tiptap')).toBe(0);
  });

  test('destroy() throws after mount() throws → promise still rejects with original mount error', async () => {
    const h = makeHarness('doc-destroy-throws-after-mount-fail');
    h.spies.mountThrows = true;
    h.spies.destroyThrows = true;

    const promise = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });

    await expect(promise).rejects.toThrow('synthetic mount failure');
    expect(h.spies.mountCalls).toBe(1);
    expect(h.spies.destroyCalls).toBe(1);
    expect(__getCacheSize('tiptap')).toBe(0);
  });

  test('destroy() throws on abort path → promise still rejects with MountAbortError', async () => {
    const h = makeHarness('doc-destroy-throws-on-abort');
    h.spies.destroyThrows = true;

    const promise = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });
    invalidateMountPromise(h.docName);

    await expect(promise).rejects.toMatchObject({
      name: 'MountAbortError',
      docName: h.docName,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(h.spies.destroyCalls).toBe(1);
  });
});

describe('invalidateMountPromise', () => {
  test('is a safe no-op when no entry exists for docName', () => {
    expect(() => invalidateMountPromise('never-created')).not.toThrow();
    expect(__mountPromiseCacheSize()).toBe(0);
  });

  test('removes a settled (resolved) entry on invalidate', async () => {
    const h = makeHarness('doc-invalidate-resolved');
    const promise = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    await promise;
    expect(__mountPromiseCacheSize()).toBe(1);

    invalidateMountPromise(h.docName);
    expect(__mountPromiseCacheSize()).toBe(0);
  });

  test('after invalidating a resolved entry, next call re-runs construct (V2 cache miss path)', async () => {
    const h = makeHarness('doc-fresh-after-invalidate');
    const first = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    const firstEntry = await first;
    expect(firstEntry.editor).toBe(h.editor);

    invalidateMountPromise(h.docName);
    __resetCacheForTests(); // Clear V2 cache too — models eviction

    const h2 = makeHarness(h.docName);
    const second = mountTiptapEditorPromise({ docName: h2.docName, construct: h2.construct });
    const secondEntry = await second;
    expect(secondEntry.editor).toBe(h2.editor);
    expect(h2.constructCallCount).toBe(1);
  });
});

describe('error class shape', () => {
  test('MountAbortError extends Error and carries docName', () => {
    const err = new MountAbortError('some-doc');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MountAbortError);
    expect(err.name).toBe('MountAbortError');
    expect(err.docName).toBe('some-doc');
    expect(err.message).toContain('some-doc');
  });

  test('MountTimeoutError extends Error and carries docName + elapsedMs', () => {
    const err = new MountTimeoutError('some-doc', 30_000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MountTimeoutError);
    expect(err.name).toBe('MountTimeoutError');
    expect(err.docName).toBe('some-doc');
    expect(err.elapsedMs).toBe(30_000);
    expect(err.message).toContain('some-doc');
    expect(err.message).toContain('30000');
  });

  test('MOUNT_TIMEOUT_MS is 30s (mirrors sync-promise SYNC_TIMEOUT_MS)', () => {
    expect(MOUNT_TIMEOUT_MS).toBe(30_000);
  });
});

describe('watchdog timeout (construct → yield → mount)', () => {
  test('timer is cleared on resolve (no dangling setTimeout after success)', async () => {
    const h = makeHarness('timer-clear-resolve');
    let timerCleared = false;
    const origClearTimeout = globalThis.clearTimeout;
    globalThis.clearTimeout = ((handle: ReturnType<typeof setTimeout>) => {
      timerCleared = true;
      return origClearTimeout(handle);
    }) as typeof globalThis.clearTimeout;
    try {
      await mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
      expect(timerCleared).toBe(true);
    } finally {
      globalThis.clearTimeout = origClearTimeout;
    }
  });

  test('timer is cleared on invalidate (no dangling setTimeout after abort)', () => {
    const h = makeHarness('timer-clear-invalidate');
    let timerCleared = false;
    const origClearTimeout = globalThis.clearTimeout;
    globalThis.clearTimeout = ((handle: ReturnType<typeof setTimeout>) => {
      timerCleared = true;
      return origClearTimeout(handle);
    }) as typeof globalThis.clearTimeout;
    try {
      const promise = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
      promise.catch(() => {}); // suppress unhandled rejection from invalidate
      invalidateMountPromise(h.docName);
      expect(timerCleared).toBe(true);
    } finally {
      globalThis.clearTimeout = origClearTimeout;
    }
  });

  test('watchdog rejects with MountTimeoutError when body never settles', async () => {
    const h = makeHarness('timer-fires');
    const origYield = scheduler.yield.bind(scheduler);
    let stallResolve: (() => void) | null = null;
    scheduler.yield = (() =>
      new Promise<void>((res) => {
        stallResolve = res;
      })) as typeof scheduler.yield;
    const origSetTimeout = globalThis.setTimeout;
    let watchdogFn: (() => void) | null = null;
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      if (ms === MOUNT_TIMEOUT_MS) {
        watchdogFn = fn;
        return { __mockHandle: true } as unknown as ReturnType<typeof origSetTimeout>;
      }
      return origSetTimeout(fn, ms);
    }) as typeof globalThis.setTimeout;
    try {
      const promise = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
      await new Promise((res) => origSetTimeout(res, 0));
      expect(watchdogFn).not.toBeNull();
      if (watchdogFn) (watchdogFn as () => void)();
      await expect(promise).rejects.toBeInstanceOf(MountTimeoutError);
      expect(h.spies.destroyCalls).toBe(1);
      expect(__mountPromiseSettled(h.docName)).toBe(false); // cache.delete'd
      expect(__mountPromiseCacheSize()).toBe(0);
    } finally {
      scheduler.yield = origYield;
      globalThis.setTimeout = origSetTimeout;
      if (stallResolve) (stallResolve as () => void)();
    }
  });
});

describe('mountPromiseHasResolved (warm-reopen overlay gate)', () => {
  test('returns false when no entry exists', () => {
    expect(mountPromiseHasResolved('never-mounted')).toBe(false);
  });

  test('returns false while a mount is pending (constructed but not yet awaited)', () => {
    const h = makeHarness('pending-doc');
    const promise = mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    promise.catch(() => {});
    expect(mountPromiseHasResolved(h.docName)).toBe(false);
  });

  test('returns true after a successful V2 cache MISS resolve', async () => {
    const h = makeHarness('resolved-miss-doc');
    await mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    expect(mountPromiseHasResolved(h.docName)).toBe(true);
  });

  test('returns true after a V2 cache HIT short-circuit resolve', async () => {
    const h = makeHarness('resolved-hit-doc');
    await mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    invalidateMountPromise(h.docName); // Clear mount-promise cache only; V2 stays.
    expect(mountPromiseHasResolved(h.docName)).toBe(false);

    const h2 = makeHarness(h.docName);
    await mountTiptapEditorPromise({ docName: h2.docName, construct: h2.construct });
    expect(mountPromiseHasResolved(h.docName)).toBe(true);
  });

  test('returns false on rejected mount (settled but not resolved)', async () => {
    const h = makeHarness('rejected-doc');
    h.editor.mount = () => {
      throw new Error('mount-failed');
    };
    let rejected = false;
    try {
      await mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(__mountPromiseSettled(h.docName)).toBe(true);
    expect(mountPromiseHasResolved(h.docName)).toBe(false);
  });

  test('returns false after invalidate (entry removed)', async () => {
    const h = makeHarness('invalidated-doc');
    await mountTiptapEditorPromise({ docName: h.docName, construct: h.construct });
    expect(mountPromiseHasResolved(h.docName)).toBe(true);
    invalidateMountPromise(h.docName);
    expect(mountPromiseHasResolved(h.docName)).toBe(false);
  });
});

describe('scheduler.yield wiring', () => {
  function withYieldSpy<T>(fn: (calls: { count: number }) => Promise<T>): Promise<T> {
    const calls = { count: 0 };
    const original = scheduler.yield.bind(scheduler);
    scheduler.yield = ((): Promise<void> => {
      calls.count++;
      return original();
    }) as typeof scheduler.yield;
    return fn(calls).finally(() => {
      scheduler.yield = original;
    });
  }

  test('cache MISS path invokes scheduler.yield exactly once between construct and mount', async () => {
    const h = makeHarness('doc-yield-once');
    await withYieldSpy(async (calls) => {
      const entry = await mountTiptapEditorPromise({
        docName: h.docName,
        construct: h.construct,
      });
      expect(calls.count).toBe(1);
      expect(h.constructCallCount).toBe(1);
      expect(h.spies.mountCalls).toBe(1);
      expect(entry.editor).toBe(h.editor);
    });
  });

  test('V2 cache HIT short-circuit does NOT invoke scheduler.yield', async () => {
    const h = makeHarness('doc-yield-skipped-on-hit');
    const v2container = makeNode();
    mountTiptapEditor({
      docName: h.docName,
      container: v2container as unknown as HTMLElement,
      factory: (el) => {
        (el as unknown as FakeNode).appendChild(h.editorDom);
        return { editor: h.editor, ydoc: h.ydoc, ytext: h.ytext, provider: h.provider };
      },
    });

    await withYieldSpy(async (calls) => {
      await mountTiptapEditorPromise({
        docName: h.docName,
        construct: h.construct,
      });
      expect(calls.count).toBe(0);
      expect(h.constructCallCount).toBe(0);
      expect(h.spies.mountCalls).toBe(0);
    });
  });

  test('construct() failure rejects before the yield-point — scheduler.yield not invoked', async () => {
    await withYieldSpy(async (calls) => {
      const constructError = new Error('synthetic construct failure');
      const promise = mountTiptapEditorPromise({
        docName: 'doc-construct-fail-no-yield',
        construct: () => {
          throw constructError;
        },
      });
      await expect(promise).rejects.toBe(constructError);
      expect(calls.count).toBe(0);
    });
  });

  test('invalidateMountPromise during the yield-window aborts the body — cancellation contract held under scheduler.yield', async () => {
    const h = makeHarness('doc-yield-abort');

    await withYieldSpy(async (calls) => {
      const promise = mountTiptapEditorPromise({
        docName: h.docName,
        construct: h.construct,
      });
      const settled = promise.catch((err: unknown) => err);

      invalidateMountPromise(h.docName);

      const result = await settled;
      expect(result).toBeInstanceOf(MountAbortError);
      expect(calls.count).toBe(1); // yield was reached before the abort
      expect(h.constructCallCount).toBe(1); // construct ran before the yield
      expect(h.spies.mountCalls).toBe(0); // mount was skipped after the abort
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(h.spies.destroyCalls).toBe(1); // pre-mount editor was destroyed
    });
  });
});

describe('unhandled-throw backstop — body must reject, never hang', () => {
  test('scheduler.yield throwing → consumer promise rejects AND pre-mount editor is destroyed', async () => {
    const h = makeHarness('doc-yield-throws');

    const original = scheduler.yield.bind(scheduler);
    const yieldError = new Error('synthetic scheduler.yield failure');
    scheduler.yield = ((): Promise<void> => {
      return Promise.reject(yieldError);
    }) as typeof scheduler.yield;

    try {
      const promise = mountTiptapEditorPromise({
        docName: h.docName,
        construct: h.construct,
      });
      await expect(promise).rejects.toBeDefined();
      expect(h.constructCallCount).toBe(1);
      expect(h.spies.mountCalls).toBe(0);
      expect(h.spies.destroyCalls).toBe(1);
    } finally {
      scheduler.yield = original;
    }
  });

  test('V2 HIT path throwing → consumer promise rejects (does not hang)', async () => {
    const h = makeHarness('doc-hit-throws');

    const v2container = makeNode();
    mountTiptapEditor({
      docName: h.docName,
      container: v2container as unknown as HTMLElement,
      factory: (el) => {
        (el as unknown as FakeNode).appendChild(h.editorDom);
        return { editor: h.editor, ydoc: h.ydoc, ytext: h.ytext, provider: h.provider };
      },
    });

    const sabotaged = h.editorDom as unknown as { parentElement: { removeChild: () => never } };
    sabotaged.parentElement = {
      removeChild: () => {
        throw new Error('synthetic HIT-path DOM failure');
      },
    };

    const promise = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });
    await expect(promise).rejects.toBeDefined();
  });

  test('invalidate followed by V2 HIT path throwing → consumer promise rejects (does not hang)', async () => {
    const h = makeHarness('doc-hit-throws-after-invalidate');

    const v2container = makeNode();
    mountTiptapEditor({
      docName: h.docName,
      container: v2container as unknown as HTMLElement,
      factory: (el) => {
        (el as unknown as FakeNode).appendChild(h.editorDom);
        return { editor: h.editor, ydoc: h.ydoc, ytext: h.ytext, provider: h.provider };
      },
    });

    const sabotaged = h.editorDom as unknown as { parentElement: { removeChild: () => never } };
    sabotaged.parentElement = {
      removeChild: () => {
        throw new Error('synthetic HIT-path DOM failure');
      },
    };

    const promise = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });
    const settled = promise.catch((err: unknown) => err);

    invalidateMountPromise(h.docName);

    const result = await settled;
    expect(result).toBeInstanceOf(MountAbortError);
    expect((result as MountAbortError).docName).toBe(h.docName);
  });

  test('post-settle escape: body throw after invalidate emits ok/mount/post-settle-throw mark', async () => {
    const h = makeHarness('doc-post-settle-mark');

    const v2container = makeNode();
    mountTiptapEditor({
      docName: h.docName,
      container: v2container as unknown as HTMLElement,
      factory: (el) => {
        (el as unknown as FakeNode).appendChild(h.editorDom);
        return { editor: h.editor, ydoc: h.ydoc, ytext: h.ytext, provider: h.provider };
      },
    });

    const sabotaged = h.editorDom as unknown as { parentElement: { removeChild: () => never } };
    sabotaged.parentElement = {
      removeChild: () => {
        throw new Error('synthetic HIT-path DOM failure for post-settle mark test');
      },
    };

    getCollector()?.reset();

    const promise = mountTiptapEditorPromise({
      docName: h.docName,
      construct: h.construct,
    });
    const settled = promise.catch((err: unknown) => err);
    invalidateMountPromise(h.docName);
    await settled;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const marks = getCollector()?.marks ?? [];
    const postSettleMark = marks.find((m) => m.name === 'ok/mount/post-settle-throw');
    expect(postSettleMark).toBeDefined();
    expect(postSettleMark?.properties?.docName).toBe(h.docName);
    expect(postSettleMark?.properties?.message).toContain('synthetic HIT-path DOM failure');
  });
});
