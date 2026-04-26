# Desktop Project Navigator — return-to-navigator affordance — Spec

**Status:** Draft
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-25
**Baseline commit:** 98199f82
**Links:**
- Research report: [`reports/editor-project-navigator-patterns/REPORT.md`](../../reports/editor-project-navigator-patterns/REPORT.md)
- Evidence: [`./evidence/`](./evidence/)
- Changelog: [`./meta/_changelog.md`](./meta/_changelog.md)

---

## 1) Problem statement

**Situation:** `@inkeep/open-knowledge-desktop` has a Project Navigator window — a separate Electron `BrowserWindow` rendering `<NavigatorApp />` (`packages/desktop/src/main/navigator-window.ts`). It boots first when no `lastOpenedProject` is set, exposes "Open Folder", "Clone", and a recent-projects list, and stays alive when the user picks a project. The desktop app also has a sidebar-bottom `ProjectSwitcher` pill with a `ChevronsUpDown` glyph (`packages/app/src/components/ProjectSwitcher.tsx`) — structurally a one-to-one mirror of Obsidian's vault profile menu, with recents + "Open folder…" already wired.

**Complication:** From inside an editor window, there is no first-class, discoverable way to re-summon the Navigator window. Today the only paths are (1) close all editor windows on macOS and click the dock icon (Navigator reappears via the `app.on('activate')` handler at `index.ts:1076-1081`), or (2) `File → New Project… (Cmd+Shift+N)`, whose label points away from "open the existing navigator" toward "create new project." The Navigator window's own backend (`openNavigator()` at `index.ts:326-354`) already focuses-or-creates correctly — the gap is purely renderer-facing affordance + IPC plumbing, not lifecycle.

**Resolution:** Surface a **"Switch Project…"** affordance from inside the editor in three places — the existing `ProjectSwitcher` dropdown, the File menu (relabeling the misleading `New Project…` item), and the CommandPalette — all calling a new `bridge.navigator.open()` IPC that delegates to the existing `openNavigator()` in main. The design is a deliberate hybrid: the **structural shape** follows Obsidian's vault-profile pattern (sidebar pill at the bottom of the left sidebar, separate Navigator window, lifecycle that keeps the navigator alive across project picks — per [research](../../reports/editor-project-navigator-patterns/REPORT.md)), while the **verb** ("Switch Project…") and the **three-surface coverage** (dropdown + menu + command-palette) follow Sublime/VSCode-tradition. The label privileges what the surface does today (browse + pick + create) over Obsidian-string-fidelity, since Open Knowledge's Navigator does not currently support manage operations (rename/move/remove are §3 NG3 / §15 Future Work).

## 2) Goals

- **G1:** A user inside an editor window can re-open the Project Navigator window via at least one discoverable affordance, without closing the current editor or relying on a dock-click.
- **G2:** The affordance set is a deliberate hybrid — Obsidian-tradition for the structural shape (sidebar pill, separate navigator window, focus-or-create lifecycle), Sublime/VSCode-tradition for the verb ("Switch Project…") and surface coverage (dropdown + menu + command-palette). Users transferring from any of those apps should find the location and the action recognizable, even if the precise pairing is novel.
- **G3:** The File menu's "navigator-summoning" item is no longer mislabeled — its name matches its action.

## 3) Non-goals

- **[NEVER]** NG1: Web / CLI distribution surfaces. The affordance is bound to the desktop app's window-management model. Web has no "navigator window" concept; CLI has no UI. — Reason: fundamentally misaligned with non-Electron distribution.
- **[NEVER]** NG2: Changing the Navigator window's lifecycle. The current focus-or-create behavior at `index.ts:326-354` is correct and out of scope. — Reason: separate concern; lifecycle is owned by D24-revised in the existing desktop spec line.
- **[NOT NOW]** NG3: Curation features inside the Navigator window — project groups, custom icons, drag-and-drop ordering. — Revisit if: user feedback indicates the flat recents list is insufficient at scale (10+ projects per user). Tracked in §15 Future Work.
- **[NOT NOW]** NG4: Toggle semantics ("clicking again closes the navigator if already focused"). — Revisit if: telemetry shows users repeatedly clicking the affordance without intent to focus, or if multi-window UX explicitly demands a hide-show binding. Default per Decision D5: focus-or-create only.
- **[NOT NOW]** NG5: Multi-root/multi-project-per-window concepts (the VSCode multi-root pattern). — Revisit if: product direction shifts toward in-editor multi-project workflows; today the model is one-window-per-project.
- **[NOT UNLESS]** NG6: Adding a default keyboard shortcut for the dropdown affordance specifically (separate from the menu item's `Cmd+Shift+N`). — Only if: user research shows the menu-item accelerator alone is insufficient for keyboard-driven users.

## 4) Personas / consumers

- **P1: Desktop user with 2+ open projects across sessions.** Has the desktop app installed; tracks multiple knowledge bases (e.g., work + personal); periodically wants to switch between them or curate the recents list. Familiar with VSCode `Open Recent` and/or Obsidian Vault Switcher patterns.

## 5) User journeys

### P1 — Happy path (the use case the navigator beats existing surfaces on)

The dropdown and palette already expose the recents list directly — for "switch to one of my last 10 projects," neither needs the navigator. The new affordances earn their keep on the use cases the navigator does better:

- **Find a project not in recents.** User has 15+ projects across history; the most-recent-10 list doesn't show the one they want. They open the navigator → see the longer registry list / search.
- **Create a new project from scratch.** The navigator exposes "Open Folder" and "Clone" CTAs in one surface.
- **Browse / curate.** User wants to see all known projects in one view (today flat; per §15 NG3, future curation features will land here).

Steps:

1. User is editing inside Project A's editor window.
2. User wants to access a project not in the recents shortlist, or create/clone a new one.
3. User invokes one of three affordances:
   - **(a)** Clicks the `ProjectSwitcher` pill at the bottom of the sidebar → dropdown opens → selects **"Switch Project…"** at the bottom.
   - **(b)** Opens **File → Switch Project… (Cmd+Shift+N)** from the menu bar.
   - **(c)** Opens CommandPalette (`Cmd+P`) → types "switch", "manage", or "project" → selects entry.
4. Project Navigator window opens (or focuses if already open).
5. User finds and picks a project (or creates / clones) → editor window for that project spawns; Project A's editor remains open; Navigator window remains open.

**Note on the "switch to a recent" sub-journey:** for users whose target project IS in the recents shortlist, the existing in-dropdown / in-palette recents entries are the faster path (one click vs two). The navigator is a secondary path for them; the affordances added by this spec are not the primary route for that case.

### P1 — Failure / recovery

- Bridge IPC fails (extremely unlikely — channel is local Electron IPC; failure modes are crash/disconnect).
  - Behavior: existing `runWithToast` helper in `ProjectSwitcher.tsx` surfaces a toast; user can retry.
  - Menu and palette paths invoke the same handler; failure surfaces equivalently.

### P1 — "Aha moment"

- User clicks the sidebar pill → sees recents + "Switch Project…" entry → realizes the navigator is one click away. Validates the Obsidian-pattern memory if they came from Obsidian.

### P1 — Debug experience

- Affordance not working: developer can verify `bridge.navigator.open()` exists in DevTools (`window.okDesktop.navigator.open`), inspect the IPC channel registration in main.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| ProjectSwitcher dropdown "Switch Project…" item | n/a (static) | n/a | toast + retry | navigator focuses or opens | n/a |
| File → Switch Project… menu item | n/a | n/a | logged + no-op | navigator focuses or opens | n/a |
| CommandPalette "Switch Project" entry | n/a | n/a | toast + retry | navigator focuses or opens | n/a |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1: New `bridge.navigator.open()` IPC channel | (a) Method exists on `OkDesktopBridge` typed in `bridge-contract.ts`; (b) preload exposes it on `window.okDesktop.navigator.open`; (c) main-process IPC handler invokes the existing `openNavigator()` in `index.ts`. | New IPC channel `ok:navigator:open` |
| Must | FR2: ProjectSwitcher dropdown gains "Switch Project…" item | (a) Item appears in `ProjectSwitcher` dropdown below `Open folder…` (after a separator if visual hierarchy benefits); (b) `data-testid="project-switcher-switch-project"`; (c) click invokes `bridge.navigator.open()`; (d) closes the dropdown on selection. | Position confirmed by D2 |
| Must | FR3: File menu's existing item is relabeled to match | (a) `File → New Project…` is renamed to `File → Switch Project…`; (b) keyboard accelerator stays `CmdOrCtrl+Shift+N`; (c) click handler still calls `openNavigator()` (now via the same path as the IPC handler). | Avoids two-menu-items-same-action anti-pattern. Decision D1+D3 cascade |
| Must | FR4: CommandPalette **replaces** placeholder entry with "Switch Project" | (a) Existing placeholder entry "Start fresh in a new folder…" at `CommandPalette.tsx:142-158` is replaced by the new entry; (b) entry titled "Switch Project"; (c) icon `LayoutGrid` (lucide-react); (d) `Cmd+Shift+N` shortcut hint preserved (now accurate — matches the menu-level accelerator); (e) searchable by typing partial substrings ("manage", "projects", "navigator", "switch"); (f) click invokes `bridge.navigator.open()`; (g) `data-testid="command-palette-switch-project"`. CommandPalette itself already gates on `window.okDesktop` so no new gating needed. | Code comment at line 145-147 explicitly flagged this as "M4/M5 wires a proper New Project → Navigator invocation"; this spec is that completion |
| Must | FR5: Navigator window lifecycle is unchanged | (a) Calling `bridge.navigator.open()` when navigator window is open but unfocused: focuses existing window; (b) Calling when navigator is the focused window: focus-on-already-focused is idempotent — no observable change, no error toast; (c) Calling when navigator is closed: creates a new window via `createNavigatorWindow()`; (d) navigator window's own close behavior is untouched. | Matches D5; uses existing `openNavigator()` (focus-or-create); already-focused case verified idempotent in Electron |
| Should | FR6: Single source of truth for the user-facing label | (a) The string "Switch Project…" / "Switch Project" is defined as a constant referenced by all three surfaces (menu, dropdown, palette); (b) updating the constant updates all three. | Mitigates label drift |

### Non-functional requirements

- **Performance:** Bridge IPC round-trip for `navigator.open()` should be comparable to existing local-Electron IPC channels (`ok:dialog:*`, `ok:project:open`). No new measurement target is set; existing channels' performance is the budget. The IPC envelope is the only added latency since `openNavigator()` is synchronous in main.
- **Reliability:** No new failure modes beyond existing `runWithToast` + IPC error handling already used by ProjectSwitcher.
- **Security/privacy:** No new attack surface. The IPC channel is local-only (Electron `ipcMain.handle` / `ipcRenderer.invoke`). Per repo CLAUDE.md, the channel must use `createHandler` / `createInvoker` from `src/shared/ipc-*.ts` (Bun integration test at `packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts` (a Biome GritQL rule was originally specced but custom GritQL lint rules don't ship in Biome 2.4 — the Bun test is the actual enforcement) enforces this).
- **Operability:** Existing logger in main captures IPC errors; no new alerts needed.
- **Cost:** No measurable cost impact — three small UI additions and one IPC channel.

## 7) Success metrics & instrumentation

**Telemetry is out of scope** for this spec (Q6 resolved OUT — OpenTelemetry plumbing is heavyweight relative to a click-counter need). Adoption signal will come from qualitative feedback channels (issue reports, user conversations).

What we will log/trace:
- IPC errors on the new `ok:navigator:open` channel (existing logger pattern)

Future Work — surface usage metrics:
- If, post-launch, distinguishing dropdown vs menu vs palette usage becomes a real product question, add per-surface invocation counters at that point. See §15 Identified.

## 8) Current state (how it works today)

See [`evidence/current-navigator-surface.md`](./evidence/current-navigator-surface.md) for full citations.

Summary:
- **Project Navigator window**: separate `BrowserWindow`, renders `<NavigatorApp />` via `--ok-mode=navigator` argv. Lifecycle: focus-or-create via `openNavigator()` at `index.ts:326-354`. `navigatorWindow` module-level variable resets on close.
- **`ProjectSwitcher`**: sidebar-bottom pill, `ChevronsUpDown` glyph, dropdown with recents + `Open folder…`. Already Electron-only (`window.okDesktop` gate). Uses `runWithToast` for IPC error surfacing.
- **File menu**: `New Project…` (Cmd+Shift+N) calls `openNavigator()`. Label is misleading — the underlying action covers create AND open AND list.
- **CommandPalette**: present in renderer; no current entries reference the navigator.
- **Bridge IPC**: no `bridge.navigator.*` namespace exists. The only main-process callers of `openNavigator()` are the menu and internal lifecycle paths.

Key constraints:
- Per `packages/desktop/CLAUDE.md` instructions: never `ipcMain.handle` / `ipcRenderer.invoke` directly — use `createHandler` / `createInvoker` from `src/shared/ipc-*.ts`. Biome GritQL `no-loosely-typed-webcontents-ipc` enforces.
- Process model: one editor `BrowserWindow` ↔ one `utilityProcess.fork` ↔ one `createServer` ↔ one `contentDir`. Navigator window has no `utilityProcess` attached — it's a pure UI window.

Known gaps/bugs discovered during research:
- File menu label "New Project…" is technically misleading (calls a launcher that does more than create). Relabeling per FR3 fixes this.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **Sidebar (`ProjectSwitcher.tsx`)**: New dropdown item "Switch Project…" as the bottom item, no new separator (Q1: matching existing item spacing). Click → `bridge.navigator.open()`. `data-testid="project-switcher-switch-project"`.
- **File menu (`menu.ts`)**: Relabel the existing `New Project…` item to `Switch Project…`. Keyboard accelerator (`CmdOrCtrl+Shift+N`) preserved. Click handler unchanged — still calls `deps.openNavigator()`.
- **CommandPalette (`CommandPalette.tsx`)**: REPLACE the duplicate entry "Start fresh in a new folder…" at lines 142-158 with "Switch Project". Icon: `LayoutGrid`. `Cmd+Shift+N` shortcut hint preserved. Click → `bridge.navigator.open()`. `data-testid="command-palette-switch-project"`. Palette already gates on `window.okDesktop`.

**Keyboard surface in v1:** the menu item's `Cmd+Shift+N` accelerator is the only built-in keyboard path; the dropdown affordance is mouse-driven by design (NG6 — adding a default hotkey for the dropdown is deferred). Keyboard-driven users still have the palette entry searchable by keyword.
- **Docs/onboarding**: *(implementation hint, not an FR)* If desktop docs are updated, mention the new affordance set. Today no docs reference "New Project…" (Q5), so a docs update is a nice-to-have.
- **Error messages**: *(implementation hint, not an FR)* Existing `runWithToast` toast wording — pick a string consistent with neighbour toasts (e.g., "Failed to open Project Navigator.").

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| Editor window (any project) | `ProjectSwitcher` dropdown | New "Switch Project…" item present, position correct, click opens navigator window |
| Editor window (any project) | macOS File menu | Item label is "Switch Project…", `Cmd+Shift+N` still bound, click opens navigator |
| Editor window (any project) | CommandPalette | "Switch Project" entry searchable, click opens navigator |
| Navigator window | (unchanged) | Re-summoning while open focuses existing instance |

### System design

- **Architecture overview**: Three UI surfaces → one bridge IPC method → existing main-process function. No new modules; ~3 file edits in renderer + 1 in preload + 1-2 in main + 1 in shared bridge contract.
- **Data model**: No data model changes. No new persistence. The recents list and navigator window state are unchanged.
- **API/transport**: New IPC channel `ok:navigator:open` (no payload, no return value beyond ack). Implemented via `createHandler` / `createInvoker` from `src/shared/ipc-*.ts` per repo IPC discipline.
- **Auth/permissions**: n/a (local Electron IPC).
- **Enforcement point(s)**: Bun integration test at `packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts` (a Biome GritQL rule was originally specced but custom GritQL lint rules don't ship in Biome 2.4 — the Bun test is the actual enforcement) ensures no raw `ipcMain.handle` slips through.
- **Observability**: Existing logger captures IPC errors. Per-surface usage telemetry deferred to Future Work — §15 Identified.

#### Data flow diagram

- **Primary flow**: User click → `bridge.navigator.open()` (preload `createInvoker`) → IPC `ok:navigator:open` → main `createHandler` → `openNavigator()` → `BrowserWindow.focus()` or `createNavigatorWindow()`.
- **Shadow paths to test:**
  - **nil / missing:** `window.okDesktop` undefined (web/CLI build) → CommandPalette gate hides entry; ProjectSwitcher already not rendered; menu item shows on packaged Electron only.
  - **empty:** n/a — no payload.
  - **wrong type:** n/a — IPC contract typed via `createHandler`/`createInvoker`.
  - **timeout:** local Electron IPC has no realistic timeout; if main is blocked the renderer's invoke promise resolves when main is unblocked.
  - **conflict:** Two near-simultaneous clicks (e.g., user clicks dropdown twice) → two `openNavigator()` calls → second one focuses the window already created by first. Idempotent.
  - **partial failure:** `BrowserWindow` creation fails → main-process error logged → IPC handler returns rejection → renderer shows toast.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `bridge.navigator.open()` IPC | Renderer disconnected | preload-level error | toast via `runWithToast` | one click ineffective; retry succeeds |
| `openNavigator()` `BrowserWindow` ctor | Electron alloc failure | exception in main | error logged; IPC rejects | toast surfaced; user retries |
| `BrowserWindow.focus()` (existing window) | window destroyed without `closed` event | `focus()` no-ops on stale handle | `navigatorWindow = null` cleanup is via `closed` handler; if missed, next click would create new window | rare; manifests as duplicate window which is recoverable by closing the old one |

### Alternatives considered

- **Option A (rejected): ProjectSwitcher dropdown only — minimal coverage.** Matches Obsidian's pattern most narrowly but leaves the misleading File menu label in place and gives keyboard-driven users no path. Rejected per Decision D1 (user chose full coverage).
- **Option B (rejected): Add new menu item alongside existing "New Project…".** Two menu items invoking the same `openNavigator()` would confuse users and create maintenance drift. Rejected during intake; cleaner to relabel.
- **Option C (chosen): Three-surface coverage with menu relabel.** Trade-off accepted: relabel changes muscle memory for users habituated to "New Project…" but the relabel is more accurate. `Cmd+Shift+N` accelerator preserved keeps the keyboard contract intact.
- **Option D (rejected): JetBrains-style separate Welcome window.** Would require redesigning the `ProjectSwitcher` to a different surface entirely. Out of scope per upstream pattern decision (Obsidian pattern was selected based on research).

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Affordance surface scope = full coverage (dropdown + menu + palette) | Product | DIRECTED | No | User explicitly chose 1C; full coverage maximizes discoverability across user input modes (mouse, keyboard, palette) | Intake batch #1 | Triggers cascading FR3 menu relabel (avoid two-items-same-action) |
| D2 | Position in dropdown = below "Open folder…" | UX | LOCKED | No | User chose 2B; least disruption to existing dropdown muscle memory | Intake batch #2 | Item placement in `ProjectSwitcher.tsx` |
| D3 | Item label = "Switch Project…" | UX | LOCKED | No | Initially set to "Manage Projects…" matching Obsidian's "Manage Vaults…" verb (intake batch #3 → 3C). Reopened during audit (challenger M4) on task-fit grounds: Open Knowledge's Navigator currently doesn't support manage operations (rename/move/remove are NG3 Future Work), so "Manage" promises a verb the surface doesn't deliver. "Switch Project…" matches what the surface does today (find/pick a project) and uses the Sublime/VSCode tradition. Re-lock when curation lands (NG3 trigger). | Iterate batch #3 → user response 10A; design-challenge M4 (`meta/design-challenge.md`) | Same string in all three surfaces (FR6); cascades into D6 menu relabel |
| D4 | Distribution gate = Electron-only | Cross-cutting | LOCKED | No | Web has no navigator-window concept; CLI has no UI | Intake batch #4 + `evidence/current-navigator-surface.md` | Reuses existing `window.okDesktop` gate |
| D5 | Navigator lifecycle = focus existing or create (no toggle) | Technical | LOCKED | No | User confirmed continue current behavior; matches existing `openNavigator()` semantics | Intake batch #5 + `index.ts:326-354` | No backend changes needed |
| D6 | File menu item relabel: "New Project…" → "Switch Project…" | Product | DIRECTED | No (label change is reversible) | Cascade from D1+D3 (updated): avoids two-items-same-action; "New" was misleading even before this change. Accelerator `Cmd+Shift+N` preserved per user decision in iterate batch #3 (8A) — small semantic drift accepted (universal `Cmd+Shift+N` = "New X") because the navigator's primary in-window CTA is still create-new and the drift is reversible. | Intake cascade + iterate batch #3 → 8A; design-challenge H2 | Slight muscle-memory disruption mitigated by preserving `Cmd+Shift+N`; revisit if user feedback indicates accelerator-vs-label confusion |
| D7 | Single label constant shared across surfaces | Technical | DIRECTED | No | Mitigates label drift across menu/dropdown/palette | FR6 | Implementer chooses location (likely `packages/app/src/lib/labels.ts` or similar) |
| D8 | CommandPalette: REPLACE the existing "Start fresh in a new folder…" entry with the new "Switch Project…" entry | Product | LOCKED | No | Investigation showed the existing entry is functionally a **duplicate** of the kept "Open folder on disk…" item — both call `bridge.dialog.{open,create}Folder` which both resolve in main to the same `promptForFolder` helper (`dialog-helpers.ts:26-29`, with `properties: ['openDirectory', 'createDirectory']` baked in; `index.ts:566` and `index.ts:571` both invoke it). Removing the duplicate and replacing it with the navigator-summoning entry: (a) eliminates the redundant "Start fresh" verb that opened the same dialog as "Open folder…", (b) makes the palette's `Cmd+Shift+N` shortcut hint accurate (the menu accelerator opens the navigator), (c) aligns all three surfaces under "Switch Project". `bridge.dialog.createFolder` remains used by `NavigatorApp.tsx:100` for the navigator's own create flow, so the IPC channel is not orphaned. | Iterate batch #6; `evidence/current-navigator-surface.md`; design-challenge H1 (`meta/design-challenge.md`) | FR4 acceptance criteria use replace semantics |
| D9 | CommandPalette icon = `LayoutGrid` (lucide-react) | UX | LOCKED | No | Visually matches the navigator's grid-of-projects layout. Existing palette icons are all lucide. | Iterate batch #7 | Slot into FR4 (c) |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Resolution | Status |
|---|---|---|---|---|---|---|
| Q1 | Visual separator between "Open folder…" and "Switch Project…" in the dropdown? | UX | P0 | No | **No new separator** — match existing item spacing. Adding a separator after one item is visual overhead without semantic justification. | Resolved |
| Q2 | CommandPalette entry icon? | UX | P0 | No | **`LayoutGrid` (lucide-react)** — locked per D9. | Resolved |
| Q3 | CommandPalette test pattern? | Technical | P0 | No | Existing testid pattern is `command-palette-<action>`. New testid: `command-palette-switch-project`. Test assertion mirrors existing entries (verify item rendered + click triggers expected action). | Resolved |
| Q4 | Where does the shared label constant live? | Technical | P0 | No | **DELEGATED to implementer.** No existing labels-module pattern surfaced; suggested `packages/app/src/lib/labels.ts` (new file) or co-locate near `desktop-bridge-types.ts`. Implementer's call. | Resolved (DELEGATED) |
| Q5 | Docs/screenshots reference "New Project"? | Cross-cutting | P0 | No | **None found.** `grep -rn "New Project" docs/ packages/*/README.md` returned empty. Relabel is safe. | Resolved |
| Q6 | FR7 (telemetry) in scope? | Product | P0 | No | **OUT of scope.** Telemetry plumbing (OpenTelemetry per CLAUDE.md) is heavyweight; click-counter pattern would be net-new. Defer to Future Work. | Resolved (OUT) |
| Q7 | E2E coverage scope? | Technical | P0 | No | One Playwright happy-path E2E in `packages/desktop/tests/smoke/navigator-return.e2e.ts` (matches existing `deep-link.e2e.ts`, `mcp-wiring.e2e.ts` pattern). Asserts: dropdown click → navigator window focus or open. | Resolved |
| Q8 | CommandPalette placeholder: REPLACE or KEEP both? | Product | P0 | No | **REPLACE** — locked per D8. `bridge.dialog.createFolder` is still used by `NavigatorApp.tsx:100` so the IPC channel survives. | Resolved |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | The `createHandler`/`createInvoker` IPC discipline (per `packages/desktop/CLAUDE.md`) supports a no-payload, no-return-value channel | HIGH | Verified during iterate: `RequestChannels` includes `'ok:project:close'`, `'ok:update:relaunch-now'`, `'ok:mcp-wiring:renderer-ready'` all with `args: []; result: undefined` (auditor confirmed) | Verified | Confirmed |
| A2 | The existing `runWithToast` helper in `error-state.ts` accepts the `bridge.navigator.open()` return shape without modification | HIGH | Read `runWithToast` signature at impl time — STOP_IF triggers if it doesn't accept `() => Promise<void>` | Before implementation ships | Active |
| A3 | The Navigator window's `--ok-mode=navigator` argv contract requires no changes | HIGH | Already confirmed in `evidence/current-navigator-surface.md`: `openNavigator()` is unchanged | Verified | Confirmed |
| A4 | Existing `ProjectSwitcher.test.ts` and `CommandPalette.test.ts` are present and patterns are followable | HIGH | Inspected during intake — both exist | Verified | Confirmed |

## 13) In Scope (implement now)

- **Goal:** Ship a discoverable return-to-navigator affordance from inside the editor — Obsidian-tradition for the structural shape, Sublime/VSCode-tradition for the verb and surface coverage.
- **Non-goals:** see §3.
- **Requirements with acceptance criteria:** §6 FR1–FR6 (Must).
- **Proposed solution:** §9.
- **Owner(s)/DRI:** Andrew Mikofalvy.
- **Next actions (tickets/tasks):** Decompose to spec.json after spec finalization (`/decompose`).
- **Risks + mitigations:** §14.
- **What gets instrumented/measured:** §7. Telemetry deferred — see §15 Identified.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| User muscle memory for `File → New Project…` | Preserve `Cmd+Shift+N` accelerator across the relabel | Smoke test: pressing `Cmd+Shift+N` opens navigator |
| Distribution gate parity | New CommandPalette entry must use same `window.okDesktop` gate as `ProjectSwitcher` | Web build doesn't show entry; Electron build does |
| Label consistency across surfaces | Shared label constant per FR6 / D7 | Grep for "Switch Project" — single source |
| E2E coverage (per Q7) | One Playwright happy-path test exercising dropdown → navigator focus | Existing `packages/desktop/tests/` patterns |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Users habituated to "New Project…" momentarily confused by relabel | Medium | Low | Preserve `Cmd+Shift+N` accelerator; "Switch Project…" verb is more accurate; one-time learning cost | Andrew |
| Adding three surfaces creates maintenance drift across menu/dropdown/palette labels | Low | Low | FR6/D7 shared label constant | Andrew |
| Dropdown-position bikeshed (Q1) blocks merge | Low | Low | Default to "no extra separator unless visual hierarchy demands"; resolve by inspection during iterate | Andrew |
| Telemetry scope creep (Q6) inflates spec | Medium | Low | Default OUT; promote only if plumbing is trivial | Andrew |
| Label-string spread accidentally diverges if FR6 not enforced | Low | Low | Code review; lint via grep audit (manual or scripted) | Andrew |

## 15) Future Work

### Identified

- **NG3 — Navigator curation features (project groups, custom icons, drag-and-drop ordering).**
  - What we know: The research documents this as JetBrains' distinctive contribution to the Welcome-window pattern. Obsidian does not have it; Logseq does not have it. Useful as project counts grow.
  - Why it matters: At 10+ projects per user, a flat recents grid becomes hard to scan.
  - What investigation is needed: Per-user project count distribution (telemetry); UI design pass for groups vs custom icons; whether the Navigator's existing layout supports curation without a redesign.

- **Per-surface usage telemetry (Q6 deferral).**
  - What we know: This spec ships three affordances (dropdown, menu, palette); we don't yet know whether all three earn their keep or one dominates.
  - Why it matters: If one surface accounts for >90% of invocations after launch, the others are maintenance burden.
  - What investigation is needed: Add lightweight per-surface counters (existing OpenTelemetry plumbing or a simpler counter) and review at the 60-day mark.

### Noted

- **Toggle / hide-show binding (NG4)** — if usage data shows users repeatedly clicking the affordance to dismiss the navigator, a toggle binding may be worth adding.
- **Multi-root or multi-project-per-window (NG5)** — VSCode's pattern; only relevant if product direction shifts.
- **Default keyboard shortcut for the dropdown affordance (NG6)** — separate from the menu item's `Cmd+Shift+N`. Add only if users complain.
- **macOS dock-icon menu items.** `app.dock.setMenu([...])` would let users right-click the dock icon to access "Switch Project…" (and recents) without opening any window. ~10 lines of code in `index.ts`. Trigger to revisit: if user research shows menu-bar discovery is insufficient on macOS, or if the keyboard accelerator lands on a different surface.
- **Status-bar shortcut to navigator** — not surveyed. Some apps (VSCode for SCM, Cursor for agent state) put project indicators in the status bar; out of scope here.
- **Right-click context menu / hover-card on the sidebar pill** — could surface "Switch Project…" without consuming a dropdown row; orthogonal to v1.

## 16) Agent constraints

- **SCOPE:**
  - `packages/desktop/src/main/menu.ts` (relabel `New Project…` → `Switch Project…`, preserve accelerator)
  - `packages/desktop/src/main/index.ts` (register the new `ok:navigator:open` channel inside `registerIpcHandlers()` at line 563 — handler body is `() => { openNavigator(); }` matching the `ok:dialog:*` pattern at lines 566–575). Per `ipc-handlers.ts` header, `index.ts` is the ONLY main-process file allowed to bind raw `ipcMain.handle`.
  - `packages/desktop/src/shared/bridge-contract.ts` (add `OkDesktopBridge.navigator.open` method type)
  - `packages/desktop/src/shared/ipc-channels.ts` (register new channel)
  - `packages/desktop/src/preload/index.ts` (expose `bridge.navigator.open` via `createInvoker`)
  - `packages/app/src/components/ProjectSwitcher.tsx` (add new dropdown item)
  - `packages/app/src/components/ProjectSwitcher.test.ts` (test new item)
  - `packages/app/src/components/CommandPalette.tsx` (REPLACE placeholder "Start fresh in a new folder…" with "Switch Project" entry per D8)
  - `packages/app/src/components/CommandPalette.test.ts` (update tests for replaced entry)
  - One new shared label constant location (TBD per Q4)
  - `packages/desktop/tests/` (one new E2E test per Q7)
- **EXCLUDE:**
  - `navigator-window.ts` — no changes to Navigator window lifecycle (D5)
  - `NavigatorApp.tsx` — no changes to navigator UI (D5; out of scope)
  - Recents persistence — `state-store.ts` is unchanged
  - `--ok-mode=navigator` argv contract — unchanged (A3)
  - Web/CLI distribution surfaces (NG1)
- **STOP_IF:**
  - The IPC discipline (`createHandler`/`createInvoker`) does not support a no-payload, no-return-value channel — escalate to redesign the channel signature (A1 verification trips)
  - Adding the CommandPalette entry requires changes to the palette's command-registration machinery beyond a single entry — escalate
  - The `runWithToast` helper rejects the `bridge.navigator.open()` shape — escalate to adjust the helper or wrap differently (A2 verification trips)
  - Renaming `New Project…` would break a public docs/integration surface beyond user-visible app docs — escalate (Q5 surfaces an external dependency)
- **ASK_FIRST:**
  - Adding any per-surface telemetry plumbing (deferred to §15 Future Work — Identified)
  - Changing the `Cmd+Shift+N` accelerator binding
  - Adding any new IPC channels beyond `ok:navigator:open`
