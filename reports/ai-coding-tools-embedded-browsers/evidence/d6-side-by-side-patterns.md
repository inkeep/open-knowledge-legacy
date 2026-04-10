# Evidence: Side-by-Side Patterns & MCP UI Standards

**Dimension:** D6 — Side-by-side patterns and MCP UI rendering
**Date:** 2026-04-03
**Sources:** MCP specification, WorkOS blog, Shopify engineering, MCP-UI GitHub, tool comparisons

---

## Key pages referenced

- https://modelcontextprotocol.io/docs/extensions/apps — MCP Apps official spec
- https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/ — MCP Apps announcement
- https://workos.com/blog/2026-01-27-mcp-apps — WorkOS analysis
- https://shopify.engineering/mcp-ui-breaking-the-text-wall — Shopify MCP UI
- https://github.com/MCP-UI-Org/mcp-ui — Community MCP-UI SDK
- https://mcpui.dev/guide/introduction — MCP-UI documentation
- https://www.theregister.com/2026/01/26/claude_mcp_apps_arrives/ — Coverage

---

## Findings

### Finding: MCP Apps is the emerging standard for rendering interactive UI inside AI agent conversations
**Confidence:** CONFIRMED
**Evidence:** Official MCP specification (January 26, 2026)

MCP Apps is the first official extension to MCP. Tools declare a `_meta.ui.resourceUri` field pointing to a `ui://` resource containing bundled HTML/JS. The host renders this in a sandboxed iframe within the conversation.

Client support as of April 2026: Claude (web+desktop), ChatGPT, VS Code GitHub Copilot, Goose, Cursor (v2.6), Postman, MCPJam.

Key architecture:
- UI served via `ui://` scheme (bundled HTML, not arbitrary URLs)
- Sandboxed iframe with CSP restrictions
- Bidirectional JSON-RPC over postMessage
- Can request additional iframe permissions (camera, microphone)
- Can load external resources from CSP-declared origins
- Can call MCP tools from within the iframe

**Implications:** MCP Apps is the MOST promising cross-platform pathway for embedding our editor. A single MCP server with an MCP App UI would render our editor in Claude Desktop, Cursor, ChatGPT, and potentially Codex — all from one implementation.

### Finding: MCP Apps uses bundled HTML, not arbitrary external URLs — but can load external resources via CSP
**Confidence:** CONFIRMED
**Evidence:** MCP Apps spec

Resources are served via `ui://` scheme containing self-contained HTML. However, "Apps can also load external scripts and resources from origins specified in `_meta.ui.csp`."

This means the bundled HTML could be a thin shell that loads our editor from our server as an external resource, with our domain declared in the CSP.

**Implications:** Our editor doesn't need to be fully bundled — the MCP App HTML can be a lightweight loader that iframes or dynamically loads our editor from our server. This preserves real-time updates and dynamic content.

### Finding: Lovable, v0, and Bolt all use a "chat + live preview" split-screen layout
**Confidence:** CONFIRMED
**Evidence:** Multiple comparison articles

All three AI app builders use the same fundamental pattern:
- Left panel: chat/prompt interface with the AI agent
- Right panel: live preview of the web application being built
- The preview updates in real-time as the AI generates code

This is the "agent + web preview" pattern that has become standard for visual AI development tools.

**Implications:** The split-screen pattern is proven and expected by users. Our ideal experience mimics this — editor preview alongside the coding agent. The question is whether the coding agents (Claude Code, Cursor, Codex) will adopt this layout for MCP-served content.

### Finding: MCP-UI is a community SDK for rendering MCP UI in React host apps
**Confidence:** CONFIRMED
**Evidence:** GitHub MCP-UI-Org/mcp-ui + mcpui.dev

The MCP-UI project provides React components (`UIResourceRenderer`, `HTMLResourceRenderer`) for host applications that want to render MCP App content. It handles iframe creation, postMessage bridging, and security policy enforcement.

**Implications:** If we ever build our own host, MCP-UI provides the client-side rendering layer. More practically, it validates that the ecosystem is building around MCP Apps as the UI standard.

### Finding: The "side-by-side" pattern varies by tool architecture
**Confidence:** CONFIRMED (synthesis)

| Tool | Best side-by-side approach | Mechanism |
|------|---------------------------|-----------|
| Cursor | Built-in browser panel (best native support) | Electron WebContentsView |
| Claude Code Desktop | MCP Apps iframe in conversation | Sandboxed iframe |
| Claude Cowork | MCP Apps iframe in conversation | Sandboxed iframe via Desktop |
| Codex app | None native; external browser window | N/A |
| VS Code | Extension webview panel or Simple Browser | Webview API |

**Implications:** No single mechanism works everywhere. MCP Apps covers the most clients. Cursor's built-in browser is the richest experience. Codex has no native option.

---

## Gaps / follow-ups

- MCP Apps iframe sizing constraints and resize behavior across clients
- Whether MCP Apps UI persists across conversation turns or resets
- Performance of complex React apps (our editor) running inside MCP App sandboxed iframes
- Future MCP Apps roadmap — will more clients adopt this?
