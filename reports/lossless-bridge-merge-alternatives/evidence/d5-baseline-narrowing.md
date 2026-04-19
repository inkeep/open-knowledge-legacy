# D5: Baseline Narrowing — Reducing Path B Frequency

## Source analysis

Read: `packages/server/src/server-observers.ts` — full file (337 lines)
Read: `packages/core/src/bridge/apply-diff.ts` — full file (167 lines)

## Path A vs Path B decision point

In `runObserverASync()` (server-observers.ts:118-169):

```typescript
if (currentText === lastSyncedXmlMd) {
  // Path A: Y.Text in sync with baseline — use diffLines
  applyIncrementalDiff(ytext, currentText, md);
} else {
  // Path B: Y.Text diverged — use DMP three-way merge
  applyUserDelta(ytext, lastSyncedXmlMd, md);
}
```

**Path A** is lossless (line-level diff + content-comparison gate). **Path B** is lossy (DMP three-way merge, 2-3% patch drops).

The question: can we keep `lastSyncedXmlMd` close enough to Y.Text that Path B rarely fires?

## When does Y.Text diverge from baseline?

`lastSyncedXmlMd` tracks the XmlFragment state that was last synced to Y.Text. Y.Text diverges from this baseline when:

1. **Source-mode typing** — A user edits in CodeMirror, which writes Y.Text directly. Observer B picks up the Y.Text change and syncs to XmlFragment, but Observer A's `lastSyncedXmlMd` still holds the OLD XmlFragment state. Next Observer A firing sees `currentText !== lastSyncedXmlMd` → Path B.

2. **Agent writes** — `applyAgentMarkdownWrite` writes both XmlFragment and Y.Text atomically. Observer A fires on the XmlFragment change. At the "already-in-sync gate" (line 134), `normalizeBridge(currentText) === normalizeBridge(md)` should match → `lastSyncedXmlMd = md` → baseline updated. Path B unlikely unless timing race.

3. **External file changes** — `applyExternalChange` replaces both CRDTs. Observer A baseline refresh via the already-in-sync gate should handle this.

4. **Observer B writes to XmlFragment** — Observer B parses Y.Text and applies to XmlFragment via `updateYFragment`. This triggers Observer A. If Observer B's parse+serialize round-trips differently than Observer A's serialize, baseline mismatch → Path B.

## Baseline update points

Currently, `lastSyncedXmlMd` is updated at:

1. **Init** (line 100-112): Set to current XmlFragment serialization.
2. **Already-in-sync gate** (line 135): If Y.Text matches XmlFragment after normalization → `lastSyncedXmlMd = md`.
3. **After successful Path A/B write** (line 158): `lastSyncedXmlMd = ytext.toString()` — set to ACTUAL Y.Text state, not to `md`. This is critical for Path B: DMP merge may have preserved agent content, so Y.Text ≠ md.
4. **Error recovery** (line 164): Reset to Y.Text on failure.

Also in Observer B:
5. **Observer B early-exit** (line 258): `lastSyncedXmlMd = prependFrontmatter(frontmatter, currentBody)` — when Observer B sees tree and text already in sync.
6. **Observer B post-update** (line 293-303): Re-serializes XmlFragment after `updateYFragment` and sets baseline.

## Narrowing strategy: intercept Y.Text changes at Observer B

The key insight: **every Y.Text change that would cause Path B to fire first passes through Observer B** (except for concurrent multi-party timing). Observer B parses Y.Text → updates XmlFragment → which triggers Observer A.

If Observer B updated Observer A's baseline AFTER updating XmlFragment, Observer A would see `currentText === lastSyncedXmlMd` → Path A.

**Current Observer B already does this at line 258 and 293-303.** But there's a timing issue:

1. User types in source mode → Y.Text changes.
2. Observer B debounce fires (50ms) → parses Y.Text, updates XmlFragment.
3. Observer A debounce fires on XmlFragment change → but by this time, Observer B has already updated `lastSyncedXmlMd` → Path A fires.

**This should already work.** So when does Path B actually fire?

## The race window

The 50ms debounce on both observers creates a race:

1. User types in source mode → Y.Text change triggers Observer B debounce.
2. User types in WYSIWYG mode (concurrent) → XmlFragment change triggers Observer A debounce.
3. Observer A fires before Observer B → sees `currentText !== lastSyncedXmlMd` → Path B.

This race requires **truly concurrent editing across modes**, which in the server-authoritative design means:
- Two different clients, one in source mode, one in WYSIWYG.
- Agent write (hits XmlFragment) while user is in source mode.

## Quantifying Path B frequency

From the fuzz test (`bridge-convergence.fuzz.test.ts`):
- 3 clients doing mixed ops (wysiwyg-type, source-type, agent-write, agent-patch, external-change).
- 90+ markers per seed, 30 operations.
- ~2-3% of seeds show content drops (DMP Path B failures).

In production with the server-authoritative design (single bridge writer):
- Path B fires only during concurrent cross-mode editing.
- Single user (no concurrent mode conflict) → Path B never fires.
- Two users in same mode → Path A always fires (both writing same CRDT).
- Two users in different modes → Path B fires on every observer cycle where both edited.

## Opportunities for narrowing

### Opportunity 1: Immediate baseline sync between observers

When Observer B updates XmlFragment, immediately set Observer A's baseline to the new XmlFragment serialization, BEFORE Observer A's debounce fires.

**Already implemented** (line 258, 293-303). This is the current design.

### Opportunity 2: Shorter debounce for Observer A

Reduce Observer A debounce from 50ms to 10ms. Smaller window for Y.Text to diverge.

**Trade-off:** More frequent firings under burst typing. 10ms is fast enough that debounce stops being useful — might as well fire immediately. CPU cost is minimal (serialize + diff).

### Opportunity 3: Observer A pre-check in Observer B callback

When Observer B completes its sync, if Observer A has a pending debounce, cancel it and run Observer A synchronously with the fresh baseline.

**Currently partially implemented** — Observer B defers if Observer A has a pending debounce (line 235-237), but Observer A doesn't get notified when Observer B completes.

### Opportunity 4: Eliminate the race entirely

Instead of two independent debounced observers, use a single merged "bridge sync" function that:
1. Reads both CRDTs.
2. Decides which direction needs syncing.
3. Syncs in the correct direction.
4. Updates baseline atomically.

This eliminates the timing race between two independent debounces but adds complexity and deviates from the current architecture.

## Assessment

Baseline narrowing is the highest-leverage dimension. If Path B fires on <0.1% of observer cycles (only during rare concurrent cross-mode scenarios), the merge algorithm barely matters. The current architecture already handles most cases correctly — Path B fires mainly during rapid concurrent cross-mode editing.

**The residual 2-3% in fuzz tests is artificially high** because the fuzzer intentionally drives concurrent cross-mode writes at high frequency. In typical production usage (mostly single-mode editing), Path B fires much less often.

However, the fuzzer tests the WORST case, which is the right thing to test. For a zero-tolerance goal, narrowing alone isn't sufficient — we also need a better merge algorithm for when Path B does fire.

**Recommended approach:** Combine baseline narrowing (shorter debounce or merged sync) with a lossless merge algorithm for the residual Path B cases.

## Confidence: HIGH

Server-observers.ts fully read and understood. The race conditions and baseline update points are deterministic. The production frequency estimate is MEDIUM confidence (depends on usage patterns).
