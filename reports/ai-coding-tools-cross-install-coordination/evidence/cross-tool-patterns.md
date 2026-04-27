# Evidence: cross-tool patterns (synthesis layer)

**Dimension:** Patterns and divergences across the six surveyed tools. This is a synthesis evidence file — it draws on the three per-tool-family files, not primary sources of its own. Use it to source REPORT.md's cross-cutting claims; use the per-tool files for tool-specific citations.
**Date:** 2026-04-24
**Sources:** `claude-code.md`, `vscode-family.md`, `zed-warp.md` (same directory).

---

## The four coordination strategies observed

Every surveyed tool falls into one (or a mix) of these four strategies for handling coexisting install paths. No tool uses a true runtime cross-install version handshake.

| Strategy | How it works | Cost of a miss | Tools using it |
|---|---|---|---|
| **Build-time namespacing** | Different builds have different `applicationName`/`dataFolderName`/`bundleIdentifier`. Coexistence solved by not sharing anything. | Downstream forks that *reuse* an upstream namespace (Cursor's `code.cmd` on Windows) create the collision the pattern was meant to prevent. | VS Code (Stable/Insiders/OSS), Cursor (`cursor`), Windsurf (`windsurf`) |
| **Shared state directory with forward-compat JSON** | All install paths write to the same user-scope dir; rely on fields being additive. No schema version stamped. | Silent schema drift if a newer binary writes fields the older can't parse; no documented failure mode. | Claude Code (`~/.claude/`), Zed (`~/Library/Application Support/Zed/` — shared across Stable/Preview/Nightly) |
| **Cloud-mediated coordination** | Authoritative state lives server-side, keyed by account. Local installs are caches that reconcile on login. | Offline or account-less use has no coordination at all; purely local collisions fall back to shell PATH. | Warp (Settings Sync), Claude Code to a lesser degree (OAuth, cloud MCP features) |
| **Bundle-relative self-discovery** | CLI binary walks to its owning `.app` via path canonicalization. Per-symlink the CLI and app version are always identical. | Tells you nothing when two different bundles both want the same symlink target — last writer wins. | Zed (CLI in `.app/Contents/MacOS/cli`), VS Code (`appRoot/bin/code`-relative shim), Claude Desktop (bundles its own CLI in `~/Library/Application Support/Claude/claude-code/<ver>/`) |

Warp's **cloud-mediated** approach is the only one that genuinely sidesteps the cross-install problem — everything else pushes it somewhere (to build time, to implicit forward-compat, to whoever wrote the symlink last). A tool that cannot send state to a server is structurally restricted to the other three strategies.

---

## Lock files exist — but none are cross-install version gates

Three tools use lock-file-like artifacts:

| Tool | Artifact | Purpose | Cross-install gate? |
|---|---|---|---|
| Claude Code | `~/.claude/ide/<pid>.lock` | IDE↔CLI auto-discovery (WebSocket MCP) | **No** — attaches to any matching-workspace PID |
| Claude Code | `~/.claude/sessions/<pid>.json` | Per-live-CLI session registry | **No** — coexistence, not exclusion |
| VS Code | `VSCODE_IPC_HOOK_CLI` (per-window Unix socket) | CLI attach to open window | **No** — per-window, not cross-install |

Claude Code's IDE lockfile is the closest artifact in the cohort to an explicit cross-surface coordination file — a JSON file with `{pid, workspace, auth}` in a user-scope dir — but it exists for discovery, not exclusion. Multiple IDEs can each write their own; the CLI picks whichever is in the workspace. The auth token in the lockfile was introduced in v1.0.24+ as the *fix* for CVE-2025-52882 (pre-patch, the WebSocket MCP server accepted any local connection with zero auth).

**No surveyed tool gates on the writer's version** before reading or attaching.

---

## Silent drift is routine, not an edge case

Every tool surveyed exhibits silent cross-install version drift as ordinary operation:

| Tool | Observed drift (one example) | How it's handled |
|---|---|---|
| Claude Code | Desktop-bundled CLI v2.1.111 vs native-installer CLI v2.1.119 on one machine | Both read `~/.claude/settings.json`; no warning, no refuse. |
| VS Code | Standalone `code` CLI v1.115 vs GUI v1.116 | **Hard refuse** at handshake (GH #310090) — the one exception. |
| Zed | Stable vs Preview on same machine | Both read `~/Library/Application Support/Zed/`; no warning, no refuse. |
| Cursor | `cursor` desktop v3.2.10 vs `cursor-agent` CLI v2026.04.17 | No shared version scheme; no handshake. |
| Windsurf | (not exercised at scale in public reports) | Namespace-isolated from VS Code; internal version drift unexercised. |
| Warp | Bundled Oz CLI vs standalone `warp-cli` → `oz` in migration | Cloud reconciles config; no local version gate. |

The VS Code case (#310090) is the **only documented hard-refuse** in the survey. Even there, the refuse comes from the binary's handshake with its counterpart, not from a shared on-disk version marker.

---

## PATH-order collisions are the most common failure mode

Every surveyed tool resolves launch-time binary precedence via **standard shell PATH order**. No tool has explicit arbitration when multiple install paths place a same-named binary on PATH. This produces a recurring class of failure:

| Incident | Platform | Tools involved | Status |
|---|---|---|---|
| Claude Desktop hijacks `claude` on Windows via `%LOCALAPPDATA%\Microsoft\WindowsApps\` | Windows | Claude Desktop vs Claude Code CLI | [Closed "not planned"](https://github.com/anthropics/claude-code/issues/25075) |
| Cursor's `code.cmd` shadows VS Code in system PATH | Windows | Cursor vs VS Code | [Unresolved](https://forum.cursor.com/t/installing-cursor-shell-command-overrides-code-as-well/39993) |
| macOS app-translocation poisoning of `/usr/local/bin/code` | macOS | VS Code (Stable + Insiders) | [GH #209356](https://github.com/microsoft/vscode/issues/209356) |
| `ln -sf` last-writer-wins in `installShellCommand` | macOS | VS Code, Cursor, Windsurf, Zed | Canonical pattern; no fix planned |
| Zed in-app `cli: install` from Preview silently replaces Stable's `/usr/local/bin/zed` | macOS | Zed Stable + Preview | Not documented as a bug |

The common thread: these are all **install-time write races**, not runtime version mismatches. The fix space is symmetric — namespace the symlink (`zed-preview`, `code-insiders`), or introduce a prompt before overwriting a foreign-written file.

---

## Schema-version markers on disk — almost universally absent

| Tool | On-disk schema marker | Notes |
|---|---|---|
| Claude Code | **None** | `settings.json` has `"$schema"` URL for validation, not version. |
| VS Code | **None** at top level | Features version their own subdirs; no global stamp. |
| Cursor | **None** | Inherited from VS Code; no additions observed. |
| Windsurf | **None observed** | Dir-inconsistency (`~/.windsurf` vs `~/.codeium/windsurf`) suggests layered history without explicit markers. |
| Zed | **None** in `paths.rs` or `db/` crate | Shared dir across channels with no guard. |
| Warp | **None documented** | Cloud schema is authoritative; local is cache. |

**Every surveyed tool relies on forward/backward-compatible data formats rather than explicit version markers.** This is operationally cheap but fails silently when forward-compat breaks. An explicit on-disk `stateSchemaVersion` marker would be novel in this cohort.

---

## Namespace divergence patterns worth noting

Three approaches to "don't clash with your siblings":

1. **Separate bundle + separate symlink name** — VS Code Insiders (`code-insiders`), Cursor (`cursor`), Windsurf (`windsurf`). Full namespace separation. Works well when tools start with separate namespaces; fails when a fork inherits upstream's command name (Cursor's `code.cmd` on Windows).
2. **Same shim name, caller-provided target** — VS Code Homebrew cask `binary "...", target: "code"`; Insiders cask `target: "code-insiders"`. The caller (brew) does the rename; the bundle doesn't know.
3. **Channel suffix at packaging time only** — Zed's Homebrew preview cask uses `target: "zed-preview"`. The in-app `cli: install` hardcodes `zed` regardless of channel. So the disambiguation only works if users stay on brew and never run the palette action.

The third pattern (partial disambiguation) is a documented footgun in Zed: `cli: install` from Preview silently replaces Stable's symlink.

---

## Self-update coordination — zero cross-install awareness

Every tool auto-updates its own install path independently. **No surveyed tool detects or warns when a coexisting install is stale.**

- Claude Code has per-install env kill-switches (`DISABLE_AUTOUPDATER=1`, `DISABLE_UPDATES=1`) — per-install, not system-wide.
- VS Code runs per-build Squirrel.Mac agents (`com.microsoft.VSCode.ShipIt` vs `com.microsoft.VSCodeInsiders.ShipIt`) — independent.
- Zed auto-updates via its own in-process updater; CLI-in-bundle means symlinks pointing into the bundle are implicitly bumped.
- Cursor delegates to ToDesktop (third-party); `cursor-agent` brew cask updates independently.
- Warp app + bundled CLI update together (if symlinked; UNCERTAIN if copied); standalone `warp-cli`/`oz` updates via brew.

The closest thing to cross-install awareness is **Warp's cloud-sync** — not a version gate, but a way to reconcile *configuration* across installs regardless of binary version.
