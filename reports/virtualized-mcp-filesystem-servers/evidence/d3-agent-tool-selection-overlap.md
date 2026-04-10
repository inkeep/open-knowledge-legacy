# Evidence: How Agents Handle Multiple Filesystem-Like Tool Sources

**Dimension:** D3 — Agent behavior with overlapping native + MCP filesystem tools
**Date:** 2026-04-02
**Sources:** Claude Code GitHub issues, system prompt analysis, official docs, Anthropic engineering blog

---

## Key files / pages referenced

- https://github.com/anthropics/claude-code/issues/31002 — Built-in tools deferred behind ToolSearch
- https://github.com/anthropics/claude-code/issues/11729 — MCP tool names in allowedTools
- https://github.com/anthropics/claude-code/issues/7328 — MCP tool filtering
- https://code.claude.com/docs/en/mcp — Claude Code MCP docs
- https://www.anthropic.com/engineering/advanced-tool-use — Advanced tool use
- https://arxiv.org/html/2602.14878v1 — MCP tool description quality research

---

## Findings

### Finding: MCP tools are namespaced with `mcp__<server>__<tool>` prefix — no naming collision with native tools
**Confidence:** CONFIRMED
**Evidence:** Claude Code documentation + issue #11729

MCP tools use the naming pattern `mcp__<server-name>__<tool-name>`. Example: a filesystem MCP server named "fs" with a `read_file` tool becomes `mcp__fs__read_file`. This is fundamentally different from Claude Code's native `Read` tool — there is no naming collision by design.

**Implication:** The agent sees `Read` (native) and `mcp__myserver__read_file` (MCP) as completely different tools. The agent must decide which to use based on tool descriptions and context, not naming.

### Finding: Claude Code's native tools have implicit priority via pre-loading; MCP tools are deferred
**Confidence:** CONFIRMED
**Evidence:** Issue #31002, ToolSearch documentation

As of Claude Code v2.1.72+:
- **Pre-loaded (immediate):** Agent, Bash, Edit, Glob, Grep, Read, Skill, ToolSearch, Write
- **Deferred (require ToolSearch):** AskUserQuestion, Cron*, Worktree*, WebFetch, WebSearch, etc.
- **MCP tools:** Always deferred behind ToolSearch (unless ENABLE_TOOL_SEARCH=false)

This creates an implicit priority: native tools are always in context and ready to use. MCP tools require the model to first think about what tools it needs, search for them, and then use them. The native `Read` is always visible; `mcp__fs__read_file` must be discovered.

**When ENABLE_TOOL_SEARCH=false:** Both native and MCP tools are loaded upfront, but native tools appear first in the system prompt tool definitions. LLMs tend to prefer tools that appear earlier in their tool list.

### Finding: No documented mechanism to route specific paths/operations to MCP tools instead of native tools
**Confidence:** CONFIRMED (negative search)
**Evidence:** Claude Code docs, system prompt analysis, GitHub issues

There is no configuration in Claude Code to say "for paths matching /knowledge/*, use mcp__myserver__read_file instead of Read." The only mechanisms available are:

1. **CLAUDE.md instructions:** Can include natural language guidance like "When accessing knowledge base content, use the mcp__kb__read_file tool." This is a suggestion the model may or may not follow.

2. **Tool permissions:** Can deny native tools (`"deny": ["Read"]`) to force MCP tool usage, but this is global — cannot be path-scoped.

3. **Tool descriptions:** The MCP tool description can indicate when to use it ("Use this tool to read files from the knowledge base at /kb/* paths").

None of these provide deterministic routing. The agent makes a judgment call each time.

### Finding: Tool descriptions are the primary mechanism for guiding agent tool selection
**Confidence:** CONFIRMED
**Evidence:** arxiv.org/html/2602.14878v1, Anthropic engineering blog

Research on MCP tool descriptions (February 2026, arxiv) found:
- 97.1% of MCP tool descriptions contain at least one quality issue
- 56% fail to clearly articulate their purpose
- Tool descriptions serve as both specifications and prompt-like instructions
- Augmenting descriptions improved task success by 5.85 percentage points
- The "dual nature" of descriptions (requirement + prompt) makes them the primary tool selection mechanism

For an MCP server wanting the agent to prefer its tools over native tools, the tool description is the strongest lever — but not a guarantee.

### Finding: MCP tool annotations (hints) influence agent permission behavior but not tool selection
**Confidence:** CONFIRMED
**Evidence:** https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/

MCP ToolAnnotations include: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. These affect:
- Whether the client auto-approves or prompts for confirmation
- How destructive actions are presented

But annotations do NOT affect which tool the agent selects. They are about safety UX, not routing.

### Finding: When tool names are similar but not identical, agents can select the wrong tool
**Confidence:** INFERRED
**Evidence:** Anthropic advanced tool use blog

The blog notes "wrong tool selection and incorrect parameters" as the most common failures, "especially when tools have similar names like notification-send-user vs. notification-send-channel." This suggests that if an MCP server exposes `read_file` while native `Read` also exists, the agent may use either unpredictably — especially when descriptions overlap.

---

## Gaps / follow-ups

- No empirical study exists on agent behavior when MCP tools intentionally mirror native tool names
- CLAUDE.md-based routing guidance ("use mcp__kb__read for knowledge files") is untested for reliability
- The ToolSearch deferral creates an implicit priority hierarchy but this is a side effect, not a design choice
- Path-based tool routing would be a valuable Claude Code feature but does not exist
