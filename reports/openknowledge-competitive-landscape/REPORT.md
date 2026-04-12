---
title: "Competitive Landscape for an Agent-Native Knowledge Platform"
description: "Deep competitive analysis of 7 primary competitors (Notion, Confluence, Obsidian, Mintlify, Chroma, Outline, AFFiNE) and 12+ secondary players across editing experience, AI/agent story, storage model, collaboration, licensing, strategic direction, and developer extensibility. Maps white space for an agent-native knowledge platform."
createdAt: 2026-04-02
updatedAt: 2026-04-11
subjects:
  - Notion
  - Confluence
  - Obsidian
  - Mintlify
  - Chroma
  - Outline
  - AFFiNE
  - obsidian-skills
  - kepano
topics:
  - competitive landscape
  - knowledge management
  - agent-native
  - MCP integration
  - collaborative editing
---

# Competitive Landscape for an Agent-Native Knowledge Platform

## 1. Executive Summary

The knowledge management market is converging on AI but no incumbent or emerging player has built what this analysis scopes: an agent-native knowledge platform where AI agents co-create knowledge alongside humans via MCP, with markdown+git as the canonical substrate, a rich collaborative editor, and zero LLM compute in the product. Every competitor analyzed treats AI as either a feature bolted onto a human-first product (Notion, Confluence, Outline, AFFiNE) or as retrieval infrastructure for machines (Chroma, Mintlify). None treats agents as first-class knowledge participants with identity, attribution, review workflows, and event-driven interaction.

The competitive field organizes into three clusters. The **enterprise incumbents** (Notion at $600M ARR, Confluence with 300K+ customers) have the distribution and collaboration maturity but are architecturally locked into proprietary formats and bundled LLM compute. The **developer-native tools** (Obsidian with 1.5M users, Mintlify with 10K+ companies) have the right format substrate (markdown, git) but lack real-time collaboration (Obsidian) or bidirectional agent interaction (Mintlify). The **open-source challengers** (Outline at 37.9K stars, AFFiNE at 67K stars, Chroma at 27K stars) offer pieces of the puzzle -- collaboration (Outline/AFFiNE), MIT licensing (AFFiNE/Chroma), retrieval infrastructure (Chroma) -- but none combines them into a unified agent-native platform.

The structural white space is clear: **no competitor offers the combination of markdown as canonical format, git-native version control with branching, real-time CRDT collaboration, bidirectional MCP for agent co-creation, zero LLM compute, and a genuine open-source license**. Each incumbent would need to abandon core architectural and business model commitments to reach this position. Notion would have to open its proprietary block format and cannibalize agent credits revenue. Confluence would need to replace ADF -- a multi-year, backward-compatibility-breaking effort. Obsidian would need to build collaboration into a product philosophically committed to single-player. These are not feature gaps but structural impossibilities given each competitor's incentive structure.

**Key findings:**

- **MCP is table stakes.** Six of seven primary competitors and multiple secondary players ship MCP servers. However, every MCP implementation is either read-only (Mintlify) or CRUD-without-co-creation (Notion, Confluence, Outline, AFFiNE). No MCP server supports agent identity, attribution, staging, or review workflows.
- **Every AI-enabled competitor bundles LLM compute.** Notion ($10/1K credits), Confluence (Rovo bundled free after failed premium pricing), Mintlify (Claude Sonnet 4.5), Outline (OpenAI), AFFiNE (multi-model). Only Obsidian ships zero AI compute -- by philosophical choice, not architectural design.
- **Markdown is canonical for zero competitors with collaboration.** Obsidian uses markdown files but has no multiplayer. Mintlify uses MDX in git but has no real-time co-editing. Every competitor with real-time collaboration (Notion, Confluence, Outline, AFFiNE) stores content in a proprietary or opaque format.
- **Branching and merging for content is nearly absent.** Only Mintlify offers it (via native git). No WYSIWYG-editing competitor supports branches, pull requests, or structural diffs. This is the widest gap in the landscape and the most foundational for agent collaboration.
- **The "agent memory" infrastructure layer is crowding fast.** Mem0, Zep/Graphiti, Letta, OpenViking, and others are competing to be default agent memory. The distinction between organizational knowledge and agent memory is blurring.

---

## 2. Research Rubric

Seven dimensions were investigated across all competitors:

| Dimension | What Was Assessed |
|---|---|
| **D1: Editing Experience** | Editor architecture, block types, markdown support, search quality, visual thinking, developer ergonomics |
| **D2: AI / Agent Story** | MCP support, LLM integration model, agent capabilities, agent limitations, architectural approach |
| **D3: Storage & Format Model** | Canonical format, human/agent readability, git compatibility, data portability, API constraints |
| **D4: Collaboration & Multiplayer** | Real-time co-editing, CRDT/OT architecture, version history, branching, permissions, agent collaboration gaps |
| **D5: OSS Status, Licensing & Pricing** | License type, self-hosting, pricing tiers, funding, business model, AI monetization |
| **D6: Strategic Direction** | Current positioning, trajectory, acquisitions, structural barriers to pivoting, likelihood of entering agent-native space |
| **D7: Developer Experience & Extensibility** | API quality, plugin/extension model, SDK availability, integration ecosystem, developer friction |
| **D8: Obsidian's Agent Skills Strategy** | kepano/obsidian-skills repo, Agent Skills specification, `npx skills add` distribution, cross-agent compatibility, co-creation gap, competitive implications |

Evidence files with detailed per-dimension findings: [evidence/d1-editing-experience.md](evidence/d1-editing-experience.md) through [evidence/d8-obsidian-skills-agent-strategy.md](evidence/d8-obsidian-skills-agent-strategy.md).

---

## 3. Cross-Competitor Analysis by Dimension

### D1: Editing Experience

Obsidian sets the developer editing benchmark. Its CodeMirror 6-based Live Preview mode solves the two-pane problem with inline rendering that collapses away from the cursor, offering three modes (Source, Live Preview, Reading) that span purist to casual. Average daily usage of 43 minutes/user signals deep engagement. The plugin ecosystem (2,736 community plugins) enables capabilities like Dataview (queryable database from markdown), Canvas (spatial thinking), and Bases (structured data views) -- all without leaving markdown as the source format.

Notion leads on rich content breadth with 50+ block types, best-in-class relational databases with six view types, and polished UX. However, the proprietary block format means content is not portable. Export to markdown is lossy: databases become CSV, colors and synced blocks are silently dropped.

Confluence's editor remains a persistent weakness despite heavy investment. The mandatory ADF-based cloud editor (April 2026) has not silenced endemic community complaints about sluggishness with complex documents and formatting issues.

AFFiNE demonstrates that CRDT-native editing is viable at scale. BlockSuite's document-centric architecture (CRDT as data layer, editors attach/detach) and its Hyper Fused Platform mixing documents, whiteboards, and databases in one page represent an architecturally ambitious editor *within the AFFiNE product* — but a 2026-04-11 re-audit (see [`../affine-strategic-deep-dive/`](../affine-strategic-deep-dive/)) found the "reusable toolkit" framing is aspirational: `toeverything/blocksuite`'s `main` branch has had zero commits since 2025-07-07, `@blocksuite/blocks` was last published 2024-12-19 (~16 months stale), zero credible non-AFFiNE production adopters exist, and the Web Components / Lit architecture is not substitutable for ProseMirror/TipTap ecosystems.

Outline offers clean ProseMirror-based editing with ~20 block types and mature Y.js CRDT collaboration, but is consistently described as "very basic" versus Notion and deliberately avoids database or advanced view features.

Search quality is a universal weakness. Notion and Confluence search degrade at scale; Obsidian offers fast local search but no semantic capability in core; Outline uses PostgreSQL full-text search without semantic understanding in its OSS edition.

**The bar for a new entrant**: Match Obsidian's Live Preview quality and format fidelity while adding the collaboration maturity of Notion/Outline. This is technically achievable -- CodeMirror 6 is open source -- but the rendering extensions Obsidian built on top are proprietary.

_Detailed evidence: [evidence/d1-editing-experience.md](evidence/d1-editing-experience.md)_

### D2: AI / Agent Story

Every primary competitor now has an AI story, but they cluster into three architectural patterns:

**Bundled LLM compute (walled garden):** Notion, Confluence, AFFiNE, Outline, and Mintlify all embed LLM compute in the product. The user pays the vendor for AI features. Notion charges $10/1K agent credits on top of $20/user Business pricing. Confluence reversed Rovo from $20-24/user premium to bundled-free after adoption struggles -- a strong signal that AI-as-premium-addon may not be sustainable. AFFiNE supports multi-model (OpenAI, Claude, Gemini) with BYOK for self-hosted. Mintlify runs Claude Sonnet 4.5 for its AI Assistant serving 1M+ monthly queries.

**External agents via filesystem (no AI in product):** Only Obsidian takes this approach. The CEO's `obsidian-skills` repo (21K GitHub stars) teaches agents Obsidian's formats rather than embedding AI. Community provides 86 AI plugins and 12+ MCP servers. Agents interact at filesystem speed with no rate limits -- but also no event system, no conflict resolution, no attribution.

**Retrieval infrastructure (machine-facing only):** Chroma occupies a distinct category as an embedding database with an MCP server for agent memory, not knowledge management. Its Context-1 (20B parameter retrieval model) separates retrieval from generation. Package Search MCP provides semantic search over six package registries.

The most significant cross-cutting finding: **no competitor supports agent co-creation**. In every product with MCP write access, agent edits appear as the authenticated user -- no attribution, no audit trail, no review workflow. No product offers a staging area where agent-generated changes can be reviewed before going live. No product allows agents to subscribe to content change events. Mintlify, the most vocal about the "agent era," ships a read-only MCP server (Search and Get Page only). Its own Mintlify Agent (Workflows) is the sole writer, running on Mintlify's LLM compute in proprietary sandboxed environments. AFFiNE sits at the opposite edge of the same gap: no first-party MCP server at all; the sole production implementation is the single-maintainer community project `DAWNCR0W/affine-mcp-server` (v1.13.0, ~36 canonical tools R+W) that exposes broad CRUD via the human user's personal access token but ships none of the agent-native primitives. A 2026-04-11 deep-dive (see [`../affine-strategic-deep-dive/`](../affine-strategic-deep-dive/)) confirms six of seven co-creation primitives absent in AFFiNE — official first-party MCP, agent identity, per-edit attribution, staging/draft/review, event subscription, scoped permissions — with only CRUD present.

_Detailed evidence: [evidence/d2-ai-agent-story.md](evidence/d2-ai-agent-story.md)_

### D3: Storage & Format Model

The canonical format spectrum ranges from fully proprietary to fully open:

**Proprietary binary/JSON:** Notion (proprietary blocks), Confluence (ADF with ~26 block types, ~40x more complex than markdown), AFFiNE (Yjs CRDT binary), Outline (ProseMirror JSON). These formats enable rich editing features but create fundamental portability problems. Confluence's MCP server accepts and returns Markdown -- a pragmatic admission that ADF is unusable for agents -- but the conversion is lossy both ways. AFFiNE's adapter documentation explicitly warns of data loss during format conversion. Pandoc has an open issue for ADF support since 2024 that remains unimplemented.

**Markdown/MDX in git:** Obsidian (plain .md files) and Mintlify (MDX in git repos) use human-readable, git-compatible formats. Obsidian vaults are git-compatible but not git-native -- the community Obsidian Git plugin provides version control, but branching and merge conflict resolution are not core features. Mintlify treats git as the source of truth with native GitHub App integration.

**Embeddings (machine-only):** Chroma stores embedding vectors alongside raw text. Content is not human-readable in situ. Chroma Sync reads from GitHub repos, S3 buckets, and websites but is strictly one-way ingestion.

Notion's API imposes the tightest agent constraints: 3 req/s rate limit, 2-level nesting limit, 2,000 characters per block, 1,000 blocks per request. Reconstructing a full page requires recursive API calls with pagination at every level. A markdown+git substrate eliminates all of these: agents read and write files at filesystem speed.

Only Mintlify treats git as the true source of truth among competitors with any collaboration story. This creates a structural opening: **markdown as canonical format AND real-time collaboration AND git-native version control** is a combination no competitor offers.

_Detailed evidence: [evidence/d3-storage-format-model.md](evidence/d3-storage-format-model.md)_

### D4: Collaboration & Multiplayer

Collaboration maturity varies enormously. Notion and Confluence offer mature real-time co-editing with years of production hardening -- Notion with proprietary OT, Confluence with up to 100 simultaneous viewers on Live Docs. Both include rich permissions models (space/page/block granularity), comments, @mentions, and enterprise features (SSO, audit logs).

Outline and AFFiNE use Y.js CRDTs for real-time collaboration. Outline has 5+ years of production Y.js experience. AFFiNE's architecture (y-octo Rust CRDT engine, Socket.IO, Redis pub/sub) is technically sophisticated but team features remain "coming soon."

Obsidian is fundamentally single-player. The oldest forum feature request for collaborative editing (2020, 2,200+ votes) has no official response. Third-party solutions (Relay, screen.garden) prove the demand and technical feasibility.

Mintlify and Chroma have no real-time collaboration. Mintlify offers git-based branching (different people on different branches), and Chroma provides multi-tenant database isolation.

**The branching gap is the widest.** No WYSIWYG-editing competitor supports content branching, merging, pull requests, or structural diffs. Only Mintlify offers these (via native git). Confluence and Notion use strictly linear version history. This is the most foundational gap for agent collaboration -- agents working on branches, humans reviewing and merging, with full attribution.

No competitor has built agent-human co-creation primitives: no staging area for agent changes, no conflict resolution between human and agent, no agent presence indicators, no agent attribution in content history.

_Detailed evidence: [evidence/d4-collaboration-multiplayer.md](evidence/d4-collaboration-multiplayer.md)_

### D5: OSS Status, Licensing & Pricing

Two genuinely open-source competitors exist: AFFiNE (MIT, 67K stars) and Chroma (Apache-2.0, 27K stars). Outline uses BSL 1.1, which the Open Source Initiative does not recognize as open source -- it prevents offering the software as a hosted service but allows self-hosting for internal use. Obsidian is proprietary but free to use for all purposes (commercial license requirement removed February 2026). Notion, Confluence, and Mintlify are fully proprietary SaaS.

Business models fall into five patterns: proprietary SaaS with AI upsell (Notion, Confluence), OSS core + managed cloud (Chroma, AFFiNE), free product + paid services (Obsidian), source-available + hosted (Outline), and closed SaaS with managed AI (Mintlify).

Funding ranges from $0 (Obsidian, bootstrapped, $25M ARR; Outline, bootstrapped, profitable) to $11B valuation (Notion, $600M ARR). Mintlify raised $21M (a16z-led Series A), AFFiNE raised $18M across two seeds, Chroma raised ~$20M.

Three pricing signals are strategically significant. First, Atlassian's Rovo pricing reversal (from $20-24/user to bundled-free) indicates AI-as-premium-addon struggles with adoption. Second, Mintlify's pricing cliff ($0 to $250/month with no mid-tier) strands growing teams. Third, Confluence's forced Data Center end-of-life (March 2029) creates a migration window where displaced customers may evaluate alternatives.

_Detailed evidence: [evidence/d5-oss-licensing-pricing.md](evidence/d5-oss-licensing-pricing.md)_

### D6: Strategic Direction

Each competitor is heading in a distinct direction, and none is converging on the agent-native knowledge platform thesis:

**Notion** is moving toward agent-captive, not agent-native. Every AI feature deepens the walled garden: agents run inside Notion's infrastructure, agent memory is stored in Notion pages, agent compute is bundled LLM. The MCP server is an on-ramp to Notion, not an open platform. Becoming agent-native would require opening the block format and cannibalizing agent credits revenue -- economically irrational at $600M ARR growing 50%.

**Confluence** is building a unified work platform (Jira+Confluence+Loom+Rovo bundled as "Collections"). Confluence is the knowledge layer within this system, not a standalone product. The Jira coupling is the deepest moat. Competing with Confluence on knowledge management alone is feasible; competing with the Jira+Confluence bundle requires addressing workflow integration.

**Obsidian** will not add collaboration, embedded AI, enterprise features, or venture capital. The tagline "A second brain, for you, forever" is doing precise work: singular, personal, durable. The CEO's approach to AI (teach agents formats via skills files) is deliberate philosophy, not inaction. The 18-person bootstrapped team cannot pursue collaboration, AI, enterprise, and developer experience simultaneously.

**Mintlify** is shipping fast and aggressively — passing the same execution test AFFiNE failed. A 2026-04-11 re-audit ([`../mintlify-strategic-deep-dive/`](../mintlify-strategic-deep-dive/)) found Mintlify shipped 20+ product improvements in a 9-day window (April 2–11), two acquisitions in 18 months (Trieve July 2025, Helicone March 2026), and a production-grade internal write pipeline (Daytona + OpenCode + Claude Opus 4.6) running Workflows, KB Agent, and the Enterprise Agent Job API. The "read-only MCP" framing is a **business moat choice, not a structural lock-in** — engineering distance to basic bidirectional MCP is **4–8 weeks**, to full co-creation MCP is **3–6 months**. The three-constraint profile (capital MODERATE, architecture NEGLIGIBLE, strategy MODERATE-HIGH) is fundamentally different from AFFiNE's tight-on-all-three shape, which is why Mintlify holds Tier 1 and AFFiNE does not. The "knowledge platform" positioning remains aspirational — the shipped product is a fast-improving docs-as-code SaaS, not an agent-native knowledge infrastructure. Cash runway is the binding constraint: ~$4–10M remaining with Series B likely needed in 2026.

**AFFiNE** announced a pivot to "AI knowledge base product" at v0.25.0 (2025-10-13), but ~6 months later the execution picture is clear. A 2026-04-11 re-audit ([`../affine-strategic-deep-dive/`](../affine-strategic-deep-dive/)) found v0.26.0–v0.26.3 (Feb 2026) shipped **zero** new AI features, **one** MCP bug fix ("Fix MCP token cannot display"), and **four** infrastructure/self-host features (S3 compat, admin panel redesign, blob lazy-load, server sync); daily canary builds through April 10, 2026 continue the pattern. The de facto product direction is **enterprise self-host consolidation with LLM-assisted editing**, not agent-native knowledge management. Three mutually reinforcing constraints sustain this: **capital** (17+ months post-seed, ~21-person team, no Series A, enterprise tier incomplete), **architecture** (CRDT-binary canonical + documented-lossy markdown adapter + dormant BlockSuite downstream mirror), and **strategy** (product-bundled LLM suppresses ecosystem externalization — no SKILL.md-style distribution, no D8 equivalent, see D9). Each would be hard to unwind; together they are nearly locked.

**Outline** is incrementally adding AI features (MCP shipped February 2026) but is structurally constrained by its one-person core team, BSL license, and no extensibility model.

**Chroma** is expanding along the retrieval infrastructure axis (Database -> Sync -> Agent), not toward human knowledge management. Context-1 and Package Search MCP show the trajectory: make machines better at finding information, not help humans organize it.

_Detailed evidence: [evidence/d6-strategic-direction.md](evidence/d6-strategic-direction.md)_

### D7: Developer Experience & Extensibility

Obsidian's plugin ecosystem is the deepest moat in the landscape. 2,736 community plugins, built-in distribution, zero platform tax, and CEO dogfooding create a flywheel that cannot be replicated. Key power plugins (Dataview at 6M+ downloads, Templater at 4M+) prove that markdown+frontmatter can serve as a queryable database and that JavaScript execution inside notes enables complex automation.

Notion has no plugin model. The only extension point is the external API, which is constrained by the 3 req/s rate limit. Confluence is transitioning from Connect (deprecated, EOL December 2026) to Forge (serverless on Atlassian infra, 25-second runtime limit), creating developer churn.

AFFiNE was initially presented as offering the most architecturally interesting extensibility story: BlockSuite was marketed as a reusable toolkit (MIT-licensed npm packages) with custom block development via `defineBlockSchema`. A 2026-04-11 re-audit ([`../affine-strategic-deep-dive/`](../affine-strategic-deep-dive/)) found the "reusable toolkit" framing is aspirational in practice: `toeverything/blocksuite`'s `main` branch has had **zero commits since 2025-07-07**, published packages are version-fragmented (`@blocksuite/store@0.22.4` ~9 months stale, `@blocksuite/blocks@0.19.5` ~16 months stale), 1337+ pre-1.0 versions with no semver majors and no CHANGELOG tracking breaking changes, and zero non-AFFiNE production adopters exist. The `defineBlockSchema` API is CRDT-native and functional but lacks the versioning discipline an external consumer needs. BlockSuite is operationally a dormant downstream mirror of AFFiNE rather than a living framework.

Outline and Mintlify have no plugin or extension models. Outline's maintainer has not signaled interest in building one. Mintlify allows custom MDX components in-repo but has no marketplace or extension system.

Chroma has the strongest multi-language SDK story (Python, JavaScript, Go, Rust -- all first-party) and the cleanest getting-started experience (zero-config local mode).

For an agent-native platform, the key extensibility gap across all competitors is **agent extensibility**. Obsidian's plugins extend the UI for humans. There is no equivalent mechanism for agents to register capabilities, receive events, or participate in workflows as first-class extensions.

_Detailed evidence: [evidence/d7-developer-experience.md](evidence/d7-developer-experience.md)_

### D8: Obsidian's Agent Skills Strategy (kepano/obsidian-skills)

The original D2 and D6 assessments characterized Obsidian's AI approach as "no AI in product, community-driven plugins." A deep investigation of `kepano/obsidian-skills` (21K GitHub stars, MIT license, created January 2026 by Obsidian CEO Steph Ango) reveals this was incomplete. Obsidian has an explicit, official, and rapidly adopted agent strategy -- it just lives outside the product.

**What obsidian-skills actually is (code-grounded).** The repo contains 5 skills totaling ~1,771 lines across 12 files. Zero application code, zero AI logic, zero agent orchestration. Each skill is a `SKILL.md` file (with optional `references/` directory) that teaches agents Obsidian's proprietary formats:

- **obsidian-markdown** (195 lines + 3 reference files): Obsidian Flavored Markdown -- wikilinks, embeds, callouts, frontmatter, tags, comments, highlights, math, mermaid. The `description` field is optimized for agent activation: "Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter..."
- **obsidian-bases** (498 lines + 1 reference): The `.base` YAML format for database-like views over notes -- filters, formulas, views (table/cards/list/map), summaries. The most comprehensive skill.
- **json-canvas** (245 lines + 1 reference): JSON Canvas 1.0 spec for spatial canvases -- nodes, edges, groups, layout guidelines, validation checklist.
- **obsidian-cli** (107 lines): Obsidian CLI commands for vault interaction and plugin development.
- **defuddle** (42 lines): Web content extraction to clean markdown (also by kepano).

The strategic pattern: Obsidian externalizes ALL agent intelligence. The 18-person bootstrapped team ($25M ARR) stays lean. Agents are powerful because they understand Obsidian's formats, not because Obsidian runs AI. This is the opposite of every other competitor's approach (Notion bundles LLM compute, Confluence bundles Rovo, Mintlify runs Claude Sonnet 4.5).

**The Agent Skills specification -- a de facto cross-vendor standard.** Each skill follows the [Agent Skills specification](https://agentskills.io/specification), which was originally developed by Anthropic, released as an open standard, and is now adopted by **33+ agents**: Claude Code, OpenAI Codex, Cursor, GitHub Copilot, VS Code, Gemini CLI, OpenHands, Goose (Block), Roo Code, Mistral Vibe, TRAE (ByteDance), Junie (JetBrains), Kiro (AWS), Databricks Genie Code, Snowflake Cortex Code, Spring AI, and many others.

The spec requires: a `SKILL.md` file with YAML frontmatter (`name` and `description` required; `license`, `compatibility`, `metadata`, `allowed-tools` optional) followed by markdown instructions. Optional `scripts/`, `references/`, and `assets/` directories. The progressive disclosure model loads metadata (~100 tokens) at startup, full instructions (<5,000 tokens) on activation, and resources on demand.

This is significant: the Agent Skills specification is becoming the MCP equivalent for agent context -- a cross-vendor standard for teaching agents domain expertise. Obsidian was an early adopter and its 21K stars validated the format.

**`npx skills add` as a distribution mechanism.** The `skills` npm package (v1.4.9, MIT, 62 versions) is maintained by **Vercel Labs** (maintainers include Guillermo Rauch). Usage: `npx skills add git@github.com:kepano/obsidian-skills.git` copies skill files to the agent-appropriate directory. The package keywords list every major agent, confirming its cross-ecosystem ambition.

obsidian-skills ships triple distribution: (1) Claude Code plugin marketplace (`/plugin marketplace add kepano/obsidian-skills`), (2) `npx skills add` for all 33+ compatible agents, (3) manual git clone. This ensures maximum reach regardless of which agent the developer uses.

**21K stars in 95 days -- what it means for the ecosystem.** Created January 2, 2026. 21,036 stars and 1,294 forks as of April 7, 2026 (~221 stars/day). 11 contributors (overwhelmingly kepano). For context, the largest Obsidian community repo (obsidian-releases) accumulated 9.6K stars over 5 years; obsidian-skills surpassed it in ~6 weeks.

This growth signals: (a) developer demand for agent-format integration is enormous, (b) the Agent Skills + `npx skills add` distribution model works, (c) kepano's personal brand + Obsidian's 1.5M user base provides distribution, and (d) "teach agents your product's formats" is a validated go-to-market strategy for developer tools.

**What obsidian-skills does NOT solve -- and what this means for open-knowledge.** A systematic audit of all 1,771 lines found ZERO mentions of: real-time collaboration, conflict resolution, concurrent edits, agent identity, attribution, staging/review/draft workflows, event subscription, change notification, presence, or branching/merging for content. The skills teach agents to READ and WRITE Obsidian files with imperative commands (`obsidian read`, `obsidian create`, `obsidian append`) that assume single-actor, last-write-wins semantics. There is no `obsidian draft`, `obsidian propose`, or `obsidian watch`.

This is the structural gap that defines open-knowledge's positioning. obsidian-skills solves the "agent understands the format" problem. It does NOT solve the "agent is a co-creator with identity, review, and conflict resolution" problem. Together with obsidian-mind (1.3K stars, a community vault template that BUNDLES obsidian-skills), the Obsidian ecosystem covers ~70% of what open-knowledge targets -- but the remaining 30% (real-time co-editing, presence, MCP tools with draft/review semantics, embeddable web editor) cannot be added to Obsidian without rebuilding its architecture.

**Implications for open-knowledge's competitive positioning and architecture:**

1. **Adopt the Agent Skills specification for reference skills.** Open-knowledge's reference skills (research, compile, lint, ingest, Q&A) should ship as SKILL.md files following agentskills.io/specification. This gives instant compatibility with 33+ agents. Ship via `npx skills add` + Claude Code plugin marketplace + git clone.

2. **Open-knowledge's MCP tools are the layer obsidian-skills lacks.** obsidian-skills teaches format literacy; open-knowledge's MCP server provides the co-creation primitives (drafts, staging, review, attribution, presence). These are complementary, not competitive. A developer could conceivably use obsidian-skills format knowledge + open-knowledge's MCP tools if the formats are compatible.

3. **Revise Obsidian's threat assessment upward.** The original D6 rated Obsidian as "Tier 3: Very Low probability of overlap." With obsidian-skills (21K stars) + obsidian-mind (1.3K stars) + Claude Code plugin marketplace, Obsidian users can get a surprisingly complete agent-native knowledge experience WITHOUT switching products. The remaining differentiator (co-editing, presence, web access, embeddable editor) is real but narrower than originally assessed. Revised probability: **Low** (up from Very Low).

4. **Format compatibility as a migration strategy.** Open-knowledge should be format-compatible with Obsidian markdown (wikilinks, frontmatter, callouts, embeds) so that Obsidian users can migrate vaults without conversion. obsidian-skills' SKILL.md files document the exact format specifications that open-knowledge's editor must support. This is a competitive advantage: "everything obsidian-skills taught your agent about markdown still works in open-knowledge, AND you get collaboration."

5. **The `.claude-plugin/` directory format is a template to copy.** obsidian-skills ships `plugin.json` (name, version, description, author, repository, license, keywords) and `marketplace.json` (registry manifest). Open-knowledge should ship the same structure for its reference skills.

_Detailed evidence: [evidence/d8-obsidian-skills-agent-strategy.md](evidence/d8-obsidian-skills-agent-strategy.md)_

### D9: AFFiNE's Agent-Distribution Audit (2026-04-11)

Symmetric to the D8 deep-dive of Obsidian's agent-skills strategy, a 2026-04-11 audit asked whether AFFiNE has a structurally equivalent play — a SKILL.md-based, cross-agent-compatible format-teaching repo distributed via `npx skills add`, Claude Code plugin marketplace, and git clone.

**Finding: NOT FOUND.** Confirmed via negative searches across all plausible distribution surfaces: no SKILL.md in the toeverything org, no `.claude-plugin/` directory in AFFiNE or BlockSuite repos, no `affine`/`blocksuite` entry in the `skills` npm registry or agentskills.io, no cursor-rules, no community repos for "affine agent skills" at meaningful scale.

**Scale comparison:**

| Project | Stars (2026-04-11) |
|---|---|
| `kepano/obsidian-skills` | 22,662 |
| `DAWNCR0W/affine-mcp-server` (largest AFFiNE-AI community repo) | 140 |
| `tomohiro-owada/affine-cli` | 9 |

AFFiNE's agent-integration community is ~0.6% the scale of Obsidian's — roughly 162× smaller.

**Why the gap is structural, not incidental:**

1. **CRDT-binary canonical format is not agent-friendly.** `obsidian-skills` works because agents can `read` and `write` Obsidian's markdown files directly. AFFiNE agents need MCP orchestration through a documented-lossy adapter — no "open this file and edit it" path exists.
2. **Product-bundled LLM strategy is ecosystem-suppressing.** AFFiNE sells in-product AI (BYOK + bundled models). Externalizing format intelligence via `SKILL.md` competes with in-product LLM-revenue capture. Same structural dynamic that prevents Notion from externalizing.
3. **No CEO-scale distribution figure.** Obsidian has Steph Ango (`@kepano`) with a personal brand and a now-22.6K-star repo authority. AFFiNE's founder-CEO has no comparable community distribution engine, and community has not organically produced a substitute.

**Implications for landscape positioning:**

- The agent-format-distribution layer is owned by Obsidian. AFFiNE does not contest this surface and — per the structural constraints above — will not contest it organically.
- This finding is the main driver of AFFiNE's re-classification from Tier 1 (Medium overlap) to Tier 3 (Low overlap) in Section 6 below. "Most technically capable potential entrant" overweighted technical capability; the updated analysis surfaces execution, economic, and ecosystem constraints that flip the threat framing.

_Detailed evidence: [`../affine-strategic-deep-dive/`](../affine-strategic-deep-dive/) — particularly `evidence/d4-distribution-strategy.md` for the negative-search methodology and `REPORT.md` Section 4 (Synthesis) for the three-constraint framework._

### D10: Mintlify's Agent-Distribution — The "Third Position" (2026-04-11)

Symmetric to D8 (Obsidian) and D9 (AFFiNE), a 2026-04-11 audit ([`../mintlify-strategic-deep-dive/`](../mintlify-strategic-deep-dive/)) asked whether Mintlify has a SKILL.md-style centralized agent-format-distribution play. It does not — but for a different reason than AFFiNE.

**Finding:** Mintlify occupies a **structurally different position** from both Obsidian (centralized 22,662-star curation) and AFFiNE (total absence). It distributes agent-readable formats via **decentralized auto-generation on top of standards it did not author**.

Every Mintlify-hosted docs site auto-generates a `skill.md` conforming to [Anthropic's Agent Skills specification](https://agentskills.io), served at `/.well-known/skills/default/skill.md`. Content is product-specific (decision tables, capabilities, constraints) — not boilerplate. Discoverable by 35+ agents via the agentskills.io standard; installable via `npx skills add <docs-url>`. Regenerates on every deploy, customer-overridable.

**But there is no centralized `mintlify-skills` repo.** The closest Mintlify-authored agent integration (`mintlify-claude-plugin`) has **1 GitHub star** — 22,662× smaller than `kepano/obsidian-skills`. Mintlify's largest community ecosystem repo (`remorses/holocron`, 535 stars) is an **OSS replacement**, not an extension — adversarial community energy rather than extensional.

**Three-way distribution comparison:**

| Dimension | Obsidian | Mintlify | AFFiNE |
|---|---|---|---|
| Distribution model | Centralized curation (1 repo, 5 skills) | Decentralized auto-generation (N per-site) | None |
| What agents learn | Obsidian's proprietary format (universal) | Each customer's product/API (per-site) | Nothing |
| Top ecosystem repo stars | 22,662 (kepano/obsidian-skills) | 1 (mintlify-claude-plugin); 535 (holocron — OSS replacement) | 140 (DAWNCR0W/affine-mcp-server) |
| Standards authored | 0 (adopts Agent Skills) | 0 (adopts all four: llms.txt, CN, MCP, Skills) | 0 |
| Community energy | Extensional (plugins, skills, themes) | Adversarial (OSS replacements) | Fragmentary |

**Mintlify's moat is convenience bundling — and it is time-bound.** Mintlify is the **only platform auto-bundling all four "agents reading docs" standards** at deploy time. But it authored zero of them — llms.txt is [Jeremy Howard / Answer.AI](https://llmstxt.org), content negotiation is [IETF RFC 7763](https://datatracker.ietf.org/doc/html/rfc7763), MCP is [Anthropic](https://modelcontextprotocol.io), and Agent Skills is [Anthropic](https://github.com/anthropics/skills). Competitors are closing: [GitBook](https://www.gitbook.com/blog/new-in-gitbook-september-2025) matches on llms.txt + MCP auto-generation; Docusaurus community plugins cover llms.txt + MCP + content negotiation.

**Implications for landscape positioning:**

- Mintlify owns the "zero-config agents-reading-docs layer" *for now* — not by standards authorship, by faster integration.
- The advantage compounds each week competitors fail to match the four-standard bundle, but erodes each week they do.
- This is a materially different competitive posture than Obsidian's (format-authorship moat via centralized curation) or AFFiNE's (absent). All three occupy distinct positions in the distribution layer — the landscape now has three strategic shapes, not two.
- Mintlify's Tier-1 #1 ranking (see Section 6) is partially supported by this distribution moat, but the moat's time-bound nature means the ranking is vulnerable to competitor standards adoption.

_Detailed evidence: [`../mintlify-strategic-deep-dive/`](../mintlify-strategic-deep-dive/) — particularly `evidence/d3-distribution-strategy.md` for standards-authorship audit and `REPORT.md` Section 3 D3 for the full three-way comparison._

---

## 4. Competitive Positioning Matrix

| Dimension | Notion | Confluence | Obsidian | Mintlify | Outline | AFFiNE | Chroma |
|---|---|---|---|---|---|---|---|
| **Editing Experience** | Rich WYSIWYG, 50+ blocks | Weak (persistent complaints) | Best-in-class markdown | Competent (docs-focused) | Clean but basic (~20 blocks) | Ambitious (doc+whiteboard+DB) | None |
| **AI / Agent Story** | Agent-captive (bundled LLM, credits) | AI-bolted-on (Rovo, bundled free) | None in core (community only) | Read-only MCP, bundled LLM | Basic (AI Answers + MCP) | LLM-assisted editing | Retrieval infra (Context-1) |
| **Canonical Format** | Proprietary blocks | ADF (proprietary JSON) | Markdown files | MDX in git | ProseMirror JSON | CRDT binary (Yjs) | Embedding vectors |
| **Data Portability** | Low (lossy export) | Low (lossy, no native MD export) | High (plain files) | Moderate (MDX portable, config not) | Moderate (lossy MD export) | Low (opaque binary) | Low (programmatic only) |
| **Real-Time Collab** | Mature | Mature (Live Docs) | None (single-player) | None (git branches) | Mature (Y.js CRDT) | Maturing (Y.js CRDT) | None |
| **Branching / PR Workflow** | None | None | Via plugin (not core) | Yes (native git) | None | None | None |
| **OSS License** | Proprietary | Proprietary | Proprietary (free to use) | Proprietary | BSL 1.1 (source-available) | MIT | Apache 2.0 |
| **Self-Hosted** | No | DC (EOL 2029) | Yes (local app) | No | Yes (Docker) | Yes (Docker) | Yes |
| **Plugin Ecosystem** | None | Forge (transitioning) | 2,736 plugins | None | None | Nascent (BlockSuite) | Framework integrations |
| **MCP Server** | Official (22 tools, R+W) | Official (11 tools, R+W) | Community (12+ servers) | Auto-generated R-only externally; 1P write pipeline internally (4–8wk to bidirectional) | First-party (R+W) | Community single-maintainer (~36 tools, R+W, no co-creation) | Official (12 tools, R+W) |
| **Agent Identity / Attribution** | No | No | No | N/A | No | No | N/A |
| **Zero LLM Compute** | No ($10/1K credits) | No (Rovo bundled) | Yes (no AI in product) | No (Claude, Trieve) | No (OpenAI) | No (multi-model) | No (Context-1) |

---

## 5. Strategic White Space

No competitor has built -- and structural incentives prevent incumbents from building -- the following combination:

**1. Markdown as canonical format with rich collaborative editing.** Every competitor with real-time collaboration stores content in a proprietary or opaque format (Notion blocks, ADF, ProseMirror JSON, CRDT binary). Every competitor with markdown as canonical (Obsidian, Mintlify) lacks real-time co-editing. The technical foundation exists (CodeMirror 6 + Y.js CRDTs + markdown) but no product ships this combination.

**2. Git-native version control for knowledge.** Branching, merging, pull requests, and structural diffs for content are nearly absent. Only Mintlify offers them (via native git), and Mintlify is docs-only with no real-time editing. For agent collaboration -- where agents draft on branches and humans review before merging -- this is foundational infrastructure that does not exist in any knowledge platform.

**3. Bidirectional MCP with agent co-creation primitives.** Every MCP implementation is either read-only (Mintlify) or CRUD-without-co-creation (others). No MCP server supports agent identity, attribution, staging areas, review workflows, event subscription, or scoped permissions. The next frontier beyond CRUD is agents as first-class knowledge participants.

**4. Zero LLM compute in the knowledge layer.** Every AI-enabled competitor bundles LLM compute and monetizes it (or bundles it as table-stakes). A platform where agents bring their own intelligence via MCP and the knowledge layer runs zero LLM compute occupies a structurally different economic position. Users choose their own models, control costs, and avoid vendor lock-in at the AI layer.

**5. True open-source core with cloud monetization.** Only AFFiNE (MIT) and Chroma (Apache-2.0) offer genuine open-source licenses. AFFiNE lacks the markdown substrate and agent-native design. Chroma is retrieval infrastructure, not a knowledge platform. An MIT/Apache-licensed knowledge platform with a managed cloud offering would have a governance and community-building advantage.

---

## 6. Threat Assessment

Ranked by likelihood and ability to compete in the agent-native knowledge platform space:

**Tier 1: Highest Threat (strategic proximity, resources to act)**

1. **Mintlify** -- The most credible near-term threat. *Ranking re-grounded 2026-04-11 via [`../mintlify-strategic-deep-dive/`](../mintlify-strategic-deep-dive/)*. Already shipping aggressively (20+ product improvements in a 9-day April audit window), has absorbed two seed-stage YC acquisitions (Trieve July 2025, Helicone March 2026), and operates a production-grade internal write pipeline (Daytona + OpenCode + Claude Opus 4.6) through Workflows, KB Agent, and the Enterprise Agent Job API. **Key re-framing:** the original "if Mintlify adds bidirectional MCP" framing understated proximity — the engineering delta from existing read-only MCP to basic bidirectional MCP is **4–8 weeks**, and 6 of 7 agent co-creation primitives already score PARTIAL or better (contrast AFFiNE: NOT FOUND on 6 of 7). The genuine gate is business-case friction (customer docs are high-stakes; exclusive-writer positioning is a deliberate moat choice), not architecture. Persistent gaps: docs-only product surface, closed source, cash runway dependency (~$4–10M remaining, Series B likely in 2026), ecosystem ownership is *convenience bundling* of four standards Mintlify did not author (llms.txt, content negotiation, MCP, Agent Skills — see D10). Probability of overlap: **Medium-High** (holds — same ranking, different justification). Primary decision triggers: (a) if Mintlify ships bidirectional MCP externally, threat hardens; (b) if Series B downsized or delayed past Q3 2026, capital constraint tightens toward AFFiNE territory.

2. **AFFiNE** -- *Downgraded to Tier 3 per 2026-04-11 re-audit (see new item #9 below and [`../affine-strategic-deep-dive/`](../affine-strategic-deep-dive/)). The original ranking ("most technically capable potential entrant," **Medium** probability) overweighted technical capability and announced pivot; the updated analysis weights execution, economics, and ecosystem structure — all of which flip the threat framing. Current probability of overlap:* **Low**.

**Tier 2: Moderate Threat (partial overlap, significant barriers)**

3. **Notion** -- Has the distribution ($600M ARR, 100M+ users, Fortune 500) and AI investment (autonomous agents, multi-model, MCP). But is economically locked into its walled garden. Adopting markdown+git would undermine the proprietary block model; removing bundled LLM compute would kill agent credits revenue. Probability of overlap: **Low** (would require self-destruction of business model).

4. **Confluence/Atlassian** -- Has enterprise distribution (300K+ customers), GA MCP server, and Rovo AI. But ADF format lock-in would take years to unwind, and the Jira coupling means Confluence competes as part of a bundle, not standalone. The forced DC-to-Cloud migration creates a brief window of customer openness to alternatives. Probability of overlap: **Low**.

5. **Semiont (AI Alliance)** -- The closest conceptual competitor: open-source, explicitly agent-native, humans and agents as "architectural equals." But is alpha-stage with no production users, and institutional backing (IBM, AI Alliance) may slow shipping velocity. Probability of overlap: **Medium** (concept), **Low** (production-ready product in near term).

**Tier 3: Low Threat (different category or limited resources)**

6. **Obsidian** -- Has developer trust, markdown substrate, and plugin ecosystem. But will not build collaboration, AI, or enterprise features due to philosophical and capacity constraints. A competitor building "Obsidian but collaborative and agent-native" occupies territory Obsidian has explicitly chosen not to enter. Probability of overlap: **Very Low**.

7. **Outline** -- Has collaboration maturity (Y.js CRDT) and MCP. But ProseMirror JSON canonical format, BSL license, no extensibility model, and one-person core team constrain its trajectory. Probability of overlap: **Low**.

8. **Chroma** -- Different category entirely (retrieval infrastructure, not knowledge platform). Would need to build an entirely new product surface to compete. More likely to be complementary infrastructure. Probability of overlap: **Very Low**.

9. **AFFiNE** -- *Reclassified from Tier 1 on 2026-04-11.* The original Tier 1 framing ("most technically capable potential entrant") was load-bearing on claims that do not hold in 2026: BlockSuite is a dormant downstream mirror (zero commits on `main` since 2025-07-07, zero non-AFFiNE production adopters), the AI-KB pivot announced at v0.25.0 (2025-10-13) has shipped zero new AI features through v0.26.3 (Feb 2026), the sole MCP integration is a single-maintainer community server (`DAWNCR0W/affine-mcp-server`) with six of seven co-creation primitives absent, and there is no D8-equivalent agent-distribution play (see D9). Structurally constrained by 17+ months without new funding (~$18M seed total, ~21-person team, enterprise tier incomplete), a CRDT-binary canonical format that is not agent-friendly, and a product-bundled LLM strategy that suppresses ecosystem externalization. AFFiNE's axis of competition is enterprise self-host + rich collaborative editing, not agent-native knowledge management. Probability of overlap: **Low**. See [`../affine-strategic-deep-dive/`](../affine-strategic-deep-dive/) for full analysis.

---

## 7. Landscape Summary

Beyond the seven primary competitors, 12+ secondary players were analyzed. Key findings:

**Most relevant secondary players:**

- **Docmost** (AGPL-3.0, 19.6K stars): Fast-moving OSS wiki with AI features and MCP server. Closest to Outline in category but with genuine agent-integration surface. AI features gated behind proprietary enterprise license.
- **Semiont** (AI Alliance): Open-source "knowledge kernel" where humans and agents are architectural equals. W3C Web Annotation standard. Alpha-stage, research-oriented.
- **GitBook**: Auto-generates MCP server and llms.txt on every published docs site. Reported 40%+ of docs readership from AI systems by December 2025. Closed-source, docs-only.
- **Guru**: Ships MCP server, Knowledge Agents for department-specific Q&A, automated content verification. $25/user/month (10-seat minimum). Enterprise KM, not developer-facing.
- **AnyType**: Local-first P2P with official MCP server and Local API for pointing local LLMs at vaults. Source-available (non-standard license), focused on sovereign personal knowledge.

**Agent memory infrastructure (adjacent, crowding fast):**

- **Mem0**: Most mature long-term memory framework. Graph + flat memory. 26% higher accuracy than OpenAI Memory on LOCOMO benchmark.
- **Zep/Graphiti**: Temporal knowledge graph. 14K GitHub stars in 8 months. MCP server for persistent graph memory.
- **Letta (MemGPT)**: "LLM-as-Operating-System" paradigm with self-managing memory. Targets GPT-5 and Claude 4.5 Sonnet.
- **OpenViking (ByteDance)**: Context database treating agent context as virtual filesystem. 15K+ GitHub stars in 3 months.

**Not competitive:** BookStack (no AI, no MCP), Wiki.js (stalled v3, no AI), Tettra (minor, no MCP), Logseq (personal-only, community AI only), AppFlowy (feature-chasing Notion, no agent story).

The broader market signal: Gartner predicts 40% of enterprise applications will include task-specific AI agents by end of 2026. MCP has become the de facto integration standard (natively supported by Anthropic, OpenAI, Google, Microsoft). No single "agent-native knowledge platform" startup has emerged as a category leader. The space is fragmenting between traditional KM tools adding AI/MCP, agent memory infrastructure, semantic layers, and OSS wikis with emerging AI.

---

## 8. Limitations & Open Questions

**Limitations of this analysis:**

1. **Private roadmaps are invisible.** Notion, Confluence, and Mintlify may have internal plans for agent-native features not yet announced. Mintlify's acquisition pace suggests capabilities not yet shipped.
2. **Usage data is estimated.** Obsidian's revenue (~$25M ARR), Mintlify's ARR ("8-figures"), and AFFiNE's user metrics are from third-party estimates, not verified financial disclosures.
3. **Self-hosted deployment reality is untested.** Outline and AFFiNE self-hosting claims were assessed from documentation, not from production deployment experience.
4. **Agent memory vs. knowledge platform boundary is theoretical.** Whether organizational knowledge and agent memory converge into one product or remain separate infrastructure layers is an open question that could reshape competitive dynamics.

**Open questions for further investigation:**

1. **How will Mintlify's Helicone acquisition (March 2026) expand its product surface?** The LLM observability + AI gateway capabilities could enable Mintlify to offer agent-native infrastructure beyond documentation.
2. **Will AFFiNE's "AI knowledge base" pivot include agent-native primitives?** BlockSuite's architecture is technically suited for agents as Yjs peers -- is there internal work toward this?
3. **What is the adoption curve for MCP in enterprise?** If MCP adoption accelerates, the window for establishing an agent-native platform may be shorter than expected.
4. **Does Semiont's AI Alliance backing accelerate or constrain its development?** Consortium-driven projects can move slowly but have institutional adoption advantages.
5. **How quickly will the agent memory layer (Mem0, Zep, Letta) mature, and does an agent-native knowledge platform need to integrate or compete with it?**

---

## 9. References

### Evidence Files

- [evidence/d1-editing-experience.md](evidence/d1-editing-experience.md) -- Editor architectures, block types, search quality, developer benchmarks
- [evidence/d2-ai-agent-story.md](evidence/d2-ai-agent-story.md) -- MCP server comparison, AI architecture patterns, agent co-creation gaps
- [evidence/d3-storage-format-model.md](evidence/d3-storage-format-model.md) -- Canonical format spectrum, portability assessment, git integration, API constraints
- [evidence/d4-collaboration-multiplayer.md](evidence/d4-collaboration-multiplayer.md) -- Real-time collaboration maturity, version history, branching gap, agent collaboration
- [evidence/d5-oss-licensing-pricing.md](evidence/d5-oss-licensing-pricing.md) -- License comparison, pricing tiers, funding, business model patterns
- [evidence/d6-strategic-direction.md](evidence/d6-strategic-direction.md) -- Positioning trajectories, acquisitions, structural barriers, convergence likelihood
- [evidence/d7-developer-experience.md](evidence/d7-developer-experience.md) -- Plugin ecosystems, API quality, SDK availability, extensibility gaps
- [evidence/d8-obsidian-skills-agent-strategy.md](evidence/d8-obsidian-skills-agent-strategy.md) -- obsidian-skills deep investigation, Agent Skills specification, distribution model, competitive implications

### Primary External Sources

**Notion:** [notion.com](https://www.notion.com/), [Notion 3.0 Release (Sept 2025)](https://www.notion.com/releases/2025-09-18), [Notion 3.3 Release (Feb 2026)](https://www.notion.com/releases/2026-02-24), [Notion MCP Blog](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look), [Notion MCP GitHub (4.2K stars)](https://github.com/makenotion/notion-mcp-server), [Notion API Docs](https://developers.notion.com/docs/getting-started), [Notion Data Model Blog](https://www.notion.com/blog/data-model-behind-notion), [Notion Pricing](https://www.notion.com/pricing)

**Confluence:** [Atlassian MCP GitHub (Apache-2.0)](https://github.com/atlassian/atlassian-mcp-server), [Rovo MCP Supported Tools](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/), [ADF Specification](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/), [Confluence DC EOL](https://www.atlassian.com/licensing/data-center-end-of-life), [Team '25 Recap](https://www.forty8fiftylabs.com/blog/team-25-recap-part-1-key-atlassian-product-announcements-every-technical-leader-should-know/), [Rovo Pricing Shift (TechTarget)](https://www.techtarget.com/searchitoperations/news/366622263/Atlassian-Rovo-pricing-shifts-amid-AI-adoption-struggles)

**Obsidian:** [obsidian.md](https://obsidian.md/), [obsidian-skills (21K stars)](https://github.com/kepano/obsidian-skills), [Agent Skills Specification](https://agentskills.io/specification), [npx skills CLI (Vercel Labs)](https://www.npmjs.com/package/skills), [File Over App essay](https://stephango.com/file-over-app), [Obsidian Forum: Collaborative Editing FR (2,200+ votes)](https://forum.obsidian.md/t/obsidian-sync-live-team-collaborative-editing/6058), [Obsidian Plugin API Docs](https://docs.obsidian.md/Home), [Obsidian Stats](https://fueler.io/blog/obsidian-usage-revenue-valuation-growth-statistics)

**Mintlify:** [mintlify.com](https://www.mintlify.com/), [Mintlify MCP Docs](https://www.mintlify.com/docs/ai/model-context-protocol), [llms.txt Docs](https://www.mintlify.com/docs/ai/llmstxt), [skill.md Blog](https://www.mintlify.com/blog/skill-md), [Mintlify acquires Trieve (July 2025)](https://www.mintlify.com/blog/mintlify-acquires-trieve-to-improve-rag-search-in-documentation), [Mintlify acquires Helicone (March 2026)](https://www.mintlify.com/blog/mintlify-acquires-helicone), [Series A ($18M, a16z)](https://www.mintlify.com/blog/series-a), [Agent Era Blog](https://www.mintlify.com/blog/knowledge-management-agent-era)

**Chroma:** [trychroma.com](https://www.trychroma.com/), [Chroma GitHub (27K stars)](https://github.com/chroma-core/chroma), [Chroma MCP GitHub](https://github.com/chroma-core/chroma-mcp), [Context-1 Research](https://www.trychroma.com/research/context-1), [Package Search MCP](https://www.trychroma.com/package-search), [Chroma Pricing](https://www.trychroma.com/pricing)

**Outline:** [getoutline.com](https://www.getoutline.com/), [Outline GitHub (37.9K stars)](https://github.com/outline/outline), [Outline MCP Changelog](https://www.getoutline.com/changelog/mcp), [Outline Pricing](https://www.getoutline.com/pricing), [Outline LICENSE (BSL 1.1)](https://github.com/outline/outline/blob/main/LICENSE), [Outline API Docs](https://www.getoutline.com/developers)

**AFFiNE:** [affine.pro](https://affine.pro/), [AFFiNE GitHub (67K stars)](https://github.com/toeverything/AFFiNE), [BlockSuite](https://block-suite.com/), [y-octo on crates.io](https://crates.io/crates/y-octo), [AFFiNE December Update](https://affine.pro/blog/whats-new-dec-update), [BlockSuite Data Synchronization](https://block-suite.com/guide/data-synchronization.html), [AFFiNE Pricing](https://affine.pro/pricing)

**Secondary Competitors:** [Docmost](https://github.com/docmost/docmost), [Semiont (AI Alliance)](https://github.com/The-AI-Alliance/semiont), [GitBook AI](https://www.gitbook.com/features/ai), [Guru](https://www.getguru.com/), [AnyType MCP](https://github.com/anyproto/anytype-mcp), [Mem0](https://mem0.ai/), [Zep/Graphiti](https://www.getzep.com/), [Letta](https://www.letta.com/), [OpenViking](https://github.com/volcengine/OpenViking)
