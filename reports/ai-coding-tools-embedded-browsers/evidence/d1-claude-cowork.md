# Evidence: Claude Cowork Architecture & Browser Capabilities

**Dimension:** D1 — Claude Cowork
**Date:** 2026-04-03
**Sources:** Anthropic Help Center, Latent Space podcast, VentureBeat, Pluto Security, support.claude.com, GitHub issues

---

## Key pages referenced

- https://support.claude.com/en/articles/13345190-get-started-with-cowork — Official getting started guide
- https://www.latent.space/p/felix-anthropic — Felix Rieseberg podcast on Cowork architecture
- https://venturebeat.com/technology/anthropic-launches-cowork-a-claude-desktop-agent-that-works-in-your-files-no — Launch coverage
- https://claude.com/product/cowork — Product page
- https://support.claude.com/en/articles/14128542-let-claude-use-your-computer — Computer use in Cowork
- https://blog.pluto.security/p/inside-claude-cowork-how-anthropics — Architecture analysis
- https://github.com/anthropics/claude-code/issues/38783 — Browser automation tools bug report

---

## Findings

### Finding: Cowork runs Claude Code inside a lightweight Linux VM on the user's local machine
**Confidence:** CONFIRMED
**Evidence:** Anthropic Help Center + Latent Space podcast

Felix Rieseberg (Latent Space, March 2026): "we currently run like a lightweight VM and we put Claude Code into the VM" — using Apple's Virtualization framework (VZVirtualMachine) on macOS. The VM boots a custom Linux root filesystem. Network access is controlled. Users share a specific folder.

**Implications:** Cowork is NOT a web app and NOT a standalone desktop GUI with arbitrary embedding capabilities. It is a VM-based execution environment that runs inside the Claude Desktop Electron app.

### Finding: Cowork does NOT have an embedded browser inside the VM — browser integration happens through Chrome on the host
**Confidence:** CONFIRMED
**Evidence:** Anthropic support docs + Latent Space podcast

From support.claude.com: "computer use runs outside the virtual machine that Cowork normally uses for working on your files and running commands, meaning Claude is interacting with your actual desktop and apps, rather than an isolated sandbox."

Felix Rieseberg confirmed the Chrome integration uses the host machine's Chrome browser via MCP, not a browser inside the VM.

**Implications:** There is no webview panel inside Cowork where our editor could render. Cowork's browser access is to the user's existing Chrome — it can navigate to URLs but not embed them in a panel.

### Finding: Cowork is a "mode" inside the Claude Desktop Electron app, not a separate product
**Confidence:** CONFIRMED
**Evidence:** Anthropic docs: "Claude Cowork, the tasks mode inside the Claude Desktop app"

Cowork shares the Claude Desktop app's UI. It launched January 2026. It uses the same agentic architecture as Claude Code but accessible without the terminal.

**Implications:** Cowork's UI capabilities are the Claude Desktop app's UI capabilities. Any embedded browser in Claude Desktop is available to Cowork.

### Finding: Cowork supports MCP servers including browser automation tools
**Confidence:** CONFIRMED
**Evidence:** Anthropic docs: Cowork sessions have access to browser automation tools (navigate, read_page, click, type, screenshot, find, javascript_tool, tabs_context_mcp)

MCP servers configured in Claude Desktop are available in Cowork sessions. These include browser MCPs that control the host's Chrome.

**Implications:** An MCP server that provides tools for editing knowledge is fully compatible with Cowork. However, rendering our editor UI inside Cowork's conversation window would require MCP Apps support.

### Finding: Claude Desktop (which hosts Cowork) supports MCP Apps
**Confidence:** CONFIRMED
**Evidence:** MCP Apps official docs: "MCP Apps are currently supported by Claude, Claude Desktop..."

MCP Apps renders interactive HTML interfaces in sandboxed iframes within the conversation window.

**Implications:** This is the pathway for rendering our editor inside Cowork — as an MCP App that renders in the conversation stream. The editor would appear as an interactive iframe within the chat, not as a separate panel.

---

## Gaps / follow-ups

- Size constraints on MCP App iframes in Claude Desktop — can they be full-width, resizable, persistent?
- Whether MCP App UIs persist across messages or are ephemeral per tool call
- Performance characteristics of complex web apps in MCP App iframes
