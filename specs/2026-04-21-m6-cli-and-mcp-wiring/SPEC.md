---
title: M6 — CLI-on-PATH install + first-launch MCP wiring (phased)
description: Close M6's DOD in two phases. Phase 1 (M6a) ships the "Install Command-Line Tools…" menu item. Phase 2 (M6b) ships the first-desktop-app-launch MCP consent dialog + runInit orchestration with a bundle-absolute cliPath. Phase 2 is decoupled from Phase 1 (D-M6-R2) and its M4/M5 deps are both shipped. Grounded in the research report + design spike in `reports/electron-bundled-cli-install-patterns/`.
tags: [spec, desktop, electron, m6, cli-on-path, mcp-wiring, d52]
status: Draft — 2026-04-21
---

# M6 — CLI-on-PATH install + first-launch MCP wiring (phased)

**Milestone:** M6 of the [Electron desktop app](../2026-04-11-electron-desktop-app/SPEC.md) (§14). Parent spec is authoritative for D11 (superseded), D52 (LOCKED — CLI-on-PATH via menu item), §8.11 (`runInit` from Electron main), §8.12 (CLI shim install flow). G3 (zero terminal contact for P1) is load-bearing.

**Author:** Andrew (2026-04-21)
**Status:** Draft — not yet implemented. Full design spike checked in at [reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md](../../reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md); this spec scopes the two implementation PRs.
**Baseline commit:** `6fa2c104`
**Depends on:**
- **Phase 1 (M6a)**: M2 (signed-DMG scaffolding — **shipped** PR #245). Zero deps on M4 / M5.
- **Phase 2 (M6b)**: M2 (shipped #245) + M4 (URL scheme — **shipped** PR #266) + M5 (keyring packaged E2E — **shipped** PR #267). All Phase 2 prerequisites landed 2026-04-21. AC2.6 (P1 E2E smoke) remains creds-gated on Apple Developer credentials for notarization — same external dependency that gates M5's AC4–AC7.
**Blocks:** M7 (first design-partner build requires M6 complete for the P1 persona).

---

## 1) Problem statement

Parent Electron spec LOCKED D52 (2026-04-17, revised 2026-04-20):

> "Electron ships the CLI on PATH via 'Install Command-Line Tools…' menu item; primary bin is `ok` with `open-knowledge` as backward-compat alias. First click triggers macOS admin prompt. Load-bearing for P1: Electron's `runInit` prefers the bundled CLI path over `npx` — `{"command": "/usr/local/bin/ok", "args": ["mcp"]}`. P1 (no Node.js installed) gets working AI-tool MCP integration without any terminal contact."

And §8.11 (MCP wiring orchestrator) spells out the first-launch UX:

> "On first launch of a new project: call `detectInstalledEditors(cwd)` from `packages/cli/src/commands/init.ts` — returns `EditorId[]` ⊆ `{claude, claude-desktop, cursor, vscode, codex, windsurf}`. Prompt user once with the detected set as checkboxes: 'Add Open Knowledge to your AI tools? [Claude Code ☑] [Claude Desktop ☑] [Cursor ☑] [VS Code ☐] [Codex ☐] [Windsurf ☐] [Skip]'. On confirm, `runInit({ cwd, editors, mcp: true, force: false })` merges MCP server entries idempotently."

None of this is implemented. The M6 DOD (§14 quoted above) requires two conceptually-separable workstreams that happen to share a delivery date per the parent spec's milestone boundary:

- **Phase 1 (CLI-on-PATH).** Menu item, wrapper script, extraResources, translocation guard, install/uninstall handlers. **No runtime dependency on M4 or M5** — this piece can ship as soon as M2 is on hand (which it is).
- **Phase 2 (MCP first-launch wiring).** First-desktop-app-launch consent dialog (user-scoped per D-M6-R1), `runInit` from Electron main, detected-editors UI, MCP config write with bundle-absolute `cliPath` (per D-M6-R2). **No hard dependency on Phase 1** — M6b writes the bundle path, so consent-dialog users get working MCP without clicking "Install Command-Line Tools…". M4 (**shipped** PR #266) and M5 (**shipped** PR #267) are both landed, so Phase 2 can proceed immediately. Only AC2.6 (P1 E2E smoke) remains creds-gated on notarization.

The research report [reports/electron-bundled-cli-install-patterns/](../../reports/electron-bundled-cli-install-patterns/) fully characterizes Phase 1's design (concrete wrapper script, `cli-install.ts` module, electron-builder amendments, smoke-test procedure, known gotchas). M6a implementation is hand-off-ready. Phase 2 leverages that substrate plus the existing `runInit` flow from `packages/cli/src/commands/init.ts`.

**Scope clarification — what M6 does not touch.** M6 narrows on the install boundary (how `ok` reaches a user's PATH and AI tools' MCP configs) and the first-launch UX. The runtime server model — the existing set of collab-server entry points and Hocuspocus composition paths in `packages/cli/src/commands/`, `packages/server/src/boot.ts`, `packages/server/src/standalone.ts`, and `packages/app/src/server/hocuspocus-plugin.ts` — is out of scope and untouched. Reviewers should not expect entry-point consolidation or composition-path unification from this spec.

## 2) Goals

**Phase 1 — CLI-on-PATH (M6a):**

- **G1.** File menu entry "Install Command-Line Tools…" (macOS-only). First click: admin prompt via `osascript`; creates `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge` symlinks pointing at the bundled wrapper. Subsequent clicks no-op (idempotent). Status indicator flips to "Uninstall Command-Line Tools" when installed.
- **G2.** Wrapper script (`packages/desktop/resources/cli/bin/ok.sh`) uses `ELECTRON_RUN_AS_NODE=1` to run the bundled CLI via Electron's embedded Node. No separate Node install on user's machine. Derived from VS Code's `code.sh` per the research report. **Self-diagnosing (OQ-8 resolved):** before invoking the bundled CLI, the wrapper verifies that its target path (`$APP_BUNDLE_DIR/Contents/Resources/cli/dist/cli.mjs`) exists AND the Electron binary exists. If either is missing (e.g., app dragged to Trash after an MCP client already had the cliPath configured), prints a single-line machine-readable JSON error to stderr — `{"error":"ok-bundle-missing","hint":"Open Knowledge app appears to have been removed. Reinstall from the DMG, or remove OK entries from your MCP config and rerun ok init."}` — and exits with a distinct non-zero code (e.g. 69 / `EX_UNAVAILABLE`). MCP clients surface the stderr to the user cleanly.
- **G3.** Translocation guard: detect `/AppTranslocation/` or `/private/var/folders/` in `app.getPath('exe')` before installing; refuse with clear dialog pointing the user to drag the app to `/Applications/` first. Prevents the VS Code / Zed class of bug (research report evidence).
- **G4.** Collision guard: if `/usr/local/bin/ok` already exists and is not our symlink (e.g., npm-installed shim), prompt before overwriting. Never silently stomp.
- **G5.** On app launch: if `/usr/local/bin/ok` is a broken symlink pointing at a nonexistent bundle, offer "Fix Command-Line Tools" dialog. Handles the drag-to-Trash-then-reinstall case.
- **G6.** Uninstall action removes both symlinks (admin prompt). Only removes symlinks owned by the current app — foreign files untouched.

**Phase 2 — First-launch MCP wiring (M6b):**

- **G7.** First time the Electron **desktop app** is launched (no `~/.open-knowledge/.mcp-status.json` marker) — user-level, not per-project — show a consent dialog enumerating detected editors via `detectInstalledEditors()` (called with no `cwd` for user-scope resolution) with **every detected editor preselected** (per OQ-14 DIRECTED; parent §8.11's three-checked / three-unchecked defaults were prose-illustrative and are superseded here). User clicks "Add" → MCP entries land in the selected editors' user-level config files (e.g. `~/.claude.json`, `~/Library/Application Support/Claude/claude_desktop_config.json`, `~/.cursor/mcp.json`). **Revises parent §8.11's project-scoped-trigger framing** — attach a corrigendum breadcrumb on the parent spec when M6b ships. Rationale: parent §8.11 already intended user-scoped MCP *entries* (§8.11 line 837: "a single `open-knowledge` entry serves any project the user opens") — D-M6-R1 only realigns the trigger to match the storage scope. A user who wants project-scoped MCP (e.g., `.mcp.json` committed to a repo) uses `ok init` from terminal as today.
- **G8.** A new CLI export — `writeUserMcpConfigs(opts)` — writes MCP configs from Electron main. Separate from `runInit`: does NOT run `ensureProjectGit` / `initContent` / `scaffoldLaunchJson` / `upsertRootInstructions` / `collectLegacyProjectConfig`. Only writes per-editor MCP entries. `cliPath` is **hybrid** (per D-M6-R9): probes `/usr/local/bin/ok` and, if present + owned-by-us, writes that stable symlink path; otherwise writes the bundle-absolute path computed from `app.getPath('exe')` (e.g. `.../Contents/Resources/cli/bin/ok.sh`). This gives auto-update + app-move robustness when M6a is installed, and self-contained working MCP when it isn't. Not `npx`. Load-bearing for P1 per D52. See §6.3 for full contract.
- **G9.** Claude Desktop (or any MCP client) spawns the `cliPath` that M6b wrote into its config — either `/usr/local/bin/ok mcp` (if M6a installed at M6b-write time) or `…/Resources/cli/bin/ok.sh mcp` (bundle-absolute fallback) → discovers running Hocuspocus via `server.lock` → connects to Electron's utility port. Bidirectional stdio MCP works end-to-end. M6a install NOT required for the MCP path — bundle-absolute suffices (per D-M6-R2 + D-M6-R9 hybrid).
- **G10.** End-to-end P1 smoke: fresh Mac, NO Node.js installed, NO terminal contact → install DMG → launch app → MCP consent dialog fires on first app open → accept defaults → open Claude Desktop → Claude calls `write_document` → renderer shows agent-flash + content arrives on disk. **Zero terminal contact** (preserves parent G3). Note: `Install Command-Line Tools…` is an *optional* follow-on for users who want shell access — it is not on the P1 MCP path anymore (D-M6-R2).
- **G11.** Skip path: consent dialog has a "Skip" button; picking it writes `{ configured: false, skippedAt }` to the **user-scoped** marker `~/.open-knowledge/.mcp-status.json`. Dialog does not re-trigger on any subsequent app launch. User re-triggers manually (delete marker, or `ok init` from terminal) — see OQ-5.

**Common:**

- **G12.** `bun run check` stays green. New pure-function tests land alongside each new file.
- **G13.** `packages/desktop/README.md` updated with a Command-Line Tools + MCP sections.

## 3) Non-goals

- **[NEVER] NG1.** Shipping a second CLI binary alongside `ok` / `open-knowledge`. The dual-bin is LOCKED per D52 + PR #170; no `ok-agent`, `ok-mcp`, etc. (Cursor's two-CLI split is the cautionary precedent the research report calls out.)
- **[NEVER] NG2.** Silently overwriting foreign files at `/usr/local/bin/ok`. Always prompt. Docker-Desktop's aggressive symlink re-creation is the anti-pattern.
- **[NEVER] NG3.** Auto-installing the CLI on first app launch. The user MUST click the menu item. VS Code's explicit-opt-in model is the chosen pattern; auto-install (Docker-Desktop-style) is rejected.
- **[NOT NOW] NG4.** Windows PATH install (via installer registry) + Linux `.deb`/`.rpm` postinst. Deferred per D51 (macOS-only v0). Menu item is gated on `process.platform === 'darwin'`; non-darwin users don't see it.
- **[NOT NOW] NG5.** `$HOME/.local/bin` fallback for admin-refusal cases. Documented in the research report as a future option; not shipped in M6. Cursor's pattern if this becomes load-bearing.
- **[NOT NOW] NG6.** Symmetric reconciliation with npm-installed `@inkeep/open-knowledge` at install time. Coexistence-by-PATH-precedence is the current posture (D52 LOCKED). If Intel-Mac collision tickets materialize, revisit.
- **[NOT NOW] NG7.** Phase 2's MCP consent dialog as a re-triggerable action (via menu). If Phase 2 users complain about inability to re-wire after skipping, add in a follow-up.
- **[NEVER] NG8.** Writing MCP configs to editor paths the user hasn't confirmed. The consent dialog is opt-in per-editor; no blanket writes.

## 4) Scope

**Phase 1 (M6a) — one PR.** Files:

| File | Change |
|---|---|
| `packages/desktop/resources/cli/bin/ok.sh` | **NEW** — wrapper script, `chmod +x`, ~30 LOC. Content per [reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md](../../reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md) §1. |
| `packages/desktop/src/main/cli-install.ts` | **NEW** — ~250 LOC. Exports pure functions (`isTranslocated`, `wrapperPathInBundle`, `getInstallStatus`) + Electron-runtime wrappers (`installCli`, `uninstallCli`). Content per design spike §4. |
| `packages/desktop/src/main/cli-install.test.ts` | **NEW** — ~60 LOC. Bun unit tests for pure-function layer. Translocation detection, path resolution, install-status classification. |
| `packages/desktop/src/main/menu.ts` | Modified — add macOS-only "Install Command-Line Tools…" / "Uninstall Command-Line Tools" item with status label flip; extend `MenuDeps` with `cliInstallStatus` + `toggleCliInstall`. ~20 LOC diff. |
| `packages/desktop/src/main/index.ts` | Modified — wire `MenuDeps.cliInstallStatus` + `toggleCliInstall` at menu-build time; optionally add launch-time broken-symlink detection + repair dialog (G5). ~25 LOC diff. |
| `packages/desktop/electron-builder.yml` | Modified — two new `extraResources` entries: `from: ../cli/dist → to: cli/dist` and `from: resources/cli/bin/ok.sh → to: cli/bin/ok.sh`. ~10 LOC diff. Per design spike §2. |
| `packages/desktop/README.md` | Modified — Command-Line Tools subsection: install / uninstall / coexistence with npm / `which -a ok` diagnostic / translocation gotcha. ~40 LOC. |

**Phase 2 (M6b) — separate PR.** Files:

| File | Change |
|---|---|
| `packages/desktop/src/main/mcp-wiring.ts` | **NEW** — `runMcpWiringOnFirstLaunch()`: check user-scoped marker (`~/.open-knowledge/.mcp-status.json` with shape per §6.2); if unset, call `detectInstalledEditors()`, surface consent dialog via `whenRendererReady`-style dispatch (per D-M6-R10 — three-case: window-ready, window-loading, no-window-yet). On confirm, resolve hybrid `cliPath` per D-M6-R9: probe `/usr/local/bin/ok` — if it exists, is a symlink, and `readlinkSync` resolves to a path inside `app.getPath('exe')`'s bundle (ownership check), use `/usr/local/bin/ok`; otherwise compute bundle-absolute from `app.getPath('exe')`. Call the new `writeUserMcpConfigs({ editors, force, cliPath, home })` CLI export (see next row) — NOT `runInit` (per D-M6-R8: `runInit` runs `ensureProjectGit` + `initContent` + `scaffoldLaunchJson` + `upsertRootInstructions` + `collectLegacyProjectConfig`, none of which belong in a user-scoped consent flow). **Merge semantics (OQ-16 resolved + refined per challenger M1):** use `isCompatible(existing, installOptions)` from `editors.ts:249` to classify each editor's existing entry. Compatible with any OK-managed shape (published `{command:'npx',args:[...]}` OR dev-mode OR prior `{cliPath,...}` OR historical `-y npx` variant) → `force: true` + overwrite with new cliPath shape. Not compatible (user-customized, foreign) → preserve + log `mcp-wiring-skip-customized`. Leverages existing CLI primitive instead of reinventing exact-shape match. Gated on `app.isPackaged === true` (OQ-12). |
| `packages/cli/src/commands/init.ts` + `packages/cli/src/commands/editors.ts` | Modified — **NEW export** `writeUserMcpConfigs(opts: WriteUserMcpConfigsOptions): Promise<EditorMcpResult[]>` in `init.ts`. Shape: `{ editors: EditorId[]; force?: boolean \| Set<EditorId>; cliPath?: string; home?: string }`. Loops `resolveEditorTargets(editors)`, calls `writeEditorMcpConfig(target, '', forceForEditor, { cliPath }, home)` per editor, aggregates results. Does NOT run `ensureProjectGit` / `initContent` / `scaffoldLaunchJson` / `upsertRootInstructions` / `collectLegacyProjectConfig`. Extend `McpInstallOptions` (`editors.ts`) with `cliPath?: string`; extend `buildManagedServerEntry` to return `{ command: cliPath, args: ['mcp'] }` as the highest-precedence branch when `cliPath` is set (before the `mode === 'dev'` check). Export `writeEditorMcpConfig` if not already exported. Backward-compatible: existing CLI `ok init` (no `cliPath`, uses `runInit`) continues to produce the current `{command:'npx',…}` shape. |
| `packages/desktop/src/main/mcp-wiring.test.ts` | **NEW** — pure-function unit tests for marker read/write, consent dialog result handling, cliPath computation from a mocked `app.getPath('exe')`. |
| `packages/app/src/components/McpConsentDialog.tsx` | **NEW** — React component in the shared `packages/app/` bundle (lives alongside `NewItemDialog` / `CloneDialog` / `AuthModal` per D13). Rendered via IPC round-trip. Native `dialog.showMessageBox` doesn't support multi-checkbox on macOS so a React modal is the fit. |
| `packages/desktop/src/main/index.ts` | Modified — on `app.whenReady()`, call `runMcpWiringOnFirstLaunch()` ONCE (user-scoped, not per-window). Gate on `process.platform === 'darwin'` + `app.isPackaged`. Dialog dispatch uses **whenRendererReady-style three-case** (per D-M6-R10, mirrors M3's auto-update dispatch): (i) if a window is already loaded when wiring fires, send `ok:mcp-wiring:show` immediately; (ii) if a window exists but still loading, wait for renderer mount-ack; (iii) if no window yet, subscribe to `browser-window-created`, then wait for mount-ack. Works whether Navigator opens (common), or editor opens via `lastOpenedProject` (F1), or editor opens via `openknowledge://` deep link (F2). |
| `packages/app/src/components/NavigatorApp.tsx` + `packages/app/src/App.tsx` | Modified — both surfaces subscribe to `ok:mcp-wiring:show` IPC and send `ok:mcp-wiring:renderer-ready` ack on mount (the handshake main waits for in case (ii) / (iii)). On receipt of `ok:mcp-wiring:show`, render `<McpConsentDialog>` as a modal overlay. Dialog is host-agnostic — same component in Navigator or editor context. On confirm/skip, send `ok:mcp-wiring:confirm` / `ok:mcp-wiring:skip` invoke back to main. |
| `packages/desktop/tests/smoke/mcp-wiring.e2e.ts` | **NEW** — Playwright smoke. Launches packaged app with `HOME=<tmpdir>` override (OQ-21) and `app.isPackaged===true` simulated → waits for Navigator `did-finish-load` + renderer-mount-ack → asserts consent dialog renders without any project being opened → simulates click Add → asserts MCP config file(s) under tmpHome contain the bundle-absolute cliPath shape. |
| `packages/desktop/README.md` | Modified — MCP wiring subsection: first-launch UX, how to re-trigger (post-M6 if shipped; documented as follow-up if not), where the marker file lives. |

**Parent-spec guard**: if the `runInit` `cliPath` option is added, the parent Electron spec's §8.11 implementation note should be post-hoc annotated with the new field signature. Not an M6 deliverable; noted for the spec maintainer.

## 5) Acceptance criteria

### Phase 1 (M6a)

| # | Criterion | Verification |
|---|---|---|
| AC1.1 | Unit tests for `isTranslocated`, `wrapperPathInBundle`, `getInstallStatus` pass. Translocation detected on `/private/var/folders/...` prefix. Path resolution correct for a canonical `/Applications/` install. Install-status returns `'not-installed'` on clean system, `'installed'` after simulated symlink, `'broken'` when symlink target is missing. | `bun test packages/desktop/src/main/cli-install.test.ts`. |
| AC1.2 | `bun run build:desktop` produces a bundle where `Contents/Resources/cli/bin/ok.sh` exists and is executable; `Contents/Resources/cli/dist/cli.mjs` exists. | Inspection of `packages/desktop/dist-desktop/mac/Open\ Knowledge.app/Contents/Resources/cli/`. |
| AC1.3 | In dev mode (`bun run --filter=@inkeep/open-knowledge-desktop dev`): File menu shows "Install Command-Line Tools…". Click triggers translocation check — dev mode app isn't translocated, so check passes. Since dev mode doesn't pack extraResources, the wrapper-missing-from-bundle dialog fires (guard works). | Manual dev smoke. |
| AC1.4 | Unsigned DMG (`bun run --cwd packages/desktop build:mac:unsigned`) + drag to `/Applications/` + first launch: menu item works end-to-end. `osascript` admin prompt fires, password accepted, `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge` created. `which -a ok` from a new terminal returns `/usr/local/bin/ok`. `ok --version` prints the OK CLI version string. `ok mcp` starts a stdio MCP server (kill with `^C`). | Manual smoke. |
| AC1.5 | After AC1.4: menu item now reads "Uninstall Command-Line Tools". Click → admin prompt → both symlinks removed. `which -a ok` returns nothing. | Manual smoke. |
| AC1.6 | Drag-to-Trash case: reinstall via AC1.4, then `rm -rf "/Applications/Open Knowledge.app"`. Reinstall a fresh DMG. Launch app. "Command-Line Tools are broken — repair?" dialog fires. Accept → symlinks re-pointed at the new install. | Manual smoke. |
| AC1.7 | Collision case (Intel Mac path): pre-create `/usr/local/bin/ok` as `printf '%s\n%s\n' '#!/bin/bash' 'echo foreign' > /usr/local/bin/ok && chmod +x /usr/local/bin/ok` (simulates npm-installed shim). Click "Install Command-Line Tools…". Expected: collision-prompt dialog asking whether to replace. User chooses Cancel → symlink not created. User chooses Replace → symlink replaces the foreign file after admin prompt. | Manual smoke on an Intel Mac OR via manual file setup on Apple Silicon. |
| AC1.8 | Translocation guard fires: mount the unsigned DMG, launch `Open Knowledge.app` directly from the DMG window (triggers translocation), click "Install Command-Line Tools…". Expected: translocation warning dialog, no admin prompt, no symlinks created. | Manual smoke. |
| AC1.9 | `packages/desktop/README.md` documents: (a) what the menu item does, (b) the `/opt/homebrew/bin/ok` coexistence story (research report D15), (c) how to diagnose with `which -a ok`. | Docs inspection. |
| AC1.10 | `bun run check` green. No new Playwright e2e required for Phase 1. | CI gate. |
| AC1.11 | `ok ui` via the installed wrapper serves the React bundle. After AC1.4, run `ok ui` in a new terminal; visit `http://localhost:3000`; React app mounts (check window title or `/assets/*` asset returns 200). Kill with `^C`. Validates the extraResources filter (OQ-2) keeps `cli/dist/public/**` reachable from the wrapper — distinct from the `Resources/app/` copy the BrowserWindow loads. | Manual smoke. |

### Phase 2 (M6b)

| # | Criterion | Verification |
|---|---|---|
| AC2.1 | Unit tests for `mcp-wiring.ts` pure helpers pass: marker file read/write, cliPath resolution precedence, editor-default checkbox-state derivation. | `bun test packages/desktop/src/main/mcp-wiring.test.ts`. |
| AC2.2 | On **first launch of the packaged desktop app** (user-scoped, not per-project): `McpConsentDialog` renders. Detected-editors list populated via `detectInstalledEditors()` — each editor whose home-based `detectPath` directory exists is **preselected** (per OQ-14 DIRECTED): Claude Code ☑ if `~/.claude/` dir exists; Claude Desktop ☑ if `~/Library/Application Support/Claude/` dir exists; Cursor ☑ if `~/.cursor/` dir exists; VS Code ☑ if its config dir exists; Codex ☑ if `~/.codex/` dir exists; Windsurf ☑ if its config dir exists. Undetected editors appear in the list but unchecked. Skip button present. Dialog does NOT fire in `electron-vite dev` (OQ-12 gate: `app.isPackaged`). | Playwright smoke (AC2.8). |
| AC2.3 | User clicks "Add": `writeUserMcpConfigs({ editors: selectedEditors, force: <computed per OQ-16/M1 via isCompatible>, cliPath: <hybrid per D-M6-R9>, home: <$HOME> })` is invoked. NO `ensureProjectGit` / `initContent` / `scaffoldLaunchJson` / `upsertRootInstructions` / `collectLegacyProjectConfig` side effects fire. Test asserts: (a) no `.git/` created under `$HOME` or `/`; (b) no `~/AGENTS.md` or `~/.claude/launch.json` written; (c) no `~/.open-knowledge/` scaffolded beyond the `.mcp-status.json` marker (if pre-existing `~/.open-knowledge/config.yml` exists, it is untouched). Idempotent — subsequent app launches with the marker present do NOT re-trigger the dialog. | Playwright smoke + filesystem assertions. |
| AC2.4 | MCP config entries written by AC2.3 have the shape `{"command": "<cliPath>", "args": ["mcp"]}` — NOT `npx`. `cliPath` is hybrid (per D-M6-R9): when `/usr/local/bin/ok` exists AND is a symlink AND `readlinkSync` resolves to a path inside the current bundle (verified by comparing prefix against `app.getPath('exe')`), AC expects `cliPath === '/usr/local/bin/ok'`. Otherwise AC expects bundle-absolute (e.g. `.../Contents/Resources/cli/bin/ok.sh`). Verify both paths: (i) no-M6a fixture → bundle-absolute written; (ii) pre-installed-M6a fixture → symlink written. The written `cliPath` is executable: `fs.accessSync(cliPath, constants.X_OK)` AND `execFileSync(cliPath, ['--version'])` succeeds + prints a version string. Broken-symlink and missing-wrapper cases (OQ-8) must fail this AC. User-level config paths written to: `~/.claude.json` · `~/Library/Application Support/Claude/claude_desktop_config.json` · `~/.cursor/mcp.json` (as selected). | File-system inspection + executability probe post-smoke, across both cliPath-resolution branches. |
| AC2.5 | Skip button: `{ configured: false, skippedAt: <iso> }` written to `~/.open-knowledge/.mcp-status.json` (user-scoped per D-M6-R1); dialog doesn't re-trigger on any subsequent app launch. | Playwright smoke. |
| AC2.6 | **(Creds-gated, full P1 E2E)** Fresh Mac, NO Node installed, NO terminal contact: install signed+notarized DMG → launch app → MCP consent dialog fires on first-launch (Navigator surface) → all defaults accepted → open Claude Desktop → send "write a new file called test.md with content Hello" → renderer flashes with agent-write activity → file appears on disk. Note: `Install Command-Line Tools…` menu click is NOT on this path — P1 MCP works purely via bundle-absolute cliPath (D-M6-R2). | Manual E2E once Apple creds on hand. Per runbook. |
| AC2.7 | If Electron spawns `/usr/local/bin/ok mcp` and the bundled app is in the process of launching (e.g., cold start), the MCP server's `discoverServerUrl` honors the startup-grace per `packages/cli/src/commands/mcp.ts`. No race regression. | `bun test packages/cli/src/commands/mcp.test.ts` (already exists, must stay green). |
| AC2.8 | Playwright smoke `mcp-wiring.e2e.ts` green: launches packaged app with `HOME=<tmpdir>` override, marker absent → waits for Navigator + renderer-mount-ack → asserts consent dialog rendered without any project opened → clicks Add → asserts `<tmpHome>/.open-knowledge/.mcp-status.json` persisted + at least one MCP config file under `<tmpHome>` updated with bundle-absolute cliPath. | `bunx playwright test packages/desktop/tests/smoke/mcp-wiring.e2e.ts`. |
| AC2.9 | `packages/desktop/README.md` MCP wiring subsection exists with consent dialog screenshot, marker-file location, re-trigger instructions (if post-M6 delivered). | Docs inspection. |
| AC2.10 | `bun run check` green; `bunx playwright test packages/desktop/` green. | CI gate. |
| AC2.11 | **Merge semantics via `isCompatible` (OQ-16 + D-M6-R4 refined):** bun test fixtures cover four cases against each editor's `buildEntry` shape (including VS Code's `type:'stdio'` prepend). Fixture A: existing canonical `{command:'npx', args:['@inkeep/open-knowledge','mcp']}` → `isCompatible(existing, {mode:'published'})` → true → `force: true` → overwrite with cliPath shape. Fixture B: existing historical `{command:'npx', args:['-y','@inkeep/open-knowledge','mcp']}` (`-y` variant) → also `isCompatible` → true → overwrite. Fixture C: existing with user `env:{OK_LOG_LEVEL:'debug'}` augmentation → `isCompatible` → true (managed subset matches) → overwrite merges preserving `env`. Fixture D: `{command:'custom-wrapper', args:[...]}` foreign customization → `isCompatible` → false → preserve + structured `mcp-wiring-skip-customized` log. | `bun test packages/desktop/src/main/mcp-wiring.test.ts`. |
| AC2.12 | **Self-diagnosing wrapper (OQ-8):** simulate a missing-bundle state by running `ok.sh` from a fixture with `APP_BUNDLE_DIR` env override pointing at a nonexistent path; assert stderr first line is a human-readable copy (e.g. "Open Knowledge has been removed. Reinstall from the Open Knowledge DMG.") and second line is the JSON error `{"error":"ok-bundle-missing","hint":"…"}`; exit code is 69. Two-line shape so `head -1` is human-readable for clients that display stderr and `tail -1` is machine-readable. | bash-level unit test or bun test invoking the wrapper via `spawn`. |
| AC2.13 | **Dialog timing edge cases (H3):** Playwright smoke scenarios covering (F1) `lastOpenedProject` set + marker absent → editor window opens FIRST, not Navigator → dialog still fires in whichever window opens first (renderer-mount-ack handshake, per D-M6-R10); and (F2) first-launch via `openknowledge://` deep link + marker absent → editor window opens via deep-link dispatch → dialog still fires. Both scenarios assert `mcp-status.json` persisted after Add. | `bunx playwright test packages/desktop/tests/smoke/mcp-wiring.e2e.ts` with F1/F2 test cases. |
| AC2.14 | **Partial-failure recovery (OQ-19 DIRECTED):** fixture with 3 selected editors where one write is forced to fail (simulate by making target dir read-only via `chmod 444` in tmpHome). Assert: (i) two writes succeed, one returns action `'failed'`; (ii) marker file is NOT written (`configured: true` absent); (iii) structured `mcp-wiring-write-failed` log event per failing editor contains `editor`, reason, target path; (iv) re-running the dialog in-session restores prior selections. | `bun test` + Playwright smoke. |

## 6) Design notes

Phase 1's design is fully captured at [reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md](../../reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md). That document includes:

- Full `ok.sh` script content (~30 LOC, derived from VS Code's `code.sh`).
- `cli-install.ts` full implementation sketch with `isTranslocated`, `wrapperPathInBundle`, `getInstallStatus`, `installCli`, `uninstallCli`, `runAsAdmin`.
- Menu wiring diff for `menu.ts`.
- Launch-time broken-symlink repair hook for `index.ts`.
- Four-stage smoke test procedure.
- Why `Contents/Resources/cli/` (not `Contents/Resources/app.asar.unpacked/cli/`) — spec prose uses the latter but `extraResources` mechanism produces the former. The design spike flagged this for post-hoc correction in the parent D52 spec prose.

Phase 2 design notes:

### 6.1 Consent dialog UI shape

Native `dialog.showMessageBox` has `buttons` and `checkboxLabel` (single checkbox) but NOT multi-checkbox. A React modal is the fit — leverages the shared `packages/app/` bundle per D13.

**Location (OQ-13 resolved + H3 reopen resolved via D-M6-R10):** Host-agnostic. The dialog component lives in the shared `packages/app/` bundle and is subscribed from BOTH `NavigatorApp` (the common case) AND the editor root (`App.tsx`), so it renders in whichever window opens first after `app.whenReady()`. The `main/index.ts` dispatcher uses a **whenRendererReady-style** three-case (mirrors M3's auto-update pattern): window-ready → fire immediately; window-loading → wait for renderer mount-ack; no-window → subscribe to `browser-window-created` then wait for mount-ack.

**Why not coupled to Navigator only (rejecting OQ-13's first cut):** `lastOpenedProject` + `openknowledge://` deep links BOTH bypass Navigator — an editor window opens instead. Binding the dialog to Navigator's `did-finish-load` would silently fail in those flows, which are exactly the P1 E2E path (AC2.6). Mount-ack handshake avoids the race: main never fires `show` until the renderer is confirmed ready to receive it.

Component surface:

```tsx
<McpConsentDialog
  detectedEditors={[/* EditorDetection[] */]}
  onConfirm={(selectedEditorIds) => window.okDesktop.mcpWiring.confirm(selectedEditorIds)}
  onSkip={() => window.okDesktop.mcpWiring.skip()}
/>
```

IPC channels (to add to `packages/desktop/src/shared/ipc-channels.ts`):

- `ok:mcp-wiring:renderer-ready` (R → M event) — payload: `{}`. Fired by each renderer on mount. Main uses it as the ack gate for case (ii) / (iii) of the whenRendererReady dispatch.
- `ok:mcp-wiring:show` (M → R event) — payload: `{ detectedEditors: EditorDetection[] }`. Fires ONCE per app boot when the user-scoped marker is absent, dispatched via whenRendererReady three-case (D-M6-R10). Main sends to whichever renderer acked first.
- `ok:mcp-wiring:confirm` (R → M invoke) — payload: `{ editorIds: EditorId[] }`. Returns `{ ok: true } | { ok: false, error: string }`.
- `ok:mcp-wiring:skip` (R → M invoke) — payload: `{}`. Returns `{ ok: true }`.

Uses the existing typed-IPC `createHandler` / `createInvoker` helpers (precedent #19).

### 6.2 Marker file location

`~/.open-knowledge/.mcp-status.json` — **user-level**, not per-project (revised per G7). Inside `~/.open-knowledge/` so it sits next to the existing user-level `config.yml`. The consent dialog fires once per user per Mac, not per project. A user who later wants to re-trigger it (edge case OQ-5) removes the marker manually, or uses a future "Project → Set up AI tools…" menu item if that ships.

Shape:

```json
{ "configured": true, "configuredAt": "2026-04-21T15:30:00Z", "editors": ["claude", "cursor"], "cliPath": "/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh" }
// OR
{ "configured": false, "skippedAt": "2026-04-21T15:30:00Z" }
```

Storing `cliPath` at the time of the write is a diagnostic aid for OQ-8 (DMG uninstall lifecycle) — `ok mcp` can read the marker and classify "configured-but-broken" vs "never-configured" scenarios.

### 6.3 `writeUserMcpConfigs` + hybrid `cliPath` (D-M6-R8 + D-M6-R9)

**New CLI export.** `writeUserMcpConfigs(opts)` in `packages/cli/src/commands/init.ts`, distinct from `runInit`:

```ts
export interface WriteUserMcpConfigsOptions {
  editors: EditorId[];
  /** true = force every editor; Set = force only named editors; false/undefined = no force */
  force?: boolean | Set<EditorId>;
  /** Bundle-absolute wrapper path OR /usr/local/bin/ok. When set, MCP entries use
   *  {"command": cliPath, "args": ["mcp"]}. When unset, npx shape (current default). */
  cliPath?: string;
  /** Override $HOME (for Playwright + unit tests). */
  home?: string;
}

export async function writeUserMcpConfigs(
  opts: WriteUserMcpConfigsOptions,
): Promise<EditorMcpResult[]>;
```

Implementation scope: loops `resolveEditorTargets(opts.editors)`, calls `writeEditorMcpConfig(target, '', forceForEditor, { cliPath: opts.cliPath }, opts.home)` per editor, aggregates results. **Does NOT** run `ensureProjectGit` / `initContent` / `scaffoldLaunchJson` / `upsertRootInstructions` / `collectLegacyProjectConfig`. Those are project-scoped concerns that `runInit` (the CLI `ok init` invocation) still owns — `writeUserMcpConfigs` is surgical to the per-editor MCP config write.

**Also extend** `McpInstallOptions` in `packages/cli/src/commands/editors.ts` with `cliPath?: string`; extend `buildManagedServerEntry` to check `options.cliPath` as the HIGHEST-precedence branch (before `mode === 'dev'`, before the `PUBLISHED_MCP_SERVER_COMMAND` fallback).

**Hybrid `cliPath` resolution (D-M6-R9).** Electron-origin `runMcpWiringOnFirstLaunch` computes `cliPath` at consent-confirm time, BEFORE calling `writeUserMcpConfigs`:

```ts
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

function resolveCliPath(app: Electron.App): string {
  const bundleAbsolute = join(
    dirname(dirname(app.getPath('exe'))),  // .app/Contents
    'Resources', 'cli', 'bin', 'ok.sh',
  );

  // Prefer symlink when present AND owned by this bundle.
  const symlink = '/usr/local/bin/ok';
  try {
    if (existsSync(symlink) && lstatSync(symlink).isSymbolicLink()) {
      const target = resolve(dirname(symlink), readlinkSync(symlink));
      if (target === bundleAbsolute || target.startsWith(dirname(dirname(bundleAbsolute)))) {
        return symlink;  // stable across auto-update + app-move
      }
    }
  } catch {
    // fall through to bundle-absolute
  }
  return bundleAbsolute;
}
```

**Rationale for hybrid (reopens part of D-M6-R2 per challenger H4):**

- **Robustness when M6a installed.** Symlink is stable across Squirrel.Mac atomic-swap (the bundle at the symlink's target gets replaced in place) AND across app-move (LaunchServices resolves the `.app` via bundle ID; symlink target follows). Bundle-absolute paths break on move; symlink paths don't.
- **Self-sufficient when M6a NOT installed.** Bundle-absolute fallback means M6b still works without the CLI-on-PATH menu click (preserves the D-M6-R2 decoupling for P1 persona who never opens a terminal).
- **Ownership check.** The `readlinkSync` target must resolve into the current bundle — otherwise the symlink is foreign (e.g., from an old uninstalled OK bundle, or a third-party `ok` binary). Falls through to bundle-absolute in that case.
- **Eliminates Apple Silicon PATH-precedence hazard** (§6.5) when bundle-absolute branch is taken — direct path, no $PATH traversal.

**Tradeoffs:**

- **App-move + M6a missing.** User drags `.app` out of `/Applications/` + never installed M6a → bundle-absolute configs go stale. Mitigated by G5 extension (see challenger H4 follow-up) OR by self-diagnosing wrapper (D-M6-R6) which surfaces the stale-path state to the AI tool.
- **Paths contain spaces** in the bundle-absolute branch (`Open Knowledge.app`). Ecosystem norm is `child_process.spawn(command, args, { shell: false })` which doesn't shell-interpolate — safe. AC2.6 verifies across all 6 clients; OQ-15 tracks the per-client investigation.
- **Two `ok` semantics per machine** only materializes when (a) M6a installed AND (b) user also has npm-global `ok`. Hybrid resolution writes the symlink which points at the bundle wrapper — the npm-global binary is used only for `which ok` in the shell. Version skew between DMG-shipped and npm-shipped flows through OQ-11's `server.lock` okVersion tracking (follow-up spec).

**CLI-origin `ok init` (terminal) unchanged** — never passes `cliPath`; continues to produce `{command:'npx',...}` shape via `runInit`'s existing code path. The symlink at `/usr/local/bin/ok` remains the M6a user-facing affordance for shell use.

### 6.4 Why Phase 1 ships first

- M4 (URL scheme) and M5 (keyring E2E) are half-day each and can run in parallel with M6a.
- M6a has zero runtime coupling with either. Design spike already validates.
- Shipping M6a delivers user value immediately: anyone with the signed DMG gets `ok` on PATH, works from any terminal. Unblocks design-partner testers who want CLI-authored `.mcp.json` entries.
- M6a still de-risks shared infrastructure (`extraResources` layout, admin prompt UX, the `ok.sh` wrapper) that M6b also uses — but M6b is **no longer load-bearing on M6a** after D-M6-R2 (bundle-absolute cliPath). M6b works end-to-end even if the user never invokes "Install Command-Line Tools…". M6a is a separate value add for terminal users, not a prerequisite for the P1 MCP path.

If M4/M5 land unexpectedly fast (same PR cycle), the split is cheap to unwind — M6a + M6b merge together. If they don't, M6a has already shipped and M6b is a tight follow-up when M4/M5 are green.

### 6.5 Install coexistence taxonomy & runtime interaction matrix

M6 lands into a landscape where multiple `ok` binaries can coexist on one machine. G4's collision guard catches the install-time symlink-overwrite case; the ongoing coexistence story isn't documented elsewhere, and several user-reportable symptoms fall out of it.

**Origins `ok` can reach a user's PATH from:**

| # | Origin | Install path | Node on user's machine? |
|---|---|---|---|
| i   | DMG + "Install Command-Line Tools…" (M6a) | `/usr/local/bin/ok` → bundled `ok.sh` wrapper | No (ELECTRON_RUN_AS_NODE) |
| ii  | `npm install -g @inkeep/open-knowledge` | `/opt/homebrew/bin/ok` (Apple Silicon) · `/usr/local/bin/ok` (Intel) | Yes |
| iii | Transient `bunx @inkeep/open-knowledge …` | `<bun-cache>/bin/ok` (not on PATH by default) | Yes |
| iv  | Monorepo dev (`bun run --filter=@inkeep/open-knowledge start`) | source-built, not on PATH | Yes |

**PATH-precedence hazards (applies to i × ii coexistence).** Addressed structurally by the §6.3 direction change to bundle-absolute `cliPath`, but surfaces for shell-typed `ok`:

- **Apple Silicon.** `/opt/homebrew/bin` typically precedes `/usr/local/bin` in a user's PATH. A user with both installs types `ok` in their terminal and gets (ii); AI tools spawn (i) via the bundle-absolute `cliPath` in their MCP config. Same codebase, but versions can drift if the user upgrades one without the other. `which -a ok` per AC1.9 is the diagnostic.
- **Intel Mac.** Homebrew's default prefix IS `/usr/local/bin`, so (i) and (ii) compete for the same path. G4 prompts on M6a install. A later `npm install -g` silently overwrites the M6a symlink; G5's broken-symlink check doesn't catch this (the npm shim is a valid file, just a different one). Recovery: re-run the menu item.

**Runtime interaction matrix:**

| Scenario | Collab server running? | AI-tool `cliPath` resolution (D-M6-R9 hybrid) | Status |
|---|---|---|---|
| DMG + M6a installed; no npm CLI | Electron utility (spawn mode) | `/usr/local/bin/ok` (symlink — passed ownership check) | Happy path (P1 persona). Stable across auto-update + app-move. |
| DMG installed; M6a NOT installed | Electron utility | Bundle-absolute `.../Contents/Resources/cli/bin/ok.sh` (symlink absent, fallback) | Works; fragile to app-move (configs go stale). Self-diagnosing wrapper (D-M6-R6) surfaces the stale-path state to AI tools on spawn attempt. |
| DMG installed; M6b accepted; M6a installed LATER | Electron utility | Bundle-absolute (already written — not re-resolved) | Terminal-shell `ok` works; MCP still points at bundle-absolute. To upgrade to symlink, user can delete marker and re-trigger M6b (edge case; OQ-5 follow-up). |
| DMG installed; npm CLI ALSO installed; M6a installed | Electron utility | `/usr/local/bin/ok` (symlink — ownership check passes) | Terminal `ok` may be npm (Apple Silicon `/opt/homebrew/bin` precedence). Different binaries but same DMG-bundled codebase via wrapper. Version skew possible if user upgrades one without other. See OQ-11. |
| DMG installed; Intel + npm overwrote M6a symlink | Electron utility | Bundle-absolute (ownership check FAILS — symlink target is not in our bundle) | Correct fallback — never trust a symlink we don't own. User can re-run "Install Command-Line Tools…" to restore the symlink + unlock the stable path. |
| DMG uninstalled (drag to Trash) after M6b wrote configs | — | Stale path (symlink broken OR bundle-absolute vanished) | Self-diagnosing wrapper (D-M6-R6) emits JSON error + exit 69. AI tool surfaces. See OQ-8. |
| Monorepo dev: `bun run dev` + DMG Electron launched | Vite plugin owns lock | Electron enters attach mode | M6b dialog fires once per user (marker `~/.open-knowledge/.mcp-status.json`); MCP configs point at DMG bundle's wrapper; attach mode connects to Vite's collab. See OQ-11 for server/client version skew. |
| `ok ui` run from installed wrapper (terminal) | Requires `ok start` or attaches via `/api/config` | N/A (not MCP) | Uncovered by AC1.4 — see AC1.11 + OQ-10. |

## 7) Known gaps / open questions

- **OQ-1 (Phase 1).** The `runAsAdmin` function in the design spike uses `spawn('osascript', ['-e', script])`. VS Code's implementation is believed to be equivalent but the TypeScript handler wasn't directly located during the research. If a subtle difference exists (e.g., VS Code uses an auxiliary helper binary), the implementer should catch it during manual smoke of AC1.4.
- **OQ-2 (Phase 1).** `electron-builder`'s `extraResources` copy with `filter: ["**/*", "!public/**", "!**/*.map"]` should exclude the already-separately-shipped React bundle under `public/` and source maps. Verify the filter glob syntax on first build — electron-builder historically has had quirks with negation patterns.
- **OQ-3 (Phase 2, RESOLVED).** `detectInstalledEditors` safe to call from Electron main. Verified via source reading (`evidence/editor-targets-and-scope.md`) — function takes `cwd` but never uses it for detection; every editor target defines `detectPath(_cwd, home)` that resolves from `home`. All 6 editor targets are `scope: 'global'`. Packaged-build confirmation is belt-and-suspenders; not blocking.
- **OQ-4 (Phase 2).** The consent-dialog React modal needs a visual-design pass. Minimum-viable: title, 6 checkboxes, Add + Skip buttons, Cancel via ESC. If the parent spec's §8.11 evolves to include a detailed UI mockup, follow that; otherwise implement minimal and iterate via PR feedback.
- **OQ-5 (Phase 2).** What happens if the user clicks Skip but later wants to re-trigger? Currently: delete `.mcp-status.json` manually or `ok init` from terminal. Is that acceptable for M6b ship? If not, add a "Project → Set up AI tools…" menu item — ~20 LOC delta. Resolve with a reviewer before M6b lands.
- **OQ-6 (both phases).** Does `electron-vite dev` correctly mount `extraResources` in dev mode? If not, AC1.3 behavior (wrapper-missing-from-bundle dialog in dev) is expected and documented; if yes, dev-mode should actually-work. Implementer should confirm empirically.
- **OQ-7 (Phase 1).** Admin-prompt decline UX. `osascript` prompt can be canceled by the user. Expected: menu label remains "Install Command-Line Tools…", no dialog pileup, `.cli-install.log` records the decline with timestamp + exit code. Not currently specified. Decide before ship whether to surface a non-modal toast ("CLI tools not installed — click the menu again when ready") or silently return. Silent-return is the lower-surprise option; toast may be warranted if follow-up UX (post-M6) needs to cue the user toward the menu item.
- **OQ-8 (Phase 2, RESOLVED).** MCP config lifecycle on DMG uninstall — **option (b) self-diagnosing wrapper** selected. The bundled `ok.sh` wrapper verifies CLI + Electron binary presence before invoking; on missing target, emits `{"error":"ok-bundle-missing","hint":"…"}` to stderr and exits 69. AI tool surfaces to user. Recovery: reinstall DMG (post-install app-launch runs G5 repair), or manually delete OK entries and rerun `ok init`. See G2 + AC2.12. Option (a) active cleanup deferred to Future Work — too risky to edit other apps' config files without strong assurance we own the entries.
- **OQ-9 (Phase 2, resolved direction but documented).** `cliPath` shape. Pre-direction-change, written as the `/usr/local/bin/ok` symlink. Post-direction-change (§6.3, 2026-04-21), written as the bundle-absolute path from `app.getPath('exe')`. This update resolves three downstream concerns: (a) dialog-accepted-but-M6a-declined produces working MCP, (b) Apple Silicon PATH-precedence is bypassed for MCP resolution, (c) version skew between DMG and npm global installs is localized to terminal-only effect. Remaining live: app-move fragility (G5 repair needs extending) and space-in-path quoting (AC2.6 verifies across all target AI tools).
- **OQ-10 (Phase 1).** `ok ui` via the DMG wrapper. AC1.4 exercises `ok --version` and `ok mcp` only; `ok ui` (which needs the React bundle at `cli/dist/public/`) is untested. If OQ-2's `extraResources` filter drops `public/**`, `ok ui` from the wrapper 404s every bundle asset. AC1.11 (below) adds the exercise; the filter should intentionally KEEP `cli/dist/public/**` for wrapper parity — despite redundancy with the separately-shipped `Resources/app/` copy that the BrowserWindow loads. Two copies, one bundle, different consumers.
- **OQ-11 (cross-cutting, likely follow-up spec).** Version tracking in `server.lock`. The existing lock schema is `{ pid, hostname, port, startedAt, worktreeRoot }` — no version. Post-M6 the machine can host (i) a DMG-bundled `ok` via wrapper and (ii) an npm-installed `ok` simultaneously, each potentially different versions. When any client connects to a running collab server — an `ok ui` from one install, an `ok mcp` from another, Electron attach mode binding an externally-launched `bun run dev`, etc. — it has no signal for "am I talking to a server of a compatible version?"
  - **Proposal:** add `okVersion: string` (from `PACKAGE_VERSION`) at lock write time. Clients read it at connection establishment. On mismatch:
    - Pre-1.0 (today): strict equality required; log a structured `server-version-mismatch` warning; optionally show a non-modal UI banner.
    - Post-1.0: semver — major bump → reject + clear error; minor bump → warn; patch → silent.
  - **Value:** diagnoses a class of bug that is otherwise opaque ("my agent writes vanished" → version skew between Electron utility running 0.5.3 and MCP client running 0.4.9).
  - **Scope:** adds one field to lock schema + one read-point per client surface. Not strictly M6 — but M6 is the first milestone where three different `ok` binaries plausibly coexist, which makes version-skew surface user-visible. Flag for a follow-up spec; consider landing alongside M7 (first design-partner build) so design-partner bug reports have the diagnostic signal from day one.
- **OQ-12 (Phase 2, RESOLVED).** Dev-mode gating for M6b consent. Gate `runMcpWiringOnFirstLaunch()` on `app.isPackaged === true`. In `electron-vite dev --watch`, `app.getPath('exe')` points at the dev electron binary and `extraResources` are not mounted — firing the dialog would contaminate the developer's real MCP configs. Dev-mode invocations are no-ops. Developers who want to test the flow set `OK_M6B_FORCE=1` plus isolated `HOME` via `HOME=/tmp/…-home`. Encoded in AC2.2 and §9 STOP_IF (b).
- **OQ-13 (Phase 2, RESOLVED via D-M6-R10 refinement).** Dialog dispatch — initial resolution was "piggyback on Navigator"; challenger H3 surfaced that `lastOpenedProject` + `openknowledge://` deep links both bypass Navigator. Final resolution: whenRendererReady-style three-case dispatch (D-M6-R10). `McpConsentDialog` subscribed from both NavigatorApp and editor App.tsx, renders in whichever window opens first. See §4, §6.1, AC2.13.
- **OQ-14 (Phase 2, DIRECTED).** Checkbox default state per editor: **preselect every detected editor**. Matches CLI `ok init` behavior, respects "what the user actually has installed." Parent §8.11's three-checked / three-unchecked defaults were prose-illustrative, not evidence-based — supersede in M6b. Reconciled across G7, AC2.2. Reversible if PM/UX review lands differently post-ship.
- **OQ-15 (Phase 2).** Path-spaces quoting across the 6 MCP parsers. The bundle-absolute `cliPath` (e.g. `/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh`) contains spaces. Ecosystem norm is `child_process.spawn(command, args)` which does not shell-interpolate, so spaces in `command` are safe. Not verifiable in-session without source access to all 6 clients. **Resolution posture:** trust the ecosystem norm for initial impl; encode verification in AC2.6 across all selected editors. If a specific client mis-handles, file as a subsequent bug + consider a symlink workaround for that editor only.
- **OQ-16 (Phase 2, RESOLVED).** Merge semantics with existing `{command:'npx',...}` entries from a prior `ok init` — **per-editor conditional `force: true`** selected. If the existing OK entry matches the known npx shape exactly (`{command:'npx', args:['@inkeep/open-knowledge','mcp']}`), overwrite with bundle-absolute `cliPath`. If user-customized (any deviation), skip with a structured `mcp-wiring-skip-customized` log. See §4 `mcp-wiring.ts` row + AC2.11. Rationale: P1 users without Node need the npx entry replaced for correctness; foreign customizations must never be stomped.
- **OQ-17 (Phase 2, RESOLVED).** M4 + M5 status. Both shipped on 2026-04-21 — M4 via PR #266 (`openknowledge://` URL scheme end-to-end) and M5 via PR #267 (`@napi-rs/keyring` packaged E2E). Phase 2 is therefore unblocked at the dependency level; only AC2.6 (P1 E2E smoke) remains creds-gated on Apple Developer notarization — same gate as M5's AC4–AC7.
- **OQ-18 (cross-cutting, P2).** Atomic-swap auto-update (M3) × cliPath in user configs. Squirrel.Mac updates swap the `.app` in place atomically — the absolute path written by M6b continues to resolve post-update. Verify during M3 QA once M3 exits scaffolding. No expected issue, but worth noting so an M3 regression that changes swap semantics gets caught.
- **OQ-19 (Phase 2, DIRECTED).** Partial-failure recovery during per-editor writes — **option (b) best-effort + deferred marker write** selected. `writeUserMcpConfigs` returns `EditorMcpResult[]`; M6b aggregates results. If ANY per-editor write failed (action `'failed'`), do NOT write the `configured: true` marker — leave `.mcp-status.json` absent so the dialog re-fires next launch with prior selections pre-filled (via a separate transient state saved in memory + restored if dialog re-fires in same boot). If ALL succeed, write `{ configured: true, configuredAt, editors: [...], cliPath }`. Also show a non-modal diagnostics toast listing per-editor failures with the `mcp-wiring-write-failed` log event shape (include `editor` + short reason + target path for operator diagnosis). No revert (too risky to edit foreign config files). Encoded in AC2.5 + new AC2.14 below.
- **OQ-20 (Phase 2, empirical).** macOS TCC / entitlements for writing `~/Library/Application Support/Claude/claude_desktop_config.json` from Electron main. Electron already writes to `~/Library/Application Support/<own-app-name>/` for electron-store; writing to another app's container is different. Non-sandboxed apps (no `com.apple.security.app-sandbox` entitlement) generally have free home access outside TCC-protected paths (Desktop/Documents/Downloads/iCloud). `~/Library/Application Support/` is typically unrestricted. Verify empirically on signed+notarized build during AC2.6 smoke. If a TCC prompt fires mid-flow, user may dismiss it, leaving config unwritten — add dialog language preparing the user for OS prompts.
- **OQ-21 (Phase 2, implementation detail).** E2E test isolation for `mcp-wiring.e2e.ts`. Playwright smoke must NOT write to the developer's real `~/.claude.json`. Use `HOME=<tmpdir>` environment override when launching Electron via Playwright `_electron.launch({ env: { HOME: tmpHome, ... } })`. Encoded into AC2.8 test harness. Standard pattern; no design decision needed, just don't miss it.
- **OQ-22 (Phase 1, concrete glob).** `extraResources` filter for the `cli/dist/` copy. Per OQ-10 the `cli/dist/public/**` bundle must be KEPT (so `ok ui` from wrapper works). Per OQ-2 source maps should be EXCLUDED. Concrete filter: `filter: ['**/*', '!**/*.map']`. Do NOT exclude `public/**`. Verify via AC1.2 inspection that `Contents/Resources/cli/dist/cli.mjs` + `Contents/Resources/cli/dist/public/index.html` both present + no `.map` files.

## 8) Implementation sequence

### Phase 1 (M6a)

1. Implement `cli-install.ts` (pure functions + runtime wrappers) per design spike §4.
2. Write `cli-install.test.ts` pure-function tests.
3. Ship `ok.sh` wrapper + make executable.
4. Wire electron-builder.yml `extraResources`.
5. Wire menu item in `menu.ts`.
6. Wire broken-symlink repair hook in `index.ts`.
7. Build unsigned DMG; smoke-test AC1.1–AC1.10.
8. README updates.
9. `bun run check`. Push. Request review.

### Phase 2 (M6b) — M4 + M5 both shipped; only AC2.6 creds-gated

1. **CLI surface (lands first).** Extend `McpInstallOptions` (`editors.ts`) with `cliPath?: string`; extend `buildManagedServerEntry` to handle `cliPath` as highest-precedence branch. Export `writeEditorMcpConfig` from `init.ts` if not already. Add new export `writeUserMcpConfigs(opts)` in `init.ts` that wraps the per-editor loop without runInit's side effects. Unit tests cover: (a) existing CLI `ok init` behavior unchanged (no `cliPath` → npx shape); (b) `writeUserMcpConfigs` produces correct shape per editor including VS Code's `type:'stdio'` prepend; (c) `force: Set<EditorId>` path applies per-editor `force` correctly.
2. Implement `mcp-wiring.ts` in desktop — `runMcpWiringOnFirstLaunch()`, hybrid `resolveCliPath(app)` per D-M6-R9, marker read/write, `isCompatible`-based per-editor force computation.
3. Implement `McpConsentDialog.tsx` inside `packages/app/` (shared React bundle). Subscribe from both NavigatorApp and App.tsx — dialog is host-agnostic.
4. Wire IPC channels in `packages/desktop/src/shared/ipc-*.ts`: `ok:mcp-wiring:renderer-ready`, `ok:mcp-wiring:show`, `ok:mcp-wiring:confirm`, `ok:mcp-wiring:skip`.
5. Hook `runMcpWiringOnFirstLaunch` into `main/index.ts` `app.whenReady()` — fires once per app boot, gated on `app.isPackaged` + `process.platform === 'darwin'`. Use whenRendererReady three-case dispatch per D-M6-R10.
6. Unit tests for `mcp-wiring.ts` pure helpers (marker read/write, `resolveCliPath` with mocked `app.getPath('exe')` + mocked `fs`, `isCompatible`-based force computation).
7. Playwright smoke `mcp-wiring.e2e.ts` with `HOME=<tmpdir>` override (OQ-21). Scenarios: happy-path Navigator, F1 (`lastOpenedProject` set), F2 (`openknowledge://` deep link).
8. **(Creds-gated)** Manual P1 E2E smoke (AC2.6) — signed + notarized DMG required.
9. README updates.
10. `bun run check` + `bunx playwright test packages/desktop/`. Push. Request review.

## 9) Agent constraints

### Phase 1

- **SCOPE:** `packages/desktop/` + one `packages/desktop/README.md` section. Do NOT touch `packages/cli/` or `packages/server/`.
- **EXCLUDE:** MCP wiring orchestration (Phase 2). `runInit` modifications (Phase 2). Any renderer React code (Phase 2).
- **STOP_IF:** The extraResources glob filter produces unexpected output (e.g., source maps present in the bundle). Diagnose before shipping — don't mask with a post-build cleanup script.
- **ASK_FIRST:** Any deviation from the design spike's wrapper script content or `cli-install.ts` function signatures. Deviations require reviewer sign-off because other parts of the system reference those shapes.

### Phase 2

- **SCOPE:**
  - **Desktop:** `packages/desktop/src/main/mcp-wiring.ts` (new + tests), IPC channels in `packages/desktop/src/shared/ipc-*.ts`, dispatcher in `packages/desktop/src/main/index.ts`, Playwright smoke `packages/desktop/tests/smoke/mcp-wiring.e2e.ts`.
  - **App bundle (shared React):** `packages/app/src/components/McpConsentDialog.tsx` (new), mount-ack subscribers added to `packages/app/src/components/NavigatorApp.tsx` AND `packages/app/src/App.tsx` (or the editor root equivalent).
  - **CLI:** NEW export `writeUserMcpConfigs` in `packages/cli/src/commands/init.ts` (per D-M6-R8) + `cliPath` option in `McpInstallOptions` (`packages/cli/src/commands/editors.ts`) + `buildManagedServerEntry` highest-precedence branch + export `writeEditorMcpConfig` if not already exported. Backward-compatibility tests required.
- **EXCLUDE:**
  - `detectInstalledEditors` implementation — it exists in `packages/cli/src/commands/init.ts:802`. Don't reimplement. Consume it.
  - `runInit` signature changes — `writeUserMcpConfigs` is a NEW peer function, not a modification to `runInit`. `runInit`'s existing behavior (project-scoped scaffolding + MCP writes via the CLI's `ok init` command) is untouched.
  - Active cleanup of foreign MCP configs on DMG uninstall (OQ-8 option (a)) — rejected; self-diagnosing wrapper (D-M6-R6) is the sole mechanism.
- **STOP_IF:**
  - (a) `writeUserMcpConfigs` export introduces unit-test failures in the existing CLI test suite — backward compatibility is load-bearing; existing CLI users must continue to get the `npx` shape via `ok init` → `runInit` (which does NOT pass `cliPath`).
  - (b) Dev-mode (`electron-vite dev`) invocation triggers the consent dialog — the `app.isPackaged` gate (D-M6-R7) must prevent this absolutely; dev contamination of real user MCP configs is irrecoverable.
  - (c) The consent dialog renders but `app.getPath('exe')` yields a path that doesn't end in the expected `.app/Contents/MacOS/<name>` shape — abort and log. Do not attempt cliPath computation.
  - (d) Any per-editor `writeEditorMcpConfig` invocation produces a side effect outside the target editor's config file (e.g. creates `.git/`, `AGENTS.md`, `launch.json` in `$HOME` or `/`) — regression into `runInit` territory; halt and investigate.
  - (e) The D-M6-R9 hybrid `cliPath` resolver's ownership check (`readlinkSync` target inside bundle) returns a positive match against a symlink NOT created by our M6a path — we'd be writing a foreign symlink into user configs. Safe fallback is bundle-absolute; abort + log if detection is unclear.
- **ASK_FIRST:** UI/UX changes to the consent dialog beyond the minimum-viable checkbox list. Visual polish and copy are product decisions.

---

## 10) Decision log

Ten direction + design decisions made during this spec pass (D-M6-R1 and R2 from the initial coexistence review; R3–R7 during the /spec iteration loop; R8–R10 from the audit + design-challenge pass):

- **D-M6-R1 (2026-04-21, LOCKED): MCP consent is user-scoped, fires on first desktop-app launch.** Previously framed in parent §8.11 as per-project. MCP configs are user-scoped in every target AI tool's convention (`~/.claude.json`, `~/Library/Application Support/Claude/`, `~/.cursor/mcp.json`) — project-scoped consent would re-prompt for no gain. Marker moves from `<project>/.open-knowledge/.mcp-status.json` to `~/.open-knowledge/.mcp-status.json`. See G7 + §6.2. **Corrigendum needed on parent spec §8.11** when M6b ships (breadcrumb per AGENTS.md convention).
- **D-M6-R2 (2026-04-21, LOCKED): `cliPath` is bundle-absolute, not the M6a symlink.** Previously `/usr/local/bin/ok`; now `app.getPath('exe')`-derived wrapper path. Decouples M6b from M6a, eliminates Apple Silicon PATH-precedence hazard, version-couples MCP to the DMG bundle. See G8 + §6.3 + §6.5 + OQ-9. **Corrigendum needed on parent D52 prose** when M6b ships — D52's literal example `{"command": "/usr/local/bin/ok", "args": ["mcp"]}` is now stale.
- **D-M6-R3 (2026-04-21, LOCKED): Phase 2 is decoupled from M4/M5 as hard blockers; both already shipped.** M4 (PR #266) and M5 (PR #267) are landed. Phase 2 core (consent + runInit write + Playwright smoke) is unblocked at the dependency level. Only AC2.6 (P1 E2E smoke) remains creds-gated on Apple notarization — same gate as M5's AC4–AC7. See OQ-17 + §1 Depends-on.
- **D-M6-R4 (2026-04-21, DIRECTED): Merge semantics — per-editor conditional `force: true` when existing entry matches known npx shape.** If the existing OK entry in an editor's config is the canonical `{command:'npx', args:['@inkeep/open-knowledge','mcp']}` (CLI default), M6b passes `force: true` so the bundle-absolute `cliPath` overwrites — correctness win for P1 users who ran `ok init` pre-DMG. If user-customized, skip with structured log. Never stomp foreign customization. See §4 `mcp-wiring.ts` row + AC2.11 + OQ-16.
- **D-M6-R5 (2026-04-21, DIRECTED): Consent dialog piggybacks on Navigator.** Renders as React modal overlay inside NavigatorApp; no dedicated BrowserWindow. IPC `ok:mcp-wiring:show` (M→R event), `ok:mcp-wiring:confirm` + `ok:mcp-wiring:skip` (R→M invoke). See §6.1 + OQ-13.
- **D-M6-R6 (2026-04-21, DIRECTED): Self-diagnosing wrapper for OQ-8 (DMG uninstall lifecycle).** `ok.sh` verifies bundle path presence before invoking CLI; on missing target, emits `{"error":"ok-bundle-missing","hint":"…"}` to stderr + exits 69. Active config cleanup (option a) deferred to Future Work — too risky to edit other apps' config files. See G2 + AC2.12 + OQ-8.
- **D-M6-R7 (2026-04-21, LOCKED): Dev-mode contamination guard — `runMcpWiringOnFirstLaunch` gated on `app.isPackaged === true`.** In `electron-vite dev`, `app.getPath('exe')` points at dev electron binary and extraResources aren't mounted, so computed `cliPath` would be garbage. Firing the dialog would contaminate the developer's real user MCP configs — irrecoverable. Dev-mode is a no-op; env override `OK_M6B_FORCE=1` + isolated `HOME` for developer testing. See OQ-12 + §9 STOP_IF(b).
- **D-M6-R8 (2026-04-22, LOCKED): M6b calls a new CLI export `writeUserMcpConfigs`, NOT `runInit`.** Surfaced by audit H1 + challenger H1: `runInit` runs `ensureProjectGit` + `initContent` + `scaffoldLaunchJson` + `upsertRootInstructions` + `collectLegacyProjectConfig` against `cwd` — none of which belong in a user-scoped consent flow. `process.cwd()` defaults to `/` for a macOS packaged app; calling `runInit` from Electron main would `git init /` at every first app launch. New function `writeUserMcpConfigs(opts)` is surgical to per-editor MCP config writes. See G8 + §4 + §6.3 + AC2.3.
- **D-M6-R9 (2026-04-22, LOCKED): Hybrid `cliPath` resolution — symlink when M6a-installed, bundle-absolute otherwise.** Surfaced by challenger H4: bundle-absolute (D-M6-R2) is fragile under Squirrel.Mac atomic-swap + app-move; every precedent (VS Code, Zed, Cursor) uses symlinks for exactly this reason. Hybrid keeps D-M6-R2's decoupling (M6b works without M6a installed) while gaining symlink robustness when M6a IS installed. Resolution at consent-confirm time: probe `/usr/local/bin/ok`; if symlink whose `readlinkSync` target lives inside the current bundle, use the symlink. Else bundle-absolute fallback. See §6.3 implementation sketch + AC2.4 covers both branches.
- **D-M6-R10 (2026-04-22, LOCKED): Dialog dispatch uses whenRendererReady three-case, not Navigator-only.** Surfaced by challenger H3: `lastOpenedProject` + `openknowledge://` deep links BOTH bypass Navigator. Binding the dialog to Navigator's `did-finish-load` fails silently in the exact flows AC2.6 is supposed to prove. Mirror M3's auto-update pattern: window-ready → fire; window-loading → wait for renderer mount-ack; no-window → subscribe to `browser-window-created`. `McpConsentDialog` is subscribed from both NavigatorApp AND editor App.tsx — dialog is host-agnostic. See §4 + §6.1 + AC2.13.
- **D-M6-R11 (2026-04-23, LOCKED): Flip `RunAsNode` fuse from `false` to `true`.** Surfaced during implementation — US-003 traced the dependency from the M6a `ok.sh` wrapper's `ELECTRON_RUN_AS_NODE=1` invocation down to `@electron/fuses`'s `FuseV1Options.RunAsNode`, which parent §8.9 locked to `false`. With the fuse disabled, Electron silently ignores the env var and launches the GUI — making every manual-smoke AC for packaged builds (AC1.4 / AC1.5 / AC1.7 / AC1.8 / AC2.4 / AC2.6 / AC2.7) unverifiable. Deferring would ship the feature broken. Amendment applied: `packages/desktop/scripts/target-fuses.mjs` flips `RunAsNode: true` with inline rationale + defense-in-depth argument (EnableNodeOptionsEnvironmentVariable stays DISABLED; asar integrity + only-load-from-asar unchanged; post-sign verification posture from D17 intact — verifier diffs against this same map). VS Code + Atom ship with `runAsNode=true` for the identical Electron-as-Node-host wrapper pattern; Zed's separate-Node-binary alternative was explicitly rejected (`reports/electron-bundled-cli-install-patterns/evidence/zed-pattern.md`). Corrigendum breadcrumbs added on parent spec lines 157 + 791. See `packages/desktop/scripts/target-fuses.mjs` + `afterPack.mjs` headers + `packages/desktop/README.md` fuse-verification line.

**Parent-spec follow-ups (tracked, not in M6 scope):**

- Post-hoc correction to parent D52 prose on the wrapper path (`app.asar.unpacked/cli/` → `Contents/Resources/cli/`) per the research-report audit finding M5.
- Corrigendum breadcrumbs on parent §8.11 (D-M6-R1 trigger realignment + D-M6-R4 preselect-detected-editors defaults) and parent D52 literal (D-M6-R2 bundle-absolute cliPath) when M6b ships.
- **Parent §8.11 line 832 factual error** (audit M10): claims `runInit` is "synchronous (not async) and returns InitCommandResult". Actual signature is `async function runInit(...): Promise<InitCommandResult>` (`packages/cli/src/commands/init.ts:464`). Correct alongside the D-M6-R1 / R2 / R4 corrigenda.

**Cross-cutting follow-up (likely own spec):**

- OQ-11 — adding `okVersion` to `server.lock` to diagnose cross-install version skew. Consider landing alongside M7 (first design-partner build) so diagnostic signal is live when external bug reports arrive.

## 11) References

- [Parent: specs/2026-04-11-electron-desktop-app/SPEC.md](../2026-04-11-electron-desktop-app/SPEC.md) — §14 M6 DOD, §8.11 (MCP wiring), §8.12 (CLI shim install), D11 / D52 / G3.
- [reports/electron-bundled-cli-install-patterns/REPORT.md](../../reports/electron-bundled-cli-install-patterns/REPORT.md) — research report characterizing the 7-app precedent + concrete M6 design.
- [reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md](../../reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md) — **Phase 1 design spike** — full implementation sketch for `cli-install.ts`, `ok.sh`, electron-builder.yml amendments, smoke test procedure.
- [reports/electron-bundled-cli-install-patterns/evidence/npm-electron-coexistence.md](../../reports/electron-bundled-cli-install-patterns/evidence/npm-electron-coexistence.md) — coexistence semantics (relevant for G4 + documentation).
- [reports/cli-command-name-ok-okb/REPORT.md](../../reports/cli-command-name-ok-okb/REPORT.md) — naming precedent (`ok` as primary bin).
- [reports/mastra-speakeasy-cli-install-recommendations/REPORT.md](../../reports/mastra-speakeasy-cli-install-recommendations/REPORT.md) — adjacent CLI distribution patterns.
- [PR #252](https://github.com/inkeep/open-knowledge/pull/252) — the research report + this spec + M4/M5 sibling specs ship here.
- [PR #170](https://github.com/inkeep/open-knowledge/pull/170) — `ok` dual-bin merged (prerequisite, already landed).
- Sibling specs:
  - [./specs/2026-04-21-m4-url-scheme/SPEC.md](../2026-04-21-m4-url-scheme/SPEC.md) — M4 dep for Phase 2.
  - [./specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md](../2026-04-21-m5-keyring-packaged-e2e/SPEC.md) — M5 dep for Phase 2.
