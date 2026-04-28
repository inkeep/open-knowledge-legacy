# Evidence: MCP-Portable Alternatives to Host-Side Hooks

**Dimension:** What the MCP server itself can do that travels cross-host without depending on host hook support
**Date:** 2026-04-27
**Sources:** [MCP spec — elicitation](https://modelcontextprotocol.io/specification/draft/client/elicitation); MCP changelog 2025-11-25; this repo's OK skill + write-document tool source

---

## Findings

### Finding: MCP supports four classes of server-initiated capability
**Confidence:** CONFIRMED
**Evidence:** [Webfuse MCP cheat sheet](https://www.webfuse.com/mcp-cheat-sheet) (web fetch summary):

> "Servers can request sampling (LLM completions with tool calling support), elicitation (user input including URL mode), roots (filesystem boundaries), and logging from clients."

> "Servers must send server-to-client requests such as roots/list, sampling/createMessage, or elicitation/create only in association with an originating client request, not as standalone requests on independent communication streams."

The four server-initiated categories:
1. **Sampling** (`sampling/createMessage`) — server requests LLM completion from client.
2. **Elicitation** (`elicitation/create`) — server requests user input. Two modes (per spec 2025-11-25): Form (structured data via JSON schema) and **URL** (out-of-band external URLs for auth, payment, sensitive ops).
3. **Roots** (`roots/list`) — query filesystem boundaries.
4. **Logging** — server can request structured logs from client.

Plus **server-pushed notifications** (no client request required):
- `notifications/tools/list_changed` — tool list changed.
- `notifications/resources/updated` — resource updated.
- `notifications/resources/list_changed`.
- `notifications/prompts/list_changed`.

**Implications:**
- These are **part of the MCP protocol itself**, so any compliant MCP client (which all of OK's target hosts are) supports them. This is the cross-host lever.
- **Sampling** is particularly powerful for knowledge-lint: the MCP server can ask the host LLM to evaluate "are these two pages contradictory?" without the agent having to consciously orchestrate it. This bypasses the hook layer entirely — the LLM-required lint checks (#1 contradictions, #6 data gaps, #13 lost-nuance, #14 hallucination, #15 over-confidence) can fire via sampling.
- **Elicitation** lets the server prompt the user — *"the lint pass found 3 dead links; fix automatically?"* — without depending on the host's UX surface.
- **Notifications** push updates without an agent in the loop — *"3 new orphan pages since last session"* can land in the agent's session-init context via `notifications/resources/updated`.

### Finding: The OK skill already uses tool-result-content sentinels — the pattern is proven
**Confidence:** CONFIRMED
**Evidence:** This repo's `packages/cli/src/mcp/tools/preview-url.ts` and `packages/server/assets/skills/open-knowledge/SKILL.md`:

> "A response DOES include `warning: { action: 'attach-preview-once', previewUrl, message }` → no browser is attached; open immediately, one-shot."

OK already ships a *response-content-sentinel* pattern: the MCP tool's response includes structured fields the agent recognizes and acts on. The skill's STOP / WARN rules call out exactly when to honor each sentinel.

**Implications:**
- The same pattern can carry lint findings: every `write_document` response could include `lint: { findings: [...] }` when the dev-time deterministic checks fire on the just-written doc. The agent reads the lint findings inline, fixes them in the next turn — no host-side hook needed.
- This works across **every** MCP-compliant host: Claude Code, Cursor, Codex, Windsurf, Copilot, Claude Desktop, Cowork, Claude.ai. Any host that calls the MCP tool gets the sentinel back.
- The skill carries the agent-side rule ("if `lint` is present, fix the findings before moving on") — no per-host config required.

### Finding: MCP server can run scheduled internal background work
**Confidence:** INFERRED
**Evidence:** The OK MCP server is already a long-running stdio process (`open-knowledge start` boots Hocuspocus + the MCP server). Internal scheduling (setInterval, cron) is just "the server doing things in the background" — no protocol involvement needed.

The constraint: server-initiated work without an originating client request **cannot** push messages to the agent (per spec — *"only in association with an originating client request"*). But it can:
- Maintain internal state (e.g., a "lint queue" of findings).
- Surface that state on the next client-initiated request via tool-result content.
- Write to the wiki directly via OK's existing internal write paths (the same paths `applyAgentMarkdownWrite` uses).

**Implications:**
- Background tasks are useful for the **continuous decay** trigger (ByteRover-AKL-style scoring) and for **Sleep Consolidation** patterns: the server can periodically run LLM-required lint checks via sampling and queue findings, even when no agent is connected.
- The findings surface to the agent on the next interaction via the next tool-result content. This is the closest cross-host equivalent to a `SessionStart` hook.

### Finding: The "agent-flash" Y.Map already exists in OK's editor substrate as a server-side notification channel
**Confidence:** CONFIRMED
**Evidence:** This repo's `AGENTS.md` editor-substrate diagram:

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here
├── Y.Text('source')          ← CodeMirror binds (y-codemirror.next)
├── Y.Map('metadata')         ← frontmatter cache
├── Y.Map('agent-flash')      ← agent write-flash side-channel (D57)
└── Y.Map('agent-effects')    ← bounded activity-log ring-buffer (D49)
```

`agent-flash` is a side-channel for agent activity that the editor renders as flashes — already wired through the CRDT.

**Implications:**
- A "lint findings flash" UI already has a substrate to ride on. Lint findings could surface as agent-flash entries that render in the live preview — a surface every host gets via the OK preview, regardless of host hook support.
- This is the same logic as the existing `attach-preview-once` warning, applied to lint output: server-side state, surfaced via existing UI affordances, no host-side hooks required.

---

## Findings on auto-research surfaces

### Finding: Cloud-hosted "background agents" exist on Cursor, Codex, Copilot, Continue, Cowork
**Confidence:** CONFIRMED
**Evidence:** Web search results across hosts:

| Host | Background-agent surface |
|---|---|
| Cursor | "Cursor 1.7+ background agents" (referenced in Cursor docs) — runs async tasks |
| OpenAI Codex | "Codex Cloud" / "Codex async agents" (per `developers.openai.com/codex/cli/features`) |
| GitHub Copilot | "Cloud agent" hooks documented separately at `docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-hooks` |
| Continue.dev | "async agents on every pull request, enforcing team rules" (Continue 2026 review) |
| Claude Cowork | Anthropic's hosted async-agent surface (per this repo's prior research) |
| Windsurf | "Wave 13: Parallel Agents & Arena Mode" (parallel/async work) |

**Implications:**
- Auto-research is broadly supported in 2026 — every major host now has *some* form of cloud / async / scheduled agent. Karpathy's Lint operation #6 ("data gaps that could be filled with a web search") and the AgriciDaniel "boundary-first autoresearch" pattern can ride on these.
- The cross-host portability story is messier here than for hooks — each host's cloud-agent API differs significantly. But all of them can run a Claude Code (or equivalent) session against the OK MCP server given suitable plumbing.

### Finding: GitHub Actions is the universal substrate for auto-research
**Confidence:** INFERRED
**Evidence:** Continue.dev: *"Agents can be integrated into CI/CD pipelines like GitHub Actions to automatically review every pull request, ensuring standards are enforced consistently across teams."* GitHub Copilot CLI: cloud-agent hooks live in `.github/hooks/`.

**Implications:**
- For auto-research that runs *outside* the agent session (overnight, on cron, on PR), **GitHub Actions is the lowest-common-denominator** — every host's user has access to it, the CLI version of every agent (Claude Code, Codex, Continue, Copilot, Cursor) can run there, and OK's MCP server can be invoked from there.
- This is **the** cross-host story for auto-research: ship a GitHub Action that boots OK MCP + Claude Code (or any agent CLI) in headless mode, runs the lint operation, files findings as a wiki page or PR.
- This bypasses the per-host hook-or-no-hook split entirely — instead of "did the host fire a hook on edit," the question becomes "did the GH Action run on schedule."

### Finding: MCP sampling is the cross-host LLM-call primitive for auto-research
**Confidence:** CONFIRMED
**Evidence:** MCP spec — `sampling/createMessage` lets the server request an LLM call from the client.

**Implications:**
- Sampling enables a **server-driven auto-research mode** that works in any MCP-compliant host: when the user is connected, the server can periodically (or on user's "lint" command) ask the LLM to evaluate orphan pages, draft research questions for data gaps, etc. — without the agent itself orchestrating it.
- The constraint ("only in association with an originating client request") means sampling can't fire while the user is offline — but it can fire on every user interaction. Combined with notifications, this gives "next-time-you're-here" auto-research surfaces.

---

## Gaps / follow-ups

- I did not test sampling end-to-end across hosts — Claude Code, Cursor, Codex documentation all reference it, but support quality varies. A 1-hour spike with a minimal MCP server that triggers sampling on each tool call would establish actual cross-host parity.
- GitHub Actions integration with OK specifically would benefit from a worked example — the report can sketch the shape, but production integration would need a separate spike.
- I did not investigate whether Claude Desktop / Cowork support sampling and elicitation (they should per spec, but real-world test would confirm).
