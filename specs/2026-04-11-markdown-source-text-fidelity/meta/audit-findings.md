# Audit Findings

**Artifact:** specs/2026-04-11-markdown-source-text-fidelity/SPEC.md
**Audit date:** 2026-04-11
**Total findings:** 11 (2 high, 5 medium, 4 low)

---

## High Severity

### [H] Finding 1: LOC estimate ambiguity — production vs test split is irreconcilable

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction), L7 (source attribution)
**Location:** §9 Proposed solution (line 166), Phase 1–4 boxes (lines 124–163)
**Issue:** The SPEC claims "~945 LOC production + ~1400 LOC test code" but the phase totals (475 + 275 + 95 + 100 = 945) sum to 945 INCLUDING both production and test code. Phase 1 (~475 LOC) explicitly bundles production patches AND test infrastructure (fast-check + bun:test PBT infra + arbitraries.ts + commonmark.json import + GFM extraction + 12 P0 test cases + tightened conversion-fidelity assertion). Phase 4 (~100 LOC) is entirely test code ("V1 Playwright paste baseline tests" + "V2 integration test"). This means either: (a) "~945 LOC production" is inflated — it includes test LOC, or (b) the phase totals are production-only and the ~1400 test LOC sits outside the phases entirely (unitemized).
**Current text:** "Total: ~945 LOC production + ~1400 LOC test code + corpus imports + docs."
**Evidence:** Phase 1 includes 4 production items (monkey-patch, escape handler, re-escape, frontmatter regex ≈ 100–150 LOC per I1 §3) and 4 test items (PBT infra, corpus imports, 12 P0 cases, tightened assertion). Phase 4 is entirely test. If Phase 1 production is ~150 LOC, actual production total is ~150 + 275 + 95 = ~520, not 945. The ~1400 test LOC claim has no itemized breakdown anywhere in the spec or evidence.
**Status:** INCOHERENT
**Suggested resolution:** Add a production/test breakdown table for Phase 1. Itemize what constitutes the ~1400 LOC test estimate. Correct the §9 total to distinguish phase-level estimates from the prod/test split.

---

### [H] Finding 2: Path matrix arithmetic — 77 TRIVIAL claimed, 82 actual in I6 matrix

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §1 Problem statement (line 18), evidence/i6-path-matrix.md (line 50)
**Issue:** SPEC §1 states "the path matrix collapses to 77 TRIVIAL + 14 N/A + 8 VARIANT." I6 evidence text (line 50) states "77 TRIVIAL, 8 VARIANT, 9 N/A (5 not shown)." But counting the actual I6 matrix (lines 36–48): 82 T + 8 V + 9 N/A = 99. The matrix shows 82 TRIVIAL cells, not 77. The "5 not shown" parenthetical is unexplained and doesn't reconcile — all 11 IN rows are visible in the matrix.
**Current text:** "the path matrix collapses to 77 TRIVIAL + 14 N/A + 8 VARIANT (only 2 test shapes needed)"
**Evidence:** Manual count of I6 matrix: IN1 (9T), IN2 (9T), IN3 (4V+5T), IN4 (9N/A), IN5 (2V+7T), IN6 (9T), IN7 (9T), IN8 (9T), IN9 (2V+7T), IN10 (9T), IN11 (9T). T total = 82, V total = 8, N/A total = 9. Grand = 99. The 5-cell discrepancy (82−77=5 for T, 14−9=5 for N/A) is consistent — 5 cells are counted as T in the matrix but as N/A in the text. The I6 text contradicts its own matrix.
**Status:** INCOHERENT
**Suggested resolution:** Correct both SPEC §1 and I6 text to "82 TRIVIAL + 9 N/A + 8 VARIANT." The core conclusion (8 VARIANT → 2 test shapes) is unaffected.

---

## Medium Severity

### [M] Finding 3: Phase 4 diagram includes "Frontmatter regex fixes (actually in Phase 1)"

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §9 Phase 4 box (line 157)
**Issue:** Phase 4's architecture box lists "Frontmatter regex fixes (actually in Phase 1)" with a self-correcting parenthetical. R3 and D3 both assign frontmatter fixes to Phase 1. The Phase 4 mention is vestigial from an earlier draft and creates confusion about phase ownership.
**Current text:** "Phase 4 — Cross-path test hardening (~100 LOC) • V1 Playwright paste baseline tests • V2 integration: external-write Y.Text convergence • Frontmatter regex fixes (actually in Phase 1)"
**Evidence:** R3 says "Frontmatter CRLF + empty-block regex fixes in Phase 1." D3 says "Frontmatter CRLF + empty-block regex fixes in Phase 1." Both are unambiguous.
**Status:** INCOHERENT
**Suggested resolution:** Remove the "Frontmatter regex fixes (actually in Phase 1)" bullet from the Phase 4 box.

---

### [M] Finding 4: D10 cites untraceable "PR #38 precedent"

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** §10 Decision Log, D10 (line 194)
**Issue:** D10 (single mega-PR decision) lists evidence as "D4, PR #38 precedent, /analyze." PR #38 is not documented in any evidence file and not described in the spec body. A reader cannot assess the precedent's relevance or determine what PR #38 established. Additionally, citing D4 (another decision) as evidence for D10 is a circular dependency reference — a decision is not evidence for another decision, it's a dependency.
**Current text:** "D10 | Single mega-PR with 5 atomic commits | P | LOCKED | No | D4, PR #38 precedent, /analyze"
**Evidence:** Grep for "PR #38" in evidence/ returns zero matches. PR #38 is mentioned nowhere else in the spec beyond D10's evidence column.
**Status:** UNVERIFIABLE
**Suggested resolution:** Either add a one-line description of PR #38's precedent in the spec body (what it established, why it's relevant), or replace the citation with the actual reasoning. Change "D4" to "D4 dependency" to clarify it's a decision chain, not evidence.

---

### [M] Finding 5: Tight/loose list preservation — missing from requirements AND non-goals

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction — gap between evidence and requirements)
**Location:** §6 Requirements (R1–R15), §3 Non-goals (NG1–NG9), evidence/i1-library-reuse-survey.md
**Issue:** I1 evidence explicitly includes "Preserves tight/loose?" as a selection criterion in the decision matrix (line 84) and describes the implementation: "preserve tight/loose via `token.loose` (~50 LOC)" (line 41). The decision matrix confirms the chosen approach preserves tight/loose. However, no requirement (R1–R15) addresses tight/loose preservation, and no non-goal (NG1–NG9) explicitly scopes it out. NG1 covers blank-line normalization between blocks, but tight/loose is a distinct list-item-level semantic concern — in CommonMark, tight lists render `<li>content` while loose lists render `<li><p>content</p></li>`. An implementer following the requirements table would not know whether to implement the ~50 LOC tight/loose preservation.
**Current text:** NG1: "[NEVER] Preserve exact blank-line count between blocks. ProseMirror schema limitation."
**Evidence:** I1 line 41: "(c) preserve tight/loose via `token.loose` (~50 LOC)." I1 decision matrix row 3: "Preserves tight/loose? | Yes (marked token.loose)." No corresponding R-item or NG-item exists.
**Status:** INCOHERENT
**Suggested resolution:** Either add an R-item for tight/loose preservation (with LOC estimate from I1) or add an explicit NG entry explaining whether tight/loose falls under NG1's blank-line normalization or is a distinct concern. If it's in scope, the Phase 1 or Phase 2 LOC estimates need adjustment (+50 LOC).

---

### [M] Finding 6: Investigation/invariant I-prefix naming collision

**Category:** COHERENCE
**Source:** L7 (inline source attribution ambiguity)
**Location:** §1, §6 R6, §10 Decision Log — throughout
**Issue:** "I1" through "I6" refer to investigation evidence files (i1-library-reuse-survey.md through i6-path-matrix.md). "I1" through "I7" also refer to fidelity invariants (invariant-i1.test.ts through invariant-i7.test.ts per I2 evidence). In the Decision Log, "I1, I2" (D1 evidence) = investigation files. In R6, "I1-I7" = invariant tests. In G1, "I2 invariant suite" = character preservation invariant. An implementer reading "verified by I2" cannot tell whether it refers to the PBT tooling investigation or the character-preservation invariant without parsing surrounding context.
**Current text:** R1: "Verified by I2 invariant test" (invariant). D1: "Evidence | I1, I2" (investigations). Both use bare "I" prefix.
**Evidence:** Evidence files: i1 through i6. Invariant definitions (I2 evidence lines 68–82): I1 (identity) through I7 (cross-path). The namespaces collide at I1–I6.
**Status:** INCOHERENT
**Suggested resolution:** Rename investigation evidence references to a distinct prefix. Options: "Inv-1" through "Inv-6", or "E1" through "E6" (for evidence), keeping "I1"–"I7" for invariants only. Update the Decision Log evidence column and all spec references.

---

### [M] Finding 7: `@tiptap/markdown` caret version — current-state risk not acknowledged

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 Current state, §14 Risks
**Issue:** R14 requires exact version pinning (`3.22.3`, no caret). Current `packages/app/package.json` uses `"^3.22.3"` (caret range). The SPEC's current-state analysis (§8) and risk table (§14) don't flag the risk that a fresh `bun install` before implementation could auto-upgrade to 3.23.x if a new minor version ships, potentially changing the `encodeTextForMarkdown` or `parseInlineTokens` surfaces. I5 evidence estimates 30% probability of `MarkdownManager.ts` changes in the next minor release.
**Current text:** §14 Risk row 1: "Option D monkey-patch breaks on @tiptap/markdown minor bump | Low" — but doesn't note the caret range makes this automatic.
**Evidence:** `packages/app/package.json` line 43: `"@tiptap/markdown": "^3.22.3"`. I5 §7 table: "v3.23/v3.24 refactors MarkdownManager.ts | Medium (30%)."
**Status:** STALE
**Suggested resolution:** Add to §8 or §14: "Current package.json uses caret range `^3.22.3`; a fresh install before implementation could pull a newer version. Pinning to exact (R14) should be the first implementation step, before any patches."

---

## Low Severity

### [L] Finding 8: F3/F4 shorthand references lack definition

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** evidence/i6-path-matrix.md (line 4), §3 NG8 (line 41)
**Issue:** "F3" and "F4" are used as finding references (e.g., "F3 proved Layer A ≡ B," "F4's ecosystem comparison") but are never formally defined. They point to conclusions in prior research reports (markdown-construct-fidelity-catalog and markdown-roundtrip-fidelity-tiptap) that don't use these labels. A reader following the citation trail cannot locate "F3" without knowing it maps to a specific conclusion in the catalog report.
**Current text:** I6 line 4: "Depends on: F3 (Layer A ≡ B for all 118 cases)"
**Evidence:** Prior reports use descriptive labels, not F-codes. The mapping is: F3 → construct-fidelity-catalog finding on Layer A/B equivalence; F4 → roundtrip-fidelity D2 ecosystem comparison. These mappings are inferrable but not stated.
**Status:** UNVERIFIABLE (trail incomplete, content confirmed)
**Suggested resolution:** Add a one-line mapping in §8 or an appendix: "F3 = Layer A ≡ B proof (reports/markdown-construct-fidelity-catalog/ §D4). F4 = Three-library ecosystem comparison (reports/markdown-roundtrip-fidelity-tiptap/ §D2)."

---

### [L] Finding 9: D6 uses "COMPLETE" resolution status outside defined taxonomy

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** §10 Decision Log, D6 (line 191)
**Issue:** D6 has resolution status "COMPLETE." The spec skill's taxonomy defines LOCKED, DIRECTED, and DELEGATED as resolution statuses. "COMPLETE" is a process status indicating the investigation finished, not a decision resolution. D6 is a process decision ("Wait for I4 re-dispatch") that's finished — the semantics are clear, but the label doesn't match the taxonomy.
**Current text:** "D6 | Wait for I4 re-dispatch (now complete) | Process | COMPLETE"
**Evidence:** Spec skill references/decision-protocol.md defines LOCKED/DIRECTED/DELEGATED.
**Status:** INCOHERENT
**Suggested resolution:** Either change to "LOCKED" (the investigation is done, the result is accepted) or add a note that process decisions use COMPLETE as a lifecycle status distinct from design resolution.

---

### [L] Finding 10: Evidence test script case #2 expected values likely incorrect

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** evidence/frontmatter-edge-cases.ts (lines 26–33), evidence/i3-paste-and-frontmatter.md case #2
**Issue:** The test script's case #2 (multi-line YAML literal block) sets `expectedFrontmatter: '---\ndescription: |\n  Line one\n  Line two\n  ---\n'`. However, the regex `/^---\n[\s\S]*?\n---\n?/` would NOT match the indented `  ---` (because `\n  ---` ≠ `\n---`) and would instead match through to the real closing `\n---\n`, producing a LONGER frontmatter string. The I3 evidence table correctly reports case #2 as PASS (the regex handles multi-line blocks correctly), but the test script's expected values contradict the regex's actual behavior. This suggests the test script was authored speculatively and never executed.
**Current text:** I3 table: "2 | Multi-line YAML literal block with `---` | **PASS**"
**Evidence:** Regex `/^---\n[\s\S]*?\n---\n?/` applied to input `---\ndescription: |\n  Line one\n  Line two\n  ---\n  Line three\n---\n# Body` would match `---\n...Line three\n---\n` (the full frontmatter), not truncate at `\n  ---\n`.
**Status:** INCOHERENT (evidence internal inconsistency)
**Suggested resolution:** Run the test script (`bun run evidence/frontmatter-edge-cases.ts`) to get actual results. Update case #2's expected values to match regex behavior. The I3 table verdict (PASS) is correct; only the script's expected values need correction.

---

### [L] Finding 11: SPEC §1 says "Ten paths" but I6 models 11 IN paths

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** §1 Problem statement (line 16), evidence/i6-path-matrix.md
**Issue:** §1 lists "Ten paths write to and read from this canonical form" followed by 10 items. I6 models 11 IN paths × 9 OUT paths = 99 cells. The discrepancy arises because I6 separates "plain text paste" (IN4) and "agent-undo" (IN8) as distinct IN paths, and treats "docs-site rendering" as an OUT path (OUTe) rather than an IN path. This is a presentation-level difference (I6's decomposition is more granular), not a substantive gap. The "ten paths" phrasing is a narrative summary, not a precise count.
**Current text:** "Ten paths write to and read from this canonical form"
**Evidence:** SPEC §1 lists 10 items (mixing IN and OUT). I6 matrix has 11 rows (IN paths only).
**Status:** INCOHERENT (minor)
**Suggested resolution:** Either change to "Multiple paths" or note "(decomposed into 11 IN × 9 OUT in the path matrix)."

---

## Confirmed Claims (summary)

### Codebase claims (T1)
- `encodeHtmlEntities` at `@tiptap/core/src/utilities/htmlEntities.ts` is exactly 26 LOC — **CONFIRMED**
- `encodeTextForMarkdown` calls `encodeHtmlEntities(text)` for non-code text — **CONFIRMED** (MarkdownManager.ts:910)
- `parseInlineTokens` in `MarkdownManager.ts` has no `escape` token handler — **CONFIRMED** (handler inventory verified: text, html, and extension-dispatched types only)
- Frontmatter regex in `packages/core/src/extensions/frontmatter.ts` is `/^---\n[\s\S]*?\n---\n?/` — **CONFIRMED** (exact match)
- No custom paste handler in codebase — **CONFIRMED** (zero grep hits for handlePaste, transformPastedHTML, clipboardTextParser in packages/)
- `conversion-fidelity.test.ts` uses `/\w{3,}/g` assertion — **CONFIRMED** (6 occurrences)
- `sharedExtensions` order sensitivity (JsxComponent → WikiLink → StarterKit) — **CONFIRMED** (documented in code comments at shared.ts:14–18)

### Prior research claims (T2/T5)
- 2/118 byte-identical, 77 whitespace-only, 39 material differences — **CONFIRMED** (exact match in construct-fidelity-catalog REPORT.md)
- `@tiptap/markdown@3.22.3` version in prior reports — **CONFIRMED** (mentioned 3 times in catalog report)
- Layer A ≡ Layer B on all 118 cases — **CONFIRMED** in prior research (construct-fidelity-catalog §D4)

### LOC estimates (partial)
- T2 items: 35+40+60+40+35+15+50 = 275 — **CONFIRMED** (matches Phase 2 and I4 summary)
- T3 items: 35+40+20 = 95 — **CONFIRMED** (matches Phase 3 and I4 summary)
- I4 summary total: ~370 = T2 (275) + T3 (95) — **CONFIRMED**

### Acceptance criteria (R1–R15)
- All 15 acceptance criteria are **verifiable** — each describes a testable outcome an implementer can write assertions for.

### D2/D8 cascade coherence
- D2 supersession by D8 is consistently reflected in NG6, Phase 4 description, Alternatives considered, and Future Work — **CONFIRMED coherent**

## Unverifiable Claims

- **PR #39 file scope** ("our edits touch none of his 22 files") — PR not accessible locally; cannot verify file list or current state
- **PR #38 precedent** (cited by D10) — not documented anywhere in evidence or spec body
- **~1400 LOC test code** — stated as total but never itemized; cannot reconstruct from phase or evidence data
