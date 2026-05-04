import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { EditorView } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Editor } from '@tiptap/core';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import {
  __getActivityMountList,
  __getCacheOrder,
  __getCacheSize,
  __peekCm,
  __peekTiptap,
  __resetCacheForTests,
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
  subscribePoolEviction,
  type TiptapCacheEntry,
  VIEW_COUNT_CACHE_THRESHOLD,
} from './editor-cache';

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

describe('CACHE_ENABLED constant', () => {
  test('is true by default (V2 ships enabled)', () => {
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
    __resetCacheForTests();
  });
  afterEach(() => {
    __resetCacheForTests();
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

    expect(h.factoryCallCount).toBe(1);
    expect(second).toBe(first);
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
    h.editorDom.scrollTop = 1234;
    parkTiptapEditor(entry);
    expect(entry.scrollTop).toBe(1234);

    const newContainer = makeNode();
    mountTiptapEditor({
      docName: h.docName,
      container: newContainer as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(newContainer.scrollTop).toBe(1234);
  });

  test('mount: cache-hit restores focus ONLY when editor owned focus at park time (Major #11)', () => {
    const h = makeTiptapHarness('doc-a');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    const focusCountAfterFirstMount = h.spies.focusCalls;

    parkTiptapEditor(entry);
    expect(entry.hadFocus).toBe(false);
    const newContainerA = makeNode();
    mountTiptapEditor({
      docName: h.docName,
      container: newContainerA as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(h.spies.focusCalls).toBe(focusCountAfterFirstMount);

    entry.hadFocus = true;
    parkTiptapEditor(entry);
    entry.hadFocus = true;
    const newContainerB = makeNode();
    const beforeB = h.spies.focusCalls;
    mountTiptapEditor({
      docName: h.docName,
      container: newContainerB as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(h.spies.focusCalls).toBeGreaterThan(beforeB);
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

    expect(h.editorDom.parentElement).not.toBe(h.container);
    expect(h.container.children).not.toContain(h.editorDom);
    expect(h.spies.destroyCalls).toBe(0);
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
    const ydocDestroySpy = mock(h.ydoc.destroy.bind(h.ydoc));
    h.ydoc.destroy = ydocDestroySpy;

    const result = evictTiptapEditor(h.docName);

    expect(result).toBe(true);
    expect(h.spies.destroyCalls).toBe(1);
    expect(h.providerSpies.destroyCalls).toBe(1);
    expect(ydocDestroySpy).toHaveBeenCalledTimes(1);
    expect(__peekTiptap(h.docName)).toBeUndefined();
    expect(__getCacheSize('tiptap')).toBe(0);

    expect(evictTiptapEditor(h.docName)).toBe(false);
    expect(h.spies.destroyCalls).toBe(1);
  });

  test('evict: return false for unknown docName', () => {
    expect(evictTiptapEditor('never-existed')).toBe(false);
  });
});

describe('TipTap cache — mount-park-mount round-trip (US-001 AC 9)', () => {
  beforeEach(() => __resetCacheForTests());
  afterEach(() => __resetCacheForTests());

  test('doc content preserved (Y.XmlFragment + Y.Text)', () => {
    const h = makeTiptapHarness('doc-a');
    const entry = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });

    h.ytext.insert(0, 'hello from round-trip');
    const ytextBefore = entry.ytext.toString();
    const fragBefore = h.fragment.toString();
    expect(ytextBefore).toBe('hello from round-trip');

    parkTiptapEditor(entry);

    const newContainer = makeNode();
    const re = mountTiptapEditor({
      docName: h.docName,
      container: newContainer as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(re).toBe(entry);
    expect(re.ytext.toString()).toBe(ytextBefore);
    expect(h.fragment.toString()).toBe(fragBefore);

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
      expect(h.editorDom.parentElement).toBe(ctr);
    }

    expect(h.factoryCallCount).toBe(1);
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

    const peekA = __peekTiptap(a.docName);
    const peekB = __peekTiptap(b.docName);
    if (!peekA || !peekB) throw new Error('cache entries missing');
    parkTiptapEditor(peekA);
    parkTiptapEditor(peekB);

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
  beforeEach(() => __resetCacheForTests());
  afterEach(() => __resetCacheForTests());

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

    expect(harnesses[0].spies.destroyCalls).toBe(0);

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
    expect(__getCacheOrder('tiptap')).toEqual(['doc-0', 'doc-1', 'doc-2']);

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
  beforeEach(() => __resetCacheForTests());
  afterEach(() => __resetCacheForTests());

  test('__uncached entry: park() destroys the editor (pre-V2 behavior)', () => {
    const h = makeTiptapHarness('doc-a');
    h.container.appendChild(h.editorDom);
    const entry: TiptapCacheEntry = {
      editor: h.editor,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: h.docName,
      __uncached: true,
    };

    expect(h.spies.destroyCalls).toBe(0);
    parkTiptapEditor(entry);
    expect(h.spies.destroyCalls).toBe(1);
    expect(entry.activeMountKey).toBeNull();
  });

  test('__uncached entry: NOT stored in cache (verified by __peekTiptap)', () => {
    expect(__getCacheSize('tiptap')).toBe(0);
    const h = makeTiptapHarness('doc-a');
    const entry: TiptapCacheEntry = {
      editor: h.editor,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: h.docName,
      __uncached: true,
    };
    expect(__peekTiptap(h.docName)).toBeUndefined();
    parkTiptapEditor(entry);
    expect(h.spies.destroyCalls).toBe(1);
  });
});

describe('TipTap cache — undoManager.restore cleanup on destroy', () => {
  let originalGetState: typeof yUndoPluginKey.getState;

  beforeEach(() => {
    __resetCacheForTests();
    originalGetState = yUndoPluginKey.getState;
    yUndoPluginKey.getState = ((state: unknown) => {
      const tagged = state as { __testUndoManager?: unknown } | null | undefined;
      if (tagged?.__testUndoManager) {
        return { undoManager: tagged.__testUndoManager } as ReturnType<typeof originalGetState>;
      }
      return originalGetState.call(yUndoPluginKey, state as never);
    }) as typeof originalGetState;
  });

  afterEach(() => {
    yUndoPluginKey.getState = originalGetState;
    __resetCacheForTests();
  });

  function attachStubUndoManager(
    editor: Editor,
  ): { restore: unknown } & { __initialRestore: () => string } {
    const initialRestore = () => 'leak-marker';
    const undoManager = {
      restore: initialRestore as unknown,
      __initialRestore: initialRestore,
    };
    (editor as unknown as { state: unknown }).state = {
      __testUndoManager: undoManager,
    };
    return undoManager;
  }

  test('parkTiptapEditor on __uncached entry clears undoManager.restore after destroy', () => {
    const h = makeTiptapHarness('doc-a');
    const undoManager = attachStubUndoManager(h.editor);
    expect(undoManager.restore).toBe(undoManager.__initialRestore);

    const entry: TiptapCacheEntry = {
      editor: h.editor,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: h.docName,
      __uncached: true,
    };

    parkTiptapEditor(entry);

    expect(h.spies.destroyCalls).toBe(1);
    expect(undoManager.restore).toBeUndefined();
    expect(entry.activeMountKey).toBeNull();
  });

  test('evictTiptapEditor clears undoManager.restore after destroy', () => {
    const h = makeTiptapHarness('doc-a');
    const undoManager = attachStubUndoManager(h.editor);
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(undoManager.restore).toBe(undoManager.__initialRestore);

    const result = evictTiptapEditor(h.docName);

    expect(result).toBe(true);
    expect(h.spies.destroyCalls).toBe(1);
    expect(h.providerSpies.destroyCalls).toBe(1);
    expect(undoManager.restore).toBeUndefined();
    expect(__peekTiptap(h.docName)).toBeUndefined();
  });

  test('cleanup is resilient when editor.destroy() throws', () => {
    const h = makeTiptapHarness('doc-a');
    const undoManager = attachStubUndoManager(h.editor);
    (h.editor as unknown as { destroy: () => void }).destroy = () => {
      h.spies.destroyCalls++;
      throw new Error('throwing-proxy');
    };

    const entry: TiptapCacheEntry = {
      editor: h.editor,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: h.docName,
      __uncached: true,
    };

    expect(() => parkTiptapEditor(entry)).not.toThrow();
    expect(h.spies.destroyCalls).toBe(1);
    expect(undoManager.restore).toBeUndefined();
  });

  test('evictTiptapEditor capture-before-destroy ordering: state inaccessible AFTER destroy still clears restore', () => {
    const h = makeTiptapHarness('doc-a');
    const undoManager = attachStubUndoManager(h.editor);
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    (h.editor as unknown as { destroy: () => void }).destroy = () => {
      h.spies.destroyCalls++;
      Object.defineProperty(h.editor, 'state', {
        get() {
          throw new Error('state after destroy — TipTap throwing proxy');
        },
        configurable: true,
      });
    };

    const result = evictTiptapEditor(h.docName);

    expect(result).toBe(true);
    expect(h.spies.destroyCalls).toBe(1);
    expect(h.providerSpies.destroyCalls).toBe(1);
    expect(undoManager.restore).toBeUndefined();
    expect(__peekTiptap(h.docName)).toBeUndefined();
  });

  test('evictTiptapEditor cleanup is resilient when editor.destroy() throws', () => {
    const h = makeTiptapHarness('doc-a');
    const undoManager = attachStubUndoManager(h.editor);
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    (h.editor as unknown as { destroy: () => void }).destroy = () => {
      h.spies.destroyCalls++;
      throw new Error('throwing-proxy');
    };

    const result = evictTiptapEditor(h.docName);

    expect(result).toBe(true);
    expect(h.spies.destroyCalls).toBe(1);
    expect(h.providerSpies.destroyCalls).toBe(1);
    expect(undoManager.restore).toBeUndefined();
    expect(__peekTiptap(h.docName)).toBeUndefined();
  });

  test('capture-before-destroy ordering: state inaccessible AFTER destroy still clears restore', () => {
    const h = makeTiptapHarness('doc-a');
    const undoManager = attachStubUndoManager(h.editor);
    (h.editor as unknown as { destroy: () => void }).destroy = () => {
      h.spies.destroyCalls++;
      Object.defineProperty(h.editor, 'state', {
        get() {
          throw new Error('state after destroy — TipTap throwing proxy');
        },
        configurable: true,
      });
    };

    const entry: TiptapCacheEntry = {
      editor: h.editor,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: h.docName,
      __uncached: true,
    };

    parkTiptapEditor(entry);

    expect(h.spies.destroyCalls).toBe(1);
    expect(undoManager.restore).toBeUndefined();
  });

  test('no crash when editor.state throws (TipTap throwing-proxy mid-teardown)', () => {
    const h = makeTiptapHarness('doc-a');
    Object.defineProperty(h.editor, 'state', {
      get() {
        throw new Error('throwing-proxy state');
      },
      configurable: true,
    });

    const entry: TiptapCacheEntry = {
      editor: h.editor,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: h.docName,
      __uncached: true,
    };

    expect(() => parkTiptapEditor(entry)).not.toThrow();
    expect(h.spies.destroyCalls).toBe(1);
  });

  test('no-op when undoManager cannot be located (e.g. editor without y-undo plugin)', () => {
    const h = makeTiptapHarness('doc-a');
    const entry: TiptapCacheEntry = {
      editor: h.editor,
      ydoc: h.ydoc,
      ytext: h.ytext,
      provider: h.provider,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: h.docName,
      __uncached: true,
    };

    expect(() => parkTiptapEditor(entry)).not.toThrow();
    expect(h.spies.destroyCalls).toBe(1);
  });
});

describe('CM6 cache — lifecycle', () => {
  beforeEach(() => __resetCacheForTests());
  afterEach(() => __resetCacheForTests());

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

  test('mount after park: restores scrollTop (Major #11: focus only when editor owned focus)', () => {
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
    expect(h.spies.focusCalls).toBe(focusBefore);

    entry.hadFocus = true;
    const ctr2 = makeNode();
    const before2 = h.spies.focusCalls;
    mountCmEditor({
      docName: h.docName,
      container: ctr2 as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(h.spies.focusCalls).toBeGreaterThan(before2);
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
      hadFocus: false,
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

describe('STOP rule: editor-cache never calls editor.mount() / editor.unmount()', () => {
  test('source contains no reference to editor.mount( or editor.unmount(', async () => {
    const sourceText = await Bun.file(`${import.meta.dir}/editor-cache.ts`).text();
    const code = sourceText
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');
    expect(/editor\.mount\s*\(/.test(code)).toBe(false);
    expect(/editor\.unmount\s*\(/.test(code)).toBe(false);
  });
});

describe('Module-level cache survives simulated remounts', () => {
  beforeEach(() => __resetCacheForTests());
  afterEach(() => __resetCacheForTests());

  test('double-mount with same docName (StrictMode style) does not leak', () => {
    const h = makeTiptapHarness('doc-a');
    const first = mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    parkTiptapEditor(first);
    const ctr = makeNode();
    const second = mountTiptapEditor({
      docName: h.docName,
      container: ctr as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    expect(second).toBe(first);
    expect(__getCacheSize('tiptap')).toBe(1);
    expect(h.factoryCallCount).toBe(1);
  });
});

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
  test('viewCount=0 sentinel does not activate the viewCount branch', () => {
    expect(shouldCacheEditor({ viewCount: 0, bytes: 100 })).toBe(true);
    expect(shouldCacheEditor({ viewCount: 0, bytes: 600_000 })).toBe(false);
  });
});

describe('mountTiptapEditor — size gate falls through to __uncached', () => {
  beforeEach(() => __resetCacheForTests());
  afterEach(() => __resetCacheForTests());

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
  beforeEach(() => __resetCacheForTests());
  afterEach(() => __resetCacheForTests());

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

describe('setActivityMountList — connect/disconnect transitions', () => {
  beforeEach(() => __resetCacheForTests());
  afterEach(() => __resetCacheForTests());

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

    setActivityMountList(['doc-b']);
    expect(a.providerSpies.disconnectCalls).toBe(1);
    expect(b.providerSpies.connectCalls).toBe(1);
  });

  test('unknown docName in list: no crash, no connect (provider not yet in cache)', () => {
    setActivityMountList(['doc-a']);
    expect(__getActivityMountList()).toEqual(['doc-a']);
  });

  test('CM-only cache entry: provider transitions still fire (same docName)', () => {
    const h = makeCmHarness('cm-only-doc');
    mountCmEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    setActivityMountList(['cm-only-doc']);
    expect(h.providerSpies.connectCalls).toBe(1);
  });

  test('pool-resident-but-not-V2-cached doc: demote still disconnects via ProviderPool fallback', () => {
    const ydoc = new Y.Doc();
    const { provider, spies } = makeFakeProvider(ydoc);
    const fakePool = {
      entries: new Map<string, { provider: HocuspocusProvider }>([
        ['orphan-doc', { provider }],
      ]) as ReadonlyMap<string, { provider: HocuspocusProvider }>,
      onEvict: (_cb: (docName: string) => void) => () => {},
    };
    const unsubscribe = subscribePoolEviction(fakePool);
    try {
      expect(__peekTiptap('orphan-doc')).toBeUndefined();
      expect(__peekCm('orphan-doc')).toBeUndefined();

      setActivityMountList(['orphan-doc']);
      expect(spies.connectCalls).toBe(1);

      setActivityMountList([]);
      expect(spies.disconnectCalls).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  test('subscribePoolEviction unsubscribe clears pool reference: subsequent demote no-ops without pool', () => {
    const ydoc = new Y.Doc();
    const { provider, spies } = makeFakeProvider(ydoc);
    const fakePool = {
      entries: new Map<string, { provider: HocuspocusProvider }>([
        ['orphan-doc', { provider }],
      ]) as ReadonlyMap<string, { provider: HocuspocusProvider }>,
      onEvict: (_cb: (docName: string) => void) => () => {},
    };
    const unsubscribe = subscribePoolEviction(fakePool);
    setActivityMountList(['orphan-doc']);
    expect(spies.connectCalls).toBe(1);

    unsubscribe();

    setActivityMountList([]);
    expect(spies.disconnectCalls).toBe(0);
  });
});

describe('LRU eviction respects activity-mount list (never evicts active doc)', () => {
  beforeEach(() => __resetCacheForTests());
  afterEach(() => __resetCacheForTests());

  test('when cache is full, evicts oldest NON-active entry', () => {
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
    setActivityMountList(['doc-0']);

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
    setActivityMountList(harnesses.map((x) => x.docName));

    const extra = makeTiptapHarness('doc-extra');
    mountTiptapEditor({
      docName: extra.docName,
      container: extra.container as unknown as HTMLElement,
      factory: extra.factory as unknown as (el: HTMLElement) => ReturnType<typeof extra.factory>,
    });
    expect(__getCacheSize('tiptap')).toBe(MAX_CACHE);
  });
});

describe('US-002 telemetry marks', () => {
  beforeEach(() => {
    __resetCacheForTests();
    try {
      performance.clearMeasures();
    } catch {}
  });
  afterEach(() => __resetCacheForTests());

  test('mount emits ok/cache/hit on cache-hit path', () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
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

  test('setActivityMountList emits ok/cache/connect + ok/cache/disconnect', async () => {
    const h = makeTiptapHarness('doc-a');
    mountTiptapEditor({
      docName: h.docName,
      container: h.container as unknown as HTMLElement,
      factory: h.factory as unknown as (el: HTMLElement) => ReturnType<typeof h.factory>,
    });
    setActivityMountList(['doc-a']);
    await Promise.resolve();
    const connects = performance.getEntriesByName('ok/cache/connect');
    expect(connects.length).toBeGreaterThanOrEqual(1);

    setActivityMountList([]);
    const disconnects = performance.getEntriesByName('ok/cache/disconnect');
    expect(disconnects.length).toBeGreaterThanOrEqual(1);
  });

  test('connect telemetry is mutually exclusive: reject emits connect-failed only (review Pass-1 Minor #3)', async () => {
    const rejectingProvider = {
      document: new Y.Doc(),
      destroy: mock(() => {}),
      connect: mock(() => Promise.reject(new Error('connect failed'))),
      disconnect: mock(() => {}),
    } as unknown as HocuspocusProvider;
    const dom = makeNode();
    const editor = {
      editorView: { dom, scrollDOM: dom },
      commands: { focus: mock(() => {}) },
      destroy: mock(() => {}),
    } as unknown as Editor;
    const ytext = rejectingProvider.document.getText('source');
    mountTiptapEditor({
      docName: 'doc-reject',
      container: makeNode() as unknown as HTMLElement,
      factory: () => ({
        editor,
        ydoc: rejectingProvider.document,
        ytext,
        provider: rejectingProvider,
      }),
    });
    performance.clearMarks('ok/cache/connect');
    performance.clearMarks('ok/cache/connect-failed');
    setActivityMountList(['doc-reject']);
    await Promise.resolve();
    await Promise.resolve();
    const connects = performance.getEntriesByName('ok/cache/connect');
    const failed = performance.getEntriesByName('ok/cache/connect-failed');
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(connects.length).toBe(0);
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
    try {
      performance.clearMeasures('ok/cold/editor-mount-stats');
    } catch {}
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
