---
title: "Obsidian AI / Agent Story - Evidence"
type: evidence
dimension: "D2 - AI / Agent Story"
collected: 2026-04-02
sources:
  - https://github.com/kepano/obsidian-skills
  - https://deepwiki.com/kepano/obsidian-skills
  - https://vibecoding.app/blog/obsidian-skills-review
  - https://addozhang.medium.com/obsidian-skills-empowering-ai-agents-to-master-obsidian-knowledge-management-8b4f6d844b34
  - https://kurtis-redux.medium.com/obsidians-official-skills-are-here-it-s-time-to-let-ai-plug-into-your-local-vault-6c149aae84f6
  - https://medium.com/@hamzakhaledlklk/obsidians-ceo-just-taught-ai-how-to-use-his-own-app-here-s-the-0-way-to-do-it-too-97acbe8cfefe
  - https://forum.obsidian.md/t/official-mcp-core-plugin/109276
  - https://forum.obsidian.md/t/obsidian-mcp-servers-experiences-and-recommendations/99936
  - https://mayeenulislam.medium.com/using-mcp-in-obsidian-the-right-way-646cf56ec7a7
  - https://github.com/danielrosehill/Awesome-Obsidian-AI-Tools
---

# D2: AI / Agent Story - Evidence

## CEO's Official Position: Skills, Not Embedded AI

Steph Ango (kepano), Obsidian's CEO, pushed `obsidian-skills` in January 2026. This is the most significant official signal about Obsidian's AI strategy. Key observation: **Obsidian chose to teach agents how to use their formats, rather than embedding AI into the product.**

### obsidian-skills (19K GitHub stars)

Five agent skills:
1. **obsidian-markdown** — Obsidian Flavored Markdown (wikilinks, embeds, callouts, properties, Mermaid, LaTeX)
2. **obsidian-bases** — Bases format (.base files, views, filters, formulas)
3. **json-canvas** — JSON Canvas format (nodes, edges, groups)
4. **obsidian-cli** — Vault interaction via CLI (open, plugin dev, theme dev)
5. **defuddle** — Web content to clean markdown extraction

Compatible with: Claude Code, Codex CLI, OpenCode. Follows the Agent Skills specification.

**What this tells us about strategy:**
- Obsidian is not building its own AI layer
- Obsidian is positioning its formats as the substrate that external agents interact with
- The CEO personally maintains the agent skills — this is a leadership priority, not a side project
- The approach is format-native: teach agents the format, let them use any tool (filesystem, MCP, CLI) to interact

## MCP Server Ecosystem (Community-Driven)

12+ MCP servers exist. None are official Obsidian products. All are community-built.

**Forum feature request for official MCP core plugin** exists but no official response or commitment from the team.

Key architectural split:
- **Filesystem-based** (mcpvault) — works without Obsidian running, reads .md files directly
- **REST API-based** (Pfundstein, cyanheads) — requires Obsidian Local REST API plugin running
- **Plugin-native** (aaronsb, iansinnott) — plugin IS the MCP server, richest but requires Obsidian desktop

**Critical limitation: All MCP servers grant full read/write/delete vault access. No read-only mode. No granular permissions. No file-level ACLs.**

## Embedded AI Plugins (Community-Driven)

86 AI plugins catalogued in Awesome-Obsidian-AI-Tools. Major ones:

| Plugin | Stars | What It Does |
|--------|-------|-------------|
| Claudian | 5,700 | Spawns Claude Code CLI inside Obsidian |
| Copilot | 5,776 | General AI assistant, chat with vault |
| Smart Connections | 4,357 | Local embeddings, semantic note linking |
| Agent Client | 1,400 | Multi-agent (Claude, Codex, Gemini) |
| Text Generator | 1,837 | Multi-provider text generation |

**None of these are official Obsidian products.** The Obsidian team has not shipped any AI feature into the core app or official plugins.

## Can External Agents Meaningfully Interact?

**Yes, but with friction:**

1. **Claude Code can read/write vault files natively** — just `cd` into the vault. No MCP needed for basic operations.
2. **obsidian-skills teaches Claude correct syntax** — without it, Claude breaks wikilinks, mangles callouts, corrupts frontmatter.
3. **MCP servers add search and metadata operations** — BM25 search, tag management, frontmatter CRUD.
4. **Fundamental limitation: agents cannot trigger Obsidian UI actions** — can't open notes, run commands, trigger plugins, or interact with canvas/graph. The agent operates on files, not on the application.
5. **No event system for agents** — agents can't subscribe to vault changes, get notified of edits, or react to user actions.
6. **Concurrent access is risky** — if Obsidian and an agent write to the same file simultaneously, data loss is possible. No file locking, no CRDT, no conflict resolution between app and agent.

## Maturity Assessment

The AI integration is **early-stage and entirely community-driven**:
- No AI features in core Obsidian
- CEO signals support via skills repo but no product investment
- MCP servers are community-maintained with varying quality
- No official API for agent interaction beyond filesystem access
- The "best" integration is literally just running Claude Code in the vault directory

**For a competitor building an agent-native platform, Obsidian's AI story is both an opportunity and a warning:**
- Opportunity: Obsidian has proven massive demand for AI+knowledge integration (86 plugins, 19K-star skills repo) but has not built the product to serve it
- Warning: The community has filled many gaps. A new entrant must offer meaningfully more than "filesystem access + skills file"
