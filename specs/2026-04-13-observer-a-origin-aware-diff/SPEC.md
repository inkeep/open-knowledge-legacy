# Observer A Origin-Aware Diff — Spec

**Status:** Ready for Implementation
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-13 (pm-3, post-audit)
**Baseline commit:** `dfe9a49`
**Links:**
- Upstream story: `stories/collaboration-capabilities-audit/STORY.md` §3 Area B, §15 Nick's track
- Undo architecture spec: `specs/2026-04-10-undo-architecture/SPEC.md` (R5/R6 root causes)
- Prior research (from observer-b-web-worker session): origin-laundering trace, Probe B perf data, XmlFragment events analysis
- **New research (2026-04-13):** `reports/crdt-origin-laundering-prior-art/REPORT.md` — cross-ecosystem prior-art survey (y-prosemirror, slate-yjs, BlockSuite, BlockNote, Milkdown, Plate, Automerge-ProseMirror, academic literature)
- Evidence: `./evidence/`

---

## 1) Problem statement

**Situation.** Observer A syncs Y.XmlFragment → Y.Text by serializing the fragment to markdown, diffing against a baseline (`lastSyncedXmlMd`), and applying the delta to Y.Text. This serialize→diff→apply pattern works correctly for propagation — content reaches both representations.

**Complication.** The cycle **origin-launders CRDT Items**. When Observer A applies a diff hunk, it calls `ytext.delete()` + `ytext.insert()` within a transaction with origin `'sync-from-tree'`. This replaces agent-created Items (origin `'agent-write'`) with new Items (origin `'sync-from-tree'`). The Y.UndoManager, which tracks only `'agent-write'` origins, then:
1. Finds the original agent Items (now marked deleted) → restores them
2. Cannot touch the replacement `'sync-from-tree'` Items → they stay
3. Both coexist → **zombie content** (~257 chars per undo cycle, measured in PR #34)

The root cause is NOT diff granularity — it's that Observer A's delete+reinsert overwrites Items that already had the correct content from the correct origin. Whether the overwrite is line-level or character-level, the new Items still get `'sync-from-tree'` origin.

Critically: **Y.js Items do not store transaction origins.** `Item.origin` is the CRDT causal origin (the Item to the left at insertion time), not the transaction origin string. There is no public API to read "which transaction created this Item" after the fact. (Evidence: `evidence/yjs-item-origin-model.md`)

**Resolution.** Make Observer A **content-aware**: before applying a diff hunk, check whether Y.Text already contains the correct content at that position. If it does, skip the delete+reinsert — leave the existing Items (and their UndoManager tracking) untouched. Combined with rewriting the diverged path (`applyUserDelta`) to use DMP's `patch_make` + `patch_apply` (canonical three-way merge), which produces correctly merged output for same-line concurrent edits where the prior custom line-walk produced split lines.

This delivers FR-4/US-3e (same-line interleaved undo) as an independent correctness improvement. It does NOT block Miles's undo implementation (FR-1/FR-2/FR-3/FR-5/FR-6 ship without it).

## 2) Goals

- **G1.** Zero zombie content on agent undo when user and agent edit the same line. Measured: current ~257 chars/cycle → target 0 chars/cycle.
- **G2.** Preserve bridge invariant: `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` after every Observer A sync.
- **G3.** No regression on Observer A performance. Path A stays on line-level diff (`diffLinesFast` + content-comparison gate). Path B uses DMP `patch_apply`; patches are typically small, so expected at-or-below current line-walk cost. Implementation must re-measure both paths via `observers.stress.s4.test.ts` timing assertions; STOP_IF threshold (>20% Path A regression) triggers escalation back to spec.
- **G4.** All existing stress/fuzz/bridge-matrix tests pass. New TQ6 stress test quantifies same-line collision behavior.

## 3) Non-goals

- **[NEVER] NG1:** Changing Observer B, the persistence layer, or the file watcher. Observer A only.
- **[NEVER] NG2:** Accessing Y.js internal Item structures (`_start`, `_item`). The fix uses only the public `ytext.toString()` + `ytext.delete()` + `ytext.insert()` API.
- **[NEVER] NG3:** Changing the serialize→diff→apply architectural pattern. We optimize within it, not replace it.
- **[NOT NOW] NG4:** XmlFragment event-driven sync (option c from the prior research). Would be a new pattern — first delta-processing code in the codebase. Higher complexity for marginal gain over content-aware diff.
- **[NOT NOW] NG5:** Making this a prerequisite for Miles's undo. FR-1/FR-2/FR-3/FR-5/FR-6 ship independently.

## 4) Personas / consumers

- **P1: Human editor** — Types in WYSIWYG while an agent writes via MCP on the same line. Expects Cmd+Z to undo only their characters, preserving the agent's.
- **P2: AI agent (via MCP/API)** — Writes content that should be revertable by the human without zombie residue.
- **P3: Observer pipeline developer** — Next person touching `observers.ts`. Inherits a cleaner model where Observer A doesn't unnecessarily overwrite content.

## 5) User journeys

### P1 happy path (FR-4/US-3e)
1. User is typing on line 5 in WYSIWYG
2. Agent writes " World" at the end of line 5 via MCP (appears in real-time via CRDT sync)
3. User continues typing
4. User presses Cmd+Z — their last characters undo, agent's " World" preserved
5. User clicks "Undo Agent Edit" — agent's " World" disappears, user's content preserved
6. Zero zombie content in either direction

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria |
|---|---|---|---|
| Must | FR-1 | `applyIncrementalDiff` (Path A) adds a content-comparison gate before each delete+insert | Before `ytext.delete(offset, len)` + `ytext.insert(offset, value)`, check if `currentText.substring(offset, offset + len)` already equals the inserted `value`. If yes, skip. Verified by unit test. |
| Must | FR-2 | `applyUserDelta` (Path B) is rewritten to use DMP `patch_make` + `patch_apply` (canonical three-way merge) | `patches = dmp.patch_make(lastSyncedXmlMd, newXmlMd)`; `[mergedText, results] = dmp.patch_apply(patches, currentText)`; apply `mergedText` via `applyByPrefixSuffix(ytext, currentText, mergedText)`. On any `false` in `results` (failed patch under extreme divergence), fall back to user-wins: discard that patch's delta and continue. Verified by unit test. (Locked D5.) |
| Must | FR-3 | `applyUserDelta` produces correct merged result when user and agent edit the same line | Reproducible scenario (per audit F9): two-client multi-doc test. Client B's Y.Text receives a remote agent write to line N (`!transaction.local`); on Client A this triggers Observer A's else-branch which only refreshes `lastSyncedXmlMd` baseline (no Y.Text sync). Client A's user then types on line N in WYSIWYG → XmlFragment changes → `currentText !== lastSyncedXmlMd` → Path B fires → DMP `patch_make` + `patch_apply` produces merged content with both edits (e.g., "Hello world brave"). Verified empirically by DMP probe; full coverage in TQ6 multi-client variant. |
| Must | FR-4 | Zero zombie content after agent undo on same-line concurrent edits | After FR-3 scenario + agent undo: agent's "brave" removed, user's "world" preserved, no extra characters remain. Verified by bridge-matrix undo-invariant test. |
| Must | FR-5 | Bridge invariant holds after every Observer A sync | `stripTrailingWhitespace(ytext.toString()) === stripTrailingWhitespace(serialize(fragment))` after debounce settles. Verified by existing bridge-matrix test + new assertions. |
| Must | FR-6 | No performance regression on Path A (simple path) | Path A stays on `diffLinesFast`. The content-comparison gate adds one `substring` comparison per diff hunk — O(hunk_size), negligible vs serialize cost. Verified by existing stress test timing assertions. |
| Must | FR-7 | Path B emits a `safetyCheckpoint` event-map entry when DMP `patch_apply` reports any failed patch (`results.some(ok => !ok)`) | Entry written to `Y.Map('safety-events')` (separate from `Y.Map('activity')`). Shape per AGENTS.md precedent #3: `{ actor: 'observer-a', timestamp, action: { kind: 'merge-failed', metadata: {...patch counts} }, visibility: 'debug' }`. Diagnostic only; not user-facing in V0. Successful three-way merges DO NOT emit (they're normal Path B operation). (Locked D10.) |

### Non-functional requirements

- **Performance:** Observer A total cost (serialize + diff + apply) stays under 50ms at 10K blocks on Path A. Path B (diverged) stays under 70ms at 10K blocks. With D5 (DMP `patch_apply`) replacing the custom diff-walk, expected to be FASTER than the line-level baseline at 10K blocks (`patch_apply` is O(n*m) where m=patch size; typical patch sizes are <1KB). Probe B data on `diff_main` (35ms at 10K) is no longer the relevant baseline since we're not invoking standalone char-level diff. To be re-measured during implementation.
- **Test coverage:** All existing S1-S9 stress, fuzz, and bridge-matrix tests pass. New TQ6 test exercises same-line concurrent scenario explicitly.

## 7) Proposed solution

### 7a) Content-comparison gate in `applyIncrementalDiff` (FR-1)

Before each REMOVED+ADDED pair, check if the content at offset already matches what we'd insert. If so, skip both — preserves existing CRDT Items.

```typescript
function applyIncrementalDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;
  const changes = diffLines(currentText, newText);
  let offset = 0;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      // Content-comparison gate (D7): if Y.Text already has the added content
      // at this offset, skip both delete and insert — preserve CRDT Items.
      const targetSlice = currentText.substring(offset, offset + next.value.length);
      if (targetSlice === next.value) {
        // No-op replacement; advance offset by the (now equal) length.
        offset += next.value.length;
        i++; // consume the paired ADDED
        continue;
      }
      ytext.delete(offset, change.value.length);
      ytext.insert(offset, next.value);
      offset += next.value.length;
      i++; // consume the paired ADDED
    } else if (change.removed) {
      ytext.delete(offset, change.value.length);
    } else if (change.added) {
      ytext.insert(offset, change.value);
      offset += change.value.length;
    } else {
      offset += change.value.length;
    }
  }
}
```

D7-locked: adjacent-only pairing. Non-adjacent REMOVED+ADDED indicates genuine content change on both sides — gate wouldn't fire meaningfully.

### 7b) `applyUserDelta` rewrite — DMP `patch_make` + `patch_apply` (FR-2, FR-3)

D5-locked: replace the line-walk with the canonical three-way merge.

```typescript
import DiffMatchPatch from 'diff-match-patch';

// Module-local instance so DMP tuning never collides with other importers
// (e.g., diff-lines-fast.ts has its own instance). Match_Threshold pinned to
// the DMP default (0.5) explicitly per audit F15 — depending on the default
// would silently regress if a future module mutated the shared singleton.
const dmp = new DiffMatchPatch();
dmp.Match_Threshold = 0.5;

function applyUserDelta(
  doc: Y.Doc,
  ytext: Y.Text,
  oldXmlMd: string,
  newXmlMd: string,
): void {
  if (oldXmlMd === newXmlMd) return;
  const currentText = ytext.toString();

  // Three-way merge: patch built from base→user, applied to agent's diverged Y.Text.
  // - base = oldXmlMd (lastSyncedXmlMd, the common ancestor)
  // - user = newXmlMd (the user's branch via XmlFragment serialize)
  // - agent = currentText (the agent's branch in Y.Text)
  const patches = dmp.patch_make(oldXmlMd, newXmlMd);
  const [mergedText, results] = dmp.patch_apply(patches, currentText);

  // Failed patches indicate the patch's context could not be located in agent's
  // text within Match_Threshold. patch_apply still returns mergedText with the
  // successful patches applied and failed ones skipped — that's "user-wins on what
  // we could merge". Emit a safetyCheckpoint diagnostic so a future debug panel
  // can surface these cases. Successful merges (results all true) are normal
  // Path B operation and don't need a diagnostic.
  if (results.some((ok: boolean) => !ok)) {
    emitSafetyCheckpoint(doc, {
      kind: 'merge-failed',
      metadata: {
        baseLen: oldXmlMd.length,
        userLen: newXmlMd.length,
        agentLen: currentText.length,
        mergedLen: mergedText.length,
        failedPatches: results.filter((ok: boolean) => !ok).length,
        totalPatches: results.length,
      },
    });
  }

  if (mergedText === currentText) return;

  // Apply via prefix/suffix to minimize CRDT mutations beyond what patch_apply already
  // resolved. Items in the matching prefix/suffix are preserved (no delete fires for them).
  applyByPrefixSuffix(ytext, currentText, mergedText);
}
```

**Caller-site change (per audit F6):** the call in `runObserverASync` becomes `applyUserDelta(doc, ytext, lastSyncedXmlMd, md)` — explicit `doc` parameter replaces fragile `ytext.doc!`. Trivial site change at observers.ts:331.

Why DMP: empirically validated on the FR-3 scenario (`base="Hello", user="Hello world", agent="Hello brave"` → merged `"Hello world brave"`). Custom walk produced two-line split — wrong. Research confirms no other Yjs editor has built a content-comparison three-way merge; DMP `patch_apply` is the canonical JS three-way merge algorithm, well-tested and used widely in collaborative-editing tooling.

OQ-5 lock: user-wins on collision is DMP's default behavior. Verified: `base="a\nb\nc", user="a\nc" (deleted b), agent="a\nb!\nc" (modified b)` → `"a\nc"` — agent's modification dropped.

D8 acknowledgment: exact-character overlap (`base="hello", user="hello!", agent="hello!"`) produces `"hello!!"` (duplicates). Inherent to three-way merge — both sides independently made the same change. Mitigation path is NG4 (XmlFragment event-driven sync), explicitly deferred.

### 7c) `safetyCheckpoint` event-map emission (FR-7, OQ-6 locked)

**Why a NEW map (per audit F8/F17):** the existing `Y.Map('activity')` is keyed by `agentId` with single-entry-per-agent semantics (overwrites; consumed by `agent-flash-source.ts` + presence rendering). Mixing a UUID-keyed event log into the same map would conflict with consumers and risk feedback loops. The safety event channel uses its own map.

```typescript
// packages/app/src/editor/safety-checkpoint.ts (NEW)
import type * as Y from 'yjs';

export interface SafetyCheckpointAction {
  kind: 'merge-collision' | 'merge-failed';
  metadata: Record<string, unknown>;
}

/**
 * Emit a structured safety-event entry. Writes to a DEDICATED `Y.Map('safety-events')`
 * — separate from the agent-keyed `Y.Map('activity')` to avoid schema collision and
 * feedback loops with presence consumers.
 *
 * Caller MUST be inside a Y transaction. The emit happens within that transaction,
 * so the event's CRDT origin matches the caller's origin (e.g. 'sync-from-tree').
 */
export function emitSafetyCheckpoint(doc: Y.Doc, action: SafetyCheckpointAction): void {
  const events = doc.getMap('safety-events');
  const id = `safety-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  events.set(id, {
    actor: 'observer-a',
    timestamp: Date.now(),
    action,
    visibility: 'debug',  // not user-facing in V0; reserved for future debug panel
  });
}
```

Shape conforms to AGENTS.md precedent #3 (structured event schemas). No render-path consumer in V0 — the map is write-only until a future debugging panel is built. Per-doc memory grows by one entry per Path B failed patch; if growth becomes a concern, add eviction (FIFO with max 100 entries) — out of scope for this spec.

**Emission gate (per audit F10):** emit ONLY when `patch_apply` reports a failed patch (`results.some(ok => !ok)`). That's the genuine "we couldn't apply the user delta cleanly under DMP's fuzzy match" signal. The earlier "is collision" heuristic was over-broad — it would have fired on every benign Path B merge. Successful three-way merges (no failed patches) are the expected normal Path B operation and don't need a diagnostic event.

### 7d) Test plan (FR-3, FR-4, FR-5, FR-7)

**TQ6 single-client (extends `observers.stress.s4.test.ts`):**
- Agent writes to end of line N, user edits start of line N → assert merged Y.Text contains both edits
- Agent undo fires → assert zero zombie content (FR-4)
- User-deletes line + agent-modifies same line → assert user-wins (D9)
- D8 characterization: `base="hello", user="hello!", agent="hello!"` → assert `"hello!!"` (per audit F13 — characterization test prevents silent regression)
- After every Path B sync: assert `lastSyncedXmlMd === md` (the post-serialize XmlFragment string), per audit F11
- Bridge invariant assertion after each step (FR-5)
- `Y.Map('safety-events')` size remains 0 after successful three-way merges; size grows by 1 only when DMP `patch_apply` reports a failed patch (FR-7)

**TQ6 multi-client (extends `bridge-matrix.test.ts` per audit F12 + CLAUDE.md's "Observer bridge coverage" rule):**
- Two clients connected to the same Y.Doc. Client A makes a local XmlFragment edit on line N. Concurrently, Client B's Y.Text receives a remote agent write to line N (arrives via WebSocket sync, `transaction.local === false`).
- Client A's Observer A fires Path B (Y.Text diverged from baseline). Assert merged result preserves both edits.
- Both clients' Y.Text + XmlFragment converge to the same content (assert via `assertBridgeInvariant` on each client).
- Agent undo on the server fires → assert zero zombie content on both clients.

**`safety-checkpoint.test.ts` unit:**
- `emitSafetyCheckpoint(doc, action)` writes one entry to `Y.Map('safety-events')`
- Entry conforms to AGENTS.md precedent #3 shape: `{ actor, timestamp, action: { kind, metadata }, visibility }`
- Entry is NOT written to `Y.Map('activity')` (audit F8 — separate channels)
- ID is unique across multiple emissions in the same tick

**`observers.test.ts` extensions:**
- **FR-1 unit:** content-gate skip path. Construct Y.Text with content matching what `applyIncrementalDiff` would re-insert; assert no `delete`/`insert` operations fire (count via Y.Text observer).
- **FR-2 unit:** `applyUserDelta` (new signature `(doc, ytext, oldXmlMd, newXmlMd)`) returns Y.Text with merged content for the FR-3 scenario; assert `safety-events` map empty when `results=[true,...]`.
- **A1 verification:** Construct Y.Text with three Items: A (origin `'agent-write'`), B (origin `'sync-from-tree'`), C (origin `'agent-write'`). Apply `applyByPrefixSuffix` such that the middle region (containing B) is replaced. Assert `Y.UndoManager` (tracking `'agent-write'`) still has both A and C in its stack — Items in matching prefix/suffix preserved.

**`observers.fuzz.test.ts` extension (R3 + A5 verification):**
- Existing fuzz harness is extended with a new operator: random "agent rewrites paragraph N to ~50% different content" between user edits. Asserts:
  - DMP `patch_apply` either succeeds (`results` all true) OR emits a `safety-events` entry (no silent drops).
  - Bridge invariant holds after every fuzz step.
  - When `results` contains `false`, the failed patch's delta is observably discarded (mergedText differs from naive concatenation).
- Run with multiple `STRESS_FUZZ_SEED` values to cover divergence patterns the smoke tests don't reach.

## 8) Open Questions

| ID | Question | Type | Priority | Status |
|---|---|---|---|---|
| OQ-1 | ~~Does `diff_cleanupSemantic` in `diffCharsFast` produce optimal hunks for same-line collision scenarios?~~ | Technical | P0 | **SUPERSEDED by D5**: With DMP `patch_make`/`patch_apply` as the Path B algorithm, `diffCharsFast` may not be needed. `patch_make` internally applies both `diff_cleanupSemantic` and `diff_cleanupEfficiency` with tuned defaults. |
| OQ-2 | In `applyUserDelta` rewrite, when user and agent overlap on the EXACT same characters (not just same line), what's the correct merge semantics? | Technical/Product | P0 | **INVESTIGATED**: DMP probe shows `patch_apply(diff("hello","hello!"), "hello!")` = `"hello!!"` — duplicates the `!`. Matches CRDT last-writer-wins semantics (both writes happened independently). Accepted as known limitation. Mitigation path: NG4 (XmlFragment event-driven sync) would eliminate. |
| OQ-3 | ~~Should the content-comparison gate compare the FULL hunk or just a hash?~~ | Technical | P2 | Deferred — full comparison at our scale (hunks typically <1KB). |
| OQ-4 | Path B algorithm choice: DMP `patch_apply` vs. custom diff-walk. | Technical | P0 | **RESOLVED → D5 LOCKED.** Empirical probe `/tmp/dmp-probe.ts`. |
| OQ-5 | User DELETES line that agent MODIFIED — which wins? | Product | P0 | **RESOLVED → D9 LOCKED (user-wins).** DMP default; matches existing comment in `applyUserDelta`. |
| OQ-6 | Emit `safetyCheckpoint` on same-line collision? | Product | P2 | **RESOLVED → D10 LOCKED (yes).** New `safety-checkpoint.ts`, visibility=`'debug'`. |
| OQ-7 | Path A/B telemetry counter? | Technical | P2 | **RESOLVED → D11 LOCKED (no, user opted out).** |
| OQ-8 | Content-gate pairing: adjacent only? | Technical | P1 | **RESOLVED → D7 LOCKED (adjacent-only).** |
| OQ-9 | `diffCharsFast` helper still needed under D5? | Technical | P1 | **RESOLVED → D6 LOCKED (drop).** |
| OQ-10 | Document three unclaimed patterns in AGENTS.md? | Documentation | P2 | **RESOLVED → D12 LOCKED (yes, precedent #9).** |

## 9) Decision Log

| ID | Decision | Type | Status | Rationale |
|---|---|---|---|---|
| D1 | Fix uses content comparison, not Item-origin inspection | Technical | LOCKED | Y.js Items don't store transaction origins. Content comparison achieves the same effect (preserving agent Items when content matches) using only the public API. Evidence: `evidence/yjs-item-origin-model.md` |
| D2 | Path A stays on line-level diff; Path B moves to char-level | Technical | LOCKED | Probe B data: diffChars is 7x slower. Path A (~90% of fires) doesn't have the sub-line problem. Path B (~10%) does. Performance budget preserved. Evidence: `evidence/observer-a-two-paths.md` |
| D3 | Approach: hybrid content-aware + char-level (option d) | Technical | LOCKED | Prior research evaluated 4 approaches. (a) char-level alone doesn't fix origin problem. (b) origin-aware alone doesn't improve three-way merge precision. (c) XmlFragment events is a new pattern, high complexity. (d) hybrid addresses both root causes within existing patterns. |
| D4 | Decoupled from Miles's undo | Product | LOCKED | First-principles analysis: FR-1/FR-2/FR-3/FR-5/FR-6 don't depend on Observer A. Only FR-4/US-3e does. See STORY.md §3 Area B decoupling analysis. |
| D5 | Path B uses DMP `patch_make` + `patch_apply` (canonical three-way merge) instead of custom diff-walk | Technical | LOCKED (2026-04-13) | Empirical probe (`/tmp/dmp-probe.ts`) shows DMP correctly merges same-line collisions out of the box. Custom walk produces two-line split (wrong) on `base="Hello", user="Hello world", agent="Hello brave"`. DMP produces `"Hello world brave"` (correct). Research validation: no equivalent pattern in any surveyed CRDT editor (report Finding 6) — DMP patch_apply is the canonical JS three-way merge. |
| D6 | Drop FR-7 (`diffCharsFast` helper) | Technical | LOCKED (2026-04-13) | Conditional on D5. With DMP patch_apply, no caller needs standalone char-level diff. Simplifies scope — removes new file `diff-chars-fast.ts` from SCOPE. |
| D7 | Content-comparison gate (FR-1) uses adjacent REMOVED+ADDED pairing only | Technical | LOCKED | OQ-8 resolution. diffLines output structure makes non-adjacent REMOVED+ADDED always indicate genuine changes on both sides — gate wouldn't fire meaningfully on non-adjacent pairs. |
| D8 | OQ-2 (exact-char overlap duplication) accepted as known limitation | Technical | LOCKED | DMP probe: `patch_apply(diff("hello","hello!"),"hello!")="hello!!"`. Inherent to three-way merge — both sides independently made the same change. Mitigation path is NG4 (XmlFragment event-driven sync), explicitly deferred. Logged in Future Work. |
| D9 | OQ-5: user-wins on user-delete-line + agent-modify-same-line | Product | LOCKED (2026-04-13) | DMP default behavior. Matches existing `applyUserDelta` comment ("the user's change wins"). Predictable, simple. Deferred from V0: conflict-marking UI (would need product design). |
| D10 | OQ-6: emit `safetyCheckpoint` activity entry on Path B same-line collision | Product/Technical | LOCKED (2026-04-13) | New `safety-checkpoint.ts` helper. Activity-map shape per AGENTS.md precedent #3. Visibility: `'debug'` in V0 (no UI surface). Diagnostic enables future debug panel for "agent+user merged on line N" events. |
| D11 | OQ-7: NO Path A/B telemetry counter in this spec | Technical | LOCKED (2026-04-13) | User explicitly opted out. Counter would verify A3 (~10% diverged-path rate) but adds noise without clear consumer. Can be added later if assumption is challenged. |
| D12 | OQ-10: Document the three unclaimed patterns as AGENTS.md precedent #9 | Documentation | LOCKED (2026-04-13) | Strengthens architectural narrative. Cross-refs precedent #1 (typed transaction origins). Patterns: (a) content-comparison gate before CRDT delete+insert, (b) char-level diff as Item-preservation lever in serialize→diff→apply bridges, (c) origin-aware reconciliation at the bridge layer (vs. ingress filter). |

## 10) Assumptions

| ID | Assumption | Confidence | Verification plan |
|---|---|---|---|
| A1 | `applyByPrefixSuffix` preserves CRDT Items in the matching prefix/suffix regions | HIGH | Y.js delete/insert semantics: Items in untouched regions are never marked deleted. Verify empirically with a test that checks `Y.UndoManager` stack content after prefix/suffix application. |
| A4 | DMP `patch_apply` correctly resolves three-way merge for our scenarios | HIGH | Empirical probe `/tmp/dmp-probe.ts` (2026-04-13): verified on 5 scenarios including FR-3 acceptance scenario (`"Hello world brave"`), user-prepend+agent-append, different-line edits, user-delete+agent-modify (user-wins), exact-char overlap (duplicates per D8). All produced expected merges with `results=[true]`. |
| A5 | DMP `Match_Threshold=0.5` is appropriate for our typical divergence levels | MEDIUM | Pinned explicitly in code (audit F15). Could need tuning if agent edits drift markdown structure (e.g., wrap long lines). Verify with TQ6 fuzz extension that perturbs context heavily. |
| A6 | After Path B, `lastSyncedXmlMd` is set to `md` (XmlFragment serialization), NOT `mergedText` (Y.Text content). This is unchanged by this spec — preserves the current observers.ts:335 behavior. | HIGH | Consequence: after Path B fires, `currentText` (Y.Text with mergedText) ≠ `lastSyncedXmlMd` (XmlFragment serialization). Subsequent Observer A triggers do NOT spuriously re-fire Path B: the early-return at observers.ts:302 (`if (lastSyncedXmlMd === md) return;`) exits when XmlFragment hasn't changed. Path B re-fires only if XmlFragment ALSO changes, in which case the new `oldXmlMd → newXmlMd` patch is applied against the merged Y.Text — correct behavior. Convergence to a fully-unified state requires Observer B to fire from another Y.Text local mutation — same dynamic as the existing implementation. **Not a regression.** Verified by TQ6 assertion: `lastSyncedXmlMd === md` after Path B. |

## 11) Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Content-comparison gate has false positives (content matches but shouldn't be skipped) | Low | Medium — could prevent legitimate updates | The gate only fires when a REMOVED+ADDED pair has identical content at the same offset. If content matches, by definition the update is a no-op. False positives are impossible by construction. |
| `applyUserDelta` rewrite changes merge semantics for edge cases not covered by existing tests | Medium | Medium — could silently change content on rare concurrent edits | Comprehensive test coverage: existing S4 stress + new TQ6 same-line test + fuzz tests. Run `bun run check:full:parallel` before merging. |
| DMP `patch_apply` fuzzy matching produces unexpected merges under extreme divergence | Medium | Medium — could merge user content into wrong location if agent-modified context is unrecognizable | `Match_Threshold=0.5` is DMP default and well-tested. For extreme cases (agent rewrote entire paragraph), `results` array from `patch_apply` surfaces per-patch success. On `false` result, fall back to user-wins (discard that patch's delta). TQ6 stress test should exercise this. |
| Baseline (`lastSyncedXmlMd`) drift after content-comparison gate skips a hunk | Low | High — stale baseline causes wrong deltas on next fire | Verify: after a gate-skipped hunk, baseline is still set to `newXmlMd` at end of sync (line 335 of current observers.ts unchanged). The skip is at the Y.Text-write layer; the baseline tracks XmlFragment, which DID change. Invariant holds. Add assertion in tests. |

## 12) Future Work

- **[Explored]** XmlFragment event-driven sync (NG4). Investigated during prior research session. Would eliminate serialize→diff→apply entirely. Higher complexity, new pattern. The content-aware approach in this spec gets ~95% of the benefit at ~20% of the complexity. Revisit if exact-character overlap duplication (D8) becomes a reported user-facing issue.
- **[Identified]** Per-character undo granularity. Currently UndoManager groups by `captureTimeout` (0 = one entry per transaction). Character-level Observer A creates finer-grained CRDT mutations, which could enable more granular undo in the future.
- **[Noted]** Observer A serialize cost (~23ms at 10K blocks) remains the dominant cost. A future optimization could use incremental serialization (only re-serialize changed ProseMirror nodes). Out of scope — performance is within budget.
- **[Identified]** Per-character agent attribution layer. Would enable dmonad's option #1 (propagate original origin through the bridge). Eliminates the need for content-comparison heuristics entirely. Bigger architectural project — requires Y.js XmlFragment-side metadata channel or custom attribution side-table.
- **[Novelty documentation]** The three patterns named by this spec (content-comparison gate, char-diff Item-preservation, origin-aware bridge reconciliation) are unclaimed in academic + engineering literature as of 2026-04-13 per research report Finding 6. If these ship, worth documenting as architectural precedents in AGENTS.md (see OQ-10).

## 13) Agent Constraints

**SCOPE:**
- `packages/app/src/editor/observers.ts` — `applyIncrementalDiff` (content-gate FR-1), `applyUserDelta` (DMP rewrite FR-2 — signature changes to `(doc, ytext, oldXmlMd, newXmlMd)`), keep `applyByPrefixSuffix` unchanged. Adds imports: `import DiffMatchPatch from 'diff-match-patch'` and `import { emitSafetyCheckpoint } from './safety-checkpoint'`. Caller site at `runObserverASync` updated to pass `doc` (line ~331).
- `packages/app/src/editor/safety-checkpoint.ts` (NEW) — `emitSafetyCheckpoint` helper writing to `Y.Map('safety-events')` (NOT `Y.Map('activity')` — separate channel per audit F8/F17)
- `packages/app/src/editor/safety-checkpoint.test.ts` (NEW) — unit tests for the helper
- `packages/app/tests/stress/observers.stress.s4.test.ts` (extend with TQ6: same-line collision + user-delete-with-agent-modify + safetyCheckpoint emission assertions)
- `packages/app/tests/integration/bridge-matrix.test.ts` (extend with undo-invariant assertions for FR-4 + multi-client TQ6 variant)
- `packages/app/src/editor/observers.test.ts` (extend with FR-1 content-gate skip, FR-2 DMP patch_apply, A1 UndoManager-stack-preservation, safetyCheckpoint tests)
- `packages/app/tests/stress/observers.fuzz.test.ts` (extend with agent-paragraph-rewrite operator for R3 + A5 verification)
- `AGENTS.md` — add precedent #9 documenting the three patterns (D12)

**NOT in scope (per D6/D11):**
- `packages/app/src/editor/diff-chars-fast.ts` — DROPPED. DMP `patch_apply` supersedes.
- Path A/B telemetry counter — DROPPED.

**EXCLUDE:**
- `packages/server/` — Observer A is client-side only
- `packages/core/` — no markdown pipeline changes
- `packages/cli/` — no MCP changes
- Observer B — not in scope
- Any file not listed in SCOPE

**STOP_IF:**
- Bridge invariant fails on any existing test
- Performance regression >20% on Path A (simple path)
- `bun run check` fails

**ASK_FIRST:**
- Before changing the `DiffChange` interface in `diff-lines-fast.ts` (consumed by `applyIncrementalDiff` Path A)
- Before modifying `applyByPrefixSuffix` (shared helper used by both paths)
- Before changing the `safety-events` map name or its entry shape (precedent #3 contract)
- Before mutating DMP instance properties (`Match_Threshold`, `Patch_DeleteThreshold`, etc.) — they affect three-way merge semantics
