# Project: Build an agent-native knowledge platform

**Last verified:** 2026-04-04
**Traces to:** Karpathy LLM Knowledge Bases vision + OpenDesign architectural precedent
**Appetite:** Unbounded (AI-agent-driven implementation)

## Strategic context

**Situation:** AI coding agents (Claude Code, Cowork, Cursor, Codex) are becoming primary tools for developers and knowledge workers. These agents need access to structured knowledge — project context, SOPs, domain expertise, playbooks — to be effective. Today, this knowledge lives in Confluence, Notion, Google Docs, or scattered markdown files. None of these are agent-native: agents can't easily read from, write to, or reason over them. Separately, Obsidian proved that developers and knowledge workers love a good markdown editor — but Obsidian is closed-source, has no real-time collaboration, and isn't designed for agent co-creation.

**Complication:** The knowledge layer is becoming the bottleneck for agent effectiveness. An agent that can write code but can't access company knowledge (SOPs, product policies, domain expertise) is limited to generic output. Meanwhile, knowledge workers maintaining wikis and docs do it manually in tools hostile to agents. The emerging pattern (Karpathy's "LLM Knowledge Bases") — where agents compile, maintain, lint, and query knowledge — has no productized solution. It's a "hacky collection of scripts." AND the existing tools (Confluence, Notion) are GUI-first, locked-format, hostile to both agents and developer workflows. Obsidian is loved but closed-source and single-player. No tool exists that gives you Obsidian-grade editing + agent co-creation + git-backed versioning + a path to team collaboration.

**Resolution:** Build an agent-native knowledge platform. OSS core. Markdown files in git as the substrate. A rich editor that lets you flip between rendered rich editing and raw markdown (Obsidian-grade, not terminal-grade). An MCP server that makes the knowledge base a first-class tool for any AI agent. Humans and AI co-create, co-edit, co-maintain knowledge. Reusable knowledge components are publishable MCP servers/skills — executable operational knowledge, not just text. Local-first single-player to start, with architecture that gives a clear path to collaboration, publishing, and SaaS (replacing Confluence/Notion/Mintlify).

### Core architectural principle: agent-agnostic substrate
The product is a dumb, excellent substrate — a rich editor + MCP server + git-backed storage. No LLM inference in the OSS core. All intelligence comes from external agents (Claude Code, Cowork, Cursor, Codex) that the user already has. The cloud product MAY add a hosted AI orchestration layer, but it consumes the same MCP tools, CRDT protocol, and storage primitives as any external agent — no special access, no privileged APIs. Users on the cloud platform can use our hosted agent OR bring their own. The product doesn't care who's driving. Interoperable across any AI agent.

### Core architectural principle: everything branchable
All meaningful state is either files in git (switch atomically with branches) or per-branch local cache (regenerable from files). Branching is free — `git checkout draft` switches content + index files atomically. Cached derived data (search index, backlinks) deserializes in milliseconds or rebuilds from files on cache miss. One code path for everything — editor, MCP tools, persistence, derived data — parameterized by which git branch is active. Drafts, proposals, experiments are all just branches. No separate "draft state management" system — git IS the state management. See CC4, CC6.

### Bet-level non-goals
- **NEVER:** Run LLM inference in the OSS core. Cloud may add hosted AI as an optional consumer layer, but it uses the same interfaces as any external agent — no special access.
- **NEVER:** Build a general-purpose workspace (Notion's databases, spreadsheets, project management). This is a knowledge platform, not a workspace.
- **NOT NOW:** Team/multiplayer collaboration. Architecture must support it (CRDT-ready), but P0 is single-player IC.
- **NOT NOW:** Cloud hosting/SaaS. P0 is local-first. Cloud is the monetization path but not the entry point.
- **NOT NOW:** Publishing engine (Mintlify/GitBook replacement). The path must be clear but P0 is the editing + agent loop.
- **NOT UNLESS** Inkeep needs it: CX/support-specific features. This product is general-purpose. Inkeep may be a distribution channel but shouldn't constrain the product.

### Audience
**P0:** Individual contributor — developer or knowledge worker — using Claude Code or Claude Cowork. Needs a knowledge base their agent can reason over AND that they can edit with a rich, Obsidian-grade experience. Not just a viewer — a proper markdown IDE where you can flip between rich editing and raw source.

### Day-0 competitive positioning (proposed — refine during GTM planning)
**"Obsidian, but agent-native and collaborative."** Six words our P0 audience instantly understands.

Day-0 closest competitor is Obsidian — not because they're building what we're building, but because our P0 user already uses it. The comparison: "I have Obsidian + Claude Code MCP plugins. Why switch?" Our answer: Obsidian has no CRDT (agent writes and human edits collide — last-write-wins; confirmed: `vault.process` and `vault.modify` silently fail if called within 2 seconds of user editing — see /reports/obsidian-karpathy-workflow-deep-dive/), no presence (you can't see the agent working), no collaboration path (6-year-old feature request, 2,200+ votes, philosophical commitment to single-player), proprietary app (not OSS), desktop-only (no web, no Cowork), and 16+ community MCP plugins of varying quality vs our purpose-built MCP surface with progressive disclosure and draft management.

Second closest "competitor" is no product at all — a folder of .md files + Claude Code. That's Karpathy's current setup. We're the product that replaces the "hacky collection of scripts."

NOT day-0 competitors: Notion/Confluence (different audience/price/philosophy — Later competitive story for team/enterprise), Mintlify (docs publishing, not knowledge editing — overlap only at publishing Later story), AFFiNE/Outline (similar tech stack but different product category), Semiont (no product, just a vision).

### Dimensional value
- **Customer:** ICs get a knowledge tool where their AI agent is a co-creator, not just a consumer. Knowledge compounds instead of decaying.
- **Platform:** The MCP server + skill registry creates an ecosystem where knowledge bases become agent capabilities. Network effects as skills are shared.
- **GTM:** Developer-first OSS adoption. Developers evangelize. Teams adopt for shared knowledge. Enterprise pays for cloud.
- **Internal (Inkeep):** Validates that the same architecture serves CX/support knowledge bases. Potential integration path for Inkeep customers who need KB editing.

### Architectural precedent (OpenDesign)
This product shares architectural DNA with OpenDesign (a parallel Figma-alternative exploration). The following OpenDesign research directly transfers:
- Yjs YText as canonical CRDT per file (Report 11 §9)
- Hocuspocus for collab server (Report 11 §5m)
- Git auto-persistence with WIP refs (Report 46)
- MCP filesystem bridge — agent writes through CRDT (Report 13)
- Awareness protocol for co-presence (Report 11 §5l)
- Human+AI concurrent edit defense (Report 11 §5b)
- PR-based review for agent-proposed changes (Reports 44-45)
- Per-user undo via trackedOrigins (Report 11 §5d)

Two parallel product explorations, NOT one product. Architecture aligned where it makes sense.

## Items

| ID | Item | Type | Priority | Status | Notes |
| PQ1 | Presence/awareness UX is P0 for human+AI co-editing | Product | P0 | Decided (Directed) | AI cursor, sidebar presence, activity feed, origin shading, "AI is typing" indicator. The AI is a collaborator — without presence, co-editing feels like a haunted document. Same Yjs awareness protocol extends to multi-human later. Direction set; UX details flexible. |
| TQ1 | Real-time sync: Yjs CRDT via Hocuspocus | Technical | P0 | Decided (Directed) | Human edits in web UI + agent edits via MCP = two processes writing same content. Sync mechanism: Yjs + Hocuspocus + y-prosemirror (TQ13 resolved). Y.Doc per file per active branch. Agent writes via DirectConnection. Per-origin undo via trackedOrigins. Presence via awareness protocol. |
| TQ2 | ~~Rich markdown editor technology choice~~ | Technical | P0 | Subsumed by TQ4 | Merged into TQ4. TQ4 has the refined candidate set. |
| PQ2 | "Flip between rich editing and raw markdown" — UX model | Product | P0 | Parked | Obsidian has three modes (reading, source, live preview). We need at minimum a two-mode toggle (WYSIWYG ↔ source). Three-mode or side-by-side are refinements. Trigger to resolve: during S2 story sharpening (/stories). The mode toggle UX is a story-level design decision, not a project-level architectural one. |
| PQ3 | Knowledge compilation — core P0 feature or power-user workflow? | Product | P0 | Decided (Locked) | Compilation is NOT a product feature — it's a skill that agents execute via MCP tools. The /research skill already does this: ingest sources, compile structured artifacts, maintain indexes, update surgically. The product builds great MCP tools; skills provide the compilation/query/lint workflows. This dissolves "compilation engine" and "query engine" as separate outcomes. |
| XQ1 | MCP interface design — OPEN between two viable approaches | Cross-cutting | P0 | Open | Two approaches under consideration, both with `mcp__openkb__` prefix. **Approach A (6-7 semantic tools):** `read`, `write`, `edit`, `list`, `search`, `grep` + draft tools. Filesystem-compatible signatures with additive enrichment. Agent learns our tools. **Approach B (1-2 tools via just-bash):** Single `exec(command)` tool backed by just-bash + YjsFileSystem. Whitelisted enriched commands (cat, grep, ls, find, sort, head, wc, diff, echo, search, draft). Agent uses Unix commands it already knows. Minimum tool count (research: #1 failure predictor). Composable (pipelines work). Custom commands for non-Unix operations (search, draft). Both approaches: read from CRDT (fresh, not stale disk), write through CRDT + permissions, enrichment in text output (not structuredContent — research found Claude Code, Cursor, Windsurf all ignore structuredContent; only ChatGPT reads it). `instructions` field + AGENTS.md for routing. See /reports/just-bash-virtual-filesystem-analysis/, /reports/virtualized-mcp-filesystem-servers/, /reports/mcp-tool-interface-design-agent-performance/. |
| PQ4 | Skill/MCP authoring and distribution — P0 or Next? | Product | P0 | Decided (Directed) | Skills are NOT a product feature — they're an ecosystem. The product is the substrate (editor + MCP + storage). Skills provide the intelligence (research, compilation, linting). OSS strategy: ship the platform + reference skills (e.g., a "research" skill that uses OpenKnowledge as its storage layer instead of ~/reports/). Users run skills from Claude Code/Cowork. Community creates/shares skills. The product's job: be a great target for skills. Direction set; exactly which reference skills ship with v1 is flexible. |
| TQ3 | Markdown round-trip: LOW risk. MDX handled via void nodes (no WYSIWYG conversion of JSX). | Technical | P0 | Decided (Directed) | Deep source-code research (7 sub-reports, 9 repos) proved full WYSIWYG MDX round-trip is a 3-6 month project with 6 failure vectors. Resolution: ONE WYSIWYG editor handles BOTH .md and .mdx. Standard markdown content → WYSIWYG blocks (proven, low risk). JSX components → void nodes storing raw JSX as string (no conversion, no round-trip issue — raw string in, same string out). Known components (Callout, Tabs) get visual preview + prop panel. Unknown components get a mini CodeMirror with syntax highlighting. Expression props, imports, arbitrary JSX all preserved because they're never parsed into editor structure. See /reports/mdx-crdt-roundtrip-fidelity/. |
| TQ4 | Editor: TipTap + y-prosemirror, unified WYSIWYG with void nodes + source toggle | Technical | P0 | Decided (Directed) | **TipTap confirmed as foundation** after 2026 direction research: zero competitive risk (they're "document infrastructure," not knowledge platform), maintained OSS core (MIT), complementary roadmap (Server AI Toolkit for agent editing, tracked changes — neither conflicts with our MCP/git approach). No alternative offers equivalent breadth. See /reports/tiptap-2026-direction-overlap/. One WYSIWYG editor (TipTap + y-prosemirror) for all files. JSX components as void nodes. Source toggle (S2) to CodeMirror. Per-block code toggle. **Fumadocs component compatibility confirmed:** all fumadocs-ui components are pure client React, work in Vite without modification. FrameworkProvider makes Next.js optional (`<a>/<img>` fallbacks). DynamicCodeBlock provides runtime syntax highlighting (Shiki in browser, pure JS regex, no WASM). See /reports/fumadocs-full-pipeline/evidence/component-runtime-compatibility.md. **Content parity gap with Obsidian: ~3-4 days** beyond Fumadocs (math/mermaid/footnotes already solved, collapsible callouts + inline tags are small builds). Knowledge graph features (S10) are the real investment. See /reports/obsidian-vs-fumadocs-component-inventory/. |
| TQ5 | OSS license strategy | Technical | P0 | Parked | Three viable options: AGPL (Docmost, Wiki.js — allows self-host, prevents SaaS forks), BSL (Outline — source-available but not "true OSS," community pushback), MIT+proprietary cloud (AFFiNE — MIT editor, proprietary server). AFFiNE's dual approach is the most relevant precedent. This is a strategic decision that doesn't block story decomposition or specification. Trigger: before public repo creation. |
| XQ2 | Competitive moat — validated by landscape research | Cross-cutting | P0 | Assumed (High confidence) | As of April 2026: no competitor occupies our space. Every incumbent is trapped: walled-garden AI (Notion, Confluence), proprietary format (Notion, Confluence, Outline), no collaboration (Obsidian), docs-only (Mintlify), CRDT-canonical not markdown (AFFiNE). MCP is table stakes — the differentiator is agent co-creation with presence (S5). Semiont (AI Alliance) is the closest philosophical competitor but pre-production. Verification: re-assess when any competitor ships bidirectional agent MCP + real-time collab + markdown-canonical. See /reports/openknowledge-competitive-landscape/. |
| XQ3 | Knowledge + agent memory appear to be separate layers | Cross-cutting | P0 | Assumed (Medium confidence) | Anthropic research suggests: agent memory (Mem0, Zep, Letta) is experiential knowledge that evolves through interactions — distinct from authored reference knowledge and procedural skills. Research also surfaced a four-layer taxonomy (reference → SOPs → skills → playbooks) as a way to categorize authored knowledge — this is a research finding, not a confirmed product scope. The landscape summary noted "organizational knowledge and agent memory are converging" — the boundary may blur. Verification: monitor Mem0/Zep/Letta — if they add human-authored content features, reconsider. See /reports/anthropic-knowledge-infrastructure-positioning/. |
| TQ9 | Source toggle (S2) phasing — promoted to Now | Technical | P0 | Decided (Directed) | Promoted to Now. Competitive evidence (Obsidian has it, Outline rejected it and is perceived as "basic") + P0 audience is developers. TQ3 (round-trip fidelity) is the gating technical risk — needs an early time-boxed spike to determine if it's a competitive moat or an intractable problem that changes product direction. Direction set; spike design and fallback plan flexible. |
| TQ6 | Organization model: frontmatter as source of truth | Technical | P0 | Decided (Directed) | Each .md file has YAML frontmatter (tags, description, relationships). Frontmatter is the canonical organization metadata — human-editable, git-friendly. Direction set. |
| TQ7 | Derived index — YES, needed for backlinks + navigation | Technical | P0 | Decided (Directed) | Resolved by S10 (wiki-links + backlinks) and CC6 (walkable index.md files). P0 pipeline on Hocuspocus `onStoreDocument` hook: (1) auto-generated index.md files (committed to git), (2) backlink graph (cached per-branch). Search index deferred to Next (S8). Two indexes in one pipeline for P0: backlinks + index.md files. See /reports/wiki-links-backlinks-architecture/, /reports/kb-index-navigation-patterns-for-agents/ D9. |
| TQ8 | Auto-persistence: no "save" button, git invisible | Technical | P0 | Decided (Directed) | Three-tier: crash recovery (CRDT→fs, 2-10s), auto-commits (WIP refs, 30-60s), named checkpoints (user-initiated). Users never see git. Timeline UX, not commit log. Transferred from OpenDesign Reports 44-46. Exact timings are tunable parameters, not constants — these are starting points from OpenDesign research and Hocuspocus defaults. See evidence/auto-persistence-architecture.md. |
| PQ5 | Git UX vocabulary — lean toward action language over git jargon | Product | P0 | Decided (Directed) | Lean: "Save Version" not "Commit," "Publish" not "Pull Request," "Start experiment" not "Create branch." Action-oriented language, no checkout/merge/rebase in UI. Transferred from OpenDesign designer-friendly-git-ux research (designed for designers). Exact vocabulary flexible — our P0 audience is developers who may prefer some git terms. Test with users. Direction set; specific labels flexible. |
| PQ6 | Ingest workflow — how do sources get into the KB? | Product | P0 | Decided (Directed) | No ingest product feature needed. Ingest is a skill — agent fetches/converts/saves via existing MCP tools. Product handles: drag-and-drop files/images in editor (part of S1), MCP write tools (S4). Reference "ingest" skill shipped as OSS alongside product. Browser extension is a high-value fast-follow but not P0. Direction set; drag-and-drop UX details flexible. |
| PQ7 | Project structure as permission boundaries | Product | P0 | Decided (Directed) | Reframed via Zanzibar-style permission model. Folder structure defines permission boundaries, not content type labels. Folders inherit permissions to articles within. Example: `/sops/` = agents are proposers (protected), `/compiled/` = compile skill is maintainer. Human vs AI content distinction is a permission relationship, not a content label. Direction set; implementation approach (frontmatter-only, config file, or full Zanzibar) is an open technical question. See evidence/permission-model-zanzibar.md. |
| PQ8 | Extension model = React components with TypeScript interfaces | Product | P0 | Decided (Locked) | The extension model IS the component model. Write a React component with TypeScript props → register in mdx-components.tsx → editor discovers it, introspects props, renders it in void nodes. No separate plugin API, SDK, or marketplace protocol. Same mechanism for built-in and custom. Fumadocs validates (all their components work this way). Distribution: shadcn registry model (`npx shadcn add @openknowledge/callout`). Validated: 201 shadcn registries exist, zero are knowledge-focused — we'd be the first. See /reports/obsidian-vs-fumadocs-component-inventory/, /reports/react-types-as-editor-schema/. |
| PQ9 | Draft behavior follows from permissions (Zanzibar model) | Product | P0 | Decided (Directed) | Dissolved by the permission model. Draft vs main is not a user toggle or skill request — it's the resolved permission. Agent has `editor` on content → writes to main. Agent has `proposer` → writes create draft automatically. Agent has `maintainer` → can overwrite entirely (regenerable content). The MCP write tool doesn't need a draft parameter — the product resolves the permission and returns the behavior. Direction set (mechanism); what the actual P0 defaults are is PQ12 (open). See evidence/permission-model-zanzibar.md. |
| PQ10 | MCP routing — how does the agent know main vs draft? | Product | P0 | Decided (Directed) | Skills manage context via MCP tools (`create_draft`, `apply_draft`, `discard_draft`, `get_active_context`). Default: writes go to user's active editor context. No mode parameter on every write. Skill-managed operations create their own draft. Simple interactions follow the user. Direction set; exact MCP tool signatures flexible. |
| PQ11 | Suggest mode — not needed | Product | P0 | Decided (Locked) | Agents don't make per-word/per-line suggestions — they rewrite sections or files in batches. Google Docs-style inline suggestions are a UX mismatch for agent output. Co-edit (live on main, batch undo via trackedOrigins) + draft review (section-level diffs, accept/reject per-article) covers the actual interaction pattern. No suggest mode needed. Review UX should show section-level diffs, not line-level — a fully rewritten section as line diff is just red/green noise. |
| TQ10 | Permission store implementation | Technical | P0 | Parked | Three options for implementing the Zanzibar-style permission model: (1) frontmatter-only — `maintained_by`, `protected` per file, folder policies in folder-level index files; (2) config file — `.openknowledge/permissions.yaml` for folder policies, frontmatter overrides per file; (3) full Zanzibar — SpiceDB/OpenFGA/Permify with relationship tuples in a database (Later, for teams). Could also be a TypeScript-first lightweight implementation of the relationship model. All implement the same conceptual model. Trigger: during S4 spec when MCP write behavior is designed. |
| PQ12 | Init/getting-started defaults for permission model | Product | P0 | Open | The permission model needs defaults that make a new project work without configuration. Key questions not yet decided: Should agents default to editor (write freely) or proposer (require review)? Should protection be opt-in or opt-out? What does `npx openknowledge init` scaffold — open by default, locked by default, or user chooses? How do skills signal what permissions they need? These defaults shape the day-0 experience and the trust model. Needs product decision. |
| PQ13 | End-to-end Karpathy workflow: Option D (smart conventions + batteries-included skills) | Product | P0 | Decided (Directed) | The product supports Karpathy's full workflow end-to-end. Option D: product has smart conventions (convention-aware MCP tools, auto-maintained backlink index, auto-maintained article index from frontmatter — all rule-based, no LLM) PLUS reference skills ship as OSS alongside the product (ingest, compile, Q&A, lint, index-maintenance). Product decisions/implications of this approach still need to be worked through. See evidence/day0-obsidian-switcher-pain-points.md. |
| PQ14 | Reference skills are a v1 deliverable | Product | P0 | Decided (Directed) | Reference skills (ingest, compile, Q&A, lint, index-maintenance) ship as OSS alongside the product. They are SKILL.md files with prompts and conventions — not complex code. They demonstrate the pattern, bootstrap the ecosystem, make the product useful on day 0. Without them, the Karpathy workflow doesn't work until someone writes skills. Exactly which skills and their scope is flexible. |
| TQ11 | Fumadocs reusability — import as default stance | Technical | P0 | Decided (Directed) | Default: import from Fumadocs packages. Import: remarkStructure, remarkLLMs, remarkHeading (standalone remark plugins, ~800 lines, zero Fumadocs coupling). Import: UI content components from fumadocs-ui (Callout, Tabs, Steps, Card — same rendering in editor AND published site, no context provider needed). Pattern-copy only when coupling is prohibitive (wiki-link resolution ~300 lines from fumadocs-obsidian — needs backlink computation + broken link collection we'd add). Build from scratch: editor, CRDT, MCP server, incremental indexing, presence, git pipeline, permissions, sidebar. See /reports/fumadocs-stack-reusability-deep-analysis/. |
| TQ12 | Web framework: Vite | Technical | P0 | Decided (Directed) | Vite. Hocuspocus embeds natively via configureServer hook (validated by OpenDesign). TipTap works without RSC workarounds. No SSR needed for a client-side editor. Simpler deployment. S-L2 publishing = separate Fumadocs deployment consuming same markdown files (Fumadocs has React Router adapter for Vite). See /reports/fumadocs-stack-reusability-deep-analysis/ D9. |
| PQ15 | AI-generated metadata placement | Product | P0 | Open | Where does AI-generated metadata live (summaries, auto-tags, related article suggestions)? Three options: (A) same frontmatter fields as human-written (simplest but no provenance — can't tell who wrote what, regeneration risks overwriting human edits), (B) separate `ai:` namespace in frontmatter (clear provenance, product can regenerate ai: without touching human fields, human can delete ai: block and nothing breaks), (C) separate sidecar file (complete separation, article stays clean, but filesystem clutter + agent needs to know about the sidecar). Affects: index file content (include ai: fields?), permission model (can AI overwrite human frontmatter?), update_frontmatter MCP tool design, skill conventions. |
| TQ13 | CRDT: Yjs + Hocuspocus for real-time sync, complementary to git branches | Technical | P0 | Decided (Directed) | After exploring 4 levels (file watcher → WebSocket → OT → CRDT), CRDT held: less custom code (~50 lines vs ~300-500), more capability (per-origin undo, cursor, multiplayer path), battle-tested. No real argument against — the "simpler" path is more code for less capability. CRDT and git are COMPLEMENTARY: CRDT for real-time sync within a branch (editor ↔ MCP). Git for isolation between branches (drafts, merge, history). Branch merge is ALWAYS text-level (git merge on .md), NEVER CRDT-level (Yjs interleaves characters on diverged docs — garbled). Hocuspocus document naming IS the branching mechanism: `{branch}/{filepath}` as document name → different Y.Doc per branch → zero library changes. Branch switch = editor remount (React key) + Hocuspocus loads new Y.Docs. No production system has done this exact pattern, but Upwelling (Ink & Switch) validates the concept. Loro has native fork/merge but ecosystem too young. See /reports/crdt-branching-namespacing-prior-art/. |
| TQ14 | Draft isolation: git branches + CRDT per active branch | Technical | P0 | Decided (Directed) | Drafts are git branches. CRDT (Yjs) operates on whichever branch is active — document names prefixed by branch. Branch switch = `git checkout` + editor remount + Hocuspocus loads branch's Y.Docs + cache deserialize (CC6). Human CAN co-edit within a draft (same CRDT mechanism as main — if human opens a draft, CRDT syncs on that branch). Industry convergence on git worktrees for agent isolation (Claude Code, Codex, Cursor 3, Windsurf). Branch merge = git merge --squash on .md files (text-level, never CRDT-level). See /reports/claude-code-worktree-git-isolation/. |
| TQ15 | MCP write path: Yjs Y.Doc via Hocuspocus DirectConnection | Technical | P0 | Decided (Directed) | Resolved by TQ13. Agent writes via MCP → Hocuspocus DirectConnection → Y.Doc → propagates to editor instantly. Y.Doc IS the in-memory state. No custom state management needed — Hocuspocus handles document lifecycle, persistence, WebSocket sync. External writes (file watcher) → diff → apply to Y.Doc. The MCP server is a Hocuspocus client, not a custom coordinator. |
| PQ16 | Merge conflict approach when applying drafts | Product | P0 | Open | Three options: (A) prevent conflicts — warn when human edits a file that's in a draft, (B) section-level visual merge — show "your version / draft version / keep both" per-section, (C) main wins — human's edits preserved, draft's conflicting sections shown as "couldn't apply, view draft's version." Option C is simplest for P0 (no merge UI needed, human's work preserved, agent retries). Options B needed for teams (Later). |
| TQ16 | Agent edit patterns: section-level, not character-level | Technical | P0 | Decided (Locked) | Research confirmed: agents apply changes via exactly two operations — full file write and string replacement. Both section-level. 8/11 agents use string replacement as primary. Claude Code enforces read-before-write and exact match. This is factual — affects TQ13 (CRDT merge granularity question). See /reports/ai-coding-agent-tool-surfaces/. |
| TQ17 | JS regex on CRDT content: 2-8ms at 1000 files (faster than ripgrep) | Technical | P0 | Decided (Locked) | Factual. V8 Irregexp JIT-compiled regex on in-memory strings: 2-8ms for 1000 files / 5MB. ripgrep from disk: 22ms (bottlenecked by process spawn + I/O). At our scale, in-memory JS regex is FASTER than ripgrep because ripgrep's advantages (SIMD, parallelism, mmap) solve I/O problems that don't exist when data is in CRDT memory. No WASM, no workers needed. Pre-split lines on CRDT update is the one optimization that matters (1.2-1.7x). Bun vs Node: no consistent regex winner. See /reports/orama-vs-ripgrep-indexed-grep/. |
| TQ18 | Index files and regex are complementary, not competing | Technical | P0 | Decided (Locked) | Factual, updated. P0 navigation: walkable index.md files for orientation/discovery (find articles ABOUT a topic via hierarchical browsing). Regex for exact pattern matching (find lines CONTAINING a pattern). At 100-1000 files, no search engine needed — index files + JS regex on CRDT content (2-8ms) cover both agent needs. BM25/vector search deferred to Next. For agents: index files serve Layers 1-2 (orientation + discovery), grep serves Layer 3 (targeted extraction). Research: /reports/orama-vs-ripgrep-indexed-grep/ D7, /reports/kb-index-navigation-patterns-for-agents/ D9. |
| TQ19 | structuredContent not viable for enrichment (most hosts ignore it) | Technical | P0 | Decided (Locked) | Factual. MCP structuredContent (added June 2025 spec) is ignored by Claude Code (issue #4427, closed "not planned"), Cursor (confirmed by team), Windsurf, n8n. Only ChatGPT Apps reads it. Enrichment MUST be in the text `content` field. Our command implementations embed metadata directly in string output (frontmatter already in files, backlinks as footer, titles/tags inline with grep results). No dual-format responses needed. See research on structuredContent support. |
| TQ20 | Git library: simple-git recommended | Technical | P0 | Assumed (High confidence) | simple-git: 6-12M weekly npm downloads, used by VS Code + GitHub Desktop pattern (native git CLI). isomorphic-git merge is broken (issue since 2018). Both can do in-memory index (plumbing commands: hash-object → mktree → commit-tree → update-ref, never touches .git/index). simple-git's .raw() for WIP plumbing, high-level API for branch ops. Subprocess spawn ~1.5ms (negligible for 30-60s operations). Verification: prototype during S6 spec. See /reports/git-library-for-knowledge-platform/. |
| TQ21 | just-bash as potential MCP implementation layer | Technical | P0 | Open | Vercel Labs' just-bash: TypeScript virtual bash with pluggable IFileSystem. 100+ Unix commands reimplemented. Mintlify ChromaFs built on it (30K+ daily conversations, ~100ms p90). A YjsFileSystem backend is viable (~8 methods). Enables: `mcp__openkb__exec(command)` as single MCP tool, whitelisted commands, composable pipelines, enriched output. Pattern validated by just-bash-mcp (community). Connects to XQ1 Approach B. Not yet decided — open product/technical question. See /reports/just-bash-virtual-filesystem-analysis/. |
| TQ22 | Draft branches need git worktrees for CRDT file isolation | Technical | P0 | Assumed (Medium confidence) | When agent creates a draft while human is on main, agent's Y.Docs need a separate file directory for persistence. Git worktrees provide this: `git worktree add .openknowledge/worktrees/restructure`. Draft Y.Docs persist to worktree directory. Main Y.Docs persist to project directory. Hocuspocus document naming (`{branch}/{filepath}`) routes to correct Y.Docs. Lazy-load: draft Y.Docs initialized from worktree files on first access. Verification: prototype during S6/CC4 spec. |
| PQ17 | Root index.md scope at P0 scale | Product | P0 | Open | At ~100 articles, should the root index.md list all articles with descriptions (~2KB, one read for full orientation) or just top-level folders with summaries (~400B, requires two reads to reach articles)? At 100 articles, flat listing is small enough to be useful. At 500+, folder-only root becomes necessary. May not need to decide before prototyping — testable with real agent behavior. |
| TQ24 | Index.md portability principle: any coding agent at any folder depth sees the same structure | Technical | P0 | Decided (Directed) | If a coding agent enters a folder at n-depth, the experience should be identical to entering at the root — the agent finds an index.md listing children with titles and descriptions, and can navigate from there. Same recursive structure at every level. This means index.md works for ANY agent (Claude Code, Cursor, Codex) without our product running — it's just markdown files. The walkable index IS the portable agent interface. No MCP server required for basic navigation. |
| TQ23 | Runtime: Node.js for distribution, Bun for development (hybrid) | Technical | P0 | Decided (Directed) | Node.js for `npx openknowledge` distribution (stable, universal, LTS). Bun for dev tooling (7x faster install, native TS, faster tests). Single npm package serves both — zero Bun-specific APIs needed. 8 of 9 key dependencies work in Bun; @parcel/watcher needs trustedDependencies workaround (acceptable for dev). Performance advantages (2-7x WebSocket, 3-4x startup) irrelevant at local-tool scale — bottleneck is react-docgen-typescript (10-15s, CPU-bound, runtime-agnostic). See /reports/bun-vs-node-runtime/. |

## Cross-cutting concerns

### CC1: Real-time sync — Yjs CRDT + Hocuspocus, complementary to git branches (TQ13 resolved)

**The CRDT is the source of truth during editing. Files on disk are projections.**
Y.Docs hold the live content. .md files are serialized projections (2-10s behind via persistence hooks). MCP tools read from CRDT (fresh), not from disk (stale). Index.md files, backlink maps, and (when added) search indexes are all derived from CRDT content. This is structurally the same pattern as Mintlify's ChromaFs (content in a store, files as derived views) — just with Yjs instead of Chroma.

**Two complementary layers:**
- **CRDT (Yjs + Hocuspocus):** Real-time sync WITHIN the active branch. Editor ↔ MCP agent. Per-origin undo, in-document cursor, presence.
- **Git branches:** Isolation BETWEEN branches. Drafts, proposals, merge, history.

They don't interfere. Branch merge is ALWAYS text-level (git merge on .md files), NEVER CRDT-level (Yjs interleaves diverged docs). The CRDT operates on whichever branch is active.

**Hocuspocus document naming IS the branching mechanism.** Document name = `{branch}/{filepath}`. Different name = different Y.Doc. Main: `main/articles/deploy.md`. Draft: `draft:restructure/articles/deploy.md`. Zero library changes — Hocuspocus already manages Y.Docs by name.

**Branch switch = editor remount:**
1. Serialize current Y.Docs (Hocuspocus persistence)
2. `git checkout` target branch (files switch atomically)
3. React key change → editor remounts → new y-prosemirror binding
4. Hocuspocus loads target branch's Y.Docs (from storage or from .md files)
5. Derived data: deserialize from per-branch cache (CC6)

**Three write paths:**
- **Primary (MCP):** Agent → `mcp__openkb__write/edit` → Hocuspocus DirectConnection → Y.Doc → propagates to editor instantly. Permission-checked. Per-origin undo via trackedOrigins.
- **Human in editor:** ProseMirror → y-prosemirror → Y.Doc → Hocuspocus persistence → disk (debounced 2-10s) → git (30-60s).
- **Fallback (external):** VS Code / Claude native tools write to disk → @parcel/watcher (25-50ms) → read file, diff → apply to Y.Doc → editor updates. Three-way merge: human wins on overlap. Never a "file changed on disk" dialog.

**CRDT bindings:**
- Primary: **y-prosemirror** — binds WYSIWYG editor to Yjs. Block-level CRDT. Void nodes atomic.
- Secondary: **y-codemirror.next** — binds source view (CodeMirror) to Yjs. Same Y.Doc.
- Mini CodeMirror in void nodes: edit string attribute on parent node, no separate binding.

**P0:** Hocuspocus embedded in Vite dev server (TQ12 — research recommends Vite). **Cloud (Later):** Hocuspocus hosted remotely. Editor + MCP tools unchanged — they talk to Hocuspocus either way.

### CC2: Auto-persistence (three layers, each serving a different concern)
Three layers with different frequencies because they serve different purposes:

**Layer 1: CRDT → filesystem (2-10s) — "your data is safe"**
Hocuspocus `onStoreDocument` hook with debounce (2s quiet / 10s max). Writes Yjs binary to disk. Crash recovery — if the process dies, at most 10s of edits lost. This is NOT git. Not human-readable. Just fast binary persistence.

**Layer 2: Filesystem → git auto-commit (30-60s idle-debounced) — "your history is browsable"**
Hocuspocus `afterStoreDocument` hook triggers git pipeline. Serializes CRDT → markdown files → git commit to WIP refs (invisible). 30s after you stop editing, OR 60s of continuous editing (whichever first). Why not faster: git degrades at high commit rates (30K commits = 11s for `git log` without optimization), and history becomes unbrowsable noise. Why not slower: 30-60s is enough granularity to rewind to "before Claude's last edit." Data safety is already handled by Layer 1 — this layer is for time travel, not crash recovery.

**Layer 3: Named checkpoints (user-initiated) — "this is a meaningful milestone"**
User clicks "Save Version." Squash-merge from WIP refs to main branch. Single clean commit with description. Annotated git tag. These are the prominent entries in the version timeline. Everything between checkpoints collapses in the UI.

Same pipeline applies to drafts — Layer 2 writes to `refs/drafts/<name>` instead of `refs/wip/<writer>/main`. When draft is applied, squash-merge creates one Layer 3 checkpoint on main.

No save button. No git terminology. Per-writer WIP refs for attribution. Pipeline uses Hocuspocus hooks (not filesystem watchers — race conditions with multi-file writes). See evidence/auto-persistence-architecture.md. Transferred from OpenDesign Reports 46 with evidence from Figma, v0, Lovable, Replit, Cline, Google Docs commit frequency strategies.

### CC3: Web UI shell
The application frame: sidebar/file tree, top bar, settings, routing between views. Built once as the foundation. Technology: React web app, local dev server. Web framework is TQ12 (open — research recommends Vite over Next.js).

Touches: S1 (editor pane), S2 (source toggle within editor pane), S3 (sidebar/file tree navigation), S4 (MCP status indicator), S5 (presence indicators in top bar + sidebar), S6 (version timeline panel, draft panel). Constrains: all stories share layout, routing, and theming.

Rendering paths not yet designed (resolve during /spec): MDX live preview compilation (for CodeMirror + preview pane), sidebar data source (CRDT doc list vs filesystem), search results UI, version timeline UI, draft review/diff UI.

### CC4: Editing contexts — one code path, parameterized by git branch
Three contexts: Main (live state), Draft (isolated workspace), Proposal (review-gated draft). Each is a **git branch**. The editor, MCP tools, sync layer, persistence pipeline, and derived data all work **the same regardless of which branch is active**. Git determines which files. Everything else follows.

**Context switch = `git checkout` + cache deserialize (CC6).** All .md files + index.md files switch atomically (git). Backlinks load from per-branch cache. Editor reloads. MCP tools read from new branch's files. One operation, everything consistent.

**Which context an agent writes to is determined by its resolved permission** (Zanzibar model — PQ7, PQ9):
- Agent has `editor` or `maintainer` → writes to current branch (main or draft)
- Agent has `proposer` → MCP server creates a draft branch automatically
- Skill explicitly calls `create_draft()` → new branch regardless of permission

**The MCP tools don't know about branches.** They read/write files. Git already switched the files. `mcp__openkb__read("articles/deploy.md")` returns the draft version when the draft branch is checked out — no branch parameter needed. Write operations commit to whichever branch is active.

Touches: S1 (same editor on any branch), S2 (source toggle on any branch), S4 (MCP tools parameterized by active branch), S5 (presence on active branch), S6 (persistence pipeline parameterized by branch target).

Constraints: agents produce batch rewrites → suggest mode not needed (PQ11). P0 default permissions are PQ12 (open). See evidence/permission-model-zanzibar.md and evidence/editing-context-design.md.

### CC6: Derived data — "everything branchable"
Content changes produce derived data. The architectural principle: **everything that matters is either a file in git (switches with branches atomically) or a per-branch cache (regenerable from files, fast to deserialize).** Branching is free — `git checkout draft` switches all files + index.md files atomically. Cached data deserializes in milliseconds. No recomputation on branch switch.

**Committed to git (switches with branches):**
1. **Index files** — auto-maintained `index.md` at every folder, including the project root. **Recursive, uniform structure:** every index.md lists its direct children (subfolders + articles) with titles and one-line descriptions. Same format at every level — root, subfolder, sub-subfolder. Agent enters at any level and sees the same shape. Computed strictly from frontmatter + file structure, no LLM. Frontmatter `generated: true` flag distinguishes from human content. MCP `write_file`/`edit_file` reject writes to generated index files; editor marks them read-only. External edits overwritten on next content change (same `onStoreDocument` pipeline). Delete all → product regenerates identically. On a draft branch, the draft's index.md files reflect the draft's articles — git handles this automatically.

**Index files are the primary agent navigation mechanism** — not just derived data. Research: RAPTOR (ICLR 2024) validated hierarchical summaries outperform flat retrieval; Dust.tt (April 2025) found agents spontaneously prefer tree navigation; GraphRAG showed 97% token savings from hierarchical summaries vs flat source; information foraging theory frames per-folder summaries as "information scent" that helps agents decide where to drill in. The specific pattern of per-folder index.md in a markdown KB appears novel, but building blocks are independently validated across 5+ systems. See /reports/kb-index-navigation-patterns-for-agents/ D9.

**P0: walkable index files + grep. No dedicated search engine.** At 100-1K articles, hierarchical index navigation + JS regex on CRDT content (TQ17: 2-8ms) covers agent orientation and discovery needs. Amazon Science (Dec 2025): keyword search achieves 94.5% of RAG performance at this scale. Search engine (BM25/vector) deferred to Next — slots in via `SearchEngine` abstraction layer when S8 or S3 is promoted. See /reports/search-engine-decision/, /reports/orama-vs-ripgrep-indexed-grep/ D7.

KB navigation research: 8 implementations (Aider repo-map, CLAUDE.md, AGENTS.md, llms.txt, etc.) converge on catalog-first progressive disclosure. Note: the "index / search / content" three-layer naming is our synthesis — the 8 implementations use different terminology (metadata, table of contents, repo-map, hot memory) but converge on structurally similar patterns.

**Cached per-branch (local, .gitignore'd, regenerable):**
2. **Search index** — deferred to Next (when S8 or S3 promoted). Engine: SQLite FTS5+sqlite-vec recommended, Orama as fallback. Behind `SearchEngine` abstraction layer (~200 lines per backend). See /reports/search-engine-decision/, /reports/search-engine-advanced-capabilities/.
3. **Backlink map** — reverse wiki-link index (~50KB). Serialized to `.openknowledge/cache/<branch>/backlinks.json`. On branch switch: deserialize. On cache miss: rebuild from article content (instant at 100 articles — just parse wiki-links).
4. **Embedding vectors** — deferred to Next (with S8). Per-article vectors (~1.5MB at 100 articles). Same cache pattern.

**Overview stats** (article counts by topic, recent changes) derived from index.md files (already on branch) — no separate cache needed.

**Context switch flow:**
```
git checkout drafts/restructure
  → all .md files + index.md files switch atomically (git)
  → deserialize backlinks.json from branch cache (~ms)
  → or rebuild on cache miss (instant at 100 articles)
  → editor loads ProseMirror from draft's files
  → MCP tools read from draft's files
  → everything consistent, one operation
```

**The parallel to node_modules in code worktrees:** search indexes are the KB equivalent — large derived artifacts you don't duplicate into git. Same patterns apply: per-branch local cache, regenerable on miss. See /reports/worktree-orchestration-landscape/ for code-world patterns (reflink copy, .worktreeinclude, Turborepo shared caches).

**Graph-level operations** (orphan detection, most-connected, broken links, connection paths) are SKILL outputs, not product tools. Research: no agent navigation implementation uses graph traversal for orientation.

Timing/trigger for derived data updates is an open design question — options discussed but not decided.

### CC5: Zero-friction onboarding + embedded distribution via MCP Apps
Day-0 adoption depends on setup friction being near-zero. Target: `npx openknowledge init` creates a project, starts the local server, opens the web UI. One line added to Claude Code MCP config. Total time to "agent can read/write my KB and I can see it in the editor": under 2 minutes.

Comparison: Obsidian + MCP plugin requires: install Obsidian, find a plugin (which of 12?), install it, configure vault path, configure Claude Code MCP, test, debug. Our setup must be dramatically simpler.

**MCP Apps as distribution channel (research finding 2026-04-03):** MCP Apps (released Jan 2026) lets MCP servers return interactive HTML that renders as sandboxed iframes inside agent UIs. Supported by Claude Desktop, Cursor (v2.6+), ChatGPT, VS Code. Our MCP server could expose BOTH knowledge tools (agent interface) AND an interactive editor UI (human interface) — one MCP server, two surfaces. The editor appears as a panel inside the agent's conversation. The agent writes via MCP tools, the user sees changes in the embedded editor. This is the "Lovable/v0 preview pane" pattern for knowledge editing.

Three delivery paths for the editor:
1. **Standalone web app** (localhost) — `npx openknowledge` → opens in browser. Works with any agent.
2. **Cursor browser panel** — user opens localhost URL in Cursor's built-in Chromium browser. Zero integration. Side-by-side with Cursor's AI.
3. **MCP App iframe** — editor renders inside Claude Desktop/Cursor/VS Code/ChatGPT conversation panel. One implementation, all clients.

Architecture implication: the editor must be **embeddable** — renderable as standalone AND as iframe inside MCP Apps. No reliance on full-page navigation, works within sandboxed iframe.

See /reports/ai-coding-tools-embedded-browsers/.

Touches: S4 (MCP server must auto-configure), S1 (editor must work immediately). Constrains: the init command must scaffold a working project with sensible defaults (no config required to start).

## Stories

### Now

#### S1: Create and edit articles with a unified WYSIWYG editor
One WYSIWYG editor (TipTap or Milkdown + y-prosemirror) handles both .md and .mdx files. The editor provides:

- **Markdown content → WYSIWYG blocks.** Headings, paragraphs, lists, tables, code blocks, images, links — fully editable as rendered blocks. Slash commands for inserting blocks. Drag-and-drop files and images.
- **Registered JSX components (Callout, Tabs, CodeGroup, etc.) → void nodes with visual preview + prop panel.** Slash command to insert. Click to open prop editing panel (auto-generated from schema — dropdowns, toggles, text inputs). Rich text children editable inline within the component block.
- **Unregistered JSX components → void nodes with mini CodeMirror.** Raw JSX displayed with syntax highlighting, line numbers, bracket matching. Edit the JSX string directly. Expression props, imports, arbitrary JSX all preserved because the raw string is stored verbatim, never parsed into editor structure.
- **Import/export statements → void code block at top of file.**
- **Per-block code toggle.** Any component block can switch between visual preview and code view independently — without switching the entire file to source mode.

P0 ships a set of default components (Callout, Tabs/Tab, CodeGroup, Steps, Accordion, Card, Embed) — but they use the SAME mechanism as custom components. All components are React components in the project, registered via the MDX components mapping (same pattern as Fumadocs' `mdx-components.tsx`). 

**Component introspection pipeline (hybrid auto-extract + override):** react-docgen-typescript reads the TypeScript interface → auto-generates prop controls (string→text input, boolean→toggle, union→dropdown). Optional override file (`.openknowledge/component-meta.ts`) upgrades specific controls (string→color picker, string→file picker). React.ReactNode props → handled as inline-editable rich text children in the void node, NOT as a prop control (Webstudio's key insight: children are structural, not a prop value). Callbacks and complex objects hidden from the panel. Performance: ~10-15s for 75 components at project load, sub-second on file save. See /reports/react-types-as-editor-schema/.

**Risk:** TypeScript 7 (tsgo, mid-2026) may change the Compiler API that react-docgen-typescript depends on. Mitigation: abstract extraction behind an interface.

"Built-in" just means "ships pre-installed." Users add custom components the same way: write a React component with TypeScript props → register in the mapping → editor discovers and renders it automatically. See /reports/fumadocs-full-pipeline/.

**Value:** This is the product for humans (customer) — without a great editor, there's no reason to use this over Obsidian or VS Code. AND it's the surface that makes agent-written content visible and reviewable (platform). One editor serves both knowledge workers (WYSIWYG for articles) and developers (code view for components) without feeling like two separate products (GTM).

**Constraints:** Editor framework choice (TipTap or Milkdown + y-prosemirror). Custom block schemas needed for registered components (P0: fixed set). Mini CodeMirror instances inside void nodes for unregistered JSX. CRDT: void nodes are atomic in y-prosemirror — concurrent editing around components is safe, but concurrent editing of the same component's raw string is LWW.
**Lateral:** S4 (MCP server) writes content that this editor renders. S5 (presence) overlays on this editor. S2 (source toggle) provides full-file code access.
**Forward:** Editor plugin/extension model (PQ8) for additional block types. Auto-extract component schemas from TypeScript (OpenDesign pattern). Live preview of MDX output in a side panel.

#### S2: Toggle between WYSIWYG and full source view
Toggle the entire file between WYSIWYG mode (S1) and raw source mode (CodeMirror 6 with full syntax highlighting). Edits in either mode reflect in the other. The "IDE" quality that differentiates from Notion (no source view) and VS Code (no rich rendering).

This is a file-level toggle, complementing the per-block code toggle in S1. The per-block toggle lets you edit one component as code while keeping the rest WYSIWYG. The file-level toggle gives full raw source access for power users — frontmatter editing, complex restructuring, debugging agent output.

Obsidian's Live Preview + Source Mode is the benchmark. Mintlify's visual↔markdown toggle is the UX precedent.

**Value:** Developers expect source access — Obsidian has it and it's why they love it (customer). Outline explicitly rejected it and is perceived as "basic" (competitive evidence). This establishes markdown-as-canonical as a competitive moat that no structured-DB competitor (Notion, Outline, AFFiNE) can replicate (platform).

**Constraints:** Markdown round-trip through ProseMirror is well-proven (TQ3 — low risk for standard markdown). JSX void nodes store raw strings that output verbatim — no round-trip issue for JSX. The file-level source view uses CodeMirror 6 (same engine as the per-block code view, just full-file scope).
**Lateral:** Same CRDT document as S1. S4 (MCP) writes content that both views render.
**Forward:** Obsidian-style Live Preview decorations in CodeMirror (render headings/bold inline in source mode). Stage 3-4 progression from /reports/mdx-text-editor-preview-approach/.

#### S4: External agent can read, write, and search articles via MCP
MCP server exposes tools for knowledge operations. Agent connects via standard MCP protocol. Writes go through CRDT layer and appear in the editor in real-time. Write behavior (main vs draft) determined by the agent's resolved permission on the content (CC4, PQ9).

**MCP tools follow filesystem-compatible signatures with additive enrichment** (XQ1, Decided). Tool names and parameters match the standard filesystem MCP server exactly: `read_file`, `write_file`, `edit_file`, `list_directory`, `search_files`. Agents use tools they already know — zero learning curve. Responses follow the standard shape but with additive enrichment fields (parsed frontmatter, backlinks, relevance scores, per-file metadata). Behind the scenes: CRDT routing, permission checks, presence.

**Orientation via walkable index files, not a special tool.** Agent reads `read_file("index.md")` for the root KB map — auto-maintained by the product from frontmatter + file structure (CC6). Per-folder index.md at every level, recursive uniform structure. Agent navigates by choosing which index.md to read: root for the full KB, `deployment/index.md` for deployment articles, etc. Depth is controlled by which file the agent reads — no depth parameter needed. Skip-level access works naturally (agent can jump to any folder's index directly). See CC6 for design details.

**Progressive disclosure via index files + grep.** P0 navigation: index files for orientation/discovery, grep for targeted extraction. No dedicated search engine at P0 — deferred to Next (S8). The index files ARE the discovery layer at this scale. When search is added later, the pattern becomes: index files → search → read.

Write tools: `write_file` and `edit_file` with same signatures. Behind the scenes: permission-checked, CRDT-routed (editor→main, proposer→auto-draft, maintainer→overwrite).

Knowledge-specific tools (no filesystem equivalent): `update_frontmatter`, `create_draft`, `apply_draft`, `discard_draft`, `get_active_context`.

Research finding: tool count is the strongest failure predictor (Microsoft: 85% degradation as tools increase). Tool descriptions are the highest-leverage investment (Anthropic). Total: 5 filesystem-compatible + 5 knowledge-specific = 10 tools.

**Value:** This is what makes the product "agent-native" — any agent that speaks MCP can use the KB as its brain (customer + platform). Claude Code, Cowork, Cursor, Codex all work out of the box. AND this is what every reference skill (research, ingest, compile, lint) operates against — the MCP tools ARE the platform API (platform). No other knowledge tool has this (GTM differentiation).

**Constraints:** MCP tool design determines what skills can do. Tools must be general enough for diverse skills, structured enough for agents. Permission model (PQ7) determines write behavior. Project structure conventions affect tool semantics (folder filtering, tag vocabulary). Tool descriptions matter more than implementation (Anthropic research).
**Lateral:** S1 (editor) and S4 share the CRDT layer — both read/write the same Yjs documents in the same namespace (main or draft). S5 (presence) depends on S4 for agent awareness events. S6 (auto-persistence) pipeline is the same for main and draft contexts.
**Forward:** Cloud MCP server (same tools, remote access) is the multiplayer/SaaS bridge. Skill distribution (Later) depends on the MCP tool surface being stable.

#### S5: Human sees agent edits in real-time with presence
When an external agent writes via MCP, the human sees: agent cursor in the editor, "AI is typing" indicator, sidebar presence showing which files the agent is editing, origin shading on agent-written content. Activity feed showing recent agent actions. Optional "follow agent" mode.

**Value:** This is the defining UX — no other product has real-time human+AI co-editing with presence (customer + GTM). Proposed switching narrative (validate with user testing): (1) **Real-time co-editing** — you see Claude's cursor, text appears as it writes, your edits and Claude's merge seamlessly via CRDT. In Obsidian, you get "file changed on disk — reload?" and lose your unsaved work. (2) **Per-origin undo** — Cmd+Z undoes Claude's changes specifically, preserving yours. In Obsidian, you'd `git checkout -- file.md` and lose everything since last commit. (3) **Async activity review** — you open the product after Claude ran overnight, see an activity feed of what changed with visual diffs, accept or dig in. In Obsidian, you'd `git diff` in terminal. Trust through transparency — the human always knows what the agent did, whether they watched it happen or review it after. Uses Yjs awareness protocol — same infrastructure extends to multi-human naturally (platform).

**Constraints:** Depends on CRDT layer (CC1) being in place. Depends on both editor (S1) and MCP server (S4) writing to the same CRDT. Per-origin undo (human undoes their edits, not AI's) requires trackedOrigins setup. Presence works the same in main and draft contexts — if user and agent are both in a draft, presence shows within that draft.
**Lateral:** Tightly coupled with S1 and S4 — this is the glue between the human and agent surfaces. When agent is working in a draft (CC4), presence indicators show which draft and which files the agent is editing.
**Forward:** Multi-human presence (Later) is the same UX with more participants.

#### S6: Edits auto-persist with version history timeline
Every change (human or agent) auto-persists invisibly. No save button. Three-tier: crash recovery (CRDT→filesystem, 2-10s), auto-commits (WIP refs, 30-60s), named checkpoints (user-initiated). Version history appears as a timeline with named checkpoints prominent and auto-saves collapsed. "Save Version" to mark progress.

**Value:** Users trust the system — no data loss, no "did I save?" anxiety (customer). Figma/Notion mental model — continuous editing without friction. AND git-backed history enables branching, PRs, collaboration without architectural changes (platform). Attribution distinguishes human vs agent edits (customer trust).

**Constraints:** Depends on CRDT layer (CC1) and git. WIP refs pattern from OpenDesign Report 46. No git terminology in UI (PQ5, locked). isomorphic-git for pure JS implementation. Pipeline is parameterized by context: main writes to `refs/wip/<writer>/main`, drafts write to `refs/drafts/<name>`. Same hooks, same debounce, different branch target (CC2, CC4).
**Lateral:** Enables S5 (presence) to show origin of edits. Shares CRDT infrastructure with S1 and S4. Draft apply = squash-merge draft branch to main (one clean checkpoint).
**Forward:** Branching ("Start experiment"), publishing ("Publish" = PR), team collaboration all build on this git infrastructure. Draft→main merge is the same git operation that team review→main merge will use.

#### S9: Localhost editor embeddable in agent environments
The editor runs on localhost and is designed to be opened side-by-side with any AI coding agent. When an agent starts working on the KB, it should guide the user to open the editor — and the user should see agent edits appear in real-time.

The agent should **programmatically open** the editor, not just suggest it. Use whatever browser capability is available:

- **Claude Desktop:** Open the preview panel to `localhost:3000`.
- **Cursor:** Open the built-in browser panel to `localhost:3000`.
- **Claude Code CLI:** Use the browser tool, or `open http://localhost:3000` (macOS) / `xdg-open` (Linux).
- **Playwright MCP / Vercel agent-browser:** Navigate to `localhost:3000`.
- **Fallback:** Tell the user to open it manually.

The editor must be **embeddable** — works as standalone browser tab AND as an iframe/panel inside agent environments. No full-page navigation required. Works within sandboxed contexts. Responsive to panel-sized viewports.

The MCP server's `instructions` field (and the project's AGENTS.md) includes: "When editing knowledge base content, open the editor at http://localhost:3000 so the user can see your edits in real-time. Use the browser tool, Playwright, preview panel, or CLI `open` command — whichever is available. Try programmatic opening first; fall back to telling the user."

**Value:** The co-editing experience (S5) only works if the editor is OPEN. Without guidance, the user edits in their terminal/IDE and never sees the visual editor. With guidance, the agent actively promotes the side-by-side experience — "I'll edit the articles, open localhost:3000 to watch and co-edit." This transforms the product from "a tool you remember to open" to "the agent brings you to the editor" (customer + GTM). AND it works with every agent that supports MCP, including future ones we haven't anticipated (platform).

**Constraints:** localhost-only for P0. No auth needed (local machine). The editor must start with `npx openknowledge` and be ready in seconds, not minutes. Embeddability means: no reliance on `window.top` navigation, works in iframes, responsive to panel-sized viewports (not just full-screen).
**Lateral:** Depends on S1 (editor), S4 (MCP server), S5 (presence). CC5 (zero-friction onboarding) provides the `npx openknowledge init` setup path.
**Forward:** MCP Apps (Later) — when the spec matures to support persistent panels, the editor could render inside agent conversations directly. Cloud hosting (S-L3) — the same embeddable editor serves the cloud product.

#### S8: Semantic search for humans and agents
Local embeddings (small model, ~80MB, runs on CPU) power concept-level search across the KB. Both the editor's search bar and the MCP `search_articles` tool return semantically relevant results — "deployment" finds articles about CI/CD, Docker, rollback, staging even without keyword matches. Wiki-link autocomplete (`[[`) suggests articles by semantic relevance to what you're currently writing, not just title matching.

**Value:** This is the single biggest search quality improvement over Obsidian (keyword-only) AND over every Obsidian MCP plugin (keyword search via MCP). When you ask Claude "what do we know about rate limiting?" and the MCP search finds the API throttling article, the request quotas article, AND the billing limits article — that's the moment the product feels smarter than a folder of files (customer). AND the same embedding index powers relationship detection for future knowledge graph features (platform). The index is local, no cloud needed — consistent with zero-LLM-compute for generative AI while using representational AI for search infrastructure.

**Constraints:** Research findings on search stack (see /reports/local-search-retrieval-stacks-2025-2026/, /reports/orama-deep-dive/): Orama is the leading candidate (pure TypeScript, in-process, hybrid search, Apache 2.0, 2.1M monthly npm downloads). Embedding model: bge-small-en-v1.5 (~67MB, 24% better than all-MiniLM-L6-v2) via @huggingface/transformers v4 (6 lines, zero Python). Content extraction: Fumadocs' remarkStructure → per-section document chunking (reusable, see TQ11). Persistence: Orama seqproto binary serialization for fast startup (load cached index, don't rebuild). Incremental indexing: Orama supports insert/update/remove per document (Fumadocs doesn't use this — we must build the incremental layer). Full-text search works without embeddings — semantic is an enhancement, not a requirement.
**Lateral:** Enhances S4 (MCP search quality), S1 (wiki-link autocomplete), S3 (sidebar search when promoted).
**Forward:** Knowledge graph visualization, relationship suggestions ("these 3 articles overlap — consider linking"), stale content detection.

#### S10: Wiki-links + backlinks — the knowledge graph
Wikilinks (`[[Page Name]]`) as the primary internal link format. Case-insensitive, shortest-path resolution (Obsidian convention). `[[Page|display text]]` for aliases. `[[Page#Heading]]` for section links. Red links for non-existent targets (click to create — Wikipedia pattern).

**In the editor:** `[[` triggers autocomplete via TipTap's `@tiptap/suggestion` plugin. Wikilink renders as an atomic inline ProseMirror node (clickable pill showing resolved page title). Backlinks panel at bottom of article showing all pages that link TO this article, with surrounding context snippet.

**Index infrastructure:** Dual adjacency list built incrementally.
- Forward: `Map<sourcePage, Set<{target, position, context}>>` — what this page links to
- Backward: `Map<targetPage, Set<{source, position, context}>>` — what links to this page (the backlinks)
- Updated on Hocuspocus `onStoreDocument` hook (same debounced pipeline as auto-persistence and search indexing). Server-side extraction via `yDocToProsemirrorJSON()` — no editor schema needed.
- Cached in CC6 (derived data, per-branch). Content-addressed deduplication for branch switching — files identical across branches share index entries.

**MCP tools for agents:** `get_backlinks(page)`, `get_forward_links(page)`, `get_orphans()`, `get_hubs()`, `get_link_graph()`, `suggest_links(page)`. These follow the "orient, discover, consume" navigation pattern. `suggest_links` enables the "agent as librarian" pattern — agent reads the link graph, identifies "article X mentions Y but doesn't link to the Y article," suggests the connection.

**Git compatibility:** Wikilinks use page names (not file paths) → resilient to renames/moves. Standard markdown link reference definitions generated for portability (Foam's pattern). See /reports/wiki-links-backlinks-architecture/.

**Value:** This is what makes a collection of .md files feel like a **knowledge base** instead of a folder (customer). The link graph IS the knowledge structure — it's how humans navigate ("what's related to this?") and how agents reason ("what context surrounds this topic?") (platform). Backlinks are the #1 feature that Obsidian users cite as why they use Obsidian (GTM — we match and extend it with agent-aware link tools).

**Constraints:** Custom TipTap wikilink node (no production extension exists — must build). Backlink index must update incrementally (not full rebuild on every save). Branch-aware caching (CC6). Wikilink resolution needs the page tree (depends on project having articles with titles in frontmatter).
**Lateral:** S1 (editor — wikilink node), S4 (MCP — 6 link graph tools), S8 (semantic search complements the link graph for discovery), S3 (navigation — backlinks panel in sidebar, when promoted).
**Forward:** Knowledge graph visualization (S-L4). "Agent as librarian" skill (suggest links, detect orphans, find clusters). Relationship-weighted search (backlinks boost relevance).

### Next

#### S3: Navigate and organize articles in a project
Browse articles in a sidebar file tree. Create folders. Edit frontmatter tags via the editor. Full-text search across articles. Navigate between linked articles (click a wiki-link → jump to article). The organizational shell.

**Value:** Transforms a folder of .md files into a navigable knowledge base (customer). AND the same organization is what makes the KB legible to agents via MCP (platform) — agents discover content the same way humans browse it.

**Constraints:** Project structure conventions (PQ7, parked) will shape this. Frontmatter as source of truth (TQ6, decided).
**Lateral:** Depends on S1 (editor) for article rendering. Complements S4 (MCP tools for agent discovery mirror human browsing).
**Forward:** Knowledge graph visualization, cross-KB linking, multi-project management.

#### S7: Skills live alongside knowledge articles
Skills (SKILL.md files with optional scripts/) live in the same project. The editor renders and edits them like any markdown article. The product doesn't execute skills — it stores and serves them. External agents discover skills via MCP list/read tools.

**Value:** The KB contains executable operational knowledge, not just text (customer differentiation). AND this is what makes "ship a reference research skill for OpenKnowledge" work (platform + GTM). Skills are just markdown — zero product complexity to support them, massive ecosystem value.

**Constraints:** Skills are just .md files — no special product handling needed beyond what S1 and S3 already provide. The value is the convention and the reference skills, not a product feature.
**Lateral:** Uses S1 (editor) and S4 (MCP). Skills consume MCP tools.
**Forward:** Skill distribution registry. Skill marketplace. Community ecosystem.

### Later

#### S-L1: Multi-human collaboration (real-time multiplayer)
Multiple humans editing the same KB simultaneously. Multi-user cursors, presence, avatars. Cloud Hocuspocus for remote sync. Auth, permissions, roles.

**Value:** Team knowledge bases. The Confluence/Notion replacement story. Monetization trigger.
**Trigger to promote:** When IC adoption validates the core loop and team demand emerges.

#### S-L2: Publishing engine (docs site from KB)
Render a KB as a public docs site. The Mintlify/GitBook replacement. Same content, published view. Integration path: our editor writes MDX files → Fumadocs' Source API (`{ files: VirtualFile[] }`) consumes them → Fumadocs renders the published site. Same React components in the editor AND the published output — what you see in the void node preview is what gets published.

**Value:** Companies publish their KB as customer-facing documentation. Direct monetization. AND our custom component story is a differentiator over Mintlify: Mintlify's visual editor can't edit custom React components (falls back to code mode). We render ANY component with a TypeScript interface — visual preview + auto-generated prop panel — no special API, no hardcoded component set. Users bring their own components.
**Trigger to promote:** When the editing + agent loop is proven and users ask "how do I share this publicly?"

#### S-L3: Cloud hosting + SaaS
Hosted KBs, team management, SSO, analytics. The enterprise tier.

**Value:** Monetization. Network effects. Team virality.
**Trigger to promote:** When self-hosted/local adoption reaches critical mass.

#### S-L4: Knowledge graph visualization
Visual graph of article relationships, tags, concepts. The Obsidian graph view equivalent. **Fumadocs already has `graph-view.tsx`** using `react-force-graph-2d` — computes graph from `extractedReferences`. We'd wire it to our S10 backlink index (dual adjacency list) instead of computing fresh each render. Local graph view (1-2 hops from current page) is a filtered version of the same component.

**Value:** Navigation, discovery, seeing the shape of your knowledge. Visual feedback that the KB is a connected graph, not isolated files.
**Trigger to promote:** When KBs reach 50+ articles and users report navigation difficulty. S10 (backlinks) is the prerequisite — provides the index the graph reads from.

#### S-L7: shadcn component registry (@openknowledge/*)
Publish our component set as a shadcn registry — the first knowledge-focused registry in a 201+ registry ecosystem. `npx shadcn add @openknowledge/callout`, `@openknowledge/code-block`, `@openknowledge/mermaid`, `@openknowledge/math`, `@openknowledge/backlinks-panel`, `@openknowledge/wikilink`, etc. Any Fumadocs, Docusaurus, or Next.js docs site could use these.

**Value:** Distribution channel for the product (GTM). Developers discover our components → try the editor → adopt the platform. AND it's a contribution back to the ecosystem — nobody has published docs/knowledge components for shadcn (platform).
**Trigger to promote:** When the component set is stable and used internally. The registry is just a publishing step on top of components we already build for S1.

#### S-L5: Browser extension for web clipping
One-click clip web articles to the KB with images. The Obsidian Web Clipper equivalent.

**Value:** Fastest ingest path for individual use. High adoption driver.
**Trigger to promote:** When the ingest skill pattern proves the workflow and users want less friction.

#### S-L6: Connectors (Slack, Zendesk, GitHub, Confluence import)
Auto-sync from external sources. Enterprise ingest at scale.

**Value:** Enterprise adoption. Confluence migration path. The "import your Confluence space" acquisition channel.
**Trigger to promote:** When enterprise/team adoption is the growth priority.

## Phasing rationale

**Now: S1 + S2 + S4 + S5 + S6 + S9 + S10.** The core loop: editor (human surface) + source toggle (developer-expected, competitive necessity) + MCP (agent surface) + presence (the differentiating UX) + auto-persistence (trust) + embeddable editor + wiki-links/backlinks. These share the CRDT layer and must ship together. S2 promoted from Next based on competitive evidence. TQ3 (round-trip fidelity) is the gating risk — needs an early spike. Heuristics: customer-journey-first, value-first, dependency-first.

**S8 (semantic search) moved to Next.** Walkable hierarchical index files (CC6) + grep on CRDT content (TQ17: 2-8ms) cover agent orientation and discovery at P0 scale (100-1K articles). Research grounding: Amazon Science found keyword search achieves 94.5% of RAG performance; RAPTOR found hierarchical summaries outperform flat retrieval; Dust.tt found agents spontaneously prefer tree navigation. No dedicated search engine needed at P0 — the per-folder index.md files ARE the discovery layer. Search engine (BM25/vector) deferred to when S3 (sidebar search) or S8 is promoted. The `SearchEngine` abstraction layer (~200 lines) means it slots in without changing consumer code.

**Next: S3 + S7 + S8** — organization, ecosystem, and semantic search. S3 (navigation/organization) is Next because it's blocked by PQ7 (project structure conventions, parked) — can't build a polished sidebar/search without knowing the folder and frontmatter conventions. Heuristic: dependency-first. S7 (skills alongside articles) is Next because it has low product complexity (skills are just .md files) but requires the core editing+MCP loop (S1+S4) to be stable before ecosystem value materializes. Heuristic: value-first (high ecosystem value, low product cost, but depends on core stability).

**Later: S-L1 through S-L6** — multiplayer, publishing, cloud, graph view, browser extension, connectors. Each has a promotion trigger tied to adoption milestones or market demand.

**Walking skeleton test:** If Next and Later never happen, does Now deliver standalone value? Yes — an IC has a rich markdown editor with source/WYSIWYG toggle, where their AI agent co-creates knowledge in real-time with presence, everything auto-saves to git, and agents navigate via walkable per-folder index files + grep. That's a usable, differentiated product even without polished sidebar navigation, semantic search, or team features. (S2 source toggle is in Now because developers expect it — competitive necessity per TQ9. If TQ3 round-trip spike fails, S2 drops to Next.)

## Rabbit holes

**1. Building a RAG pipeline (retrieval-augmented generation).** Tempting because "knowledge base + AI" naturally suggests it. RAG = retrieve chunks from vector DB → stuff into LLM prompt → LLM generates answer. This is an ANSWER ENGINE — the product runs inference to produce a response. Don't build this. The agent does its own reasoning using our MCP tools. Note: S8's local embeddings for SEARCH are NOT RAG. Embeddings power a search INDEX that FINDS articles — the product never generates text. The distinction: search index (representational AI, finds things) vs RAG pipeline (generative AI, answers questions). If encountered: point to the MCP tools + the agent's own reasoning. Karpathy: "I thought I had to reach for fancy RAG, but the LLM has been pretty good about auto-maintaining index files and brief summaries."

**2. Building a chat interface.** Tempting because every knowledge tool is adding "Ask AI." But the intelligence is external — Claude Code, Cowork, Cursor are the chat interface. Building our own chat duplicates what the user already has and adds LLM compute to the product. If encountered: point the user to their existing agent + the MCP server.

**3. Building WYSIWYG editing for MDX.** Deep source-code research (7 sub-reports, 9 repos) proved this is a 3-6 month project with 6 failure vectors and zero prior art. Blocking issues: remark-mdx indentation drift (grows indefinitely), slate-yjs abandoned with corruption bugs, TinaCMS rejects expression props, no editor has MDX node schemas for CRDT. The dual-mode approach sidesteps all of this — standard markdown gets WYSIWYG, MDX gets CodeMirror+preview. If encountered: do NOT attempt to build WYSIWYG MDX editing. Use the code+preview mode for MDX. See /reports/mdx-crdt-roundtrip-fidelity/.

**~~3 (old). Solving markdown round-trip for P0.~~** Resolved. Standard markdown round-trip is low risk. MDX JSX is handled via void nodes (raw string in, raw string out — no round-trip issue). The unified WYSIWYG approach with void nodes eliminates this concern entirely.

**4. Over-engineering project structure conventions.** The temptation to define the perfect taxonomy (raw/ articles/ indexes/ drafts/ published/) before shipping anything. PQ7 is parked for a reason — the conventions should emerge from real skill usage, not be designed top-down. If encountered: start with a flat folder of .md files. Let the reference skills establish conventions by example. Formalize after patterns prove out.

**5. Obsidian plugin compatibility.** "What if we support Obsidian plugins?" The plugin ecosystem is Obsidian's moat and it's massive. Attempting compatibility is a multi-year effort that constrains the editor architecture. If encountered: build our own extension model. The differentiation is agent-native co-editing, not plugin count.

**6. Building connectors before proving the core loop.** Enterprise connectors (Slack, Zendesk, Confluence import) are the monetization path but they're integration engineering, not product innovation. If encountered: the ingest skill pattern handles one-time imports. Connectors are a Later feature triggered by enterprise demand.

## Pre-mortem

**If this project fails, the most likely causes:**

1. **The editor isn't good enough.** The bar is Obsidian (for developers) and Notion (for knowledge workers). If the editing experience is worse than what people already have, the agent-native angle won't save it. Editor quality is existential — it IS the human experience of the product.

2. **MCP tool design is wrong.** If the tools are too low-level (just read/write files), agents can't do sophisticated knowledge operations. If too high-level (compile_wiki, run_research), the tools are opinionated and inflexible. The tool surface needs to be the right level of abstraction — general enough for diverse skills, structured enough for agents to use effectively. And we won't know if it's right until real skills use it.

3. **The dual-mode editor feels fragmented.** Two editing modes (WYSIWYG for .md, CodeMirror for .mdx) could feel like two different products bolted together. If the mode switch is jarring, the presence behavior differs between modes, or the UX doesn't feel cohesive — users will perceive it as unfinished. Mintlify manages this with a clean toggle; we need to match or exceed that cohesion.

4. **The "zero LLM compute" principle makes the product feel dumb.** If competitors ship AI-powered search, AI-powered organization, AI-powered suggestions natively — and our product requires the user to separately configure an agent — the friction gap might be too large for non-developer users. The thesis is that external agents are better (no lock-in, user's choice). But the UX of "configure your own agent" vs "it just works" is a real adoption barrier for knowledge workers.

5. **Skills ecosystem doesn't materialize.** The product's value compounds with skills — but if the reference skills are the only ones, and the community doesn't build more, the product is just a markdown editor with an MCP server. The ecosystem IS the moat. If it doesn't develop, the moat is just "decent editor + decent MCP."

**What we're assuming that could be wrong:**
- That MCP adoption continues to grow and becomes the standard agent protocol (if it doesn't, the "agent-native" story weakens)
- That ICs want a standalone knowledge tool rather than knowledge features inside their existing tools (Cursor, VS Code, Obsidian)
- That the Obsidian-grade editing bar is achievable with current OSS editor frameworks (TipTap/BlockNote/ProseMirror)
- That markdown is the right canonical format (vs a richer document model like AFFiNE's BlockSuite)
