# V2 Perf Spec — Changelog

Append-only process history. New entries appended at top. Each entry records what happened, not what was planned.

---

## 2026-04-20 — Verify + finalize phase complete — SPEC APPROVED

**Verify phase (2026-04-20):** Quality-bar gate per `/spec` workflow step 7.

**Quality-bar checks:**
- ✅ All 14 FRs (FR1–FR15 excluding FR-less rows) have verifiable ACs. Each specifies empirical test or measurement.
- ✅ All 4 1-way-door decisions (D1, D3, D4, D7) have HIGH-confidence evidence backed by probes + source-reads.
- ✅ All P0 Open Questions resolved (Q1 via Node-path probe; Q2/Q3/Q4 are P1/P2 non-blocking).
- ✅ Agent constraints §16 fully derived: SCOPE + EXCLUDE + STOP_IF + ASK_FIRST all present and machine-parseable.
- ✅ All 13 Audit BLOCK findings addressed via spec edits.
- ✅ All evidence file citations verified by Auditor (17+ passes, 3 DRIFTs flagged + fixed during Assess-findings).
- ✅ Confidence-label corrections applied (A5 MED → LOW per taxonomy; A1 verification plan expanded).
- ✅ 1 emergent precedent candidate (#18(g)) sized to match existing CLAUDE.md format.

**Status transition:** `Draft` → **`APPROVED`**. Baseline commit remains `23e86ca9` (no codebase changes yet — baseline documents codebase state the spec was authored against; implementation sprint begins from this baseline).

**Changelog cadence:** Append-only. Post-Verify entries are implementation-sprint events (commit hashes, issue numbers, post-ship baselines). Spec itself is frozen at this state absent explicit user directive.

**Ready for ship.** Implementation sprint spawning now via `/ship`-orchestrating nested Claude Code subprocess. User-provided prompt emphasizes: methodical phase-by-phase execution; no skipping phases 4+; greenfield + no deferred tech debt + architecture-first; staff-engineer discipline. SPEC.md embedded verbatim in spawn prompt.

## 2026-04-20 — Audit + Assess-findings phases complete

**Audit phase (2026-04-20):** Two parallel nested Claudes — Challenger (bax6407yg, adversarial) + Auditor (bo727nj0e, verification). Both landed within 20–60 min of spawn. REPORTs copied into `evidence/audit-challenger-report.md` + `evidence/audit-auditor-report.md` (durable, not `/tmp/`).

- Challenger output: 5 BLOCK, 10 MUST-FIX, 11 SHOULD-FIX, 7 FYI, 4 disagreements with LOCKED decisions.
- Auditor output: 4 DRIFTs (1 confirmed by both audits), 17+ citation-audit passes (VERIFIED), 2 confidence-label corrections.

**Assess-findings phase (2026-04-20):** Evidence-based triage of all 37 findings + 4 disagreements. Methodology per `assessment-protocol-draft.md` (referenced from `/Users/edwingomezcuellar/.claude/plugins/marketplaces/inkeep-team-skills/specs/2026-03-22-local-review-convergence-improvements/evidence/`). Stance: greenfield + no deferred tech debt + architecture-first per user directive. Full triage documented in `evidence/audit-findings-resolution.md`.

**Resolution counts:**
- 13 BLOCKs addressed in spec edits.
- 17 SHOULD-FIXes addressed (greenfield directive favors clean landing).
- 3 FYIs addressed as documentation updates.
- 4 Challenger disagreements with LOCKED decisions declined with evidence-based reasoning.

**Spec edits applied (2026-04-20):**

- **§3 Non-goals:** NG8 added (cross-tab V2 cache non-goal per Audit §A1.1).
- **§6 Functional requirements:**
  - FR3 refined (threshold policy + N=50 rationale + eviction ordering).
  - **NEW FR3b:** Activity-hidden observer CPU cap via provider-disconnect policy (per Audit §B6).
  - FR4 refined (scope tightening: V2 wires PropPanel only; Toolbar + Breadcrumb are extension points CB-v2 uses) + touch-action + contenteditable false + data-mark-id.
  - **NEW FR4b:** Mark-identity PluginState (per Audit §B4) — PM marks have no stable identity; WeakMap-based plugin mirrors CB-v2 §9.15 Q10 Option A.
  - FR11 substantially revised per Audit §B1, §B5, §B8, §S11, §S14 — new `/api/document-disk` endpoint; split walker (core pure + app React binding); complete handler coverage; behavioral clauses (skip-fallback fast path, per-session mount tracking, content-comparison guard, hydration timeout); Mermaid carve-out.
  - FR12 refined: prewarm LRU interaction with MAX_POOL per Audit §S4.
  - **NEW FR15:** Emergency kill switch constant (per Audit §B10) — `CACHE_ENABLED` module-level; 1-line code edit to fire-drill rollback. NOT a feature flag.
- **§9.1 V2 Editor cache contract:** added provider-disconnect policy for non-mounted cached editors, scroll-persistence coupling to cache entry, kill switch invariant.
- **§9.2 InteractionLayer primitive:** added mark-identity via PluginState section + complete cost model rewrite (per Audit §B13) attributing savings to mechanism: InteractionLayer saves ~2.2s React reconciliation; V2 cache saves ~2.5–3.0s browser layout; §8b saves mode-toggle layout; Option E hides ~950ms.
- **§9.3 Option E full-fidelity fallback:** split walker architecture (core pure + app React binding per Audit §B2); `/api/document-disk` endpoint (per §B1); complete handler coverage (per §B5); behavioral clauses (per §B8, §S11); componentMap transformation (per §S14); Mermaid carve-out (per §B9); SECURITY note on `new Function()` boundary preserved.
- **§10 D4 REVISED:** LOCKED to split walker with `packages/core/src/markdown/to-react.ts` (pure, ~150 LoC) + `packages/app/src/editor/mdast-to-react.tsx` (React binding, ~50 LoC). Total 400-600 LoC after full coverage. Rationale per Audit §B2 + §B5.
- **§10 D7 REVISED:** precedent letter corrected #18(h) → **#18(g)** per Audit §S10. Text shape rewritten to match existing #18 sub-rule format.
- **§12 A1:** verification plan expanded with Phase 1.0 spike probe (mirrors H1 for TipTap). Gates Phase 1.1 (per Audit §B12).
- **§12 A5:** confidence label MED → LOW (per Audit §B11) — unmeasured claim. Phase 1.2 must measure.
- **§13 File-level scope:** added `mark-identity-plugin.ts`, `api-extension.ts` (modify — new endpoint only), `mdast-to-react.tsx` (React binding). Split walker file paths. Updated CLAUDE.md mod description (#18(g) not (h), add WARN rule per Audit §F3).
- **§13 Next actions:** added Phase 1.0 spike probe step (TipTap reparent mirror of H1); marked Audit + Assess-findings as DONE.
- **§13 Risks + mitigations:** revised table with post-Audit risks (TipTap 4 fragility, emergency kill switch, observer CPU cap, InteractionLayer edge UX).
- **§13 Deployment/rollout:** added kill switch row.
- **§14 Risks:** consolidated cross-cutting risks including walker bus-factor + plain-DOM chip presence-cursor UX + mermaid layout shift.
- **§15 Future Work Identified:** Q1 closed; added componentMap source-of-truth (per Audit §F2). TipTap 4 fragility moved to Noted.
- **§16 Agent constraints SCOPE:** extended to include new files (mark-identity-plugin, mdast-to-react, api-extension scoped addition). STOP_IF: Phase 1.0 probe gate. ASK_FIRST: kill switch flip.

**Evidence files updated:**
- `precedent-18b-corrigendum.md`: drift fixed to match D6 REVISED (per Audit §B3 — three locations).
- `cm6-reparent-contract.md` §11: precedent text rewritten as #18(g) sub-rule per Audit §S10.
- `option-e-utilities-CORRECTIONS.md`: two additional drifts added per Audit §V5 (CSS strategy + fumadocs-core/link).
- `component-blocks-v2-interweaving.md`: FR8 scope refinement per Audit §S15.
- `audit-findings-resolution.md` NEW: normative triage document for all 37 findings + 4 disagreements.
- `audit-challenger-report.md` NEW: full Challenger REPORT copied from `/tmp/` for durability.
- `audit-auditor-report.md` NEW: full Auditor REPORT copied from `/tmp/` for durability.
- `reference-walker-from-h2.tsx` NEW: copy of H2 probe's MdToReact2.tsx (per Audit §V7 durability).

## 2026-04-20 — Post-probe revisions (U1–U5 executed)

User approved 5 recommendations on remaining open items:

- **U1 — Corrigendum timing revised.** D6 revised: corrigendum text stays LOCKED but lands as FIRST commit of V2 impl sprint (Phase 3.2), NOT a standalone commit on `perf/investigation` beforehand. Rationale: user directive "ship end-to-end in one go" makes atomic delivery preferred. SPEC.md §10 + `decision-batch-resolution.md` Decision 5 updated.
- **U2 — Backlog + Iterate phases collapsed into Intake.** Per `/spec` proportionality guidance ("if a section has nothing to say, leave it empty"), Backlog (§11 Q2/Q3/Q4 already populated with resolutions) and Iterate (no P0 cascades needed since all decisions LOCKED/DIRECTED during Intake) are formalism. Skipping straight to Audit.
- **U3 — CB-v2 coordination closed as N/A.** V2 perf ships independently irrespective of CB-v2 delivery timeline. Closing section appended to `component-blocks-v2-interweaving.md` documenting "V2 ships standalone" + whichever-ships-second-has-clear-integration-path contract.
- **U4 — S7-T1 fix cherry-pick step added.** SPEC.md §13 Next actions now includes: cherry-pick `b6c6455b` (S7-T1 createEditor mark WeakMap-anchored fix) from `cold-mount-profile-instr` branch onto sprint branch before first feature commit. Without this, `ok/editor/create-tiptap` instrumentation breaks dev server under React Compiler — load-bearing for FR14 Phase 5 telemetry.
- **U5 — Broad Audit authorized.** Parallel Challenger + Auditor nested Claudes spawned against SPEC.md + all evidence/ files. Distinct lenses: Challenger = adversarial (architectural holes, scope creep, 1-way-door evidence), Auditor = verification (file:line citations, assumption labels, evidence-quality).

## 2026-04-20 — Q1 RESOLVED (Node-path rejected)

Probe `b8vgi4rpc` landed with definitive verdict after scaffold. 8 empirical probes + source-level read of `@fumadocs/local-md@0.1.1` + head-to-head with mdx-remote + next-mdx-remote.

**Key findings** (all HIGH confidence):
- local-md's "no eval()" claim is CONDITIONAL — only `.md` path. `.mdx` path uses `new AsyncFunction(...keys, code)(...values)` (dist/index.js:178-192), byte-identical to mdx-remote. Source comment at line 180: `Note: unsafe by design`.
- local-md's virtual-JS engine (dist/js/executor-virtual.js, 517 LoC) requires estree-annotated mdast. OK's `remarkMdxAgnostic` (chosen for R1/R6/R8 crash-class resistance per `packages/core/src/markdown/`) produces `mdxJsxAttributeValueExpression { value: '<raw string>' }` with NO `data.estree`. Local-md's renderer fails identically to hast-util-to-jsx-runtime (`Cannot handle MDX estrees without createEvaluater`).
- Adding acorn parsing to make local-md work (probe 08) negates OK's crash-class resistance.
- docs/ shares ZERO source with `packages/core/src/markdown/`. They render DIFFERENT content. No duplication win from unification.
- 85% (3,665 LoC) of OK's markdown pipeline encodes invariants no general-purpose renderer implements.

**Resolutions:**
- Q1 → RESOLVED. D4 DIRECTED → LOCKED.
- SPEC.md §10 D4 + §11 Q1 + §9.3 updated to reflect closure.
- `decision-batch-resolution.md` E2 updated to "Node-path RESOLVED — keep browser walker".
- Evidence copied to `evidence/mdx-remote-node-path-probe.md` (287 lines, HIGH confidence).

**Forward-compat placement decision:** walker file at `packages/core/src/markdown/to-react.ts` (NOT `packages/app/`). Environment-agnostic; serves future MCP render-preview / read-only / CLI export.

**Intake phase now fully complete. All P0 open questions closed.**

## 2026-04-20 — Scaffold phase complete

- Created spec directory `specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/`.
- Baseline commit `23e86ca9` stamped in SPEC.md.
- Copied 8 probe REPORTs from `/tmp/ok-perf-validation/` into `evidence/`:
  - `cold-mount-profile.md` — PROJECT.md cold-mount 5-component attribution (HIGH confidence, measured)
  - `size-spectrum-profile.md` — 5-doc scaling curve
  - `grey-zone-and-prod-floor.md` — 2 new grey-zone docs + prod-build baselines
  - `h1-cm6-reparent-probe.md` — CM6 reparent-without-destroy 12/12 FEASIBLE
  - `h2-fumadocs-standalone-probe.md` — fumadocs standalone rendering FEASIBLE; custom mdast→React walker validated
  - `non-blocking-research.md` — 10-dimension ecosystem rule-out (NO first-class non-blocking solution)
  - `tiptap-large-doc-patterns.md` — TipTap/PM/CM6 ecosystem prescriptions
  - `option-e-utilities.md` — Option E library leverage research (Opus subagent output; retained for provenance)
- Created 4 new evidence files for in-chat-only synthesis:
  - `option-e-utilities-CORRECTIONS.md` — flags incorrect `hast-util-to-jsx-runtime` recommendation from Opus subagent output; H2 probe empirically superseded it
  - `cm6-reparent-contract.md` — promotes H1 §5 contract to standalone normative artifact; candidate precedent #18(h)
  - `component-blocks-v2-interweaving.md` — interweaving analysis against `specs/2026-04-14-component-blocks-v2/SPEC.md` at commit `a0d86fab8cffeb7959cb838ca0ec8bc44cd6c50c`
  - `precedent-18b-corrigendum.md` — exact corrigendum text + application protocol (D6)
  - `decision-batch-resolution.md` — durable record of 6 decisions + 3 emergent commitments + confidence audit
- Wrote SPEC.md §1–16 from template with evidence citations throughout.

## 2026-04-20 — Intake phase complete

Probe fleet of 9 probes spawned during Intake. Methodology per `/spec` skill Intake phase.

**Probes landed (8/9):**
- `bxwgdes9a` — grey-zone + prod-floor (RESOLVED D2, D3)
- `bp3k341zz` — H1 CM6 reparent (RESOLVED D3 CM6 Phase 3.3, candidate precedent #18(h))
- `bs6shsz1l` — H2 fumadocs standalone (RESOLVED D4 Option E shape + superseded Opus subagent recommendation)
- Cold-mount profile (directly measured 7.70 s longtask attribution; reversed prior inferred breakdown)
- Size-spectrum profile (5-doc scaling; established view-count-dominant cost curve)
- Non-blocking-research (10-dimension ecosystem rule-out; NO first-class non-blocking solution)
- TipTap-large-doc-patterns (ecosystem consensus; Marijn/Kühn refusals; CM6 not bottleneck)
- Option E utilities research (Opus subagent; later corrected by H2 empirical probe)

**Probe in flight (1):**
- `b8vgi4rpc` — Node-path / `@fumadocs/local-md` evaluation (Q1; may shift D4 Phase 4.1 shape)

**Decisions resolved:**
- D1 LOCKED — Alt 5 all 4 extensions + view-count gate N=50
- D2 LOCKED — Prod calibration for all ACs
- D3 LOCKED — CM6 reparent IN SCOPE (Phase 3.3)
- D4 DIRECTED — Option E full-fidelity (pending Q1)
- D5 LOCKED — Size policy view-count-primary + byte-secondary
- D6 LOCKED — Precedent #18(b) corrigendum ships now on `perf/investigation` as standalone commit
- D7 DIRECTED — CM6 contract promotion to CLAUDE.md precedent #18(h) at V2 ship

**Emergent commitments:**
- E1 — Option E correction on hast-util-to-jsx-runtime
- E2 — Node-path Q1 gates D4 Phase 4.1 finalization
- E3 — InteractionLayer bifurcation (simple marks vs rich NodeViews)

## 2026-04-19 — Foundation spec shipped

`specs/2026-04-19-perf-diagnostic-toolkit/` merged to `main`. 10 user stories shipped:
- `<ProfilerBoundary>` primitive (precedent #24)
- `mark()` helper with `ok/*` namespace
- `initWebVitals()` DEV gate
- Cold-mount instrumentation prototype (commit `b6c6455b` in `cold-mount-profile` worktree)
- §8b CV:hidden protocol documentation (US-009 + US-010 post-fix baseline)
- Architecturally-bounded outcome classifications for S1/S2/S3

V2 perf spec takes this as baseline (commit `23e86ca9`).

---

**Next up:**
1. Wait for `b8vgi4rpc` probe to land (Q1)
2. Integrate Node-path findings into D4 resolution
3. Ship precedent #18(b) corrigendum on `perf/investigation` (D6, standalone commit)
4. Move to Backlog phase (`/spec` step 4)
5. Audit + Assess-findings phases
6. Verify + finalize
7. Implementation sprint (AI coding agent, 5-phase topology)
