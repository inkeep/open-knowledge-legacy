---
title: "MCP Apps UI Persistence Behavior: Inline, Fullscreen, and Picture-in-Picture"
description: "Focused investigation into how MCP App iframes persist (or don't) across conversation turns in Claude Desktop, Cursor, and ChatGPT. Covers display modes, iframe lifecycle, state management, and the critical finding that iframes are ephemeral by default."
createdAt: 2026-04-03
updatedAt: 2026-04-03
parentReport: /Users/edwingomezcuellar/reports/ai-coding-tools-embedded-browsers/REPORT.md
dimension: "MCP Apps Persistence Deep Dive"
---

# Evidence: MCP Apps UI Persistence Behavior

**Dimension:** MCP Apps iframe lifecycle, display modes, and state persistence
**Date:** 2026-04-03
**Sources:** MCP Apps specification, ext-apps GitHub repo, OpenAI Apps SDK docs, developer blog posts, community bug reports, Mapbox MCP server implementation

---

## Key pages referenced

- https://modelcontextprotocol.io/extensions/apps/overview -- MCP Apps official overview
- https://apps.extensions.modelcontextprotocol.io/api/documents/Overview.html -- Full API documentation
- https://github.com/modelcontextprotocol/ext-apps -- Official ext-apps repository
- https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx -- Draft specification
- https://developers.openai.com/apps-sdk/build/state-management -- ChatGPT widget state management
- https://developers.openai.com/apps-sdk/build/chatgpt-ui -- ChatGPT app display mode reference
- https://sunpeak.ai/blogs/chatgpt-app-display-mode-reference/ -- Display mode technical deep dive
- https://www.thingsaboutweb.dev/en/posts/mcp-apps -- Developer experience report (iframe recreation gotcha)
- https://community.openai.com/t/bug-report-chatgpt-strips-meta-from-tool-results-and-breaks-mcp-apps-viewuuid-state-persistence-pattern/1375980 -- viewUUID state persistence bug
- https://alpic.ai/blog/mcp-apps-how-it-works-and-how-it-compares-to-chatgpt-apps -- MCP Apps vs ChatGPT Apps comparison
- https://github.com/mapbox/mcp-server/blob/main/docs/mcp-ui.md -- Mapbox MCP App implementation
- https://modelcontextprotocol.io/extensions/client-matrix -- Client support matrix
- https://cursor.com/changelog/2-6 -- Cursor 2.6 MCP Apps launch
- https://www.theregister.com/2026/01/26/claude_mcp_apps_arrives/ -- The Register coverage
- https://forum.cursor.com/t/cursor-2-6-mcp-apps/153482 -- Cursor community discussion

---

## Findings

### Finding 1: MCP Apps iframes are EPHEMERAL by default -- the host can destroy and recreate them at any time

**Confidence:** CONFIRMED
**Evidence:** MCP Apps specification (lifecycle section) + developer experience report

This is the single most important finding. The MCP Apps specification defines a lifecycle with an explicit teardown phase, and the host retains full control over iframe lifecycle.

From the specification (Overview docs): During teardown, "the Host notifies the View so it can save state or release resources" via `ui/resource-teardown`.

From a developer who built a Mermaid diagram editor as an MCP App (thingsaboutweb.dev): **"The Host can destroy and recreate your iframe at any time -- conversation scrolls out of view, user switches tabs, Host updates its UI."**

This means:
- When a user scrolls past an MCP App in the conversation, the host MAY destroy the iframe
- When the user scrolls back, the host recreates the iframe from scratch
- Tab switching, UI updates, or conversation navigation can trigger destruction
- The app must be designed to survive being torn down and recreated

**Lifecycle phases (from spec):**
1. Discovery -- host reads tool descriptions, finds `_meta.ui.resourceUri`
2. Initialization -- host renders iframe, view sends `ui/initialize`, receives host context
3. Data Delivery -- host pushes tool results to the view
4. Interactive Phase -- bidirectional communication (tool calls, context updates, messages)
5. Teardown -- host sends `ui/resource-teardown`, view acknowledges

**Implications:** An MCP App cannot rely on being persistently visible. Any complex editor state (cursor position, unsaved edits, scroll position, open panels) must be saved before teardown and restored on recreation. This is a fundamental architectural constraint.

---

### Finding 2: Three display modes exist -- inline, fullscreen, and picture-in-picture -- but host support varies

**Confidence:** CONFIRMED
**Evidence:** MCP Apps specification + ChatGPT Apps SDK documentation

The spec defines three display modes:

| Mode | Behavior | Persistence | Use Case |
|------|----------|-------------|----------|
| **inline** | Embedded in the chat flow, as part of a message | Tied to message position; may be destroyed when scrolled out of view | Charts, previews, forms, visualizations |
| **fullscreen** | Takes over the entire conversation space below the host header | Active while open; dismissed by user (X button) | Immersive editors, games, complex dashboards |
| **pip** (picture-in-picture) | Floating overlay above the conversation | **Persists while user continues chatting** | Music players, timers, persistent widgets |

From the spec: PiP is "Useful for persistent widgets (music player, timer) that should remain visible while the user continues chatting."

**Display mode negotiation:**
- The host declares `availableDisplayModes` during initialization
- The view can call `requestDisplayMode` to request a mode change
- The host always has final say: "the Host always has final say over its own UI"
- The host notifies the view of mode changes via `ui/host-context-change`

**ChatGPT-specific rendering details (from Sunpeak AI analysis):**

Inline mode HTML structure:
```html
<div class="relative overflow-hidden h-full" style="height: 270px;">
  <iframe class="h-full w-full max-w-full">
```

Fullscreen mode HTML structure:
```html
<div class="fixed start-0 end-0 top-0 bottom-0 z-50 mx-auto flex w-auto flex-col overflow-hidden">
  <div class="h-(--header-height)"><!-- header with X button --></div>
  <div class="relative overflow-hidden flex-1">
    <iframe class="h-full w-full max-w-full">
```

PiP mode HTML structure:
```html
<div class="fixed start-4 end-4 top-4 z-50... max-height: 480.5px;">
  <div class="relative overflow-hidden h-full rounded-2xl... height: 270px;">
    <iframe class="h-full w-full max-w-full">
```

**Height constraints:**
- Inline: No maxHeight constraint; tested up to 20,000px
- Fullscreen: No maxHeight constraint; fills available space
- PiP: Uses maxHeight from host context (e.g., 480.5px in ChatGPT); scrollable within boundary
- PiP falls back to fullscreen on mobile screen widths

**Implications:** PiP mode is the closest thing to a "persistent panel" in MCP Apps. A knowledge editor running as a PiP widget would float above the conversation while the user continues chatting with the agent. However, host support for PiP is not guaranteed -- the host may only support inline mode.

---

### Finding 3: Claude Desktop renders MCP Apps inline in the conversation -- no confirmed PiP or panel mode

**Confidence:** HIGH (inferred from multiple sources; no official Claude-specific display mode documentation)
**Evidence:** The Register coverage, Anthropic quotes, developer reports, Mapbox implementation

Anthropic stated at MCP Apps launch: "Claude already connects to your tools and takes actions on your behalf. Now those tools show up right in the conversation, so you can see what's happening and collaborate in real time."

The Register described Claude's MCP Apps as rendering "directly within Claude's chat window as part of the conversation flow."

The Mapbox MCP server implementation targets Claude Desktop specifically and describes rendering as "a full HTML map panel" with "click-to-zoom and a Fullscreen toggle" that appears inline within the chat. The resource includes metadata for `preferred-frame-size: ['800px', '600px']`.

What is NOT confirmed for Claude Desktop:
- Whether Claude Desktop supports PiP (picture-in-picture) display mode
- Whether Claude Desktop supports fullscreen display mode
- Whether users can pin/dock an MCP App to stay visible
- Whether Claude Desktop's `availableDisplayModes` includes anything beyond inline

The client matrix at modelcontextprotocol.io confirms Claude (web) and Claude Desktop support MCP Apps, but does not break down which display modes each client implements.

**Implications:** In Claude Desktop, MCP App iframes most likely render inline in the conversation stream. They scroll with the conversation. When scrolled out of view, the host may destroy the iframe. There is no evidence of a persistent sidebar, docked panel, or always-visible mode specific to Claude Desktop.

---

### Finding 4: Cursor renders MCP Apps inline in agent chat -- same as Claude Desktop

**Confidence:** HIGH
**Evidence:** Cursor 2.6 changelog, Cursor forum, launch descriptions

Cursor 2.6 (March 3, 2026) introduced MCP Apps support. The changelog states: "MCP Apps let MCP servers return interactive HTML interfaces -- like dashboards, charts, forms, media viewers -- that render right in your agent chat."

The description explicitly says "directly inside Cursor" and "right in your agent chat," confirming inline-in-chat rendering.

Launch partners: Amplitude (live charts), Figma (design specs), tldraw (whiteboards).

From the Cursor community (markaicode.com): "Instead of the agent describing numbers in a text block, the Amplitude MCP renders a live chart inline in the chat."

No evidence of PiP, fullscreen, sidebar, or docked panel modes in Cursor's MCP Apps implementation.

**Implications:** Cursor's MCP Apps behave like Claude Desktop -- inline in the chat stream, scrolling with the conversation. However, Cursor ALSO has its built-in Chromium browser panel which can render any URL in a persistent editor tab. For persistent visibility, the browser panel remains a better option in Cursor than MCP Apps.

---

### Finding 5: ChatGPT has the richest MCP Apps implementation -- with widgetState persistence and display mode support

**Confidence:** CONFIRMED
**Evidence:** OpenAI Apps SDK documentation, ChatGPT-specific APIs

ChatGPT provides host-specific APIs that go beyond the base MCP Apps specification:

**Widget state persistence:**
- `window.openai.widgetState` -- reads the current widget-scoped state snapshot
- `window.openai.setWidgetState(newState)` -- persists the next snapshot
- Widgets are message-scoped: "Every response that returns a widget creates a fresh instance with its own UI state"
- State survives recreation: "When you reopen or refresh the same message, the widget restores its saved state (selected row, expanded panel, etc.)"

**Display mode API:**
- `window.openai.requestDisplayMode` -- request transitions between inline/fullscreen/PiP

**State categories (ChatGPT's three-tier model):**

| State Type | Owner | Lifetime | Mechanism |
|------------|-------|----------|-----------|
| Business data | MCP server/backend | Long-lived | Tool calls to server |
| UI state | Widget instance | Active widget only | `widgetState` API |
| Cross-session state | Your backend storage | Cross-conversation | Custom backend |

The critical difference: ChatGPT's `widgetState` is a ChatGPT-specific extension, NOT part of the MCP Apps spec. Apps targeting Claude Desktop or Cursor cannot use it.

**Implications:** ChatGPT currently offers the best MCP Apps persistence story. The widgetState API means apps can preserve UI state across iframe recreations. Claude Desktop and Cursor lack this host-specific extension.

---

### Finding 6: The MCP Apps spec does NOT include built-in state persistence -- this is a known gap

**Confidence:** CONFIRMED
**Evidence:** Alpic AI comparison article, community discussion

From Alpic AI's comparison: **"State persistence is absent from the current MCP Apps specification and seems to be delayed into a future iteration."** The article notes this makes it "hard to do great UX Apps without any state persistence."

The MCP Apps spec provides the teardown notification (`ui/resource-teardown`) so apps can save state before destruction, but does NOT provide:
- A standard API for restoring state on recreation
- A host-managed state store
- A standard way to persist UI state across sessions

**Workaround patterns developers are using:**

1. **Server-side state via callServerTool:** Register internal tools on the MCP server (e.g., `save-draft` / `get-draft`). The view calls `callServerTool` to persist state to server memory on every edit. When the iframe is recreated, it loads the last saved state from the server. This is the pattern used by the Mermaid editor developer (thingsaboutweb.dev).

2. **viewUUID pattern:** The server generates a unique ID returned in tool results' `_meta` field. The widget uses this UUID as a localStorage key. However, this pattern is fragile -- ChatGPT was reported to strip `_meta` from tool results, breaking it.

3. **updateModelContext:** The view can push state summaries to the model's context, which survives across turns. However, this is context for the LLM, not a state restoration mechanism.

**Implications:** Any MCP App that needs to maintain complex UI state (like a knowledge editor) must implement its own server-side state persistence. The MCP Apps protocol does not help here. This is a significant limitation compared to native web apps or even ChatGPT's proprietary widgetState API.

---

### Finding 7: Sizing is negotiable -- apps can declare preferred dimensions, hosts decide

**Confidence:** CONFIRMED
**Evidence:** MCP Apps spec, Mapbox implementation

The spec defines dimension modes:
- Static pixel dimensions
- Responsive/fluid sizing
- Host-controlled constraints

The Mapbox MCP server demonstrates the pattern: resources include metadata with `preferred-frame-size: ['800px', '600px']` to communicate desired dimensions.

The MCP-UI community SDK recognizes `mcpui.dev/ui-preferred-frame-size` as a metadata key for initial iframe sizing.

However: "Host enforces container dimensions and may restrict requested sizes." The host always has final say.

In ChatGPT's implementation:
- Inline mode: Fixed height matching resource height, full width of conversation column
- Fullscreen mode: Full viewport minus header
- PiP mode: Floating overlay with maxHeight constraint (e.g., 480.5px)

**Implications:** An MCP App cannot guarantee its rendered size. A knowledge editor requesting 800x600 may get that size, or the host may give it a smaller container. Apps must be responsive.

---

### Finding 8: Multiple concurrent MCP Apps -- not addressed in the spec, likely supported per-message

**Confidence:** LOW (inferred)
**Evidence:** Spec silence, ChatGPT widget model

The MCP Apps specification does not explicitly address multiple concurrent apps. However, since widgets are message-scoped (at least in ChatGPT), each tool call that returns UI creates its own iframe instance tied to that message.

This means a conversation could have multiple MCP App iframes -- one per tool call that returned UI -- each embedded in its respective message. But there is no "multi-panel" or "tiled" mode where several MCP Apps render side by side.

**Implications:** A user could invoke our editor tool multiple times, creating multiple editor iframes in different messages. Each would be independent. There is no coordinated multi-app layout.

---

### Finding 9: Claude Code (CLI) and claude.ai/code do NOT render MCP Apps

**Confidence:** HIGH (inferred from architecture)
**Evidence:** Claude Code documentation, MCP Apps client matrix

Claude Code is a terminal-based CLI tool. It has no graphical rendering surface for HTML iframes. MCP Apps require a host that can render HTML in a sandboxed iframe -- Claude Code's terminal output cannot do this.

The client matrix lists "Claude (web)" and "Claude Desktop" as supporting MCP Apps. Claude Code (the CLI) is not listed. The web interface at claude.ai supports MCP Apps when accessed through the standard Claude conversation UI.

Claude Code's web app (claude.ai/code) is a distinct product focused on terminal-style code interaction. Whether it supports MCP Apps rendering is unclear from available documentation, but its UI is optimized for code/terminal output, not rich interactive panels.

**Implications:** MCP Apps are only relevant for Claude Desktop (the Electron app) and claude.ai (the web app), not for Claude Code's CLI or its web terminal interface.

---

### Finding 10: Communication between iframe and agent is bidirectional but host-mediated

**Confidence:** CONFIRMED
**Evidence:** MCP Apps specification

The iframe and host communicate via JSON-RPC over postMessage. The app can:
- **Call MCP tools** on the server via `callServerTool` (proxied through host)
- **Send messages** visible in the conversation via `sendMessage`
- **Update model context** silently via `updateModelContext` (last call wins)
- **Request display mode changes** via `requestDisplayMode`
- **Open links** in the user's browser via `sendOpenLink`

The host can:
- Push tool results to the app via notifications
- Notify the app of size changes via `ui/size-change`
- Notify of host context changes via `ui/host-context-change`
- Send teardown notification via `ui/resource-teardown`

All communication is mediated by the host. The iframe cannot directly access the parent DOM, cookies, localStorage, or any host resources.

**Implications:** The communication model is sufficient for an editor use case -- the editor can call tools to save/load content, and the host can push updates. The limitation is that all tool calls require host mediation (and potentially user consent), adding latency compared to direct API calls.

---

## Summary: Answering the Persistence Question

**Q: Do MCP App iframes persist as a permanent panel, or do they only appear per-message in the conversation?**

**A: They appear per-message in the conversation (inline mode) by default. They are ephemeral -- the host can destroy and recreate them at any time, including when the user scrolls past them.**

The full picture:

| Aspect | Behavior |
|--------|----------|
| Default rendering | Inline in conversation, tied to the message where the tool was called |
| Persistence when scrolling | NOT guaranteed -- host may destroy iframe when out of view |
| Persistent mode | PiP (picture-in-picture) exists in spec, floats above conversation -- but host support varies |
| Sidebar/docked panel | NOT supported in MCP Apps spec |
| User can pin/dock | NOT supported |
| State when recreated | Lost unless app implements server-side persistence |
| Claude Desktop | Inline in chat; PiP/fullscreen support unconfirmed |
| Cursor | Inline in agent chat; PiP/fullscreen support unconfirmed |
| ChatGPT | Inline + fullscreen + PiP confirmed; widgetState API preserves state |
| Claude Code (CLI) | Not applicable -- no rendering surface |
| Multiple apps | Each tool call creates its own iframe; no multi-panel layout |

---

## Gaps / follow-ups

- Which specific display modes Claude Desktop supports (inline only? fullscreen? PiP?) -- needs testing or Anthropic confirmation
- Whether Cursor's MCP Apps implementation supports PiP mode
- Whether Claude Desktop will add a persistent panel/sidebar for MCP Apps in future releases
- Performance of complex React editors running in MCP App sandboxed iframes with CSP restrictions
- Whether the MCP Apps spec will add standardized state persistence in a future version
- The interaction between Claude Desktop's existing localhost preview panel and MCP Apps -- could they converge?
