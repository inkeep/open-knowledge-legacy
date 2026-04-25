# Design Challenge Findings

**Artifact:** `specs/2026-04-25-desktop-project-navigator-return/SPEC.md`
**Challenge date:** 2026-04-25
**Total findings:** 7 (2 H, 4 M, 1 L)

---

## High Severity

### [H] Finding 1: The "placeholder" the spec proposes to REPLACE is functionally identical to the kept "Open folder on disk…" entry — the rationale for D8 is misleading

**Category:** DESIGN
**Source:** DC1
**Location:** §6 FR4, §10 D8, §11 Q8, `evidence/current-navigator-surface.md`

**Issue:** The spec frames the existing CommandPalette item "Start fresh in a new folder…" (`CommandPalette.tsx:142-158`) as a "placeholder" with a code comment flagging it for navigator wiring. But cold-reading the code, this item is not just a placeholder — it calls `bridge.dialog.createFolder()`, which the main process implements via `promptForFolder()` in `dialog-helpers.ts`. **That helper is the same one `bridge.dialog.openFolder()` resolves to** (verified: `index.ts:571` `'ok:dialog:create-folder'` handler returns `promptForFolder(dialog)` with `properties: ['openDirectory', 'createDirectory']`; the File → Open Folder menu and the `'ok:dialog:open-folder'` handler also call `promptForFolder`). The "create folder" item and the "open folder" item invoke the **same native dialog**. The "Start fresh" item is therefore not a placeholder for a missing feature — it is a **duplicate** of the entry above it with a different verb.

**Current design:** "REPLACE the placeholder entry 'Start fresh in a new folder…' at lines 142-158 with the new 'Manage Projects' entry. The create-folder-from-palette path was a placeholder, not an intentional feature; `bridge.dialog.createFolder` remains used by `NavigatorApp.tsx:100` for the Navigator's own create flow, so the IPC channel is not orphaned." (D8)

**Alternative:** REPLACE is the right outcome, but the **strongest argument for it is "remove the duplicate, replace with the new affordance"** — not "the placeholder was a placeholder." Update D8's rationale and FR4 notes to surface that `createFolder()` and `openFolder()` resolve to the same `promptForFolder` helper in main, so the user-visible action is identical (open native picker → open the chosen folder as a project). The implication for D8 is unchanged (REPLACE wins) — but the rationale is currently load-bearing on a false premise about the placeholder being inert.

**Trade-off:** No design change; **rationale/evidence cleanup** that strengthens D8 instead of leaving it on shaky ground. Without this fix, a future reader of the spec will see "the placeholder was a placeholder" and have no way to verify it without reading three other files.

**Status:** CHALLENGED

**Suggested resolution:** Update D8 rationale + FR4 acceptance-criteria notes to cite `dialog-helpers.ts:promptForFolder` and the IPC handlers at `index.ts:571` (create-folder) vs the open-folder handler. Keep REPLACE; tighten the why.

---

### [H] Finding 2: The relabel "New Project… → Manage Projects…" with the SAME `Cmd+Shift+N` accelerator breaks platform convention semantically — `Cmd+Shift+N` is "New X" in nearly every macOS app

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer / UX stakeholder)
**Location:** §6 FR3, §10 D6, §14 Risks row 1

**Issue:** `Cmd+Shift+N` is a near-universal "New (Window/Project/Folder)" accelerator on macOS:
- Finder: New Folder
- Safari, Chrome, Firefox: New Private/Incognito Window
- VSCode: New Window (`workbench.action.newWindow`)
- JetBrains: New Project (in some IDEs)
- Obsidian itself does NOT bind `Cmd+Shift+N` to vault management

The spec preserves `Cmd+Shift+N` because it is "habituated muscle memory" (FR3 / D6), but pairs it with a label whose verb is not "New." This produces a quietly-misleading menu: a user who reads "Manage Projects… ⌘⇧N" and types `Cmd+Shift+N` blind gets the navigator (which contains a Create-new entry inside it) — close enough to "new" that it works, but the semantics of the accelerator now diverge from every other macOS app the user touches. A user habituated to `Cmd+Shift+N → "I create a new X"` will press it expecting a fast-path create flow and instead get a navigator they have to click through.

**Current design:** "(a) `File → New Project…` is renamed to `File → Manage Projects…`; (b) keyboard accelerator stays `CmdOrCtrl+Shift+N`; (c) click handler still calls `openNavigator()`" (FR3) and "Slight muscle-memory disruption mitigated by preserving `Cmd+Shift+N`" (D6 implications).

**Alternative:** Three credible alternatives the spec did not address:
- **A1: Drop the accelerator entirely.** Obsidian itself ships **no default keybinding** for "Open another vault" / Manage Vaults (research D3 finding "Open another vault command exists but has no default keybinding" + Hotkeys.md). If the spec is following Obsidian's convention (D3, D5, the entire Resolution), then dropping the accelerator IS the Obsidian-faithful path. Users who want one assign their own. Net: zero risk of accelerator-semantic drift; faithful to chosen pattern.
- **A2: Keep `Cmd+Shift+N` bound to "New Project…" as a separate menu item that opens the navigator's create flow directly, and add a NEW menu item without accelerator for "Manage Projects…".** This preserves the accelerator's "New X" semantics; users who want a fast-path create still have one; the management surface is genuinely a separate verb. Conflict with the spec's two-items-same-action concern only if both items invoke the same handler — they don't have to, because the navigator already exposes both flows internally.
- **A3: Move the accelerator to a different binding.** E.g., `Cmd+Shift+P` is taken by VSCode-tradition palette; `Cmd+Shift+O` is "Open" + Shift in many apps. None of these is risk-free either, but at least the choice is deliberate.

The Decision Log shows the relabel cascading from D1+D3 (Manage Projects label + full coverage) — but the cascade did not interrogate the accelerator-vs-label semantic mismatch. The user's Q5 result ("no docs reference 'New Project'") is necessary but not sufficient; muscle memory is exactly the unwritten contract that doesn't show up in grep.

**Trade-off:**
- A1: lose the keyboard surface entirely — users who use the menu-item accelerator daily must rebind. Smallest implementation change. Most faithful to chosen pattern.
- A2: gain a "New Project" fast-path that the chosen pattern (Obsidian) doesn't have, but that the existing surface DID have. Two menu items but with distinct verbs and routes (one-shot create vs management surface). Larger change — likely warrants its own decision.
- A3: keep both surfaces but break a different muscle memory.

The spec's current path (relabel + keep accelerator) is the path that requires the least implementation but creates the longest-lived semantic mismatch. The risk is small per-instance but accumulates — every time a user reads the menu they see a small inconsistency.

**Status:** CHALLENGED

**Suggested resolution:** Reopen this micro-decision with the user. The honest framing is: "The accelerator says 'New X'. The label says 'Manage X'. They cannot both be true. Pick: (1) keep the binding, accept the semantic drift (current spec); (2) drop the binding to match Obsidian's no-default convention; (3) split into two menu items with distinct verbs."

---

## Medium Severity

### [M] Finding 3: The CommandPalette entry is not part of the chosen Obsidian pattern — D1 (full coverage) treats it as required without grounding in the chosen convention

**Category:** DESIGN
**Source:** DC3
**Location:** §1 Resolution, §6 FR4, §10 D1, `evidence/research-pattern-pointer.md`

**Issue:** The spec's chosen pattern is Obsidian Vault Switcher (D3, D5; explicit at `evidence/research-pattern-pointer.md`). Obsidian itself does NOT ship a CommandPalette entry for "Manage Vaults" — the research d3-obsidian.md only mentions "Open another vault" as a command-palette command (which has no default keybinding), and the user-facing path is the sidebar pill. The spec's three-surface coverage (D1) layers the VSCode-tradition CommandPalette pattern on top of an Obsidian-tradition pill+menu pattern. That's not wrong, but it's a hybrid the spec doesn't acknowledge.

The DC3 question: if the spec's framing is "follow Obsidian's convention so users transferring from Obsidian recognize it" (G2), then the palette entry is going BEYOND Obsidian — adding a third surface (Cmd+P → "manage projects") that an Obsidian user wouldn't expect. The intersection reasoning ("Obsidian + full coverage = these three surfaces") doesn't hold; full coverage is an additive spec choice that runs alongside the Obsidian convention rather than being implied by it.

**Current design:** "G2: The affordance set follows the Obsidian Vault Switcher convention so users transferring from Obsidian (or who have used it) recognize the surface immediately." + D1 "full coverage (dropdown + menu + palette)" as the chosen scope.

**Alternative:** Two viable framings the spec didn't explicitly entertain:
- **B1: Two-surface coverage.** Drop FR4 (palette entry). Keep dropdown (Obsidian-faithful) + menu (macOS convention). Smaller diff: 4-5 file edits collapse to 3-4. Lower test surface. Faithful to chosen pattern. Discoverability cost: keyboard-driven users who live in the palette lose one entry, but they still have `Cmd+Shift+N` from the menu and can still type "open" or "switch" if `bridge.project.listRecent()` populates the palette's Recent group (which it already does at line 233-258).
- **B2: Acknowledge the hybrid in the spec.** Keep three surfaces, but rewrite G2 to "follows Obsidian for the sidebar pill; layers VSCode-tradition palette/menu surfaces on top so power-users have keyboard parity with their other tools." This is the actual rationale; making it explicit clears up the framing.

The spec's current framing reads as "Obsidian convention says three surfaces" when Obsidian convention says one (the pill). The convention being followed is "Obsidian + macOS + VSCode patchwork." That patchwork may be the right answer — but the spec should own it.

**Trade-off:**
- B1 trims scope — fewer files, fewer tests, no maintenance drift across the third surface, label-constant has fewer consumers (reduces FR6/D7 motivation).
- B2 keeps scope but clarifies framing.
- Current path (status quo) keeps scope and leaves framing slightly hand-wavy.

This is the strongest "two surfaces vs three" challenge: the marginal palette entry is genuinely additive, not foundational to the chosen pattern.

**Status:** CHALLENGED

**Suggested resolution:** Either (B1) drop FR4 with the palette entry deferred to Future Work and ship a tighter spec; or (B2) rewrite G2 + Resolution to acknowledge the hybrid framing and proceed with the current scope. Status-quo framing is the weakest of the three.

---

### [M] Finding 4: The label "Manage Projects…" buries the most common verb (switch) — alternatives weren't explored against the user's primary task

**Category:** DESIGN
**Source:** DC1 / DC3 (verb-fit)
**Location:** §1 Resolution, §10 D3

**Issue:** The user-facing journey in §5 P1 is "user wants to switch to Project B" (~1.5 of the 5 happy-path lines). The "manage" verb covers create/rename/move/remove flows but — in the current Navigator window UI — Project B switching IS the primary task (recents grid is the dominant surface; rename/move/remove are not in scope per §3 NG3). The chosen label "Manage Projects…" privileges a secondary capability (curation, which is itself out-of-scope for now) over the primary user task (switch to a different project).

Alternatives the user's intake batch (D3) considered: "Open Project Navigator…", "Switch project…", and "Manage Projects…" (chosen 3C). The reasoning recorded is "matches Obsidian's Manage Vaults… pattern" — which is a convention-fidelity argument, not a task-fit argument. Cold-reading the code: the navigator window today does NOT support rename/move/remove (NG3 future work); calling it "Manage" promises a verb the surface doesn't deliver.

Other credible alternatives the spec didn't surface:
- **"Switch Project…"** (Sublime-tradition; verb-perfect for the primary task today)
- **"Open Recent Project…"** (VSCode-tradition; this is the menu-bar phrasing both VSCode and Sublime use)
- **"Show Project Navigator"** or **"Show Welcome…"** (JetBrains/Zed-tradition for the dedicated-window pattern)
- **"Browse Projects…"** (compromise verb; works for both switch-to and look-around use cases)

**Current design:** D3 LOCKED — "Manage Projects…" — rationale: "matches Obsidian's 'Manage Vaults…' pattern"

**Alternative:** Either:
- **C1:** Re-open D3 with a task-fit lens, not a convention-fit lens. The strongest candidate by task-fit-today is probably "Switch Project…" (tracks what the surface actually does); if/when curation lands (NG3), revisit.
- **C2:** Keep "Manage Projects…" but plan to ship the curation features (NG3) on a faster timeline so the label doesn't overpromise.
- **C3:** Hold the line if the user explicitly wants Obsidian-string-fidelity for cross-app muscle memory — that's a real product-strategy lever, but should be the explicit rationale, not a side-effect of "match Obsidian's verb."

**Trade-off:**
- C1 better matches today's surface; needs revisit when curation lands (label drift later vs label drift today, choose your poison).
- C2 is a scope expansion in disguise — moves NG3 closer.
- C3 (status quo) optimizes for cross-app convention at the cost of slight verb-vs-action mismatch.

The Decision Log's recorded rationale for D3 is very thin ("matches Obsidian"). Given D3 is LOCKED + cascades into D6 (the relabel), and the relabel is the most-disruptive part of the spec, the rationale deserves more than that.

**Status:** CHALLENGED

**Suggested resolution:** Re-examine D3 with task-fit framing surfaced explicitly. If the user reaffirms "Manage Projects…" knowing the alternatives, lock the rationale to "Obsidian-string-fidelity for cross-app muscle memory; curation surface deferred per NG3 — accept short-term label-vs-action mismatch." If task-fit wins, switch to "Switch Project…" or similar.

---

### [M] Finding 5: No keyboard shortcut for the dropdown affordance + no behavior spec for `Cmd+Shift+N` while navigator already focused

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer / accessibility)
**Location:** §3 NG6, §6 FR5, §10 D5

**Issue (a):** §3 NG6 defers a default keyboard shortcut for the dropdown ("[NOT UNLESS] only if user research shows the menu-item accelerator alone is insufficient for keyboard-driven users"). This is fine in isolation, but the dropdown affordance is the spec's primary UX surface (it's the Obsidian-faithful one). A keyboard-driven user has only the menu accelerator (`Cmd+Shift+N`) — which goes through the menu → menu-item → click handler → main path, the same as clicking the menu. So "the dropdown" is effectively a mouse-only surface in v1. That's a defensible choice but should be acknowledged: the three surfaces map to mouse / mouse + keyboard / keyboard, not three keyboard surfaces.

**Issue (b):** The spec doesn't say what happens when `Cmd+Shift+N` is pressed while the navigator window is **already focused**. `openNavigator()` (`index.ts:326-354`) calls `focus()` on the existing window — focus-on-already-focused is idempotent in Electron, but the spec should say so. The user prompt explicitly listed this as a probe (#8). The acceptance criteria for FR5 only address closed→open and open→focus; no row covers "already-focused → no-op."

**Current design:** FR5 (a) "focuses existing window"; (b) "creates a new window via `createNavigatorWindow()`"; (c) "navigator window's own close behavior is untouched."

**Alternative:** Add a small acceptance-criterion row:
- **FR5 (d):** Calling `bridge.navigator.open()` when the navigator window is already focused is a no-op (focus-on-already-focused). User-visible behavior: nothing happens; no error toast.

Plus: a brief paragraph in §9 acknowledging that v1 ships keyboard parity via the menu only; dropdown is mouse-driven by design (NG6 path).

**Trade-off:** No design change; **closes a small acceptance-criteria gap** that an implementer or QA tester would otherwise have to ask about.

**Status:** CHALLENGED

**Suggested resolution:** Add FR5 (d) for the already-focused case; add a one-line acknowledgement in §9 about v1 keyboard surface coverage.

---

### [M] Finding 6: No "open navigator AND switch project" one-shot affordance — the spec is two-step by construction

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer)
**Location:** §5 P1 happy path, §10 D5

**Issue:** Today, switching from Project A to Project B from inside Project A's editor is two steps: (1) open the navigator (this spec), (2) click the recent in the navigator's grid. The spec's three surfaces are all gateway affordances — none of them lets a user select Project B in one motion.

But two of the three surfaces (the dropdown + the palette) ALREADY have recent-project entries today (`ProjectSwitcher.tsx:119-134`, `CommandPalette.tsx:233-258`). A user clicking "Manage Projects…" at the bottom of the dropdown is taking a slower path than just clicking on the recent item right above. So the navigator path is genuinely useful only when the user wants to: (a) see a project they HAVEN'T recently visited (rare — recents already show 10), (b) create a new project from scratch, or (c) clone from GitHub. For the happy path "switch to a recent" — the spec's P1 journey — the navigator window is one click MORE than the existing dropdown affordance.

This isn't a flaw in the spec, but it weakens the urgency signal. The complication ("there is no first-class, discoverable way to re-summon the Navigator window") is real, but the gap that justifies opening the navigator (vs. using the existing recents directly) is not the user task in §5 P1 — it's the long-tail "I want a project that's not in my recents list" or "I want to create/clone." The spec should acknowledge that the navigator is a secondary path for the P1 happy-path user, not the primary path.

**Current design:** §5 P1 happy path is "User invokes one of three affordances → Project Navigator window opens (or focuses if already open) → User picks Project B from the recents grid in the navigator."

**Alternative:** The actual happy path for "switch to a recent" already exists — the existing dropdown / palette recents. The spec's affordances are the path for:
1. Switch to a project NOT in recents (the navigator has a fuller list / "Open folder" / "Clone" affordances).
2. Curate the recents list (NG3 future work, not in scope).
3. Create a new project (the navigator's "Open folder" + create flows).

**D1: a stronger journey** for §5 would be P1 = "I want to find Project Z which I haven't opened in months and isn't in my recents top-10 anymore" — that user opens the navigator and sees a longer history (or the registry list). The recents-grid-pick-from-navigator framing currently implicit conflates "happy path" with "least-friction path."

**Trade-off:** No design change; **journey/personas refinement** that would tighten urgency signaling and clarify what users actually gain.

**Status:** CHALLENGED

**Suggested resolution:** Refine §5 P1 happy path to anchor on the use case the navigator genuinely beats the existing dropdown recents on (find a not-recent project, create new, clone). Move the "switch to a recent" sub-journey to a secondary persona note that acknowledges the existing dropdown is the faster path for that case.

---

## Low Severity

### [L] Finding 7: Status-bar / dock-icon menu / right-click context menu not surveyed as design directions

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §3 NG / §15 Future Work / Decision Log absent

**Issue:** The spec considered the chosen pattern (Obsidian-style) and rejected JetBrains' separate Welcome window (Option D in §9 Alternatives), but it didn't survey simpler-affordance directions that some apps ship instead of (or alongside) a vault-switcher menu:
- **Dock-icon menu items (macOS).** `app.dock.setMenu([...])` lets the user right-click the dock icon for quick actions. Sublime, VSCode, and others put recent projects there. Cost: ~10 lines of code in `index.ts`. Could replace or supplement the menu-bar accelerator entirely.
- **Status-bar pill.** Hover or click on a status indicator at the bottom-right of the editor window. Some apps (VSCode for SCM, Cursor for agent state) use this. Lower discoverability cost than a sidebar pill if sidebar is collapsed.
- **Right-click context menu on the sidebar pill itself.** The pill currently only opens-on-click. A right-click could surface "Manage Projects…" without consuming a menu row. (Probably orthogonal to this spec, but worth listing as a future option.)
- **Hover-card on the sidebar pill.** Reveals affordances on hover instead of click. Lower-friction discovery.

§15 Future Work already lists "Status-bar shortcut to navigator" under Noted, so the spec touches this — but doesn't compare any of these directions against the chosen three-surface coverage.

**Current design:** Three surfaces (dropdown + menu + palette). Single-click click-to-open semantics on each.

**Alternative:** None of these is strictly better than the chosen design; they're more "lower-cost adjacent options the spec didn't compare." The dock-icon menu is the most credible alternative because it's a real macOS convention and the implementation cost is small. But it's an adjacent surface, not a substitute, and the user has explicitly chosen full coverage of the three surveyed surfaces.

**Trade-off:** None for the spec as-is. Listing dock-menu / status-bar / context-menu under §15 Identified Future Work would strengthen the spec's posture from "we surveyed Obsidian-style coverage" to "we surveyed Obsidian-style coverage and consciously deferred adjacent macOS-affordance options."

**Status:** CHALLENGED

**Suggested resolution:** Add one row to §15 Future Work → Identified or Noted listing "macOS dock-icon menu items" as a sibling option to the menu-bar surface, with implementation note (`app.dock.setMenu()` in `index.ts`) and trigger ("if user research shows menu-bar discovery is insufficient on macOS"). Optional but cheap; raises the spec's surface-survey defensibility.

---

## Confirmed Design Choices (summary)

The following design choices held up under challenge:

**DC1 (Simpler alternative):**
- D5 (focus-or-create lifecycle, no toggle) is correct — `openNavigator()` already implements focus-or-create; toggle would require additional state and gives users the awkward "click-once-to-open, click-again-to-close, click-again-to-focus" cycle that NG4 correctly defers.
- D7 (single label constant) is sound — three surfaces means three places to drift; one constant is the right enforcement point given FR6.
- The IPC channel design (`ok:navigator:open`, no payload, no return) is minimal and correctly leverages existing `createHandler`/`createInvoker` discipline.

**DC2 (Stakeholder gap):**
- Security/privacy posture is correct — local IPC, no new attack surface, GritQL rule already enforces typed channel discipline.
- Failure modes are well-cataloged in the §9 table; `runWithToast` is the right surfacing point.
- Test coverage strategy (one Playwright happy-path + unit tests for the new entries + existing test patterns extended) is right-sized.

**DC3 (Framing validity):**
- The "no first-class re-summon path" complication is real — verified that the only paths today are dock-click-after-window-all-closed (`index.ts:1069-1080`, `app.activate`) and the misleading File menu item.
- The Electron-only gate (D4) is correctly grounded — `window.okDesktop` is the existing pattern; web/CLI have no analog of a navigator window.
- The decision to NOT ship telemetry (Q6 OUT) is appropriately scoped — OpenTelemetry is heavyweight relative to the click-counter need, and Future Work captures the deferral.

**Note on the user's initial probes from the invocation prompt:**
- Probe 6 (keyboard shortcut for dropdown): partially valid concern, captured as Finding 5(a).
- Probe 7 (one-step open-and-switch): genuine signal, captured as Finding 6.
- Probe 8 (already-focused behavior): minor acceptance-criterion gap, captured as Finding 5(b).
- Probe 1 (different design directions): one cheap miss (dock menu), captured as Finding 7.
- Probe 2 (two surfaces vs three): genuine alternative the spec didn't entertain, captured as Finding 3.
- Probe 3 (relabel pain): real semantic mismatch on the accelerator, captured as Finding 2.
- Probe 4 (label alternatives): rationale thin, captured as Finding 4.
- Probe 5 (REPLACE vs KEEP both): the right call but on a misleading premise, captured as Finding 1.
