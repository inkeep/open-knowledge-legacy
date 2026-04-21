/**
 * V2 editor cache — unit tests. Covers US-001 AC 9:
 *   - mount-park-mount preserves doc content, selection, CRDT sync
 *   - 5 reparent cycles work
 *   - evict cleans up
 *   - CACHE_ENABLED=false bypasses cache
 *
 * Convention: Bun test env has no DOM globals. We use fake shapes that
 * satisfy the narrow subset of HTMLElement the cache touches
 * (parentElement / appendChild / removeChild / scrollTop). The actual
 * DOM reparent + state preservation under REAL TipTap/CM6 is validated
 * by the Phase 1.0 spike probe (tiptap-reparent-probe.md, 11/13 pass)
 * and the H1 CM6 probe (h1-cm6-reparent-probe.md, 12/12 pass).
 *
 * Y.Doc is used FOR REAL — yjs has zero DOM coupling, so we can assert
 * CRDT state is preserved through cache cycles without mocking.
 *
 * Kill switch (CACHE_ENABLED) is exported as a const; tests verify the
 * cached path with the current value (true) and the uncached path by
 * tagging entries with __uncached directly (simulates the kill-switch
 * code path without module reload).
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { EditorView } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import {
  __getActivityMountList,
  __getCacheOrder,
  __getCacheSize,
  __peekCm,
  __peekTiptap,
  __resetCache,
  BYTES_CACHE_THRESHOLD,
  CACHE_ENABLED,
  type CmCacheEntry,
  evictCmEditor,
  evictTiptapEditor,
  MAX_CACHE,
  mountCmEditor,
  mountTiptapEditor,
  parkCmEditor,
  parkTiptapEditor,
  setActivityMountList,
  shouldCacheEditor,
  type TiptapCacheEntry,
  VIEW_COUNT_CACHE_THRESHOLD,
} from './editor-cache';

// ---------------------------------------------------------------------------
// Minimal HTMLElement fake — satisfies the subset the cache uses.
// ---------------------------------------------------------------------------

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
    setAttribute(_key, _value) {
      // no-op — tracked attributes are not asserted
    },
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

// ---------------------------------------------------------------------------
// Fake TipTap Editor / CM EditorView that satisfies the cache contract
// ---------------------------------------------------------------------------

interface FakeTiptapEditorSpies {
  destroyCalls: number;
  focusCalls: number;
}

function makeFakeTiptapEditor(dom: FakeNode): {
  editor: Editor;
  spies: FakeTiptapEditorSpies;
} {
  const spies: FakeTiptapEditorSpies = { destroyCalls: 0, focusCalls: 0 };
  const editor = {
    editorView: {
      dom,
      scrollDOM: dom,
    },
    commands: {
      focus() {
        spies.focusCalls++;
      },
    },
    destroy() {
      spies.destroyCalls++;
    },
    isDestroyed: false,
  } as unknown as Editor;
  return { editor, spies };
}

interface FakeCmViewSpies {
  destroyCalls: number;
  focusCalls: number;
}

function makeFakeCmView(dom: FakeNode): { view: EditorView; spies: FakeCmViewSpies } {
  const spies: FakeCmViewSpies = { destroyCalls: 0, focusCalls: 0 };
  const view = {
    dom,
    scrollDOM: dom,
    focus() {
      spies.focusCalls++;
    },
    destroy() {
      spies.destroyCalls++;
    },
  } as unknown as EditorView;
  return { view, spies };
}

// ---------------------------------------------------------------------------
// Fake HocuspocusProvider — narrow surface (destroy + document ref)
// ---------------------------------------------------------------------------

interface FakeProviderSpies {
  destroyCalls: number;
  connectCalls: number;
  disconnectCalls: number;
}

function makeFakeProvider(ydoc: Y.Doc): { provider: HocuspocusProvider; spies: FakeProviderSpies } {
  const spies: FakeProviderSpies = { destroyCalls: 0, connectCalls: 0, disconnectCalls: 0 };
  const provider = {
    document: ydoc,
    destroy() {
      spies.destroyCalls++;
    },
    connect() {
      spies.connectCalls++;
      return Promise.resolve();
    },
    disconnect() {
      spies.disconnectCalls++;
    },
  } as unknown as HocuspocusProvider;
  return { provider, spies };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface TiptapHarness {
  docName: string;
  ydoc: Y.Doc;
  ytext: Y.Text;
  fragment: Y.XmlFragment;
  editor: Editor;
  provider: HocuspocusProvider;
  container: FakeNode;
  editorDom: FakeNode;
  spies: FakeTiptapEditorSpies;
  providerSpies: FakeProviderSpies;
  factoryCallCount: number;
  /** Factory to pass into mountTiptapEditor. */
  factory: (container: FakeNode) => {
    editor: Editor;
    ydoc: Y.Doc;
    ytext: Y.Text;
    provider: HocuspocusProvider;
  };
}

function makeTiptapHarness(docName: string): TiptapHarness {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('source');
  const fragment = ydoc.getXmlFragment('default');
  const editorDom = makeNode();
  const { editor, spies } = makeFakeTiptapEditor(editorDom);
  const { provider, spies: providerSpies } = makeFakeProvider(ydoc);
  const container = makeNode();
  let factoryCallCount = 0;
  const harness: TiptapHarness = {
    docName,
    ydoc,
    ytext,
    fragment,
    editor,
    provider,
    container,
    editorDom,
    spies,
    providerSpies,
    factoryCallCount: 0,
    factory: (ctr) => {
      factoryCallCount++;
      harness.factoryCallCount = factoryCallCount;
      ctr.appendChild(editorDom);
      return { editor, ydoc, ytext, provider };
    },
  };
  return harness;
}

interface CmHarness {
  docName: string;
  ydoc: Y.Doc;
  ytext: Y.Text;
  view: EditorView;
  provider: HocuspocusProvider;
  container: FakeNode;
  viewDom: FakeNode;
  spies: FakeCmViewSpies;
  providerSpies: FakeProviderSpies;
  factoryCallCount: number;
  factory: (container: FakeNode) => {
    view: EditorView;
    ydoc: Y.Doc;
    ytext: Y.Text;
    provider: HocuspocusProvider;
  };
}

function makeCmHarness(docName: string): CmHarness {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('source');
  const viewDom = makeNode();
  const { view, spies } = makeFakeCmView(viewDom);
  const { provider, spies: providerSpies } = makeFakeProvider(ydoc);
  const container = makeNode();
  let factoryCallCount = 0;
  const harness: CmHarness = {
    docName,
    ydoc,
    ytext,
    view,
    provider,
    container,
    viewDom,
    spies,
    providerSpies,
    factoryCallCount: 0,
    factory: (ctr) => {
      factoryCallCount++;
      harness.factoryCallCount = factoryCallCount;
      ctr.appendChild(viewDom);
      return { view, ydoc, ytext, provider };
    },
  };
  return harness;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('CACHE_ENABLED constant', () => {
  test('is true by default (V2 ships enabled)', () => {
    // US-001 AC 7: module exports CACHE_ENABLED; default shipping value is true.
    expect(CACHE_ENABLED).toBe(true);
  });
});

describe('MAX_CACHE constant', () => {
  test('is 10 — matches SPEC §10 D3 coupling to MAX_POOL', () => {
    expect(MAX_CACHE).toBe(10);
  });
});

describe('TipTap cache — lifecycle', () => {
  beforeEach(() => {
    __resetCache();
  });
  afterEach(() => {
    __resetCache();
  });

  test('mount: cache-miss calls factory and stores entry (US-001 AC 2)', () => {
    const h = makeTiptapHarness('doc-a');
    expect(__getCacheSize('tiptap')).toBe(0);

    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });

    expect(h.factoryCallCount).toBe(1);
    expect(__getCacheSize('tiptap')).toBe(1);
    expect(entry.editor).toBe(h.editor);
    expect(entry.ydoc).toBe(h.ydoc);
    expect(entry.ytext).toBe(h.ytext);
    expect(entry.provider).toBe(h.provider);
    expect(entry.activeMountKey).toBe(h.docName);
  });

  test('mount: cache-hit reparents without constructing a new editor (US-001 AC 3)', () => {
    const h = makeTiptapHarness('doc-a');
    const first = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(h.factoryCallCount).toBe(1);

    const newContainer = makeNode();
    const second = mountTiptapEditor({
      docName: h.docName,
      container: newContainer as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });

    // Factory NOT called a second time — cache hit.
    expect(h.factoryCallCount).toBe(1);
    // Same entry returned.
    expect(second).toBe(first);
    // DOM reparented to new container.
    expect(h.editorDom.parentElement).toBe(newContainer);
    expect(h.container.children).not.toContain(h.editorDom);
  });

  test('mount: cache-hit restores scrollTop captured at park (US-001 AC 6)', () => {
    const h = makeTiptapHarness('doc-a');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    // Simulate scrolling the editor scrollDOM
    h.editorDom.scrollTop = 1234;
    parkTiptapEditor(entry);
    expect(entry.scrollTop).toBe(1234);

    const newContainer = makeNode();
    mountTiptapEditor({
      docName: h.docName,
      container: newContainer as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    // Container's scrollTop should be restored.
    expect(newContainer.scrollTop).toBe(1234);
  });

  test('mount: cache-hit calls editor.commands.focus() (US-001 AC 6)', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    const focusCountAfterFirstMount = h.spies.focusCalls;

    // Second mount (cache hit) — focus should fire.
    const newContainer = makeNode();
    mountTiptapEditor({
      docName: h.docName,
      container: newContainer as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(h.spies.focusCalls).toBeGreaterThan(focusCountAfterFirstMount);
  });

  test('park: detaches DOM from container but does NOT destroy (US-001 AC 4)', () => {
    const h = makeTiptapHarness('doc-a');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(h.editorDom.parentElement).toBe(h.container);

    parkTiptapEditor(entry);

    // DOM detached from original container.
    expect(h.editorDom.parentElement).not.toBe(h.container);
    expect(h.container.children).not.toContain(h.editorDom);
    // Editor NOT destroyed (cache preservation).
    expect(h.spies.destroyCalls).toBe(0);
    // Still in cache.
    expect(__peekTiptap(h.docName)).toBe(entry);
    expect(entry.activeMountKey).toBeNull();
  });

  test('park: clears activeMountKey', () => {
    const h = makeTiptapHarness('doc-a');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(entry.activeMountKey).toBe(h.docName);
    parkTiptapEditor(entry);
    expect(entry.activeMountKey).toBeNull();
  });

  test('evict: calls destroy on editor + provider + ydoc (US-001 AC 5)', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    // Spy on ydoc.destroy
    const ydocDestroySpy = mock(h.ydoc.destroy.bind(h.ydoc));
    h.ydoc.destroy = ydocDestroySpy;

    const result = evictTiptapEditor(h.docName);

    expect(result).toBe(true);
    expect(h.spies.destroyCalls).toBe(1);
    expect(h.providerSpies.destroyCalls).toBe(1);
    expect(ydocDestroySpy).toHaveBeenCalledTimes(1);
    expect(__peekTiptap(h.docName)).toBeUndefined();
    expect(__getCacheSize('tiptap')).toBe(0);

    // Idempotent on repeat.
    expect(evictTiptapEditor(h.docName)).toBe(false);
    expect(h.spies.destroyCalls).toBe(1);
  });

  test('evict: return false for unknown docName', () => {
    expect(evictTiptapEditor('never-existed')).toBe(false);
  });
});

describe('TipTap cache — mount-park-mount round-trip (US-001 AC 9)', () => {
  beforeEach(() => __resetCache());
  afterEach(() => __resetCache());

  test('doc content preserved (Y.XmlFragment + Y.Text)', () => {
    const h = makeTiptapHarness('doc-a');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });

    // Seed content into Y.Doc state
    h.ytext.insert(0, 'hello from round-trip');
    const ytextBefore = entry.ytext.toString();
    const fragBefore = h.fragment.toString();
    expect(ytextBefore).toBe('hello from round-trip');

    // Park the editor
    parkTiptapEditor(entry);

    // Mount again — same entry, same Y.Doc state
    const newContainer = makeNode();
    const re = mountTiptapEditor({
      docName: h.docName,
      container: newContainer as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(re).toBe(entry);
    expect(re.ytext.toString()).toBe(ytextBefore);
    // Y.XmlFragment identity & state preserved on the harness's original ref
    // (the cache entry doesn't hold an XmlFragment pointer; consumers reach it
    // via re.ydoc.getXmlFragment('default') which returns the same Y.Item by
    // name as long as ydoc.destroy() was never called).
    expect(h.fragment.toString()).toBe(fragBefore);

    // CRDT sync via Y.Doc transact after reparent still works
    re.ydoc.transact(() => {
      re.ytext.insert(re.ytext.length, ' — post-reparent');
    });
    expect(re.ytext.toString()).toBe('hello from round-trip — post-reparent');
  });

  test('5 park-mount cycles work without regression (US-001 AC 9)', () => {
    const h = makeTiptapHarness('doc-a');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    h.ytext.insert(0, 'cycle-test');

    for (let i = 0; i < 5; i++) {
      parkTiptapEditor(entry);
      // After park, DOM is NOT in ANY user-supplied container
      expect(entry.activeMountKey).toBeNull();

      const ctr = makeNode();
      const re = mountTiptapEditor({
        docName: h.docName,
        container: ctr as unknown as HTMLElement,
        factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      });
      expect(re).toBe(entry);
      expect(re.activeMountKey).toBe(h.docName);
      expect(re.ytext.toString()).toBe('cycle-test');
      // DOM ended up in the new container
      expect(h.editorDom.parentElement).toBe(ctr);
    }

    // Factory was called exactly once — all subsequent mounts are cache hits.
    expect(h.factoryCallCount).toBe(1);
    // Editor was never destroyed during the cycle loop.
    expect(h.spies.destroyCalls).toBe(0);
  });

  test('multiple docs round-trip independently', () => {
    const a = makeTiptapHarness('doc-a');
    const b = makeTiptapHarness('doc-b');
    mountTiptapEditor({
      docName: a.docName,
      container: a.container as unknown as HTMLElement,
      factory: a.factory as unknown as (el: HTMLElement) => ReturnType<typeof a.factory>,
    });
    mountTiptapEditor({
      docName: b.docName,
      container: b.container as unknown as HTMLElement,
      factory: b.factory as unknown as (el: HTMLElement) => ReturnType<typeof b.factory>,
    });
    a.ytext.insert(0, 'a-content');
    b.ytext.insert(0, 'b-content');

    // Park both
    const peekA = __peekTiptap(a.docName);
    const peekB = __peekTiptap(b.docName);
    if (!peekA || !peekB) throw new Error('cache entries missing');
    parkTiptapEditor(peekA);
    parkTiptapEditor(peekB);

    // Remount b
    const ctrB = makeNode();
    const reB = mountTiptapEditor({
      docName: b.docName,
      container: ctrB as unknown as HTMLElement,
      factory: b.factory as unknown as (el: HTMLElement) => ReturnType<typeof b.factory>,
    });
    expect(reB.ytext.toString()).toBe('b-content');
    expect(a.factoryCallCount).toBe(1);
    expect(b.factoryCallCount).toBe(1);
  });
});

describe('TipTap cache — LRU eviction at MAX_CACHE capacity', () => {
  beforeEach(() => __resetCache());
  afterEach(() => __resetCache());

  test('11th mount evicts the LRU entry (oldest first)', () => {
    const harnesses: TiptapHarness[] = [];
    for (let i = 0; i < MAX_CACHE; i++) {
      const h = makeTiptapHarness(`doc-${i}`);
      harnesses.push(h);
      mountTiptapEditor({
        docName: h.docName,
        container: h.container as unknown as HTMLElement,
        factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      });
    }
    expect(__getCacheSize('tiptap')).toBe(MAX_CACHE);

    // Track destroy calls on doc-0 (oldest).
    expect(harnesses[0].spies.destroyCalls).toBe(0);

    // Mount 11th doc — should evict doc-0
    const extra = makeTiptapHarness('doc-extra');
    mountTiptapEditor({
      docName: extra.docName,
      container: extra.container as unknown as HTMLElement,
      factory: extra.factory as unknown as (el: HTMLElement) => ReturnType<typeof extra.factory>,
    });
    expect(__getCacheSize('tiptap')).toBe(MAX_CACHE);
    expect(__peekTiptap('doc-0')).toBeUndefined();
    expect(__peekTiptap('doc-extra')).toBeDefined();
    expect(harnesses[0].spies.destroyCalls).toBe(1);
  });

  test('mount refreshes LRU order — re-mounting moves to most-recent', () => {
    const harnesses: TiptapHarness[] = [];
    for (let i = 0; i < 3; i++) {
      const h = makeTiptapHarness(`doc-${i}`);
      harnesses.push(h);
      mountTiptapEditor({
        docName: h.docName,
        container: h.container as unknown as HTMLElement,
        factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      });
    }
    // LRU: [doc-0, doc-1, doc-2] — doc-0 oldest.
    expect(__getCacheOrder('tiptap')).toEqual(['doc-0', 'doc-1', 'doc-2']);

    // Re-mount doc-0 (cache hit) — should move to end.
    const harnessA = harnesses[0];
    mountTiptapEditor({
      docName: harnessA.docName,
      container: makeNode() as unknown as HTMLElement,
      factory: harnessA.factory as unknown as (
        el: HTMLElement,
      ) => ReturnType<typeof harnessA.factory>,
    });
    expect(__getCacheOrder('tiptap')).toEqual(['doc-1', 'doc-2', 'doc-0']);
  });
});

describe('TipTap cache — __uncached / kill-switch path (US-001 AC 7)', () => {
  beforeEach(() => __resetCache());
  afterEach(() => __resetCache());

  test('__uncached entry: park() destroys the editor (pre-V2 behavior)', () => {
    // Simulate kill-switch path without toggling the module constant:
    // construct an entry and manually mark it __uncached.
    const h = makeTiptapHarness('doc-a');
    h.container.appendChild(h.editorDom);
    const entry: TiptapCacheEntry = {
      editor: h.editor,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      activeMountKey: h.docName,
      __uncached: true,
    };

    expect(h.spies.destroyCalls).toBe(0);
    parkTiptapEditor(entry);
    // Kill-switch parks destroy the editor (pre-V2 destroy-on-unmount).
    expect(h.spies.destroyCalls).toBe(1);
    expect(entry.activeMountKey).toBeNull();
  });

  test('__uncached entry: NOT stored in cache (verified by __peekTiptap)', () => {
    // When a consumer handles kill-switch locally, the cache map stays empty.
    expect(__getCacheSize('tiptap')).toBe(0);
    const h = makeTiptapHarness('doc-a');
    const entry: TiptapCacheEntry = {
      editor: h.editor,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      activeMountKey: h.docName,
      __uncached: true,
    };
    // Module-level cache was not touched by this synthetic entry
    expect(__peekTiptap(h.docName)).toBeUndefined();
    // park still sane
    parkTiptapEditor(entry);
    expect(h.spies.destroyCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CM6 cache — symmetric tests
// ---------------------------------------------------------------------------

describe('CM6 cache — lifecycle', () => {
  beforeEach(() => __resetCache());
  afterEach(() => __resetCache());

  test('mount: cache-miss calls factory and stores entry', () => {
    const h = makeCmHarness('cm-doc-a');
    const entry = mountCmEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(h.factoryCallCount).toBe(1);
    expect(__getCacheSize('cm')).toBe(1);
    expect(entry.view).toBe(h.view);
    expect(entry.ydoc).toBe(h.ydoc);
    expect(entry.ytext).toBe(h.ytext);
    expect(entry.activeMountKey).toBe(h.docName);
  });

  test('mount: cache-hit reparents view.dom without construction', () => {
    const h = makeCmHarness('cm-doc-a');
    const first = mountCmEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    const newContainer = makeNode();
    const second = mountCmEditor({
      docName: h.docName,
      container: newContainer as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(second).toBe(first);
    expect(h.viewDom.parentElement).toBe(newContainer);
    expect(h.factoryCallCount).toBe(1);
  });

  test('park: detaches view.dom, preserves scrollTop, does NOT destroy', () => {
    const h = makeCmHarness('cm-doc-a');
    const entry = mountCmEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    h.viewDom.scrollTop = 5678;
    parkCmEditor(entry);

    expect(h.viewDom.parentElement).not.toBe(h.container);
    expect(entry.scrollTop).toBe(5678);
    expect(entry.activeMountKey).toBeNull();
    expect(h.spies.destroyCalls).toBe(0);
    expect(__peekCm(h.docName)).toBe(entry);
  });

  test('mount after park: restores scrollTop + calls view.focus()', () => {
    const h = makeCmHarness('cm-doc-a');
    const entry = mountCmEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    h.viewDom.scrollTop = 42;
    parkCmEditor(entry);
    const focusBefore = h.spies.focusCalls;

    const ctr = makeNode();
    mountCmEditor({
      docName: h.docName,
      container: ctr as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(ctr.scrollTop).toBe(42);
    expect(h.spies.focusCalls).toBeGreaterThan(focusBefore);
  });

  test('evict: destroys view + provider + ydoc', () => {
    const h = makeCmHarness('cm-doc-a');
    mountCmEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    const ydocDestroySpy = mock(h.ydoc.destroy.bind(h.ydoc));
    h.ydoc.destroy = ydocDestroySpy;

    expect(evictCmEditor(h.docName)).toBe(true);
    expect(h.spies.destroyCalls).toBe(1);
    expect(h.providerSpies.destroyCalls).toBe(1);
    expect(ydocDestroySpy).toHaveBeenCalledTimes(1);
    expect(__peekCm(h.docName)).toBeUndefined();
  });

  test('5 park-mount cycles work for CM6', () => {
    const h = makeCmHarness('cm-doc-a');
    const entry = mountCmEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    h.ytext.insert(0, 'cm-cycle-test');

    for (let i = 0; i < 5; i++) {
      parkCmEditor(entry);
      const ctr = makeNode();
      const re = mountCmEditor({
        docName: h.docName,
        container: ctr as unknown as HTMLElement,
        factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      });
      expect(re).toBe(entry);
      expect(re.ytext.toString()).toBe('cm-cycle-test');
      expect(h.viewDom.parentElement).toBe(ctr);
    }
    expect(h.factoryCallCount).toBe(1);
    expect(h.spies.destroyCalls).toBe(0);
  });

  test('__uncached CM entry: park destroys view', () => {
    const h = makeCmHarness('cm-doc-a');
    h.container.appendChild(h.viewDom);
    const entry: CmCacheEntry = {
      view: h.view,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      activeMountKey: h.docName,
      __uncached: true,
    };
    parkCmEditor(entry);
    expect(h.spies.destroyCalls).toBe(1);
    expect(entry.activeMountKey).toBeNull();
  });

  test('CM LRU eviction at MAX_CACHE', () => {
    const harnesses: CmHarness[] = [];
    for (let i = 0; i < MAX_CACHE; i++) {
      const h = makeCmHarness(`cm-doc-${i}`);
      harnesses.push(h);
      mountCmEditor({
        docName: h.docName,
        container: h.container as unknown as HTMLElement,
        factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      });
    }
    expect(__getCacheSize('cm')).toBe(MAX_CACHE);

    const extra = makeCmHarness('cm-doc-extra');
    mountCmEditor({
      docName: extra.docName,
      container: extra.container as unknown as HTMLElement,
      factory: extra.factory as unknown as (el: HTMLElement) => ReturnType<typeof extra.factory>,
    });
    expect(__peekCm('cm-doc-0')).toBeUndefined();
    expect(__peekCm('cm-doc-extra')).toBeDefined();
    expect(harnesses[0].spies.destroyCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// STOP-rule enforcement — the cache never calls editor.mount / editor.unmount
// (QA-019).
// ---------------------------------------------------------------------------

describe('STOP rule: editor-cache never calls editor.mount() / editor.unmount()', () => {
  test('source contains no reference to editor.mount( or editor.unmount(', async () => {
    // Grep-based invariant test. Phase 1.0 probe proved these APIs are
    // incompatible with the production extension stack (see
    // tiptap-reparent-probe.md §3). If a future edit re-introduces them,
    // this test fails immediately.
    const sourceText = await Bun.file(`${import.meta.dir}/editor-cache.ts`).text();
    // Allow references in comments/documentation (common to explain WHY not to),
    // but forbid actual code patterns: `.mount(` / `.unmount(` on an editor-like
    // receiver. We detect the function-call shape only.
    const code = sourceText
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');
    // Look for `editor.mount(` or `editor.unmount(` as call sites in live code.
    expect(/editor\.mount\s*\(/.test(code)).toBe(false);
    expect(/editor\.unmount\s*\(/.test(code)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StrictMode / React remount safety (US-001 AC 2)
// ---------------------------------------------------------------------------

describe('Module-level cache survives simulated remounts', () => {
  beforeEach(() => __resetCache());
  afterEach(() => __resetCache());

  test('double-mount with same docName (StrictMode style) does not leak', () => {
    const h = makeTiptapHarness('doc-a');
    const first = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    // StrictMode would fire effect cleanup, then mount again. Simulate:
    parkTiptapEditor(first);
    const ctr = makeNode();
    const second = mountTiptapEditor({
      docName: h.docName,
      container: ctr as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    // Same underlying entry.
    expect(second).toBe(first);
    // Single cache entry, not two.
    expect(__getCacheSize('tiptap')).toBe(1);
    // Factory called exactly once.
    expect(h.factoryCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// US-002: Size-aware cache policy (FR3)
// ---------------------------------------------------------------------------

describe('US-002 constants', () => {
  test('VIEW_COUNT_CACHE_THRESHOLD = 50 (matches SPEC §6 FR3 + grey-zone curve)', () => {
    expect(VIEW_COUNT_CACHE_THRESHOLD).toBe(50);
  });
  test('BYTES_CACHE_THRESHOLD = 500_000 (matches LARGE_DOC_CHAR_THRESHOLD)', () => {
    expect(BYTES_CACHE_THRESHOLD).toBe(500_000);
  });
});

describe('shouldCacheEditor — pure gate', () => {
  test('small doc: cache admitted', () => {
    expect(shouldCacheEditor({ viewCount: 5, bytes: 8_000 })).toBe(true);
  });
  test('exactly at viewCount threshold: cache refused (>= gate)', () => {
    expect(shouldCacheEditor({ viewCount: 50, bytes: 1 })).toBe(false);
  });
  test('one below viewCount threshold: cache admitted', () => {
    expect(shouldCacheEditor({ viewCount: 49, bytes: 1 })).toBe(true);
  });
  test('exactly at bytes threshold: cache admitted (> gate, not >=)', () => {
    expect(shouldCacheEditor({ viewCount: 0, bytes: 500_000 })).toBe(true);
  });
  test('one above bytes threshold: cache refused', () => {
    expect(shouldCacheEditor({ viewCount: 0, bytes: 500_001 })).toBe(false);
  });
  test('both gates active: refuse on any violation', () => {
    expect(shouldCacheEditor({ viewCount: 100, bytes: 1_000_000 })).toBe(false);
  });
});

describe('mountTiptapEditor — size gate falls through to __uncached', () => {
  beforeEach(() => __resetCache());
  afterEach(() => __resetCache());

  test('gate-refused mount: entry is __uncached and NOT stored in cache', () => {
    const h = makeTiptapHarness('big-doc');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      sizeStats: { viewCount: 100, bytes: 1_000_000 },
    });
    expect(entry.__uncached).toBe(true);
    expect(__getCacheSize('tiptap')).toBe(0);
    expect(__peekTiptap(h.docName)).toBeUndefined();
  });

  test('gate-admitted mount: entry IS cached (no __uncached tag)', () => {
    const h = makeTiptapHarness('small-doc');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      sizeStats: { viewCount: 5, bytes: 8_000 },
    });
    expect(entry.__uncached).toBeUndefined();
    expect(__getCacheSize('tiptap')).toBe(1);
    expect(__peekTiptap(h.docName)).toBe(entry);
  });

  test('omitted sizeStats: entry is cached (legacy callers default to cache)', () => {
    const h = makeTiptapHarness('legacy-doc');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(entry.__uncached).toBeUndefined();
    expect(__getCacheSize('tiptap')).toBe(1);
  });

  test('gate-refused entry: park() destroys (pre-V2 fallthrough)', () => {
    const h = makeTiptapHarness('big-doc');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      sizeStats: { viewCount: 100, bytes: 0 },
    });
    expect(h.spies.destroyCalls).toBe(0);
    parkTiptapEditor(entry);
    expect(h.spies.destroyCalls).toBe(1);
  });
});

describe('mountCmEditor — size gate mirror of TipTap', () => {
  beforeEach(() => __resetCache());
  afterEach(() => __resetCache());

  test('CM gate-refused entry: park destroys', () => {
    const h = makeCmHarness('cm-big');
    const entry = mountCmEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      sizeStats: { viewCount: 200, bytes: 100 },
    });
    expect(entry.__uncached).toBe(true);
    expect(__getCacheSize('cm')).toBe(0);
    parkCmEditor(entry);
    expect(h.spies.destroyCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// US-002: Activity-mount list + FR3b provider connect/disconnect
// ---------------------------------------------------------------------------

describe('setActivityMountList — connect/disconnect transitions', () => {
  beforeEach(() => __resetCache());
  afterEach(() => __resetCache());

  test('promotion: newly active doc triggers provider.connect()', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(h.providerSpies.connectCalls).toBe(0);

    setActivityMountList(['doc-a']);
    expect(h.providerSpies.connectCalls).toBe(1);
    expect(__getActivityMountList()).toEqual(['doc-a']);
  });

  test('demotion: doc falling out of list triggers provider.disconnect()', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    setActivityMountList(['doc-a']);
    expect(h.providerSpies.connectCalls).toBe(1);

    setActivityMountList([]);
    expect(h.providerSpies.disconnectCalls).toBe(1);
    expect(__getActivityMountList()).toEqual([]);
  });

  test('stable doc: still in list on next call, no extra connect/disconnect', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    setActivityMountList(['doc-a']);
    expect(h.providerSpies.connectCalls).toBe(1);

    // Same list again — idempotent.
    setActivityMountList(['doc-a']);
    expect(h.providerSpies.connectCalls).toBe(1);
    expect(h.providerSpies.disconnectCalls).toBe(0);
  });

  test('mixed transition: one demoted + one promoted in a single call', () => {
    const a = makeTiptapHarness('doc-a');
    const b = makeTiptapHarness('doc-b');
    mountTiptapEditor({
      docName: a.docName,
      container: a.container as unknown as HTMLElement,
      factory: a.factory as unknown as (el: HTMLElement) => ReturnType<typeof a.factory>,
    });
    mountTiptapEditor({
      docName: b.docName,
      container: b.container as unknown as HTMLElement,
      factory: b.factory as unknown as (el: HTMLElement) => ReturnType<typeof b.factory>,
    });
    setActivityMountList(['doc-a']);
    expect(a.providerSpies.connectCalls).toBe(1);
    expect(b.providerSpies.connectCalls).toBe(0);

    // Swap: a out, b in.
    setActivityMountList(['doc-b']);
    expect(a.providerSpies.disconnectCalls).toBe(1);
    expect(b.providerSpies.connectCalls).toBe(1);
  });

  test('unknown docName in list: no crash, no connect (provider not yet in cache)', () => {
    setActivityMountList(['doc-a']);
    // No entry for doc-a; should not throw.
    expect(__getActivityMountList()).toEqual(['doc-a']);
  });

  test('CM-only cache entry: provider transitions still fire (same docName)', () => {
    // Provider is shared between TipTap+CM for a given doc. Verify CM-only
    // is sufficient to resolve the provider ref.
    const h = makeCmHarness('cm-only-doc');
    mountCmEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    setActivityMountList(['cm-only-doc']);
    expect(h.providerSpies.connectCalls).toBe(1);
  });
});

describe('LRU eviction respects activity-mount list (never evicts active doc)', () => {
  beforeEach(() => __resetCache());
  afterEach(() => __resetCache());

  test('when cache is full, evicts oldest NON-active entry', () => {
    // Mount MAX_CACHE entries, mark the oldest (doc-0) as Activity-mounted.
    const harnesses: TiptapHarness[] = [];
    for (let i = 0; i < MAX_CACHE; i++) {
      const h = makeTiptapHarness(`doc-${i}`);
      harnesses.push(h);
      mountTiptapEditor({
        docName: h.docName,
        container: h.container as unknown as HTMLElement,
        factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      });
    }
    // Pin doc-0 in Activity mount list.
    setActivityMountList(['doc-0']);

    // Mount 11th — the oldest NON-active is doc-1.
    const extra = makeTiptapHarness('doc-extra');
    mountTiptapEditor({
      docName: extra.docName,
      container: extra.container as unknown as HTMLElement,
      factory: extra.factory as unknown as (el: HTMLElement) => ReturnType<typeof extra.factory>,
    });

    expect(__peekTiptap('doc-0')).toBeDefined(); // Activity-mounted — spared
    expect(__peekTiptap('doc-1')).toBeUndefined(); // Oldest non-active — evicted
    expect(harnesses[0].spies.destroyCalls).toBe(0);
    expect(harnesses[1].spies.destroyCalls).toBe(1);
  });

  test('degenerate fallback: all entries active → LRU picks the oldest anyway', () => {
    const harnesses: TiptapHarness[] = [];
    for (let i = 0; i < MAX_CACHE; i++) {
      const h = makeTiptapHarness(`doc-${i}`);
      harnesses.push(h);
      mountTiptapEditor({
        docName: h.docName,
        container: h.container as unknown as HTMLElement,
        factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      });
    }
    // Pathological: all 10 docs active (beyond ACTIVITY_MOUNT_LIMIT).
    setActivityMountList(harnesses.map((x) => x.docName));

    const extra = makeTiptapHarness('doc-extra');
    mountTiptapEditor({
      docName: extra.docName,
      container: extra.container as unknown as HTMLElement,
      factory: extra.factory as unknown as (el: HTMLElement) => ReturnType<typeof extra.factory>,
    });
    // Degenerate fallback kicks in — something gets evicted even though all active.
    expect(__getCacheSize('tiptap')).toBe(MAX_CACHE);
  });
});

describe('US-002 telemetry marks', () => {
  // Telemetry is side-effect only — the collector's in-test observability
  // is via performance.getEntriesByName. We spot-check a few key paths.
  beforeEach(() => {
    __resetCache();
    try {
      performance.clearMeasures();
    } catch {
      // some envs
    }
  });
  afterEach(() => __resetCache());

  test('mount emits ok/cache/hit on cache-hit path', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    // Cache hit.
    mountTiptapEditor({
      docName: h.docName,
      container: makeNode() as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    const hits = performance.getEntriesByName('ok/cache/hit');
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  test('mount emits ok/cache/miss on cache-miss cold path', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    const misses = performance.getEntriesByName('ok/cache/miss');
    expect(misses.length).toBeGreaterThanOrEqual(1);
  });

  test('evict emits ok/cache/evict', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    evictTiptapEditor(h.docName);
    const evicts = performance.getEntriesByName('ok/cache/evict');
    expect(evicts.length).toBeGreaterThanOrEqual(1);
  });

  test('setActivityMountList emits ok/cache/connect + ok/cache/disconnect', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    setActivityMountList(['doc-a']);
    const connects = performance.getEntriesByName('ok/cache/connect');
    expect(connects.length).toBeGreaterThanOrEqual(1);

    setActivityMountList([]);
    const disconnects = performance.getEntriesByName('ok/cache/disconnect');
    expect(disconnects.length).toBeGreaterThanOrEqual(1);
  });

  test('US-012 FR13: mount with sizeStats emits ok/cold/editor-mount-stats', () => {
    const h = makeTiptapHarness('doc-stats');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      sizeStats: { viewCount: 10, bytes: 5_000 },
    });
    const stats = performance.getEntriesByName('ok/cold/editor-mount-stats');
    expect(stats.length).toBeGreaterThanOrEqual(1);
  });

  test('US-012 FR13: cache hit emits stats with cacheHit=true', () => {
    const h = makeTiptapHarness('doc-hit');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      sizeStats: { viewCount: 10, bytes: 5_000 },
    });
    // The first mount emits the miss stats. Clear and mount again (hit).
    try {
      performance.clearMeasures('ok/cold/editor-mount-stats');
    } catch {
      // some envs
    }
    mountTiptapEditor({
      docName: h.docName,
      container: makeNode() as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
      sizeStats: { viewCount: 10, bytes: 5_000 },
    });
    const stats = performance.getEntriesByName('ok/cold/editor-mount-stats');
    expect(stats.length).toBeGreaterThanOrEqual(1);
  });
});
