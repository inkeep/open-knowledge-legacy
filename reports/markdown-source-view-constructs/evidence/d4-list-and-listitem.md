# Evidence: D4 — list / listItem

**Dimension:** D4 — Source-view rendering of bullet, ordered, and task lists
**Date:** 2026-04-14

---

## Key references

- `@lezer/markdown` grammar — `BulletList`, `OrderedList`, `ListItem`, `TaskMarker` (T1)
- `/tmp/cm-rich-markdoc/src/richEdit.ts` — reference `decorationBullet` handling (T1)
- https://markdown-all-in-one.github.io/docs/guide/list.html — VS Code extension list UX (T1)
- https://github.com/linsir/markdown-it-task-checkbox — task-list widget pattern (T1)
- https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-task-lists — GFM task list semantics (T1)
- https://forum.obsidian.md/t/live-preview-better-support-of-code-blocks-in-lists/31352 — nesting bugs (T2)

---

## @lezer/markdown nodes

**Finding D4-1:** `BulletList` and `OrderedList` are top-level composite nodes. `ListItem` is a direct child containing arbitrary block content. `ListMark` tokens represent the `-`/`+`/`*`/`1.` markers. GFM adds `TaskMarker` as a child of `ListItem` representing `[ ]` or `[x]`.
**Confidence:** CONFIRMED (T1)

Nested lists parse as nested `BulletList`/`OrderedList` under a `ListItem`.

---

## Pathology

Long list item `- this is a very long list item wrapping to multiple visual lines` has the `- ` marker only at logical-line start. Wrapped continuation reverts to column 0, breaking the "this still belongs to the list item" visual cue. Nested-list indentation is content-indentation (CommonMark: content indented past marker width + depth nesting).

---

## CM6 primitive fit

### Hanging indent via `Decoration.line`

Classical hanging-indent CSS:

```css
.cm-list-item-line {
  text-indent: -2ch;
  padding-left: 2ch;
}
```

Continuation lines indent to align under content (not under the marker). For nested lists, per-depth `padding-left` scales with depth.

### Marker styling via `Decoration.mark`

```css
.cm-list-marker {
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
}
```

Target `ListMark` tokens; optionally hide markers on cursor-outside (Obsidian Live Preview style).

### Task checkbox interactivity via `Decoration.replace`

```ts
class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super(); }
  toDOM(view: EditorView) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.addEventListener('change', () => {
      view.dispatch({ changes: { from: this.pos, to: this.pos + 3,
        insert: this.checked ? '[ ]' : '[x]' } });
    });
    return input;
  }
  ignoreEvent() { return false; }
}
```

Replace `[ ]`/`[x]` range with the widget. Click toggles state. Cursor entry reveals source for keyboard editing.

### Nested-list depth

Count enclosing `ListItem` ancestors via `syntaxTree().resolveInner(pos).parent?.parent` walk. Apply per-depth class or CSS-variable-driven indent.

---

## Per-product findings

### Obsidian

**Source Mode:**
- Markers (`-`, `1.`, `[ ]`) remain visible
- Wrapped continuation reverts to column 0 (no explicit hang-indent observed)
- Nested lists: content indentation alone provides visual cue (no extra styling)
- Task items are text `[ ]`/`[x]`; no interactive checkbox in source mode
**Confidence:** INFERRED (T2 — community forum observations)

**Live Preview:**
- Renders as HTML `<ul>` / `<ol>` with markers hidden
- Task items become interactive HTML `<input type="checkbox">` widgets
- Known bug: code blocks in list items don't render properly (forum #31352)
- Known bug: lists in blockquotes fail (forum #30849)
**Confidence:** CONFIRMED (T2)

### VS Code + Markdown All in One

- Syntax coloring on `ListMark`; no hanging indent
- `Tab` / `Backspace` change list nesting level
- `Enter` continues list with matching marker
- Config `list.indentationSize: 'inherit' | 2 | 4`
- No interactive checkbox toggle in source view (text-only)
- Auto-renumber ordered lists available in some community extensions
**Confidence:** CONFIRMED (T1)
**Evidence:** https://markdown-all-in-one.github.io/docs/guide/list.html

### SilverBullet

CM6-based. Documented support for bullets + task lists; hybrid reveal-on-cursor for some constructs. Specific list-level CSS decoration not confirmed in accessible public sources.
**Confidence:** UNRESOLVED (T2)

### codemirror-rich-markdoc

Applies `decorationBullet` class to `ListMark` nodes in the context `['BulletList', 'ListItem']`. The line `widgets.push(decorationBullet.range(node.from, node.to))` fires when cursor is NOT at `node.from` or `node.from + 1` — a cursor-reveal variant for bullets specifically.
**Confidence:** CONFIRMED (T1 — source-verified)
**Evidence:** `/tmp/cm-rich-markdoc/src/richEdit.ts:59-61`

```ts
if (node.name === 'ListMark' && node.matchContext(['BulletList', 'ListItem']) &&
    cursor.from != node.from && cursor.from != node.from + 1)
  widgets.push(decorationBullet.range(node.from, node.to));
```

No task-checkbox widget in this reference; bullets get mark styling only.

### MDXEditor (Lexical-based)

Lists plugin with full interactive task items. WYSIWYG primary; source toggle available via `diffSourcePlugin`.
**Confidence:** CONFIRMED (T1)
**Evidence:** https://mdxeditor.dev/editor/docs/basic-formatting

### HedgeDoc / Typora / Marktext / Milkdown

Typical pattern: source view = plain text with syntax coloring; preview view = rendered HTML list with optional interactive checkboxes. No surveyed product applies hanging indent in the source pane.
**Confidence:** INFERRED (T2/T3)

---

## Task-item interactivity patterns

Three interaction models observed:

1. **Click-to-toggle widget** (Obsidian Live Preview, MDXEditor, Milkdown): clicking the rendered widget toggles state immediately, updating the underlying document
2. **Edit-mode entry** (codemirror-rich-markdoc-style approach, though not implemented for tasks specifically): cursor entry reveals source; user types character edit to toggle
3. **No interactivity** (VS Code default, HedgeDoc source pane, Obsidian Source Mode): task text is plain; manual edit required

**Confidence:** CONFIRMED across three model types

---

## Nested-list depth cues

Observed patterns:

- **Indentation-only** (most products): rely on CommonMark content-indentation; no additional visual cue
- **Auto-indent on Enter** (VS Code MAIO, Typora, Obsidian): keyboard-driven depth management
- **Outliner-style collapse** (Obsidian community "Outliner" plugin): per-item collapse/expand; not default
- **Color/brightness per depth**: NOT observed in any surveyed product for lists (unlike blockquotes where nested-depth color ramping is occasionally seen)

---

## Known edge cases

- **Tight vs loose lists:** CommonMark distinguishes via blank lines; some editors hide the distinction in source
- **Ordered-list marker variants:** `1.`, `1)`, `a.`, `i)` — Roman numerals and letters rare but supported in CommonMark
- **Task items with nested lists:** `- [x] parent / - [ ] child` — generally works
- **Fenced code in list item:** Requires precise indentation; reported issues in multiple products (MarkText #132, Typora)
- **Blockquote containing list:** Known Obsidian rendering bug (forum #30849)

---

## Gaps / follow-ups

- **SilverBullet list handling:** specific decorations not confirmed in public source pass
- **Hanging indent as shipped default:** no surveyed product ships hanging indent for wrapped list-item continuation — all rely on CommonMark's content-indent which doesn't visually show up inside CM's flat line DOM
- **Checkbox widget interaction + CRDT collaboration:** how do interactive checkboxes compose with y-codemirror remote edits? Unresolved in surveyed sources
- **Auto-renumber:** community extensions exist but not a universal feature
