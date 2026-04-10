# Evidence: just-bash as a Single MCP Tool (exec)

**Dimension:** D9 — What if the MCP server exposes ONE tool: exec(command) -> {stdout, stderr, exitCode}?
**Date:** 2026-04-02
**Sources:** just-bash source code, just-bash-mcp (guillaumemaka), MCP spec, CLI-vs-MCP research, Microsoft Research tool-space study

---

## Key sources referenced

- https://github.com/guillaumemaka/just-bash-mcp — Production implementation of exactly this pattern
- https://jannikreinhard.com/2026/02/22/why-cli-tools-are-beating-mcp-for-ai-agents/ — CLI vs MCP token analysis
- https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era/ — Tool count research
- `src/types.ts` — BashExecResult interface
- `src/Bash.ts` — exec() API surface

---

## Findings

### Finding: just-bash-mcp already exists and implements exactly this pattern
**Confidence:** CONFIRMED
**Evidence:** https://github.com/guillaumemaka/just-bash-mcp

Guillaume Maka has built an open-source MCP server wrapping just-bash with a single tool:

```json
{
  "name": "execute_bash",
  "arguments": {
    "command": "ls -la",
    "timeout": 5000
  }
}
```

The server uses just-bash's InMemoryFs (sandboxed), is MIT-licensed, supports Claude Desktop and VS Code integration, and includes Laminar tracing for observability. This confirms the pattern is architecturally viable — someone has already built it.

**Implications:** The pattern works. The question is not "can you do this" but "should you do this for a knowledge platform."

### Finding: Single-exec-tool has massive token efficiency advantages
**Confidence:** CONFIRMED
**Evidence:** Reinhard 2026 CLI-vs-MCP analysis; Microsoft Research tool-space study

The CLI-vs-MCP analysis found: in a real-world task involving 50 Intune devices, MCP consumed 145,000 tokens vs 4,150 for CLI — a 35x difference. The primary cause: MCP tool schema definitions consume context window space before any work begins. A typical MCP server with many tools costs 5-7% of context window just for definitions.

A single `exec(command: string)` tool has ONE input parameter. Its schema costs approximately 50-80 tokens. Compare this to 6 specialized tools (read, list, search, grep, edit, write) at roughly 100-150 tokens each = 600-900 tokens. The difference is not dramatic for a small tool set, but the single-tool approach avoids tool selection ambiguity entirely.

Microsoft Research found: "performance drops as the number of tools increases" with up to 85% effectiveness reduction for certain models at high tool counts. The MCP ecosystem survey of 1,470 servers found most contain 4 or fewer tools. OpenAI recommends fewer than 20.

For a KB MCP server with 6-8 tools, tool count is not a problem zone. But the single-exec approach eliminates tool selection entirely.

### Finding: The tool description for exec() must do heavy lifting
**Confidence:** INFERRED
**Evidence:** Analysis of agent behavior with generic exec tools

A well-designed exec tool description for a KB context would look like:

```
Execute a Unix command against the knowledge base filesystem. The filesystem
contains markdown documents organized in directories. Available commands include:
cat (read files), grep/rg (search content), ls (list files), find (discover files),
head/tail (partial reads), wc (count), sed (edit), diff (compare), sort/uniq, jq (JSON).

Commands support pipes (cmd1 | cmd2), redirections (> file), and shell logic (&&, ||).

The filesystem is read-only by default. File paths start from /kb/.

Examples:
- cat /kb/docs/api.md                    # Read a file
- grep -rn "authentication" /kb/docs/    # Search across docs
- ls -la /kb/docs/guides/                # List directory
- find /kb -name "*.md" -newer /kb/docs/api.md  # Find recent files
- grep -l "OAuth" /kb/docs/ | xargs wc -l       # Count lines in matching files
```

This description teaches the agent what commands exist and how to compose them — but it relies on the model's pre-training knowledge of Unix commands. Claude and GPT models have strong Unix command knowledge from training data.

### Finding: Agents naturally compose complex commands when given exec()
**Confidence:** INFERRED
**Evidence:** Behavioral analysis of coding agents (Claude Code, Cursor) with bash tools

Claude Code already uses the Bash tool for compound operations: `grep -r "TODO" . | sort | uniq -c | sort -rn | head -10`. When given an exec tool, agents that think in bash will naturally compose multi-step pipelines in a single tool call, reducing round-trips compared to individual MCP tool calls.

This is the key advantage: operations that require 3-5 MCP tool calls with semantic tools can be expressed as 1 exec call with pipes. Agent frameworks that charge per tool call (latency, token overhead) benefit from this consolidation.

### Finding: Claude Code / Cursor would use exec() well; general-purpose agents would not
**Confidence:** INFERRED
**Evidence:** Comparison of coding agent vs chatbot agent tool usage patterns

Coding agents (Claude Code, Cursor, Windsurf) are trained to think in bash. They compose grep | sort | head naturally. A single exec tool plays to their strengths.

General-purpose agents (chatbots, customer support agents, RAG pipelines) are not trained on bash. They would struggle to compose `grep -rn "authentication" /kb/docs/ --include="*.md"` and would perform better with a semantic `search(query="authentication", path="/docs")` tool. The tool description burden is higher — agents need to learn bash from the description rather than leveraging pre-training.

---

## Negative searches

* Searched for benchmarks comparing single-exec MCP tool vs multi-tool MCP servers for identical tasks — none found
* Searched for just-bash-mcp usage metrics or adoption data — none published

---

## Gaps / follow-ups

* No head-to-head benchmark comparing single exec() vs multi-tool for the same KB task
* just-bash-mcp (guillaumemaka) uses InMemoryFs, not a custom backend — no proof of exec() over a custom IFileSystem at scale
* How well do non-coding agents (e.g., RAG chatbots) perform with a single exec tool vs semantic tools — not studied
