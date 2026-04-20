# Evidence: Cursor Desktop First-Run Enable Reliability + `state.vscdb` Deep Dive

**Dimension:** Cursor Desktop — follow-up pass closing UNCERTAIN items
**Date:** 2026-04-18
**Sources:** Cursor docs (permissions.json, mcp-extension-api), Cursor forum (multiple threads), community reverse-engineering (tarq.net, dredyson.com)

**Vendor-bias flag:** Cursor/Anysphere is vendor. Primary docs are first-party; forum threads include some staff comments (tagged) vs community reports (tagged UNCERTAIN where relied-upon-solely).

---

## Staff-corroborated: fresh-workspace default IS enabled

**Confidence:** CONFIRMED (upgraded from community-only)
**Evidence:** [forum.cursor.com #141009](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009)

Cursor staff **Dean Rie** explicitly confirmed:

> "When you open an empty Cursor window (no project), all MCP servers default to enabled. This is expected behavior."

Corroborating evidence from feature request [#135172](https://forum.cursor.com/t/consider-having-all-mcp-servers-disabled-by-default-instead-of-enabled/135172) ("Consider having all MCP servers disabled by default") filed specifically because *"every time a project folder is opened or renamed, all MCP servers are enabled by default."* Staff acknowledged 2025-09-28; as of 2026-04-06 no implementation.

**Implication:** The initial-pass UNCERTAIN on "is Cursor Desktop first-run enabled-by-default a vendor-official behavior?" is resolved to CONFIRMED.

---

## `state.vscdb` schema — staff-confirmed path + community-reverse-engineered details

**Confidence:** HIGH on structure; MEDIUM on exact key for per-server toggle

**Evidence:** [tarq.net](https://tarq.net/posts/cursor-sqlite-command-allowlist/), [dredyson.com](https://dredyson.com/fix-mcp-allowlist-issues-in-cursor-ide-a-cybersecurity-developers-step-by-step-guide-to-restoring-threat-detection/), [forum.cursor.com #156848](https://forum.cursor.com/t/best-practices-with-state-vscdb-and-state-vscdb-backup-in-cursor/156848)

### Structure

- Standard VS Code SQLite (Cursor forks VS Code and inherits storage model)
- **Tables:**
  - `ItemTable(key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)` — key/value store. Values are JSON blobs.
  - `cursorDiskKV` — Cursor-specific (chat bubbles, agent KV, checkpoints). Not MCP-relevant.

### Key for MCP-adjacent flags

```
src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser
```

Value is JSON with fields under `$.composerState.*`:
- `mcpAllowedTools` (array) — which MCP tool invocations auto-run
- `yoloMcpToolsDisabled` (0/1) — master off-switch
- `yoloCommandAllowlist` / `yoloCommandDenylist` (arrays)
- `useYoloMode` (bool)
- `modes4[0].fullAutoRun` (0/1)
- `shouldAutoContinueToolCall` (0/1)

### Per-server enable/disable location

Staff acknowledged it lives in `state.vscdb` but did NOT publish the key path. Community forum threads (#152859, #141009) indicate it is **workspace-scoped**, not under the global `applicationUser` key — likely a different row with workspace identifier. **UNCERTAIN on exact schema location.**

### Programmatic access feasibility

| State | Feasibility | Notes |
|-------|-------------|-------|
| Pre-Cursor-first-launch | **NOT FEASIBLE** | `state.vscdb` doesn't exist until first run. Writing to the path succeeds but Cursor will recreate on launch. |
| Cursor closed post-launch | **FEASIBLE** | Back up first; standard `sqlite3` + `json_set()` works. |
| Cursor running | Not recommended | No SQLite locks (writes succeed) but changes may be clobbered on exit + require restart to take effect. |

### Failure modes for `state.vscdb` writes
- DB absent on fresh-install-never-launched → fallback needed
- Cursor version increments value schema → JSON path goes stale (no stability contract)
- DB can grow to ~1GB/day (#156848) → slow writes
- Corruption triggers startup errors (#21076)
- Writes-while-running may be clobbered
- Per-workspace vs global scope — `applicationUser` is global; per-server toggle is workspace-scoped (different key)

---

## `permissions.json` — full schema now documented

**Confidence:** CONFIRMED
**Evidence:** [cursor.com/docs/reference/permissions](https://cursor.com/docs/reference/permissions)

**Location:** `~/.cursor/permissions.json` (global per-user, no workspace override)

**Schema:**
```json
{
  "mcpAllowlist": ["serverA:*", "serverB:toolX", "*:list_*"],
  "terminalAllowlist": ["git", "npm:install*"]
}
```

- Entries use `server:tool` syntax
- Case-insensitive, glob patterns allowed
- Entries without `:` are silently ignored
- File is "read on startup and re-read automatically whenever it changes"
- Defining a key *fully replaces* the in-app allowlist for that type

### Scope + precedence

- Pre-approves **per-tool invocation** (skips "approve this tool?" dialog)
- Does NOT override the per-server enable toggle — a disabled server's tools won't run even if listed
- Precedence: team admin > `permissions.json` > IDE settings

### Known bugs
- #135594, #145906 — allowlist silently doesn't apply in some builds

### Persistence
- File is in `~/.cursor/`, safe across Cursor Desktop updates

---

## `.workspace-trusted` + `mcp-approvals.json` — undocumented

**Confidence:** LOW / UNCERTAIN
**Evidence:** [forum.cursor.com #136709](https://forum.cursor.com/t/mcp-access-in-headless-mode/136709)

- **Location:** per-workspace, inside `.cursor/` in the project root
- **Schema:** UNDOCUMENTED. No vendor docs. No forum reverses these file formats.
- **Pre-stage-able:** UNKNOWN. Cursor staff on #136709 explicitly: *"MCP approvals for the CLI haven't been implemented yet"* — recommend `--force` to bypass in headless mode
- **Hash algorithm:** UNKNOWN. No reverse-engineering found
- **Cursor Desktop use:** NOT CONFIRMED — all references are to Cursor CLI (headless). Desktop uses `state.vscdb` + in-app approval dialogs.

**Implication:** For Cursor CLI in CI, the approval gap remains. No reliable pre-staging path today.

---

## Extension API (`vscode.cursor.mcp.registerServer()`)

**Confidence:** PARTIAL — API documented, but auto-enable semantics are not
**Evidence:** [cursor.com/docs/context/mcp-extension-api](https://cursor.com/docs/context/mcp-extension-api), [forum.cursor.com #152267](https://forum.cursor.com/t/remoteserverconfig-headers-not-sent-when-registering-mcp-server-via-extension-api-needs-vs-code-upstream-fix/152267), [forum.cursor.com #133031](https://forum.cursor.com/t/support-vs-codes-register-mcp-server-definition-provider-api/133031)

**API surface:**
- Four functions: `registerServer`, `unregisterServer`, `plugins.registerPath`, `plugins.unregisterPath`
- Takes `ExtMCPServerConfig` (stdio or HTTP/SSE)
- Runtime registration only — calls must come from a running Cursor Extension

**Auto-enable semantics:** NOT documented. Vendor framing implies "enterprise workflows" and "onboarding automation" (suggesting auto-enable) but not stated explicitly.

**Known bugs:** #152267 — `headers` in `RemoteServerConfig` have a non-transmission bug.

**VS Code's `registerMcpServerDefinitionProvider`:** Cursor does NOT support it. Feature request #133031 open since September 2025 with no resolution. Only `vscode.cursor.mcp.registerServer` works today.

### Sideload feasibility

- Install via `cursor --install-extension path/to/extension.vsix` OR "Extensions: Install from VSIX" command
- No marketplace requirement — installer could bundle a `.vsix` and invoke the CLI
- **BUT:** requires Cursor CLI (`cursor`) on PATH, cannot auto-launch Cursor, cannot auto-accept "trust this extension" dialogs

**Implication:** Extension API path is NOT recommended for zero-click first-run install. Use for post-setup programmatic management.

---

## Recommended install pattern for Cursor Desktop

**Pattern (CONFIRMED working on happy path):**

1. Write `.cursor/mcp.json` (project-scope) or `~/.cursor/mcp.json` (global) with the server entry using `mcpServers` root key
2. Write `~/.cursor/permissions.json` with `mcpAllowlist: ["<serverName>:*"]` to pre-approve every tool from the new server
3. Tell the user: open Cursor and open their workspace — server enabled by default, tools pre-approved, no clicks required
4. OPTIONAL post-launch polish: SQL-update `state.vscdb` to set `$.composerState.yoloMcpToolsDisabled = 0` and add server to `$.composerState.mcpAllowedTools`

**Confidence: MEDIUM-HIGH** for vanilla happy path. Residual failure modes:

| # | Failure mode | Impact |
|---|--------------|--------|
| F1 | User previously disabled "enable new MCP servers by default" | Server silently OFF on install — no way to detect without `state.vscdb` read |
| F2 | #152859 — tools not loaded until toggle off/on | Transient; affects 2.5.x/2.6.x through March 2026; user-visible |
| F3 | #135594/#145906 — `mcpAllowlist` silently doesn't apply | Tool-approval dialog still fires |
| F4 | `state.vscdb` doesn't exist on truly fresh install | Polish step #4 fails; not a functional blocker |
| F5 | Cursor version drift in `applicationUser` JSON schema | No stability contract |
| **F-future** | Feature request #135172 ships → default flips to disabled | **Every programmatic installer assuming current default breaks silently** |

---

## Bottom-line verdict

**Is zero-click first-run enable reliable for Cursor Desktop today?**

**MOSTLY YES with caveats.** High-medium confidence.

The `mcp.json` + `permissions.json` two-file pattern works out-of-box because Cursor's default is enable-on-first-sight of a new server — **staff-confirmed** in #141009. The weak links are:
1. Tool-availability propagation bugs (#152859)
2. Allowlist non-application bugs (#135594/#145906)
3. Feature request #135172 — if Cursor ships the proposed default-flip to disabled, every programmatic installer assuming the current default breaks silently

**Watch-items:**
- **#135172** — the critical feature request that would invalidate every current installer
- **#152859** — current-release tool-propagation bug
- **#135594/#145906** — allowlist-not-applied bugs

---

## Gaps / still UNCERTAIN

- **Exact per-server enable-state key in `state.vscdb`** — staff confirmed location but did not publish path. Would need empirical DB dump to close.
- **`.workspace-trusted` + `mcp-approvals.json` schemas** — completely undocumented; Cursor CLI approval system "not yet implemented" per staff
- **Extension-API auto-enable semantics** — reference page omits; no forum thread resolves
- **VS Code version contract for `ItemTable.applicationUser`** — no stability guarantee
- **`permissions.json` schema differs between Cursor CLI vs Desktop?** — not confirmed

---

## Sources (all accessed 2026-04-18)

- [tarq.net — How Cursor Stores Its Command Allowlist in SQLite](https://tarq.net/posts/cursor-sqlite-command-allowlist/)
- [Cursor Docs — MCP](https://cursor.com/docs/context/mcp)
- [Cursor Docs — permissions.json Reference](https://cursor.com/docs/reference/permissions)
- [Cursor Docs — MCP Extension API Reference](https://cursor.com/docs/context/mcp-extension-api)
- [Forum #141009 — Disabled MCP Servers become enabled after restart (staff-confirmed default)](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009)
- [Forum #135172 — Consider having all MCP servers disabled by default](https://forum.cursor.com/t/consider-having-all-mcp-servers-disabled-by-default-instead-of-enabled/135172)
- [Forum #148139 — Pre-configure enabled/disabled tools via mcp.json](https://forum.cursor.com/t/add-the-ability-to-pre-configure-which-mcp-tools-are-enabled-disabled-via-the-mcp-json-configuration-file-eliminating-the-need-to-manually-enable-tools-in-the-ui-after-every-cursor-restart/148139)
- [Forum #152859 — MCP tools only available after toggling server off/on](https://forum.cursor.com/t/mcp-tools-only-available-to-agent-after-manually-toggling-server-off-on-even-when-already-enabled/152859)
- [Forum #129256 — MCP Server Toggle Bug Report](https://forum.cursor.com/t/cursor-mcp-server-toggle-bug-report/129256)
- [Forum #156848 — state.vscdb best practices](https://forum.cursor.com/t/best-practices-with-state-vscdb-and-state-vscdb-backup-in-cursor/156848)
- [Forum #136709 — MCP access in headless mode](https://forum.cursor.com/t/mcp-access-in-headless-mode/136709)
- [Forum #133031 — Support registerMcpServerDefinitionProvider](https://forum.cursor.com/t/support-vs-codes-register-mcp-server-definition-provider-api/133031)
- [Forum #152267 — RemoteServerConfig headers bug](https://forum.cursor.com/t/remoteserverconfig-headers-not-sent-when-registering-mcp-server-via-extension-api-needs-vs-code-upstream-fix/152267)
- [dredyson.com — Fix MCP Allowlist Issues](https://dredyson.com/fix-mcp-allowlist-issues-in-cursor-ide-a-cybersecurity-developers-step-by-step-guide-to-restoring-threat-detection/)
- [jackyoustra.com — Cursor settings location](https://www.jackyoustra.com/blog/cursor-settings-location)
