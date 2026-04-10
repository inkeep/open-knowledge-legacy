# Evidence: OpenAI Codex macOS App Architecture & Browser Capabilities

**Dimension:** D4 — Codex macOS App
**Date:** 2026-04-03
**Sources:** OpenAI developer docs, Simon Willison review, GitHub issues, community analysis

---

## Key pages referenced

- https://openai.com/index/introducing-the-codex-app/ — Official announcement
- https://developers.openai.com/codex/app — App documentation
- https://developers.openai.com/codex/app/features — Features reference
- https://simonwillison.net/2026/Feb/2/introducing-the-codex-app/ — Simon Willison review
- https://developers.openai.com/codex/mcp — MCP support docs
- https://github.com/openai/codex/issues/14745 — VS Code webview ServiceWorker bug
- https://github.com/openai/codex/issues/2923 — Chat pane loading failure

---

## Findings

### Finding: Codex app is an Electron app with a three-layer architecture
**Confidence:** CONFIRMED
**Evidence:** Simon Willison review + architecture analysis

Architecture: Renderer (Chromium Webview) → Main Process (Node.js) → Rust CLI (codex binary). Has a 70-method IPC API surface, transparent auth proxy, git-native workspace model, and built-in automation/cron system coordinated across three process layers.

Uses SQLite for automation state. Launched February 2, 2026 for macOS Apple Silicon. Windows support added March 4, 2026.

**Implications:** As an Electron app, Codex has Chromium available for webviews. However, whether they expose a browser panel is a separate question.

### Finding: Codex app does NOT have an embedded browser or web preview panel
**Confidence:** CONFIRMED
**Evidence:** Official features docs + developer docs

The app includes: project sidebar, thread composer, Git diff pane, integrated terminal, inbox for automation findings, floating pop-out window. No embedded browser, no web preview, no webview panel is documented or visible.

The features docs state Codex can "read the current terminal output, so it can check the status of a running development server" — terminal-based awareness only.

**Implications:** Our editor cannot be embedded inside the Codex app. There is no browser panel, no preview panel, and no mechanism to render web content within the Codex UI.

### Finding: Codex supports MCP servers but MCP Apps support status is unclear
**Confidence:** UNCERTAIN
**Evidence:** Codex MCP docs + MCP Apps spec

Codex MCP docs confirm MCP server support across CLI, IDE extension, and app. However, the MCP Apps client list mentions "ChatGPT" and "VS Code GitHub Copilot" but does NOT explicitly list the Codex app.

ChatGPT and Codex share infrastructure, so MCP Apps support may be inherited. But no Codex-specific confirmation exists.

**Implications:** If Codex gets MCP Apps support (likely given ChatGPT has it), our editor could render as an interactive iframe within Codex threads. This is speculative as of April 2026.

### Finding: Codex supports browser interaction only through external MCP servers
**Confidence:** CONFIRMED
**Evidence:** Codex MCP docs + Composio integration guide

Browser capabilities come from adding MCP servers like Chrome DevTools MCP or Browser Tool MCP. These control an external browser — they do not render content inside the Codex app UI.

**Implications:** The only web-related workflow is Codex controlling a separate browser window. No embedded rendering.

---

## Gaps / follow-ups

- Whether Codex app will add MCP Apps support (ChatGPT has it, Codex may inherit)
- Whether Codex plans a preview/browser panel in future releases
- Codex Web (chatgpt.com/codex) may have different capabilities than the desktop app
