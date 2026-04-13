# SPEC: Wiki-Link Suggestion Migration to @tiptap/suggestion

**Status:** Draft
**Created:** 2026-04-11
**Rebased:** 2026-04-12 — baseline moved from `0e5c31d` → `39fcd87` to incorporate PR #53 (anchor mode) and PR #71 (backlink panel)
**Baseline commit:** 39fcd87 (origin/main head)
**Implementer:** AI coding agent (Claude Code)
**Location:** `packages/app/src/editor/` only — `extensions/wiki-link-suggestion.ts`, `extensions/wiki-link-suggestion.test.ts`, `wiki-link-suggestion/WikiLinkSuggestionMenu.tsx`, `extensions/wiki-link.ts` (registration change)
**Nature:** Architectural refactor to unify suggestion systems. Migrates the wiki-link `[[` suggestion from a custom ProseMirror Plugin to `@tiptap/suggestion`, matching the pattern established by PR #51 (slash command generalization). Preserves all functionality added by PR #53 — anchor mode (`[[page#heading]]`), per-mode loading, per-mode empty states. Pure view-layer change with zero user-visible behavior regression.
**Target PR:** Direct to main. Moderate size — bigger than originally scoped due to anchor mode, but still a single-sitting review.

**Pace:** Fast. Single-phase refactor. Same pattern as PR #51.

---

## 1. Problem Statement (SCR)

**Situation:** The editor has two suggestion systems: slash commands (`/`) using `@tiptap/suggestion` (migrated in PR #51), and wiki-links (`[[`) using a custom ProseMirror Plugin + PluginKey state machine (originally from PR #42, expanded by PR #53 to 492 lines with anchor mode). The slash command migration established `@tiptap/suggestion` as the canonical pattern — community-proven, collaborative-safe, with Floating UI positioning via the established `computePosition` + `autoUpdate` pattern.

**Complication:** The wiki-link suggestion (492 lines) duplicates every facility that `@tiptap/suggestion` provides:
- Trigger detection via regex in `Plugin.state.apply()` (Suggestion handles this internally)
- Keyboard handling via `handleKeyDown` in `Plugin.props` (Suggestion exposes `render().onKeyDown`)
- Popup lifecycle via custom `view()` + `ReactRenderer` (Suggestion exposes `render()` callbacks)
- Positioning via raw `coordsAtPos` (Suggestion provides `clientRect` for Floating UI integration)

The custom plugin also **lacks** what the slash command gained from migration:
- No Floating UI positioning — menu doesn't flip near viewport edge, doesn't track scroll, no dynamic max-height
- No collaborative-safe `shouldShow` option
- No error boundary on `insertWikiLink` (editor chain can throw on invalid state)
- Inconsistent Escape handling — fires at ProseMirror plugin priority instead of through Suggestion's internal lifecycle

**Resolution:** Migrate to `@tiptap/suggestion` with a **custom `findSuggestionMatch` function** (not the built-in `char`-based matching). The built-in regex doesn't support paired delimiters — `[[query]]` needs to stop matching at the first `]`, which the built-in `char` parameter can't express. Additionally, anchor mode (`[[page#heading]]`) uses `#` inside the query but must NOT stop matching at `#`. `@tiptap/suggestion` exposes `findSuggestionMatch` as a configurable override (confirmed from source at line 80), so the custom function uses the existing `/\[\[([^\]]*)$/` regex while gaining all of Suggestion's lifecycle benefits. The regex already accommodates `#` (excludes only `]`), so anchor mode works transparently.

---

## 2. Success Criteria

### Primary: Zero user-visible behavior change

**Page mode** (existing, unchanged):
- `[[` triggers the suggestion menu (at start of block, mid-line, mid-word — no prefix restriction)
- Typing narrows results via fuzzysort on `title` + `docName`
- Pages from `/api/pages` appear with title + docName
- Loading state: "Loading pages…" while fetching
- Error state with fallback message, unresolved-link option still available
- "Insert unresolved link" option when no pages match
- Enter/Tab inserts selected wiki-link
- Escape closes menu
- Mouse click inserts selected item
- `]]` typed manually closes the menu (first `]` breaks the match)

**Anchor mode** (preserved from PR #53):
- Typing `#` inside `[[page` transitions to anchor mode (e.g., `[[release-notes#ch`)
- On first entry to anchor mode, fetches `/api/page-headings?docName=<pageTarget>`
- Menu header shows the `pageTarget` in uppercase tracking-wide style
- Items render as `H<level>` + heading text with indent proportional to level (`padding-left: (level-1)*10+8px`)
- fuzzysort filtering on heading `text` via `anchorQuery` (text after `#`)
- Loading state: "Loading headings for <pageTarget>…"
- Empty state: `No headings match "<anchorQuery>"` or `No headings in <pageTarget>`
- Selecting an anchor item inserts wiki-link with `{ target: docName, anchor: slug }`
- Fallback: Enter with no item selected inserts wiki-link with `{ target: pageTarget, anchor: anchorQuery.trim() || null }`

**Atom deletion** (preserved from PR #53):
- Backspace deletes adjacent wiki-link atom when suggestion is inactive
- Delete key deletes wiki-link atom on the right when suggestion is inactive

### Secondary: Architectural alignment
- Uses `@tiptap/suggestion` with custom `findSuggestionMatch`
- Floating UI positioning via `computePosition` + `autoUpdate` + `flip` + `offset` + `size` (matching `slash-command.ts` pattern)
- `--suggestion-menu-max-height` CSS variable driven by `size` middleware
- Error boundary on wiki-link insertion (`try/catch` on `editor.chain()`)
- Modest line reduction (492 → ~375-400 estimated; ~20% savings). Arithmetic: remove state machine (`state.init`/`state.apply` ~40 lines), remove `rebuildFiltered`/`isLoading` helpers (~10 lines), compress `view()` mount plumbing (~45 lines saved against slash-command.ts's ~130-line render body; wiki-link has more per-mode branching + two fetchers + fallback handler + `onBeforeUpdate` for the mode-switch loading state, so savings are smaller). The architectural wins (Floating UI, error boundary, consistency) stand regardless of LOC.
- Existing test file `wiki-link-suggestion.test.ts` keeps passing (tests `buildSuggestionItems` which remains a pure function)

---

## 3. What to Build

### 3.1 Convert extension registration

**Current (`wiki-link.ts:16-18`):**
```ts
addProseMirrorPlugins() {
  return [createWikiLinkSuggestionPlugin(this.editor)];
}
```

**Target:**
```ts
addProseMirrorPlugins() {
  return [
    Suggestion<WikiLinkSuggestionItem>({
      editor: this.editor,
      pluginKey: wikiLinkSuggestionKey,
      char: '[[',  // Used by Suggestion internally for decoration, not for matching
      allowedPrefixes: null,  // Wiki-links trigger anywhere (mid-word is valid)
      findSuggestionMatch: wikiLinkMatcher,  // Custom matcher for [[ paired delimiters
      items: async ({ query }) => { ... },
      command: ({ editor, range, props: item }) => { ... },
      render: () => { ... },
    }),
  ];
}
```

### 3.2 Custom `findSuggestionMatch` for `[[` paired delimiters

The built-in `findSuggestionMatch` constructs a regex from `char` that has no closing-delimiter awareness. Wiki-links need to stop matching at the first `]` character.

```ts
function wikiLinkMatcher(config: {
  $position: ResolvedPos;
}): { range: { from: number; to: number }; query: string; text: string } | null {
  const { $position } = config;
  const text = $position.nodeBefore?.isText && $position.nodeBefore.text;
  if (!text) return null;

  const textFrom = $position.pos - text.length;
  const match = text.match(/\[\[([^\]]*)$/);
  if (!match || match.index === undefined) return null;

  const from = textFrom + match.index;
  const to = $position.pos;

  if (from < $position.pos && to >= $position.pos) {
    return { range: { from, to }, query: match[1], text: match[0] };
  }
  return null;
}
```

This preserves the exact same trigger behavior as the current custom plugin — `/\[\[([^\]]*)$/` is the identical regex used at `wiki-link-suggestion.ts:182`.

### 3.3 Async items with per-mode loading (page + anchor)

**Current behavior (post-PR #53):**
- Page mode: first fetch is `/api/pages`; filtered via fuzzysort → `buildSuggestionItems(cachedPages, query)`.
- Anchor mode: when `query` contains `#` with non-empty left side, the plugin calls `ensureHeadings(pageTarget)` which fetches `/api/page-headings?docName=<pageTarget>`; filtered via fuzzysort on `text` → `buildAnchorItems(docName, headings, anchorQuery)`.
- Loading flag: `isLoading(query)` checks mode-specific fetch state (`!pagesLoaded` in page mode, `anchorFetchingFor === pageTarget` in anchor mode).

**Target:** Suggestion's `items` callback supports `async` natively (`await items(...)` at source line 196). Both page-mode pages and anchor-mode headings are fetched lazily from the same callback. Closure state lives outside the `Suggestion()` config, shared between `items` and the `render` callbacks.

```ts
// Closure state — declared inside addProseMirrorPlugins() at the outer scope
// enclosing both `items` and the factory passed to `render`. Both close over
// the same frame so mutations in `items()` are visible to render callbacks.
let cachedPages: PageItem[] = [];
let pagesLoaded = false;
let pagesFetching = false;                                  // dedupe concurrent page fetches
let cachedHeadings = new Map<string, HeadingEntry[]>();
let anchorFetchingFor: string | null = null;                // dedupe concurrent heading fetches (per docName)
let fetchError: string | null = null;

items: async ({ query }) => {
  const { mode, pageTarget, anchorQuery } = parseQuery(query);

  if (mode === 'anchor') {
    // Lazy-fetch headings for this pageTarget (cache per-docName).
    // `anchorFetchingFor` dedupes concurrent fetches for the same docName —
    // matches the current implementation's ensureHeadings() guard.
    if (!cachedHeadings.has(pageTarget) && anchorFetchingFor !== pageTarget) {
      anchorFetchingFor = pageTarget;
      try {
        const headings = await fetchHeadings(pageTarget);
        cachedHeadings.set(pageTarget, headings);
      } catch (err) {
        console.error('[wiki-link-suggestion] Failed to fetch headings:', err);
        cachedHeadings.set(pageTarget, []);  // treat as empty so we don't retry
      } finally {
        anchorFetchingFor = null;
      }
    }
    const headings = cachedHeadings.get(pageTarget) ?? [];
    return buildAnchorItems(pageTarget, headings, anchorQuery);
  }

  // Page mode — flag-based dedupe matching anchor mode's pattern.
  // Two-flag guard (`!pagesLoaded && !pagesFetching`) prevents concurrent
  // fetches. A single `!pagesLoaded` guard would fail because the flag only
  // flips AFTER await resolves, letting fast keystrokes fire multiple fetches.
  // Second caller sees `pagesFetching === true` and short-circuits to the
  // current (empty) `cachedPages`; `onBeforeUpdate` renders the loading label,
  // and the next `items()` invocation after the fetch resolves returns populated data.
  if (!pagesLoaded && !pagesFetching && !fetchError) {
    pagesFetching = true;
    try {
      cachedPages = await fetchPages();
      pagesLoaded = true;
    } catch (err) {
      pagesLoaded = true;  // don't retry on error
      fetchError = 'Failed to load pages. You can still insert an unresolved link.';
      console.error('[wiki-link-suggestion] Failed to fetch pages:', err);
    } finally {
      pagesFetching = false;
    }
  }
  return buildSuggestionItems(cachedPages, query);
},
```

**Loading state lifecycle:** Suggestion's full lifecycle (verified from source lines 189-209) is:

1. `onBeforeStart(props)` fires on menu open (before the initial `items()` await)
2. `onBeforeUpdate(props)` fires on every query change (before the re-running `items()` await)
3. `await items({ editor, query })` — same callback runs for both open and change
4. `onExit(props)` fires on exit (if `handleExit`)
5. `onUpdate(props)` fires on query change (after `items()` resolves)
6. `onStart(props)` fires on open (after `items()` resolves)

The render callback therefore implements SIX hooks: `onBeforeStart`, `onBeforeUpdate`, `onStart`, `onUpdate`, `onKeyDown`, `onExit`.

**Per-mode loading label:** The menu component branches on `mode` for the loading label ("Loading pages…" vs "Loading headings for <pageTarget>…"). Both `onBeforeStart` AND `onBeforeUpdate` must push `{loading, mode, pageTarget, anchorQuery}` into the renderer before `items()` resolves:

- `onBeforeStart` — mount popup + ReactRenderer with `loading: true` (or `false` if already cached). Derive mode from `parseQuery(props.query)`.
- `onBeforeUpdate` — mode switch path (page → anchor when user types `#`). Compute `loading` as: `mode === 'anchor' ? !cachedHeadings.has(pageTarget) : !pagesLoaded`. This matches the current `isLoading()` helper. Without this hook, the "Loading headings for <pageTarget>…" label would not render during the anchor-mode fetch — regressing R15.
- `onStart` / `onUpdate` — items have resolved; update renderer with `loading: false` (or still `loading: true` if `fetchError` is set for page mode). `query`, `mode`, `pageTarget`, `anchorQuery` derived from `parseQuery(props.query)`.

**Extract `computeMenuProps` helper** to avoid duplicating the parseQuery + mode + loading logic across all four hooks. Signature:

```ts
function computeMenuProps(
  suggestionProps: SuggestionProps<WikiLinkSuggestionItem>,
  loadingOverride: boolean | null,  // null = compute from cache state
  onSelect: (item: WikiLinkSuggestionItem) => void,
): WikiLinkSuggestionMenuProps {
  const { mode, pageTarget, anchorQuery } = parseQuery(suggestionProps.query ?? '');
  const loading = loadingOverride ?? (
    mode === 'anchor' ? !cachedHeadings.has(pageTarget) : !pagesLoaded
  );
  return {
    items: suggestionProps.items,
    query: suggestionProps.query ?? '',
    selectedIndex: /* from closure or 0 */ 0,
    onSelect,
    loading,
    error: mode === 'page' ? fetchError : null,
    mode,
    pageTarget,
    anchorQuery,
  };
}
```

All four hooks (`onBeforeStart`, `onBeforeUpdate`, `onStart`, `onUpdate`) call `renderer.updateProps(computeMenuProps(props, loadingOverride, onSelect))` with the appropriate `loadingOverride` (`null` for before-hooks → compute from cache state; `false` for after-hooks → items are populated).

**Helper reuse:** Keep `parseQuery`, `filterPages`, `filterHeadings`, `buildSuggestionItems`, `buildAnchorItems`, `fetchPages`, `fetchHeadings` as top-level exported functions. They are pure (except the fetchers) and already unit-testable — the existing test file stays valid.

### 3.4 Floating UI positioning (matching slash-command.ts pattern)

Replace `coordsAtPos` + manual `style.left/top` with the established Floating UI pattern:

```ts
const virtualEl = {
  getBoundingClientRect: () => currentProps?.clientRect?.() ?? new DOMRect(),
  get contextElement() { return currentProps?.editor.view.dom; },
};

const doPosition = () => {
  if (!popup) return;
  computePosition(virtualEl, popup, {
    placement: 'bottom-start',
    middleware: [
      offset(4),
      flip(),
      size({
        apply({ availableHeight }) {
          if (popup) {
            popup.style.setProperty(
              '--suggestion-menu-max-height',
              `${Math.min(availableHeight, window.innerHeight * 0.4)}px`,
            );
          }
        },
      }),
    ],
  }).then(({ x, y }) => {
    if (popup) { popup.style.left = `${x}px`; popup.style.top = `${y}px`; }
  }).catch(() => {});
};
```

This gives: menu flips above when near viewport bottom, tracks scroll via `autoUpdate`, dynamic max-height.

### 3.5 Command handler — three item kinds + fallback + error boundary

Current `insertWikiLink()` handles four insertion paths. All must be preserved in the new `command` callback:

```ts
command: ({ editor, range, props: item }) => {
  let attrs: { target: string; alias: string | null; anchor: string | null } | null = null;

  if (item?.kind === 'page') {
    attrs = { target: item.docName, alias: null, anchor: null };
  } else if (item?.kind === 'anchor') {
    attrs = { target: item.docName, alias: null, anchor: item.slug };
  } else if (item?.kind === 'create') {
    attrs = buildUnresolvedWikiLinkAttrs(item.title);
  } else {
    // Fallback: Enter with no item selected — derive attrs from the raw query
    // (this preserves PR #53 behaviour: [[release-notes#ch + Enter with no
    // item selected inserts { target: 'release-notes', anchor: 'ch' }).
    // The query comes from the plugin state, not `range.text`.
    const state = wikiLinkSuggestionKey.getState(editor.state);
    const query = state?.query ?? '';
    const { mode, pageTarget, anchorQuery } = parseQuery(query);
    if (mode === 'anchor' && pageTarget) {
      attrs = { target: pageTarget, alias: null, anchor: anchorQuery.trim() || null };
    } else {
      attrs = buildUnresolvedWikiLinkAttrs(query);
    }
  }

  if (!attrs) return;

  editor.chain().focus().deleteRange(range).run();
  try {
    editor.chain().focus().insertContent({ type: 'wikiLink', attrs }).run();
  } catch (err) {
    console.error('WikiLink: insert command threw an error', err);
  }
},
```

The fallback path (Enter with no item selected) depends on reading the plugin's own state. Since we pass `pluginKey: wikiLinkSuggestionKey` to Suggestion, `wikiLinkSuggestionKey.getState(editor.state)` returns Suggestion's internal state shape. Verified shape (`node_modules/@tiptap/suggestion/dist/index.js` lines 221-234): `{ active: boolean, range: {from,to}, query: string | null, text: string | null, composing: boolean, dismissedRange, decorationId }`. `query` is `null` when inactive (lines 311-315), so always null-coalesce via `?? ''` before passing to `parseQuery`. The code snippet above already does this (`state?.query ?? ''`).

### 3.6 Atom deletion (Backspace/Delete when suggestion inactive)

PR #53 added Backspace/Delete handlers that delete adjacent wiki-link atoms when the suggestion menu is NOT active. These handlers currently live in the same `handleKeyDown` as the suggestion navigation:

```ts
// Current wiki-link-suggestion.ts:188-213 — inactive-state handler
if (!state?.active) {
  if (event.key === 'Backspace') { /* delete nodeBefore if wikiLink */ }
  if (event.key === 'Delete')    { /* delete nodeAfter if wikiLink */ }
  return false;
}
```

**Target:** `@tiptap/suggestion`'s `render().onKeyDown` only fires when a suggestion is active — it cannot handle keys when the menu is closed. So the atom-deletion logic moves into a **separate ProseMirror plugin** (or `addKeyboardShortcuts` on the wiki-link extension itself) registered alongside Suggestion:

```ts
// In wiki-link.ts addProseMirrorPlugins():
return [
  Suggestion<WikiLinkSuggestionItem>({ /* ... */ }),
  wikiLinkAtomDeletionPlugin,  // new: handles Backspace/Delete when suggestion inactive
];
```

The atom-deletion plugin is a ~30-line ProseMirror plugin with a `handleKeyDown` prop that checks for a wiki-link atom at the cursor boundary and deletes it. Keep the comment from the current implementation explaining why this lives in `handleKeyDown` rather than `addKeyboardShortcuts` (the latter creates a separate keymap plugin that interferes with TipTap's built-in handleBackspace chain).

### 3.7 Preserve WikiLinkSuggestionMenu component

The menu component (`WikiLinkSuggestionMenu.tsx`) stays unchanged. It's already a pure render function receiving `items`, `query`, `selectedIndex`, `onSelect`, `loading`, `error`, `mode`, `pageTarget`, `anchorQuery` as props. All of these must be passed from the render lifecycle (all six hooks: `onBeforeStart`, `onBeforeUpdate`, `onStart`, `onUpdate`, `onKeyDown`, `onExit`):

- `query`, `mode`, `pageTarget`, `anchorQuery` — derived from `parseQuery(props.query ?? '')` at each render callback (null-guard because Suggestion's state `query` is null when inactive, though during render callbacks it should always be a string)
- `items`, `selectedIndex`, `onSelect` — from Suggestion's `props` directly (empty items list in `onBeforeStart`/`onBeforeUpdate` before the `items()` await resolves)
- `loading` — computed per-mode: `onBeforeStart`/`onBeforeUpdate` push `loading: true` when target cache is empty (`!pagesLoaded` for page mode, `!cachedHeadings.has(pageTarget)` for anchor mode); `onStart`/`onUpdate` push `loading: false`
- `error` — closure state; passed only in page mode (`mode === 'page' ? fetchError : null`)

Add the Floating UI CSS var to the listbox container: the component already uses `max-h-80` — change to `style={{ maxHeight: 'var(--suggestion-menu-max-height, 20rem)' }}` (20rem = 80 * 0.25rem to match the Tailwind default). Apply to both the listbox container and the loading/empty status containers so all render paths respect the constraint.

**No prop removal.** Unlike the slash-command migration which removed `query`, wiki-link needs every existing prop for anchor mode's per-mode rendering.

---

## 4. Implementation Order

1. Extract pure helpers to keep existing tests green: `parseQuery`, `filterPages`, `filterHeadings`, `buildSuggestionItems`, `buildAnchorItems` — these are already exported and unit-tested; ensure they remain top-level exports in the new module.
2. Write the custom `wikiLinkMatcher` function (§3.2).
3. **Spike D6 atom-deletion approach:** try `addKeyboardShortcuts` on the wiki-link extension first with a `wikiLinkSuggestionKey.getState(view.state)?.active` guard. Run R21/R22/R23 against it. If it passes, skip step 4. If Backspace/Delete interferes with plain-text editing, proceed to step 4 (separate plugin).
4. (Fallback if spike fails) Write the atom-deletion ProseMirror plugin (§3.6) — small, standalone, can be tested independently.
5. Write the `computeMenuProps(suggestionProps, loadingOverride, onSelect)` helper that all four render hooks call (§3.3 / §3.7).
6. Rewrite `wiki-link-suggestion.ts` using `Suggestion<WikiLinkSuggestionItem>()` with: custom matcher, per-mode async items (page + anchor) with two-flag `pagesFetching` dedupe, command handler with three kinds + fallback, Floating UI render lifecycle with all six hooks — `onBeforeStart` (mount + loading state), `onBeforeUpdate` (mode-switch loading state), `onStart`/`onUpdate` (items resolved, loading: false), `onKeyDown`, `onExit` (§3.1, §3.3, §3.4, §3.5).
7. Update `WikiLinkSuggestionMenu.tsx` — swap `max-h-80` for Floating UI CSS var on all three render paths (listbox, loading, empty) (§3.7).
8. Update `wiki-link.ts` registration — return `[Suggestion(...)]` (if D6 spike succeeded) or `[Suggestion(...), wikiLinkAtomDeletionPlugin]` (if fallback) from `addProseMirrorPlugins`.
9. Verify quality gates: `bun run check` (typecheck + lint + unit + integration + fidelity) — existing `wiki-link-suggestion.test.ts` must still pass since `buildSuggestionItems` is unchanged.
10. Manual QA (see §7 scenarios): page mode (R01-R14), anchor mode (R15-R20), atom deletion (R21-R23).

---

## 5. Tech Stack

### Existing (no new dependencies)

- `@tiptap/suggestion@^3.22.3` — already installed (from PR #51 slash command migration)
- `@floating-ui/dom@^1.7.6` — already a direct dependency
- `fuzzysort` — already installed (wiki-link's filtering library)
- `@tiptap/react` — `ReactRenderer` already used

---

## 6. Scope Boundaries

### In Scope
- Rewrite `wiki-link-suggestion.ts` to use `@tiptap/suggestion` + a small atom-deletion plugin
- Update `WikiLinkSuggestionMenu.tsx` — add Floating UI CSS var (no prop changes)
- Update `wiki-link.ts` registration — return two plugins from `addProseMirrorPlugins`
- Add error boundary on insertion
- Preserve all existing behavior:
  - **From PR #42 (original suggestion):** page trigger, fuzzy filter, insert, page-mode loading, page-mode error
  - **From PR #53 (anchor mode):** anchor mode, per-mode loading label, per-mode empty state, atom deletion (Backspace/Delete on wikiLink), fallback insertion from raw query

### Out of Scope
- Changes to `wiki-link.ts` mark extension (schema, serialization, NodeView)
- Changes to `wiki-link-helpers.ts` (`buildUnresolvedWikiLinkAttrs`, `toWikiLinkSlug`, `isResolvedWikiLinkTarget`)
- Changes to `packages/core/` WikiLink extension
- Changes to `packages/server/` (the `/api/pages`, `/api/page-headings` endpoints)
- Changes to the backlink panel or page-headings types added by PR #71
- Adding new wiki-link features (section anchors, mentions, etc.)
- Changing the fuzzysort filtering logic or keys
- Changing the menu's visual design or per-mode rendering branches

---

## 7. Test Scenarios

### Page-mode regression (P0 — all must pass)

| ID | Scenario | Expected |
|----|----------|----------|
| R01 | Type `[[` in an empty paragraph | Menu opens with "Loading pages…", then populates with pages from /api/pages |
| R02 | Type `[[my` | Menu filters to pages matching "my" via fuzzysort on title + docName |
| R03 | Type `[[My Page` then Enter | Wiki-link inserted with target=matching page docName, `[[My Page` trigger text removed |
| R04 | Type `[[nonexistent` | "Insert unresolved link" option appears with action label `Insert unresolved link "nonexistent"` |
| R05 | Type `[[` then Escape | Menu closes, `[[` text remains |
| R06 | Type `[[` then click an item | Wiki-link inserted, trigger text removed |
| R07 | Type `word[[page` (mid-word trigger) | Menu opens — no prefix restriction for wiki-links |
| R08 | Type `[[Done]]` (close with `]]`) | Menu closes when first `]` is typed (regex excludes `]`, match fails) |
| R09 | Arrow Down/Up navigation in menu | Selection moves through items |
| R10 | Tab inserts selected item (same as Enter) | Wiki-link inserted |
| R11 | /api/pages returns error | Error message shown, "insert unresolved link" still available |
| R12 | Menu ARIA: `role="listbox"`, `role="option"`, `aria-selected` | Preserved from current implementation |
| R13 | Menu positions below `[[` trigger with ~4px offset | Floating UI `offset(4)` middleware |
| R14 | Menu near viewport bottom | Flips above the trigger (Floating UI `flip()`) |

### Anchor-mode regression (P0 — preserved from PR #53)

| ID | Scenario | Expected |
|----|----------|----------|
| R15 | Type `[[release-notes#` | Menu switches to anchor mode; shows "Loading headings for release-notes…" then lists H1-H6 items from /api/page-headings?docName=release-notes |
| R16 | Type `[[release-notes#ch` | Headings filter to fuzzy match on heading `text` against `ch` |
| R17 | Anchor item select (click or Enter) | Wiki-link inserted with `{ target: 'release-notes', anchor: <slug>, alias: null }` |
| R18 | Type `[[unknown-page#` | Menu shows "No headings in unknown-page" (empty headings array, treated as empty to avoid retry) |
| R19 | Type `[[foo#bar` then Enter with no item selected | Fallback inserts wiki-link with `{ target: 'foo', anchor: 'bar', alias: null }` |
| R20 | Menu header in anchor mode | Shows `pageTarget` in uppercase tracking-wide style; items render as `H<level>` + text with indent based on level |

### Atom deletion regression (P0 — preserved from PR #53)

| ID | Scenario | Expected |
|----|----------|----------|
| R21 | Cursor after wikiLink atom, Backspace (suggestion inactive) | wikiLink atom deleted |
| R22 | Cursor before wikiLink atom, Delete (suggestion inactive) | wikiLink atom deleted |
| R23 | Cursor after wikiLink atom, Backspace while suggestion ACTIVE | Suggestion navigation — no atom deletion (handled by Suggestion's onKeyDown, which falls through for Backspace) |

### Unit tests (P0 — must not regress)

- `buildSuggestionItems` tests (`wiki-link-suggestion.test.ts`) — keep passing. Extract + re-export preserves the pure-function surface.
- Add new unit tests for `parseQuery`, `buildAnchorItems` (both pure functions, easy to test).

---

## 8. Decision Log

| # | Decision | Resolution | Status | Confidence |
|---|----------|-----------|--------|------------|
| D0 | **Whether to migrate at all** — full migration vs Floating-UI-only vs split PRs | **Full migration, single PR (Option C).** Evaluated three options post-rebase: (A) Floating UI only on custom plugin (~40-60 LOC), (B) Split into two PRs (small Floating UI first, migration later), (C) Full migration in one PR. Chose C despite reduced LOC savings (492 → ~375-400, ~20% vs prior 47%) because: (1) architectural alignment with slash-command standardizes how suggestion menus are implemented in this codebase; (2) bundling avoids a second review cycle on the same file; (3) error boundary + Floating UI + collaborative-lifecycle-safety all land in one reviewable unit; (4) the ~100 lines of ongoing maintenance surface saved compound over time. Acknowledged trade-offs: 800 lines of one-PR churn on a file that received 154 net lines from mike-inkeep in the last 2 weeks (PR #53 + PR #71). Mitigation: no current in-flight wiki-link work at merge time is a prerequisite (see §11 coordination). "Architectural alignment" is valued here even without a third named consumer on the roadmap — two unified suggestion systems is simpler than one unified + one custom. | **DIRECTED (user)** | HIGH |
| D1 | Foundation: custom `findSuggestionMatch` vs built-in `char` | **Custom matcher.** Built-in regex doesn't support paired delimiters — `[[query]]` needs to stop at first `]`. Custom function uses the existing `/\[\[([^\]]*)$/` regex. Verified: `findSuggestionMatch` is a configurable option (source line 80). Regex allows `#` inside query so anchor mode works transparently. | LOCKED | HIGH |
| D2 | Async items: Suggestion native vs manual fetch-in-render | **Suggestion native for both modes.** `items()` callback supports async (`await` at source line 196). Both `/api/pages` and `/api/page-headings` fetched inside the same `items()` callback, branching on `parseQuery(query).mode`. | LOCKED | HIGH |
| D3 | Prefix restriction: `allowedPrefixes: null` vs `[' ']` | **`null` (no restriction).** Wiki-links trigger anywhere including mid-word (`word[[page`). Unlike slash commands where mid-word trigger is a regression, mid-word `[[` is valid wiki-link syntax. | LOCKED | HIGH |
| D4 | Floating UI: match slash-command.ts pattern | **Yes.** Same `computePosition` + `autoUpdate` + `flip` + `offset(4)` + `size` middleware. Consistent positioning across all suggestion menus. | DIRECTED | HIGH |
| D5 | Menu component: rewrite or update | **Update, no prop removal.** All existing props (`items`, `query`, `selectedIndex`, `onSelect`, `loading`, `error`, `mode`, `pageTarget`, `anchorQuery`) are load-bearing for per-mode rendering. Only add Floating UI CSS var. | DIRECTED | HIGH |
| D6 | Atom deletion: `addKeyboardShortcuts` spike → separate plugin fallback | **Spike `addKeyboardShortcuts` on the wiki-link extension first; fall back to separate plugin if interference reproduces.** Suggestion's `render().onKeyDown` only fires when a suggestion is active — atom deletion must work when the menu is closed. PR #53's implementation used `handleKeyDown` in the same plugin, citing `addKeyboardShortcuts` interference with TipTap's built-in `handleBackspace` chain. That rationale was context-specific (PR #53's plugin had priority 200 and was not the wiki-link extension itself). In the migrated world, putting atom-deletion shortcuts directly on the wiki-link extension (same priority 200, bound to the mark's own schema) may not have the same interference. Implementation order: (a) spike `addKeyboardShortcuts` with a `wikiLinkSuggestionKey.getState(view.state)?.active` guard; (b) test R21/R22/R23 pass; (c) if any interference manifests (e.g., Backspace on plain text fails), fall back to the separate ProseMirror plugin approach. Both paths preserve behavior. | DIRECTED | HIGH |
| D7 | Anchor-mode fallback (Enter with no item selected) | **Read plugin state from `editor.state` inside `command`.** `wikiLinkSuggestionKey.getState(editor.state).query` gives the raw query. `parseQuery(query)` yields `{ mode, pageTarget, anchorQuery }`. Insert `{ target: pageTarget, anchor: anchorQuery.trim() || null }` when `mode === 'anchor'`. Preserves PR #53 fallback behaviour. | LOCKED | HIGH |
| D8 | Per-mode loading label on initial open AND mode switch | **Push `{loading, mode, pageTarget, anchorQuery}` in BOTH `onBeforeStart` (initial open) and `onBeforeUpdate` (mode switch when user types `#`).** Menu component already branches on mode for "Loading pages…" vs "Loading headings for <pageTarget>…" — requires these props before `items()` resolves. Derive from `parseQuery(props.query ?? '')` at each render callback. Without `onBeforeUpdate`, the loading label would not render during an anchor-mode fetch triggered mid-session (regressing R15). | LOCKED | HIGH |
| D9 | Page-fetch concurrency: 1-flag vs 2-flag vs Promise-dedupe | **Two-flag guard: `!pagesLoaded && !pagesFetching`.** The current implementation calls `fetchPages()` exactly once in `view().update`'s `if (!renderer)` first-mount branch — guaranteed one fetch per menu open. The migration moves the fetch inside `items()`, which re-runs on every keystroke. A single `!pagesLoaded` guard doesn't prevent concurrent fetches because the flag only flips after `await` resolves. A two-flag guard (set `pagesFetching = true` before `await`, `finally { pagesFetching = false }`) blocks concurrent fetches while matching the exact pattern anchor-mode already uses (`anchorFetchingFor: string \| null`). Promise-dedupe was considered and rejected for asymmetry with anchor mode and for adding ~10 more LOC than the flag approach. | LOCKED | HIGH |

---

## 9. Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|-------------|
| A1 | Custom `findSuggestionMatch` receives `$position` and its return type is `{ range, query, text } \| null` | **VERIFIED** | Read from source — the config parameter includes `$position` and the return matches our function signature. |
| A2 | Suggestion's lifecycle callbacks (`onBeforeStart`, `onBeforeUpdate`, `onStart`, `onUpdate`, `onKeyDown`, `onExit`) work the same with a custom matcher | HIGH | The custom matcher only replaces the match detection. Lifecycle is independent of how the match was found. |
| A3 | Loading state is communicated via `onBeforeStart`/`onBeforeUpdate` (loading=true) → `await items()` → `onStart`/`onUpdate` (loading=false, items populated) | **VERIFIED** | Source lines 189-209: `onBeforeStart` fires BEFORE `await items()` on open, `onBeforeUpdate` fires BEFORE `await items()` on query change, `onStart`/`onUpdate` fire AFTER. All six hooks implemented. |
| A4 | `wikiLinkSuggestionKey.getState(editor.state)` returns Suggestion's state shape `{ active, range, query: string \| null, text: string \| null, composing, dismissedRange, decorationId }` | **VERIFIED** | Source lines 221-234 (init) and 311-315 (apply). `query` is `string` when `active === true`, `null` when inactive. Always null-guard via `?? ''` before passing to `parseQuery`. |
| A5 | `items()` callback is re-awaited on every query change (not just initial open) | **VERIFIED** | Source line 195-200: `props.items = await items({ editor, query: state.query });` — called whenever `handleChange` or `handleStart` is true, i.e., on query change or open. |
| A6 | Registering two plugins from `addProseMirrorPlugins` is supported and preserves priority | **VERIFIED** | `@tiptap/core/dist/index.js` lines 3706-3708: `const proseMirrorPlugins = addProseMirrorPlugins(); plugins.push(...proseMirrorPlugins);` — Plugin[] spread preserves all. Extension `priority: 200` applies to all plugins returned. |

---

## 10. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Custom `findSuggestionMatch` receives different parameters than expected | Low | High | Verified from source. Type assertion at call site. |
| R2 | Suggestion's Escape handling conflicts with wiki-link's current behavior | Low | Medium | Suggestion handles Escape internally. Current behavior is the same (close menu). |
| R3 | Backspace while suggestion ACTIVE: Suggestion's `onKeyDown` returning `false` for Backspace — does ProseMirror then run the atom-deletion plugin's Backspace handler? | Medium | Low | Both active and inactive paths must be preserved. When active: suggestion `onKeyDown` should return false for Backspace (passing through to default edit), atom-deletion plugin is registered but its handler returns false when suggestion is active (guard via `wikiLinkSuggestionKey.getState(view.state)?.active`). Test with R23. |
| R4 | Anchor-mode fetch invalidation: user types `[[release-notes#`, fetch starts, then deletes back to `[[release-notes` — stale fetch resolves and sets `cachedHeadings.set('release-notes', ...)`. Benign (cache hit on re-entry). | Low | Low | No action needed — caching is per-docName and idempotent. |
| R5 | Menu rendering `loading: true` with undefined `mode` before items resolve | Low | Low | Always call `parseQuery(props.query ?? '')` at the start of each render callback (`onBeforeStart`, `onBeforeUpdate`, `onStart`, `onUpdate`) and pass `mode`/`pageTarget`/`anchorQuery` before items resolve. Loading-state transition on query change uses `onBeforeUpdate`, not `onUpdate` (see D8). |
| R6 | Suggestion's `items()` rerun on every query change causes anchor fetch to fire in the `items` callback and also from the `onUpdate` side — race condition | Low | Medium | Fetch is guarded by `!cachedHeadings.has(pageTarget) && anchorFetchingFor !== pageTarget`. Second concurrent call short-circuits. The anchor fetch only lives in `items()` (not duplicated in render lifecycle like the current implementation). |
| R7 | The 492-line custom plugin has subtle behaviours (e.g., `selectedIndex` clamping on items change, menu destroy-on-coordsAtPos-error) that aren't captured in test scenarios | Medium | Medium | Manual QA against current behaviour before/after. Compare screencasts side-by-side. The atom-deletion plugin extraction preserves the exact keyboard behaviour. |
| R8 | Page-mode `fetchPages()` concurrent invocations on fast keystrokes | Medium | Low | `items()` re-runs on every query change; before `pagesLoaded` flips, multiple invocations can fire `fetchPages()` simultaneously. Mitigation: two-flag guard (`!pagesLoaded && !pagesFetching`, see §3.3 and D9). `pagesFetching` flips to `true` before `await fetchPages()` and `false` in `finally`. Symmetric with anchor-mode's `anchorFetchingFor` pattern. |

---

## 11. Agent Constraints

**SCOPE:**
- `packages/app/src/editor/extensions/wiki-link-suggestion.ts` — rewrite
- `packages/app/src/editor/extensions/wiki-link-suggestion.test.ts` — extend with `parseQuery` / `buildAnchorItems` tests (keep existing `buildSuggestionItems` tests passing)
- `packages/app/src/editor/wiki-link-suggestion/WikiLinkSuggestionMenu.tsx` — minimal (Floating UI CSS var only)
- `packages/app/src/editor/extensions/wiki-link.ts` — registration change only (`addProseMirrorPlugins` returns two plugins)

**EXCLUDE:** All other files. Specifically:
- No changes to `packages/core/` WikiLink extension
- No changes to `wiki-link-helpers.ts`
- No changes to `/api/pages` endpoint
- No changes to `slash-command.ts` or any other extension

**STOP_IF:**
- The custom `findSuggestionMatch` doesn't receive `$position` (API mismatch)
- `wiki-link-suggestion.test.ts` breaks with the migration
- `]]` no longer closes the menu (paired delimiter regression)
- Anchor mode (`[[page#heading]]`) regresses — wrong items, wrong fetch, wrong attrs, wrong menu header
- Atom deletion (Backspace/Delete on wikiLink) regresses — different keyboard handling when suggestion is active vs inactive

**PRE-MERGE COORDINATION (D0 + R2 mitigation):**
Before merging, verify no wiki-link-touching PR is open or imminent from mike-inkeep (author of PR #53 / PR #71) or any other contributor. Quick check: `gh pr list --search "wiki" --state open` and scan titles. The migration rewrites the full suggestion file; it will merge-conflict with any concurrent surgical edit. If a conflicting PR is in flight, either wait for it to merge first (and rebase this spec again) or coordinate a landing order.

**ASK_FIRST:**
- If the loading state requires a fundamentally different approach than the render lifecycle
- If the menu component needs structural changes beyond prop removal
