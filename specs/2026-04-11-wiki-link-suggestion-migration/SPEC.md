# SPEC: Wiki-Link Suggestion Migration to @tiptap/suggestion

**Status:** Draft
**Created:** 2026-04-11
**Baseline commit:** 0e5c31d (origin/main head)
**Implementer:** AI coding agent (Claude Code)
**Location:** `packages/app/src/editor/` only — `extensions/wiki-link-suggestion.ts`, `wiki-link-suggestion/WikiLinkSuggestionMenu.tsx`, `extensions/wiki-link.ts` (registration change)
**Nature:** Architectural refactor to unify suggestion systems. Migrates the wiki-link `[[` suggestion from a custom ProseMirror Plugin to `@tiptap/suggestion`, matching the pattern established by PR #51 (slash command generalization). Pure view-layer change with zero user-visible behavior regression.
**Target PR:** Direct to main. Small, focused, reviewable in one sitting.

**Pace:** Fast. Single-phase refactor. Same pattern as PR #51 but smaller scope.

---

## 1. Problem Statement (SCR)

**Situation:** The editor has two suggestion systems: slash commands (`/`) using `@tiptap/suggestion` (migrated in PR #51), and wiki-links (`[[`) using a custom ProseMirror Plugin + PluginKey state machine (added in PR #42). The slash command migration established `@tiptap/suggestion` as the canonical pattern — community-proven, collaborative-safe, with Floating UI positioning via the established `computePosition` + `autoUpdate` pattern.

**Complication:** The wiki-link suggestion (338 lines) duplicates every facility that `@tiptap/suggestion` provides:
- Trigger detection via regex in `Plugin.state.apply()` (Suggestion handles this internally)
- Keyboard handling via `handleKeyDown` in `Plugin.props` (Suggestion exposes `render().onKeyDown`)
- Popup lifecycle via custom `view()` + `ReactRenderer` (Suggestion exposes `render()` callbacks)
- Positioning via raw `coordsAtPos` (Suggestion provides `clientRect` for Floating UI integration)

The custom plugin also **lacks** what the slash command gained from migration:
- No Floating UI positioning — menu doesn't flip near viewport edge, doesn't track scroll, no dynamic max-height
- No collaborative-safe `shouldShow` option
- No error boundary on `insertWikiLink` (editor chain can throw on invalid state)
- Inconsistent Escape handling — fires at ProseMirror plugin priority instead of through Suggestion's internal lifecycle

**Resolution:** Migrate to `@tiptap/suggestion` with a **custom `findSuggestionMatch` function** (not the built-in `char`-based matching). The built-in regex doesn't support paired delimiters — `[[query]]` needs to stop matching at the first `]`, which the built-in `char` parameter can't express. `@tiptap/suggestion` exposes `findSuggestionMatch` as a configurable override (confirmed from source at line 80), so the custom function uses the existing `/\[\[([^\]]*)$/` regex while gaining all of Suggestion's lifecycle benefits.

---

## 2. Success Criteria

### Primary: Zero user-visible behavior change
- `[[` triggers the suggestion menu (at start of block, mid-line, mid-word — no prefix restriction)
- Typing narrows results via fuzzysort
- Pages from `/api/pages` appear with title + docName
- Loading spinner while fetching
- Error state with graceful fallback message
- "Insert unresolved link" option when no pages match
- Enter/Tab inserts selected wiki-link
- Escape closes menu
- Mouse click inserts selected item
- `]]` typed manually closes the menu (first `]` breaks the match)

### Secondary: Architectural alignment
- Uses `@tiptap/suggestion` with custom `findSuggestionMatch`
- Floating UI positioning via `computePosition` + `autoUpdate` + `flip` + `offset` + `size` (matching `slash-command.ts` pattern)
- `--suggestion-menu-max-height` CSS variable driven by `size` middleware
- Error boundary on wiki-link insertion (`try/catch` on `editor.chain()`)
- Net line reduction (338 → ~180 estimated)

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

### 3.3 Async items with loading/error states

**Current behavior:** Menu opens immediately with `loading: true`, then fetches `/api/pages` async. On resolve, items update. On error, shows fallback message + "insert unresolved link" option.

**Target:** Suggestion's `items` callback supports `async` natively (`await items(...)` at source line 196). The render callback manages loading state via closure variables:

```ts
items: async ({ query }) => {
  // cachedPages populated on first fetch, reused on subsequent queries
  if (cachedPages.length === 0 && !fetchError) {
    try {
      cachedPages = await fetchPages();
    } catch (err) {
      fetchError = 'Failed to load pages.';
      console.error('[wiki-link-suggestion] fetch error:', err);
    }
  }
  return buildSuggestionItems(cachedPages, query);
},
```

**Loading state:** Suggestion's actual lifecycle (verified from source lines 189-209) is: `onBeforeStart` → `await items()` → `onStart`/`onUpdate`. The `onBeforeStart` callback fires BEFORE items are fetched — this is where we mount the menu with `loading: true`. When `items()` resolves, `onStart` fires with `props.items` already populated — this is where we transition to `loading: false`. If the query changes while the menu is open, `onUpdate` fires (also with resolved items).

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

### 3.5 Error boundary on insertion

```ts
command: ({ editor, range, props: item }) => {
  const attrs = item.kind === 'page'
    ? { target: item.docName, alias: null, anchor: null }
    : buildUnresolvedWikiLinkAttrs(item.title);
  if (!attrs) return;

  editor.chain().focus().deleteRange(range).run();
  try {
    editor.chain().focus().insertContent({ type: 'wikiLink', attrs }).run();
  } catch (err) {
    console.error(`WikiLink: insert command threw an error`, err);
  }
},
```

### 3.6 Preserve WikiLinkSuggestionMenu component

The menu component (`WikiLinkSuggestionMenu.tsx`) stays largely unchanged — it's already a pure render function receiving `items`, `query`, `selectedIndex`, `onSelect`, `loading`, `error` as props. The `query` prop is kept (unlike the slash command menu which dropped it) because the wiki-link empty state uses it for a contextual message: `No pages found for "${query.trim()}"`. Add the Floating UI CSS var: `style={{ maxHeight: 'var(--suggestion-menu-max-height, 40vh)' }}`.

---

## 4. Implementation Order

1. Write the custom `wikiLinkMatcher` function (§3.2)
2. Rewrite `wiki-link-suggestion.ts` using `Suggestion<WikiLinkSuggestionItem>()` with custom matcher + async items + Floating UI render lifecycle (§3.1, §3.3, §3.4, §3.5)
3. Update `WikiLinkSuggestionMenu.tsx` — remove `query` prop, add `style={{ maxHeight: 'var(--suggestion-menu-max-height, 40vh)' }}` inline style (§3.6)
4. Update `wiki-link.ts` registration — change from `createWikiLinkSuggestionPlugin(this.editor)` to the Suggestion call
5. Verify quality gates: typecheck + lint + test
6. Manual QA: `[[` triggers menu, pages filter, Enter/Tab inserts, Escape closes, `]]` stops matching

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
- Rewrite `wiki-link-suggestion.ts` to use `@tiptap/suggestion`
- Update `WikiLinkSuggestionMenu.tsx` props + add Floating UI CSS var
- Update `wiki-link.ts` registration
- Add error boundary on insertion
- Preserve all existing behavior: trigger, filter, insert, loading, error states

### Out of Scope
- Changes to `wiki-link.ts` mark extension (schema, serialization)
- Changes to `wiki-link-helpers.ts` (buildUnresolvedWikiLinkAttrs, parseWikiLink)
- Changes to `packages/core/` WikiLink extension
- Changes to `packages/server/` (the `/api/pages` endpoint)
- Adding new wiki-link features
- Changing the fuzzysort filtering logic

---

## 7. Test Scenarios

### Regression (P0 — must pass after refactor)

| ID | Scenario | Expected |
|----|----------|----------|
| R01 | Type `[[` in an empty paragraph | Menu opens with loading spinner, then populates with pages from /api/pages |
| R02 | Type `[[my` | Menu filters to pages matching "my" via fuzzysort |
| R03 | Type `[[My Page` then Enter | Wiki-link inserted with target=matching page docName, `[[My Page` trigger text removed |
| R04 | Type `[[nonexistent` | "Insert unresolved link" option appears |
| R05 | Type `[[` then Escape | Menu closes, `[[` text remains |
| R06 | Type `[[` then click an item | Wiki-link inserted, trigger text removed |
| R07 | Type `word[[page` (mid-word trigger) | Menu opens — no prefix restriction for wiki-links |
| R08 | Type `[[Done]]` (close with `]]`) | Menu closes when first `]` is typed (match stops at `]`) |
| R09 | Arrow Down/Up navigation in menu | Selection moves through items |
| R10 | Tab inserts selected item (same as Enter) | Wiki-link inserted |
| R11 | /api/pages returns error | Error message shown, "insert unresolved link" still available |
| R12 | Menu ARIA: `role="listbox"`, `role="option"`, `aria-selected` | Preserved from current implementation |
| R13 | Menu positions below `[[` trigger with ~4px offset | Floating UI `offset(4)` middleware |
| R14 | Menu near viewport bottom | Flips above the trigger (Floating UI `flip()`) |

---

## 8. Decision Log

| # | Decision | Resolution | Status | Confidence |
|---|----------|-----------|--------|------------|
| D1 | Foundation: custom `findSuggestionMatch` vs built-in `char` | **Custom matcher.** Built-in regex doesn't support paired delimiters — `[[query]]` needs to stop at first `]`. Custom function uses the existing `/\[\[([^\]]*)$/` regex. Verified: `findSuggestionMatch` is a configurable option (source line 80). | LOCKED | HIGH |
| D2 | Async items: Suggestion native vs manual fetch-in-render | **Suggestion native.** `items()` callback supports async (`await` at source line 196). Simpler than manual fetch-in-view(). | LOCKED | HIGH |
| D3 | Prefix restriction: `allowedPrefixes: null` vs `[' ']` | **`null` (no restriction).** Wiki-links trigger anywhere including mid-word (`word[[page`). Unlike slash commands where mid-word trigger is a regression, mid-word `[[` is valid wiki-link syntax. | LOCKED | HIGH |
| D4 | Floating UI: match slash-command.ts pattern | **Yes.** Same `computePosition` + `autoUpdate` + `flip` + `offset(4)` + `size` middleware. Consistent positioning across all suggestion menus. | DIRECTED | HIGH |
| D5 | Menu component: rewrite or update | **Update.** Keep `query` prop (needed for contextual empty state message). Add inline `maxHeight` CSS var style. Keep everything else. | DIRECTED | HIGH |

---

## 9. Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|-------------|
| A1 | Custom `findSuggestionMatch` receives `$position` and its return type is `{ range, query, text } \| null` | **VERIFIED** | Read from source — the config parameter includes `$position` and the return matches our function signature. |
| A2 | Suggestion's lifecycle callbacks (`onStart`, `onUpdate`, `onKeyDown`, `onExit`) work the same with a custom matcher | HIGH | The custom matcher only replaces the match detection. Lifecycle is independent of how the match was found. |
| A3 | Loading state can be communicated via the render lifecycle | HIGH | `onStart` fires before `items()` resolves (items is async). Render with `loading: true` in `onStart`, transition to `loading: false` in `onUpdate` when items arrive. |

---

## 10. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Custom `findSuggestionMatch` receives different parameters than expected | Low | High | Verified from source. Type assertion at call site. |
| R2 | Suggestion's Escape handling conflicts with wiki-link's current behavior | Low | Medium | Suggestion handles Escape internally. Current behavior is the same (close menu). |
| R3 | Loading state timing: `onStart` fires before items resolve but menu renders empty | Medium | Low | Render with `loading: true` in `onStart`. If items resolve instantly (cached), `onUpdate` fires immediately after. |

---

## 11. Agent Constraints

**SCOPE:**
- `packages/app/src/editor/extensions/wiki-link-suggestion.ts`
- `packages/app/src/editor/wiki-link-suggestion/WikiLinkSuggestionMenu.tsx`
- `packages/app/src/editor/extensions/wiki-link.ts` (registration change only — `addProseMirrorPlugins`)

**EXCLUDE:** All other files. Specifically:
- No changes to `packages/core/` WikiLink extension
- No changes to `wiki-link-helpers.ts`
- No changes to `/api/pages` endpoint
- No changes to `slash-command.ts` or any other extension

**STOP_IF:**
- The custom `findSuggestionMatch` doesn't receive `$position` (API mismatch)
- Wiki-link tests break with the migration
- `]]` no longer closes the menu (paired delimiter regression)

**ASK_FIRST:**
- If the loading state requires a fundamentally different approach than the render lifecycle
- If the menu component needs structural changes beyond prop removal
