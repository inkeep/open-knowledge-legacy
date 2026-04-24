# Audit Findings — 2026-04-20-cli-distribution-and-install-ux

**Date:** 2026-04-20
**Auditor:** general-purpose subagent (audit pass)
**Artifact:** SPEC.md (14 decisions + 9 non-goals + 2 Future Work Explored + 2 Identified)

## Summary

Spec is structurally sound: every D-row has filled columns, every NG has a temporal tag + revisit condition, Q1-Q3 resolved, §13 passes the resolution gate, §16 correctly excludes `packages/`. Factual claims against evidence files largely hold. However, there are three **High**-severity internal inconsistencies (NG8 subcommand count contradicts D11; D13 Rationale lists 6 apps for a "5 of 7" claim; `2026-04-08-cli-packaging` §3 uses bullets not numbered rows so D3's "line 34" pointer is mis-anchored), one **Medium** cross-finding contradiction in D13's list, plus several **Low** items (cross-link symmetry gap, D3 Implications text claims "line 33 line 34" but §3 rows are flat bullets).

## High-severity findings (fix before shipping)

### [H1] NG8 subcommand count contradicts D11 (COHERENCE / L1)
**Location:** SPEC.md:53 (NG8) vs SPEC.md:208 (D11 Rationale)
**Issue:** NG8 says "open-knowledge CLI has ~7 top-level subcommands" then parenthetically lists **13** commands: "(start, ui, init, mcp, status, stop, clean, preview, auth, clone, sync, push, pull)". D11 Rationale on line 208 correctly states "~13 top-level subcommands today." The two rows disagree on the same load-bearing count.
**Evidence:** `packages/cli/src/cli.ts` imports 13 command modules (auth, clean, clone, init, mcp, preview, pull, push, start, status, stop, sync, ui). D11's "~13" matches the code; NG8's "~7" does not.
**Status:** INCOHERENT
**Suggested resolution:** Change NG8's "~7" to "~13" (match D11 + code). The trigger "Subcommand count crosses ~10" in NG8 may then need to read "has already crossed ~10 — revisit is contingent on flag surface growth" or similar, since the current count already crosses the NG8 threshold.

### [H2] D13 Rationale claims "5 of 7" but lists 6 apps (COHERENCE / L1 + FACTUAL / T5)
**Location:** SPEC.md:210 (D13 Rationale) vs REPORT.md:54 + electron-desktop-app-operations-2025 REPORT.md
**Issue:** D13 Rationale says "5 of 7 reference Electron apps (Obsidian, Slack, Discord, Claude Desktop, Cursor, Linear — some community-maintained)" — the parenthetical enumerates **6 apps, not 5**. Cross-referencing:
- Research report REPORT.md line 54 claim: "5 of 7 reference Electron apps ship Homebrew Cask." Also §15 Future Work "Explored" at SPEC.md:295 repeats "5 of 7" and lists the same 6 apps.
- `reports/electron-desktop-app-operations-2025/REPORT.md` at line 80-86 enumerates Cask for: VS Code, Obsidian, Slack, Discord, Claude Desktop (community), Linear (ToDesktop), Cursor = **7 apps**, with line 309 stating "5/7 ship Homebrew Cask." VS Code is explicitly listed with "Homebrew Cask" at line 80 of that report.
- The ambiguity: the electron-ops report's list at lines 80-86 shows Cask for all 7 apps, but line 309 says "5/7." The ok-research report + this spec follow the "5/7" count but then list 6 apps, which is inconsistent with both possible correct counts (7/7 per the row enumeration, or 5/7 per the summary line with only 5 apps listed).
**Status:** INCOHERENT (internal) + UNVERIFIABLE (which count is correct without reconciling the operations report)
**Suggested resolution:** Either (a) re-count against a single canonical source and correct to "6 of 7 (excluding VS Code)" with the 6-app list as authoritative, or (b) keep "5 of 7" and shorten the parenthetical to 5 apps. The spec should match its cited source; the operations report itself is internally ambiguous and should be reconciled as a prerequisite.

### [H3] D3 pointer mis-anchors "line 33 / line 34" into a non-numbered bullet list (COHERENCE / L1 + FACTUAL / T1)
**Location:** SPEC.md:114 (FR row 2), SPEC.md:200 (D3 Implications), SPEC.md:346 (§16 SCOPE), SPEC.md:358 (§16 STOP_IF), SPEC.md:177 (§9 proposed solution), SPEC.md:11 (Links section) vs `specs/2026-04-08-cli-packaging/SPEC.md:33-35`
**Issue:** The spec repeatedly refers to "line 33 GUI/Electron" + "line 34 auto-update" in `2026-04-08-cli-packaging/SPEC.md` §3. Reading that file directly: §3 is a **flat bullet list** (not numbered rows):
- Line 33: `- **NEVER:** GUI/Electron packaging, Docker distribution`
- Line 34: `- **NOT NOW:** Cloud/remote deployment (Streamable HTTP transport), plugin system, auto-update`
- Line 35: `- **NOT UNLESS** user count exceeds single-machine: daemon mode, background process management, multi-server orchestration`

The line numbers happen to match today, but §3 has three non-goal bullets — not 5+ numbered "rows." Referring to them as "§3 NG1" (line 114), "two rows" (line 114, 200), etc. is a category mismatch; they aren't labeled NG1/NG2/NG3 in the source file. More importantly, these line numbers will drift if anyone edits that file above §3 before the corrigendum breadcrumb is applied.
**Status:** INCOHERENT (terminology: "NG1"/"two rows" implies structure that doesn't exist) + STALE-RISK (line numbers as anchors)
**Suggested resolution:** Change references from "§3 NG1" / "line 33" / "line 34" to either (a) quote-anchored: "the `NEVER: GUI/Electron packaging` bullet" and "the `NOT NOW: ... auto-update` bullet", or (b) explicitly note these are the first and second bullets of §3 Non-Goals. The corrigendum protocol in AGENTS.md is per-line, so the line numbers are still correct for the edit site, but the spec prose should describe them as bullets, not rows/NG1.

## Medium-severity findings (fix if easy)

### [M1] §15 Future Work "Explored" Homebrew Cask paragraph contains same count-mismatch as D13 (COHERENCE / L1 continued)
**Location:** SPEC.md:295
**Issue:** "5 of 7 reference Electron apps ship Homebrew Cask (Obsidian, Slack, Discord, Claude Desktop, Cursor; Linear via community cask)." — this enumerates 6 apps again (Obsidian, Slack, Discord, Claude Desktop, Cursor, Linear). Same issue as H2, but phrased differently (the semicolon before "Linear via community cask" suggests an aside, which could make the explicit count 5 before Linear + 1 aside = "arguably 5 + 1"). Still logically confusing.
**Status:** INCOHERENT (same root cause as H2)
**Suggested resolution:** Synchronized fix with H2.

### [M2] FR row 2 says "two corrigendum breadcrumbs" but AGENTS.md protocol requires applying to every occurrence (COHERENCE / L3)
**Location:** SPEC.md:114 (FR row 2), AGENTS.md §"Post-ship corrigendum annotations on shipped specs"
**Issue:** FR row 2 commits to exactly two breadcrumbs. The AGENTS.md protocol at the top of this file says: "Apply the breadcrumb to every occurrence of the corrected claim in the same doc." If `2026-04-08-cli-packaging/SPEC.md` mentions "GUI/Electron" or "auto-update" anywhere else in the file (e.g., in tables, the architecture overview, other rationale sections), those also need breadcrumbs. The spec assumes only §3 mentions them — not verified in this audit, but a future auditor will.
**Status:** Potentially INCOHERENT with AGENTS.md (depends on whether `2026-04-08-cli-packaging` has other occurrences of those claims)
**Suggested resolution:** Before shipping, `grep -n "GUI\|Electron\|auto-update" specs/2026-04-08-cli-packaging/SPEC.md` and ensure all occurrences get the breadcrumb, OR narrow FR row 2 to "all occurrences per AGENTS.md protocol (verified to be exactly two at §3)".

### [M3] NG5 citation inconsistency — D-dimension vs internal D (FACTUAL / T5)
**Location:** SPEC.md:47 (NG5)
**Issue:** NG5 cites `reports/cli-command-name-ok-okb/REPORT` but NG6, NG7, NG8, NG9 cite research-report dimensions (D6, D4, D7, D7). The research report's D7 (Short-Name / Bin Ergonomics) IS the bin-ergonomics dimension, but NG5 doesn't cite it — it only cites the collision-audit report. NG5 should also cite `reports/mastra-speakeasy-cli-install-recommendations/REPORT` §D7 for the landscape framing (ripgrep/fd/bat precedent) that NG5 implicitly relies on.
**Status:** INCOMPLETE citation
**Suggested resolution:** Add `[[reports/mastra-speakeasy-cli-install-recommendations/REPORT]] §D7` as a second citation on NG5.

## Low-severity findings (note for awareness)

### [L1] Bidirectional link unverified — research report lacks "see also this spec" pointer (COHERENCE / L5)
**Location:** REPORT.md:457-463 (Related Research section) vs SPEC.md:117 (FR row 5 "Should") + SPEC.md:178 + SPEC.md:241
**Issue:** SPEC.md claims (line 117 Should-row, line 178 §9, line 241 §13 Goal) "the research report gets a see-also pointer back." I grep'd REPORT.md's Related Research section — it lists 5 reports + the parent Electron spec, but does NOT include this spec (`specs/2026-04-20-cli-distribution-and-install-ux/`). The spec FR explicitly says "partially done; verify at finalization." Flagging explicitly: verify is pending.
**Status:** STALE (pending finalization per the spec's own note)
**Suggested resolution:** Add one line to REPORT.md:462 under Related Research: `[[specs/2026-04-20-cli-distribution-and-install-ux/SPEC]] — Decision codification of the D1-D9 recommendations + the `ok` bin decision.` — the spec anticipates this work.

### [L2] D13 list includes Cursor + Linear but REPORT Executive Summary at line 54 + electron-ops REPORT line 80-86 show Linear uses ToDesktop, which is not "community-maintained" (FACTUAL / T5)
**Location:** SPEC.md:210 (D13 Rationale)
**Issue:** D13 parenthetical qualifier "some community-maintained" is vague. Per `reports/electron-desktop-app-operations-2025/REPORT.md:85`, Linear uses ToDesktop (a vendor service), and Claude Desktop's cask is community-maintained. Cursor's is the Cursor team's own. The "some community-maintained" is technically true but obscures the distribution mechanism variety.
**Status:** IMPRECISE (true but low information)
**Suggested resolution:** Optional — rewrite as "5 of 7 reference Electron apps ship a Homebrew Cask (official or community-maintained)" and drop the listing, letting the research report carry the detail.

### [L3] D3 prose about "NEVER: GUI/Electron packaging, Docker distribution" partially reversed — Docker part not reversed (COHERENCE / L3)
**Location:** SPEC.md:200 (D3 Decision text)
**Issue:** D3 says the line 33 bullet is "reversed (Electron now in scope)". The actual bullet reads "NEVER: GUI/Electron packaging, Docker distribution" — a conjunction. Only the GUI/Electron half is reversed; Docker distribution remains NEVER (the Docker part is actually consistent with current direction). D3's description splits this correctly in the Implications column ("The Docker-distribution + cloud/remote + plugin-system + daemon-mode NGs remain consistent with current direction and are not touched"), but the Decision column's "line 33 'NEVER: GUI/Electron packaging' is reversed" elides the Docker-half-is-kept nuance. The corrigendum breadcrumb itself must be surgical — applied only to the GUI/Electron portion, not the whole bullet.
**Status:** IMPRECISE in Decision column; clarified in Implications column
**Suggested resolution:** Tweak D3 Decision cell to: "line 33's **GUI/Electron clause** (but not the Docker clause) is reversed..."

### [L4] NG4 citation — claim "0 of 7 reference Electron apps" internally consistent but uses different app list than D13 (FACTUAL / T5)
**Location:** SPEC.md:45 (NG4) and SPEC.md:205 (D8)
**Issue:** NG4 cites "0 of 7 reference Electron apps" but doesn't enumerate which. D8 at line 205 enumerates: "VS Code, Obsidian, Cursor, Slack, Discord, Claude Desktop, Linear" = 7 apps. Consistent internally. But D13 lists only 6 apps for "5 of 7." This asymmetry — 7 apps-without-npm but only 6 apps-in-Cask-list — is confusing; the 7th is VS Code (which ships Cask per electron-ops REPORT.md:80 but this spec implicitly excludes it from D13's "5 of 7" count). Connects to H2.
**Status:** INCOHERENT with D13 (see H2)
**Suggested resolution:** Resolves with H2.

## What passed

**Coherence:**
- L1 cross-findings: D1-D14 internally consistent (aside from H2 and M1).
- L2 confidence-prose: Evidence confidence labels (LOCKED / DIRECTED) consistently applied. Hedging (e.g., D14's "Partial" 1-way door) properly calibrated.
- L3 conditionality: Every NEVER and NOT NOW has explicit revisit conditions.
- L5 summary coherence: §9 Alternatives Considered correctly reflects the decision taxonomy in §10.
- L6 stance: Consistently decision-codification (durable record) — prescriptive only within the Agent Constraints frame (§16).

**Factual verification:**
- T1 codebase: `packages/cli/src/cli.ts` shows 13 imports (matches D11, contradicts NG8 — see H1). `packages/cli/package.json` bin map (D1) shipped per §8 claim.
- T3 dependency capabilities: `electron-updater` `auto_updates true` directive (D13) confirmed in Homebrew Cask DSL docs.
- T5 external: "Turbo is the only surveyed tool honoring DO_NOT_TRACK=1" confirmed in `evidence/d9-telemetry.md:47,51,127-132`. REPORT.md §D9 text at line 227 matches.
- `projects/v0-launch/PROJECT.md:15` confirms V0-20 in Andrew's "Later" bucket.
- Parent Electron spec G5 (line 50), G9 (line 54), NG3 (line 60), and "opt-in telemetry / Obsidian model" (line 106) all verified.
- CLAUDE.md → AGENTS.md symlink confirmed via `ls -la`.
- `evidence/d5-first-run-auth-scaffolding.md:61` confirms Mastra `--mcp <editor>` skips Claude Code (D4 rationale verified).
- §10 decision dependencies (D13 on V0-20, D14 on telemetry use case) match stated dependencies; no cycles.
- Q1-Q3 all Resolved; no pending P0s block audit gate.
- §16 SCOPE / EXCLUDE / STOP_IF / ASK_FIRST consistent with §10 — `packages/` explicitly excluded as expected for a docs-only spec.

## Unverifiable Claims

- The "5 of 7" Electron Cask count in both the spec and the research report depends on whether VS Code is counted as a "reference Electron app shipping Cask." `reports/electron-desktop-app-operations-2025/REPORT.md` is internally inconsistent: row 80 says VS Code ships Cask, summary line 309 says 5/7. Without resolving that operations-report ambiguity, the spec's downstream claim is unverifiable as stated.
- Metric 1 target "≥3 citations within 6 months" is a forward-looking goal; not auditable today.
