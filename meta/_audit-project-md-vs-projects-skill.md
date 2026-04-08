# Audit Findings: PROJECT.md vs /projects Skill Requirements

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/PROJECT.md
**Audit date:** 2026-04-08
**Audit type:** Structural compliance + quality gate audit against /projects skill template, with coherence lenses (L1-L7) and factual verification (T1, T4, T5)
**Total findings:** 14 (4 high, 6 medium, 4 low)

---

## High Severity

### [H1] S2 story describes superseded architecture -- contradicts TQ25 and CC1

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** S2 (lines 317-330) vs TQ25 (line 108) vs CC1 (lines 148-160)
**Issue:** The S2 story description still describes the old serialize-on-toggle architecture, while TQ25 and CC1 document the new bidirectional observer sync architecture that was confirmed by PR #6 (browser E2E). The S2 story is stale and materially misleading -- an engineer receiving this story would implement the wrong architecture.
**Current text (S2):** "Architecture (validated by init_spike V4b): Source mode is NOT CRDT-bound (V7 unified YType failed -- Yjs v14 doesn't have it). Instead: serialize-on-toggle."
**Current text (S2 Constraints):** "Source mode is an independent text buffer -- no CRDT sync while in source mode. Edits only reach Y.Doc on toggle-back."
**Current text (S2 Forward):** "Collaborative source editing requires either Yjs v14 unified YType (not ready) or y-codemirror.next bound to a separate Y.Text with observer-based sync from Y.XmlFragment (no production precedent)."
**Evidence:** TQ25 says "CONFIRMED by PR #6 (browser E2E). Bidirectional observers between Y.XmlFragment('default') and Y.Text('source'). Toggle simplified to instant show/hide (no serialize-on-toggle)." CC1 says "Toggle simplified to instant show/hide (no serialize-on-toggle)." The codebase confirms: `init_spike/src/editor/observers.ts` implements `diffLines`-based bidirectional sync. PR #6 commit `5597eb7` is in the git log.
**Status:** STALE
**Suggested resolution:** Rewrite S2's Architecture, Constraints, Lateral, and Forward sections to reflect the bidirectional observer sync architecture (TQ25). Remove the "serialize-on-toggle" description. The Forward section should update to reflect that collaborative source editing is no longer "no production precedent" -- it exists in the codebase.

---

### [H2] S8 placement contradicts phasing rationale -- appears under Now but rationale says Next

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L5 (summary coherence)
**Location:** S8 (line 394, under "### Now") vs Phasing rationale (lines 498, 500)
**Issue:** S8 (Semantic search for humans and agents) is physically placed under the "### Now" section heading (between S10 at line 403 and "### Next" at line 424). But the phasing rationale explicitly says "S8 (semantic search) moved to Next" (line 498) and lists "Next: S3 + S7 + S8" (line 500). The Now header description also omits S8 from its list: "Now: S1 + S2 + S4 + S5 + S6 + S9 + S10" (line 496). An engineer reading the stories section sees S8 in Now; an engineer reading the phasing rationale sees S8 in Next.
**Current text (Phasing):** "S8 (semantic search) moved to Next." and "Next: S3 + S7 + S8"
**Current text (Story placement):** S8 appears at line 394, between S10 (line 403) and "### Next" (line 424), which is within the "### Now" section.
**Evidence:** Line numbers confirm: "### Now" at line 292, S8 at line 394, "### Next" at line 424. The phasing rationale text is unambiguous about S8 being Next.
**Status:** INCOHERENT
**Suggested resolution:** Move S8 to under the "### Next" heading, after S7 (or wherever appropriate in the Next section). The phasing rationale is correct; the story placement is wrong.

---

### [H3] S6 claims isomorphic-git but codebase uses simple-git

**Category:** FACTUAL
**Source:** T1 (own codebase verification)
**Location:** S6 (line 369)
**Issue:** S6 says "isomorphic-git for pure JS implementation" but the codebase uses simple-git. TQ20 (line 101) correctly states "Git library: simple-git -- validated by init-spike V5." The codebase confirms: `simple-git` appears in `init_spike/package.json`, `init_spike/src/server/persistence.ts`, and three other files. `isomorphic-git` appears in zero files.
**Current text:** "isomorphic-git for pure JS implementation"
**Evidence:** `grep -r "simple-git" init_spike/` finds 5 files. `grep -r "isomorphic-git" init_spike/` finds 0 files. TQ20 explicitly says simple-git was validated.
**Status:** CONTRADICTED
**Suggested resolution:** Replace "isomorphic-git for pure JS implementation" with "simple-git" in S6 Constraints. Align with TQ20.

---

### [H4] Items table has 55 entries -- exceeds the anti-pattern threshold

**Category:** COHERENCE (structural compliance)
**Source:** /projects anti-pattern: "Items table bloat"
**Location:** Items table (lines 60-118)
**Issue:** The Items table contains 55 entries. The /projects skill's anti-pattern table flags "40+ items where most are implementation details" as a bloat anti-pattern. The skill's guidance says: "Apply the load-bearing heuristic: track formally only when the item creates precedent, is customer-facing, is foundational tech, is a one-way door, is cross-cutting, or creates divergence. Resolve everything else in conversation." Many Items (e.g., TQ17 regex performance, TQ19 structuredContent, TQ23 runtime choice, TQ24 catalog portability) are factual findings or implementation details rather than questions or decisions that create precedent.
**Current text:** 55 Items rows including TQ2 (subsumed), TQ16-TQ31, PQ15-PQ19.
**Evidence:** `grep -cE '^\| (PQ|TQ|XQ)[0-9]+' PROJECT.md` returns 55. The /projects anti-pattern threshold is 40+. Items like TQ17 ("JS regex on CRDT content: 2-8ms at 1000 files (faster than ripgrep)") and TQ19 ("structuredContent not viable") are factual findings, not open questions or load-bearing decisions.
**Status:** INCOHERENT (anti-pattern match)
**Suggested resolution:** Triage the Items table. Move resolved factual findings (TQ16, TQ17, TQ19, TQ24, etc.) into evidence files or inline them into the cross-cutting concerns/story sections where they're referenced. Keep the Items table for genuinely open, exploring, or load-bearing decided items. Remove the subsumed TQ2 row. Target: under 35 items.

---

## Medium Severity

### [M1] S1 mentions "TipTap or Milkdown" but TQ4 says TipTap is confirmed

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** S1 (line 295) vs TQ4 (line 71)
**Issue:** S1 says "One WYSIWYG editor (TipTap or Milkdown + y-prosemirror)" presenting the editor choice as still open. TQ4 says "TipTap confirmed as foundation" with the status "Decided (Directed)." The S1 description is stale.
**Current text (S1):** "One WYSIWYG editor (TipTap or Milkdown + y-prosemirror)"
**Current text (TQ4):** "TipTap confirmed as foundation"
**Evidence:** TQ4 status is Decided (Directed) with extensive rationale. Init-spike uses TipTap.
**Status:** STALE
**Suggested resolution:** Update S1 to say "TipTap + y-prosemirror" (remove "or Milkdown"). Also update S1 Constraints (line 313) which says "Editor framework choice (TipTap or Milkdown + y-prosemirror)" to remove the alternative.

---

### [M2] CC3 says "TQ12 (open)" but TQ12 is Decided (Locked) and validated

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** CC3 (line 181) vs TQ12 (line 91)
**Issue:** CC3 says "Web framework is TQ12 (open -- research recommends Vite over Next.js)" but TQ12 says "Decided (Locked)" and "Validated by init-spike V2 (browser-confirmed)."
**Current text (CC3):** "Web framework is TQ12 (open -- research recommends Vite over Next.js)"
**Current text (TQ12):** "Decided (Locked)... Validated by init-spike V2 (browser-confirmed)"
**Evidence:** TQ12's status column shows "Decided (Locked)."
**Status:** STALE
**Suggested resolution:** Update CC3 to say "Web framework is Vite (TQ12, Decided, validated by init-spike V2)" or similar.

---

### [M3] S4 claims 10 total MCP tools but S10 adds 6 more

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** S4 (line 347) vs S10 (line 414)
**Issue:** S4 says "Total: 5 filesystem-compatible + 5 knowledge-specific = 10 tools." S10 lists 6 additional MCP tools: `get_backlinks(page)`, `get_forward_links(page)`, `get_orphans()`, `get_hubs()`, `get_link_graph()`, `suggest_links(page)`. The 5 knowledge-specific tools listed in S4 are: `update_frontmatter`, `create_draft`, `apply_draft`, `discard_draft`, `get_active_context`. The S10 tools are not in this list. Total would be 16 tools, not 10. This matters because S4 cites research that "tool count is the strongest failure predictor."
**Current text (S4):** "Total: 5 filesystem-compatible + 5 knowledge-specific = 10 tools."
**Current text (S10):** "MCP tools for agents: `get_backlinks(page)`, `get_forward_links(page)`, `get_orphans()`, `get_hubs()`, `get_link_graph()`, `suggest_links(page)`."
**Evidence:** Counting: 5 (filesystem) + 5 (knowledge) + 6 (link graph) = 16. The S10 tools are clearly not in S4's enumeration.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) include the S10 tools in the S4 tool count and update the total, (b) clarify that S10's link tools are a separate namespace or optional extension, or (c) reduce the S10 tool surface. Given the cited research about tool count as failure predictor, this is a design tension that should be addressed, not just a counting fix.

---

### [M4] Phasing rationale lacks barrel count check and per-story heuristic assignment

**Category:** COHERENCE (structural compliance)
**Source:** /projects Phase 3 validation tests (barrel count check), quality-examples.md (phasing rationale)
**Location:** Phasing rationale (lines 494-503)
**Issue:** The phasing rationale names heuristics as a group ("customer-journey-first, value-first, dependency-first") but does not assign specific heuristics to specific stories with evidence, as required by the quality-examples.md correct example. The correct pattern (from quality-examples.md) is: "Auth is Now because it's a cross-cutting dependency that unblocks CLI, trace API, and dashboard (dependency-first). SDK basics are Now because they validate the core DX premise (risk-first)." Also, no barrel count check is mentioned anywhere in the phasing rationale, despite the /projects skill requiring it as a Phase 3 validation test. Now has 7 stories (S1, S2, S4, S5, S6, S9, S10) -- likely exceeding 2-4 barrels.
**Current text:** "Heuristics: customer-journey-first, value-first, dependency-first."
**Evidence:** quality-examples.md shows the correct pattern assigns heuristics per-story. phasing-heuristics.md says barrel count is a required validation test.
**Status:** INCOHERENT (does not match quality standard)
**Suggested resolution:** (1) Add barrel count check: state the assumed barrel count and verify 7 Now stories don't exceed it (or explain why they must ship together as one barrel/delivery group). (2) Assign heuristics per-story: e.g., "S1 is Now because it's the human surface without which no story delivers value (customer-journey-first). S4 is Now because it's the agent surface that 3 other stories depend on (dependency-first)."

---

### [M5] Next stories (S3, S7) lack promotion triggers

**Category:** COHERENCE (structural compliance)
**Source:** /projects Phase 3 validation test: deferral audit
**Location:** S3 (lines 426-433), S7 (lines 435-442)
**Issue:** The /projects skill requires every Next/Later item to have a promotion trigger: "Items without triggers are deferred permanently in practice because no one knows when to reconsider." S3 has a dependency note ("blocked by PQ7") but no trigger for when to promote. S7 has no trigger at all. All Later stories correctly have triggers.
**Current text (S3):** No trigger. Has "Constraints: Project structure conventions (PQ7, parked) will shape this."
**Current text (S7):** No trigger.
**Evidence:** phasing-heuristics.md validation test: "Does every Next/Later item have a temporal tag (NOT NOW + revisit trigger)?"
**Status:** INCOHERENT (missing required element)
**Suggested resolution:** Add promotion triggers: e.g., S3: "Promote when: PQ7 (project structure conventions) is resolved and core editing+MCP loop (Now) is stable." S7: "Promote when: S1+S4 core loop is production-stable and the first reference skills demonstrate the workflow."

---

### [M6] Later phasing rationale says "S-L1 through S-L6" but there are S-L1 through S-L8

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** Phasing rationale (line 502)
**Issue:** The Later phasing rationale says "S-L1 through S-L6" but the Later section includes S-L7 (shadcn registry) and S-L8 (frontmatter schema configuration).
**Current text:** "Later: S-L1 through S-L6 -- multiplayer, publishing, cloud, graph view, browser extension, connectors."
**Evidence:** Later section contains stories S-L1 through S-L8 (lines 446-492).
**Status:** INCOHERENT
**Suggested resolution:** Update to "S-L1 through S-L8."

---

## Low Severity

### [L1] Evidence & References section does not match template structure

**Category:** COHERENCE (structural compliance)
**Source:** /projects output template
**Location:** Lines 544-593
**Issue:** The /projects output template requires an "Evidence & References" section with subsections: Evidence Files, Research Reports, Code Repositories, External Sources, Upstream Artifacts. The artifact has only "## Research Reports" as a flat table. The 11 evidence files in `evidence/` and the upstream artifacts ("Traces to: Karpathy LLM Knowledge Bases vision + OpenDesign architectural precedent") are not structured per the template.
**Current text:** "## Research Reports" (flat table, no subsections)
**Evidence:** Template specifies 5 subsections. Artifact has 1.
**Status:** INCOHERENT (template deviation)
**Suggested resolution:** Rename to "## Evidence & References" and add subsections for Evidence Files (list the 11 files in `evidence/`), Code Repositories (e.g., the init_spike), External Sources, and Upstream Artifacts.

---

### [L2] Later story value articulations use dimension lists without intersection reasoning

**Category:** COHERENCE (quality gate)
**Source:** /projects anti-pattern: "Dimension lists without intersection reasoning"
**Location:** S-L1 (line 449), S-L3 (line 461), S-L5 (line 479), S-L6 (line 485)
**Issue:** Several Later stories use terse value statements that amount to dimension labels: "Monetization. Network effects. Team virality." (S-L3), "Team knowledge bases. The Confluence/Notion replacement story. Monetization trigger." (S-L1), "Fastest ingest path for individual use. High adoption driver." (S-L5). These don't connect dimensions with AND/BUT/because reasoning. The Now and most Next stories have strong intersection reasoning; Later stories are noticeably thinner.
**Current text (S-L3):** "Value: Monetization. Network effects. Team virality."
**Evidence:** quality-examples.md says dimensions should be "connected with AND/BUT/because."
**Status:** INCOHERENT (but low severity -- Later stories are expected to be thinner)
**Suggested resolution:** Add minimal intersection reasoning: e.g., S-L3: "Cloud hosting monetizes the IC adoption from Now (customer) AND enables team network effects (platform) BUT only after self-hosted adoption validates the core loop."

---

### [L3] S-L4 numbering is out of sequence -- S-L4 appears before S-L5, S-L6, but after S-L3

**Category:** COHERENCE
**Source:** L6 (stance consistency -- numbering convention)
**Location:** Later stories (lines 444-493)
**Issue:** Later stories are numbered S-L1, S-L2, S-L3, S-L4, S-L7, S-L5, S-L6, S-L8. S-L7 appears before S-L5 and S-L6, breaking sequential order. This suggests stories were reordered without renumbering.
**Current order:** S-L1, S-L2, S-L3, S-L4, S-L7, S-L5, S-L6, S-L8
**Evidence:** Line numbers: S-L4 at 464, S-L7 at 470, S-L5 at 476, S-L6 at 482.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Renumber to sequential order, or accept non-sequential IDs as stable identifiers (document the convention).

---

### [L4] "Last verified" date (2026-04-04) is stale relative to PR #6 content

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** Line 3
**Issue:** The "Last verified" field says 2026-04-04 but PR #6 (commit 5597eb7, "feat: bidirectional observer sync") introduced significant architectural changes. Items TQ25 and TQ26 reference PR #6 but the artifact's S2 story description has not been updated to match. The "Last verified" date should reflect whether the artifact content has been reviewed against the latest codebase state.
**Current text:** "Last verified: 2026-04-04"
**Evidence:** PR #6 introduced bidirectional observer sync which changed the architecture described in S2. S2 still describes the old architecture.
**Status:** STALE
**Suggested resolution:** After resolving H1 (updating S2), update the "Last verified" date to the date of the update.

---

## Confirmed Claims (summary)

**T1 (codebase verification):**
- TQ25 bidirectional observer sync: CONFIRMED. `init_spike/src/editor/observers.ts` uses `diffLines` from 'diff' library. PR #6 commit `5597eb7` exists in git log.
- TQ26 disk-CRDT bridge: CONFIRMED. `init_spike/src/server/file-watcher.ts` exists.
- TQ28 three-way merge: CONFIRMED. `init_spike/src/editor/three-way-merge.ts` exists.
- TQ8/TQ20 persistence + simple-git: CONFIRMED. `init_spike/src/server/persistence.ts` exists, `simple-git` found in 5 files.
- TQ15 Hocuspocus plugin: CONFIRMED. `init_spike/src/server/hocuspocus-plugin.ts` exists.

**T4/T5 (external claims):**
- TQ19 structuredContent issue #4427 "closed, not planned": CONFIRMED via GitHub API (`state: CLOSED, stateReason: NOT_PLANNED`).
- XQ2 kepano/obsidian-skills ~21K stars: CONFIRMED (web search shows ~21K-21.4K).
- XQ2 obsidian-mind ~1.3K stars: CONFIRMED (web search shows 1.3K).
- PQ14 Agent Skills spec 33+ agents: APPROXIMATELY CONFIRMED (web search says "over 30" agents, with named examples matching the artifact's claims).

**Structural compliance (confirmed passes):**
- Stories pass the "named beneficiary + observable change" quality gate (all Now and Next stories).
- Walking skeleton test: PASSES (phasing rationale explicitly addresses this).
- Dependency order test: PASSES (no Now->Later dependencies).
- Traceability test: PASSES (extensive evidence references in Items table and cross-cutting concerns).
- Progressive writing discipline: PASSES (artifact is in a valid state).
- Bet-level non-goals with temporal tags: PASSES (lines 22-27, correctly tagged NEVER/NOT NOW/NOT UNLESS).
- SCR format in strategic context: PASSES (Situation/Complication/Resolution structure clearly present).
- Rabbit holes: PASSES (6 rabbit holes with why-tempting + why-rabbit-hole + what-to-do structure).
- Pre-mortem: PASSES (6 failure modes + 4 assumption challenges).

## Unverifiable Claims

- **S4 line 347:** "Microsoft: 85% degradation as tools increase" -- specific percentage and attribution not verified. The general finding (tool count hurts performance) is directionally consistent with known research, but the specific "85%" figure and attribution to Microsoft was not independently verified in this audit.
- **CC6 line 224:** "RAPTOR (ICLR 2024) validated hierarchical summaries outperform flat retrieval" -- the paper existence is plausible but was not independently verified. "97% token savings from GraphRAG" was not independently verified.
- **S8 line 498:** "Amazon Science found keyword search achieves 94.5% of RAG performance" -- specific percentage not independently verified.
