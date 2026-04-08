# Design Challenge Findings

**Artifact:** specs/2026-04-07-bidirectional-observer-sync/SPEC.md
**Challenge date:** 2026-04-07
**Challenger:** Second pass — fresh challenge of updated spec (post-H1/H2 resolution)
**Total findings:** 7 (2 high, 3 medium, 2 low)

**Context:** The spec was previously challenged and updated to address those findings. Key changes: Observer A now uses incremental `diffLines` writes (D10), gap decomposition note added to SCR, y-codemirror.next acknowledged as new dependency, UndoManager test scenarios added, `skipStoreHooks`-based parse-error UX documented. This challenge evaluates the spec's **current state**, focusing on the newly added disk bridge (Section 3.10) and the implications of the `diffLines` choice for Observer A.

---

## High Severity

### [H1] Finding: Disk bridge Layer 2 feedback loop prevention (`skipStoreHooks`) relies on a nonexistent API

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3.10 (Disk bridge — `handleExternalChange` code block, line ~459-466)

**Issue:** The disk bridge claims two-layer feedback loop prevention:
- **Layer 1:** Content-hash check in the watcher callback (skip if hash matches `writeTracker`)
- **Layer 2:** `skipStoreHooks: true` in the `document.transact()` options to prevent persistence from re-writing the file

Layer 2 does not exist. Verified against the codebase:

1. `Y.Doc.transact(f, origin = null)` accepts only a function and an optional origin parameter (`node_modules/yjs/src/utils/Doc.js:184`). It does not accept an options object.
2. Hocuspocus `Document` extends `Y.Doc` without overriding `transact` (`node_modules/@hocuspocus/server/src/Document.ts`). No `skipStoreHooks` concept exists in Hocuspocus.
3. When the spec code calls `document.transact(() => { ... }, { source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } })`, Yjs treats the entire object as the transaction `origin` — a passive label. It does **not** interpret `skipStoreHooks` as a directive.

**Consequence:** Every external file edit triggers a redundant persistence write cycle:

```
External edit → watcher reads file → parse → updateYFragment → Y.Doc 'update' event
→ Hocuspocus onUpdate callback → debounce → onStoreDocument fires
→ persistence serializes Y.Doc → records hash in writeTracker → writes to disk
→ watcher fires for THIS write → content-hash matches → skip (Layer 1 catches it)
```

Layer 1 prevents infinite loops **only if the round-trip is idempotent** (i.e., `serialize(parse(content)) === content`). If the markdown round-trip alters content (trailing whitespace, list marker normalization, fence style normalization `~~~` → `` ``` ``), the hash won't match and the cycle repeats:

```
External edit (content B) → parse → Y.Doc → persistence serializes → content B' (≠ B)
→ writeTracker records hash(B') → writes B' to disk
→ watcher fires → reads B' → hash(B') matches → skip ✓
BUT: external editor sees B' (different from B), may re-save B → loop resumes
```

Test scenario S05 (tilde fence → backtick normalization) is exactly this case. T56 ("Rapid external saves ~1/sec for 10 sec — system keeps up, no feedback loops") depends on Layer 2 to prevent the echo cycle, but Layer 2 doesn't function.

**Current design:** "Apply with skipStoreHooks to prevent feedback loop (Layer 2) / Access document directly (DirectConnection.transact doesn't expose skipStoreHooks)"

**Alternative:** Two viable approaches to implement actual Layer 2:

1. **Origin-based persistence skip.** Use Hocuspocus's `onStoreDocument` hook to check the transaction origin. If recent updates came from the file-watcher origin, skip the store. This requires tracking which origins contributed to the pending document state — non-trivial because Hocuspocus debounces multiple updates before calling `onStoreDocument`.

2. **Timestamp-based write suppression.** After `handleExternalChange` applies changes, record `lastExternalChangeTime`. In the persistence layer's `onStoreDocument`, if `Date.now() - lastExternalChangeTime < threshold`, skip the write. Simple, imprecise, but effective.

3. **Accept Layer 1 only — but document the constraint.** If round-trip idempotency is guaranteed (A3 says HIGH confidence), Layer 1 alone is sufficient. But the spec must explicitly acknowledge that Layer 2 doesn't exist and that loop-freedom depends on idempotent serialization, converting A3 from "assumption" to "load-bearing invariant" with test coverage for the specific patterns external editors produce.

**Trade-off:** Option 1 is correct but complex. Option 2 is pragmatic but racy. Option 3 is simplest but converts a safety mechanism into a correctness assumption.

**Status:** CHALLENGED

**Suggested resolution:** Remove the `skipStoreHooks` code and comment. Implement an actual Layer 2 mechanism, or demote to single-layer (content-hash only) with explicit documentation that loop-freedom requires idempotent round-trips and a test scenario that verifies this property for all content patterns in the test fixture.

---

### [H2] Finding: Disk bridge concurrent-edit handling — code applies changes unconditionally but text says "defer"

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3.10 ("Concurrent edit handling" paragraph + `handleExternalChange` code)

**Issue:** The spec's text and code describe **different strategies** for concurrent browser + external edits:

**Text says (Section 3.10, "Concurrent edit handling"):**
> "Detection: Compare `document.lastChangeTime` against the watcher event timestamp. If Y.Doc was modified since the last known disk state, this is a concurrent edit."
> "P0 strategy: CRDT wins. Defer the watcher update — the external change is overwritten by the next persistence write."

**Code does:** `handleExternalChange` unconditionally calls `updateYFragment(document, xmlFragment, pmNode, meta)`. There is no `lastChangeTime` comparison, no timestamp check, no deferral. Every external change is applied immediately via CRDT merge.

These are different strategies with different outcomes:
- **"Defer" (text):** External change is ignored; it's overwritten by the next persistence cycle. External editor's change is lost. Simple, safe, data-lossy for the external editor.
- **"Apply via updateYFragment" (code):** External change is merged into the CRDT alongside browser edits. Both survive (Yjs conflict resolution handles concurrent mutations). More correct, but introduces the complexity of merging a full-document parse result with in-flight browser edits.

Test scenario T53 ("Edit .md file externally while user is typing in WYSIWYG — no clobber (CRDT wins, external edit deferred)") tests the text's strategy, not the code's. If the code is correct, T53's expected behavior should be "both edits survive via CRDT merge" — not "external edit deferred."

`document.lastChangeTime` DOES exist in Hocuspocus (`Document.ts:45`), so the detection mechanism is implementable. But it's not implemented.

**Current design:** Text describes defer-with-detection. Code applies unconditionally.

**Alternative:** Align code and text. Either:
1. **Implement the detection logic.** Check `document.lastChangeTime`, defer if concurrent. Simpler, matches T53's expected behavior, but loses the external edit.
2. **Keep the code (unconditional merge).** Update T53 and the concurrent-edit description to reflect CRDT merge semantics. More data-preserving, but the merge quality depends on `updateYFragment`'s diff algorithm applied to a full-document parse result vs. in-flight CRDT state.

**Trade-off:** Option 1 matches stated strategy but loses data. Option 2 preserves data but needs T53 rewritten and the CRDT merge behavior characterized for external-edit scenarios.

**Status:** CHALLENGED

**Suggested resolution:** Decide which strategy is intended and align code, text, and test scenario T53. If defer: implement the `lastChangeTime` check. If merge: update the description and T53.

---

## Medium Severity

### [M1] Finding: `diffLines` granularity in Observer A produces line-level replacements for within-line WYSIWYG edits

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** Section 3.3 (Observer A — CRITICAL note, `diffLines` code block)

**Issue:** Observer A uses `diffLines` from the `diff` package to compute incremental Y.Text updates. `diffLines` operates on line boundaries — it splits input by `\n` and compares whole lines. For within-line WYSIWYG edits (bolding a word, inserting a link, changing emphasis), the entire containing line appears as a changed unit:

```
Before: "Hello world, this is a paragraph"
After:  "Hello **world**, this is a paragraph"

diffLines result: 1 line removed, 1 line added (entire line replaced)
```

In Y.Text, this translates to `ytext.delete(offset, lineLength)` + `ytext.insert(offset, newLine)` — the entire line is removed and re-inserted. For a source-mode user with their cursor in that line:

- y-codemirror.next receives a remote delta that deletes and re-inserts the line text
- Cursor position within the line must be re-inferred after the delete+insert — likely resets to start or end of the re-inserted range
- T30 ("No cursor jump in Tab 2") may fail for same-line cross-mode edits

The `diff` package also provides `diffChars` (character-level) and `diffWords` (word-level), which would produce minimal deltas for within-line changes. The spec doesn't discuss this granularity trade-off.

**Current design:** `diffLines` with no discussion of alternatives.

**Alternative:** Use `diffChars` for maximum precision (smallest possible Y.Text mutations, best cursor preservation). Trade-off: `diffChars` on a 50KB document is more expensive than `diffLines` (~O(n*m) for character diff vs ~O(n*m) for line diff, but with much larger n and m for chars). A hybrid approach (diffLines first, then diffChars within changed lines) could balance precision and performance.

**Trade-off:**
- `diffLines`: Fast, handles most cross-paragraph edits well. Fails for same-line cross-mode edits (cursor jumps within line). ~2ms for 1KB, ~20ms for 50KB.
- `diffChars`: Precise, minimal Y.Text mutations, best cursor preservation. ~5-15ms for 1KB, ~50-200ms for 50KB (may exceed debounce budget).
- Hybrid (diffLines → diffChars within changed lines): Best of both — fast for multi-line changes, precise for within-line changes. ~3-5ms typical, bounded by changed line length.

**Status:** CHALLENGED

**Suggested resolution:** Add the granularity trade-off to the spec (inline or in a decision log entry). At minimum, document that `diffLines` produces line-level replacements and T30's "no cursor jump" assertion applies to cross-paragraph edits but may not hold for same-line cross-mode edits. Consider the hybrid approach as the recommended implementation.

---

### [M2] Finding: Performance targets don't cover Observer B's parse + updateYFragment round-trip

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 7 (Performance test scenarios P01-P03)

**Issue:** The performance targets measure "Observer serialization latency" — the Observer A direction (XmlFragment → markdown serialization → Y.Text write). Observer B's cost is unmeasured:

| Operation | Measured by | Observer |
|-----------|------------|---------|
| XmlFragment → markdown serialization | P01, P02 | A |
| `diffLines` computation + Y.Text apply | Not measured | A |
| Markdown parse (`mdManager.parse()`) | Not measured | B |
| ProseMirror node construction (`schema.nodeFromJSON()`) | Not measured | B |
| `updateYFragment()` tree diff + Y.XmlFragment mutations | Not measured | B |

During active source-mode typing, Observer B fires every 50ms (after debounce). Each firing performs a full-document markdown parse, constructs a ProseMirror node tree, and runs `updateYFragment`'s structural diff against the existing Y.XmlFragment. For a 50KB document, this is a non-trivial pipeline.

The spec's R2 risk ("Observer performance degrades on large documents") has mitigation "Debounce. If still too slow, debounce increases or observers become incremental." But without performance targets for Observer B, "too slow" has no definition.

**Current design:** P01-P03 cover serialization latency only.

**Alternative:** Add performance targets for Observer B:
- `PB01`: Observer B parse+apply latency for ~1KB — target: <15ms
- `PB02`: Observer B parse+apply latency for ~50KB — target: <150ms

If PB02 exceeds 150ms, the 50ms debounce budget is blown and source-mode typing produces visible WYSIWYG lag.

**Trade-off:** Additional measurements during validation. No design change needed — just measurement coverage.

**Status:** CHALLENGED

**Suggested resolution:** Add Observer B performance targets to the test scenario table (Section 7, Performance).

---

### [M3] Finding: `writeTracker` Map has no TTL or cleanup for missed watcher events

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3.10 (Disk bridge — `writeTracker` code)

**Issue:** The `writeTracker` Map (`Map<string, { hash: string; timestamp: number }>`) is populated on every persistence write (before `writeFile`) and cleaned up only when a matching watcher event fires and the hash matches. Entries that never get a matching watcher event accumulate indefinitely:

- Watcher errors (rare but possible — `if (err) { console.error(...); return; }`)
- Watcher event coalescing: @parcel/watcher's 50ms debounce may coalesce rapid writes into a single event, leaving intermediate hashes unmatched
- Race conditions: persistence writes file A, then immediately writes file A again (different content) before the watcher fires for the first write. The watcher fires once for the second write — its hash matches the second entry, but the first entry is orphaned.

The `timestamp` field is stored but never read — suggesting it was intended for TTL but isn't implemented.

**Current design:** No cleanup mechanism. The `timestamp` field is present but unused.

**Alternative:** Add a TTL-based cleanup sweep. Before each `writeTracker.set()`, evict entries older than 10 seconds. This is 2 lines of code and prevents unbounded growth.

```typescript
const TTL = 10_000;
for (const [path, entry] of writeTracker) {
  if (Date.now() - entry.timestamp > TTL) writeTracker.delete(path);
}
```

**Trade-off:** Negligible code complexity. The TTL value is generous (watcher fires within 2-52ms typically). Prevents a slow memory leak in long-running dev sessions.

**Status:** CHALLENGED

**Suggested resolution:** Add TTL-based cleanup using the existing `timestamp` field. 3 lines of code in the watcher callback.

---

## Low Severity

### [L1] Finding: The SCR Complication lists 4 gaps but the success matrix requires 5 gaps (including disk) to be green

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** Section 1 (SCR Complication) vs Section 2 (Success Criteria — sync matrix)

**Issue:** The Complication names 4 broken cells:
1. Source ↔ Source (2 tabs)
2. Source → WYSIWYG (live)
3. Source → Disk
4. WYSIWYG → Source (usable)

The success matrix in Section 2 shows Disk→WYSIWYG and Disk→Source as green — these are cells the disk bridge (Section 3.10) fills. The gap decomposition note says "3 of 5 gaps" — implying 5 total gaps — but only 4 are named in the Complication.

The 5th gap (Disk → WYSIWYG/Source: external file changes don't appear in the browser) is real and addressed by the disk bridge, but it's not called out in the Complication. The Resolution doesn't mention it either — it focuses on Y.Text + observers.

**Current design:** 4 gaps named, 5 gaps solved, disk bridge added to scope mid-spec.

**Alternative:** No design change needed. Add the disk gap to the Complication table: "Disk → Browser: External editor saves are not reflected in the browser until page reload."

**Trade-off:** Framing completeness only.

**Status:** CHALLENGED

**Suggested resolution:** Add the 5th gap to the Complication table and update the gap decomposition note to "4 of 5 gaps share a single root cause" → "3 of 5 gaps share a single root cause... the 5th gap (disk → browser) is addressed by the disk bridge."

---

### [L2] Finding: Disk bridge `delete` event handling may cause phantom file recreation

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3.10 (File events table — `delete` row)

**Issue:** When an external editor deletes a .md file while the document is open in the browser:
- The spec says: "Log warning. Do NOT close the Y.Doc — the user may be editing."
- The document persists in memory with all its content intact.
- The persistence layer's `onStoreDocument` will fire on the next debounce cycle and **recreate the file** from Y.Doc state.

The user experience: external editor deletes a file, it reappears within seconds. No UI indication that the file was deleted and recreated. The external editor may interpret this as a save failure or file system error.

T54 ("Delete .md file externally while document is open — no crash, editor retains content, warning logged") tests that the editor doesn't crash, but doesn't address the phantom recreation behavior.

**Current design:** "Log warning. Do NOT close the Y.Doc."

**Alternative:** After detecting a delete event, set a flag on the document that suppresses the next N persistence writes (or until the user makes an edit). This prevents phantom recreation while keeping the content in memory for the user.

**Trade-off:** Slightly more complex delete handling. Prevents confusing external editor behavior.

**Status:** CHALLENGED

**Suggested resolution:** Document the phantom recreation behavior in T54's expected outcome. Consider a persistence-suppression flag as a P1 enhancement.

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative) — confirmed:**
- Incremental `diffLines` writes in Observer A (D10) are the correct direction — addresses the prior challenge's H1 finding. The line-level granularity is a reasonable starting point; character-level optimization is deferred.
- The gap decomposition note honestly acknowledges that 3 of 5 gaps don't require bidirectional observers. The bidirectional approach is justified as a validation goal, not as necessary infrastructure.
- Content-hash self-write detection (Layer 1) is a sound feedback-loop prevention mechanism for the common case.
- @parcel/watcher with FSEvents backend is appropriate for macOS file watching.

**DC2 (Stakeholder gap) — confirmed:**
- Observer origin guards with transaction origin comparison are proven by source code analysis.
- UndoManager is now properly tracked (OQ4, U01-U04 test scenarios, STOP_IF criteria). The uncertainty is acknowledged and bounded.
- Observer B parse-error UX is documented: WYSIWYG may show stale content during active source typing. This is the correct long-term behavior.
- The three-way merge module kept as utility for disk bridge concurrent edits is prudent foresight.
- Strategy C (piggyback on open documents, don't force-load) for the disk bridge is the right scope constraint.

**DC3 (Framing validity) — confirmed:**
- The problem (broken sync cells, no collaborative source mode) is real and well-scoped.
- The dual-key architecture (Y.Text + Y.XmlFragment in one Y.Doc) is the correct foundation.
- The spike-oriented approach (validate empirically, fall back if it fails) is appropriate.
- The research base (4 reports) provides strong evidence for the core observer mechanics and shimmer prevention.
