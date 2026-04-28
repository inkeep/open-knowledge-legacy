# Evidence: Claude Code (Anthropic)

**Dimension:** Claude Code ecosystem — CLI + desktop + IDE extensions + JetBrains
**Date:** 2026-04-24
**Sources:** Anthropic docs (code.claude.com), public GitHub issues at anthropics/claude-code, npm registry, local filesystem inspection on the authoring machine.

---

## Key files / pages referenced

- [Advanced setup — Claude Code Docs](https://code.claude.com/docs/en/setup) — install surfaces, update mechanism, uninstall paths
- [Get started with the desktop app](https://code.claude.com/docs/en/desktop-quickstart) — explicit coexistence language
- [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code) — IDE lockfile + MCP auto-discovery
- [`@anthropic-ai/claude-code` on npm](https://www.npmjs.com/package/@anthropic-ai/claude-code)
- [GH #25075 — Claude Desktop Installer Hijacks Claude Code CLI Command (Windows)](https://github.com/anthropics/claude-code/issues/25075) — closed "not planned"
- [GH #51860 — Orphaned claude-code CLI from desktop app](https://github.com/anthropics/claude-code/issues/51860)
- [GH #23749 — Native binary auto-updater serves wrong version](https://github.com/anthropics/claude-code/issues/23749)
- [GH #27527 — MCP configuration CLI vs Desktop confusion](https://github.com/anthropics/claude-code/issues/27527)
- [CVE-2025-52882 — WebSocket auth bypass in Claude Code extensions (Datadog Security Labs)](https://securitylabs.datadoghq.com/articles/claude-mcp-cve-2025-52882/)
- Local filesystem: `~/.local/bin/claude`, `~/.local/share/claude/versions/{2.1.117,2.1.118,2.1.119}/`, `~/.claude/{ide,sessions,settings.json,...}`, `/Applications/Claude.app`, `~/Library/Application Support/Claude/claude-code/2.1.111/` — all accessed 2026-04-24.

---

## Findings

### Finding D1 — Claude Code ships across 7+ install surfaces, all converging on `~/.claude/`

**Confidence:** CONFIRMED
**Evidence:** Docs + local filesystem inspection.

| Surface | Binary path (macOS) | State dir |
|---|---|---|
| Native installer (`curl ... \| bash`) | `~/.local/bin/claude` → `~/.local/share/claude/versions/<ver>/` | `~/.claude/` |
| npm (`@anthropic-ai/claude-code`) | `$(npm prefix -g)/bin/claude` (via per-platform binary optional-dep, e.g. `@anthropic-ai/claude-code-darwin-arm64`) | `~/.claude/` |
| Homebrew cask `claude-code` | homebrew-managed | `~/.claude/` |
| Desktop app (DMG) | `~/Library/Application Support/Claude/claude-code/<ver>/` — **not** exported to PATH | `~/Library/Application Support/Claude/` **plus** `~/.claude/` |
| VS Code / Cursor extension (`anthropic.claude-code`) | Bundles its own CLI; invokes in-process | `~/.vscode/globalStorage/anthropic.claude-code/` + `~/.claude/` |
| JetBrains plugin (id 27310) | Requires separately-installed CLI on PATH | `~/.claude/` |
| Linux apt/dnf/apk, WinGet | Platform-native | `~/.claude/` (or `%USERPROFILE%\.claude\` on Windows) |

**Implication:** every surface converges on the same `~/.claude/` user state dir, regardless of how the binary got installed. Setup docs make this explicit: *"The VS Code extension, the JetBrains plugin, and the Desktop app also write to `~/.claude/`. If any of them is still installed, the directory is recreated the next time it runs."*

### Finding D2a — Shared state dir `~/.claude/` is the de facto coordination surface

**Confidence:** CONFIRMED
**Evidence:** Docs + local inspection of `~/.claude/` on the authoring machine.

```
~/.claude/
  settings.json              ← shared across CLI + desktop-bundled CLI + extension
  CLAUDE.md                  ← user global instructions
  ide/<pid>.lock             ← IDE↔CLI auto-discovery lockfile (see D2b)
  sessions/<pid>.json        ← per-live-CLI session registry
  projects/<slug>/           ← per-project memory + logs
  plugins/, skills/, agents/, tasks/, todos/
  telemetry/, statsig/
  shell-snapshots/, file-history/, paste-cache/, cache/, backups/
  statusline.sh, plans/, debug/, reports/
```

Uninstall guidance ([setup docs §"Remove configuration files"](https://code.claude.com/docs/en/setup)) notes that deleting `~/.claude/` plus the peer file `~/.claude.json` (mix of OAuth session material and certain settings that cannot be moved to `settings.json`) resets *"all your settings, allowed tools, MCP server configurations, and session history"* regardless of which install re-created it.

### Finding D2b — `~/.claude/ide/<pid>.lock` is an auto-discovery mechanism, not a cross-install coordination lock

**Confidence:** CONFIRMED
**Evidence:** [VS Code docs §"The built-in IDE MCP server"](https://code.claude.com/docs/en/vs-code), [CVE-2025-52882 disclosure](https://securitylabs.datadoghq.com/articles/claude-mcp-cve-2025-52882/), local files on authoring machine (e.g., `~/.claude/ide/19261.lock`, `35715.lock`).

When a VS Code / Cursor / JetBrains IDE with the Claude Code extension opens, the extension:
1. Opens a loopback WebSocket MCP server.
2. Writes `~/.claude/ide/<pid>.lock` containing `{pid, workspaceFolders, ideName, transport, authToken}`.
3. A `claude` CLI process launched inside that workspace cwd reads `~/.claude/ide/` and auto-attaches to the matching PID's WebSocket.

```text
# Observed locally: ~/.claude/ide/35715.lock (fields summarized)
{
  "pid": 35715,
  "workspaceFolders": ["/Users/andrew/Documents/code/..."],
  "ideName": "Cursor",
  "transport": "ws",
  "authToken": "<redacted>"
}
```

**Implications:** note what this lockfile does *not* do:
- It doesn't coordinate *which version* of Claude Code is running. Two coexisting CLIs at different versions would each write their own lockfile; whichever spawned first in the workspace is what a new CLI attaches to.
- It doesn't exclude anything. Multiple IDEs open in the same workspace will each write their own lockfile; the CLI just picks one.
- The auth token it carries is the *fix* for CVE-2025-52882, not the attack surface: pre-patch Claude Code extensions ran an **unauthenticated** WebSocket MCP server on localhost where any loaded webpage could connect. The lockfile `{authToken}` field was introduced in v1.0.24+ as the capability gate closing that hole. The lockfile-based scheme makes the on-disk file a sensitive credential, but it's the remediation, not the vulnerability.

### Finding D2c — Per-live-CLI registry at `~/.claude/sessions/<pid>.json`

**Confidence:** CONFIRMED
**Evidence:** Local filesystem. Six concurrent `sessions/<pid>.json` files observed (pids 55400, 77520, 93452, 28190, 2110, 80615) — one per live CLI process, each carrying `{pid, sessionId, cwd, startedAt, procStart, version, peerProtocol, kind, entrypoint, status, updatedAt}`.

**Implications:** every live CLI stamps its own version and entrypoint into a per-PID file. This means Anthropic *knows* how to track live-CLI identity — they just don't *gate* anything on it. Multiple CLIs at different versions coexist in one `~/.claude/sessions/` dir with no mutual-exclusion or version handshake.

### Finding D2d — No documented cross-surface mutual-exclusion lock

**Confidence:** NOT FOUND
**Evidence:** Negative search. Searched setup docs, desktop-quickstart docs, `anthropics/claude-code` issues for "lockfile", "coordination", "version handshake", "mutual exclusion", "collision". No result.

Desktop quickstart in fact *advertises* parallel sessions: *"Open parallel sessions from the sidebar… each in its own Git worktree."* Concurrent CLI + desktop app on the same project is an advertised feature.

### Finding D3a — Per-install versions float independently; cross-install drift is routine

**Confidence:** CONFIRMED
**Evidence:** Local filesystem on authoring machine.

- Native installer: `~/.local/bin/claude` → `~/.local/share/claude/versions/2.1.119/` (latest symlinked; 2.1.117 + 2.1.118 retained as rollback buffer).
- Desktop-bundled CLI: `~/Library/Application Support/Claude/claude-code/2.1.111/` — eight patch versions behind the native installer's CLI on the same machine.

Both versions read and write the same `~/.claude/settings.json` without documented breakage. This is the everyday state of a Claude Code + Claude Desktop user.

### Finding D3b — No documented reconciliation mechanism

**Confidence:** CONFIRMED — for what exists. NOT FOUND — for any reconciliation.
**Evidence:** Setup docs describe `autoUpdatesChannel: latest | stable` and `minimumVersion` *for the native CLI*; nothing applies those to the desktop-bundled CLI.

*"Native installations automatically update in the background… Homebrew, WinGet, and Linux package manager installations require manual updates."* Desktop app's auto-updater bumps the bundled CLI with the app, but is not cross-coordinated with standalone installs.

Schema-drift risk is acknowledged at the config level: *"Some settings are stored in `~/.claude.json` rather than `settings.json`, and adding them to settings.json will trigger a schema validation error"* ([setup docs](https://code.claude.com/docs/en/setup)). But no version-refuse-to-run is documented at the binary or state-dir level.

### Finding D4a — Launch precedence is pure shell PATH order

**Confidence:** CONFIRMED
**Evidence:** Docs + local inspection.

Docs do not arbitrate between install paths. `which claude` on the authoring machine returned `~/.local/bin/claude` (native installer) — because npm-global isn't installed, homebrew isn't installed, and the desktop app doesn't export anything to PATH on macOS.

### Finding D4b — Windows Claude Desktop hijacks the `claude` CLI command — closed "not planned"

**Confidence:** CONFIRMED
**Evidence:** [GH #25075](https://github.com/anthropics/claude-code/issues/25075).

On Windows, installing Claude Desktop places `Claude.exe` in `%LOCALAPPDATA%\Microsoft\WindowsApps\` — a directory Windows PATH priority puts *ahead* of `%APPDATA%\npm\` (where npm-installed Claude Code CLI lives). Net effect: after installing the desktop app, a user's previously-working `claude` CLI command silently resolves to the desktop-app executable instead of the CLI.

Anthropic closed the issue **"not planned"**. Documented workaround: delete the WindowsApps shim.

### Finding D4c — macOS desktop does NOT export the bundled CLI to PATH

**Confidence:** CONFIRMED (local inspection) / INFERRED (doc absence)
**Evidence:** Local filesystem on authoring machine: `/Applications/Claude.app` exists; no symlink at `/usr/local/bin/claude` or `~/.local/bin/claude` pointing to it. `which claude` resolves to the native-installer binary, not the app bundle. Desktop quickstart explicitly says *"install the CLI separately"* to use from the terminal.

This is the **key asymmetry** with the Windows hijack: the same design choice (ship a `claude` binary inside the `.app`) produces very different default-PATH outcomes because macOS doesn't do anything to register it.

### Finding D5 — Each install path auto-updates independently; no cross-coordination

**Confidence:** CONFIRMED
**Evidence:** Setup docs + [GH #23749](https://github.com/anthropics/claude-code/issues/23749) (auto-updater bug reporting shows the updater is single-threaded per install).

| Install | Auto-update? | Cross-coord? |
|---|---|---|
| Native installer | Yes (startup + periodic; atomically flips symlink) | No |
| npm | `claude update` works (same native updater under hood) | No |
| Homebrew | `brew upgrade` | No |
| WinGet / apt / dnf / apk | System package manager | No |
| Desktop app | Bundled Electron auto-updater; bumps bundled CLI with the app | No cross-coordination |
| VS Code extension | VS Code Marketplace decides; bundles CLI | No cross-coordination |

`DISABLE_AUTOUPDATER=1` (background checks) and `DISABLE_UPDATES=1` (manual `claude update` too) are the per-install kill switches. No system-wide equivalent.

### Finding D6 — `~/.claude/` has no on-disk schema-version marker

**Confidence:** CONFIRMED
**Evidence:** Local filesystem inspection; `settings.json` references `"$schema": "https://json.schemastore.org/claude-code-settings.json"` (a JSON Schema URL for validation, not a stored schema version).

**Implication:** Anthropic relies on forward/backward-compatible JSON — unknown fields tolerated, known fields stable. No binary refuses to read the directory based on a version stamp.

### Finding D7 — Docs position native installer as recommended; desktop as graphical shell around the same product

**Confidence:** CONFIRMED
**Evidence:** Setup docs tab ordering (Native Install tab first, labeled "Recommended"; Homebrew and WinGet secondary; npm listed under "Advanced installation options"). Desktop quickstart frames the app as *"a graphical interface for Claude Code"* — the same product, different shell — with explicit guidance that CLI and desktop can coexist and share config.

---

## Negative searches (for NOT FOUND)

- **"Cross-surface mutual-exclusion lock":** Searched docs + `anthropics/claude-code` issues for `lockfile`, `coordination`, `version handshake`, `mutual exclusion`, `collision`. No result. (Per-PID IDE lockfile and session registry exist; they are not mutual-exclusion locks.)
- **"Schema-version marker in `~/.claude/`":** Local inspection + doc review. Only `$schema` URL in `settings.json`, which is a validation pointer, not a stored schema version.
- **"macOS desktop adds `claude` to PATH":** No documentation states this. Local inspection shows it does not.

---

## Gaps / follow-ups

- **Desktop auto-updater mechanism** not named in public docs. Electron Squirrel-style INFERRED; not confirmed by primary source.
- **PATH order when both npm-global and native installer are present on macOS** — not documented; expected to be pure shell PATH order.
- **Whether `~/.claude/settings.json` is guaranteed forward-compatible across Claude Code versions** — observed empirically to work (2.1.111 + 2.1.119 coexist on the authoring machine), but no published compatibility guarantee.
- **Schema-drift between Claude Desktop's `claude_desktop_config.json` and Claude Code's MCP config** — surfaced as user confusion in [GH #27527](https://github.com/anthropics/claude-code/issues/27527) — has its own coordination surface that's out of scope for the cross-install binary-version question.
- **Orphan child processes ([GH #51860](https://github.com/anthropics/claude-code/issues/51860))** — desktop-spawned CLI children can outlive the desktop parent on macOS, holding OAuth tokens via env vars. A lifecycle-coordination failure worth noting for any tool building a similar model.
