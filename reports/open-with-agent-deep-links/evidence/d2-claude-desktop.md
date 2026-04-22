# Evidence: D2 — Claude Desktop (unified Chat + Cowork + Code)

**Dimension:** Claude Desktop — launch surface (single unified app)
**Date:** 2026-04-21
**Sources:** code.claude.com, support.claude.com, claude.com, anthropics/claude-code GitHub issues, MacRumors, The New Stack

---

## Key files / pages referenced

- https://code.claude.com/docs/en/desktop — Use Claude Code Desktop (official docs)
- https://support.claude.com/en/articles/10065433-install-claude-desktop — install support article
- https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork — Cowork help article
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp — MCP connectors
- https://claude.com/product/cowork — Cowork product page
- https://github.com/anthropics/claude-code/issues/22691 — `claude://` fails in fullscreen (confirms scheme exists)
- https://github.com/anthropics/claude-code/issues/26197 — Windows `&` escaping in deep links (shows `claude://resume?session=X&cwd=Y`)
- https://github.com/anthropics/claude-code/issues/26952 — Claude Desktop filters outbound custom URL schemes
- https://github.com/anthropics/claude-code/issues/42773 — `/desktop` handoff transcript-not-found (shows storage path)
- https://github.com/anthropics/claude-code/issues/41899 — `/desktop` detection hardcoded to `/Applications/`
- https://github.com/anthropics/claude-code/issues/25075 — Windows `Claude.exe` PATH-shim hijacks `claude` CLI
- https://github.com/anthropics/claude-code/issues/41015 — URL Handler app hardcoded to `~/Applications/`
- https://github.com/anthropics/claude-code/issues/29145 — proposed `vscode://`-style URI handlers (closed)
- https://github.com/anthropics/claude-code/issues/19023 — prompt pre-fill URL param for Web (feature request, not shipped)
- https://www.macrumors.com/2026/04/15/anthropic-rebuilds-claude-code-desktop-app/ — 2026-04-15 rebuild announcement
- https://thenewstack.io/claude-code-desktop-redesign/ — redesign coverage
- https://github.com/aaddrick/claude-desktop-debian — community Linux repackage
- https://deepwiki.com/claude-code-best/claude-code/12.2-audio-modifiers-and-url-handler — confirms `url-handler-napi` stub

---

## Findings

### Finding: Claude Desktop is the unified app covering Chat + Cowork + Code (as of 2026-04-15)
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/desktop, https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork

> "The Code tab within the Claude Desktop app lets you use Claude Code through a graphical interface." — code.claude.com
> "Find Cowork in your desktop app, alongside Chat and Code" — support.claude.com/13345190

Icons-only sidebar switcher replaced the older modal top-switcher on 2026-04-14. There is **no separate Cowork binary.**

### Finding: `claude://` scheme IS registered on macOS and Windows
**Confidence:** CONFIRMED
**Evidence:** Issue #22691 ("macOS: claude:// protocol handler fails to activate in native full screen mode") directly confirms the scheme exists; Issue #26197 shows the exact URL shape

Documented paths (confirmed from issues + CLI `/desktop` command implementation):

```
claude://resume?session=<uuid>&cwd=<path>
claude://claude.ai/settings/connectors?...      # OAuth/connector callback
```

`claude://resume` is used by the Claude Code CLI's `/desktop` command to hand off a session to the Desktop app. The Desktop app then reads the transcript from `~/Library/Application Support/Claude/claude-code-sessions/<uuid>` (per Issue #42773).

**Bundle ID:** `com.anthropic.claude`.

### Finding: NO documented path accepts a free-form prompt via URL
**Confidence:** CONFIRMED (negative)
**Evidence:** Issues #19023 (feature request not shipped), #22691, #26197, #26952; deepwiki url-handler stub

Searched for: `claude://prompt=`, `claude://new`, `claude://chat`, `claude://open?dir=`, `claude://mcp/install`. **NONE documented.** The only two observed paths in the wild are:
1. `claude://resume?session=<uuid>&cwd=<path>` — requires a session transcript staged on disk ahead of time.
2. `claude://claude.ai/settings/connectors?...` — OAuth redirect, not useful for launch.

Issue #19023 ("URL-param prompt pre-fill") is specifically for **Claude Code on the Web**, explicitly not for Desktop, and is still open. Deepwiki confirms `url-handler-napi` is currently a stub.

**Implications:** There is no way to launch Claude Desktop via URL with a fresh prompt. An `openWithAgent` wrapper must either:
- Pre-stage a session transcript on disk at the Desktop's expected path then fire `claude://resume?session=...&cwd=...` (brittle; depends on internal paths and matched CLI/Desktop versions).
- Launch the app without a prompt and let the user type it.

### Finding: NO CLI launcher on macOS; Windows has `Claude.exe` shim that conflicts with CLI
**Confidence:** CONFIRMED
**Evidence:** Issue #25075, code.claude.com/docs/en/desktop

- **macOS:** No documented `claude` command for Desktop. Only `open -a "Claude"` (no prompt/dir param passthrough).
- **Windows:** Installer registers `Claude.exe` at `%LOCALAPPDATA%\Microsoft\WindowsApps\Claude.exe` which **hijacks** the `claude` command from npm-installed Claude Code CLI (per Issue #25075). `claude --version` launches the GUI, not a CLI version print.
- **Linux:** Not shipped officially. Unofficial repackage at aaddrick/claude-desktop-debian.

The `desktop.md` docs page explicitly states: "CLI flags like `--resume`, `--add-dir`, `--print`, `--output-format` have no Desktop equivalent."

### Finding: macOS + Windows only; no Linux
**Confidence:** CONFIRMED
**Evidence:** https://support.claude.com/en/articles/10065433-install-claude-desktop, https://code.claude.com/docs/en/desktop

- macOS: Universal binary, macOS 11+
- Windows: x64 + ARM64
- Linux: **Not supported officially.** Community repackage at github.com/aaddrick/claude-desktop-debian.

Quirk: Desktop does NOT inherit full shell env on macOS — only PATH and a fixed allowlist from `~/.zshrc`/`~/.bashrc`.

### Finding: Sign-in required + subscription gates the Code tab
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/desktop "403 or authentication errors"

- OAuth via claude.ai (browser-based).
- Paid plan (Pro, Max, Team, Enterprise) required for the **Code tab** specifically. Blank screen or 403 on Code tab = subscription missing.
- Computer use and Dispatch require Pro/Max.
- **No API-key auth mode for Desktop:** "Desktop does not call apiKeyHelper or read API key environment variables."

### Finding: MCP "Custom Connectors" are file-installed or remote HTTPS — no `claude://mcp/install` deep link
**Confidence:** CONFIRMED (negative)
**Evidence:** https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp

MCP servers are added via Settings → Connectors with an https URL (remote MCP on Anthropic's cloud) or via "Desktop Extensions" (packaged local MCP servers installed via file). **No deep-link install path** analogous to Cursor's `cursor://...mcp/install?config=<base64>`.

### Finding: Claude Desktop filters outbound click events to http/https only
**Confidence:** CONFIRMED
**Evidence:** Issue #26952

The Desktop app cannot open custom URL schemes received from MCP tool responses. This is outbound-direction (Claude → another app), not inbound, and does NOT affect our `openWithAgent` use case (we call OUT of our Electron, OS routes to Claude Desktop's inbound handler).

### Finding: Known bugs — Windows `&` escape, macOS fullscreen failure, `/Applications/` hardcode
**Confidence:** CONFIRMED
**Evidence:** Issues #26197, #22691, #41899, #41015

- **Windows (#26197):** `claude://resume?session=X&cwd=Y` gets `&` interpreted by cmd.exe as command separator. Use `shell.openExternal` (no shell interpolation) not `cmd /c start`.
- **macOS (#22691):** `claude://` handler fails to activate when the app is in native fullscreen mode.
- **Path hardcoding (#41899, #41015):** Desktop and URL Handler check `/Applications/Claude.app` — users with `~/Applications/Claude.app` get broken handoffs.

---

## Negative searches (NOT FOUND)

- Searched anthropic.com/engineering, anthropic.com/news, support.claude.com for "deep link" / "URL scheme" / "claude://" → only GitHub issues surface it; no official docs page documents the scheme for third-party use.
- Searched for `claude-desktop://`, `anthropic://` → NOT REGISTERED.
- Searched for Cowork-specific deep link (`claude://cowork/...`, `claude://dispatch/...`) → NOT FOUND.
- Searched for URL param to open a file or attach a document at launch → NOT FOUND.

---

## Gaps / follow-ups

- **UNCERTAIN:** Does `claude://resume?cwd=<path>` without a `session=` param open a fresh session at that cwd? No source confirms either way. Would need empirical test during `/spec` implementation.
- **Claude Desktop is pre-release / actively changing.** The 2026-04-15 rebuild is recent — docs and deep-link surface may expand. Recheck before v1 ship.
- **Product incentive note:** Anthropic's 2026-04-15 rebuild was product-marketing coverage (MacRumors, The New Stack). Not all claims are replicated in official docs — treat product-blog timing as secondary.
