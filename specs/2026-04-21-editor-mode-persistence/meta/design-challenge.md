# Design Challenge Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-21-editor-mode-persistence/SPEC.md`
**Challenge date:** 2026-04-21
**Total findings:** 8 (3 H, 4 M, 1 L)

Scope of challenge: DC1 (simpler alternative), DC2 (stakeholder gap), DC3 (framing validity), plus targeted probes suggested by the parent spec on D7, D5, D6, diff-carve-out, ASK_FIRST consistency, feature-flag posture, and general blast radius.

---

## High Severity

### [H] Finding 1: Cross-window auto-apply (D7) destroys in-flight editor state — focus, selection, scroll — for the accidental or adversarial toggler in window B

**Category:** DESIGN
**Source:** DC2 (stakeholder gap) + the parent spec's explicit Q1
**Location:** SPEC §7.4 (cross-window sync `useEffect`), §6.1 FR-4, §13 R4 ("MEDIUM → LOW" impact rating).
**Issue:** The spec's framing — "content is CRDT-synced and not lost" — is correct but narrow. The toggle is NOT a no-op for mid-edit users:

1. The mode flip is implemented as a `display:none` swap on the containing `<div>` (`packages/app/src/components/EditorActivityPool.tsx:319-335`). When a `display:none` ancestor renders, the currently-focused element inside that subtree loses DOM focus automatically. A user typing in Source in window A loses their caret when the CSS class swap hides the CodeMirror `<div>`. CodeMirror selection/cursor position survives in the `EditorView` state (re-focus restores it), but keyboard focus goes to `document.body`.
2. The newly-visible editor is NOT auto-focused. `SourceEditor.tsx:176,204` calls `view.focus()` explicitly only inside the `OUTLINE_NAV_EVENT` and `RAW_MDX_NAV_EVENT` listeners — not on mode flip. `TiptapEditor.tsx` grep returned no `.focus()` call at all. So post-flip, the user's next keystroke goes into `body`, not any editor.
3. The user's IME composition state (CJK, dead-keys) — if the flip lands mid-composition — is unrecoverable. The browser discards the composition when the composing element loses visibility.
4. For the Source→WYSIWYG direction, the in-flight text selection in CodeMirror is stored in the `EditorView` state and survives. For WYSIWYG→Source, TipTap's selection is stored in the `EditorState` but the ProseMirror DOM representation is thrown away mid-composition if the user was selecting text with a drag gesture (mouse-up lands on a `display:none` element).

**Current design:** §7.4 code gates on `editorMode !== 'diff'` — a single safety carve-out. Every other interleaving (mid-typing, mid-selection, mid-IME, mid-drag-select) flips silently.
**Alternative:** Three credible alternatives from the prior-art survey (D8) that the spec acknowledged but dismissed:
- **(a) Focus-based re-check (Excalidraw, Pattern C).** Only auto-apply when the tab regains focus. The spec rejected this in §16.1 as "only useful when live-apply would be disruptive; flipping a CSS class mid-edit is not disruptive for a content-preserving CRDT editor." That rejection is premised on "content-preserving" — but focus, selection, IME, and drag gestures are NOT content. They are user-interaction state, and they ARE destroyed by the live flip.
- **(b) Dirty-window guard.** Auto-apply when the other window is not actively being edited (no recent keystroke / no active IME / no current selection). A one-liner check on the Document's `hasFocus()` + last-keystroke timestamp.
- **(c) Confirmation toast on remote flip (soft sync).** "Another window switched to Markdown. [Switch here] [Keep Visual]." Explicit rather than silent.
**Trade-off:** Alternative (a) costs live-cross-window reactivity — the spec's G1 persona "multi-window Electron user" sees the pref propagate on next focus instead of immediately. Alternative (b) threads the needle but introduces state the spec wanted to avoid. Alternative (c) is the most conservative UX but adds a transient UI surface. Net: the current design optimizes for a scenario (idle multi-window user) and silently regresses a different one (active multi-window user). At least one acknowledgment of the UX regression (even if accepted) belongs in R4 or the UX section.
**Status:** CHALLENGED
**Suggested resolution:** Either (i) accept the UX regression explicitly, re-rate R4 impact to reflect the focus/selection/IME loss (not just "content safe"), and add an E2E that documents the behavior so regressions are caught; OR (ii) adopt Alternative (a) — focus-based re-check — which next-themes-users have tolerated via the fact that theme flips are usually triggered from the same tab anyway, and is the exact pattern Excalidraw chose for large-state editors. The editor is a large-state editor.

---

### [H] Finding 2: D7's cross-window auto-sync contradicts the STOP_IF / ASK_FIRST framing around `modeBeforeDiffRef` and diff-mode behavior

**Category:** DESIGN
**Source:** DC2 (stakeholder gap) — parent's explicit Q5 + independent rediscovery on re-read.
**Location:** §15 Agent Constraints → STOP_IF, ASK_FIRST. §7.4 cross-window sync effect. §13 R1.
**Issue:** The Agent Constraints say:

> STOP_IF: Implementation needs to touch `modeBeforeDiffRef` or diff-mode behavior.

But §7.4's cross-window sync effect:

```typescript
useEffect(() => {
  if (editorMode === 'diff') return;  // ← diff-mode behavior gate
  setEditorMode(persistedMode);
}, [persistedMode, editorMode]);
```

…IS a change to diff-mode behavior. It introduces a diff-aware branch that, pre-spec, did not exist. The `editorMode === 'diff'` guard is coupled to the diff subsystem by definition — if a future change to `EditorMode` adds a fourth state (e.g. a read-only preview), this guard silently ignores it.

More consequentially, the guard has a race with `modeBeforeDiffRef`. Consider the sequence:
1. Window A: user enters diff from Source. `modeBeforeDiffRef.current = 'source'` captured.
2. Window B: user flips from Wysiwyg→Source. `storage` event fires.
3. Window A: cross-window sync effect runs, sees `editorMode === 'diff'`, returns early. (Correct behavior.)
4. Window A: user exits diff. `handleExitPreview()` calls `setEditorMode(modeBeforeDiffRef.current)` → returns to Source. (Coincidentally correct — because Source is also the new persisted pref.)
5. But consider the symmetric case: window A enters diff from Wysiwyg. Window B flips to Source. Window A exits diff. `modeBeforeDiffRef.current = 'wysiwyg'` → returns to Wysiwyg. But `persistedMode === 'source'` now. The `useEffect` then fires (deps: `persistedMode, editorMode` both "changed" — well, `persistedMode` was 'source' already but `editorMode` transitioned away from 'diff'). Does the effect fire again and flip from Wysiwyg to Source immediately after the diff exit? Reading the dep array strictly: the effect's dependencies are `persistedMode` and `editorMode`; `editorMode` changed (from 'diff' to 'wysiwyg'), so yes, the effect runs, sees `editorMode !== 'diff'`, and calls `setEditorMode(persistedMode)` — which is 'source'. So the diff-exit → Wysiwyg → Source is a two-step transition visible to the user.

**Current design:** Relies on the effect to "do the right thing" via dependency re-run. The behavior is correct (user ends up at their persisted pref), but the two-step flash (Wysiwyg-briefly-then-Source) is a UX regression from the single-step pre-spec behavior. The spec's tests do not cover this interleaving.
**Alternative:** Two shapes:
- **(a) Capture persisted pref into `modeBeforeDiffRef` on diff entry**, not the current editorMode. On diff exit, use the (possibly updated) persisted pref. This eliminates the two-step flash and makes diff exit always honor the freshest preference.
- **(b) Mark the cross-window guard symmetrically** — not just `editorMode === 'diff'` but also `prevEditorMode === 'diff' && editorMode changed during this tick`. Probably overcomplicated.
**Trade-off:** Alternative (a) changes `modeBeforeDiffRef`'s semantics (session-local → persisted-tracker). This would violate STOP_IF as currently written, but it's the *right* semantic change given D7. The STOP_IF itself is the constraint that's stale, not the code. The proposed fix is simpler than the bug it prevents.
**Status:** CHALLENGED
**Suggested resolution:** Either (i) accept the two-step flash and add an E2E test case (T7) asserting it, plus relax STOP_IF to acknowledge the cross-window sync effect IS a diff-interaction change; OR (ii) implement Alternative (a) and update STOP_IF to say "do not change the *session-local* capture rule without explicit review" — which more accurately describes the constraint.

---

### [H] Finding 3: Navigator window and editor window may not share the same origin in packaged builds — A1's verification scope is the wrong shape

**Category:** DESIGN
**Source:** DC3 (framing validity) + parent's explicit Q4
**Location:** §12 A1 (assumption), §13 R5, §15 STOP_IF "Implementation discovers `session.fromPartition` usage."
**Issue:** A1 asserts "Every Open Knowledge Electron BrowserWindow loads the same origin (no `session.fromPartition('...')` per-project isolation)" and claims this is "verified by reading `packages/desktop/src/main/window-manager.ts`." That verification is the wrong scope. `session.fromPartition` is ONE way origin can diverge, but not the only way. Looking at the two Electron window factories:

- `packages/desktop/src/main/window-manager.ts` editor windows: `loadFile(rendererEntryPath)` (packaged) or `loadURL(rendererDevUrl)` (dev).
- `packages/desktop/src/main/navigator-window.ts` Navigator: same — `loadFile(rendererEntryPath)` or `loadURL(rendererDevUrl)`.

In packaged builds, both call `loadFile(...)`. In Electron, `loadFile` produces a `file://` origin. The `file://` origin's localStorage behavior in Chromium is DIFFERENT from http/https — `file://` origins do NOT have a stable origin for shared-storage purposes across independent `loadFile` invocations in some Chromium versions (file:// URLs compare origin-equal only when all path components match, historically). Electron has its own semantics and the spec does not cite a verification run.

Even setting `file://` aside: in dev mode, Vite serves the renderer on http://localhost:<port>. Navigator and editor windows both point to the same dev URL, so origin is shared. But in packaged builds, if the Navigator ever loads a different HTML file (e.g., to render a different launcher shell without the editor bundle), origin splits. The spec reads `navigator-window.ts` today and sees `rendererEntryPath` for both, which is correct at baseline — but the design is one commit away from breaking. This is not paranoid: D24 revised ("every project pick spawns a new editor window") anticipates future Navigator evolution.

**Parent's Q4 also raises "permanent profile switching in the Navigator window for different projects."** The spec does not address this. If the Navigator window's React code later implements a "sign in as different user" or "different vault" concept, the natural Electron idiom is `session.fromPartition('persist:user-alice')` — exactly the escape hatch A1 warns about. The spec's response to this scenario is "the spec needs an electron-store upgrade" (R5 mitigation) — but that requires re-opening this spec. There is no forward-compatible data shape that lets an implementer add per-user partitioning without re-plumbing persistence.

**Current design:** Verification of A1 is scoped to "does `window-manager.ts` currently call `session.fromPartition`?" That's the narrow question; the wider question (does the design TOLERATE future partitioning without redesign?) is answered with "no" — and silently.
**Alternative:**
- **(a) Co-design with desktop.** Add a Channel in the Open Knowledge `ok:preferences:get-mode` IPC surface so the Electron main process brokers the pref. Works across any partition layout, decouples the renderer from the origin-sharing trick. Cost: adds IPC plumbing the spec aggressively avoided (D6).
- **(b) Per-partition graceful degradation.** If a future Electron change splits origins, localStorage just behaves as per-partition — which might be the correct UX for a per-user Navigator. Document this as an expected outcome, not a failure. Then A1 becomes: "if future work introduces session partitioning, each partition will independently track the pref — treat that as feature, not bug."
- **(c) File-based mirror.** Store the pref in the user-global `~/.open-knowledge/config.yml` (which already exists, per CLAUDE.md "Hierarchical YAML"). Accept one extra read path. FOUC-free on first paint via the inline script still reading localStorage (fast path); cold-start new-window reads config.yml and writes-back to localStorage. Survives partition splits. Small cost: one new config key.
**Trade-off:** (a) the most robust but heaviest. (b) documentation-only but sacrifices the "one preference everywhere" intent. (c) gracefully degrades but invents a dual-source-of-truth (localStorage as cache, config.yml as ground truth) — which the spec explicitly avoided with the bare `__OK_EDITOR_MODE__` global (§7.2).
**Status:** CHALLENGED
**Suggested resolution:** Option (b) is the minimum credible response — A1 should be re-written to say "until a future spec introduces session partitioning, localStorage is shared cross-window. If partitioning lands, this spec's persistence becomes per-partition, which is a *feature*, not a regression — it aligns with the partition's scope semantics." Option (c) is worth a serious look because it aligns editor-mode with the per-user `.open-knowledge/config.yml` tier that already exists — see Finding 5 below for the deeper framing argument.

---

## Medium Severity

### [M] Finding 4: D5's localStorage-only storage dismisses per-project config tension without addressing it

**Category:** DESIGN
**Source:** DC3 (framing validity) + parent's explicit Q2
**Location:** §10 D1 + D5, §4 non-goals "Per-project mode override — VS Code workspace-tier pattern — Future Work, *Identified*."
**Issue:** Open Knowledge has an existing per-project config surface: `.open-knowledge/config.yml` (plus `~/.open-knowledge/config.yml` for user-global). The CLAUDE.md "Config system" section documents this hierarchy explicitly:

> Precedence: CLI flags > ENV > workspace > user > Zod defaults

The spec dismisses per-project override as Future Work (§4) but does not address the **framing question**: users of this app are ALREADY trained on "editor behavior is configured in `config.yml`." Every instance in the codebase of a config decision (`content.dir`, `content.include`, `content.exclude`, the MCP server list) lives in `.open-knowledge/config.yml`. A user who has internalized "Open Knowledge config lives in `config.yml`" will be surprised to find that editor mode is in browser localStorage — an entirely separate storage axis they cannot version in git, share with collaborators, or reset by deleting a project folder.

The research report's D7 section notes VS Code's workspace-tier pattern. The spec deferred it as Future Work, citing "requires per-project config plumbing, precedence resolver." But the plumbing **already exists** for this repo. The friction of adding a key to `config.yml`'s Zod schema and reading it on mount is one file change in `packages/cli/src/config/schema.ts` plus one fetch.

**Current design:** D1 says "Global user preference only — no per-doc or per-project override in v1." Rationale: matches intake recommendation, Obsidian community-plugin 5-year-old pattern. This framing treats per-project as a scope-expansion requiring new machinery — when in fact `config.yml` is the existing machinery.
**Alternative:** Store the default in `config.yml` as `ui.editorMode: 'wysiwyg' | 'source' | undefined`. localStorage is a session cache. On first paint: inline script reads localStorage (fast), if unset reads a server-injected snapshot of the resolved config (already happens for `collabUrl` / content paths). Toggle writes to localStorage (fast + FOUC-free next session). Optionally syncs to `config.yml` via an MCP tool or CLI command (out of scope for v1, but the data shape supports it). Precedence: runtime toggle (localStorage) > project `config.yml` > user `config.yml` > default.
**Trade-off:**
- Gained: alignment with Open Knowledge's existing config mental model. Git-versionable "this project defaults to Source." User-global default via `~/.open-knowledge/config.yml` (not just localStorage) covers fresh browser / cleared-localStorage / new-machine cases. Composes with cross-device via git, which localStorage does not.
- Lost: a modest amount of complexity — one new Zod schema key, one new reader, optionally one new writer. The spec's "no new library" + "bundle < 500 B" constraints still hold.

The real question: is the scope of this preference fundamentally "browser state" (like theme color) or "project state" (like content filter)? The spec assumes the former by referencing `ok-theme-v1` and `ok-pin-v1`. But `ok-pin-v1` is specifically cross-TAB-but-per-user (a developer's tab-pinning for a given doc). The editor mode is more load-bearing: "always open this project's code-heavy docs in markdown" is a per-project intent.
**Status:** CHALLENGED
**Suggested resolution:** Investigate the `config.yml` hybrid seriously before locking. At minimum, add a Decision Log entry that acknowledges the tension (not just dismisses per-project override) and state explicitly why localStorage-alone is the right abstraction despite the repo's config.yml precedent. If the tradeoff truly favors localStorage for v1, the LOCKED decision holds — but the rationale should cite the repo convention it is choosing to diverge from, not silently paper over it.

---

### [M] Finding 5: Feature-flag absence assumes linear degradation — rapid storage-event bursts are not tested

**Category:** DESIGN
**Source:** DC2 (stakeholder gap) — SRE perspective + parent's explicit Q6
**Location:** §9 rollout ("No feature flag — strictly additive, worst-case degrades to current behavior"), §7.3 hook, §8.3 E2E suite.
**Issue:** The spec argues the design degrades gracefully to current behavior. This is true for the "localStorage throws" path (FR-7) and the "invalid value" path (FR-8). But the degradation claim is NOT tested or designed against the **high-frequency burst** scenario:

1. A browser extension (e.g., privacy-manager, tab-sync manager, a developer's own script in the browser console) rapidly writes to `localStorage['ok-editor-mode-v1']` in a loop.
2. The `storage` event fires once per cross-origin write in each OTHER tab (not the originating tab).
3. Per window: each fire triggers `setMode(next)` → React state update. If 50 events land in 200ms, React batches (thanks to React 19 auto-batching), but state transitions still dispatch on every commit. Through the cross-window sync `useEffect`, `setEditorMode(persistedMode)` fires.
4. Because both editors are always mounted (`EditorActivityPool.tsx:319-335`), the CSS class swap is cheap. But **focus and selection state** (Finding 1) churns on every flip. The user's editor becomes unusable until the burst ends.

Adversarial scenario is also real: another tab on the same origin running a malicious `setInterval` could weaponize this. Less dramatically: a tldraw-style BroadcastChannel implementation would have included an origin-ID to filter out own-sends, but `storage` event already filters them out by browser guarantee — so only *other-tab* noise applies. Still, one misbehaving tab can hijack all other tabs.

**Current design:** No debounce. No rate-limit. No toggle lockout. The spec references next-themes' 16-line implementation as precedent — but next-themes toggles theme, which is cosmetic. Toggling editor mode mid-edit has active-surface cost.
**Alternative:**
- **(a) Debounce on the consumer side.** `setMode` wrapped in a 50-100ms trailing-edge debounce. next-themes doesn't do this, but theme toggle doesn't regress interaction.
- **(b) Rate-limit flips per minute.** Hard cap of N flips per minute from remote; over-cap flips dropped with a `console.warn`. Cap value is tunable but 10/min is a reasonable ceiling for human intent.
- **(c) Ignore during active input.** Use `document.activeElement` / focus state to defer auto-apply while the user is typing. Finding 1 already motivates this.
**Trade-off:** Any of these adds state. The spec's intent is minimum viable; the minimum-viable boundary would include at least one test in §8.3 that probes rapid-burst behavior and confirms "editor stays responsive." Without the test, "degrades gracefully" is an assertion, not a verified property.
**Status:** CHALLENGED
**Suggested resolution:** Add a failure-mode test to §8.3 ("T7: rapid burst — inject 100 storage events in 200ms; assert editor remains interactive and converges to the final value within one frame"). Decide based on outcome whether any debounce/rate-limit is warranted. If the test passes as-is, document "rapid-burst is robust" as an explicit property; if it fails, adopt Alternative (c).

---

### [M] Finding 6: §7.5's "RAW_MDX_NAV_EVENT persists to localStorage" is inconsistent with §7.4's integration code

**Category:** DESIGN
**Source:** DC1 (simpler alternative) — coherence check as a design question
**Location:** §7.4 integration code vs §7.5 surface-by-surface table.
**Issue:** §7.5 claims the RAW_MDX_NAV_EVENT listener will persist to localStorage:

> RAW_MDX_NAV_EVENT listener … `setEditorMode('source')` — not persisted | `setEditorMode('source')` + persists to localStorage (so if user leaves source via this event, it becomes their new preference) — MATCHES user intent

But §7.4 only shows the integration at the header-toggle path (`handleModeChange`):

```typescript
function handleModeChange(mode: 'wysiwyg' | 'source') {
  setEditorMode(mode);
  setPersistedMode(mode); // writes to localStorage
}
```

The RAW_MDX_NAV_EVENT useEffect (current `EditorPane.tsx:93-99`) is not shown. An implementer reading §7.4 in isolation would NOT wire `setPersistedMode` there. §7.5 therefore documents an intent that §7.4 does not realize.

More importantly, the design question under this coherence gap: is the RAW_MDX_NAV_EVENT-induced source mode a TRANSIENT fix-the-broken-block nav (session only) or a PERSISTED preference change? The spec's "MATCHES user intent" argument is weak:
- If the user clicks a broken MDX fallback block, they may just want to fix it — not change their default forever.
- Equivalent intent from the Timeline diff→exit path (restores to `modeBeforeDiffRef`) is NOT persisted, per §7.5.
- Two similar-shape paths (user sees a tool-driven mode change) have divergent persistence behavior with no clear user-model story.

**Current design:** Inconsistent between §7.4 and §7.5.
**Alternative:**
- **(a) Persist all user-initiated mode changes, none of the tool-driven ones.** Only `handleModeChange` persists. RAW_MDX_NAV_EVENT stays session-local. Simplest mental model. Matches diff-exit's existing behavior.
- **(b) Persist all flips including tool-driven.** Implementer wires `setPersistedMode` into RAW_MDX_NAV_EVENT useEffect too. Matches §7.5's stated behavior.
**Trade-off:** (a) is simpler to reason about and consistent with the existing diff-mode rule. (b) maximizes "the persisted value matches what the user sees now" but creates a precedent where any future tool-driven mode-change automatically rewrites the user's global preference.
**Status:** CHALLENGED
**Suggested resolution:** Pick one and make §7.4 and §7.5 match. Favor (a) for the principle-of-least-surprise + consistency with the diff rule. If (b) is chosen, update §7.4's code snippet to include the useEffect wiring.

---

### [M] Finding 7: DC3 intersection claim — the Complication's "multiplies on M1+" is load-bearing but unverified

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §1 Problem Complication.
**Issue:** The Complication says:

> In the M1+ Electron desktop build (one window per project), the friction multiplies — open 3 project windows, reboot, re-toggle 3 times.

This is the dimension that elevates the problem from "annoying single-user friction" to "multiplied friction across Electron milestones." If we remove the Electron-multiplier dimension, the spec's ROI is a single browser-refresh annoyance — arguably a smaller justification for the infrastructure even at its current ~50-line size.

Empirically, how likely is the 3-window reboot scenario? The spec's personas include "Multi-window Electron user" but does not reference any evidence of this persona's size. The Electron M1 ship announcement in CLAUDE.md says "M1 shipped; M2 signed-DMG scaffolding landed." M2 blocks on "Universal DMG green end-to-end under real Apple creds." There is NOT yet a large user base on the packaged Electron app — which means the multiplier claim is forward-looking, not observed.

That's not fatal — forward-looking specs are legitimate. But the intersection claim ("across refreshes AND tabs AND windows") builds urgency. If the "across windows" dimension evaporates (e.g., if M3 changes to one-window-many-projects like VS Code does, which is the obvious next move), the spec's justification reduces to "across refreshes" — which is less compelling.

**Current design:** Treats the 3-window scenario as a given. Not flagged as an assumption.
**Alternative:** Acknowledge the forward-looking dimension. Reframe: "The single-window use case motivates the persistence (across refresh, new tab). The multi-window Electron use case amplifies it — and as desktop adoption grows, amplifies the value of this spec's cross-window-sync primitive."
**Trade-off:** None — just honesty about evidence state.
**Status:** CHALLENGED
**Suggested resolution:** Soften the Complication's multi-window claim to reflect the forward-looking nature. Alternatively, drop the "multiplies" framing and lead with the baseline refresh case — the spec stands on its own merits without needing the Electron multiplier.

---

## Low Severity

### [L] Finding 8: ASK_FIRST's "Renaming the storage key" — why that specific choice as an ASK, not a STOP_IF?

**Category:** DESIGN
**Source:** DC1 (simpler alternative) — consistency check
**Location:** §15 ASK_FIRST vs STOP_IF.
**Issue:** The key `ok-editor-mode-v1` is a 1-way door once users start writing to it — renaming later requires migration or data loss. Yet it's categorized as ASK_FIRST (confirm before proceeding), not STOP_IF (halt and surface to reviewer). STOP_IF includes items like "add a new npm dependency" and "per-doc override plumbing" — less consequential choices, in the 1-way-door sense, than the storage key name.

`-v1` convention exists precisely because repo maintainers anticipated future rewrites — but that forward-compatibility is purely for SCHEMA migrations (add fields, change semantics), not for KEY RENAMES. Key renames break existing users' sessions; no migration path is designed.
**Alternative:** Move the key rename from ASK_FIRST to STOP_IF. The only valid reason to rename is a product-direction change (e.g., if editor mode becomes a non-user-facing concept) — that's exactly the kind of review STOP_IF is for.
**Trade-off:** None — same behavior, stricter framing.
**Status:** CHALLENGED
**Suggested resolution:** Reclassify the key rename to STOP_IF. Low severity because the cost of an accidental rename is user confusion + a one-time reset to default, not data loss.

---

## Confirmed Design Choices (summary)

The following design choices held up under challenge and do not warrant a finding:

**DC1 (simpler alternative):**
- D5 (localStorage with versioned key `ok-editor-mode-v1`) — aligns with existing `ok-theme-v1` / `ok-pin-v1` repo convention; simpler than electron-store for a single-value pref; origin-sharing in Electron is documented in research D6 and verified by reading `window-manager.ts` baseline. Challenged in Finding 4 against `config.yml` hybrid, but for a single renderer-only preference, localStorage is defensible.
- D6 (inline FOUC script, no library) — hand-rolled 10 lines vs importing next-themes-for-one-key. Correct.
- D8 (toggle = commit, no session-vs-persisted distinction) — matches next-themes, avoids hidden state.

**DC2 (stakeholder gap):**
- FR-7 (localStorage throws → console.warn, graceful degradation) — covers the security/privacy stakeholder concern.
- FR-8 (invalid value → default fallback) — covers the manual-tampering / schema-drift stakeholder concern.
- Scope exclusions (§4) — cleanly scoped; defer carve-outs have maturity tiers per spec workflow.

**DC3 (framing validity):**
- D1 (global only, no per-doc or per-project override in v1) — correctly recognizes the simplest subset even if Finding 4 challenges the config.yml framing.
- D2 (two states only, no `auto`/`system`) — no OS signal exists; no motivation.
- D3 (no URL override) — HedgeDoc is the lone precedent and not a fit for the current use case.
- D4 (new docs honor persisted pref) — correctly identified friction the spec fixes.

**Overall challenger posture:** The spec is well-researched and cleanly-argued. The findings above are NOT "gotchas"; they are design tensions the spec under-weights. The most consequential three (Findings 1, 2, 3) concern user-state preservation during cross-window flips, a diff-mode race the STOP_IF mis-describes, and an origin-sharing assumption whose verification is narrower than the risk surface. The two medium-severity findings around per-project framing (Finding 4) and rapid-burst robustness (Finding 5) are items where doing nothing is defensible but saying nothing is not.
