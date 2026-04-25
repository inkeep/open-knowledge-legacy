# Evidence: D2 — Failure Modes of the Per-Edit Pattern

**Dimension:** What breaks, costs, or degrades with the current per-edit `get_preview_url → navigate → write` pattern.
**Date:** 2026-04-24
**Sources:** 1P code + instructions, spec audit findings, observed duplication of work.

---

## Key files referenced

- `packages/server/assets/skills/open-knowledge/SKILL.md:37-49` — the mandated per-edit sequence.
- `packages/cli/src/mcp/server.ts:194, 202-206` — MCP `instructions` restating the same mandate (drift site).
- `specs/2026-04-15-preview-url-pre-edit/meta/audit-findings.md:79` — explicit audit acknowledgment that the guidance loop lacks measurement.
- `packages/server/src/api-extension.ts:1547-1555, 1563-1571` — server-side `setFocus` + `getSubscriberCount` that already fire on every write, making client-side nav redundant.

---

## Findings

### Finding 1: Token and latency overhead per edit
**Confidence:** INFERRED (structural — no quantified measurement)
**Evidence:** Every `write_document` or `edit_document` call today requires at minimum:
1. `get_preview_url(docName)` MCP round-trip — ~1 HTTP request + response parse + JSON plumbing.
2. Preview-browser navigation call (e.g., `preview_start` or client-specific nav) — ~1 additional tool call.
3. LLM reasoning tokens to (a) decide to call `get_preview_url`, (b) parse its response, (c) decide to call `preview_start` / nav, (d) parse that response.

For an agent making N wiki edits per session, this is 2N tool calls + ~2N reasoning hops that add no information the agent didn't already have. The pattern is imposed by instructions, not by the MCP protocol.

**Implications:** Overhead scales linearly with edit count. For batch operations (e.g., creating 10 new spec docs), the agent spends ~50% of its tool-call budget on preview navigation rather than content work. The cost is paid in (a) clock time (preview_start / nav is not free), (b) context window (each tool call eats tokens on both request and response), and (c) reasoning tokens (the agent has to plan + execute + verify per edit).

### Finding 2: Agent compliance drift is structural
**Confidence:** CONFIRMED (instruction surfaces documented)
**Evidence:** The preview-before-edit obligation is restated in ≥4 places (MCP instructions, SKILL.md, CLAUDE.md injection, tool description) — spec -15 D11 explicitly notes the drift risk and extracts a shared `PREVIEW_GUIDANCE` constant as mitigation. The audit finding at `specs/2026-04-15-preview-url-pre-edit/meta/audit-findings.md:79` explicitly flags "the spec ships without a measurable success metric for the CLAUDE.md guidance loop" — acknowledging that the team cannot confirm agents are complying. Target M1 was "≥70% of wiki edits preceded by preview nav" with "baseline ~0%."

**Implications:** A mandate that can't be measured and that has to be echoed in 4 surfaces is prone to drift. Any agent that hits a context-window compaction or loads the skill differently may silently skip the step. The cost of non-compliance (missed preview) is exactly the outcome the mandate was trying to prevent, so the mandate's value is gated on reliable execution.

### Finding 3: Ambiguous "navigate" semantics across clients
**Confidence:** CONFIRMED
**Evidence:** The agent skill says: _"Open that URL in your preview browser so the user sees the document."_ But the specific navigation tool differs by client:
- **Claude Code Desktop:** `preview_start("open-knowledge-ui")` — named entry from `.claude/launch.json`, not a URL. The navigation-to-different-URL is implicit (depends on the pane persisting and URL being re-evaluated) — see `.claude/launch.json` in this repo (`name: "open-knowledge-ui"`, `port: 3000`).
- **Cursor:** `Navigate` tool (Chromium embedded browser, Chrome DevTools Protocol) — takes a URL directly.
- **Claude Desktop (chat, not Code):** localhost-only preview (see `reports/ai-coding-tools-embedded-browsers/REPORT.md`) — limited.
- **Codex:** no embedded browser at all.
- **Generic MCP client over stdio:** no standardized "open URL in browser" tool.

**Implications:** "Navigate the preview browser" means something different in each harness. The skill guidance therefore cannot be concrete — it has to say "in your preview browser," which forces the LLM to infer the right tool name. When the LLM guesses wrong (e.g., calls `preview_start` with a URL instead of a launch-config name), the call fails and the edit still goes through, producing the "subscriber count = 0, no preview attached" warning. The user just doesn't see the edit.

### Finding 4: The `preview_start` vs URL-nav mismatch on Claude Code
**Confidence:** CONFIRMED (from Claude Code docs fetch)
**Evidence:** Claude Code's `preview_start` takes a `name` parameter that maps to a launch.json config entry, not a URL. The preview pane is persistent — "Claude creates the initial server configuration based on your project" — and subsequent navigation to different URLs within the same pane happens implicitly when the agent "asks" to preview another doc. There is no documented `preview_nav(url)` tool per se. The skill currently says _"call `preview_start("open-knowledge-ui")`"_ — which launches the OK UI once at some default path (the root `/`). Navigating to a specific `#/docs/foo` URL within that pane requires either (a) re-calling `preview_start` (which likely re-opens the server), (b) using whatever DOM/URL-bar navigation tool the preview MCP exposes, or (c) relying on hash-route changes driven by server-pushed `agentFocus`.

**Implications:** Claude Code's `preview_start` was designed for "start a dev server, pin its root," not "navigate an already-open pane to a deep URL per edit." The current OK agent-facing contract stretches the tool beyond its shape. Cursor's `Navigate` tool is a better semantic fit (takes a URL), but Cursor is one client among many.

### Finding 5: Per-edit navigation conflicts with server-push-nav's typing guard
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/components/SystemDocSubscriber.tsx:101-103` — the typing guard: _"suppress nav silently while the user is actively editing."_ (`AGENT_PRESENCE_TYPING_GUARD_MS` = 3s, from `lib/agent-presence.ts`.)

```typescript
// SystemDocSubscriber.tsx:101-103
const sinceLastKeystroke = Date.now() - getLastUserKeystroke();
if (sinceLastKeystroke < AGENT_PRESENCE_TYPING_GUARD_MS) return;
```

If the agent nav (via `get_preview_url` + `preview_start`) forces a URL change, it bypasses the typing guard — the browser navigates regardless of whether the user just typed. The server-pushed nav respects the guard. The per-edit pattern therefore strictly *weakens* the user-sovereignty protection that spec -14 carefully built.

**Implications:** The per-edit pattern has a worse UX than the server-push pattern in the "user is mid-edit" case. The server-push path already handles this correctly via the 3-second typing suppression. The agent-driven navigation has no equivalent — it just nav yanks.

### Finding 6: Redundant work with `AgentFocusBroadcaster`
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:1550-1555` unconditionally calls `setFocus` at the end of every agent write. Any editor tab subscribed to `__system__` awareness auto-navigates (with pin + typing guards) within `AGENT_PRESENCE_DEBOUNCE_MS` (300ms). The per-edit `get_preview_url + preview_start` pattern does the same work via a different path, earlier (before the write, not after).

**Implications:** For the most common case — user has ONE editor tab open, agent edits docs in sequence — the per-edit pattern is doing work the server already does. The only case it uniquely handles is "no editor tab open yet" — i.e., cold start. A single setup-time open covers the cold start case exactly once per session.

### Finding 7: Instruction verbosity amplifies small-model failure
**Confidence:** INFERRED
**Evidence:** The full preview mandate appears in `buildInstructions()` + SKILL.md (228 lines, preview section 37-49) + CLAUDE.md injection + tool description. A small/cheap model (e.g., Haiku) working with OK has to parse, store, and recall the mandate across a session. When context compacts, the mandate is one of many rules competing for retention. Bigger models comply more reliably; small models drop it sooner.

**Implications:** The per-edit mandate preferences large-model customers over small-model ones. A "setup once" mandate is a single instruction that's easier to retain.

---

## Gaps / follow-ups

- **No quantified compliance rate.** Spec -15 target M1 ≥70% was aspirational; the audit finding confirms no instrumentation was built. Would need agent session transcript analysis.
- **No measurement of mid-edit yank frequency.** The typing-guard bypass (Finding 5) is structural but we don't know how often users are mid-edit when an agent edit arrives via the per-edit path vs the server-push path.
- **No cost data for `preview_start` round-trip.** Qualitatively slow (dev server startup); quantitatively unmeasured.
