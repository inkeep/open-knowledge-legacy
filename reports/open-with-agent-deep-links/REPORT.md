---
title: "Open-With-Agent Deep-Link & CLI Capability Matrix"
description: "Capability matrix for an `openWithAgent(agentName, dir, prompt)` wrapper across Cursor, Claude Desktop, Claude Code CLI, and OpenAI Codex CLI. Covers URL schemes, CLI flags, platform support, security surface, and cross-platform launch mechanics from an Electron host. Informs the forthcoming /spec for an Open With ⌄ dropdown."
createdAt: 2026-04-21
updatedAt: 2026-04-21
subjects:
  - Cursor
  - Claude Desktop
  - Claude Code
  - OpenAI Codex
  - Electron
  - shell.openExternal
topics:
  - URL scheme handlers
  - CLI launch
  - cross-platform shell-out
  - deeplink security
  - agent integration
---

# Open-With-Agent Deep-Link & CLI Capability Matrix

**Purpose.** Inform the forthcoming `/spec` for an "Open with ⌄" dropdown in the Open Knowledge editor. The wrapper shape is `openWithAgent(agentName: string, dir: URL, prompt: string)`. This report maps what each target agent can actually honor — and what the graceful-degradation contract looks like when prompt or dir can't be delivered atomically.

---

## Executive Summary

**Every agent has a way in, but they're not symmetric.** There is no agent we cannot launch; there is no agent we can launch with prompt+dir in a single atomic call on all three OSes. Any `openWithAgent` wrapper must accept that the *contract* is "best-effort handoff with documented degradation," not "uniform prompt+dir delivery."

The asymmetry is structural, not a spec-process artifact:

1. **Cursor is the only target with a documented third-party URL contract for prompt pre-fill.** `cursor://anysphere.cursor-deeplink/prompt?text=<encoded>` pre-fills chat (8,000-char cap); the user must confirm — Cursor declined an auto-execute variant on security grounds. Separately, `cursor <dir>` (VS Code-shim CLI) opens folders. The canonical shape for "prompt + dir" is a **two-step**: spawn `cursor <dir>`, then `shell.openExternal("cursor://...prompt?text=...")`.
2. **Claude Desktop (unified Chat + Cowork + Code) registers `claude://` but has no public prompt-pass path.** Only two observed paths: `claude://resume?session=<uuid>&cwd=<path>` (requires a session transcript pre-staged on disk by the CLI's `/desktop` handoff), and an OAuth callback. Fresh-prompt delivery via URL is **not supported**. Best wrapper behavior: `open -a "Claude"` / `start Claude.exe` with no prompt; user types it. Prompts-via-URL is a feature request (Issue #19023) for Claude Code on the Web, not Desktop.
3. **Claude Code CLI and Codex CLI are TUIs.** Both require a terminal context when spawned from Electron. Both accept a seed prompt as a positional argv. Both have a non-interactive escape hatch (`claude -p` / `codex exec`) that can be `spawn()`'d headlessly without a terminal — streams stdout, suitable for an Electron panel. Neither CLI registers a URL scheme of its own. Directory handling differs: Claude Code has no `--cwd` flag (spawn with `{ cwd: dir }` or `cd dir &&`); Codex has `-C/--cd <dir>` but refuses non-git-repo dirs without `--skip-git-repo-check`.
4. **Registering our own outbound scheme is NOT required.** The user's intuition is confirmed — `shell.openExternal("cursor://...")` invokes the OS default-handler machinery; our Electron app does nothing scheme-specific. The existing `shell-allowlist.ts` controls which *outbound* schemes our app is willing to dispatch to, and would need `cursor:`, `claude:`, `vscode:` added before an `openWithAgent` wrapper can fire them. The `openknowledge:` entry (inbound handler, deferred to desktop M4) is unrelated to this feature.
5. **Security surface is non-trivial.** Two 2025 Cursor CVEs (CVE-2025-54133, CVE-2025-54136 — the "CursorJack" class) demonstrate that target-app URL parsers are the real trust boundary. Windows ShellExecute caps URLs at 2,081 chars; macOS LaunchServices is undocumented but practically ~2,000; Cursor self-limits `cursor://` to 8,000. For long prompts, a file/stdin transport outperforms URL-based handoff.

**Key findings (decision-ready):**

- **Unified minimal wrapper is feasible,** but it's `{ kind: 'gui-scheme' | 'gui-no-scheme' | 'cli-tui' | 'cli-headless', handler: ... }` internally, not a single dispatch primitive. See §4 for the per-agent matrix.
- **v1 shipping set is defensible as {Cursor, Claude Code CLI, Codex CLI}.** Cursor has the richest deep-link surface. The two CLIs cover terminal-inclined users symmetrically. Claude Desktop is shippable as "open app, no prompt" but offers little value-add beyond `open -a "Claude"`. `/spec` decides.
- **Platform coverage.** Cursor + Claude Code CLI + Codex CLI: macOS, Windows (w/ quirks), Linux. Claude Desktop: **macOS + Windows only, no Linux** — a hard v1 policy choice if Linux support matters.
- **Security additions required before ship.** Add `cursor:`, `claude:`, `vscode:` to `packages/desktop/src/main/shell-allowlist.ts`. Without this, `checkOutboundUrl` returns `{ ok: false, reason: "scheme-not-allowed: cursor:" }` and every invocation fails closed — blocker, not polish.

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
- Stdin-vs-positional interaction when both are supplied — community observation (stdin ignored) contradicts docs. Test before shipping combined flows.

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

### Related research (navigation aids, not evidence)

- [reports/worktree-orchestration-landscape/REPORT.md](../worktree-orchestration-landscape/REPORT.md) — adjacent: how other agents isolate work
- [reports/ai-coding-tools-embedded-browsers/REPORT.md](../ai-coding-tools-embedded-browsers/REPORT.md) — adjacent: embedded vs external launch
- [reports/ai-coding-agent-tool-surfaces/REPORT.md](../ai-coding-agent-tool-surfaces/REPORT.md) — adjacent: what the agents do after launch
- [specs/2026-04-11-electron-desktop-app/SPEC.md](../../specs/2026-04-11-electron-desktop-app/SPEC.md) — host context: M4 inbound `openknowledge://` handler (deferred; separate from this research)
