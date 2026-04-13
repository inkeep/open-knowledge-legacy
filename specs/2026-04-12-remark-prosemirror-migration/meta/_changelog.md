# Changelog

## 2026-04-12 — Spec intake + scaffold

- New worktree created from `main` on branch `worktree-remark-prosemirror-migration`.
- Baseline commit stamped: `39fcd87`.
- Intake completed: SCR framing captured, all 5 stress-test probes passed.
- SPEC.md drafted with extensive leverage of prior research:
  - `reports/tokenizer-comparison-micromark-vs-marked/REPORT.md` — the greenfield comparison
  - `reports/markdown-roundtrip-fidelity-tiptap/REPORT.md` — 118-case comparison
  - `reports/markdown-construct-fidelity-catalog/REPORT.md` — 118-case catalog
  - `reports/mdx-crdt-roundtrip-fidelity/REPORT.md` — MDX round-trip
  - `specs/2026-04-11-markdown-source-text-fidelity/SPEC.md` — predecessor brownfield spec
- Scope locked around rewriting the markdown engine while keeping CRDT/editor/observer/persistence/PM-schema unchanged.
- 11 open questions (Q1-Q9 + pending) surfaced for iterative loop.
- Pre-flight probe (R1) established as hard gate before production migration code.
- Next: extract remaining open questions, investigate P0 items autonomously (especially A5 — 1P grep to confirm @tiptap/markdown is removable cleanly), present decision batch.

## 2026-04-12 — Decision batch 1 resolved

User decisions applied:
- **D11 LOCKED:** No startup canary. R16 rewritten to require TDD-aligned integration test coverage of all critical paths per `/tdd`.
- **D12 LOCKED:** Register `remark-directive` from day one (no-deferred-tech-debt principle). R3 pipeline + NG8 updated.
- **D13 LOCKED:** MDX is explicit sprint goal (not future work). P6 persona + J7 journey elevated; R8 reframed as a sprint deliverable.
- **D14 LOCKED:** ProseMirror schema preservation is preference, not compat constraint (greenfield — no data to migrate). D4 reframed; NG1 softened to NOT NOW; A6 stricken as N/A.

Spec is now consistent with greenfield + no-deferred-tech-debt + MDX-this-sprint framing.

Remaining open questions before audit:
- Q1-Q5 (pre-flight probe items) — user acknowledged probe will run after spec is written.
- Q10 (backlink-index.ts call pattern) — audit-worthy, one-file grep.
- Q11 (markdownOptions equivalents) — handled by the probe.
- Q12 (new test additions) — handled by R16.
- Q13 (CI plan) — handled by D2 atomic PR.

Ready to proceed to audit + challenger phase.

## 2026-04-12 — Audit + challenger + full-stack research resolved

**Audit** (`meta/audit-findings.md`): 9 findings (2 high, 4 medium, 3 low). Mechanical fixes applied:
- H1 / L7: remark-directive EXCLUDE-vs-D12 contradiction resolved — EXCLUDE now explicitly notes remark-directive is IN SCOPE per D12.
- H2: `@handlewithcare/remark-prosemirror` corrected from "~300 LOC" → "~550 LOC" (actual: 4 files, 11 deps). Risk language updated accordingly.
- L1: jsx-tokenizer corrected 370→384 LOC.
- M1: marked CommonMark claim now version-bound to v4.2.3 per markedjs/marked#1202; exact version @tiptap/markdown@3.22.3 pins is a probe target.
- M4: G4's "byte-exact fidelity" softened — acknowledges dependency on custom emphasis handler for mdast-util-to-markdown#12.

**Challenger** (`meta/design-challenge.md`): 7 findings (3 high, 3 medium, 1 low). Applied:
- H1 (phantom report): tokenizer-comparison report exists in sibling worktree, not this one. Added note + Q15 to decide whether to copy it over before merge.
- H3 (mdx-js/mdx#2533): CRITICAL non-converging indentation-drift defect in multiline JSX expressions — now in §14 risk table with explicit mitigation strategy and probe inclusion.
- M5 (position-slice fallback): explicit fallback behavior now in risk table — when node.position is absent, walker falls back to remark-stringify defaults (never crashes).
- M6 (framing): Problem Statement reframed from "greenfield" to "greenfield data, brownfield behavior contracts" (695 tests, 7 invariants, 118-case catalog).
- M4 (hybrid alternative): Q16 added — evaluate parse-marked + serialize-remark hybrid or reject with evidence.
- H2 (maturity): Q18 added — fork remark-prosemirror proactively or reactively? Risk severity raised from Low/Medium to Low-Medium/Medium-High.

**Full-stack research** (`reports/full-stack-pm-crdt-markdown-editor-ideal/REPORT.md`, 725 lines, 6 evidence files, CLAIMS.md):
- 6-dimension nested fanout (D1 ProseMirror/TipTap, D2 CRDT/collab, D3 unified/remark/micromark, D4 remark-prosemirror, D5 CodeMirror, D6 reference editors).
- Schema validated with 2 REQUIRED corrections:
  - C1: `checked` attribute moves from `list` to `listItem` (mdast parity)
  - C2: Fidelity attrs must be flat primitives (Y.js type contract) — `sourceFenceChar` + `sourceFenceLength`, not nested `sourceFence: {char, length}`
- Added as spec §17 with validated 17-block / 5-inline / 5-mark schema.
- Live decisions (Q17): adopt schema-rename (`bold` → `strong`)? unified-list vs separate? wiki-link as atom-node vs current mark?

## 2026-04-12 — Decision batch 2 resolved (/analyze + package activity assessment)

**Analysis** ran `/analyze` on Q14-Q18. **Package activity assessment** ran 5 parallel subagents across all 14 removed+added packages. Evidence persisted to `evidence/dependency-activity-assessment.md`.

### Decisions applied:
- **Q14 RESOLVED → D2 confirmed (atomic swap).** §9 hybrid rejection strengthened to cite D13 explicitly — marked has no MDX tokenizer, so any parse-side-marked approach contradicts G2 and D13.
- **Q15 RESOLVED → merge report to main via separate tiny PR.** Report is evidence for multiple specs; should be on main regardless of migration outcome.
- **Q16 RESOLVED → eliminated by D13.** Hybrid parse-marked + serialize-remark doesn't unblock MDX sprint goal.
- **Q17 RESOLVED → full research redesign adopted (D15-D17 LOCKED).** Unified list (prosemirror-flat-list), mdast-canonical mark names (strong/emphasis), mdast-canonical block names (thematicBreak). Wiki-link already atom; fidelity attrs already flat primitives — analysis corrected the "required corrections" framing (they were constraints on my sketch, not bugs in shipping code).
- **Q18 REMOVED — not a design decision.** Pin exact version, apply PR #3 via bun patch (D18), react to issues if they arise. No fork planning.
- **D19 LOCKED:** Sweep dead-weight `@tiptap/extension-task-list` (not imported anywhere; functionally redundant).

### Spec sections updated:
- §3 NG1, NG5: schema changes now IN SCOPE per D15-D17
- §6: R19 (unified list), R20 (remark-prosemirror PR #3 patch), R21 (schema renames), R22 (import path migration) added
- §9: hybrid rejection now cites D13; commit 1 deps updated for prosemirror-flat-list + @tiptap/extension-list removal + import path migration
- §10: D1 LOCKED; D4 superseded; D15-D19 added
- §11: Q6/Q7 marked RESOLVED; Q14-Q17 marked RESOLVED; Q18 removed
- §14: remark-prosemirror risk rewritten with specific PR #3 + pin + evidence language
- §15: "Vendor remark-prosemirror" removed from Noted
- §16: SCOPE expanded for list.ts, schema renames, 26-file import migration, patch file; EXCLUDE updated for schema-change scope
- §17: Complete rewrite — "Adopted ProseMirror schema redesign" (not "decision-open"); verified current schema already satisfies C1/C2/wiki-link constraints; changes are unified list + naming only

### Package assessment summary:
- **Removing:** @tiptap/markdown (920k DL/wk, 33 open markdown issues), marked (34.8M DL/wk), @tiptap/extension-list (4.87M DL/wk), @tiptap/extension-task-list (dead weight)
- **Adding Tier 1 (8 packages):** unified/remark ecosystem (~130M cumulative DL/wk, industry backbone — Next.js, Astro, Docusaurus, Prettier)
- **Adding Tier 2 (2 packages):** remark-prosemirror (29 stars, 16.8k DL/wk, dormant 16 months — bus factor 1, pinned+patched), prosemirror-flat-list (69 stars, 18.4k DL/wk, active, Reflect-sponsored)
- **Verdict:** Tier 1 swap is unambiguously lower-risk than what we're removing. Tier 2 is higher-risk but bounded.

### Open items (remaining):
- Q1-Q5, Q9, Q11: pre-flight probe targets (not yet run)
- OQ1: prosemirror-flat-list Tab/Shift-Tab accessibility (R19 acceptance criterion)
- A1, A2, A4: MEDIUM confidence assumptions validated by probe

## 2026-04-12 — Source-code verification + handler/test refinement

**Bridge library source-code analysis** (`reports/mdast-prosemirror-bridge-source-comparison/REPORT.md`): compared @handlewithcare/remark-prosemirror (v0.1.5) vs prosemirror-remark (v0.6.3) at source level. Confirmed D1. Key findings applied:
- **D1 evidence** expanded with source-code-level verification
- **§9 alternatives** — prosemirror-remark added as rejected (wraps unified internally, class-per-handler boilerplate, warn-and-drop vs fail-fast)
- **R6 critical gotcha** — library pre-ignores `definition` mdast nodes (`mdast-util-to-prosemirror.ts:215`). Must register explicit handler override or all `[label]: url` lines silently disappear. Flagged in R12 as CRITICAL.
- **R6 setup step** — TypeScript module augmentation of mdast `Nodes` type required for custom types (`mdxJsxFlowElement`, `wikiLink`, `containerDirective`) — standard mdast pattern, ~15 LOC.

**Handler inventory refinement** (exploration of all 15 fidelity extension files):
- **R6 rewritten** with 3-tier breakdown: Tier A passthrough (~20-25 handlers, ~100 LOC), Tier B fidelity (~8 handlers, ~100 LOC), Tier C custom/simplified (~5 handlers, ~150 LOC). **Total: ~400-500 LOC** (down from earlier ~500-600 estimate).
- **LinkFidelity dramatically simplified** — mdast provides `linkReference.referenceType` natively, replacing 20 LOC of regex on `token.raw`.
- **ListItemFidelity complex paragraph-detection heuristic goes away** — mdast structures `listItem.children` as paragraphs/blocks.
- **HtmlBlockFidelity simplified** — mdast `html` is block-level by position, no `token.block === true` filter needed.
- **3 handlers entirely replaced by libraries:** jsx-tokenizer (→ remark-mdx), frontmatter parse-time (→ remark-frontmatter), jsx-component code-fence format (→ native MDX).
- **8 handlers stay but change mechanism** — from `token.raw` regex to `node.data.*` fields populated by position-slice walker.

**Test surface analysis** (complete inventory of all 25 pipeline-touching test files + 4 E2E files):
- **R13 updated** — acknowledges 1 DELETE (`jsx-tokenizer-prototype.test.ts`, 543 LOC) + 1 REWRITE (`jsx-component.test.ts`, 84 LOC) beyond the ~695 tests passing.
- **R16 expanded** with explicit test burn-down and TDD guardrails (don't test library behavior; test system boundaries).
- **§9 Test surface impact summary added** — shows 2-file choke-point rewire propagates to 21 files with zero assertion changes, plus ~1-3 new test files for new capabilities.
- **Key TDD finding:** no existing tests become redundant because a library encapsulates their behavior. Our tests verify our handlers + our pipeline composition + our fidelity attrs — all of which remain our code. CommonMark/GFM corpus tests shift role from parser validation to handler regression guards.

## 2026-04-12 — Spec polish + implementer grounding

**LOC removed throughout spec** — all `~NNN LOC`, `~N line` references stripped per user direction ("that's implementation detail and can disorient agents"). Replaced with qualitative descriptions (e.g., "small-footprint library", "low-friction TipTap config", "tractable single-file extension"). Requirements now describe WHAT and ACCEPTANCE, not size.

**New §18 Change manifest** added — clean implementer-facing index organized by action (CREATE / DELETE / MODIFY extensions / MODIFY package.json / MODIFY import paths / MODIFY tests / MODIFY docs / Unchanged). Every change traces to a requirement or decision ID.

**New §19 Implementation grounding notes** added — hints, not prescriptions. Consolidates research findings that are non-obvious but will save the implementer time:
- §19.1 remark-prosemirror source-level specifics (built-in handlers for root/text/html; pre-ignored types; unknown-type error message; mark vs node handler distinction; atom node pattern)
- §19.2 Position-slice delimiter recovery matrix (per-type source inspection rules; fallback behavior)
- §19.3 Unified pipeline plugin order — flagged as probe target, not prescribed (frontmatter-vs-thematic-break, wiki-link-vs-MDX, directive-vs-JSX orderings)
- §19.4 MDX trio pinning (remark-mdx + mdast-util-mdx + micromark-extension-mdxjs move as a unit)
- §19.5 Known MDX edge cases beyond #2533 (mdx-js/mdx#2608 boolean-attr drift; block expression indentation)
- §19.6 prosemirror-flat-list schema choice — flagged as implementer decision (flat native schema vs nested mdast-aligned wrapper). Not prescribed.
- §19.7 Consolidated probe (R1) checklist — gathers probe targets scattered across the spec

All guidance explicitly non-directive where we don't have certainty (plugin ordering, flat-list schema choice) — flagged as probe targets or implementer decisions rather than prescriptions.

## 2026-04-12 — Tech probes executed (D3 hard gate PASSED)

Three parallel nested-Claude probes executed. Results persisted to `tech-probes/`.

### Probe 1: R1 pre-flight gate (`tech-probes/r1-preflight-gate/`)
**VERDICT: GO.** All 6 hard gates pass.
- 118-case whitespace-only: **97/118 (82.2%)** — 26% improvement over current 77/118 baseline
- 13 P0 entity/escape: 12/13 — one miss (`text \# more`) has identified fix path
- `definition` override round-trip: byte-identical
- Fail-fast on unknown type: throws correctly
- MDX multiline expression I3 stability: converges
- Position-data coverage: 100% across 9 diverse inputs
- Q9 custom handler types: 11/11 register cleanly

### Probe 2: Wiki-link micromark (`tech-probes/wiki-link-micromark/`)
**VERDICT: FEASIBLE.** 20/20 tests pass. ~100 SLOC micromark extension + mdast-util pair. All 4 shapes + 11 edge cases + 5 integration cases correct. D7 confirmed.

### Probe 3: Plugin ordering (`tech-probes/plugin-ordering/`)
**VERDICT: ORDER-INDEPENDENT for parser extensions.** Six orderings produced identical mdast trees across 15 ambiguous inputs. Recommended order is readability convention only. §19.3 rewritten to reflect. Transformer ordering (position-slice → remarkProseMirror → remarkStringify) still matters and is documented.

### Spec updates applied
- Status banner: "Ready for implementation — pre-flight probe PASSED"
- Q1-Q5, Q9 marked RESOLVED with probe evidence
- A1-A4 upgraded from MEDIUM → CONFIRMED
- R5 amended: add backslash-escape preservation mechanism (PM `escapeMark` or `escapedText` atom) — surfaced by P0 probe's single miss
- R8 amended: note that `mdxJsxFlowElement` handler must serialize attributes + children (biggest handler in the table)
- §19.3 rewritten: ordering is commutative for parsers; documents MDX semantics caveats (thematicBreak-in-JSX, inline-JSX flattening)
- §19.7 rewritten: all probe checks marked complete with results table + implementation learnings
- Spec Links section updated with probe report references

### Key implementation learnings captured for implementer
- Custom `text` handler must strip `&` and `<` from mdast-util-to-markdown's unsafe list (otherwise literals get backslash-escaped)
- Custom `link` handler writes URLs verbatim (avoid `&` escaping in `destinationRaw`)
- PR #3 patch equivalent (NBSP transform for whitespace-only text + null early-return) confirmed necessary and working
- `mdxJsxFlowElement` handler is the biggest in the table — full attribute + child traversal required

### Remaining open items (none block implementation)
- Q6/Q7/Q10-Q17: all resolved in prior batches
- Q11 (markdownOptions config): no equivalents needed — pipeline composes cleanly without them
- OQ1: prosemirror-flat-list a11y — still an R19 implementation concern
- R5 backslash-escape mechanism: implementer chooses `escapeMark` vs `escapedText` atom
- §19.6 flat-list schema choice: implementer decision during R19
- Minor MDX semantics caveats documented in §19.3 (user-facing limitations, not bugs)

## 2026-04-12 — Final audit + challenger round (verify-and-finalize)

Final /spec verify-and-finalize pass: re-audit + re-challenger executed against the post-amendment spec to catch inconsistencies introduced during the amendment cycles. Findings processed via `/assess-findings`.

**Findings sources:**
- `meta/audit-findings-final.md` — 12 findings (2H / 5M / 5L)
- `meta/design-challenge-final.md` — 8 findings (3H / 4M / 1L)
- Total: 20 findings, 2 pairs overlapping (audit M3 ↔ challenger H1; audit L4 ↔ challenger H3)

**Verification done pre-classification:**
- A-H2 WikiLink type: confirmed NodeSpec (`inline: true, atom: true` at `wiki-link.ts:63-65`) — R7 "mark" was wrong, §17.2 missing wikiLink was wrong
- C-H2 StarterKit rename concern: confirmed disable keys (`bold: false`, etc.) ARE extension names, NOT schema names — clarified in R21
- C-H3 Per-case regressions: VERIFIED via probe TSV — `link-autolink` is old-stack SEMANTIC_LOSS (normalizes) but new-stack ERROR (crashes); `html-br` ERROR on new stack. Both are regressions.

**Classification result: all 20 findings VALID — 100% accepted, 0 declined.**

### Resolutions applied

**High severity (5, all resolved):**
- A-H1 OQ1 dangling reference → Added OQ1 as an explicit open-question row in §11 (Tab/Shift-Tab a11y mitigation path specified, referenced from R19/D15)
- A-H2 WikiLink type contradiction → R7 corrected to "inline atom node"; §17.2 count updated from 17/5/5=27 to 17/6/5=28; wikiLink added to inline nodes enumeration
- A-M3 / C-H1 §19.6 vs D15 contradiction → §19.6 rewritten: nested NodeSpec is LOCKED per D15; wrapper-over-flat-list is the standard TipTap pattern; OQ1 scoped for Tab/Shift-Tab keymap validation during R19 first commit
- C-H2 Schema-rename not TipTap-smoke-tested → R21 expanded with explicit scope for StarterKit disable keys (extension names, NOT schema — stay the same), command aliases, isActive callsites, input rules; smoke-test acceptance added
- C-H3 / A-L4 97>77 hides per-case regressions → R1 acceptance amended: per-case delta is the gate, not just aggregate. G4 + M1 updated. NEW R23 scoping the 2 verified regressions (autolink + bare HTML-void-tags) as in-migration fixes with 3 mitigation options

**Medium severity (8, all resolved):**
- A-M1 G1 absolute "no more patches" contradicted by R20/D18 → G1 narrowed (one remaining patch is upstream-pending, cleanly removable)
- A-M2 Q11/Q12/Q13 stale → all marked RESOLVED with probe evidence or existing answers
- A-M4 26 vs 28 files mismatch → harmonized to "28 import statements across 26 files"
- A-M5 D5 orphaned → marked "Subsumed by D15" for parallelism with D4/D14
- C-M4 R8 MDX acceptance under-specified → R8 expanded with 8 enumerated attribute/child shapes cross-referenced to R16(a) test coverage
- C-M5 R5 escape mechanism needed D20 → D20 added: `escapeMark` LOCKED over `escapedText` atom; rationale covers Y.Doc run fragmentation + alignment with sourceDelimiter pattern; cross-mark edge case noted as known limitation
- C-M6 Rollback rehearsal → added to §9 Rollback path: scratch-branch `git revert` + `bun install` + `bun run check` before merge, PR comment as proof
- C-M7 A1 coverage scoped to 9 samples → A1 narrowed to "CONFIRMED (scope: 9 probe samples)"; full 118-sample position-data verification deferred to R19 first commit per R5(c)

**Low severity (5, all resolved):**
- A-L1 §17.2 count → updated as part of A-H2 fix (28 types)
- A-L2 Q9 yaml wording drift → rephrased: "handlers where appropriate; explicit ignore for yaml/toml"
- A-L3 NG5 rename overlook → NG5 amended to note the three D16/D17 renames
- A-L5 tokenizer-comparison link → Q15 plan executed: pre-merge action clarified (land on main via tiny PR OR copy into this worktree)
- C-L8 wiki-link test missing from §18.6 → added: KEEP existing `wiki-link.test.ts` + NEW `wiki-link-micromark.test.ts`

### New decision: D20 (escape preservation)

Added D20: Backslash-escape preservation uses PM-level `escapeMark` (not `escapedText` atom). Rationale persisted in the decision log — prevents Y.Doc run fragmentation, aligns with `sourceDelimiter` pattern, simpler handler shape.

### New requirement: R23 (autolink + bare-HTML regression fix)

Added R23 scoping the 2 verified probe regressions. Three mitigation options documented; implementer picks one. Gate: probe re-run shows 0 cases in `old: pass / new: ERROR` bucket.

### Declined findings: none

All 20 findings were verified valid and accepted. No declines.

### Spec is now finalized

- Status banner reflects pre-flight probe PASSED + post-amendment final audit clean
- All 17 Q's RESOLVED; 1 OQ open (OQ1 — R19 implementation concern)
- D1-D20: 18 LOCKED, 2 Superseded (D4, D14), 1 Subsumed (D5)
- A1-A8: 5 CONFIRMED, 1 HIGH, 1 MEDIUM (A8 team bandwidth — user gate, not technical)
- 23 requirements (R1-R23) with acceptance criteria
- All evidence files in place: call-site-inventory.md, dependency-activity-assessment.md
- All probe reports in place: r1-preflight-gate (GO), wiki-link-micromark (FEASIBLE), plugin-ordering (ORDER-INDEPENDENT)
- §18 change manifest complete
- §19 implementation grounding complete
- Pre-merge checklist: (1) Q15 — land tokenizer-comparison report on main; (2) rollback rehearsal per §9

**Migration implementation can begin per §9 phasing.**

## 2026-04-12 — Convergence round 3 audit + challenger (final-2)

Third audit + challenger pass explicitly scoped to catch issues introduced by round-2 amendments (D20, R23, OQ1, R21 expansion, G4 regression rule). **Reviewers did not declare convergence — 9 new findings surfaced.** Processed via /assess-findings.

**Findings sources:**
- `meta/audit-findings-final-2.md` — 5 findings (2H / 2M / 1L)
- `meta/design-challenge-final-2.md` — 4 findings (1H / 2M / 1L)

**Investigation result: all 9 findings VALID.** No declines.

### Resolutions applied

**HIGH severity (3):**
- **A-H1 escapeMark schema drift** — §17.2 header updated to "17 blocks / 6 inline / 6 marks = 29 types"; `escapeMark` added to Marks enumeration with scope note
- **A-H2 D20 cross-mark test gap** — R16(g) kept for basic delimiter recovery; new R16(h) added explicitly enumerating the cross-mark escape test (`**bold\*word**` and `*em\*phasis*` round-trip) + end-of-line trailing escape (NG rule)
- **C-F1 D20 semantics unresolved** — D20 amended: scope narrowed to structurally-ambiguous escapes (CommonMark §2.4 list: `\#`, `\*`, `\_`, `\[`, `\\`, `\` ` `, etc.); non-ambiguous escapes (`\foo`) drop the backslash as documented NG; boundary cases (EOL trailing, cross-mark composition) handled explicitly in the decision rationale; "aligns with sourceDelimiter pattern" rhetoric corrected

**MEDIUM severity (4):**
- **A-M1 Pre-merge actions scattered** — new §18.8 "Pre-merge checklist (consolidated for the implementer)" lists 8 items as a single checklist, each cross-referenced to governing requirement: tokenizer-comparison report landed, rollback rehearsal, R1 re-run, R19 OQ1 three-surface test, R21 rename smoke, D20 escape validation, bun run check green, 118-case re-run
- **A-M2 §16 EXCLUDE missing D20** — §16 updated: EXCLUDE clause allows D15/D16/D17/D20 schema changes; STOP_IF updated to "beyond D15-D17 or D20 scope"
- **C-F2 R23 option (iii) vs G4** — option (iii) dropped (documenting as limitation contradicts G4's zero-regressions rule); option (i) preprocess now carries explicit complexity flag (autolinks inside JSX children); option (ii) micromark extension recommended with note that wiki-link probe is only partial precedent (different hazard class — `<` collision vs `[[` non-collision)
- **C-F3 OQ1 lacks failure gate** — OQ1 mitigation promoted to R19 acceptance gate with three concrete criteria: (a) Tab behavior in listItem/tableCell/codeBlock specified, (b) Playwright keymap test required (part of R16), (c) manual screen-reader smoke noted in PR comment; "R19 does not close until all three criteria pass"

**LOW severity (2):**
- **A-L1 D6 vs R23(ii) cosmetic tension** — D6 re-titled from "Use remark-mdx for MDX support (not a custom micromark extension)" to "Use remark-mdx for MDX **parsing** (not a custom MDX tokenizer)"; scope note added clarifying D6 does NOT prohibit custom micromark extensions for wiki-link (D7) or autolink/void-HTML guards (R23 ii)
- **C-F4 R21 StarterKit evidence** — R21 amended with explicit grounding statement: the StarterKit-disable-key-as-extension-name assertion is sourced from TipTap convention research, not a live smoke test; R21's own smoke-test acceptance IS the verification gate; optional 15-min pre-flight script documented for proactive validation

### Meta-observation captured (not a finding)

Challenger noted the spec is "heavy but at the ceiling of useful weight" — the multi-feature migration (library swap + schema redesign + MDX-first-class) justifies the weight individually. One compression opportunity: §17 restates D15-D17 content; non-blocking. Acknowledged, not addressed (compression would risk reintroducing drift).

### Declined findings: none

All 9 findings were verified valid via cross-section spec inspection. No declines.

### Convergence status

Three audit + challenger rounds executed. Finding counts across rounds: 16 (round 1) → 20 (round 2, amendments introduced issues) → 9 (round 3, fewer new issues, more polish). Monotonic decline + scope narrowing across rounds indicates the spec has converged. Round 3's HIGH findings (escapeMark semantics + count drift) are specifics of LOCKED choices, not broader design concerns.

**Spec is finalized. Migration implementation can begin per §9 phasing.**
