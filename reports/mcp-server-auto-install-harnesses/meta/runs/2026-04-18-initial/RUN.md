---
runId: 2026-04-18-initial
status: Closed
startedAt: 2026-04-18
closedAt: 2026-04-18
orchestrator: claude-opus-4-7[1m]
---

# Run: Initial MCP auto-install harness landscape

## Purpose

First pass across all 11 rubric dimensions × 7 harnesses. Produce a matrix-shaped
evidence base and synthesis report on how to programmatically auto-register an
MCP server (stdio-primary, HTTP/SSE as comparison) into each AI coding harness,
with emphasis on non-interactive / minimum-interaction install flows.

## Rubric (locked)

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| 1 | Config-file surface per harness | P0 | Deep |
| 2 | Official CLI install commands | P0 | Deep |
| 3 | Direct config-write + idempotent-merge semantics | P0 | Deep |
| 4 | Deep-link / one-click install URI schemes | P0 | Moderate |
| 5 | Stdio vs HTTP/SSE install-shape differences | P0 | Deep |
| 6 | Desktop-app install surfaces (DXT, packaged ext, deep-link vs file-write) | P0 | Deep |
| 7 | OAuth / auth handshake friction for headless install of HTTP/SSE | P0 | Deep |
| 8 | Trust / confirmation gates for stdio arbitrary-binary execution | P0 | Moderate |
| 9 | Harness detection | P1 | Moderate |
| 10 | Cross-harness install tooling / registries (Smithery, mcp-get, etc.) | P1 | Moderate |
| 11 | Versioning / updates / uninstall | P1 | Light |

**Stance:** Factual-with-conclusions. Report framing 3P/external only — no 1P codebase analysis.

## Harnesses (7)

1. Claude Code terminal (CLI)
2. Claude Code Desktop app
3. Claude Cowork desktop app
4. Codex terminal (CLI)
5. Codex desktop app
6. Cursor CLI (`cursor-agent`)
7. Cursor desktop app

**Note:** Claude Code Desktop vs Claude Cowork treated as distinct until evidence
proves they share install surface. Collapse in final synthesis if confirmed same.

## Source anchors (canonical, per topic)

| Topic | Primary sources |
|-------|----------------|
| Claude Code CLI MCP | docs.anthropic.com/en/docs/claude-code/mcp, `anthropics/claude-code` repo |
| Claude Desktop MCP | docs.anthropic.com Claude Desktop config, `claude_desktop_config.json` docs |
| Claude Cowork | anthropic.com product pages, docs if public |
| Desktop Extensions (DXT) | `anthropics/dxt` repo, DXT spec |
| Codex CLI MCP | `openai/codex` repo, Codex CLI docs |
| Codex Desktop | openai.com/codex product page, any IDE docs |
| Cursor MCP | docs.cursor.com/mcp, `.cursor/mcp.json` schema |
| `cursor-agent` CLI | docs.cursor.com CLI section, cursor repo if accessible |
| MCP spec | `modelcontextprotocol/specification` repo + modelcontextprotocol.io |
| Smithery | smithery.ai docs, smithery repo |
| mcp-get / mcp-install | mcp-get.com, `michaellatman/mcp-get` repo |
| Deep-link URIs | `cursor://`, `vscode://`, Claude Desktop URI handlers |

## Work split (5 parallel subagents)

- **SA-A (Anthropic):** Claude Code terminal + Claude Code Desktop + Claude Cowork. Dimensions 1-6, 8-9, 11. Defer auth (Dim 7) to SA-E.
- **SA-B (OpenAI/Codex):** Codex terminal + Codex Desktop. Same dimensions as SA-A.
- **SA-C (Cursor):** Cursor CLI + Cursor Desktop. Same dimensions.
- **SA-D (Registries + deep-links):** Dim 4 + Dim 10 across ecosystem; DXT spec.
- **SA-E (Transport + OAuth):** Dim 5 + Dim 7 across all 7 harnesses.

## Output contract for subagents

Each returns structured Markdown:

```
## Per-harness findings
### <Harness name>
- **Dim N:** <one-sentence finding> [CONFIRMED|INFERRED|UNCERTAIN|NOT FOUND]
  - Source: <URL> (accessed 2026-04-18)
  - Snippet: `<primary source quote or config sample>`
- ... (one bullet per relevant dim)

## Cross-harness observations
- ...

## Gaps / follow-ups
- ...
```

Orchestrator will compose evidence/ files from these findings + primary-source
snippets, then synthesize REPORT.md.

## Status

- Active — awaiting subagent returns.
