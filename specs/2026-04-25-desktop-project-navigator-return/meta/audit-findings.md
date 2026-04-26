# Audit Findings

**Artifact:** `specs/2026-04-25-desktop-project-navigator-return/SPEC.md`
**Audit date:** 2026-04-25
**Total findings:** 8 (1 high, 3 medium, 4 low)

---

## High Severity

### [H] Finding 1: §16 SCOPE points to wrong file for IPC handler registration

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §16 Agent constraints — SCOPE list (line 271)
**Issue:** §16 SCOPE directs the implementer to add the new `ok:navigator:open` handler in `packages/desktop/src/main/ipc-handlers.ts`. However, that file is NOT where IPC handlers are registered — it contains pure, injectable handler *implementations*. Actual IPC handler **registration** (the `handle('ok:...', async () => {...})` calls bound via `createHandler(ipcMain)`) lives in `packages/desktop/src/main/index.ts` inside `registerIpcHandlers()` at line 563. The codebase explicitly states this:

> "Registration (binding to `ipcMain.handle` via `createHandler`) happens in `main/index.ts` — the ONLY main-process file allowed to touch raw electron IPC primitives" — `packages/desktop/src/main/ipc-handlers.ts:6-9`

This is also corroborated by the IPC-discipline allowlist in `packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts:28-36` — `main/index.ts` IS allowlisted; `main/ipc-handlers.ts` is NOT.

**Current text:** "`packages/desktop/src/main/ipc-handlers.ts` (new `ok:navigator:open` handler delegating to `openNavigator()`)"

**Evidence:**
- `packages/desktop/src/main/ipc-handlers.ts:1-10` — file header docstring describes it as pure injectable implementations only
- `packages/desktop/src/main/index.ts:563-569` — actual `handle('ok:dialog:open-folder', ...)` registration site, pattern an `ok:navigator:open` handler should follow
- `packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts:28-36` — allowlist for `ipcMain.handle` calls

**Status:** CONTRADICTED

**Suggested resolution:** Update §16 SCOPE entry to either (a) `packages/desktop/src/main/index.ts` (where `registerIpcHandlers()` lives — the simplest fix, matching the existing pattern of `ok:dialog:*`), or (b) `packages/desktop/src/main/index.ts` for the `handle(...)` call AND `packages/desktop/src/main/ipc-handlers.ts` IF a pure injectable impl factor-out is desired (matching the `detectProtocolImpl` pattern). Option (a) is simpler and consistent with `ok:dialog:open-folder` since the handler body is a one-liner (`openNavigator(); return undefined;`). Without this fix, an implementer following SCOPE literally will produce code that fails the IPC-discipline lint test.

---

## Medium Severity

### [M] Finding 2: FR7 is referenced in §9, §13, §16 but is not defined in §6

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction), L5 (summary coherence)
**Location:** §6 Requirements (table); §9 line 152; §13 line 220; §13 line 225; §16 line 293
**Issue:** The Functional Requirements table in §6 only lists FR1–FR6. There is no FR7 defined. Yet the spec references FR7 in four places downstream:
- §9: "FR7 (Could) telemetry deferred to iterate"
- §13: "FR7 (Could — TBD by Q6)"
- §13: "FR7 telemetry pending Q6"
- §16 ASK_FIRST: "Adding telemetry plumbing if it does not already exist (FR7 / Q6)"

Q6 was resolved OUT (telemetry deferred to Future Work §15 Identified). The FR7 references are vestigial — they pre-date the Q6 OUT-of-scope resolution and were not cleaned up. A reader searching for "FR7" in §6 will find nothing.

**Current text:** Multiple references to "FR7 (Could)" / "FR7 telemetry pending Q6" with no FR7 row in §6.

**Evidence:** §6 table has rows for FR1–FR6 only (lines 83-88). No FR7 anywhere in §6.

**Status:** INCOHERENT

**Suggested resolution:** Either (a) delete all FR7 references in §9, §13, and §16 since telemetry is Q6-resolved-OUT and tracked in §15 Future Work — Identified; OR (b) re-introduce a "Could" FR7 row in §6 with status "deferred to Future Work" (pure documentation, no implementation impact). Option (a) is cleaner: §15 Future Work — Identified is the canonical home for this deferred work, so leaving stale FR7 pointers is noise. Either way the four sites need to be reconciled.

---

### [M] Finding 3: NFR claim of "Biome GritQL rule" enforcement is technically inaccurate

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §6 NFR Security/privacy (line 94); §9 Enforcement point(s) (line 151); §8 Key constraints (line 120)
**Issue:** The spec asserts in three places that the IPC discipline is enforced by "Biome GritQL rule `no-loosely-typed-webcontents-ipc`". Per the codebase's own comment, GritQL custom lint rules are NOT shipping in Biome 2.4 — the actual enforcement is a Bun integration test:

> "spec D19 originally targeted Biome v2 GritQL custom rules for this enforcement. Biome 2.4's `plugins` config field is scoped to assist actions / refactors, not pure lint rules — GritQL custom lint rules are roadmapped but not shipping in this version. Per the spec's §16 STOP_IF escape hatch, we fall back to I3 (CI grep assertion) implemented as a Bun test." — `packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts:9-14`

The spec inherited this misframing from the project root `CLAUDE.md` (which also says "Biome GritQL rule `no-loosely-typed-webcontents-ipc` enforces"), but it's nonetheless inaccurate — there is no Biome rule. The Bun test at `packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts` is the actual enforcement.

**Current text:** "the channel must use `createHandler` / `createInvoker` from `src/shared/ipc-*.ts` (Biome GritQL rule `no-loosely-typed-webcontents-ipc` enforces this)"

**Evidence:**
- `packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts:9-14` — the implementation note quoted above
- No matches for `no-loosely-typed-webcontents-ipc` in `biome.jsonc` (plugin config absent)

**Status:** CONTRADICTED (stale claim inherited from CLAUDE.md)

**Suggested resolution:** Replace "Biome GritQL rule" with "Bun integration test at `packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts` (D19; Biome GritQL planned but not shipping in 2.4)" in all three sites. The substantive claim (the IPC discipline is enforced) survives; only the mechanism description is wrong. Note: this is an inherited project-wide inaccuracy and arguably the project CLAUDE.md should be the canonical fix site, but for this spec's correctness, a per-spec correction is warranted.

---

### [M] Finding 4: §9 includes deliverables not backed by any FR (docs mention; specific error message)

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §9 Proposed solution (lines 133-134)
**Issue:** §9 lists two implementation commitments that have no corresponding FR in §6:
1. "**Docs/onboarding**: Quick mention in desktop docs that the Navigator can be re-summoned via the dropdown / `Cmd+Shift+N` / the command palette."
2. "**Error messages**: Existing `runWithToast` toast: 'Failed to open Project Navigator.' (consistent verb with existing toasts)."

Neither item appears in FR1–FR6. Neither has acceptance criteria. An implementer completing FR1–FR6 to spec would not necessarily ship the docs update or the specific error string. A reviewer reading §6 alone wouldn't know either is required.

**Current text:**
- "**Docs/onboarding**: Quick mention in desktop docs..."
- "**Error messages**: Existing `runWithToast` toast: 'Failed to open Project Navigator.'..."

**Evidence:** §6 FR table (lines 83-88) contains only FR1–FR6; no FR mentions docs or specifies the error toast string. Q5 (§11) confirms no existing docs reference "New Project" — but that addresses the *removal* concern, not the new "what we add" docs commitment.

**Status:** INCOHERENT (proposed solution outpaces requirements)

**Suggested resolution:** Either (a) promote both items to additional FRs (e.g., FR7: "User-facing docs mention the new affordance set" — Should; FR8: "Error toast string defined" — Should/Must), or (b) demote them in §9 to "Implementation hint" / "Style note" with explicit "not required for FR completion" marker. Option (a) is more standard. The docs mention specifically is small enough to skip if the team prefers — but if it's worth listing in §9, it's worth tracking as a requirement.

---

## Low Severity

### [L] Finding 5: D1 "full coverage" vs D8 "REPLACE the placeholder" framing nuance

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** §10 Decision log — D1 (line 184) and D8 (line 191); §11 Q8 (line 205)
**Issue:** D1 mandates "full coverage (dropdown + menu + palette)" — implying the palette gets a new affordance added. D8 specifies "REPLACE the existing 'Start fresh in a new folder…' placeholder with the new 'Manage Projects…' entry." These are not contradictory once you understand that the existing palette entry was a non-functional placeholder for navigator wiring (per the explicit code comment at `CommandPalette.tsx:145-147`). Functionally, going from placeholder-with-fallback-to-`createFolder` to wired-Navigator-open is "adding palette coverage" in any meaningful sense — the user's intent of "open navigator from palette" is unfulfilled today. But a strict reader of D1 alone might expect a new palette entry alongside the placeholder, and D8 is the resolution that removes the redundant placeholder.

The decisions ARE consistent, but the framing across them isn't tight. This is the nuance the audit prompt asked to surface.

**Current text:** D1 "full coverage" + D8 "REPLACE"

**Evidence:** `CommandPalette.tsx:142-158` — placeholder entry is wired to `bridge.dialog.createFolder()`, not navigator-open. The code comment at line 145-147 is explicit: "M4/M5 wires a proper New Project → Navigator invocation. For now: same as Open folder..."

**Status:** INCOHERENT (minor framing tension, not a substantive contradiction)

**Suggested resolution:** Add a short clarifying clause to D8 rationale: "REPLACE (not 'in addition to') because the existing entry was a non-functional placeholder, not an intentionally distinct command — preserving it would create two-items-same-intent." OR clarify D1's wording to "full coverage means a wired entry in each surface — the palette's existing placeholder is the slot D8 replaces." Either small touch resolves the framing tension.

---

### [L] Finding 6: §1 line range claim "index.ts:931-1079" is loose

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §1 Problem statement (line 18)
**Issue:** §1 claims the lifecycle that re-opens the Navigator on dock-icon click "via the lifecycle in `index.ts:931-1079`". Verified: line 931 is the boot-path `openNavigator()` call (initial launch fallback when no last project) and line 1079 is the `app.on('activate')` handler's `openNavigator()` call (dock-click reopen). The span is technically a superset that includes auto-updater wiring, `will-quit` handler, and other unrelated code. The actually-relevant lines for the claim are roughly `1069-1081` (the `window-all-closed` + `activate` handlers).

The claim is not wrong, but it's wider than necessary and a reader following the citation will read ~150 lines of mostly auto-updater code to find the 5-line `app.on('activate')` block.

**Current text:** "Navigator reappears via the lifecycle in `index.ts:931-1079`"

**Evidence:**
- `packages/desktop/src/main/index.ts:931` — first `openNavigator()` call in boot
- `packages/desktop/src/main/index.ts:1076-1081` — `app.on('activate')` handler with `openNavigator()`

**Status:** STALE (range is too broad)

**Suggested resolution:** Tighten to `index.ts:1069-1081` (the `window-all-closed` + `activate` handlers, which together express the dock-click-reopens-Navigator semantic). Even more precisely: `index.ts:1076-1081` for just the `activate` handler. Current 931-1079 is technically correct but unhelpful.

---

### [L] Finding 7: FR3 label uses literal "…" while existing menu code uses `…` escape

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §6 FR3 (line 85); §9 (line 131)
**Issue:** FR3 specifies "`File → New Project…` is renamed to `File → Manage Projects…`" using the literal U+2026 character (`…`). The existing menu.ts source uses the escape form `'New Project…'` at `menu.ts:160`. Functionally identical strings, but stylistically the implementer should match the surrounding code — using a literal `…` in a JS string literal where every other label uses `…` would create unnecessary diff noise and might trip future grep-for-label tooling. Q5's "no docs reference 'New Project'" check used "New Project" without ellipsis, which is fine; but FR6's shared label constant should pick a consistent form (literal vs. escape) and apply it everywhere.

**Current text:** "`File → New Project…` is renamed to `File → Manage Projects…`"

**Evidence:**
- `packages/desktop/src/main/menu.ts:160` — `label: 'New Project…'`
- `packages/desktop/src/main/menu.ts:165` — `label: 'Open Folder…'`
- `packages/desktop/src/main/menu.ts:188` — `label: ... 'Install Command-Line Tools…'` (literal!)

The existing code is itself inconsistent. So this isn't strictly a contradiction; just a style note for the implementer.

**Status:** UNVERIFIABLE (stylistic preference, no normative answer)

**Suggested resolution:** Add a one-line implementation note in §9 or in the shared-label-constant guidance (Q4 / D7): "Use `'Manage Projects\\u2026'` to match the dominant style in `menu.ts`." Optional polish.

---

### [L] Finding 8: NFR performance claim "< 100ms p95" lacks evidence pointer

**Category:** FACTUAL
**Source:** L7 (inline source attribution)
**Location:** §6 Non-functional requirements (line 92)
**Issue:** "Bridge IPC round-trip for `navigator.open()` should be < 100ms p95 from click to navigator window focus/spawn." This is a target, not a measurement, and there's no benchmark, prior measurement, or reasoning trail (e.g. "comparable to existing `ok:dialog:open-folder` round-trip"). The prose acknowledges "the IPC envelope is the only added latency" — true, but the 100ms number itself is a guess. Acceptable for a small spec where IPC perf is not a key risk, but worth flagging.

**Current text:** "Bridge IPC round-trip for `navigator.open()` should be < 100ms p95"

**Evidence:** No benchmark cited. No comparable measurement from existing IPC channels referenced.

**Status:** UNVERIFIABLE (target, not a measurement)

**Suggested resolution:** Either (a) drop the specific number and say "comparable to existing `ok:project:*` IPC round-trip" (no claim is made about an unmeasured target), or (b) keep the 100ms target but note it's a budget, not an SLA, and that no measurement is required at acceptance time. Optional polish.

---

## Confirmed Claims (summary)

The audit verified the following claims against the codebase:

- ✅ `openNavigator()` at `packages/desktop/src/main/index.ts:326-354` does focus-or-create — exact line range match. Confirmed.
- ✅ File menu's `New Project…` at `packages/desktop/src/main/menu.ts:159-163` calls `deps.openNavigator()` with `Cmd+Shift+N`. Confirmed.
- ✅ `ProjectSwitcher.tsx` is gated on `window.okDesktop` (via the `bridge: OkDesktopBridge` prop and the docstring at lines 7-10). Confirmed.
- ✅ `CommandPalette.tsx:142-158` contains the placeholder entry "Start fresh in a new folder…" with `Cmd+Shift+N` shortcut and the M4/M5 follow-through code comment at line 145-147. Confirmed.
- ✅ `bridge.dialog.createFolder` is also used by `NavigatorApp.tsx:100` for the navigator's own create flow. Confirmed (line 100, exact match).
- ✅ IPC discipline supports no-payload, no-return channels: `RequestChannels` includes `'ok:project:close'`, `'ok:update:relaunch-now'`, `'ok:mcp-wiring:renderer-ready'` all with `args: []; result: undefined`. Confirmed (`packages/desktop/src/shared/ipc-channels.ts`).
- ✅ `LayoutGrid` is a valid lucide-react export. Confirmed via web search ([lucide.dev/icons/layout-grid](https://lucide.dev/icons/layout-grid)).
- ✅ `runWithToast` exists in `packages/app/src/lib/error-state.ts:60` and is the shared helper used by both ProjectSwitcher and CommandPalette. Confirmed.
- ✅ `ChevronsUpDown` glyph in ProjectSwitcher.tsx:19, 102. Confirmed.
- ✅ Existing testid pattern `command-palette-<action>` (open-folder, start-fresh, install-claude-desktop). Confirmed via grep.
- ✅ Surface count of 3 is consistent across §1, §6, §9, §13, §14, §15, §16. Confirmed.
- ✅ NG3 IS present in §15 Future Work — Identified (line 250). Audit prompt's hypothesis that NG3 might be missing from §15 was incorrect — it's present.
- ✅ Existing E2E pattern at `packages/desktop/tests/smoke/{deep-link,mcp-wiring}.e2e.ts`. Confirmed.

## Unverifiable Claims

- 100ms p95 IPC target (Finding 8 — no measurement available without instrumentation).
- D2 "least disruption to existing dropdown muscle memory" (subjective UX claim; not falsifiable without user study).
- Risk-assessment likelihoods/impacts in §14 (subjective categorical estimates; standard for spec scope).
