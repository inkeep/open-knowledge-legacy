# Changelog

## 2026-04-26 — /audit findings processed and resolved

### Run: nested Claude `_nest:audit` + in-context `/assess-findings`
- **Trigger:** Audit had been skipped on the initial 2026-04-25 run; user requested it after report had grown substantially via D8/D9/D10 + D8.11
- **Audit output:** 11 findings (0 high, 4 medium, 7 low) at `meta/audit-findings.md`
- **Triage:** All 11 verified HIGH confidence after re-reading the audit's primary-source citations + the actual REPORT.md text. 10 actionable; 1 false alarm (L11). All 10 classified as **Act — sharpen / restore / soften**. None warranted decline or escalation.

### Substantive correction (M4)
- **ESLint cascade quote misattribution:** "a significant source of complexity" was attributed to the cascade in REPORT.md §D6 Choice 5 + §D7 ESLint paragraph + evidence/d6 + evidence/d7. The audit verified via WebFetch that the blog applies that exact phrase to *recreating Node's `require` resolution mechanism*, NOT to the cascade. Resolved via Option (b): replaced with what the blog actually says about the cascade — "to get rid of the directory-based config cascade" and "dramatically reduces the disk access required as compared to eslintrc, which had to check each directory from the linted file location up to the root." Applied in 4 locations.

### Other medium fixes
- **M1 (REPORT.md §D9):** Restricted Mode list said "four" but enumerated five — corrected to "five."
- **M2 (REPORT.md §D3 + evidence/d3 D3.6):** Hooks "Five scope locations" but enumerated six — corrected to "Six" in both surfaces.
- **M3 (REPORT.md §D9):** Process wrapper list missing `time` — restored. Body now matches evidence and canonical Claude Code docs.

### Low fixes (all trivial)
- **L5 (References):** D8 evidence-file reference said "10 findings"; updated to "11 findings" + appended "concurrent-window propagation" to the topical list.
- **L6 (REPORT.md §D2):** Added one-clause pointer noting source-of-truth enum has 8 categories vs the 7 in docs (see §D8) — preserves both audiences without rewriting.
- **L7 (REPORT.md §D9):** `bypassPermissions` quote was paraphrase but quote-bracketed; rewrote without quotation marks AND added the exempt-from-exempt subset (`.claude/commands`, `.claude/agents`, `.claude/skills`) which is meaningful for agent-trust analysis.
- **L8 (REPORT.md Exec Summary + §D9):** Universal claim "*any* AI-augmented editor faces this trade-off" softened to directional language matching the §D9 evidence's hedge.
- **L9 (REPORT.md §D7):** "Backup and Sync plugin" version-pinned to "(in IntelliJ IDEA 2026.1)" + restored the UNCERTAIN hedge on the rebrand history.
- **L10 (References):** Acknowledged D4 body has 25 rows while evidence has 27 (two rows for "Recommended/suggested settings" and "Built-in default values" are evidence-only).
- **L11:** No action — verified false alarm (D9 references-line "10 findings" was accurate).

### What the audit confirmed (no action needed)
- ESLint package-name correction (eslint-scope/eslint-config-eslint, not "eslint-loader") propagated cleanly across Executive Summary, §D9, evidence/d9, and changelog. No residual "eslint-loader" references survive outside the changelog where it's correctly framed as the original mistaken prompt.
- Factual-stance held throughout — D6/D9 stay descriptive ("each picked the merge model that fit its primary use case"), not prescriptive.
- All quantitative claims verified: 6 → 8 ProfileResourceType categories, ESLint v9.0.0 = April 2024, Workspace Trust 1.57 = July 2021, 5 VS Code GitHub issues with correct dispositions, "8 years after 2017" arithmetic, etc.
- D8.11 (concurrent-window) confidence labels (CONFIRMED for same-process, INFERRED for separate-process) match prose precisely.

---

## 2026-04-26 — Closed concurrent-window gap

### Run: solo subagent (1 direction, light scope — no fanout warranted)
- **Trigger:** User flagged the "concurrent-window behavior" gap in D8's Limitations as relevant
- **Approach:** Single focused subagent with deep VS Code source-code investigation (not fanout — single product, single facet)
- **Worker findings:** 6 findings (5 CONFIRMED, 1 INFERRED) covering all 5 scenarios from the prompt + mechanism + multi-process

### Evidence changes
- `evidence/d8-vscode-profiles-internals.md`: Added Finding D8.11 (concurrent-window behavior). Updated Negative searches (removed obsolete "Same workspace opened in two windows" entry — now answered; added new entry confirming no relevant open GitHub issues). Updated Gaps (removed "Concurrent same-workspace open behavior" — closed; added cross-process residual as a new gap).

### REPORT.md changes
- Frontmatter: `updatedAt: 2026-04-26`; `lastUpdate` field updated
- §D8: Added new subsection "Concurrent-window behavior: typed IPC + reload prompt, never silent switch" after "Profile creation routes" — summarizes mechanism + per-scenario behavior
- Limitations & Open Questions: Crossed out the "VS Code Profiles concurrent-window behavior" entry with "Closed 2026-04-26" annotation pointing to the new subsection; noted cross-process residual

### Key headline
The "two windows of the same workspace, one of them changes its profile binding" question has a clean answer the official docs never spelled out: typed IPC channel auto-broadcasts profile lifecycle events to all renderer windows, but per-window `currentProfile` is a snapshot taken at window-open and never re-derived from `profileAssociations` — so cross-window binding changes always surface as a reload prompt, never a silent switch. Settings.json edits propagate live via the existing `IFileService` watch (no profile-specific path). Cross-process / shared `--user-data-dir` is the one residual unknown (INFERRED from architecture).

---

## 2026-04-25 — Initial run + same-day follow-up extension

### Run 2026-04-25-initial (closed)
- 7 dimensions (D1–D7); 3 parallel workers (D2 VS Code, D3 Claude Code, D7 comparison products); 4 orchestrator-authored evidence files (D1, D4, D5, D6)
- REPORT.md ~6.6K words; 7 evidence files
- Two foundational claims spot-verified mid-run via direct WebFetch (VS Code six scope-tag values; Claude Code 5-position precedence + array merge)
- Skipped formal /audit step — judgment call given factual stance + symmetric structure + spot-verification

### Run 2026-04-25-followup (active → closed below)
- **Intent:** Additive (Path C — extend existing report)
- **Selected by user:** All three follow-ups offered at end of initial run
- **Approach:** Hybrid Path C — three parallel focused subagents (Agent tool, general-purpose), not full /nest-claude subprocesses
- **Workers (each returned structured Markdown findings):**
  - FU#1 → D8: VS Code Profiles internals (10 findings)
  - FU#2 → D9: Workspace Trust vs permissions DSL threat models (10 findings)
  - FU#3 → D10: Project-local-personal override patterns across 9 products (9 product findings + cross-cutting analysis)

### Evidence changes
- New: `evidence/d8-vscode-profiles-internals.md` — Profiles lifecycle, 8-category resource enum, binding mechanics, deletion behavior, Partial Profiles, MCP-restart-on-switch, extension-binary sharing, `.code-profile` schema, Sync data-loss bugs
- New: `evidence/d9-threat-models.md` — Workspace Trust 2021 consolidation history, 2018 ESLint incident (correct package names: `eslint-scope@3.7.2` + `eslint-config-eslint@5.0.2` — NOT "eslint-loader"), what each gates / doesn't gate, Bash-pattern fragility, hook-approval gap, symlink semantics, project-disallowed credential fields, Cursor default-off, JetBrains parity
- New: `evidence/d10-local-personal-patterns.md` — 9-product survey, naming convention dominance (`.local` suffix), first-class vs convention-only matrix, VS Code's recurring rejection (5 issues since 2017), JetBrains' file-category-separation alternative

### REPORT.md changes
- Frontmatter: added `lastUpdate` field; expanded `description` to mention follow-up topics
- Executive Summary: added "Three deeper threads" subsection summarizing D8/D9/D10 headline findings
- Research Rubric table: added D8/D9/D10 rows (all marked "added 2026-04-25 follow-up")
- New §D8 — VS Code Profiles: Internals (8 subsections)
- New §D9 — Threat Models: Workspace Trust vs Permissions DSL (6 subsections)
- New §D10 — Project-Local-Personal Override Patterns Across Products (5 subsections)
- Limitations & Open Questions: added 6 follow-up gap items from D8/D9/D10
- References: added per-section External Sources subsections for D8/D9/D10
- Evidence Files list: added the three new evidence file pointers

### Notable corrections during follow-up
- **2018 ESLint supply-chain incident package naming**: my FU#2 prompt referenced "eslint-loader" as the canonical 2018 incident. The worker checked the canonical ESLint postmortem and corrected: actual packages were `eslint-scope@3.7.2` and `eslint-config-eslint@5.0.2`. "eslint-loader" is a folk-memory conflation that does not appear in the postmortem. Corrected throughout D9 evidence + REPORT.md.

### Conflicts resolved
- None substantive across the three follow-ups (each addresses a distinct dimension).

### Closing notes
- Run 2026-04-25-followup status → Closed
- `fanout/2026-04-25-followup/` directory was created but not used (workers returned findings inline rather than producing sub-reports — hybrid approach skipped the sub-report production step). Directory retained empty for run organization.
