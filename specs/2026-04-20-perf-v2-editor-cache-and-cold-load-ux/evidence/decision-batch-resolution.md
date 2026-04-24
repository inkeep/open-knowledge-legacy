---
title: "Decision Batch Resolution — 6 Decisions + Resolution Status"
description: "Durable record of the 6-decision batch resolved during Intake phase of V2 perf spec. Final resolutions with evidence links per decision. Source-of-truth for §10 Decision log."
createdAt: 2026-04-20
updatedAt: 2026-04-20
status: normative
applies_to: SPEC.md §10 Decision log
---

# Decision Batch Resolution

**Purpose.** Durable, pre-Scaffold capture of the 6-decision batch's resolutions. SPEC.md §10 Decision log is the source-of-truth once Scaffold finalizes; this file exists as the audit trail of how each decision was reached (Intake-phase conversation → evidence → resolution).

---

## Decision 1 — Alt 5 InteractionLayer scope + gate criterion

**Question:** Should Alt 5 port only the simple mark cases (InternalLink, WikiLink) or all 4 React-view extensions (InternalLink + WikiLink + RawMdxFallback + JsxComponent)? What gate controls when InteractionLayer engages?

**Resolution:** **Option D — all 4 extensions, view-count-measured gate at N=50.**

**Rationale:**

1. **CB-v2 interweaving (C1 in interweaving analysis)** — CB-v2's JsxComponentView is structurally the harder case of the same problem InternalLink has. Shipping InteractionLayer for InternalLink+WikiLink only would force a subsequent migration at CB-v2 integration time and ship a known-worse pattern for fumadocs-heavy docs in the interim.

2. **6-point scaling curve** (evidence: `grey-zone-and-prod-floor.md` §Part A + `size-spectrum-profile.md` §Exec Summary finding 5) — view-count dominates bytes ~6× on cold-pool-warm cost. Fit: `CPW ≈ 185 + 10.6·views + 1.8·bytes_KB`. Marginal per-view cost ~2 ms across 30–768 views. Acceptable→Unacceptable boundary at ~100 views.

3. **Cold-mount attribution** (evidence: `cold-mount-profile.md` §Corrected 5-component attribution) — 768 ReactMarkView portal reconciliation is ~2.2 s of the 7.70 s longtask (28.5 %), dominant single component. InteractionLayer directly attacks this cost.

4. **Greenfield directive + user guidance** ("not optimizing for expediency"; "anything that is not Future Work will be done in the same execution sprint").

**Gate criterion:**
- **Primary:** `viewCount ≥ 50` measured at mount-time (post-parse, post-decoration-attach)
- **Secondary:** `bytes > 500 KB` (retained for multi-MB prose outliers)
- **Threshold N=50** gives margin below the 100-view Acceptable→Unacceptable boundary; tunable constant

**Evidence links:**
- `evidence/size-spectrum-profile.md`
- `evidence/grey-zone-and-prod-floor.md`
- `evidence/cold-mount-profile.md`
- `evidence/component-blocks-v2-interweaving.md`

**SPEC.md mapping:** FR4, FR5, FR6, FR7, FR8, §9.2

---

## Decision 2 — Grey-zone sampling

**Question:** The 500 K→3.25 MB gap in the scaling curve has no measurements. Should we sample the 50 KB–500 KB "grey zone" (what snappiness does it feel like)?

**Resolution:** **RESOLVED via probe bxwgdes9a (grey-zone-and-prod-floor).**

**Findings:**
- ARCHITECTURE (111 KB / 0 views): 185 ms CPW → **Snappy**
- AGENTS (155 KB / 8 views): 423 ms CPW → **Acceptable**
- Scaling fit: `CPW ≈ 185 + 10.6·views + 1.8·bytes_KB`
- Acceptable→Unacceptable boundary at ~100 views, NOT at any byte threshold

**Implications closed:**
- Size-gate alone is NOT the right discriminator — would misclassify a 300 KB wiki-hub with 200 views (miss) and a 1 MB prose-only doc (false positive).
- View-count-primary + byte-secondary gate (Decision 1) is correct.

**Evidence links:**
- `evidence/grey-zone-and-prod-floor.md` §Part A

**SPEC.md mapping:** §8.2 Size-to-cost scaling curve

---

## Decision 3 — Production-mode calibration

**Question:** Should V2 ACs be stated in dev-mode terms (what we measure most easily) or prod terms (what users experience)?

**Resolution:** **PROD. All V2 ACs calibrated in prod-build terms.**

**Findings** (evidence: `grey-zone-and-prod-floor.md` §Part B):
- Cold-load floor ~950 ms prod (README 961 / IDEAL-EDITOR 946)
- CPW floor ~190 ms prod (README)
- STORIES prod cold-load: 1845 ms — STILL Unacceptable
- Dev→prod delta: 2–7× on CPW, 1.3–5× on cold-load
- StrictMode 2× mount contributes only ~5–6% of dev→prod delta
- Prod variance <1% cold-load, <2% CPW — stable enough for baselines

**AC calibration:**
- AC21a (Snappy, small ≤50 KB / ≤10 views): CPW `<150 ms prod`
- AC21b (Acceptable, mid 50–300 KB / 10–50 views): CPW `<300 ms prod`
- AC21c (large >300 KB OR >50 views): CPW `<500 ms prod`
- AC-coldload-large: cold-load `<1500 ms prod` for STORIES-scale
- Option E target: hide ~950 ms prod floor

**SPEC.md mapping:** §2 Goals G1–G5, §6 Non-functional requirements, §7 Metrics

---

## Decision 4 — Monolithic spec vs staged wedges

**Question:** Should V2 ship as one monolithic spec (10+ items) or staged wedges (ship-bar first, polish second)?

**Resolution (final, per user clarification):** **ONE spec, ONE execution sprint. Prescribed dependency-ordered 5-phase topology.**

**Rationale:**
- User clarification 2026-04-20: "Anything that is not 'Future Work' will be done in the same execution sprint by an ai coding agent. They're quick. We just need to get the spec right."
- Implementation time is NOT a factor. Calendar-based wedging is irrelevant.
- Prescribed order is load-bearing: primitives before consumers; cache before Option E depending on it.

**Phase topology:**
- Phase 1 — Primitives (V2 cache + size-aware policy + InteractionLayer)
- Phase 2 — Consumer migrations (4 React-view extensions → InteractionLayer)
- Phase 3 — Orthogonal (CV:hidden + precedent corrigendum + CM6 reparent)
- Phase 4 — Cold-load UX (Option E + Option G)
- Phase 5 — Telemetry & gates

**Conditional items resolved:**
- CM6 re-parent (Phase 3.3): was CONDITIONAL on H1; now IN SCOPE WITH FULL CONFIDENCE (H1 FEASIBLE, 12/12 probe tests).
- Option E shape (Phase 4.1): DIRECTED to custom mdast→React walker; ALT via Node-path probe Q1 still in flight (b8vgi4rpc).

**Evidence links:**
- `evidence/h1-cm6-reparent-probe.md`
- `evidence/h2-fumadocs-standalone-probe.md`
- `evidence/non-blocking-research.md` (establishes no first-class non-blocking solution exists)
- `evidence/tiptap-large-doc-patterns.md` (establishes ecosystem consensus)

**SPEC.md mapping:** §9 Proposed solution — 5-phase topology

---

## Decision 5 — Precedent #18(b) corrigendum (REVISED 2026-04-20)

**Question:** Should CLAUDE.md's precedent #18(b) be corrected to reflect TipTap's actual Activity-hidden behavior (editor destroyed by `useEditor.scheduleDestroy(1ms)`)?

**Resolution:** **LOCKED (revised). Corrigendum text LOCKED; lands as FIRST commit of V2 impl sprint (Phase 3.2). NOT a standalone commit on `perf/investigation` beforehand.**

**Revision rationale:** Original resolution ("ship standalone NOW") was born from calendar-wedging assumption that V2 would ship in stages. User directive 2026-04-20 overrode this: *"anything that is not Future Work will be done in the same execution sprint"* and *"ship this end to end in one go, complete, irrespective of cb-v2."* End-to-end shipping means atomic PR — docs corrigendum + code + evidence + precedent additions all land together. Single review surface, cleaner git history.

**Rationale (original claim remains true):** Documentation bug is independent of V2 impl logic. Users of CLAUDE.md read the partially-false claim today. But the fix lands in the V2 sprint's first commit rather than a separate earlier commit.

**Corrigendum text + application protocol:** see `evidence/precedent-18b-corrigendum.md`. Text unchanged; only landing timing revised.

**SPEC.md mapping:** FR (implicit, within SCOPE of agent constraints §16); Decision D6 LOCKED (revised).

---

## Decision 6 — Baseline commit

**Question:** What git commit do we stamp as the V2 perf spec baseline?

**Resolution:** **`23e86ca9`** (CONFIRMED).

**Rationale:**
- Post-ship of all 10 perf-diagnostic-toolkit stories (US-001–US-010)
- Includes §8b CV:hidden probe protocol documentation (US-009 + US-010 post-fix baseline)
- Includes precedent #24 ("Perf instrumentation as first-class")
- All foundation evidence files (s1/s2/s3-diagnosis.md) authoritative at this commit
- No in-flight refactors would conflict with spec baselining

**SPEC.md mapping:** Header **Baseline commit:** field

---

## Decision 7 (emergent) — CM6 reparent contract promotion

**Question:** Should H1's §5 CM6 reparent contract be promoted to a standalone normative artifact?

**Resolution:** **DIRECTED. Promoted to `evidence/cm6-reparent-contract.md`; candidate for CLAUDE.md precedent #18(h) at V2 ship.**

**Rationale:**
- Reusable contract for any future CM-in-PM nested editor (CB-v2 §9.14 Precedent #24 is the same principle).
- H1's 12/12 empirical probe tests make the contract load-bearing, not inferential.
- Living in `/tmp/` only = ephemeral; promotion to `evidence/` ensures durability.

**SPEC.md mapping:** Decision D7, §9.1 V2 Editor cache contract

---

## Emergent commitments (not numbered decisions, but spec-affecting)

### E1 — Option E correction on hast-util-to-jsx-runtime

**Discovery:** H2 empirical probe proved the prior Opus-subagent recommendation (`hast-util-to-jsx-runtime` with `passThrough`) fails on MDX expression attrs. Correct path is custom mdast→React walker.

**Action:** `evidence/option-e-utilities-CORRECTIONS.md` flags this; `option-e-utilities.md` retained verbatim for provenance but NOT authoritative on its own.

**SPEC.md mapping:** §9.3 Option E; FR11 rationale

### E2 — Node-path Q1 RESOLVED (Option E stays browser-side)

**Discovery:** `@fumadocs/local-md` surfaced as a candidate bundleless runtime MDX compiler. Probe `b8vgi4rpc` evaluated with 8 empirical tests + source-level read.

**Verdict (2026-04-20):** REJECT local-md. Two load-bearing claims don't survive OK's pipeline:
1. "No eval()" is conditional — `.md` only; `.mdx` uses `new AsyncFunction(...)` identically to mdx-remote (source comment: `Note: unsafe by design`).
2. "More comprehensive than mdx-remote" is FALSE for OK — local-md's renderer fails on OK's agnostic-MDX mdast (no `data.estree` on `mdxJsxAttributeValueExpression`). Adding acorn to make it work negates the crash-class resistance OK ships (R1/R6/R8).

Also: docs/ renders DIFFERENT content than editor (zero shared source with `packages/core/src/markdown/`) — no duplication win. 85% (3,665 LoC) of OK's markdown pipeline encodes invariants no general-purpose renderer implements.

**Action:** D4 LOCKED to browser-only walker at `packages/core/src/markdown/to-react.ts` (forward-compat placement per probe's recommendation — environment-agnostic, serves MCP render-preview / read-only / CLI export).

**SPEC.md mapping:** §10 Decision log D4 LOCKED; §11 Q1 RESOLVED; §9.3 Option E alternative-rejected rationale. Full REPORT at `evidence/mdx-remote-node-path-probe.md`.

### E3 — InteractionLayer bifurcation (simple marks vs rich NodeViews)

**Discovery:** While analyzing CB-v2 interweaving, the InteractionLayer contract bifurcates:
- Simple marks: plain-DOM chip + shared popover
- Rich NodeViews: per-instance live React render + shared controls at editor root

**Action:** FR4 codifies both modes. Phase 2 migrations (FR5–FR8) must handle both correctly.

**SPEC.md mapping:** §9.2 InteractionLayer primitive

---

## Confidence audit (post-Intake)

| Decision | Evidence strength | Confidence |
|---|---|---|
| D1 (scope N=50 gate) | 6-point measured scaling curve; fit extrapolation; CB-v2 interweaving | HIGH |
| D2 (grey-zone sampling) | Empirical probe 2 new docs | HIGH |
| D3 (prod calibration) | Prod-build measurements 3 docs × 2 runs | HIGH |
| D4 (monolithic + 5 phases) | User directive + probe-validated dependency-order | HIGH |
| D5 (corrigendum) | Source-read of TipTap's useEditor + S2 diagnosis | HIGH |
| D6 (baseline 23e86ca9) | git log inspection | HIGH |
| D7 (CM6 contract promotion) | H1 probe 12/12 | HIGH |
| E1 (Option E correction) | H2 empirical failure replicated | HIGH |
| E2 (Node-path Q1 RESOLVED — keep browser walker) | 8 empirical probes + source-level read of local-md@0.1.1 + head-to-head with mdx-remote + next-mdx-remote | HIGH |
| E3 (InteractionLayer bifurcation) | Derived from FR5–FR8 consumer analysis | MEDIUM |

**Open uncertainties (non-blocking for Intake → Scaffold):**
- A1 (TipTap's Editor.mount/unmount true behavior) — MEDIUM confidence; verifiable during Phase 1.1 impl
- A3 (cached markdown snapshot source for Option E fallback) — MEDIUM; verifiable during Phase 4.1 impl
- Q3 (IDEAL-EDITOR prod CPW 76 ms anomaly) — requires focused ablation before finalization
- Q2 (Option G hover intent threshold) — ship 80 ms default + post-ship telemetry

These are ALL resolvable DURING implementation, not Intake-blocking.

**All P0 questions closed as of 2026-04-20.** Intake phase complete.
