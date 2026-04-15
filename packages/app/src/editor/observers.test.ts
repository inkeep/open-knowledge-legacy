// ─────────────────────────────────────────────────────────────
// Server-authoritative observer architecture (precedent #14)
// ─────────────────────────────────────────────────────────────
//
// Cross-CRDT sync (Y.XmlFragment ↔ Y.Text) is now performed exclusively
// by the server observer (packages/server/src/server-observers.ts).
// The client observer (`setupObservers` in observers.ts) no longer writes
// to Y.Text (Observer A) or XmlFragment (Observer B). It retains:
//   - Baseline tracking (lastSyncedXmlMd) for read-side reasoning
//   - Origin guards (skip self-originated transactions)
//   - Remote transaction baseline refresh (Bug-B fix)
//   - Typing-defer state management (markUserTyping / per-doc TypingState)
//   - Parse validation in Observer B (diagnostic only, no tree writes)
//
// Tests that asserted cross-CRDT write behavior are marked test.skip with
// a pointer to server-observers.test.ts where that coverage now lives.
// Tests that validate client-side behavior still exercised by the observer
// (baseline tracking, origin guards, typing isolation, scheduler DI) are
// retained and adapted to the new architecture.
// ─────────────────────────────────────────────────────────────

import { describe, expect, test } from 'bun:test';
import { MarkdownManager } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { createManualScheduler } from '../../tests/integration/test-harness';
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
  test('initial sync does NOT populate Y.Text (server-authoritative)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, 'Hello world\n');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Under server-authoritative architecture, client observer does not
    // write Y.Text — initial population is the server's responsibility.
    expect(ytext.toString()).toBe('');
    cleanup();
  });

  test('XmlFragment mutation does NOT propagate to Y.Text (server-authoritative)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Mutate XmlFragment
    applyMarkdown(doc, fragment, 'New paragraph\n');

    // Wait for debounce
    await wait();

    // Client observer no longer writes Y.Text — content stays empty.
    expect(ytext.toString()).toBe('');
    cleanup();
  });

  test('skips changes with origin sync-from-text (prevents loop from Observer B)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Write to Y.Text directly
    doc.transact(() => {
      ytext.insert(0, 'From text\n');
    }, 'external');

    await wait();

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
  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('Y.Text mutation propagates to XmlFragment after debounce', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    doc.transact(() => {
      ytext.insert(0, '# Heading\n\nParagraph text\n');
    }, 'user-edit');

    await wait();

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

    // Write tag-mismatch MDX — agnostic mode still throws VFileMessage for
    // end-tag mismatch ("<Foo>...</Bar>"). Observer B should catch this and
    // not crash (diagnostic-only parse, no tree write).
    doc.transact(() => {
      ytext.insert(0, '<Foo>broken text</Bar>\n');
    }, 'user-edit');

    await wait();

    // XmlFragment is unchanged — Observer B no longer writes to it.
    // The test validates Observer B does not crash on parse errors.
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const md = mdManager.serialize(json);
    expect(md).toContain('Original content');

    cleanup();
  });

  test('Observer B skips incomplete MDX gracefully and recovers on next valid write', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    applyMarkdown(doc, fragment, '# Heading\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    await wait();

    // XmlFragment should have the heading (set by applyMarkdown, not observer)
    const beforeJson = yXmlFragmentToProsemirrorJSON(fragment);
    const beforeMd = mdManager.serialize(beforeJson);
    expect(beforeMd).toContain('# Heading');

    // Write tag-mismatch MDX — Observer B catches parse error without crashing
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '<Foo>broken text</Bar>\n');
    }, 'user-edit');

    await wait();

    // XmlFragment retains last state — Observer B no longer writes to it
    const duringJson = yXmlFragmentToProsemirrorJSON(fragment);
    const duringMd = mdManager.serialize(duringJson);
    expect(duringMd).toContain('# Heading');

    // Write valid markdown — Observer B parses successfully (diagnostic only)
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, 'Recovered content\n');
    }, 'user-edit');

    await wait();

    // XmlFragment still has heading — no cross-CRDT write from client observer
    const afterJson = yXmlFragmentToProsemirrorJSON(fragment);
    const afterMd = mdManager.serialize(afterJson);
    expect(afterMd).toContain('# Heading');

    cleanup();
  });
});

describe('WikiLink bridge regression', () => {
  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('wikilink markdown survives XmlFragment ↔ Y.Text synchronization', async () => {
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
  test('single edit produces zero cross-CRDT writes (server-authoritative)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    let observerAFirings = 0;
    let observerBFirings = 0;

    // Track observer firings — under server-authoritative architecture,
    // neither Observer A nor Observer B produces cross-CRDT writes.
    fragment.observeDeep((_events, transaction) => {
      if (transaction.origin !== ORIGIN_TEXT_TO_TREE) return;
      observerBFirings++;
    });
    ytext.observe((_event, transaction) => {
      if (transaction.origin !== ORIGIN_TREE_TO_TEXT) return;
      observerAFirings++;
    });

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    // Single edit to XmlFragment
    applyMarkdown(doc, fragment, 'Test paragraph\n');

    // Wait for full settling (2x debounce to catch cascades)
    await wait(200);

    // Neither observer writes to the other CRDT — zero firings.
    expect(observerAFirings).toBe(0);
    expect(observerBFirings).toBe(0);

    cleanup();
  });
});

describe('Frontmatter handling', () => {
  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('Observer A includes frontmatter from metadata map in Y.Text', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', '---\ntitle: Test\n---\n');

    applyMarkdown(doc, fragment, '# Hello\n');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    expect(ytext.toString()).toContain('---\ntitle: Test\n---\n');
    expect(ytext.toString()).toContain('# Hello');
    cleanup();
  });

  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('Observer B strips frontmatter and stores in metadata map', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

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
  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('raw agent write to XmlFragment → Observer A → Y.Text updated', async () => {});

  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('agent markdown write to Y.Text → Observer B → XmlFragment updated', async () => {});

  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('agent markdown prepend to Y.Text → Observer B → XmlFragment updated with correct order', async () => {});

  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('multiple rapid agent writes via XmlFragment all propagate to Y.Text', async () => {});

  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('agent writes propagate bidirectionally: XmlFragment write visible in both', async () => {});
});

describe('Agent write origin and activity map', () => {
  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('agent-write origin Y.Text write propagates to XmlFragment via Observer B', async () => {});

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

  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('agent undo propagates through Observer B to XmlFragment', async () => {});

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
  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer B no longer writes XmlFragment, so typing-defer is moot for tree writes
  test.skip('Observer B defers while user is typing to avoid destroying in-flight edits', async () => {});

  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('Observer B early-exits when XmlFragment already matches Y.Text', async () => {});

  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer A no longer writes Y.Text, so agent-content subtraction is impossible
  test.skip('Observer A defers after agent write so the diff does not subtract agent content', async () => {});

  // Superseded by server-authoritative observer (server-observers.test.ts)
  test.skip('agent undo during active user typing — user keystrokes preserved, agent text removed', async () => {});
});

describe('Remote write baseline staleness (regression)', () => {
  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer A no longer writes Y.Text, so duplication from stale baseline is impossible
  test.skip('remote agent write with non-stable markdown does not duplicate on local type', async () => {});

  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer B no longer writes XmlFragment, so typing-defer isolation is moot for tree writes
  test.skip('typing state is isolated per Y.Doc', async () => {});
});

// ─────────────────────────────────────────────────────────────
// R7 regression: source-mode typing defers Observer B
// ─────────────────────────────────────────────────────────────

describe('R7: source-mode typing defers Observer B', () => {
  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer B no longer writes XmlFragment, so typing-defer for tree replacement is moot
  test.skip('markUserTyping(doc) from source-mode events defers tree replacement', async () => {});
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
  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer A no longer writes Y.Text, so baseline-refresh duplication prevention
  // is moot — there are no Y.Text writes to duplicate. The baseline tracking logic
  // remains for read-side reasoning but has no observable cross-CRDT effect to assert.
  test.skip('remote write propagates, then next local edit computes delta from refreshed baseline', async () => {});
  test.skip('multiple sequential remote writes each refresh baseline', async () => {});
  test.skip('remote delete refreshes baseline so next local add does not resurrect deleted content', async () => {});
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
  // Superseded by server-authoritative observer (server-observers.test.ts)
  // applyUserDelta was the client-side Observer A DMP three-way merge path.
  // Observer A no longer writes Y.Text, so divergence preservation is moot.
  test.skip('user adds a paragraph — agent content already in Y.Text is preserved', async () => {});
  test.skip('user deletes a baseline paragraph — agent content is preserved, deletion applied', async () => {});
  test.skip('user modifies a baseline line — agent content is preserved, modification applied', async () => {});
});

// ─────────────────────────────────────────────────────────────
// Group A (FR-1): Content-comparison gate in applyIncrementalDiff
// ─────────────────────────────────────────────────────────────

describe('FR-1: content-comparison gate skips no-op replacements', () => {
  test('Observer A produces zero ORIGIN_TREE_TO_TEXT mutations (server-authoritative)', async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    const md = '# Hello\n\nWorld.\n';
    applyMarkdown(doc, fragment, md);
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
    await wait();

    // Record Y.Text mutations from Observer A origin.
    let deleteCount = 0;
    let insertCount = 0;
    ytext.observe((event) => {
      if (event.transaction.origin !== ORIGIN_TREE_TO_TEXT) return;
      for (const delta of event.delta) {
        if ('delete' in delta) deleteCount++;
        if ('insert' in delta) insertCount++;
      }
    });

    // Trigger Observer A by mutating XmlFragment.
    applyMarkdown(doc, fragment, md);
    await wait();

    // Under server-authoritative architecture, Observer A never writes Y.Text.
    expect(deleteCount).toBe(0);
    expect(insertCount).toBe(0);

    cleanup();
  });

  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer A no longer writes Y.Text, so multi-hunk diff correctness is moot
  test.skip('Path A multi-hunk diff with length-changing first hunk produces correct ytext', async () => {});
});

// ─────────────────────────────────────────────────────────────
// Group B (FR-2): DMP patch_apply three-way merge scenarios
// ─────────────────────────────────────────────────────────────

describe('FR-2: applyUserDelta DMP three-way merge', () => {
  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer A no longer writes Y.Text via DMP three-way merge. The merge logic
  // has moved to the server observer. All B1-B5 tests are cross-CRDT write tests.
  test.skip('B1: same-line collision merges both edits', async () => {});
  test.skip('B2: prepend + append preserves both', async () => {});
  test.skip('B3: different-line edits preserve both', async () => {});
  test.skip('B4: user-delete + agent-modify same line — user-wins (D9)', async () => {});
  test.skip('B5: exact-char overlap — D8 duplication characterization', async () => {});
  test.skip('early return produces zero CRDT mutations when merged text equals agent text', async () => {});
});

// ─────────────────────────────────────────────────────────────
// Group C (FR-7): onMergeFailed diagnostic
// ─────────────────────────────────────────────────────────────

describe('FR-7: onMergeFailed diagnostic', () => {
  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer A no longer performs DMP three-way merges, so merge diagnostics are moot
  test.skip('no diagnostic on successful three-way merge', async () => {});
  test.skip('diagnostic fires on failed patches (unmatchable agent text)', async () => {});
});

// ─────────────────────────────────────────────────────────────
// Group D (FR-4): UndoManager probe — agent Items survive Observer A
// ─────────────────────────────────────────────────────────────

describe('FR-4: Observer A preserves agent-origin CRDT Items', () => {
  // Superseded by server-authoritative observer (server-observers.test.ts)
  // Observer A no longer writes Y.Text, so Item preservation through Observer A
  // sync cycles is moot. Item preservation is now the server observer's concern.
  test.skip('Path A: content-gate preserves agent Items (UM stack survives sync)', async () => {});
  test.skip('Path B: DMP merge preserves agent Items in non-overlapping regions', async () => {});
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
  test('Observer A debounce fires only when scheduler advances time (baseline update only)', async () => {
    // Under server-authoritative architecture, Observer A only updates the
    // baseline (lastSyncedXmlMd) — it does not write Y.Text. The scheduler
    // DI still controls when the debounced baseline update fires.
    const scheduler = createManualScheduler();
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Pre-seed with initial content so Observer A has a baseline to diff against
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
      // Y.Text is NOT populated by client observer (server-authoritative)
      expect(ytext.toString()).toBe('');

      // Produce a local XmlFragment change that triggers Observer A's debounce
      applyMarkdown(doc, fragment, 'initial\n\nfreshly typed\n');

      // One pending timer: the Observer A debounce for our local change.
      expect(scheduler.pending().length).toBeGreaterThanOrEqual(1);

      // Flush the debounce — Observer A updates baseline, not Y.Text
      scheduler.flush();

      // Y.Text stays empty — client observer does not write it
      expect(ytext.toString()).toBe('');

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
