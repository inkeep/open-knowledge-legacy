# Evidence: Claude Code Desktop Architecture & Browser Capabilities

**Dimension:** D2 — Claude Code Desktop App
**Date:** 2026-04-03
**Sources:** code.claude.com official docs, Anthropic blog, HN discussions, Latent Space podcast

---

## Key pages referenced

- https://code.claude.com/docs/en/desktop — Official Claude Code Desktop docs
- https://www.dbreunig.com/2026/02/21/why-is-claude-an-electron-app.html — Architecture discussion
- https://www.latent.space/p/felix-anthropic — Felix Rieseberg interview
- https://www.windowslatest.com/2024/11/02/claude-ai-windows-11-10-app-is-electron-chromium-wrapper/ — Windows architecture analysis
- https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/ — MCP Apps announcement
- https://github.com/anthropics/claude-code/issues/26648 — Electron migration discussion

---

## Findings

### Finding: Claude Desktop is an Electron app that renders claude.ai in a Chromium container
**Confidence:** CONFIRMED
**Evidence:** Multiple sources confirm

Dbreunig.com: "Claude Desktop loads https://claude.ai/ in an Electron Chromium container." Engineers on the team previously worked on Electron. Felix Rieseberg is a former Electron core maintainer and Slack desktop app builder.

Rationale: "a nice way to share code so features across web and desktop have the same look and feel."

**Implications:** As an Electron app, Claude Desktop has full Chromium capabilities — webviews, iframes, BrowserView, and WebContentsView are all technically available. The question is what Anthropic exposes in their UI.

### Finding: Claude Code Desktop has an embedded browser preview panel
**Confidence:** CONFIRMED
**Evidence:** Official docs at code.claude.com/docs/en/desktop

Direct quote: "Claude can start a dev server and open an embedded browser to verify its changes." The preview panel supports:
- Interactive browsing of running apps
- Screenshots, DOM inspection, clicking, form filling
- Cookie/local storage persistence across server restarts
- Auto-verify mode (enabled by default)

Configuration via `.claude/launch.json` pointing to localhost dev servers.

**Implications:** The embedded browser exists and works. However, it is scoped to localhost dev servers, not arbitrary external URLs. It is designed for verifying code changes, not for browsing the web.

### Finding: The Preview MCP is scoped to localhost dev servers only — it cannot load arbitrary web URLs
**Confidence:** CONFIRMED
**Evidence:** Official docs + prior research (coding-agents-visual-editing-convergence report, evidence/claude-code-frontend.md)

The preview MCP tools (preview_start, preview_screenshot, preview_snapshot, preview_inspect) are tied to dev server configurations in `.claude/launch.json`. There is no mechanism to point the preview panel at an arbitrary external URL.

**Implications:** Our editor cannot be loaded directly in the preview panel unless it runs as a localhost dev server. If our editor has a `dev` mode that serves on localhost, it could potentially be configured as a preview server — but this is a workaround, not a designed use case.

### Finding: Claude Code Desktop supports MCP Apps for rendering interactive UI in conversations
**Confidence:** CONFIRMED
**Evidence:** MCP Apps spec: "MCP Apps are currently supported by... Claude Desktop"

MCP Apps renders interactive HTML in sandboxed iframes within the conversation.

**Implications:** The primary pathway for embedding our editor in Claude Code Desktop is via MCP Apps — our MCP server declares a UI resource (the editor) that renders as an interactive iframe in the conversation.

### Finding: Claude Code Desktop supports three browser mechanisms (Preview MCP, Chrome Extension, Computer Use)
**Confidence:** CONFIRMED
**Evidence:** Official docs at code.claude.com/docs/en/desktop

| Mechanism | Scope | Can load external URLs? |
|-----------|-------|------------------------|
| Preview MCP | Localhost dev servers only | No |
| Chrome Extension (--chrome) | Any website in user's Chrome | Yes (separate window) |
| Computer Use API | Full desktop | Yes (native app interaction) |

**Implications:** Chrome Extension can navigate to our editor URL but in the user's Chrome browser — not embedded in the Claude Desktop window. Computer Use can interact with any app but via screenshot+click — very low fidelity.

---

## Gaps / follow-ups

- Can `.claude/launch.json` be configured to proxy to an external URL?
- MCP Apps iframe sizing and persistence behavior in Claude Desktop specifically
- Whether Anthropic plans to expand the preview panel to support external URLs
