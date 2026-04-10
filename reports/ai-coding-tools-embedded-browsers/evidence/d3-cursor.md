# Evidence: Cursor Embedded Browser & Webview Capabilities

**Dimension:** D3 — Cursor
**Date:** 2026-04-03
**Sources:** Cursor docs, Cursor blog, Cursor forum, VS Code API docs, community reports

---

## Key pages referenced

- https://cursor.com/blog/browser-visual-editor — Visual editor blog post
- https://cursor.com/docs/agent/tools/browser — Browser tool docs
- https://cursor.com/changelog/2-6 — MCP Apps release (Cursor 2.6)
- https://forum.cursor.com/t/webview-panels-and-commands-not-supported-in-cursor-breaks-extensions/115748 — Webview compatibility issues
- https://forum.cursor.com/t/webview-based-extensions-fail-to-render-in-the-bottom-panel-but-work-in-the-side-bar/145584 — Bottom panel rendering bug
- https://code.visualstudio.com/api/extension-guides/webview — VS Code Webview API
- https://forum.cursor.com/t/cursor-2-6-mcp-apps/153482 — MCP Apps in Cursor 2.6

---

## Findings

### Finding: Cursor has a built-in embedded browser (Electron Chromium WebContentsView)
**Confidence:** CONFIRMED
**Evidence:** Cursor docs + blog

Cursor's built-in browser shipped in beta in v1.7 and went GA in v2.0 (October 2025). It uses Electron's WebContentsView with the Electron version's Chromium (currently Chromium 142.0.7444.235 on Electron 39.2.7).

The browser runs as an in-editor panel or separate window. It can navigate to any URL — localhost or external. The agent can take screenshots, click, type, scroll, navigate, and monitor console/network.

**Implications:** Cursor's embedded browser CAN load arbitrary URLs. Our editor could be opened in the Cursor browser panel alongside the code editor. This is the strongest native "side-by-side" story of any tool investigated.

### Finding: Cursor supports VS Code webview extensions — our editor could be a webview panel extension
**Confidence:** CONFIRMED (with caveats)
**Evidence:** VS Code API docs + Cursor forum reports

Cursor inherits VS Code's webview API. Extensions can create WebviewPanel (editor area) or WebviewView (sidebar/panel). These can render arbitrary HTML/JS including loading external URLs via iframe with CSP configuration.

However, there are known compatibility issues:
- Webview panels in the bottom panel don't render correctly (December 2025 bug report)
- Some webview-based extensions report broken functionality in Cursor
- Cursor forum: "Webview Panels and Commands Not Supported in Cursor (Breaks Extensions)"

**Implications:** A VS Code/Cursor extension could embed our editor as a webview panel, but Cursor's webview support has known bugs. The sidebar position works better than the bottom panel. Testing required.

### Finding: Cursor 2.6 (March 2026) supports MCP Apps — interactive UI renders directly in agent chat
**Confidence:** CONFIRMED
**Evidence:** Cursor changelog 2.6 + Cursor forum

"MCP Apps let MCP servers return interactive HTML interfaces, like dashboards, charts, forms, and media viewers, that render right in your agent chat."

Launch partners: Amplitude (live charts), Figma (design specs), tldraw (whiteboards) rendered inline in agent chat.

**Implications:** MCP Apps is a pathway for our editor to render inside Cursor's agent chat as an interactive iframe. This is the same mechanism as Claude Desktop's MCP Apps but positioned within the Cursor chat panel, not the code editor area.

### Finding: Cursor has a visual editor overlay on top of its embedded browser
**Confidence:** CONFIRMED
**Evidence:** Cursor blog + v2.2 release

The visual editor (Cursor 2.2, December 2025) adds a DOM inspection overlay with CSS property sidebar on top of the embedded browser. It allows click-select, drag-reposition, and style editing.

**Implications:** The embedded browser is already used for more than just preview — it's an active workspace. Loading our editor there would be a natural extension of this pattern.

---

## Summary of embedding pathways in Cursor

| Pathway | Feasibility | Experience |
|---------|-------------|------------|
| Built-in browser panel (navigate to URL) | High | Side-by-side with code editor |
| VS Code webview extension | Medium (bugs) | Sidebar panel or editor tab |
| MCP Apps (inline in agent chat) | High | Interactive iframe in chat stream |
| Simple Browser command | High | Editor tab |

---

## Gaps / follow-ups

- Whether Cursor's built-in browser can be opened programmatically via extension API
- MCP Apps iframe sizing/persistence in Cursor specifically
- Whether Cursor plans to improve webview extension compatibility
