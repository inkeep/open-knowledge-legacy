# Evidence: @tiptap/suggestion API compatibility with `[[` trigger

**Date:** 2026-04-11
**Sources:** `node_modules/@tiptap/suggestion/dist/index.js` (installed version matches `@tiptap/core@3.22.3`)

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
