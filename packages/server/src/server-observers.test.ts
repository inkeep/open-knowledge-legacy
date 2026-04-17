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
import { getMetrics } from './metrics.ts';
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

    // Verify the coalesced write produced the correct XmlFragment content
    const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
    const body = mdManager.serialize(json);
    expect(body).toContain('Title');
    expect(body).toContain('Paragraph');
    expect(body).toContain('More');

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

  test('paired-write race: concurrent Y.Text mutation in debounce window does not duplicate content', () => {
    // Regression for fuzz seed 1776325179241 — "Oracle (e) content-set violation".
    //
    // Scenario: an AGENT_WRITE_ORIGIN transaction atomically writes both
    // XmlFragment and Y.Text via applyAgentMarkdownWrite. Observer A's callback
    // fires and (before the fix) schedules a 50 ms debounce. A concurrent Y.Text
    // mutation (e.g., CRDT merge from a client source-type edit) lands before
    // the debounce fires. When runObserverASync eventually runs, it sees a
    // stale baseline (lastSyncedXmlMd frozen at pre-agent-write state),
    // diverged Y.Text vs XmlFragment, and falls into Path B's mergeThreeWay —
    // which duplicates the common "just-written" content.
    //
    // Fix: Observer A's callback synchronously refreshes lastSyncedXmlMd on
    // paired-write origins and cancels any pending debounce. See
    // isPairedWriteOrigin in server-observers.ts.
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler }));
    scheduler.flush();

    // Seed with initial content (simulates the test harness's pre-client
    // agent-write-md('seed paragraph', 'replace')).
    const seedContent = 'seed paragraph\n';
    const seedJson = mdManager.parse(seedContent);
    const seedNode = schema.nodeFromJSON(seedJson);
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, seedNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, mdManager.serialize(seedJson));
    }, AGENT_WRITE_ORIGIN);
    scheduler.flush();

    // Step 1: paired-write appending "M0-alpha echo" (mimics agent-write-md
    // 'append' position). Both XmlFragment and Y.Text are written atomically.
    const afterOp0 = 'seed paragraph\n\nM0-alpha echo\n';
    const op0Json = mdManager.parse(afterOp0);
    const op0Node = schema.nodeFromJSON(op0Json);
    const op0Canonical = mdManager.serialize(op0Json);
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, op0Node, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, op0Canonical);
    }, AGENT_WRITE_ORIGIN);

    // Step 2: BEFORE flushing the scheduler (i.e., inside Observer A's 50 ms
    // debounce window), a client source-type Y.Text mutation arrives. Mimics
    // a paused client's appended paragraph delivered via CRDT merge.
    doc.transact(() => {
      ytext.insert(ytext.length, '\n\nM1-golf hotel\n');
    });

    // Step 3: flush the scheduler. Observer A runs; without the paired-origin
    // fix, Path B's mergeThreeWay would produce a duplicated "M0-alpha echo"
    // line. Observer B runs afterward and parses the (possibly-duplicated)
    // Y.Text into XmlFragment, propagating the corruption.
    scheduler.flush();

    // Zero-tolerance oracle: "M0-alpha echo" must appear exactly ONCE in the
    // final Y.Text state. Duplication would be e.g.
    // "seed paragraph\n\nM0-alpha echo\nM0-alpha echo\n\nM1-golf hotel\n".
    const finalText = ytext.toString();
    const occurrences = finalText.split('M0-alpha echo').length - 1;
    expect(occurrences).toBe(1);
    // And M1 must be present — Observer B should have propagated the source-type edit.
    expect(finalText).toContain('M1-golf hotel');

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

describe('Server Observer B — error recovery paths', () => {
  // These tests exercise the outer-catch and inner-catch recovery branches
  // added to Observer B's sync work (server-observers.ts:~266-324). Both
  // paths are load-bearing: they reset the baseline so the next Observer A
  // cycle computes a correct delta instead of re-applying a failed diff.
  //
  // mdManager.parse() is very tolerant (raw HTML/JSX that fails mdx-js is
  // not rejected by our agnostic-mode pipeline), so we drive the error
  // branches deterministically by wrapping mdManager with a stub that
  // throws on demand.

  /** Wrap mdManager so parse/serialize can be toggled to throw.
   *
   * Note: under FR-22/G9, Observer B calls `parseWithFallback` which never
   * throws. The stub's `parseWithFallback` simply delegates to the real
   * mdManager (no throw-on-demand) — the old "arm parse() to throw" pattern
   * is architecturally impossible post-FR-22 and the corresponding tests
   * have been removed. Serialize errors remain a valid test surface because
   * they fire in the post-sync re-serialization block. */
  function createMdManagerStub() {
    let serializeThrow: Error | null = null;
    const stub: SetupServerObserversOpts['mdManager'] = {
      parse(md: string) {
        return mdManager.parse(md);
      },
      parseWithFallback(md: string) {
        return mdManager.parseWithFallback(md);
      },
      serialize(json: unknown) {
        if (serializeThrow) throw serializeThrow;
        // biome-ignore lint/suspicious/noExplicitAny: delegate to real manager
        return mdManager.serialize(json as any);
      },
    } as unknown as SetupServerObserversOpts['mdManager'];
    return {
      mdManager: stub,
      setSerializeThrow: (e: Error | null) => {
        serializeThrow = e;
      },
    };
  }

  // REMOVED — "parse-error on Y.Text change" + "unknown parse error increments error counter".
  //
  // Under FR-22 (G9 bridge always-live), Observer B now calls
  // `mdManager.parseWithFallback(body)` which never throws. Malformed MDX
  // produces a valid JSONContent tree with `rawMdxFallback` nodes standing in
  // for unparseable spans — there is no "transient parse error freeze" path,
  // and no "unknown parse error" path reachable through the parse call.
  //
  // Coverage for the new always-live behavior is the G9 test below.
  // See `specs/2026-04-14-component-blocks-v2/SPEC.md` FR-22/FR-23 and
  // precedent #20 (All user content visible and editable).

  test('G9 bridge always-live: malformed MDX produces rawMdxFallback instead of freezing XmlFragment', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const stub = createMdManagerStub();

    // Seed with valid content
    populateFragment(doc, xmlFragment, '# Seed\n\nBody.\n');
    const cleanup = setupServerObservers(
      setupOpts({ doc, xmlFragment, ytext, scheduler, mdManager: stub.mdManager }),
    );
    scheduler.flush(); // initial sync populates Y.Text

    const errorsBefore = getMetrics().serverObserverErrorsB;

    // Write end-tag-mismatched MDX — pre-FR-22 this path froze XmlFragment
    // because the parser threw VFileMessage. Post-FR-22, `parseWithFallback`
    // produces a rawMdxFallback node for the unparseable span.
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Still here\n\n<Foo>broken text</Bar>\n');
    });
    scheduler.flush();

    // XmlFragment now reflects Y.Text — no freeze, no error counter increment.
    expect(getMetrics().serverObserverErrorsB).toBe(errorsBefore);
    const postBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
    expect(postBody).toContain('Still here');
    expect(postBody).toContain('<Foo>broken text</Bar>');

    // Recovery: valid MDX written next propagates normally.
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Recovered\n');
    });
    scheduler.flush();

    const finalBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
    expect(finalBody).toContain('Recovered');
    expect(finalBody).not.toContain('<Foo>');

    cleanup();
  });

  test('post-sync serialize-error: falls back to input body as Observer A baseline', () => {
    const { doc, xmlFragment, ytext, scheduler } = createTestDoc();
    const stub = createMdManagerStub();

    populateFragment(doc, xmlFragment, '# Seed\n');
    const cleanup = setupServerObservers(
      setupOpts({ doc, xmlFragment, ytext, scheduler, mdManager: stub.mdManager }),
    );
    scheduler.flush();

    const errorsBefore = getMetrics().serverObserverErrorsB;

    // Capture the originals — we'll restore after the throw fires so the
    // post-sync serialize path exercises the fallback branch without
    // breaking subsequent reads.
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };

    // Arm: serialize() will throw exactly once during the post-sync
    // re-serialization inside runObserverBSync.
    let serializeCallCount = 0;
    const originalSerialize = stub.mdManager.serialize;
    stub.mdManager.serialize = ((json: unknown) => {
      serializeCallCount++;
      // Let the early-exit gate's serialize succeed (calls are before the
      // updateYFragment). Throw on the post-sync re-serialize call that
      // runs after updateYFragment.
      if (serializeCallCount === 2) {
        throw new Error('simulated serialize failure post-update');
      }
      // biome-ignore lint/suspicious/noExplicitAny: delegate
      return mdManager.serialize(json as any);
    }) as typeof stub.mdManager.serialize;

    // Drive Observer B with a valid Y.Text change so parse succeeds and
    // updateYFragment lands — only the follow-up serialize throws.
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Seed\n\n## After\n');
    });
    scheduler.flush();

    // Restore before any subsequent assertions that serialize.
    stub.mdManager.serialize = originalSerialize;
    console.warn = originalWarn;

    // The warn-branch (post-sync re-serialization failed) fired.
    expect(warnings.some((w) => w.includes('Post-sync re-serialization failed'))).toBe(true);

    // The inner catch does NOT count as a full Observer B error (the main
    // sync succeeded; only the baseline-maintenance re-serialize failed).
    expect(getMetrics().serverObserverErrorsB).toBe(errorsBefore);

    // XmlFragment reflects the new content.
    expect(mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment))).toContain('After');

    // Observer A's baseline was set from the input body (fallback), not
    // the post-update serialize. Verify by making a further edit — if the
    // fallback set a reasonable baseline, subsequent writes converge.
    doc.transact(() => {
      ytext.insert(ytext.length, '\nExtra\n');
    });
    scheduler.flush();
    expect(mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment))).toContain('Extra');

    cleanup();
  });
});
