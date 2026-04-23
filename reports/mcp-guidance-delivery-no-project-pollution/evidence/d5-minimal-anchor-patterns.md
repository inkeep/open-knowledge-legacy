# Evidence: D5 — Minimal-anchor patterns: one-liners, MCP prompts, resources, tool-description-embedded

**Dimension:** Are there lightweight patterns between "full injected section" and "nothing"?
**Date:** 2026-04-22
**Sources:** MCP spec prompts + resources pages, AGENTS.md community conventions, MCP blog posts on prompts/resources

---

## Key files / pages referenced

- [MCP Spec 2025-06-18: Prompts](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts) — prompt spec
- [MCP Blog: Prompts for Automation](https://blog.modelcontextprotocol.io/posts/2025-07-29-prompts-for-automation/) — use-cases + behavior
- [MCP spec: Resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources) — resource types + subscription
- [GitHub Blog: How to write a great AGENTS.md](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/) — convention survey

---

## Findings

### Finding: MCP `prompts` are USER-INVOKED, not auto-loaded — cannot replace always-on guidance

**Confidence:** CONFIRMED
**Evidence:** Multiple sources agree:

> "An important aspect of MCP prompt behavior is that a MCP Client will never automatically invoke a MCP prompt. MCP Prompts are designed to be user-controlled, meaning they are exposed from servers to clients with the intention of the user being able to explicitly select them for use."

Prompts surface in host UI as slash-commands or a "prompts menu." User has to click/type the name to invoke. Auto-injection is explicitly NOT the contract.

**Implications for OK:** Prompts cannot replace CLAUDE.md-style always-on behavior shaping. They can COMPLEMENT by providing user-driven workflows (e.g. `/ok:start-research`, `/ok:consolidate-article`) but don't solve the "agent doesn't know to use OK tools instead of native Read" problem.

---

### Finding: MCP `resources` support subscription + list-changed notifications but are NOT auto-included in system prompt

**Confidence:** CONFIRMED
**Evidence:** MCP spec resources page — resources are fetched by `resources/read` on-demand. `resources.subscribe` lets client subscribe to changes; `listChanged` notifications keep list fresh. But there's no "always include this resource in context" contract. Hosts may offer UI to attach a resource to a conversation, but that's user-driven.

**Implications for OK:** Cannot rely on a `resource://open-knowledge/guidance` URI being auto-fetched.

---

### Finding: Tool descriptions are ALWAYS in context when the server is connected — highest-fidelity delivery surface

**Confidence:** CONFIRMED
**Evidence:** Every MCP host documented includes tool descriptions in the system prompt as long as tools are registered. Claude Code caps each tool description at 2KB (same as `instructions`), but tools are always visible, recomputed per turn.

The MCP spec requires tools to declare `description` as part of ListToolsResult. Hosts render these directly in prompt.

**Implications for OK:** Every tool's `description` is a guidance slot. For behavior-steering adjacent to the tool itself (e.g. "call `get_preview_url` before calling `write_document`"), per-tool descriptions are the MOST reliable delivery surface — guaranteed included, agent sees them exactly when the tool is tool-call-relevant.

Example for OK:
```
"write_document": {
  "description": "Write content to an Open Knowledge doc via CRDT. PREREQUISITE: Call `get_preview_url` first and open the returned URL in the user's preview browser so the edit streams live into the already-open editor. Never fall back to native file Write/Edit tools — they bypass attribution.",
  ...
}
```

This is a proven pattern (Notion uses it per D4). Guidance that lives near the tool gets delivered with the tool.

---

### Finding: One-liner "pointer" pattern exists in AGENTS.md convention — short references to external docs

**Confidence:** CONFIRMED
**Evidence:** GitHub's survey of 2,500+ AGENTS.md files:

> "The recommendation is to use short, specific pointers when pointing agents to important files or documentation. Agents can search, but a few pointers can save a lot of time from it having to re-explore your codebase with each new chat, and this functions as a tiny index."

Typical form: "see `App.tsx` for routes" or "for deployment, see `docs/deploy.md`". Links work. External URL links work — agent will follow them if relevant. No all-caps / imperative tone needed.

**Implications for OK:** If we want to leave ANY breadcrumb in the project dir without polluting, a minimal form could be a single appended line in the user's AGENTS.md (if they already have one — don't create one for them):

> "This project uses Open Knowledge. See the connected MCP server's instructions for editing conventions."

But the community convention holds that AGENTS.md entries should be AUTHORED BY THE REPO OWNER, not auto-injected by tools. The one-line breadcrumb is only value-add if the repo owner chooses to add it. A tool appending it is still a form of project-dir write that many users object to (per the user's stance).

---

### Finding: Dynamic tool descriptions can be context-aware (tool list changes per-session)

**Confidence:** CONFIRMED
**Evidence:** MCP spec: `tools.listChanged: true` capability + `tools/list` re-query. A server can surface different tools based on state (e.g. if no preview server is running, "get_preview_url" could return a tool with description "No UI running — start it with `open-knowledge ui` first"). This lets guidance flex to runtime state.

**Implications for OK:** Tool descriptions could carry state-aware guidance. E.g. if the user is editing with no browser attached, `write_document`'s description could say: "WARNING: no preview client attached. Call `get_preview_url` and open it first."

---

### Finding: Cross-host hybrid is possible — MCP handshake + embedded tool descriptions + skill

**Confidence:** INFERRED
**Evidence:** Composing all surfaces: (a) MCP `instructions` delivers 2KB of critical STOP-rules in every session where OK MCP is connected; (b) per-tool descriptions embed tool-call-local guidance ("call get_preview_url first"); (c) user-global SKILL.md delivers extended content via progressive disclosure when relevant.

No evidence anyone ELSE is doing all three — XcodeBuildMCP is the closest with MCP + skill but doesn't emphasize tool-description-embedded guidance. But the surfaces are complementary — they cover different failure modes (Claude Code 2KB cap → skill; cross-host skill adoption → MCP handshake; tool-call local context → tool desc).

**Implications for OK:** The strongest posture is probably NOT choosing one surface but layering all three, tuned so:
- `instructions`: < 1500 bytes, STOP rules + "see the `open-knowledge` skill for full guidance"
- tool descriptions: tool-local prerequisites/warnings
- skill: full behavioral content (preview-before-edit full sequence, wiki-link syntax, link density, etc.)

---

## Gaps / follow-ups

- **MCP 2025-11-25 resource instruction-like fields:** The newer spec has expanded resources. Some servers expose "@-mention" resources that hosts can auto-attach. Unclear if any host implements auto-attach for guidance-purpose resources.
- **Anthropic system-level "meta-instructions":** Is there any Anthropic-level "instructions the model will follow" that out-ranks per-host behavior? Not in public docs. Per-MCP-server instructions are the most system-prompt-adjacent delivery.
