# Editor Mode Persistence & Cross-Window Sync

**Status:** FINALIZED — audit + challenge complete; 14 surgical corrections applied; 3 design decisions resolved; all 8 decisions LOCKED; resolution completeness gate passed.
**Baseline commit:** `7e0beff4` (refreshed at ship-time; PR #237 "V2 editor cache + InteractionLayer + Option E cold-load" landed on main between spec finalization and ship, changing the mode-swap CSS from Tailwind `hidden` (display:none) to the custom `.ok-mode-hidden` class with `content-visibility:hidden + position:absolute + pointer-events:none`. D7 decision unchanged — interaction-state concerns (IME, drag-select) still apply under the new CSS; focus-based re-check remains the correct fit.)
**Finalized:** 2026-04-22
**Owner:** Nick Gomez
**Created:** 2026-04-21
**Related research:**
- [`reports/editor-view-mode-persistence-prior-art/`](../../reports/editor-view-mode-persistence-prior-art/) — Prior-art survey (8 dimensions) with primary-source evidence
- [`reports/source-toggle-architecture/`](../../reports/source-toggle-architecture/) — Existing architectural baseline for the dual-editor toggle

---

## 1. Problem

**Situation.** The Open Knowledge editor offers two content-editing surfaces — WYSIWYG (TipTap, bound to `Y.XmlFragment`) and Source (CodeMirror 6, bound to `Y.Text('source')`) — plus an ephemeral diff/timeline preview (`EditorMode = 'wysiwyg' | 'source' | 'diff'` at `EditorPane.tsx:21` at baseline `7e0beff4`). The user picks between the two edit modes based on task and working style. The current mode lives in `useState<EditorMode>('wysiwyg')` at `EditorPane.tsx:24` — pure React state.

**Complication.** Every page refresh and every new browser tab slams the user back to `'wysiwyg'` regardless of what they were just using. A user who prefers Source has to re-toggle on every reload. Forward-looking: as the M1+ Electron desktop build (one window per project) gains adoption, the friction scales with window count — a user with 3 project windows re-toggles 3 times per restart. The preference is obvious to the user ("I always work in markdown"); the app forgets it instantly.

**Resolution.** Persist the editor mode (`wysiwyg` | `source`) as a user-global preference that survives refreshes, new tabs, and new Electron windows. Apply on first paint (no flash from default to user's pref). Auto-propagate preference changes across windows so a flip in Window A is reflected in Window B on B's next focus — avoiding mid-edit interaction-state loss (caret, selection, IME composition) that a live storage-event-driven auto-apply would cause. Follow the repo's existing `ok-*-v1` localStorage convention; no new storage backend introduced.

---

## 2. Personas

- **Markdown-first user.** Prefers Source permanently. Today: toggles Source on every session. Post-spec: toggles once; sticks.
- **Rich-text user.** Prefers WYSIWYG (the current default). Unaffected — default behavior preserved.
- **Mixed user.** Switches based on task (e.g., WYSIWYG for prose, Source for code-heavy docs). Post-spec: last-used mode sticks until they toggle again.
- **Multi-window Electron user.** Opens 2+ project windows. Post-spec: toggle in one window propagates live to the others; reboot rehydrates all windows to the persisted preference.

---

## 3. Goals

- Preserve the user's editor mode choice across refreshes, tabs, and windows on the same install.
- Apply the mode on first paint — no visible flash of the wrong mode.
- Keep implementation scope tight: single new localStorage key, single inline FOUC-prevention script, single hook consumed by `EditorPane`.
- Preserve all existing editor UX — diff preview, mode-restore-after-diff-exit, keyboard handling, header toggle — without behavioral regressions.

## 4. Non-goals (v1)

- **Per-document mode override.** No frontmatter-based per-file mode (Obsidian community-plugin pattern — deferred to Future Work, *Identified*).
- **Per-project mode override.** No per-project config layer (VS Code workspace-tier pattern — Future Work, *Identified*).
- **URL-based override.** No `?mode=source` shareable-link override (HedgeDoc pattern — Future Work, *Noted*).
- **Cross-device sync.** No Settings Sync-style cross-device sync (VS Code Settings Sync pattern — Future Work, *Noted*).
- **Reading-only / preview-only mode.** Not introducing a third mode beyond today's `wysiwyg`/`source`/`diff` enum.
- **Changes to `diff` mode.** `diff` is ephemeral timeline preview and is not persisted; `modeBeforeDiffRef` behavior preserved.
- **Changes to the editor mechanic.** The serialize-on-toggle / dual-CRDT behavior is out of scope (covered by [`source-toggle-architecture`](../../reports/source-toggle-architecture/) and shipped).

---

## 5. Scope

### 5.1 In scope

| # | Item | Files touched |
|---|---|---|
| S1 | Persist selected editor mode on every toggle | `packages/app/src/components/EditorPane.tsx` |
| S2 | Read persisted mode on first paint; apply before React renders to prevent FOUC | `packages/app/index.html` (new inline `<script>`) |
| S3 | Subscribe to `focus` events; on focus return, re-read persisted mode and auto-apply cross-window changes to live UI (deliberate focus-gated design — see D7) | New file: `packages/app/src/editor/use-editor-mode.ts` (hook) |
| S4 | Preserve existing `modeBeforeDiffRef` behavior (diff exits restore to session pre-diff mode, not persisted pref) | `packages/app/src/components/EditorPane.tsx` (no-op change — guard path) |
| S5 | Unit tests for the hook + FOUC inline-script logic | `packages/app/src/editor/use-editor-mode.test.ts` (new) |
| S6 | Playwright E2E: refresh preserves mode; new tab inherits mode; cross-window flip propagates | `packages/app/tests/stress/editor-mode-persistence.e2e.ts` (new) |

### 5.2 Out of scope / Future Work

| Item | Maturity | Trigger to revisit |
|---|---|---|
| Per-document override via frontmatter (`ok-editor-mode: wysiwyg \| source`) | *Identified* — Obsidian plugin pattern fully mapped in D7 evidence | User feedback requesting per-doc sticky OR a code-heavy workflow needs a default override |
| Per-project override (per-project `.open-knowledge/config.yml` key or second localStorage key) | *Identified* — VS Code workspace-tier pattern documented | Multi-project user with divergent prefs explicitly requests it |
| URL one-shot override (`#/<doc>?mode=source`) | *Noted* — HedgeDoc pattern in D5 evidence | Share-link "open this in raw mode" becomes a request |
| Cross-device preference sync | *Noted* — VS Code Settings Sync model | Cross-device story becomes a product direction |
| Preview / Reading-only third mode | *Noted* — Obsidian 3-mode design in D1 evidence | Read-only workflows become a need |

---

## 6. Requirements

### 6.1 Functional requirements

| ID | Requirement | Acceptance criterion |
|---|---|---|
| FR-1 | When the user clicks the editor mode toggle (Visual / Markdown) in `EditorHeader`, the new mode SHALL be written to `localStorage` synchronously under key `ok-editor-mode-v1` | After clicking Markdown, `localStorage.getItem('ok-editor-mode-v1') === 'source'` is true synchronously on the next tick. |
| FR-2 | On page load, before React mounts, the persisted mode SHALL be read from `localStorage` and applied to the initial React state, so the editor's first paint shows the persisted mode (no FOUC) | The inline `<script>` in `index.html` SHALL set `window.__OK_EDITOR_MODE__` before `DOMContentLoaded`. Verified by (a) a unit test asserting the hook's initial `useState` reads the preloaded global when present, and (b) a Playwright test that hard-refreshes with `source` persisted and asserts, on the first rendered frame queried via `page.evaluate(() => document.querySelector('[data-editor-mode]'))`, that the Source editor subtree is present and the WYSIWYG subtree is absent. The reverse assertion (no WYSIWYG DOM visible pre-first-frame) is proven via the unit-level assertion, not Playwright timing. |
| FR-3 | When `localStorage` has no value for the key (first-time user or cleared storage), the default SHALL be `'wysiwyg'` | With `localStorage.removeItem('ok-editor-mode-v1')` before load, the editor loads in WYSIWYG. |
| FR-4 | When the mode changes in another browser tab or Electron BrowserWindow (same origin), the current tab SHALL re-read the persisted value from `localStorage` when the window regains focus (`focus` event on `window`) and update its UI accordingly. Mid-edit users (tab has focus and composition/selection is in flight) are NOT interrupted — the sync waits for focus return. | In a Playwright test with one `BrowserContext` and two pages (A, B) both open to the editor: flip mode in page A, bring page B to focus via `page.bringToFront()` / `page.focus()`, assert page B's editor switches to the new mode before the next assertion tick. |
| FR-5 | Creating a new document SHALL honor the persisted mode — a new empty doc opens in the user's current preference | With `source` persisted, `POST /api/create-page` followed by navigation to the new doc shows the Source editor on arrival. |
| FR-6 | Exiting diff mode SHALL restore the session pre-diff mode (via existing `modeBeforeDiffRef`), NOT the persisted pref — even when the persisted pref has changed via a concurrent cross-window flip while the user was in diff | (Baseline) If user is in Source, enters diff, exits diff → returns to Source. (Concurrent-flip case) If user is in Source, enters diff, another window flips the persisted pref to WYSIWYG, user regains focus and exits diff in this window → user still returns to Source (session UX continuity). Covered by E2E T5. |
| FR-7 | When `localStorage.setItem` throws (privacy-mode browsers, quota), the session SHALL continue working with in-memory state and no user-visible error | Mocked `setItem` throw path: toggle still flips in-memory; no crash; no toast. Warning logged to console (bracket-prefix format per CLAUDE.md logging conventions). |
| FR-8 | Persisting an invalid value (schema violation from a prior version or manual localStorage tampering) SHALL fall back to the default without crashing | With `localStorage.setItem('ok-editor-mode-v1', 'garbage')` before load, editor loads in WYSIWYG. Warning logged. |

### 6.2 Non-functional requirements

| ID | Requirement | Acceptance criterion |
|---|---|---|
| NFR-1 | No measurable first-paint regression from the inline FOUC script | Inline script does one synchronous `localStorage.getItem` + one property write on `window`. Documented expectation: < 1 ms total (localStorage access is microseconds in Chromium). Not gated via Playwright perf-baseline (the repo's `perf-baseline.json` shape is for per-test `qaXXX` keys specific to measured user-outcome flows, not for inline-script cost — per CLAUDE.md's baseline protocol). A future perf-gate could be added if needed. |
| NFR-2 | No added dependencies for persistence | `package.json` unchanged. No new npm packages. |
| NFR-3 | Bundle size delta < 500 B compiled | Hook + inline script total ≤ ~50 lines of TypeScript. |
| NFR-4 | Works identically in web (CLI-served) and Electron renderer | Playwright runs pass in `bun run dev` web mode (covers the web + renderer-packaged paths — renderer assets are identical). Electron-packaged Multi-window verification is **manual QA** via `bun run --cwd packages/desktop build:mac:unsigned` + open two project windows — no automated `_electron.launch()` Playwright harness exists in this repo at baseline (see `packages/desktop/README.md §M2`). Explicit manual QA checklist lives in §8.4. |

---

## 7. Proposed Solution (vertical slice)

### 7.1 Data model

Single localStorage key:

- **Key:** `ok-editor-mode-v1`
- **Value:** string literal — either `'wysiwyg'` or `'source'`
- **Scope:** per-user-per-origin (Chromium origin-sharing gives cross-window stickiness for free in Electron — validated in research D3/D6)
- **Versioned:** `-v1` suffix matches repo convention (`ok-theme-v1`, `ok-pin-v1`). Future schema changes bump to `-v2`.

No new server-side state. No CRDT changes. No config file. This is a pure client-side UI preference.

### 7.2 FOUC prevention (inline HTML script)

Pattern: synchronous inline `<script>` in `packages/app/index.html` `<head>`, running before React mounts. This is the **first inline FOUC script in-repo** — `next-themes` handles theme FOUC internally via its `ThemeScript` React component (which itself injects an inline script via `dangerouslySetInnerHTML` at the library level; we don't re-implement that infrastructure). The repo's `ok-*-v1` precedent applies to localStorage **key naming** (`ok-theme-v1`, `ok-pin-v1`) — not to inline-script delivery. We hand-roll the inline script here because we're not importing a library just to ship 10 lines.

> Note: CLAUDE.md §Theming may reference an inline FOUC script for theme. That reference is stale (next-themes handles theme FOUC internally; index.html has no such script today). Flag for a corrigendum breadcrumb per CLAUDE.md's post-ship protocol in a separate small follow-up PR.

```html
<!-- packages/app/index.html <head>, before <script type="module" src="/src/main.tsx"> -->
<script>
  (function () {
    try {
      var mode = localStorage.getItem('ok-editor-mode-v1');
      if (mode !== 'wysiwyg' && mode !== 'source') mode = 'wysiwyg';
      window.__OK_EDITOR_MODE__ = mode;
    } catch (e) {
      window.__OK_EDITOR_MODE__ = 'wysiwyg';
    }
  })();
</script>
```

Why a global var, not a class/attribute on `<html>`: React state initializer reads it once and owns the value from then on. A class/attribute would work too but would add a second source of truth. The global is read-exactly-once at the `useState` initializer.

### 7.3 Hook API: `useEditorMode`

New file: `packages/app/src/editor/use-editor-mode.ts`

Cross-window sync uses the **focus-based re-check** pattern (Excalidraw Pattern C — research D8) rather than the live `storage` event listener (next-themes Pattern A). Rationale: the editor is a large-state surface; the mode-swap CSS (`.ok-mode-hidden` in `packages/app/src/globals.css` — `content-visibility:hidden + position:absolute + pointer-events:none`) preserves DOM presence but interrupts IME composition and orphans in-flight drag-selection on swap. Deferring the re-apply to the next `focus` return eliminates mid-edit interruption at the cost of a slight delay before an inactive window reflects a cross-window flip — a trade-off the consuming spec accepts (see §13 R4).

```typescript
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ok-editor-mode-v1';
type EditorModeValue = 'wysiwyg' | 'source';

function readPersistedMode(): EditorModeValue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'wysiwyg' || raw === 'source') return raw;
  } catch {
    // swallow — privacy-mode / quota / serialization errors
  }
  return 'wysiwyg';
}

function readInitialMode(): EditorModeValue {
  // FOUC script already validated and set `window.__OK_EDITOR_MODE__`
  // synchronously before React mount; prefer that if present (it's the
  // authoritative first-paint value). Fall back to a fresh localStorage
  // read if the global is missing (SSR / tests / unexpected boot order).
  const preloaded = (window as unknown as { __OK_EDITOR_MODE__?: EditorModeValue }).__OK_EDITOR_MODE__;
  if (preloaded === 'wysiwyg' || preloaded === 'source') return preloaded;
  return readPersistedMode();
}

export function useEditorMode(): [EditorModeValue, (next: EditorModeValue) => void] {
  const [mode, setMode] = useState<EditorModeValue>(readInitialMode);

  // Focus-based re-check (Excalidraw Pattern C). Only auto-apply cross-
  // window preference changes when this window returns to focus — avoids
  // mid-edit caret/selection/IME loss that a live storage-event listener
  // would cause. See §13 R4 for the trade-off analysis.
  useEffect(() => {
    function handleFocus() {
      const next = readPersistedMode();
      setMode((current) => (current === next ? current : next));
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  function persistAndSet(next: EditorModeValue) {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      console.warn('[editor-mode] persist failed', e);
    }
  }

  return [mode, persistAndSet];
}
```

`setMode`'s functional-update form (`(current) => current === next ? current : next`) avoids the React state-set-no-op no-render-schedule fast path being subverted when the values are identical — it short-circuits at the reducer, not via reference-equality alone.

### 7.4 Integration at `EditorPane`

Current code (`EditorPane.tsx:24` at baseline `7e0beff4`):
```typescript
const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
```

Becomes (add `useRef` to existing `useEffect, useRef, useState` imports in `EditorPane.tsx`):
```typescript
import { useEffect, useRef, useState } from 'react';
import { useEditorMode } from '@/editor/use-editor-mode';

// Replace: const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
const [persistedMode, setPersistedMode] = useEditorMode();
const [editorMode, setEditorMode] = useState<EditorMode>(persistedMode);

// Track editorMode in a ref so the cross-window-sync effect below can read it
// without becoming a dependency (avoids a subtle diff-exit bug — see below).
const editorModeRef = useRef(editorMode);
editorModeRef.current = editorMode;
```

Inside `handleModeChange(mode: 'wysiwyg' | 'source')`:
```typescript
function handleModeChange(mode: 'wysiwyg' | 'source') {
  setEditorMode(mode);
  setPersistedMode(mode); // writes to localStorage
}
```

Cross-window sync effect:
```typescript
// When the persisted preference changes (triggered by the hook's focus-based
// re-check picking up a cross-window flip), apply it to the editor — UNLESS
// we're currently in diff mode. In diff mode, defer the application so the
// existing "restore to session pre-diff mode on exit" UX still runs cleanly
// via `modeBeforeDiffRef`.
//
// Dep array deliberately excludes `editorMode`: re-running on every mode
// transition would make diff-exit → restore-to-pre-diff-mode compete with
// this effect's own write, producing a two-step flash (pre-diff-mode briefly
// visible → persisted-mode). Reading `editorMode` via ref inside the effect
// decouples the guard from the dep array.
useEffect(() => {
  if (editorModeRef.current === 'diff') return;
  setEditorMode(persistedMode);
}, [persistedMode]);
```

`modeBeforeDiffRef` (`EditorPane.tsx:39` at baseline `7e0beff4`) continues to capture the session-local pre-diff mode and restore to it on exit. This is distinct from the persisted preference: on diff exit you return to exactly where you were (session UX continuity), not to what some other window may have written to localStorage while you were in diff. If the user wants the cross-window update after diff exit, they can either (a) trust focus-based re-check to pick it up the next time the window regains focus, or (b) explicitly toggle — both paths work.

**Scope-expansion note on diff-mode.** The Agent Constraints §15 `STOP_IF` lists "touch diff-mode behavior" as a halt signal. This spec DOES introduce a diff-aware branch (the `editorModeRef.current === 'diff'` guard) — which is a deliberate narrow extension, not a violation. The STOP_IF is revised in §15 to disambiguate.

### 7.5 Interaction with existing code paths

| Surface | Behavior before | Behavior after |
|---|---|---|
| Header toggle (`EditorHeader.tsx:477`) | `onModeChange(v)` → `setEditorMode(v)` | Same + writes to localStorage via `setPersistedMode(v)` |
| `RAW_MDX_NAV_EVENT` listener (switch to source on fallback-node click) | `setEditorMode('source')` — not persisted | **Unchanged.** The RAW_MDX_NAV event is tool-driven ("the system forced me to source to fix this broken MDX block"), not user-initiated intent to change the global preference. Keeping it session-only is consistent with the diff-exit rule (also session-only). Only the header toggle (user-initiated) persists. |
| Folder entry (`useEffect` on `activeTarget?.kind === 'folder'`) | Exits diff via `setEditorMode(modeBeforeDiffRef.current)` | Unchanged — still uses session ref |
| Handle timeline entry selection | Sets `editorMode: 'diff'`, captures `modeBeforeDiffRef.current = editorMode` | Unchanged |
| Handle exit preview | `setEditorMode(modeBeforeDiffRef.current)` | Unchanged |

### 7.6 No changes required

- `packages/app/src/components/EditorHeader.tsx` — UI toggle unchanged
- `packages/app/src/components/EditorArea.tsx` — mode consumer unchanged
- `packages/app/src/components/EditorActivityPool.tsx` — mode consumer unchanged
- `packages/app/src/components/DocPanel.tsx` — consumer unchanged
- `packages/core` / `packages/server` / `packages/cli` / `packages/desktop` — untouched

---

## 8. Testing strategy

### 8.1 Unit tests (`bun test`)

- **`use-editor-mode.test.ts`:**
  - Initial read returns `'wysiwyg'` when localStorage is empty and `window.__OK_EDITOR_MODE__` is unset.
  - Initial read prefers `window.__OK_EDITOR_MODE__` when set (FOUC-script source of truth).
  - Initial read falls back to `localStorage` when `window.__OK_EDITOR_MODE__` is unset.
  - Initial read falls back to `'wysiwyg'` when localStorage has invalid value.
  - `persistAndSet('source')` updates state AND writes to localStorage.
  - `focus` event triggers re-read from localStorage; state updates when persisted value differs.
  - `focus` event is a no-op when persisted value matches current state (guarded by the functional-update form).
  - `focus` event with invalid localStorage value falls back to `'wysiwyg'`.
  - `localStorage.setItem` throw is swallowed; state still updates; `console.warn` fires with bracket-prefix format.
  - `localStorage.getItem` throw (privacy mode) during focus handler is swallowed; state unchanged.

### 8.2 Integration tests

Not needed — this is pure client-side UI state; no CRDT, no server, no cross-doc interaction. The existing `bridge-matrix` integration suite should continue to pass untouched (scope excludes anything that could affect it).

### 8.3 Playwright E2E (`*.e2e.ts`)

New file: `packages/app/tests/stress/editor-mode-persistence.e2e.ts`

- **T1 (refresh):** Load app, click Markdown toggle, refresh page, assert Source editor visible on first rendered frame (no flash).
- **T2 (new tab):** Open app in page A (one `BrowserContext`), click Markdown, `context.newPage()` for page B to same URL, assert page B opens in Source.
- **T3 (cross-window focus-based sync):** Open same doc in pages A and B (one `BrowserContext`) both in WYSIWYG. Focus page A. Flip Markdown in page A. Bring page B to front via `page.bringToFront()`. Assert page B's editor switches to Source. Without the focus return, page B stays on WYSIWYG — documenting the deliberate focus-gated behavior.
- **T4 (new doc honors pref):** With Source persisted, `POST /api/create-page`, navigate to new doc, assert Source editor on arrival.
- **T5 (diff exit preserves session pre-diff mode, not persisted — with concurrent cross-window flip):** In page A: Source mode, enter diff (modeBeforeDiffRef captures Source). In page B: flip to WYSIWYG (persistedMode becomes WYSIWYG). Return focus to page A. Exit diff in page A. Assert page A returns to **Source** (session pre-diff), not WYSIWYG. This covers the audit-flagged H1 bug scenario.
- **T6 (invalid localStorage value):** Inject `localStorage.setItem('ok-editor-mode-v1', 'bogus')`, load, assert defaults to WYSIWYG with no crash.
- **T7 (rapid toggle robustness):** In a single page, `page.evaluate` a tight loop that writes `localStorage['ok-editor-mode-v1']` with alternating values 100 times in 200ms, then assert the final rendered mode matches the final localStorage value and the editor is still interactive (can type, can toggle via UI). Guards against state-update storms. Focus-based sync means external bursts don't reach live state until next focus — but same-page programmatic writes can still churn if `persistAndSet` is called in a loop.
- **T8 (FOUC — first-rendered frame asserts persisted mode):** Set `localStorage.setItem('ok-editor-mode-v1', 'source')` in a pre-navigation hook, navigate to the editor, use `page.evaluate(() => ({ mode: (window as any).__OK_EDITOR_MODE__, hasSourceDom: !!document.querySelector('.cm-editor'), hasTipTapDom: !!document.querySelector('.tiptap') }))` after the first paint to confirm `__OK_EDITOR_MODE__ === 'source'` was set and the Source DOM subtree is present on first rendered frame. Stronger guarantee than T1 because it asserts on the global set by the inline script.

### 8.4 Manual QA (Electron multi-window)

Not automated because the repo has no `_electron.launch()` Playwright harness at baseline (NFR-4). Run after building: `bun run --cwd packages/desktop build:mac:unsigned`, launch the DMG, open 2 project windows, and verify:

- **MQ1:** In window A, flip to Source. Window B still shows WYSIWYG. Click anywhere in window B's chrome (focus return). Window B now shows Source.
- **MQ2:** In window A, open a doc and type some WYSIWYG content. Ensure focus stays in window A's editor. In window B (without focusing it), flip to Source via keyboard shortcut if available, or via toggle if window B's chrome is accessible without focusing the editor. Confirm window A's caret / text input are NOT disrupted (the focus-based re-check deliberately defers to focus return).
- **MQ3:** Close both windows. Reopen one window for a different project. Verify it opens in the last-persisted mode.

### 8.5 CI tier classification

- Unit tests → **Tier 1** (every PR) via `bun test`
- E2E → **Tier 1** (every PR) via CI's `test:e2e` script. Add the new file to the CI Playwright file list in `packages/app/package.json` per CLAUDE.md's testing-convention guidance.
- Manual Electron QA (§8.4) → Run once per PR touching this spec's code. Not CI-automated.

---

## 9. Rollout

Single PR. No feature flag — the behavior is strictly additive and the worst-case failure (localStorage unavailable) degrades gracefully to current behavior (in-memory state, no persistence).

No migration needed (no schema change; first-time users see the default).

No server deploy coordination — purely frontend bundle change.

---

## 10. Decision Log

All decisions carried through intake + research + open-question resolution. All LOCKED.

| # | Decision | Status | Rationale / evidence |
|---|---|---|---|
| D1 | Global user preference only — no per-doc or per-project override in v1 | LOCKED | Research D7: per-doc override is 5-year-open feature request in Obsidian with community-plugin solution; deferred cleanly to Future Work. Matches user intake recommendation. |
| D2 | Two states only: `wysiwyg` / `source`. No `auto`/`system` tier. | LOCKED | next-themes ships a `system` tier because `prefers-color-scheme` (an OS-level signal) exists. There is no analogous OS-level "editor mode" signal — so `system` for editor mode would collapse to "a hardcoded default with a fancier name" and buy nothing. Two states it is. |
| D3 | No URL `?mode=` override in v1 — Future Work | LOCKED | Research D5: HedgeDoc is the lone precedent; composing URL-override + sticky-pref is novel with its own design burden. Defer until share-link UX becomes a real need. |
| D4 | New docs honor persisted pref — no new-doc special case | LOCKED | Silent override of user preference is the exact friction this spec fixes. |
| D5 | Store in `localStorage` with versioned key `ok-editor-mode-v1` | LOCKED | Research D6: localStorage is Chromium-shared across same-origin BrowserWindows in Electron automatically. The repo has TWO established storage tiers for distinct concerns: (a) **project config** (`.open-knowledge/config.yml` — `content.dir`, `content.include`, MCP server list) and (b) **user UX preferences** (localStorage — `ok-theme-v1`, `ok-pin-v1`). Editor mode is a UX preference, not a project config, so it fits tier (b) cleanly alongside theme and pin. A per-project editor-mode default (e.g., "this code-heavy project defaults to Source") would be a config-tier concern and is correctly classified as Future Work. electron-store upgrade is Future Work if preferences grow structurally. |
| D6 | FOUC prevention via inline `<script>` in `packages/app/index.html` — no new library | LOCKED | Research D4: next-themes' inline-script pattern is the canonical approach. Hand-rolled for one key = 10 lines; no library needed. Adds zero bundle weight vs. importing next-themes-equivalent. |
| D7 | Cross-window sync via `focus` event re-check (Excalidraw Pattern C). Live `storage` event auto-apply rejected on audit/challenge review. | LOCKED | Initial recommendation was next-themes Pattern A (live `storage` event auto-apply). Audit + challenge review surfaced that "flipping a CSS class is content-safe" was narrow: the mode-swap CSS class (`.ok-mode-hidden` on `EditorActivityPool.tsx:561` / `:570` — at ship-time baseline `7e0beff4`) preserves DOM presence via `content-visibility:hidden + position:absolute + pointer-events:none`, but still interrupts IME composition and orphans in-flight drag-selection on swap. (Before PR #237, the swap used Tailwind `hidden` / `display:none` which additionally destroyed DOM focus; the new CSS is strictly less disruptive but still interaction-breaking for IME / drag-select.) Neither `SourceEditor` nor `TiptapEditor` has a `.focus()` restore call on mode flip. For a large-state editor surface, the Excalidraw team deliberately chose focus-based lazy re-check for exactly this class of concern (research D8 evidence + Issue #2791 + PR #4545). We adopt the same pattern. Cost: cross-window updates are eventually-consistent on the unfocused window, not live — user returns to window B and the mode flip is picked up at that moment. Benefit: no mid-edit IME/selection interruption. The cost is invisible to the user (they're not looking at the unfocused window anyway); the benefit is critical when they are. |
| D8 | Every toggle writes to localStorage immediately — no session-vs-persisted distinction | LOCKED | Matches next-themes, matches `ok-pin-v1`, avoids hidden state confusion. Toggle = commit. |

---

## 11. Open Questions

None. All P0 items resolved.

*Future Work items are tracked in §5.2 Scope, not here.*

---

## 12. Assumptions

| ID | Assumption | Confidence | Verification |
|---|---|---|---|
| A1 | **Until future work introduces session partitioning**, every Open Knowledge Electron BrowserWindow loads the same origin → localStorage is shared cross-window as designed. If partitioning lands later (e.g., per-user Navigator profiles, per-workspace sessions via `session.fromPartition`), persistence becomes per-partition — which ALIGNS with the partition's scope semantics (each user/profile gets their own preference). This is a FEATURE, not a regression to mitigate. | HIGH (current baseline) + ROBUST-BY-DESIGN (future partitioning) | Verified by reading `packages/desktop/src/main/window-manager.ts` and `navigator-window.ts` at baseline `c29a5a14` — no `session.fromPartition` usage. If partitioning is ever introduced, the data shape (single scalar in localStorage) composes trivially with per-partition storage. No design churn required. |
| A2 | localStorage quota is sufficient (needs < 100 B) | HIGH | Chromium's 5 MB/origin limit; we use ~30 B. Never an issue. |
| A3 | The `focus` event on `window` fires reliably when an Electron BrowserWindow regains focus (click on its chrome, alt-tab, cross-window click) | HIGH | DOM-standard behavior. Electron's BrowserWindow is a Chromium window; focus/blur firing is spec-standard. No dependency on `storage` event cross-BrowserWindow dispatch (which would be the analog assumption for the rejected Pattern A). Covered by Playwright's `page.focus()` / `page.bringToFront()` primitives in the E2E harness. |
| A4 | The existing `EditorMode` enum (`wysiwyg`/`source`/`diff`) is stable | HIGH | Locked by TQ8 (precedent #6 "mode state as enums") per CLAUDE.md; `diff` is ephemeral by design. |

---

## 13. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Cross-window focus-based sync fires during an active `diff` mode view, overriding the session pre-diff mode restore | LOW | MEDIUM | Mitigated in §7.4 — the `useEffect` guard reads `editorModeRef.current === 'diff'` via ref (not via dep array), so diff exit cannot trigger a spurious re-apply. E2E T5 covers the exact race: diff entry, concurrent cross-window flip, diff exit, assert session pre-diff mode wins. |
| R2 | Inline FOUC script error blocks page load | LOW | HIGH | Mitigated by try/catch in the inline script (§7.2). Worst case: `window.__OK_EDITOR_MODE__` stays `'wysiwyg'` (default) → hook reads default. E2E T6 covers invalid localStorage values. |
| R3 | User's privacy mode / incognito throws on `localStorage.setItem` | MEDIUM | LOW | Gracefully degrades to in-memory-only (FR-7). Documented `console.warn` with bracket-prefix format; no user-visible error. Unit test covers the throw path. |
| R4 | Cross-window flip interrupts in-flight editing state (caret, IME, drag-select) | **CLOSED** by design choice D7 | N/A | Focus-based re-check (D7) defers the mode apply until the user actively returns to the window. The user cannot be "mid-typing in window B" at the moment of application because B only applies on focus return — by which point B is the user's attention target. The failure mode that made this a MEDIUM risk under Pattern A does not exist under Pattern C. |
| R5 | Future Electron partitioning (e.g., Navigator per-user profiles via `session.fromPartition`) breaks origin-sharing for localStorage | LOW | **N/A — by design this becomes a feature** | Per A1's graceful-degradation framing: if partitioning lands, each partition tracks its own preference, which aligns with the partition's scope (different user = different preference). No code change required; the data shape (single scalar in localStorage) composes with per-partition storage trivially. The "`electron-store` upgrade required" concern in earlier drafts is not accurate — it assumed we wanted one-preference-across-all-partitions, which is not the right semantic when partitions exist. |
| R6 | localStorage key collision with a future preference key | LOW | LOW | Key is versioned (`-v1`) and namespaced (`ok-editor-mode-v1`). Future prefs use different key names (e.g., `ok-outline-width-v1`). |
| R7 | Programmatic `localStorage.setItem` bursts from a misbehaving browser extension cause state churn | LOW | LOW | Focus-based re-check insulates the renderer from `storage` event storms (we don't listen on `storage`). Same-page programmatic writes to `persistAndSet` within React are batched via React 19 auto-batching. E2E T7 (rapid toggle robustness) verifies interactive recovery. |

---

## 14. Observability

- **Console warn on localStorage failure.** Bracket-prefix format per CLAUDE.md logging conventions: `console.warn('[editor-mode] persist failed', err)`. Consumed by dev-server output; no structured event emission needed.
- **No telemetry added.** No repo precedent for UI-preference telemetry. Matches `ok-theme-v1` / `ok-pin-v1` patterns.
- **No metrics endpoint changes.** Purely client-side.

---

## 15. Agent Constraints

**SCOPE** (files implementation may touch):
- `packages/app/index.html` — add inline FOUC script in `<head>`
- `packages/app/src/components/EditorPane.tsx` — integrate `useEditorMode`
- `packages/app/src/editor/use-editor-mode.ts` — NEW file (hook)
- `packages/app/src/editor/use-editor-mode.test.ts` — NEW file (unit tests)
- `packages/app/tests/stress/editor-mode-persistence.e2e.ts` — NEW file (E2E)
- `packages/app/package.json` — add new E2E file to `test:e2e` file list (per CLAUDE.md Playwright CI convention)

**EXCLUDE** (do NOT touch):
- `packages/core/**` — editor schema, markdown pipeline, extensions
- `packages/server/**` — CRDT, observers, persistence, API
- `packages/cli/**` — CLI commands, MCP
- `packages/desktop/**` — Electron main, preload, window-manager
- `docs/**` — docs site
- `packages/app/src/editor/observers.ts` or `SourceEditor.tsx` or `TiptapEditor.tsx` — editor internals unchanged
- `packages/app/src/components/EditorHeader.tsx` — toggle UI unchanged
- `packages/app/src/components/EditorArea.tsx` / `EditorActivityPool.tsx` — mode consumers unchanged (props wire through identically)
- Any file under `reports/` or `specs/` — artifacts only

**STOP_IF** (halt and surface to reviewer before proceeding):
- Implementation requires a new React Context or provider component (the hook should be used directly in `EditorPane`; if a Context is tempting, that's a sign of scope creep).
- Implementation needs to change the `EditorMode` type or enum.
- Implementation needs to change **the `modeBeforeDiffRef` capture/restore rule** (the existing session-local rule). The narrow diff-aware branch in §7.4's `useEffect` (a single `editorModeRef.current === 'diff'` guard) is a deliberate, spec-scoped extension — not a restriction violation. Anything beyond that single guard IS a restriction violation.
- Implementation needs to add a new npm dependency.
- Implementation needs to add per-doc or per-project override plumbing.
- Implementation needs to touch CRDT layer or observer code.
- Implementation discovers `session.fromPartition` usage in window-manager (per A1, this triggers a re-read of the graceful-degradation framing — no code change required but verify the per-partition semantic is the intended product behavior).
- **Renaming the storage key** away from `ok-editor-mode-v1` (1-way door — existing users' localStorage entries become orphaned; no migration path is designed).

**ASK_FIRST** (confirm before proceeding):
- Introducing a new Context/Provider component for this (scope creep signal).
- Any changes to `index.html` beyond the single inline `<script>` block.
- Extending the hook's return shape (e.g., adding `reset()` or `clear()` — not required by any AC).

---

## 16. Appendix

### 16.1 Design alternatives considered (rejected)

- **Storing in electron-store instead of localStorage.** Rejected — introduces main↔renderer IPC, breaks web distribution, and requires preload plumbing for FOUC-free first paint. Research D6 shows electron-store is overkill for a single renderer-visible preference.
- **BroadcastChannel instead of `focus` event for cross-window sync.** Rejected — tldraw's use case (structured diff messages, per-workspace channels) doesn't apply. We have one boolean-equivalent preference; focus-based re-check with a `localStorage.getItem` on focus return is simpler and doesn't interrupt mid-edit interaction.
- **Live `storage` event auto-apply (next-themes Pattern A).** **Initially recommended, rejected on audit/challenge review.** The framing "flipping a CSS class is content-safe" was narrow — the mode-swap CSS class `.ok-mode-hidden` (on `EditorActivityPool.tsx:561`/`:570` at ship-time baseline) interrupts IME composition and drag-selection gestures even though DOM focus is preserved by `content-visibility:hidden`. Pattern A works for theme (whose mid-edit cost is zero) but not for a large-state editor. Focus-based re-check (Excalidraw Pattern C) is the correct fit for this surface. See D7.
- **React Context for the hook.** Rejected per ASK_FIRST — consumer count is 1 (`EditorPane`). Context adds indirection without buying anything.
- **New-doc-opens-in-WYSIWYG special case** (Option c from intake Q4). Rejected per D4 — violates "user pref sticks everywhere."
- **`auto`/`system` third mode.** Rejected per D2 — no OS-level signal analog for editor mode (unlike `prefers-color-scheme` for theme).
- **`config.yml` hybrid (localStorage cache + YAML source of truth).** Considered during challenge review. Rejected per D5 — editor mode fits the UX-preference tier (localStorage, alongside theme + pin), not the project-config tier (YAML, alongside `content.dir`). Conflating the two tiers would set a confusing precedent that future UX prefs would have to follow or diverge from. Per-project editor-mode default is a legitimate Future Work item if customer evidence motivates it — it would then belong in the project-config tier alongside `content.dir`.

### 16.2 Related PRs / baseline code references

- `packages/app/src/components/EditorPane.tsx:21` — `EditorMode` type definition (TQ8 — precedent #6)
- `packages/app/src/components/EditorPane.tsx:24` — current `useState<EditorMode>('wysiwyg')` to replace
- `packages/app/src/components/EditorPane.tsx:39` — `modeBeforeDiffRef` (session ref, preserved)
- `packages/app/src/components/EditorPane.tsx:112` — `handleModeChange` (integration point)
- `packages/app/src/main.tsx:70` — `ok-theme-v1` precedent (next-themes)
- `packages/app/src/editor/DocumentContext.tsx:117` — `ok-pin-v1` precedent (versioned localStorage key)
- `packages/app/src/components/EditorActivityPool.tsx:561/:570` — current mode-swap CSS class (`.ok-mode-hidden`)
- `packages/app/src/globals.css:1341` — `.ok-mode-hidden` CSS class (content-visibility:hidden pattern)
- `packages/app/src/components/ThemeToggle.tsx` — existing next-themes toggle UX (for visual parity reference)
- `packages/app/index.html` — target for FOUC inline script
