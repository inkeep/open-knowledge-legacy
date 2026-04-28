# Audit Findings

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/reports/config-surfaces-vscode-and-claude-code/REPORT.md
**Audit date:** 2026-04-26
**Total findings:** 11 (0 high, 4 medium, 7 low)

Coverage: 7 coherence lenses (L1–L7) + 4 factual tracks (T2/T3/T4/T5; T1 N/A — artifact makes no claims about own codebase). Web-verified: ESLint 2018 incident, ESLint v9 release date + cascade-rationale blog, VS Code 1.75 release notes + Profiles GA categories, VS Code `ProfileResourceType` source enum, Claude Code Permissions docs (process wrappers, bypassPermissions, symlinks, settings precedence), Claude Code Security docs (trust verification + `-p` flag), Claude Code Hooks docs (event taxonomy), Workspace Trust 2021 blog, Cursor Workspace Trust default-off article, VS Code GitHub issues #37519, #40233, #68007, #247050, #282806.

The "stance held strictly factual / no recommendations" intent is upheld throughout. The report is calibrated, structurally consistent across the original D1-D7 and the follow-up D8/D9/D10, and the eslint-scope/eslint-config-eslint correction propagated cleanly. Findings below are tightenings rather than load-bearing errors.

---

## Medium Severity

### [M] Finding 1: Restricted Mode subsection prose says "four" but lists five categories

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions; same-section arithmetic)
**Location:** §D9 "What Workspace Trust gates — and what it doesn't" (REPORT.md:627–632)
**Issue:** Heading prose declares a count that doesn't match the enumeration that follows it.
**Current text:**
> "**Restricted Mode disables four concrete categories:**
> 1. AI Agents
> 2. Tasks (even enumeration prompts confirmation)
> 3. Debugging
> 4. Workspace settings tagged `@tag:requireTrustedWorkspace`
> 5. Extensions that haven't opted in via `capabilities.untrustedWorkspaces`"

**Evidence:** Five items are enumerated. The evidence file (`evidence/d9-threat-models.md` Finding D9.2) lists the same five items but does not commit a numeric count in prose, so the inconsistency was introduced when the evidence was condensed into the body. Both VS Code Workspace Trust docs and the 2021-07-06 blog support five categories (extensions, tasks, debug, restricted settings via per-setting `restricted` tag, AI Agents).
**Status:** INCOHERENT
**Suggested resolution:** Change "four" → "five" (the list is the canonical content; prose count should follow it).

---

### [M] Finding 2: "Five scope locations" for hooks but six are enumerated

**Category:** COHERENCE
**Source:** L1 (same-section arithmetic) + L4 (evidence-fidelity)
**Location:** §D3 "Hooks" subsection (REPORT.md:326)
**Issue:** Prose count contradicts the enumerated list immediately after.
**Current text:**
> "Five scope locations: managed → user → project → local → plugin → skill/agent frontmatter."

**Evidence:** The arrow-chain enumerates **six** locations: `managed`, `user`, `project`, `local`, `plugin`, `skill/agent frontmatter`. The evidence file (`evidence/d3-claude-code-topology.md` Finding D3.6) carries the same internal contradiction — its prose says "Hooks valid in 5 scope locations including managed" while the table beneath it has six rows. Claude Code Hooks docs (verified via WebFetch) support the six-location count.
**Status:** INCOHERENT
**Suggested resolution:** Change "Five" → "Six" in REPORT.md:326. Mirror the fix in `evidence/d3-claude-code-topology.md` Finding D3.6 heading. The enumeration is canonical; the count needs to follow.

---

### [M] Finding 3: ESLint process-wrapper list omits `time` (4 items) — evidence file and canonical docs have 5

**Category:** FACTUAL
**Source:** T4 (web verification) + L4 (evidence-fidelity)
**Location:** §D9 "Documented gaps in the permissions DSL" (REPORT.md:659)
**Issue:** REPORT body enumerates **four** process wrappers; evidence file and canonical Claude Code Permissions docs enumerate **five** (`time` is the missing item).
**Current text (REPORT body):**
> "Process wrappers strip a fixed list (`timeout`, `nice`, `nohup`, `stdbuf`)…"

**Evidence:**
- `evidence/d9-threat-models.md:132`: "Process wrappers strip a fixed list (`timeout`, `time`, `nice`, `nohup`, `stdbuf`)"
- Canonical Claude Code Permissions docs (verified via WebFetch 2026-04-26): "The recognized wrappers are `timeout`, `time`, `nice`, `nohup`, and `stdbuf`."

**Status:** CONTRADICTED (REPORT body inconsistent with both evidence and primary source; evidence is correct)
**Suggested resolution:** Insert `` `time` `` in REPORT.md:659 between `` `timeout` `` and `` `nice` `` so the body matches the evidence and the docs.

---

### [M] Finding 4: "a significant source of complexity" quote attributed to ESLint cascade; the blog applies the phrase to a different concept

**Category:** FACTUAL
**Source:** T4 (web verification) + L7 (inline source attribution)
**Location:** §D6 Choice 5 (REPORT.md:483); §D7 ESLint paragraph (REPORT.md:503); also in `evidence/d6-design-choices.md:67` and `evidence/d7-comparison-products.md:51`
**Issue:** The quoted phrase "a significant source of complexity" is presented as the ESLint blog's verbatim characterization of the cascade / directory-walking. Verified via WebFetch of `eslint.org/blog/2022/08/new-config-system-part-2/`: the blog applies that exact phrase to **recreating Node's `require` resolution mechanism**, not to the cascade itself. The cascade is described in different language ("directory-based config cascade [we wanted] to get rid of"; "dramatically reduces the disk access required as compared to eslintrc"; `overrides` was "the source of a lot of complexity").
**Current text (REPORT.md:483):**
> "ESLint *removed* its cascade in v9 because it was 'a significant source of complexity' and a perf cost"

**Current text (REPORT.md:503):**
> "the migration blog post frames the change as eliminating 'the config cascade of eslintrc' because directory-walking was 'a significant source of complexity' and a performance cost."

**Evidence:** Verbatim from the blog: "one of our biggest regrets about eslintrc was recreating the Node.js `require` resolution in a custom way. This was a significant source of complexity and, in hindsight, unnecessary." The blog's actual language about the cascade is "we wanted to get rid of the directory-based config cascade" and "dramatically reduces the disk access required."
**Status:** CONTRADICTED (quote misattribution; sentiment is roughly correct but the phrase isn't what the blog said about the cascade)
**Suggested resolution:** Either (a) drop the quote and paraphrase ("the cascade was framed as overly complex and a performance cost"); (b) replace the quote with one the blog actually applied to the cascade (e.g., "wanted to get rid of the directory-based config cascade" + "dramatically reduces the disk access required"); or (c) keep "a significant source of complexity" but reattribute it accurately (e.g., to "recreating Node's `require` resolution," which was a parallel motivator). Apply the same fix in evidence files.

---

## Low Severity

### [L] Finding 5: D8 evidence-file reference says "10 findings" but the file now has 11

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** References → Evidence Files (REPORT.md:772)
**Issue:** Stale enumeration after Finding D8.11 was added 2026-04-26.
**Current text:**
> "[evidence/d8-vscode-profiles-internals.md](evidence/d8-vscode-profiles-internals.md) — VS Code Profiles: 10 findings on resource enum, binding mechanics, deletion behavior, Partial Profiles, MCP-restart-on-switch, extension-binary sharing, `.code-profile` schema, Sync data-loss bugs (#208710), creation routes"

**Evidence:** `grep -c "^### Finding" evidence/d8-vscode-profiles-internals.md` returns 11 (D8.1 through D8.11). The changelog records D8.11 as added 2026-04-26.
**Status:** STALE
**Suggested resolution:** Change "10 findings" → "11 findings" and append "concurrent-window propagation" to the topical enumeration in the same line.

---

### [L] Finding 6: D2 "7 categories" for Profiles bundle survives un-flagged in the body, while D8 + Executive Summary correct it to 8

**Category:** COHERENCE
**Source:** L1 (cross-finding) + L3 (missing conditionality)
**Location:** §D2 "Profiles" subsection (REPORT.md:213–214) vs §D8 "Lifecycle and resource enum" (REPORT.md:519–525) and Executive Summary (REPORT.md:55)
**Issue:** §D2 says "A Profile is a bundle: Settings + Keyboard shortcuts + Snippets + Tasks + Extensions + UI State + MCP servers" (= 7 categories). §D8 explicitly notes "Parent D2.12's '7 categories' was based on documented count; source enum is 8" and lists `Settings, Keybindings, Snippets, Prompts, Tasks, Extensions, GlobalState, Mcp`. Executive Summary says "the source-of-truth resource enum has 8 categories (not 7 as the docs say)." A reader who only consumes §D2 gets the docs-number; a reader who reads through §D8 or the summary gets the source-number. Both are individually true (one cites docs, one cites source code) — but §D2 doesn't flag the discrepancy, and the §D8 acknowledgement uses "Parent D2.12's '7 categories'" which is in the wrong direction (D2.12 is upstream evidence; the §D8 framing reads as if §D2 is "downstream" of D8).
**Status:** INCOHERENT (mild — both true under different conditions; lack of conditionality at the §D2 site is the gap)
**Suggested resolution:** Add a one-clause conditional in §D2 (e.g., "Profile is a bundle: Settings + Keyboard shortcuts + Snippets + Tasks + Extensions + UI State + MCP servers (per docs; the source-of-truth `ProfileResourceType` enum has eight, see §D8)"). Cheap pointer-add; preserves both audiences.

---

### [L] Finding 7: bypassPermissions quote presented as verbatim is actually a paraphrase that elides the `.claude/commands|agents|skills` exemption

**Category:** FACTUAL
**Source:** T4 (web verification) + L7 (inline source attribution)
**Location:** §D9 "Documented gaps in the permissions DSL" (REPORT.md:663)
**Issue:** The text uses quote-bracketed prose ("Documented as 'skips permission prompts except writes to `.git`/`.claude`/`.vscode`/`.idea`/`.husky`.'") which signals verbatim, but the canonical docs (verified via WebFetch) are: "skips permission prompts. Writes to `.git`, `.claude`, `.vscode`, `.idea`, and `.husky` directories still prompt for confirmation… Writes to `.claude/commands`, `.claude/agents`, and `.claude/skills` are exempt and do not prompt, because Claude routinely writes there when creating skills, subagents, and commands."
**Evidence:** Source is canonical Claude Code Permissions docs. The exempt-from-exception subset (`.claude/commands|agents|skills`) is meaningful in agent-trust context — it's where attacker-controlled hooks/skills/agents land if a malicious file slips in.
**Status:** UNVERIFIABLE-AS-VERBATIM (quote is a paraphrase rather than a literal quotation; the substantive truncation is the exempt subset)
**Suggested resolution:** Remove the inner quotation marks so the line reads as paraphrase, OR expand the quote to include the exempt subset, OR add a brief footnote: "Subset exempt from this exception: `.claude/commands`, `.claude/agents`, `.claude/skills`."

---

### [L] Finding 8: "any AI-augmented editor faces this trade-off" generalizes from a single observation (Cursor)

**Category:** COHERENCE
**Source:** L2 (confidence-prose alignment) + L6 (stance consistency)
**Location:** Executive Summary (REPORT.md:56) and §D9 "Adjacent products" (REPORT.md:679)
**Issue:** The phrase "*any* AI-augmented editor faces the trust-vs-functionality trade-off" is universal in scope but rests on the Cursor-Anysphere observation alone. The §D9 evidence file (Finding D9.9 implication) is more cautious: "the trust-vs-functionality trade-off can break the product's value proposition, leading vendors to ship the gate disabled" — directional, not universal. The body uses italic *any* for emphasis, which strengthens the universal claim relative to the evidence.
**Status:** INCOHERENT (mild prose-vs-evidence over-projection)
**Suggested resolution:** Soften "*any*" to "AI-augmented editors generally face" or similar directional phrasing, OR add the observable basis ("seen explicitly with Cursor; same trade-off latent in other VS Code-fork agentic editors that ship Restricted-Mode-incompatible AI features"). Either keeps the stance consistent with §D9 evidence's hedge.

---

### [L] Finding 9: D7.3 "Backup and Sync plugin" stated assertively in body; evidence marks rebrand history as UNCERTAIN

**Category:** COHERENCE
**Source:** L2 (confidence-prose alignment)
**Location:** §D7 paragraph 3 (REPORT.md:505)
**Issue:** REPORT body: "an account-synced layer (currently the 'Backup and Sync' plugin)…" presents the current name without qualification. Evidence file (`evidence/d7-comparison-products.md` Finding D7.3) is explicitly: "**Confidence:** CONFIRMED for the shared/personal split + current 2026.1 sync product (Backup and Sync plugin); UNCERTAIN on exact rebrand history (Settings Repository → IDE Settings Sync → Backup and Sync) — current docs do not narrate it." The body inherits the CONFIRMED part of that confidence and drops the UNCERTAIN part.
**Status:** INCOHERENT (mild — confidence-label loss in synthesis)
**Suggested resolution:** Add "(2026.1)" or "(2026.1 IntelliJ IDEA bundle)" version-pin to the parenthetical, which removes the implicit "this was always the name" reading and matches the evidence's confidence shape.

---

### [L] Finding 10: §D4 row count "25" cited correctly for body, but reference doesn't clarify evidence has 27

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** References → Evidence Files (REPORT.md:768)
**Issue:** "25-row equivalence + asymmetry table" — accurate description of REPORT body's D4 table (rows 1-25). The evidence file `evidence/d4-side-by-side.md` actually has 27 rows; rows for "Recommended/suggested settings" (evidence row 22) and "Built-in default values" (evidence row 27) were omitted from the body distillation. Not a contradiction — but a reader who follows the evidence link expects the same row count and finds two extras.
**Status:** STALE (mild — body and evidence diverged; body is the right surface for distillation)
**Suggested resolution:** Either (a) accept divergence and note it explicitly ("25 rows in body; full 27-row table in evidence"), or (b) trim evidence to 25 rows for parity, or (c) decide both rows belong in the body and add them. Lowest-effort fix: (a).

---

### [L] Finding 11: D9 references-line "10 findings" — verified accurate (false alarm note)

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** References → Evidence Files (REPORT.md:773)
**Issue:** Initially flagged for stale-count parallel to Finding 5. After verification: D9 evidence file has exactly 10 findings (D9.1-D9.10). Reference is accurate. Recording here for transparency about what was checked.
**Status:** CONFIRMED (no action needed)
**Suggested resolution:** None.

---

## Confirmed Claims (summary, by track)

**T2/T3/T4 (Source-of-truth + dependency + web verification):**
- ESLint 2018 incident packages: `eslint-scope@3.7.2` and `eslint-config-eslint@5.0.2`; "eslint-loader" is folk-memory conflation. Correction propagated cleanly through Executive Summary, §D9 body, evidence/d9-threat-models.md (Finding D9.1, key-files-referenced, Negative searches), and meta/_changelog.md. ✓
- VS Code 1.75 = January 2023; Profiles GA had 6 categories. ✓
- VS Code `ProfileResourceType` source enum has 8 values: Settings, Keybindings, Snippets, Prompts, Tasks, Extensions, GlobalState, Mcp. ✓
- ESLint v9.0.0 released April 5, 2024 (REPORT says "April 2024"). ✓
- Workspace Trust shipped in VS Code 1.57 (July 2021); blog dated 2021-07-06; "ESLint vulnerability was a doozy because it runs when the workspace loads (this was our first modal dialog)" verbatim quote checks out. ✓
- Cursor Workspace Trust default-off; September 2025 Oasis Security disclosure; Anysphere committed only to publishing security guidance. ✓
- Claude Code 5-position settings precedence (Managed > CLI > Local > Project > User) and array-merge semantics for arrays incl. `permissions.deny`. ✓
- Claude Code "Trust verification: First-time codebase runs and new MCP servers require trust verification. Note: Trust verification is disabled when running non-interactively with the `-p` flag" — verbatim from canonical Security docs. ✓
- Symlink rule: allow-rules require both link and target match; deny-rules apply when either matches. ✓
- Claude Code hooks event count "~30 event types" — canonical docs list 28-32 events depending on counting (`UserPromptExpansion`, `PostToolUseFailure`, `PostToolBatch`, `PermissionDenied`, `StopFailure`, `Notification`, `SubagentStop`, `TeammateIdle`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `Elicitation`, `ElicitationResult` are present beyond the 15 named in REPORT). "~30" is a reasonable approximation. ✓
- Five VS Code .vscode/settings.local.json community requests since 2017 verified by issue number: #37519 (Nov 2017, closed Backlog), #40233 (Dec 2017, open Backlog), #68007 (Feb 2019, closed duplicate), #247050 (Apr 2025, closed not-planned/duplicate), #282806 (Dec 2025, open). All real, dispositions match REPORT claim. ✓
- #282806 cites `.env.local`, `docker-compose.override.yml` (and `tsconfig.json with extends`) as precedent — REPORT only mentions the first two; this is fine (representative sample). ✓
- "8 years after the initial 2017 request" arithmetic: 2017 → 2025 = 8 years. ✓
- D8.11 (added 2026-04-26): typed-IPC + per-window snapshot + reload-prompt mechanism — confidence labels (CONFIRMED for same-process, INFERRED for separate-process) match prose precisely. Source-code citations to specific files+lines support the claims. ✓
- bypassPermissions protected dirs (`.git`, `.claude`, `.vscode`, `.idea`, `.husky`) — match canonical docs (the exemption-within-exemption is the L7 nuance flagged in Finding 7). ✓
- Read/Edit deny rules apply to built-in tools, not Bash subprocesses; OS-level enforcement requires sandbox. ✓
- "Up to 5 rules may be saved for a single compound command" — matches canonical docs. ✓

**T5 (External claims spot-checks):**
- JetBrains gates VCS as part of Trust prompt; VS Code does not gate VCS in Restricted Mode — supported by JetBrains project-security docs. ✓
- Cursor's `.cursor/rules/*.mdc` model is current; `.cursorrules` legacy is being phased out — supported by Cursor docs. ✓
- direnv issue #556 open since repo's early days — basis for "Convention-only" classification. (Not re-verified in this audit; no claims contradicted.) ✓

**Stance check (L6):**
The "factual landscape only — no recommendations" stance holds throughout. Trade-off prose in §D6 is descriptive ("Each picked the merge model that fit its primary use case") rather than prescriptive. §D9 threat-model analysis stays in observation-mode ("Workspace Trust defends against X; the DSL defends against Y; each leaves the other's class largely undefended") without recommending a fix. §D10 cross-product survey explicitly tags "Absent" / "First-class" / "Convention-only" without arguing any tool should adopt the pattern.

---

## Unverifiable Claims

- **JetBrains rebrand history "Settings Repository → IDE Settings Sync → Backup and Sync"** — flagged as UNCERTAIN in §D7 evidence and surfaced in Limitations. No primary JetBrains source narrates the timeline. (See Finding 9 for related stance issue.)
- **Cursor `.cursorrules` formal deprecation date** — D7 evidence Negative-searches notes there is no formal deprecation date in Cursor's official docs; classification "legacy" rests on absence-from-current-docs + community framing. Reasonable inference, surfaced in evidence's Gaps.
- **D8.11 cross-process behavior with shared `--user-data-dir`** — INFERRED from architecture (no test or issue directly covers it). Confidence label correctly applied; surfaced in §Limitations.
- **Real-world incident catalog under the Claude Code permissions DSL** (analogous to ESLint-2018 for Workspace Trust) — surfaced in §Limitations as "not yet available." No claim was made; absence is correctly recorded.
- **Whether `agentPluginsHome` and `prompts` directories sync** — flagged as a gap in §D8 + §Limitations.
- **TOCTOU semantics in Claude Code symlink permissions** — flagged in §D9 + §Limitations as "not addressed in docs."

---

## Notes on coverage and methodology

- **L7 (inline source attribution)** is mostly a quick pass for this artifact — it is architecture-leaning rather than stat-heavy. The ESLint quote (Finding 4) and the bypassPermissions quote (Finding 7) are the only L7 hits.
- **L4 (evidence-synthesis fidelity)** spot-checked the most load-bearing claims: ESLint package names, VS Code Profile categories, Claude Code precedence + array-merge, D8.11 source-code citations, hook event count, process wrapper list. Findings 3 and 6 surfaced from this lens.
- **T1 (own codebase)** not applicable — the artifact makes no claims about Open Knowledge or its dependencies; it is purely external-system landscape.
- **D2.12 "MCP servers" inclusion in the 7-category Profile bundle** is structurally correct per canonical VS Code docs (MCP joined the bundle post-GA), even though the source enum's count differs from the docs' enumeration. This is not a contradiction; it's a docs-vs-source layering, correctly surfaced in §D8.
- The eslint-scope/eslint-config-eslint correction (the user's specific concern) propagated cleanly. No residual "eslint-loader" references remain anywhere except in `meta/_changelog.md` where it is correctly framed as the original mistaken prompt that was corrected.
