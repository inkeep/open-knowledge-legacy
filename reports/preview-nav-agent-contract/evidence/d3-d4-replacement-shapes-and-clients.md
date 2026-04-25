# Evidence: D3 + D4 — Replacement Shapes & Cross-Client Compatibility

**Dimension:** Viable designs for the replacement contract, evaluated against each major MCP client.
**Date:** 2026-04-24
**Sources:** 1P code (`agent-focus.ts`, `api-extension.ts`, write tools), Claude Code Desktop docs, Cursor browser docs, MCP protocol spec on resources + subscriptions, prior reports (`ai-coding-tools-embedded-browsers`, `agent-follow-and-edit-visibility-ux`).

---

## Key files / pages referenced

- `packages/server/src/agent-focus.ts` — server-side push-nav substrate (already shipped).
- `packages/server/src/api-extension.ts:815-830` — `getSubscriberCount` (already emits `warning` on writes).
- `.claude/launch.json` — existing Open Knowledge launch config for Claude Code Desktop (name: `open-knowledge-ui`, port: 3000).
- [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop) — preview pane semantics.
- [Cursor browser tool docs](https://cursor.com/docs/agent/tools/browser) — Navigate / Click / Screenshot tools, persistent state.
- [reports/ai-coding-tools-embedded-browsers/REPORT.md](../../ai-coding-tools-embedded-browsers/REPORT.md) — which clients can host embedded browsers.
- [reports/agent-follow-and-edit-visibility-ux/REPORT.md](../../agent-follow-and-edit-visibility-ux/REPORT.md) — 3P UX landscape that already notes _"push-nav-via-MCP-tool constraint that the follow-mode UX replaces."_

---

## Candidate replacement shapes

### Shape A — "Ensure preview attached" as a session pre-req
**Mechanism.** Replace the per-edit mandate with a setup-time one: _"Before your first `write_document` or `edit_document` in this session, ensure a preview is attached (call `preview_start` / Cursor `Navigate` / your host's equivalent). After that, write freely — the editor follows you."_

**How it works technically:**
- First write happens without a preview attached.
- Server response includes `warning: { message: "No preview attached to <doc>.", previewUrl: "http://..." }` (already implemented — see `api-extension.ts:1567` + `write-document.ts:107-112`).
- Agent sees warning on the FIRST write; opens preview once; subsequent writes see `subscriberCount > 0` and no warning; server-pushed `setFocus` carries the preview to each new doc automatically.

**Pros:** Minimal new infrastructure — uses existing `setFocus` broadcaster and subscriber-count warning. Compatible with any MCP client that has ANY preview-opening tool (even a human telling Claude "open this URL in a new tab"). Per-edit overhead goes to zero after first write. Typing guard (SystemDocSubscriber) is honored automatically.

**Cons:** First-edit warning depends on the agent interpreting it correctly; if the agent ignores it, the user sees nothing. This is the same compliance risk as today, just once per session instead of per edit — a big improvement but still failable.

### Shape B — First-write auto-attach via server hint
**Mechanism.** Extend the write-tool response so that when `subscriberCount === 0`, the response includes a structured directive telling the agent exactly what to do:
```json
{
  "ok": true,
  "warning": {
    "message": "No preview attached. Open this URL in your preview browser NOW to watch future edits.",
    "previewUrl": "http://localhost:3000/#/docs/foo",
    "action": "attach-preview-once",
    "nextEditWillAlsoPush": true
  }
}
```

**How it works:**
- Agent gets clear hint from its own tool's response — no separate mandate needed in the static skill.
- After attachment, `subscriberCount > 0` and the hint is absent.

**Pros:** "Just-in-time" guidance is more likely to be followed than a static rule embedded in a skill. Declarative: the server tells the agent what the user needs; the agent doesn't have to remember a sequence. The warning already exists — this just makes it structurally imperative.

**Cons:** Agent-side skill still has to know what "attach-preview-once" means (at minimum: call `preview_start` / Navigate / equivalent). That maps to client-specific behavior (D4). Also: the hint fires only on the first write; a human who closes the preview tab mid-session will hit warning-then-silence until the next write — same failure mode as Shape A, just decoupled from the static skill.

### Shape C — MCP resource-link + subscription primitive
**Mechanism.** Treat the preview URL as an MCP *resource* (per the MCP spec on resources + `listChanged` / `subscribe`). On connect, the OK MCP server returns a resource like `preview://active-doc` with a URI that clients capable of displaying resources render natively. The server pushes `notifications/resources/updated` when focus changes.

**How it works:**
- MCP protocol has native "resources/subscribe" + "notifications/resources/updated" ([MCP Spec](https://modelcontextprotocol.io/docs/concepts/resources/)).
- Clients that support subscriptions (Claude Code v-next, Cursor, VS Code MCP extensions) can surface the resource directly.
- For clients that don't, fallback to Shape A/B.

**Pros:** Protocol-native. Clients that implement resources get rich integration "for free" — including MCP Apps-style iframe embedding (see [`reports/ai-coding-tools-embedded-browsers/REPORT.md`](../../ai-coding-tools-embedded-browsers/REPORT.md) — MCP Apps released Jan 2026, already supported by Claude Desktop, Cursor v2.6+, ChatGPT, VS Code).

**Cons:** Highest engineering cost. Hybrid shape (clients with resources = rich, clients without = fallback). Success depends on MCP resource-display adoption, which varies by client. For Open Knowledge today, overkill unless multi-client richness is itself a goal.

### Shape D — Hybrid: server does the heavy lifting, agent just opens once
**Mechanism.** Combination of Shape A + B:
1. At MCP client connect, server sends one-line instruction: _"Open `{previewUrl}` in your preview browser at the start of your session. Subsequent edits will auto-follow."_
2. First write-tool call with `subscriberCount === 0` returns a structured `action: "attach-preview-once"` hint.
3. `AgentFocusBroadcaster.setFocus` does all per-edit nav (existing infrastructure).
4. `get_preview_url` tool stays available but is demoted from mandatory to advisory ("use this if you need to re-navigate manually").

**Pros:** Reuses all current infrastructure. One cleanly stated rule in instructions, reinforced by a structured server hint exactly when needed. Agent compliance is tested once per session, not per edit. Backwards-compatible: if the agent chooses to call `get_preview_url` per edit anyway, nothing breaks; it just wastes a tool call.

**Cons:** The static instructions still need to exist somewhere — we can't eliminate the skill's preview section entirely. We're moving from "mandatory per edit" to "mandatory once per session + server-driven follow." The complexity moves from agent to server, which is fine, but there are still four surfaces (MCP instructions, SKILL.md, CLAUDE.md injection, tool description) that need to agree.

---

## Cross-client compatibility matrix (D4)

| Client | Embedded preview? | Per-edit nav tool | Persistent pane? | Best shape | Failure mode |
|---|---|---|---|---|---|
| **Claude Code Desktop** | ✅ Yes — `preview_start` + pane | `preview_start("<launch-name>")`; no documented URL-nav tool for the same pane | ✅ Yes (persists across turns) | A, B, or D: open once via `preview_start("open-knowledge-ui")`, let server push-nav handle the rest | Per-edit: `preview_start` call is slow and semantically wrong (re-launches). Once-only: works. |
| **Cursor (v3+)** | ✅ Yes — embedded Chromium w/ CDP | `Navigate` tool takes arbitrary URL | ✅ Yes ("state persists across Agent sessions") | A, B, or D: agent calls `Navigate(previewUrl)` once; server-push + hash routing drive subsequent navigation | Per-edit `Navigate` calls work but are redundant with server-push. |
| **Claude Desktop (chat)** | ⚠️ Limited — localhost-only preview; no arbitrary-URL navigation | None general-purpose | N/A | MCP Apps iframe via server resource | Requires MCP Apps adoption; otherwise falls back to "user opens URL manually." |
| **OpenAI Codex desktop** | ❌ No embedded browser | None | N/A | External browser (user-managed); warning-driven only | Agent can only emit the URL in text; user clicks. Server-push still works once the user has opened the editor tab. |
| **VS Code + MCP** | ✅ Via MCP Apps + webview API | Extension-dependent | ✅ Yes | C (MCP resource) or D | Hybrid; quality depends on which MCP extension. |
| **Generic stdio MCP client (scripts, CLI agents)** | ❌ No browser concept | None | N/A | None — the edit itself is the contract | Agent emits text; human is out of loop on preview. Server-push is silent. |

**Key takeaway:** The "once-per-session open" shape works cleanly on the two richest clients (Claude Code, Cursor) and gracefully degrades on weaker ones. Every client surface has the same first-edit failure mode as today; none is made worse.

---

## Findings

### Finding 1: Claude Code preview pane is persistent — per-edit `preview_start` is semantically wrong
**Confidence:** CONFIRMED
**Evidence:** [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop): _"The preview pane can also open static HTML files, PDFs, and images from your project. Click an HTML, PDF, or image path in the chat to open it in preview."_ And: _"Claude starts the server automatically after editing project files."_ The pane is one persistent panel, and `preview_start` accepts a `name` (launch.json entry), not a URL.

**Implications:** Today's skill guidance (`preview_start("open-knowledge-ui")` per edit) is redundant — one call at session start opens the OK UI pane and keeps it open. Subsequent hash-route changes (driven by `window.location.hash` mutations from `SystemDocSubscriber`) navigate the open pane without re-calling `preview_start`.

### Finding 2: Cursor's browser persists state across sessions
**Confidence:** CONFIRMED
**Evidence:** [Cursor docs](https://cursor.com/docs/agent/tools/browser): _"Browser state persists between Agent sessions based on your workspace"_ — including cookies, localStorage, IndexedDB.

**Implications:** For Cursor, a once-per-session `Navigate(previewUrl)` call is sufficient. Subsequent hash-route navigation is handled in-browser.

### Finding 3: Server-push `setFocus` requires an open tab somewhere — it doesn't open one
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/agent-focus.ts:24-45` publishes to `__system__` Y.Doc awareness. `packages/app/src/components/SystemDocSubscriber.tsx:49-109` — the subscriber only runs when a React app mounts, which only happens when a browser tab loads the editor. No tab, no subscription.

**Implications:** The server-push pattern REQUIRES at least one preview tab to exist. The first-write-when-no-preview case still needs something to open the tab. This is why Shape A/B/D all require ONE action per session; the question is whether that action is mandated (skill), pushed (server hint), or protocol-driven (MCP resource).

### Finding 4: MCP resources + subscriptions provide a protocol-native path
**Confidence:** CONFIRMED
**Evidence:** [MCP Spec — Resources](https://modelcontextprotocol.info/docs/concepts/resources/): servers with `subscribe` capability can publish `notifications/resources/updated` messages. Clients display resources however they want.

**Implications:** Shape C is viable but asks OK to take on meaningful protocol engineering (resource URIs, subscription, listChanged semantics) for incremental payoff. Defer unless MCP Apps adoption forces it.

### Finding 5: Warning-driven first-write already works today
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/mcp/tools/write-document.ts:107-112` — on `subscriberCount === 0`, the tool already emits a text warning including the preview URL and an instruction to "open to watch future edits live." The only change needed to move to Shape B is: make this hint structured (add `action: "attach-preview-once"`) and move the static skill mandate from per-edit to per-session.

**Implications:** Shape D (hybrid) is ~80% implementable by deleting text from skill+instructions+CLAUDE.md and adding ~10 lines of structured hint to the write-tool response.

---

## Gaps / follow-ups

- Exact tool name in Claude Code for navigating an already-open preview to a new URL: not publicly documented. The pane may respond to hash-route changes emitted by the React app itself (which is what `SystemDocSubscriber` already does via `window.location.hash = ...`).
- MCP Apps iframe embedding of the OK editor: not evaluated here — see [`reports/ai-coding-tools-embedded-browsers/REPORT.md`](../../ai-coding-tools-embedded-browsers/REPORT.md) which specifically covered this.
- Resource-subscription compliance matrix across MCP clients (beyond the listed shapes): out of scope; would extend D4.
