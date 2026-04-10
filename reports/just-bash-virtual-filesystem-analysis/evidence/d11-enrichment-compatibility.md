# Evidence: Additive Enrichment Compatibility with just-bash String Output

**Dimension:** D11 — Can we return string output AND enrichment (frontmatter, backlinks, relevance scores) from just-bash?
**Date:** 2026-04-02
**Sources:** MCP spec (structuredContent), just-bash exec() return type, Mintlify ChromaFs pattern

---

## Key sources referenced

- https://modelcontextprotocol.io/specification/2025-11-25/server/tools — MCP CallToolResult spec
- https://forgecode.dev/blog/mcp-spec-updates/ — structuredContent explanation
- https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1563 — structuredContent vs content usage
- `src/types.ts` — BashExecResult interface (includes metadata field)

---

## Findings

### Finding: MCP spec natively supports dual content + structuredContent responses
**Confidence:** CONFIRMED
**Evidence:** MCP spec 2025-11-25, section "Tool Result" > "Structured Content"

The MCP spec defines two response fields:
- `content`: Array of ContentBlock (text, image, audio, resource) — unstructured, for the LLM
- `structuredContent`: JSON object — structured, for programmatic consumption

A tool can return BOTH in the same response:

```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "# API Authentication\n\nOAuth 2.0 flow for API access..."
      }
    ],
    "structuredContent": {
      "frontmatter": { "title": "API Authentication", "tags": ["auth", "api"] },
      "backlinks": ["/docs/oauth.md", "/docs/tokens.md"],
      "lastModified": "2026-03-15T10:30:00Z",
      "wordCount": 1247
    }
  }
}
```

The spec states: "For backwards compatibility, a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block." This means the text content (what the agent reads) and structured metadata (what the client/UI consumes) can coexist.

### Finding: just-bash's exec() return type already includes a metadata field
**Confidence:** CONFIRMED
**Evidence:** `src/types.ts` lines 13-26

```typescript
interface BashExecResult extends ExecResult {
  env: Record<string, string>;
  metadata?: Record<string, unknown>;
}
```

The `metadata` field is typed as `Record<string, unknown>` — an open-ended key-value store. This is where enrichment data could be injected at the exec() level before being returned to the MCP layer.

However, this metadata is NOT part of stdout. It is a sideband channel. The agent sees stdout; the MCP server can extract metadata and map it to structuredContent.

### Finding: Two enrichment architectures are viable — command-level vs MCP-level
**Confidence:** INFERRED
**Evidence:** Architectural analysis of the enrichment pipeline

**Architecture A: Enrich at the command level (via defineCommand)**

Custom commands that return enriched output:
```typescript
defineCommand("cat", async (args, ctx) => {
  const content = await ctx.fs.readFile(args[0]);
  const frontmatter = parseFrontmatter(content);
  const backlinks = await getBacklinks(args[0]);
  return {
    stdout: content,
    stderr: "",
    exitCode: 0,
    // Metadata sideband — not in stdout
    metadata: { frontmatter, backlinks }
  };
});
```

Problem: This breaks behavioral fidelity. Real `cat` doesn't return metadata. Agents composing pipes expect stdout to be file content, not JSON-with-metadata. If `cat` returns enriched JSON, `grep` downstream breaks.

**Architecture B: Enrich at the MCP layer (recommended)**

The MCP server wraps exec(), then enriches the response:
```typescript
server.tool("read", { path: z.string() }, async ({ path }) => {
  const result = await bash.exec(`cat "${path}"`);
  const enrichment = await getEnrichment(path);
  return {
    content: [{ type: "text", text: result.stdout }],
    structuredContent: {
      content: result.stdout,
      ...enrichment  // frontmatter, backlinks, wordCount, etc.
    }
  };
});
```

This preserves bash output fidelity while adding enrichment as a parallel channel. The agent sees the text content; the client sees structured metadata.

### Finding: just-bash's string output model does NOT conflict with enrichment if enrichment is MCP-level
**Confidence:** CONFIRMED
**Evidence:** Structural analysis of just-bash stdout vs MCP structuredContent

just-bash commands return `{stdout: string, stderr: string, exitCode: number}`. This is string-only. There is no way to inject structured metadata INTO stdout without breaking downstream pipes.

But the MCP layer is ABOVE just-bash. The MCP server can:
1. Execute the bash command → get stdout string
2. Parse/analyze the result → extract or compute enrichment
3. Return both as MCP response (content + structuredContent)

The conflict only exists if you try to enrich INSIDE the bash pipeline. At the MCP layer, there is no conflict.

### Finding: For a single exec() tool, enrichment is not applicable
**Confidence:** CONFIRMED
**Evidence:** Structural constraint of exec() semantics

If the MCP server exposes only `exec(command)`, it cannot know what enrichment to provide — the command could be anything from `ls` to `grep | sort | head`. The server would need to parse the command string to determine if enrichment is relevant, which defeats the simplicity benefit.

This is a fundamental tension: **exec() is composable but not enrichable; semantic tools are enrichable but not composable.** The hybrid architecture (semantic tools + bash escape hatch) resolves this by providing enrichment on semantic tools and raw output on bash.

---

## Gaps / follow-ups

* Whether current Claude Code / Cursor clients actually consume structuredContent from MCP responses — adoption unclear
* How much latency enrichment adds to read operations (frontmatter parsing, backlink resolution)
