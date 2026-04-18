# Design Challenge Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/docs-post-ship-polish/specs/2026-04-16-post-ship-docs-polish/SPEC.md`
**Challenge date:** 2026-04-16
**Total findings:** 8 (2 High, 4 Medium, 2 Low)

---

## High Severity

### [H] Finding 1: The weekly.yml edit (R5) propagates a half-truth — `turbo run test:fidelity` does not actually run I11 at elevated stress

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — CI-facing engineer)
**Location:** SPEC.md §4 R5, §5.1 edit 5, weekly.yml:29
**Issue:** The spec asks the reader to replace weekly.yml:29 from "10 active invariants (I1-I10)" to "11 active invariants (I1-I11)". But the job's actual action (line 49) is `bunx turbo run test:fidelity`. That turbo task's input set (`turbo.json:67-74`) is `tests/fidelity/**/*.ts` + app-scoped sources. The shipped I11 test lives at `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` — outside `tests/fidelity/`. So the weekly "elevated-fidelity" job, as currently wired, does NOT exercise I11 at `STRESS_FIDELITY=1`'s 10K-run bump. I11's own env guard (`autolink-void-html-guard.precision.test.ts:51-52`) is live, but the turbo task never reaches the file.

Updating the comment to claim "All 11 active invariants run at elevated sample depth" therefore ships a false statement. A skeptical reviewer of this PR — or the next person debugging an I11 regression who checks "did weekly catch it?" — finds the comment disagrees with the runner behavior.

**Current design:** "`11 active invariants (I1-I11) plus the 6 new US-014 PBTs run at elevated sample depth`" (per the proposed edit at weekly.yml:27-30).
**Alternative:** One of (a) change weekly.yml to also invoke `turbo run test` (or `bun test packages/core/src/markdown/autolink-void-html-guard.precision.test.ts`) with `STRESS_FIDELITY=1` so the claim holds; (b) phrase the comment to match reality — "All I1-I10 + 6 handler PBTs run at elevated sample depth via `test:fidelity`; I11 lives in `packages/core/src/markdown/` and runs at default 1K (no elevated sampling job)"; (c) add I11's test file path to `test:fidelity`'s turbo inputs AND add a `test:fidelity:i11` companion script, then keep the 11-invariant claim.
**Trade-off:** Option (a) is a 1-line workflow change with real coverage benefit. Option (b) is honest but silently accepts that the I11 file's `STRESS_FIDELITY` branch is dead code in CI. Option (c) is the precedent-consistent fix (one stress job covers all named invariants) but expands scope beyond "docs-only". The spec's NG3 forecloses options (a) and (c) by asserting "NEVER in this spec — changes to test or source code" — without interrogating whether CI-workflow edits count.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D9 ("No changes to `turbo.json`") jointly with NG3. The weekly comment edit either needs to be honest about I11's actual coverage gap (option b) or paired with the turbo/workflow edit that makes the claim true (option a). Shipping a newly-misleading comment fails the spec's own G1 ("accurate I11 definition").

---

### [H] Finding 2: R9 acceptance criterion contradicts the spec's own §5.1 edit plan

**Category:** COHERENCE
**Source:** DC3 (Framing validity — internal consistency)
**Location:** SPEC.md §4 R9 (line 78), §5.1 edits 1 + 4, AGENTS.md:530 + :778 (as currently edited)
**Issue:** §4 R9 says: *"Grep for `I1-I10|I1–I10` shows zero hits in AGENTS.md."* But §5.1 edit 1 deliberately retains "I1-I10" as a location descriptor at line 530 ("`packages/app/tests/fidelity/` (I1-I10 + handler PBTs); … (I11)") and edit 4 retains "I1-I10" in the footnote at line 778 ("PBT invariants I1-I10 live in `packages/app/tests/fidelity/invariant-i{1..10}.test.ts`."). Verified by grep — current AGENTS.md has exactly 2 `I1-I10` hits at the expected lines.

The R9 criterion and the §5.1 design therefore contradict each other. Either:
- R9 is wrong — "I1-I10" is the correct way to name the first ten invariants as a collective when they're co-located, and only the *claim* "I1-I10 active, I11 pending" needed to change; or
- §5.1 is wrong — the split-location text should be rewritten to avoid the "I1-I10" token.

The former is the right reading; the latter would make the location split less legible. But the spec claims it will pass R9, and it doesn't.

**Current design:** "R9: Grep for `I1-I10|I1–I10` shows zero hits in AGENTS.md."
**Alternative:** Rewrite R9 as "No line in AGENTS.md asserts `I1-I10 active` or `I11 pending` — the two remaining `I1-I10` references are location descriptors that explicitly complement `I11`'s separate location." Or equivalent: "Grep for `I1-I10 active` / `I11 pending` returns zero hits; remaining `I1-I10` references are location-scoped."
**Trade-off:** Rewriting R9 is trivial; leaving it makes the spec fail its own acceptance gate at merge time and degrades trust in §4's criteria.
**Status:** CHALLENGED
**Suggested resolution:** Fix R9 before the PR lands. This is not a scope expansion — it's a misaligned acceptance criterion. Also fix M2 in §6, which claims "Zero matches" against the same grep.

---

## Medium Severity

### [M] Finding 3: D2 rejection of preempting rawMdxFallback byte-identity overweights the collision risk; I8/I9/I10 do NOT cover byte-identity of the fallback serializer

**Category:** DESIGN
**Source:** DC1 (Simpler alternative — tighter coverage now)
**Location:** SPEC.md §2 NG2, §9 D2, §12 FW-1
**Issue:** NG2 claims *"Current coverage (I8/I9/I10 crash resistance) exercises rawMdxFallback activation already; only a narrow byte-identity regression in the rawMdxFallback serialization handler would slip through."* The first clause is half-right — `packages/app/tests/fidelity/crash-class-coverage.test.ts:18-50` asserts `types.includes('rawMdxFallback')` (activation shape), but makes no byte-identity assertion on `serialize(parse(input)) === input`. I8 (crash resistance: `parse()` doesn't throw), I9 (guard completeness: `protectFromMdx` leaves no unmatched `<`), I10 (structural crash resistance: nested/truncated constructs parse without error) collectively prove the pipeline *won't crash* on malformed MDX; none prove the fallback's **serialization** reproduces the original bytes.

A refactor that changed `rawMdxFallback`'s PM→mdast handler to, say, HTML-encode `<` or strip trailing newlines would pass I8/I9/I10 and the crash-class probe. So "only a narrow byte-identity regression would slip through" is accurate — but that's a real regression class, unrelated to crash coverage. The spec's framing conflates "exists" with "byte-preserved."

The rejection in D2 then hinges on (i) fixture-set collision with component-blocks-v2's planned I14 and (ii) effort duplication. The fixture-set collision is asserted without evidence; component-blocks-v2 SPEC.md:250 does claim "20 fixtures" but doesn't pin their paths. An I-numbered test we author now at `packages/app/tests/fidelity/rawmdx-fallback-byte-identity.test.ts` using a small starter fixture set (say, 5 of the 26 crash-taxonomy entries) is not a blocker for their 20-fixture I14 — they extend ours or renumber, either is trivial.

**Current design:** "Defer rawMdxFallback byte-identity test. Re-examine if component-blocks-v2 stalls > 2 weeks OR if a byte-identity regression surfaces."
**Alternative:** Ship a starter byte-identity test now at `packages/app/tests/fidelity/invariant-i11b.test.ts` (or `-starter-`) with 5 fixtures, marked "Tier 1 of I14 per component-blocks-v2 SPEC §250 — extend to 20 when that spec lands." Locks the invariant; component-blocks-v2 upgrades in place.
**Trade-off:** +20 min of authoring effort now; small chance of a renumber churn when component-blocks-v2 lands; permanent regression coverage on a class the spec explicitly acknowledges would slip. NG3's "no test changes" argument is a self-imposed constraint, not a technical one.
**Status:** CHALLENGED
**Suggested resolution:** Either (a) accept D2 with the precise coverage gap named — "I8-I10 do not cover byte-identity of the rawMdxFallback serializer; FW-1 addresses it"; or (b) add a minimal starter test in this PR with a comment marking component-blocks-v2 as the owner of the full 20-fixture I14.

---

### [M] Finding 4: D4 (don't amend sister spec's §NG4 stale line) leaves a known-wrong assertion in a shipped artifact for future readers — "live doc carries the correction" is weaker than it looks

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — agent reading the sister spec for context)
**Location:** SPEC.md §2 NG4, §9 D4, sister SPEC.md:61
**Issue:** Sister spec line 61 currently asserts *"I11 invariant test (rawMdxFallback coverage). Introduced by tolerant parsing spec; this spec lands in parallel."* That claim is wrong on two dimensions — I11's semantic is R23 guard precision (not rawMdxFallback coverage), and the tolerant-parsing spec is unmerged so I11 didn't arrive via it. The spec's rejection rationale says *"Shipped specs are moment-in-time artifacts; correcting post-ship creates drift."*

The argument is partly valid — spec `meta/_changelog.md` is the right place for post-ship corrections, and line-level post-ship edits to shipped specs create confused archaeology. But the alternative ("correction lives in AGENTS.md and in this spec's `meta/_changelog.md`") only helps readers who (a) know to consult AGENTS.md, (b) know the sister spec has a stale line, and (c) know to look at this follow-up spec's changelog. An agent reading sister SPEC.md §3 cold has zero path to discover the line is wrong.

The cheaper, more durable alternative is a one-line addition — not edit — to sister SPEC.md §NG4: a trailing `[Corrected 2026-04-16: I11 ships as "R23 guard precision PBT" per specs/2026-04-16-post-ship-docs-polish/]`. This is a *marginal annotation*, not a retcon. The precedent for this exists in the same spec's `meta/_changelog.md` which already appends post-ship findings.

**Current design:** "Do NOT amend sister spec SPEC.md §NG4 stale line."
**Alternative:** Append a one-line marginal annotation to sister SPEC.md:61 pointing at this spec's correction. Leaves the moment-in-time content in place; adds a post-ship provenance breadcrumb.
**Trade-off:** Sister spec is shown as "still-accurate at time of ship + corrected in follow-up" (honest) vs. "frozen with known wrong statement; correction elsewhere" (spec hygiene but agent-hostile). The drift concern is real but the alternative doesn't introduce drift — it records that drift was discovered and corrected.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D4. The trade-off between purism (never touch shipped specs) and discoverability (future readers find the correction without tribal knowledge) favors discoverability given this is the *same author's immediate follow-up*, not a later reinterpretation.

---

### [M] Finding 5: D8 (skip changeset) relies on precedent PR #180 but PR #180 had no published-package surface; this PR touches AGENTS.md at repo root, which IS consumed by the published CLI's `init` command

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — consumer of published package)
**Location:** SPEC.md §9 D8, §11 A1, packages/cli + init scaffolding
**Issue:** D8 argues *"Consumer-visible surface: none."* The argument is: (a) `packages/core` is `"private": true`; (b) the test-directory READMEs aren't in any distributable; (c) AGENTS.md isn't in any package's `files` whitelist. Points (a) and (b) are correct. Point (c) is less obvious — AGENTS.md is the canonical instruction document the CLI's `init` command can copy or reference into a consumer repo's `.mcp.json` environment. Checking recent CLI behavior would confirm or deny this; the spec doesn't cite evidence that AGENTS.md is NOT surfaced to published-CLI consumers.

Secondary concern: the repo uses fixed-versioned changesets (.changeset/config.json), which the spec mentions in D8. Fixed versioning means any bump cascades. The "no changeset" decision is sound for a pure doc-doc change, but the *precedent* the spec cites (PR #180) was a docs-site change that plausibly never interacts with CLI consumers. AGENTS.md-at-root is a different surface class.

**Current design:** "Skip changeset entry. Repo precedent: .changeset/ entries correlate with code changes, not docs."
**Alternative:** Add a patch-level changeset entry for `@inkeep/open-knowledge` (the CLI) noting "docs: corrected I11 label in AGENTS.md — contributor + MCP-client instruction doc." This costs a 3-line `.md` file and one trivial bump. The reviewer-fallback already contemplated in D8 becomes the default.
**Trade-off:** Spec correctly notes the fallback is available if a reviewer objects. But the framing leaves the burden on the reviewer to notice and push back, when the cheap conservative option is to include the changeset and let the reviewer push back if they think it's noise.
**Status:** CHALLENGED (low conviction)
**Suggested resolution:** Verify whether the CLI's `init` command reads from / copies AGENTS.md (check `packages/cli/src/commands/init.ts`). If yes, promote the reviewer-fallback to the default. If no, D8 holds as written.

---

### [M] Finding 6: Spec is disproportionate — 300-line SPEC.md for a ~800-LOC docs-only PR where implementation preceded scoping

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** Entire SPEC.md (300 lines; spec task description claimed 260)
**Issue:** This is the meta-challenge the orchestrator invited explicitly. The spec retroactively scopes + gates work that was already written — 4 line edits to AGENTS.md, 1 line edit to weekly.yml, 2 README files. The SPEC.md carries 10 decision-log entries, 5 non-goals, 7 risks, 6 metrics, 10 requirements, 3 open questions, 5 assumptions, 5 future-work items.

Tests of proportionality:
- D1, D9, D10 are load-bearing as decisions exactly zero ways — they enumerate non-choices (single PR, no turbo changes, cross-worktree artifact isn't ours). D10 in particular describes a decision about a file that doesn't live in this worktree; classifying it as "LOCKED" is ceremony, not coordination.
- R8 ("`bun run check` stays green") and R10 ("Three commits") are process invariants, not scope-specific requirements.
- NG3/NG4 rule out entire categories in one breath; NG5 rules out a file relocation nobody proposed.
- The decision log's D3-D10 mostly restate what's in the non-goals with status labels.

The counter-argument the spec implicitly makes: "even docs-only changes on a post-ship polish deserve rigor so future agents see why the rejected paths were rejected." That's defensible — the Decision Log serves as discoverable rationale. But the spec skips the `/worldmodel` subagent (per meta/_changelog.md:15) on proportionality grounds, which is a tacit admission that full-rigor isn't warranted here. A 120-line spec with §1 + §4 + §9 (10 decisions) + §13 (agent constraints) would carry the same load-bearing signal at 40% the size.

**Current design:** Full-rigor SPEC.md (300 lines) with every template section populated.
**Alternative:** A slim spec — problem statement (10 lines), scope (5 lines), 4-5 material decisions (D2 defer I14, D4 don't amend, D6 README location, D7 real numbers, D8 changeset), agent constraints. Roughly 80-120 lines. The deliverables themselves are the main artifact.
**Trade-off:** Slim spec reads faster, gets future agents to decision rationale quicker, and matches work size. Full spec preserves template symmetry but dilutes signal. For post-ship polish in particular — a recurring pattern in this repo, per the sister spec's explicit "docs-update follow-up" bookmark — a slim template pattern is worth establishing.
**Status:** CHALLENGED
**Suggested resolution:** Consider whether "post-ship polish spec" should be a distinct artifact class with a lighter template. Not a blocker for this PR; a signal for the next one. If you prefer to ship as-is, at least acknowledge the disproportion in §9 explicitly — current rationale ("session-context-heavy approach") reads like defensive explanation rather than deliberate choice.

---

## Low Severity

### [L] Finding 7: NG1's "11 existing `data.source*` attrs" is itself a vague count the deferred doc would have to establish from scratch

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** SPEC.md §2 NG1, FW-2
**Issue:** NG1 claims *"fidelity-attrs contract document covering the 11 existing `data.source*` attrs"*. Grepping `position-slice.ts` finds 8 distinct attrs (`sourceDelimiter`, `sourceStyle`, `bulletMarker`, `listMarkerDelimiter`, `sourceFenceChar`, `sourceFenceLength`, `sourceRaw`, `escapedChars`). The remaining attrs presumably live on PM node definitions in `*-fidelity.ts` extensions (9 files). The "11" count feels estimated rather than enumerated.

This isn't load-bearing for the deferral decision — the blast radius of component-blocks-v2 adding 5 more is the real cost driver. But if a future reviewer of this spec asks "which 11 attrs?", the spec can't answer. An enumerated footnote (or a pointer to the grep command that produces the count) would resolve it in one line.

**Current design:** "11 existing `data.source*` attrs."
**Alternative:** "approximately 8-12 distinct fidelity attrs distributed across position-slice.ts + *-fidelity.ts extensions" (or exact enumeration). The inexact count actually strengthens D3's "deferral is cheap" framing — enumeration costs time the deferred doc's authoring will cover.
**Trade-off:** 1-line edit. Low value; mentioned for completeness.
**Status:** CHALLENGED
**Suggested resolution:** Either enumerate (adds 1 line) or replace "11 existing" with "roughly a dozen."

---

### [L] Finding 8: §13 agent constraints list AGENTS.md edit locations as "3 edits at lines 530, 762, 776, 778 — 4 total edit locations" — off-by-one; the fix itself is trivial

**Category:** COHERENCE
**Source:** DC3 (internal consistency)
**Location:** SPEC.md §13 SCOPE first bullet
**Issue:** Phrase reads "3 edits at lines 530, 762, 776, 778 — 4 total edit locations". Four line numbers given; "3 edits" contradicts "4 total edit locations" in the same sentence. §5.1 explicitly lists 5 edits (4 in AGENTS.md + 1 in weekly.yml). §3 In-scope lists 4 AGENTS.md locations.
**Current design:** "AGENTS.md (3 edits at lines 530, 762, 776, 778 — 4 total edit locations)."
**Alternative:** "AGENTS.md (4 edits at lines 530, 762, 776, 778)."
**Trade-off:** 1-character fix.
**Status:** CHALLENGED
**Suggested resolution:** Edit to say "4 edits."

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative):**
- D6 (README location adjacent to code) held — the `fixtures/perf/README.md` precedent is cited and the alternatives (Fumadocs, spec evidence/) genuinely serve different audiences. Contributor-facing docs adjacent to contributor-facing code is the right pattern.
- D7 (real numbers in worked examples) is unambiguously correct — the evidence file's math-check confirms the baseline values round-trip.
- D5 (keep I11 test colocated with R23 guard) is technically correct and defended — colocation beats symmetry.

**DC2 (Stakeholder gap):**
- R7 (perf framework `wholeDocMax: 0` pin) covers the correctness-absolute case; gate contract is well-specified.
- Parse-health README's CJS/ESM bridge design note addresses the cross-module instrumentation gotcha that would otherwise trip a future contributor.
- The "runner-class mismatch is a warning, not an error" clarification in the perf README pre-empts an SRE frustration.

**DC3 (Framing validity):**
- The SCR (Situation/Complication/Resolution) holds — the three docs gaps are independently real and coincidentally shippable together. Not manufactured urgency.
- G4 ("cross-spec coordination inherits accurate docs") is the actual load-bearing goal; G1-G3 are sub-goals that feed it. The intersection is genuine.
- D1 (single PR, 3 commits) is defensible — all three items are conceptually "post-ship polish for one spec" and co-reviewed.
