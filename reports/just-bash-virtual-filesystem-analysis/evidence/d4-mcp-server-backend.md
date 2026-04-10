# Evidence: just-bash as MCP Server Backend

**Dimension:** D4 — Could just-bash be the implementation layer for MCP tools?
**Date:** 2026-04-02
**Sources:** just-bash source code, bash-tool package, existing report virtualized-mcp-filesystem-servers/

---

## Key sources referenced

- `src/Bash.ts` — exec() API
- `src/types.ts` — BashExecResult interface
- `src/custom-commands.ts` — defineCommand API
- `examples/bash-agent/agent.ts` — Vercel AI SDK integration pattern
- https://github.com/vercel-labs/bash-tool — official AI SDK tool wrapper
- Existing report: `virtualized-mcp-filesystem-servers/REPORT.md` — D5 "Tool surface design for native feel"

---

## Findings

### Finding: MCP tool mapping to just-bash commands is straightforward
**Confidence:** CONFIRMED
**Evidence:** Structural comparison of MCP tool signatures vs just-bash exec()

| MCP Tool | just-bash equivalent | Mechanism |
|----------|---------------------|-----------|
| `read(path)` | `bash.exec('cat path')` | Direct exec |
| `grep(pattern, path)` | `bash.exec('grep -rn pattern path')` | Direct exec |
| `list(path)` | `bash.exec('ls -la path')` | Direct exec |
| `edit(path, old, new)` | `bash.exec('sed -i "s/old/new/" path')` | Direct exec |
| `search(query)` | Custom command or grep | defineCommand |
| `write(path, content)` | `bash.exec('cat > path', {stdin: content})` | stdin piping |

The MCP server would:
1. Receive tool call from agent
2. Translate to bash command string (or use exec() with args for safety)
3. Execute via `bash.exec()` on a custom IFileSystem
4. Return stdout/stderr/exitCode

### Finding: exec() API returns structured results suitable for MCP responses
**Confidence:** CONFIRMED
**Evidence:** `src/types.ts` lines 13-26, 29-32

```typescript
interface BashExecResult extends ExecResult {
  env: Record<string, string>;
  metadata?: Record<string, unknown>;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

MCP tools need to return content strings — `result.stdout` maps directly.

### Finding: bash-tool already wraps just-bash for Vercel AI SDK tool use
**Confidence:** CONFIRMED
**Evidence:** https://github.com/vercel-labs/bash-tool, examples/bash-agent/agent.ts

Vercel's bash-tool package provides three AI SDK tools: `bash` (exec), `readFile`, `writeFile`. The pattern:
```typescript
const toolkit = await createBashTool({
  sandbox: bash,
  destination: "/workspace",
  extraInstructions: "..."
});
```

This proves the just-bash → AI tool wrapper pattern works in production. An MCP server would follow the same pattern but expose tools via MCP protocol instead of AI SDK tool format.

### Finding: Custom commands enable semantic tool augmentation
**Confidence:** CONFIRMED
**Evidence:** `src/custom-commands.ts`

```typescript
const hello = defineCommand("hello", async (args, ctx) => {
  return { stdout: `Hello, ${args[0]}!\n`, stderr: "", exitCode: 0 };
});
```

For a KB MCP server, we could define:
- `search` command backed by Orama full-text search
- `enrich` command that adds frontmatter metadata
- `branch` command that switches git branch context
- These would be available alongside standard unix commands

### Finding: Over-engineering risk — MCP tools don't need shell parsing
**Confidence:** INFERRED
**Evidence:** Comparison of direct function calls vs exec() indirection

When an MCP tool receives `read(path="/docs/api.mdx")`, the simplest implementation is:
```typescript
const content = await fs.readFile(path);
return content;
```

Routing through just-bash adds: script normalization → lexer → parser → AST → interpreter → command resolution → cat command → fs.readFile(path). This adds latency, code surface area, and potential for parsing edge cases — all to produce the same result.

The value proposition of just-bash as MCP backend is NOT for simple read/write operations. It's for:
1. Complex compound operations (grep + sed pipelines)
2. Behavioral fidelity with coding agent tool expectations
3. The "agents can write bash" affordance — agents compose commands naturally

### Finding: Behavioral fidelity argument has merit for agents that already think in bash
**Confidence:** INFERRED
**Evidence:** Existing report mcp-tool-interface-design-agent-performance/

The existing MCP tool design report found: "semantic tools, designed with filesystem-like simplicity" is the optimal pattern. The counter-argument for just-bash is that coding agents (Claude Code, Cursor) already think in bash commands — if the MCP server spoke bash, agents could use their existing shell expertise. But this only matters if the MCP server is consumed by coding agents with bash habits, not by general-purpose agents.

---

## Gaps / follow-ups

* Latency overhead of exec() path vs direct function call not benchmarked
* Whether bash-tool's MCP integration is planned by Vercel not confirmed
