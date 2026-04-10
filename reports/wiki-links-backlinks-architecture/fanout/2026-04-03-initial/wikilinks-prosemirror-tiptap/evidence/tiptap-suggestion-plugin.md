# Evidence: TipTap Suggestion Plugin Architecture

**Source:** `@tiptap/suggestion` package  
**Repo:** https://github.com/ueberdosis/tiptap  
**Local path:** `/Users/edwingomezcuellar/.claude/oss-repos/tiptap/packages/suggestion/src/`

## Trigger Detection: `findSuggestionMatch.ts`

The core matching engine that detects when a trigger character (e.g., `@`, `[[`) has been typed.

**File:** `packages/suggestion/src/findSuggestionMatch.ts`

### Regex Construction (lines 25-31)

```typescript
const escapedChar = escapeForRegEx(char)
const suffix = new RegExp(`\\s${escapedChar}$`)
const prefix = startOfLine ? '^' : ''
const finalEscapedChar = allowToIncludeChar ? '' : escapedChar
const regexp = allowSpaces
  ? new RegExp(`${prefix}${escapedChar}.*?(?=\\s${finalEscapedChar}|$)`, 'gm')
  : new RegExp(`${prefix}(?:^)?${escapedChar}[^\\s${finalEscapedChar}]*`, 'gm')
```

For `char: '[['`, this produces: `/(?:^)?\[\[[^\s\[\[]*/gm` — matches `[[` followed by non-whitespace chars.

### Text Source (line 33)

```typescript
const text = $position.nodeBefore?.isText && $position.nodeBefore.text
```

Matches against the text node immediately before the cursor position.

### Query Extraction (line 73)

```typescript
query: match[0].slice(char.length)
```

Slices off the trigger character length (2 for `[[`), leaving just the query text.

### Multi-Character Support

`escapeForRegEx` at `packages/core/src/utilities/escapeForRegEx.ts:2-4` properly escapes `[` characters, so `char: '[['` works out of the box.

---

## Plugin State Machine: `suggestion.ts`

**File:** `packages/suggestion/src/suggestion.ts`

### Configuration Interface (lines 29-178)

Key options for wikilink adaptation:
- `char` (line 81): trigger string, default `'@'` — accepts multi-char strings
- `allowSpaces` (line 91): query can contain spaces — useful for page titles
- `findSuggestionMatch` (line 178): can override the entire matching function
- `command` (line 135): callback when item is selected
- `items` (line 149): async function returning suggestion items from query
- `render` (lines 163-170): lifecycle callbacks for popup management

### Internal State Shape (lines 444-462)

```typescript
{
  active: boolean,
  range: Range,        // { from, to } in document
  query: null | string,
  text: null | string,
  composing: boolean,
  decorationId?: string | null,
  dismissedRange: Range | null,
}
```

### State Transitions in `apply()` (lines 468-578)

On every transaction:
1. Check for `exit` metadata (line 479-488)
2. Map dismissed ranges through doc changes (lines 493-498)
3. Check editable + empty selection (line 503)
4. Call `findSuggestionMatch()` (lines 510-517)
5. Gate through `allow()` and `shouldShow()` (lines 522-537)
6. Set `active: true` with match range, query, text

### View Lifecycle (lines 362-438)

```typescript
const moved = prev.active && next.active && prev.range.from !== next.range.from
const started = !prev.active && next.active
const stopped = prev.active && !next.active
const changed = !started && !stopped && prev.query !== next.query
```

Dispatches: `onBeforeStart` → fetch `items` → `onStart` (new), or `onBeforeUpdate` → fetch `items` → `onUpdate` (change), or `onExit` (deactivate).

### Keyboard Handling (lines 582-609)

- Escape: always exits suggestion (lines 594-605), dispatches `exit` metadata
- Other keys: forwarded to `renderer.onKeyDown()` (line 607)

### Decorations (lines 612-634)

```typescript
Decoration.inline(range.from, range.to, {
  nodeName: decorationTag,         // default 'span'
  class: decorationClass,          // default 'suggestion'
  'data-decoration-id': decorationId,
})
```

Wraps trigger+query text in an inline decoration for popup positioning.

---

## Mention Extension: `mention.ts`

**File:** `packages/extension-mention/src/mention.ts`

### Node Spec (lines 153-183)

```typescript
name: 'mention'
priority: 101
group: 'inline'
inline: true
selectable: false
atom: true    // cursor cannot enter, treated as indivisible unit
```

### Attributes (lines 185-226)

- `id` — stored as `data-id` HTML attribute
- `label` — stored as `data-label`
- `mentionSuggestionChar` — tracks which trigger created this mention (`@`, `#`, etc.)

### HTML Parsing (lines 228-234)

```typescript
parseHTML() {
  return [{ tag: `span[data-type="${this.name}"]` }]
}
```

### Multi-Trigger Support (lines 86-98, 353-356)

Supports `suggestions` array for multiple triggers. Each creates a separate Suggestion plugin:

```typescript
addProseMirrorPlugins() {
  return getSuggestions(this).map(Suggestion)
}
```

### Default Command (get-default-suggestion-attributes.ts, lines 52-79)

```typescript
command: ({ editor, range, props }) => {
  editor.chain().focus().insertContentAt(range, [
    { type: extensionName, attrs: { ...props, mentionSuggestionChar: char } },
    { type: 'text', text: ' ' },
  ]).run()
}
```

Replaces trigger+query range with mention node + trailing space.
