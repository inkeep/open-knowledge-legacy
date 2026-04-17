# Post-ship docs polish for markdown-pipeline-engineering-health

**Baseline commit:** `fa0050a4`
**Worktree:** `.claude/worktrees/docs-post-ship-polish`
**Branch:** `docs/post-ship-polish` (off `origin/main`)
**Spec status:** proposed for implementation approval (all work is already written; spec frames scope + AC)
**Target PR:** 1 (3 commits, ~906 LOC docs-only, no published-package surface)

---

## 1. Problem

**Situation.** The `markdown-pipeline-engineering-health` PR merged to `main` at commit `fa0050a4` shipping 21 P0 requirements across perf measurement (R1-R4), parse-health gate (R19), pipeline refactors (R15-R17), fidelity fixes (R6, R24), test tightening (R5b, R7, R13, R14), and CI tier infrastructure (R8, R9). The Phase 4 `/docs` subprocess of that ship updated `AGENTS.md` with an invariant catalog section and three new architectural precedents (#15, #16, #17). The new perf + parse-health subsystems shipped with pinned baselines, gates, and turbo tasks but no contract documents.

**Complication.** Three post-ship docs gaps degrade agent and human comprehension of the shipped systems:

1. **I11 row in `AGENTS.md` is mislabeled.** The `/docs` subprocess wrote "I11 — rawMdxFallback coverage — Pending (introduced by the tolerant-parsing spec)". But the tolerant-parsing spec itself (`specs/2026-04-13-mdx-tolerant-parsing/SPEC.md:129, 155, 581, 771`) explicitly names I11 as **"guard precision PBT"**, and the shipped implementation at `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` tests R23 guard precision (complements I9 guard completeness). Downstream effects: agents and humans reading `AGENTS.md` for ground truth get a stale definition; component-blocks-v2's I14 rawMdxFallback invariant appears to collide with a non-existent I11 claim; weekly CI workflow comment (`.github/workflows/weekly.yml:29`) says "10 active invariants" when 11 are active.

2. **Parse-health subsystem has no contract document.** Counter semantics, fire conditions, baseline lifecycle, CI tier integration, and "how to add a counter" are spread across `packages/core/src/metrics/parse-health.ts`, `packages/core/src/markdown/parse-with-fallback.ts`, `packages/core/tests/health/parse-health-gate.ts`, `packages/core/tests/health/baseline.json`, `patches/y-prosemirror@1.3.7.patch`, and `packages/server/src/api-extension.ts`. A contributor adding a new counter has to reconstruct the contract from 6 files.

3. **Perf framework has no authoring guide.** Threshold formula (`max(2σ, 10%)`), measurement protocol (10 warm-ups × 10 measured × `Bun.gc(true)`), baseline capture protocol, corpus strategy, CI tier placement, and calibration rationale are spread across `regression-gate.ts` top comment, `markdown-bench.test.ts` methodology constants, `evidence/perf-baseline-measured.md`, `evidence/r4-calibration.md`, and `fixtures/perf/README.md`. A contributor adding a new perf gate has to reconstruct the methodology from 5 files.

**Resolution.** Ship a single docs-only PR off `main` with three commits: (a) I11 label correction across `AGENTS.md` + `weekly.yml`, (b) parse-health contract README, (c) perf framework authoring README. Scope: post-ship polish for one just-shipped spec; docs-only; no published-package surface change; no test or source code change.

---

## 2. Goals & non-goals

**Goals.**

- **G1.** Agents and humans reading `AGENTS.md` see an accurate I11 definition that matches both the tolerant-parsing spec's original claim and the shipped implementation.
- **G2.** A contributor adding a new parse-health counter can start from a single document and reach implementation without re-reading 6 files.
- **G3.** A contributor adding a new perf regression gate can start from a single document and calibrate thresholds consistently with the shipped R4 methodology.
- **G4.** Cross-spec coordination (component-blocks-v2 rebase, future tolerant-parsing merge) inherits accurate docs without needing a manual reconcile step.

**Non-goals.**

- **NG1 (NOT NOW).** Fidelity-attrs contract document covering existing `data.source*` attrs (11 attr-rows / 8 distinct attr names across multiple node types — see `evidence/deliverables-verification.md` for the full table). Rationale: component-blocks-v2 PR will add 5 more attrs (componentName, kind, attributes, sourceRaw, sourceDirty on jsxComponent); authoring now and again in two weeks is double-work. Trigger to revisit: after component-blocks-v2 merges.
- **NG2 (NOT NOW).** rawMdxFallback byte-identity regression test. Rationale: component-blocks-v2 SPEC.md:250 claims this as I14 with 20 fixtures; preempting creates I-number label collision or orphan test. Current coverage (I8/I9/I10 crash resistance) exercises rawMdxFallback *activation* already; only a narrow byte-identity regression in the `rawMdxFallback` serialization handler would slip through. Trigger to revisit: if component-blocks-v2 PR stalls > 2 weeks OR if a byte-identity regression surfaces.
- **NG3 (NEVER in this spec).** Changes to test or source code. This PR is docs-only.
- **NG4 (NEVER edit; MAY annotate).** Amending the shipped `markdown-pipeline-engineering-health` SPEC.md (`specs/2026-04-16-…`) by rewriting its §NG4 line's prose is out of scope. Shipped specs are moment-in-time artifacts; retconning prose creates drift. **However:** a trailing marginal annotation — corrigendum-style, preserving original text — IS in scope for this PR per D4 (reopened 2026-04-16 after challenger feedback). The annotation at sister SPEC.md:61 preserves the original "moment-in-time" claim AND records that subsequent investigation corrected it, pointing at the authoritative source. Annotations must be unambiguously marked as post-ship corrections (italics + bracketed date + pointer); never mix annotation prose into the original line.
- **NG5 (NOT UNLESS).** Moving `autolink-void-html-guard.precision.test.ts` from `packages/core/src/markdown/` to `packages/app/tests/fidelity/invariant-i11.test.ts` for symmetry with I1-I10. Colocation with the thing-under-test (the R23 guard) is a stronger pattern than filename symmetry. Trigger: if a contributor proposes moving it with justification that colocation pattern no longer applies.

---

## 3. Scope

**In scope** (implemented uncommitted; this PR commits + merges):

- `AGENTS.md` edits at 4 lines (tier table + section header + I11 row + test-file location footnote).
- `.github/workflows/weekly.yml` comment at 1 line.
- New file: `packages/core/tests/health/README.md` (372 lines).
- New file: `packages/core/tests/perf/README.md` (529 lines).
- **New:** marginal annotation at `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md:61` — a single trailing italicized corrigendum line noting the I11 framing was corrected post-ship. Preserves the original prose intact. Per D4 (reopened).

**Out of scope** (addressed inline in §2 non-goals):

- Fidelity-attrs contract doc (NG1).
- rawMdxFallback byte-identity test (NG2).
- Test or source code changes (NG3).
- Sister spec SPEC.md amendments (NG4).
- I11 test file relocation (NG5).
- CONSIDER.md coordination artifact in component-blocks-v2 worktree. Produced during this session's analysis; lives on a different worktree/branch; lands via component-blocks-v2's own PR or is discarded by that branch's owner. Not part of this worktree's commit.

---

## 4. Requirements

| ID | Requirement | Must/Should | Acceptance |
|---|---|---|---|
| **R1** | AGENTS.md `I11` row describes R23 guard precision PBT (not rawMdxFallback coverage) and cites the shipped test file + tolerant-parsing spec's §M4/§D2 provenance. | Must | AGENTS.md:776 contains "R23 guard precision" + filepath `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` + reference to `specs/2026-04-13-mdx-tolerant-parsing/`. |
| **R2** | AGENTS.md section header reflects I1-I11 all active. | Must | AGENTS.md:762 reads `### Fidelity invariants (I1-I11 active)` exactly. |
| **R3** | AGENTS.md fidelity tier row in the test-layer table reflects the current test count AND calls out the I11 test's location split from I1-I10. | Must | AGENTS.md:530 row says `(I1-I11)` and includes both `packages/app/tests/fidelity/` and the `autolink-void-html-guard.precision.test.ts` path. |
| **R4** | AGENTS.md footnote about test file locations splits I1-I10 and I11 paths. | Must | AGENTS.md:778 cites both `packages/app/tests/fidelity/invariant-i{1..10}.test.ts` (I1-I10) and `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` (I11). |
| **R5** | `.github/workflows/weekly.yml:29` CI comment accurately describes what `STRESS_FIDELITY=1` exercises. | Must | Line contains the substring `"I1-I10"` as the set of invariants run at elevated sample depth AND acknowledges that I11 (colocated with the R23 guard in core) is not re-run by this job. No claim that all 11 active invariants run at elevated depth (which would be false — weekly runs only `test:fidelity`, which scopes to `packages/app/tests/fidelity/**`). |
| **R6** | `packages/core/tests/health/README.md` exists, covers: overview + 4-counter catalog + fire-site map + log event shapes + gate contract + baseline lifecycle + CI tier placement + HTTP endpoint + how-to-add-a-counter + design notes (CJS ↔ ESM bridge) + cross-references. | Must | File exists; each section present; counter descriptions match `packages/core/src/metrics/parse-health.ts` and fire sites match `parse-with-fallback.ts`. |
| **R7** | `packages/core/tests/perf/README.md` exists, covers: directory inventory + when-to-add-a-perf-test decision tree + measurement protocol + threshold formula with ≥2 worked examples using real baseline numbers + baseline capture protocol + corpus strategy + CI tier placement + step-by-step add-a-new-gate + calibration history + troubleshooting + cross-references. | Must | File exists; worked examples use real numbers from `packages/core/tests/perf/baseline.json`; turbo task definitions quoted match `turbo.json`. |
| **R8** | `bun run check` stays green after all edits. | Must | Exit code 0; 13/13 turbo tasks pass. |
| **R9** | AGENTS.md retains internal cross-reference consistency — no line asserts `I1-I10 active` or `I11 pending` as stale framing. The two remaining `I1-I10` tokens (lines 530, 778) are deliberate location descriptors that explicitly complement I11's separate path. | Must | Grep of post-edit AGENTS.md returns no `I1-I10 active` or `I11 pending` strings. The two remaining `I1-I10` references (lines 530, 778) appear only as location descriptors inside a row that also names `I11`. |
| **R10** | Four commits, one per logical deliverable. | Should | Commit log shows: (1) I11 label correction (AGENTS.md + weekly.yml), (2) parse-health README, (3) perf README, (4) sister-spec corrigendum annotation. |
| **R11** | Sister spec corrigendum annotation at `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md:61` preserves original prose AND appends an italicized, dated, pointer-bearing breadcrumb. | Must | Line 61 begins with the original `- **[NOT NOW] NG4:** I11 invariant test …` text unchanged; trails with `<br>_[Corrected 2026-04-16 post-ship: I11 ships as "R23 guard precision PBT" per tolerant-parsing SPEC §M4/§D2 — not rawMdxFallback coverage. Authoritative fix in AGENTS.md and specs/2026-04-16-post-ship-docs-polish/.]_` or equivalent corrigendum-style annotation. |

**Acceptance (overall).** All R1-R10 green. PR approved by repo owner. No reviewer asks "where's the rawMdxFallback coverage invariant?" without this spec being linked as answer.

---

## 5. Design

### 5.1 I11 label correction (R1-R5, R9)

**Source of truth for I11 semantics.** Tolerant-parsing spec (`specs/2026-04-13-mdx-tolerant-parsing/SPEC.md`) is the canonical origin:

- Line 129 (§M4): "I11 guard precision PBT passes at 10K runs."
- Line 155 (§R23 reference): "Proven complete by I9 PBT at 10K and **precise by I11 PBT**."
- Line 581 (§D2): "Guard proven by I9/I11 PBT."
- Line 771 (§STOP rule): "If I9 or I11 PBT fails at 1K runs post-swap, STOP and investigate guard interaction."

The shipped implementation at `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` tests exactly this (property: after `protectFromMdx`, valid MDX survives unchanged — no false-positive PUA replacements; complements I9 guard completeness).

**Five edit locations** (already applied in worktree — 4 in AGENTS.md + 1 in weekly.yml):

1. `AGENTS.md:530` — fidelity tier row updated: `(I1-I10)` → `(I1-I11)`, with test-file location split (`packages/app/tests/fidelity/` for I1-I10 + handler PBTs; `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` for I11).
2. `AGENTS.md:762` — section header: `### Fidelity invariants (I1-I10 active, I11 pending)` → `### Fidelity invariants (I1-I11 active)`.
3. `AGENTS.md:776` — I11 row: rewritten to describe guard precision with full provenance.
4. `AGENTS.md:778` — footnote: splits I1-I10 (`invariant-i{1..10}.test.ts`) from I11 path.
5. `.github/workflows/weekly.yml:29` — comment: updated to acknowledge both the elevated-sample invariants run by `test:fidelity` (I1-I10 + 6 handler PBTs) AND that I11 lives in the core unit suite (colocated with the R23 guard) and is not re-run at elevated depth by this job.

### 5.2 Parse-health contract doc (R6)

Target: `packages/core/tests/health/README.md` (~300 lines, already written).

**Why this location.** Adjacent to `parse-health-gate.ts` + `baseline.json`. The authoring surface for "adding a new health gate" lives here; counter definitions at `packages/core/src/metrics/parse-health.ts` are cross-referenced.

**Section outline** (shipped, 372 lines):

1. Overview — what parse-health is, why in-memory not CRDT.
2. Counter catalog — 4 counters (`parseFallback.blockLevel`, `parseFallback.wholeDoc`, `ypsMismatch.block`, `ypsMismatch.inline`) with fire condition, origin, log event.
3. Fire-site map — 6 distinct increment paths across `parse-with-fallback.ts` + y-prosemirror patch.
4. Log events — structured JSON shapes (`{event, offset?, reason, blockError?, blockErrorName?}`).
5. Gate contract — `wholeDocMax: 0` absolute, `blockLevelMax` ratchet-only.
6. Baseline lifecycle — schema, refresh protocol, when-to-refresh table.
7. CI tier placement — `test:health:unit` (tier 1) + `test:health` (tier 2).
8. HTTP endpoint — `/api/metrics/parse-health` response shape.
9. How-to-add-a-counter — 10-step numbered walkthrough.
10. Design notes — CJS ↔ ESM `globalThis` bridge for ypsMismatch.
11. Cross-references.

### 5.3 Perf framework authoring guide (R7)

Target: `packages/core/tests/perf/README.md` (~470 lines, already written).

**Why this location.** Adjacent to `baseline.json`, `regression-gate.ts`, `markdown-bench.test.ts`. First file a contributor lands on when exploring the perf tier.

**Section outline** (shipped, 529 lines):

1. Directory inventory — 6 files with role descriptions.
2. When to add a perf test — decision tree (regression gate / hard ceiling / pathological-input bound).
3. Measurement protocol — 10 warm-ups × 10 measured × `Bun.gc(true)`, p99-as-worst-of-10 explainer.
4. Threshold formula — `max(2σ, 10%)` with 3 worked examples using real baseline numbers.
5. Baseline capture — schema + calibration protocol + refresh policy.
6. Corpus strategy — 5 pinned block counts + block-type mix.
7. CI tier placement — turbo task definitions quoted verbatim.
8. Add-a-new-perf-gate — 10-step walkthrough.
9. Calibration history — why 10 warmups, why 2σ, why 10% floor, why p99.
10. Troubleshooting — 7 common pitfalls.
11. Cross-references.

### 5.4 Commit strategy (R10)

Four commits on `docs/post-ship-polish`:

1. `docs: correct I11 label in AGENTS.md + weekly.yml (R23 guard precision, not rawMdxFallback)` — 5 line edits across 2 files.
2. `docs: add packages/core/tests/health/README.md (parse-health counter + gate contract)` — 1 new file.
3. `docs: add packages/core/tests/perf/README.md (perf framework authoring guide)` — 1 new file.
4. `docs: add sister-spec corrigendum annotation (I11 framing correction breadcrumb)` — 1 line addition to `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md:61`.

Rationale: four independently-revertable logical chunks. Reviewer can approve each on its own merits. Squash-merge at PR review remains an option if reviewer prefers.

---

## 6. Success metrics

| ID | Metric | Target |
|---|---|---|
| **M1** | `bun run check` at HEAD of `docs/post-ship-polish`. | 13/13 turbo tasks green. |
| **M2** | Grep AGENTS.md for stale invariant-count assertions: `grep -nE 'I1-I10 active\|I11 pending' AGENTS.md` returns no hits. (Two `I1-I10` location descriptors at lines 530 and 778 remain by design — see R9.) | Zero `I1-I10 active` or `I11 pending` matches. |
| **M3** | Grep `grep -n 'rawMdxFallback coverage.*Pending' AGENTS.md` returns no hits. | Zero matches. |
| **M4** | PR review: no reviewer flags an invariant-label confusion. | N/A (observational). |
| **M5** | Parse-health README fire-site claims verified against source. | All 6 fire sites in the README match `parse-with-fallback.ts` increment call sites. |
| **M6** | Perf README worked examples verified against `baseline.json`. | Example 1 (serializeMs @ 100 blocks) + Example 2 (parseMs @ 10K blocks) math checks against committed values. |

---

## 7. Risks + mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| R1 regression — `bun run check` fails post-edit (e.g., test reads AGENTS.md content). | Low | Low | Already verified: `bun run check` green at 13/13. AGENTS.md is not parsed by any test. |
| R2 regression — hidden stale I11 reference elsewhere. | Low | Low | Grep completed: only live refs are at the 5 edited lines. Frozen references in `specs/` + `progress/` are historical and accurate-in-context. |
| R3 — CI linter fails on markdown table formatting in READMEs. | Low | Low | Biome does not lint markdown; no markdown-specific linter configured. `bun run check` already green. |
| R4 — tolerant-parsing spec merges separately, expands I11 semantics. | Low | Medium | Our I11 row cites the tolerant-parsing spec's §M4 / §D2 directly. Future I11 refinements land in the tolerant-parsing merge and should re-propagate to AGENTS.md as part of that spec's own docs phase — not ours to preempt. |
| R5 — component-blocks-v2 lands with I14 byte-identity test using fixture set that collides with planned `fixtures/mdx/built-ins/`. | Low | Low | CONSIDER.md Item 2 flags this; resolution is their decision. |
| R6 — changeset convention mismatch: repo requires changeset on every PR. | Medium | Low | Docs-only change to private packages. See §9-D8 for decision. |
| R7 — `packages/core/tests/*/README.md` gets picked up by package publishing. | Very low | Low | `packages/core/package.json` is `"private": true`. Even if it weren't, `tests/` subdirectory is conventionally excluded from npm publish. Verified. |

---

## 8. Rollout + acceptance

**Local validation (pre-push).**

- `bun run check` → 13/13 tasks green (confirmed at baseline `fa0050a4`).
- Visual inspection of `AGENTS.md` around the 4 edited lines: internal consistency holds (no dangling I1-I10 refs adjacent to I1-I11 text).

**PR validation (CI).**

- Tier 1 CI runs; all 15-min budget tasks green.
- No linter, typechecker, or test regression.

**Review gates.**

- Single reviewer approval sufficient (docs-only precedent).
- Reviewer checklist:
  - [ ] I11 row matches tolerant-parsing spec's §M4/§D2 definition.
  - [ ] Parse-health README counter catalog matches `parse-health.ts`.
  - [ ] Perf README worked examples use real `baseline.json` numbers.
  - [ ] No changes to source code, tests, or published-package files.

**Merge.** Standard squash-or-merge per repo convention. If squash, retain three-commit spirit in commit message body.

---

## 9. Decision log

| ID | Decision | Status | Type | Rationale + evidence |
|---|---|---|---|---|
| **D1** | Single PR, 3 commits. | LOCKED | Cross-cutting | All three items are conceptually "post-ship polish for one spec." Review cost lower than 3 PRs. Reviewers keep context. No dependency between commits; any one can revert cleanly. |
| **D2** | Defer rawMdxFallback byte-identity test (NG2). | LOCKED | Cross-cutting | Component-blocks-v2 SPEC.md:250 claims the invariant as I14. Preempting either (i) forces their rebase to renumber, or (ii) ships an orphan test. **Explicit coverage gap, named:** I8 (crash resistance), I9 (guard completeness), I10 (structural crash resistance) cover that `rawMdxFallback` *activates* correctly under malformed MDX but do not assert byte-identity of the `serialize(rawMdxFallback)` path. A refactor that HTML-encoded `<` or stripped trailing newlines in the fallback serializer would pass I8-I10 yet regress byte-identity. The gap is real and narrow; component-blocks-v2's I14 closes it as a 20-fixture byte-identity PBT. Deferral accepts the gap because (a) the surface is small (one serializer handler), (b) no active refactor in this PR touches it, (c) component-blocks-v2 is the appropriate claimant. Re-examine if component-blocks-v2 stalls > 2 weeks OR a byte-identity regression surfaces. |
| **D3** | Defer fidelity-attrs contract doc (NG1). | LOCKED | Cross-cutting | Component-blocks-v2 adds 5 more attrs when it lands; authoring now doubles the edit surface. Low acute pain on the existing 11 attrs. Re-examine after component-blocks-v2 merges. |
| **D4** | Add marginal annotation (not a prose edit) to sister spec SPEC.md:61 recording post-ship correction of the I11 framing. | LOCKED (reopened + resolved 2026-04-16 after challenger feedback) | Process | Original D4 said "don't touch shipped specs." Challenger (C-Finding-4) pointed out the trade-off: spec purity vs. cold-reader discoverability. A shipped spec with a known-wrong assertion and no breadcrumb forces future readers to cross-reference AGENTS.md + this spec's changelog to discover the correction — agent-hostile. **Resolution:** append an italicized trailing annotation at sister SPEC.md:61 of form `_[Corrected 2026-04-16 post-ship: …]_`. Preserves original "moment-in-time" line intact; adds a corrigendum-style breadcrumb. Sister spec's own `meta/_changelog.md:75` already flagged "CLAUDE.md staleness as docs-update follow-up" — this PR's cross-worktree annotation is the consistent manifestation of that bookmark. Authoritative fix still lives in AGENTS.md. |
| **D5** | Do NOT move I11 test file to `packages/app/tests/fidelity/` (NG5). | LOCKED | Technical | Colocation with thing-under-test (R23 guard at `packages/core/src/markdown/`) beats filename-symmetry with I1-I10. Moving expands scope from docs-only to test-file relocation. AGENTS.md row now documents the split explicitly (R3). |
| **D6** | README files live at `packages/core/tests/{health,perf}/README.md` (not under `docs/` site or spec evidence/). | LOCKED | Technical | Adjacent to the code they document. Matches `fixtures/perf/README.md` precedent (corpus docs live alongside corpus code). `docs/` (Fumadocs) is end-user-facing; these are contributor-facing. Spec `evidence/` is research-record; these are canonical contracts. |
| **D7** | Worked examples in perf README use real numbers from `baseline.json`, not hypothetical. | LOCKED | Technical | A worked example that doesn't reflect reality fails the first time a reader cross-checks. Example 3 (noisy CI) is explicitly labeled hypothetical because the baseline was captured on M-series only. |
| **D8** | Skip changeset entry for this PR. | LOCKED | Process | `.changeset/config.json` uses `"fixed": [[...]]` across `@inkeep/open-knowledge`, `-core`, `-server` — a bump cascades across all three. `packages/core` is `"private": true` so no npm publish occurs. Changes are: AGENTS.md at repo root (NOT the CLI's scaffolded `.open-knowledge/AGENTS.md`, which is a standalone template in `packages/cli/src/content/init.ts:9` — `AGENTS_MD_CONTENT` — unaffected by our edits), workflow comment (not shipped), test-directory READMEs (not in distributable). Consumer-visible surface: none, verified. Repo precedent: .changeset/ entries correlate with code changes, not docs. Confirmed 2026-04-16 after scope discussion; reviewer-fallback option (add `patch` entry scoped to `@inkeep/open-knowledge-core` with note "docs: post-ship I11 correction + parse-health + perf README authoring guides") remains available if a reviewer objects. |
| **D9** | No changes to `turbo.json` or `.gitignore`. | LOCKED | Technical | READMEs are not turbo cache inputs (turbo tracks source files, not docs). `.gitignore` unchanged (no new build artifacts). |
| **D10** | CONSIDER.md (component-blocks-v2 worktree) lands via that branch's PR or not at all — out of scope here. | LOCKED | Cross-cutting | Cross-worktree artifact. Cannot commit from this worktree to that branch. Owner of component-blocks-v2 branch decides. |

---

## 10. Open questions

All P0 open questions resolved. Remaining questions are P2 (deferred to appropriate future spec):

| ID | Question | Priority | Disposition |
|---|---|---|---|
| **OQ1** | Should `packages/core/tests/README.md` index the new subdirectory READMEs? | P2 | Verified at baseline `fa0050a4` via `ls packages/core/tests/` — only `health/` and `perf/` subdirs, no top-level README. Creating one at `tests/README.md` is additive-good but out of scope (adds surface). Revisit if a third README joins (e.g., future `tests/fuzz/README.md`). |
| **OQ2** | Does the `test:health:unit` task cache invalidation pick up changes to the new README? | P2 | READMEs are not in `turbo.json` task inputs by design. No cache change needed. |
| **OQ3** | Should the tolerant-parsing spec itself get a post-merge docs-phase that propagates its own AGENTS.md updates for rawMdxFallback coverage? | P2 | When tolerant-parsing merges, whatever it claims as its rawMdxFallback invariant (I17? new I-number?) will land with that spec's own docs phase. Not ours to preempt. |

---

## 11. Assumptions

| ID | Assumption | Confidence | Verification plan |
|---|---|---|---|
| **A1** | `packages/core` remains `"private": true` (never published to npm) so test-directory READMEs don't ship. | HIGH | Verified `packages/core/package.json:4` at baseline commit `fa0050a4`. |
| **A2** | `AGENTS.md` (and its `CLAUDE.md` symlink) is the primary ground-truth document for agent instructions at repo root. No competing ground-truth doc exists. | HIGH | Verified `ls -la CLAUDE.md AGENTS.md` at baseline — `CLAUDE.md → AGENTS.md` symlink. |
| **A3** | Component-blocks-v2 PR merges after this one. If it merges before, rebase is trivial (no file overlap). | HIGH | Different file surface; conflict space empty. |
| **A4** | Tolerant-parsing spec does not merge during this PR's review window. If it does, I11 semantics may shift; our row is designed to absorb that by citing the tolerant-parsing spec directly. | MEDIUM | Cross-spec sync check at PR-review time. |
| **A5** | `bun run check` green at baseline implies no test covers AGENTS.md content parsing. | HIGH | Confirmed via pre-edit and post-edit `bun run check` both green. |

---

## 12. Future work

**Explored (investigated during this spec; clear picture of what's needed):**

- **FW-1.** rawMdxFallback byte-identity regression test (20 fixtures from `crash-taxonomy.json`). Assertion: `serialize(parse(input)) === input` where parse produces `rawMdxFallback` node. Deferred per D2 to component-blocks-v2 (their I14 claim). Cost to ship: ~2 hours if done on our side, ~same on theirs. Trigger to promote: component-blocks-v2 stalls > 2 weeks OR byte-identity regression surfaces.

- **FW-2.** Fidelity-attrs contract doc. Single markdown table + prose at `packages/core/src/markdown/FIDELITY-ATTRS.md` (or similar) covering all 11 existing attrs + 5 arriving from component-blocks-v2. Deferred per D3 until component-blocks-v2 merges to avoid double-edit. Cost: ~2 hours post-merge.

**Identified (known to matter; needs its own pass):**

- **FW-3.** Post-merge docs phase for tolerant-parsing spec when it lands. Should propagate its own rawMdxFallback invariant claim (if any) to AGENTS.md. Not ours to drive.

- **FW-4.** `packages/core/tests/README.md` top-level index when a third test-tier README is added (e.g., fuzz tier).

**Noted (surfaced but not examined):**

- **FW-5.** Whether to generate a "structured-JSON log event catalog" doc enumerating every `console.warn(JSON.stringify({event: …}))` call site across the codebase. Adjacent to but distinct from parse-health.

---

## 13. Agent constraints

**SCOPE (files this implementation touches):**

- `AGENTS.md` (4 edits at lines 530, 762, 776, 778).
- `.github/workflows/weekly.yml` (1 edit at line 29).
- `packages/core/tests/health/README.md` (new file).
- `packages/core/tests/perf/README.md` (new file).
- `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md` (1 line addition at line 61 — corrigendum annotation only; does not rewrite original prose).
- This spec directory (`specs/2026-04-16-post-ship-docs-polish/`).

**EXCLUDE (do not touch):**

- Any `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.json`, `.yml` outside `AGENTS.md` + `weekly.yml` (no source, test, fixture, config, or schema changes).
- The sister spec's prose at `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md` — frozen EXCEPT for the single corrigendum annotation at line 61 per D4 (reopened). No other lines of the sister spec may be modified.
- Any file in other worktrees (including `.claude/worktrees/component-blocks-v2/`).
- `docs/` Fumadocs site.
- `turbo.json`, `package.json`, `bun.lock`, `biome.jsonc`, `tsconfig*.json` — no build or dep changes.

**STOP_IF (halt + surface to user):**

- `bun run check` fails after edits. Investigate before pushing.
- A grep surfaces a stale "I1-I10" reference outside historical spec artifacts.
- PR review surfaces a decision reopen (e.g., reviewer argues for including rawMdxFallback test).
- Changeset reviewer requirement conflicts with D8.

**ASK_FIRST (confirmation required):**

- Squash-merge vs preserve-3-commits at PR merge time.
- Whether to add a changeset entry if reviewer flags D8.
- Any proposed scope expansion (e.g., "while you're in there, also fix X").
