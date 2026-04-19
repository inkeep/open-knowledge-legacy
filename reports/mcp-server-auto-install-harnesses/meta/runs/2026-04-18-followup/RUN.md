---
runId: 2026-04-18-followup
status: Closed
startedAt: 2026-04-18
closedAt: 2026-04-18
orchestrator: claude-opus-4-7[1m]
parent_run: 2026-04-18-initial
---

# Run: Follow-up — enable-by-default + CLI-vs-file + extended tooling survey

## Purpose

Close three specific gaps in the initial pass:

1. **SA-1: Enable-by-default probe** — across all 7 harnesses, answer "is an MCP server live immediately after config-file write / CLI add, or does it need a separate activation step?"
2. **SA-2: CLI-vs-file deep comparison** — for `claude mcp add`, `codex mcp add`, `cursor agent mcp` (partial surface): intended use, benefits, caveats, when to prefer each approach, headless suitability.
3. **SA-3: Extended cross-harness tooling survey** — beyond Smithery / add-mcp / mcp-get / MCPB, what OSS scripts, utilities, registries, Homebrew formulae, shell helpers exist? What's the DIY-vs-reuse picture?

## Work split (3 parallel subagents)

- **SA-1:** Enable-by-default probe (all 7 harnesses; tight scope)
- **SA-2:** CLI vs file-based install — deep comparison (Claude Code + Codex + Cursor; include Claude Desktop's absence of CLI)
- **SA-3:** Extended cross-harness installer tooling survey (broader OSS scan)

## Output contract

Same as initial run — structured Markdown with confidence labels, URL + access date citations, primary-source snippets, vendor-bias flags. Orchestrator composes evidence-file updates + appends/patches to REPORT.md.

## Status

- Active — awaiting subagent returns.
