# Dark mode for the editor app — Spec

**Status:** Approved
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-11
**Baseline commit:** 94f9f7f
**Links:**
- Reference implementation: `~/Documents/code/agents/agents/agents-manage-ui/` (Next.js + `next-themes`)
- Evidence: `./evidence/`
- Tracking: TBD

---

## 1) Problem statement

**Situation:** `packages/app` (the editor SPA) ships only a light theme. The codebase already contains a complete `.dark` token block in `globals.css` (lines 710-742), Tailwind v4 dark variant configured (`@custom-variant dark (&:is(.dark *));`), and many components opted into `dark:` utilities. The infrastructure is latent but unreachable — there is no provider, no toggle, no persistence, no application of `.dark` to `<html>`.

**Complication:** Long-form writing tools that don't honor system theme preference are visually fatiguing in low-light contexts and out of step with peer tooling (Linear, Notion, VSCode, Obsidian, the @inkeep/agents Manage UI). Because the token system is already 80% complete, the cost to ship a real dark mode is now dominated by **mechanism + targeted gap-fill**, not theme design — which makes deferring increasingly hard to justify.

**Resolution:** Activate the existing token system by introducing `next-themes` (three-state: light / dark / system, defaulting to system), placing a Sun/Moon/Monitor toggle in `EditorHeader`, adding a small inline FOUC-prevention script to `index.html` (since Vite SPA has no SSR), filling identified CSS gaps in `globals.css`, and giving the CodeMirror SourceEditor a dark theme via `@codemirror/theme-one-dark`. We mirror the agents-manage-ui reference implementation as closely as the SPA stack allows.

## 2) Goals

- **G1:** Users can choose light / dark / system theme; system follows OS `prefers-color-scheme` and reacts to OS changes live.
- **G2:** Every editor surface (TipTap WYSIWYG content, CodeMirror Source mode, sidebar, presence UI, menus) renders correctly in dark mode with WCAG AA contrast for body text.
- **G3:** No flash-of-light-content on initial load when the resolved theme is dark.
- **G4:** Theme preference persists across sessions and syncs across tabs editing the same workspace.

## 3) Non-goals

- **[NOT NOW]** NG1: Dark mode for the `docs/` Fumadocs Next.js site. — Revisit if: docs site UX consistency becomes a concern; Fumadocs has its own theme system and is out of this spec's scope.
- **[NOT NOW]** NG2: Per-document theme override. — Revisit if: users request "always-dark for code-heavy docs" workflows.
- **[NOT NOW]** NG3: Custom user-defined theme palettes (beyond the two built-in tokens). — Revisit if: enterprise theming becomes a need.
- **[NOT UNLESS]** NG4: Reskinning brand color tokens (`--color-azure-blue`, `--color-night-sky`, etc.) to be theme-responsive. — Only if: a usage of one of these tokens in a content surface is found to fail in dark (currently catalogued at MEDIUM severity, not blocking).
- **[NEVER]** NG5: Server-side theme rendering. — The editor is a CRDT collaboration SPA; there is no server-rendered HTML to theme.

## 4) Personas / consumers

- **P1: Solo writer using the editor in low-light environments** — wants dark mode to follow OS at night, light during the day. Cares about: zero flash, comfortable contrast in long sessions, code blocks readable.
- **P2: Pair-collaborating users on the same document** — different theme preferences must coexist; presence UI (cursors, badges) must remain legible regardless of which side is on dark.
- **P3: Agents writing into the editor** — agent flash effect must remain visible on both themes (currently uses fixed terracotta rgba that fades to invisible on dark).

## 5) User journeys

### P1: First-time dark-mode user
1. Opens app on macOS with system in dark mode.
2. Page loads with `<html class="dark">` already applied (FOUC script). No flash.
3. Sees Sun/Moon icon in `EditorHeader` upper-right cluster.
4. Optionally clicks → opens dropdown → selects "Light" to override.
5. Choice persists across reload and across browser tabs.

### P1 failure / recovery: localStorage disabled
- FOUC script try/catches; falls back to system preference. Provider re-detects on mount; toggle still works for the session.

### P2: Pair editing across themes
- User A on dark, User B on light, same doc. Each sees their own theme applied to the editor chrome and content. Cursor labels and presence badges are legible in both.

### P3: Agent write during dark mode
- Agent writes 3 paragraphs. Agent-flash animation runs with dark-mode-tuned rgba opacity; left accent bar remains visible against `--color-gray-900`-ish background.

### Known limitation (per D15)
**Three-state mental-model trap:** A user on a dark OS who explicitly selects "Light" from the dropdown will see the app stay light even after toggling their OS preference back to dark. There is no in-app indicator that the user is in explicit-mode versus system-resolved-mode. This matches `next-themes` industry-standard behavior. A polish iteration (visual indicator on the toggle when not in `system`) is tracked in Future Work.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Theme on first paint | inline script applies class before CSS | n/a | localStorage throws → fall back to system | dark/light class on `<html>` | n/a |
| Toggle dropdown | n/a | n/a | n/a | resolved theme updates, badge swaps Sun↔Moon | n/a |
| Cross-tab sync | n/a | n/a | storage event throttled/blocked | other tabs update on `storage` event | n/a |
| CodeMirror theme | n/a | n/a | theme extension fails to load → keeps light | dark theme applied via Compartment.reconfigure | n/a |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | R1: Three-state theme toggle (light/dark/system) | Dropdown in EditorHeader shows Sun/Moon/Monitor; selecting any updates `<html>` class and persists | |
| Must | R2: System preference is the default | First load with no stored value resolves to OS `prefers-color-scheme` | |
| Must | R3: System mode reacts to OS theme change live | Toggling OS dark mode while app open updates editor without reload | next-themes built-in via matchMedia listener |
| Must | R4: No FOUC for dark resolved theme | Inline script applies `.dark` before any CSS rule paints | Verified visually + with Playwright (browser context `colorScheme: 'dark'`) |
| Must | R5: Persistence across reloads | Reload preserves chosen theme | localStorage `ok-theme-v1` |
| Must | R6: Cross-tab sync | Toggle in tab A updates tab B without reload | next-themes built-in via storage event |
| Must | R7: TipTap content readable on dark | Every content surface enumerated in `evidence/gap-inventory.md` (HIGH + MEDIUM, including custom node views H-A through H-D added post-audit) renders with WCAG AA body-text contrast on `.dark`; goal G2 is the criterion, inventory is the evidence checklist | Acceptance is against G2 (per audit S6); inventory rows are tracking artifacts |
| Must | R8: CodeMirror SourceEditor has dark theme | When resolved theme is dark, source editor uses `@codemirror/theme-one-dark`; switches reactively | Compartment-based reconfigure |
| Must | R9: Agent flash visible on dark | rgba opacity boosted for `.dark` mode in agent-flash, agent-breathing, undo-ready keyframes | |
| Should | R10: WikiLink suggestion error text readable on dark | `text-amber-700 dark:text-amber-300` | |
| Should | R11: Toggle is keyboard-accessible | Tab to trigger, Enter opens, arrow keys navigate options | Inherits from shadcn DropdownMenu |
| Could | R12: Smooth transition between themes | Optional 150ms crossfade on theme switch (vs. `disableTransitionOnChange`) | Reference uses `disableTransitionOnChange`; mirror that |

### Non-functional requirements

- **Performance:** No measurable runtime cost when not toggling. Inline FOUC script ≤1ms on cold load.
- **Reliability:** Theme resolution must not fail if localStorage throws; falls back to system.
- **Security/privacy:** Storage key namespaced (`ok-theme-v1`); no PII; no network calls.
- **Operability:** No telemetry required for v1. Theme value visible in DOM (`<html class>`) and devtools localStorage for debugging.
- **Cost:** +1 dep (`next-themes` ~4KB gz), +1 dep (`@codemirror/theme-one-dark` ~3KB gz). Negligible.

## 7) Success metrics & instrumentation

- **Adoption signal (qualitative):** No public metric needed — this is a hygiene feature. Internal dogfooding sufficient.
- **Failure signal:** Visual regression in `bun run check` snapshot suite (Future Work) OR user-reported unreadable surface.
- **What we will log/trace:** Nothing. No analytics in this app today; not introducing any.

## 8) Current state (how it works today)

See `evidence/current-state-tokens.md` for full detail. Summary:
- Tailwind v4 dark variant configured.
- Full `.dark` token block exists in globals.css with all shadcn semantic tokens overridden.
- shadcn primitives, sidebar, bubble menu, slash menu, wiki-link menu container all use semantic tokens already.
- No mechanism to add `.dark` class to `<html>`. No user-facing toggle. No persistence.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **Toggle UI:** New `ThemeToggle` component in `packages/app/src/components/ThemeToggle.tsx`. Mirror of agents-manage-ui's `theme-toggle.tsx`: ghost icon button, swaps Sun/Moon via `dark:hidden` / `not-dark:hidden`, dropdown of three options (Light / Dark / System) with lucide icons.
- **Placement:** Inserted into `EditorHeader` right cluster as the **first (leftmost)** element, before `<PresenceBar />` and `<AgentUndoButton />` (D9). Visible on every editor view.
- **No new pages or routes.**

### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `/` (editor) | `EditorHeader`, all editor surfaces | Toggle appears; switching applies; all content readable in both themes |
| Empty state (no doc) | Same chrome | Toggle still functional even when no document is open |

### System design

**Architecture overview:**
- `<ThemeProvider>` from `next-themes` wraps `<App />` in `main.tsx`, between `<StrictMode>` and `<TooltipProvider>`.
- Provider config: `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`, `storageKey="ok-theme-v1"`.
- Inline FOUC script in `packages/app/index.html` `<head>` (before CSS link) applies `.dark` to `<html>` synchronously based on `localStorage.getItem('ok-theme-v1')` (read as **plain string** — next-themes stores raw values, no JSON encoding) and `window.matchMedia('(prefers-color-scheme: dark)')`.
- `ThemeToggle` component uses `useTheme()` from `next-themes`.
- `SourceEditor` consumes `useTheme()` and uses a CodeMirror `Compartment` to swap `oneDark` extension reactively when `resolvedTheme` changes.
- Existing `globals.css` `.dark` block is reused as-is; added rules are scoped under `.dark .ProseMirror …` selectors for the gap fixes.

**Data model:** None. Theme state lives in localStorage + provider memory.

**API/transport:** None.

**Auth/permissions:** None.

**Enforcement point(s):** Single source of truth = `<html>` class. CSS variables resolve from there.

**Observability:** Visual; no telemetry.

#### Data flow diagram

- Primary flow: `localStorage` / `prefers-color-scheme` → inline script (sync) → `<html class="dark">` → CSS vars resolve → first paint
- React mounts → `<ThemeProvider>` reads same source → `useTheme()` exposes state to components → `ThemeToggle` writes back via `setTheme()` → provider writes localStorage + dispatches storage event → other tabs sync
- Shadow paths to test:
  - **nil / missing:** `localStorage.getItem` returns null → resolve to system
  - **empty:** stored `""` → JSON.parse throws → catch → resolve to system
  - **wrong type:** stored value not in {light, dark, system} → next-themes ignores; falls back to default
  - **storage blocked:** try/catch in inline script; provider also try/catches
  - **conflict:** two tabs toggle simultaneously → last storage write wins; both tabs converge via storage event

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Inline FOUC script | localStorage throws (private mode) | try/catch | Falls through to system preference | None — system theme still applied |
| ThemeProvider | next-themes import fails | Vite build error | Build blocked | None at runtime |
| CodeMirror dark theme | `@codemirror/theme-one-dark` import fails | Vite build error | Build blocked | None at runtime |
| Compartment reconfigure | Reactively updating theme during typing | Tested | dispatch is non-disruptive in CM6 | None |
| `prefers-color-scheme` matchMedia | Unsupported in ancient browsers | Provider falls back to default | Theme stuck at default; toggle still works | Stale theme in fringe browsers |

### Alternatives considered

- **Hand-rolled ThemeProvider (~30 LoC, no dep):** Rejected. Reference parity with agents-manage-ui is the explicit goal of this spec; `next-themes` handles cross-tab sync, system listening, FOUC storage format, and `forcedTheme` escape hatches we'd otherwise reimplement.
- **Two-state toggle (light/dark only):** Rejected per user decision — system default is the modern expectation.
- **Skip CodeMirror dark theme (rely on user `colorScheme` in CSS):** Rejected; CM6's `basicSetup` injects styles that override `prefers-color-scheme`.
- **Skip FOUC script:** Rejected; user-visible flash undermines polish.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Three-state toggle (light/dark/system), system default | P | LOCKED | No | User decision; matches reference; modern norm | reference-impl-agents-manage-ui.md | All UX flows |
| D2 | Toggle lives in EditorHeader right cluster | P | LOCKED | No | User decision; visible without dedicated settings panel | EditorHeader.tsx | ThemeToggle placement |
| D3 | Use `next-themes` (works in non-Next React) | T | LOCKED | Reversible (could swap to custom provider) | Reference parity; cross-tab sync; battle-tested | reference-impl-agents-manage-ui.md, vite-spa-fouc.md | +1 dep |
| D4 | Scope is `packages/app` only; docs/ excluded | P | LOCKED | No | User decision | n/a | Future Work item |
| D5 | Inline FOUC script in `index.html` (Vite SPA, no SSR) | T | DIRECTED | No | Required for parity; ~12 lines; no runtime cost | vite-spa-fouc.md | Must keep storage format synced with next-themes |
| D6 | CodeMirror gets `@codemirror/theme-one-dark` via `Compartment` for reactive swap | T | DIRECTED | Reversible | Smallest, official dark theme; Compartment is idiomatic CM6 reactivity | codemirror-dark-theme.md | +1 dep; SourceEditor consumes useTheme() |
| D7 | Storage key = `ok-theme-v1` (versioned namespace) | T | LOCKED | Forward-only (changing key abandons stored prefs) | Allows future migration; namespace prevents collision | vite-spa-fouc.md | Inline script + provider must agree |
| D8 | `disableTransitionOnChange` (no crossfade) | P | DIRECTED | Reversible | Matches reference; avoids janky transitions on complex editor surfaces | reference-impl-agents-manage-ui.md | R12 deferred |
| D9 | ThemeToggle is leftmost in EditorHeader right cluster (before PresenceBar) | P | LOCKED | No | Keeps presence/undo grouped as collaboration affordances; theme reads as "view setting" | EditorHeader.tsx | ThemeToggle insertion order |
| D10 | All MEDIUM-severity gap-inventory items (#12-#19) are In Scope for MVP, not deferred | T | LOCKED | No | All are 1-line CSS additions in the same file; cost to defer + visual-review iterate exceeds cost to do upfront | gap-inventory.md | Single clean PR; R7 acceptance expanded |
| D11 | `<meta name="color-scheme" content="light dark">` (closes Q6) | T | LOCKED | No | Tells UA both schemes are supported; resolved theme set via `style.colorScheme` in inline script | vite-spa-fouc.md | index.html addition |
| D12 | Custom node views with hardcoded styles (Callout, JsxComponentView, WikiLinkView, CreatePageDialog error text) added to SCOPE after audit C1; Callout & JsxComponentView require refactor from inline styles to Tailwind classes | T | LOCKED | No | Cold-reader audit caught these as missed surfaces; `.dark` CSS cannot override inline `style={}`; without these the editor's most-visible custom nodes regress on dark | design-challenge.md C1, gap-inventory.md H-A..H-D | SCOPE in §16 expanded; refactor adds component-level changes, not just CSS |
| D13 | Keep `next-themes` (dismiss audit C2 challenge to hand-roll) | T | LOCKED | Reversible | User explicitly directed (D3); dep is small (~4KB gz); the JSON-vs-string coupling is now resolved (A2). Hand-roll is genuinely a viable alternative if dep removal becomes important later | design-challenge.md C2 | None — confirms D3 |
| D14 | Keep ThemeToggle in EditorHeader (dismiss audit C3 challenge to move to FileSidebar) | P | LOCKED | Reversible | User explicitly directed (D2/D9); FileSidebar footer is a defensible alternative future move when other app-level settings emerge | design-challenge.md C3 | None — confirms D2/D9 |
| D15 | Accept three-state mental-model trap as known limitation; document in §5 user journeys (audit C4) | P | DIRECTED | Reversible | Industry-standard behavior; visual indicator on toggle for explicit-mode is a future polish item, not MVP | design-challenge.md C4 | §5 gains a "known limitation" note; Future Work entry added |
| D16 | CodeMirror Compartment swap safety (audit C5): promote A4 verification from "test during implementation" to a focused integration check; if Compartment proves disruptive, fall back to remount on theme change | T | DIRECTED | Reversible | Cold reader flagged hand-waving; cheap to write a smoke test | design-challenge.md C5 | A4 upgraded; remount path is documented Plan B |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Do agent-flash rgba alphas need dark-mode-specific values, or is a single boosted alpha sufficient for both themes? | T | P0 | No (can iterate) | Visual test in implementation; default to `.dark` keyframe override at 0.18-0.30 alpha | Open |
| Q2 | (Resolved) `--color-azure-blue` link override to `--color-sky-blue` on dark — folded into gap-inventory item #14, In Scope per D10 | T | — | — | Closed; tracked in gap-inventory #14 | Resolved |
| Q3 | Are HUMAN_COLORS pastel cursor caret colors readable on dark? | T | P0 | No | Visual test; if poor, document as Future Work item (separate concern from this spec's MVP) | Open |
| Q4 | Should we add Playwright dark-mode test variants (re-run existing visual flows with `colorScheme: 'dark'`) in this spec or as Future Work? | X | P0 | No | Decide during iteration: is the marginal cost ≤ ½ day? If yes, include. | Open |
| Q5 | (Resolved with default) `disableTransitionOnChange` per D8; R12 deferred. Visual review may revisit. | P | — | — | Closed-with-default | Resolved |
| Q6 | (Resolved as D11) Use `<meta name="color-scheme" content="light dark">`; resolved theme set via `style.colorScheme` in inline script | T | — | — | Closed via D11 | Resolved |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `next-themes` v0.4.x works in Vite SPA without Next runtime | HIGH | Verified via reference impl + npm package README; will validate in implementation | At first commit | Active |
| A2 | next-themes stores theme as plain string (no JSON encoding); inline script reads `localStorage.getItem` directly | HIGH | Verified against `next-themes@^0.4.6` source during audit (`agents-manage-ui/node_modules/next-themes/dist/index.mjs`) | Resolved 2026-04-11 | Resolved |
| A3 | All shadcn primitives in `components/ui/` work correctly under `.dark` (per gap-audit) | HIGH | Audit confirmed semantic-token usage | At first commit | Active |
| A4 | CodeMirror Compartment-based theme swap doesn't disrupt active y-codemirror.next collaboration | MEDIUM | Per D16: focused integration smoke test during implementation; fall back to editor remount on theme change if Compartment proves disruptive | Before merging | Active |
| A5 | `bg-agent` (terracotta) provides sufficient white-text contrast on both themes | HIGH | WCAG check; terracotta passes AA against white | At first commit | Active |

## 13) In Scope (implement now)

- **Goal:** Activate dark mode end-to-end in `packages/app` with reference-aligned UX and fix all HIGH-severity gap-inventory items.
- **Non-goals:** docs/ site, per-doc override, custom palettes. (All MEDIUM-severity items are now In Scope per D10.)
- **Requirements with acceptance criteria:** §6 (R1–R11 must, R12 deferred).
- **Proposed solution:** §9.
- **Owner(s)/DRI:** TBD.
- **Next actions:**
  1. Add deps: `next-themes`, `@codemirror/theme-one-dark` (+ `@codemirror/state` already present).
  2. Inline FOUC script in `packages/app/index.html`.
  3. Wrap `<App />` in `<ThemeProvider>` in `main.tsx`.
  4. Create `components/ThemeToggle.tsx` (port from agents-manage-ui with import paths adjusted).
  5. Insert `<ThemeToggle />` in `EditorHeader` right cluster.
  6. Refactor `SourceEditor` to consume `useTheme()` and swap CodeMirror theme via `Compartment`.
  7. Add `.dark` overrides to `globals.css` for all HIGH-severity (#1–#11) AND MEDIUM-severity (#12–#19) gap-inventory items.
  8. Add `.dark` keyframe variants for agent-flash, agent-breathing, undo-ready (Q1).
  9. Visual review pass.
  10. (Optional) Playwright `colorScheme: 'dark'` variant of existing e2e.
- **Risks + mitigations:** §14.
- **What gets instrumented/measured:** Nothing.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Existing users see surprise dark mode if OS preference is dark | Default `system` matches OS — if OS is dark, they get dark on first load post-deploy. This is desired. | Manual: open with OS dark; confirm dark mode loads cleanly |
| Cached `index.html` without inline FOUC script | First load post-deploy may flash | Hard refresh once; subsequent loads use new HTML |
| Storage key collision with future versions | `ok-theme-v1` namespacing | Future migration uses `ok-theme-v2` and ignores v1 |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Inline FOUC script storage format diverges from next-themes (next-themes stores plain string, NOT JSON) | Low | High (FOUC returns silently) | A2 resolved during audit (verified plain-string format); integration test reads/writes both ways | Implementer |
| One-Dark CodeMirror theme clashes with TipTap visual language | Medium | Low (ugly but functional) | Tracked as Future Work — replace with token-mapped CM theme later | — |
| Agent flash invisible on dark | Medium | Medium (kills key UX signal) | Q1 resolved with `.dark` keyframe override | Implementer |
| MEDIUM-severity items missed during implementation | Low | Low | All explicitly enumerated in `evidence/gap-inventory.md` and In Scope per D10 | Implementer |
| Pastel HUMAN_COLORS cursor carets unreadable on dark | High | Low (presence still functional, just lower-contrast) | Q3 documents as Future Work; not blocking | — |
| `next-themes` non-Next usage breaks at runtime | Low | High | A1 verified in reference impl; smoke-test on implementation | Implementer |

## 15) Future Work

### Explored
- **Token-mapped CodeMirror theme** — Replace `oneDark` with a hand-rolled CM6 theme using `--color-*` design tokens for visual coherence with TipTap.
  - What we learned: CodeMirror 6 supports theme via `EditorView.theme(spec, { dark: true })`; mapping each highlight style to brand tokens is straightforward.
  - Recommended approach: ~50-line theme module in `editor/codemirror-theme.ts`.
  - Why not in scope now: `oneDark` is a pragmatic shortcut; visual review may show it's good enough.
  - Triggers to revisit: User feedback that source editor "feels different" or visual review fails coherence check.

### Identified
- **Dark mode for `docs/` (Fumadocs Next.js)** — Out of this spec's scope. Fumadocs has its own theme system; needs separate work. UX seam noted: a user clicking docs link from dark editor lands on a potentially light-only docs site (audit S3).
- **Per-document theme override** — Some users may want code-heavy docs always-dark. Needs UX design + persistence at doc level (Y.Map metadata?).
- **Adaptive HUMAN_COLORS for cursor carets** — Pastel palette is light-mode optimized. A theme-aware variant (or HSL-shifted darker palette for dark mode) would improve contrast.
- **Visual indicator on ThemeToggle when in explicit-mode** — Address the three-state mental-model trap (D15): show a subtle dot/marker on the trigger when `theme !== 'system'`, so users know they've opted out of OS-following.
- **Theme-aware brand color tokens** — `--color-agent` (terracotta) needs separate dark-mode tuning per agent-flash work (audit S4). Folding into a single `--agent-flash-color` token (or `--color-agent-dark` companion) would replace the dual-keyframe approach with a token-driven one.

### Noted
- **Visual regression test infrastructure** — No snapshot suite today (audit S5). Adding one would catch dark-mode regressions on every PR. Even a Playwright fixture-doc-with-every-node-type smoke test under `colorScheme: 'dark'` would be a meaningful first step.

### Noted
- **Custom user palettes / enterprise theming** — Not requested; would require token system extension.
- **Visual regression test suite** — No snapshot infra exists today; adding one is a separate investment.

## 16) Agent constraints

- **SCOPE:** `packages/app/index.html`, `packages/app/src/main.tsx`, `packages/app/src/components/ThemeToggle.tsx` (new), `packages/app/src/components/EditorHeader.tsx`, `packages/app/src/components/CreatePageDialog.tsx`, `packages/app/src/editor/SourceEditor.tsx`, `packages/app/src/editor/Callout.tsx`, `packages/app/src/editor/extensions/JsxComponentView.tsx`, `packages/app/src/editor/extensions/WikiLinkView.tsx`, `packages/app/src/editor/wiki-link-suggestion/WikiLinkSuggestionMenu.tsx`, `packages/app/src/globals.css`, `packages/app/package.json`.
- **EXCLUDE:** `docs/`, `packages/server/`, `packages/cli/`, `packages/core/`, any non-`packages/app` files. Do not modify shadcn `components/ui/` primitives. Do not touch `globals.css` `.dark` token block (lines 710-742) — extend with new selectors only.
- **STOP_IF:** Any change requires touching `packages/core/` (shared types) — that signals the spec's surface is wrong. Any change requires Y.Doc or persistence schema modification — that means per-doc theme is creeping in (out of scope).
- **ASK_FIRST:** Adding a new dependency beyond the two named (`next-themes`, `@codemirror/theme-one-dark`). Modifying brand color hex tokens. Changing the storage key from `ok-theme-v1`. Adding telemetry.
