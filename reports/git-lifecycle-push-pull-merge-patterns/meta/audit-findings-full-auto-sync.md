# Audit Findings: Full-Auto Git Sync Prevalence

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/reports/git-lifecycle-push-pull-merge-patterns/REPORT.md
**Audit date:** 2026-04-15
**Scope:** New content added in most recent update pass:
  - Theme 9: Full-Auto Git Sync Prevalence (Cross-Cutting Themes section)
  - "Full-Auto Git Sync Prevalence" standalone section (between Non-Editor Sync Dynamics and Comparative Matrices)
  - Executive Summary bullet about full-auto sync prevalence
  - Limitations entries for "Full-Auto Sync Prevalence Gaps"
**Evidence files verified:**
  - evidence/d1-broader-editor-auto-sync-survey.md
  - evidence/d2-cms-git-auto-sync.md
  - evidence/d3-bot-ci-auto-commit-patterns.md
  - evidence/d4-why-full-auto-rare.md
  - evidence/d1-broader-editor-git-sync-survey.md (secondary set, referenced by section header)
  - evidence/d2-cms-git-auto-behavior.md (secondary set)
  - evidence/d3-bot-ci-git-patterns.md (secondary set)
  - evidence/d4-why-full-auto-is-rare.md (secondary set)
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H1] Full-Auto Git Sync Prevalence section header cites wrong evidence files

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity), L7 (Inline source attribution)
**Location:** "Full-Auto Git Sync Prevalence" section header (line ~1059)
**Issue:** The section header `**Evidence:**` line references four filenames that do not match either the Theme 9 evidence line or the References section. Theme 9 and the References section both consistently cite `d1-broader-editor-auto-sync-survey.md`, `d2-cms-git-auto-sync.md`, `d3-bot-ci-auto-commit-patterns.md`, `d4-why-full-auto-rare.md`. The section header instead cites `d1-broader-editor-git-sync-survey.md`, `d2-cms-git-auto-behavior.md`, `d3-bot-ci-git-patterns.md`, `d4-why-full-auto-is-rare.md`.

Both sets of files exist on disk and contain distinct content — they are not duplicates. The section header is pointing to a different (but related) set of evidence files than the ones the References section credits for this update pass. This creates an ambiguous provenance trail: a reader following the section header citation is reading different source material than a reader following the References section.

**Current text (section header):**
`**Evidence:** [evidence/d1-broader-editor-git-sync-survey.md](evidence/d1-broader-editor-git-sync-survey.md), [evidence/d2-cms-git-auto-behavior.md](evidence/d2-cms-git-auto-behavior.md), [evidence/d3-bot-ci-git-patterns.md](evidence/d3-bot-ci-git-patterns.md), [evidence/d4-why-full-auto-is-rare.md](evidence/d4-why-full-auto-is-rare.md)`

**Current text (Theme 9 and References section):**
`[evidence/d1-broader-editor-auto-sync-survey.md]`, `[evidence/d2-cms-git-auto-sync.md]`, `[evidence/d3-bot-ci-auto-commit-patterns.md]`, `[evidence/d4-why-full-auto-rare.md]`

**Evidence:** Confirmed by `ls` — both file sets exist. The secondary set (`d1-broader-editor-git-sync-survey.md`, `d2-cms-git-auto-behavior.md`, `d3-bot-ci-git-patterns.md`, `d4-why-full-auto-is-rare.md`) is a distinct set of files with different titles and source URL lists.
**Status:** INCOHERENT
**Suggested resolution:** Decide which evidence set is canonical for this section. The References section and Theme 9 agree on the `-auto-sync-survey` / `-auto-sync` / `-auto-commit-patterns` / `-rare` names — those names appear to be the authoritative set. Update the section header to match, or consolidate the two file sets into one and update all three citation points.

---

### [H2] Wiki.js classified as "full-auto by default" when git storage is not the default backend

**Category:** COHERENCE / FACTUAL
**Source:** L3 (Missing conditionality), L4 (Evidence-synthesis fidelity)
**Location:** Theme 9 summary paragraph (line ~919), Executive Summary bullet (line ~129), Distribution Table (line ~1068)
**Issue:** The Theme 9 paragraph states: "full-auto bidirectional git sync ... is implemented by exactly 4 tools." Wiki.js is listed among those 4 as applying "by default without user action." However, the evidence file (d1-broader-editor-auto-sync-survey.md) explicitly states: "git storage must be explicitly configured — PostgreSQL is the default backend, not git. Full-auto is opt-in at the storage-module level."

The distribution table correctly qualifies this with "Yes (when git storage enabled)" in the Full-auto default? column, and the Executive Summary bullet does not include any qualifier. The Theme 9 summary paragraph similarly omits the qualifier, implying it applies by default with no configuration.

The claim "exactly 4 tools implement full-auto by default without user action" is undermined if Wiki.js requires explicit configuration to reach full-auto behavior. Depending on how "by default" is interpreted, the number might be 3 (if "default" means zero-configuration out-of-the-box) or 4 (if "default" means "automatic behavior once the relevant feature is enabled").

**Current text (Theme 9):**
"full-auto bidirectional git sync (auto-commit AND auto-pull AND auto-push, all by default without user action) is implemented by exactly 4 tools: ... Wiki.js (server, 5-minute timer when git storage enabled)"

The Theme 9 paragraph actually does include the "when git storage enabled" qualifier inline — but the framing "by default without user action" immediately before it creates a contradiction with that qualifier.

**Evidence:** d1-broader-editor-auto-sync-survey.md Finding for Wiki.js (Confidence: CONFIRMED): "git storage must be explicitly configured — PostgreSQL is the default backend, not git. Full-auto is opt-in at the storage-module level."
**Status:** INCOHERENT
**Suggested resolution:** Either (a) qualify the "4 tools" claim to "4 tools, of which Wiki.js requires git storage to be explicitly configured" or (b) count Wiki.js separately as "conditional full-auto" and adjust the count to 3 unconditional + 1 conditional. The Executive Summary bullet and Theme 9 paragraph should apply consistent language. The distribution table's "Yes (when git storage enabled)" is the most precise formulation — the paragraph and executive summary should match it.

---

## Medium Severity

### [M1] Tool count inconsistency: "60+" in Theme 9 vs "50+" in section body

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Theme 9 (line ~919) vs Full-Auto Git Sync Prevalence section intro (line ~1061)
**Issue:** Theme 9 opens with "A survey of 60+ tools across four categories." The "Full-Auto Git Sync Prevalence" section intro states "across 50+ tools spanning editors, CMS platforms, git clients, and bot/CI patterns." These two claims in the same report about the same survey use different tool counts.

Counting named tools in the distribution table yields approximately 65 distinct tools (20 individually named rows + 4 developer editors + 7 git GUIs + 4 TUI/CLI + 7 bots PR model + 3 bots direct + 3 GitOps + 17 non-git-backed = ~65). The "60+" figure in Theme 9 is more accurate. The "50+" figure in the section body is understated.

**Current text (Theme 9):** "A survey of 60+ tools across four categories"
**Current text (section intro):** "across 50+ tools spanning editors, CMS platforms, git clients, and bot/CI patterns"
**Evidence:** Distribution table row counts (verified by enumeration): ~65 named tools
**Status:** INCOHERENT
**Suggested resolution:** Standardize to "60+" throughout (or enumerate to "65+" if preferred). Update the section intro to match Theme 9.

---

### [M2] "Exactly 4" in executive summary does not match evidence file d1 distribution summary

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity), L5 (Summary coherence)
**Location:** Executive Summary (line ~129), Theme 9 (line ~919), evidence/d1-broader-editor-auto-sync-survey.md distribution summary
**Issue:** Evidence file d1-broader-editor-auto-sync-survey.md's "Distribution summary" table shows "Full-auto by default: 2 tools — GitJournal, Wiki.js (when git storage enabled)." CloudCannon and StackEdit are covered in d2-cms-git-auto-sync.md — they do not appear in d1's distribution table. This means the "exactly 4" claim is a synthesis across multiple evidence files (d1 contributes 2, d2 contributes 2), which is correct — but a reader following only d1 would see only 2 full-auto tools, not 4.

This is not a factual error in the main report, but the synthesis is presented as if it comes from a single unified survey when it is actually assembled from four separate evidence files covering different tool categories. The report does not explicitly state this multi-file synthesis in Theme 9 or the Executive Summary.

**Current text:** "A survey of 60+ tools across four categories — editors/note-taking, headless CMS, bot/CI, and git clients — finds that full-auto bidirectional git sync ... is implemented by exactly 4 tools"
**Evidence:** d1 distribution summary shows 2 full-auto tools; d2 adds 2 more (CloudCannon, StackEdit). The total of 4 is correct, but is assembled from separate evidence files.
**Status:** INCOHERENT (framing issue — "a survey" implies a unified data set; the reality is four separate surveys synthesized)
**Suggested resolution:** Minor framing adjustment: "Four separate category surveys (editors, CMS, bot/CI, git clients) across 60+ tools in aggregate find..." — or simply note the distribution explicitly ("2 from the editor survey + 2 from the CMS survey").

---

### [M3] VS Code `git.postCommitCommand` described as "per-click manual dropdown" — accurate but potentially misleading

**Category:** COHERENCE
**Source:** L2 (Confidence-prose misalignment), L3 (Missing conditionality)
**Location:** Theme 9, "Developer tools explicitly reject auto-push" paragraph (line ~921)
**Issue:** The report says VS Code "later shipping `git.postCommitCommand` as a per-click manual dropdown — not automatic." This is technically accurate: the setting controls what happens after each commit click, not on a background timer. However, a user who sets `git.postCommitCommand = "push"` achieves automatic post-commit push as a side effect of every commit — not a background timer, but still automatic. The report's "not automatic" characterization is correct for the background-timer definition of full-auto, but could mislead a reader into thinking VS Code has no auto-push path at all.

The evidence file (d4-why-full-auto-rare.md) says "shipped `git.postCommitCommand` (v1.69) as a per-click manual dropdown — not automatic" with the same framing.

**Current text:** "`git.postCommitCommand` as a per-click manual dropdown — not automatic"
**Evidence:** VS Code v1.69 release notes confirm `git.postCommitCommand` allows push/sync after every commit click when configured; web search confirms this is the shipped feature. It is user-initiated (via commit click) not timer-driven.
**Status:** INCOHERENT (precision gap — "not automatic" is accurate for background-timer auto-push, but understates that the setting enables push-after-every-commit when configured)
**Suggested resolution:** Clarify: "per-click manual dropdown — triggered by the user's commit click, not by a background timer." This preserves the accurate distinction while not implying zero automation path exists.

---

## Low Severity

### [L1] Obsidian-Git issue #340 cited with wrong repository prefix in Theme 9

**Category:** COHERENCE / FACTUAL
**Source:** L7 (Inline source attribution)
**Location:** Theme 9, reason #4 "No mobile merge support" (line ~930)
**Issue:** Theme 9 cites issue #340 as `([#340](https://github.com/denolehov/obsidian-git/issues/340))` — using the `denolehov` (original, archived) repo. The Full-Auto Git Sync Prevalence section (line ~1103) cites the same issue number but links to `https://github.com/Vinzent03/obsidian-git/issues/340` — the maintained fork. Both URLs are live (GitHub redirects archived repos' issues), but the inconsistency is present. The evidence file (d4-why-full-auto-rare.md) uses the `Vinzent03` URL for #340.

The denolehov repo is archived and the Vinzent03 fork is the actively maintained one. Citing the archived repo for issues about a current limitation may mislead readers who check the link.

**Current text (Theme 9):** `([#340](https://github.com/denolehov/obsidian-git/issues/340))`
**Current text (section):** `[#340](https://github.com/Vinzent03/obsidian-git/issues/340)`
**Evidence:** Both GitHub URLs resolve. d4-why-full-auto-rare.md uses Vinzent03 for #340. The issue discusses `isomorphic-git` merge conflict behavior, which is still current.
**Status:** INCOHERENT (inconsistency within the same document)
**Suggested resolution:** Standardize all Obsidian-Git issue citations to use the Vinzent03 repo URLs throughout the new content.

---

### [L2] StackEdit described as active without noting maintenance status

**Category:** FACTUAL
**Source:** T5 (External claims)
**Location:** Theme 9 summary (line ~919), Distribution Table (line ~1070), Executive Summary (line ~129)
**Issue:** StackEdit is presented as a current active tool without any qualification. Web search and npm health data indicate StackEdit has had no GitHub commits since approximately 2019 and is considered unmaintained. The `syncSvc.js` file linked in the citations (confirming the 60s timer) is real and the behavior description is accurate for the current (frozen) codebase — the factual claim about the 60s timer is correct. However, presenting StackEdit as a current design choice alongside active tools like GitJournal, Wiki.js, and CloudCannon without noting its abandoned status could mislead readers about the current landscape.

This is a low severity finding because: (1) the behavioral description of StackEdit is accurate, (2) the evidence file does not claim StackEdit is actively maintained, (3) historical or unmaintained tools can still be valid data points in a landscape survey.

**Current text:** "StackEdit (browser, 60-second timer with three-way auto-merge)" — no maintenance status qualifier
**Evidence:** npm Snyk health: "Inactive." GitHub repository: no commits since ~2019. The service at stackedit.io remains accessible.
**Status:** UNVERIFIABLE (the service is live, the code is frozen — ambiguous status)
**Suggested resolution:** Add a brief qualifier: "StackEdit (browser, 60-second timer with three-way auto-merge; repository unmaintained since 2019, service still live)." This is contextually useful for readers assessing current tooling choices.

---

## Confirmed Claims (summary)

**T5 (external factual verification):**
- GitJournal `RemoteSyncFrequency.Default = Automatic` — confirmed: GitJournal auto-commits, auto-pushes, and auto-pulls by default on mobile.
- Wiki.js 5-minute sync interval (`PT5M`) — confirmed from official docs.
- CloudCannon webhook pull + per-save push + conflict pause UI — confirmed from official CloudCannon documentation.
- StackEdit `syncSvc.js` 60-second timer — confirmed from source code (behavior is correct; project maintenance status noted as low finding).
- GitDoc force push as default — confirmed from README: "By default, GitDoc will perform a 'force push', since certain operations such as squashing can actually re-write history."
- GitHub Desktop issue #2191 auto-sync deliberately not carried to Electron rewrite — confirmed.
- VS Code `git.postCommitCommand` shipped in v1.69 as manual dropdown — confirmed from release notes.
- Obsidian-Git #340 `MergeNotSupportedError` on mobile — confirmed.
- Obsidian-Git #114 `.obsidian/workspace.json` conflict churn — confirmed.
- Ink & Switch local-first paper (SPLASH 2019, Kleppmann et al.) git limitation quote — confirmed.
- bot/CI PR-model universality (Dependabot, Renovate, Snyk, etc.) — confirmed from d3 evidence.
- Four direct-to-main exceptions (semantic-release, Renovate branch mode, cron Actions, Flux Image Automation) commit only derived content — confirmed.

**L6 (Stance consistency):**
- The new sections maintain factual-only stance with no recommendations. Observations are labeled "Observation" and structural analysis is descriptive. PASS.

**L1/L5 (Cross-finding and summary coherence):**
- Theme 9's seven structural reasons are consistently enumerated in the standalone section's "Why Full-Auto Is Rare" subsection. The reasons in Theme 9 (7 items) match the 7 root causes in the full section. PASS.
- The distribution table classifications are internally consistent with the section's stated definitions of auto-commit, auto-pull, and auto-push. PASS.
- The Limitations section correctly acknowledges the unconfrimed runtime behaviors (GitJournal conflict handling, Wiki.js concurrent-push scenario, StackEdit three-way merge quality, CloudCannon binary file behavior). PASS.

---

## Unverifiable Claims

- **StackEdit three-way merge algorithm identity** — `mergeContent()` function confirmed from source; the diff utility used was not identified from source or web search. Noted in Limitations.
- **GitKraken internal rationale for auto-fetch-not-auto-push** — Implied by product behavior and feature request non-responses; no explicit maintainer statement found. Correctly labeled as unverified in Limitations.
- **Number of GitHub repos using cron-based auto-commit to main** — Not quantified; correctly labeled in Limitations as outside verification scope.
- **GitJournal merge conflict fatal behavior at runtime** — `RemoteSyncFrequency.Automatic` confirmed from source; fatal-on-conflict behavior inferred from isomorphic-git limitations; not tested at runtime. Correctly noted in Limitations.
