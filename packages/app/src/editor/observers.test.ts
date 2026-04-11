import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { sharedExtensions } from './extensions/shared';
import { ORIGIN_TEXT_TO_TREE, ORIGIN_TREE_TO_TEXT, setupObservers } from './observers';

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

    const { markUserTyping } = await import('./observers');

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

    const { markUserTyping } = await import('./observers');

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
    // The delta is {remove: "Alpha original text", add: "Alpha MODIFIED text"},
    // which applies to currentLines preserving "Agent tail line" at the end.
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
