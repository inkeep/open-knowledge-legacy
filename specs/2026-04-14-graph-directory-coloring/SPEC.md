# Graph Directory Coloring — Spec

**Status:** Approved — ready for /decompose
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-14
**Baseline commit:** d6c6f42
**Links:**
- Branch / worktree: `feat/graph-directory-coloring` @ `.claude/worktrees/graph-directory-coloring`
- Spec evidence: `specs/2026-04-14-graph-directory-coloring/evidence/`
- Greenfield precedents: `CLAUDE.md §Architectural precedents` (items 2, 4, 6)

---

## 1) Problem statement

**Situation.** Open Knowledge renders a 2D force-directed graph (`GraphView.tsx`, react-force-graph-2d) of the document link structure — one node per doc, edges from wiki-links + markdown links, driven by the server's backlink index. Today nodes are colored binarily: the active document is blue, everything else is gray. DocNames already encode directory paths (e.g. `projects/foo/notes/bar`), but that structural information is invisible in the graph and only weakly visible in the sidebar (same muted icon color for every folder).

**Complication.** For **teams using open-knowledge as a shared wiki** — the primary persona, with 3–5 top-level directories each holding dozens to hundreds of notes — the uniform gray blob makes the graph useful for link topology but mute on content organization. Users can't tell at a glance which region is `projects/`, which is `meetings/`, or which notes bridge directories (cross-folder links are often the most interesting ones). The graph discards directory information that is already encoded in docNames and displayed hierarchically in the sidebar. As vaults grow, this gap compounds.

**Resolution.** Introduce directory-based coloring as a **shared primitive** (not a graph-local feature): a pure path-to-color function in `@inkeep/open-knowledge-core` that both the graph's `nodeColor` and the sidebar's folder icons consume. A user-adjustable **depth control** (arrow buttons) in the graph panel header lets the user dial coloring granularity from coarse (top-level folder) to fine (nested subfolders). Because the sidebar uses the same colors, **the sidebar effectively acts as the graph's legend** — no separate legend UI needed. One depth setting, two surfaces, one palette.

## 2) Goals

- **G1 (Orientation, picked-up from user request 1A).** When a user zooms out of the graph, they can identify dense clusters by directory at a glance — coloring surfaces which subject areas concentrate and which notes bridge between them.
- **G2 (Navigation, picked-up from user request 1B).** When a user is working in a folder (e.g. `projects/X/`), they can spot which graph neighbors are inside vs outside that folder without hovering each one.
- **G3 (Legend without a separate UI in normal mode; minimal overlay in fullscreen).** Sidebar folder colors match graph node colors for the same directory prefix — the sidebar acts as the legend in normal layout. When the graph panel is fullscreened (sidebar hidden), a minimal color-key overlay appears inside the graph canvas so the user never sees unlabelled colors. Unconditional — no interaction path produces colors without a visible legend.
- **G4 (Adjustable granularity).** User adjusts coloring depth via arrow buttons in the graph panel header. Depth change is immediate and visible on both surfaces. Chosen depth persists across sessions.
- **G5 (Shared primitive).** Path-to-color logic lives in `@inkeep/open-knowledge-core` (per greenfield precedent §4 *shared computation, per-surface rendering*). Graph + sidebar consume the same helper; future consumers (e.g. search results, breadcrumbs, future graph views) plug in without re-implementing.
- **G6 (Graceful degradation).** In a flat vault (all notes at root) or when depth is set to 0, behavior falls back cleanly to the current uniform-gray rendering.

## 3) Non-goals

- **[NEVER]** NG1: Per-user custom palettes / color-picker UI. One opinionated palette shared across surfaces. Deep customization is a different product.
- **[NEVER]** NG2: Coloring by anything other than directory path — not by tag, not by authorship, not by link-centrality. Those could be future features but are not directory coloring.
- **[NOT NOW]** NG3: Visible-depth / scope filter (the rejected interpretation `(ii)` — "only show nodes within N directory levels of the active node"). User disambiguated: we're doing coloring-granularity, not scope-filtering. — Revisit if: users ask for graph filtering after the coloring feature lands.
- **[NOT NOW]** NG4: Dedicated persistent graph-side legend UI in the normal (non-fullscreen) layout. The sidebar sync satisfies the legend need when the sidebar is visible. A minimal overlay ships for fullscreen only (per D19, §6.4a). A richer always-on legend (grouping controls, sortable bucket list, hover-to-highlight) is deferred. — Revisit if: users request richer legend features even with the sidebar visible.
- **[NOT NOW]** NG5: Color-blind alternative palette / toggle. Will pick a palette with reasonable categorical separation on first ship, monitor feedback. — Revisit if: accessibility audit flags it or a user reports inability to distinguish groups.
- **[NOT NOW]** NG6: Depth control surfaced outside the graph panel (e.g. a global settings panel, command palette action). Keep the control close to the thing it visibly affects. — Revisit if: users want to change depth while the graph isn't open.
- **[NOT UNLESS]** NG7: Persisting depth per-document or per-directory. Depth is a single global UI preference. — Only if: multi-vault or per-project depth memory emerges as a clear user need.
- **[NOT UNLESS]** NG8: Animating color transitions on depth change. Instant recolor is the baseline; animation is polish. — Only if: recolor feels jarring on large graphs.

## 4) Personas / consumers

- **P1 (primary): Team wiki user.** Small-to-mid team at a B2B SaaS co. using open-knowledge as a shared markdown KB. Vault has 3–5 top-level dirs (e.g. `projects/`, `meetings/`, `research/`, `playbooks/`, `ref/`), each with 20–200 notes. Uses graph to orient, explore relationships, and onboard new teammates. This persona is optimized-for.
- **P2 (secondary): Solo note-taker.** Personal-vault user with a deeper directory tree (10+ top-level dirs, sometimes 3–4 levels deep). Secondary because the feature is built for team-shape vaults, but should degrade gracefully — deeper depths should still work, palette should not run out of distinguishable colors for "typical" personal-vault breadth.
- **P3 (degenerate): Flat-vault user.** All notes at root. **Explicit user direction (intake Q4): render in single color (current behavior).** Depth control should either hide or no-op on flat vaults. Edge case, not optimized-for.
- **C1 (internal consumer): `packages/core`.** Exports the path-to-color function as a stable primitive for app-internal consumers (graph, sidebar) and future consumers (breadcrumbs, search results, second graph view).
- **C2 (internal consumer): `GraphView.tsx`.** Calls the helper inside its `nodeColor` function. Reads current depth + theme.
- **C3 (internal consumer): `FileTree.tsx` sidebar.** Calls the helper when rendering folder rows. Reads current depth + theme.

## 5) User journeys

### J1 (P1) — Orientation on a team wiki

1. User opens the editor. Graph panel is visible in a side column alongside the sidebar.
2. Initial render: default depth (proposed D1) — every node colored by its top-level directory. Sidebar folder icons match. E.g. `projects/*` nodes are teal, `meetings/*` are amber.
3. User sees five loose clusters in the force layout, each mostly one color, with a few color-crossing edges (bridges between `projects/` and `meetings/`).
4. User clicks the ↑ arrow in the graph panel header. Depth increases to 2.
5. `projects/alpha/*` is now one color, `projects/beta/*` is another (both distinct from `meetings/*` sub-dirs). Sidebar mirrors: folders at depth 2 get colors, top-level `projects/` folder is the muted fallback (or inherits — see OQ1).
6. User ↓ back to depth 1 to return to coarse view. State is stable.

### J2 (P1) — Neighbor check from the current document

1. User is editing `projects/alpha/q2-roadmap.md`. Graph is open to the side; active node is highlighted in blue (active-state color persists — does not get overridden by directory color).
2. User looks at edges radiating from the active node. Neighbors colored teal = same `projects/` subtree; neighbors colored amber = cross-folder links (to `meetings/`). User immediately identifies one surprising out-of-folder backlink worth investigating.

### J3 (P2) — Adjusting on a deeper personal vault

1. User opens a personal vault with 12 top-level dirs. Default depth 1.
2. Palette handles 12 distinct colors — not ideal but each is distinguishable (palette size = OQ2).
3. User drops to depth 0 — uniform gray (degrades cleanly).
4. User tries depth 3 in a dir that only has depth 2 subdirs — behavior: OQ1.

### J4 (P3) — Flat vault

1. User has all notes at root. Arrow buttons are disabled (or depth=1 still works and everything collapses to the fallback color — OQ3).
2. Current behavior preserved. No regression, no confusion.

## 6) Proposed solution (vertical slice)

### 6.1 Data model

No schema changes. DocNames already carry directory paths. The feature is a **pure client-side computation** layered over existing data.

**API shape (D16 — two functions delegating to a shared bucket helper):**

```ts
// packages/core/src/color/directory.ts

export type DirectoryColorOptions = {
  depth: number;               // 0 = disabled/fallback; N ≥ 1 = bucket at N directory segments
  theme: 'light' | 'dark';
};

/** Internal: compute the bucket key under prefix-truncation semantics. */
export function bucketKeyForPath(path: string, depth: number): string | null;
//   - `path` is the directory segments joined with '/' (doc filenames stripped by caller)
//   - returns null when path has no directory segments (flat-root doc) or depth === 0

/** Color for a document node (graph consumer). Strips terminal filename. */
export function colorForDocName(docName: string, options: DirectoryColorOptions): string;

/** Color for a folder (sidebar consumer). No stripping. */
export function colorForFolderPath(folderPath: string, options: DirectoryColorOptions): string;
```

**Algorithm (prefix-truncation, D11):**
1. Split path on `/`. For `colorForDocName`, drop the last segment (the filename).
2. If remaining segments are empty (flat-root doc) OR `depth === 0`, return the theme's fallback color.
3. Bucket key = first `min(depth, segments.length)` segments joined with `/`.
   - `projects/alpha/notes/foo` at depth 2 → `projects/alpha`
   - `projects/readme` at depth 2 → `projects` (its own color; **not** fallback)
   - `flat-root-file` at any depth → fallback
4. Hash bucket key → palette index. Return palette color indexed into the theme-specific array.

The hash function is deterministic (djb2 — tiny, no dependency), so the color for `projects/alpha` is stable across sessions and clients. Collisions are cosmetic, not semantic.

### 6.2 Palette (D10 — 12 hand-picked pastels, two theme variants)

Defined in `packages/core/src/color/palette.ts`:

```ts
export const DIRECTORY_PALETTE_LIGHT: readonly string[] = [ /* 12 pastels tuned for light bg */ ];
export const DIRECTORY_PALETTE_DARK:  readonly string[] = [ /* 12 variants tuned for dark bg */ ];
// Fallback colors match current uniform-default node color in GraphView.tsx:117
// (Tailwind gray-400 / gray-500; used when depth=0, flat-root doc, or no dir segments)
export const DIRECTORY_FALLBACK_LIGHT = '#9ca3af';  // current light-mode default
export const DIRECTORY_FALLBACK_DARK  = '#6b7280';  // current dark-mode default
```

**Selection rationale:**
- **Size 12.** Covers team vaults (P1: 3–5 top-level dirs) comfortably; handles depth=2/3 breadth before collisions dominate; 12 is a gentle extension over the de-facto floor of d3 `schemeTableau10`.
- **Pastels.** Matches the existing visual language of `HUMAN_COLORS`; works as a node fill in the graph *and* as a sidebar stroke after `deriveIconColor()` darkens it for readability against theme backgrounds.
- **Theme-paired.** Each index `i` of `DIRECTORY_PALETTE_LIGHT` and `DIRECTORY_PALETTE_DARK` is the same hue, tuned for contrast against the respective theme background — so a directory's identity is preserved when the user toggles theme.
- **No CVD-safe variant in v1.** A 12-color palette cannot be fully CVD-safe; we ship with reasonable separation and accept FW2 (CVD toggle) as deferred.

**Reuses exported identity-module utility:** `deriveIconColor` from `packages/core/src/utils/identity.ts` (the only public export relevant here). The palette module itself is just pre-baked hex arrays — no HSL conversion at runtime, so `hexToHsl`/`hslToHex` (module-private in `identity.ts`) are not needed and not re-exported.

**Concrete palette values** will be settled during implementation (not a spec-time concern provided §6.2 bounds — size, pastel character, theme pairing, darkening helper — are met). If the implementer wants to swap individual hex values, the selection rationale above is the gate.

### 6.3 Graph integration

`GraphView.tsx` already has `nodeColor` as a function and already reads `resolvedTheme`. Change:

```tsx
const depth = useDirectoryColorDepth();                           // subscribe to depth context
const theme = resolvedTheme === 'dark' ? 'dark' : 'light';

nodeColor={(node) => {
  if (node.id === activeDocName) return activeNodeColor;          // D13 — active overrides
  return colorForDocName(node.id, { depth, theme });
}}
```

**Active-node override (D13):** Active document drops its directory color in favor of the existing blue. Tradeoff: active node loses its bucket identity, but gains the immediate visual "you are here" affordance. Revisit if users lose orientation (FW candidate).

**Tooltip (retained, unchanged behavior):** `nodeLabel="label"` already shows the page title on hover. For color-collision disambiguation, hover exposes the full docName path implicitly via the existing label (no spec change; noted for implementer awareness). If collisions surface as a user-visible problem, reformatting the hover label to `"<dirPrefix> / <title>"` is a trivial follow-up.

### 6.4 Sidebar integration

`FileTree.tsx` renders folder rows with `<Folder stroke="var(--color-muted-foreground)" />`. Change: for every folder, compute `colorForFolderPath(folder.path, { depth, theme })` and use it as the icon stroke. Under prefix-truncation (D11), every folder at any depth gets tinted by its own path truncated to `min(depth, folder.pathDepth)`.

Examples at depth 2:
- `projects/` (depth 1) → bucket `projects` → color of the `projects` bucket
- `projects/alpha/` (depth 2) → bucket `projects/alpha` → a different color
- `projects/alpha/notes/` (depth 3) → bucket `projects/alpha` (truncated) → same color as its parent

This produces a nested-variant feel: all descendants of `projects/alpha/` share the same color, and the parent `projects/` is its own distinct hue. The sidebar thereby acts as a live color legend for the graph.

**Legibility helper:** icon strokes use `deriveIconColor(paletteColor)` from `identity.ts` so stroke is readably darker than a pastel fill would be. Sidebar backgrounds stay untinted (reads as structured, not busy).

### 6.4a Fullscreen legend overlay (D19)

When `isFullscreen === true` on the graph panel, the sidebar is not visible — so the sidebar-as-legend claim (G3) would otherwise fail. Address in v1 with a lightweight inline legend.

**Behavior:**
- Overlay is hidden in normal (non-fullscreen) mode — the sidebar serves as legend.
- On entering fullscreen, a small legend panel appears in a corner of the graph canvas (proposed: top-right, beneath the fullscreen exit button).
- The panel lists each **currently-active bucket**: a color swatch + the bucket key (e.g. `projects/alpha`).
- Bucket list is derived client-side by mapping every visible node through `bucketKeyForPath(node.id, depth)` and de-duplicating — no server round-trip.
- If `depth === 0` or there are no bucketed nodes, the overlay is suppressed (graph is monochrome; nothing to label).

**Implementation:**
- New component `packages/app/src/components/GraphLegend.tsx` — stateless, takes `(nodes, depth, theme)` and renders a small absolutely-positioned div with a vertical list of `swatch + label` rows.
- Rendered inside `GraphPanel.tsx` conditionally on `isFullscreen`.
- Uses the same palette via `colorForFolderPath(bucketKey, { depth, theme })`.
- No scrolling in v1 — if bucket count exceeds available height (MAX_DEPTH=5 with wide fanout), the overlay clips; acceptable for v1. If this becomes a problem, add `max-h-[80vh] overflow-y-auto`.

### 6.5 Depth control UI

Location: graph panel header, alongside fullscreen toggle + stats.

Components:
- **Label:** "Depth" (small muted text, optional — tooltip may suffice)
- **Down arrow button** (`lucide-react` `ChevronDown`): disabled when depth === `MIN_DEPTH` (0).
- **Current depth number** (single digit).
- **Up arrow button** (`ChevronUp`): disabled when depth === `MAX_DEPTH` (5, per D14).

All shadcn `Button` with `variant="ghost"` `size="icon-sm"`, matching existing fullscreen toggle. Tooltip (shadcn `Tooltip`) on each arrow explains the action. Keyboard: buttons are focusable; up/down keyboard arrows while focused increment/decrement.

**Flat-vault behavior (D12):** control is always present and always enabled. Changing depth on a flat vault is a silent no-op (bucket is always `null` → fallback color). No special detection logic needed — this is the honest, least-code path.

### 6.6 Depth state

Single client-side store, global (shared across graph + sidebar). Minimal React context + localStorage persistence (matches the `next-themes` + `identity.ts` precedent — no Zustand, no new state library):

```ts
// packages/core/src/utils/local-storage.ts   (NEW — extracted from identity.ts)
// - export safeLocalStorageGet(key): string | null
// - export safeLocalStorageSet(key, value): void
// - both guard against SecurityError (private browsing), QuotaExceededError, and missing window

// packages/app/src/state/directory-color.tsx
// - context provider reads localStorage('ok-graph-depth-v1') on mount (D15)
// - exposes useDirectoryColorDepth() and useSetDirectoryColorDepth()
// - persists on change via safeLocalStorageSet (from packages/core/src/utils/local-storage.ts)
// - per-browser only — no awareness sync, no server state (D17)
```

**`identity.ts` refactor (surgical).** The existing module-private `safeLocalStorageGet`/`safeLocalStorageSet` functions in `identity.ts` are extracted to the new `local-storage.ts` util. `identity.ts` then imports them instead of defining them, keeping the same behavior for `ok-user-name-v2` / `ok-user-color-v2` persistence. This is a pure refactor (no behavior change); covered by existing identity tests.

**Defaults (D14):**
- `DEFAULT_DEPTH = 1` (top-level coloring on first open; gives immediate orientation for team-wiki persona)
- `MIN_DEPTH = 0` (disables coloring; falls back to uniform gray)
- `MAX_DEPTH = 5` (palette collisions grow past this; user can still work by going shallower)

### 6.7 Vertical-slice summary

| Layer | Change |
| --- | --- |
| Data model | None (paths already in docName) |
| `packages/core` | New `src/color/directory.ts` + `src/color/palette.ts` + unit tests |
| `packages/app` state | New `state/directory-color.tsx` context + localStorage wiring |
| `packages/app` GraphView | `nodeColor` reads depth + theme, calls `directoryColor()` |
| `packages/app` GraphPanel | Header gets arrow buttons + depth number |
| `packages/app` FileTree | Folder icon/row tint calls `directoryColor()` for folder paths |
| Server / MCP / CRDT | **No changes** — feature is pure client-side rendering |
| Persistence | `localStorage` (client), no server-side storage |
| Rollout | Ship in one PR; behind no flag (additive, no regression path for opt-in) |
| Observability | None — no server signals, no user-data telemetry |
| Tests | Unit tests on `bucketKeyForPath`, `colorForDocName`, `colorForFolderPath` (hash stability, prefix-truncation, fallback, edge cases); component render test on depth control; optional Playwright smoke |
| Perf (D18) | No optimization in v1 — hash is O(path len) ~20ns; 1000-node graph = ~20µs/frame. FileTree folder-row color lookup is noise. Measure only if regression surfaces. |

## 7) Scope

**In scope (P0).** Sections 6.1 – 6.7 above, plus resolving all OQs below that are tagged P0.

**Out of scope.** Everything in §3 Non-goals. Adjacent items classified as Future Work (§9).

## 8) Constraints

- **C1 (greenfield precedent §2):** Primitives named for extensibility — `directoryColor()` not `graphNodeColor()`.
- **C2 (greenfield precedent §4):** Shared computation in `core`, per-surface rendering in `app`. No color logic duplicated between graph and sidebar.
- **C3 (greenfield precedent §6):** Depth is a number, not a boolean "deep mode on/off." No mode flags.
- **C4 (greenfield precedent §7):** If the palette choice is genuinely broken for team vaults, fix before shipping — do not ship a half-working feature.
- **C5 (storage fidelity contract):** No server-side persistence of depth state. No MCP surface. No CRDT state.
- **C6 (React Compiler):** Do not add `useMemo` / `useCallback` in new code; rely on compiler.
- **C7:** Tailwind v4 in-CSS `@theme` directive — any new color tokens go into `globals.css`, not a JS config.

## 9) Future Work

*(Maturity tiers: Explored / Identified / Noted.)*

- **FW1 — [ADDRESSED IN V1]** Fullscreen legend overlay. Originally deferred; promoted to v1 per D19 during audit. See §6.4a.
- **FW2 (Noted) — Color-blind toggle / alternate palette.** Ship initial palette with reasonable separation; revisit if a11y audit or user feedback flags issues.
- **FW3 (Noted) — Color by something other than directory.** Tag-based, author-based, centrality-based coloring — different features entirely, not directory coloring.
- **FW4 (Identified) — Graph filtering by directory.** The rejected interpretation `(ii)`: scope filter. Natural follow-on if users want to focus on a subtree. Depth control infrastructure can be reused.
- **FW5 (Noted) — Depth control outside graph panel.** Command-palette action, settings panel entry. Not needed until users want to change depth without the graph open.
- **FW6 (Noted) — Animated color transitions on depth change.** Polish.

## 10) Decision Log

| # | Topic | Decision | Rationale | Status | Reversibility |
|---|-------|----------|-----------|--------|----------------|
| D0 | Feature shape | Coloring granularity (interpretation (i)) — not visible-depth/scope filter | User direction (intake Q2) | LOCKED | 1-way (informs all downstream) |
| D1 | Primary surface | Graph + sidebar (both) | User direction (intake Q5: "colors can sync across sidebar to make a nice legend") | LOCKED | 1-way |
| D2 | Primary persona | Team wiki (P1) | User direction (intake Q3) | LOCKED | Reversible (affects palette sizing defaults only) |
| D3 | Flat-vault behavior | Fall back to single (current) color | User direction (intake Q4) | LOCKED | Reversible |
| D4 | Primitive location | `@inkeep/open-knowledge-core/src/color/` | User direction (intake Q5) + greenfield §4 | LOCKED | 1-way (API shape) |
| D5 | Depth state scope | Single global depth, shared across surfaces | Follows D1 (legend coherence) + simpler UX | DIRECTED | Reversible (per-panel possible later) |
| D6 | Depth persistence | `localStorage`, client-only | Matches theme + identity patterns; no server concern | DIRECTED | Reversible |
| D7 | Control location | Graph panel header | Proximity to primary surface; sidebar colors derive, don't drive | DIRECTED | Reversible (could add mirror control later) |
| D8 | Server/MCP surface | None | Pure render-time feature | LOCKED | Reversible |
| D9 | Rollout | Single PR, no feature flag | Additive, no regression path | DIRECTED | Reversible |
| D10 | Palette | 12 hand-picked pastels, light+dark theme variants, no CVD variant in v1 | User direction (OQ2 option A) + matches `HUMAN_COLORS` precedent | LOCKED | 1-way on API; color values reversible |
| D11 | Path-depth semantics | Prefix-truncation: bucket = first `min(depth, pathSegments)` segments | User direction (OQ1+OQ4) — produces nested-variant feel, no fallback-gray confusion | LOCKED | 1-way on semantics; behavior-defining |
| D12 | Flat-vault UX | Control always present, always enabled; depth changes are silent no-ops | User direction (OQ3 option C) — least-code, most honest | DIRECTED | Reversible |
| D13 | Active-node highlight | Override directory color (simple fill swap to blue) | User direction (OQ6 option A) — crisp signal; layering deferred to FW | DIRECTED | Reversible |
| D14 | Depth defaults | `DEFAULT_DEPTH = 1`, `MIN_DEPTH = 0`, `MAX_DEPTH = 5` | User direction (OQ7) — team-wiki shape + palette size | DIRECTED | Reversible |
| D15 | Depth persistence | `localStorage('ok-graph-depth-v1')` via `safeLocalStorageSet` | Matches theme + identity precedent | DIRECTED | Reversible |
| D16 | API shape | Two functions: `colorForDocName` + `colorForFolderPath`, both delegating to `bucketKeyForPath` | User direction (OQ5 option B) — clearer call sites, easier tests | LOCKED | 1-way (public core API) |
| D17 | Sync scope | Per-browser only; no awareness sync, no server state | User direction (OQ8) — UI preference analog to theme | DIRECTED | Reversible |
| D18 | Perf | No optimization in v1; rely on cheap pure math + React Compiler | Order-of-magnitude estimate shows no hot-spot | DIRECTED | Reversible |
| D19 | Fullscreen legend | Inline legend overlay rendered inside graph canvas when `isFullscreen === true` | User direction (post-challenger M1) — ~30 LOC cost; prevents known-broken interaction path (greenfield §7) | DIRECTED | Reversible |
| D20 | PR strategy (re-confirmed) | Single PR — coloring + depth control + fullscreen legend ship together | User direction (post-challenger M2) — scope is modest (~300–400 LOC); bundling avoids coordination overhead | DIRECTED | Reversible |

## 11) Open Questions

*All P0 open questions resolved (see D10–D18). No open items remaining.*

## 12) Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|-----------|--------------|
| A1 | A deterministic hash of a directory bucket key → palette index is acceptable collision behavior for the primary persona (3–5 top-level dirs) | HIGH | For N=5 dirs into palette size 8+, collision probability is ~0. Verified by pigeonhole. |
| A2 | react-force-graph-2d re-renders on `nodeColor` function identity change cheaply | MEDIUM | Library uses canvas; color function is called per-frame. Safe for typical graph sizes. Measure if >500 nodes becomes common. |
| A3 | FileTree folder icons can accept inline `stroke` replacing the CSS var | HIGH | `lucide-react` stroke prop accepts any CSS color. Verified by code inspection. |
| A4 | Users will discover the depth control without a tooltip | MEDIUM | Mitigated by placing next to existing controls. Validate in review. |

## 13) Risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Palette doesn't separate well in dark mode | Test both themes on real vault shapes; run through a color-blind simulator |
| R2 | Depth control is invisible until user discovers it | Tooltip on hover; document in changelog |
| R3 | Sidebar color sync feels noisy (too many colors) | OQ4 decision controls this — restricting to folders at exactly depth N reduces visual noise |
| R4 | Users with very deep vaults hit MAX_DEPTH | MAX_DEPTH is adjustable constant; pick generously (OQ7) |

## 14) Agent Constraints

**SCOPE:**
- `packages/core/src/color/directory.ts` (new) — hashing + bucket logic
- `packages/core/src/color/palette.ts` (new) — palette arrays + fallback colors
- `packages/core/src/color/index.ts` (new) — barrel export
- `packages/core/src/utils/local-storage.ts` (new) — `safeLocalStorageGet/Set` extracted from `identity.ts` (pure refactor)
- `packages/core/src/utils/identity.ts` — internal imports only (re-use the extracted helpers; no public API change; `deriveIconColor` unchanged)
- `packages/app/src/state/directory-color.tsx` (new) — React context + localStorage persistence
- `packages/app/src/components/GraphView.tsx` — swap `nodeColor` body
- `packages/app/src/components/GraphPanel.tsx` — add depth control into existing PanelHeader; conditionally render `<GraphLegend>` when fullscreen
- `packages/app/src/components/GraphLegend.tsx` (new, per D19) — fullscreen color-key overlay
- `packages/app/src/components/FileTree.tsx` — inject `stroke` color on folder icons
- `packages/app/src/main.tsx` — wrap app in `<DirectoryColorProvider>`
- Unit tests adjacent to each new source file (`*.test.ts`)

**EXCLUDE:**
- `packages/server/**` — no server changes (D8)
- `packages/cli/**` — no CLI changes
- MCP tool definitions — no new tools
- CRDT/Y.Doc state — no schema changes
- Any API endpoint — graph uses existing `/api/link-graph`
- Docs site (`docs/**`) — feature is editor-internal
- `globals.css` — no new Tailwind tokens needed (palette is JS constants, not CSS vars)

**STOP_IF:**
- A proposed change would require a server-side surface
- A proposed change would require adding a new top-level dependency (e.g. `d3-scale-chromatic`) — palette is inline hex arrays
- Palette contrast fails on either theme — surface before shipping (C4 / greenfield §7)
- Depth control appears disabled on flat vaults or has user-visible "disabled" state — violates D12

**ASK_FIRST:**
- Any deviation from prefix-truncation semantics (D11)
- Any change to the API shape (D16) — split differently, merge, rename
- Any addition to localStorage keys beyond `ok-graph-depth-v1` — consistency with `ok-*-v1` precedent
- Sidebar tint extending to row background or folder name text color (v1 is icon-stroke only per §6.4)

## 15) Appendix

- **Intake Q&A (2026-04-14):** User confirmed: 1A+B (orientation + navigation), 2(i) coloring granularity, 3 teams primary, 4 flat = single color, 5 sidebar color sync = legend.
- **Not yet dispatched:** Formal `/worldmodel` subagent — skipped in favor of two focused `/explore` passes that covered the surface adequately (graph view, color primitives, sidebar, theme, palette, state persistence). If audit flags coverage gaps, dispatch worldmodel at that point.
