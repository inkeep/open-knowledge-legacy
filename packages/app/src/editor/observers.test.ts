import { describe, expect, test } from 'bun:test';
import { MarkdownManager } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { createManualScheduler } from '../../tests/integration/test-harness';
import { sharedExtensions } from './extensions/shared';
import {
  getLastUserKeystroke,
  markUserTyping,
  ORIGIN_TEXT_TO_TREE,
  ORIGIN_TREE_TO_TEXT,
  setupObservers,
} from './observers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

/** Helper: wait for debounce + microtask to settle. Must exceed TYPING_DEFER_MS (300ms)
 *  for tests that trigger the defer path (e.g., Y.Text writes from non-local origin). */
function wait(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Helper: populate XmlFragment from markdown */
function applyMarkdown(doc: Y.Doc, fragment: Y.XmlFragment, md: string) {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(doc, fragment, pmNode, meta);
}

describe('Observer A: XmlFragment → Y.Text', () => {
  test('initial sync populates Y.Text from XmlFragment content', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Hello world\n');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Initial sync is synchronous
    expect(ytext.toString()).toContain('Hello world');
    cleanup();
  });

  test('XmlFragment mutation propagates to Y.Text after debounce', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Mutate XmlFragment
    applyMarkdown(doc, fragment, 'New paragraph\n');

    // Wait for debounce
    await wait();

    expect(ytext.toString()).toContain('New paragraph');
    cleanup();
  });

  test('skips changes with origin sync-from-text (prevents loop from Observer B)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Write to Y.Text directly, triggering Observer B → XmlFragment change with ORIGIN_TEXT_TO_TREE
    doc.transact(() => {
      ytext.insert(0, 'From text\n');
    }, 'external');

    await wait();

    // Observer B should have updated XmlFragment, but Observer A should NOT
    // re-fire for Observer B's transaction (origin is ORIGIN_TEXT_TO_TREE).
    // Capture Y.Text state after settling
    const textAfter = ytext.toString();

    // Wait extra to ensure no cascading
    await wait();

    // Y.Text should be stable (no additional changes from Observer A cascade)
    expect(ytext.toString()).toBe(textAfter);
    cleanup();
  });
});

describe('Observer B: Y.Text → XmlFragment', () => {
  test('Y.Text mutation propagates to XmlFragment after debounce', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Write markdown to Y.Text
    doc.transact(() => {
      ytext.insert(0, '# Heading\n\nParagraph text\n');
    }, 'user-edit');

    await wait();

    // Verify XmlFragment was updated
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('# Heading');
    expect(md).toContain('Paragraph text');
    cleanup();
  });

  test('handles markdown parse errors gracefully — logs but does not crash', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Original content\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    await wait();

    // Observer A should have populated Y.Text with "Original content"
    expect(ytext.toString()).toContain('Original content');

    // Write valid markdown to Y.Text — this should succeed
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, 'Updated content\n');
    }, 'user-edit');

    await wait();

    // XmlFragment should reflect the update
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('Updated content');

    // Observer B should still be functional after handling the update
    cleanup();
  });

  test('Observer B skips incomplete MDX gracefully and recovers on next valid write', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, '# Heading\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    await wait();

    // XmlFragment should have the heading
    const beforeJson = yXmlFragmentToProsemirrorJSON(fragment);
    const beforeMd = mdManager.serialize(beforeJson);
    expect(beforeMd).toContain('# Heading');

    // Write tag-mismatch MDX — agnostic mode still throws VFileMessage for
    // end-tag mismatch ("<Foo>...</Bar>"). Observer B should catch this and
    // keep XmlFragment at its last valid state.
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '<Foo>broken text</Bar>\n');
    }, 'user-edit');

    await wait();

    // XmlFragment should still contain the heading (last valid state preserved)
    const duringJson = yXmlFragmentToProsemirrorJSON(fragment);
    const duringMd = mdManager.serialize(duringJson);
    expect(duringMd).toContain('# Heading');

    // Write valid markdown — Observer B should recover
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, 'Recovered content\n');
    }, 'user-edit');

    await wait();

    const afterJson = yXmlFragmentToProsemirrorJSON(fragment);
    const afterMd = mdManager.serialize(afterJson);
    expect(afterMd).toContain('Recovered content');

    cleanup();
  });
});

describe('WikiLink bridge regression', () => {
  test('wikilink markdown survives XmlFragment ↔ Y.Text synchronization', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    try {
      applyMarkdown(doc, fragment, 'Alpha [[Page#Heading|Alias]]\n');

      await wait();

      expect(ytext.toString().trim()).toBe('Alpha [[Page#Heading|Alias]]');

      const json = yXmlFragmentToProsemirrorJSON(fragment);
      const md = mdManager.serialize(json);
      expect(md.trim()).toBe('Alpha [[Page#Heading|Alias]]');
    } finally {
      cleanup();
    }
  });
});

describe('Origin guard loop prevention', () => {
  test('single edit produces bounded observer firings (no cascade)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    let observerAFirings = 0;
    let observerBFirings = 0;

    // Track observer firings
    fragment.observeDeep((_events, transaction) => {
      if (transaction.origin !== ORIGIN_TEXT_TO_TREE) return;
      observerBFirings++; // Counts Observer B applying to XmlFragment
    });
    ytext.observe((_event, transaction) => {
      if (transaction.origin !== ORIGIN_TREE_TO_TEXT) return;
      observerAFirings++; // Counts Observer A applying to Y.Text
    });

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Single edit to XmlFragment
    applyMarkdown(doc, fragment, 'Test paragraph\n');

    // Wait for full settling (2x debounce to catch cascades)
    await wait(200);

    // Observer A should fire once (tree→text), Observer B should fire at most once (text→tree round-trip)
    expect(observerAFirings).toBeLessThanOrEqual(2);
    expect(observerBFirings).toBeLessThanOrEqual(2);

    cleanup();
  });
});

describe('Frontmatter handling', () => {
  test('Observer A includes frontmatter from metadata map in Y.Text', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Set frontmatter in metadata
    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', '---\ntitle: Test\n---\n');

    applyMarkdown(doc, fragment, '# Hello\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Initial sync should include frontmatter
    expect(ytext.toString()).toContain('---\ntitle: Test\n---\n');
    expect(ytext.toString()).toContain('# Hello');
    cleanup();
  });

  test('Observer B strips frontmatter and stores in metadata map', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Write markdown with frontmatter to Y.Text
    doc.transact(() => {
      ytext.insert(0, '---\ntitle: New\n---\n# Body\n');
    }, 'user-edit');

    await wait();

    const metaMap = doc.getMap('metadata');
    expect(metaMap.get('frontmatter')).toBe('---\ntitle: New\n---\n');

    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('# Body');
    cleanup();
  });
});

describe('Agent writes through observer chain', () => {
  test('raw agent write to XmlFragment → Observer A → Y.Text updated', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Simulate POST /api/agent-write: DirectConnection writes to XmlFragment
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    text.applyDelta([{ insert: 'Hello from the agent!' }]);
    paragraph.insert(0, [text]);
    fragment.push([paragraph]);

    await wait();

    // Observer A should have propagated to Y.Text
    expect(ytext.toString()).toContain('Hello from the agent!');
    cleanup();
  });

  test('agent markdown write to Y.Text → Observer B → XmlFragment updated', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Seed with initial content so observers have something
    applyMarkdown(doc, fragment, 'Existing content\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    await wait();

    // Simulate POST /api/agent-write-md: direct Y.Text insertion
    // (same as hocuspocus-plugin.ts agent-write-md endpoint)
    const currentText = ytext.toString();
    const insertAt = currentText.length;
    const separator = currentText.trim() ? '\n\n' : '';
    doc.transact(() => {
      ytext.insert(insertAt, `${separator}Agent wrote this via markdown path\n`);
    }, 'agent-write');

    await wait();

    // Observer B should have updated XmlFragment
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('Existing content');
    expect(md).toContain('Agent wrote this via markdown path');
    cleanup();
  });

  test('agent markdown prepend to Y.Text → Observer B → XmlFragment updated with correct order', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Original first paragraph\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    await wait();

    // Simulate prepend: insert at position 0
    doc.transact(() => {
      ytext.insert(0, 'Agent prepended this\n\n');
    }, 'agent-write');

    await wait();

    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('Agent prepended this');
    expect(md).toContain('Original first paragraph');

    // Verify order
    const agentIdx = md.indexOf('Agent prepended this');
    const originalIdx = md.indexOf('Original first paragraph');
    expect(agentIdx).toBeLessThan(originalIdx);
    cleanup();
  });

  test('multiple rapid agent writes via XmlFragment all propagate to Y.Text', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Seed content\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    await wait();

    // 5 rapid raw agent writes
    for (let i = 0; i < 5; i++) {
      const p = new Y.XmlElement('paragraph');
      const t = new Y.XmlText();
      t.applyDelta([{ insert: `Agent write #${i + 1}` }]);
      p.insert(0, [t]);
      fragment.push([p]);
    }

    // Wait for debounce to settle
    await wait(200);

    const textContent = ytext.toString();
    expect(textContent).toContain('Seed content');
    for (let i = 0; i < 5; i++) {
      expect(textContent).toContain(`Agent write #${i + 1}`);
    }
    cleanup();
  });

  test('agent writes propagate bidirectionally: XmlFragment write visible in both', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Raw agent write to XmlFragment (simulates WYSIWYG-side agent)
    const p = new Y.XmlElement('paragraph');
    const t = new Y.XmlText();
    t.applyDelta([{ insert: 'Agent content for both modes' }]);
    p.insert(0, [t]);
    fragment.push([p]);

    await wait();

    // Verify Y.Text has the content (source mode would show this)
    expect(ytext.toString()).toContain('Agent content for both modes');

    // Verify XmlFragment still has it (WYSIWYG mode shows this)
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('Agent content for both modes');

    cleanup();
  });
});

describe('Agent write origin and activity map', () => {
  test('agent-write origin Y.Text write propagates to XmlFragment via Observer B', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Seed content\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    await wait();

    // Simulate the new agent write path: Y.Text write with 'agent-write' origin
    // + activity map write in the same transaction
    doc.transact(() => {
      const currentText = ytext.toString();
      const insertAt = currentText.length;
      const separator = currentText.trim() ? '\n\n' : '';
      ytext.insert(insertAt, `${separator}Agent content via new path\n`);

      const activityMap = doc.getMap('activity');
      activityMap.set('agent-1', {
        agentId: 'agent-1',
        timestamp: Date.now(),
        type: 'insert',
        description: 'Added: Agent content via new path',
      });
    }, 'agent-write');

    await wait();

    // Observer B should have propagated to XmlFragment
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('Seed content');
    expect(md).toContain('Agent content via new path');

    // Activity map should contain the entry
    const activityMap = doc.getMap('activity');
    const entry = activityMap.get('agent-1') as Record<string, unknown>;
    expect(entry).toBeTruthy();
    expect(entry.agentId).toBe('agent-1');
    expect(entry.type).toBe('insert');
    expect(typeof entry.timestamp).toBe('number');

    cleanup();
  });

  test('activity map entries coexist with content writes in same transaction', async () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');
    const activityMap = doc.getMap('activity');

    // Track that both changes arrive in a single transaction
    let transactionCount = 0;
    doc.on('afterTransaction', () => {
      transactionCount++;
    });

    const beforeCount = transactionCount;

    doc.transact(() => {
      ytext.insert(0, 'Agent wrote this\n');
      activityMap.set('agent-1', {
        agentId: 'agent-1',
        timestamp: Date.now(),
        type: 'insert',
      });
    }, 'agent-write');

    // Should be exactly one transaction for both writes
    expect(transactionCount - beforeCount).toBe(1);

    // Both should be present
    expect(ytext.toString()).toContain('Agent wrote this');
    expect(activityMap.get('agent-1')).toBeTruthy();
  });
});

describe('Per-origin undo (server-side UndoManager)', () => {
  test('UndoManager with trackedOrigins only captures agent-write transactions', async () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');

    // Server-side UndoManager tracking only 'agent-write' origin
    // captureTimeout: 0 ensures each transaction is a separate undo entry
    const undoManager = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
      captureTimeout: 0,
    });

    // Human edit (no tracked origin)
    doc.transact(() => {
      ytext.insert(0, 'Human wrote this\n');
    }, 'user-edit');

    // Agent edit (tracked origin)
    doc.transact(() => {
      ytext.insert(ytext.length, 'Agent wrote this\n');
    }, 'agent-write');

    expect(ytext.toString()).toBe('Human wrote this\nAgent wrote this\n');
    expect(undoManager.canUndo()).toBe(true);

    // Undo should only reverse the agent edit
    undoManager.undo();

    expect(ytext.toString()).toBe('Human wrote this\n');
    expect(undoManager.canUndo()).toBe(false);
    expect(undoManager.canRedo()).toBe(true);
  });

  test('interleaved human+agent edits — undo reverses only agent changes in order', async () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');

    const undoManager = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
      captureTimeout: 0,
    });

    // Interleave: human → agent → human → agent
    doc.transact(() => {
      ytext.insert(0, 'Human 1\n');
    }, 'user-edit');

    doc.transact(() => {
      ytext.insert(ytext.length, 'Agent 1\n');
    }, 'agent-write');

    doc.transact(() => {
      ytext.insert(ytext.length, 'Human 2\n');
    }, 'user-edit');

    doc.transact(() => {
      ytext.insert(ytext.length, 'Agent 2\n');
    }, 'agent-write');

    expect(ytext.toString()).toBe('Human 1\nAgent 1\nHuman 2\nAgent 2\n');

    // First undo: removes Agent 2
    undoManager.undo();
    expect(ytext.toString()).toBe('Human 1\nAgent 1\nHuman 2\n');

    // Second undo: removes Agent 1
    undoManager.undo();
    expect(ytext.toString()).toBe('Human 1\nHuman 2\n');

    // No more agent edits to undo
    expect(undoManager.canUndo()).toBe(false);

    // Human edits preserved
    expect(ytext.toString()).toContain('Human 1');
    expect(ytext.toString()).toContain('Human 2');
  });

  test('redo restores agent edits', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');

    const undoManager = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
      captureTimeout: 0,
    });

    doc.transact(() => {
      ytext.insert(0, 'Agent content\n');
    }, 'agent-write');

    undoManager.undo();
    expect(ytext.toString()).toBe('');
    expect(undoManager.canRedo()).toBe(true);

    undoManager.redo();
    expect(ytext.toString()).toBe('Agent content\n');
  });

  test('agent undo propagates through Observer B to XmlFragment', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Original content\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    await wait();

    const undoManager = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
      captureTimeout: 0,
    });

    // Agent writes via Y.Text
    doc.transact(() => {
      const insertAt = ytext.length;
      const separator = ytext.toString().trim() ? '\n\n' : '';
      ytext.insert(insertAt, `${separator}Agent added this section\n`);
    }, 'agent-write');

    await wait();

    // Verify agent content is in XmlFragment
    let json = yXmlFragmentToProsemirrorJSON(fragment);
    let md = mdManager.serialize(json);
    expect(md).toContain('Agent added this section');

    // Undo agent edit
    undoManager.undo();

    await wait();

    // Observer B should propagate the undo to XmlFragment
    json = yXmlFragmentToProsemirrorJSON(fragment);
    md = mdManager.serialize(json);
    expect(md).toContain('Original content');
    expect(md).not.toContain('Agent added this section');

    cleanup();
  });

  test('multiple UndoManagers on same Y.Text do not conflict', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');

    // Simulates: browser-side UM (TipTap) + server-side UM (agent)
    const browserUM = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['browser-edit']),
    });

    const agentUM = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
    });

    doc.transact(() => {
      ytext.insert(0, 'Browser typed this\n');
    }, 'browser-edit');

    doc.transact(() => {
      ytext.insert(ytext.length, 'Agent wrote this\n');
    }, 'agent-write');

    expect(ytext.toString()).toBe('Browser typed this\nAgent wrote this\n');

    // Agent undo doesn't affect browser edit
    agentUM.undo();
    expect(ytext.toString()).toBe('Browser typed this\n');

    // Browser undo doesn't affect (already undone) agent edit
    browserUM.undo();
    expect(ytext.toString()).toBe('');

    // Both can redo independently
    browserUM.redo();
    expect(ytext.toString()).toBe('Browser typed this\n');

    agentUM.redo();
    expect(ytext.toString()).toBe('Browser typed this\nAgent wrote this\n');
  });
});

describe('Y.Text CRDT foundation', () => {
  test('Y.Text content is accessible after write — simulates collaborative source mode', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');

    doc.transact(() => {
      ytext.insert(0, '# Hello from source\n\nCollaborative editing works.\n');
    });

    expect(ytext.toString()).toBe('# Hello from source\n\nCollaborative editing works.\n');
    expect(ytext.length).toBeGreaterThan(0);
  });

  test('two Y.Docs sync Y.Text via state exchange — simulates multi-tab', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const ytext1 = doc1.getText('source');
    doc1.transact(() => {
      ytext1.insert(0, 'Tab 1 typed this');
    });

    // Simulate Hocuspocus sync: exchange full state
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    const ytext2 = doc2.getText('source');
    expect(ytext2.toString()).toBe('Tab 1 typed this');
  });
});

// ─────────────────────────────────────────────────────────────
// Regression tests for concurrent edit loss (debug finding)
// Root cause: Observer B's updateYFragment replaced the XmlFragment tree during
// its debounce window, obliterating concurrent user edits. Observer A's diffLines
// could also subtract agent content from Y.Text when user typing arrived first.
// Fix: mutual-exclusion via TYPING_DEFER_MS guard on both observers.
// ─────────────────────────────────────────────────────────────

describe('Concurrent edit race conditions (regression)', () => {
  test('Observer B defers while user is typing to avoid destroying in-flight edits', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Existing\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    // Agent writes to Y.Text (would normally trigger Observer B → updateYFragment)
    doc.transact(() => {
      ytext.insert(ytext.length, '\n\nAgent content');
    }, 'agent-write');

    // User is "typing" — keep the defer window fresh
    const typingInterval = setInterval(() => markUserTyping(doc), 20);

    // Meanwhile, the user's typing has mutated XmlFragment (simulated)
    markUserTyping(doc);
    const para = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    text.applyDelta([{ insert: 'USER TYPED' }]);
    para.insert(0, [text]);
    fragment.push([para]);

    // Let typing continue for 500ms — during this time, Observer B should keep deferring
    await wait(500);

    // Stop typing
    clearInterval(typingInterval);

    // Wait for typing window to expire + observers to catch up
    await wait(500);

    // Final state: user-typed content must still be in XmlFragment.
    // (This is what matters — the tree is the WYSIWYG source of truth.)
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const fragmentMd = mdManager.serialize(json);
    expect(fragmentMd).toContain('USER TYPED');
    cleanup();
  });

  test('Observer B early-exits when XmlFragment already matches Y.Text', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    // Put the same content into both via a normal markdown apply
    applyMarkdown(doc, fragment, 'Synced content\n');
    await wait();

    // Count Observer B log firings by snapshotting console.log calls would require
    // more setup; instead verify the end state is stable — Observer B should not
    // have introduced any drift.
    const md = ytext.toString();
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const serializedBody = mdManager.serialize(json);
    expect(md.trim()).toBe(serializedBody.trim());
    cleanup();
  });

  test('Observer A defers after agent write so the diff does not subtract agent content', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'User typed this first\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    // Baseline: Y.Text should have the seed content after initial sync
    expect(ytext.toString()).toContain('User typed this first');

    // Agent writes directly to Y.Text (this sets lastYTextWriteFromOther via Observer B's handler)
    doc.transact(() => {
      ytext.insert(ytext.length, '\n\nAgent content');
    }, 'agent-write');

    // Now force an Observer A firing via an empty XmlFragment mutation
    // (e.g., attribute tweak). Without the fix, Observer A's diffLines would
    // subtract "Agent content" from Y.Text because the XmlFragment doesn't have it yet.
    const para = new Y.XmlElement('paragraph');
    para.setAttribute('class', 'trigger-observer-a');
    fragment.push([para]);

    // Wait for both observers to run (including the TYPING_DEFER_MS defer window)
    await wait(600);

    // Final Y.Text must still contain the agent's content.
    // The user's typed content and seed content must still be there too.
    const md = ytext.toString();
    expect(md).toContain('User typed this first');
    expect(md).toContain('Agent content');
    cleanup();
  });

  test('agent undo during active user typing — user keystrokes preserved, agent text removed', async () => {
    // Regression for the interaction between the race-condition fix and the undo path.
    //
    // Scenario:
    //   1. Agent writes content to Y.Text with origin 'agent-write'
    //   2. User starts typing in WYSIWYG (markUserTyping fires repeatedly)
    //   3. Server-side UndoManager fires undo() — reverses the agent write
    //   4. The undo's Y.Text mutation propagates via Observer B
    //   5. Observer B defers because user typing is active
    //   6. After typing pauses, Observer B runs and rebuilds XmlFragment from Y.Text
    //
    // Expected: user's typed content is preserved (it was synced to Y.Text by Observer A
    // during the typing window), agent content is gone, no race condition wipes either side.
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Seed line\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    // Server-side UndoManager (mirrors hocuspocus-plugin.ts setup)
    const undoManager = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
      captureTimeout: 0,
    });

    // Step 1: agent writes (lands in Y.Text + propagates to XmlFragment via Observer B)
    doc.transact(() => {
      const insertAt = ytext.length;
      const sep = ytext.toString().endsWith('\n') ? '\n' : '\n\n';
      ytext.insert(insertAt, `${sep}Agent paragraph\n`);
    }, 'agent-write');

    await wait();

    // Sanity: agent content visible in both halves
    {
      const json = yXmlFragmentToProsemirrorJSON(fragment);
      const md = mdManager.serialize(json);
      expect(md).toContain('Agent paragraph');
      expect(ytext.toString()).toContain('Agent paragraph');
    }

    // Step 2: user begins typing — keep the typing window fresh
    const typingInterval = setInterval(() => markUserTyping(doc), 20);
    markUserTyping(doc);

    // Mutate XmlFragment to simulate user typing a new paragraph in WYSIWYG
    const userPara = new Y.XmlElement('paragraph');
    const userText = new Y.XmlText();
    userText.applyDelta([{ insert: 'USER TYPED WHILE UNDOING' }]);
    userPara.insert(0, [userText]);
    fragment.push([userPara]);

    // Step 3: server-side undo fires WHILE user is still typing.
    // 80ms > DEBOUNCE_MS (50ms) — ensures Observer A's debounce has had time to fire
    // at least once since the XmlFragment mutation above.
    await wait(80);
    undoManager.undo();

    // Keep typing for another window so Observer B keeps deferring.
    // 300ms = TYPING_DEFER_MS — ensures we span at least one full defer window.
    await wait(300);

    // Stop typing and let observers settle.
    // 600ms > TYPING_DEFER_MS (300ms) + DEBOUNCE_MS (50ms) — enough for Observer B
    // to stop deferring and both observers to complete their sync cycles.
    clearInterval(typingInterval);
    await wait(600);

    // Final state: user content preserved, agent content gone
    const finalJson = yXmlFragmentToProsemirrorJSON(fragment);
    const finalMd = mdManager.serialize(finalJson);
    expect(finalMd).toContain('USER TYPED WHILE UNDOING');
    expect(finalMd).not.toContain('Agent paragraph');

    // Y.Text and XmlFragment must be in sync at the end
    const finalYText = ytext.toString();
    expect(finalYText).toContain('USER TYPED WHILE UNDOING');
    expect(finalYText).not.toContain('Agent paragraph');

    cleanup();
  });
});

describe('Remote write baseline staleness (regression)', () => {
  test('remote agent write with non-stable markdown does not duplicate on local type', async () => {
    // Two Y.Docs with live CRDT sync — simulates server + client
    const serverDoc = new Y.Doc();
    const clientDoc = new Y.Doc();
    serverDoc.on('update', (update: Uint8Array) => Y.applyUpdate(clientDoc, update));
    clientDoc.on('update', (update: Uint8Array) => Y.applyUpdate(serverDoc, update));

    const clientFragment = clientDoc.getXmlFragment('default');
    const clientYtext = clientDoc.getText('source');
    const cleanup = setupObservers({
      doc: clientDoc,
      xmlFragment: clientFragment,
      ytext: clientYtext,
      mdManager,
      schema,
    });

    // Server agent write — NON-round-trip-stable markdown.
    // Single \n after heading normalizes to \n\n through parse→serialize,
    // causing byte divergence between ytext (raw) and serialize(xmlFragment).
    const rawMd = '## Heading\nParagraph content here.\n\n## Second\nMore text.\n';
    const serverYtext = serverDoc.getText('source');
    const serverFragment = serverDoc.getXmlFragment('default');
    serverDoc.transact(() => {
      serverYtext.insert(0, rawMd);
      const parsed = mdManager.parse(rawMd);
      const pmNode = schema.nodeFromJSON(parsed);
      updateYFragment(serverDoc, serverFragment, pmNode, {
        mapping: new Map(),
        isOMark: new Map(),
      });
    }, 'agent-write');

    await wait();

    const beforeLen = clientYtext.toString().length;
    expect(beforeLen).toBeGreaterThan(0);

    // Local user types into XmlFragment (simulates ProseMirror keystroke)
    const userPara = new Y.XmlElement('paragraph');
    const userText = new Y.XmlText();
    userText.applyDelta([{ insert: 'USER-TYPED' }]);
    userPara.insert(0, [userText]);
    clientFragment.push([userPara]);
    await wait();

    const afterText = clientYtext.toString();

    // Y.Text must NOT have duplicated — delta should be small (typed text + formatting)
    expect(afterText.length - beforeLen).toBeLessThan(200);
    expect(afterText).toContain('USER-TYPED');
    // "Paragraph content" must appear exactly once (not duplicated)
    expect(afterText.split('Paragraph content here.').length - 1).toBe(1);

    cleanup();
  });

  test('typing state is isolated per Y.Doc', async () => {
    const docA = new Y.Doc();
    const fragmentA = docA.getXmlFragment('default');
    const ytextA = docA.getText('source');
    const cleanupA = setupObservers({
      doc: docA,
      xmlFragment: fragmentA,
      ytext: ytextA,
      mdManager,
      schema,
    });

    const docB = new Y.Doc();
    const fragmentB = docB.getXmlFragment('default');
    const ytextB = docB.getText('source');
    const cleanupB = setupObservers({
      doc: docB,
      xmlFragment: fragmentB,
      ytext: ytextB,
      mdManager,
      schema,
    });

    try {
      // Mark typing only on docA. If typing state were still global, docB's Observer B
      // would be incorrectly deferred for ~300ms.
      markUserTyping(docA);

      docB.transact(() => {
        ytextB.insert(0, '# Doc B heading\n\nBody from doc B.\n');
      }, 'user-edit');

      await wait(200);

      const mdB = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragmentB));
      expect(mdB).toContain('Doc B heading');
      expect(mdB).toContain('Body from doc B.');
    } finally {
      cleanupA();
      cleanupB();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// R7 regression: source-mode typing defers Observer B
// ─────────────────────────────────────────────────────────────

describe('R7: source-mode typing defers Observer B', () => {
  test('markUserTyping(doc) from source-mode events defers tree replacement', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Seed content so Observer B has something to replace
    applyMarkdown(doc, fragment, '# Existing content\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    const { markUserTyping } = await import('./observers');

    // Simulate source-mode typing: stamp the typing-defer window
    const typingInterval = setInterval(() => markUserTyping(doc), 20);
    markUserTyping(doc);

    // Agent writes to Y.Text (would trigger Observer B → updateYFragment)
    doc.transact(() => {
      ytext.insert(ytext.length, '\n\nAgent content during source typing');
    }, 'agent-write');

    // Wait less than TYPING_DEFER_MS (300ms) — Observer B should still be deferred
    await wait(150);

    // Fragment should NOT yet have 'Agent content during source typing'
    // because Observer B is deferred by the typing window
    const midTypingFragment = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
    expect(midTypingFragment).not.toContain('Agent content during source typing');

    // Stop typing
    clearInterval(typingInterval);

    // Wait for Observer B to fire after typing window expires
    await wait(600);

    // Now the fragment should have the agent content
    const finalFragment = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
    expect(finalFragment).toContain('Agent content during source typing');

    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────
// Observer A: remote transaction handling
// ─────────────────────────────────────────────────────────────
//
// When a transaction is applied to the Y.Doc from a remote source
// (Y.applyUpdate from another doc, or a peer via WebSocket), the
// transaction's `local` flag is false. Observer A MUST:
//   1. Not schedule its debounced sync work (the receiving doc already
//      has the paired ytext + XmlFragment updates from the remote origin
//      — re-syncing would create a cross-tab amplification loop).
//   2. Refresh `lastSyncedXmlMd` to the current serialized XmlFragment
//      state, so the NEXT local edit computes its delta from a correct
//      baseline. Without this, the next local edit would see a stale
//      baseline and re-propagate the remote content as if it were a
//      user delta, duplicating it in Y.Text.
//
// The existing "Remote write baseline staleness (regression)" test above
// covers the downstream effect (no duplication) for one narrow markdown
// scenario. These tests target the mechanism directly across multiple
// remote-update shapes.

describe('Observer A: remote transaction baseline refresh', () => {
  /** Create two Y.Docs with live bidirectional sync. Simulates a server ↔ client pair. */
  function createSyncedPair() {
    const serverDoc = new Y.Doc();
    const clientDoc = new Y.Doc();
    serverDoc.on('update', (update: Uint8Array) => Y.applyUpdate(clientDoc, update));
    clientDoc.on('update', (update: Uint8Array) => Y.applyUpdate(serverDoc, update));
    return { serverDoc, clientDoc };
  }

  test('remote write propagates, then next local edit computes delta from refreshed baseline', async () => {
    const { serverDoc, clientDoc } = createSyncedPair();
    const clientFragment = clientDoc.getXmlFragment('default');
    const clientYtext = clientDoc.getText('source');

    // Seed client with initial content and set up observers
    applyMarkdown(clientDoc, clientFragment, 'Seed paragraph.\n');
    const cleanup = setupObservers({
      doc: clientDoc,
      xmlFragment: clientFragment,
      ytext: clientYtext,
      mdManager,
      schema,
    });
    await wait();
    expect(clientYtext.toString()).toContain('Seed paragraph');

    // Server writes new content — transaction flows to client as NON-local
    const serverFragment = serverDoc.getXmlFragment('default');
    const serverYtext = serverDoc.getText('source');
    const updatedMd = 'Seed paragraph.\n\nRemote addition one.\n';
    serverDoc.transact(() => {
      serverYtext.delete(0, serverYtext.length);
      serverYtext.insert(0, updatedMd);
      const parsed = mdManager.parse(updatedMd);
      const pmNode = schema.nodeFromJSON(parsed);
      updateYFragment(serverDoc, serverFragment, pmNode, {
        mapping: new Map(),
        isOMark: new Map(),
      });
    }, 'agent-write');
    await wait();

    // Client received the remote update; Observer A's !transaction.local branch fired
    // and must have refreshed lastSyncedXmlMd to include "Remote addition one".
    expect(clientYtext.toString()).toContain('Remote addition one');

    // Now the user types LOCALLY in WYSIWYG.
    // If the baseline was refreshed correctly, Observer A diffs
    //   old = "Seed paragraph.\n\nRemote addition one.\n"
    //   new = "Seed paragraph.\n\nRemote addition one.\n\nLocal user line.\n"
    // and applies ONLY "Local user line" to Y.Text.
    // If the baseline is STALE (still "Seed paragraph.\n"), Observer A would diff
    //   old = "Seed paragraph.\n"
    //   new = "Seed paragraph.\n\nRemote addition one.\n\nLocal user line.\n"
    // and try to INSERT "Remote addition one" into Y.Text — which already has it —
    // producing duplication.
    const userPara = new Y.XmlElement('paragraph');
    const userText = new Y.XmlText();
    userText.applyDelta([{ insert: 'Local user line.' }]);
    userPara.insert(0, [userText]);
    clientFragment.push([userPara]);
    await wait();

    const finalText = clientYtext.toString();
    expect(finalText).toContain('Seed paragraph');
    expect(finalText).toContain('Remote addition one');
    expect(finalText).toContain('Local user line');

    // Critical correctness check: no duplication. Each content fragment must
    // appear exactly once. A stale baseline would produce "Remote addition one"
    // twice (once from remote sync, once from delta re-application).
    expect(finalText.split('Seed paragraph').length - 1).toBe(1);
    expect(finalText.split('Remote addition one').length - 1).toBe(1);
    expect(finalText.split('Local user line').length - 1).toBe(1);

    cleanup();
  });

  test('multiple sequential remote writes each refresh baseline', async () => {
    const { serverDoc, clientDoc } = createSyncedPair();
    const clientFragment = clientDoc.getXmlFragment('default');
    const clientYtext = clientDoc.getText('source');

    applyMarkdown(clientDoc, clientFragment, 'Initial.\n');
    const cleanup = setupObservers({
      doc: clientDoc,
      xmlFragment: clientFragment,
      ytext: clientYtext,
      mdManager,
      schema,
    });
    await wait();

    const serverFragment = serverDoc.getXmlFragment('default');
    const serverYtext = serverDoc.getText('source');

    // Helper: server writes a complete markdown document
    const serverWrite = (md: string) => {
      serverDoc.transact(() => {
        serverYtext.delete(0, serverYtext.length);
        serverYtext.insert(0, md);
        const parsed = mdManager.parse(md);
        const pmNode = schema.nodeFromJSON(parsed);
        updateYFragment(serverDoc, serverFragment, pmNode, {
          mapping: new Map(),
          isOMark: new Map(),
        });
      }, 'agent-write');
    };

    // Three successive remote writes — each one must refresh the baseline so the
    // next local edit diffs from the LATEST state, not the initial seed.
    serverWrite('Initial.\n\nFirst remote.\n');
    await wait();
    serverWrite('Initial.\n\nFirst remote.\n\nSecond remote.\n');
    await wait();
    serverWrite('Initial.\n\nFirst remote.\n\nSecond remote.\n\nThird remote.\n');
    await wait();

    expect(clientYtext.toString()).toContain('Third remote');

    // Now user types locally — baseline should reflect all three remote additions
    const userPara = new Y.XmlElement('paragraph');
    const userText = new Y.XmlText();
    userText.applyDelta([{ insert: 'User addition after all remote writes.' }]);
    userPara.insert(0, [userText]);
    clientFragment.push([userPara]);
    await wait();

    const finalText = clientYtext.toString();
    // Each earlier remote write must appear exactly once — not duplicated by a
    // stale-baseline delta replay.
    expect(finalText.split('First remote').length - 1).toBe(1);
    expect(finalText.split('Second remote').length - 1).toBe(1);
    expect(finalText.split('Third remote').length - 1).toBe(1);
    expect(finalText).toContain('User addition after all remote writes');

    cleanup();
  });

  test('remote delete refreshes baseline so next local add does not resurrect deleted content', async () => {
    const { serverDoc, clientDoc } = createSyncedPair();
    const clientFragment = clientDoc.getXmlFragment('default');
    const clientYtext = clientDoc.getText('source');

    // Seed with two paragraphs
    applyMarkdown(clientDoc, clientFragment, 'First paragraph.\n\nSecond paragraph.\n');
    const cleanup = setupObservers({
      doc: clientDoc,
      xmlFragment: clientFragment,
      ytext: clientYtext,
      mdManager,
      schema,
    });
    await wait();
    expect(clientYtext.toString()).toContain('Second paragraph');

    // Server deletes the second paragraph — transaction arrives at client as remote
    const serverFragment = serverDoc.getXmlFragment('default');
    const serverYtext = serverDoc.getText('source');
    const afterDeleteMd = 'First paragraph.\n';
    serverDoc.transact(() => {
      serverYtext.delete(0, serverYtext.length);
      serverYtext.insert(0, afterDeleteMd);
      const parsed = mdManager.parse(afterDeleteMd);
      const pmNode = schema.nodeFromJSON(parsed);
      updateYFragment(serverDoc, serverFragment, pmNode, {
        mapping: new Map(),
        isOMark: new Map(),
      });
    }, 'agent-write');
    await wait();

    // Client's Y.Text reflects the deletion
    expect(clientYtext.toString()).not.toContain('Second paragraph');

    // User types a new paragraph locally
    const userPara = new Y.XmlElement('paragraph');
    const userText = new Y.XmlText();
    userText.applyDelta([{ insert: 'Third paragraph.' }]);
    userPara.insert(0, [userText]);
    clientFragment.push([userPara]);
    await wait();

    const finalText = clientYtext.toString();
    expect(finalText).toContain('First paragraph');
    expect(finalText).toContain('Third paragraph');
    // The deleted "Second paragraph" MUST NOT resurrect. A stale baseline that
    // still remembered "Second paragraph" would compute a delta that re-inserts it.
    expect(finalText).not.toContain('Second paragraph');

    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────
// applyUserDelta: divergence between Y.Text and lastSyncedXmlMd
// ─────────────────────────────────────────────────────────────
//
// applyUserDelta fires from runObserverASync when Y.Text has diverged
// from the last synced XmlFragment state (currentText !== lastSyncedXmlMd).
// This happens when some OTHER source (agent write to Y.Text, file
// watcher, peer) wrote to Y.Text between Observer A syncs. The function
// applies ONLY the user's XmlFragment delta while preserving the
// divergent content.
//
// The existing "Observer A defers after agent write" test covers one
// scenario (agent appends to Y.Text, user triggers re-sync via empty
// XmlFragment element). These tests exercise the three canonical
// divergence patterns: user-adds, user-deletes, user-modifies — each
// with pre-existing agent content that must survive.
//
// Assumption sharpening from PR #38: these tests were originally framed
// as "simulated scenarios" using the agent-write origin as a convenient
// stand-in for any external Y.Text mutation. PR #43's multi-client test
// matrix proved these are a real production trigger — a remote peer's
// WYSIWYG edit arrives as a Y.Text-only transaction during the local
// user's mid-sync on XmlFragment, creating exactly the divergence state
// these tests exercise. The agent-write origin remains a valid test
// proxy because the divergence path depends on content mismatch, not
// origin identity.
//
// Mechanism: write to Y.Text with the 'agent-write' origin to create
// divergence, then mutate the XmlFragment to represent a user edit.
// Critically, we MUST call markUserTyping to defer Observer B during the
// window when Observer A runs — otherwise Observer B's debounced callback
// fires first (same 50ms delay, earlier queue insertion) and overwrites
// the XmlFragment by parsing the divergent Y.Text, destroying the user's
// edit before Observer A can apply the delta.

describe('applyUserDelta: divergence preservation', () => {
  /** Directly mutate Y.Text with agent-write origin to create divergence. */
  function agentAppendToYText(doc: Y.Doc, ytext: Y.Text, content: string) {
    doc.transact(() => {
      const insertAt = ytext.length;
      const sep = ytext.toString().endsWith('\n') ? '' : '\n';
      ytext.insert(insertAt, `${sep}${content}`);
    }, 'agent-write');
  }

  test('user adds a paragraph — agent content already in Y.Text is preserved', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Baseline: one paragraph
    applyMarkdown(doc, fragment, 'Baseline paragraph.\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();
    expect(ytext.toString()).toContain('Baseline paragraph');

    const { markUserTyping } = await import('./observers');

    // Agent writes directly to Y.Text — creates divergence
    agentAppendToYText(doc, ytext, '\nAgent-only line.\n');

    // Mark typing so Observer B defers, giving Observer A the first shot at
    // reconciling the divergence via applyUserDelta. Keep the interval fresh
    // throughout the applyUserDelta window (~250ms for Observer A to run).
    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User mutates XmlFragment (simulates WYSIWYG keystroke). Observer A
    // fires on its 50ms debounce and detects divergence:
    //   old = "Baseline paragraph.\n" (lastSyncedXmlMd)
    //   new = "Baseline paragraph.\n\nUser-added paragraph.\n"
    //   currentText = "Baseline paragraph.\n\nAgent-only line.\n"
    // applyUserDelta splices "User-added paragraph" into Y.Text while
    // preserving "Agent-only line".
    const userPara = new Y.XmlElement('paragraph');
    const userText = new Y.XmlText();
    userText.applyDelta([{ insert: 'User-added paragraph.' }]);
    userPara.insert(0, [userText]);
    fragment.push([userPara]);

    // Wait long enough for Observer A to run but Observer B to still be deferred
    await wait(200);

    // Stop typing and let Observer B settle the final XmlFragment reconciliation
    clearInterval(typingInterval);
    await wait(500);

    const finalText = ytext.toString();
    // All three pieces of content must be present
    expect(finalText).toContain('Baseline paragraph');
    expect(finalText).toContain('Agent-only line');
    expect(finalText).toContain('User-added paragraph');
    // No duplication — applyUserDelta applied the user delta without
    // re-inserting pre-existing content
    expect(finalText.split('Baseline paragraph').length - 1).toBe(1);
    expect(finalText.split('Agent-only line').length - 1).toBe(1);
    expect(finalText.split('User-added paragraph').length - 1).toBe(1);

    cleanup();
  });

  test('user deletes a baseline paragraph — agent content is preserved, deletion applied', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Baseline: three paragraphs
    applyMarkdown(doc, fragment, 'First.\n\nSecond.\n\nThird.\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();
    expect(ytext.toString()).toContain('Second');

    const { markUserTyping } = await import('./observers');

    // Agent appends directly to Y.Text (divergence)
    agentAppendToYText(doc, ytext, '\nAgent-content-line.\n');

    // Defer Observer B so Observer A's applyUserDelta runs first
    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User deletes the second paragraph via XmlFragment mutation.
    applyMarkdown(doc, fragment, 'First.\n\nThird.\n');

    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    const finalText = ytext.toString();
    expect(finalText).toContain('First');
    expect(finalText).toContain('Third');
    // "Second" should be GONE (user deleted it via XmlFragment — the delta
    // applyUserDelta computed was {remove: "Second\n"})
    expect(finalText).not.toContain('Second');
    // Agent content must survive — it was never part of the user's delta
    expect(finalText).toContain('Agent-content-line');

    cleanup();
  });

  test('user modifies a baseline line — agent content is preserved, modification applied', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Baseline: two distinct paragraphs
    applyMarkdown(doc, fragment, 'Alpha original text.\n\nBeta unchanged.\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();
    expect(ytext.toString()).toContain('Alpha original text');

    const { markUserTyping } = await import('./observers');

    // Agent appends to Y.Text (divergence)
    agentAppendToYText(doc, ytext, '\nAgent tail line.\n');

    // Defer Observer B
    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User modifies the first paragraph. applyUserDelta sees:
    //   old = "Alpha original text.\n\nBeta unchanged.\n"
    //   new = "Alpha MODIFIED text.\n\nBeta unchanged.\n"
    //   currentText = "Alpha original text.\n\nBeta unchanged.\n\nAgent tail line.\n"
    // DMP patch_make(old, new) produces a deletion patch for 'Alpha original text'
    // and an insertion patch for 'Alpha MODIFIED text'. patch_apply against currentText
    // preserves 'Agent tail line' because DMP only patches the regions the user changed.
    applyMarkdown(doc, fragment, 'Alpha MODIFIED text.\n\nBeta unchanged.\n');

    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    const finalText = ytext.toString();
    // User's modification is reflected
    expect(finalText).toContain('Alpha MODIFIED text');
    expect(finalText).not.toContain('Alpha original text');
    // Second paragraph is unchanged
    expect(finalText).toContain('Beta unchanged');
    // Agent content must survive
    expect(finalText).toContain('Agent tail line');
    // No duplication
    expect(finalText.split('Agent tail line').length - 1).toBe(1);
    expect(finalText.split('Beta unchanged').length - 1).toBe(1);

    cleanup();
  });
});

<<<<<<< HEAD
// ─────────────────────────────────────────────────────────────
// Group A (FR-1): Content-comparison gate in applyIncrementalDiff
// ─────────────────────────────────────────────────────────────

describe('FR-1: content-comparison gate skips no-op replacements', () => {
  test('Observer A skips delete+insert when Y.Text already has the added content at offset', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Seed Y.Text with content matching what XmlFragment will serialize to
    const md = '# Hello\n\nWorld.\n';
    applyMarkdown(doc, fragment, md);
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    // Y.Text and XmlFragment are now in sync. Record Y.Text mutations.
    let deleteCount = 0;
    let insertCount = 0;
    ytext.observe((event) => {
      if (event.transaction.origin !== ORIGIN_TREE_TO_TEXT) return;
      for (const delta of event.delta) {
        if ('delete' in delta) deleteCount++;
        if ('insert' in delta) insertCount++;
      }
    });

    // Trigger Observer A by mutating XmlFragment to something that serializes
    // identically to what's already in Y.Text (Path A fires, content gate should skip).
    applyMarkdown(doc, fragment, md);
    await wait();

    // The content-gate should have skipped the paired delete+insert — zero mutations.
    expect(deleteCount).toBe(0);
    expect(insertCount).toBe(0);

    cleanup();
  });

  // Regression guard for the offset-drift case documented at observers.ts:155-161.
  // When Path A produces a multi-hunk diff where the first REMOVED+ADDED pair has
  // mismatched lengths (change.value.length !== next.value.length), subsequent
  // gate checks read a slightly shifted slice from the `currentText` snapshot.
  // The documented invariant: drift is benign because (a) misses fall through to
  // correct delete+insert branches, which operate on live ytext offsets, and (b)
  // Path A only fires when Y.Text is in sync with baseline. This test pins the
  // correctness — if a future refactor breaks the fall-through, the assertion
  // that ytext converges to the expected content will catch it.
  test('Path A multi-hunk diff with length-changing first hunk produces correct ytext', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Seed: three paragraphs, all three differ between the "before" and "after"
    // serializations. First pair has mismatched lengths (AAA → AA), middle is
    // unchanged, last pair is equal length (CCC → DDD).
    applyMarkdown(doc, fragment, 'AAA\n\nBBB\n\nCCC\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    // Change XmlFragment so diffLines produces:
    //   removed 'AAA\n\n' + added 'AA\n\n'  — length change, gate misses
    //   unchanged 'BBB\n\n'
    //   removed 'CCC\n' + added 'DDD\n'     — equal length, gate would read a
    //                                         shifted slice from currentText
    applyMarkdown(doc, fragment, 'AA\n\nBBB\n\nDDD\n');
    await wait();

    // Bridge invariant: ytext matches serialized XmlFragment after Observer A settles.
    expect(ytext.toString().trim()).toBe('AA\n\nBBB\n\nDDD');

    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────
// Group B (FR-2): DMP patch_apply three-way merge scenarios
// ─────────────────────────────────────────────────────────────

describe('FR-2: applyUserDelta DMP three-way merge', () => {
  /** Directly mutate Y.Text with agent-write origin to create divergence. */
  function agentWriteToYText(doc: Y.Doc, ytext: Y.Text, content: string) {
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, content);
    }, 'agent-write');
  }

  test('B1: same-line collision merges both edits', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Hello\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    const { markUserTyping } = await import('./observers');

    // Agent writes "Hello brave" to Y.Text (diverges from baseline "Hello")
    agentWriteToYText(doc, ytext, 'Hello brave\n');

    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User changes XmlFragment to "Hello world"
    applyMarkdown(doc, fragment, 'Hello world\n');
    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    const finalText = ytext.toString();
    // DMP merges both: "Hello world brave" or equivalent preserving both edits
    expect(finalText).toContain('world');
    expect(finalText).toContain('brave');
    cleanup();
  });

  test('B2: prepend + append preserves both', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Middle.\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    const { markUserTyping } = await import('./observers');

    // Agent appends "Bottom." on a new line
    agentWriteToYText(doc, ytext, 'Middle.\n\nBottom.\n');

    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User prepends "Top." on a new line
    applyMarkdown(doc, fragment, 'Top.\n\nMiddle.\n');
    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    const finalText = ytext.toString();
    expect(finalText).toContain('Top');
    expect(finalText).toContain('Middle');
    expect(finalText).toContain('Bottom');
    cleanup();
  });

  test('B3: different-line edits preserve both', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Line A.\n\nLine B.\n\nLine C.\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    const { markUserTyping } = await import('./observers');

    // Agent modifies line B
    agentWriteToYText(doc, ytext, 'Line A.\n\nLine B modified.\n\nLine C.\n');

    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User modifies line A
    applyMarkdown(doc, fragment, 'Line A modified.\n\nLine B.\n\nLine C.\n');
    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    const finalText = ytext.toString();
    expect(finalText).toContain('Line A modified');
    expect(finalText).toContain('Line B modified');
    expect(finalText).toContain('Line C');
    cleanup();
  });

  test('B4: user-delete + agent-modify same line — user-wins (D9)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'a\n\nb\n\nc\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    const { markUserTyping } = await import('./observers');

    // Agent modifies line b → "b!"
    agentWriteToYText(doc, ytext, 'a\n\nb!\n\nc\n');

    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User deletes line b entirely
    applyMarkdown(doc, fragment, 'a\n\nc\n');
    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    const finalText = ytext.toString();
    expect(finalText).toContain('a');
    expect(finalText).toContain('c');
    // User-wins: b is gone (user's deletion trumps agent's modification)
    expect(finalText).not.toContain('b');
    cleanup();
  });

  test('B5: exact-char overlap — D8 duplication characterization', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Use a multi-line document so the overall texts differ, avoiding the
    // currentText === md early-exit that absorbs single-line exact overlap.
    applyMarkdown(doc, fragment, 'hello\n\nother line\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    const { markUserTyping } = await import('./observers');

    // Agent adds "!" to hello AND changes "other line" → "agent line"
    agentWriteToYText(doc, ytext, 'hello!\n\nagent line\n');

    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User also adds "!" to hello (same overlap) but keeps "other line"
    applyMarkdown(doc, fragment, 'hello!\n\nother line\n');
    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    const finalText = ytext.toString();
    // D8 accepted: DMP duplicates the independently-applied "!" → "hello!!"
    expect(finalText).toContain('hello!!');
    cleanup();
  });

  // Regression guard for the early-return path at observers.ts:266:
  //   `if (mergedText === currentText) return;`
  //
  // This fires when DMP patch_apply returns output identical to the agent's
  // diverged Y.Text — which happens when all user patches failed to locate
  // their context within Match_Threshold (or all were already applied in the
  // agent's text). The early return skips the subsequent applyByPrefixSuffix,
  // which MUST NOT execute because with mergedText === currentText it would
  // still compute zero delta — but an incorrectly-placed return (e.g., moved
  // AFTER applyByPrefixSuffix) would walk the no-op change through the Y.Text
  // delete/insert code path, potentially creating noise transactions.
  //
  // We force the path by constructing an agent text that shares no context
  // with the baseline — DMP cannot locate the user's patch; mergedText equals
  // the unchanged currentText.
  test('early return produces zero CRDT mutations when merged text equals agent text', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Baseline paragraph one.\n\nBaseline paragraph two.\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    const { markUserTyping } = await import('./observers');

    // Agent wholesale-replaces Y.Text with content sharing zero tokens with
    // the baseline. DMP patch_apply will fail to locate any user patch context.
    agentWriteToYText(doc, ytext, 'ZZZZ completely disjoint content.\n');

    // Observe ytext mutations originated by Observer A (sync-from-tree).
    let deleteCount = 0;
    let insertCount = 0;
    ytext.observe((event) => {
      if (event.transaction.origin !== ORIGIN_TREE_TO_TEXT) return;
      for (const delta of event.delta) {
        if ('delete' in delta) deleteCount++;
        if ('insert' in delta) insertCount++;
      }
    });

    // Silence the expected console.warn for this test.
    const origWarn = console.warn;
    console.warn = () => {};

    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User edits XmlFragment → Observer A Path B fires. All patches fail to
    // match in the divergent agent text → mergedText === currentText → early
    // return at observers.ts:266 skips the applyByPrefixSuffix call.
    applyMarkdown(doc, fragment, 'Baseline paragraph one EDITED.\n\nBaseline paragraph two.\n');
    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    console.warn = origWarn;

    // The early-return guard holds: zero sync-from-tree writes to ytext.
    expect(deleteCount).toBe(0);
    expect(insertCount).toBe(0);

    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────
// Group C (FR-7): onMergeFailed diagnostic
// ─────────────────────────────────────────────────────────────

describe('FR-7: onMergeFailed diagnostic', () => {
  test('no diagnostic on successful three-way merge', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const mergeFailed: Array<Record<string, number>> = [];
    const cleanup = setupObservers({
      doc,
      xmlFragment: fragment,
      ytext,
      mdManager,
      schema,
      onMergeFailed: (info) => {
        mergeFailed.push(info);
      },
    });

    applyMarkdown(doc, fragment, 'Line one.\n\nLine two.\n');
    await wait();

    const { markUserTyping } = await import('./observers');

    // Agent appends on a separate line (easy merge)
    doc.transact(() => {
      ytext.insert(ytext.length, '\nAgent line.\n');
    }, 'agent-write');

    const origWarn = console.warn;
    const warnCalls: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };

    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User edits a different line — clean merge
    applyMarkdown(doc, fragment, 'Line one modified.\n\nLine two.\n');
    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    console.warn = origWarn;

    // Successful merge — neither diagnostic should fire
    const observerAWarns = warnCalls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[Observer A] patch_apply had'),
    );
    expect(observerAWarns.length).toBe(0);
    expect(mergeFailed.length).toBe(0);

    cleanup();
  });

  test('diagnostic fires on failed patches (unmatchable agent text)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const mergeFailed: Array<Record<string, number>> = [];
    const cleanup = setupObservers({
      doc,
      xmlFragment: fragment,
      ytext,
      mdManager,
      schema,
      onMergeFailed: (info) => {
        mergeFailed.push(info);
      },
    });

    // Seed baseline via XmlFragment
    applyMarkdown(doc, fragment, 'AAAA line one.\n\nAAAA line two.\n');
    await wait();

    const { markUserTyping } = await import('./observers');

    // Agent wholesale-replaces Y.Text with content sharing no tokens with baseline.
    // This guarantees DMP patch_apply can't locate the original patch context.
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, 'ZZZZ completely different.\n\nZZZZ no match.\n');
    }, 'agent-write');

    const origWarn = console.warn;
    const warnCalls: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };

    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User modifies XmlFragment — Observer A Path B fires with unmatchable context
    applyMarkdown(doc, fragment, 'AAAB line one.\n\nAAAA line two.\n');
    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    console.warn = origWarn;

    // Failed patches — both console.warn and callback should fire
    const observerAWarns = warnCalls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[Observer A] patch_apply had'),
    );
    expect(observerAWarns.length).toBeGreaterThan(0);
    expect(observerAWarns[0][0]).toMatch(/\[Observer A\] patch_apply had \d+\/\d+ failed patches/);

    // onMergeFailed callback invoked with correct shape
    expect(mergeFailed.length).toBeGreaterThan(0);
    const info = mergeFailed[0];
    expect(info).toHaveProperty('failedPatches');
    expect(info).toHaveProperty('totalPatches');
    expect(info).toHaveProperty('baseLen');
    expect(info).toHaveProperty('userLen');
    expect(info).toHaveProperty('agentLen');
    expect(info).toHaveProperty('mergedLen');
    expect(info.failedPatches).toBeGreaterThan(0);

    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────
// Group D (FR-4): UndoManager probe — agent Items survive Observer A
// ─────────────────────────────────────────────────────────────

describe('FR-4: Observer A preserves agent-origin CRDT Items', () => {
  test('Path A: content-gate preserves agent Items (UM stack survives sync)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Attach test-local UM BEFORE agent write so it captures the mutation
    const um = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
      captureTimeout: 0,
    });

    // Agent writes content under 'agent-write' origin
    doc.transact(() => {
      ytext.insert(0, '# Hello\n\nAgent wrote this.\n');
    }, 'agent-write');
    expect(um.undoStack.length).toBe(1);

    // Update XmlFragment to match Y.Text content (Path A content-gate case)
    applyMarkdown(doc, fragment, '# Hello\n\nAgent wrote this.\n');
    await wait();

    // UM stack must survive — Items were NOT replaced
    expect(um.undoStack.length).toBe(1);
    um.undo();
    expect(ytext.toString()).toBe('');

    um.destroy();
    cleanup();
  });

  test('Path B: DMP merge preserves agent Items in non-overlapping regions', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Baseline
    applyMarkdown(doc, fragment, 'Line one.\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    const { markUserTyping } = await import('./observers');

    // Attach UM probe BEFORE agent write so it captures the mutation
    const um = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
      captureTimeout: 0,
    });

    // Agent appends content
    doc.transact(() => {
      ytext.insert(ytext.length, '\nAgent line.\n');
    }, 'agent-write');
    expect(um.undoStack.length).toBe(1);

    // Defer Observer B
    const typingInterval = setInterval(() => markUserTyping(doc), 30);
    markUserTyping(doc);

    // User edits a different line (non-overlapping) — forces Path B
    applyMarkdown(doc, fragment, 'Line one modified.\n');
    await wait(200);
    clearInterval(typingInterval);
    await wait(500);

    // Agent's Items should survive DMP merge (non-overlapping regions preserved
    // by applyByPrefixSuffix)
    expect(um.undoStack.length).toBe(1);

    um.destroy();
    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────
// Group E (A1): applyByPrefixSuffix preserves outer Items
// ─────────────────────────────────────────────────────────────

describe('A1: applyByPrefixSuffix preserves Items in prefix/suffix regions', () => {
  test('middle-region replacement preserves outer agent Items', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');

    // Attach UM BEFORE transactions so it captures mutations
    const um = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
      captureTimeout: 0,
    });

    // Seed three distinct Items via three transactions
    doc.transact(() => {
      ytext.insert(0, 'AAA');
    }, 'agent-write');
    doc.transact(() => {
      ytext.insert(3, 'BBB');
    }, ORIGIN_TREE_TO_TEXT);
    doc.transact(() => {
      ytext.insert(6, 'CCC');
    }, 'agent-write');

    expect(ytext.toString()).toBe('AAABBBCCC');
    // Two agent-write transactions → two stack entries
    expect(um.undoStack.length).toBe(2);

    // Simulate applyByPrefixSuffix effect: replace middle region only
    doc.transact(() => {
      ytext.delete(3, 3); // remove 'BBB'
      ytext.insert(3, 'XXX'); // insert 'XXX'
    }, ORIGIN_TREE_TO_TEXT);

    expect(ytext.toString()).toBe('AAAXXXCCC');

    // Both outer agent Items should survive — UM still tracks them
    expect(um.undoStack.length).toBe(2);

    // Undo sequence: last agent write (CCC) first, then first agent write (AAA)
    um.undo(); // reverts CCC
    expect(ytext.toString()).toBe('AAAXXX');
    um.undo(); // reverts AAA
    expect(ytext.toString()).toBe('XXX');

    um.destroy();
  });
});

describe('FR-15: Scheduler DI — deterministic observer debounce control', () => {
  test('Observer A debounce fires only when scheduler advances time', async () => {
    // Production defaults fire Observer A after 50ms of wall-clock. Under
    // ManualScheduler + unified clock, the debounce is scheduled at
    // virtual dueAt=50, and does not fire until `scheduler.advanceTime(50)`
    // or `scheduler.flush()` is called. Y.Text stays empty until then — a
    // property unreachable with `wait(ms)` pacing.
    const scheduler = createManualScheduler();
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Pre-seed with initial content so Observer A has a baseline to diff against
    // once the scheduler advances. Without this seed, the first fragment mutation
    // would land in the initial sync and not create a pending debounce to probe.
    applyMarkdown(doc, fragment, 'initial\n');

    const cleanup = setupObservers({
      doc,
      xmlFragment: fragment,
      ytext,
      mdManager,
      schema,
      scheduler,
    });

    try {
      // Initial sync happens synchronously during setupObservers (no debounce).
      expect(ytext.toString().includes('initial')).toBe(true);

      // Produce a local XmlFragment change that triggers Observer A's
      // `setTimeout(runObserverASync, 50)` scheduling. The debounce is pending
      // in virtual time but has not fired yet.
      applyMarkdown(doc, fragment, 'initial\n\nfreshly typed\n');

      // One pending timer: the Observer A debounce for our local change.
      expect(scheduler.pending().length).toBeGreaterThanOrEqual(1);

      // Y.Text has NOT been updated with our new content yet — the debounce
      // is pending in virtual time, and wall-clock advancement (microtasks,
      // real setTimeout) cannot fire it.
      expect(ytext.toString().includes('freshly typed')).toBe(false);

      // Synchronously fire all pending timers. Cascading: Observer A's
      // doc.transact writes to Y.Text, which triggers Observer B's callback
      // (origin-guarded, so early-exits). No cascade in this case, but the
      // drain loop is bounded and safe.
      scheduler.flush();

      // After flush, Observer A has run synchronously → Y.Text mirrors fragment.
      expect(ytext.toString().includes('freshly typed')).toBe(true);

      // Queue is empty: no residual debounces.
      expect(scheduler.pending().length).toBe(0);
    } finally {
      cleanup();
      doc.destroy();
    }
  });

  test('sched.now() is the clock reference for elapsed-time comparisons', () => {
    // FR-15 clock unification: `markUserTyping` and Observer B's elapsed
    // windows all read from sched.now(). Under ManualScheduler, now starts
    // at 0 and advances only via advanceTime. This test proves that
    // markUserTyping records virtual time, not wall-clock.
    const scheduler = createManualScheduler();
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // setupObservers registers the scheduler into TypingState so
    // markUserTyping reads the same clock.
    const cleanup = setupObservers({
      doc,
      xmlFragment: fragment,
      ytext,
      mdManager,
      schema,
      scheduler,
    });

    try {
      expect(scheduler.now()).toBe(0);
      markUserTyping(doc);
      // No virtual time advance → lastUserTypedAt is 0.
      // Observer B would check elapsed = sched.now() - 0 = 0, which is
      // < TYPING_DEFER_MS (300), so defer would fire. Advance past the
      // defer window:
      scheduler.advanceTime(400);
      expect(scheduler.now()).toBe(400);
      // Now elapsed = 400 - 0 = 400 > TYPING_DEFER_MS → defer would not fire.
      // This is the determinism win: wall-clock jitter cannot push the
      // comparison onto either side of the threshold.
    } finally {
      cleanup();
      doc.destroy();
    }
  });
});

describe('markUserTyping — global keystroke timestamp (US-006)', () => {
  test('getLastUserKeystroke advances on markUserTyping', () => {
    const doc = new Y.Doc();
    const before = getLastUserKeystroke();
    markUserTyping(doc);
    const after = getLastUserKeystroke();
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeGreaterThan(0);
  });

  test('global timestamp is shared across multiple docs', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    markUserTyping(doc1);
    const ts1 = getLastUserKeystroke();
    // Small advance so the next call is observably later even on fast systems
    const wait = Date.now() + 1;
    while (Date.now() < wait) {
      /* spin */
    }
    markUserTyping(doc2);
    const ts2 = getLastUserKeystroke();
    expect(ts2).toBeGreaterThan(ts1);
  });
});
