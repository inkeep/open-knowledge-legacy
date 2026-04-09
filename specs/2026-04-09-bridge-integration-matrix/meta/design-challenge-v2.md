# Design Challenge Findings (v2)

**Artifact:** specs/2026-04-09-bridge-integration-matrix/SPEC.md
**Challenge date:** 2026-04-09
**Scope:** Content added since v1 challenge — Phase 5 conversion fidelity (US-030-035), three-way merge (US-036-038), AGENTS.md rewrite (Phase 4), OQ1 ySyncPlugin hypothesis, overall scope coherence
**Total findings:** 6 (2 high, 3 medium, 1 low)

---

## High Severity

### [H] Finding 1: OQ1 ySyncPlugin write-back hypothesis is likely wrong — the lib0 mutex prevents the write-back path during remote changes

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC2 (Stakeholder gap)
**Location:** OQ1 status (Section 11), evidence/oq1-ysyncplugin-writeback.md, Section 9 (Layer C undo fix strategy)

**Issue:** The evidence file `oq1-ysyncplugin-writeback.md` hypothesizes that ySyncPlugin's `view.update()` callback writes ProseMirror state back to XmlFragment after a remote undo, causing Observer A to re-insert content. The proposed fix is adding `ySyncPluginKey` to Observer A's origin guard.

Code-level tracing contradicts this hypothesis:

1. When a remote undo arrives, `ProsemirrorBinding._typeChanged()` fires and runs inside `this.mux()` (y-tiptap.js:658).
2. Inside `mux()`, `_typeChanged` dispatches a ProseMirror transaction (line 696).
3. ProseMirror processes the transaction synchronously, triggering `view.update()`.
4. `view.update()` calls `binding.mux()` at line 265 — but the mutex is already held by `_typeChanged` (step 1).
5. lib0's `createMutex` (mutex.js:29-43) is a simple re-entrancy guard: if `token === false`, the callback is silently dropped. No `elseCb` is provided at line 265.
6. Therefore `_prosemirrorChanged` does NOT execute during remote change processing.

The evidence file states the mechanism is "traced from source code" at INFERRED confidence. The tracing is incomplete — it traces the write-back path but does not trace the mutex guard that prevents it from executing.

For the write-back to actually fire, something would need to trigger a ProseMirror state change AFTER `_typeChanged`'s `mux()` releases. This would require an asynchronous follow-up (e.g., a TipTap extension's `appendTransaction` creating a new state cycle). Inspection of the registered extensions (StarterKit, Table, Image, TaskList, TaskItem, JsxComponent) shows none of them register `appendTransaction` plugins in their dist bundles.

This does not mean the Layer C failure doesn't exist — it clearly does. But the proposed fix (adding `ySyncPluginKey` to Observer A's origin guard) would be addressing a mechanism that the mutex already prevents. The actual root cause of browser-side re-insertion after undo is still unknown and may involve:
- ProseMirror selection restoration creating a follow-up transaction (line 689-695 of y-tiptap.js: `restoreRelativeSelection` + `scrollIntoView` dispatches additional state changes)
- Observer A's `lastSyncedXmlMd` baseline being stale when the remote change arrives (the remote transaction path refreshes it at observers.ts:328-331, but timing matters)
- A subtle interaction between the 50ms debounce on Observer A and the synchronous remote transaction processing

**Current design:** "ySyncPlugin's view.update callback writes ProseMirror state back to XmlFragment as a LOCAL transaction... Observer A fires and may re-insert content" (OQ1, evidence/oq1-ysyncplugin-writeback.md). Proposed fix: "Add ySyncPluginKey to Observer A's origin guard."

**Alternative:** The OQ1 hypothesis should be downgraded from INFERRED to SPECULATIVE. The diagnostic plan (US-020: browser instrumentation with page.evaluate) is correct and should proceed without anchoring on the ySyncPlugin write-back theory. The instrumentation should be designed to capture ALL transaction origins that fire on Observer A after undo, not just check for ySyncPluginKey specifically. This prevents confirmation bias in the diagnosis.

Specifically, the `page.evaluate` tracing (US-020) should log:
- Every Observer A invocation: `transaction.origin`, `transaction.local`, the computed delta (empty vs non-empty)
- Every Y.XmlFragment transaction: origin, whether it triggers `view.update()` completing through the mutex or being blocked

**Trade-off:** Downgrading the hypothesis means the spec's confidence on OQ1 decreases, but the diagnostic plan (US-020) is unchanged — it already captures the right data. The risk is that an implementer reads the evidence file and jumps to applying the `ySyncPluginKey` fix without running the diagnosis.

**Status:** CHALLENGED
**Suggested resolution:** (1) Update evidence/oq1-ysyncplugin-writeback.md to note the mutex guard that prevents the hypothesized path. (2) Downgrade confidence from INFERRED to SPECULATIVE. (3) Update the "Potential fix" section to note it would be a no-op if the mutex prevents the write-back. (4) Keep US-020 diagnostic plan but broaden the instrumentation to capture all Observer A transaction origins rather than anchoring on ySyncPluginKey.

---

### [H] Finding 2: OQ11 cross-reference is stale — says "US-033/034/035 cover three-way merge" but those are now conversion fidelity stories; actual three-way merge stories (US-036/037/038) are struck through as DEFERRED

**Category:** DESIGN (coherence)
**Source:** DC3 (Framing validity)
**Location:** OQ11 (Section 11), D9 (Section 10), US-036/037/038 (Section 15, Phase 5)

**Issue:** There is a cross-reference inconsistency in the spec:

- **D9** now says: "Three-way merge DEFERRED — function exists but not wired into production."
- **US-036/037/038** are struck through with "DEFERRED."
- But **OQ11** still says: "RESOLVED — promoted to In Scope. US-033/034/035 cover simple, conflicting, and structural divergence."

OQ11's resolution text references US-033/034/035, but those are:
- US-033: Disk round-trip (conversion fidelity)
- US-034: Full-stack chain (conversion fidelity)  
- US-035: Agent-as-file-editor fidelity (conversion fidelity)

None of these are three-way merge tests. The original US numbers for three-way merge were likely renumbered to 036/037/038 when conversion fidelity stories were inserted, but OQ11 was not updated.

Additionally, the Phase 5 header still reads "Conversion fidelity + three-way merge" even though the three-way merge stories are deferred. This creates a misleading section title.

**Current design:** OQ11 status: "RESOLVED — promoted to In Scope. US-033/034/035 cover simple, conflicting, and structural divergence."

**Alternative:** OQ11 should be updated to: "RESOLVED — DEFERRED per D9. Three-way merge function exists but is not wired into production. Covered by existing unit tests in agent-flow.test.ts." Phase 5 header should be updated to "Conversion fidelity" (dropping "three-way merge").

**Trade-off:** None — purely a coherence fix. But an implementer reading OQ11 would believe three-way merge is in scope and try to find the stories.

**Status:** CHALLENGED
**Suggested resolution:** Fix the cross-references: update OQ11 to reference D9's deferral decision, update Phase 5 header to remove "three-way merge."

---

## Medium Severity

### [M] Finding 3: Conversion fidelity US-031 tests a conversion path (`pmJSON -> nodeFromJSON -> updateYFragment -> yXmlFragmentToProsemirrorJSON -> pmJSON`) but omits the mdManager.parse step — the most lossy conversion in the chain

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** US-030 through US-034 (Section 15, Phase 5)

**Issue:** The spec defines 5 conversion fidelity tests (US-030 through US-034) that together cover the full conversion chain. US-030 covers `serialize(parse(md))` — the markdown round-trip. US-031 covers `pmJSON -> updateYFragment -> yXmlFragmentToProsemirrorJSON -> pmJSON` — the tree round-trip.

US-031 starts from `pmJSON` (a ProseMirror JSON object), not from markdown. This means it tests whether `updateYFragment` preserves structure, but it does not test the `mdManager.parse` → `schema.nodeFromJSON` conversion. The parse step is where most fidelity loss occurs — markdown features that the ProseMirror schema doesn't support get silently dropped.

US-030 covers `serialize(parse(md))` which does test the parse path, but only at the markdown string level. It does not verify that the intermediate pmJSON is correct — only that the serialized output matches (or normalization is documented).

US-034 covers the full chain: `md -> parse -> XmlFragment -> Observer A -> Y.Text -> Observer B -> XmlFragment -> serialize -> md`. This IS the comprehensive test, and it does include the parse step.

The gap: there is no test that checks `parse(md) -> pmJSON` in isolation — verifying that each construct's parsed ProseMirror JSON has the right node types, attributes, and marks. This is where bugs like "codeBlock vs jsxComponent priority" live. US-030 would catch the symptom (wrong serialized output), but not the root cause (wrong parsed JSON).

**Current design:** US-031: "Tree round-trip: pmJSON -> nodeFromJSON -> updateYFragment -> yXmlFragmentToProsemirrorJSON -> pmJSON for every construct"

**Alternative:** Either (a) change US-031 to start from markdown (`md -> parse -> pmJSON -> nodeFromJSON -> updateYFragment -> yXmlFragmentToProsemirrorJSON -> pmJSON -> serialize -> md`), making it a superset of US-030 — or (b) add a parse-specific test: `md -> parse -> pmJSON` verifying node types and structure for each construct. Option (b) is more diagnostic (pinpoints which step fails).

**Trade-off:** US-034 already covers the full chain end-to-end, so this is a diagnostic granularity gap, not a coverage gap. But when US-034 fails, having US-030 and US-031 as independent probes helps identify whether the failure is in parse, tree roundtrip, or observer sync. If US-031 also starts from markdown, it loses that independent diagnostic value.

The current design is actually fine as-is IF the test runner surfaces which of US-030/031/032/033/034 fails first. The concern is minor.

**Status:** CHALLENGED
**Suggested resolution:** Keep US-031 as tree-only (starting from pmJSON). Its diagnostic value is in isolating `updateYFragment` from `mdManager.parse`. But consider adding a brief note in the acceptance criteria clarifying that US-031 intentionally starts post-parse to isolate the tree layer, and that parse fidelity is covered by US-030 and US-034.

---

### [M] Finding 4: AGENTS.md target structure omits the most dangerous concept for an AI agent — the `transaction.origin` / `transaction.local` distinction and when each combination means "skip" vs "sync"

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Phase 4, US-023 target structure (Section 15)

**Issue:** The AGENTS.md target structure (Section 15, Phase 4) lists "transaction.local semantics (local vs remote, observer guards)" as a bullet under the CRDT Bridge Architecture section (US-023). However, the acceptance criterion for US-023 is: "Agent touching observers.ts or agent-sessions.ts gets 'don't break this' rules without reading the full spec."

For an AI agent to safely modify observers.ts, it needs to understand a 2x3 matrix of behavior:

| | `transaction.local === true` | `transaction.local === false` |
|---|---|---|
| Origin: user typing | Observer A syncs normally | N/A (user typing is always local) |
| Origin: ORIGIN_TREE_TO_TEXT | Observer B skips | Observer B skips |
| Origin: ORIGIN_TEXT_TO_TREE | Observer A skips | Observer A skips |
| Origin: 'agent-write' | N/A (server-side) | Observer A refreshes baseline only, no sync |
| Origin: 'file-watcher' | N/A (server-side) | Observer A refreshes baseline only, no sync |
| Origin: ySyncPluginKey | (browser only) Observer A would fire | N/A |

This matrix is the single most dangerous piece of knowledge for the CRDT layer. An AI agent that adds a new origin or changes an origin guard can silently break the bridge. The spec's target structure mentions "transaction.local semantics" as a bullet but doesn't mandate this matrix as an explicit artifact in AGENTS.md.

Additionally, US-026 (Known Pitfalls) lists STOP/WARN rules but doesn't include: "STOP: Never add a new transaction origin without adding it to Observer A and B's skip guards." This is a 1-way-door mistake — a new origin that isn't guarded creates a feedback loop.

**Current design:** US-023 bullet: "transaction.local semantics (local vs remote, observer guards)"

**Alternative:** US-023 should mandate that AGENTS.md includes:
1. An explicit origin-guard truth table (the matrix above or equivalent)
2. A "Adding a new origin" checklist: (a) add to Observer A skip guard, (b) add to Observer B skip guard, (c) test with bridge invariant assertion

US-026 should add: "STOP: Never add a new transaction origin without updating both Observer A and Observer B origin guards."

**Trade-off:** More content in AGENTS.md. But this is the single piece of knowledge most likely to prevent an AI agent from introducing a bridge feedback loop. The cost of omitting it is silent data corruption.

**Status:** CHALLENGED
**Suggested resolution:** Add the origin-guard matrix and "adding a new origin" checklist to US-023's acceptance criteria. Add the STOP rule to US-026.

---

### [M] Finding 5: The scope expansion from 29 to 35 active stories (plus 3 deferred) adds conversion fidelity testing that is orthogonal to the spec's core problem statement — but the Phase 5 / Phase 1-3 dependency is one-way, making it safe to ship separately

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** Problem statement (Section 1), Phase 5 (Section 15), Phasing

**Issue:** The spec's problem statement identifies three interrelated problems: (1) Layer C failure, (2) missing propagation matrix coverage, (3) concurrent development fragility. All three are genuinely interconnected — they block each other.

Phase 5's conversion fidelity tests (US-030 through US-035) address a different concern: "does the format conversion chain preserve content correctly?" This is a legitimate concern, but it is not the problem the spec was created to solve. The spec's complication is about propagation paths and test infrastructure, not conversion correctness.

Conversion fidelity testing is additive — it doesn't block or change Phases 1-3 (the core scope). It also doesn't depend on Phase 1-3 infrastructure (US-030, US-031, US-032, US-034 are pure unit tests; only US-033 and US-035 need the Tier 1 harness).

The concern is not that Phase 5 is wrong — it's valuable. The concern is that a 35-story PR is harder to review, harder to land, and harder to revert than three focused PRs:
- PR 1: Phases 1-3 (infrastructure + matrix + Layer C fix) — 22 stories, solves the stated problem
- PR 2: Phase 4 (AGENTS.md rewrite) — 5 stories, documentation only, zero production code risk
- PR 3: Phase 5 (conversion fidelity) — 8 stories, new tests only, zero production code risk

The Decision Log does not record a decision about shipping scope (single PR vs multiple). The phasing section implies sequential within one PR.

**Current design:** Single spec with 6 phases, 35 active stories (+ 3 deferred), implied single PR.

**Alternative:** Split the spec into three ship-separately PRs. The phases are already naturally separated. Phase 4 and Phase 5 have no dependency on each other and both depend on Phase 1-3 landing first.

**Trade-off:** Splitting means three review cycles and three merge points. But each PR is focused, reviewable, and independently revertible. A 35-story PR is likely to see review fatigue. The AGENTS.md rewrite (Phase 4) is especially low-risk and could land immediately after Phases 1-3.

**Status:** CHALLENGED
**Suggested resolution:** Consider adding a shipping strategy to the spec: "Phases 1-3 ship as one PR (core scope). Phase 4 follows immediately (documentation). Phase 5 follows as a separate test-only PR." This doesn't change the spec's content — just the implementation plan. Alternatively, document a conscious decision to ship everything together with rationale.

---

## Low Severity

### [L] Finding 6: Phase 5 header still reads "Conversion fidelity + three-way merge" but three-way merge stories are all deferred

**Category:** DESIGN (editorial)
**Source:** DC3 (Framing validity)
**Location:** Section 15, Phase 5 header

**Issue:** The Phase 5 section header reads "Phase 5: Conversion fidelity + three-way merge" and the introductory paragraph mentions "Tests that every format conversion in the stack preserves content correctly." But the three-way merge stories (US-036/037/038) are struck through as DEFERRED. The header is misleading — Phase 5 now contains only conversion fidelity tests (US-030 through US-035), plus US-039 and US-040 in Phase 6.

Note: This overlaps with Finding 2 (the OQ11 cross-reference issue). Listed separately because the fix is different — Finding 2 is about the OQ11 resolution text, this is about the Phase 5 header.

**Current design:** "Phase 5: Conversion fidelity + three-way merge"

**Alternative:** "Phase 5: Conversion fidelity"

**Trade-off:** None — purely editorial.

**Status:** CHALLENGED
**Suggested resolution:** Update the Phase 5 header. Also remove the three-way merge stories from the Phase 5 table entirely (they're struck through but still occupy visual space and confuse the story count).

---

## Confirmed Design Choices (summary)

### DC1 (Simpler alternative)
- **Conversion fidelity test structure (US-030 through US-034):** The layered approach — testing each conversion step independently (markdown round-trip, tree round-trip, observer round-trip, disk round-trip, full-stack chain) — is sound. Each layer is a diagnostic probe: when the full-stack test (US-034) fails, the independent layer tests identify which step is lossy. A single "full-stack only" approach would be simpler but harder to debug.
- **CONSTRUCTS fixture approach:** Using a shared fixture array of markdown constructs across all conversion tests is the right pattern. It ensures coverage is consistent and adding a new construct (e.g., a new TipTap extension) automatically tests it through all conversion layers. The enumerated constructs in US-030 (headings, lists, code blocks, inline marks, links, images, blockquotes, GFM tables, JSX components, frontmatter, nested lists, HTML-in-markdown, hard line breaks, horizontal rules) align with the `sharedExtensions` array (StarterKit + Table + Image + TaskList/TaskItem + JsxComponent).
- **Three-way merge deferral (D9):** Confirmed correct. `threeWayMerge` is exported from `three-way-merge.ts` but never imported by any production code — only by `agent-flow.test.ts`. The function is designed for "source mode toggle-back" but the current UI uses React 19's `<Activity>` component for mode switching, which keeps both editors mounted with no toggle-back event. Testing a function that isn't called in production would be writing tests for dead code.

### DC2 (Stakeholder gap)
- **AGENTS.md rewrite scope (US-023 through US-027):** The five sections (CRDT architecture, testing, concurrent dev, pitfalls, debug tooling) cover the right topics. An AI agent working on this codebase needs all five. The acceptance criteria ("agent can write a new integration test without reading the spec") are outcome-oriented and testable.
- **US-035 (Agent-as-file-editor fidelity):** Testing the scenario where an agent writes complex markdown directly to disk (via file watcher) and a concurrent user types in WYSIWYG is a realistic production flow. This is the most likely source of content corruption in practice.

### DC3 (Framing validity)
- **D6 parallel diagnosis strategy:** The v1 challenge correctly identified that Tier 1 cannot reproduce ProseMirror-specific failures. D6 was updated to parallel diagnosis (browser instrumentation AND Tier 1 undo test). This is sound — both are permanent artifacts with independent value.
- **D10 (conversion fidelity through full stack):** The acceptance criteria appropriately require documenting normalization differences rather than requiring perfect round-trip. Some normalization is inherent (e.g., `## H\nP` normalizing to `## H\n\nP`) and documenting it prevents future false-positive test failures.
