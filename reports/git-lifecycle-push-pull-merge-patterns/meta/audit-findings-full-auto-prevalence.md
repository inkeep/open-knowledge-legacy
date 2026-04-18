# Audit Findings: Full-Auto Git Sync Prevalence (2026-04-15 Update Pass)

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/reports/git-lifecycle-push-pull-merge-patterns/REPORT.md`
**Audit date:** 2026-04-15
**Scope:** New content added in the 2026-04-15 update pass:
- Exec summary bullet beginning "Full-auto bidirectional git sync (auto-pull + auto-push by default) is extremely rare"
- "### Theme 9: The Full-Auto Sync Abstention" subsection
- "## Full-Auto Git Sync Prevalence" standalone section
- "### Dimensions Added in Update Pass (2026-04-15) — Full-Auto Sync Prevalence Gaps" subsection
**Evidence files audited:**
- `evidence/d1-broader-editor-git-sync-survey.md` (exists on disk — 21-tool editor survey)
- `evidence/d2-cms-git-auto-behavior.md` (exists on disk — 16-tool CMS survey)
- `evidence/d3-bot-ci-git-patterns.md` (exists on disk — 12-tool bot/CI survey)
- `evidence/d4-why-full-auto-is-rare.md` (exists on disk — root-cause analysis)
**Total findings:** 6 (2 high, 2 medium, 2 low)

---

## High Severity

### [H1]: Full-auto tool count is 2 in exec summary and Theme 9, but 4 in distribution table and section prose
**Section:** Exec summary (line ~135), Theme 9 (line ~923), Distribution table (line ~1079), Section prose (line ~1081)
**Issue:** Three locations say the default full-auto count is 2 (exec summary: "only 2 tools"; Theme 9: "Only Wiki.js and CloudCannon ship it as a default"); one location says 4 (distribution table category (d) lists GitJournal, Wiki.js, CloudCannon, StackEdit), and the section prose confirms "exactly 4 implement auto-commit + auto-pull + auto-push without user action." GitJournal and StackEdit appear in the distribution table and section prose as full-auto tools but are absent from the exec summary count and Theme 9 count. This is a direct factual contradiction within the same report. A reader following only the exec summary or Theme 9 would conclude two tools; a reader following the section body would conclude four.
**Evidence:** Direct text comparison:
- Exec summary: "found only 2 tools that ship full-auto bidirectional git sync in their default configuration: Wiki.js and CloudCannon"
- Theme 9: "Only Wiki.js and CloudCannon ship it as a default"
- Distribution table: Category (d) = 4 rows: GitJournal, Wiki.js, CloudCannon, StackEdit
- Section prose: "exactly 4 implement auto-commit + auto-pull + auto-push without user action"
- d1 evidence file: GitJournal is listed (confirmed `RemoteSyncFrequency.Default = Automatic`)
- d2 evidence file: StackEdit is not in the d2 table (it is cited in the section prose with a source link but does not appear in any evidence file's per-tool table)
**Suggested fix:** Decide on the canonical count and make all four locations consistent. The section prose and distribution table reflect the most complete survey (4 tools). Update exec summary to "found only 4 tools" and update Theme 9 to name all four. If Wiki.js and CloudCannon are being privileged as "truly default" (versus GitJournal requiring git server setup and StackEdit being unmaintained), that distinction must be stated explicitly and the counts must still match between sections.

---

### [H2]: Section header evidence links point to files that do not exist on disk
**Section:** "## Full-Auto Git Sync Prevalence" section header (line ~1063)
**Issue:** The `**Evidence:**` line at the top of the section lists two groups of files. The first group — `evidence/d1-broader-editor-auto-sync-survey.md`, `evidence/d2-cms-git-auto-sync.md`, `evidence/d3-bot-ci-auto-commit-patterns.md`, `evidence/d4-why-full-auto-rare.md` — does not exist on disk. The second group (listed in parentheses) — `evidence/d1-broader-editor-git-sync-survey.md`, `evidence/d2-cms-git-auto-behavior.md`, `evidence/d3-bot-ci-git-patterns.md`, `evidence/d4-why-full-auto-is-rare.md` — does exist on disk and matches what the References section credits for this update pass. Every link in the first group is a broken reference.
**Evidence:** `ls evidence/` confirms only the second group exists. The References section (lines ~1238–1242) also cites only the second group (correct filenames). The first group appears to be stale filenames from a draft that was renamed before delivery.
**Suggested fix:** Remove the first (non-existent) group from the Evidence line, keeping only the parenthetical group — or promote the parenthetical group to the primary citation and drop the "(also:" framing. The References section already cites the correct files; the section header should match.

---

## Medium Severity

### [M1]: "~4–8%" prevalence range in Theme 9 is internally inconsistent with the computed figure
**Section:** Theme 9 (line ~923)
**Issue:** Theme 9 states full-auto is "a ~4–8% phenomenon." The distribution section states 60+ tools were surveyed and exactly 4 are full-auto. 4 ÷ 60 = ~6.7%. The stated range of 4–8% covers 6.7%, so it is not technically wrong, but it is an unusually wide band for a survey with a concrete denominator. More importantly, at the lower bound of the range (4%), the implied count would be 2–3 tools out of 60 — consistent with the "2 tools" claim in the exec summary, not the "4 tools" claim in the section body. This means the range is serving double duty: it works for both the 2-tool count and the 4-tool count depending on which end of the range the reader uses. The ambiguity masks the H1 inconsistency rather than resolving it.
**Evidence:** 4/60 = 6.7%; 4/50 = 8%; 2/60 = 3.3%; 2/50 = 4%. The range 4–8% brackets both the 2-tool and 4-tool interpretations, effectively hiding the discrepancy between sections.
**Suggested fix:** After resolving H1, replace the range with the precise fraction computed from the agreed-upon count and denominator. Example: "a ~6–7% phenomenon (4 of 60+ tools surveyed)."

---

### [M2]: Tool count in section intro ("50+") does not match Theme 9 or distribution intro ("60+")
**Section:** Section intro paragraph (line ~1065) vs. Theme 9 (line ~923) and Distribution subsection (line ~1069)
**Issue:** The section intro says "across 50+ tools spanning editors, CMS platforms, git clients, and bot/CI patterns." Theme 9 opens with "A survey of 50+ tools." But the Distribution subsection states a combined survey of 25 + 18 + 20 + "15+" tools = 78+ tools, and the distribution table contains approximately 60 individually enumerated rows. The "50+" figure is understated relative to the distribution table's own enumerated contents, and conflicts with "60+" in the distribution intro.
**Evidence:** Distribution subsection (line ~1069): "A combined survey of 25 note/knowledge editors (D1), 18 headless CMS / content tools (D2), 20 bot/CI tools (D3), and the 15+ editors and git clients from the parent report." 25 + 18 + 20 + 15 = 78 tools named across the four surveys; the distribution table enumerates approximately 60 distinct rows. Theme 9 says "50+" and the section intro also says "50+", but neither matches the distribution subsection's "60+."
**Suggested fix:** Standardize the count claim across the section intro, Theme 9, and exec summary. "60+" is better supported by the distribution table's enumeration than "50+". Alternatively, add a counting note clarifying that some tools appear across multiple surveys and the unduplicated set is approximately 60.

---

## Low Severity

### [L1]: StackEdit is not traceable to any evidence file's per-tool classification table
**Section:** Distribution table (line ~1079), Section prose (line ~1081), "Architectural Patterns" subsection (line ~1093)
**Issue:** GitJournal, Wiki.js, CloudCannon, and GitBook each appear in the per-tool tables of the actual evidence files (d1 or d2). StackEdit is cited in the section prose with a direct link to `syncSvc.js` source code, but does not appear in any of the four evidence files' per-tool classification tables (confirmed by reading d1, d2, d3, d4 in full). The section prose includes an inline source verification note ("behavioral claims verified from source"), which provides partial provenance, but the evidence trail is self-referential — the report body is the only location where StackEdit's full-auto classification is recorded, not the evidence files.
**Evidence:** d1 per-tool table: 21 tools listed, StackEdit absent. d2 per-tool table: 17 tools listed, StackEdit absent. d3 and d4 do not cover editors or CMS tools. The source link (`syncSvc.js`) is live and the 60-second timer is confirmable from it, but the classification as "full-auto by default" rests on a single source read not captured in any evidence file.
**Suggested fix:** Add a StackEdit entry to d2's per-tool classification table (or a new addendum row), or add a brief inline evidence note in the distribution table cell capturing the `syncSvc.js` confirmation (timer constant, API calls). The "unmaintained since ~2019" qualifier should also appear in the distribution table, consistent with the section prose.

---

### [L2]: Stance compliance — one sentence in Theme 9 edges toward prescriptive framing
**Section:** Theme 9, final "Observation" paragraph (line ~939)
**Issue:** The section ends with: "Tools that remove the human from sync must remove git from sync." This reads as a prescriptive conclusion rather than a factual observation. The report's stance rubric requires factual-only content with no recommendations. The sentence is framed as an absolute rule ("must"), not as an empirical pattern observed in the surveyed tools. The rest of the new content maintains factual-only framing; this sentence is the sole exception.
**Evidence:** Compare to adjacent factual statements: "git-annex represents the maximum git can offer for automated conflict resolution: file duplication with opaque `.variant-XXX` suffixes." That is a descriptive finding. "Tools that remove the human from sync must remove git from sync" is a normative claim about what tools must do.
**Suggested fix:** Rephrase to describe the observed pattern rather than issuing a design rule. Example: "The surveyed tools that achieved full-auto sync without git (Linear, Figma, Notion, SiYuan, Joplin) all built custom sync backends — the pattern suggests that removing human arbitration from the sync loop is incompatible with git's merge model in practice."

---

## Confirmed Claims

The following claims in the new content were cross-verified against the evidence files and confirmed:

- **7 root causes** — consistent across exec summary, Theme 9, section body, and d4 evidence file (Causes A–G, 7 total). PASS.
- **Wiki.js 5-minute sync interval** — confirmed from d1 evidence (Finding: Wiki.js, Confidence: CONFIRMED, citing `docs.requarks.io/storage/git`). PASS.
- **CloudCannon webhook-driven bidirectional sync** — confirmed from d2 evidence (Finding: CloudCannon, Confidence: CONFIRMED). PASS.
- **GitJournal `RemoteSyncFrequency.Default = Automatic`** — cited in section prose with direct link to `settings.dart`; consistent with d1's classification of GitJournal as full-auto. PASS.
- **Dependency bots never push to main** — confirmed from d3 evidence (Finding: Dependabot, Renovate, Snyk). PASS.
- **semantic-release as sharpest direct-push exception** — confirmed from d3 evidence. PASS.
- **isomorphic-git `MergeNotSupportedError`** — confirmed from d4 evidence (Cause A, Cause C). PASS.
- **Joplin author's unit-of-operation statement** — confirmed from d4 evidence (Cause G, citing `discourse.joplinapp.org`). PASS.
- **11 failure modes documented in d4** — d4 failure mode taxonomy table contains exactly 11 rows (F1–F11). Consistent with "Eleven specific failure modes" in section prose (line ~1111). PASS.
- **Forestry noted as sunset 2023** — consistent across d2 evidence and section prose. PASS.
- **Stance (factual-only)** — all new content except the one L2 sentence maintains descriptive, non-prescriptive language. PASS with one exception noted above.
- **Evidence file links in References section** — all four files cited in the References section (lines ~1238–1242) exist on disk. PASS.

---

## Summary Table

| ID | Severity | Category | One-line description |
|----|----------|----------|---------------------|
| H1 | High | Factual contradiction | 2 vs 4 full-auto tools across exec summary, Theme 9, and section body |
| H2 | High | Broken references | Section header Evidence line cites 4 non-existent filenames |
| M1 | Medium | Stat consistency | "~4–8%" range masks the 2-vs-4 count discrepancy |
| M2 | Medium | Stat consistency | "50+" tool count in intro contradicts "60+" in distribution subsection |
| L1 | Low | Evidence traceability | StackEdit not in any evidence file's per-tool table |
| L2 | Low | Stance compliance | One "must" sentence in Theme 9 reads as prescriptive, not descriptive |
