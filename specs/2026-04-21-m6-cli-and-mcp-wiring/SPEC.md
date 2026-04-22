---
title: M6 — CLI-on-PATH install + first-launch MCP wiring (phased)
description: Close M6's DOD in two phases. Phase 1 (M6a) ships the "Install Command-Line Tools…" menu item — zero dependencies on M4/M5, can merge first. Phase 2 (M6b) ships the first-launch MCP consent dialog + runInit orchestration, unblocked by M4 + M5. Grounded in the research report + design spike in `reports/electron-bundled-cli-install-patterns/`.
tags: [spec, desktop, electron, m6, cli-on-path, mcp-wiring, d52]
status: Draft — 2026-04-21
---

# M6 — CLI-on-PATH install + first-launch MCP wiring (phased)

**Milestone:** M6 of the [Electron desktop app](../2026-04-11-electron-desktop-app/SPEC.md) (§14). Parent spec is authoritative for D11 (superseded), D52 (LOCKED — CLI-on-PATH via menu item), §8.11 (`runInit` from Electron main), §8.12 (CLI shim install flow). G3 (zero terminal contact for P1) is load-bearing.

**Author:** Andrew (2026-04-21)
**Status:** Draft — not yet implemented. Full design spike checked in at [reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md](../../reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md); this spec scopes the two implementation PRs.
**Depends on:**
- **Phase 1 (M6a)**: M2 (signed-DMG scaffolding — **shipped** PR #245). Zero deps on M4 / M5.
- **Phase 2 (M6b)**: M2 + M4 (URL scheme — deep-link previewUrl) + M5 (keyring packaged E2E — auth for the PR #166 sync round-trip).
**Blocks:** M7 (first design-partner build requires M6 complete for the P1 persona).

---

## 1) Problem statement

Parent Electron spec LOCKED D52 (2026-04-17, revised 2026-04-20):

> "Electron ships the CLI on PATH via 'Install Command-Line Tools…' menu item; primary bin is `ok` with `open-knowledge` as backward-compat alias. First click triggers macOS admin prompt. Load-bearing for P1: Electron's `runInit` prefers the bundled CLI path over `npx` — `{"command": "/usr/local/bin/ok", "args": ["mcp"]}`. P1 (no Node.js installed) gets working AI-tool MCP integration without any terminal contact."

And §8.11 (MCP wiring orchestrator) spells out the first-launch UX:

> "On first launch of a new project: call `detectInstalledEditors(cwd)` from `packages/cli/src/commands/init.ts` — returns `EditorId[]` ⊆ `{claude, claude-desktop, cursor, vscode, codex, windsurf}`. Prompt user once with the detected set as checkboxes: 'Add Open Knowledge to your AI tools? [Claude Code ☑] [Claude Desktop ☑] [Cursor ☑] [VS Code ☐] [Codex ☐] [Windsurf ☐] [Skip]'. On confirm, `runInit({ cwd, editors, mcp: true, force: false })` merges MCP server entries idempotently."

None of this is implemented. The M6 DOD (§14 quoted above) requires two conceptually-separable workstreams that happen to share a delivery date per the parent spec's milestone boundary:

- **Phase 1 (CLI-on-PATH).** Menu item, wrapper script, extraResources, translocation guard, install/uninstall handlers. **No runtime dependency on M4 or M5** — this piece can ship as soon as M2 is on hand (which it is).
- **Phase 2 (MCP first-launch wiring).** First-project-open consent dialog, `runInit` from Electron main process, detected-editors UI, MCP config write with bundled-CLI path. **Depends on Phase 1** (writes `/usr/local/bin/ok` as the command path — the symlink must exist first). **Also depends on M4** (the returned previewUrl in MCP responses uses `openknowledge://`) **and M5** (packaged keyring needed for the PR #166 sign-in → auto-sync demonstrable round-trip in the E2E smoke).

The research report [reports/electron-bundled-cli-install-patterns/](../../reports/electron-bundled-cli-install-patterns/) fully characterizes Phase 1's design (concrete wrapper script, `cli-install.ts` module, electron-builder amendments, smoke-test procedure, known gotchas). M6a implementation is hand-off-ready. Phase 2 leverages that substrate plus the existing `runInit` flow from `packages/cli/src/commands/init.ts`.

## 2) Goals

**Phase 1 — CLI-on-PATH (M6a):**

- **G1.** File menu entry "Install Command-Line Tools…" (macOS-only). First click: admin prompt via `osascript`; creates `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge` symlinks pointing at the bundled wrapper. Subsequent clicks no-op (idempotent). Status indicator flips to "Uninstall Command-Line Tools" when installed.
- **G2.** Wrapper script (`packages/desktop/resources/cli/bin/ok.sh`) uses `ELECTRON_RUN_AS_NODE=1` to run the bundled CLI via Electron's embedded Node. No separate Node install on user's machine. Derived from VS Code's `code.sh` per the research report.
- **G3.** Translocation guard: detect `/AppTranslocation/` or `/private/var/folders/` in `app.getPath('exe')` before installing; refuse with clear dialog pointing the user to drag the app to `/Applications/` first. Prevents the VS Code / Zed class of bug (research report evidence).
- **G4.** Collision guard: if `/usr/local/bin/ok` already exists and is not our symlink (e.g., npm-installed shim), prompt before overwriting. Never silently stomp.
- **G5.** On app launch: if `/usr/local/bin/ok` is a broken symlink pointing at a nonexistent bundle, offer "Fix Command-Line Tools" dialog. Handles the drag-to-Trash-then-reinstall case.
- **G6.** Uninstall action removes both symlinks (admin prompt). Only removes symlinks owned by the current app — foreign files untouched.

**Phase 2 — First-launch MCP wiring (M6b):**

- **G7.** First time a user opens a new project in Electron (no `.open-knowledge/.mcp-configured` marker or equivalent), show a consent dialog enumerating detected editors via `detectInstalledEditors(cwd)` with checkboxes defaulted per §8.11's per-editor defaults. User clicks "Add" → MCP entries land in the selected editors' config files.
- **G8.** `runInit(...)` from Electron main writes MCP configs with the bundled-CLI command shape: `{"command": "/usr/local/bin/ok", "args": ["mcp"]}`. Electron-origin. Not `npx`. Load-bearing for P1 per D52.
- **G9.** Claude Desktop (or any MCP client) spawns `/usr/local/bin/ok mcp` → discovers running Hocuspocus via `server.lock` → connects to Electron's utility port. Bidirectional stdio MCP works end-to-end.
- **G10.** End-to-end P1 smoke: fresh Mac, NO Node.js installed, NO terminal contact → install DMG → open project → "Install Command-Line Tools…" → consent to MCP wiring → open Claude Desktop → Claude calls `write_document` → renderer shows agent-flash + content arrives on disk. **Zero terminal contact** (preserves parent G3).
- **G11.** Skip path: consent dialog has a "Skip" button; picking it marks the project as MCP-configured-skipped (local state, not shipped with the project). User can re-trigger via a menu item in Phase 2+ if needed (nice-to-have, not DOD).

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
| `packages/desktop/src/main/mcp-wiring.ts` | **NEW** — `runMcpWiringOnFirstOpen(projectPath)`: check project-local marker (`<project>/.open-knowledge/.mcp-status.json` with `{ configured: true/false, skippedAt?: iso }`); if unset, call `detectInstalledEditors(projectPath)` from `@inkeep/open-knowledge/cli` (workspace import), surface consent dialog, on confirm call `runInit({ cwd, editors, mcp: true, force: false, cliPath: '/usr/local/bin/ok' })`. |
| `packages/desktop/src/main/mcp-wiring.test.ts` | **NEW** — pure-function unit tests for marker read/write, consent dialog result handling, cliPath resolution logic. |
| `packages/desktop/src/renderer/components/McpConsentDialog.tsx` | **NEW** — React component rendered via `BrowserWindow.webContents.send` + IPC round-trip, OR a native `dialog.showMessageBox` with a checkbox-like enumeration. **Design call**: native dialog doesn't support checkboxes on macOS (only radio / buttons), so a minimal React modal inside the BrowserWindow is the right shape. Fits the shared React bundle (D13). |
| `packages/desktop/src/main/window-manager.ts` | Modified — on BrowserWindow `did-finish-load` for a fresh project, call `runMcpWiringOnFirstOpen(projectPath)`. Gate on `process.platform === 'darwin'` (parent macOS-only scope) — other platforms get it for free if/when they re-enter scope. |
| `packages/cli/src/commands/init.ts` | Possibly modified — extend `runInit` options with `cliPath?: string`. When present, MCP entries use `{"command": cliPath, "args": ["mcp"]}` instead of the current `npx` shape. Backward-compatible: if `cliPath` is undefined, current behavior preserved (CLI users without Electron continue to get `npx`). |
| `packages/desktop/tests/smoke/mcp-wiring.e2e.ts` | **NEW** — Playwright smoke. Launches app → opens a tmp project → asserts consent dialog renders → simulates click → asserts MCP config file exists with the bundled-CLI command shape. |
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
| AC1.7 | Collision case (Intel Mac path): pre-create `/usr/local/bin/ok` as `echo '#!/bin/bash\necho foreign' > /usr/local/bin/ok && chmod +x /usr/local/bin/ok` (simulates npm-installed shim). Click "Install Command-Line Tools…". Expected: collision-prompt dialog asking whether to replace. User chooses Cancel → symlink not created. User chooses Replace → symlink replaces the foreign file after admin prompt. | Manual smoke on an Intel Mac OR via manual file setup on Apple Silicon. |
| AC1.8 | Translocation guard fires: mount the unsigned DMG, launch `Open Knowledge.app` directly from the DMG window (triggers translocation), click "Install Command-Line Tools…". Expected: translocation warning dialog, no admin prompt, no symlinks created. | Manual smoke. |
| AC1.9 | `packages/desktop/README.md` documents: (a) what the menu item does, (b) the `/opt/homebrew/bin/ok` coexistence story (research report D15), (c) how to diagnose with `which -a ok`. | Docs inspection. |
| AC1.10 | `bun run check` green. No new Playwright e2e required for Phase 1. | CI gate. |

### Phase 2 (M6b)

| # | Criterion | Verification |
|---|---|---|
| AC2.1 | Unit tests for `mcp-wiring.ts` pure helpers pass: marker file read/write, cliPath resolution precedence, editor-default checkbox-state derivation. | `bun test packages/desktop/src/main/mcp-wiring.test.ts`. |
| AC2.2 | On first open of a tmp project: `McpConsentDialog` renders inside the BrowserWindow. Detected-editors list populated (defaults: Claude Code ☑ if `~/.claude.json` exists; Claude Desktop ☑ if its config exists; Cursor ☑ if `~/.cursor/mcp.json` exists; VS Code ☐; Codex ☐; Windsurf ☐). Skip button present. | Playwright smoke (AC2.8). |
| AC2.3 | User clicks "Add": `runInit({ cwd: projectPath, editors: selectedEditors, mcp: true, force: false, cliPath: '/usr/local/bin/ok' })` is invoked. Idempotent — second open of the same project does NOT re-trigger the dialog (marker file persisted). | Playwright smoke. |
| AC2.4 | MCP config entries written by AC2.3 have the shape `{"command": "/usr/local/bin/ok", "args": ["mcp"]}` (NOT `npx` — D52 load-bearing). | File-system inspection post-smoke: `cat ~/Library/Application\ Support/Claude/claude_desktop_config.json`. |
| AC2.5 | Skip button: `{ configured: false, skippedAt: <iso> }` written to `.mcp-status.json`; dialog doesn't re-trigger on next open. | Playwright smoke. |
| AC2.6 | **(Creds-gated, full P1 E2E)** Fresh Mac, NO Node installed, NO terminal contact: install signed+notarized DMG → open new project → Install Command-Line Tools (admin prompt) → MCP consent dialog (all defaults accepted) → open Claude Desktop → send "write a new file called test.md with content Hello" → renderer flashes with agent-write activity → file appears on disk. | Manual E2E once Apple creds on hand. Per runbook. |
| AC2.7 | If Electron spawns `/usr/local/bin/ok mcp` and the bundled app is in the process of launching (e.g., cold start), the MCP server's `discoverServerUrl` honors the startup-grace per `packages/cli/src/commands/mcp.ts`. No race regression. | `bun test packages/cli/src/commands/mcp.test.ts` (already exists, must stay green). |
| AC2.8 | Playwright smoke `mcp-wiring.e2e.ts` green: launches app with a tmp project path → asserts consent dialog rendered → clicks Add → asserts `.mcp-status.json` persisted + at least one MCP config file updated. | `bunx playwright test packages/desktop/tests/smoke/mcp-wiring.e2e.ts`. |
| AC2.9 | `packages/desktop/README.md` MCP wiring subsection exists with consent dialog screenshot, marker-file location, re-trigger instructions (if post-M6 delivered). | Docs inspection. |
| AC2.10 | `bun run check` green; `bunx playwright test packages/desktop/` green. | CI gate. |

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

Native `dialog.showMessageBox` has `buttons` and `checkboxLabel` (single checkbox) but NOT multi-checkbox. A React modal inside the BrowserWindow is the fit — leverages the shared `packages/app/` bundle per D13. Lives alongside the `NewItemDialog` / `CloneDialog` / `AuthModal` pattern.

Component surface:

```tsx
<McpConsentDialog
  detectedEditors={[/* EditorDetection[] */]}
  onConfirm={(selectedEditorIds) => window.okDesktop.mcpWiring.confirm(selectedEditorIds)}
  onSkip={() => window.okDesktop.mcpWiring.skip()}
/>
```

IPC channels (to add to `packages/desktop/src/shared/ipc-channels.ts`):

- `ok:mcp-wiring:show` (M → R event) — payload: `{ detectedEditors: EditorDetection[] }`. Fires on first-project-open.
- `ok:mcp-wiring:confirm` (R → M invoke) — payload: `{ editorIds: EditorId[] }`. Returns `{ ok: true } | { ok: false, error: string }`.
- `ok:mcp-wiring:skip` (R → M invoke) — payload: `{}`. Returns `{ ok: true }`.

Uses the existing typed-IPC `createHandler` / `createInvoker` helpers (precedent #19).

### 6.2 Marker file location

`<project>/.open-knowledge/.mcp-status.json`. Inside `.open-knowledge/` so it's co-located with config + other project-scoped state. Gitignored by the existing `.open-knowledge/.gitignore` conventions (verify during impl) so users cloning the same project on a different Mac get their own consent dialog — correct UX.

Shape:

```json
{ "configured": true, "configuredAt": "2026-04-21T15:30:00Z", "editors": ["claude", "cursor"] }
// OR
{ "configured": false, "skippedAt": "2026-04-21T15:30:00Z" }
```

### 6.3 `runInit` `cliPath` option

Backward-compatible addition to `packages/cli/src/commands/init.ts`:

```ts
export interface RunInitOptions {
  cwd: string;
  editors: EditorId[];
  mcp: boolean;
  force?: boolean;
  cliPath?: string;  // NEW — when set, MCP entries use {"command": cliPath, "args": ["mcp"]}
                     // when unset, current behavior (npx) preserved
}
```

CLI-origin `ok init` never passes `cliPath` (terminal user has Node, `npx` works). Electron-origin `runMcpWiringOnFirstOpen` always passes `cliPath: '/usr/local/bin/ok'` (or computed from `app.getPath('exe')` for robustness — prefer the hardcoded constant for now, matches D52 literal).

### 6.4 Why Phase 1 ships first

- M4 (URL scheme) and M5 (keyring E2E) are half-day each and can run in parallel with M6a.
- M6a has zero runtime coupling with either. Design spike already validates.
- Shipping M6a delivers user value immediately: anyone with the signed DMG gets `ok` on PATH, works from any terminal. Unblocks design-partner testers who want CLI-authored `.mcp.json` entries.
- M6a also de-risks the infrastructure (`extraResources` layout, menu wiring, admin prompt UX) before M6b makes it load-bearing for the MCP wiring path.

If M4/M5 land unexpectedly fast (same PR cycle), the split is cheap to unwind — M6a + M6b merge together. If they don't, M6a has already shipped and M6b is a tight follow-up when M4/M5 are green.

## 7) Known gaps / open questions

- **OQ-1 (Phase 1).** The `runAsAdmin` function in the design spike uses `spawn('osascript', ['-e', script])`. VS Code's implementation is believed to be equivalent but the TypeScript handler wasn't directly located during the research. If a subtle difference exists (e.g., VS Code uses an auxiliary helper binary), the implementer should catch it during manual smoke of AC1.4.
- **OQ-2 (Phase 1).** `electron-builder`'s `extraResources` copy with `filter: ["**/*", "!public/**", "!**/*.map"]` should exclude the already-separately-shipped React bundle under `public/` and source maps. Verify the filter glob syntax on first build — electron-builder historically has had quirks with negation patterns.
- **OQ-3 (Phase 2).** `detectInstalledEditors` currently runs in the CLI's interactive TTY context. Calling it from Electron main process should work (it's config-file inspection, no TTY deps), but a test-in-packaged-build confirmation is needed.
- **OQ-4 (Phase 2).** The consent-dialog React modal needs a visual-design pass. Minimum-viable: title, 6 checkboxes, Add + Skip buttons, Cancel via ESC. If the parent spec's §8.11 evolves to include a detailed UI mockup, follow that; otherwise implement minimal and iterate via PR feedback.
- **OQ-5 (Phase 2).** What happens if the user clicks Skip but later wants to re-trigger? Currently: delete `.mcp-status.json` manually or `ok init` from terminal. Is that acceptable for M6b ship? If not, add a "Project → Set up AI tools…" menu item — ~20 LOC delta. Resolve with a reviewer before M6b lands.
- **OQ-6 (both phases).** Does `electron-vite dev` correctly mount `extraResources` in dev mode? If not, AC1.3 behavior (wrapper-missing-from-bundle dialog in dev) is expected and documented; if yes, dev-mode should actually-work. Implementer should confirm empirically.

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

### Phase 2 (M6b) — after M4 + M5 merge

1. Implement `mcp-wiring.ts` (marker file + runInit invocation).
2. Implement `McpConsentDialog.tsx` inside `packages/app/` (shared React bundle).
3. Wire IPC channels in `packages/desktop/src/shared/ipc-*.ts`.
4. Extend `runInit` with `cliPath` option.
5. Hook `runMcpWiringOnFirstOpen` into `window-manager.ts` did-finish-load.
6. Unit tests for `mcp-wiring.ts` + `runInit` new option path.
7. Playwright smoke `mcp-wiring.e2e.ts`.
8. **(Creds-gated)** Manual P1 E2E smoke (AC2.6).
9. README updates.
10. `bun run check` + `bunx playwright test packages/desktop/`. Push. Request review.

## 9) Agent constraints

### Phase 1

- **SCOPE:** `packages/desktop/` + one `packages/desktop/README.md` section. Do NOT touch `packages/cli/` or `packages/server/`.
- **EXCLUDE:** MCP wiring orchestration (Phase 2). `runInit` modifications (Phase 2). Any renderer React code (Phase 2).
- **STOP_IF:** The extraResources glob filter produces unexpected output (e.g., source maps present in the bundle). Diagnose before shipping — don't mask with a post-build cleanup script.
- **ASK_FIRST:** Any deviation from the design spike's wrapper script content or `cli-install.ts` function signatures. Deviations require reviewer sign-off because other parts of the system reference those shapes.

### Phase 2

- **SCOPE:** `packages/desktop/src/main/mcp-wiring.*`, `packages/app/src/components/McpConsentDialog.tsx` (or equivalent), IPC channel additions, `packages/cli/src/commands/init.ts` `cliPath` option.
- **EXCLUDE:** `detectInstalledEditors` implementation — it exists in `packages/cli/src/commands/init.ts`. Don't reimplement.
- **STOP_IF:** `runInit({ cliPath })` option introduces unit-test failures in the existing CLI test suite. Backward compatibility is load-bearing — existing CLI users must continue to get the `npx` shape when `cliPath` is unset.
- **ASK_FIRST:** UI/UX changes to the consent dialog beyond the minimum-viable checkbox list. Visual polish and copy are product decisions.

---

## 10) Decision log

None new. M6's decisions (D11 superseded → D52, §8.11, §8.12, G3 — zero terminal contact) are LOCKED in the parent spec. This spec implements them.

One potential follow-up: **post-hoc correction to parent D52 prose** on the wrapper path (`app.asar.unpacked/cli/` → `Contents/Resources/cli/`) per the research-report audit finding M5. Not in M6 scope; attach as a corrigendum breadcrumb on the parent spec's §8.12 during a future /ship pass.

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
