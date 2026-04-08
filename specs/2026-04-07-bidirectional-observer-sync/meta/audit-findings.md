# Audit Findings: Bidirectional Observer Sync SPEC

**Artifact:** `specs/2026-04-07-bidirectional-observer-sync/SPEC.md`
**Audit date:** 2026-04-07
**Auditor:** Claude (eng:spec framework audit)
**Prior review:** `meta/design-challenge.md` (7 findings: 2 high, 4 medium, 1 low)

This audit evaluates the spec against the eng:spec quality bar, structural requirements, factual accuracy of codebase claims, and cross-reference integrity. It supplements (not replaces) the design challenge findings.

---

## Audit Summary

| Category | Findings | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Factual accuracy (codebase claims) | 14 verified, 1 contradicted, 1 unverifiable | 0 | 1 | 0 | 0 |
| Structural completeness | 5 findings | 0 | 1 | 3 | 1 |
| Cross-reference integrity | 2 findings | 0 | 0 | 2 | 0 |
| Framework compliance | 3 findings | 0 | 1 | 1 | 1 |
| Design challenge overlap | 7 findings already captured | — | — | — | — |
| **Total new findings** | **12** | **0** | **3** | **6** | **3** |

---

## A. Factual Accuracy — Codebase Claims

Every load-bearing technical claim in the spec was verified against the current codebase (`feat/init-spike` branch at `9c07f4b`).

### CONFIRMED

| # | Claim (spec location) | Verification |
|---|---|---|
| F1 | App.tsx has `sourceContent`, `snapshotMarkdown`, `toggleError`, `applyThreeWayMerge` (Section 3.4) | `init_spike/src/App.tsx` lines 8-9, 13, 43 |
| F2 | TiptapEditorHandle has `getMarkdown`, `applyThreeWayMerge`, `onContentChange` (Section 3.4) | `init_spike/src/editor/TiptapEditor.tsx` lines 14-20 |
| F3 | HocuspocusProvider is a singleton in TiptapEditor.tsx (Section 3.1) | Lines 24-34, singleton pattern confirmed |
| F4 | SourceEditor has `content: string` / `onChange` props (Section 3.2) | `init_spike/src/editor/SourceEditor.tsx` lines 7-10 |
| F5 | Y.XmlFragment('default') exists in Y.Doc (Section 3.1) | TiptapEditor.tsx:98, TiptapEditor.tsx:127, persistence.ts:158 |
| F6 | Y.Map('metadata') exists in Y.Doc (Section 3.1) | TiptapEditor.tsx:53, TiptapEditor.tsx:111, persistence.ts:151, persistence.ts:182 |
| F7 | persistence.ts reads Y.XmlFragment in onStoreDocument (Section 3.7) | `init_spike/src/server/persistence.ts` lines 175-177 |
| F8 | `/api/agent-write` endpoint exists (Section 3.6) | `init_spike/src/server/hocuspocus-plugin.ts` lines 38-70 |
| F9 | `/api/agent-write-md` endpoint exists (Section 3.6) | Same file, lines 73-156 |
| F10 | `three-way-merge.ts` exists with `threeWayMerge()` function (Section 3.8) | `init_spike/src/editor/three-way-merge.ts` confirmed |
| F11 | `agent-flow.test.ts` exists (Section 3.8) | `init_spike/src/server/agent-flow.test.ts` — 9 test cases |
| F12 | `yjs@^13.6.30` in package.json (Section 5) | `init_spike/package.json` line 40 |
| F13 | `@codemirror/state@^6.0.0` in package.json (Section 5) | Confirmed in package.json |
| F14 | y-codemirror.next peer deps are compatible: requires `yjs@^13.5.6`, `@codemirror/state@^6.0.0`, `@codemirror/view@^6.0.0` (Section 5) | `node_modules/y-codemirror.next/package.json` — all satisfied by current deps |

### CONTRADICTED

| # | Claim (spec location) | What's actually true | Severity |
|---|---|---|---|
| **F15** | "y-codemirror.next is already a dependency (was used in V4a evaluation)" / "No new packages needed" (Section 5, line 343) | **`y-codemirror.next` is NOT in `package.json`.** It exists in `node_modules/` as a transitive dependency only. The V4a evaluation was a conditional validation path (Yjs v14) that never executed — V7 FAILED, so V4b ran instead. No code in `init_spike/src/` imports or references y-codemirror.next. The spec's ASK_FIRST constraint ("Before adding any package not already in package.json") would apply. | **HIGH** |

> **Note:** This finding was independently identified in `meta/design-challenge.md` [M1]. The audit confirms it with additional evidence: the V4a path in `specs/2026-04-07-init-spike/SPEC.md` (line 287) was a conditional branch that did not execute, and grep for `y-codemirror\|yCollab` in `init_spike/src/` returns zero matches.

### UNVERIFIABLE

| # | Claim (spec location) | What was checked |
|---|---|---|
| F16 | "y-codemirror.next uses the YSyncConfig object instance as its transaction origin (not a string). It filters via strict reference equality" (Section 3.2, line 104) | The package source exists at `node_modules/y-codemirror.next/` but this is a behavioral claim about internal implementation. Could be verified by reading the source, but the current package version's source was not audited. The claim originates from the research report `~/reports/yjs-constrained-observer-sync/` which performed source-code analysis — treating as credible but unverified by this audit. |

---

## B. Structural Completeness

### [S1] HIGH — Evidence directory is empty

**Requirement:** The eng:spec framework requires `evidence/` files for factual findings that support design decisions.

**Finding:** The `evidence/` directory exists but contains **zero files**. The spec references 4 external research reports (`~/reports/`) as evidence sources but has no spec-local evidence documenting:
- Peer dependency compatibility verification results
- Observer origin guard transaction flow analysis
- Debounce timing evaluation data
- V4a/V4b execution history supporting the "already a dependency" claim

**Impact:** Evidence is not self-contained. An implementer must locate and cross-reference 4 external reports to validate the spec's claims. If those reports are updated or restructured, the spec's evidence chain breaks.

**Recommendation:** Create evidence files that capture the spec-relevant subset of each research report's findings, at minimum:
- `evidence/y-codemirror-next-binding-mechanics.md` — transaction origin behavior, peer dep compatibility
- `evidence/shimmer-prevention-mechanisms.md` — the 3 mechanisms and their proofs
- `evidence/observer-origin-guard-flow.md` — how origin guards prevent cascading

---

### [S2] MEDIUM — Decision Log missing 2 decisions from body text

**Decisions in body text not captured in Decision Log (Section 9):**

1. **Missing D8: Fallback strategy** (Section 8) — The spec specifies a concrete fallback: disable Observer B, re-enable three-way merge, keep Observer A. This is a DIRECTED decision with rationale (graceful degradation) but isn't in the log. An implementer hitting a failure condition has no decision reference for which fallback to execute.

2. **Missing D9: Observer module location** (Section 3.5, line 269) — The text says observers live "In the TiptapEditor component (or a dedicated module)." This is an unresolved choice, not a deferred one. Section 13 (Agent Constraints, line 525) says "New file for observer module" — implying the decision IS made (dedicated file), but the body text hedges. The Decision Log should capture this as DIRECTED with the dedicated module as the resolution.

---

### [S3] MEDIUM — Open Questions missing 2 items from body text

**Uncertainties raised in body text not captured in Open Questions (Section 12):**

1. **Missing OQ4: UndoManager configuration for observer origins** — Risk R4 (line 509) and Assumption A4 (line 498) both flag undo/redo as uncertain. The mitigation says "configure undoManager's tracked origins to exclude observer origins" but this is presented only as a mitigation, not as an open question that needs resolution. OQ1 asks a narrower question (does yCollab handle it?) while the broader question (how do we configure it, what if we can't?) is uncaptured.

2. **Missing OQ5: Observer A timing guarantee on initial document load** — Section 3.5 (line 263) describes the initial sync: "Observer A fires, populating Y.Text." But the spec doesn't address: what if HocuspocusProvider's sync completes before the observer is registered? What if the observer is registered before the document loads, firing on empty content? This is a race condition with implications for the initial toggle-to-source experience.

---

### [S4] MEDIUM — Future Work lacks maturity tiers

**Requirement:** The eng:spec framework requires Out of Scope items to have maturity tiers (Explored / Identified / Noted).

**Finding:** Section 6 (Scope Boundaries) lists 5 out-of-scope items as bare bullets:
- Disk bridge / file watcher — no tier (should be **Explored**: heavily researched in `~/reports/parcel-watcher-crdt-disk-bridge/`, has its own spec slot as "Exploration 3")
- Awareness / cursor presence — no tier (should be **Identified**: the binding supports it, noted in Section 3.2)
- Per-block code toggle — no tier (should be **Noted**: existing feature, unchanged)
- Prop panel / component editing UI — no tier (should be **Noted**: existing feature, unchanged)
- Changes outside init_spike/ — no tier (scope constraint, not future work)

**Impact:** Without tiers, an implementer or future spec author can't distinguish items that are well-understood and ready to promote (disk bridge) from items that were merely mentioned (cursor presence).

---

### [S5] LOW — Missing template sections (justified by spike nature)

The spec omits several sections from the eng:spec template:
- Consumer Matrix
- User Journeys
- Product surface-area map
- Internal surface-area map

**Assessment:** These omissions are **justified** for a derisking spike spec. The spike has a single consumer (the init_spike codebase), a single user journey (cross-mode collaborative editing), and the surface area is fully described in Section 3. However, there is no explicit statement in the spec justifying the omissions. A one-line note would prevent future reviewers from flagging the same gap.

---

## C. Cross-Reference Integrity

### [X1] MEDIUM — Test scenario attribution is inaccurate

**Finding:** Section 7 (line 373) headers all test scenarios as "From the universal test matrix (specs/next-sync-explorations.md)." This is partially incorrect:

| Test suite | In next-sync-explorations.md? | Actually defined in |
|---|---|---|
| T20-T23 (Multi-tab source) | Yes | next-sync-explorations.md |
| T30-T33 (Cross-mode sync) | Yes | next-sync-explorations.md |
| T40-T47 (Agent writes) | Yes | next-sync-explorations.md |
| T60-T65 (Content fidelity) | Yes | next-sync-explorations.md |
| T90-T99 (MDX fidelity) | Yes | next-sync-explorations.md |
| T100-T107 (Component editing UX) | Yes | next-sync-explorations.md |
| **S01-S06 (Shimmer validation)** | **No** | **Defined only in this SPEC** |
| **TS01-TS04 (Toggle simplification)** | **No** | **Defined only in this SPEC** |
| **P01-P03 (Performance)** | **No** | **Defined only in this SPEC** |

12 test scenarios (S01-S06, TS01-TS04, P01-P03) are presented as "from the universal test matrix" but are spec-specific additions.

**Impact:** Misleading provenance. An implementer looking in `next-sync-explorations.md` for S01-S06 won't find them.

**Recommendation:** Add a sub-header distinguishing "Universal test matrix scenarios (from next-sync-explorations.md)" from "Spike-specific validation scenarios (defined in this spec)."

---

### [X2] MEDIUM — Research report reference uses ambiguous home-dir path

**Finding:** Section 14 references reports using `~/reports/` paths (e.g., `~/reports/yjs-dual-key-shimmer-analysis/`). All 4 reports exist at `/Users/edwingomezcuellar/reports/`. However, this path is machine-specific — another contributor, or the same contributor on a different machine, would not find these reports.

**Verified existence:**
- `~/reports/yjs-constrained-observer-sync/` — EXISTS
- `~/reports/yjs-dual-key-shimmer-analysis/` — EXISTS
- `~/reports/mdx-cross-mode-sync-implications/` — EXISTS
- `~/reports/parcel-watcher-crdt-disk-bridge/` — EXISTS

**Impact:** Low for the current sole-contributor context, but the spec is not portable.

**Recommendation:** Either (a) use repo-relative paths if reports are in the repo, or (b) note that `~/reports/` resolves via the contributor's local Claude research directory.

---

## D. Framework Compliance

### [D1] HIGH — Resolution completeness gate not passable for bidirectional path

**Requirement:** The eng:spec framework requires every In Scope item to pass the resolution completeness gate before scope freeze, including: "Architectural viability validated (the recommended path works in the current runtime — confirmed by investigation, not assumed)."

**Finding:** The design challenge document (`meta/design-challenge.md`) identified two HIGH-severity findings (H1: Observer A destroys concurrent source edits, H2: one-way observer delivers 3/4 gaps with less risk) that directly challenge the architectural viability of the bidirectional approach. These findings are substantive and well-evidenced.

The spec's Decision D2 ("Bidirectional observers, not one-way" — HIGH confidence) was made before these design challenges were raised. The challenges have status CHALLENGED but no resolution is captured in the Decision Log or changelog.

**Impact:** The spec cannot pass the resolution completeness gate until D2 is either:
- **Confirmed** with a response to H1 (specifying how Observer A writes to Y.Text safely under concurrent source-mode editing), or
- **Revised** to promote one-way observer as primary with bidirectional as stretch

**Recommendation:** Resolve D2 in light of the H1/H2 challenges before implementation begins. This is a blocking prerequisite, not a "resolves during the spike" item — it determines the fundamental architecture.

---

### [D2] MEDIUM — Changelog is minimal; no design challenge resolution tracked

**Requirement:** `meta/_changelog.md` should capture all substantive changes including decision resolutions and design challenge outcomes.

**Finding:** The changelog has a single entry (initial draft). The design challenge was conducted and produced 7 findings, but neither the challenge event nor any resolutions are logged. The changelog does not reflect the current state of the spec process.

---

### [D3] LOW — No scope hypothesis checkpoint documented

**Requirement:** The eng:spec framework calls for explicit scope checkpoints — presenting scope with evidence when investigation changes cost/feasibility.

**Finding:** The scope in Section 6 is stated as final but was never presented as a hypothesis with investigation-driven evolution. Given that the design challenge fundamentally questions whether "bidirectional" should be the primary scope (vs. one-way + stretch), a scope checkpoint is overdue.

---

## E. Design Challenge Coverage (Already Captured)

For completeness, these findings from `meta/design-challenge.md` are relevant to the audit but not repeated here:

| ID | Finding | Severity | Status |
|---|---|---|---|
| H1 | Observer A's full-replacement writes destroy concurrent source-mode edits | HIGH | CHALLENGED — unresolved |
| H2 | One-way observer delivers 3/4 gaps; bidirectional doesn't safely deliver the 4th | HIGH | CHALLENGED — unresolved |
| M1 | y-codemirror.next is not installed (overlaps F15 above) | MEDIUM | CHALLENGED — unresolved |
| M2 | Full-replacement Y.Text writes produce maximal CodeMirror deltas | MEDIUM | CHALLENGED — unresolved |
| M3 | 4-cell gap framing inflates distinct root causes | MEDIUM | CHALLENGED — unresolved |
| M4 | UndoManager interaction has no fallback (overlaps S3/OQ4 above) | MEDIUM | CHALLENGED — unresolved |
| L1 | Observer B's parse-error UX during typing is unspecified | LOW | CHALLENGED — unresolved |

**Critical observation:** All 7 design challenge findings remain at CHALLENGED status with no resolutions captured in the Decision Log or changelog. This is the single most important blocker for this spec.

---

## Recommended Action Plan

**Priority 1 — Blocking (resolve before implementation):**
1. Resolve D2 in light of H1/H2. Either specify incremental Y.Text writes for Observer A, or promote one-way observer to primary.
2. Correct F15: add `y-codemirror.next` as an explicit dependency; update Section 5.
3. Update Decision Log with D2 resolution and add missing D8/D9.

**Priority 2 — Should fix (before scope freeze):**
4. Add missing OQ4 (undo configuration) and OQ5 (initial sync race).
5. Create evidence files (at minimum: binding mechanics, shimmer mechanisms, origin guard flow).
6. Add maturity tiers to Future Work items.
7. Fix test scenario attribution (X1).
8. Update changelog with design challenge event and resolutions.

**Priority 3 — Nice to have:**
9. Add justification note for omitted template sections (S5).
10. Clarify research report path portability (X2).
11. Add scope hypothesis checkpoint (D3).
