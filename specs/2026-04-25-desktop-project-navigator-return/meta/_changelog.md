# Changelog: desktop-project-navigator-return

## 2026-04-25 — Spec created

- Created spec following user direction: adopt Obsidian Vault Switcher pattern for re-opening Project Navigator from inside an editor window.
- Baseline commit: `98199f82`.
- Research grounding: [`reports/editor-project-navigator-patterns/REPORT.md`](../../../reports/editor-project-navigator-patterns/REPORT.md).

### Intake — decisions captured

| # | Decision | Resolution | Notes |
|---|---|---|---|
| 1 | Affordance surface scope | DIRECTED — full coverage (dropdown + menu + palette) | Implies relabeling existing `File → New Project…` to avoid two-menu-items-same-action anti-pattern |
| 2 | Position in ProjectSwitcher dropdown | LOCKED — below `Open folder…` | |
| 3 | Item label | LOCKED — "Manage Projects…" | Obsidian verb; applies to all three surfaces |
| 4 | Distribution gate | LOCKED — Electron-only | Reuses existing `window.okDesktop` gate |
| 5 | Navigator window lifecycle | LOCKED — focus existing or create (no toggle) | Matches existing `openNavigator()` behavior at `index.ts:326` |

### Worldmodel — skipped formal /worldmodel call

Rationale: 3P landscape is fully covered in the upstream research report (4 patterns, 7 apps); 1P codebase exploration was completed during intake (ProjectSwitcher, NavigatorApp, menu.ts, openNavigator, bridge contract, CommandPalette). A formal /worldmodel pass would duplicate this work without adding signal at the spec's narrow scope.

Surfaces mapped during intake (logged here for traceability):
- `packages/desktop/src/main/navigator-window.ts` — Navigator BrowserWindow factory
- `packages/desktop/src/main/index.ts:326-354` — `openNavigator()` lifecycle
- `packages/desktop/src/main/menu.ts:159-213` — File menu template
- `packages/desktop/src/shared/bridge-contract.ts` — IPC contract surface
- `packages/desktop/src/preload/index.ts` — preload bridge wiring
- `packages/app/src/components/ProjectSwitcher.tsx` — sidebar pill
- `packages/app/src/components/NavigatorApp.tsx` — navigator renderer
- `packages/app/src/components/CommandPalette.tsx` — command palette (no existing navigator entries)

### Iterate pass 1 — autonomous investigation results

Investigated Q1–Q7 (see SPEC §11). Resolutions:
- Q1, Q3, Q5, Q7: resolved by direct codebase inspection.
- Q4: DELEGATED to implementer.
- Q6: telemetry deferred to Future Work (OpenTelemetry plumbing too heavy for click counter).
- Q2: icon recommendation pending user confirmation (LayoutGrid recommended).

**New cascade Q8** surfaced from CommandPalette inspection:
- `CommandPalette.tsx:142-158` contains a placeholder entry "Start fresh in a new folder…" with `Cmd+Shift+N` hint and a code comment explicitly stating *"M4/M5 wires a proper New Project → Navigator invocation"*.
- This spec is the M4/M5 follow-through. Surfaced to user as REPLACE vs KEEP-both.

### Iterate pass 2 — user batch resolved

- **D8 LOCKED — REPLACE the CommandPalette placeholder** (user response 6A). Aligns all three surfaces under `Cmd+Shift+N` / "Manage Projects" / `bridge.navigator.open()`. Side-check: `bridge.dialog.createFolder` is still used by `NavigatorApp.tsx:100` for the navigator's own create-new flow, so the IPC channel does not become orphaned by removal from the palette.
- **D9 LOCKED — `LayoutGrid` icon for CommandPalette entry** (user response 7A).
- FR4 acceptance criteria updated to use REPLACE semantics.
- §16 SCOPE updated to clarify the palette change is a replacement, not an addition.

### Audit pass 1 — applied corrections

12 of 15 audit/challenger findings classified ACT. 3 escalated to user as decision-implicating (presented in conversation as iterate batch #3).

Corrections applied directly:
- **Auditor H1 (FACTUAL):** §16 SCOPE corrected to point to `index.ts:563 registerIpcHandlers()` for IPC handler registration. `ipc-handlers.ts` is pure injectables only; `index.ts` is the only main-process file allowed to bind raw `ipcMain.handle` per the file's own header docstring.
- **Auditor M2 (COHERENCE):** All four vestigial FR7 references in §9, §13 (×2), §16 cleaned up. Telemetry deferral is now tracked exclusively in §15 Identified.
- **Auditor M3 (FACTUAL):** "Biome GritQL rule" claim corrected to "Bun integration test at `packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts`" in three sites (§6 NFR, §8, §9). The repo CLAUDE.md inherits the same misframing — out of scope to fix here, but flagged.
- **Auditor M4 (COHERENCE):** §9 docs/onboarding and error-message lines demoted to "implementation hint, not an FR" — they had no FR backing in §6.
- **Auditor L6 (FACTUAL):** Tightened `index.ts:931-1079` to `index.ts:1076-1081` (`app.on('activate')` handler).
- **Auditor L8 (FACTUAL):** Softened "< 100ms p95" to "comparable to existing local-Electron IPC channels" — no measurement baseline.
- **Challenger H1 (DESIGN — rationale fix; decision unchanged):** D8 rationale rewritten. The existing palette entry "Start fresh in a new folder…" is not a placeholder for missing functionality — it's a duplicate of "Open folder on disk…" since both `bridge.dialog.openFolder` and `bridge.dialog.createFolder` resolve to the same `promptForFolder` helper in main (verified `index.ts:566` + `571` + `dialog-helpers.ts:26-29`). REPLACE is still right; rationale is now "remove the duplicate" not "wire the placeholder."
- **Challenger M5b (COHERENCE):** Added FR5 (b) acceptance criterion for the already-focused case (`focus()` on already-focused window is idempotent).
- **Challenger M5a (COHERENCE):** §9 acknowledges that v1 ships keyboard parity via the menu accelerator only; the dropdown affordance is mouse-driven by design (NG6).
- **Challenger M6 (DESIGN — journey refinement):** §5 P1 happy path refined to anchor on the use cases the navigator genuinely beats existing surfaces on (find non-recent project, create new, clone). Acknowledged that for "switch to a recent" the existing dropdown / palette recents are the faster path.
- **Challenger L7 (FUTURE WORK):** Added "macOS dock-icon menu items" to §15 Future Work — Noted with implementation note (`app.dock.setMenu()`) and trigger.

Corrections declined:
- **Auditor L5 (D1/D8 framing):** Stylistic polish; the framing tension is already addressed by D8's updated rationale (Challenger H1 fix).
- **Auditor L7 (ellipsis style):** Implementer's call; existing menu code is itself inconsistent.

Three findings escalated to user — see iterate batch #3 in conversation.

### Iterate pass 3 — escalated batch resolved

- **Iterate #8 = A — `Cmd+Shift+N` accelerator preserved.** D6 retains the `CmdOrCtrl+Shift+N` accelerator on the relabeled `File → Switch Project…` menu item. Universal-macOS `Cmd+Shift+N` = "New X" semantic drift accepted; navigator's primary in-window CTA is still create-new so the drift is mild. Reversible (revisit per design-challenge H2 trigger if user feedback indicates accelerator-vs-label confusion).
- **Iterate #9 = B — three-surface coverage retained, framing updated.** §1 Resolution and §2 G2 rewritten to acknowledge the hybrid: Obsidian-tradition for the structural shape (sidebar pill, separate Navigator window, focus-or-create lifecycle); Sublime/VSCode-tradition for the verb and three-surface coverage. The "follows Obsidian's convention" framing was misleading; the actual design pattern is a deliberate cross-app composite.
- **Iterate #10 = A — label changed to "Switch Project…" (was "Manage Projects…").** Cascade applied across §1, §2, §5, §6 (FR2/FR3/FR4), §9, §13, §16, plus D3 / D6 / D7 / D9 in the Decision Log. Test ids updated: `project-switcher-switch-project`, `command-palette-switch-project`. Search keywords in palette retain "manage" so users with Obsidian mental model still find the entry. Re-lock the label when NG3 curation features land (rename/move/remove inside the navigator).

All audit and challenger findings now resolved or explicitly declined. Spec ready for verify-and-finalize phase.

IPC discipline (A1) verified:
- `createHandler` (in `packages/desktop/src/shared/ipc-handler.ts`) and `createInvoker` (`ipc-invoke.ts`) support `args: []` channels with arbitrary `result` types.
- New channel: `'ok:navigator:open': { args: []; result: undefined }` — slot in alongside existing `'ok:dialog:open-folder': { args: []; result: string | null }`.
- A1 status: confirmed. Persisted to evidence as part of `current-navigator-surface.md`.
