---
title: "Open-With-Agent Deep-Link & CLI Capability Matrix"
description: "Capability matrix for an `openWithAgent(agentName, dir, prompt)` wrapper across 10 agents (Cursor, Claude Desktop, Claude Code CLI, OpenAI Codex CLI, Windsurf, Aider, GitHub Copilot CLI, Cline, Continue, OpenHands) plus the web-URL Open-in-Claude pattern (claude.ai/new?q=, Mintlify contextual menu). Covers URL schemes, CLI flags, platform support, security surface, and cross-platform launch mechanics from an Electron host. Informs the forthcoming /spec for an Open With ⌄ dropdown."
createdAt: 2026-04-21
updatedAt: 2026-04-21
subjects:
  - Cursor
  - Claude Desktop
  - Claude Code
  - OpenAI Codex
  - Windsurf
  - Aider
  - GitHub Copilot CLI
  - Cline
  - Continue
  - OpenHands
  - Mintlify
  - Inkeep
  - Electron
  - shell.openExternal
topics:
  - URL scheme handlers
  - CLI launch
  - cross-platform shell-out
  - deeplink security
  - web URL prompt-pass
  - docs-site contextual menu
  - agent integration
---

# Open-With-Agent Deep-Link & CLI Capability Matrix

> **AUTHORITATIVE POINTER (added 2026-04-21 post-rebase):** PR #255 merged [`reports/deep-linking-ai-desktop-apps-2026/`](../deep-linking-ai-desktop-apps-2026/REPORT.md) to `main` with deeper, live-tested 2026-04-21 findings that **supersede several claims in this report**. Most notably: **Claude Desktop DOES have atomic single-URL prompt+folder+file handoff** via sibling host routes `claude://cowork/new?q=&folder=&file=` and `claude://code/new?q=&folder=&file=` — this report's pass-1 claim that "Claude Desktop has no public prompt-pass path" was wrong; the `/cowork/*` + `/code/*` routes are peers to `/claude.ai/*` and were missed by the initial bundle probe. Also: Cursor's `text=` param decodes TWICE with error recovery (implying double-encoding on the emitter side); Codex has `codex://new?prompt=&path=&originUrl=` with git-origin resolution against known local clones; `open -a Claude.app /path` routes to the Cowork tab via the `CjA` IPC handler. When in doubt, trust the PR #255 report. This report's value is its agent breadth (includes Aider/Windsurf/Copilot/Cline/Continue/OpenHands) and its `claude-cli://` CLI-scheme coverage (F5), which PR #255 intentionally scoped out. The downstream spec (`stories/open-in-agent-desktop/STORY.md`) threads from PR #255's report.

**Purpose.** Inform the forthcoming `/spec` for an "Open with ⌄" dropdown in the Open Knowledge editor. The wrapper shape is `openWithAgent(agentName: string, dir: URL, prompt: string)`. This report maps what each target agent can actually honor — and what the graceful-degradation contract looks like when prompt or dir can't be delivered atomically.

---

> **UPDATE 2026-04-21 (same day, user-requested follow-up):** Second and third passes added (a) a **new dimension** for the `claude.ai/new?q=` **web-URL prompt-pass pattern** used by Inkeep/Mintlify docs sites — missed in initial pass and arguably the simplest universal launch vector; (b) empirical verification of 6 UNCERTAIN items including a **material behavior change** in Codex's stdin handling (PR #15917, v0.122.0); (c) broader capability matrix across Windsurf, Aider, GitHub Copilot CLI, Cline, Continue, OpenHands; (d) **F5 material correction:** Claude Code CLI DOES register its own `claude-cli://open?q=<encoded>` prompt-bearing URL scheme — missed in pass 1 + 2 because it's documented under the `disableDeepLinkRegistration` setting, not in the CLI reference or any Deep Links page. See [§ Follow-up Findings (2026-04-21)](#follow-up-findings-2026-04-21) for the delta. The sections below are the original pass; corrigendum breadcrumbs flag points that the follow-up revised.

## Executive Summary

**Every agent has a way in, but they're not symmetric.** There is no agent we cannot launch; there is no agent we can launch with prompt+dir in a single atomic call on all three OSes. Any `openWithAgent` wrapper must accept that the *contract* is "best-effort handoff with documented degradation," not "uniform prompt+dir delivery."

The asymmetry is structural, not a spec-process artifact:

1. **Cursor is the only target with a documented third-party URL contract for prompt pre-fill.** `cursor://anysphere.cursor-deeplink/prompt?text=<encoded>` pre-fills chat (8,000-char cap); the user must confirm — Cursor declined an auto-execute variant on security grounds. Separately, `cursor <dir>` (VS Code-shim CLI) opens folders. The canonical shape for "prompt + dir" is a **two-step**: spawn `cursor <dir>`, then `shell.openExternal("cursor://...prompt?text=...")`.
2. **Claude Desktop (unified Chat + Cowork + Code) registers `claude://` but has no public prompt-pass path.** Only two observed paths: `claude://resume?session=<uuid>&cwd=<path>` (requires a session transcript pre-staged on disk by the CLI's `/desktop` handoff), and an OAuth callback. Fresh-prompt delivery via URL is **not supported**. Best wrapper behavior: `open -a "Claude"` / `start Claude.exe` with no prompt; user types it. Prompts-via-URL is a feature request (Issue #19023) for Claude Code on the Web, not Desktop.
3. **Claude Code CLI and Codex CLI are TUIs.** Both require a terminal context when spawned from Electron. Both accept a seed prompt as a positional argv. Both have a non-interactive escape hatch (`claude -p` / `codex exec`) that can be `spawn()`'d headlessly without a terminal — streams stdout, suitable for an Electron panel. Neither CLI registers a URL scheme of its own.<br>_[Corrected 2026-04-21 F5: Claude Code CLI DOES register `claude-cli://open?<params>` on startup (controllable via `disableDeepLinkRegistration`). Source-verified in `@anthropic-ai/claude-code@2.1.104` `cli.js` — parser accepts exactly three params: **`q`** (prompt, ≤5K chars, `%0A` for newlines), **`cwd`** (absolute path, ≤4K chars), and **`repo`** (`owner/repo` form, undocumented fallback). This makes Claude Code CLI a FULLY-HONORED single-call primitive: `openExternal("claude-cli://open?cwd=<abs>&q=<enc>")`. Codex CLI still has no URL scheme. Authoritative source-code walkthrough in [F5 evidence](evidence/f5-claude-cli-scheme-correction.md) + § Follow-up Findings F5.]_ Directory handling differs: Claude Code has no `--cwd` flag on the CLI itself (spawn with `{ cwd: dir }` or `cd dir &&`) — but `claude-cli://` does accept `cwd`; Codex has `-C/--cd <dir>` but refuses non-git-repo dirs without `--skip-git-repo-check`.
4. **Registering our own outbound scheme is NOT required.** The user's intuition is confirmed — `shell.openExternal("cursor://...")` invokes the OS default-handler machinery; our Electron app does nothing scheme-specific. The existing `shell-allowlist.ts` controls which *outbound* schemes our app is willing to dispatch to, and would need `cursor:`, `claude:`, `vscode:` added before an `openWithAgent` wrapper can fire them. The `openknowledge:` entry (inbound handler, deferred to desktop M4) is unrelated to this feature.
5. **Security surface is non-trivial.** Two 2025 Cursor CVEs (CVE-2025-54133, CVE-2025-54136 — the "CursorJack" class) demonstrate that target-app URL parsers are the real trust boundary. Windows ShellExecute caps URLs at 2,081 chars; macOS LaunchServices is undocumented but practically ~2,000; Cursor self-limits `cursor://` to 8,000. For long prompts, a file/stdin transport outperforms URL-based handoff.

**Key findings (decision-ready):**

- **Unified minimal wrapper is feasible,** but it's `{ kind: 'gui-scheme' | 'gui-no-scheme' | 'cli-tui' | 'cli-headless', handler: ... }` internally, not a single dispatch primitive. See §4 for the per-agent matrix.
- **v1 shipping set is defensible as {Cursor, Claude Code CLI, Codex CLI}.** Cursor has the richest deep-link surface. The two CLIs cover terminal-inclined users symmetrically. Claude Desktop is shippable as "open app, no prompt" but offers little value-add beyond `open -a "Claude"`. `/spec` decides.
- **Platform coverage.** Cursor + Claude Code CLI + Codex CLI: macOS, Windows (w/ quirks), Linux. Claude Desktop: **macOS + Windows only, no Linux** — a hard v1 policy choice if Linux support matters.
- **Security additions required before ship.** Add `cursor:`, `claude:`, `claude-cli:`, `vscode:` to `packages/desktop/src/main/shell-allowlist.ts`. Without this, `checkOutboundUrl` returns `{ ok: false, reason: "scheme-not-allowed: cursor:" }` and every invocation fails closed — blocker, not polish.<br>_[Corrected 2026-04-21 F5: `claude-cli:` added — it's a distinct scheme from `claude:` (the Desktop scheme). Both need allowlist entries.]_

---

## Research Rubric

Confirmed with user on 2026-04-21 after one iteration (merged D2+D3 into unified "Claude Desktop" dimension; D6 scoped to outbound-only).

| # | Dimension | Priority | Depth |
|---|---|---|---|
| D1 | Cursor — URL scheme + CLI | P0 | Deep |
| D2 | Claude Desktop (Chat + Cowork + Code unified) | P0 | Deep |
| D3 | Claude Code CLI | P0 | Deep |
| D4 | OpenAI Codex CLI | P0 | Deep |
| D5 | Calling external protocol handlers from Electron | P1 | Moderate |
| D6 | Cross-platform launch mechanics | P1 | Moderate |
| D7 | Security & encoding | P1 | Moderate |
| D8 | Capability matrix synthesis | P0 | Moderate |

**Stance.** Factual + decision-ready. This report presents the matrix; the `/spec` picks v1 agents.
**Framing.** 3P/external. First-party `shell-allowlist.ts` cross-referenced only where it intersects D5.
**Non-goals.** UI/UX design of the dropdown, empirical launch tests on live machines, agents beyond the named five (Windsurf / Aider / Copilot CLI out of scope unless trivial adjacency).

---

## Detailed Findings

### D1 — Cursor

**Finding.** Cursor is the only target with a documented third-party deeplink surface that accepts a prompt. Two CLIs ship under the "cursor" brand — `cursor` (editor-launch, VS Code-compatible) and `agent` (headless TUI, requires paid subscription). The documented URL shape:

```
cursor://anysphere.cursor-deeplink/prompt?text=<url-encoded>   # pre-fills chat; user confirms
cursor://anysphere.cursor-deeplink/command?name=<n>&text=<t>   # adds .cursor/commands
cursor://anysphere.cursor-deeplink/rule?name=<n>&text=<t>      # adds .cursor/rules
cursor://anysphere.cursor-deeplink/mcp/install?name=<n>&config=<b64>
```

Cap: 8,000 chars post-encode. Cursor **explicitly declined** an auto-execute prompt URL (forum.cursor.com/t/108832) — user-confirm is a design decision. `cursor://file/<path>` works but is undocumented (inherited from VS Code); whether it accepts a folder path is UNCERTAIN.

**Evidence.** [evidence/d1-cursor.md](evidence/d1-cursor.md)

**Implications for `openWithAgent`.**
- **"Open in Cursor + prompt" is a two-step ceremony:** `cursor <dir>` (CLI) opens the folder; `shell.openExternal("cursor://anysphere.cursor-deeplink/prompt?text=<encoded>")` pre-fills the chat. User must then confirm in Cursor's own dialog. This is the cleanest prompt-bearing agent handoff of any of the five.
- **The `agent` headless CLI** is a second path that accepts prompts in a single call: `agent --workspace <dir> -p "<prompt>"`. But it requires a paid subscription and a terminal wrapper (TUI). Good for "headless ask" flows; bad for "open and chat" flows that expect the IDE.

**Decision triggers.**
- If `/spec` wants "one click → prompt in Cursor's chat" UX: ship the two-step via scheme.
- If `/spec` wants "one click → headless one-shot answer": ship the `agent` CLI path (but gate on subscription detection — the free-tier user will get an error).

**Remaining uncertainty.**
- Does `cursor://file/<dir-path>` open a folder or only accept files? VS Code restricts it to files. Verify empirically during implementation.
- WSL regression 3.1.15 (duplicate windows on deep-link) — track for resolution before Windows ship.

---

### D2 — Claude Desktop (unified Chat + Cowork + Code)

**Finding.** Claude Desktop is the **single unified app** covering Chat, Cowork, and Code as sidebar tabs (icons-only switcher, as of 2026-04-14 redesign). No separate Cowork binary. `claude://` is registered on macOS + Windows (not Linux — no Linux build), but the observable surface is narrow:

```
claude://resume?session=<uuid>&cwd=<path>         # CLI /desktop handoff only
claude://claude.ai/settings/connectors?...        # OAuth callback
```

There is **no documented path that accepts a free-form prompt.** Issue #19023 requests this for *Claude Code on the Web*, not Desktop, and is not shipped. `url-handler-napi` is confirmed a stub (per DeepWiki). macOS has no `claude` command that accepts a prompt/dir; Windows has a `Claude.exe` PATH shim that *hijacks* the `claude` CLI (Issue #25075) but also doesn't accept prompt flags.

**Evidence.** [evidence/d2-claude-desktop.md](evidence/d2-claude-desktop.md)

**Implications for `openWithAgent`.**
- **Best wrapper shape: "open app, no prompt delivery."** `spawn("open", ["-a", "Claude"])` (macOS) or spawn the Windows exe. User types the prompt inside Claude Desktop.
- **The `/desktop` handoff path is not composable** — it requires the Claude Code CLI to have first staged a session transcript on disk at `~/Library/Application Support/Claude/claude-code-sessions/<uuid>`. Not a general "open with Claude Desktop" primitive.
- **MCP is not a deep-link vector.** Unlike Cursor's `cursor://...mcp/install?config=<base64>`, Claude Desktop's MCP "Custom Connectors" are installed via Settings UI (URL or file), not via a `claude://mcp/install` deep link.

**Decision triggers.**
- If `/spec` needs prompt delivery to Claude Desktop: blocked at the API level. Pre-staging a transcript file on disk is brittle (version-dependent paths, matched CLI/Desktop versions).
- If `/spec` is OK with "open app, user types prompt": shippable, but offers marginal value-add over the user manually switching apps.
- If `/spec` needs Linux coverage: **Claude Desktop is out** — no official Linux build.

**Remaining uncertainty.**
- Does `claude://resume?cwd=<path>` (without `session=`) open a fresh session at that cwd? NOT DOCUMENTED either way.
- Active redesign (2026-04-15) means the surface may expand. Recheck before v1 ship.

---

### D3 — Claude Code CLI (terminal `claude`)

**Finding.** Binary `claude` installed via native installer / Homebrew / WinGet / npm. No `--cwd` or `--dir` flag — canonical pattern is `cd <dir> && claude` or spawn with `{ cwd: dir }`. Two prompt modes:
<br>_[Corrected 2026-04-21 F5: Claude Code CLI also registers a `claude-cli://` URL scheme on startup, with `claude-cli://open?q=<encoded>` accepting a prompt (multi-line via `%0A`). This is a third launch mode alongside TUI and headless `-p`. See [F5 evidence](evidence/f5-claude-cli-scheme-correction.md) for the full surface and UNCERTAIN items (whether `cwd=`/`session=` params are accepted)._

| Mode | Pattern | Result |
|---|---|---|
| Interactive seed | `claude "prompt"` | Opens TUI with prompt queued; user continues |
| Print (headless) | `claude -p "prompt"` | Streams to stdout, exits; `--output-format json` available |

Requires terminal wrapper for interactive TUI. VS Code extension (`anthropic.claude-code`) exposes `vscode://anthropic.claude-code/open?prompt=<encoded>&session=<id>` — this is a clean GUI integration when VS Code + extension are present. First-run is OAuth via browser; tokens land in macOS Keychain or `~/.claude/.credentials.json` on Linux. Windows has a `Claude.exe` PATH collision with Claude Desktop (Issue #25075).

**Evidence.** [evidence/d3-claude-code-cli.md](evidence/d3-claude-code-cli.md)

**Implications for `openWithAgent`.**
- **Two clean integration paths:**
  1. **Terminal TUI:** `spawn_terminal_with_cmd("cd <dir> && claude '<prompt>'")` — per-platform hand-rolled (no stable npm package).
  2. **Headless:** `spawn("claude", ["-p", prompt], { cwd: dir })` — no terminal needed, streams stdout. Usable as "ask a one-shot question about this dir" in an Electron panel.
- **VS Code + extension shortcut:** if the user has VS Code + `anthropic.claude-code` installed, `shell.openExternal("vscode://anthropic.claude-code/open?prompt=...")` is the cleanest prompt+open path across all five agents. Detection heuristic needed.

**Decision triggers.**
- If `/spec` prefers "user stays in our app": ship `claude -p` headless with our UI owning the rendering.
- If `/spec` prefers "user hops into the CLI TUI": ship terminal spawn, accept per-platform complexity.
- If `/spec` wants the best GUI experience: probe for VS Code + extension first, fall back to TUI.

---

### D4 — OpenAI Codex CLI

**Finding.** Binary `codex` (Rust, distributed via npm `@openai/codex` as a binary wrapper — not TypeScript as one might assume from the npm package). Top-level shape: `codex [OPTIONS] [PROMPT]`, with `exec|e` / `resume` / `fork` / `login` / `logout` / `mcp` / `app-server` / `cloud` subcommands. Directory control via `-C <dir>` / `--cd <dir>` (cleaner than Claude Code). **Refuses to run outside a trusted git repo** without `--skip-git-repo-check`.

| Mode | Pattern |
|---|---|
| Interactive TUI with seed | `codex "fix failing tests"` |
| Non-interactive | `codex exec "<prompt>"` (positional) or `codex exec -` (stdin) |

No `--prompt` / `-p` / `--message` flag — prompt is positional or stdin. `exec` streams stdout; supports `--json` for JSONL events, `--output-schema` for structured responses, `--sandbox read-only|workspace-write|danger-full-access`. No URL scheme registered. VS Code extension (`openai.chatgpt` — rebranded from Codex) exists; no documented public deep link.

**Evidence.** [evidence/d4-codex-cli.md](evidence/d4-codex-cli.md)

**Implications for `openWithAgent`.**
- **Shape is symmetric to Claude Code CLI** — both accept positional prompt, both have non-interactive escape hatch, both require terminal wrapper for TUI.
- **Two real differences:**
  1. Codex has `-C/--cd` (convenient); Claude Code has `--worktree` (different abstraction).
  2. Codex refuses non-git-repo dirs — an `openWithAgent(dir=/tmp/scratch, prompt=...)` call against Codex requires injecting `--skip-git-repo-check` automatically, or failing with a clear error.
- **`codex exec --json`** is the cleanest "Electron panel renders response" integration across the five.

**Decision triggers.**
- If `/spec` ships non-git-repo folders (e.g. personal notes dir): auto-inject `--skip-git-repo-check`, or pre-check git presence and fail fast.
- If `/spec` wants a rich "Electron renders Codex output" UX: `codex exec --json` parser + stream display.

**Remaining uncertainty.**
- Stdin-vs-positional interaction when both are supplied — community observation (stdin ignored) contradicts docs. Test before shipping combined flows.<br>_[Corrected 2026-04-21 same-day follow-up: behavior changed in [openai/codex#15917](https://github.com/openai/codex/pull/15917/files) (merged 2026-03-28, shipped v0.122.0 on 2026-04-20). Stdin IS now appended as a `<stdin>` block after a positional prompt. Authoritative fix in [F1 evidence U3](evidence/f1-empirical.md#u3-codex-exec--stdin--positional-prompt-major-update) + § Follow-up Findings.]_

---

### D5 — Electron outbound protocol-handler invocation

**Finding.** `shell.openExternal(url)` is the canonical cross-platform outbound URL dispatcher. Returns `Promise<void>` that resolves when the OS handoff completes — **does not indicate the target app actually launched.** Works for arbitrary schemes (OS routes based on target app's install-time registration). Electron ships no built-in scheme allowlist; this repo's `packages/desktop/src/main/shell-allowlist.ts` is the enforcement layer.

**Outbound scheme registration in our app is NOT required** — `setAsDefaultProtocolClient` is purely inbound. This resolves a question in the user's prompt.

**Evidence.** [evidence/d5-electron-outbound.md](evidence/d5-electron-outbound.md)

**Implications for `openWithAgent`.**
- Internal dispatch table:

```
type AgentLaunchPlan =
  | { kind: 'scheme', url: string }                    // Cursor, Claude Desktop (limited), VS Code
  | { kind: 'gui-noscheme', app: string, args: string[] }  // "open -a / start"
  | { kind: 'cli-tui', cmd: string, args: string[], cwd: string }  // spawn in terminal
  | { kind: 'cli-headless', cmd: string, args: string[], cwd: string }  // spawn directly
```

- **Promise resolution ≠ success.** `openWithAgent` cannot reliably show "Opened ✓" based only on `openExternal` resolution. UI should lean on the target app's own confirmation dialog (Cursor does this; Claude Desktop surfaces via its main window).
- **Pre-dispatch allowlist check:** must add `cursor:`, `claude:`, `vscode:` to the repo's allowlist **before** `openWithAgent` can fire any of them. This is a blocker for v1 ship, not a polish item.

**Decision triggers.**
- If `/spec` wants "fast-fail if app missing" UX: add per-platform presence probes (`mdfind` / registry read / `xdg-mime query default`) before dispatch. Otherwise rely on OS fallback UI.

---

### D6 — Cross-platform launch mechanics

**Finding.** Three OSes, three native primitives, three terminal-spawn patterns. No stable cross-platform npm package for "spawn CLI in default terminal" (the closest candidates are 5–9 years stale). Prevailing approach: hand-rolled per-platform.

| Platform | URL handler | Terminal spawn |
|---|---|---|
| macOS | `open <url>` (LaunchServices) or `shell.openExternal` | `open <script.command>` or `osascript` tell Terminal/iTerm |
| Windows | `start <url>` (cmd) or `Start-Process` (PS) or `shell.openExternal` | `wt.exe -d <cwd> <shell> -Command "<cmd>"` (modern); fallback `cmd /c start cmd /k` |
| Linux | `xdg-open <url>` + `.desktop` MIME handlers | `x-terminal-emulator -e <cmd>` → `gnome-terminal --` → `konsole -e` → `xterm -e` fallback chain; `$TERMINAL` env de-facto |

Registry note for Windows URL-scheme registration: `HKCU\Software\Classes\<scheme>\shell\open\command` (user-level, no admin) wins over `HKLM` (system-level). User-level is the modern default.

**Evidence.** [evidence/d6-cross-platform-launch.md](evidence/d6-cross-platform-launch.md)

**Implications for `openWithAgent`.**
- **Port VS Code's `externalTerminal` service** — it's the best-maintained reference implementation of cross-platform terminal spawn. Lives in `microsoft/vscode` under `src/vs/workbench/services/externalTerminal/`.
- **"Write a temp script, then open it"** is the most reliable pattern for complex arg passing on macOS (`open --args` is flaky).
- **Linux terminal detection:** chain = `$TERMINAL` → `x-terminal-emulator` → probe `gnome-terminal`/`konsole`/`xfce4-terminal`/`xterm`. Document the order in `/spec`.
- **Windows Terminal absence fallback:** not all Windows users have `wt.exe`. Probe before using.

---

### D7 — Security & encoding

**Finding.** Three classes of risk; all manageable with the right primitives.

1. **URL-scheme payload limits** — target 2,000 chars for portability. Windows ShellExecute enforces 2,081. macOS LaunchServices is undocumented; community ~2,000. Cursor self-limits `cursor://` to 8,000. For prompts >1,500 chars (post-encode), switch to stdin/file transport.
2. **Argv injection** — `spawn(cmd, argv, { shell: false })` is injection-safe regardless of prompt content. `exec(...)` and `spawn(..., { shell: true })` are unsafe — never pass user prompts through either. `shell.openExternal` is shell-safe (calls OS APIs directly, not a shell) but the *target app's URL parser* is the real trust boundary.
3. **Target-app URL-parser vulnerabilities** — the CursorJack CVEs (CVE-2025-54133, CVE-2025-54136) are the modern successors to the `ms-officecmd:` / `ms-msdt:` / `search-ms:` class. Lesson: an outbound scheme allowlist is necessary but not sufficient. Confirmation dialogs that don't display the full URL payload get weaponized.

**Evidence.** [evidence/d7-security-encoding.md](evidence/d7-security-encoding.md)

**Implications for `openWithAgent`.**
- Use `encodeURIComponent()` for prompt-in-URL; decode exactly once; prefer `shell.openExternal` over `cmd /c start <url>` (the latter mis-interprets `&`).
- For long prompts: file-based transport (write `.tmp` prompt file, pass path via CLI arg) or stdin pipe to CLI.
- Consider a user-confirm step when prompt > ~500 chars or contains suspicious structure — the Cursor CVEs show in-app confirmation isn't enough when the dialog truncates the payload.
- Pre-dispatch allowlist: add `cursor:`, `claude:`, `vscode:` to `shell-allowlist.ts`.

**Decision triggers.**
- If `/spec` wants strict-trust posture: require user confirm on every long-prompt dispatch.
- If `/spec` wants frictionless: auto-dispatch but cap URL length, switch to file-transport above threshold.

---

### D8 — Capability matrix synthesis

**The per-agent truth table** (CONFIRMED unless otherwise marked). Each row is what the agent actually supports; each column is what `openWithAgent` wants to deliver.

| Agent | Single-call prompt? | Single-call dir? | Prompt channel | Dir channel | Auto-execute? | Platforms | Best `openWithAgent` shape |
|---|---|---|---|---|---|---|---|
| **Cursor** (IDE + prompt) | ⚠️ 2-step | ✅ | `cursor://...prompt?text=` (8K cap, user-confirm) | `cursor <dir>` (CLI) | **No** — declined for security | macOS, Win, Linux | `spawn("cursor", [dir])` + `openExternal("cursor://...prompt?text=...")` |
| **Cursor** (headless `agent`) | ✅ | ✅ | `-p "<prompt>"` argv | `--workspace <dir>` | ✅ | macOS, Win, Linux | `spawn("agent", ["--workspace", dir, "-p", prompt])`, requires **paid subscription** |
| **Claude Desktop** | ❌ | ⚠️ via `/desktop` handoff only | none (URL accepts no prompt) | `claude://resume?cwd=<path>` only with staged session | n/a | **macOS + Win only** | `spawn("open", ["-a", "Claude"])` / `start Claude.exe`; user types prompt |
| **Claude Code CLI** (`claude-cli://` scheme, NEW F5) | ✅ | ✅ `cwd=<absolute>` (source-verified) | `claude-cli://open?q=<encoded>` (multi-line via `%0A`, ≤5K chars) | `cwd=<absolute>` (≤4K chars) + optional `repo=<owner/repo>` | ✅ spawns new terminal via detected emulator | macOS, Windows, Linux | `openExternal("claude-cli://open?cwd=" + enc(dir) + "&q=" + enc(prompt))` — **cleanest single-call path of any agent** |
| **Claude Code CLI** (TUI) | ✅ | ⚠️ no flag, use cwd | positional argv: `claude "prompt"` | `{ cwd: dir }` on spawn | ✅ (user continues in TUI) | macOS, Win, Linux | Per-OS terminal spawn running `cd <dir> && claude "<prompt>"` |
| **Claude Code CLI** (headless `-p`) | ✅ | ⚠️ | `-p "<prompt>"` | `{ cwd: dir }` | ✅ | macOS, Win, Linux | `spawn("claude", ["-p", prompt], { cwd: dir })` — no terminal needed |
| **Claude Code** (VS Code ext) | ✅ | via VS Code | `vscode://anthropic.claude-code/open?prompt=...&session=...` | VS Code opens current workspace; explicit dir via `vscode://file/<path>` | ✅ | macOS, Win, Linux (wherever VS Code + ext) | `openExternal("vscode://...?prompt=...")` — **requires VS Code + ext detection** |
| **Codex CLI** (TUI) | ✅ | ✅ | positional argv: `codex "prompt"` | `-C <dir>` | ✅ | macOS, Linux; Win experimental/WSL2 | Per-OS terminal spawn running `codex -C <dir> "<prompt>"` + `--skip-git-repo-check` if non-git |
| **Codex CLI** (`exec`) | ✅ | ✅ | positional or stdin | `-C <dir>` | ✅ | macOS, Linux; Win experimental | `spawn("codex", ["exec", "-C", dir, "--json", prompt])` — streams stdout |

Legend: ✅ supported / ⚠️ supported with caveat / ❌ not supported.

**Derived wrapper interface.** The external surface `openWithAgent(agentName, dir, prompt)` maps internally to a plan discriminated on the row above, with explicit degradation fields:

```ts
type OpenWithAgentRequest = { agentName: AgentId; dir: string; prompt: string };

type LaunchPlan =
  | { kind: 'scheme'; url: string; preludeCli?: string[] }
  | { kind: 'cli-tui'; cmd: string; args: string[]; cwd: string; spawnInTerminal: true }
  | { kind: 'cli-headless'; cmd: string; args: string[]; cwd: string };

type LaunchOutcome =
  | { ok: true; degradedFeatures?: ('prompt' | 'dir' | 'auto-execute')[] }
  | { ok: false; reason: 'not-installed' | 'scheme-blocked' | 'auth-required' | 'subscription-required' | 'platform-unsupported' | 'dispatch-error'; detail: string };
```

The `degradedFeatures` array is how the UI communicates "Opened Claude Desktop, but you'll need to paste your prompt" without lying about success.

**v1-shippable set (not-recommended; `/spec` decides).** Agents ordered by how much of the `(prompt, dir)` tuple they can honor atomically:

1. **Cursor** — richest surface, both CLI + scheme paths.
2. **Claude Code CLI** — two clean modes, cross-platform.
3. **Codex CLI** — symmetric to Claude Code.
4. **Claude Code in VS Code** (conditional on VS Code + ext) — cleanest GUI integration.
5. **Claude Desktop** — open-app only; prompt delivery blocked at API layer.

**Evidence.** This dimension is a roll-up of D1–D7. No standalone evidence file.

---

## Follow-up Findings (2026-04-21)

Same-day additive research pass, triggered by user feedback. Three new dimensions: **F1** empirical verification of UNCERTAIN items from the initial pass; **F2** broader agent landscape; **F3** the web-URL prompt-pass pattern. Plus light touches on **F4** Claude Desktop watch + auth UX.

### F1. Empirical verification — what changed, what's resolved

Six UNCERTAIN items from the initial pass were re-researched against community empirical reports and local probes on a macOS 25.3 machine.

| # | Item | Resolution |
|---|---|---|
| U1 | Does `cursor://file/<dir-path>` open a folder? | **STILL UNCERTAIN**, weakly leaning NO. All documented Cursor forum examples use file paths; a separate forum request exists for "open folder from URL" — implies current handler is file-only. Plan for file-only; use `cursor <dir>` CLI for dirs. |
| U2 | `claude://resume?cwd=<path>` without `session=`? | **STILL UNCERTAIN.** Docs state "sessions can only be resumed from the same directory where they were launched"; Issue #36937 requests a `--cwd` resume flag, implying today's behavior doesn't honor cwd-only. Don't rely on it. |
| **U3** | **Codex exec — stdin + positional prompt?** | **BEHAVIOR CHANGED.** Initial pass cited an alexfazio gist (v0.114.0) reporting stdin ignored when positional prompt present. **PR [openai/codex#15917](https://github.com/openai/codex/pull/15917/files)** merged 2026-03-28, shipped in **v0.122.0 (2026-04-20)**, now appends stdin as `<stdin>` block after the positional prompt. Gist is stale; docs are correct post-PR. See corrigendum breadcrumb on D4. |
| U4 | `vscode://anthropic.claude-code/open` cold-launch? | **CONFIRMED works cold.** Claude Code Release notes: "triggerable from a shell alias, a browser bookmarklet, or any script that can open a URL." Cold-launch-from-shell is the intended UX. Caveat: extension must have been installed + activated at least once. |
| U5 | Windows Terminal `wt.exe` availability | **~90% on currently-supported Windows.** Bundled on Windows 11 (default since 22H2); Windows 10 22H2 after KB5026435 (May 2023). Always fall back to `cmd /c start powershell` or `conhost.exe` when absent. |
| U6 | Linux terminal-picker fallback chain | **CONFIRMED exact VS Code chain:** Debian/`x-terminal-emulator` → GNOME/`gnome-terminal` → KDE/`konsole` → `$COLORTERM` → `$TERM` → `xterm`. Recommendation: prepend `$TERMINAL` env var check as step 0. |

**Local probe on dev machine (macOS 25.3):** `/Applications/` contains `Cursor.app` (bundle `com.todesktop.230313mzl4w4u92`), `Claude.app`, `ChatGPT.app`, **and a separate `Claude Code URL Handler.app`** (helper bundle shipped by the CLI installer to register `claude://` — confirms the "separate binary" architecture flagged in Issue #41015). CLIs on PATH: `cursor`, `claude`, `codex`, `code`.

**Evidence.** [evidence/f1-empirical.md](evidence/f1-empirical.md)

---

### F2. Broader agent landscape — 6 more agents, same framework

Extended the capability matrix to Windsurf, Aider, GitHub Copilot CLI, Cline, Continue, and OpenHands. **The dominant shape holds:** `spawn(bin, [promptFlag, prompt], { cwd: dir })` is the universal primitive; URL schemes are the exception (zero of the six have a useful prompt-bearing URL scheme).

| Agent | URL scheme | CLI prompt flag | CLI dir flag | Single-call? | Shortest openWithAgent |
|---|---|---|---|---|---|
| **Windsurf** | `windsurf://` (auth-only) | NOT FOUND | positional `<dir>` | **No** — prompt lost | `spawn("windsurf", [dir])` — degraded |
| **Aider** | NOT FOUND | `-m` / `--message` | cwd | ✅ | `spawn("aider", ["-m", prompt], { cwd: dir })` |
| **Copilot CLI** (new `@github/copilot`) | NOT FOUND | `-p` | cwd only ([#457](https://github.com/github/copilot-cli/issues/457)) | ✅ | `spawn("copilot", ["-p", prompt], { cwd: dir })` |
| **Cline** | NOT FOUND | positional task | `--workspace <dir>` | ✅ (CLI path) | `spawn("cline", [prompt, "--workspace", dir])` |
| **Continue** (`@continuedev/cli`) | NOT FOUND | `-p` | cwd | ✅ | `spawn("cn", ["-p", prompt], { cwd: dir })` |
| **OpenHands** | NOT FOUND | `-t` / `--task` (with `--headless`) | cwd (Docker required) | ✅ | `spawn("openhands", ["--headless", "-t", prompt], { cwd: dir })` |

Note: **legacy `gh copilot` was deprecated 2025-10-25** in favor of the new agentic `@github/copilot` CLI. Migrate any legacy references.

**Evidence.** [evidence/f2-broader-agents.md](evidence/f2-broader-agents.md)

---

### F3. Web-URL "Open in Claude" pattern — NEW DIMENSION

**The initial pass missed this class entirely.** `https://claude.ai/new?q=<encoded>` is a plain HTTPS URL that pre-fills a prompt into Claude.ai. It is a **universal** launch vector — works on mobile, desktop, any browser, no SDK, no scheme, no allowlist. It is the simplest and most portable prompt-pass mechanism we found across all research.

**What we learned.**

| LLM surface | URL shape | Auto-submit? | Status |
|---|---|---|---|
| **Claude** | `https://claude.ai/new?q=<encoded>` | Historically yes; post-Oasis-vuln fix likely pre-fill only | **Undocumented by Anthropic**, but live and widely used |
| **ChatGPT** | `https://chatgpt.com/?q=<encoded>` or `?prompt=<encoded>` | No — textarea pre-fills, user presses Enter | Community-discovered, undocumented |
| **Perplexity** | `https://perplexity.ai/search?q=<encoded>` | Yes (search) | Widely used |
| **Grok** | `https://x.com/i/grok?text=<encoded>` | Unknown | Community-discovered |
| **Gemini** | NO native support | — | Feature-requested, not shipped. Extension workaround only. |
| **Mistral** | NO native support | — | NOT FOUND. |

**Security.** [Oasis Security disclosed a prompt-injection vuln in `claude.ai/new?q=`](https://www.oasis.security/blog/claude-ai-prompt-injection-data-exfiltration-vulnerability) (Mar 2026) — HTML tags inside `q=` were invisible in the textarea but processed on submit. Anthropic fixed per their Responsible Disclosure Program. Claude Code Issue [#19023](https://github.com/anthropics/claude-code/issues/19023) explicitly argues future URL-param support should pre-fill only, never auto-execute — matching Cursor's posture.

**Does the URL deep-link into Claude Desktop?** **UNCERTAIN, leaning NO.** No `apple-app-site-association` evidence; Claude Desktop's Info.plist is not documented to claim `https://claude.ai/*` as a Universal Link. Assume it opens in the browser — which may be the desired UX anyway (no native-app modal).

**Docs-site adoption — two convergent patterns:**

**Mintlify ships this as a first-class feature** ([contextual menu docs](https://www.mintlify.com/docs/ai/contextual-menu)). Configuration via `docs.json`:

```json
{
  "contextual": {
    "options": ["copy", "view", "chatgpt", "claude", "perplexity",
                "grok", "aistudio", "assistant", "devin",
                "windsurf", "cursor", "vscode", "mcp"]
  }
}
```

Thirteen options cover file actions, LLM chat surfaces, agent launchers (Devin), IDE launch (Windsurf/Cursor/VS Code via their respective URL handlers), and MCP server registration. This is prior-art for the Open Knowledge dropdown.

Two payload strategies:

- **URL-reference (Inkeep):** `q=\"Discuss https://docs.inkeep.com/overview.md\"` — short; Claude fetches the doc via its own web tool. Requires serving `.md` / `llms.txt` per [llmstxt.org](https://llmstxt.org/) convention. Good for long docs.
- **Inline content (Mintlify):** `q=${encodeURIComponent(fullMarkdown)}` — zero fetch dependency; URL-length-bound. Bad for long docs.

**Implications for Open Knowledge `openWithAgent`.**

1. **The web-URL path is a third launch mode**, alongside `scheme` (native app) and `cli-*` (spawn). Add a fourth discriminator:

    ```ts
    type LaunchPlan =
      | { kind: 'scheme'; url: string; preludeCli?: string[] }
      | { kind: 'weburl'; url: string }                         // NEW
      | { kind: 'cli-tui'; cmd: string; args: string[]; cwd: string; spawnInTerminal: true }
      | { kind: 'cli-headless'; cmd: string; args: string[]; cwd: string };
    ```

2. **It's the easiest path to ship first.** A web-URL mode requires only `shell.openExternal("https://...")` — `https:` is already in the allowlist. No allowlist additions, no CLI detection, no terminal spawn. Ships immediately; doesn't carry a `dir` natively but can embed a URL reference to the doc.

3. **The docs-site pattern is different from the editor pattern.** On docs sites, "Ask Claude" is per-page context. In Open Knowledge's editor, "Open with Claude" can be per-document OR per-folder. The latter opens interesting options: "Open /my-project/ with Cursor" (launches IDE) vs "Ask Claude about /my-project/" (URL to claude.ai with a repo-describing prompt).

4. **Prior-art alignment.** Open Knowledge is markdown-native and already serves `.md` extension via the CRDT server. Inkeep's URL-reference pattern is a natural fit — we can expose a doc URL (e.g. `https://open-knowledge.example/overview.md`) and put it in `q=` for long docs without hitting URL caps.

**Evidence.** [evidence/f3-web-url-pattern.md](evidence/f3-web-url-pattern.md)

---

### F5. `claude-cli://` — Claude Code CLI's own URL scheme (MATERIAL CORRECTION)

**Pass 1 + 2 reported the Claude Code CLI has no URL scheme. That was wrong.** The user flagged the omission via [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) — the scheme is documented only as a footnote under the `disableDeepLinkRegistration` setting (not in CLI reference or any Deep Links doc), which is why we missed it.

Deep research into `@anthropic-ai/claude-code@2.1.104` `cli.js` extracted the complete parser — answering the user's follow-on question "can I set working directory?" with **yes**, and surfacing one additional undocumented param:

| Param | Status | Constraints |
|---|---|---|
| **`q`** | documented | Prompt text. Max 5,000 chars (post-decode). Multi-line via `%0A`. |
| **`cwd`** | **source-verified, undocumented** | Absolute path. Max 4,096 chars. No control chars. |
| **`repo`** | **source-verified, undocumented** | `owner/repo` regex. Fallback when `cwd` absent → resolves to local clone → `$HOME`. |

**Only endpoint:** `claude-cli://open?…`. Parser throws `Unknown deep link action` on any other hostname (`resume`, `new`, `chat`, etc. — NOT supported).

**Params that do NOT work** (confirmed absent from parser): `session`, `model`, `system`, `permission-mode`, `sandbox`, `prompt` (the param name is `q`, not `prompt` — a cross-tool interop hazard since Cursor uses `text` and VS Code ext uses `prompt`).

**Registration per platform** (from source):

| Platform | Mechanism | Path |
|---|---|---|
| macOS | Separate `.app` bundle `Claude Code URL Handler.app` with `CFBundleURLSchemes=[claude-cli]`, bundle id `com.anthropic.claude-code-url-handler`. `CFBundleExecutable` is a symlink to `claude`. `lsregister -R` registers it. Auto-recreated every 24h. | **`~/Applications/`** (user-local; Issue [#41015](https://github.com/anthropics/claude-code/issues/41015) flags this as a corporate-IT blocker) |
| Linux | `.desktop` file with `MimeType=x-scheme-handler/claude-cli;` + `xdg-mime default`. Respects `XDG_DATA_HOME`. | `~/.local/share/applications/claude-code-url-handler.desktop` |
| Windows | Registry (user-level, no admin). | `HKEY_CURRENT_USER\Software\Classes\claude-cli\shell\open\command` = `"<claude.exe>" --handle-uri "%1"` |

**Cold-launch behavior.** OS routes URL to handler → `claude --handle-uri <url>` → parses via `$K5` → opens a **new terminal window** via detected emulator with prompt pre-filled and `cwd` set. Fallback error if no terminal detected: `"Failed to open a terminal. Make sure a supported terminal emulator is installed."`

**Version history.** Scheme shipped **early 2026** (within past ~3-4 months). Changelog milestones: v2.1.83 first mentions `disableDeepLinkRegistration`; v2.1.88 raised `q` to 5K chars; v2.1.90 fixed macOS open issue; v2.1.91 added multi-line support.

**Corrected canonical `openWithAgent` shape for Claude Code CLI:**

```ts
const url = `claude-cli://open?cwd=${encodeURIComponent(dir)}&q=${encodeURIComponent(prompt)}`;
shell.openExternal(url);
```

Preconditions: `dir` absolute; `prompt` ≤5K chars after encode; `claude-cli:` in `shell-allowlist.ts`; Claude Code CLI installed AND run at least once (registration happens on CLI startup).

**Implication.** Claude Code CLI becomes the cleanest single-call primitive in the matrix — honors full `(dir, prompt)` atomically, OS opens the terminal, no CLI-detection plumbing in our Electron. Moves from "Tier 2" to "Tier 1 with allowlist addition."

**Evidence.** [evidence/f5-claude-cli-scheme-correction.md](evidence/f5-claude-cli-scheme-correction.md) — full source-code walkthrough + all references.

**Confirmed-negative: no analogous Claude Desktop scheme.** Scanned the full Desktop docs page. The only Desktop URL route remains `claude://resume?session=<uuid>&cwd=<path>` (requires pre-staged transcript) — no `claude://open?q=` or similar. Desktop's prompt-pass surface is still empty. The user's specific question "are deep links possible on claude not just claude cli?" → **CLI yes (`claude-cli://open?cwd=&q=&repo=`); Desktop no.**

---

### F4. Claude Desktop watch + auth UX (light)

**Claude Desktop deep-link surface (re-probed 2026-04-21):** No expansion since initial pass. `claude://` still a narrow handoff surface; `https://claude.ai/*` still not a documented Universal Link target. 2026-04-15 redesign is UI-only per MacRumors/TNS coverage; no new URL routes. Re-probe again before v1 ship.

**Auth UX (light survey per user's direction):** Each agent has a distinct first-run. Summary only — no separate evidence file.

| Agent | First-run cost | Where auth persists |
|---|---|---|
| Cursor (IDE) | Sign-in in app | Cursor account (cloud) |
| Cursor (`agent` CLI) | `agent login` OR `CURSOR_API_KEY` env | Local config |
| Claude Desktop | Browser OAuth to claude.ai | App state |
| Claude Code CLI | Browser OAuth OR `claude setup-token` for headless | macOS Keychain / `~/.claude/.credentials.json` |
| Codex CLI | Browser OAuth OR piped API key OR `OPENAI_API_KEY` | `~/.codex/` |
| Aider / Continue / OpenHands | BYOK via env vars | User's env |
| Copilot CLI | `/login` slash command in session | GitHub credentials |
| Cline | `cline auth` OR BYOK | Local |

**Implication.** First-click UX is different per agent. A uniform "here's what happens" dialog in Open Knowledge would be nice-to-have but not blocking. **Policy punt to `/spec`.**

---

### Extended capability matrix (all 10 agents + web-URL layer)

Complete roll-up. Legend: ✅ ✓ native / ⚠ conditional / ❌ not supported.

| Agent | Scheme (desktop) | Web URL | CLI prompt | CLI dir | Single-call? | Best `openWithAgent` |
|---|---|---|---|---|---|---|
| **Cursor** (IDE + scheme) | `cursor://...prompt?text=` (8K, user-confirm) | ❌ | ❌ (editor CLI no prompt flag) | ✅ `cursor <dir>` | ⚠ 2-step | prelude `cursor <dir>` + scheme |
| **Cursor** (`agent` headless) | ❌ | ❌ | ✅ `-p` | ✅ `--workspace` | ✅ | `spawn("agent", ["--workspace", dir, "-p", prompt])` (paid) |
| **Claude Desktop** | `claude://resume` only (no fresh prompt) | ⚠ `claude.ai/new?q=` (opens browser, not native) | ❌ (macOS); Windows PATH-shim | ❌ | ❌ for prompt | `open -a Claude` / `start Claude.exe` + web-URL fallback |
| **Claude Code CLI** (`claude-cli://` scheme, F5) | ✅ `open?q=` | ❌ | ✅ `q=<enc>` | ✅ `cwd=<abs>` + bonus `repo=<owner/repo>` | ✅ OS opens new terminal | `openExternal("claude-cli://open?cwd=" + enc(dir) + "&q=" + enc(prompt))` — **cleanest** |
| **Claude Code CLI** (TUI) | ❌ | ❌ | ✅ positional | ✅ via `cwd` | ✅ (terminal) | terminal spawn `cd <dir> && claude "<prompt>"` |
| **Claude Code CLI** (`-p` headless) | ❌ | ❌ | ✅ `-p` | ✅ via `cwd` | ✅ | `spawn("claude", ["-p", prompt], { cwd: dir })` |
| **Claude Code** (VS Code ext) | `vscode://anthropic.claude-code/open?prompt=` | ❌ | — | via VS Code workspace | ✅ | `openExternal("vscode://anthropic.claude-code/open?prompt=...&session=...")` |
| **Codex CLI** (TUI) | ❌ | ❌ | ✅ positional | ✅ `-C/--cd` | ✅ (terminal) | terminal spawn `codex -C <dir> "<prompt>"` |
| **Codex CLI** (`exec`) | ❌ | ❌ | ✅ pos + stdin (post-v0.122) | ✅ `-C/--cd` | ✅ | `spawn("codex", ["exec", "-C", dir, "--json", prompt])` |
| **Windsurf** (IDE) | `windsurf://` auth-only | ❌ | ❌ | ✅ `windsurf <dir>` | ❌ for prompt | `spawn("windsurf", [dir])` — degraded |
| **Aider** | ❌ | ❌ | ✅ `-m` | cwd | ✅ | `spawn("aider", ["-m", prompt], { cwd: dir })` |
| **Copilot CLI** (new) | ❌ | ❌ | ✅ `-p` | cwd ([#457](https://github.com/github/copilot-cli/issues/457)) | ✅ | `spawn("copilot", ["-p", prompt], { cwd: dir })` |
| **Cline** | ❌ | ❌ | ✅ positional | ✅ `--workspace` | ✅ | `spawn("cline", [prompt, "--workspace", dir])` |
| **Continue** (`cn`) | ❌ | ❌ | ✅ `-p` | cwd | ✅ | `spawn("cn", ["-p", prompt], { cwd: dir })` |
| **OpenHands** | ❌ | ❌ | ✅ `-t` (headless) | cwd (Docker) | ✅ | `spawn("openhands", ["--headless", "-t", prompt], { cwd: dir })` |
| **— (web-URL only) —** | | | | | | |
| Claude.ai web | — | ✅ `claude.ai/new?q=<p>` | — | embed dir URL in `q=` | ⚠ prompt only | `openExternal("https://claude.ai/new?q=" + enc(prompt))` |
| ChatGPT.com web | — | ✅ `chatgpt.com/?q=<p>` | — | embed | ⚠ prompt only | `openExternal("https://chatgpt.com/?q=" + enc(prompt))` |
| Perplexity web | — | ✅ `perplexity.ai/search?q=<p>` | — | embed | ⚠ prompt only | analogous |
| Grok web | — | ✅ `x.com/i/grok?text=<p>` | — | embed | ⚠ prompt only | analogous |

**Revised wrapper signature with web-URL mode:**

```ts
type LaunchPlan =
  | { kind: 'scheme'; url: string; preludeCli?: string[] }       // desktop URL handler
  | { kind: 'weburl'; url: string }                              // NEW — https:// prompt-pass
  | { kind: 'cli-tui'; cmd: string; args: string[]; cwd: string; spawnInTerminal: true }
  | { kind: 'cli-headless'; cmd: string; args: string[]; cwd: string };
```

**Recommended v1 shipping tiers (for `/spec` to confirm; revised after F5):**

- **Tier 1 — ship now, zero friction.** Web-URL entries (`claude.ai/new?q=`, `chatgpt.com/?q=`, `perplexity.ai/search?q=`) — `https:` already in allowlist; no CLI detection. **PLUS `claude-cli://open?cwd=&q=`** (requires one allowlist addition; no CLI detection since OS handles routing; honors full `(dir, prompt)` atomically). F5 promoted Claude Code CLI from Tier 2 to Tier 1.
- **Tier 2 — allowlist additions + some CLI detection.** Cursor (scheme + CLI prelude for dir), Codex CLI (`exec` with dir probe for git-repo), VS Code → Claude Code extension URI (needs VS Code + ext presence check). Allowlist: add `cursor:`, `vscode:`.
- **Tier 3 — follow-on.** Claude Desktop (open-app-only, degraded), Windsurf (dir-only), Aider/Copilot/Cline/Continue/OpenHands (CLI with presence detection).

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Empirical launch tests.** All findings are docs + issue-tracker based. Live-machine verification (does `cursor://file/<dir>` open a folder? does `claude://resume?cwd=<path>` without `session=` open a fresh session? does `codex -C <dir>` behave differently on WSL2 vs native Windows?) belongs in the `/spec` implementation phase, not this report.
- **Non-default install locations.** Users installing Claude Desktop to `~/Applications/` get broken `/desktop` handoffs (Issue #41899). Per-platform presence detection needs to cover these cases.
- **First-run auth UX.** Each agent has a different first-run flow (OAuth browser open, device code, API key paste, subscription gate). A consolidated UX for "first time you use this agent, here's what happens" is a product question outside this report.

### Out of scope (per rubric)

- UI/UX design of the dropdown — downstream of the `/spec`.
- Which agents ship in v1 — `/spec` decides from this matrix.
- Agents beyond the five named (Windsurf, Aider, Copilot CLI, etc.).
- Full first-party audit of `packages/desktop/`.
- Registering `openknowledge://` as an inbound handler (that's M4 in `specs/2026-04-11-electron-desktop-app/SPEC.md`; unrelated to calling OUT to other apps — the research-scope adjustment the user requested).

---

## References

### Evidence files

- [evidence/d1-cursor.md](evidence/d1-cursor.md) — Cursor URL scheme, two CLIs, CVE-2025-54133/4
- [evidence/d2-claude-desktop.md](evidence/d2-claude-desktop.md) — Unified app shape, `claude://resume`, platform constraints
- [evidence/d3-claude-code-cli.md](evidence/d3-claude-code-cli.md) — `claude` CLI, `-p` vs interactive, VS Code extension URI
- [evidence/d4-codex-cli.md](evidence/d4-codex-cli.md) — `codex` subcommands, `-C/--cd`, `--skip-git-repo-check`
- [evidence/d5-electron-outbound.md](evidence/d5-electron-outbound.md) — `shell.openExternal`, outbound vs inbound scope
- [evidence/d6-cross-platform-launch.md](evidence/d6-cross-platform-launch.md) — macOS / Windows / Linux primitives + terminal spawn
- [evidence/d7-security-encoding.md](evidence/d7-security-encoding.md) — URL limits, argv injection, CursorJack CVEs
- [evidence/f1-empirical.md](evidence/f1-empirical.md) — **Follow-up 2026-04-21:** empirical resolutions (incl. Codex stdin behavior change); local `/Applications/` + PATH probe
- [evidence/f2-broader-agents.md](evidence/f2-broader-agents.md) — **Follow-up 2026-04-21:** Windsurf, Aider, Copilot CLI, Cline, Continue, OpenHands
- [evidence/f3-web-url-pattern.md](evidence/f3-web-url-pattern.md) — **Follow-up 2026-04-21:** `claude.ai/new?q=` web URL + Mintlify contextual menu + Inkeep URL-reference pattern
- [evidence/f5-claude-cli-scheme-correction.md](evidence/f5-claude-cli-scheme-correction.md) — **Follow-up 2026-04-21:** `claude-cli://open?q=&cwd=&repo=` scheme — complete parser-verified parameter surface (fixes pass 1+2 omission)

### External sources (selected; full list in evidence files)

- [Cursor Deeplinks docs](https://cursor.com/docs/integrations/deeplinks)
- [Cursor CLI reference](https://cursor.com/docs/cli/reference/parameters)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop)
- [Cowork help](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [openai/codex GitHub](https://github.com/openai/codex)
- [Codex CLI reference](https://developers.openai.com/codex/cli/reference)
- [Electron shell API](https://www.electronjs.org/docs/latest/api/shell)
- [Electron Deep Links tutorial (inbound)](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)
- [CursorJack — Proofpoint](https://www.proofpoint.com/us/blog/threat-insight/cursorjack-weaponizing-deeplinks-exploit-cursor-ide)
- [Claude Desktop / CLI `claude://resume` bug](https://github.com/anthropics/claude-code/issues/26197)
- [Windows Terminal CLI — MS Learn](https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments)
- [Mintlify — Contextual menu docs](https://www.mintlify.com/docs/ai/contextual-menu) *(F3 follow-up)*
- [Oasis Security — Claude AI Prompt Injection Data Exfiltration](https://www.oasis.security/blog/claude-ai-prompt-injection-data-exfiltration-vulnerability) *(F3 follow-up)*
- [llmstxt.org — /llms.txt proposal](https://llmstxt.org/) *(F3 follow-up)*
- [openai/codex#15917 — stdin piping PR](https://github.com/openai/codex/pull/15917/files) *(F1 follow-up)*
- [microsoft/vscode — externalTerminalService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/externalTerminal/node/externalTerminalService.ts) *(F1 follow-up)*
- [github/copilot-cli — new `@github/copilot` CLI](https://github.com/features/copilot/cli/) *(F2 follow-up)*
- [code.claude.com/docs/en/settings — `disableDeepLinkRegistration`](https://code.claude.com/docs/en/settings) *(F5 follow-up)*
- [anthropics/claude-code#41015 — URL Handler install location](https://github.com/anthropics/claude-code/issues/41015) *(F5 follow-up)*
- [anthropics/claude-code#29145 — URI handler tracking issue](https://github.com/anthropics/claude-code/issues/29145) *(F5 follow-up)*

### Related research (navigation aids, not evidence)

- [reports/worktree-orchestration-landscape/REPORT.md](../worktree-orchestration-landscape/REPORT.md) — adjacent: how other agents isolate work
- [reports/ai-coding-tools-embedded-browsers/REPORT.md](../ai-coding-tools-embedded-browsers/REPORT.md) — adjacent: embedded vs external launch
- [reports/ai-coding-agent-tool-surfaces/REPORT.md](../ai-coding-agent-tool-surfaces/REPORT.md) — adjacent: what the agents do after launch
- [specs/2026-04-11-electron-desktop-app/SPEC.md](../../specs/2026-04-11-electron-desktop-app/SPEC.md) — host context: M4 inbound `openknowledge://` handler (deferred; separate from this research)
