# MCP tool result shape (2025-06-18)

Source: https://modelcontextprotocol.io/specification/2025-06-18/server/tools

A `CallToolResult.content` array may contain:

- `{ type: "text", text }` — plain text. Markdown rendering is up to the host.
- `{ type: "image", data, mimeType }`
- `{ type: "audio", data, mimeType }`
- `{ type: "resource_link", uri, name, description, mimeType }` — pointer to a
  resource (`file://`, `https://`, or custom scheme). **The spec does not say
  resource links auto-navigate.** Hosts render them however they like.
- `{ type: "resource", resource: { uri, mimeType, text|blob } }` — embedded
  resource.

The spec has no `{ type: "open_url" }` or `{ type: "redirect" }` content. There
is no protocol-level "the client MUST open this URL" semantic.

Rendering is entirely host-defined:

- Claude Code CLI: renders text through a terminal. OSC 8 hyperlinks on
  markdown `[text](url)` are emitted outside of tables (per
  github.com/anthropics/claude-code issues #27889 / #37808 / #20823). File
  paths are plain text — a feature request (#13008) exists for OSC 8 on them.
  No auto-navigation — clicking is on the user.
- Claude Desktop: renders tool results as chat bubbles. URLs are clickable
  links that open in the user's default browser (or the in-app preview panel
  if the URL is a known localhost dev-server target configured in
  `.claude/launch.json`).
- Cursor: renders tool results inline in chat. A URL is clickable and opens in
  the user's default browser — *not* in Cursor's built-in browser panel unless
  the user has taken a separate action to route it there.

## _meta.ui.resourceUri (MCP Apps extension)

The 2026-01-26 MCP Apps extension adds `_meta.ui.resourceUri` on a tool
definition. When the tool is called, the host fetches a `ui://` resource and
renders it as a sandboxed iframe. See `mcp-apps-spec.md` for detail.

This is the closest thing to "auto-render something visual when a tool runs,"
but:
1. It is an extension, not core spec.
2. Client support is partial (Claude, Cursor 2.6+, VS Code Copilot, Goose).
   Claude Code CLI does not render iframes — it's a terminal.
3. The iframe renders in-chat, not as a persistent panel. Rendering is tied to
   the tool call, not to an ambient "I'm editing a doc right now" state.
