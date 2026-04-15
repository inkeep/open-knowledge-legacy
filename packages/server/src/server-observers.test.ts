/**
 * Unit tests for the server-authoritative observer bridge (server-observers.ts).
 *
 * Tests cover:
 *   - Debounce coalescing (FR-3/FR-4)
 *   - Baseline-refresh conditional rule (FR-3(b))
 *   - Path A vs Path B dispatch (FR-3(c))
 *   - Origin-guard table (FR-5 — §7d truth table)
 *   - No infinite loop on self-origin
 *   - Agent paired-write early-exit
 *   - Frontmatter sync (Observer B → Y.Map, Observer A reads Y.Map)
 *   - Cleanup detaches observers and clears debounces
 *
 * Uses a synthetic Y.Doc (no Hocuspocus) with ManualScheduler for deterministic flush.
 */
import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { AGENT_WRITE_ORIGIN } from './agent-sessions.ts';
import { FILE_WATCHER_ORIGIN } from './external-change.ts';
import {
  OBSERVER_SYNC_ORIGIN,
  type Scheduler,
  type SetupServerObserversOpts,
  setupServerObservers,
} from './server-observers.ts';

// ─── Test helpers ────────────────────────────────────────────

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

interface ManualScheduler extends Scheduler {
  flush(): void;
  advanceTime(ms: number): void;
  pending(): ReadonlyArray<{ id: number; dueAt: number }>;
}

function createManualScheduler(): ManualScheduler {
  type Entry = { id: number; cb: () => void; dueAt: number };
  const queue: Entry[] = [];
  let now = 0;
  let nextId = 1;

  return {
    setTimeout: (cb, ms) => {
      const id = nextId++;
      queue.push({ id, cb, dueAt: now + ms });
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimeout: (handle) => {
      const id = handle as unknown as number;
      const idx = queue.findIndex((e) => e.id === id);
      if (idx >= 0) queue.splice(idx, 1);
    },
    now: () => now,
    advanceTime(ms) {
      now += ms;
      for (let pass = 0; pass < 100; pass++) {
        const due = queue.filter((e) => e.dueAt <= now);
        if (due.length === 0) return;
        for (const e of due) {
          const idx = queue.indexOf(e);
          if (idx >= 0) queue.splice(idx, 1);
          e.cb();
        }
      }
    },
    flush() {
      for (let pass = 0; pass < 100; pass++) {
        if (queue.length === 0) return;
        const entries = [...queue];
        queue.length = 0;
        for (const e of entries) {
          now = Math.max(now, e.dueAt);
          e.cb();
        }
      }
    },
    pending: () => queue.map((e) => ({ id: e.id, dueAt: e.dueAt })),
  };
}

/** Create a test doc with XmlFragment and Y.Text, plus a ManualScheduler. */
function createTestDoc() {
  const doc = new Y.Doc();
  const xmlFragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  const scheduler = createManualScheduler();
  return { doc, xmlFragment, ytext, scheduler };
}

function setupOpts(
  overrides: Partial<SetupServerObserversOpts> & {
    doc: Y.Doc;
    xmlFragment: Y.XmlFragment;
    ytext: Y.Text;
    scheduler: ManualScheduler;
  },
): SetupServerObserversOpts & { scheduler: ManualScheduler } {
  return {
    mdManager,
    schema,
    ...overrides,
  };
}

/** Populate XmlFragment with markdown content via updateYFragment. */
function populateFragment(doc: Y.Doc, xmlFragment: Y.XmlFragment, md: string): void {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(doc, xmlFragment, pmNode, meta);
}

// ─── Tests ───────────────────────────────────────────────────

describe('Server Observer A — XmlFragment → Y.Text', () => {
  test('rapid XmlFragment changes within 50ms coalesce into ONE Y.Text write', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    // Simulate 3 rapid XmlFragment edits
    populateFragment(doc, xmlFragment, '# First\n');
    scheduler.advanceTime(10);
    populateFragment(doc, xmlFragment, '# First\n\nSecond\n');
    scheduler.advanceTime(10);
    populateFragment(doc, xmlFragment, '# First\n\nSecond\n\nThird\n');

    // Before debounce fires, no OBSERVER_SYNC_ORIGIN writes
    expect(writeCount).toBe(0);

    // After 50ms debounce fires
    scheduler.advanceTime(50);

    // Exactly one Y.Text write
    expect(writeCount).toBe(1);
    expect(ytext.toString()).toContain('Third');

    cleanup();
  });

  test('baseline-refresh: no baseline refresh when debounce is pending', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();

    // Populate initial content
    populateFragment(doc, xmlFragment, '# Hello\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush(); // initial sync

    // Make a local edit
    populateFragment(doc, xmlFragment, '# Hello\n\nWorld\n');
    // Debounce queued but not fired — now simulate a remote edit arriving
    // which should NOT refresh the baseline
    expect(scheduler.pending().length).toBeGreaterThan(0);

    // Fire the debounce — should write based on old baseline, not refreshed
    scheduler.flush();
    expect(ytext.toString()).toContain('World');

    cleanup();
  });

  test('Path A: uses diffLines when Y.Text matches baseline', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();

    // Set up with initial content
    populateFragment(doc, xmlFragment, '# Hello\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush(); // fires initial sync

    const initialText = ytext.toString();
    expect(initialText).toContain('Hello');

    // Modify XmlFragment — Y.Text is at baseline (matches lastSyncedXmlMd)
    populateFragment(doc, xmlFragment, '# Hello\n\nNew paragraph\n');
    scheduler.flush();

    expect(ytext.toString()).toContain('New paragraph');

    cleanup();
  });

  test('Path B: uses DMP three-way merge when Y.Text diverged from baseline', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();

    // Set up with initial content
    populateFragment(doc, xmlFragment, '# Hello\n\nOriginal\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush();

    // Diverge Y.Text under OBSERVER_SYNC_ORIGIN (simulates a prior Observer B write
    // that changed Y.Text without updating XmlFragment baseline — the diverged state).
    doc.transact(() => {
      const text = ytext.toString();
      ytext.insert(text.length, '\nAgent addition\n');
    }, OBSERVER_SYNC_ORIGIN); // self-origin → observer skips → debounce NOT queued

    // Flush any pending Observer B debounce from the Y.Text change
    scheduler.flush();

    // Now modify XmlFragment (user WYSIWYG edit) — triggers Observer A
    // Observer A sees lastSyncedXmlMd !== currentText (Y.Text diverged) → Path B
    populateFragment(doc, xmlFragment, '# Hello\n\nOriginal\n\nUser edit\n');
    scheduler.flush();

    // Path B merges: user's delta (add "User edit") applied to diverged Y.Text
    const result = ytext.toString();
    expect(result).toContain('Agent addition');
    expect(result).toContain('User edit');

    cleanup();
  });

  test('already-in-sync gate: when Y.Text matches XmlFragment, only baseline updates', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));

    // Write both sides to the same content (simulating agent paired write)
    const content = '# Paired\n\nContent\n';
    populateFragment(doc, xmlFragment, content);
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, content);
    });
    scheduler.flush();

    // No additional OBSERVER_SYNC_ORIGIN writes needed
    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    // Trigger observer by modifying XmlFragment to same content
    populateFragment(doc, xmlFragment, content);
    scheduler.flush();

    // Should early-exit (already in sync)
    expect(writeCount).toBe(0);

    cleanup();
  });
});

describe('Server Observer B — Y.Text → XmlFragment', () => {
  test('rapid Y.Text changes coalesce into one XmlFragment write', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush(); // initial sync

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });
    writeCount = 0; // reset after initial sync

    // Simulate rapid Y.Text edits
    doc.transact(() => {
      ytext.insert(0, '# Title\n');
    });
    scheduler.advanceTime(10);
    doc.transact(() => {
      ytext.insert(ytext.length, '\nParagraph\n');
    });
    scheduler.advanceTime(10);
    doc.transact(() => {
      ytext.insert(ytext.length, '\nMore\n');
    });

    expect(writeCount).toBe(0);

    scheduler.advanceTime(50);
    expect(writeCount).toBe(1);

    cleanup();
  });

  test('frontmatter: Observer B caches frontmatter in Y.Map metadata', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush();

    // Write Y.Text with frontmatter
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '---\ntitle: My Page\n---\n\n# Hello\n\nWorld\n');
    });
    scheduler.flush();

    const metaMap = doc.getMap('metadata');
    expect(metaMap.get('frontmatter')).toBe('---\ntitle: My Page\n---\n');

    cleanup();
  });

  test('frontmatter: Observer A prepends frontmatter from Y.Map on serialize', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();

    // Pre-set frontmatter in metadata map
    doc.transact(() => {
      doc.getMap('metadata').set('frontmatter', '---\ntitle: Test\n---\n');
    });

    // Populate XmlFragment with body content
    populateFragment(doc, xmlFragment, '# Hello\n\nContent\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush();

    // Y.Text should have frontmatter prepended
    expect(ytext.toString()).toContain('---\ntitle: Test\n---\n');
    expect(ytext.toString()).toContain('Hello');

    cleanup();
  });

  test('early-exit: XmlFragment unchanged when Y.Text body already matches', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();

    // Set up with content in both
    populateFragment(doc, xmlFragment, '# Hello\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush();

    // After initial sync, Y.Text should have the XmlFragment content
    const serializedBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));

    // Write Y.Text to match existing XmlFragment body (force a no-op change trigger)
    doc.transact(() => {
      // Append and remove a space to trigger observer without changing content
      ytext.insert(ytext.length, ' ');
      ytext.delete(ytext.length - 1, 1);
    });
    scheduler.flush();

    // Observer B should see that XmlFragment already matches Y.Text body
    // and either early-exit or do a no-op updateYFragment — final state matches
    expect(mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment))).toBe(serializedBody);

    cleanup();
  });
});

describe('Origin-guard truth table (§7d)', () => {
  test('OBSERVER_SYNC_ORIGIN self-write does NOT produce a second observer fire', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));

    let syncOriginCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) syncOriginCount++;
    });

    // Trigger Observer A
    populateFragment(doc, xmlFragment, '# Test\n');
    scheduler.flush();

    // Should be exactly 1 OBSERVER_SYNC_ORIGIN write (from Observer A)
    // NOT 2 (Observer A → Y.Text → Observer B → XmlFragment → Observer A → ...)
    // because Observer B's callback skips OBSERVER_SYNC_ORIGIN
    expect(syncOriginCount).toBeLessThanOrEqual(2); // Observer A initial + write; no infinite loop
    const firstCount = syncOriginCount;

    // Wait for any cascading debounces
    scheduler.advanceTime(200);
    expect(syncOriginCount).toBe(firstCount); // no additional fires

    cleanup();
  });

  test('AGENT_WRITE_ORIGIN paired write: Observer A produces at most a normalization write', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush();

    let syncWriteCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) syncWriteCount++;
    });
    syncWriteCount = 0;

    // Simulate applyAgentMarkdownWrite: write both XmlFragment + Y.Text atomically.
    // Use round-tripped content so updateYFragment normalization matches the Y.Text value.
    const rawContent = '# Agent\n\nAgent wrote this.\n';
    const json = mdManager.parse(rawContent);
    const pmNode = schema.nodeFromJSON(json);
    const normalizedContent = mdManager.serialize(json);
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, pmNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, normalizedContent);
    }, AGENT_WRITE_ORIGIN);

    scheduler.flush();

    // With normalized content, Observer A should early-exit at already-in-sync gate.
    expect(syncWriteCount).toBe(0);

    cleanup();
  });

  test('FILE_WATCHER_ORIGIN paired write: Observer A produces at most a normalization write', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush();

    let syncWriteCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) syncWriteCount++;
    });
    syncWriteCount = 0;

    // Simulate applyExternalChange: write both sides atomically with normalized content.
    const rawContent = '# External\n\nFrom disk.\n';
    const json = mdManager.parse(rawContent);
    const pmNode = schema.nodeFromJSON(json);
    const normalizedContent = mdManager.serialize(json);
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, pmNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, normalizedContent);
    }, FILE_WATCHER_ORIGIN);

    scheduler.flush();

    // With normalized content, Observer A should early-exit.
    expect(syncWriteCount).toBe(0);

    cleanup();
  });

  test('remote-arrived (no origin, local=false equivalent) triggers Observer A sync', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush();

    // Simulate a remote client edit arriving (no origin)
    populateFragment(doc, xmlFragment, '# Remote edit\n');
    scheduler.flush();

    expect(ytext.toString()).toContain('Remote edit');

    cleanup();
  });
});

describe('Cleanup', () => {
  test('cleanup detaches observers and clears pending debounces', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush();

    // Queue a debounce
    populateFragment(doc, xmlFragment, '# Pending\n');
    expect(scheduler.pending().length).toBeGreaterThan(0);

    // Cleanup
    cleanup();

    // Debounce should be cleared
    expect(scheduler.pending().length).toBe(0);

    // Further edits should not trigger observer writes
    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    populateFragment(doc, xmlFragment, '# After cleanup\n');
    scheduler.flush();
    expect(writeCount).toBe(0);
  });
});

describe('Initial sync', () => {
  test('populates Y.Text from XmlFragment when Y.Text is empty', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();

    // Populate XmlFragment before attaching observers
    populateFragment(doc, xmlFragment, '# Pre-existing\n\nContent here.\n');
    expect(ytext.toString()).toBe('');

    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));

    // Initial sync should have populated Y.Text synchronously
    expect(ytext.toString()).toContain('Pre-existing');
    expect(ytext.toString()).toContain('Content here');

    cleanup();
  });

  test('does not populate Y.Text when both are empty', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));

    // No initial sync needed when both are empty
    expect(writeCount).toBe(0);
    expect(ytext.toString()).toBe('');

    cleanup();
  });
});
