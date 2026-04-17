# Evidence: D1 + D4 + D7 — ProseMirror / TipTap Clipboard Primitives

**Dimensions:** D1 (primitive inventory + default pipelines + composition), D4 (full-doc Cmd+A edge cases), D7 (drag-and-drop + cut symmetry)
**Date:** 2026-04-15
**Sources:** `prosemirror-view@1.41.8` (local `node_modules/prosemirror-view/src/`), `prosemirror-state`, `prosemirror-model`, `@tiptap/core` (local source), ProseMirror reference manual, ProseMirror discuss forum

---

## Key files referenced

- `node_modules/prosemirror-view/src/clipboard.ts` (full 263 lines) — `serializeForClipboard`, `parseFromClipboard`
- `node_modules/prosemirror-view/src/input.ts:1-150, 560-780` — copy/cut/paste/drag event handlers, `dragMoves`
- `node_modules/prosemirror-view/src/index.ts:240-460, 600-830` — `EditorView.serializeForClipboard`, `someProp` precedence
- `node_modules/prosemirror-view/dist/index.d.ts:550-830` — authoritative EditorProps types
- `node_modules/prosemirror-view/package.json` — confirms `1.41.8`
- `node_modules/prosemirror-state/src/selection.ts:60-90, 340-430` — `Selection.content()`, `AllSelection`
- `node_modules/prosemirror-model/src/node.ts:154-170` — `Node.slice(from, to, includeParents)`
- `node_modules/@tiptap/core/src/Editor.ts:415-455` — TipTap auto-installs `ClipboardTextSerializer` as a core extension
- `node_modules/@tiptap/core/src/extensions/clipboardTextSerializer.ts` (full) — TipTap's plain-text fallback
- `node_modules/@tiptap/core/src/helpers/getTextBetween.ts` — what TipTap's default returns
- `node_modules/@tiptap/core/src/extensions/drop.ts` + `paste.ts` — TipTap event emission (no `copy`/`cut`/`dragstart` emitted)
- `packages/app/src/editor/TiptapEditor.tsx:97-103` — our existing `clipboardTextParser`

---

## Findings

### Finding D1-1: Primitive inventory (CONFIRMED)

| Hook | Signature | Fires on | Read by | Cite |
|---|---|---|---|---|
| `clipboardSerializer` | `DOMSerializer` | copy / cut / drag-start — `text/html` | `serializeForClipboard()` | `clipboard.ts:17` |
| `clipboardTextSerializer` | `(content: Slice, view: EditorView) => string` | copy / cut / drag-start — `text/plain` | `serializeForClipboard()` | `clipboard.ts:36` |
| `transformCopied` | `(slice: Slice, view: EditorView) => Slice` | copy / cut / drag-start — FIRST, mutates slice before html + text serialization | `serializeForClipboard()` | `clipboard.ts:6` |
| `clipboardParser` | `DOMParser` | paste (html path) | `parseFromClipboard()` | `clipboard.ts:83` |
| `clipboardTextParser` | `(text, $context, plain, view) => Slice` | paste (plain path) — after `transformPastedText`, before default line-wrap fallback | `parseFromClipboard()` | `clipboard.ts:55` |
| `transformPastedHTML` | `(html, view) => string` | paste (html path) — before parse | `parseFromClipboard()` | `clipboard.ts:68` |
| `transformPastedText` | `(text, plain, view) => string` | paste (plain path) — before `clipboardTextParser` | `parseFromClipboard()` | `clipboard.ts:49` |
| `transformPasted` | `(slice, view, plain) => Slice` | paste end; ALSO internal drop | `parseFromClipboard()`, `handleDrop()` | `clipboard.ts:108`, `input.ts:736` |
| `handlePaste` | `(view, event, slice) => bool\|void` | after paste slice parsed | `doPaste()` | `input.ts:636` |
| `handleDrop` | `(view, event, slice, moved) => bool\|void` | after drop slice prepared | `handleDrop()` | `input.ts:742` |
| `handleDOMEvents.{copy,cut,paste,drop,dragstart,...}` | `(view, event) => bool\|void` | before built-in handler | `dispatchEvent()` | `input.ts:77-88, 100-104` |
| `dragCopies` | `(event) => bool` | drag-start + drop — overrides default modifier check (mac `altKey` / other `ctrlKey`) | `dragMoves()` | `input.ts:673-679` |

Every row traced to source.

### Finding D1-2: Default copy pipeline (CONFIRMED)

```
User presses Cmd+C / Cmd+X
  → handlers.copy / editHandlers.cut           (input.ts:595)
  → runCustomHandler → handleDOMEvents.copy/cut  [can pre-empt]
  → if selection.empty → return
  → slice = selection.content()                 // = doc.slice(from, to, includeParents=true)
  → serializeForClipboard(view, slice):
      1. slice = transformCopied(slice, view) ?? slice         (clipboard.ts:6)
      2. Unwrap nested-single-child fragments; push wrappers into context array
                                                               (clipboard.ts:9-15)
      3. serializer = clipboardSerializer ?? DOMSerializer.fromSchema(schema)
                                                               (clipboard.ts:17)
      4. wrap.appendChild(serializer.serializeFragment(content, {document: doc}))
      5. Table-cell wrap-map fixup if needed                   (clipboard.ts:21-30)
      6. Attach data-pm-slice="<openStart> <openEnd> [-wrappers] <JSON(context)>"
                                                               (clipboard.ts:32-34)
      7. text = clipboardTextSerializer(slice, view)
               ?? slice.content.textBetween(0, size, "\n\n")
                                                               (clipboard.ts:36-37)
  → event.clipboardData.setData("text/html", dom.innerHTML)     (input.ts:606)
  → event.clipboardData.setData("text/plain", text)             (input.ts:607)
  → if cut: view.dispatch(tr.deleteSelection())                 (input.ts:611)
```

**Order matters:** `transformCopied` fires BEFORE both html and text serialization. The slice passed to `clipboardTextSerializer` is the already-transformed one.

### Finding D1-3: Default paste pipeline (CONFIRMED)

```
User presses Cmd+V
  → editHandlers.paste                          (input.ts:654)
  → handleDOMEvents.paste?                       [can pre-empt]
  → if view.composing && !android → return
  → plain = event.shiftKey && lastKeyCode != 45  (input.ts:662 — Cmd+Shift+V = plain)
  → doPaste(view, text, html, plain, event)
  → parseFromClipboard(view, text, html, preferPlain, $from):
      asText = !!text && (plain || inCode || !html)
      IF asText:
        text = transformPastedText(text, inCode||plain, view) ?? text
        if inCode: slice=Slice(text), transformPasted, return
        slice = clipboardTextParser(text, $context, plain, view) ?? <default: split lines>
                                                               (clipboard.ts:55-66)
      ELSE (html path):
        html = transformPastedHTML(html, view) ?? html
        dom = readHTML(html)
        Read data-pm-slice context if present                  (clipboard.ts:73-80)
        IF slice not already set:
          parser = clipboardParser ?? domParser ?? DOMParser.fromSchema(schema)
          slice = parser.parseSlice(dom, {preserveWhitespace, context, ruleFromNode})
        IF sliceData: addContext + closeSlice                   (clipboard.ts:95)
        ELSE: normalizeSiblings + Slice.maxOpen                 (clipboard.ts:97-105)
      slice = transformPasted(slice, view, asText) ?? slice     (clipboard.ts:108)
  → handlePaste(view, event, slice)?            [can pre-empt]
  → tr.replaceSelection(slice) or replaceSelectionWith(node)
```

### Finding D1-4: Composition rules — `someProp` precedence (CONFIRMED)

Source: `prosemirror-view/src/index.ts:294-314`.

**First-truthy-wins order:**

1. Direct editor props (`this._props`, i.e. what TipTap passes via `editorProps`)
2. Direct plugins (`directPlugins`)
3. State plugins (`state.plugins`)

Marijn's comment at `index.ts:612-615`:

> "Handler functions are called one at a time, starting with the base props and then searching through the plugins (in order of appearance) until one of them returns true. For some props, the first plugin that yields a value gets precedence."

**Quirk:** for function-valued props, "truthy" is the function's RETURN value. A `clipboardTextSerializer` returning `""` is treated as "no value" and `someProp` proceeds to the next plugin — or ultimately `slice.content.textBetween(0, size, "\n\n")`. (This matters when designing opt-out behavior — return `null` to fall through explicitly, or return a non-empty sentinel if empty is the true semantic.)

### Finding D1-5: TipTap auto-installs a default `clipboardTextSerializer` (CONFIRMED)

`@tiptap/core/src/Editor.ts:425-448`:

```ts
const coreExtensions = this.options.enableCoreExtensions
  ? [Editable, ClipboardTextSerializer.configure({ blockSeparator: ... }), Commands, ...]
  : []
```

`@tiptap/core/src/extensions/clipboardTextSerializer.ts:20-43` implements it as a Plugin-based serializer that ignores `slice` and reads the live `state.selection.ranges` via `getTextBetween`. This differs from PM's own default (`slice.content.textBetween`).

**Composition implication:** because TipTap's serializer is plugin-based and direct `editorProps` rank ahead of plugin props, passing `clipboardTextSerializer` in `editorProps` wins over TipTap's default without disabling core extensions. CONFIRMED.

### Finding D4-1: Cmd+A produces `AllSelection` → `slice.openStart=0, openEnd=0` (CONFIRMED)

`prosemirror-state/src/selection.ts:399-425`:

```ts
export class AllSelection extends Selection {
  constructor(doc: Node) {
    super(doc.resolve(0), doc.resolve(doc.content.size))
  }
}
```

`Selection.content()`:
```ts
content() {
  return this.$from.doc.slice(this.from, this.to, true)    // includeParents=true
}
```

`Node.slice(from=0, to=doc.content.size, includeParents=true)` evaluates:
- `$from.depth = 0, $to.depth = 0` at root boundaries
- `depth = includeParents ? 0 : sharedDepth = 0`
- `content = doc.content.cut(0, doc.content.size)` — clone of root fragment
- `openStart = $from.depth - depth = 0`
- `openEnd = $to.depth - depth = 0`

**Result for Cmd+A:**
- `slice.content` = Fragment of top-level blocks (NOT the doc node itself)
- `slice.openStart = 0`
- `slice.openEnd = 0`

CONFIRMED from source.

### Finding D4-2: Partial-block selections open the slice (CONFIRMED)

Authoritative Marijn explanation: https://discuss.prosemirror.net/t/what-is-openstart-and-openend-use-for/3999

> "how many levels are 'open' (only their content is part of the slice, not their start/end token) at both sides."

Selecting from middle of paragraph 1 ("hel[lo") to middle of paragraph 2 ("wo]rld"):
- `slice.content` = Fragment of `[p("llo"), p("wo")]`
- `slice.openStart = 1` (first `<p>` is open — it's a continuation)
- `slice.openEnd = 1`

For a markdown serializer: wrapping `slice.content` in the schema's `topNodeType` produces a valid doc where the first/last block is "incomplete" prose — which serializes to legitimate markdown (the half-paragraph becomes a single paragraph). That's the intuitive user outcome: select "llo" and paste gets "llo".

### Finding D4-3: `__serializedForClipboard` is irrelevant (CONFIRMED NOT FOUND in current version)

Searched `prosemirror-view@1.41.8` — **zero matches** for `__serializedForClipboard` or `__serializeForClipboard`. The legacy internal export was removed in `1.38.0` (2026-02-12) and replaced by the public instance method `view.serializeForClipboard(slice)` (source: `prosemirror-view/src/index.ts:454-456`).

Our markdown-copy work does not need `view.serializeForClipboard()` at all — we're overriding `clipboardTextSerializer`, which is invoked internally by the copy handler. The public method is only needed for code OUTSIDE the copy event (e.g., custom drag-handle libraries serializing a Slice on demand).

CHANGELOG: https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md
Related issue: https://github.com/NiclasDev63/tiptap-extension-global-drag-handle/issues/38

### Finding D4-4: Cut uses the exact same Slice as copy (CONFIRMED)

`input.ts:595`:
```ts
handlers.copy = editHandlers.cut = (view, _event) => {
  ...
  let slice = sel.content(), {dom, text} = serializeForClipboard(view, slice)
  ...
  if (cut) view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta("uiEvent", "cut"))
}
```

Same handler function, same `sel.content()`. Only post-serialization difference: cut dispatches `deleteSelection()`.

One secondary asymmetry: `handlers.copy` is under the unconditional `handlers` table (fires regardless of editable state), while `editHandlers.cut` only fires on editable views — so cut is a no-op on a read-only editor. Source: `input.ts:15-16, 46-54, 100-104`.

### Finding D7-1: Drag-start uses `serializeForClipboard` identically (CONFIRMED)

`input.ts:681-709`:
```ts
handlers.dragstart = (view, _event) => {
  ...
  let draggedSlice = (node || view.state.selection).content()
  let {dom, text, slice} = serializeForClipboard(view, draggedSlice)
  ...
  event.dataTransfer.setData("text/html", dom.innerHTML)
  event.dataTransfer.effectAllowed = "copyMove"
  if (!brokenClipboardAPI) event.dataTransfer.setData("text/plain", text)
  view.dragging = new Dragging(slice, dragMoves(view, event), node)
}
```

**Asymmetry with copy/cut:** the slice source differs.
- Copy/cut: always `selection.content()`.
- Drag-start: can be either `selection.content()` (drag started inside selection) OR a `NodeSelection` around a `draggable` node near the drag target (how draggable block handles work for images, custom blocks).

Both paths feed `serializeForClipboard`, so `transformCopied` + `clipboardTextSerializer` fire identically for drag-start.

### Finding D7-2: Internal drop re-fires `transformPasted` on an already-`transformCopied` slice (CONFIRMED)

`input.ts:728-736` (internal drop branch):
```ts
let slice = dragging && dragging.slice
if (slice) {
  view.someProp("transformPasted", f => { slice = f(slice!, view, false) })    // plain=false
}
```

The dragging slice was already transformed at drag-start (saved at `input.ts:708`). Then `transformPasted` re-fires on drop. So for a round-trip within the same editor, a slice passes through BOTH `transformCopied` AND `transformPasted`.

**External drop** uses `parseFromClipboard` (same as paste). `handleDrop` fires regardless of source.

### Finding D7-3: There is no `handleCut` — symmetry with copy (CONFIRMED)

RFC #3 ("Add handleCut editor property") was filed but never landed: https://github.com/ProseMirror/rfcs/pull/3. To intercept cut specifically, use `handleDOMEvents.cut`.

### Finding D7-4: Event-emission table summary

| Event | `transformCopied` | `clipboardTextSerializer` | `clipboardSerializer` | `transformPasted` | `handleDrop`/`handlePaste` |
|---|---|---|---|---|---|
| `copy` | ✓ | ✓ | ✓ | — | — |
| `cut` | ✓ | ✓ | ✓ | — | — |
| `dragstart` | ✓ | ✓ | ✓ | — (saved for later) | — |
| `drop` (internal) | — (pre-transformed) | — | — | ✓ (plain=false) | `handleDrop` |
| `drop` (external) | — | — | — | ✓ | `handleDrop` |
| `paste` | — | — | — | ✓ | `handlePaste` |

**Practical implication:** if we use `clipboardTextSerializer` (not `transformCopied`) to emit markdown, same-editor drag-and-drop is unaffected — the saved slice for internal drag is the untransformed version, so drag-a-paragraph-and-drop works as before. This is the key reason to prefer `clipboardTextSerializer` over `transformCopied` for our use case.

---

## Implications for Open Knowledge

1. Set `clipboardTextSerializer` on `editorProps` to win over TipTap's default without disabling core extensions.
2. The `slice` argument is the transformed slice — for Cmd+A, `openStart=0, openEnd=0`, `slice.content = Fragment` of top-level blocks.
3. To serialize with `prosemirror-markdown` / remark, wrap in a synthetic top node: `schema.topNodeType.create(null, slice.content)`. Partial-block selections degrade gracefully (half-paragraph becomes a paragraph).
4. Returning `""` falls through to the next plugin/default. Return the real empty string by using a non-empty sentinel, OR return `null` (documented opt-out pattern).
5. Copy, cut, AND drag-start all fire the same `clipboardTextSerializer`. Usually desired.
6. Do NOT use `transformCopied` for this — it mutates the slice used by `clipboardSerializer` (text/html) too, AND the saved slice for internal drag. `clipboardTextSerializer` is the precise hook.
7. Paste is already wired correctly in `TiptapEditor.tsx:97`. No change needed there.

---

## Gaps / follow-ups

- The "should we override `clipboardSerializer` (text/html) too?" question isn't answered by primitives — it depends on destination preferences (see D2 evidence).
- Whether to emit a custom MIME (e.g. `web text/x-open-knowledge-md`) for lossless self-paste is an orthogonal decision (see D8 evidence).

---

## Sources

All paths relative to `/Users/edwingomezcuellar/projects/open-knowledge/` unless noted.

Local source (pinned via bun.lock):
- `node_modules/prosemirror-view/src/clipboard.ts`
- `node_modules/prosemirror-view/src/input.ts`
- `node_modules/prosemirror-view/src/index.ts`
- `node_modules/prosemirror-view/dist/index.d.ts`
- `node_modules/prosemirror-view/package.json` (v1.41.8)
- `node_modules/prosemirror-state/src/selection.ts`
- `node_modules/prosemirror-model/src/node.ts`
- `node_modules/@tiptap/core/src/Editor.ts`
- `node_modules/@tiptap/core/src/extensions/clipboardTextSerializer.ts`
- `node_modules/@tiptap/core/src/helpers/getTextBetween.ts`
- `node_modules/@tiptap/core/src/extensions/drop.ts`
- `node_modules/@tiptap/core/src/extensions/paste.ts`

Web sources (accessed 2026-04-15):
- ProseMirror reference manual, EditorProps: https://prosemirror.net/docs/ref/
- ProseMirror changelog: https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md
- Forum: "Parse to markdown during a copy paste" — https://discuss.prosemirror.net/t/parse-to-markdown-during-a-copy-paste/5537
- Forum: "What is OpenStart and OpenEnd use for?" — https://discuss.prosemirror.net/t/what-is-openstart-and-openend-use-for/3999
- Forum: "How to copy text in markdown format from marks" — https://discuss.prosemirror.net/t/how-to-copy-text-in-markdown-format-from-marks/4054
- PR #140 "transformCopied" — https://github.com/ProseMirror/prosemirror-view/pull/140
- RFC #3 "Add handleCut editor property" — https://github.com/ProseMirror/rfcs/pull/3
- Issue on `__serializeForClipboard` removal — https://github.com/NiclasDev63/tiptap-extension-global-drag-handle/issues/38
