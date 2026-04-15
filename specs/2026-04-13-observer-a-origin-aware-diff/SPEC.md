# Observer A Origin-Aware Diff — Spec

**Status:** Ready for Implementation
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-14 (bridge-invariant reframe post-PR-#39 merge)
**Baseline commit:** rebased onto `origin/main` (db8a6d6 — PR #39 Timeline + rollbacks merged)
**Tracking IDs:** TQ5 (Observer A refactor) + TQ6 (US-3e stress test) in `projects/v0-launch/PROJECT.md`
**Primary consumer:** V0-14 (Miles's three-UndoManager architecture) — see `projects/v0-launch/PROJECT.md:107-148`
**Links:**
- V0-14 project entry: `projects/v0-launch/PROJECT.md` §Miles Now / §Nick Now
- Upstream story: `stories/collaboration-capabilities-audit/STORY.md` §3 Area B, §15 Nick's track
- Miles's undo architecture spec (noted in PROJECT.md:1154 as "needs reframe"): `specs/2026-04-10-undo-architecture/SPEC.md`
- Prior research (observer-b-web-worker session): origin-laundering trace, Probe B perf data, XmlFragment events analysis
- **Research (2026-04-13):** `reports/crdt-origin-laundering-prior-art/REPORT.md` — cross-ecosystem prior-art survey (y-prosemirror, slate-yjs, BlockSuite, BlockNote, Milkdown, Plate, Automerge-ProseMirror, academic literature)
- Evidence: `./evidence/`

---

## 1) Problem statement

**Situation.** Observer A syncs Y.XmlFragment → Y.Text by serializing the fragment to markdown, diffing against a baseline (`lastSyncedXmlMd`), and applying the delta to Y.Text via `ytext.delete()` + `ytext.insert()` with origin `'sync-from-tree'`. Observer A is the primary client-side propagator for WYSIWYG → Source mirroring.

**Complication.** The current implementation violates the **bridge quality invariant**:

> *Sync operations must not replace CRDT Items whose content at the target position already matches what would be written.*

Whenever the diff emits a REMOVED+ADDED hunk for content that is already in Y.Text at that offset (e.g. agent writes that arrived via HocuspocusProvider sync and are now present in Y.Text but not yet in XmlFragment), Observer A destroys the existing Items and re-emits them under `'sync-from-tree'` origin. The new Items are semantically equivalent but have a different transaction origin than the Items they replaced. We call this **origin-laundering** — the bridge launders the transaction provenance that Y.UndoManager's `trackedOrigins` whitelist relies on.

**Why this is a bridge-layer defect, not a symptom.** Any consumer that distinguishes Items by transaction origin — present or future — is structurally broken on any region Observer A has re-emitted. The consumer-facing symptom ("zombie content on agent undo," ~257 chars/cycle measured in PR #34 against the pre-V0-16 agent UndoManager) is one observable manifestation. The underlying property being violated is architectural: a sync bridge should preserve CRDT Items whose content is already correct.

**Current consumer status.** PR #39 (V0-16) removed the broken agent UndoManager scaffold. V0-14 (Miles, next up) reintroduces per-origin undo using the canonical Y.UndoManager API: `new Y.UndoManager(ytext, { trackedOrigins: new Set(['agent-write']) })` per-agent, keyed by `AgentIdentity.connectionId`. V0-14's correctness on the common case of concurrent editing depends on our bridge-invariant fix; without it, V0-14 ships with a silent contract violation whenever a user types on the same line an agent wrote to.

**Why not per-character attribution?** The research report (`reports/crdt-origin-laundering-prior-art/REPORT.md`) surveys ecosystem alternatives. Yjs's data model stores transaction origin on the transaction, not on the Item — so "who wrote this character" is not recoverable post-hoc. (`evidence/yjs-item-origin-model.md`.) Per-character attribution would require a separate attribution side-table; that's a much larger architectural change (see Future Work). Content-comparison at the bridge layer is the minimal, evidence-based fix — it's how y-prosemirror avoids the equivalent pitfall (structural subtree diff, skip unchanged regions) and is unclaimed as a named pattern in the Yjs ecosystem (research report Finding 6).

**Resolution.** Make Observer A preserve CRDT Items whose content already matches at the target position. Two code paths need this property:
1. **Path A (simple, `currentText === lastSyncedXmlMd`):** Add a content-comparison gate — before each REMOVED+ADDED hunk, if the added content is already at `currentText[offset..]`, skip both operations.
2. **Path B (diverged, `currentText !== lastSyncedXmlMd`):** Replace the custom line-walk with DMP's `patch_make` + `patch_apply` — the canonical three-way merge. DMP's fuzzy matching preserves Item-equal prefix/suffix regions and produces correctly merged content for same-line concurrent edits where the prior custom walk produced split lines (empirically verified, see D5).

The invariant is testable today via Item introspection (construct a test-local `Y.UndoManager`, verify stack entries survive Observer A sync). No product UndoManager needs to exist for the test to run; V0-14 inherits correctness when it lands.

## 2) Goals

- **G1. Bridge quality invariant holds: zero unnecessary Item replacement.** After any Observer A sync, every CRDT Item whose content at its position already matched what the sync would write is still present (same ID, same clock, not tombstoned). Measured via Item introspection in unit test + a test-local `Y.UndoManager(ytext, { trackedOrigins: new Set(['agent-write']) })` probe that asserts stack entries survive the sync. (Supersedes the prior "~257 chars/cycle zombie content" goal — that was a symptom of the same invariant violation, measurable against a consumer that was removed in V0-16 and reintroduced in V0-14.)
- **G2. Content propagation bridge invariant preserved:** `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` after every Observer A sync. Unchanged from current behavior; asserted in bridge-matrix tests.
- **G3. Correct three-way merge on same-line concurrent edits.** When Y.Text diverges from baseline (Path B), DMP `patch_apply` produces merged output that preserves both branches' changes on the same line. Measured empirically (DMP probe) and in TQ6 multi-client test.
- **G4. No regression on Observer A performance.** Path A stays on line-level diff (`diffLinesFast` + content-comparison gate). Path B uses DMP `patch_apply`; patches are typically small, so expected at-or-below current line-walk cost. Implementation must re-measure both paths via `observers.stress.s4.test.ts` timing assertions; STOP_IF threshold (>20% Path A regression) triggers escalation back to spec.
- **G5. V0-14 ships with correct undo behavior on concurrent edits.** Downstream goal; realized when Miles lands V0-14. Our fix is the prerequisite — V0-14's `trackedOrigins: Set(['agent-write'])` only holds its contract if Observer A stops laundering `'agent-write'` origins into `'sync-from-tree'` replacements.
- **G6.** All existing stress/fuzz/bridge-matrix tests pass. New TQ6 stress test quantifies same-line collision behavior.

## 3) Non-goals

- **[NEVER] NG1:** Changing Observer B, the persistence layer, or the file watcher. Observer A only.
- **[NEVER] NG2:** Accessing Y.js internal Item structures (`_start`, `_item`). The fix uses only the public `ytext.toString()` + `ytext.delete()` + `ytext.insert()` API.
- **[NEVER] NG3:** Changing the serialize→diff→apply architectural pattern for Observer A's tree→text direction. We optimize within it, not replace it.
- **[NEVER] NG4:** Changing V0-14's three-UndoManager architecture. Our fix operates at the bridge layer, upstream of any UndoManager. V0-14 uses standard `Y.UndoManager({ trackedOrigins })` API.
- **[NEVER] NG5:** Fixing Miles's code. Miles owns V0-14 wiring (UMs, Cmd+Z keybindings, AgentIdentity). Our scope is `observers.ts` only — we ship the bridge invariant so his implementation doesn't need workarounds.
- **[NOT NOW] NG6:** XmlFragment event-driven sync (option c from prior research). Would eliminate serialize→diff→apply entirely — much larger scope, first delta-processing code in the repo. Content-aware diff at the bridge layer gets ~95% of the benefit at ~20% of the complexity.
- **[NOT NOW] NG7:** Per-character attribution side-table. Would eliminate the content-comparison heuristic entirely (dmonad's option #1 from the research report — bridge propagates original origin per character). Requires custom attribution layer; substantially larger architectural change. Flagged in Future Work.
- **[NOT NOW] NG8:** Tracking `'rollback-apply'` origin in any UndoManager. D6(b) in PROJECT.md explicitly decides rollback is NOT undo-tracked (it's a coarse action, append-only via CRDT). Our spec acknowledges the origin exists but does not act on it.

## 4) Personas / consumers

- **P1: V0-14 per-agent UndoManager (Miles's work, immediate consumer).** Server-side `Y.UndoManager(ytext, { trackedOrigins: Set(['agent-write']) })` per connected agent. Requires that agent-origin Items in Y.Text stay agent-origin through the bridge cycle; breaks silently if Observer A re-emits them under `'sync-from-tree'`.
- **P2: Human editor.** Types in WYSIWYG while an agent writes via MCP on the same line. Via V0-14: Cmd+Z undoes only their characters. Via agent undo: server reverts agent Items, user's content preserved. User never sees zombie content or duplicate characters.
- **P3: AI agent (via MCP/API).** Writes content revertable by its own server-side UndoManager (V0-14). Same-line collisions merge cleanly; undo reverses only the agent's contribution.
- **P4: Observer pipeline developer.** Next person touching `observers.ts`. Inherits a cleaner model: the bridge preserves Items by construction, no workarounds in consumers required.
- **P5: Any future origin-preserving consumer.** Per-character attribution layer, selection-preservation layer, collaborative annotations — any mechanism that depends on Items retaining their transaction origin through the bridge. Precedent #9 (AGENTS.md) names the invariant so future work inherits it.

## 5) User journeys

### P1+P2+P3 happy path (FR-4/US-3e): same-line interleaved undo under V0-14
1. User is typing on line 5 in WYSIWYG
2. Agent writes " World" at the end of line 5 via MCP (appears in real-time via CRDT sync; server writes Y.Text with `'agent-write'` origin → per-agent UM captures this Item)
3. User continues typing (local XmlFragment mutations → Observer A syncs to Y.Text)
4. **Our fix:** Observer A preserves the agent's Item where content still matches (content-gate on Path A) or merges via DMP `patch_apply` on Path B, preserving Item-equal prefix/suffix
5. User presses Cmd+Z — WYSIWYG UM reverts their XmlFragment edits; agent's Y.Text Item is untouched
6. Agent calls `undo_agent_edit` via MCP — per-agent UM reverts the agent's Item cleanly; user's content preserved
7. **Zero zombie content in either direction** — because agent's Item retained its `'agent-write'` origin, UM could see and reverse it

### Without our fix (failure mode this spec prevents)
At step 4, Observer A re-emits agent content under `'sync-from-tree'` origin. At step 6, per-agent UM tries to revert `'agent-write'` Items; the original Items are marked deleted and get restored, but the `'sync-from-tree'` replacements are untouched → both coexist → zombie content. V0-14 silently fails on the common case.

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria |
|---|---|---|---|
| Must | FR-1 | `applyIncrementalDiff` (Path A) adds a content-comparison gate before each delete+insert | Before `ytext.delete(offset, len)` + `ytext.insert(offset, value)`, check if `currentText.substring(offset, offset + len)` already equals the inserted `value`. If yes, skip. This preserves Y.Text-side Item identity for ANY unchanged content region — not only same-line agent-written content but any region where Observer A's serialize→diff produces a no-op REMOVED+ADDED pair (e.g., untouched paragraphs, unchanged heading text). Verified by unit test. |
| Must | FR-2 | `applyUserDelta` (Path B) is rewritten to use DMP `patch_make` + `patch_apply` (canonical three-way merge) | `patches = dmp.patch_make(lastSyncedXmlMd, newXmlMd)`; `[mergedText, results] = dmp.patch_apply(patches, currentText)`; apply `mergedText` via `applyByPrefixSuffix(ytext, currentText, mergedText)`. On any `false` in `results` (failed patch under extreme divergence), fall back to user-wins: discard that patch's delta and continue. Verified by unit test. (Locked D5.) |
| Must | FR-3 | `applyUserDelta` produces correct merged result when user and agent edit the same line | Reproducible scenario (per audit F9): two-client multi-doc test. Client B's Y.Text receives a remote agent write to line N (`!transaction.local`); on Client A this triggers Observer A's else-branch which only refreshes `lastSyncedXmlMd` baseline (no Y.Text sync). Client A's user then types on line N in WYSIWYG → XmlFragment changes → `currentText !== lastSyncedXmlMd` → Path B fires → DMP `patch_make` + `patch_apply` produces merged content with both edits (e.g., "Hello world brave"). Verified empirically by DMP probe; full coverage in TQ6 multi-client variant. |
| Must | FR-4 | **Bridge quality invariant: Observer A preserves CRDT Items whose content at their position already matches what the sync would write.** | Architectural test (not behavioral): construct Y.Text with Items written under `'agent-write'` origin, attach a test-local `Y.UndoManager(ytext, { trackedOrigins: new Set(['agent-write']) })` as a probe, trigger Observer A, assert that after the sync (a) the UM's undo stack still contains entries, (b) `um.undo()` reverts to the pre-agent-write state (meaning the Items are still live CRDT Items, not replaced). Verified today without any product UndoManager existing. When V0-14 lands, the same property is observable through its per-agent UMs. |
| Must | FR-5 | Bridge invariant holds after every Observer A sync | `stripTrailingWhitespace(ytext.toString()) === stripTrailingWhitespace(serialize(fragment))` after debounce settles. Verified by existing bridge-matrix test + new assertions. |
| Must | FR-6 | No performance regression on Path A (simple path) | Path A stays on `diffLinesFast`. The content-comparison gate adds one `substring` comparison per diff hunk — O(hunk_size), negligible vs serialize cost. Verified by existing stress test timing assertions. |
| Must | FR-7 | When DMP `patch_apply` reports any failed patch (`results.some(ok => !ok)`), emit an observable diagnostic via (a) `console.warn('[Observer A] patch_apply had N/M failed patches', metadata)` matching existing `observers.ts` console-precedent (lines 337/367/500), and (b) optionally invoke `ObserverDeps.onMergeFailed?(info)` if the consumer provided the callback. | No Y.Doc pollution. No new map. Matches existing observer diagnostic precedent. Consumer (e.g., a future debug panel in V0-14 or beyond) opts in via the callback. Test asserts `spyOn(console, 'warn')` catches the log and that `onMergeFailed` is invoked with correct shape when supplied. Locked D10 (revised). |
| Must | FR-8 | **Remove `Y.Map('conflicts')` dead writes from `standalone.ts`.** Delete the two `conflictsMap` stanzas: (1) in the `case 'conflicts'` handler inside the file-watcher reconciliation path — the `const conflictsMap = document.getMap('conflicts'); for (...) { conflictsMap.set(...) }` block, and (2) in the `case 'conflicts'` handler inside the batch-restore path — the `const conflictDoc = hocuspocus.documents.get(docName); if (conflictDoc) { const conflictsMap = ... }` block. | Zero consumers in `packages/app/src/` (verified via grep). Write-only Y.Map paying CRDT replication cost + unbounded doc growth for a conflict UI that never materialized. Reconciliation logic (`reconciliation.ts`), conflict counter (`incrementConflict()`), and the `{ kind: 'conflicts' }` return type are all preserved — only the dead Y.Map writes are removed. Side effects: zero negative, one positive (stops monotonic doc growth). Greenfield directive: don't ship write-only CRDT infrastructure without a consumer (D14 rationale point 4). Locked D16. |

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
  deps: ObserverDeps,
  oldXmlMd: string,
  newXmlMd: string,
): void {
  if (oldXmlMd === newXmlMd) return;
  const { ytext } = deps;
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
  // we could merge". Emit a console.warn (matches existing observers.ts
  // diagnostic precedent at lines 337/367/500) and invoke the optional
  // onMergeFailed callback for consumers who want structured signal.
  // Successful three-way merges (results all true) are normal Path B operation
  // and don't emit.
  if (results.some((ok: boolean) => !ok)) {
    const failedPatches = results.filter((ok: boolean) => !ok).length;
    const info = {
      failedPatches,
      totalPatches: results.length,
      baseLen: oldXmlMd.length,
      userLen: newXmlMd.length,
      agentLen: currentText.length,
      mergedLen: mergedText.length,
    } as const;
    console.warn(
      `[Observer A] patch_apply had ${failedPatches}/${results.length} failed patches`,
      info,
    );
    deps.onMergeFailed?.(info);
  }

  if (mergedText === currentText) return;

  // Apply via prefix/suffix to minimize CRDT mutations beyond what patch_apply already
  // resolved. Items in the matching prefix/suffix are preserved (no delete fires for them).
  applyByPrefixSuffix(ytext, currentText, mergedText);
}
```

**Caller-site change:** `applyUserDelta(deps, lastSyncedXmlMd, md)` — takes the full `ObserverDeps` handle instead of individual `doc`/`ytext` params, because it now needs access to the optional `onMergeFailed` callback. `runObserverASync` already closes over `deps`; trivial site change at observers.ts:331.

**`ObserverDeps` interface addition (minor signature change to `observers.ts`):**
```typescript
interface ObserverDeps {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  schema: Schema;
  onSyncError?: (direction: 'tree-to-text' | 'text-to-tree', error: Error) => void;
  /** Optional: invoked when DMP patch_apply reports one or more failed patches
   *  during Observer A's Path B three-way merge. Diagnostic only — non-fatal.
   *  Consumers (debug panel, V0-14 telemetry) opt in; omitted callback = no-op.
   *  The same event is always logged via `console.warn`. */
  onMergeFailed?: (info: {
    failedPatches: number;
    totalPatches: number;
    baseLen: number;
    userLen: number;
    agentLen: number;
    mergedLen: number;
  }) => void;
}
```

**No new files, no Y.Doc pollution, no naming collision with server-side `safetyCheckpoint` primitive** (D14).

Why DMP: empirically validated on the FR-3 scenario (`base="Hello", user="Hello world", agent="Hello brave"` → merged `"Hello world brave"`). Custom walk produced two-line split — wrong. Research confirms no other Yjs editor has built a content-comparison three-way merge; DMP `patch_apply` is the canonical JS three-way merge algorithm, well-tested and used widely in collaborative-editing tooling.

OQ-5 lock: user-wins on collision is DMP's default behavior. Verified: `base="a\nb\nc", user="a\nc" (deleted b), agent="a\nb!\nc" (modified b)` → `"a\nc"` — agent's modification dropped.

D8 acknowledgment: exact-character overlap (`base="hello", user="hello!", agent="hello!"`) produces `"hello!!"` (duplicates). Inherent to three-way merge — both sides independently made the same change. Mitigation path is NG6 (XmlFragment event-driven sync) or NG7 (per-character attribution), both explicitly deferred.

### 7c) Failed-patch diagnostic (FR-7)

**DROPPED** from earlier draft: the separate `safety-checkpoint.ts` helper + `Y.Map('safety-events')` channel.

**Rationale (D14 LOCKED):**
1. **Naming collision.** Main's `packages/server/src/shadow-repo.ts:254` already exports `safetyCheckpoint(shadow, contentRoot, params)` — the server-side WIP-snapshot primitive per AGENTS.md precedent #2 ("Name primitives for extensibility: `safetyCheckpoint({ action, context })` not `emitPreRollbackSnapshot()`"). The name is reserved for that primitive; reusing it on the client for a different purpose breaks precedent #2.
2. **No consumer today.** The speculative "future debug panel" is not planned for V0. Building CRDT-persistent infrastructure for a non-existent consumer violates the greenfield directive (no infrastructure ahead of need).
3. **Existing precedent is simpler.** `observers.ts` already uses `console.warn('[Observer A] ...')` for non-fatal sync diagnostics (lines 337, 367, 500). That's the right vocabulary here.

**Implementation:** the diagnostic lives inline in `applyUserDelta` (see §7b code above) — `console.warn` + optional `ObserverDeps.onMergeFailed` callback. No separate helper file, no new Y.Map. When V0-14 or any future consumer wants structured reactivity, they pass the callback at observer-setup time.

### 7d) Test plan (FR-1 through FR-7)

**FR-4 architectural test — Item-preservation via test-local UndoManager (PRIMARY FR-4 test):**

```typescript
// packages/app/src/editor/observers.test.ts (new test)
test('FR-4: Observer A preserves agent-origin Items on content-matching sync', async () => {
  const { doc, ytext, fragment } = createTestClient();

  // 1. Agent writes content under 'agent-write' origin
  doc.transact(() => {
    ytext.insert(0, '# Hello\n\nAgent wrote this.\n');
  }, 'agent-write');

  // 2. Attach test-local UM as a probe for Item preservation.
  //    (Mimics the V0-14 per-agent UM but lives only in this test.)
  const um = new Y.UndoManager(ytext, { trackedOrigins: new Set(['agent-write']) });
  expect(um.undoStack.length).toBe(1);

  // 3. Trigger Observer A with content that matches Y.Text at its positions.
  //    (Construct XmlFragment that serializes to the same markdown; sync runs.)
  //    This is the Path A content-gate case.
  await triggerObserverASync(fragment, ytext);

  // 4. Bridge invariant preservation: UM stack still references live Items.
  //    If this assertion FAILS (um.undo() doesn't revert to ''), it means
  //    Observer A replaced agent-origin Items with sync-from-tree Items —
  //    the UM's stack entries now reference tombstoned Items and undo is a
  //    no-op. That's the origin-laundering bug this spec fixes.
  expect(um.undoStack.length).toBe(1);  // Stack entry survived the sync.
  um.undo();                              // Undo must actually revert.
  expect(ytext.toString()).toBe('');     // Items were live, not tombstoned.
});
```

The same pattern with Path B (XmlFragment changed, triggering DMP merge) forms the Path B variant. These tests prove the bridge invariant WITHOUT any product UndoManager existing. When V0-14 lands, the per-agent UMs inherit the same guarantee.

**TQ6 single-client (extends `observers.stress.s4.test.ts`):**
- Agent writes to end of line N, user edits start of line N → assert merged Y.Text contains both edits
- D9 scenario: user-deletes line + agent-modifies same line → assert user-wins merge
- D8 characterization: `base="hello", user="hello!", agent="hello!"` → assert merged = `"hello!!"` (prevents silent regression on the accepted duplication)
- After every Path B sync: assert `lastSyncedXmlMd === md` (the post-serialize XmlFragment string) — guards against baseline drift (R4)
- Bridge invariant assertion after each step (FR-5)
- FR-7: `spyOn(console, 'warn')` catches `'[Observer A] patch_apply had N/M failed patches'` only when `results` contains `false`; NOT called on successful three-way merges

**TQ6 multi-client (extends `bridge-matrix.test.ts` per CLAUDE.md's "Observer bridge coverage" rule):**
- Two clients on the same Y.Doc. Client B receives a remote agent write to Y.Text on line N (`!transaction.local` on Client A); Client A's local user then types on line N in WYSIWYG → Observer A Path B fires
- Assert merged result preserves both edits (DMP `patch_apply` correctness)
- Bridge invariant holds on both clients (`assertBridgeInvariant` on each)
- Attach test-local UMs with `trackedOrigins: Set(['agent-write'])` on Client A's ytext; assert that after Observer A fires, the UM's stack still references the agent's Items (the architectural FR-4 property in the multi-client scenario)

**`observers.test.ts` extensions:**
- **FR-1 unit:** content-gate skip path. Construct Y.Text with content matching what `applyIncrementalDiff` would re-insert; assert zero `delete`/`insert` operations fire (count via `ytext.observe()` callback).
- **FR-2 unit:** `applyUserDelta(deps, oldXmlMd, newXmlMd)` returns Y.Text with merged content for the 5 DMP-probe scenarios (same-line collision, prepend+append, different lines, delete+modify, exact-char overlap).
- **FR-7 unit:** supply `onMergeFailed` in `ObserverDeps`; run `applyUserDelta` with inputs that produce a failed patch (construct an agent-divergent currentText that DMP can't match within threshold); assert callback invoked with correct shape AND `console.warn` emitted.
- **A1 verification (Item preservation through `applyByPrefixSuffix`):** construct Y.Text with three Items: A (`'agent-write'`), B (`'sync-from-tree'`), C (`'agent-write'`). Apply `applyByPrefixSuffix` such that only the middle region (containing B) is replaced. Assert `Y.UndoManager({ trackedOrigins: Set(['agent-write']) })` still has both A and C in its stack.

**`observers.fuzz.test.ts` extension (R3 + A5 verification):**
- New operator in the fuzz harness: "agent rewrites paragraph N to ~50% different content" between user edits. Asserts:
  - Either DMP `patch_apply` succeeds (all `results` true) OR `onMergeFailed` fires (no silent drops)
  - Bridge invariant holds after every fuzz step
  - When `results` contains `false`, merged text is neither a naive concatenation nor identical to base/user/agent — DMP actually resolved what it could
- Run across multiple `STRESS_FUZZ_SEED` values.

## 8) Open Questions

| ID | Question | Type | Priority | Status |
|---|---|---|---|---|
| OQ-1 | ~~Does `diff_cleanupSemantic` in `diffCharsFast` produce optimal hunks for same-line collision scenarios?~~ | Technical | P0 | **SUPERSEDED by D5**: With DMP `patch_make`/`patch_apply` as the Path B algorithm, `diffCharsFast` may not be needed. `patch_make` internally applies both `diff_cleanupSemantic` and `diff_cleanupEfficiency` with tuned defaults. |
| OQ-2 | In `applyUserDelta` rewrite, when user and agent overlap on the EXACT same characters (not just same line), what's the correct merge semantics? | Technical/Product | P0 | **RESOLVED → D8 LOCKED.** DMP probe shows `patch_apply(diff("hello","hello!"), "hello!")` = `"hello!!"` — duplicates the `!`. Inherent three-way-merge behavior; both sides independently made the same change. Accepted as known limitation. Mitigation paths NG6/NG7 deferred. |
| OQ-3 | ~~Should the content-comparison gate compare the FULL hunk or just a hash?~~ | Technical | P2 | Deferred — full comparison at our scale (hunks typically <1KB). |
| OQ-4 | Path B algorithm choice: DMP `patch_apply` vs. custom diff-walk. | Technical | P0 | **RESOLVED → D5 LOCKED.** Empirical probe `/tmp/dmp-probe.ts`. |
| OQ-5 | User DELETES line that agent MODIFIED — which wins? | Product | P0 | **RESOLVED → D9 LOCKED (user-wins).** DMP default; matches existing comment in `applyUserDelta`. |
| OQ-6 | Emit observable diagnostic on same-line collision? | Product | P2 | **RESOLVED → D10 (revised 2026-04-14) + D14.** Original resolution proposed a `safety-checkpoint.ts` helper + `Y.Map('safety-events')`; dropped per D14 (naming collision + no consumer). Current resolution: `console.warn` + optional `ObserverDeps.onMergeFailed` callback. |
| OQ-7 | Path A/B telemetry counter? | Technical | P2 | **RESOLVED → D11 LOCKED (no, user opted out).** |
| OQ-8 | Content-gate pairing: adjacent only? | Technical | P1 | **RESOLVED → D7 LOCKED (adjacent-only).** |
| OQ-9 | `diffCharsFast` helper still needed under D5? | Technical | P1 | **RESOLVED → D6 LOCKED (drop).** |
| OQ-10 | Document three unclaimed patterns in AGENTS.md? | Documentation | P2 | **RESOLVED → D12 LOCKED (yes, precedent #9).** |

## 9) Decision Log

| ID | Decision | Type | Status | Rationale |
|---|---|---|---|---|
| D1 | Fix uses content comparison, not Item-origin inspection | Technical | LOCKED | Y.js Items don't store transaction origins. Content comparison achieves the same effect (preserving agent Items when content matches) using only the public API. Evidence: `evidence/yjs-item-origin-model.md` |
| D2 | Path A stays on line-level diff + content-comparison gate; Path B uses DMP `patch_apply` three-way merge | Technical | LOCKED (refined 2026-04-14; D5 supersedes original "char-level" framing) | Path A (~90% of fires) doesn't have the sub-line problem; content-comparison gate adds ~O(hunk_size) substring comparison. Path B (~10%) does have sub-line needs; DMP `patch_apply` handles three-way merge canonically, preserving Item-equal prefix/suffix. Evidence: `evidence/observer-a-two-paths.md` + `/tmp/dmp-probe.ts`. |
| D3 | Approach: hybrid content-aware gate + DMP three-way merge (evolved from "option d") | Technical | LOCKED (refined 2026-04-14) | Prior research evaluated 4 approaches. (a) char-level alone doesn't fix origin laundering. (b) origin-aware alone doesn't improve three-way merge precision. (c) XmlFragment events is a new pattern, high complexity. (d) hybrid addresses both root causes within existing patterns — original scoped as char-level diff, evolved to DMP `patch_apply` (D5) after probe showed it's the canonical three-way merge algorithm. |
| D4 | Decoupled from Miles's undo | Product | LOCKED | First-principles analysis: FR-1/FR-2/FR-3/FR-5/FR-6 don't depend on Observer A. Only FR-4/US-3e does. See STORY.md §3 Area B decoupling analysis. |
| D5 | Path B uses DMP `patch_make` + `patch_apply` (canonical three-way merge) instead of custom diff-walk | Technical | LOCKED (2026-04-13) | Empirical probe (`/tmp/dmp-probe.ts`) shows DMP correctly merges same-line collisions out of the box. Custom walk produces two-line split (wrong) on `base="Hello", user="Hello world", agent="Hello brave"`. DMP produces `"Hello world brave"` (correct). Research validation: no equivalent pattern in any surveyed CRDT editor (report Finding 6) — DMP patch_apply is the canonical JS three-way merge. |
| D6 | Drop FR-7 (`diffCharsFast` helper) | Technical | LOCKED (2026-04-13) | Conditional on D5. With DMP patch_apply, no caller needs standalone char-level diff. Simplifies scope — removes new file `diff-chars-fast.ts` from SCOPE. |
| D7 | Content-comparison gate (FR-1) uses adjacent REMOVED+ADDED pairing only | Technical | LOCKED | OQ-8 resolution. diffLines output structure makes non-adjacent REMOVED+ADDED always indicate genuine changes on both sides — gate wouldn't fire meaningfully on non-adjacent pairs. |
| D8 | OQ-2 (exact-char overlap duplication) accepted as known limitation | Technical | LOCKED | DMP probe: `patch_apply(diff("hello","hello!"),"hello!")="hello!!"`. Inherent to three-way merge — both sides independently made the same change. Mitigation paths NG6 (XmlFragment event-driven sync) and NG7 (per-character attribution) both explicitly deferred; flagged in Future Work. |
| D9 | OQ-5: user-wins on user-delete-line + agent-modify-same-line | Product | LOCKED (2026-04-13) | DMP default behavior. Matches existing `applyUserDelta` comment ("the user's change wins"). Predictable, simple. Deferred from V0: conflict-marking UI (would need product design). |
| D10 (revised) | OQ-6: emit `console.warn` + optional `onMergeFailed` callback on DMP failed patches (NO Y.Doc pollution) | Product/Technical | LOCKED (2026-04-14, revised from earlier safety-checkpoint approach) | Earlier revision proposed a dedicated `Y.Map('safety-events')` + `emitSafetyCheckpoint` helper; that was dropped per D14 (naming collision with server-side `safetyCheckpoint` primitive + no consumer today). Current approach uses existing observers.ts console-warn precedent + optional callback hook in `ObserverDeps`. Consumers (V0-14 telemetry, future debug panel) opt in via callback without CRDT persistence. |
| D11 | OQ-7: NO Path A/B telemetry counter in this spec | Technical | LOCKED (2026-04-13) | User explicitly opted out. Counter would verify A3 (~10% diverged-path rate) but adds noise without clear consumer. Can be added later if assumption is challenged. |
| D12 | OQ-10: Document the three unclaimed patterns as AGENTS.md precedent #9 | Documentation | LOCKED (2026-04-13) | Strengthens architectural narrative. Cross-refs precedent #1 (typed transaction origins). Patterns: (a) content-comparison gate before CRDT delete+insert, (b) char-level diff as Item-preservation lever in serialize→diff→apply bridges, (c) origin-aware reconciliation at the bridge layer (vs. ingress filter). |
| D13 | Framing: spec's property is an architectural bridge invariant, not a behavioral symptom | Architectural | LOCKED (2026-04-14) | The problem is "bridge replaces Items whose content already matches" — a layer-level invariant. The zombie-content symptom (~257 chars/cycle) was the OLD measurement against a consumer (agent UndoManager) that was removed in V0-16 and returns in V0-14. Architectural framing is testable today via Item introspection; independent of any product consumer shipping. See rewritten §1 Problem Statement and FR-4 acceptance criteria. |
| D14 | No new `safety-checkpoint.ts` file, no new `Y.Map('safety-events')` channel | Technical | LOCKED (2026-04-14) | Four reasons: (1) Naming collision — server already exports `safetyCheckpoint` for the WIP-snapshot primitive (`packages/server/src/shadow-repo.ts:254`), which is the canonical use of the name per precedent #2. (2) No V0 consumer — the "future debug panel" was speculative; building CRDT-persistent infrastructure ahead of need violates greenfield discipline. (3) Existing observers.ts diagnostic precedent is `console.warn` (lines 337/367/500); matching that is simpler and consistent. (4) Prior-art warning: `Y.Map('conflicts')` (`standalone.ts:321/:992`) is the same write-only-Y.Map pattern already shipped — zero consumers in `packages/app/src/`, paying CRDT replication cost for a UI that never materialized. Don't repeat it. Structured reactivity provided via optional `ObserverDeps.onMergeFailed` callback — consumers opt in. |
| D15 | Origin landscape acknowledged, not acted on | Documentation | LOCKED (2026-04-14) | PR #39 introduced `'rollback-apply'` origin (full Y.Text replacement, by-design untracked per D6(b) in PROJECT.md). V0-14 uses `'agent-write'` (tracked by per-agent UMs) + TipTap's `ySyncPluginKey` origin (WYSIWYG UM) + y-codemirror's local origin (Source UM). Our spec documents this landscape for context but does not alter any origin's treatment — our fix is below the origin layer (bridge invariant), applies uniformly to whatever origins exist now or later. |
| D16 | Remove `Y.Map('conflicts')` dead writes from `standalone.ts` (FR-8) | Technical | LOCKED (2026-04-14) | `Y.Map('conflicts')` (`standalone.ts:321/:992`) is a write-only Y.Map with zero consumers in `packages/app/src/` — the same anti-pattern D14 prevents us from introducing. CRDT replication cost (wire size, initial-sync payload, monotonic doc growth) paid forever for a conflict UI that never materialized. Reconciliation logic, conflict counter, and `{ kind: 'conflicts' }` return type preserved — only the dead Y.Map writes are removed. Per D14 rationale point (4): don't repeat this pattern; per greenfield directive: clean the existing instance too. |

## 10) Assumptions

| ID | Assumption | Confidence | Verification plan |
|---|---|---|---|
| A1 | `applyByPrefixSuffix` preserves CRDT Items in the matching prefix/suffix regions | HIGH — verifiable | Y.js delete/insert semantics: Items in untouched regions are never marked deleted. Verification: FR-4 test + A1 `observers.test.ts` extension using `Y.UndoManager` stack introspection (see §7d). |
| A4 | DMP `patch_apply` correctly resolves three-way merge for our scenarios | HIGH | Empirical probe `/tmp/dmp-probe.ts` (2026-04-13): verified on 5 scenarios including FR-3 acceptance scenario (`"Hello world brave"`), user-prepend+agent-append, different-line edits, user-delete+agent-modify (user-wins), exact-char overlap (duplicates per D8). All produced expected merges with `results=[true]`. |
| A5 | DMP `Match_Threshold=0.5` is appropriate for our typical divergence levels | MEDIUM | Pinned explicitly in code. Verify with fuzz extension (§7d) that perturbs agent context heavily. |
| A6 | After Path B, `lastSyncedXmlMd` is set to `md` (XmlFragment serialization), NOT `mergedText` (Y.Text content). This is unchanged by this spec — preserves the current observers.ts:335 behavior. | HIGH | Consequence: after Path B fires, `currentText` (merged) ≠ `lastSyncedXmlMd` (XmlFragment). Subsequent Observer A triggers do NOT spuriously re-fire Path B: the early-return at observers.ts:302 (`if (lastSyncedXmlMd === md) return;`) exits when XmlFragment hasn't changed. Path B re-fires only if XmlFragment ALSO changes, in which case the new `oldXmlMd → newXmlMd` patch is applied against the merged Y.Text — correct. Full convergence to a unified state requires Observer B to fire from another Y.Text local mutation — same dynamic as existing implementation. Not a regression. Verified by TQ6 baseline assertion. |
| A7 | V0-14 will use `Y.UndoManager(ytext, { trackedOrigins: Set(['agent-write']) })` per-agent, keyed by `AgentIdentity.connectionId` | HIGH | Documented in `projects/v0-launch/PROJECT.md:107-148` and `specs/2026-04-10-undo-architecture/SPEC.md`. Our fix is structural (bridge preserves Items regardless of consumer shape); if V0-14 deviates (e.g., adopts per-character attribution), our fix remains a correct bridge improvement but its strongest motivation decreases. |
| A8 | Rollback transactions (origin `'rollback-apply'`) will NOT be tracked by any UndoManager | HIGH | PROJECT.md D6(b): rollback is coarse action, append-only, not undo-tracked. Our spec does not alter rollback's treatment — our fix operates uniformly across all origins. |

## 11) Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Content-comparison gate has false positives (content matches but shouldn't be skipped) | Low | Medium — could prevent legitimate updates | The gate only fires when a REMOVED+ADDED pair has identical content at the same offset. If content matches, by definition the update is a no-op. False positives are impossible by construction. |
| `applyUserDelta` rewrite changes merge semantics for edge cases not covered by existing tests | Medium | Medium — could silently change content on rare concurrent edits | Comprehensive test coverage: existing S4 stress + new TQ6 same-line test + fuzz tests. Run `bun run check:full:parallel` before merging. |
| DMP `patch_apply` fuzzy matching produces unexpected merges under extreme divergence | Medium | Medium — could merge user content into wrong location if agent-modified context is unrecognizable | `Match_Threshold=0.5` is DMP default and well-tested. For extreme cases (agent rewrote entire paragraph), `results` array from `patch_apply` surfaces per-patch success. On `false` result, fall back to user-wins (discard that patch's delta). TQ6 stress test should exercise this. |
| Baseline (`lastSyncedXmlMd`) drift after content-comparison gate skips a hunk | Low | High — stale baseline causes wrong deltas on next fire | Verify: after a gate-skipped hunk, baseline is still set to `newXmlMd` at end of sync (line 335 of current observers.ts unchanged). The skip is at the Y.Text-write layer; the baseline tracks XmlFragment, which DID change. Invariant holds. Add assertion in tests. |

## 12) Future Work

- **[Explored]** XmlFragment event-driven sync (NG6). Would eliminate serialize→diff→apply for Observer A. Larger scope — first delta-processing code in the repo; research surveyed no Yjs editor that maintains two first-class Y types with bidirectional observers. Revisit only if exact-character overlap duplication (D8) becomes an observed user-facing issue.
- **[Identified]** Per-character attribution layer (NG7 / dmonad option #1). Side-table that records origin per-character, letting Observer A propagate original origin through re-emission. Eliminates the content-comparison heuristic entirely. Large architectural project — consider if a future consumer (selective-undo semantics, per-author coloring, Peritext-style rich-text semantics) justifies the infrastructure.
- **[Identified]** `onMergeFailed` consumer (V0-14 or beyond). The callback hook is spec'd but no V0 consumer supplies it. If V0-14 telemetry or a debug panel materializes, it's a zero-change integration.
- **[Noted]** Observer A serialize cost (~23ms at 10K blocks) remains the dominant Path A cost. A future optimization could use incremental serialization (only re-serialize changed ProseMirror nodes). Out of scope — performance is within budget.
- **[Identified]** Per-character undo granularity within V0-14. UndoManager's `captureTimeout` default groups rapid edits; finer granularity (one stack entry per character) could support selective-undo semantics. Dependent on V0-14 landing first.

## 13) Agent Constraints

**SCOPE:**
- `packages/app/src/editor/observers.ts` — Changes:
  - `applyIncrementalDiff` (FR-1): add content-comparison gate per §7a
  - `applyUserDelta` (FR-2): rewrite to use DMP `patch_make`+`patch_apply` per §7b. Signature changes to `(deps: ObserverDeps, oldXmlMd, newXmlMd)` — caller at `runObserverASync` (observers.ts:331) updated accordingly
  - `ObserverDeps` interface: add optional `onMergeFailed?(info)` callback (FR-7)
  - Imports: `import DiffMatchPatch from 'diff-match-patch'` at top of file (module-local instance with explicit `Match_Threshold = 0.5`)
  - `applyByPrefixSuffix`, Observer A/B main loops, typing-defer state, all baseline-refresh logic — UNCHANGED
- `packages/app/tests/stress/observers.stress.s4.test.ts` — extend with TQ6 scenarios (same-line collision, user-delete + agent-modify, D8 characterization, baseline assertion, FR-7 console.warn assertion)
- `packages/app/tests/integration/bridge-matrix.test.ts` — extend with multi-client FR-4 Item-preservation test via test-local UndoManager
- `packages/app/src/editor/observers.test.ts` — extend with FR-1 content-gate unit, FR-2 DMP patch_apply unit (5 scenarios), FR-4 architectural test with UndoManager probe, FR-7 `onMergeFailed` callback test, A1 `applyByPrefixSuffix` UM-stack-preservation test
- `packages/app/tests/stress/observers.fuzz.test.ts` — extend with agent-paragraph-rewrite operator (R3 + A5)
- `AGENTS.md` — precedent #9 (already landed in prior commit)
- `packages/server/src/standalone.ts` — FR-8 only: remove the two `conflictsMap` stanzas (file-watcher reconciliation path + batch-restore path). No other changes to standalone.ts. Reconciliation logic, conflict counter, `{ kind: 'conflicts' }` return type all preserved.

**NOT in scope:**
- `packages/app/src/editor/safety-checkpoint.ts` / `.test.ts` — DROPPED per D14
- `packages/app/src/editor/diff-chars-fast.ts` — DROPPED per D6
- Path A/B telemetry counter — DROPPED per D11
- `projects/v0-launch/PROJECT.md:910` vocabulary update — Nick's project row to update separately
- AGENTS.md duplication fix (PR #39 bug) — Miles's territory; flag separately

**EXCLUDE:**
- `packages/server/` except `standalone.ts` FR-8 cleanup (scoped to dead Y.Map write removal)
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
- Before changing the `ObserverDeps.onMergeFailed` callback shape (contract for V0-14 and future debug-panel consumers)
- Before mutating DMP instance properties (`Match_Threshold`, `Patch_DeleteThreshold`, etc.) — they affect three-way merge semantics
- Before reintroducing a Y.Map for diagnostic events (D14 explicitly rejects this — if a future consumer needs CRDT-synced events, revisit D14 with fresh evidence)
