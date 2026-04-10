# Evidence: just-bash as Multiple MCP Tools (Auto-Generated)

**Dimension:** D10 — What if we auto-generate MCP tools from just-bash's command registry?
**Date:** 2026-04-02
**Sources:** just-bash command registry, MCP tool count research, GitHub Copilot/Block/Speakeasy case studies

---

## Key sources referenced

- just-bash `src/commands/registry.ts` — Full command list
- https://dev.to/aws-heroes/mcp-tool-design-why-your-ai-agent-is-failing-and-how-to-fix-it-40fc — Tool design best practices
- Microsoft Research tool-space interference study (2026)
- Speakeasy MCP tool count experiment (2025)
- GitHub Copilot tool reduction case study (2026)

---

## Findings

### Finding: Auto-generating MCP tools from just-bash's 100+ commands would create a catastrophic tool count
**Confidence:** CONFIRMED
**Evidence:** just-bash registry analysis + tool count research

just-bash registers 100+ commands. Even the "essential 12" for KB work would produce 12 MCP tools. Research shows:

| Tool count | Agent performance | Source |
|---|---|---|
| 10 tools | Perfect (20/20 success) | Speakeasy experiment |
| 20 tools | Good (19/20 for large models) | Speakeasy experiment |
| 50+ tools | 2-3x response time increase | Industry survey |
| 100+ tools | Collapse (< 14% accuracy) | RAG-MCP study |
| 107 tools | Both large and small models failed completely | Speakeasy experiment |

At 12 KB-essential tools plus supporting commands (sort, uniq, jq, diff, tree, etc.), we'd be at 15-20 tools — still in the safe zone for large models but approaching the boundary.

GitHub Copilot reduced from 40 to 13 tools and saw "2-5 percentage point improvement across benchmarks plus 400ms latency reduction." Block rebuilt their Linear MCP from 30+ to just 2 tools. The trend is toward fewer tools, not more.

### Finding: The optimal tool count for a KB MCP server is 4-8 semantic tools
**Confidence:** INFERRED
**Evidence:** Synthesis of tool count research + MCP ecosystem survey

Microsoft Research surveyed 1,470 MCP servers and found most contain 4 or fewer tools. Hugging Face recommends "5 to 15 tools per server, one server one job." The Mintlify MCP server exposes exactly 2 tools (search, get_page).

For a KB platform, the optimal set is:
1. `read(path)` — read file content
2. `list(path)` — list directory
3. `search(query)` — semantic search (Orama)
4. `grep(pattern, path)` — exhaustive text search
5. `edit(path, old, new)` — content editing
6. `write(path, content)` — content creation

Optionally:
7. `bash(command)` — power-user escape hatch (just-bash exec)
8. `status()` — KB health/stats

This is 6-8 tools — well within the safe zone.

### Finding: Per-command MCP tools would lose composability
**Confidence:** CONFIRMED
**Evidence:** Structural analysis of MCP tool call semantics

With per-command tools:
```
mcp__openkb__grep(pattern="TODO", path="/docs") → matching lines
mcp__openkb__sort(input=???) → ???
mcp__openkb__uniq(input=???, flags="-c") → ???
```

The problem: MCP tools don't compose via pipes. Each tool returns a result to the agent, which must then pass it as input to the next tool. A pipeline like `grep | sort | uniq -c | sort -rn | head` would require 5 sequential tool calls with the agent manually threading output between them. This eliminates the main advantage of shell semantics.

A single `exec()` tool preserves composability: `exec("grep -r TODO /docs | sort | uniq -c | sort -rn | head -10")` — one call, full pipeline.

### Finding: Outcome-oriented design outperforms operation-oriented for agents
**Confidence:** CONFIRMED
**Evidence:** MCP tool design best practices (dev.to/aws-heroes)

The recommended MCP pattern is "outcome-oriented" — one tool per user goal, not one tool per system operation.

**Operation-oriented** (3+ tools): `grep_files()` → `read_file()` → `extract_frontmatter()`
**Outcome-oriented** (1 tool): `search(query)` → returns matching content with frontmatter already included

For a KB platform, this means `search(query)` should return results with relevance scores, frontmatter, and snippets — not just file paths that require follow-up reads. This is the enrichment model.

---

## Gaps / follow-ups

* Whether agents perform better with 6 semantic tools vs 1 exec tool for identical KB tasks — no benchmark exists
* The exact token cost of 6-tool schema vs 1-tool schema needs measurement
