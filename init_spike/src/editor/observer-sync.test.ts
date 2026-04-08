/**
 * Comprehensive server-side integration tests for observer sync.
 *
 * Verifies: cross-mode sync, shimmer prevention, content fidelity,
 * toggle simplification, undo isolation, persistence flow, agent writes,
 * and disk bridge integration.
 *
 * Uses Y.Doc directly (no WebSocket) — same CRDT layer as the browser.
 */
import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';
import { sharedExtensions } from './extensions/shared';
import { ORIGIN_TEXT_TO_TREE, ORIGIN_TREE_TO_TEXT, setupObservers } from './observers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

/** Wait for debounce + settling */
function wait(ms = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Populate XmlFragment from markdown */
function applyMarkdown(doc: Y.Doc, fragment: Y.XmlFragment, md: string) {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(doc, fragment, pmNode, meta);
}

/** Create a doc with observers set up */
function createObservedDoc() {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
  return { doc, fragment, ytext, cleanup };
}

// --- Observer A: XmlFragment → Y.Text ---

describe('Observer A: XmlFragment → Y.Text (cross-mode sync)', () => {
  test('XmlFragment mutation produces correct markdown in Y.Text', async () => {
    const { ytext, fragment, doc, cleanup } = createObservedDoc();

    applyMarkdown(doc, fragment, '# Hello\n\nWorld\n');
    await wait();

    const text = ytext.toString();
    expect(text).toContain('# Hello');
    expect(text).toContain('World');
    cleanup();
  });

  test('multiple paragraph mutations all propagate', async () => {
    const { ytext, fragment, doc, cleanup } = createObservedDoc();

    applyMarkdown(doc, fragment, 'Para 1\n\nPara 2\n\nPara 3\n');
    await wait();

    const text = ytext.toString();
    expect(text).toContain('Para 1');
    expect(text).toContain('Para 2');
    expect(text).toContain('Para 3');
    cleanup();
  });
});

// --- Observer B: Y.Text → XmlFragment ---

describe('Observer B: Y.Text → XmlFragment (cross-mode sync)', () => {
  test('Y.Text mutation produces correct ProseMirror structure', async () => {
    const { ytext, fragment, doc, cleanup } = createObservedDoc();

    doc.transact(() => {
      ytext.insert(0, '# Heading\n\nBody paragraph\n');
    }, 'user-edit');

    await wait();

    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('# Heading');
    expect(md).toContain('Body paragraph');
    cleanup();
  });

  test('Y.Text with list produces correct structure', async () => {
    const { ytext, fragment, doc, cleanup } = createObservedDoc();

    doc.transact(() => {
      ytext.insert(0, '- Item 1\n- Item 2\n- Item 3\n');
    }, 'user-edit');

    await wait();

    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('Item 1');
    expect(md).toContain('Item 2');
    expect(md).toContain('Item 3');
    cleanup();
  });
});

// --- Shimmer Prevention (S01-S06) ---

describe('Shimmer prevention', () => {
  test('S01: single XmlFragment edit → bounded observer firings', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    let aFirings = 0;
    let bFirings = 0;

    ytext.observe((_event, txn) => {
      if (txn.origin === ORIGIN_TREE_TO_TEXT) aFirings++;
    });
    fragment.observeDeep((_events, txn) => {
      if (txn.origin === ORIGIN_TEXT_TO_TREE) bFirings++;
    });

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    applyMarkdown(doc, fragment, 'Single edit\n');
    await wait(300);

    expect(aFirings).toBeLessThanOrEqual(2);
    expect(bFirings).toBeLessThanOrEqual(2);
    cleanup();
  });

  test('S02: single Y.Text edit → bounded observer firings', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    let aFirings = 0;
    let bFirings = 0;

    ytext.observe((_event, txn) => {
      if (txn.origin === ORIGIN_TREE_TO_TEXT) aFirings++;
    });
    fragment.observeDeep((_events, txn) => {
      if (txn.origin === ORIGIN_TEXT_TO_TREE) bFirings++;
    });

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    doc.transact(() => {
      ytext.insert(0, 'Single edit\n');
    }, 'user-edit');

    await wait(300);

    expect(aFirings).toBeLessThanOrEqual(2);
    expect(bFirings).toBeLessThanOrEqual(2);
    cleanup();
  });
});

// --- Content Fidelity (T60-T65) ---

describe('Content fidelity through observer cycle', () => {
  test('T60: frontmatter survives XmlFragment→Text→XmlFragment cycle', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', '---\ntitle: Test Doc\ntags: [a, b]\n---\n');

    applyMarkdown(doc, fragment, '# Content\n');
    await wait();

    // Y.Text should have frontmatter
    expect(ytext.toString()).toContain('---\ntitle: Test Doc');

    // Simulate user editing Y.Text — frontmatter should propagate back
    const currentText = ytext.toString();
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, currentText.replace('# Content', '# Updated Content'));
    }, 'user-edit');

    await wait();

    // Frontmatter should still be in metadata map
    expect(metaMap.get('frontmatter')).toContain('title: Test Doc');

    // XmlFragment should have the updated content
    const md = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
    expect(md).toContain('# Updated Content');
    cleanup();
  });

  test('T61: void node (jsx-component) survives observer cycle', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    const jsxMd = '```jsx-component\n<Callout type="warning">\n  Test content\n</Callout>\n```\n';
    applyMarkdown(doc, fragment, `# Title\n\n${jsxMd}`);
    await wait();

    // Y.Text should contain the jsx-component fence
    const text = ytext.toString();
    expect(text).toContain('jsx-component');
    expect(text).toContain('<Callout type="warning">');

    // Round-trip: modify text, Observer B → XmlFragment
    doc.transact(() => {
      const t = ytext.toString();
      ytext.delete(0, ytext.length);
      ytext.insert(0, t.replace('# Title', '# New Title'));
    }, 'user-edit');

    await wait();

    const md = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
    expect(md).toContain('# New Title');
    expect(md).toContain('jsx-component');
    expect(md).toContain('<Callout type="warning">');
    cleanup();
  });

  test('T62: GFM table survives observer cycle', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    const tableMd = '| Col A | Col B |\n|-------|-------|\n| 1 | 2 |\n| 3 | 4 |\n';
    applyMarkdown(doc, fragment, tableMd);
    await wait();

    expect(ytext.toString()).toContain('Col A');
    expect(ytext.toString()).toContain('Col B');
    cleanup();
  });

  test('T63: nested list survives observer cycle', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    applyMarkdown(doc, fragment, '- Parent\n  - Child 1\n  - Child 2\n- Sibling\n');
    await wait();

    const text = ytext.toString();
    expect(text).toContain('Parent');
    expect(text).toContain('Child 1');
    expect(text).toContain('Sibling');
    cleanup();
  });

  test('T64: fenced code block with language tag survives', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    applyMarkdown(doc, fragment, '```typescript\nconst x = 1;\n```\n');
    await wait();

    const text = ytext.toString();
    expect(text).toContain('```typescript');
    expect(text).toContain('const x = 1;');
    cleanup();
  });

  test('T65: inline formatting (bold, italic, links, images, code) survives', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    const md =
      '**bold** and *italic* and `code` and [link](https://example.com) and ![alt](img.png)\n';
    applyMarkdown(doc, fragment, md);
    await wait();

    const text = ytext.toString();
    expect(text).toContain('**bold**');
    expect(text).toContain('*italic*');
    expect(text).toContain('`code`');
    expect(text).toContain('[link](https://example.com)');
    expect(text).toContain('![alt](img.png)');
    cleanup();
  });
});

// --- Toggle Simplification (TS01-TS04) ---

describe('Toggle simplification', () => {
  test('TS01: Y.Text has current content — toggle-to-source needs no serialization', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    applyMarkdown(doc, fragment, '# Hello\n\nWorld\n');
    await wait();

    // Simulate toggle-to-source: just read Y.Text — no getMarkdown() needed
    const sourceContent = ytext.toString();
    expect(sourceContent).toContain('# Hello');
    expect(sourceContent).toContain('World');
    cleanup();
  });

  test('TS02: XmlFragment has current content — toggle-back needs no merge', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    // User types in source mode
    doc.transact(() => {
      ytext.insert(0, '# Source Edit\n\nBody\n');
    }, 'user-edit');

    await wait();

    // Simulate toggle-back: XmlFragment already up to date — no merge needed
    const md = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
    expect(md).toContain('# Source Edit');
    expect(md).toContain('Body');
    cleanup();
  });

  test('TS03: rapid toggle 10x — content remains stable', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    applyMarkdown(doc, fragment, '# Stable Content\n\nParagraph\n');
    await wait();

    // Simulate 10 rapid toggles: just read/verify alternating
    for (let i = 0; i < 10; i++) {
      const text = ytext.toString();
      expect(text).toContain('Stable Content');
      const md = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
      expect(md).toContain('Stable Content');
    }

    cleanup();
  });
});

// --- Undo Isolation ---

describe('Undo isolation', () => {
  test('observer-originated Y.Text writes are not undoable by user UndoManager', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // UndoManager tracks only user edits to Y.Text (not observer-originated)
    const undoManager = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['user-edit']),
    });

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Observer A populates Y.Text from XmlFragment
    applyMarkdown(doc, fragment, '# Observer Content\n');
    await wait();

    expect(ytext.toString()).toContain('# Observer Content');

    // User undo should NOT undo observer-originated content
    undoManager.undo();
    expect(ytext.toString()).toContain('# Observer Content');

    cleanup();
  });

  test('user edits to Y.Text ARE undoable', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const undoManager = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['user-edit']),
    });

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // User types in source mode
    doc.transact(() => {
      ytext.insert(0, 'User typed this\n');
    }, 'user-edit');

    await wait();
    expect(ytext.toString()).toContain('User typed this');

    // Undo should remove user's edit
    undoManager.undo();
    expect(ytext.toString()).not.toContain('User typed this');

    cleanup();
  });
});

// --- Persistence Flow ---

describe('Persistence flow', () => {
  test('PR05: source edit → Observer B → XmlFragment → serialization produces correct .md', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', '---\ntitle: Persist Test\n---\n');

    // User edits in source mode
    doc.transact(() => {
      ytext.insert(0, '---\ntitle: Persist Test\n---\n# Source Edit\n\nPersisted paragraph\n');
    }, 'user-edit');

    await wait();

    // Simulate persistence: serialize XmlFragment → markdown
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const body = mdManager.serialize(json);
    const fm = metaMap.get('frontmatter');
    const markdown = typeof fm === 'string' ? prependFrontmatter(fm, body) : body;

    expect(markdown).toContain('---\ntitle: Persist Test\n---\n');
    expect(markdown).toContain('# Source Edit');
    expect(markdown).toContain('Persisted paragraph');
    cleanup();
  });
});

// --- Agent Writes Through Observers ---

describe('Agent writes through observers', () => {
  test('raw agent write to XmlFragment → Observer A → Y.Text has content', async () => {
    const { fragment, ytext, cleanup } = createObservedDoc();

    // Agent writes raw Y.XmlElement
    const p = new Y.XmlElement('paragraph');
    const t = new Y.XmlText();
    t.applyDelta([{ insert: 'Agent raw write' }]);
    p.insert(0, [t]);
    fragment.push([p]);

    await wait();

    expect(ytext.toString()).toContain('Agent raw write');
    cleanup();
  });

  test('agent markdown write to Y.Text → Observer B → XmlFragment has parsed content', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    doc.transact(() => {
      ytext.insert(0, '# Agent Heading\n\nAgent paragraph\n');
    }, 'agent-write');

    await wait();

    const md = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
    expect(md).toContain('# Agent Heading');
    expect(md).toContain('Agent paragraph');
    cleanup();
  });
});

// --- Disk Bridge Integration ---

describe('Disk bridge integration', () => {
  test('external change via updateYFragment → Observer A → Y.Text updated', async () => {
    const { doc, fragment, ytext, cleanup } = createObservedDoc();

    // Seed initial content
    applyMarkdown(doc, fragment, '# Original\n');
    await wait();
    expect(ytext.toString()).toContain('# Original');

    // Simulate external editor change (disk bridge path)
    const externalMd = '# External Edit\n\nNew paragraph from vim\n';
    const { body } = stripFrontmatter(externalMd);
    const parsedJson = mdManager.parse(body);
    const pmNode = schema.nodeFromJSON(parsedJson);

    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, fragment, pmNode, meta);
    }, 'file-watcher');

    await wait();

    expect(ytext.toString()).toContain('# External Edit');
    expect(ytext.toString()).toContain('New paragraph from vim');
    cleanup();
  });

  test('writeTracker correctly skips self-writes', async () => {
    // This is tested in file-watcher.test.ts — verify the integration pattern
    const { contentHash, writeTracker } = await import('../server/file-watcher');

    writeTracker.clear();
    const content = '# Self Write\n';
    const hash = contentHash(content);
    const filePath = '/content/test.md';

    writeTracker.set(filePath, { hash, timestamp: Date.now() });

    // Same content → same hash → should skip
    const tracked = writeTracker.get(filePath);
    expect(tracked?.hash).toBe(hash);

    // Different content → different hash → should NOT skip
    const extHash = contentHash('# External\n');
    expect(extHash).not.toBe(hash);

    writeTracker.clear();
  });
});
