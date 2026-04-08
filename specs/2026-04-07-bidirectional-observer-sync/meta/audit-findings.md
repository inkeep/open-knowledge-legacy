# Audit Findings: Bidirectional Observer Sync SPEC

**Artifact:** `specs/2026-04-07-bidirectional-observer-sync/SPEC.md`
**Audit date:** 2026-04-07 (second pass)
**Auditor:** Claude (eng:spec quality bar + resolution completeness gate)
**Prior reviews:** `meta/design-challenge.md` (7 findings), prior audit (12 findings)
**Spec state:** Post-revision — many prior audit and design challenge findings have been addressed

---

## Audit Summary

| Category | Findings | High | Medium | Low |
|---|---|---|---|---|
| Prior finding resolution status | 19 reviewed | — | — | — |
| Factual accuracy (new) | 1 new finding | 1 | 0 | 0 |
| Structural completeness (new) | 4 new findings | 0 | 3 | 1 |
| Internal consistency (new) | 3 new findings | 0 | 2 | 1 |
| Framework compliance (residual) | 2 findings | 1 | 1 | 0 |
| **Total new/open findings** | **10** | **2** | **6** | **2** |

---

## A. Prior Finding Resolution Status

The spec has been substantially revised since the first audit and design challenge. This section tracks what was addressed.

### Design Challenge Findings

| ID | Finding | Status | Resolution |
|---|---|---|---|
| H1 | Observer A full-replacement writes destroy concurrent edits | **RESOLVED** | D10 added: incremental diff-based Y.Text writes. Section 3.3 (lines 157-183) now shows `diffLines()` approach with the `diff` package. Observer A applies only deltas. |
| H2 | One-way observer delivers 3/4 gaps; bidirectional doesn't safely deliver 4th | **RESOLVED** | H1 resolution (incremental writes) addresses the concurrent-write destruction that made bidirectional unsafe. D2 can now stand. |
| M1 | y-codemirror.next not installed | **RESOLVED** | Section 5 (line 555) now acknowledges it as a new dependency with explicit `bun add` instruction. |
| M2 | Full-replacement writes produce maximal CodeMirror deltas | **RESOLVED** | Addressed by H1 resolution — incremental writes produce minimal deltas. |
| M3 | 4-cell gap framing inflates root causes | **RESOLVED** | Section 1 (lines 27-29) now includes decomposition note: "3 of 5 gaps share a single root cause... The 4th gap is the incremental win from bidirectional Observer B." |
| M4 | UndoManager has no fallback | **PARTIALLY RESOLVED** | OQ4 added to Open Questions. STOP_IF (line 783-784) now includes undo criterion. But see finding IC3 below — the STOP_IF condition is too narrowly coupled. |
| L1 | Observer B parse-error UX unspecified | **RESOLVED** | Section 3.5 (lines 305-306) now documents expected UX: "WYSIWYG view may show stale content until the markdown becomes parseable. This is expected behavior, not a bug." |

### Prior Audit Findings

| ID | Finding | Status | Resolution |
|---|---|---|---|
| F15 | y-codemirror.next not in package.json | **RESOLVED** | Section 5 updated (see M1 above). |
| S1 | Evidence directory empty | **UNRESOLVED** | `evidence/` still contains zero files. See FC1 below. |
| S2 | Decision Log missing D8/D9 | **RESOLVED** | D8 (fallback strategy) and D9 (observer module location) now in Decision Log. D10 also added. |
| S3 | Open Questions missing OQ4/OQ5 | **RESOLVED** | OQ4 (UndoManager configuration) and OQ5 (observer registration race) now in Section 12. |
| S4 | Future Work lacks maturity tiers | **RESOLVED** | Section 6 now has Explored/Identified/Noted tiers for each out-of-scope item. |
| S5 | Missing template sections | **RESOLVED** | Section 6 (line 591) now has explicit justification note for omitted sections. |
| X1 | Test scenario attribution inaccurate | **UNRESOLVED** | Section 7 (line 597) still headers all scenarios as "From the universal test matrix." S01-S06, TS01-TS04, P01-P03, U01-U04, and T50-T58 are spec-specific additions not in next-sync-explorations.md. See IC1 below. |
| X2 | Research report paths use ~/reports/ | **UNRESOLVED** | Still uses machine-specific paths. Low priority. |
| D1 | Resolution completeness gate not passable | **RESOLVED** | H1/H2 resolution (D10 incremental writes) addresses architectural viability. D2 can now pass the gate. |
| D2 | Changelog minimal | **UNRESOLVED** | Changelog still has single entry from initial draft. No entries for design challenge, spec revisions, D10 addition, Section 3.9/3.10 additions. See FC2 below. |
| D3 | No scope hypothesis checkpoint | **PARTIALLY RESOLVED** | Scope was expanded (disk bridge and triple backtick moved in-scope) but no checkpoint documented in changelog. |

---

## B. New Factual Accuracy Findings

### [FA1] HIGH — Section 3.10 `document.transact()` with skipStoreHooks is unverified API

**Location:** Section 3.10, line 459-465

**Claim:** The disk bridge uses `document.transact()` with `{ source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } }` to prevent feedback loops (Layer 2 of the self-write prevention).

**Finding:** The Yjs `Doc.transact` signature is `transact<T>(f: (arg0: Transaction) => T, origin?: any): T`. The second parameter is `origin` — an opaque value stored on the transaction. There is no `skipStoreHooks` parameter in the Yjs API.

Hocuspocus's `Document` class extends `Y.Doc`. For `skipStoreHooks` to work, Hocuspocus must inspect the origin object in its `onChange`/`onStoreDocument` handler and check for a `skipStoreHooks` property. This is plausible (Hocuspocus passes options through to hooks) but was not verified against the Hocuspocus source.

**Why this matters:** This is Layer 2 of the disk bridge feedback loop prevention. If `skipStoreHooks` doesn't work:
- External file edits applied to Y.Doc would trigger `onStoreDocument` → write the same content back to disk → trigger the file watcher again → infinite feedback loop.
- Layer 1 (content-hash check) would catch this at the watcher level, so the system doesn't break. But it means every external edit produces a redundant disk write + watcher event before being filtered.

**Impact:** Medium — Layer 1 (content hash) provides a safety net, so this isn't catastrophic. But the spec presents a two-layer defense and Layer 2 may not exist. If Layer 2 fails, Layer 1 handles it with a performance penalty (one extra disk write + one extra watcher event per external edit).

**Recommendation:** Verify `skipStoreHooks` behavior against Hocuspocus source (check `node_modules/@hocuspocus/server/src/Document.ts` or similar). If unsupported, remove Layer 2 from the spec and document that Layer 1 alone is sufficient. Add a comment to the code explaining the single-layer defense.

---

## C. Structural Completeness (New Findings)

### [SC1] MEDIUM — Evidence directory still empty

**Carries forward from prior audit S1.** The `evidence/` directory contains zero files. The spec references 4 external research reports and makes numerous source-code-verified claims, but none of the spec-local evidence is captured.

The eng:spec framework requires evidence files for factual findings. With D10 (incremental writes) now a LOCKED decision and the disk bridge (Section 3.10) adding significant new architecture, the evidence gap is wider than before.

**Minimum evidence files needed:**
- `evidence/y-codemirror-next-binding.md` — peer dep compatibility, transaction origin mechanics, version verified
- `evidence/incremental-diff-approach.md` — why diff-based writes solve H1, diff package capabilities, performance characteristics
- `evidence/disk-bridge-parcel-watcher.md` — spec-local summary of the 9 dimensions from the research report, adapted to this spec's architecture
- `evidence/observer-origin-guards.md` — how origin guards prevent cascading, source-code references

**Impact:** An implementer cannot validate design decisions without locating and cross-referencing 4 external reports. If reports are restructured, the spec's evidence chain breaks.

---

### [SC2] MEDIUM — Changelog doesn't reflect spec evolution

**Carries forward from prior audit D2.** The changelog has a single entry ("Initial draft"). The spec has undergone significant revisions:
- Design challenge conducted (7 findings)
- H1 resolved with D10 (incremental writes) — fundamental architecture change
- Section 3.9 added (triple backtick bug fix)
- Section 3.10 added (disk bridge — major new scope)
- Scope expanded (disk bridge, triple backtick moved in-scope)
- OQ4, OQ5 added; D8, D9, D10 added
- Future Work items got maturity tiers
- Multiple body text clarifications

None of these are tracked. The changelog should be the audit trail of how the spec reached its current state.

---

### [SC3] MEDIUM — No test for three-way merge fallback path

**Location:** Section 3.8, Section 7, Section 8

Section 3.8 says three-way merge is "Kept as utility module" for disk bridge and fallback. Section 8 describes the fallback: "Re-enable three-way merge on toggle-back." But Section 7 has no test scenario that validates the three-way merge still works after the codebase changes from Phases 1-3.

The fallback is a safety net — if bidirectional observers fail, the team reverts to three-way merge. If that path is broken (because Phases 1-3 changed the code it depends on), the fallback doesn't work.

**Recommendation:** Add a test scenario:
- `FB01`: After Phases 1-3, re-enable three-way merge on toggle-back (simulate fallback). Verify the merge produces correct results for a simple edit scenario.

---

### [SC4] LOW — Test scenario attribution still inaccurate

**Carries forward from prior audit X1.** Section 7 (line 597) headers all scenarios as "From the universal test matrix (specs/next-sync-explorations.md)." But 20+ scenarios are spec-specific additions:
- S01-S06 (shimmer validation)
- TS01-TS04 (toggle simplification)
- P01-P03 (performance)
- U01-U04 (undo/redo)
- T50-T58 (disk sync)
- FB01 (if added per SC3)

**Recommendation:** Add sub-headers: "Universal test matrix scenarios" vs. "Spike-specific validation scenarios."

---

## D. Internal Consistency (New Findings)

### [IC1] MEDIUM — OQ3 is resolved in body text but listed as open

**Location:** Section 12 (OQ3), Section 3.3 (lines 202-214)

OQ3 asks: "How should Observer B handle frontmatter?" The answer is fully implemented in Observer B's code (lines 202-204): `const { frontmatter, body } = stripFrontmatter(md)` followed by `metaMap.set('frontmatter', frontmatter)`. The status should be RESOLVED, not open.

---

### [IC2] MEDIUM — Frontmatter in Y.Text is an implicit assumption

**Location:** Section 3.1, Section 3.3

Observer A (lines 153-155) writes full markdown including frontmatter to Y.Text: `const md = prependFrontmatter(frontmatterRef.current, body)`. Observer B (line 202-203) expects to strip frontmatter from Y.Text: `const md = ytext.toString()` → `stripFrontmatter(md)`.

This means Y.Text contains the complete document (frontmatter + body), not just body content. This is a load-bearing assumption — if Y.Text ever contains only body content, Observer B would fail to find frontmatter and the metadata map would be cleared.

This should be either:
- Explicitly stated in Section 3.1 where the Y.Doc structure is defined: "Y.Text('source') contains the full markdown document including frontmatter"
- Added as Assumption A5

---

### [IC3] LOW — STOP_IF undo criterion is narrowly coupled to OQ4

**Location:** Section 13 (line 783-784), OQ4

The STOP_IF says: "UndoManager cannot exclude observer origins AND undo reverts observer-synced content." OQ4 asks about configuring tracked origins.

These are coupled: if OQ4 discovers that y-codemirror.next's UndoManager CAN be configured but y-prosemirror's UndoManager (WYSIWYG side) CANNOT, then OQ4 is "resolved" for one layer but undo is still broken on the other. The STOP_IF should say "either layer's UndoManager" to cover both sides.

---

## E. Framework Compliance (Residual)

### [FC1] HIGH — Resolution completeness gate: disk bridge (Section 3.10) has unverified API dependency

The disk bridge relies on `document.transact()` with `skipStoreHooks` (FA1 above). The resolution completeness gate requires: "Architectural viability validated (the recommended path works in the current runtime — confirmed by investigation, not assumed)."

The `skipStoreHooks` mechanism has not been confirmed by investigation. This is a gap in the gate for the disk bridge scope item specifically. The rest of the spec passes the gate.

**Options:**
1. Verify `skipStoreHooks` against Hocuspocus source (resolves the gate)
2. Remove Layer 2 from the disk bridge design and document that Layer 1 (content hash) is the sole feedback loop prevention (simplifies and resolves)
3. Accept the risk — Layer 1 is sufficient, Layer 2 is defense-in-depth (document the acceptance)

---

### [FC2] MEDIUM — Quality bar gap: no success metrics with baseline/target/instrumentation

**Requirement:** "Success metrics defined: what to measure, baseline, target, instrumentation plan"

The spec has Success Criteria (Section 2) with pass/fail conditions, Performance targets (P01-P03) with numeric targets, and Shimmer criteria (S01-S06) with firing count thresholds. But there are no baselines (what is the current performance?), no instrumentation plan (how will metrics be collected beyond manual testing?), and no ongoing measurement strategy.

For a derisking spike this is likely acceptable — the validation is manual and ephemeral. But the quality bar formally requires it. **Recommendation:** Add a one-line note acknowledging this is a spike with manual validation, not a production feature with ongoing metrics.

---

## F. Quality Bar Checklist

| Must-have | Status | Notes |
|---|---|---|
| Problem statement (who, pain, why now) | PASS | Section 1 SCR is specific and well-decomposed |
| Goals and non-goals explicit | PASS | Section 2 + Section 6 |
| Primary personas/consumers identified | PASS (waived) | Single consumer (init_spike), justified in Section 6 note |
| End-to-end user journey | PASS (waived) | Single journey (cross-mode editing), justified |
| Requirements prioritized with ACs | PASS | Test scenarios serve as acceptance criteria |
| ACs describe observable behavior | PASS | Scenarios describe what to type, what to observe |
| Current state described | PASS | Section 3.2 (current SourceEditor), Section 3.4 (current toggle) |
| Proposed solution as vertical slice | PASS | Sections 3.1-3.10 cover full stack |
| Decision Log with rationale + door-type + evidence | PASS | Section 9, 10 decisions, evidence links present |
| Open Questions with status + next actions | PARTIAL | OQ3 should be marked resolved (IC1) |
| Spec includes PRD + technical design | PASS | Integrated throughout |
| Assertions evidence-backed or labeled ASSUMPTION | PARTIAL | FA1 (skipStoreHooks) is unverified and unlabeled |
| Future Work with maturity tiers | PASS | Section 6 has tiers |
| Success metrics with baseline/target/instrumentation | PARTIAL | Targets exist, baselines and instrumentation absent (FC2) |
| Evidence files contain primary source | FAIL | evidence/ directory empty (SC1) |

---

## Recommended Action Plan

### Priority 1 — Blocking (before implementation)

1. **Verify or remove `skipStoreHooks`** (FA1/FC1). Check Hocuspocus Document source, or simplify to Layer 1 only.
2. **Create minimum evidence files** (SC1). At least: binding mechanics, incremental diff rationale, observer origin guards. 30 min of work captures the most load-bearing claims.

### Priority 2 — Should fix (before scope freeze)

3. **Update changelog** (SC2). Backfill entries for design challenge, D10, Section 3.9/3.10, scope expansion.
4. **Mark OQ3 as resolved** (IC1).
5. **Add Assumption A5: Y.Text contains full markdown including frontmatter** (IC2).
6. **Add fallback test scenario FB01** (SC3).
7. **Fix test scenario attribution** (SC4).
8. **Broaden STOP_IF undo criterion** to cover both UndoManager layers (IC3).

### Priority 3 — Nice to have

9. **Add quality bar waiver note** for success metrics (FC2).
10. **Clarify D7 ASK_FIRST language** — "implementation strategy" not "endpoint path."
