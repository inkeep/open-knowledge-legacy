# Audit Findings (Final — post-amendment)

**Artifact:** `specs/2026-04-12-remark-prosemirror-migration/SPEC.md`
**Audit date:** 2026-04-12
**Total findings:** 12 (2 High, 5 Medium, 5 Low)

Scope: coherence-focused audit on cross-section consistency after the §17/§18/§19, D15-D19, R19-R22, and Q1-Q11/A1-A4 amendments. All seven focus areas exercised.

---

## High Severity

### [H1] Dangling reference: `OQ1` is cited but never defined

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §6 R19 (row), §10 D15 (row)
**Issue:** `OQ1` is referenced in R19 ("Tab/Shift-Tab accessibility parity (OQ1 — scope Tab binding to list context only)") and again in D15 ("Tab/Shift-Tab a11y mitigation on us (OQ1)"), but §11 Open Questions enumerates Q1-Q17 only — no `OQ*` prefix is defined anywhere in the spec. The reader cannot resolve what "OQ1" means.
**Current text:** R19: "Tab/Shift-Tab accessibility parity (OQ1 — scope Tab binding to list context only)"; D15: "Tab/Shift-Tab a11y mitigation on us (OQ1)"
**Evidence:** Grep of the full SPEC finds only these two hits for `OQ`. The §11 table rows are keyed `Q1`...`Q17`.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) add an `OQ1` row to §11 (e.g. `OQ1: Scoping Tab/Shift-Tab binding to list context without hijacking table/code-block Tab`, leave as OPEN), or (b) rename the inline references to an existing Q (none matches today) or introduce a separate "Implementation open questions" subsection. The Tab/Shift-Tab concern is a real open design item — recommend option (a).

---

### [H2] WikiLink PM type contradiction: "mark" vs "inline atom node" vs not-listed

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §6 R7; §17.1, §17.2
**Issue:** Three mutually inconsistent statements about WikiLink's PM type.
- R7 (line 98): "…remark-prosemirror handler (maps to existing **WikiLink PM mark**)."
- §17.1 (line 409): "Wiki-link as **inline atom node** — `wiki-link.ts:63-65` is `inline: true, atom: true`" (which is node-spec language, not mark).
- §17.2 (line 415): inline nodes enumerated as `hardBreak`, `image`, `footnoteReference`, `jsxInline`, `mdxInlineExpression` — **wikiLink is absent** from both block and inline node lists, and does not appear under marks either.
**Evidence:** PM schema has disjoint node vs mark namespaces; a construct cannot be both. Current codebase NodeSpec is genuinely an inline atom node (`atom: true` is a NodeSpec flag, not a MarkSpec flag).
**Status:** INCOHERENT
**Suggested resolution:** (1) Fix R7 to say "maps to the inline atom `wikiLink` PM node" (not mark). (2) Add `wikiLink` (inline atom) to §17.2 inline-nodes enumeration and update the header count from "5 inline" to "6 inline" and total from "27 types" to "28 types". (3) Verify the handler tier in R6 Tier C refers to a node factory (`toPmNode`), not a mark factory.

---

## Medium Severity

### [M1] G1 claim "No more vendored patches" contradicted by R20/D18

**Category:** COHERENCE
**Source:** L1 (cross-finding)
**Location:** §2 Goals G1; §6 R20; §10 D18
**Issue:** G1 asserts: "Delete the bun patch on `@tiptap/markdown` vendor source. **No more vendored patches to re-verify on upstream bumps.**" R20 and D18 explicitly introduce a NEW vendored patch on `@handlewithcare/remark-prosemirror@0.1.5` (PR #3). The second sentence of G1 is now false.
**Current text:** G1: "Delete the bun patch on `@tiptap/markdown` vendor source. No more vendored patches to re-verify on upstream bumps."
**Status:** INCOHERENT
**Suggested resolution:** Narrow the G1 phrasing to the specific patch, e.g.: "Delete the bun patch on `@tiptap/markdown` vendor source." — drop the "no more vendored patches" absolute, or replace with "Remaining vendored patch (remark-prosemirror PR #3) is upstream-pending and cleanly removable once merged."

### [M2] Q11 still "Pre-flight probe target" — stale after probe completion

**Category:** COHERENCE
**Source:** L1, L2 (confidence-prose misalignment)
**Location:** §11 Q11
**Issue:** The header status line (line 3) says "pre-flight probe PASSED". §19.7 confirms "COMPLETED 2026-04-12". Q1-Q10 and Q14-Q17 are all marked **RESOLVED**. But Q11 ("Do our extensions use `markdownOptions: { indentsContent: true, htmlReopen: true }` config…") is still marked as an unresolved "Pre-flight probe target." Q12 ("What migration-specific test additions make sense?") and Q13 (CI plan) are similarly unmarked despite having effective answers inline.
**Current text:** Q11: "| T | P0 | Pre-flight probe target. |"
**Status:** STALE
**Suggested resolution:** Either resolve Q11 with evidence (the probe covered this — did it?) or move Q11 to Future Work / mark as NOT-RUN-BUT-DEFERRED. Same treatment for Q12/Q13 for consistency. The task brief implied "Q1-Q11" were updated; Q11 was missed.

### [M3] §19.6 contradicts R19's "nested NodeSpec" implication

**Category:** COHERENCE
**Source:** L1, L6 (stance consistency)
**Location:** §6 R19; §19.6
**Issue:** R19 specifies "Exposes `list` NodeSpec (…) + `listItem` NodeSpec (…)" — i.e. two separate NodeSpecs strongly implying a nested `list > listItem+` shape, matching mdast. §17.2 reinforces this: block nodes include both `list` and `listItem`. §19.6 then opens the nested-vs-flat decision: "R19 specifies a nested NodeSpec… the implementer has two paths… A: Use flat-list's flat schema verbatim… B: Define nested NodeSpec… The probe should prototype both and pick based on which produces cleaner handler code." This undermines the LOCKED status of D15 and introduces ambiguity about what §17.2's schema actually is.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) tighten §19.6 to "R19 specifies nested NodeSpec — this is LOCKED by D15/§17.2. Implementation note: flat-list's utilities (input rules, keymap, commands) still work against a nested NodeSpec wrapper — see [evidence]." Or (b) demote R19/§17.2 to describe the externally-visible schema and call out that the internal PM representation is an implementer decision. Recommend (a).

### [M4] Import-count mismatch: "26 files" vs "28 import sites"

**Category:** COHERENCE
**Source:** L1
**Location:** §6 R22; §12 A5; §18.5; evidence/call-site-inventory.md
**Issue:** R22 and §18.5 both say "26 files"; §12 A5 and evidence/call-site-inventory.md both say "28 import sites." The evidence file breaks down: server production (5) + browser production (3) + test harnesses (2) + test files (16) = 26 files. A file can have more than one import site. Numbers may both be accurate at different granularities, but no reader explanation is given and the A5 verification phrasing ("28 import sites" in A5 confirming R22 claim about 26 files) reads as a mismatch.
**Status:** INCOHERENT (presentation)
**Suggested resolution:** Harmonize to one granularity — use "28 import statements across 26 files" in A5, or clarify the evidence file's breakdown totals to 28 by listing re-exports separately.

### [M5] R11 + D5 redundant with R19/D15 — but D5 still marked LOCKED

**Category:** COHERENCE
**Source:** L1
**Location:** §6 R11; §10 D5, D15
**Issue:** D4 and D14 are explicitly marked "Superseded by D15-D17" in the decision log. D5 ("Delete ListItemFidelity") stays LOCKED independently — but R11 and §18.2 now attribute the deletion to R19/D15 (unified list), making D5 functionally subsumed. Either keep D5 as LOCKED with a note ("specific subcase of D15 — retained for traceability") or mark D5 "Subsumed by D15" for parallelism with D4/D14. Today it reads like an orphaned pre-amendment decision.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Add a trailing note on D5: "Subsumed by D15 (unified list) — deletion now happens as part of list-extension replacement, not in isolation."

---

## Low Severity

### [L1] §17.2 header count assumes no wikiLink — breaks if H2 fix adds wikiLink inline

**Category:** COHERENCE
**Source:** L1
**Location:** §17.2 header
**Issue:** Downstream consequence of H2. The "17 blocks / 5 inline / 5 marks = 27 types" arithmetic will need to change if wikiLink is re-listed as an inline atom node (becomes 6 inline / 28 types). Flagged separately so the numeric claim stays synced with the structural fix.
**Status:** INCOHERENT (contingent on H2 resolution)
**Suggested resolution:** Update header counts when resolving H2.

### [L2] Tier A handler count and A2 "30+ handlers" — soft inconsistency

**Category:** COHERENCE
**Source:** L1
**Location:** §6 R6; §12 A2; §11 Q9
**Issue:** R6 enumerates Tier A (14) + Tier B (8) + Tier C (9) = 31 handlers. A2 says "all 30+ handlers registered cleanly." Q9 says "11/11 custom types register cleanly" — an overlapping subset (MDX + wikiLink + directives + definition + yaml). Q9 includes `yaml` in the 11 "register cleanly" list, but §19.1 explicitly states yaml should remain **ignored** (pre-ignored-correctly). "Register cleanly" vs "leave ignored" are different; Q9 phrasing conflates them.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Reword Q9 to "11/11 custom types resolve correctly (handlers where appropriate; explicit ignore for yaml/toml)".

### [L3] NG5 reads "All other extensions…are unchanged" — overlooks D16/D17 renames

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** §3 NG5
**Issue:** NG5 says "List extensions are replaced… All other extensions (heading, table, image, highlight, etc.) are unchanged — only their markdown dispatch methods move." But D16/D17 rename `BoldFidelity`→`StrongFidelity`, `ItalicFidelity`→`EmphasisFidelity`, `HorizontalRuleFidelity`→`ThematicBreakFidelity`. Those three extensions are NOT "unchanged" — they're renamed (class name, file name, schema name). The examples cited (heading, table, image) happen to be truly unchanged, but the broad claim is inaccurate.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Amend NG5 to: "All other extensions except the three renamed per D16/D17 (bold→strong, italic→emphasis, horizontalRule→thematicBreak) are unchanged — only their markdown dispatch methods move."

### [L4] §8 "Fidelity stats: 77/118 whitespace-only" — now misleading without context

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** §8 Current state; §7 M1; §19.7
**Issue:** §8 states the current-state baseline as "77/118 whitespace-only". §19.7 records the probe as 97/118 on the new stack. Both are true — but §8 says the number is "current state" meaning pre-migration baseline, while M1 sets the target "≥77/118". A reader who skims §8 and §7 may think the target is still 77/118 rather than the now-demonstrated 97/118 floor. Not load-bearing.
**Status:** INCOHERENT (presentation)
**Suggested resolution:** Add "(probe measured 97/118 on new stack — see §19.7)" to §8 so the comparison is visible in context.

### [L5] Tokenizer-comparison report link unresolved — flagged by Q15 but still linked

**Category:** COHERENCE
**Source:** L1
**Location:** §1 Links; §9 Alternatives
**Issue:** §1 links to `reports/tokenizer-comparison-micromark-vs-marked/REPORT.md` — confirmed not present in this worktree (grep). Note below the links block acknowledges this and tracks as Q15 (RESOLVED with plan). §9 also references the report. This is a known deferred-cleanup, not a newly-introduced bug. Would be worth closing before merge.
**Status:** STALE (tracked)
**Suggested resolution:** Execute the Q15 plan (merge report to main via tiny PR) before PR merge, or temporarily convert the link to the absolute sibling worktree path with an explanatory note.

---

## Confirmed Claims (summary)

Coherence lenses run and passed:
- **L2 confidence/prose:** probe status header, A1-A5 CONFIRMED labels, Q1-Q10/Q14-Q17 RESOLVED labels all align with evidence files and §19.7 probe summary.
- **L3 conditionality:** G4 acceptance criteria properly conditional on probe gate (R1); NG6-NG8 correctly use "NOT UNLESS" conditional framing; D12 directive scope correctly carved out of NG8.
- **L4 evidence fidelity:** Dependency-activity evidence consistently quoted across §10 D1, §14 Risks, §17.5, §18 — no drift on the "29 stars / 16.8k DL / 16 months dormant / bus factor 1" remark-prosemirror characterization.
- **L5 summary coherence:** §17.2 schema count (17 block + 5 inline + 5 marks = 27) arithmetically consistent once H2 is resolved; §18 change manifest faithfully reflects §6 requirements and §16 SCOPE list.
- **L6 stance:** spec consistently takes "greenfield + no-deferred-tech-debt" stance; D4/D14 superseded markers applied correctly.
- **L7 inline attribution:** all load-bearing stats (29 stars, 18.4k DL, 97/118, 695 fidelity tests, 384 commits, ~13× perf delta) carry inline source pointers to evidence files or probe reports.

Factual tracks:
- T3/T4 not rerun — dependency-activity evidence already dated 2026-04-12 and agrees with spec. PR #3 / issue counts on remark-prosemirror match the evidence file. No factual drift detected across sections.

## Unverifiable Claims

- mdx-js/mdx#2533 mitigation path (custom `mdast-util-mdx-expression` handler) — feasibility asserted but no probe evidence linked beyond the referenced `mdx-crdt-roundtrip-fidelity` report. §19.7 claims "Converges — I3 stability holds" but doesn't show the test input. Not a finding — flagged for implementer awareness.
- R19 Tab/Shift-Tab accessibility mitigation is deferred to "OQ1" (see H1) without a concrete handler-level plan. Will surface during R19 implementation.
