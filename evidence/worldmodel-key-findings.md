---
title: "Worldmodel grounding — key findings for project scoping"
type: synthesis
created: 2026-04-02
---

## TLDR
No existing product treats AI agents as first-class co-creators of knowledge. The gap is validated. The critical technical risk is markdown round-trip fidelity in collaborative editing — no one has solved this.

## Most relevant findings

### 1. Competitive validation: no agent-native knowledge co-creation exists
Notion AI, Confluence AI, Guru AI, Slite AI all bolt AI onto human-first tools. Obsidian + MCP servers is the closest (CEO maintains kepano/obsidian-skills, 19K stars) but it's an ecosystem of plugins, not a designed product. **Semiont** (AI Alliance/Linux Foundation) is the only purpose-built "agent-native wiki" — but early-stage, uses W3C Web Annotation (not markdown-in-git), and has no collaborative editor.

### 2. Key technical risk: markdown round-trip fidelity
No existing product demonstrates Notion-grade collaborative editing with markdown-as-canonical-format and full round-trip fidelity. AFFiNE exports to markdown but canonical format is CRDT document. Obsidian is markdown-canonical but single-player. The tension: rich editing features (tables, embeds, callouts, code blocks with metadata) vs markdown as the canonical format. This parallels OpenDesign's TSX round-trip challenge (Report 12).

### 3. Editor framework landscape → DECIDED (TQ4)
ProseMirror + Yjs is the de facto standard. After deep research (MDX round-trip fidelity report, CMS custom components survey, Fumadocs pipeline analysis), TQ4 resolved to: **unified WYSIWYG editor (TipTap or Milkdown + y-prosemirror) with void nodes for JSX components.** JSX components stored as raw strings in void nodes — no conversion, no round-trip issue. Registered components get visual preview + auto-generated prop panel (react-docgen-typescript from TypeScript interface). Ruled out: BlockNote (lossy markdown), BlockSuite (CRDT-canonical not markdown), full WYSIWYG MDX editing (3-6 months, 6 failure vectors, zero prior art). Plate's MDX pipeline (TinaCMS) informed the void-node approach but slate-yjs is abandoned.

### 4. Confluence dissatisfaction = market opening
October 2025 cloud pricing increases (5-10% depending on tier; some enterprise contracts saw larger increases during forced Server→Cloud migration), widely-criticized editor, poor search. Teams migrating to Notion then hit governance/permissions at scale. Active replacement market — though "active" is characterization based on qualitative signals, not quantified churn data.

### 5. OSS + cloud monetization proven models
Two variants work: (a) self-hosted free + managed cloud paid (Outline $10/mo, Docmost AGPL+enterprise), (b) OSS framework + hosted platform. AGPL license used by multiple successful OSS knowledge tools as copyleft strategy.

### 6. MCP ecosystem scale
16,000+ MCP servers across 10+ registries. Official registry (Sept 2025). agentskills.io standard (Dec 2025, 30+ adopters) for skill distribution. Supply chain security is an active problem.

### 7. Closest competitors to watch
- **Docmost:** AGPL, real-time collab, AI Answers with semantic search, supports Ollama for local LLMs, self-hosted/air-gapped. Most aligned competitor.
- **AFFiNE:** MIT, docs+whiteboards+databases on BlockSuite+Yjs. CRDT-native. Cloud or self-hosted. Most technically sophisticated OSS competitor.
- **Outline:** BSL, real-time collab, markdown support. Most established OSS wiki. But BSL = not true OSS.
- **Semiont:** AI Alliance, agent-native wiki, W3C Web Annotation, MCP integration. Most philosophically aligned. But early-stage, no production deployments.

## Implications for project scoping
- The thesis is validated: no one owns "agent-native knowledge co-creation"
- The technical risk is real: markdown round-trip fidelity needs investigation early (risk-first phasing)
- BlockNote or TipTap are the likely editor choices; BlockSuite is interesting but different ecosystem
- AGPL is the proven copyleft strategy for this category
- The MCP server surface should follow agentskills.io conventions for distribution
