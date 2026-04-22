# Evidence: D1 — Cursor Launch Surface

**Dimension:** Cursor — URL scheme + CLI launch surface
**Date:** 2026-04-21
**Sources:** cursor.com/docs, forum.cursor.com, Cursor GitHub Releases, DeepWiki, Proofpoint

---

## Key files / pages referenced

- https://cursor.com/docs/integrations/deeplinks — official `cursor://` scheme documentation
- https://cursor.com/docs/cli/overview — CLI landing page
- https://cursor.com/docs/cli/installation — install scripts for agent CLI
- https://cursor.com/docs/cli/reference/parameters — full flag reference for the headless `agent` CLI
- https://cursor.com/docs/cli/headless — headless usage
- https://cursor.com/docs/context/mcp/install-links — MCP install via deeplink
- https://cursor.com/docs/configuration/shell — "Install 'cursor' command in PATH" shell helper
- https://forum.cursor.com/t/open-in-cursor-url-handler/1999 — community thread on inherited `cursor://file/...`
- https://forum.cursor.com/t/new-deep-link-to-trigger-agent-requests/108832 — declined feature request for auto-run prompt URL
- https://forum.cursor.com/t/deeplink-createchat/101127 — private-key `createchat` path (not public API)
- https://forum.cursor.com/t/cursor-deep-links-to-wsl-files-no-longer-reuse-the-existing-cursor-wsl-window-and-now-open-a-new-window/158160 — WSL regression 3.1.15
- https://formulae.brew.sh/cask/cursor-cli — Homebrew cask for the `agent` CLI
- https://www.proofpoint.com/us/blog/threat-insight/cursorjack-weaponizing-deeplinks-exploit-cursor-ide — CVE-2025-54133 / CVE-2025-54136

---

## Findings

### Finding: Cursor registers a native `cursor://` URL scheme with documented `anysphere.cursor-deeplink/*` paths
**Confidence:** CONFIRMED
**Evidence:** https://cursor.com/docs/integrations/deeplinks

Documented surface:

```
cursor://anysphere.cursor-deeplink/prompt?text=<url-encoded>
cursor://anysphere.cursor-deeplink/command?name=<n>&text=<t>
cursor://anysphere.cursor-deeplink/rule?name=<n>&text=<t>
cursor://anysphere.cursor-deeplink/mcp/install?name=<n>&config=<base64>
```

- **Prompt deeplink pre-fills chat but does NOT auto-execute** — by design. Cursor explicitly declined a feature request for auto-execution, citing poisoned-link attack surface (see Declined request source).
- **Payload cap: 8,000 characters post-URL-encoding.**
- On Linux the handler is `x-scheme-handler/cursor` via `.desktop` file; macOS via `CFBundleURLSchemes`; Windows via registry HKCR\cursor — all standard registrations done by the app installer.
- A parallel web scheme `https://cursor.com/link/...` exists as a graceful fallback when the app isn't installed: clicking it lands on a Cursor web page that offers to import the payload.

**Implications:** This is the cleanest protocol-level handoff of any of the five agents. Seed-prompt + user-confirm flow is exactly the shape `openWithAgent(..., prompt)` wants for a GUI agent app. Cap (8K) is generous relative to Windows ShellExecute's ~2K limit (see D7.1) — effective cap is ~2K on Windows-delivered URLs.

### Finding: Two CLI binaries ship under the "cursor" brand — editor-launch `cursor` and headless agent `agent` — and they are distinct
**Confidence:** CONFIRMED
**Evidence:** https://cursor.com/docs/cli/overview, https://cursor.com/docs/cli/reference/parameters, https://cursor.com/docs/configuration/shell

**(A) `cursor` editor-launch CLI** — VS Code-compatible shim. NOT on PATH by default. User must run Command Palette → "Shell Command: Install 'cursor' command in PATH". Flags inherited from VS Code: `cursor .`, `cursor <path>`, `-g/--goto FILE:LINE[:COL]`, `-d/--diff a b`, `-m/--merge`, `-a/--add`, `-n/--new-window`, `-r/--reuse-window`, `-w/--wait`. **Does NOT accept a prompt for the agent via argv/stdin/env.**

**(B) `agent` headless CLI** — installed via `curl https://cursor.com/install -fsSL | bash` (macOS/Linux/WSL) or `irm 'https://cursor.com/install?win32=true' | iex` (Windows). Binary at `~/.local/bin` — user adds to PATH manually. **Accepts prompts:**

```
agent "<prompt>"
agent -p "<prompt>"              # print/headless
agent --workspace <dir> -p "..." # set cwd
agent --mode plan|ask|agent
agent --output-format text|json|stream-json
agent --resume [chatId]
agent --continue
agent --sandbox enabled|disabled
agent --api-key ...              # or CURSOR_API_KEY env
```

Requires paid Cursor subscription. Terminal-only — does not open the desktop IDE.

**Implications:** For "Open with Cursor" with a prompt:
- **IDE + prompt:** two-step — `cursor <dir>` + `shell.openExternal("cursor://...prompt?text=...")`.
- **Headless + prompt:** single-step — `spawn("agent", ["--workspace", dir, "-p", prompt])`, but requires terminal wrapper and subscription gate.

### Finding: `cursor://file/<abs-path>` works but is undocumented (inherited from VS Code)
**Confidence:** CONFIRMED OBSERVED, UNDOCUMENTED
**Evidence:** https://forum.cursor.com/t/open-in-cursor-url-handler/1999, https://deepwiki.com/rinadelph/123/5-cursor-deeplink:-uri-handling-system

```
cursor://file/<abs-path>[:line[:col]]
cursor://vscode-remote/wsl+<distro><path>:<line>:<col>
```

VS Code parent project documents `vscode://file/<path>`. Cursor inherits the URI handler pipeline as a fork, so the same route responds to `cursor://`. **Cursor's own docs do not mention this path.** WSL variant regressed in 3.1.15 — deep links now open a new window instead of reusing the WSL one.

**UNCERTAIN:** Whether `cursor://file/<dir-path>` opens a folder (vs. only accepting file paths). VS Code's spec limits `file/` to files; folder-open typically uses `cursor <dir>` via the CLI instead.

### Finding: `cursor://anysphere.cursor-deeplink/createchat?data=...` is staff-only (private JWT key)
**Confidence:** CONFIRMED (rejected as public API)
**Evidence:** https://forum.cursor.com/t/deeplink-createchat/101127

Observed in Cursor BugBot's outbound links. Cursor staff (Dan Perks) explicitly declined to publish it as a third-party API — uses a private JWT key — citing "someone could poison a link to complete a malicious action". Do not rely on this path.

### Finding: Auto-run prompt URL was formally rejected for security
**Confidence:** CONFIRMED
**Evidence:** https://forum.cursor.com/t/new-deep-link-to-trigger-agent-requests/108832

Feature request for a URL that would fire a prompt into the agent without user confirmation was closed as declined. The sanctioned surface (`/prompt?text=...`) always pauses for human review.

**Implications for `openWithAgent`:** Our "Open with Cursor + prompt" button always requires a user click on Cursor's own confirmation dialog. This is a feature, not a bug — it matches the shape required by the target app's security posture.

### Finding: Platform matrix — first-class macOS/Windows, manual Linux
**Confidence:** CONFIRMED
**Evidence:** Cursor docs + Homebrew cask

| Platform | `cursor` (editor CLI) | `agent` (headless CLI) | `cursor://` scheme |
|---|---|---|---|
| macOS | Command Palette install → `/usr/local/bin/cursor` | `curl ... \| bash` or `brew install --cask cursor-cli`; `~/.local/bin/agent` | auto-registered via LaunchServices |
| Windows | PATH checkbox in installer; `cursor.cmd` / `cursor.exe` under `%LOCALAPPDATA%\Programs\cursor\` | `irm ... \| iex`; manual PATH step | auto-registered in HKCR |
| Linux | Manual shell function or symlink (AppImage has no auto-PATH step) | `curl ... \| bash`; `~/.local/bin/agent` | `.desktop` file with `MimeType=x-scheme-handler/cursor` |

### Finding: Modern deeplink-weaponization CVEs targeting Cursor
**Confidence:** CONFIRMED
**Evidence:** https://www.proofpoint.com/us/blog/threat-insight/cursorjack-weaponizing-deeplinks-exploit-cursor-ide

- **CVE-2025-54133** — deeplink allowed hiding command args from the install dialog.
- **CVE-2025-54136** — persistent-privilege MCP install via deeplink, survives restart.

**Implications:** Our `openWithAgent` wrapper should surface the full URL payload in the UI before dispatching when prompt length exceeds N chars. The Cursor CVEs show that confirmation dialogs that don't display the full payload get weaponized. (See D7.4.)

---

## Negative searches (NOT FOUND)

- Searched Cursor docs + forum for "cursor:// auto-execute" / "run prompt without confirmation" → only declined feature requests returned. CONFIRMED absence.
- Searched for `cursor --prompt`, `cursor --message`, `cursor -m "prompt"` in editor CLI → no documentation; flag set matches VS Code's `code` binary, none of which seed a prompt.
- Searched for VS Code's `code --command <id>` analog in Cursor → NOT FOUND.
- Searched for `cursor://git/clone?url=...` or similar clone-and-open route → forum question unanswered by staff; no docs. NOT FOUND.

---

## Gaps / follow-ups

- **Empirical test needed:** Does `cursor://file/<dir-path>` open a folder on macOS/Windows/Linux? Our current confidence is UNCERTAIN — verify during `/spec` implementation.
- **Empirical test needed:** Behavior when Cursor isn't installed — docs describe `https://cursor.com/link/...` as the fallback, but the hand-off shape ("open https URL if cursor:// fails") is community pattern, not explicit contract.
- **Version drift:** 3.1.15 WSL regression — if we ship before a fix, Windows users hitting WSL paths will get duplicate windows. Track https://forum.cursor.com/t/cursor-deep-links-to-wsl-files-no-longer-reuse-the-existing-cursor-wsl-window-and-now-open-a-new-window/158160 for resolution.
