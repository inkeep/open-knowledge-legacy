# Evidence: Emerging Stack + Relationship to Local Knowledge Platforms

**Dimension:** D5 — The layered agent-readable web stack. D6 — How llms.txt relates to walkable index.md.
**Date:** 2026-04-07
**Sources:** NxCode, Mastra, agentskills.io, Cloudflare, Karpathy, Mintlify, GitBook

---

## D5: The Emerging Stack

### No single canonical "unified stack" document exists, but layers are converging
**Confidence:** CONFIRMED

Emergent layering from bottom to top:
1. **Permissions:** Content-Signal / robots.txt (may I use this?)
2. **Discovery:** llms.txt / index.md / AGENTS.md (what's here?)
3. **Delivery:** Content Negotiation / raw markdown (give it efficiently)
4. **Project Context:** AGENTS.md / CLAUDE.md (codebase-specific norms)
5. **Procedural Knowledge:** Agent Skills / SKILL.md (how to do domain tasks)
6. **Tool Connectivity:** MCP (interact with external tools/APIs)
7. **Agent Communication:** A2A (agent-to-agent coordination)

### Competing visions exist
**Confidence:** CONFIRMED
"MCP for everything" (LangChain mcpdoc wraps llms.txt in MCP) vs "layered/composable" (Anthropic: skills ≠ MCP) vs "protocol overload" concern (A2A + MCP + AG-UI + A2UI overlapping).

### Anthropic explicitly: skills and MCP are complementary, not competing
**Confidence:** CONFIRMED
"MCP provides connectivity. Skills provide procedural intelligence."

---

## D6: Relationship to Local KB with Walkable Indexes

### llms.txt and index.md are structurally the same pattern at different scales
**Confidence:** CONFIRMED
Both: markdown file, one-line-per-entry with link + description, hierarchically organized. llms.txt = web domain root. index.md = folder root. Karpathy: "navigating the knowledge base the way a human expert would — using a table of contents, not a vector search."

### A KB's index.md can serve as llms.txt when published
**Confidence:** CONFIRMED
Mintlify auto-generates llms.txt from doc structure (essentially index.md). GitBook does the same. Root index.md → rename to llms.txt is trivial transformation.

### Content negotiation is unnecessary for local-first platforms
**Confidence:** CONFIRMED
Web needs negotiation because HTML is default. Locally, markdown IS the default. No negotiation needed — the format optimized for agents is the storage format.

### The "portable agent interface" philosophy is shared across all patterns
**Confidence:** CONFIRMED
llms.txt, AGENTS.md, SKILL.md, index.md: all markdown files at well-known paths teaching agents what's here. Same pattern, different scopes:
- Web: llms.txt at domain root
- Local KB: index.md at folder root
- Skills: SKILL.md at skill folder root
- Codebase: AGENTS.md/CLAUDE.md at repo root
