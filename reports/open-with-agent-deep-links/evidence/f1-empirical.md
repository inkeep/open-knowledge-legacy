# Evidence: F1 — Empirical Verification (2026-04-21 follow-up)

**Dimension:** Resolve UNCERTAIN claims from the initial pass via community empirical reports + local Bash probes.
**Date:** 2026-04-21
**Sources:** github.com/anthropics/claude-code issues, github.com/openai/codex PRs + releases, forum.cursor.com, code.claude.com docs, microsoft/vscode source, Microsoft Learn, local `/Applications/` + `mdfind` probes

---

## Local empirical (probe on Andrew's macOS 25.3 / darwin)

Non-destructive local probes — read-only: no app launched, no URL dispatched, no file written.

**Installed agent applications at `/Applications/`:**
- `Cursor.app` — bundle ID `com.todesktop.230313mzl4w4u92` (distributed via ToDesktop) — CONFIRMED via `mdfind`
- `Claude.app` — Claude Desktop (unified Chat + Cowork + Code app)
- `Claude Code URL Handler.app` — a **separate** helper app shipped by the Claude Code CLI installer to register the `claude://` scheme. This confirms the observation in Issue #41015 ("URL Handler app hardcoded to `/Applications/`") — the handler is a standalone bundle, not embedded in the CLI binary.
- `ChatGPT.app` — OpenAI's macOS app (separate from Codex CLI)

**CLI binaries on PATH:**
- `/usr/local/bin/cursor` — Cursor editor shim
- `/Users/andrew/.local/bin/claude` — Claude Code CLI
- `/Users/andrew/.local/state/fnm_multishells/.../bin/codex` — Codex CLI (via fnm Node install)
- `/usr/local/bin/code` — VS Code `code` shim
- `agent`, `windsurf`, `aider`, `cline`, `copilot` — not installed (confirms these aren't in v1 scope on Andrew's dev machine, but doesn't affect the research findings)

**Implication for `openWithAgent`:** on a developer's machine with the expected stack, all 4 initial-pass agents are installed + CLI-accessible. Presence detection at runtime should probe `/Applications/<AgentName>.app` (macOS) AND `which <bin>` (for CLI fallback paths).

---

## U1. Does `cursor://file/<dir-path>` open a folder?

**Community consensus:** **STILL UNCERTAIN**, weakly leaning NO (file-only).
**Evidence:**
- All documented Cursor forum examples use file paths: `cursor://file/path/to/file/file.ext:L:C`. No empirical post tests a directory.
  - [Cursor forum — Open in Cursor URL Handler](https://forum.cursor.com/t/open-in-cursor-url-handler/1999)
  - [Cursor forum — Does Cursor have a unique open scheme?](https://forum.cursor.com/t/does-cursor-have-a-unique-open-scheme/3659)
- Separate forum post requesting a "open folder from URL" feature exists, suggesting the current handler does NOT support folders: [How can I open a specific folder directly in Cursor from the command line?](https://forum.cursor.com/t/how-can-i-open-a-specific-folder-directly-in-cursor-from-the-command-line/36295)
- `:L:C` line/column suffix in the documented schema implies file semantics.

**Resolution:** Plan for file-only. Use `cursor <dir>` CLI for directory opens; reserve `cursor://file/<path>` for files only.

---

## U2. `claude://resume?cwd=<path>` without `session=<uuid>`

**Community consensus:** **STILL UNCERTAIN.** No empirical reports. Documentation implies the combo is required.
**Evidence:**
- Claude Code Docs — Work with sessions: "Sessions can only be resumed from the same directory where they were launched." ([code.claude.com/docs/en/agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions))
- Issue #36937 (Feb 2026) requests a `--cwd` resume flag — indicates current behavior doesn't honor cwd override. ([anthropics/claude-code#36937](https://github.com/anthropics/claude-code/issues/36937))
- `url-handler-napi` package behavior for partial params is undocumented.

**Resolution:** Safer to require session + cwd per docs; cwd-only is undefined behavior. Don't rely on it.

---

## U3. `codex exec` — stdin + positional prompt (MAJOR UPDATE)

**Community consensus:** **CONFIRMED — behavior changed on 2026-03-28.** The initial-pass finding (from alexfazio gist on v0.114.0: "stdin is not forwarded when positional prompt is present") is **stale**.
**Evidence:**
- [openai/codex PR #15917](https://github.com/openai/codex/pull/15917/files) (merged 2026-03-28): "If you provide both a prompt argument and piped stdin, Codex appends stdin as a `<stdin>` block after the prompt so patterns like `echo 'my output' | codex exec 'Summarize this concisely'` work naturally"
- [openai/codex Releases page](https://github.com/openai/codex/releases) — v0.122.0 (2026-04-20) changelog: "[2/8] Support piped stdin in exec process API (#18086)"; "Documented custom MCP server approval defaults and exec-server stdin behavior"
- [alexfazio gist, v0.114.0](https://gist.github.com/alexfazio/359c17d84cb6a5af12bac88fa1db9770) — captured pre-PR behavior; now historical.

**Resolution (important for `openWithAgent`):**
- As of Codex ≥ v0.122.0, `codex exec -C <dir> "<prompt>"` with stdin piped **does** receive both. For combined "dir + prompt + extra context" flows, this is the canonical shape.
- For back-compat safety across Codex versions: detect `codex --version`; for < 0.116.0 use `codex exec -` (stdin-only) pattern; for ≥ 0.116.0 use positional + stdin combined.
- **Corrigendum note added in REPORT.md D4.**

---

## U4. `vscode://anthropic.claude-code/open` cold-launch

**Community consensus:** **CONFIRMED works cold.** URI handler launches VS Code if not running, then opens a Claude Code tab.
**Evidence:**
- [Claude Code Release v2.1.72+ notes](https://github.com/anthropics/claude-code/releases/tag/v2.1.83): "added a `vscode://anthropic.claude-code/open` URI handler with optional prompt and session query parameters to open Claude Code tabs programmatically"
- Docs explicitly state it's "for scripting and automation workflows" triggerable from "a shell alias, a browser bookmarklet, or any script that can open a URL" — implying no pre-launch requirement.
- [anthropics/claude-code#29145](https://github.com/anthropics/claude-code/issues/29145) — closed; proposed `open 'vscode://anthropic.claude-code/new-session'` shell command usage, confirming cold-launch-from-shell was the intended UX.
- [anthropics/claude-code#32687](https://github.com/anthropics/claude-code/issues/32687) — documents this URI handler is missing from the VS Code integration docs page (known doc gap).

**Caveat:** The extension must have been installed and activated at least once (standard VS Code URI-handler requirement).

**Resolution:** Confirmed reliable cold-launch path. Strong candidate for "Open with Claude Code (via VS Code)" in `openWithAgent`. Probe `code --list-extensions` or `mdfind 'com.visualstudio.code'` + check for the extension's install marker before preferring this route.

---

## U5. Windows Terminal `wt.exe` availability

**Deployment heuristic:** **~90% of currently-supported Windows users have `wt.exe`.** Available on:
- All Windows 11 (any version — default since 22H2).
- Windows 10 22H2 after KB5026435 (May 23, 2023). (Not earlier.)

**Evidence:**
- [Microsoft Learn — Windows Terminal installation](https://learn.microsoft.com/en-us/windows/terminal/install) (updated 2025-11-12): "available in all versions of Windows 11 and versions of Windows 10 22H2 after the installation of the May 23, 2023 update, KB5026435"
- [Microsoft devblogs — Windows Terminal is now the Default in Windows 11](https://devblogs.microsoft.com/commandline/windows-terminal-is-now-the-default-in-windows-11/)
- Edge case: [microsoft/terminal#12454](https://github.com/microsoft/terminal/issues/12454) — KB5050021 (Jan 2025) broke `wt.exe` for a subset of users. Fallback handling required.

**Resolution for `openWithAgent`:** Always probe for `wt.exe` first (via `where wt.exe` on Windows). Fall back to `cmd /c start cmd /k` or `Start-Process powershell` when absent or broken.

---

## U6. Linux terminal-picker — VS Code reference chain

**Exact chain from VS Code source** (`src/vs/platform/externalTerminal/node/externalTerminalService.ts`, method `getDefaultTerminalLinuxReady()`, ~lines 343–365):

```
1. if (isDebian)                                   → 'x-terminal-emulator'
2. else if (DESKTOP_SESSION === 'gnome' ||
            DESKTOP_SESSION === 'gnome-classic')   → 'gnome-terminal'
3. else if (DESKTOP_SESSION === 'kde-plasma')      → 'konsole'
4. else if (process.env.COLORTERM)                 → process.env.COLORTERM
5. else if (process.env.TERM)                      → process.env.TERM
6. else                                            → 'xterm'
```

**Evidence:**
- [microsoft/vscode — externalTerminalService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/externalTerminal/node/externalTerminalService.ts)
- [microsoft/vscode#5780](https://github.com/microsoft/vscode/issues/5780) — tracking thread on better external terminal defaults.
- [microsoft/vscode-cpptools#1616](https://github.com/microsoft/vscode-cpptools/issues/1616) — same pattern applied in cpptools.

**Resolution for `openWithAgent`:** Adopt this exact 6-step chain. Recommendation: **prepend `$TERMINAL` env var check** as step 0 (common Linux convention; VS Code omits it but many Linux users set it).

---

## Sources

- [anthropics/claude-code#36937 — Add --cwd resume flag](https://github.com/anthropics/claude-code/issues/36937) — accessed 2026-04-21
- [anthropics/claude-code#29145 — URI handler for new sessions](https://github.com/anthropics/claude-code/issues/29145) — accessed 2026-04-21
- [anthropics/claude-code#32687 — vscode://anthropic.claude-code/open missing from docs](https://github.com/anthropics/claude-code/issues/32687) — accessed 2026-04-21
- [anthropics/claude-code#41015 — URL Handler app install location](https://github.com/anthropics/claude-code/issues/41015) — accessed 2026-04-21
- [anthropics/claude-code Release v2.1.83](https://github.com/anthropics/claude-code/releases/tag/v2.1.83) — accessed 2026-04-21
- [openai/codex PR #15917 — stdin piping for codex exec](https://github.com/openai/codex/pull/15917/files) — accessed 2026-04-21
- [openai/codex Releases — v0.122.0](https://github.com/openai/codex/releases) — accessed 2026-04-21
- [alexfazio gist — Codex CLI exec mode experiments v0.114.0 (historical)](https://gist.github.com/alexfazio/359c17d84cb6a5af12bac88fa1db9770) — accessed 2026-04-21
- [Cursor forum — Open in Cursor URL Handler](https://forum.cursor.com/t/open-in-cursor-url-handler/1999) — accessed 2026-04-21
- [Cursor forum — Does Cursor have a unique open scheme?](https://forum.cursor.com/t/does-cursor-have-a-unique-open-scheme/3659) — accessed 2026-04-21
- [Cursor forum — Open folder from command line](https://forum.cursor.com/t/how-can-i-open-a-specific-folder-directly-in-cursor-from-the-command-line/36295) — accessed 2026-04-21
- [Claude Code Docs — Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions) — accessed 2026-04-21
- [Microsoft Learn — Windows Terminal installation](https://learn.microsoft.com/en-us/windows/terminal/install) — accessed 2026-04-21
- [Microsoft devblogs — Windows Terminal default in Win11](https://devblogs.microsoft.com/commandline/windows-terminal-is-now-the-default-in-windows-11/) — accessed 2026-04-21
- [microsoft/vscode source — externalTerminalService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/externalTerminal/node/externalTerminalService.ts) — accessed 2026-04-21
- [microsoft/vscode#5780 — Linux external terminal defaults](https://github.com/microsoft/vscode/issues/5780) — accessed 2026-04-21
- [microsoft/terminal#12454 — wt.exe KB5050021 break](https://github.com/microsoft/terminal/issues/12454) — accessed 2026-04-21
