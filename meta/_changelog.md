## 2026-04-07

### Walkable index design + search engine deferral
- **CC6 refined:** index.md files elevated from "derived data" to "primary agent navigation mechanism." Recursive uniform structure at every folder level (same format root to leaf). Placement: in content folders, committed to git. Auto-regenerated on content change. MCP tools reject writes; editor marks read-only. Frontmatter `generated: true` flag. Root index at project root (`index.md`), not `.openknowledge/index.md`.
- **S8 moved to Next:** Walkable index files + grep cover P0 agent orientation/discovery. Research grounding: RAPTOR (hierarchical > flat), Dust.tt (agents prefer tree nav), GraphRAG (97% token savings), Amazon Science (keyword 94.5% of RAG). No search engine dependency at P0.
- **Search engine deferred:** SQLite FTS5+sqlite-vec recommended when needed, Orama fallback. Slots in via `SearchEngine` abstraction layer when S3/S8 promoted. Decision and reports preserved.
- **TQ18 updated:** "Orama and regex complementary" → "Index files and regex complementary." Index.md for orientation/discovery, grep for targeted extraction.
- **TQ7 updated:** Pipeline simplified for P0 — index.md files + backlinks only. Search index deferred.
- **TQ24 added (Decided):** Portability principle — any coding agent at any folder depth sees the same index.md structure. Works without our product running.
- **PQ17 added (Open):** Root index scope at P0 — list all articles flat (~2KB at 100) or folders only (~400B)?
- **S4 updated:** Root index path fixed from `.openknowledge/index.md` to `index.md`. Progressive disclosure updated: index files + grep for P0, search engine added later.
- **Evidence:** /reports/kb-index-navigation-patterns-for-agents/ D9 (walkable tree patterns), /reports/orama-vs-ripgrep-indexed-grep/ D7 (agentic search patterns), /reports/search-engine-decision/ (preserved for when search is needed), /reports/search-engine-advanced-capabilities/ (new).
- **Terminology note:** "Index / search / content" three-layer naming is our synthesis, not the industry's explicit language. 8 implementations converge on structurally similar patterns but use different terminology.

## 2026-04-03

### Runtime decision + project decomposition milestone
- **TQ23 added (Decided):** Node.js for distribution, Bun for development. Hybrid — single npm package, both runtimes. 8/9 deps Bun-compatible. @parcel/watcher needs workaround.
- **File watcher confirmed:** @parcel/watcher (1-5ms) for external write detection. Already in CC1. Bun workaround viable.
- **Evidence:** runtime-decision-bun-node.md created. Report at /reports/bun-vs-node-runtime/.
- **Project decomposition milestone:** All remaining open questions are within stories (spec-level), not between stories (project-level). Architecture, techstack, component model, editor model, CRDT model, persistence model, MCP tool design, extension model, competitive positioning — all decided. Ready for /spec on individual stories.

### Component ecosystem research captured
- **PQ8 resolved (Locked):** Extension model = React components with TypeScript interfaces. No separate plugin API. Fumadocs validates. shadcn for distribution.
- **TQ4 updated:** TipTap confirmed as foundation — zero competitive risk, complementary roadmap, maintained OSS core. See /reports/tiptap-2026-direction-overlap/.
- **Fumadocs runtime compatibility confirmed:** All content components pure client React, work in Vite. FrameworkProvider makes Next.js optional. DynamicCodeBlock for runtime syntax highlighting.
- **Content parity gap quantified:** ~3-4 days beyond Fumadocs for Obsidian parity. Math/Mermaid/Footnotes already solved. Knowledge graph features (S10) are the real investment.
- **S-L4 enriched:** Fumadocs graph-view.tsx exists, wire to S10 backlink index.
- **S-L7 added:** shadcn component registry (@openknowledge/*) — first knowledge-focused registry in 201+ ecosystem. GTM distribution channel.
- **Evidence:** component-ecosystem-findings.md created.

### S10 added: Wiki-links + backlinks — the knowledge graph
- Wikilinks (`[[Page Name]]`) as primary link format. Case-insensitive, shortest-path resolution.
- Dual adjacency list (forward + backward) built incrementally on `onStoreDocument` hook
- Same pipeline as auto-persistence and search indexing — one hook, three derived outputs
- Custom TipTap wikilink node via `@tiptap/suggestion` (no production extension exists — must build)
- 6 MCP link-graph tools: get_backlinks, get_forward_links, get_orphans, get_hubs, get_link_graph, suggest_links
- Branch-aware caching (CC6) with content-addressed deduplication
- TQ7 resolved: derived index IS the backlink + search index
- Research: /reports/wiki-links-backlinks-architecture/ (7 dimensions, 4 sub-reports, 24 evidence files)
- Fumadocs investigation: forward link extraction exists (`extractLinkReferences`), backlinks don't. `fumadocs-obsidian` has a `remarkWikilinks` plugin. Backlinks = inverting the existing forward graph.

### S9 added: Localhost editor embeddable in agent environments
- New Now story: the editor must be easily opened side-by-side with any AI agent
- Three integration points: Claude Desktop preview panel, Cursor browser panel, any browser for terminal agents
- Agent guidance: MCP instructions field + AGENTS.md tell the agent to suggest opening the editor
- "The agent brings you to the editor" — transforms from "tool you remember to open" to "agent promotes co-editing"
- Embeddability constraint: works as standalone AND as iframe, responsive to panel-sized viewports
- MCP Apps for persistent embedding is Later (spec immature — iframes are ephemeral, no state persistence)

### MCP Apps as embedded distribution channel
- Research: MCP Apps (Jan 2026) lets MCP servers return interactive HTML iframes inside agent UIs
- Supported by: Claude Desktop, Cursor v2.6+, ChatGPT, VS Code
- Our MCP server could expose both knowledge tools AND an interactive editor UI
- Cursor has native Chromium browser panel — zero-integration side-by-side
- CC5 updated with three delivery paths (standalone, Cursor panel, MCP App iframe)
- Architecture: editor must be embeddable (standalone + iframe)
- See /reports/ai-coding-tools-embedded-browsers/

### Research findings + architectural refinements captured (2026-04-04 late)
- **CC1 updated:** "CRDT is source of truth, files are projections" reframe. MCP reads from CRDT (fresh), not disk (stale).
- **XQ1 reopened:** Two approaches under consideration. Approach A (6-7 semantic tools) vs Approach B (1-2 exec tools via just-bash). Left as open question.
- **TQ17-TQ22 (new):** JS regex perf (2-8ms, faster than ripgrep), Orama+regex complementary, structuredContent not viable (most hosts ignore), simple-git recommended, just-bash as MCP layer (open), git worktrees for draft CRDT isolation.
- **8 research reports produced** in this session.

### TQ11 + TQ12 confirmed
- **TQ11:** Open → Decided (Directed). Import from Fumadocs as default stance. Import remark plugins + UI components. Pattern-copy only when coupling prohibitive.
- **TQ12:** Open → Decided (Directed). Vite. Hocuspocus embeds natively, no RSC issues, no SSR needed.

### TQ13 resolved: CRDT (Yjs + Hocuspocus) + git branches as complementary layers
- **TQ13:** Open → Decided (Directed). Use Yjs CRDT for real-time sync within active branch. Less code, more capability, battle-tested. No real argument against.
- **TQ14:** Open → Decided (Directed). Drafts are git branches. CRDT operates on whichever branch is active via Hocuspocus document naming (`{branch}/{filepath}`).
- **TQ15:** Open → Decided (Directed). MCP writes via Hocuspocus DirectConnection → Y.Doc. Hocuspocus IS the coordinator.
- **TQ1:** Updated to reflect resolved mechanism.
- **CC1:** Rewritten. No longer "architecture open." Two complementary layers: CRDT (within branch) + git (between branches). Branch merge is text-level, never CRDT-level. Hocuspocus document naming is the branching mechanism. Branch switch = editor remount + Hocuspocus loads new Y.Docs. Three write paths documented (MCP primary, human via editor, external via file watcher fallback).
- **Research:** /reports/crdt-branching-namespacing-prior-art/ — no production system has done this exact pattern. Upwelling (Ink & Switch) validates concept. Loro has native branching but ecosystem too young. Yjs merge of diverged docs interleaves characters — confirms branch merge must be text-level.

### "Everything branchable" principle captured
- New architectural principle: all state is files-in-git (branch atomically) or per-branch cache (regenerable). Branching is free.
- CC6 rewritten: committed (index.md in git) vs cached (Orama, backlinks in .openknowledge/cache/<branch>/). Context switch = git checkout + cache deserialize.
- CC4 rewritten: one code path parameterized by git branch. MCP tools don't know about branches — they read/write files, git already switched them.
- Parallel to node_modules in code worktrees noted (worktree-orchestration-landscape report).

### Major architecture exploration: CRDT vs no-CRDT + MCP write path + drafts (2026-04-04)
- **XQ1 updated:** `mcp__openkb__` prefix + verb-only names confirmed. `instructions` field for routing. filesystem-mcp-rs validation cited. `grep` proposed.
- **CC1 rewritten:** CRDT architecture flagged as OPEN (was Decided Locked). Comparison table: CRDT vs no-CRDT across 8 dimensions. Key findings enumerated. Previous CRDT namespace design challenged.
- **TQ1 softened:** Locked → Directed. The NEED for sync is locked. The MECHANISM (CRDT vs WebSocket coordinator) is TQ13 (open).
- **TQ13 (new, CRITICAL):** CRDT vs no-CRDT. 4 levels. Research findings on both sides. Per-origin undo is strongest CRDT argument. MCP server needs editor state regardless.
- **TQ14 (new):** Git branches vs CRDT namespaces for drafts. Research strongly supports git branches.
- **TQ15 (new):** MCP write path coordination — how does the server hold editor state?
- **TQ16 (new, Locked):** Agent edit patterns are section-level (factual). Affects CRDT merge granularity question.
- **PQ16 (new):** Merge conflict approach. Three options.
- **Research captured:** file detection latency (25-50ms @parcel/watcher), virtualized MCP servers exist (corrects prior claim), filesystem-mcp-rs ~80-90% Claude Code parity, agent two-operation edit pattern.

### MCP tool design + index files + AI metadata placement
- **XQ1 updated:** Parked → Decided (Directed). MCP tools follow filesystem-compatible signatures (read_file, write_file, edit_file, list_directory, search_files) with additive enrichment on responses. Knowledge-specific tools only where no filesystem equivalent exists.
- **CC6 updated:** Added index files as fourth derived data type. Auto-maintained index.md at every folder, strictly computed from frontmatter + file structure, no LLM. Agent reads via standard read_file. Research: 8 implementations use tree/list catalogs, not graphs. Graph operations (orphans, most-connected) are skill outputs, not product tools.
- **S4 updated:** Tool names changed from domain-specific (get_overview, search_articles) to filesystem-compatible (read_file, search_files). Orientation via auto-maintained index files, not a special tool. Progressive disclosure through filesystem tools.
- **PQ15 (new):** AI-generated metadata placement — open product question. Three options: same frontmatter fields (no provenance), ai: namespace in frontmatter (clear separation), sidecar files (complete isolation).
- **Index files are strictly rule-based:** User confirmed. Computed from frontmatter + file tree. No LLM. Skills enrich articles' frontmatter, index files re-derive automatically.

### External write handling added to CC1
- Two write paths: primary (MCP → DirectConnection → CRDT, full features) and fallback (filesystem → file watcher → three-way merge into CRDT, degraded)
- Three-way merge: non-overlapping changes preserved from both sides. Overlapping conflicts: CRDT wins (human's active edits preserved), notification shown.
- Requires tracking base state (last Layer 1 persist) for three-way diff.
- External writes get origin: "external" for per-origin undo.
- Never a "file changed on disk" dialog — system absorbs and merges.

### Research findings captured in PROJECT.md (2026-04-04)
- **TQ11 (new):** Fumadocs reusability matrix — import (remarkStructure, remarkLLMs, ~800 lines standalone), pattern-copy (UI components, wiki-link resolution), build from scratch (editor, CRDT, MCP, backlinks, etc.). Import vs pattern-copy stance for UI components is open.
- **TQ12 (new):** Web framework decision — research recommends Vite over Next.js. Hocuspocus embeds natively, TipTap no RSC workarounds, no SSR needed for editor. Open for confirmation.
- **S4 updated:** Catalog (`get_overview`) emphasized as MOST important tool per KB navigation research (8 independent implementations converge). `read_article` now references remarkLLMs for agent-readable content.
- **S8 constraints updated:** Orama, bge-small-en-v1.5, @huggingface/transformers, remarkStructure→buildDocuments pipeline, seqproto serialization — all specifics from research.
- **CC6 search index updated:** Orama specifics, Fumadocs pipeline reuse, incremental indexing gap, seqproto startup.
- **CC3 updated:** Web framework references TQ12. Undesigned rendering paths listed.
- **Day-0 positioning updated:** Obsidian concurrency bug (vault.process/vault.modify silent failure) added as concrete evidence for "why CRDT matters."
- **Last verified date:** 2026-04-04

### Honesty audit — 7 items softened where I overstepped
- **XQ2 (competitive moat):** Locked → Assumed (High confidence). Added verification plan: re-assess when competitor ships bidirectional MCP + collab + markdown.
- **XQ3 (agent memory separate):** Directed → Assumed (Medium confidence). Four-layer taxonomy noted as research finding, not confirmed product scope. Added verification: monitor Mem0/Zep/Letta.
- **PQ5 (git vocabulary):** Locked → Directed. OpenDesign research was for designers; our P0 is developers. Exact labels flexible, test with users.
- **S8 (semantic search in Now):** Flagged as unconfirmed pending user decision. Research found keyword search sufficient at 100-1000 articles. Catalog may matter more than search quality.
- **Day-0 positioning:** Added "(proposed — refine during GTM planning)" to header.
- **S5 three switching moments:** Added "(proposed — validate with user testing)" to value statement.
- **TQ8 (debounce timings):** Locked → Directed. Noted timings are tunable parameters from OpenDesign/Hocuspocus defaults.
- Walking skeleton updated to reflect S8 unconfirmed status.

### Confirmed decisions captured (items 8-12 from audit)
- **PQ13:** Option D (smart conventions + batteries-included skills) for Karpathy end-to-end workflow — Decided (Directed)
- **PQ14:** Reference skills are a v1 deliverable (ingest, compile, Q&A, lint, index-maintenance) — Decided (Directed)
- **CC6:** Derived data indexes (backlinks, search, overview) added as cross-cutting concern. Three rule-based indexes maintained by product. Timing/trigger for updates is open.
- **S4:** Updated with 4-tool progressive disclosure pattern from research (get_overview, search_articles, list_articles, read_article). Research sources cited. Tool count and description guidance included.
- **Rabbit hole #1:** Fixed contradiction with S8. RAG (answer engine, generative AI) is the rabbit hole. Search index with embeddings (S8, representational AI) is not RAG. Distinction articulated.

### Permission model (Zanzibar-style) adopted
- Human vs AI content distinction reframed as relationship-based permissions, not content type labels
- Agents are subjects with permissions (owner, editor, proposer, maintainer, viewer) on content objects
- Draft behavior follows from permission: editor → main, proposer → draft, maintainer → overwrite
- Folder structure = permission boundaries (inheritance from folder to articles)
- PQ7 reframed from "project structure conventions" to "project structure as permission boundaries" — Decided (Directed)
- PQ9 dissolved — draft vs main determined by resolved permission, not user toggle
- New items: TQ10 (permission store implementation — frontmatter vs config vs full Zanzibar), PQ12 (init defaults for permissions)
- CC4 updated to reference permission model
- P0 default: agent is editor on everything (zero friction). User tightens as needed. Teams (Later): defaults flip.
- Evidence: evidence/permission-model-zanzibar.md

### KB index/navigation research complete
- Report: /reports/kb-index-navigation-patterns-for-agents/
- Key finding: industry converging on 3-layer progressive disclosure (catalog → discovery → full content)
- The enriched catalog IS the foundation — directory drill-down and graph traversal operate on top of it
- At 100-1000 articles, keyword search is sufficient (Amazon Science: 90%+ of RAG performance)
- No one has productized the auto-maintained catalog — highest-value gap
- 8 independent implementations converge: Anthropic Skills, OpenAI Codex, Aider repo-map, Context7, Azure, Karpathy, academic papers, Windsurf

### Evidence audit
- Retired: outcome-mapping-initial.md, story-decomposition-draft.md → meta/retired/ (superseded by PROJECT.md)
- Updated: worldmodel-key-findings.md (editor framework section reflects TQ4 decision)
- Updated: source-of-truth-analysis.md (void nodes resolve JSX round-trip risk)
- Updated: mdx-conversion-chain-risk.md (added resolution header — risk drove void-node architecture)
- Updated: tiptap-markdown-roundtrip.md (added void node context for JSX handling)
- No change needed: auto-persistence-architecture.md, editing-context-design.md, day0-obsidian-switcher-pain-points.md

### Component model: built-in = custom (Fumadocs pattern)
- Fumadocs pipeline research confirmed: component registration is a plain JS object mapping names → React components
- Built-in and custom components use the SAME mechanism — no separate "registry"
- Editor discovers components from mdx-components.tsx mapping
- Editor introspects props via react-docgen-typescript (same as OpenDesign)
- Editor renders the ACTUAL React component as live preview in void nodes
- Users add custom components by: write React component with TS props → register in mapping → editor auto-discovers
- Fumadocs' Source API (`{ files: VirtualFile[] }`) is the integration seam for publishing
- Runtime MDX compilation exists for instant editor preview
- TQ4 updated in PROJECT.md

### Unified editor architecture refined — void nodes for JSX
- Architecture simplified from "two separate editors per file type" to "one WYSIWYG editor with void nodes for JSX components"
- Registered components (Callout, Tabs, etc.) → visual preview + prop panel (CMS pattern, 12 systems validated)
- Unregistered components → mini CodeMirror with syntax highlighting inside void node
- Per-block code toggle: switch individual blocks to code view without leaving WYSIWYG for the rest
- Source toggle (S2) is file-level fallback to full CodeMirror
- Void nodes are atomic in CRDT — concurrent editing around components is safe
- S1, S2 rewritten. TQ3, TQ4 updated. CC1 simplified to primary y-prosemirror + secondary y-codemirror.next for source view.

### Dual-mode editor architecture decided (TQ3, TQ4 resolved)
- **4 research reports produced:**
  - MDX CRDT round-trip fidelity (7 sub-reports, 9 repos): /reports/mdx-crdt-roundtrip-fidelity/
  - MDX text editor + preview approach: /reports/mdx-text-editor-preview-approach/
  - CMS custom components landscape (12 systems): /reports/cms-custom-components-landscape/
  - Mintlify web editor deep-dive
- **TQ3 resolved:** Standard markdown WYSIWYG round-trip = low risk (proven). MDX WYSIWYG round-trip = high risk (6 failure vectors, zero prior art, 3-6 months). Dual-mode sidesteps MDX WYSIWYG entirely.
- **TQ4 resolved:** Dual-mode architecture. .md → WYSIWYG (TipTap/Milkdown + y-prosemirror). .mdx → CodeMirror 6 + live preview (y-codemirror.next). Both share Yjs/Hocuspocus/git.
- **Key findings that drove the decision:**
  - remark-mdx indentation drift (grows 2 spaces per cycle, never converges)
  - slate-yjs abandoned (July 2023, corruption bugs)
  - TinaCMS rejects expression props and imports
  - No system has inline WYSIWYG editing of structured component props (12 CMS survey)
  - Custom blocks: void nodes + prop panel is industry standard
  - Mintlify evolved from code+preview (v1) to WYSIWYG+code (v2) — validates dual-mode
  - y-codemirror.next maintained by Yjs author — prototype is days-to-weeks
- **S1, S2 stories updated** to reflect dual-mode. CC1 updated with two CRDT bindings.
- **New rabbit hole:** "Building WYSIWYG MDX editing" — explicitly flagged as 3-6 month trap.
- **Pre-mortem risk #3 updated:** from "markdown round-trip" to "dual-mode feels fragmented."
- **Custom block pattern:** OpenDesign's auto-extract from TypeScript + CMS void-node-with-panel pattern adopted.

## 2026-04-02

### Session start
- **Bet:** Build an agent-native knowledge platform — OSS core, cloud monetization, replaces Confluence/Notion/Mintlify
- **Origin:** Karpathy's LLM Knowledge Bases post (April 2, 2026) + OpenDesign architectural research (40+ reports)
- **Key strategic inputs from user:**
  - OSS base layer, accessible without enterprise procurement
  - Developers as evangelists, power users
  - Must work with Claude Code, Cowork, Cursor, Codex — the "brain" for agents
  - Auditable, inspectable, co-contributable by humans
  - Cloud/monetization: teams, SOPs, playbooks, help centers, docs, wikis
  - Own web UI — not Obsidian, control the interaction layer
  - Rich editing (Notion-grade) — humans and AI co-create, co-edit, co-maintain
  - Architecture aligned with OpenDesign (parallel products, shared DNA)
  - Reusable components = publishable MCPs/skills (executable operational knowledge)
  - Cowork compatibility required

### Phase 1 complete
- 7 decisions locked/directed, 5 open items (technical investigations), 3 parked
- Key decisions: zero LLM compute in OSS core, CRDT is P0 (not deferred), presence is P0, auto-persistence transferred from OpenDesign, compilation is a skill not a feature, ingest is a skill not a feature, frontmatter as source of truth
- Outcomes: 3 (editor, MCP server, storage+organization)

### Phase 2 complete
- 7 stories decomposed: 4 Now, 3 Next, 6 Later
- Now: S1 (editor) + S4 (MCP) + S5 (presence) + S6 (auto-persist) — the core loop
- Cross-cutting: CRDT layer, auto-persistence, web UI shell

### Audit findings addressed (18 findings: 4H, 8M, 6L)
- **H1 (walking skeleton):** Fixed — skeleton text now includes S2 with fallback note if TQ3 spike fails
- **H2 (Confluence 3x claim):** Softened to "5-10% with some enterprise contracts seeing larger increases"
- **H3 (PADLOCK citation):** Softened to "OpenDesign research citing collaborative editing literature" — exact study unverified but finding consistent with all shipping products
- **H4 (CC4 too long):** Refactored — bulk extracted to evidence/editing-context-design.md, CC4 trimmed to 6 lines matching CC1-CC3 pattern
- **M3/M4 (resolution gate):** Resolved — TQ2 subsumed by TQ4, TQ3 and TQ4 moved to Assumed, PQ2/XQ1/TQ5 moved to Parked with triggers, TQ7 downgraded to P2 and Parked
- **M5 (CC bidirectional refs):** Added story references to CC3 and CC4
- **L2 (TQ2/TQ4 redundant):** TQ2 marked as subsumed by TQ4
- **L4 (Next rationale thin):** Added named heuristics (dependency-first for S3, value-first for S7)

### Editing context model (drafts) explored
- Core tension: iterative AI sessions produce many intermediate states that shouldn't all be "live"
- Leaning toward "Drafts" as the isolation primitive — fork from main, iterate, apply or discard
- Three contexts: Main (quick edits, live), Draft (iterative work, isolated), Proposal (autonomous/review-gated)
- Competitor analysis: GitBook CRs (can't coexist with git sync), Mintlify (pure git, no abstraction), Notion/Confluence (no isolation at all), v0 (branch-per-chat, too rigid)
- PADLOCK finding: 14/14 users prefer isolation over transparent merge
- Key open questions: PQ9 (default for AI sessions?), PQ10 (MCP routing), PQ11 (suggest mode)
- CC1 updated: CRDT namespaces (main, drafts, proposals). CC4 rewritten as editing context model.

### Research complete (4 reports)
- Competitive landscape: 7 primary + 12 secondary competitors. White space validated. Report at /reports/openknowledge-competitive-landscape/
- Fumadocs vs Mintlify: Architecture, MDX parsing, project structure. Report at /reports/fumadocs-vs-mintlify-architecture/
- Anthropic knowledge positioning: Skills vs KBs taxonomy, agentskills.io governance, convergence gap. Report at /reports/anthropic-knowledge-infrastructure-positioning/
- Mintlify 2026 blog deep-dive: KB Agent (internal Slack→docs tool) is first agent-write signal but not shipped. Gaps persist.
- Key findings fed back into PROJECT.md: XQ2 (competitive moat validated), XQ3 (agent memory is separate layer), TQ9 (S2 promoted to Now)

### Phase 3 complete
- Phasing rationale: customer-journey-first + value-first + dependency-first
- Walking skeleton validated: Now delivers standalone value
- 6 rabbit holes identified, 5 pre-mortem risks documented
- Key risk: editor quality is existential, MCP tool abstraction level is hard to get right
