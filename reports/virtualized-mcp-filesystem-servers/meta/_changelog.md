# Changelog

## 2026-04-02 — Corrective: Multiple MCP servers DO expose filesystem tools over non-filesystem backends
**Update type:** Corrective
**Why this pass happened:** User suspected the central claim ("no one has built a virtualized-backend MCP filesystem server") was wrong and requested deep verification across 30+ products/platforms.

### Scope (delta only)
- D2 (Virtualized/Proxy MCP Servers): deep re-investigation across sandbox providers, knowledge platforms, vector DBs, developer tools, and MCP registries
- D4 (Container/Sandbox MCP Servers): added Replit MCP, CodeSandbox MCP, updated Daytona details

### What changed (current-state)
- REPORT.md — sections touched: Executive Summary (central claim corrected), D2 (rewritten with counterexamples), D4 (updated table and analysis), Landscape Summary (redrawn), Limitations (updated), References (12 new sources added)
- Evidence — added: `evidence/d2-virtualized-proxy-correction-2026-04-02.md` (primary corrective evidence with 9 findings across Tier 1/2/3 servers and negative searches)
- Frontmatter — added subjects: GitHub MCP Server, Replit MCP, Obsidian MCP, CodeSandbox MCP, filesystem-mcp-rs. Added topic: remote filesystem MCP tools.

### Notes on confidence / contradictions
- The original claim "No MCP server exists that exposes filesystem tool names while routing to a non-filesystem backend" was overly broad. CONFIRMED counterexamples: Replit MCP (7 standard FS tools over GraphQL), E2B MCP (prefixed FS tools over sandbox), GitHub MCP (file CRUD over REST), Obsidian MCP (file tools over REST API), Daytona MCP (partial FS names over sandbox API).
- The REFINED claim is: "No MCP server targets behavioral compatibility with a coding agent's native tool conventions (cat -n format, exact-match edit, grep richness)."
- This narrows the gap from "nobody does this" to "nobody does this with agent-native behavioral fidelity."

### Open questions / gaps
- Replit MCP (NOVA-3951) is a community project — reliability, API coverage, and maintenance unknown.
- Whether any discovered server's `read_file` returns content in a format compatible with Claude Code's Edit tool (cat -n line numbering) — untested.
- E2B may have additional file tools beyond what web search surfaced — SDK docs suggest richer file operations.
