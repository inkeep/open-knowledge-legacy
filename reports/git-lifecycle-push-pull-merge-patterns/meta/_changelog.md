# Changelog

## 2026-04-15 — Path C additive update: full-auto git sync prevalence (50+ tool survey)
**Update type:** Additive
**Why this pass happened:** Prior research established that Obsidian-Git, Logseq, SiYuan, GitHub Desktop, VS Code, etc. do not default to full-auto bidirectional git sync. The open question: does ANY production tool? If rare, WHY — technical, UX, or path dependency? Four research dimensions launched in parallel fanout.

### Scope (delta only — 4 research dimensions)
- D1: Broader note/knowledge editor git-sync inventory (21 tools — Foam, Dendron, Quartz, Wiki.js, Gollum, SilverBullet, Zettlr, HackMD, Outline, BookStack, and 11 others)
- D2: Headless CMS / content tools git auto-behavior (16 tools — Decap CMS, CloudCannon, GitBook, Statamic, Keystatic, Sveltia CMS, Static CMS, Prose.io, Publii, Front Matter CMS, Forestry, Mintlify, Netlify Create, and others)
- D3: Bot/CI auto-commit patterns (12 tools — Dependabot, Renovate, Snyk, semantic-release, git-auto-commit-action, pre-commit.ci, autofix.ci, changesets/action, GitHub Pages deploy)
- D4: Why full-auto is rare — root-cause analysis (14+ issue threads, engineering blog posts, git mailing list, sync engine rejection rationale)

### Research execution
- 4 parallel research agents dispatched (D1 editor survey, D2 CMS survey, D3 bot/CI survey, D4 root-cause investigation)
- Docs-level: 50+ tools surveyed across official docs, GitHub repos, community forums, engineering blogs
- Issue threads: Obsidian-Git #340/#803/#872/#683/#906, GitHub Desktop #10995/#9145/#1128, VS Code #62058/#14885/#23951, Logseq #429/#713, isomorphic-git #841, lazygit #4647, Dendron #2075/#3262
- Git mailing list: push race condition incident, push --mirror race

### What changed (current-state)
- REPORT.md — sections touched:
  - Frontmatter: added 22 subjects (Wiki.js, CloudCannon, GitBook, Decap CMS, Sveltia CMS, Static CMS, Keystatic, Statamic, Forestry, Prose.io, Dependabot, Renovate, semantic-release, Dendron, Foam, Gollum, Publii, Front Matter CMS, Netlify Create, SilverBullet, isomorphic-git, Mintlify), expanded description
  - Executive Summary: corrected "absent from every surveyed tool" → "extremely rare (~4-8%)", added Wiki.js + CloudCannon as confirmed exceptions, 7 root causes
  - Theme 9: replaced hook-generated stub with evidence-backed "The Full-Auto Sync Abstention" theme
  - New section: "Full-Auto Git Sync Prevalence" between "Non-Editor Sync Dynamics" and "Comparative Matrices" — contains distribution table, architectural patterns of full-auto tools, CMS API-mediation pattern, bot/CI branch isolation, 7 root causes, auto-push rejection issue threads, sync engine git rejection catalog
  - Limitations: replaced hook-generated gaps with 7 evidence-backed gap items
  - References: replaced hook-generated evidence refs with 4 new evidence files matching actual disk files

- Evidence — added:
  - evidence/d1-broader-editor-git-sync-survey.md (21 tools surveyed, per-tool classification)
  - evidence/d2-cms-git-auto-behavior.md (16 tools surveyed, API-mediation pattern)
  - evidence/d3-bot-ci-git-patterns.md (12 tools, PR isolation pattern)
  - evidence/d4-why-full-auto-is-rare.md (7 root causes, 11 failure modes, 14+ issue threads, 5 sync engine rejections)

- Evidence — existing files NOT edited:
  - All 22 prior evidence files untouched

### Notes on confidence
- Wiki.js full-auto: CONFIRMED from official docs (5-min interval when git storage enabled)
- CloudCannon full-auto: CONFIRMED from official docs (webhook pull + per-save push)
- GitBook bidirectional: CONFIRMED from docs (when Git Sync enabled)
- Forestry bidirectional: INFERRED from community reports (service shut down 2023)
- 7 root causes: CONFIRMED from specific issue threads with URLs cited
- isomorphic-git MergeNotSupportedError: CONFIRMED from library docs + issue #841
- Joplin git rejection: CONFIRMED from Laurent Cozic's direct forum statement
- SiYuan DejaVu: CONFIRMED from GitHub repo README
- Obsidian-Git auto-pull default=0 rationale: NOT FOUND (behavior documented, rationale implicit)
- Factual stance preserved — zero recommendations added
- 3P framing maintained — zero 1P/Open Knowledge content

## 2026-04-15 — Path C additive update: credential helper token refresh strategy
**Update type:** Additive
**Why this pass happened:** D5 (sustained auth lifecycle) documented per-forge token expiry and credential helper TTLs but lacked depth on HOW credential helpers implement token refresh — specifically Git's `password_expiry_utc` (2.40) and `oauth_refresh_token` (2.41) protocol extensions, GCM's per-provider refresh architecture, git-credential-oauth's stateless protocol-level pattern, storage helper version constraints, and a scoping assessment for new credential helper implementations.

### Scope (delta only — 5 research dimensions)
- R1: Git credential helper protocol extensions (Git 2.40–2.46 source-level)
- R2: GCM per-provider refresh implementation (GitLab, Bitbucket, Azure DevOps, Generic, GitHub)
- R3: git-credential-oauth source analysis (~586 LOC Go)
- R4: Per-forge token expiry + refresh behavior (GitHub, GitLab, Bitbucket, Azure DevOps, Gitea, Forgejo/Codeberg)
- R5: Practical scoping decision for new credential helpers

### Research execution
- 4 parallel research agents dispatched (R1 git source, R2 GCM source, R3 git-credential-oauth source, R4 per-forge docs)
- Source-level depth: git/git credential.c + http.c, GCM GitLabHostProvider.cs + BitbucketHostProvider.cs + AzureReposHostProvider.cs + GenericHostProvider.cs + ICredentialStore.cs, git-credential-oauth main.go
- Docs-level: GitHub/GitLab/Bitbucket/Azure DevOps/Gitea/Forgejo official OAuth docs

### What changed (current-state)
- REPORT.md — sections touched:
  - Frontmatter: added 4 subjects (git-credential-oauth, Gitea, Forgejo, Codeberg), 1 topic (credential helper token refresh)
  - Executive Summary: added 1 new Key Findings bullet (D5 extended — credential protocol refresh)
  - D5 "Token Refresh" subsection: corrected "GitLab-specific concern" → multi-forge concern (Bitbucket, Gitea, Forgejo, Azure DevOps)
  - D5 Sustained Auth: new "Token Refresh Strategy for Credential Helpers" #### subsection after credential helper TTLs paragraph
  - Limitations: added "Dimensions Added in Update Pass (2026-04-15) — Credential Helper Token Refresh Gaps" with 5 items
  - References: added 1 new evidence file, 12 new external sources

- Evidence — added:
  - evidence/credential-helper-token-refresh.md

- Evidence — existing files NOT edited:
  - All prior evidence files untouched (including d5-sustained-auth-lifecycle.md)

### Notes on confidence
- Git protocol behavior: CONFIRMED from credential.c source (commit hashes verified)
- GCM provider refresh: CONFIRMED from source (main branch)
- git-credential-oauth: CONFIRMED from main.go (586 LOC, verified)
- Per-forge token behavior: CONFIRMED for GitHub/GitLab/Bitbucket/Gitea; INFERRED for Forgejo/Codeberg (shared codebase); INFERRED for Azure DevOps access TTL (undocumented exact value)
- Git version adoption: INFERRED (no authoritative public data)
- GCM PR #1464: CONFIRMED still open/unmerged as of 2026-04-15
- Factual stance preserved — scoping assessment presents facts and trade-offs, not recommendations
- 3P framing maintained — zero 1P/Open Knowledge content

### Post-audit corrections (4 findings → 4 resolved)
- [H1] Bitbucket refresh token TTL: corrected "3 months (rolling)" → "No documented expiry" in both REPORT.md table and evidence file (Bitbucket official docs confirm no refresh token expiry)
- [M1] git-credential-oauth LOC: standardized to "~600 LOC" across exec summary, body, evidence file, and references
- [M2] Scoping table prescriptive language: reframed from advisory ("Tolerable for v1", "essential") to factual observations ("landscape observation" column, describing what exists without advising)
- [L1] Universal single-use RT claim: qualified from "All non-GitHub forges" to "Every non-GitHub forge examined" with explicit (confirmed/inferred) attributions

## 2026-04-15 — Path C additive update: @codemirror/merge mergeControls fitness
**Update type:** Additive
**Why this pass happened:** D3 (merge/rebase conflict UX) covered conflict presentation architectures across 15+ editors but did not assess the embeddable merge control component landscape — specifically whether @codemirror/merge's `mergeControls` option provides acceptable out-of-box UX for non-developer conflict resolution.

### Scope (delta only — 3 research dimensions)
- R1: @codemirror/merge source-level analysis (mergeControls internals, Chunk model, customization surface)
- R2: Alternative merge/diff UI components survey (Monaco, react-diff-view, react-diff-viewer-continued, Mergely, diffview.nvim, GitKraken, Sublime Merge)
- R3: Practical fitness assessment for non-developer audiences

### Research execution
- 2 parallel research agents dispatched (R1 source-level, R2 docs-level survey)
- Source-level depth achieved: @codemirror/merge v6.12.1 (`node_modules/@codemirror/merge/dist/index.js`, 1766 lines)
- Docs/web level: Monaco DiffEditor, react-diff-view, react-diff-viewer-continued, Mergely, diffview.nvim, GitKraken, Sublime Merge, VS Code merge editor

### What changed (current-state)
- REPORT.md — sections touched:
  - Frontmatter: added 4 subjects (@codemirror/merge, Monaco Editor, Mergely, react-diff-view), 1 topic (embeddable merge controls)
  - Executive Summary: added 1 new Key Findings bullet (D3 extended — mergeControls fitness)
  - D3: new "Merge Control UI Fitness (@codemirror/merge)" subsection after "Unresolved Marker Guards"
  - References: added 1 new evidence file, 10 new external sources

- Evidence — added:
  - evidence/codemirror-merge-controls-fitness.md

- Evidence — existing files NOT edited:
  - All 18 prior evidence files untouched

### Notes on confidence
- All claims CONFIRMED from source code or official documentation
- Assessment conclusion: MEDIUM fitness (use mergeControls with thin custom control layer)
- Factual stance preserved — zero recommendations added
- 3P framing maintained — zero 1P/Open Knowledge content

## 2026-04-15 — Path C additive update: scheduler dynamics, retry patterns, non-editor sync
**Update type:** Additive
**Why this pass happened:** Existing report was strong on WHAT tools do but lacked DYNAMICS — runtime timing, retry mechanics, queue management, error-recovery timing, coordination patterns, and user-override controls. Also needed to broaden scope beyond editors to workflow automation tools and file-sync tools, which have mature sync-scheduling mechanics.

### Scope (delta only — 4 clusters via fanout)
- C1: Git-editor auto-sync dynamics (Obsidian-Git source-level, SiYuan/dejavu source-level, logseq/git-auto, Joplin)
- C2: Sync-engine app dynamics (Linear, Figma, Notion — scheduling/batching/queue details beyond parent section)
- C3: Workflow automation retry + scheduling (n8n, Temporal, Prefect, Airflow, Airbyte, GitHub Actions)
- C4: File-sync tool dynamics (Syncthing, Rclone, Nextcloud, git-annex, Dropbox, OneDrive)

### Research execution
- 4 parallel research agents dispatched (one per cluster)
- Source-level depth achieved: Obsidian-Git (automaticsManager.ts, promiseQueue.ts), SiYuan (sync.go, sync_lock.go), Syncthing (config docs), Rclone (bisync + flags), n8n (docs), Temporal (retry policies + schedules)
- Docs/blog level: Linear (reverse-engineering), Figma (blog), Notion (blog), Prefect, Airflow, Airbyte, Nextcloud, git-annex, Dropbox, OneDrive

### What changed (current-state)
- REPORT.md — sections touched:
  - Frontmatter: added 10 subjects (n8n, Temporal, Prefect, Airbyte, Airflow, Syncthing, Rclone, Nextcloud, git-annex, OneDrive), 4 topics (auto-sync scheduling, retry and backoff, file sync dynamics, workflow automation), expanded description
  - Executive Summary: added 4 new Key Findings bullets (D8 scheduler, D6 retry, non-editor sync, maturity gradient)
  - D6: new "Retry + Backoff Patterns (Cross-Domain Prior Art)" subsection before "Network Failure Handling"
  - D8: new "Auto-Sync Scheduler Dynamics" subsection before "Git-to-User Vocabulary Map"
  - Cross-Cutting Themes: added "Theme 8: The Scheduler Maturity Gradient" (before Theme 7)
  - New section: "Non-Editor Sync Dynamics" between "Sync-Engine Apps as Prior Art" and "Comparative Matrices" — contains Workflow Automation, File-Sync Tools, and Sync-Engine scheduling subsections
  - Limitations: added "Dimensions Added in Update Pass (2026-04-15)" with 8 remaining gaps
  - References: added 4 new evidence files, 27 new external sources

- Evidence — added:
  - evidence/c1-git-editor-sync-dynamics.md
  - evidence/c2-sync-engine-dynamics.md
  - evidence/c3-workflow-automation-retry-patterns.md
  - evidence/c4-file-sync-tools-dynamics.md

- Evidence — existing files NOT edited (preserved per Path C convention):
  - All 14 prior evidence files untouched

### Notes on confidence
- All new claims CONFIRMED with cited evidence except: Linear reconnection backoff (UNCERTAIN), Figma offline persistence duration (INFERRED), n8n exponential backoff availability (INFERRED)
- Factual stance preserved throughout — zero recommendations added
- 3P framing maintained — zero 1P/Open Knowledge content

### Cross-cluster patterns observed
- The "scheduler maturity gradient" (Theme 8) emerged as the primary cross-cluster finding: git editors operate at Tier 1 (naive timer), sync-engine apps at Tier 2 (event-driven), file-sync tools at Tier 3 (configurable retry), workflow engines at Tier 4 (typed retry + durable execution). Three capabilities have not crossed boundaries: jitter, typed non-retryable errors, mid-operation checkpointing.

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

## 2026-04-14 — Path C additive update: failure modes, sync-engine prior art, auth lifecycle, terminology
**Update type:** Additive
**Why this pass happened:** Parent report had 6 known gaps: D6 lacked error taxonomy and recovery-by-mode; D8 lacked sync-button decomposition and vocabulary mapping; no sync-engine prior art; no treatment of progress/cancellation or sustained auth. These gaps were identified in the initial report and explicitly scoped for a follow-up pass.

### Scope (delta only — 7 dimensions in 4 clusters)
- R1: Error-class taxonomy for git remote operations (extends D6)
- R2: Sync button decomposition in non-dev tools (extends D8)
- R3: Offline affordances and operation queuing (new — sync-engine apps)
- R4: Recovery UX for 5 specific failure modes (extends D6)
- R5: Progress reporting + cancellation for long ops (new — sync-engine apps)
- R6: Git-to-user vocabulary mapping (extends D8)
- R7: Sustained auth lifecycle post-clone (extends D5)

### Research execution
- 4 parallel research agents dispatched (one per cluster)
- Cluster 1 (R1+R4): error taxonomy + recovery UX — 7 editors + 2 sync-engine apps
- Cluster 2 (R2+R6): sync semantics + terminology — 8 non-dev tools + 4 developer editors
- Cluster 3 (R3+R5): offline affordances + progress — 6 sync-engine apps + 4 git libraries + 7 editors
- Cluster 4 (R7): sustained auth — 4 forges + 6 editors + 3 credential helpers
- Cross-domain anchors: Stripe API errors, gRPC status codes, AWS SDK retry, RFC 9457

### What changed (current-state)
- REPORT.md — sections touched:
  - Frontmatter: added 11 subjects (sync-engine apps, cross-domain refs, Tower), 5 topics, expanded description
  - Executive Summary: added 3 new Key Findings bullets (D6 extended, sync-engine apps, D5 extended)
  - D5: new "Sustained Auth Lifecycle (Post-Clone)" subsection
  - D6: new "Error-Class Taxonomy" and "Recovery UX by Failure Mode" subsections (before existing "Network Failure Handling")
  - D8: new "Sync Button Decomposition" and "Git-to-User Vocabulary Map" subsections (before existing "Collaboration Model")
  - Cross-Cutting Themes: added "Theme 7: The Failure-Mode Gradient"
  - New section: "Sync-Engine Apps as Prior Art" (between themes and comparative matrices)
  - Limitations: added "Dimensions Added in Update Pass" with 5 remaining gaps
  - References: added 6 new evidence files, 28 new external sources

- Evidence — added:
  - evidence/d5-sustained-auth-lifecycle.md
  - evidence/d6-failure-taxonomy.md
  - evidence/d6-recovery-ux-by-mode.md
  - evidence/d8-sync-button-anatomy.md
  - evidence/d8-terminology-map.md
  - evidence/sync-engine-prior-art.md

- Evidence — existing files NOT edited (preserved per Path C convention):
  - evidence/d1-staging-commit.md through evidence/d8-nondev-abstraction.md (all 8 untouched)

### Notes on confidence
- 1 INFERRED claim in new content: cross-domain progress pattern convergence (Theme 7 / sync-engine section)
- All other new claims CONFIRMED with cited evidence
- Factual stance preserved throughout — zero recommendations added
- 3P framing maintained — zero 1P/Open Knowledge content
