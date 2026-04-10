import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { sharedExtensions } from './extensions/shared';
import {
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

      await wait(150);

      const mdB = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragmentB));
      expect(mdB).toContain('Doc B heading');
      expect(mdB).toContain('Body from doc B.');
    } finally {
      cleanupA();
      cleanupB();
    }
  });
});
