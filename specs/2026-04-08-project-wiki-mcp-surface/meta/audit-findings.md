# Audit Findings

**Artifact:** /Users/timothycardona/inkeep/open-knowledge/specs/2026-04-08-project-wiki-mcp-surface/SPEC.md
**Audit date:** 2026-04-08
**Total findings:** 8 (2 high, 3 medium, 3 low)

---

## High Severity

### [H1] Finding 1: STORIES.md Bucket 2 describes a rich MCP tool surface; SPEC locks a thin server with no file tools

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:** Section 9 "MCP server implementation" + Decision D2
**Issue:** STORIES.md T2.1 specifies "Build the MCP server with filesystem-compatible tool signatures: `read_file`, `write_file`, `edit_file`, `list_directory`, `search_files`" plus T2.2's knowledge-specific tools (`update_frontmatter`, `create_draft`, `apply_draft`, `discard_draft`, `get_active_context`). T2.3 describes additive enrichment in tool responses. T2.4 wires MCP writes through Hocuspocus DirectConnection. The SPEC under audit takes a fundamentally different approach: the MCP server exposes only `init` (plus extension tools `rebuild_catalogs` and `status`), and the agent uses its native Read/Write/Edit/Grep/Glob tools for all file operations. D2 explicitly locks this as "NOT just-bash proxy." This is a legitimate architectural decision, but the parent STORIES.md has not been updated to reflect it, creating a material contradiction between the spec and its parent planning artifact. A reader of STORIES.md would expect a 10+ tool MCP surface; a reader of this SPEC would expect 1-3 tools.
**Current text:** "Agent uses native tools (Read, Write, Edit, Grep) for file operations. MCP server does NOT proxy file reads/writes" (Req table) and D2: "Thin MCP server (file watcher + catalog gen + instructions + init), NOT just-bash proxy"
**Evidence:** STORIES.md lines 85-94 (T2.1 through T2.10) describe a rich MCP tool surface with filesystem-compatible + knowledge-specific tools. PROJECT.md TQ21 marks just-bash as Open. The SPEC resolves this in favor of thin server but the upstream documents are unaware.
**Status:** INCOHERENT
**Suggested resolution:** Either update STORIES.md Bucket 2 to reflect the thin-server decision from D2, or re-examine whether the thin-server approach satisfies all the user stories in Bucket 2 (especially U2.2, U2.3, U2.4, U2.7 which describe enriched reads and CRDT-propagating writes that native file tools cannot provide).

---

### [H2] Finding 2: Risk table references just-bash fallback despite D2 locking it out

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** Section 14 "Risks & mitigations" row 3 + Decision D2
**Issue:** Risk row 3 states "just-bash limitations discovered during implementation" with mitigation "Fallback to named MCP tools; just-bash is reversible (D2)." But D2 says the opposite: the decision is thin server, NOT just-bash. D2's resolution is LOCKED. The risk row implies just-bash is the implementation approach with a fallback to named tools, while D2 says just-bash was rejected. The risk is internally contradictory with its own cited decision.
**Current text:** "just-bash limitations discovered during implementation | Low | Medium | Fallback to named MCP tools; just-bash is reversible (D2)"
**Evidence:** D2: "Thin MCP server (file watcher + catalog gen + instructions + init), NOT just-bash proxy | T | LOCKED"
**Status:** INCOHERENT
**Suggested resolution:** Remove or rewrite this risk row. If just-bash is not the approach, the risk of "just-bash limitations" is moot. A relevant risk might be "native file tools insufficient for agent orientation" with mitigation "add named MCP tools if agents struggle without enriched responses."

---

## Medium Severity

### [M1] Finding 3: Q4 (frontmatter schema) marked Open but D23 resolves it

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** Section 11 "Open questions" Q4 + Section 10 "Decision log" D23
**Issue:** Q4 asks "What frontmatter fields are required vs optional?" with Status: Open and plan "Propose schema during iterate phase." However, D23 explicitly resolves this: "Frontmatter schema: `title` + `description` required, `tags` recommended, everything else optional (open schema)." Q4 should be marked Resolved with a reference to D23.
**Current text:** "| Q4 | What frontmatter fields are required vs optional? | P | P0 | No | Propose schema during iterate phase | Open |"
**Evidence:** D23: "Frontmatter schema: `title` + `description` required, `tags` recommended, everything else optional (open schema) | P | DIRECTED"
**Status:** INCOHERENT
**Suggested resolution:** Update Q4 status to "Resolved" and add reference: "Resolved: D23. `title` + `description` required, `tags` recommended, everything else optional."

---

### [M2] Finding 4: `instructions` classified inconsistently as tool, resource, and field

**Category:** COHERENCE
**Source:** L6 (stance consistency), L1 (cross-finding contradictions)
**Location:** Section 9 "MCP server implementation" (Tools table, Resources table), D16, requirements table
**Issue:** The spec refers to `instructions` in three different MCP primitive categories: (1) D16 lists it alongside tools: "MCP server tools: `init` + `instructions` (core)"; (2) the Resources table (Section 9) lists it as a Resource; (3) the requirements table and Phase 1 scope call it a "field." In the MCP protocol, `instructions` is a server-level capability (a string returned during initialization), not a tool or resource. The inconsistent classification could confuse implementers about how to expose it.
**Current text:** D16: "MCP server tools: `init` + `instructions` (core)" vs Resources table: "| `instructions` | Guides agent on wiki conventions..." vs Requirements: "MCP `instructions` field guides agent behavior"
**Evidence:** MCP protocol specification defines `instructions` as a server capability provided during the `initialize` handshake, distinct from tools and resources.
**Status:** INCOHERENT
**Suggested resolution:** Clarify that `instructions` is an MCP server capability (returned during initialization), not a tool or resource. Update D16 to say "MCP server tools: `init` (core)" and note `instructions` separately as a server capability. Remove from the Resources table or rename the table to "Server Capabilities."

---

### [M3] Finding 5: Amazon Science "94.5% of RAG" claim carried forward without verification

**Category:** FACTUAL
**Source:** T5 (external claims)
**Location:** Section 12 "Assumptions" A2
**Issue:** A2 cites "Amazon Science keyword search 94.5% of RAG" as evidence for the catalog+grep navigation approach. Two prior audits (meta/_audit-project-md-post-merge.md, meta/_audit-project-md-vs-projects-skill.md) flagged this same claim as unverified. The claim has now been carried through three artifacts (PROJECT.md, prior audit, this SPEC) without independent verification. Confidence is labeled HIGH despite this.
**Current text:** "Research: Amazon Science keyword search 94.5% of RAG; TQ17/TQ18"
**Evidence:** meta/_audit-project-md-post-merge.md line 231: "Phasing rationale 'Amazon Science found keyword search achieves 94.5% of RAG performance' -- carried forward from the prior audit. Still not independently verified." meta/_audit-project-md-vs-projects-skill.md line 235: same flag.
**Status:** UNVERIFIABLE
**Suggested resolution:** Either verify the Amazon Science citation (find the specific paper, confirm the 94.5% figure and its context/conditions) or soften the reference to "research suggests keyword search performs comparably to RAG at small scale" without the specific percentage. The HIGH confidence on A2 is supportable from TQ17/TQ18 alone; the Amazon Science claim is additive but unverified.

---

## Low Severity

### [L1] Finding 6: "Deep Wiki" referenced without context

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** Section 1 "Problem statement" (Complication paragraph)
**Issue:** The complication mentions "Deep Wiki generates a static snapshot but doesn't stay current" as a comparison point. No other artifact in the repository references "Deep Wiki," and no link or citation is provided. A reader unfamiliar with this product cannot assess the comparison. This is the only occurrence of "Deep Wiki" in the entire repository.
**Current text:** "Deep Wiki generates a static snapshot but doesn't stay current."
**Evidence:** Grep for "Deep Wiki" across the repository returns only this SPEC.
**Status:** INCOHERENT
**Suggested resolution:** Either add a brief parenthetical identifying Deep Wiki (e.g., "Deep Wiki (DeepWiki by Cognition/Devin)") or remove the reference if it's not load-bearing for the argument.

---

### [L2] Finding 7: Section 16 "Agent constraints" is empty placeholder

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** Section 16 "Agent constraints"
**Issue:** Section 16 contains only "*To be derived during finalization.*" This is a stub. For a Draft-status spec this is acceptable, but it should be tracked as an open item. The spec has detailed agent interaction patterns throughout (MCP instructions, CLAUDE.md conventions, AGENTS.md) but hasn't consolidated them into explicit constraints.
**Current text:** "*To be derived during finalization.*"
**Evidence:** Sections 9, 12, and the decision log all contain agent-relevant constraints that could populate this section.
**Status:** INCOHERENT
**Suggested resolution:** Either populate from the existing agent conventions scattered through the spec, or add a note in the open questions table tracking this as a pre-finalization task.

---

### [L3] Finding 8: Q5 marked "Partially resolved" but catalog format is fully specified in Section 9

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** Section 11 "Open questions" Q5 + Section 9 "Catalog file format"
**Issue:** Q5 says "Exact format TBD -- investigate during iterate phase" with status "Partially resolved." However, Section 9 provides a complete catalog file format specification including the INDEX.md template with frontmatter, article listings, and subfolder listings. The format appears fully resolved, not partially.
**Current text:** "| Q5 | What does the catalog file format look like? | P | P0 | Yes | ... Exact format TBD -- investigate during iterate phase | Partially resolved |"
**Evidence:** Section 9 "Catalog file format (INDEX.md)" provides complete templates for both folder-level and root-level INDEX.md files.
**Status:** INCOHERENT
**Suggested resolution:** Update Q5 status to "Resolved" and reference the catalog format specification in Section 9.

---

## Confirmed Claims (summary)

**Codebase claims (T1):**
- Init spike exists with Hocuspocus, persistence, file watcher, agent write endpoints (`/api/agent-write`, `/api/agent-write-md`) -- confirmed in `init_spike/src/server/`.
- @parcel/watcher is used in the init spike -- confirmed in `init_spike/src/server/file-watcher.ts` and `init_spike/package.json`.
- `.mcp.json` support in Claude Code -- confirmed as documented feature.
- Agent write endpoints exist -- confirmed across 8 files in init_spike.
- 48 research reports -- confirmed via `meta/report-catalogue.md` (exact count: 48).
- PROJECT.md and STORIES.md exist and define the broader project -- confirmed.
- Related specs (bidirectional-observer-sync, agent-markdown-writes) exist at referenced paths -- confirmed.
- Baseline commit `bfee3dc` exists in git history -- confirmed.

**Architecture claims:**
- D2's thin-server approach is internally consistent within the SPEC (excluding the just-bash risk row and STORIES.md divergence flagged above).
- The two-layer content model (articles + code-index) is well-specified and consistent throughout the document.
- File watcher loop prevention via content-hash is consistent with init_spike's disk bridge pattern (TQ26).
- Catalog regeneration propagation logic (child -> parent -> root) is coherently specified.

**External claims:**
- just-bash is a Vercel Labs project -- referenced in PROJECT.md TQ21 and the just-bash-virtual-filesystem-analysis report. Specific Mintlify 30K+ daily conversations claim is sourced from the report but not independently verified in this audit.

## Unverifiable Claims

- **Amazon Science "keyword search achieves 94.5% of RAG performance"** -- specific paper and figure not independently verified. Flagged in two prior audits. The underlying claim (keyword search is sufficient at small scale) is plausible but the precise percentage is unverified.
- **Mintlify "30K+ daily conversations" on just-bash** -- sourced from the just-bash-virtual-filesystem-analysis report. Not independently verified against Mintlify's public disclosures.
- **"Deep Wiki generates a static snapshot"** -- no evidence file or external reference provided. Product behavior claim without citation.
