# MCP Apps — displaying UI in response to tool calls

Source: https://modelcontextprotocol.io/extensions/apps/overview
Source: https://apps.extensions.modelcontextprotocol.io/
Source: https://mcpui.dev/

## Trigger model

MCP Apps render **only in response to a tool call** that declares
`_meta.ui.resourceUri`. There is no server-push equivalent — the server cannot
unilaterally pop up a UI when nothing has been called. Lifecycle:

1. Tool definition carries `_meta.ui.resourceUri` pointing to a `ui://…` resource.
2. LLM calls the tool.
3. Host fetches the `ui://` resource (HTML + bundled JS/CSS; may load external
   origins declared in `_meta.ui.csp`).
4. Host renders HTML in a sandboxed iframe inline in the chat stream.
5. Iframe and host communicate via postMessage JSON-RPC (ui/initialize,
   ui/toolResult, tools/call back through the host).

## Display modes

Per https://mcpui.dev/guide/client/resource-renderer and
https://apps.extensions.modelcontextprotocol.io/ :

- `inline` (universally supported; Claude Desktop, Cursor inline-only)
- `fullscreen` (ChatGPT; others optional)
- `picture-in-picture` (ChatGPT)

Initial size hint: `_meta.ui.preferred-frame-size` (or
`mcpui.dev/ui-preferred-frame-size`) — host may honor or clamp.

## Persistence

Per evidence/mcp-apps-persistence.md from the prior-art report: iframes are
**ephemeral by default**. Hosts may recreate them when scrolled out of view.
State is lost unless the server persists it (via `callServerTool` or
ChatGPT-only `widgetState` API). This matters for our "watch while Claude
writes 10 files" scenario: a chat-scroll-based MCP App view cannot be a stable
ambient preview.

## Client support (April 2026)

- Claude (web + desktop): yes, inline only.
- Cursor: yes, v2.6+.
- VS Code Copilot: yes.
- Goose, Postman, MCPJam: yes.
- **Claude Code CLI: no.** It's a terminal; it can't render iframes.
- ChatGPT: yes, plus display mode extensions.
- Codex desktop: not confirmed.

## sendOpenLink capability

The spec mentions a `sendOpenLink` capability that hosts may enable or
disable for an app. This would let the iframe ask the host to open an
external URL. It is:

- An iframe→host request, not a server→host request. Only works when the app
  is already rendered.
- Host-gated — Claude Desktop and Cursor may or may not honor it.
- Not the same as "auto-open the editor when Claude starts writing a doc."
