# Changelog

## 2026-04-02 — MCP server wrapping analysis (D9-D14)
**Update type:** Additive
**Why this pass happened:** User asked whether just-bash can be wrapped into an MCP server — single exec() tool vs multiple auto-generated tools, enrichment compatibility, prior art, YjsFileSystem implementation, and side-by-side comparison with custom semantic MCP tools.

### Scope (delta only)
- D9: just-bash as a single MCP tool (exec)
- D10: just-bash as multiple MCP tools (auto-generated from command registry)
- D11: Additive enrichment compatibility with just-bash string output
- D12: Prior art — MCP servers wrapping shell/exec interfaces
- D13: IFileSystem backend for CRDT (YjsFileSystem minimal implementation)
- D14: Comparison: just-bash MCP vs custom MCP tools (side-by-side)

### What changed (current-state)
- REPORT.md — sections touched: frontmatter (description, subjects, topics), executive summary (added D9-D14 key findings), research rubric (added D9-D14 rows), detailed findings (added D9-D14 sections), limitations (added 3 new items), references (added 6 evidence files, 6 external sources)
- Evidence — added: d9-single-mcp-tool-exec.md, d10-multiple-mcp-tools.md, d11-enrichment-compatibility.md, d12-prior-art-mcp-shell-servers.md, d13-ifilesystem-for-crdt.md, d14-comparison-justbash-vs-custom-mcp.md

### Notes on confidence
- D9, D12: CONFIRMED — just-bash-mcp exists as prior art; 7+ shell MCP servers surveyed
- D11: CONFIRMED — MCP structuredContent spec directly supports dual content + metadata
- D10, D13, D14: Mix of CONFIRMED (tool count research, IFileSystem method analysis) and INFERRED (optimal architecture, performance estimates)

### Open questions / gaps
- No head-to-head empirical benchmark comparing exec() vs semantic tools for identical KB tasks
- Whether Claude Code / Cursor clients consume structuredContent from MCP responses
- Actual Y.XmlFragment-to-markdown serialization latency not measured
