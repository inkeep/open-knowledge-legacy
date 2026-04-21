# Evidence: D3 — Claude Code CLI

**Dimension:** Claude Code CLI — the terminal `claude` CLI (distinct from Claude Desktop app)
**Date:** 2026-04-21
**Sources:** code.claude.com/docs, npmjs.com, github.com/anthropics/claude-code

---

## Key files / pages referenced

- https://code.claude.com/docs/en/cli-reference — authoritative CLI flag reference
- https://code.claude.com/docs/en/setup — install + platform matrix
- https://code.claude.com/docs/en/authentication — OAuth flow, Keychain storage
- https://code.claude.com/docs/en/vs-code — VS Code extension `vscode://anthropic.claude-code/open`
- https://code.claude.com/docs/en/jetbrains — JetBrains plugin
- https://www.npmjs.com/package/@anthropic-ai/claude-code — npm package
- https://github.com/anthropics/claude-code/issues/26952 — clarifies `claude://` is for Desktop, not CLI launch
- https://github.com/anthropics/claude-code/issues/26197 — Windows `&` escape bug

---

## Findings

### Finding: Binary is `claude`; install via multiple channels, native installers preferred
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/setup

Recommended install methods (preference order):
1. Native installer (auto-updates in background):
   - macOS/Linux: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows PowerShell: `irm https://claude.ai/install.ps1 | iex`
   - Windows CMD: `curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd`
2. Homebrew (stable channel, ~1 week behind): `brew install --cask claude-code`
3. WinGet (Windows): `winget install Anthropic.ClaudeCode`
4. npm (legacy, Node.js 18+): `npm install -g @anthropic-ai/claude-code`

### Finding: No `--cwd` / `--dir` flag — canonical pattern is `cd <dir> && claude`
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/cli-reference (no `--cwd` in flag table; positional arg is `"query"` seed prompt)

| Pattern | Behavior |
|---|---|
| `cd <dir> && claude` | **Canonical.** Interactive session rooted at CWD. Auto-detects `CLAUDE.md`, `.mcp.json`, `.claude/settings.json` in tree. |
| `claude` (from any dir) | Uses shell CWD. |
| `claude <dir>` | **Does NOT exist as a "set directory" arg.** A positional is interpreted as a seed prompt for interactive mode. |
| `claude --worktree <name>` | Creates `.claude/worktrees/<name>` and spawns there. Useful for parallel sessions. |

**Electron implication:** Spawn with `{ cwd: dir }` set on the child process, OR spawn a terminal that `cd`s first.

### Finding: Two prompt-at-launch modes — interactive seed vs. print/headless
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/cli-reference

| Mode | Command | Behavior |
|---|---|---|
| Interactive with seed | `claude "fix failing tests"` | Opens TUI session pre-seeded with the prompt. User continues after Claude responds. |
| Print (one-shot) | `claude -p "query"` | Executes query, streams output, exits. No session persistence by default. Supports `--output-format json` for structured parsing. |

**System prompt:** Print mode supports `--system-prompt "text"` and `--system-prompt-file <path>`. Interactive does NOT take those flags — use `CLAUDE.md` or `~/.claude/settings.json` instead.

**Piped input:** `cat file | claude -p "analyze this"` — stdin merges with prompt.

**Implications for `openWithAgent`:**
- For "chat with Claude in a terminal" button → interactive with seed: `spawn_terminal; cd <dir>; claude "<prompt>"`.
- For "ask Claude a one-shot question" button → print mode: `spawn("claude", ["-p", prompt], { cwd: dir })` — no terminal needed.

### Finding: Claude Code is a TUI and requires a terminal context when launched from Electron
**Confidence:** CONFIRMED (behavior), MEDIUM (best-spawn-pattern)
**Evidence:** Docs describe interactive as TUI; terminal-spawn patterns are community consensus

Cross-platform terminal-spawn:

| Platform | Pattern |
|---|---|
| macOS | Write a `.command` script containing `cd <dir> && claude "<prompt>"`, chmod +x, then `open <script>` (user's default terminal). Alternative: `osascript` tell Terminal/iTerm2. |
| Windows | `wt.exe` (Windows Terminal): `wt -d "<dir>" powershell -NoExit -Command "claude '<prompt>'"`. Fallback: `cmd /c start cmd /k "cd /d <dir> && claude"`. |
| Linux | `xdg-terminal -- bash -c "cd <dir> && claude '<prompt>'"` (fragmented — may need per-DE fallbacks). |

**No official Anthropic doc specifies "how to spawn Claude Code from Electron."** The docs recommend the `vscode://anthropic.claude-code/open` route for GUI integrations (see below).

### Finding: No CLI-launch URL scheme; `claude://` is Desktop-only (CLI handoff direction)
**Confidence:** CONFIRMED
**Evidence:** Issue #26952

The `claude://` scheme belongs to Claude Desktop. It is invoked BY the CLI's `/desktop` command to hand a session TO Desktop. It does NOT work the other way (URL → spawn CLI in terminal).

`claude:///?prompt=...` style URLs are not parsed by the CLI.

### Finding: VS Code extension registers `vscode://anthropic.claude-code/open` with optional `?prompt=` and `?session=`
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/vs-code

Extension ID: `anthropic.claude-code` on VS Code Marketplace. Registered URI:

```
vscode://anthropic.claude-code/open[?prompt=<encoded>][&session=<id>]
```

Opens a Claude Code chat tab inside VS Code. This is a **GUI chat panel, not the TUI CLI** — a different UX target.

**Implications:** If the user has VS Code installed with the extension, this is a much cleaner "Open with Claude Code" path than spawning a terminal. An `openWithAgent` wrapper could detect VS Code + extension presence and prefer this route.

### Finding: JetBrains plugin wraps the CLI; quick-launch Cmd+Esc / Ctrl+Esc
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/jetbrains

JetBrains plugin (CLion, IntelliJ, PyCharm, etc.) — install from JetBrains Marketplace; quick-launch via `Cmd+Esc` (Mac) or `Ctrl+Esc` (Win/Linux). Wraps CLI, adds IDE context (selection, interactive diffs). No external URL scheme documented.

### Finding: First-run OAuth flow opens browser; tokens in macOS Keychain / Linux ~/.claude/.credentials.json
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/authentication

1. User runs `claude` (or `claude -p "query"`).
2. CLI starts a local HTTP server on a random port, opens default browser to console.anthropic.com OAuth page.
3. User grants permission. Browser redirects to `localhost:<port>/?code=<code>`.
4. CLI exchanges for access + refresh tokens.
5. Tokens stored: macOS → Keychain (service `claude-code`); Linux → `~/.claude/.credentials.json`.

Required account types:
- Claude Pro, Max, Team, or Enterprise subscription, OR
- Anthropic Console account (API-key billing), OR
- Third-party provider (Bedrock, Vertex AI, Foundry) with `ANTHROPIC_API_KEY` set.

**Implication:** First run from Electron will open a browser window. `claude setup-token` generates a long-lived OAuth token for unattended/CI use.

### Finding: Platform matrix — macOS 13+, Windows 10 (1809+) native or WSL2, Linux Ubuntu/Debian/Alpine
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/setup

| OS | Version | Notes |
|---|---|---|
| macOS | 13.0+ | ARM64 + x64; signed + notarized |
| Windows | 10 (1809+) or Server 2019+ | Native needs Git for Windows. WSL 2 recommended for sandboxing. |
| Linux | Ubuntu 20.04+, Debian 10+, Alpine 3.19+ | x64 + ARM64; Alpine needs libgcc/libstdc++/ripgrep |

Hardware: 4GB RAM. Network: must reach Anthropic + `console.anthropic.com`. Supports `HTTPS_PROXY`.

Windows quirks:
- Native Windows has no sandboxing (WSL2 does).
- `&` in URL params interpreted by cmd.exe as command separator (Issue #26197) — use PowerShell, `shell.openExternal`, or URL-quoted invocation.

---

## Negative searches (NOT FOUND)

- Searched for `claude --cwd`, `claude --dir`, `claude --workspace` as flags → NOT FOUND in CLI reference.
- Searched for URL scheme that launches the CLI → NOT FOUND. Confirmed `claude://` is Desktop-only (Issue #26952).
- Searched for a way to seed `--system-prompt` in interactive mode → NOT FOUND. Print mode only.

---

## Gaps / follow-ups

- **Best terminal-spawn pattern for cross-platform:** No known stable npm package. Prevailing approach is hand-rolled per-platform plus VS Code extension integration detection.
- **VS Code + extension detection heuristic** — for users who have VS Code installed, the `vscode://anthropic.claude-code/open` route is much cleaner. An `openWithAgent` wrapper should probe for VS Code's presence and prefer this route. Empirical test needed: does `shell.openExternal("vscode://anthropic.claude-code/open?prompt=...")` work without the user first opening VS Code?
- **`claude setup-token` flow for Electron** — long-lived OAuth for unattended Electron use. Worth investigating as a first-run UX for `openWithAgent` if "first click opens browser" is bad UX.
