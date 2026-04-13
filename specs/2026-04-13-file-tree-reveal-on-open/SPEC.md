# File-Tree Reveal on Open — Spec

**Status:** Approved
**Owner(s):** Andrew
**Last updated:** 2026-04-13
**Baseline commit:** 496a06d
**Links:**
- Evidence: `./evidence/`
- Related PR: #76 (Graph view) — the navigation surface that made this gap acute

---

## 1) Problem statement

**Situation:** The file sidebar is a hierarchical, lazily-collapsed tree built from a flat `/api/documents` list, with each folder node owning its own `collapsed` state. Six navigation entry points write `window.location.hash = #/<docName>`:

| Entry point | Location |
|---|---|
| Sidebar file click | `FileSidebar.tsx:418` |
| Post-rename redirect | `FileSidebar.tsx:320` |
| Graph node click | `GraphView.tsx:243` |
| Backlinks panel click | `BacklinksPanel.tsx:93` |
| Wiki-link click (WYSIWYG) | `WikiLinkView.tsx:251/255/258` |
| Post-create wiki-link navigation | `WikiLinkView.tsx:266` |
| Direct URL / browser nav | hashchange listener in `App.tsx:29-39` |

(`FileSidebar.tsx:362` also writes `window.location.hash = ''` on post-delete clear — not a navigation to a doc; listed in `evidence/navigation-flow.md` for completeness.)

All converge through one hash-change listener in `App.tsx`, which calls `openDocument()` → `ProviderPool.setActive()` → `activeDocName` updates in `DocumentContext`, re-rendering the sidebar with a new `selectedPath`.

**Complication:** `FileTreeNode` initializes its `collapsed` state via `useState(() => ...)` (FileSidebar.tsx:79–82), keyed off `selectedPath` only at mount time. When `activeDocName` changes after mount — which is every navigation that doesn't originate from clicking that specific sidebar row — the `collapsed` state does not re-sync. Result: the active row gets `isActive` styling it has (invisibly) while its ancestor folders remain collapsed, hiding it. The new graph view (PR #76) makes this visible because it's the first first-class navigation surface that bypasses the sidebar entirely; deep-linked URLs have the same bug but users have lived with it. Every future entry point (wiki-link click-through, search, command-K) inherits the same orientation failure unless the sidebar's expansion model is fixed at its source.

**Resolution:** Make folder expansion a derived function of `activeDocName`, not a mount-time init. When `activeDocName` changes, expand all ancestor folders of the active doc and scroll the active row into view if it's off-screen. One centralized reveal effect at the `FileSidebar` level; per-node `collapsed` state merges user intent (manual toggles) with derived intent (ancestors-of-active).

## 2) Goals

- **G1:** Every navigation entry point produces a sidebar state where the active doc's row is visible (ancestors expanded) and on-screen (scrolled into view if needed).
- **G2:** No regression in existing manual expand/collapse interactions — clicking a folder still toggles it.
- **G3:** Fix is one coherent primitive, not per-entry-point patches.

## 3) Non-goals

- **[NOT NOW]** NG1: Persisting collapse state across sessions. Session-only is sufficient for reveal-on-activate. Revisit if: users complain that re-opening the app re-collapses their preferred layout.
- **[NOT NOW]** NG2: Expanding alias entries when the canonical is activated (symlinks like CLAUDE.md ↔ AGENTS.md). Only the canonical path expands. Revisit if: aliases become load-bearing for navigation, not just display.
- **[NEVER]** NG3: Redesigning the sidebar (virtualized tree, search-inside-sidebar, breadcrumbs). Out of scope; this is a behavioral fix, not a redesign.

## 4) Personas / consumers

- **P1: Doc-editing user** (primary) — opens a file from graph, from a URL, or from a wikilink in another doc. Needs to know where the new file lives in the tree.
- **P2: Power user** — curates the sidebar by collapsing noisy folders. Their mental model is "the sidebar shows my workspace."
- **P3: Agent-driven workflows** (secondary) — programmatic navigation via hash writes. Not visually consuming the sidebar, but the fix must not destabilize it for human users who observe agent-initiated activations.

## 5) User journeys

### P1 happy path (graph → reveal)
1. User opens the graph panel and clicks a node.
2. URL hash changes to `#/<docName>`.
3. Editor loads the doc.
4. Sidebar expands ancestor folders; active row becomes visible and scrolls into view if it wasn't already.
5. User sees spatial context immediately.

### P1 happy path (direct URL)
1. User pastes a URL like `http://localhost:5173/#/reports/foo/REPORT`.
2. On first render, sidebar loads documents, then reveals the active row.

### P1 failure / recovery
- Active doc exists in `ProviderPool` but not yet in `/api/documents` response (5s poll lag). Reveal effect waits for the doc to appear in the tree; no error shown.
- Active doc never appears (invalid docName). Sidebar remains in its prior state; no reveal attempted.

### P2 happy path (manual collapse)
1. User clicks a folder to collapse it. Chevron rotates, children hide.
2. Later, user opens a file inside that folder via graph/URL.
3. **Per D1 (1A): ancestors re-expand.** The user's prior collapse is overridden by the activation. The active doc must be visible.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Sidebar tree | Spinner text | "No files yet." | Error banner; stale tree shown if available | Tree rendered | Doc present but active doc not yet in list — reveal deferred |
| Reveal-on-activate | Before first `/api/documents` response: no-op | Active doc has no ancestors (top-level): scroll only | Active doc not in list: no-op | Ancestors expanded + row scrolled | Ancestors expanded but row rendered below fold: scroll-into-view triggers |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | On `activeDocName` change, all ancestor folders of the active doc's path are expanded. | Playwright: open `#/a/b/c.md` with sidebar collapsed → `a` and `a/b` folders show `aria-expanded="true"`; `c.md` row has `data-active`/`isActive` styling. | Entry-point agnostic. |
| Must | Active row is scrolled into view if it is off-screen; no scroll if already visible. | `element.scrollIntoView({ block: 'nearest' })` called on every activation; `'nearest'` is a native no-op when fully in view. | Per D2, D7. Plain scroll — no `behavior` override (matches sibling components; honors `prefers-reduced-motion` implicitly by not introducing animation). |
| Must | Active file row has `aria-current="page"`. Only the active row carries this attribute at any time. | DOM inspection: exactly one element with `aria-current="page"` in the sidebar; it matches `activeDocName`. | Per D9. |
| Must | Sidebar tree uses roving tabindex: the active row is `tabIndex={0}` (tab stop); all other rows are `tabIndex={-1}`. Activation does not steal focus. | Tab into sidebar → focus lands on active row. Navigating via graph/URL does not move focus from the editor. | Per D9. |
| Must | Reveal fires for every entry point that changes `activeDocName`. | Unit test enumerates: sidebar click, graph click, post-rename, backlinks click, wikilink click, direct URL load, hashchange. | Hooks off `activeDocName`, not per-entry-point. |
| Must | Manual folder toggles still work; user can collapse any folder. | Click chevron/row on folder → collapses; click again → expands. Independent of active doc. | Per D1 (1A): activation overrides prior manual collapse once, but subsequent manual toggle is honored until next activation. |
| Must | Reveal does not fire on initial mount for `activeDocName=null` (no doc open). | No scroll, no expansion. | |
| Should | Symlink aliases are not auto-expanded when canonical is activated. | If `CLAUDE.md` (alias) and `AGENTS.md` (canonical) both exist, activating `AGENTS.md` expands `AGENTS.md`'s ancestors only. | Per D3. |
| Should | Reveal tolerates `/api/documents` race: ancestor paths are derived from the docName string on every render; when the tree catches up, folders render expanded because the derivation runs against the fresh tree. | Open `#/a/b/new-doc` before `new-doc` appears in `/api/documents` → derivation contains `a` and `a/b`; on next poll the doc appears and renders inside already-expanded folders. | Per D4 (derive), D6 (scroll deps). |
| Should | Stale user-toggle entries are filtered on render: folders that no longer exist in the tree are removed from `userExpanded`/`userCollapsed` derivation scope. | After deleting folder `a/b`, then recreating `a/b` later, the new `a/b` renders collapsed (not pre-expanded from prior user intent). | Render-time intersection with current folder paths. |

### Non-functional requirements

- **Performance:** Ancestor derivation runs in O(depth) on every render. Render-time intersection of `userExpanded`/`userCollapsed` with folder paths is O(folders), bounded by existing `buildTree` cost. No visible jank.
- **Reliability:** Derived, not stored. Expansion is a function of `(activeDocName, userExpanded, userCollapsed, current tree)` at render time. No state-desync paths.
- **Accessibility:** Respects `prefers-reduced-motion` implicitly (no animated scroll introduced). Active row has `aria-current="page"`. Roving tabindex — no focus theft on activation.
- **Security/privacy:** N/A — client-only UI.
- **Operability:** No telemetry needed for v1. If users report reveal misbehaving, log the active doc + tree structure via existing console diagnostics.
- **Cost:** Near zero — pure rendering, no network.

## 7) Success metrics & instrumentation

- **Qualitative check (manual QA):** Open a doc via graph, URL, and wikilink. Sidebar reveals in all three.
- **Regression check:** Existing sidebar interactions (click-to-toggle, rename, delete) still work.
- No new instrumentation proposed for v1.

## 8) Current state

### Summary of current behavior
- Navigation writes `window.location.hash`.
- `App.tsx` hashchange listener calls `openDocument(docName)` → `ProviderPool.setActive()` → `DocumentContext.activeDocName` updates → components re-render.
- `FileSidebar` receives new `activeDocName` and passes it as `selectedPath` to the root `FileTreeNode` children.
- Each `FileTreeNode` checks `selectedPath` **only in its initial `useState`** to decide whether to start collapsed. Subsequent `selectedPath` changes have no effect on `collapsed`.
- The `isActive` check (`node.path === selectedPath`) is reactive — the styling updates correctly; it's the expansion that doesn't.

### Key constraints
- Tree is re-built on every render from the `documents` list (buildTree in `file-tree-utils.ts`). TreeNode identity is not stable across renders.
- `FileTreeNode` is recursive; collapsed state is per-node and does not cross-node communicate.
- No router library — hash-based routing, one listener.
- The `documents` fetch polls every 5 seconds; tree can lag briefly behind disk reality.

### Known gaps (discovered during scaffold)
- Active doc activated before its entry appears in `documents` list → ancestor derivation is string-based, so paths are computed regardless. Folders render expanded the moment the tree catches up on next poll. No retry needed.
- `FileTreeNode` unmounts when a folder collapses its subtree, so per-node state does not survive collapse cycles. The chosen pattern (derive expansion from props, not local state) side-steps this entirely.

## 9) Proposed solution (vertical slice)

### User experience / surfaces
- Sidebar: unchanged visually except ancestors auto-expand and active row auto-scrolls on activation.
- No new UI controls, no new icons, no new menu items.
- No new routes.

### System design

**Single change surface:** `packages/app/src/components/FileSidebar.tsx`. No server, API, schema, or other component touched. (Ref plumbing into `FileTreeNode` for the active-row scroll target, plus `aria-current` and `tabIndex` attribute threading.)

**Approach: derive expansion on render; store only user-toggle intent (D4 refined).**

```
FileSidebar state:
  userExpanded: Set<string>   // folders user explicitly expanded (beyond ancestors)
  userCollapsed: Set<string>  // folders user explicitly collapsed since last activation

On activeDocName change:
  - Clear userCollapsed (per D1: activation overrides prior collapses)
  - userExpanded persists (expanding a non-ancestor folder is durable user intent)
  - Scroll effect fires: activeRowRef.current?.scrollIntoView({ block: 'nearest' })

On every render:
  ancestors = splitPath(activeDocName).slice(0, -1)      // O(depth)
  folderPaths = collectFolderPaths(tree)                 // O(folders), already computed by buildTree
  expandedPaths =
    (new Set(ancestors) ∪ userExpanded) \ userCollapsed
    intersected with folderPaths                         // prunes stale entries

FileTreeNode reads expandedPaths.has(node.path) as a prop; no local state.
Toggle handler: if path ∈ ancestors, add to userCollapsed; else toggle membership in userExpanded.
```

Per D1 (always reveal), `ancestors` is always in the base set; `userCollapsed` is cleared on every activation, so a prior collapse does not carry over.

Per D2 + D7 (scroll only when off-screen; no smooth override), `scrollIntoView({ block: 'nearest' })` is a native no-op when in view and does not introduce animation — aligns with sibling components (`WikiLinkSuggestionMenu.tsx:51`, `SlashCommandMenu.tsx:35`) and honors `prefers-reduced-motion` implicitly.

Per D3 (canonical only), ancestors are derived from `activeDocName` without consulting `aliasMap`.

Per D9 (focus policy), the active row has `aria-current="page"` and `tabIndex={0}`; all other rows are `tabIndex={-1}`. Activation does not call `.focus()` — focus stays where the user's interaction originated (editor, graph, URL bar).

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `/` (app shell) | Sidebar + Editor + Graph | All three surfaces remain stable; activation reveals in sidebar |
| `/#/<docName>` | Deep link | First render reveals active doc |

### Data flow diagram

- **Primary flow:** hashchange → openDocument → activeDocName updates → FileSidebar re-renders → ancestors derived from new activeDocName (string split) → expandedPaths computed reactively → children render with new expansion → `useEffect` fires `scrollIntoView` on activeRowRef.
- **Shadow paths:**
  - **nil / missing:** `activeDocName=null` → no ancestors, no scroll.
  - **empty:** `documents=[]` → tree is empty; no rows to expand or scroll to. The derivation still runs with empty folder set.
  - **wrong type:** activeDocName for a doc not in tree yet → ancestors are derived from string split regardless; folders render expanded when they appear. Scroll effect has no target until the row exists; `activeRowRef.current` is null and scroll is skipped. On next render (after poll fills tree), ref populates but the scroll effect won't re-fire because `activeDocName` is unchanged — accepted trade-off (active row appears on screen or not depending on prior scroll position; manual scroll fixes it).
  - **timeout:** `/api/documents` fails → sidebar shows error; no tree to expand.
  - **conflict:** User manually collapses an ancestor while active → path is added to `userCollapsed`. The next render shows the folder collapsed. On next activation, `userCollapsed` clears and the ancestor re-expands.
  - **partial failure:** Active doc's parent folder missing from tree (tree out of sync with docName) → ancestor string is computed but the folder's DOM node doesn't exist. Stale `userExpanded`/`userCollapsed` entries for missing paths are filtered by the render-time intersection with `folderPaths`.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Ancestor derivation | activeDocName not yet in tree | No detection needed — string-based derivation doesn't depend on the tree | Folders render expanded on next tree update; no effect re-fire needed | Small delay (<5s) until doc is visible in tree |
| scrollIntoView | Active row not in DOM (race with tree update) | `activeRowRef.current` is null | Skip; user manually scrolls if needed | Active row may be off-screen when doc first appears after a poll-delayed race; rare |
| Manual toggle during activation | User clicks chevron same tick as activation | Both update state; React batches | `userCollapsed` clear (activation) and add-to-userCollapsed (toggle) serialize via React state updater queue — net result: just-activated ancestors are expanded, then user's explicit collapse takes effect | User sees their toggle honored |
| Transitive ancestor rename while active | Folder `a` renamed to `a'` while `a/b/c.md` is active | `handleRename` writes new hash `#/a'/b/c.md` → activeDocName changes → re-derive | Reveal fires for new ancestors `a'`, `a'/b` | Seamless if rename writes the new hash (which it does, line 320) |
| Stale user-toggle entries | User expanded `foo/bar`; `foo/bar` later deleted; folder `foo/bar` recreated | Render-time intersection with `folderPaths` filters `userExpanded`/`userCollapsed` entries that don't match current folders | No-op on stale entries; recreated folder renders collapsed (default) | None |

### Alternatives considered

- **Option A: Fix per-entry-point (make graph/URL/wikilink each expand their targets).** Rejected: doesn't scale; next entry point re-introduces the bug. Doesn't address initial URL load via hashchange listener.
- **Option B: Keep per-node state, sync via `useEffect(() => setCollapsed(...), [selectedPath])` inside each FileTreeNode.** Rejected: per-node coordination is fragile (collapsed folders unmount their children), and the "manual collapse" override semantics become tangled. Lifting up is cleaner.
- **Option C: Lift `expandedPaths: Set<string>` to `FileSidebar`; union ancestors via `useEffect` + `setState` on activation.** Explored then refined — leaves stale entries across rename/delete, and the scroll effect can race ahead of the `setExpandedPaths` re-render (fires before children exist in DOM).
- **Option D (chosen): Derive expansion on every render.** Store only `userExpanded`/`userCollapsed` intent; compute `expandedPaths = (ancestors(activeDocName) ∪ userExpanded) \ userCollapsed`, intersected with the current folder set. No `useEffect` for expansion; expansion is synchronous with render. Scroll effect on `[activeDocName]` runs after the same render in which children are already mounted. Dissolves stale-entries class of bugs. Aligns with React Compiler convention (avoid unnecessary memoization / state).

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | On every `activeDocName` change, always expand ancestor folders (option 1A). | Product | LOCKED | No | Hiding the active file is an incoherent sidebar state. "Reveal the active doc" is the whole point. | User confirmation 2026-04-13 | Manual collapses are ephemeral relative to activations; subsequent manual toggles are respected until next activation. |
| D2 | Use `scrollIntoView({ block: 'nearest' })` semantics — scroll only when off-screen (option 2B). | Product | LOCKED | No | No-op when visible; minimal motion; one-line call. | User confirmation 2026-04-13 | No explicit IntersectionObserver needed; `'nearest'` is native no-op-when-visible. |
| D3 | Do not auto-expand alias/symlink entries; canonical path only. | Product | LOCKED | No | Aliases are display affordances. Opening canonical shouldn't reveal unrelated alias rows. | User confirmation 2026-04-13 | Alias-reveal deferred to Future Work. |
| D4 | Derive expansion on every render from `(ancestors(activeDocName) ∪ userExpanded) \ userCollapsed`, intersected with current folder paths. Store only user-toggle intent. (Refined from lifted-Set approach.) | Technical | DIRECTED | No | Purely derived state eliminates stale-entries bugs across rename/delete and removes `useLayoutEffect`-scroll-before-children races (expansion is synchronous with render). Aligns with React Compiler convention (avoid unnecessary memoization and `setState` round-trips). Implementer owns exact shape. | `evidence/sidebar-collapse-state.md` (updated), design-challenge Findings H2 + L7 | Refactor contained to `FileSidebar.tsx`. `userCollapsed` clears on every activation (implements D1). |
| D5 | Reveal effect fires on `activeDocName` change, not per-entry-point. | Technical | LOCKED | No | Entry-point-agnostic per G3. All entry points funnel through activeDocName already. | `evidence/navigation-flow.md` | Adding new entry points requires no sidebar change. |
| D6 | `useEffect` for `scrollIntoView` is keyed on `[activeDocName]` only. No tree-state in deps. | Technical | LOCKED | No | With D4's derive-don't-store, there is no `useEffect` for ancestor union. The only `useEffect` that remains is the scroll trigger. Keying it on `[activeDocName]` alone prevents re-scrolling on unrelated state changes (5s poll, `userExpanded` toggle, rename/delete of other docs) — all of which would be disruptive. Transitive ancestor rename is covered because `handleRename` writes a new hash (line 320), which updates `activeDocName` and naturally re-fires the scroll. | `evidence/sidebar-collapse-state.md`, `ux-interactions.e2e.ts:184-211`, design-challenge M4 | Scroll deps: `[activeDocName]`. |
| D7 | `scrollIntoView` is called without a `behavior` option (default: `'auto'`/instant). | Product | LOCKED | No | Matches sibling components (`WikiLinkSuggestionMenu.tsx:51`, `SlashCommandMenu.tsx:35`). Honors `prefers-reduced-motion` implicitly by not introducing animation. Removes the need for a first-mount-vs-subsequent ref. Simpler code, aligned with repo convention. | User confirmation 2026-04-13 on R1b (simplify), design-challenge M3, `globals.css:191,602,644` | Supersedes earlier instant-vs-smooth split. |
| D8 | Do not auto-open a visually-collapsed sidebar on activation. Reveal derivation runs regardless; user sees the result on next open. | Product | LOCKED | No | A hidden sidebar is a strong signal the user doesn't want spatial context. Auto-opening would be invasive. | User confirmation 2026-04-13 | No sidebar-visibility coupling. |
| D9 | Accessibility: active row has `aria-current="page"`; roving tabindex (active row `tabIndex={0}`, others `tabIndex={-1}`); activation does not move focus. Rely on `aria-expanded` transitions for screen-reader announcement of newly-revealed ancestors (no extra `aria-live` region). | Product | LOCKED | No | Don't steal focus: activations come from other widgets the user is intentionally interacting with. `aria-current="page"` is the standard pattern for "current item in a navigation set." Roving tabindex is the WAI-ARIA tree pattern. SRs already announce `aria-expanded` changes; a dedicated `aria-live` region adds verbosity without new information. | User confirmation 2026-04-13 on R1a (A), R1c (B); design-challenge H1 | New requirements in §6; new acceptance criteria. |

## 11) Open questions

(none remaining for In Scope items as of scaffold)

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `scrollIntoView({ block: 'nearest' })` is reliably a no-op when element is in-view in all supported browsers (Chrome, Safari, Firefox). | HIGH | Spec-confirmed behavior per CSSOM View spec §nearest-scroll. Manual Playwright probe before final merge. | Implementation time | Active |
| A2 | `documents` poll (`setInterval` 5s) is the only tree-updating path; no WebSocket push of file list. | HIGH | Code grep confirms `/api/documents` is fetched in `FileSidebar` only. | Implementation time | Active |
| A3 | Manual folder toggles happen far less often than activations in practice; the "activation overrides manual" policy won't feel invasive, especially considering the rapid back-and-forth graph-navigation pattern. Escape valve: D8 (collapse sidebar entirely). | MEDIUM | Observe during dogfooding. If rapid back-and-forth fights the user, consider per-session memory or a collapse-while-navigating mode. | 2 weeks post-merge | Active |
| A4 | Render-time intersection of `userExpanded`/`userCollapsed` with `folderPaths` is fast enough that it doesn't regress render perf for typical project sizes (hundreds of folders). | HIGH | Intersection is O(|userToggleSet|) each render; the toggle sets grow only with user clicks since last activation, typically <10. | Implementation time | Active |

## 13) In Scope (implement now)

- **Goal:** Sidebar reveals the active doc's ancestors + scrolls into view on every activeDocName change.
- **Non-goals:** Alias-aware reveal; persistent collapse state; sidebar redesign.
- **Requirements with acceptance criteria:** See §6.
- **Proposed solution:** See §9.
- **Owner(s)/DRI:** Andrew.
- **Next actions:**
  - Refactor `FileSidebar.tsx` to implement D4 derive-don't-store pattern.
  - Add `userExpanded`/`userCollapsed` state (Sets); `userCollapsed` clears on every `activeDocName` change.
  - Derive `expandedPaths` reactively on render (ancestors ∪ userExpanded \ userCollapsed, intersected with folderPaths).
  - Wire `useEffect(() => activeRowRef.current?.scrollIntoView({ block: 'nearest' }), [activeDocName])` — no `behavior` option (per D7).
  - Set `aria-current="page"` on the active row; implement roving tabindex (per D9).
  - Thread `activeRowRef` through `FileTreeNode` as a prop; only the active row captures the ref.
  - Add unit tests for ancestor derivation, intersection filter, and D1 "userCollapsed clears on activation" behavior.
  - Add Playwright test for graph-click → reveal + URL-load → reveal + tab-focus lands on active row.
- **Risks + mitigations:** See §14.
- **What gets instrumented/measured:** Nothing new for v1.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Behavioral change to sidebar | No flag; direct merge. Reversible via git revert. | Playwright green; manual smoke test across all 6 entry points. |
| Unintended re-renders | React Compiler handles memoization per repo convention. | React DevTools profile: sidebar render count should not increase meaningfully. |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| "Activation re-expands user's collapsed folder" feels invasive in rapid back-and-forth graph navigation | MEDIUM | LOW | A3 assumption + dogfood period. Escape valve is D8 (collapse sidebar entirely during intensive graph navigation). Pre-mitigation-if-needed: track a "just-collapsed this ancestor in the last 2s" debounce; overengineered for v1. | Andrew |
| scrollIntoView fires before ancestors render, targeting wrong layout | LOW | LOW | Dissolved by D4: expansion is synchronous with render, so by the time the scroll `useEffect` runs (post-render), children are already in the DOM. `activeRowRef.current` is null only in the race where the active doc isn't yet in `documents` — acceptable per Shadow paths. | Andrew |
| User manually collapses a folder containing the active doc, then performs an action that does not change activeDocName (e.g., tree poll) | LOW | LOW | `userCollapsed` is in component state; `useEffect` clears it only on activeDocName change (D4). Tree polls don't touch it. Folder stays collapsed until next activation. | Andrew |
| Reveal on initial mount scrolls the sidebar even when the user hasn't interacted | LOW | LOW | `scrollIntoView({ block: 'nearest' })` is a native no-op when the row is already visible. If the initial row is off-screen, scrolling to reveal is the intended behavior. | Andrew |
| Stale `userExpanded`/`userCollapsed` entries after rename/delete | LOW | LOW | Render-time intersection with `folderPaths` filters stale entries (D4). Recreated folders render with default collapsed state. | Andrew |
| Transitive ancestor rename (folder `a` → `a'` while `a/b/c.md` is active) | LOW | LOW | `handleRename` writes a new hash (`FileSidebar.tsx:320`) → `activeDocName` changes to `a'/b/c.md` → ancestors re-derive, scroll fires. | Andrew |
| Focus-management regression in existing keyboard navigation through sidebar | LOW | MEDIUM | D9 roving tabindex is additive; existing tab-order into sidebar lands on first tab-stop, which is now the active row. Verified via Playwright keyboard test. | Andrew |

## 15) Future Work

### Explored

- **Alias-aware reveal (D3 deferred).** Symlinks like CLAUDE.md → AGENTS.md.
  - What we learned: `aliasMap` exists on `WatcherHandle`; each tree row carries `canonicalDocName`. Expansion could be union(ancestors(canonical), ancestors(aliases-of(canonical))).
  - Recommended approach: compute alias ancestors only if the canonical has alias entries in the tree.
  - Why not in scope now: Aliases are rare and visually marked (Link2 icon). No user has reported confusion. Adds complexity for a narrow case.
  - Triggers to revisit: User reports losing orientation when opening a doc that also has aliases.
  - Implementation sketch: Extend ancestor computation to consult alias entries present in the tree.

### Identified

- **Persistent collapse state across sessions.** Known to matter for power users curating the sidebar as a workspace. Needs its own spec pass covering storage (localStorage vs per-workspace file), migration, and reset semantics.
- **Sidebar-collapsed orientation cue (breadcrumb in editor header).** When the sidebar is collapsed (D8), the user loses spatial orientation entirely. A breadcrumb in the editor header showing the active doc's path (e.g., `reports / foo / REPORT`) would preserve some orientation without fighting D8. Design-challenge Finding L6.

### Noted

- **Sidebar virtualization** — for projects with thousands of files, the tree rendering may become a perf concern. Brief description; no action now.
- **Search-inside-sidebar** — a command-palette / filter over the tree. Likely a better orientation tool for very large trees, complementary to reveal-on-activate.

## 16) Agent constraints

- **SCOPE:** `packages/app/src/components/FileSidebar.tsx` (primary). May add a small helper module for ancestor computation + folder-path collection in `packages/app/src/components/file-tree-utils.ts` if it keeps the component clean.
- **EXCLUDE:** `GraphView.tsx`, `BacklinksPanel.tsx`, `WikiLinkView.tsx`, `App.tsx`, any server code, `DocumentContext.tsx`. These are unchanged; the fix is entry-point agnostic.
- **STOP_IF:** The implementation requires adding a new routing layer, a new context provider, touching `ProviderPool`, or introducing `useEffect`-based ancestor-union state (instead of the derive-don't-store pattern). Any of these is a signal the approach is drifting from D4.
- **ASK_FIRST:** Any move away from derive-don't-store. Any addition of `aria-live` regions (D9 explicitly rejects). Any change to the D1 "always reveal" or D7 "no behavior override" policies. Any attempt to couple sidebar visibility to activation (D8 rejects).
