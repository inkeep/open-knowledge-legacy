# Evidence: @tiptap/suggestion API compatibility with `[[` trigger

**Date:** 2026-04-11
**Updated:** 2026-04-12 — extended for PR #53 anchor-mode preservation
**Sources:**
- `node_modules/@tiptap/suggestion/dist/index.js` (installed version matches `@tiptap/core@3.22.3`)
- `packages/app/src/editor/extensions/wiki-link-suggestion.ts` @ `39fcd87` (492 lines, post-PR #53)

## Finding: Built-in `char: '[[''` does NOT work for wiki-links

**Confidence:** CONFIRMED (source reading)

The built-in `findSuggestionMatch` constructs a regex from the `char` parameter:

```js
const escapedChar = escapeForRegEx(char);  // '[[' → '\[\['
const regexp = allowSpaces
  ? new RegExp(`${prefix}${escapedChar}.*?(?=\\s${finalEscapedChar}|$)`, "gm")
  : new RegExp(`${prefix}(?:^)?${escapedChar}[^\\s${finalEscapedChar}]*`, "gm");
```

**Problem: no closing-delimiter awareness.** The regex stops at whitespace (default) or at the trigger char itself, but NOT at `]`. So:
- `[[PageName]]` → query = "PageName]]" (should stop at first `]`)
- `[[My Page` with `allowSpaces: false` → query = "My" (stops at space — can't match multi-word page names)
- `[[My Page` with `allowSpaces: true` → query = "My Page" ✓ but `[[Done]]` → query = "Done]]" ✗

Wiki-links use **paired delimiters** (`[[...]]`). The current regex `/\[\[([^\]]*)$/` correctly matches `[[` followed by any chars that are NOT `]` — so it stops matching when the first `]` is typed. @tiptap/suggestion's built-in regex has no concept of "stop at closing delimiter."

## Finding: Custom `findSuggestionMatch` override IS supported

**Confidence:** CONFIRMED (source reading)

Line 80 of the Suggestion source:
```js
findSuggestionMatch: findSuggestionMatch2 = findSuggestionMatch,
```

The `findSuggestionMatch` option is destructured with a default — passing your own function replaces the built-in. The function signature is:

```ts
(config: {
  char: string;
  allowSpaces: boolean;
  allowToIncludeChar: boolean;
  allowedPrefixes: string[] | null;
  startOfLine: boolean;
  $position: ResolvedPos;
}) => { range: { from: number; to: number }; query: string; text: string } | null
```

A custom function can use the exact `/\[\[([^\]]*)$/` regex while still benefiting from Suggestion's lifecycle (render callbacks, Escape handling, items async, decoration).

## Finding: Suggestion's `items` callback supports async

**Confidence:** CONFIRMED (source reading, line 196)

```js
props.items = await items({ editor, query: state.query });
```

The `items` callback result is `await`ed. The wiki-link's `fetchPages()` + `buildSuggestionItems()` can return a Promise directly.

## Finding: `allowedPrefixes` behavior for wiki-links

Wiki-link `[[` should trigger anywhere (including mid-word: "see[[page"). The current regex has no prefix restriction. For the custom `findSuggestionMatch`, the `allowedPrefixes` parameter is passed but can be ignored since we control the match logic. Alternatively, set `allowedPrefixes: null` to skip the prefix check entirely.

## Key difference from slash command migration (PR #51)

The slash command migration used `char: '/'` with the built-in `findSuggestionMatch` — single-char triggers work out of the box. Wiki-links require a custom `findSuggestionMatch` because of the paired-delimiter pattern. This is a design-level difference, not just a config change.

---

## Finding: Anchor mode uses `#` inside the query — regex still holds

**Confidence:** CONFIRMED (regex analysis + source reading wiki-link-suggestion.ts lines 46-57)

PR #53 added anchor-mode suggestions (`[[page#heading]]`). When the user types `#` inside a `[[...`, the plugin's `parseQuery()` splits on the first `#` with non-empty left side:

```ts
export function parseQuery(query: string): ParsedQuery {
  const hashIdx = query.indexOf('#');
  if (hashIdx > 0) {
    return {
      mode: 'anchor',
      pageTarget: query.slice(0, hashIdx),
      anchorQuery: query.slice(hashIdx + 1),
    };
  }
  return { mode: 'page', pageTarget: '', anchorQuery: '' };
}
```

**Key point for the matcher:** `#` must NOT break the match. The regex `/\[\[([^\]]*)$/` excludes only `]` — it accepts `#` as part of the query. So `[[release-notes#ch` matches with `query = "release-notes#ch"`, which `parseQuery` then splits into `{ mode: 'anchor', pageTarget: 'release-notes', anchorQuery: 'ch' }`. No regex change needed.

## Finding: Lifecycle order is `onBeforeStart` → `await items()` → `onStart`/`onUpdate`

**Confidence:** CONFIRMED (source reading lines 189-209)

```js
// Line 189-191: onBeforeStart called BEFORE items fetch
if (handleStart) {
  (_c = renderer?.onBeforeStart)?.call(renderer, props);
}

// Lines 195-200: items() is awaited
if (handleChange || handleStart) {
  props.items = await items({ editor, query: state.query });
}

// Lines 204-209: onUpdate/onStart called AFTER items resolve
if (handleChange) {
  (_f = renderer?.onUpdate)?.call(renderer, props);
}
if (handleStart) {
  (_g = renderer?.onStart)?.call(renderer, props);
}
```

This drives the loading-state design: mount popup in `onBeforeStart` with `loading: true`, swap to `loading: false` in `onStart`/`onUpdate` once items are available.

## Finding: `items()` fires on every query change

**Confidence:** CONFIRMED (source line 196)

`await items({ editor, query: state.query })` runs whenever `handleChange || handleStart` is true — i.e., on open AND every subsequent query change. Anchor-mode fetching can live entirely inside `items()` because the callback re-fires as the user types `#`.

## Finding: Existing closure state maps 1:1 to new architecture

**Confidence:** CONFIRMED (current implementation reading, lines 119-125)

Current plugin holds six mutable closure variables inside `createWikiLinkSuggestionPlugin(editor)`:

| Variable | Purpose | Retained in new design? |
|---|---|---|
| `cachedPages` | Pages from `/api/pages` | Yes — closure scope in `addProseMirrorPlugins` |
| `pagesLoaded` | Whether first fetch completed | Yes |
| `cachedHeadings: Map` | Per-docName heading arrays | Yes |
| `anchorFetchingFor: string \| null` | In-flight anchor fetch guard | Yes |
| `currentFiltered` | Last rendered items | **Not needed** — Suggestion tracks `props.items` internally |
| `fetchError` | Page-fetch error state | Yes |

The `currentFiltered` field was needed in the custom plugin because `handleKeyDown` reads the current item list on Enter. In the new design, Suggestion's `render().onKeyDown` receives `items` as a closure prop at mount time. The `command` callback receives `props: item` directly (the selected item). No shared mutable list required.

## Finding: `parseQuery`, `buildSuggestionItems`, `buildAnchorItems` are pure

**Confidence:** CONFIRMED (source reading lines 47-102)

All filtering/item-building logic is exported pure functions:

- `parseQuery(query: string): ParsedQuery` — pure
- `filterPages(pages, query): PageItem[]` — pure (uses fuzzysort)
- `filterHeadings(headings, anchorQuery): HeadingEntry[]` — pure
- `buildSuggestionItems(pages, query): WikiLinkSuggestionItem[]` — pure
- `buildAnchorItems(docName, headings, anchorQuery): WikiLinkSuggestionItem[]` — pure

`wiki-link-suggestion.test.ts` currently tests `buildSuggestionItems`. These exports must remain in the new module so the test stays valid with zero changes. The new spec adds unit tests for `parseQuery` and `buildAnchorItems`.

## Finding: Atom deletion cannot live inside Suggestion's onKeyDown

**Confidence:** CONFIRMED (source reading + current implementation lines 188-213)

Suggestion's `render().onKeyDown` only fires when the suggestion is active (source lines 328-333 check `state.active` before dispatching to the renderer). The current implementation handles Backspace/Delete on wikiLink atoms in the `!state.active` branch of `handleSuggestionKeyDown`.

In the new design, the active-state keyboard handling is naturally part of Suggestion. The inactive-state handling (atom deletion) must be a separate ProseMirror plugin. This is fine — ProseMirror plugins compose cleanly via `addProseMirrorPlugins` returning an array.

The current implementation has a comment (lines 183-187) explaining why `handleKeyDown` rather than `addKeyboardShortcuts` is used: the latter creates a separate keymap plugin that interferes with TipTap's built-in `handleBackspace` chain. This comment must be preserved in the new atom-deletion plugin.
