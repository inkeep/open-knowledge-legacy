# Evidence: D1 — MCP `instructions` field — spec, lifecycle, host behavior

**Dimension:** MCP `instructions` field spec + how hosts consume it
**Date:** 2026-04-22
**Sources:** modelcontextprotocol.io spec, schema.ts, Claude Code decompiled prompt analyses

---

## Key files / pages referenced

- [MCP Spec 2025-11-25 — Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) — canonical InitializeResult shape
- [MCP schema.ts (2025-11-25)](https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-11-25/schema.ts) — authoritative field definition
- [Drew Breunig: How Claude Code Builds a System Prompt (2026-04-04)](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html) — decompiled Claude Code prompt assembly
- [Cursor MCP docs](https://cursor.com/docs/context/mcp) — no mention of `instructions` field handling
- [Claude Code Camp: Inside Claude Code's System Prompt](https://www.claudecodecamp.com/p/inside-claude-code-s-system-prompt) — prompt assembly analysis

---

## Findings

### Finding: The `instructions` field is a formally OPTIONAL, non-load-bearing "hint" in the MCP spec

**Confidence:** CONFIRMED
**Evidence:** MCP schema.ts 2025-11-25

```typescript
/**
 * Instructions describing how to use the server and its features.
 *
 * This can be used by clients to improve the LLM's understanding of
 * available tools, resources, etc. It can be thought of like a "hint"
 * to the model. For example, this information MAY be added to the
 * system prompt.
 */
instructions?: string;
```

**Implications:** The spec uses `MAY` (RFC 2119). Clients are free to ignore the field entirely, truncate it, include it selectively, or surface it in non-prompt ways (tooltip, sidebar, etc.). Nothing in the protocol guarantees delivery to the model.

---

### Finding: Claude Code includes MCP `instructions` in the system prompt, recomputed every turn, truncated at 2KB per server

**Confidence:** CONFIRMED (multiple decompilation analyses agree)
**Evidence:** Breunig, Claude Code Camp — both based on leaked/decompiled Claude Code source

Specific facts:
- Per-server instructions appear under a `# MCP Server Instructions` section in the system prompt, one sub-section per connected server (e.g. `## my-database-server`).
- **Recomputed every turn, not cached.** Distinguishes it from globally-cacheable content like CLAUDE.md.
- **Truncated at 2KB per server** (and per-tool descriptions also capped at 2KB). Official guidance: keep concise, put critical content first.
- **Conditional inclusion:** "If MCP servers are connected with instructions" (omitted if empty). "Omitted when MCP instruction delta mode is enabled" — a newer delivery mode where instructions ride per-turn attachments instead.

**Implications for OK:** Our current `CLAUDE_MD_SECTION` is ~4KB — exceeds the 2KB Claude Code cap. Our MCP `instructions` string (buildInstructions in packages/cli/src/mcp/server.ts) likely exceeds too. The truncation is silent. Putting STOP-rules and load-bearing guidance anywhere past the first ~2KB is dead text in Claude Code.

---

### Finding: Cursor documents no behavior around the `instructions` field

**Confidence:** CONFIRMED (negative — thoroughly searched Cursor MCP docs)
**Evidence:** cursor.com/docs/context/mcp covers tools/prompts/resources/roots/elicitation/apps/config/auth but does not mention `instructions` field handling at all. Cursor forum also silent on it.

Cursor surfaces prompts (user-invokable) and tools, but whether it injects the server's `instructions` string into context on initialize is undocumented. The practical rumor across the Cursor community forum is that it's at best lightly used, and guidance delivery happens via user rules (`.cursor/rules`) or global User Rules instead.

**Implications:** Cannot assume Cursor honors `instructions`. If guidance must survive in Cursor, a Cursor-specific surface (rules) is needed OR the tool descriptions themselves must carry the behavioral guidance.

---

### Finding: Codex / Windsurf / VS Code — `instructions` handling not in public docs

**Confidence:** INFERRED (absence of documentation across public sources)
**Evidence:** Composio Codex MCP guide, Windsurf docs, VS Code MCP docs — all focus on config file format, tool list, capability negotiation. None document an `instructions` plumbing contract.

Codex ships a `developer_instructions` primitive via `~/.codex/prompts` — user-authored, separate from MCP `instructions`. Windsurf uses "Memories and rules" as the behavioral customization surface. VS Code surfaces MCP tools but the instructions plumbing is inside the Copilot Chat agent and not documented.

**Implications:** On non-Claude hosts, the `instructions` field is a best-effort delivery. Some hosts probably include it (following the spec's `MAY`), others probably don't, and there's no empirical study distinguishing them.

---

### Finding: Instructions survive no better under long sessions than any other context element

**Confidence:** INFERRED
**Evidence:** Breunig analysis — "recomputed every turn, not cached" means each turn re-injects the current instructions. This is a strength (doesn't drift as doc content changes) but also a weight (pays token cost every turn). Claude Code's context-management algorithms don't treat `instructions` as load-bearing for compaction decisions.

In long sessions where compaction fires, `instructions` gets the same treatment as any tool description or system prompt component. If the user's task drifts away from MCP tool usage, compaction may deprioritize or summarize it.

**Implications:** Pure `instructions`-based guidance has the same load-bearing shape as any prompt content — present when needed, can be deprioritized under pressure. Not fundamentally inferior to file-based anchors, but not fundamentally superior either.

---

### Finding: Critical-first ordering matters — 2KB cap is the binding constraint

**Confidence:** CONFIRMED
**Evidence:** Claude Code documented guidance from the Breunig decompilation — "put critical details near the start" because anything past the cap is truncated.

This directly applies to OK's situation: our current `CLAUDE_MD_SECTION` is ~3500 bytes of prose. Chopped to 2KB, only the first ~1200 words survive. STOP rules on native tool usage come early (good); preview-before-edit sequence comes middle; wiki-link conventions come late (may get cut).

**Implications:** Any pure-`instructions` strategy for OK must be ruthlessly compressed — target ≤ 1500 bytes — with STOP rules in the first 400 bytes and everything else as "see tool descriptions / resource URI" pointers.

---

## Gaps / follow-ups

- **Claude Desktop:** No public decompilation of Claude Desktop's prompt assembly. Unclear if the 2KB cap applies there or if the behavior is different.
- **Empirical adherence study:** No public dataset measuring "agent follows MCP `instructions` guidance" vs "agent ignores it" across hosts. The strongest signal remains qualitative community reports on Cursor forums and Claude Code discussions.
- **Instruction-delta mode:** Claude Code's newer delta mode (instructions as per-turn attachment) behavior not deeply documented. Might change the 2KB cap.
