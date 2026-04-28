/**
 * Unit tests for the server-authoritative observer bridge (server-observers.ts).
 *
 * Tests cover:
 *   - Settlement-based dispatch on `afterAllTransactions` (precedent #13(b))
 *   - Baseline-refresh semantics for Path A / Path B / paired-write / self-sync
 *   - Path A vs Path B dispatch (FR-3(c))
 *   - Origin-guard truth table (FR-5 — §7d)
 *   - No infinite loop on self-origin
 *   - Agent paired-write early-exit
 *   - Paired-write short-circuit symmetry across Observer A + Observer B
 *     (bridge-correctness SPEC §6 R0c)
 *   - Frontmatter sync (Observer B → Y.Map, Observer A reads Y.Map)
 *   - Cleanup detaches observers and the settlement handler
 *   - Observer B error-recovery branches
 *
 * Uses a synthetic Y.Doc (no Hocuspocus). Observer dispatch happens
 * synchronously after each `doc.transact()` drain via the new
 * `afterAllTransactions` settlement listener — tests assert post-transact
 * state directly with no scheduler flushing.
 */
import { describe, expect, test } from 'bun:test';
import type { LocalTransactionOrigin } from '@hocuspocus/server';
import { MarkdownManager, normalizeBridge, sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { AGENT_WRITE_ORIGIN } from './agent-sessions.ts';
import { MANAGED_RENAME_ORIGIN, ROLLBACK_ORIGIN } from './api-extension.ts';
import { FILE_WATCHER_ORIGIN } from './external-change.ts';
import { getMetrics } from './metrics.ts';
import {
  OBSERVER_SYNC_ORIGIN,
  type ObserverDispatchKind,
  type SetupServerObserversOpts,
  setupServerObservers,
  shouldRethrowBridgeMergeLoss,
} from './server-observers.ts';

// ─── Test helpers ────────────────────────────────────────────

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

/**
 * Capture the settlement dispatcher's decisions for a single test.
 * Returned `dispatches` accumulates in the order the settlement handler fires.
 */
function createDispatchRecorder() {
  const dispatches: ObserverDispatchKind[] = [];
  const onDispatch = (kind: ObserverDispatchKind): void => {
    dispatches.push(kind);
  };
  return { dispatches, onDispatch };
}

/** Create a test doc with XmlFragment and Y.Text plus a dispatch recorder. */
function createTestDoc() {
  const doc = new Y.Doc();
  const xmlFragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  const recorder = createDispatchRecorder();
  return { doc, xmlFragment, ytext, recorder };
}

function setupOpts(
  overrides: Partial<SetupServerObserversOpts> & {
    doc: Y.Doc;
    xmlFragment: Y.XmlFragment;
    ytext: Y.Text;
    recorder: ReturnType<typeof createDispatchRecorder>;
  },
): SetupServerObserversOpts {
  const { recorder, ...rest } = overrides;
  return {
    mdManager,
    schema,
    onDispatch: recorder.onDispatch,
    ...rest,
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
  test('Observer A settles synchronously after each transact; multiple rapid edits each fire once', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    // Each populateFragment call is its own doc.transact drain → one user
    // settle fire. The inner OBSERVER_SYNC_ORIGIN write that Observer A's
    // sync performs produces its own drain whose observers self-skip; that
    // drain's settlement dispatcher fires 'none'. Filter noise for the
    // user-visible dispatch assertion.
    populateFragment(doc, xmlFragment, '# First\n');
    populateFragment(doc, xmlFragment, '# First\n\nSecond\n');
    populateFragment(doc, xmlFragment, '# First\n\nSecond\n\nThird\n');

    const userDispatches = recorder.dispatches.filter((k) => k !== 'none');
    expect(userDispatches).toEqual(['a', 'a', 'a']);
    expect(writeCount).toBe(3);
    expect(ytext.toString()).toContain('Third');

    cleanup();
  });

  test('Path A: uses diffLines when Y.Text matches baseline', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    // Set up with initial content (baseline picks up the current XmlFragment
    // state during setupServerObservers initialization).
    populateFragment(doc, xmlFragment, '# Hello\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // Initial sync populated Y.Text from XmlFragment.
    expect(ytext.toString()).toContain('Hello');

    // Modify XmlFragment — Y.Text is at baseline (matches lastSyncedXmlMd)
    populateFragment(doc, xmlFragment, '# Hello\n\nNew paragraph\n');

    expect(ytext.toString()).toContain('New paragraph');

    cleanup();
  });

  test('Path B: uses DMP three-way merge when Y.Text diverged from baseline', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    populateFragment(doc, xmlFragment, '# Hello\n\nOriginal\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // Diverge Y.Text under OBSERVER_SYNC_ORIGIN (simulates a prior Observer B
    // write that changed Y.Text without updating XmlFragment baseline — the
    // diverged state). OBSERVER_SYNC_ORIGIN is self-origin so observers
    // short-circuit and no settlement dispatch runs.
    doc.transact(() => {
      const text = ytext.toString();
      ytext.insert(text.length, '\nAgent addition\n');
    }, OBSERVER_SYNC_ORIGIN);

    // Now modify XmlFragment (user WYSIWYG edit) — triggers Observer A.
    // Observer A sees lastSyncedXmlMd !== currentText (Y.Text diverged) → Path B
    populateFragment(doc, xmlFragment, '# Hello\n\nOriginal\n\nUser edit\n');

    // Path B merges: user's delta (add "User edit") applied to diverged Y.Text
    const result = ytext.toString();
    expect(result).toContain('Agent addition');
    expect(result).toContain('User edit');

    cleanup();
  });

  test('already-in-sync gate: when Y.Text matches XmlFragment, no observer write', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // Write both sides to the same content in one transact — observers fire
    // (non-paired origin) and settlement dispatches; Observer A's sync reads
    // XmlFragment serialization (equals Y.Text after normalization) and
    // early-exits via the normalize gate without writing.
    const content = '# Paired\n\nContent\n';
    doc.transact(() => {
      populateFragment(doc, xmlFragment, content);
      ytext.delete(0, ytext.length);
      ytext.insert(0, content);
    });

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    // Redundant XmlFragment mutation to the same content → already-in-sync
    // gate fires; no new Y.Text write.
    populateFragment(doc, xmlFragment, content);
    expect(writeCount).toBe(0);

    cleanup();
  });
});

describe('Server Observer B — Y.Text → XmlFragment', () => {
  test('each Y.Text transact fires Observer B once, producing expected XmlFragment content', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    // Simulate three Y.Text edits in separate transacts — each fires one
    // user settlement dispatch with 'b'. Observer B's XmlFragment write
    // under OBSERVER_SYNC_ORIGIN produces an inner drain whose observers
    // self-skip; that drain dispatches 'none'. Filter the noise.
    doc.transact(() => {
      ytext.insert(0, '# Title\n');
    });
    doc.transact(() => {
      ytext.insert(ytext.length, '\nParagraph\n');
    });
    doc.transact(() => {
      ytext.insert(ytext.length, '\nMore\n');
    });

    const userDispatches = recorder.dispatches.filter((k) => k !== 'none');
    expect(userDispatches).toEqual(['b', 'b', 'b']);
    expect(writeCount).toBe(3);

    // Verify coalesced state: XmlFragment contains all three pieces.
    const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
    const body = mdManager.serialize(json);
    expect(body).toContain('Title');
    expect(body).toContain('Paragraph');
    expect(body).toContain('More');

    cleanup();
  });

  test('frontmatter: Observer B caches frontmatter in Y.Map metadata', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '---\ntitle: My Page\n---\n\n# Hello\n\nWorld\n');
    });

    const metaMap = doc.getMap('metadata');
    expect(metaMap.get('frontmatter')).toBe('---\ntitle: My Page\n---\n');

    cleanup();
  });

  test('frontmatter: Observer A prepends frontmatter from Y.Map on serialize', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    // Pre-set frontmatter in metadata map
    doc.transact(() => {
      doc.getMap('metadata').set('frontmatter', '---\ntitle: Test\n---\n');
    });

    // Populate XmlFragment with body content
    populateFragment(doc, xmlFragment, '# Hello\n\nContent\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // Y.Text should have frontmatter prepended (initial sync populated it).
    expect(ytext.toString()).toContain('---\ntitle: Test\n---\n');
    expect(ytext.toString()).toContain('Hello');

    cleanup();
  });

  test('early-exit: XmlFragment unchanged when Y.Text body already matches', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    populateFragment(doc, xmlFragment, '# Hello\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // After initial sync, Y.Text has the XmlFragment content.
    const serializedBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );

    // Trigger Observer B with a no-op Y.Text mutation (insert + delete same char).
    doc.transact(() => {
      ytext.insert(ytext.length, ' ');
      ytext.delete(ytext.length - 1, 1);
    });

    // Observer B's normalize-gate early-exit keeps XmlFragment unchanged.
    expect(
      mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
    ).toBe(serializedBody);

    cleanup();
  });

  test('canonicalization preserves literal bracket text in Y.Text', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    doc.transact(() => {
      ytext.insert(0, '[[Page\n');
    });

    expect(ytext.toString()).not.toContain('\\[');
    expect(normalizeBridge(ytext.toString())).toBe('[[Page');
    expect(
      normalizeBridge(
        mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
      ),
    ).toBe('[[Page');

    cleanup();
  });

  test('canonicalization preserves empty-label inline links in Y.Text', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    doc.transact(() => {
      ytext.insert(0, 'see []() and [](x)\n');
    });

    expect(ytext.toString()).toBe('see []() and [](x)\n');
    expect(
      normalizeBridge(
        mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
      ),
    ).toBe('see []() and [](x)');

    cleanup();
  });

  test('canonicalization preserves trailing backslash text in Y.Text', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));
    const triple = '\\'.repeat(3);

    doc.transact(() => {
      ytext.insert(0, `text ${triple}\n`);
    });

    expect(ytext.toString()).toBe(`text ${triple}\n`);
    expect(
      normalizeBridge(
        mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
      ),
    ).toBe(`text ${triple}`);

    cleanup();
  });
});

describe('Origin-guard truth table (§7d)', () => {
  test('OBSERVER_SYNC_ORIGIN self-write does NOT produce a second observer fire', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let syncOriginCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) syncOriginCount++;
    });

    populateFragment(doc, xmlFragment, '# Test\n');

    // Observer A writes Y.Text under OBSERVER_SYNC_ORIGIN; Observer B's callback
    // self-skips, no recursion. The user's mutation itself is NOT OBSERVER_SYNC_ORIGIN.
    // Exactly one OBSERVER_SYNC_ORIGIN transaction (A's write); no recursive fires.
    expect(syncOriginCount).toBe(1);

    cleanup();
  });

  test('AGENT_WRITE_ORIGIN paired write: Observer A produces no additional write', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let syncWriteCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) syncWriteCount++;
    });

    // Simulate applyAgentMarkdownWrite: write both XmlFragment + Y.Text atomically.
    const rawContent = '# Agent\n\nAgent wrote this.\n';
    const json = mdManager.parse(rawContent);
    const pmNode = schema.nodeFromJSON(json);
    const normalizedContent = mdManager.serialize(json);
    const dispatchesBefore = recorder.dispatches.length;
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, pmNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, normalizedContent);
    }, AGENT_WRITE_ORIGIN);

    // Paired-write short-circuit: both observers refreshed baseline in-callback
    // and declined to set dirty flags. Settlement dispatcher saw no dirty work
    // and fired 'none'. No OBSERVER_SYNC_ORIGIN write.
    expect(syncWriteCount).toBe(0);
    expect(recorder.dispatches.slice(dispatchesBefore)).toEqual(['none']);

    cleanup();
  });

  test('FILE_WATCHER_ORIGIN paired write: Observer A produces no additional write', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let syncWriteCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) syncWriteCount++;
    });

    const rawContent = '# External\n\nFrom disk.\n';
    const json = mdManager.parse(rawContent);
    const pmNode = schema.nodeFromJSON(json);
    const normalizedContent = mdManager.serialize(json);
    const dispatchesBefore = recorder.dispatches.length;
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, pmNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, normalizedContent);
    }, FILE_WATCHER_ORIGIN);

    expect(syncWriteCount).toBe(0);
    expect(recorder.dispatches.slice(dispatchesBefore)).toEqual(['none']);

    cleanup();
  });

  test('paired-write race: concurrent Y.Text mutation (historical seed 1776325179241 shape) does not duplicate content', () => {
    // Regression for the fuzz seed characterization in SPEC §8.
    //
    // Scenario: an AGENT_WRITE_ORIGIN transaction atomically writes both
    // XmlFragment and Y.Text. Before the paired-write branch landed on
    // Observer A, a concurrent Y.Text mutation landing in the debounce window
    // would cause the next runObserverASync firing to see a stale baseline
    // (lastSyncedXmlMd frozen at pre-agent-write state) and take Path B —
    // duplicating the agent's just-written content.
    //
    // Under the settlement dispatcher, there is no debounce window — but the
    // paired-write short-circuit still matters for (a) typed structural
    // hygiene, (b) avoiding redundant re-serialization work on every paired
    // transact, and (c) future-proofing against async extensions of the
    // settlement model. The convergence assertion below catches a whole class
    // of regressions; the broader Mutation H validation happens in the fuzz
    // harness (`bridge-convergence.fuzz.test.ts`).
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // Seed with initial content.
    const seedContent = 'seed paragraph\n';
    const seedJson = mdManager.parse(seedContent);
    const seedNode = schema.nodeFromJSON(seedJson);
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, seedNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, mdManager.serialize(seedJson));
    }, AGENT_WRITE_ORIGIN);

    // Step 1: paired-write appending "M0-alpha echo".
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

    // Step 2: client source-type Y.Text mutation (paused client delivering a
    // queued append via CRDT merge — origin: undefined / local=false
    // equivalent).
    doc.transact(() => {
      ytext.insert(ytext.length, '\n\nM1-golf hotel\n');
    });

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

  // ── Bucket 0 paired-write regression tests (SPEC.md §6 R0e/R0f/R0g) ──
  //
  // T8/T9/T10 exercise the paired-write observer-layer contract for each
  // paired origin: paired transactions produce a 'none' settlement dispatch
  // (observer callbacks refreshed baseline synchronously, neither dirty flag
  // was set). Mutation H in
  // `specs/2026-04-16-bridge-correctness/meta/mutation-validation.md` —
  // removing either Observer A's OR Observer B's paired-write branch — fires
  // 'a' or 'b' dispatches here and breaks these assertions. The broader
  // race-class detection lives in `bridge-convergence.fuzz.test.ts` (fuzz
  // harness samples the continuous interleaving space that unit tests
  // cannot enumerate per precedent #13(d)).

  function runPairedWriteShortCircuitTest(origin: LocalTransactionOrigin, marker: string): void {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // Seed doc with baseline content under AGENT_WRITE_ORIGIN — also a
    // paired-write origin, so it fires 'none' too.
    const seedContent = 'seed paragraph\n';
    const seedJson = mdManager.parse(seedContent);
    const seedNode = schema.nodeFromJSON(seedJson);
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, seedNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, mdManager.serialize(seedJson));
    }, AGENT_WRITE_ORIGIN);

    // Paired write under the target origin — atomically writes BOTH
    // XmlFragment and Y.Text in a single transact (mirrors the production
    // call sites: applyExternalChange, rollback, managed-rename).
    const afterPaired = `seed paragraph\n\n${marker}\n`;
    const pairedJson = mdManager.parse(afterPaired);
    const pairedNode = schema.nodeFromJSON(pairedJson);
    const pairedCanonical = mdManager.serialize(pairedJson);
    const dispatchesBefore = recorder.dispatches.length;
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, pairedNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, pairedCanonical);
    }, origin);

    // Paired-write short-circuit: the ONLY dispatch produced by the paired
    // transact is 'none'. Mutation H (revert either paired-write branch)
    // produces 'a', 'b', or both instead.
    expect(recorder.dispatches.slice(dispatchesBefore)).toEqual(['none']);

    // Now simulate a concurrent non-paired XmlFragment mutation arriving in
    // the same tick — mimics a remote WYSIWYG keystroke landing right after
    // the paired write. Under the settlement dispatcher, this is its own
    // drain that fires 'a'.
    doc.transact(() => {
      const cur = ytext.toString();
      const nextContent = `${cur}\nconcurrent-edit\n`;
      const nextJson = mdManager.parse(nextContent);
      const nextNode = schema.nodeFromJSON(nextJson);
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, nextNode, meta);
    });

    const finalText = ytext.toString();
    // Paired-write marker must appear exactly once — no duplication from a
    // stale-baseline Path B merge.
    expect(finalText.split(marker).length - 1).toBe(1);
    // Concurrent WYSIWYG edit must survive — Observer A propagated it to Y.Text.
    expect(finalText).toContain('concurrent-edit');

    cleanup();
  }

  test('T8 — FILE_WATCHER paired-write: paired drain dispatches none (both observer branches short-circuit)', () => {
    runPairedWriteShortCircuitTest(FILE_WATCHER_ORIGIN, 'T8-file-watcher marker');
  });

  test('T9 — ROLLBACK paired-write: paired drain dispatches none', () => {
    runPairedWriteShortCircuitTest(ROLLBACK_ORIGIN, 'T9-rollback marker');
  });

  test('T10 — MANAGED_RENAME paired-write: paired drain dispatches none', () => {
    runPairedWriteShortCircuitTest(MANAGED_RENAME_ORIGIN, 'T10-managed-rename marker');
  });

  test('remote-arrived (no origin, local=false equivalent) triggers Observer A sync', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // Simulate a remote client edit arriving (no origin)
    populateFragment(doc, xmlFragment, '# Remote edit\n');

    expect(ytext.toString()).toContain('Remote edit');

    cleanup();
  });
});

describe('shouldRethrowBridgeMergeLoss (D3-LOCKED polarity)', () => {
  // Regression guard for bridge-correctness review iteration 4. The gate
  // used to be `process.env.NODE_ENV !== 'production'`, which inverted
  // D3-LOCKED under Bun because `bun run` / `open-knowledge start` leave
  // NODE_ENV undefined — production users would have seen the loud-throw
  // path at the exact moment a merge dropped content. These tests pin the
  // affirmative contract: only `NODE_ENV=test` or the explicit
  // `OK_RETHROW_BRIDGE_LOSS=1` opt-in trigger a rethrow.
  test('undefined NODE_ENV falls through to silent-checkpoint path (Bun prod default)', () => {
    expect(shouldRethrowBridgeMergeLoss({} as NodeJS.ProcessEnv)).toBe(false);
  });

  test('NODE_ENV=production falls through to silent-checkpoint path', () => {
    expect(shouldRethrowBridgeMergeLoss({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });

  test('NODE_ENV=development falls through to silent-checkpoint path', () => {
    expect(shouldRethrowBridgeMergeLoss({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });

  test('NODE_ENV=test triggers rethrow (bun test default)', () => {
    expect(shouldRethrowBridgeMergeLoss({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true);
  });

  test('OK_RETHROW_BRIDGE_LOSS=1 triggers rethrow regardless of NODE_ENV', () => {
    expect(
      shouldRethrowBridgeMergeLoss({
        NODE_ENV: 'production',
        OK_RETHROW_BRIDGE_LOSS: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  test('OK_RETHROW_BRIDGE_LOSS=0 does not trigger rethrow', () => {
    expect(shouldRethrowBridgeMergeLoss({ OK_RETHROW_BRIDGE_LOSS: '0' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });
});

describe('Cleanup', () => {
  test('cleanup detaches observers and the settlement handler', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // Pre-cleanup mutation settles normally.
    populateFragment(doc, xmlFragment, '# Pre-cleanup\n');
    expect(ytext.toString()).toContain('Pre-cleanup');
    const dispatchesBefore = recorder.dispatches.length;

    cleanup();

    // Post-cleanup mutation must not fire the settlement handler.
    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    populateFragment(doc, xmlFragment, '# After cleanup\n');
    expect(writeCount).toBe(0);
    expect(recorder.dispatches.length).toBe(dispatchesBefore);
  });
});

describe('Initial sync', () => {
  test('populates Y.Text from XmlFragment when Y.Text is empty', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    // Populate XmlFragment before attaching observers
    populateFragment(doc, xmlFragment, '# Pre-existing\n\nContent here.\n');
    expect(ytext.toString()).toBe('');

    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // Initial sync should have populated Y.Text synchronously
    expect(ytext.toString()).toContain('Pre-existing');
    expect(ytext.toString()).toContain('Content here');

    cleanup();
  });

  test('does not populate Y.Text when both are empty', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    // No initial sync needed when both are empty
    expect(writeCount).toBe(0);
    expect(ytext.toString()).toBe('');

    cleanup();
  });
});

describe('Server Observer B — error recovery paths', () => {
  // These tests exercise the outer-catch and inner-catch recovery branches
  // added to Observer B's sync work. Both paths are load-bearing: they reset
  // the baseline so the next Observer A cycle computes a correct delta
  // instead of re-applying a failed diff.
  //
  // mdManager.parse() is very tolerant (raw HTML/JSX that fails mdx-js is
  // not rejected by our agnostic-mode pipeline), so we drive the error
  // branches deterministically by wrapping mdManager with a stub that
  // throws on demand.

  /** Wrap mdManager so parse/serialize can be toggled to throw.
   *
   * Under FR-22/G9, Observer B calls `parseWithFallback` — the real impl
   * catches parse() errors and produces rawMdxFallback nodes. Tests still
   * need to exercise the outer catch path for unexpected errors escaping
   * parseWithFallback itself (internal RangeError, PM-construction failure,
   * etc.), so the stub's parseWithFallback honours `parseThrow` directly.
   * Serialize errors remain a valid test surface in the post-sync
   * re-serialization block. */
  function createMdManagerStub() {
    let parseThrow: Error | null = null;
    let serializeThrow: Error | null = null;
    const stub: SetupServerObserversOpts['mdManager'] = {
      parse(md: string) {
        if (parseThrow) throw parseThrow;
        return mdManager.parse(md);
      },
      parseWithFallback(md: string) {
        if (parseThrow) throw parseThrow;
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
      setParseThrow: (e: Error | null) => {
        parseThrow = e;
      },
      setSerializeThrow: (e: Error | null) => {
        serializeThrow = e;
      },
    };
  }

  test('parse-error on Y.Text change: baseline resets to Y.Text, Observer A does not re-apply', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const stub = createMdManagerStub();

    // Seed with valid content
    populateFragment(doc, xmlFragment, '# Seed\n\nBody.\n');
    const cleanup = setupServerObservers(
      setupOpts({ doc, xmlFragment, ytext, recorder, mdManager: stub.mdManager }),
    );

    const errorsBefore = getMetrics().serverObserverErrorsB;

    // Write end-tag-mismatched MDX — pre-FR-22 this path froze XmlFragment
    // because the parser threw VFileMessage. Post-FR-22, `parseWithFallback`
    // produces a rawMdxFallback node for the unparseable span.
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Still here\n\n<Foo>broken text</Bar>\n');
    });

    // XmlFragment now reflects Y.Text — no freeze, no error counter increment.
    // Post Precedent #14 (server-authoritative observer) + `parseWithFallback`,
    // Observer B ALWAYS writes the XmlFragment — malformed MDX surfaces as
    // `rawMdxFallback` nodes instead of freezing the fragment on last-valid
    // state. This supersedes the pre-#14 "retain last state" assertion. API
    // call updated to main's PR #250 rename (`yXmlFragmentToProseMirrorRootNode`
    // replaces deprecated `yXmlFragmentToProsemirrorJSON`).
    expect(getMetrics().serverObserverErrorsB).toBe(errorsBefore);
    const postBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );
    expect(postBody).toContain('Still here');
    expect(postBody).toContain('<Foo>broken text</Bar>');

    // Recovery: valid MDX written next propagates normally.
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Recovered\n');
    });

    const finalBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );
    expect(finalBody).toContain('Recovered');
    // FR-22/G9 full-recovery assertion: the malformed span is gone, not just
    // appended-past. Rules out a class of bugs where the bridge accumulates
    // content across writes instead of replacing.
    expect(finalBody).not.toContain('<Foo>');

    cleanup();
  });

  test('unknown parse error (non-SyntaxError) increments error counter and resets baseline to XmlFragment', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const stub = createMdManagerStub();

    populateFragment(doc, xmlFragment, '# Seed\n\nBody.\n');
    const cleanup = setupServerObservers(
      setupOpts({ doc, xmlFragment, ytext, recorder, mdManager: stub.mdManager }),
    );

    const errorsBefore = getMetrics().serverObserverErrorsB;

    // Throw a plain Error (NOT SyntaxError/VFileMessage/Invalid-content
    // RangeError) — falls through to outer catch. Suppress the expected
    // console.error so it doesn't pollute test output.
    const originalConsoleError = console.error;
    console.error = () => {};
    stub.setParseThrow(new Error('unexpected parse failure'));

    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Anything\n');
    });

    stub.setParseThrow(null);
    console.error = originalConsoleError;

    // Outer catch: error counter bumped by exactly 1, and baseline was
    // reset to the current XmlFragment state (so Observer A on its next
    // fire computes a fresh, non-stale diff).
    expect(getMetrics().serverObserverErrorsB).toBe(errorsBefore + 1);

    // Prior XmlFragment content remains intact (rollback semantics).
    const postBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );
    expect(postBody).toContain('Seed');

    // A subsequent valid Y.Text edit converges (baseline recovered).
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Seed\n\nBody.\n\n## Next\n');
    });
    expect(
      mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
    ).toContain('Next');

    cleanup();
  });

  test('post-sync serialize-error: falls back to input body as Observer A baseline', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const stub = createMdManagerStub();

    populateFragment(doc, xmlFragment, '# Seed\n');
    const cleanup = setupServerObservers(
      setupOpts({ doc, xmlFragment, ytext, recorder, mdManager: stub.mdManager }),
    );

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
    // re-serialization inside runObserverBSync. After the early-exit gate
    // was switched to compare against the maintained `lastSyncedXmlMd`
    // baseline (no fresh serialize call), runObserverBSync issues serialize
    // only once per fire — the canonicalization step's `serialize(parsedJson)`
    // after updateYFragment. That is the call we arm to throw.
    let serializeCallCount = 0;
    const originalSerialize = stub.mdManager.serialize;
    stub.mdManager.serialize = ((json: unknown) => {
      serializeCallCount++;
      if (serializeCallCount === 1) {
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

    // Restore before any subsequent assertions that serialize.
    stub.mdManager.serialize = originalSerialize;
    console.warn = originalWarn;

    // The warn-branch (post-sync re-serialization failed) fired.
    expect(warnings.some((w) => w.includes('Post-sync re-serialization failed'))).toBe(true);

    // The inner catch does NOT count as a full Observer B error (the main
    // sync succeeded; only the baseline-maintenance re-serialize failed).
    expect(getMetrics().serverObserverErrorsB).toBe(errorsBefore);

    // XmlFragment reflects the new content.
    expect(
      mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
    ).toContain('After');

    // Observer A's baseline was set from the input body (fallback), not
    // the post-update serialize. Verify by making a further edit — if the
    // fallback set a reasonable baseline, subsequent writes converge.
    doc.transact(() => {
      ytext.insert(ytext.length, '\nExtra\n');
    });
    expect(
      mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
    ).toContain('Extra');

    cleanup();
  });
});
