# Design Challenge Findings

**Artifact:** specs/2026-04-07-bidirectional-observer-sync/SPEC.md
**Challenge date:** 2026-04-07
**Total findings:** 7 (2 high, 4 medium, 1 low)

---

## High Severity

### [H1] Finding: Observer A's full-replacement writes to Y.Text destroy concurrent source-mode edits

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC2 (Stakeholder gap)
**Location:** Section 3.3 (Observer A code), Section 3.5 (Observer lifecycle), Section 2 (Success Criteria T30/T31)

**Issue:** The spec's own research base contains a direct warning against this architecture. The constrained observer sync report (`~/reports/yjs-constrained-observer-sync/`) explicitly states: "Simultaneous writes to Y.Text from both the observer and y-codemirror.next binding destroy concurrent edits. The observer MUST be paused while the user is in source mode." The spec's bidirectional design runs Observer A continuously (Section 3.5: "They persist for the lifetime of the app -- not tied to source mode toggle"), creating exactly the concurrent-write condition the research warns against.

**Current design:** Observer A fires on every Y.XmlFragment change and performs a full-replacement write to Y.Text:
```typescript
doc.transact(() => {
  ytext.delete(0, ytext.length);
  ytext.insert(0, md);
}, ORIGIN_TREE_TO_TEXT);
```
When a remote user types in WYSIWYG while a local user edits in source mode, Observer A fires (the XmlFragment change has y-prosemirror's origin, not `ORIGIN_TEXT_TO_TREE`, so the guard doesn't skip it). The `delete(0, length)` tombstones ALL Y.Text content, including the local user's uncommitted source-mode keystrokes. The subsequent `insert(0, md)` writes back serialized content that doesn't include those keystrokes (they were in Y.Text, not yet in Y.XmlFragment).

This is not a shimmer problem -- the shimmer analysis addresses whether observers infinitely cascade. This is a concurrent-write destruction problem: two sources (Observer A and y-codemirror.next) write to the same Y.Text, and the full-replacement pattern is inherently non-collaborative.

**Consequence for test scenarios:**
- T30 ("No cursor jump in Tab 2") -- FAILS. Full-replacement produces a maximal delta; y-codemirror.next applies it as a complete buffer replacement, causing cursor jump and scroll reset.
- T31 ("Tab 1 in source types -- paragraph appears in Tab 2's WYSIWYG. Live") -- At risk. While Observer B syncs source→tree, a concurrent WYSIWYG edit triggers Observer A, which clobbers source edits.
- T33 ("Simultaneous, non-conflicting -- both survive") -- FAILS under this design without incremental writes.
- T45 ("User typing in source while agent writes simultaneously -- both present") -- FAILS. Agent write → XmlFragment → Observer A → full Y.Text replacement → source user's edits lost.

**Alternative:** The architecture requires one of:
1. **Incremental Y.Text updates in Observer A** -- diff the current Y.Text against the serialized markdown and apply only the delta (e.g., using `diff` library already in package.json). This makes Observer A's writes collaborative rather than destructive. Significantly more complex to implement but preserves the bidirectional architecture.
2. **Pause Observer A while source mode is active** (the constrained observer report's recommendation). This means WYSIWYG→Source sync is NOT live when a local user is in source mode. Remote WYSIWYG edits accumulate in Y.XmlFragment and sync to Y.Text only when the source user toggles back. This is functionally equivalent to the one-way observer approach the spec explicitly deprioritized.
3. **Accept the one-way observer as the production path.** The one-way observer (tree→text, paused in source mode) + y-codemirror.next binding delivers 3 of 4 broken sync cells safely. Only "live source→WYSIWYG" requires bidirectional observers, and the spec's current design can't deliver that cell safely without solving incremental writes.

**Trade-off:**
- Option 1 adds significant complexity (diffing serialized markdown against Y.Text character-by-character) and is itself unproven.
- Option 2 is functionally the one-way observer the spec rejected -- it has the same effective capability with less risk.
- Option 3 accepts a smaller scope win but delivers it safely.

**Decision Log interaction:** D2 ("Bidirectional observers, not one-way") was made with HIGH confidence based on the shimmer analysis. But the shimmer analysis proves a DIFFERENT property (observers don't cascade infinitely) than what's needed here (concurrent writes from two sources to Y.Text are safe). The evidence that justified D2 doesn't address this finding.

**Status:** CHALLENGED

**Suggested resolution:** Before committing to bidirectional observers, the spec must specify how Observer A writes to Y.Text when source mode is active. If the answer is "full replacement," test scenarios T30, T33, and T45 need to be revised or the concurrent-write destruction must be addressed. If the answer is "pause Observer A in source mode," the spec should acknowledge this is effectively the one-way observer approach and re-evaluate whether the bidirectional framing is accurate.

---

### [H2] Finding: The one-way observer delivers 3 of 4 gaps and the bidirectional design doesn't safely deliver the 4th

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** Section 1 (Problem Statement), Section 3.3-3.5, Section 8 (Fallback)

**Issue:** The spec frames bidirectional observers as the primary approach and one-way observers as a fallback (Section 8). But once H1 is accounted for, the effective capability of both approaches converges. Here's the gap analysis:

| Broken cell | One-way observer | Bidirectional (with H1 unresolved) |
|-------------|------------------|------------------------------------|
| Source ↔ Source | FIXED (y-codemirror.next + Y.Text) | FIXED (same) |
| Source → Disk | FIXED (Observer A keeps XmlFragment in sync → persistence works) | FIXED (same) |
| WYSIWYG → Source (cursor reset) | FIXED (Y.Text updated by Observer A when not in source; y-codemirror.next handles cursor) | FIXED (same mechanism, but with concurrent-write risk when source active) |
| Source → WYSIWYG (live) | NOT LIVE (toggle-back sync) | UNSAFE (Observer B works, but Observer A's response to the resulting XmlFragment change clobbers Y.Text) |

The one-way observer approach fixes gaps 1, 3, and 4 from the Complication. The 4th gap (live source→WYSIWYG) is the only incremental win from bidirectional observers, and H1 shows it's not safely delivered without solving incremental Y.Text writes.

**Current design:** "Bidirectional observers, not one-way" (D2, HIGH confidence). The one-way approach is relegated to fallback status (Section 8).

**Alternative:** Promote the one-way observer to the primary design. The spike still validates the same infrastructure (Y.Text, y-codemirror.next binding, Observer A with origin guards). The toggle simplification still works (show/hide, because Observer A keeps Y.Text populated when not in source mode; toggle-back applies source changes to XmlFragment). The spike scope shrinks but delivers provably safe capabilities.

If the spike succeeds with one-way, bidirectional can be attempted as a stretch goal WITH incremental Y.Text writes, informed by what was learned.

**Trade-off:**
- Gained: Simpler, safer, fewer failure modes, no concurrent-write risk
- Lost: Live source→WYSIWYG sync (source edits appear in WYSIWYG on toggle-back, not in real-time)
- Impact on Success Criteria: The sync matrix would show 3 green cells (not 4). Source→WYSIWYG becomes "on toggle-back" rather than "live."

**Decision Log interaction:** The next-sync-explorations spec demoted the one-way observer because "The shimmer concern was based on outdated data (pre-V1b validation)" and "The decision prioritizes full collaboration." But the demotion assumed shimmer was the only risk. H1 identifies a different risk (concurrent-write destruction) that the shimmer analysis doesn't address. The rejection rationale for one-way observers doesn't hold against this new finding.

**Status:** CHALLENGED

**Suggested resolution:** Re-evaluate D2. Either (a) specify an incremental Y.Text write strategy for Observer A that's safe under concurrent source-mode editing, or (b) promote one-way observer to primary with bidirectional as a stretch goal.

---

## Medium Severity

### [M1] Finding: y-codemirror.next is not installed -- "no new packages" claim is incorrect

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap) + DC3 (Framing validity)
**Location:** Section 5 (Tech Stack)

**Issue:** The spec states: "y-codemirror.next is already a dependency (was used in V4a evaluation, currently unused in the source editor). No new packages needed." This is factually incorrect. `package.json` does not include `y-codemirror.next`. The package is referenced in `CLAUDE.md` as available in `~/.claude/oss-repos/` for source reading, and `RESULTS.md` mentions it as a concept, but it was never added as a dependency.

**Current design:** "No new packages needed."

**Alternative:** Acknowledge y-codemirror.next as a new dependency. Verify peer dependency compatibility with yjs@13.6.30 and @codemirror/state@^6.0.0 before Phase 1. The ASK_FIRST constraint (Section 13) says to ask before "adding any package not already in package.json" -- this applies.

**Trade-off:** Minor scope correction. No design change needed, but the claim that this spike adds zero dependencies is wrong.

**Status:** CHALLENGED

**Suggested resolution:** Update Section 5 to acknowledge y-codemirror.next as a new dependency and move the peer-dep verification from Assumption A1 to a Phase 0 prerequisite.

---

### [M2] Finding: Full-replacement Y.Text writes produce maximal CodeMirror deltas regardless of change size

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3.3 (Observer A), Performance targets P01-P02

**Issue:** Observer A performs `ytext.delete(0, length); ytext.insert(0, md)` for every Y.XmlFragment change, regardless of how small the change is. A single character typed in WYSIWYG triggers a full Y.Text replacement. The Y.Text event delta received by y-codemirror.next reflects the actual operations (delete all + insert all), not a minimized diff. This means:

1. **Every WYSIWYG keystroke produces a full-document delta in CodeMirror.** For a 50KB document, that's ~50KB of delete + ~50KB of insert dispatched to CodeMirror on every remote keystroke. The performance targets (P01: <10ms for 1KB, P02: <100ms for 50KB) measure serialization latency only -- they don't account for CodeMirror applying a full-document replacement delta.

2. **Cursor position preservation depends on y-codemirror.next's delta application.** Full-replacement deltas are the worst case for cursor tracking -- the old position is deleted and a new position must be inferred from the reinserted text.

3. **The 50ms debounce (D3) helps reduce frequency but not per-event cost.** Each firing still produces a maximal delta.

**Current design:** Full-replacement write pattern with 50ms debounce. Performance targets measure serialization only.

**Alternative:** Use the `diff` package (already in package.json) to compute a minimal edit script between Y.Text's current content and the serialized markdown. Apply only the changed segments to Y.Text. This produces minimal deltas for CodeMirror and preserves cursor position naturally. Adds ~5-10ms of diff computation but eliminates the full-replacement cost on the receiving end.

**Trade-off:** More complex Observer A implementation vs. dramatically better CodeMirror UX and performance for cross-mode editing.

**Status:** CHALLENGED

**Suggested resolution:** Add incremental Y.Text update strategy to the spike's evaluation scope (alongside D7's agent write path evaluation). At minimum, extend performance targets to measure CodeMirror delta application cost, not just serialization.

---

### [M3] Finding: The 4-cell gap framing inflates distinct root causes into separate problems

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** Section 1 (Problem Statement -- Complication)

**Issue:** The Complication presents 4 broken sync cells as separate problems requiring the bidirectional observer architecture. But 3 of 4 share a single root cause: source mode uses a plain text buffer with no CRDT binding.

| Gap | Root cause | Fixed by... |
|-----|-----------|-------------|
| Source ↔ Source | No CRDT binding | y-codemirror.next + Y.Text |
| WYSIWYG → Source (cursor reset) | Observer replaces full buffer | y-codemirror.next handles remote writes correctly |
| Source → Disk | Not persisted until toggle-back | Observer A (one-way) keeps XmlFragment in sync |
| Source → WYSIWYG (live) | Edits don't flow until toggle-back | Observer B (bidirectional only) |

Only the 4th gap (live source→WYSIWYG) requires bidirectional observers. The other 3 are solved by y-codemirror.next binding + one-way Observer A. The Resolution ("Add Y.Text to Y.Doc... Run bidirectional observers") is presented as necessary for ALL 4 gaps, but the marginal complexity of bidirectional over one-way serves only 1 gap.

This matters because the spec's framing leads to an architecture whose primary justification (filling all 4 cells) is achievable with a simpler subset for 3 of 4 cells.

**Current design:** "The cross-mode sync matrix has 4 broken cells" → bidirectional observers fill them all.

**Alternative:** Reframe the Complication as: "Source mode has no CRDT binding (3 gaps). Additionally, source→WYSIWYG is not live (1 gap). The first 3 are solved by Y.Text + y-codemirror.next + one-way observer. The 4th is the stretch goal that bidirectional observers attempt."

**Trade-off:** More honest framing at the cost of weaker justification for bidirectional complexity.

**Status:** CHALLENGED

**Suggested resolution:** Restructure the SCR to distinguish "guaranteed wins" (y-codemirror.next + one-way observer) from "stretch validation" (bidirectional observers for live source→WYSIWYG).

---

### [M4] Finding: UndoManager interaction is identified but has no fallback if resolution fails

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Assumption A4, Risk R4, Open Question OQ1

**Issue:** Three separate sections flag undo/redo as uncertain:
- A4: "y-codemirror.next's undoManager works correctly alongside our custom observers -- MEDIUM confidence"
- R4: "Undo/redo behavior breaks -- user undoes their edit but also undoes an observer write"
- OQ1: "Does y-codemirror.next's yCollab extension handle undo correctly when external writes modify Y.Text?"

The mitigation for R4 is "Configure undoManager's tracked origins to exclude observer origins." But the spec doesn't specify:
1. What happens if origin exclusion doesn't work (y-codemirror.next may not expose this configuration)
2. Whether undo in WYSIWYG (via y-prosemirror's undoManager) also needs origin configuration for Observer B's writes
3. What the user experience is if undo IS broken -- is this a spike-blocking failure or a known limitation?

The STOP_IF criteria (Section 13) don't include undo breakage. A user whose undo reverts observer syncs (making the views desynchronize) would experience significant UX degradation, but the spec would not flag this as a failure.

**Current design:** "Resolves during Phase 2" with a mitigation strategy of origin exclusion.

**Alternative:** Add undo breakage to STOP_IF criteria, or at minimum specify the fallback: if undo can't be configured to exclude observer origins, what changes? Does the spike continue with broken undo? Does the one-way fallback resolve it?

**Trade-off:** Tighter spike criteria vs. more flexible spike execution.

**Status:** CHALLENGED

**Suggested resolution:** Add a test scenario for undo behavior (e.g., "User types in source, undoes, observer-synced content in XmlFragment is NOT affected"). Specify the fallback if UndoManager can't exclude observer origins.

---

## Low Severity

### [L1] Finding: Observer B's parse-error UX during typing is unspecified

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3.5 (Observer error handling)

**Issue:** The spec says Observer B logs parse errors and Y.XmlFragment keeps its last valid state. During active source-mode typing, markdown is frequently invalid (mid-heading, partial table, incomplete code fence). This means Y.XmlFragment can be significantly behind Y.Text during active editing. If another user views WYSIWYG while a source user is mid-sentence, they see stale content.

This is likely acceptable for a spike (and may be the correct long-term behavior), but the UX implication isn't documented. The debounce (50ms) helps slightly -- it waits for typing to pause -- but a 50ms pause between keystrokes is common during normal typing.

**Current design:** "Log the error but do NOT crash or disable the observer."

**Alternative:** No design change needed, but document the expected UX: "While a source-mode user is actively typing, the WYSIWYG view may lag until the markdown becomes parseable. This is expected behavior, not a bug." This prevents the spike from flagging it as a failure.

**Trade-off:** Documentation clarity only.

**Status:** CHALLENGED

**Suggested resolution:** Add a note to Section 3.5 or the test scenarios acknowledging that WYSIWYG may show stale content during active source-mode typing when the markdown is temporarily unparseable.

---

## Confirmed Design Choices

**DC1 (Simpler alternative) -- confirmed:**
- Y.Text as a separate shared type alongside Y.XmlFragment is the right architectural choice. Both types in the same Y.Doc travel together through Hocuspocus automatically.
- y-codemirror.next as the binding library is correct -- it's the canonical CRDT-aware CodeMirror binding.
- Transaction origin guards are proven by source-code analysis to prevent observer cascading.
- Toggle simplification from serialize+merge to show/hide is a genuine improvement that holds regardless of one-way vs bidirectional.
- Keeping three-way merge as a utility module (for disk bridge) is prudent.

**DC2 (Stakeholder gap) -- confirmed:**
- Debounce on observers is appropriate as a performance optimization.
- Persistence layer requires no changes -- Observer A keeps XmlFragment in sync.
- Agent write path through XmlFragment → Observer A → Y.Text is clean for the raw write endpoint.
- The fallback architecture (Section 8) is well-designed and pragmatic.
- The STOP_IF criteria for shimmer cascading are correct and actionable.

**DC3 (Framing validity) -- confirmed:**
- The problem (no collaborative source mode, broken sync cells) is real and worth solving.
- The dual-key (Y.Text + Y.XmlFragment) architecture is the right foundation for any variant of the solution.
- The research base (3 reports) is thorough and the findings are source-code-verified.
- The spike-oriented approach (prove empirically, fall back if it fails) is appropriate for a derisking spike.
