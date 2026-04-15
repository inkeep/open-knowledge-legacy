# Audit Findings

**Artifact:** reports/git-lifecycle-push-pull-merge-patterns/REPORT.md
**Audit date:** 2026-04-14
**Total findings:** 10 (3 high, 4 medium, 3 low)

**Audit scope:** Coherence lenses L1–L7 + factual spot-checks (T4/T5). 84 claims inventoried across 8 dimensions from CLAIMS.md; 83 CONFIRMED, 1 INFERRED. No T1/T2/T3 tracks run (3P report, no own-codebase claims).

---

## High Severity

### [H1] D2 Force Push Protection: count says "four" but table enumerates six strategies

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction), L5 (summary coherence)
**Location:** D2: Push/Pull Mechanics → Force Push Protection (line ~186); also exec summary bullet D2 (line ~58)
**Issue:** The prose introduces "Four distinct strategies:" but the table immediately below has six rows with six distinct strategy names. The four from the original sub-report (hidden-by-default, always-force-with-lease, explicit transient, contextual heuristics) were expanded during consolidation with JetBrains ("Warning dialog + protected branch lockout") and Zed ("No protection"), but the count was not updated.
**Current text:** "Four distinct strategies:"
**Evidence:** Sub-report `fanout/2026-04-14-initial/staging-committing-push-pull/REPORT.md` exec summary also says "four distinct strategies" — the consolidation added two rows without updating the count. Table at lines 188–195 has six rows.
**Status:** INCOHERENT
**Suggested resolution:** Change "Four" to "Six" (or restructure: the original four are *protection* strategies; "No protection" is arguably the absence of a strategy, and JetBrains could be grouped with hidden-by-default — but the table presents six, so the count should match the table).

---

### [H2] Cross-cutting Theme 2: wrong dimension cross-reference — "D7" should be "D1"

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** Cross-Cutting Themes → Theme 2: The Guided-Git Convergence → Evidence paragraph (line ~495)
**Issue:** The evidence paragraph says "D7 showed AI-powered commit messages are table-stakes." D7 covers History & Diff Visualization. AI commit message generation is covered in D1 (Staging & Commit UX). D7's only AI mention is GitKraken's AI/natural-language *search* (line 409), which is a different capability. The exec summary correctly attributes AI commit messages to D1 (line 57).
**Current text:** "D7 showed AI-powered commit messages are table-stakes."
**Evidence:** D1 section lines 114–123 cover AI commit message generation. D7 section lines 386–413 cover history/diff/blame/search — AI commit messages are not mentioned.
**Status:** INCOHERENT
**Suggested resolution:** Change "D7" to "D1" in the evidence paragraph.

---

### [H3] D4 Branch-from-issue: self-contradictory count — says "two tools" but only one does it

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** D4: Branch Management → Branch-From-Issue Integration (line ~278)
**Issue:** The opening sentence claims "Branch-from-issue exists in exactly two tools." The next sentence says "JetBrains is the **only** tool with a first-class issue-to-branch flow." The third sentence says "lazygit shows PR status badges but has **no issue-to-branch creation**." If lazygit doesn't create branches from issues, it shouldn't count toward "branch-from-issue exists." The count should be 1, or the category should be broadened to "issue integration" to include lazygit's PR badges.
**Current text:** "Branch-from-issue exists in exactly two tools."
**Evidence:** Evidence d4-branch-management.md confirms: "JetBrains: configurable template-based branch naming with 10+ issue trackers. lazygit: PR status badges, no issue-to-branch creation." Fanout sub-report line ~115: "Other tools either show PR/issue metadata in branch context (lazygit, GitKraken) or offer issue autocomplete in commit messages (GitHub Desktop) without bridging to branch creation."
**Status:** INCOHERENT
**Suggested resolution:** Either (a) change to "Branch-from-issue creation exists in exactly one tool (JetBrains). lazygit and GitKraken show PR/issue metadata but do not bridge to branch creation." or (b) broaden the category name to "issue-tracker integration" with a two-tier breakdown.

---

## Medium Severity

### [M1] Comparative matrix: JetBrains auto-fetch "On (20 min)" is unsupported by D2 detail or evidence

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), L5 (summary coherence)
**Location:** Comparative Matrices → D1–D2 table (line ~545)
**Issue:** The D1–D2 comparative matrix shows JetBrains auto-fetch as "On (20 min)". However, JetBrains is absent from the D2 Fetch Automation detail table (lines 172–183), which covers 7 tools but not JetBrains. No evidence file (d2-push-pull.md or fanout sub-reports) documents JetBrains' auto-fetch interval. The 20-minute figure may be conflated with Fork (listed at 20 min in the D2 table). The data point is orphaned — present in the summary matrix but unsupported by detail or evidence.
**Current text:** `| JetBrains | ... | On (20 min) |`
**Evidence:** D2 fetch table (lines 172–183) lists GitKraken (1 min), lazygit (1 min), Fork (20 min), GitHub Desktop (1 hour), VS Code (Off/3 min), Zed (Off), Magit (Off). JetBrains not listed. Evidence d2-push-pull.md has no JetBrains fetch finding.
**Status:** UNVERIFIABLE
**Suggested resolution:** Either (a) verify JetBrains auto-fetch interval from source/docs and add it to the D2 detail table + evidence, or (b) mark the cell as "Not documented" in the comparative matrix (consistent with GitKraken's force-push cell treatment).

---

### [M2] CC2 (guided-git convergence) is INFERRED but stated declaratively in prose

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** Cross-Cutting Themes → Theme 2 (line ~492); CLAIMS.md CC2 (line ~134)
**Issue:** CLAIMS.md labels CC2 as the only INFERRED cross-cutting claim (1 of 6). But the report prose states the convergence thesis declaratively — "Developer IDEs are converging on a common capability set" — without hedging. A claim labeled INFERRED should use conditional language ("appear to be converging," "evidence suggests convergence").
**Current text:** "Developer IDEs are converging on a common capability set: file/hunk/line staging, inline commit box with AI generation, merge/sync buttons with force-push protection, and 3-way merge editors."
**Evidence:** CLAIMS.md line ~134: `| CC2 | Developer IDEs are converging on a common capability set; differentiation shifted to discovery UX | INFERRED | D1, D3, D7 |`
**Status:** INCOHERENT
**Suggested resolution:** Either (a) add hedging language ("The evidence across dimensions suggests developer IDEs are converging...") or (b) upgrade to CONFIRMED in CLAIMS.md if the evidence is sufficient (the D1/D3 findings do individually confirm each capability's near-universality).

---

### [M3] Cross-cutting "Implication:" paragraphs break the declared factual stance

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** Cross-Cutting Themes 1, 2, and 3 — "Implication:" paragraphs (lines ~489, ~497, ~504)
**Issue:** The report declares "Factual — observations and patterns only. No recommendations." (line 82). Three "Implication:" paragraphs cross into prescriptive territory:
- Theme 1: "Tools that unify these safety nets...provide more predictable behavior than tools with per-operation safety nets" — comparative evaluation.
- Theme 2: "For teams building git UX in the guided-git band, the capability checklist is largely settled. The remaining competitive surface is..." — prescriptive guidance for builders.
- Theme 3: "This scales better to git's combinatorial option space" — evaluative comparison.
These are mild departures — they read as analysis rather than recommendation — but they cross the line from "what is" to "what is better/what teams should focus on."
**Current text:** See quotes above.
**Evidence:** Report rubric line 82: "**Stance:** Factual — observations and patterns only. No recommendations."
**Status:** INCOHERENT
**Suggested resolution:** Either (a) relabel the "Implication:" paragraphs as "**Observation:**" and reframe as factual pattern descriptions (e.g., "The data shows higher variance in per-operation safety nets than unified mechanisms"), or (b) update the stance declaration to "Factual with analytical observations" to match the actual prose.

---

### [M4] "5 of 7 commercial editors" — denominator undefined

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** D1: Staging & Commit UX → Commit Message UX (line ~114); exec summary (line ~57); Theme 4 (line ~512)
**Issue:** The claim "5 of 7 commercial editors" appears three times but the 7 are never explicitly enumerated. The reader must infer: the 5 that ship AI are GitKraken, JetBrains, Cursor, Zed, VS Code (per the table at lines 117–123). The 2 that don't are presumably GitHub Desktop and Sourcetree (or Fork). But "commercial" is itself ambiguous — Zed is open-source; lazygit is open-source but not in the 7; VS Code is open-source. The sub-report uses "commercial/funded" (line ~54) which is more precise.
**Current text:** "AI commit message generation is table-stakes for commercial editors (5 of 7 ship it)"
**Evidence:** D1 AI table (lines 117–123) lists 5 editors. "Commercial editors" is not defined anywhere in the report. Sub-report uses "commercial/funded."
**Status:** INCOHERENT
**Suggested resolution:** Add an inline parenthetical defining the 7: "(GitKraken, JetBrains, Cursor, Zed, VS Code, GitHub Desktop, Sourcetree)" or use "commercial/funded" with a footnote.

---

## Low Severity

### [L1] D1 staging "12/12" denominator not explicitly defined

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** D1: Staging & Commit UX → Staging Granularity table (line ~93)
**Issue:** The staging table uses "12/12", "11/12", "10/12", "8/12" but the 12 tools in the D1 universe are never explicitly listed. The report frontmatter lists 15 subjects; the D1 sub-report surveyed 12 (VS Code, GitHub Desktop, lazygit, Magit, Zed, JetBrains, GitKraken, Fork, Sourcetree, Obsidian-Git, Fugitive, GitHub CLI — inferred from the "Notable absences" column). Different dimensions survey different tool sets, which is fine, but the per-dimension N should be stated.
**Current text:** "Stage-all | Universal (12/12)"
**Evidence:** Sub-report `fanout/2026-04-14-initial/staging-committing-push-pull/REPORT.md` surveys 12 tools in its title/frontmatter.
**Status:** INCOHERENT
**Suggested resolution:** Add a brief note before the table: "Across the 12 tools surveyed for D1 (VS Code, GitHub Desktop, lazygit, Magit, Zed, JetBrains, GitKraken, Fork, Sourcetree, Obsidian-Git, Fugitive, GitHub CLI):"

---

### [L2] "Magit gates 28 destructive actions" — specific number without inline source

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** D6: Error Handling & Recovery → Safety Nets (line ~360)
**Issue:** The number 28 is stated as fact but not cited. It presumably comes from counting entries in `magit-confirm` but no evidence file documents this count. If the number changes across Magit versions, the claim silently stales.
**Current text:** "Magit gates 28 destructive actions via `magit-confirm`"
**Evidence:** Not cited in d6-error-recovery.md evidence file.
**Status:** UNVERIFIABLE
**Suggested resolution:** Either verify and add source (e.g., "28 actions as of Magit v4.x, per `magit-confirm` defcustom") or soften to "Magit gates dozens of destructive actions."

---

### [L3] "VS Code alone has 50+ git settings" — specific number without inline source

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** Cross-Cutting Themes → Theme 3 (line ~503)
**Issue:** "50+" is stated without citation. The number is plausible (VS Code has extensive git configuration) but not anchored to a specific measurement.
**Current text:** "VS Code alone has 50+ git settings."
**Evidence:** Not cited in any evidence file.
**Status:** UNVERIFIABLE
**Suggested resolution:** Either verify by counting `git.*` settings in VS Code's `configuration.json` and cite the version, or soften to "VS Code has dozens of git settings."

---

## Confirmed Claims (summary)

**Factual spot-checks (T4/T5):**
- VS Code Source Control Graph in v1.93 (Aug 2024) — **CONFIRMED** via [VS Code release notes](https://code.visualstudio.com/updates/v1_93)
- GitHub OAuth `gho_` tokens don't expire by default — **CONFIRMED** via [GitHub token docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation) (auto-revoke after 1 year of non-use is different from expiration)

**Coherence (L1-L7) — clean passes:**
- L1: Executive summary findings match detail sections (except H1, H2, H3)
- L3: Version/config conditionality generally well-handled; Obsidian-Git versions cited, Zed issue linked
- L4: Evidence files faithfully support synthesis claims (spot-checked D1, D2, D5, D8 pivotal findings)
- L6: Stance is consistently factual in D1–D8 detail sections (deviation only in cross-cutting themes)
- Non-goals: All five listed non-goals (clone, OAuth-at-clone, CRDT, git-lib, AI-worktree) correctly absent from the report
- 3P framing: No 1P/Open Knowledge content appears anywhere in the report

**Claims inventory (CLAIMS.md):**
- 84 total claims across D1–D8 + cross-cutting
- 83 CONFIRMED, 1 INFERRED (CC2)
- All CONFIRMED claims use declarative prose — appropriate
- The single INFERRED claim (CC2) should use hedged prose — see M2

## Unverifiable Claims

| Claim | Location | What was checked | Why unverifiable |
|-------|----------|-----------------|-----------------|
| "Magit gates 28 destructive actions" | D6 line ~360 | Evidence d6-error-recovery.md, fanout evidence | Number not cited in any evidence file |
| "VS Code alone has 50+ git settings" | Theme 3 line ~503 | Evidence files, fanout reports | Number not cited; no settings count in evidence |
| JetBrains auto-fetch "On (20 min)" | Matrix line ~545 | D2 detail table, evidence d2-push-pull.md, fanout evidence | JetBrains absent from D2 fetch table; 20 min may be Fork |

---

## Resolution (2026-04-14, applied by parent via /assess-findings)

All 10 findings classified as VALID (adversarial investigation confirmed each premise). Minor scope correction: H1's claim that the exec summary also carries the "four strategies" count was incorrect — only the D2 section does. All fixes applied.

| # | Severity | Resolution |
|---|----------|------------|
| H1 | High | "Four distinct strategies:" → "Six distinct strategies span the spectrum..." in D2 section |
| H2 | High | "D7 showed AI-powered commit messages" → "D1 also showed AI-powered commit messages" in Theme 2 |
| H3 | High | Rewrote D4 Branch-from-issue paragraph: "exactly one tool (JetBrains)...lazygit and GitKraken display metadata but do not bridge to branch creation" |
| M1 | Medium | Comparative matrix JetBrains auto-fetch "On (20 min)" → "Configurable (not documented)" — parity with GitKraken's force-push cell treatment |
| M2 | Medium | Theme 2 intro: "are converging" → "appear to be converging"; added inline INFERRED caveat to Observation paragraph |
| M3 | Medium | Relabeled Theme 1 + Theme 2 "Implication:" paragraphs as "Observation:" and reframed Theme 2 from prescriptive ("For teams building...") to factual ("the high-variance surfaces observed across dimensions are..."); softened Theme 3 "scales better" → descriptive comparison |
| M4 | Medium | Exec summary D1 + Theme 4 D1: replaced "5 of 7 commercial editors" with enumeration (VS Code, JetBrains, Cursor, Zed, GitKraken ship; GitHub Desktop, Sourcetree do not) |
| L1 | Low | Added explicit enumeration of 12 D1 tools before staging table |
| L2 | Low | "28 destructive actions" → "dozens of destructive actions" + inline citation to `magit-no-confirm` defcustom |
| L3 | Low | "VS Code alone has 50+ git settings" → "exposes dozens of `git.*` settings" + inline citation to VS Code docs |

All fixes are surgical edits preserving substance while resolving factual/coherence/sourcing issues. No re-research required.
