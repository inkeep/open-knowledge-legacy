# Changelog

## 2026-04-14 — Initial fanout consolidation

### Fanout run: 2026-04-14-initial
- Directions pursued:
  1. staging-committing-push-pull (D1 + D2)
  2. merge-conflicts-error-recovery (D3 + D6)
  3. branch-management-remote-auth (D4 + D5)
  4. history-diff-and-nondev-ux (D7 + D8)
- Sub-reports: 4 successful, 0 failed
- Consolidation: /consolidate produced REPORT.md (629 lines) + 8 parent-level evidence files (one per dimension)
- Claims inventory: fanout/2026-04-14-initial/CLAIMS.md (84 claims, 83 CONFIRMED / 1 INFERRED)
- Sub-reports preserved at: fanout/2026-04-14-initial/

### Evidence files created (parent level, synthesized from sub-report evidence)
- evidence/d1-staging-commit.md
- evidence/d2-push-pull.md
- evidence/d3-merge-conflict.md
- evidence/d4-branch-management.md
- evidence/d5-remote-auth.md
- evidence/d6-error-recovery.md
- evidence/d7-history-diff.md
- evidence/d8-nondev-abstraction.md

### REPORT.md sections
- Executive Summary with editor-spectrum framing (full-git / guided-git / power-user hybrid / git-as-transport)
- Research Rubric (8 dimensions)
- Detailed findings D1–D8 (each linking to evidence/)
- Cross-Cutting Themes (6): safety-net continuum, guided-git convergence, settings vs transient discovery, AI/agent modality, abstraction fracture point, the reflog gap
- Comparative Matrices (D1–D2, D3+D6)
- Limitations & Open Questions (universal ecosystem gaps)

### Sources surveyed
- Developer IDEs: VS Code, JetBrains IntelliJ, Zed, Cursor, Neovim + diffview.nvim + vim-fugitive
- Visual git clients: GitHub Desktop (+ dugite), GitKraken, Sublime Merge, Fork, Sourcetree
- Power-user TUIs: lazygit, tig, Magit, Stacked Git
- CLI tooling: gh, git
- Credential tooling: git-credential-manager
- Non-developer wrappers: Obsidian-Git, TinaCMS, Logseq, SiYuan, Joplin

### Pre-compaction run note
The earlier `--fanout` pass (pre-compaction) created directory scaffolding but never produced sub-reports (fanout dispatch limitation — parent agent only scaffolded, didn't launch workers). This 2026-04-14-initial run re-dispatched each direction as an independent nested `/research --headless` instance with explicit spawn commands. All four completed successfully.

## 2026-04-14 — Audit + /assess-findings pass

Ran `/audit` against consolidated REPORT.md. 10 findings surfaced (3 High, 4 Medium, 3 Low). `/assess-findings` classified all 10 as VALID; all fixed via surgical edits.

### High-severity fixes (correctness)
- **H1:** D2 Force Push "Four distinct strategies" → "Six distinct strategies" (table had 6 rows; count was stale from sub-report merge)
- **H2:** Theme 2 cross-reference "D7 showed AI-powered commit messages" → "D1 also showed" (AI commit messages are in D1, not D7)
- **H3:** D4 Branch-from-issue self-contradiction ("two tools" → "only one") resolved by rewriting to "exactly one tool (JetBrains)" + noting lazygit/GitKraken metadata display

### Medium-severity fixes (clarity + stance)
- **M1:** Comparative matrix JetBrains auto-fetch "On (20 min)" → "Configurable (not documented)" — was orphaned from D2 detail table
- **M2:** Added hedging to CC2 (INFERRED claim); explicit note that convergence thesis is INFERRED
- **M3:** "Implication:" paragraphs in Themes 1/2 relabeled as "Observation:" and prescriptive phrasing ("For teams building...") reframed as factual pattern statements to match declared factual stance
- **M4:** "5 of 7 commercial editors" enumerated (VS Code, JetBrains, Cursor, Zed, GitKraken ship; GitHub Desktop, Sourcetree do not)

### Low-severity fixes (sourcing)
- **L1:** Explicit enumeration of 12 D1 tools added before staging table
- **L2:** "Magit gates 28 destructive actions" → "dozens of destructive actions" + inline citation to `magit-no-confirm` defcustom docs
- **L3:** "VS Code alone has 50+ git settings" → "exposes dozens of `git.*` settings" + inline citation to VS Code git docs

### Audit verdict
- 83/84 claims CONFIRMED with evidence; 1 INFERRED (CC2 convergence thesis) now explicitly labeled in prose
- Stance consistency verified (factual, no recommendations) after Theme 1/2 Implication → Observation relabeling
- Non-goals adherence: all 5 listed non-goals absent from report
- 3P framing: zero 1P/Open Knowledge content
