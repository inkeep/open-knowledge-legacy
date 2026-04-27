---
title: "Cross-Install Coordination in AI Coding Tools: How Claude Code, Cursor, Windsurf, Zed, Warp, and VS Code Handle Coexisting DMG ↔ CLI ↔ IDE-Extension Installs"
description: "Factual landscape across six AI-era coding tools on how they coordinate — or don't — when a user has multiple install paths (DMG + npm/brew CLI + IDE extension) on one machine. Covers install-surface maps, cross-install coordination mechanisms (lock files, IPC, shared state dirs, cloud sync), version-drift handling, launch-time binary precedence, self-update behavior, shared-state directory conventions, and vendor messaging. Primary sources: open-source repos (microsoft/vscode, zed-industries/zed), vendor documentation, Homebrew cask files, public issue trackers, and local filesystem inspection."
createdAt: 2026-04-24
updatedAt: 2026-04-24
subjects:
  - Claude Code
  - Anthropic
  - Cursor
  - Windsurf
  - Codeium
  - Zed
  - Warp
  - Visual Studio Code
  - Microsoft
  - Electron
  - Homebrew
topics:
  - cross-install coordination
  - version-drift handling
  - DMG + CLI coexistence
  - shared-state directories
  - schema-version markers
  - lock files
  - PATH-order collisions
  - build-time namespacing
  - cloud-sync state
---

# Cross-Install Coordination in AI Coding Tools

**Purpose:** This report surveys how six AI coding tools — Claude Code, VS Code, Cursor, Windsurf, Zed, Warp — handle the specific case where a user has multiple install paths coexisting on one machine (typically a native desktop app alongside a separately-installed CLI). The adjacent question of *how* a DMG installs a CLI onto PATH is already covered in [`electron-bundled-cli-install-patterns`](../electron-bundled-cli-install-patterns/REPORT.md); this report picks up from there and documents coordination mechanisms (or their absence) between coexisting installs: shared state dirs, lock files, version handshakes, launch-time precedence, and self-update behavior.

---

## Executive Summary

**No surveyed tool uses a shared-state-mediated cross-install version handshake.** Across Claude Code, Cursor, Windsurf, Zed, Warp, and VS Code, coordination between coexisting install paths falls into one of four strategies — none of which read a shared on-disk version marker before acting. The one documented runtime version check in the cohort (VS Code GUI ↔ standalone CLI in [vscode#310090](https://github.com/microsoft/vscode/issues/310090)) is a direct handshake between the two binaries that fails closed, not a disk-state-mediated gate.

Four strategies observed:

1. **Build-time namespacing (VS Code lineage).** VS Code, Cursor, and Windsurf solve coexistence by never sharing anything: different `applicationName` / `dataFolderName` / `darwinBundleIdentifier` per build. The runtime code does not know about peer installs; the namespaces do not collide because they were made distinct at compile time.
2. **Shared state directory with forward-compatible JSON (Claude Code, Zed).** All install paths write to the same user-scope directory (`~/.claude/`, `~/Library/Application Support/Zed/`). No schema-version marker is stamped on disk. Silent drift — different binary versions reading and writing the same state — is the everyday state of operation.
3. **Cloud-mediated coordination (Warp).** An authoritative state lives server-side, keyed by account. Local installs are caches that reconcile at login. Only strategy that genuinely sidesteps the local cross-install problem.
4. **Bundle-relative self-discovery (Zed, VS Code shim, Claude Desktop).** The CLI binary walks parent dirs until it finds its owning `.app`, then exec's the peer inside that bundle. Per-symlink the CLI and app version are always identical — but tells you nothing when two different bundles race for the same symlink.

**Two failure modes recur across the cohort:**

- **PATH-order collisions are the canonical cross-install failure.** Closed-"not-planned" Claude Desktop hijacking `claude` on Windows, Cursor's `code.cmd` shadowing VS Code on Windows, VS Code's `ln -sf` last-writer-wins pattern, Zed's Preview `cli: install` silently replacing Stable's symlink — all of these are the same shape: two tools write to the same PATH location without runtime arbitration.
- **Silent version drift between coexisting installs is routine, not an edge case.** The authoring machine for this report has Claude Code native-installer v2.1.119 and Claude Desktop's bundled CLI v2.1.111 on the same system, both reading the same `~/.claude/settings.json`. No surveyed tool warns, blocks, or reconciles this — with one exception.

**The single documented hard-refuse** on cross-install version mismatch in the cohort is VS Code's standalone `code` CLI rejecting a v1.115 handshake against a v1.116 GUI ([microsoft/vscode#310090](https://github.com/microsoft/vscode/issues/310090)). That refuse comes from the binary's handshake with its counterpart, not from a shared on-disk version marker.

**Key Findings:**

- **Lock files exist in the cohort — but none are cross-install version gates.** Claude Code's `~/.claude/ide/<pid>.lock` and `~/.claude/sessions/<pid>.json`, VS Code's `VSCODE_IPC_HOOK_CLI` — each serves discovery / attach, not exclusion or version-matching.
- **Every surveyed tool relies on forward/backward-compatible JSON rather than explicit schema versions on disk.** Claude Code's `settings.json` has a `$schema` URL for validation, not a stored version; Zed's `db/` crate has no version probe; VS Code's `product.json` data folder has no top-level stamp.
- **Self-update coordination across installs is zero.** Every install path updates through its own channel (in-process auto-updater, system package manager, or manual). No tool detects or warns when a coexisting install is stale. Warp's cloud-sync resolves *configuration* drift but not binary version mismatch.
- **Namespace divergence patterns correlate with lineage history.** Independent-lineage tools start with distinct namespaces and avoid collisions (Zed, Warp vs VS Code). VS Code *forks* (Cursor, Windsurf) that renamed `applicationName` cleanly at build time avoid upstream collisions on macOS but not always on Windows (Cursor forum #39993).
- **The biggest cross-install failure surface is the `/usr/local/bin/<tool>` symlink** — every tool's install logic uses `ln -sf` (VS Code) or `remove_file + symlink()` (Zed) with at most a this-is-already-my-symlink short-circuit. None detect or prompt before overwriting a foreign-written symlink.

---

## Research Rubric

Confirmed 2026-04-24. Stance: factual landscape, no 1P conclusions.

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Installation surface map per tool | Moderate | P0 |
| D2 | Cross-install coordination mechanisms | Deep | P0 |
| D3 | Version-drift handling | Deep | P0 |
| D4 | Launch-time binary precedence | Moderate | P0 |
| D5 | Self-update coordination across installs | Moderate | P1 |
| D6 | Shared-state directory conventions | Moderate | P1 |
| D7 | Vendor messaging on install choice | Light | P2 |

Subjects: Claude Code (primary), Cursor, Windsurf, Zed, Warp, VS Code (comparators).

**Non-goals (excluded by design):** Single-install mechanics (DMG→PATH symlink, `osascript` admin prompt, translocation) — already covered in [`electron-bundled-cli-install-patterns`](../electron-bundled-cli-install-patterns/REPORT.md); distribution-channel posture (npm vs Homebrew vs goreleaser) — covered in [`mastra-speakeasy-cli-install-recommendations`](../mastra-speakeasy-cli-install-recommendations/REPORT.md); Electron auto-update mechanics in isolation — covered in [`electron-desktop-app-operations-2025`](../electron-desktop-app-operations-2025/REPORT.md); non-AI-coding tools; Windows / Linux focus (macOS is the reference surface — Windows mentioned only for material divergences).

---

## Detailed Findings

### D1 — Install surface map per tool

**Finding:** Each surveyed tool supports 3-7 distinct install paths, and for every tool except Warp, multiple install paths can coexist on one machine producing the same binary name on PATH.

**Evidence:** [evidence/claude-code.md](evidence/claude-code.md), [evidence/vscode-family.md](evidence/vscode-family.md), [evidence/zed-warp.md](evidence/zed-warp.md).

| Tool | Install surfaces | Typical binary path (macOS) | State dir |
|---|---|---|---|
| **Claude Code** | Native installer (curl \| bash), npm, Homebrew cask, DMG, VS Code extension, JetBrains plugin, apt/dnf/apk, WinGet | Native: `~/.local/bin/claude`. Desktop: `~/Library/Application Support/Claude/claude-code/<ver>/` (not PATH-exported). | `~/.claude/` (shared across all surfaces) + `~/.claude.json` (OAuth) |
| **VS Code** | DMG, Homebrew cask, standalone CLI, Insiders (separate bundle) | `/usr/local/bin/code` → `Visual Studio Code.app/Contents/Resources/app/bin/code` | `~/.vscode/` + `~/Library/Application Support/Code/` |
| **Cursor** | DMG, Homebrew cask (`cursor`), separate `cursor-cli` brew cask (`cursor-agent`) | `/usr/local/bin/cursor` (via brew or in-app action); `~/.local/bin/cursor-agent` (separately) | `~/.cursor/`, `~/Library/Application Support/Cursor/`, `~/.config/cursor-agent/` (three locations) |
| **Windsurf** | DMG, Homebrew cask | `/usr/local/bin/windsurf` | `~/.windsurf/` and/or `~/.codeium/windsurf/` (inconsistent across docs + cask) |
| **Zed** | DMG (Stable/Preview/Nightly/Dev channels), Homebrew cask (`zed`, `zed@preview`), Linux install script | `/usr/local/bin/zed` → `Zed.app/Contents/MacOS/cli` | `~/Library/Application Support/Zed/` + `~/.config/zed/` (shared across channels) |
| **Warp** | DMG, Homebrew cask `warp`, Homebrew tap `warp-cli` / `oz` | `/usr/local/bin/oz` via palette OR brew tap (no auto-PATH from cask) | `~/Library/Application Support/dev.warp.Warp-Stable/` (per-channel) + cloud |

**Implications:**
- Most tools' DMG cask includes a `binary` stanza that auto-symlinks a CLI onto PATH at brew-install time — Warp is the exception (no `binary` stanza; CLI install is a separate user action).
- Claude Code has the broadest install-surface area of any surveyed tool (8 distinct paths) but keeps nearly all of them converging on `~/.claude/`.
- Cursor has **three separate state directories** within its own ecosystem (`~/.cursor/`, `~/Library/Application Support/Cursor/`, `~/.config/cursor-agent/`) — an outlier in the cohort.

**Remaining uncertainty:** Windsurf's canonical state dir is UNCERTAIN (`~/.windsurf` vs `~/.codeium/windsurf` — docs and cask disagree).

---

### D2 — Cross-install coordination mechanisms

**Finding:** Four strategies observed; none are true runtime version handshakes. The closest analog to an explicit cross-install coordination mechanism is Claude Code's IDE lockfile — which serves discovery, not exclusion.

**Evidence:** [evidence/cross-tool-patterns.md](evidence/cross-tool-patterns.md).

| Strategy | Tools | Description |
|---|---|---|
| **Build-time namespacing** | VS Code (Stable/Insiders/OSS), Cursor, Windsurf | Different `applicationName`, `dataFolderName`, `darwinBundleIdentifier` per build. Coexistence solved by not sharing anything. No runtime logic looks for peers. |
| **Shared state dir + forward-compat JSON** | Claude Code, Zed | All install paths write to the same user-scope dir; rely on fields being additive. No schema version on disk. |
| **Cloud-mediated** | Warp (primary), Claude Code (secondary) | Authoritative state lives server-side keyed by account; local is a cache. |
| **Bundle-relative self-discovery** | Zed, VS Code shim, Claude Desktop | CLI binary walks to owning `.app` via path canonicalization; per-symlink CLI + app version atomically tied. |

**Lock files that exist in the cohort — but are not version gates:**

| Tool | Artifact | Purpose | Cross-install gate? |
|---|---|---|---|
| Claude Code | `~/.claude/ide/<pid>.lock` | IDE↔CLI auto-discovery (WebSocket MCP; contains `{pid, workspace, authToken}`) | No — CLI attaches to any matching-workspace PID |
| Claude Code | `~/.claude/sessions/<pid>.json` | Per-live-CLI session registry (`{pid, version, cwd, startedAt, ...}`) | No — coexistence, not exclusion |
| VS Code | `VSCODE_IPC_HOOK_CLI` env var (holds per-window Unix socket path) | CLI attach to open window | No — per-window, not cross-install |

**Implications:**
- Build-time namespacing is operationally cheap and works well — but only when downstream forks don't ship upstream's command name. Cursor's `code.cmd` on Windows is exactly that failure; the Cursor forum thread reports the installer writes `code.cmd` even when the user selected only "cursor", which is an additive behavior beyond a simple rename-failure.
- Claude Code's IDE lockfile is the closest thing in the cohort to an explicit cross-surface coordination artifact. The auth token it carries is actually [CVE-2025-52882](https://securitylabs.datadoghq.com/articles/claude-mcp-cve-2025-52882/)'s *fix*, not its cause: pre-patch versions of the Claude Code IDE extension ran an unauthenticated WebSocket MCP server on localhost where any loaded webpage could connect. The lockfile `{authToken}` field was introduced as the capability gate in v1.0.24+.
- Warp's cloud-mediated approach is the only strategy that truly *sidesteps* the cross-install problem. A local-first tool that cannot send state to a server is structurally limited to strategies 1, 2, or 4.

---

### D3 — Version-drift handling

**Finding:** Silent drift between coexisting installs is the **ordinary state of operation** in every surveyed tool. Exactly one documented hard-refuse on version mismatch exists in the cohort.

**Evidence:** [evidence/claude-code.md](evidence/claude-code.md), [evidence/vscode-family.md](evidence/vscode-family.md), [evidence/zed-warp.md](evidence/zed-warp.md), [evidence/cross-tool-patterns.md](evidence/cross-tool-patterns.md).

**Observed drift, per tool:**

| Tool | Coexisting version example | Handling |
|---|---|---|
| Claude Code | Desktop-bundled CLI v2.1.111 + native-installer CLI v2.1.119 on one machine (authoring machine observation, 2026-04-24) | Both read `~/.claude/settings.json`; no warning. |
| VS Code | Standalone `code` CLI v1.115 + GUI v1.116 | **Hard refuse** at handshake ([vscode#310090](https://github.com/microsoft/vscode/issues/310090), milestone 1.117.0) |
| Zed | Stable + Preview on same machine | Both read `~/Library/Application Support/Zed/`; no warning |
| Cursor | `cursor` desktop v3.2.10 + `cursor-agent` CLI v2026.04.17 | No shared version scheme; no handshake |
| Windsurf | Drift not exercised in public reports | Namespace-isolated; silent if it happens |
| Warp | Bundled Oz + standalone `warp-cli` → `oz` in migration | Cloud reconciles config; no local version gate |

**Three VS Code-documented drift surfaces specifically:**

1. **Settings Sync between Stable ↔ Insiders.** Auto-disable on the older end to prevent data inconsistencies: *"syncing them can sometimes lead to data incompatibility. In such cases, Settings sync will be disabled automatically on stable to prevent data inconsistencies."* ([Settings Sync docs](https://code.visualstudio.com/docs/configure/settings-sync), accessed 2026-04-24) — auto-disable, not reconcile.
2. **GUI ↔ standalone CLI version mismatch** — the one hard-refuse.
3. **GUI ↔ Remote Tunnels server mismatch** ([vscode-remote-release#8582](https://github.com/microsoft/vscode-remote-release/issues/8582)) — the remote `code-tunnel` service refuses with "client refused, version mismatch". A third tunnels-related CLI collision surface alongside the standalone `code` CLI.

**Schema-version markers on disk — almost universally absent:**

| Tool | On-disk schema marker |
|---|---|
| Claude Code | None (only `$schema` URL for validation) |
| VS Code | None at top level |
| Cursor | None (inherited from VS Code) |
| Windsurf | None observed |
| Zed | None in `paths.rs` or `db/` crate |
| Warp | None documented (cloud schema is authoritative) |

**Implications:**
- If your architecture is local-first, silent drift is what you inherit unless you introduce explicit markers. Every surveyed tool that didn't want to confront this handled it by (a) relying on forward-compat JSON, (b) pushing state to the cloud, or (c) not caring.
- The VS Code CLI mismatch case is a concrete example of what a fail-closed handshake looks like — and the issue has been open without a reconciliation path since 2026-04-15. The user-facing remediation is "downgrade the app."
- Zed's shared state dir across channels is a deliberate design choice (makes channel-switching seamless) that has UNCERTAIN consequences if a newer channel writes a schema an older one can't parse.

**Remaining uncertainty:** Whether Zed's shared Stable/Preview state dir has ever caused an observable corruption in the wild — not documented; UNCERTAIN.

---

### D4 — Launch-time binary precedence

**Finding:** Every surveyed tool resolves launch-time precedence via **standard shell PATH order.** No tool has explicit arbitration. This produces a recurring class of failure where the install operation writes the shared PATH entry silently.

**Evidence:** [evidence/vscode-family.md](evidence/vscode-family.md), [evidence/claude-code.md](evidence/claude-code.md), [evidence/zed-warp.md](evidence/zed-warp.md).

**Documented incidents:**

| Incident | Platform | Tools involved | Status |
|---|---|---|---|
| Claude Desktop hijacks `claude` on Windows via `%LOCALAPPDATA%\Microsoft\WindowsApps\` (system PATH precedes user PATH) | Windows | Claude Desktop vs Claude Code CLI (npm) | [Closed "not planned"](https://github.com/anthropics/claude-code/issues/25075) |
| Cursor's `code.cmd` shadows VS Code in system PATH | Windows | Cursor vs VS Code | [Unresolved forum thread](https://forum.cursor.com/t/installing-cursor-shell-command-overrides-code-as-well/39993) — no Anysphere response |
| macOS app-translocation poisoning of `/usr/local/bin/code` | macOS | VS Code | [vscode#209356](https://github.com/microsoft/vscode/issues/209356) |
| `ln -sf` last-writer-wins in `installShellCommand` | macOS | VS Code, Cursor, Windsurf, Zed | Canonical pattern; no fix planned |
| Zed in-app `cli: install` from Preview silently replaces Stable's `/usr/local/bin/zed` | macOS | Zed Stable + Preview | Not documented as a bug |

**The canonical code pattern** — from VS Code's `nativeHostMainService.ts` `installShellCommand()`:

```ts
const { symbolicLink } = await SymlinkSupport.stat(source);
if (symbolicLink && !symbolicLink.dangling) {
    const linkTargetRealPath = await Promises.realpath(source);
    if (target === linkTargetRealPath) { return; }
}
// fall through to: osascript-elevated `ln -sf '${target}' '${source}'`
```

The `-sf` flag **forces replacement** of any existing symlink — no version check, no prompt, no peer detection. Zed's `install_cli_binary.rs` L31-60 follows the same pattern (`smol::fs::remove_file` then `symlink()`, with osascript fallback).

**Implications:**
- On macOS, PATH collisions manifest as silent last-writer-wins in `/usr/local/bin/`. Users don't find out until something breaks.
- On Windows, system vs user PATH precedence is the common trigger — installers placing binaries in `%LOCALAPPDATA%` directories that Windows puts ahead of npm/user locations.
- The one lever any surveyed tool has that isn't pure PATH order is **symlink target renaming** — VS Code Insiders brew cask uses `target: "code-insiders"`, Zed Preview brew cask uses `target: "zed-preview"`. These prevent collisions between sibling builds but require discipline from both the packaging (brew cask) *and* the bundled install action (Zed's in-app `cli: install` does not respect the same discipline).

---

### D5 — Self-update coordination across installs

**Finding:** Every tool auto-updates its own install path independently. **No surveyed tool detects or warns when a coexisting install is stale.** The closest to cross-install awareness is Warp's cloud-sync, which reconciles configuration but not binary version.

**Evidence:** [evidence/claude-code.md](evidence/claude-code.md), [evidence/vscode-family.md](evidence/vscode-family.md), [evidence/zed-warp.md](evidence/zed-warp.md).

| Tool | Self-update mechanism | Cross-install awareness |
|---|---|---|
| Claude Code (native) | Background check on startup + periodic; atomic symlink flip in `~/.local/share/claude/versions/` | None — per-install, no peer detection |
| Claude Code (npm) | `claude update` (same native updater) | None |
| Claude Code (Homebrew) | `brew upgrade claude-code` | None |
| Claude Code (desktop app) | Bundled Electron auto-updater; bumps bundled CLI with app | None |
| VS Code (Stable) | Squirrel.Mac via `com.microsoft.VSCode.ShipIt` | None |
| VS Code (Insiders) | Separate launchd agent `com.microsoft.VSCodeInsiders.ShipIt` | None |
| Cursor | ToDesktop (third-party Squirrel derivative) | None — desktop and `cursor-agent` update independently |
| Windsurf | Squirrel.Mac via `com.exafunction.windsurf.ShipIt` | None |
| Zed | In-process updater (`crates/auto_update/src/auto_update.rs`, 1250+ LOC); bundle-relative symlink means CLI updates atomically with app | None across channels |
| Warp (app) | Squirrel.Mac (standard Electron pattern) | Cloud reconciles config across installs; no binary version coordination |
| Warp (standalone CLI) | `brew upgrade` | None |

**Two kill-switches observed (Claude Code):** `DISABLE_AUTOUPDATER=1` (background checks) and `DISABLE_UPDATES=1` (manual `claude update` too). Per-install; no system-wide equivalent.

**Implications:**
- A multi-install user is expected to either (a) notice stale installs themselves, (b) rely on all install paths being reasonably current, or (c) have a driving reason to use a specific pinned install (e.g., reproducibility in CI).
- The one cross-install coordination pattern in the cohort — Warp's cloud-sync — only resolves *configuration*, not *binary version*. Two Warp installs at different versions will still behave differently locally even with synced settings.

**Remaining uncertainty:** Whether Warp's bundled CLI (palette-installed from the `.app`) is a symlink into the bundle or a copy. If symlink: app update transparently bumps CLI. If copy: user must re-run the palette action after each app update. Not documented.

---

### D6 — Shared-state directory conventions

**Finding:** Every surveyed tool uses a user-scope state directory, but the *scope* of that sharing varies drastically. Two distinct designs observed: "one dir across all install paths" (Claude Code, Zed) versus "one dir per build / channel" (VS Code, Cursor, Windsurf, Warp).

**Evidence:** All four evidence files.

| Tool | State dir | Per-install or shared? |
|---|---|---|
| Claude Code | `~/.claude/` + `~/.claude.json` (OAuth) | **Shared** across all install paths (CLI, Desktop, IDE extension) |
| VS Code | `~/.vscode/` + `~/Library/Application Support/Code/` | Per-build (`.vscode-insiders` for Insiders, `.vscode-oss` for OSS) |
| Cursor | `~/.cursor/`, `~/Library/Application Support/Cursor/`, `~/.config/cursor-agent/` | Forked from VS Code; Cursor + `cursor-agent` use different subdirs |
| Windsurf | `~/.windsurf/` and/or `~/.codeium/windsurf/` | Forked from VS Code (namespace-separated) |
| Zed | `~/Library/Application Support/Zed/` + `~/.config/zed/` | **Shared** across Stable/Preview/Nightly/Dev channels |
| Warp | `~/Library/Application Support/dev.warp.Warp-Stable/` (per channel) + cloud | Per-channel locally; authoritative cloud |

**Schema-version markers:** none observed in any tool (see D3).

**Implications:**
- Claude Code's decision to share `~/.claude/` across all install paths means a user migrating from npm to native installer keeps everything; it also means a version schema drift in `settings.json` has the broadest blast radius.
- Zed's shared dir across channels enables seamless channel-switching (a user can try Preview and flip back to Stable without losing state) — at the cost of potential silent corruption if a Preview schema doesn't round-trip.
- The VS Code lineage's per-build dir is the opposite trade-off: isolated, predictable, but costly when users want to share extensions or settings across channels (solved with opt-in Settings Sync).

**Decision triggers:** If your tool has a durable user-level state dir shared across install paths, expect to pay the schema-version gate cost eventually. If you namespace per build, expect users to eventually ask for a sync mechanism.

---

### D7 — Vendor messaging on install choice

**Finding:** Docs tone varies from "native installer recommended, alternatives listed" (Claude Code) to "DMG and brew equivalent, you pick" (Zed) to "bundled CLI vs standalone CLI have different use cases" (Warp). No tool's docs substantively address the "I already have another `<tool>` on PATH" question.

**Evidence:** All four evidence files.

| Tool | Vendor framing |
|---|---|
| Claude Code | Native installer tab labeled "Recommended"; Homebrew and WinGet secondary; npm under "Advanced installation options." Desktop quickstart explicitly permits coexistence. |
| VS Code | Docs present `code` and `code-insiders` as the canonical PATH-level distinction. No guidance on "what if another `code` is on PATH." |
| Cursor | DMG primary, brew alternative; `cursor-cli` framed as additive agent for non-Cursor IDE users rather than a component of the Cursor desktop install. |
| Windsurf | DMG as sole install path; no coexistence discussion; import-once migration from VS Code/Cursor. |
| Zed | DMG and Homebrew presented as equivalent; `cli: install` palette action as canonical CLI-on-PATH mechanism. No mixing guidance. |
| Warp | Bundled CLI (palette-installed) vs standalone CLI (brew tap, for headless/CI) clearly differentiated with use-case guidance. |

**Implication:** The least-documented surface in the whole survey is "what to do when you already have a peer install." The common vendor posture is to treat this as a user responsibility, not a documented failure mode.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Windows 4-way PATH precedence matrix** (VS Code Stable / VS Code Insiders / Cursor / Windsurf) — only partially documented in the Cursor forum thread. Full coverage out of scope (macOS is the reference surface).
- **Whether Zed's shared Stable/Preview state dir has ever caused observable corruption** — UNCERTAIN; not documented.
- **Warp standalone Homebrew formula contents** — `curl` 404s on the raw files; could not confirm install target or `conflicts_with` stanza.
- **Warp bundled-CLI install mechanism** — symlink or copy? Not documented; determines whether app update auto-bumps CLI.
- **`cursor-agent` env-var delegation** — [gist documents unintended side effect](https://gist.github.com/johnlindquist/9a90c5f1aedef0477c60d0de4171da3f); closed-source; intentionality UNCERTAIN.
- **Claude Code desktop auto-updater mechanism** — not named in docs; Electron Squirrel INFERRED but not confirmed.
- **Windsurf canonical state dir** — `~/.windsurf` vs `~/.codeium/windsurf`; docs and cask disagree.

### Out of Scope (per Rubric)

- Single-install DMG→PATH symlink mechanics (covered in [`electron-bundled-cli-install-patterns`](../electron-bundled-cli-install-patterns/REPORT.md)).
- Distribution-channel posture (npm vs Homebrew vs goreleaser — covered in [`mastra-speakeasy-cli-install-recommendations`](../mastra-speakeasy-cli-install-recommendations/REPORT.md)).
- Electron auto-update internals in isolation (covered in [`electron-desktop-app-operations-2025`](../electron-desktop-app-operations-2025/REPORT.md)).
- Non-AI coding tools (Slack, Discord, Obsidian, Docker Desktop).
- 1P application to any specific tool or project (factual stance).

---

## References

### Evidence Files

- [evidence/claude-code.md](evidence/claude-code.md) — Claude Code ecosystem (CLI, desktop, IDE extensions, JetBrains)
- [evidence/vscode-family.md](evidence/vscode-family.md) — VS Code, Cursor, Windsurf (the VS Code lineage)
- [evidence/zed-warp.md](evidence/zed-warp.md) — Zed and Warp (non-Electron / non-VS-Code-lineage AI tools)
- [evidence/cross-tool-patterns.md](evidence/cross-tool-patterns.md) — cross-cutting synthesis (four coordination strategies, lock-file taxonomy, drift patterns)

### External Sources

**Anthropic — Claude Code:**
- [Advanced setup (code.claude.com)](https://code.claude.com/docs/en/setup)
- [Get started with the desktop app](https://code.claude.com/docs/en/desktop-quickstart)
- [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- [`@anthropic-ai/claude-code` on npm](https://www.npmjs.com/package/@anthropic-ai/claude-code)
- [GH #25075 — Claude Desktop hijacks `claude` on Windows](https://github.com/anthropics/claude-code/issues/25075)
- [GH #51860 — Orphaned CLI from desktop app](https://github.com/anthropics/claude-code/issues/51860)
- [GH #23749 — Auto-updater serves wrong version](https://github.com/anthropics/claude-code/issues/23749)
- [GH #27527 — MCP config CLI vs Desktop confusion](https://github.com/anthropics/claude-code/issues/27527)
- [CVE-2025-52882 — Claude Code WebSocket auth bypass](https://securitylabs.datadoghq.com/articles/claude-mcp-cve-2025-52882/)

**Microsoft — VS Code:**
- [`microsoft/vscode` — `nativeHostMainService.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/native/electron-main/nativeHostMainService.ts)
- [`microsoft/vscode` — `code.sh` shim](https://raw.githubusercontent.com/microsoft/vscode/main/resources/darwin/bin/code.sh)
- [`microsoft/vscode` — `product.json`](https://raw.githubusercontent.com/microsoft/vscode/main/product.json)
- [VS Code Settings Sync docs](https://code.visualstudio.com/docs/configure/settings-sync)
- [vscode#310090 — CLI version mismatch](https://github.com/microsoft/vscode/issues/310090)
- [vscode#209356 — translocation symlink poisoning](https://github.com/microsoft/vscode/issues/209356)
- [vscode-remote-release#8582 — Remote-SSH handshake timeout](https://github.com/microsoft/vscode-remote-release/issues/8582)

**Anysphere — Cursor:**
- [Cursor CLI installation docs](https://cursor.com/docs/cli/installation)
- [Cursor forum #39993 — `cursor` overrides `code` on Windows](https://forum.cursor.com/t/installing-cursor-shell-command-overrides-code-as-well/39993)

**Codeium — Windsurf:**
- [Windsurf getting-started docs](https://docs.windsurf.com/windsurf/getting-started)

**Zed Industries — Zed:**
- [`zed-industries/zed`](https://github.com/zed-industries/zed) — `crates/cli/`, `crates/install_cli/`, `crates/paths/`, `crates/release_channel/`, `crates/auto_update/`
- [Zed installation docs](https://zed.dev/docs/installation)
- [Zed macOS docs](https://zed.dev/docs/macos)
- [Zed CLI reference](https://zed.dev/docs/reference/cli)
- [Zed FAQ — collaboration channel parity](https://zed.dev/faq)

**Warp:**
- [Warp installation & setup](https://docs.warp.dev/getting-started/installation-and-setup)
- [Warp Settings sync](https://docs.warp.dev/terminal/more-features/settings-sync)
- [Warp CLI reference (Oz + warp-cli deprecation)](https://docs.warp.dev/reference/cli/cli)
- [warpdotdev/homebrew-warp tap](https://github.com/warpdotdev/homebrew-warp)

**Homebrew Casks (all accessed 2026-04-24):**
- [`visual-studio-code`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/v/visual-studio-code.rb)
- [`visual-studio-code@insiders`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/v/visual-studio-code%40insiders.rb)
- [`cursor`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/c/cursor.rb)
- [`cursor-cli`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/c/cursor-cli.rb)
- [`windsurf`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/w/windsurf.rb)
- [`zed`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/z/zed.rb) + [`zed@preview`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/z/zed%40preview.rb)
- [`warp`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/w/warp.rb)

### Related Research

- [`reports/electron-bundled-cli-install-patterns/REPORT.md`](../electron-bundled-cli-install-patterns/REPORT.md) — single-install DMG→PATH CLI mechanics across VS Code / Cursor / Zed / Docker / Atom. This report intentionally does not duplicate that coverage.
- [`reports/mastra-speakeasy-cli-install-recommendations/REPORT.md`](../mastra-speakeasy-cli-install-recommendations/REPORT.md) — distribution-channel posture (npm vs goreleaser).
- [`reports/electron-desktop-app-operations-2025/REPORT.md`](../electron-desktop-app-operations-2025/REPORT.md) — Electron versioning / signing / auto-update / CI / security ops surface.
