# Evidence: Live-render-with-descriptor-state survey across editors at scale

**Dimension:** §7 of the 2026-04-30 amendment "CSS-to-inline-style techniques for cross-app HTML emission" — extending §4 ("OSS docs / WYSIWYG editor HTML export survey") with a wider editor sweep focused on live-DOM-walker-on-copy patterns.

**Date:** 2026-05-01

**Sources:** Primary-source GitHub for each OSS editor; official docs and engineering blogs for closed-source (Notion, Linear); existing report's prior coverage in `evidence/d3-prior-art-copy-to-markdown.md`, `evidence/d14-prior-art-html-paste.md`, `evidence/live-dom-walker-prior-art-and-gotchas.md`.

---

## Method

For each surveyed editor, verify four facets:

1. **Q1 — Live-DOM read at copy time?** Does the copy handler call `getComputedStyle()`, `view.nodeDOM(pos)`, or otherwise query the LIVE editor DOM at copy event time, or does it serialize from a static schema/model?
2. **Q2 — Dynamic descriptor state in the clipboard?** Do collapsed toggles, lazy-loaded embeds, status pills, or other UI-conditional descriptor state survive copy as their rendered HTML, or as a static fallback?
3. **Q3 — Evidence.** Source-code citation preferred (`file:line`), official docs second, empirical clipboard inspection (third-party blog tear-downs) third.
4. **Q4 — Maintenance / scale signals.** GitHub stars, weekly downloads, last-commit recency, production usage signals.

Editors surveyed (priority order from the user's §7 prompt):
1. Notion (closed-source)
2. Linear (closed-source)
3. Outline (open-source, ProseMirror)
4. Tiptap core + Tiptap Pro (open-source + commercial overlay, ProseMirror)
5. CKEditor 5 (open-source + commercial)
6. TinyMCE (open-source + commercial)
7. Slate / Plate (open-source, custom)
8. Lexical (open-source, Meta)
9. Quill 2.0 (open-source)
10. Editor.js / GrapesJS / Trix (open-source, three flavors)

The companion library-level survey (html-to-image, dom-to-image, html2canvas, computed-style-to-inline-style, juice/client) already lives in the 2026-04-30 "Live-DOM walker for cross-app HTML emission — prior art and gotchas" amendment. §7 is the EDITOR-pattern-at-scale companion question.

---

## Key files / pages referenced

### Open-source editor source (primary)
- [`outline/app/editor/extensions/ClipboardTextSerializer.ts:26-66`](https://github.com/outline/outline/blob/main/app/editor/extensions/ClipboardTextSerializer.ts) — Outline's only clipboardTextSerializer
- [`outline/shared/editor/nodes/TableCell.ts:154-187`](https://github.com/outline/outline/blob/main/shared/editor/nodes/TableCell.ts) — Outline's only `transformCopied` (pure schema-slice)
- [`outline/shared/editor/nodes/Notice.tsx:46-115`](https://github.com/outline/outline/blob/main/shared/editor/nodes/Notice.tsx) — Outline's callout node, schema-only `parseDOM`/`toDOM`
- [`tiptap/packages/core/src/extensions/clipboardTextSerializer.ts:11-44`](https://github.com/ueberdosis/tiptap/blob/main/packages/core/src/extensions/clipboardTextSerializer.ts) — Tiptap core's auto-installed clipboard text serializer
- [`tiptap/packages/core/src/helpers/getHTMLFromFragment.ts`](https://github.com/ueberdosis/tiptap/blob/main/packages/core/src/helpers/getHTMLFromFragment.ts) — Tiptap's `getHTML` helper, schema-driven
- [Tiptap Pro Export Markdown docs](https://tiptap.dev/docs/conversion/export/markdown/editor-export) — explicit disclaimer that styling requiring DOM inspection is dropped
- [`ckeditor5/packages/ckeditor5-clipboard/src/clipboardpipeline.ts`](https://raw.githubusercontent.com/ckeditor/ckeditor5/master/packages/ckeditor5-clipboard/src/clipboardpipeline.ts) — `ClipboardPipeline._setupCopyCut()` (lines 238-289), `_fireOutputTransformationEvent` (~line 171)
- [CKEditor 5 framework — Editing engine: Model and View](https://ckeditor.com/docs/ckeditor5/latest/framework/architecture/editing-engine.html) — confirms `editor.data.toView` path
- [`tinymce/modules/tinymce/src/core/main/ts/paste/CutCopy.ts:113-117`](https://github.com/tinymce/tinymce/blob/main/modules/tinymce/src/core/main/ts/paste/CutCopy.ts) — TinyMCE copy handler
- [`tinymce/modules/tinymce/src/core/main/ts/selection/GetSelectionContentImpl.ts:64-72`](https://github.com/tinymce/tinymce/blob/main/modules/tinymce/src/core/main/ts/selection/GetSelectionContentImpl.ts) — `contextual: true` branch
- [`tinymce/modules/tinymce/src/core/main/ts/selection/FragmentReader.ts:21-29`](https://github.com/tinymce/tinymce/blob/main/modules/tinymce/src/core/main/ts/selection/FragmentReader.ts) — `Css.getAllRaw(listCont)` for list-style preservation
- [`tinymce/modules/sugar/src/main/ts/ephox/sugar/api/properties/Css.ts:106-118`](https://github.com/tinymce/tinymce/blob/main/modules/sugar/src/main/ts/ephox/sugar/api/properties/Css.ts) — `getAllRaw` reads inline `style=""`, NOT computed
- [`slate/packages/slate-react/src/components/editable.tsx:1521-1530`](https://github.com/ianstormtaylor/slate/blob/main/packages/slate-react/src/components/editable.tsx) — `onCopy` handler
- [`slate/packages/slate-dom/src/plugin/with-dom.ts:237-323`](https://github.com/ianstormtaylor/slate/blob/main/packages/slate-dom/src/plugin/with-dom.ts) — `setFragmentData` (`cloneContents` at line 255, `data.setData('text/html', div.innerHTML)` at line 317)
- [`plate/packages/core/src/static/serializeHtml.tsx:42-77`](https://github.com/udecode/plate/blob/main/packages/core/src/static/serializeHtml.tsx) — `ReactDOMServer.renderToStaticMarkup(<PlateStatic editor={editor} />)`
- [`plate/packages/juice/src/lib/JuicePlugin.ts`](https://github.com/udecode/plate/blob/main/packages/juice/src/lib/JuicePlugin.ts) — `JuicePlugin` runs on PASTE direction only (`parser.transformData`)
- [`lexical/packages/lexical-html/src/index.ts:277-288`](https://github.com/facebook/lexical/blob/main/packages/lexical-html/src/index.ts) — `$generateHtmlFromNodes` creates fresh `document.createElement('div')`
- [`lexical/packages/lexical/src/LexicalNode.ts:1320-1323`](https://github.com/facebook/lexical/blob/main/packages/lexical/src/LexicalNode.ts) — base `exportDOM` calls `createDOM(editor._config, editor)`
- [`lexical/packages/lexical-clipboard/src/clipboard.ts:73-95`](https://github.com/facebook/lexical/blob/main/packages/lexical-clipboard/src/clipboard.ts) — `$getHtmlContent` → `$generateHtmlFromNodes`
- [`lexical/packages/lexical-clipboard/src/clipboard.ts:857-927`](https://github.com/facebook/lexical/blob/main/packages/lexical-clipboard/src/clipboard.ts) — `copyToClipboard`
- [`quill/packages/quill/src/modules/clipboard.ts:230-232`](https://github.com/slab/quill/blob/main/packages/quill/src/modules/clipboard.ts) — `onCaptureCopy`/`onCopy`
- [`quill/packages/quill/src/core/quill.ts:543-552`](https://github.com/slab/quill/blob/main/packages/quill/src/core/quill.ts) — `getSemanticHTML`
- [`quill/packages/quill/src/core/editor.ts:198-209,363-411`](https://github.com/slab/quill/blob/main/packages/quill/src/core/editor.ts) — `getHTML(index, length)` walks blot tree
- [`editor.js/src/components/modules/blockSelection.ts:286-321`](https://github.com/codex-team/editor.js/blob/next/src/components/modules/blockSelection.ts) — `copySelectedBlocks` reads `block.holder.innerHTML`
- [`editor.js/src/components/modules/blockEvents.ts:163-170`](https://github.com/codex-team/editor.js/blob/next/src/components/modules/blockEvents.ts) — `handleCommandC` dispatch
- [`grapesjs/packages/core/src/commands/view/CopyComponent.ts`](https://github.com/GrapesJS/grapesjs/blob/dev/packages/core/src/commands/view/CopyComponent.ts) — internal `em.set('clipboard', models)`, no OS clipboard
- [`grapesjs/packages/core/src/commands/view/PasteComponent.ts:7-43`](https://github.com/GrapesJS/grapesjs/blob/dev/packages/core/src/commands/view/PasteComponent.ts) — symmetric internal paste
- [`grapesjs/packages/core/src/rich_text_editor/model/RichTextEditor.ts:316-334`](https://github.com/GrapesJS/grapesjs/blob/dev/packages/core/src/rich_text_editor/model/RichTextEditor.ts) — RTE `__onPaste` only, no copy
- [`trix/src/trix/controllers/level_0_input_controller.js:160-166`](https://github.com/basecamp/trix/blob/main/src/trix/controllers/level_0_input_controller.js) — copy handler
- [`trix/src/trix/controllers/level_0_input_controller.js:464-472`](https://github.com/basecamp/trix/blob/main/src/trix/controllers/level_0_input_controller.js) — `serializeSelectionToDataTransfer`
- [`trix/src/trix/models/document.js:756-760`](https://github.com/basecamp/trix/blob/main/src/trix/models/document.js) — `toSerializableDocument`
- [`trix/src/trix/core/serialization.js:35`](https://github.com/basecamp/trix/blob/main/src/trix/core/serialization.js) — model-walk path

### Closed-source editor evidence (secondary)
- [How I reverse engineered Notion API — blog.kowalczyk.info](https://blog.kowalczyk.info/article/88aee8f43620471aa9dbcad28368174c/how-i-reverse-engineered-notion-api.html) — JSON-block architecture
- [Notion 2022-01-19 changelog](https://www.notion.com/releases/2022-01-19) — copy/paste improvements framed as block-aware
- [NoteForms Toggle Block glossary](https://noteforms.com/notion-glossary/toggle-block) — children included on copy regardless of expansion state
- [notion-enhancer Tweaks](https://notion-enhancer.github.io/advanced/tweaks/) — Notion uses inline styles in render-time UI
- [Notion 100M users (Sept 2024)](https://www.notion.com/blog/100-million-of-you) — scale signal
- [Linear Editor docs](https://linear.app/docs/editor) — ProseMirror-style behaviors confirm Tiptap base
- [Linear "Copy as Markdown" (X, 2025-07-13)](https://x.com/linear/status/1944758116396024313) — schema-driven serializer
- [Linear Slack integration docs](https://linear.app/docs/slack) — Slack-side rendering is unfurler-driven, not clipboard-HTML-driven
- [ProseMirror clipboard discussion forum](https://discuss.prosemirror.net/t/how-to-implement-clipboard-actions-via-prosemirror/5007) — confirms default ProseMirror clipboard path serializes via `toDOM()` into a detached doc

---

## Findings

### Finding 1: Outline does NOT use a live-DOM read at copy time
**Confidence:** CONFIRMED
**Evidence:** `outline/app/editor/extensions/ClipboardTextSerializer.ts:26-66`

```ts
clipboardTextSerializer: () => {
  // reads slice.content only; counts node types and marks via slice.content.descendants(...)
  // calls mdSerializer.serialize(slice.content, ...) from this.editor.extensions.serializer()
  // NO view-arg traversal anywhere
}
```

`shared/editor/nodes/TableCell.ts:154-187` is the only `transformCopied` in the repo — pure schema-slice manipulation (`new Slice(cell.content, ...)`). Repo-wide ripgrep across `outline/` for `getComputedStyle|view\.nodeDOM|view\.domAtPos` returned 14 matches, **zero** in clipboard/copy paths.

**Implications:** Outline emits schema-driven HTML for cross-app paste. The Notice (callout) node's static `toDOM` rule produces clipboard HTML, not the React-rendered NodeView DOM.

---

### Finding 2: Tiptap core + Tiptap Pro do NOT use a live-DOM read at copy time
**Confidence:** CONFIRMED
**Evidence:** `tiptap/packages/core/src/extensions/clipboardTextSerializer.ts:11-44`

```ts
clipboardTextSerializer: () => {
  const { editor } = this
  const { state, schema } = editor
  const { doc, selection } = state
  // reads doc + selection ranges, never view.dom
  return getTextBetween(doc, range, { ..., textSerializers })
}
```

Repo-wide search for `getComputedStyle` across `tiptap/packages` returned 16 matches across `extension-drag-handle`, `extension-table-of-contents`, `extension-bubble-menu`, `extension-details/isNodeVisible.ts`, `core/src/NodePos.ts` — **zero in clipboard/copy paths**.

Tiptap Pro's [Export Markdown extension docs](https://tiptap.dev/docs/conversion/export/markdown/editor-export) explicitly state: *"styling like font colors, sizes, and alignment — which require DOM inspection — are intentionally dropped."* This is a primary-source disclaimer that Tiptap Pro does NOT do live-DOM reads.

**Implications:** NodeViews (custom React/Vue rendered nodes) participate in `view.serializeForClipboard` via the schema's static `toDOM`, NOT the React-rendered DOM. Confirmed by `getHTMLFromFragment.ts` using `DOMSerializer.fromSchema(schema).serializeFragment(...)`.

---

### Finding 3: CKEditor 5 deliberately bypasses the live editing view at copy time
**Confidence:** CONFIRMED
**Evidence:** `ckeditor5/packages/ckeditor5-clipboard/src/clipboardpipeline.ts` `_setupCopyCut()` lines 238-289

```ts
// _fireOutputTransformationEvent:
const documentFragment = clipboardMarkersUtils._copySelectedFragmentWithMarkers(method, selection)
// ... output transformation ...
const content = editor.data.toView(data.content, { isClipboardPipeline: true })

// setData:
data.dataTransfer.setData('text/html', this.editor.data.htmlProcessor.toData(data.content))
data.dataTransfer.setData('text/plain', viewToPlainText(editor.data.htmlProcessor.domConverter, data.content))
data.dataTransfer.setData('application/ckeditor5-editor-id', this.editor.id)
```

`data.toView(...)` converts model → CKEditor's "data view" (an abstract tree, NOT the live browser DOM); `htmlProcessor.toData(...)` then stringifies via `domConverter` rules. The "editing view" — which mirrors the live DOM and contains widget chrome (selection rings, resize handles) — is deliberately bypassed.

WebFetch of the file confirmed: "no `getComputedStyle` calls appear anywhere in this file."

**Implications:** Widget chrome (image resize handles, table cell selection rings, embed widget UI) is filtered out by routing through the data layer instead of the editing layer. This is an explicit architectural choice in CKEditor 5's MVC.

---

### Finding 4: Lexical refuses live DOM entirely at copy time
**Confidence:** CONFIRMED
**Evidence:** `lexical/packages/lexical-html/src/index.ts:277-288`

`$generateHtmlFromNodes` creates a fresh `document.createElement('div')` and delegates to `$generateDOMFromNodes`, which walks `editorState` and calls each node's `exportDOM(editor)`. Base `LexicalNode.exportDOM` (LexicalNode.ts:1320-1323):

```ts
exportDOM(editor: LexicalEditor): DOMExportOutput {
  const element = this.createDOM(editor._config, editor);
  return {element};
}
```

`createDOM` is the same method used at editor render time but invoked here against a freshly-constructed element. No `getComputedStyle`, no `editor.getElementByKey()` lookup. `copyToClipboard` (clipboard.ts:857-927) DOES touch live DOM but only for the DOM `Selection` object's range manipulation; the HTML body content comes from `$getHtmlContent` (clipboard.ts:73-95) → `$generateHtmlFromNodes` → fresh detached DOM.

The `inlineStylesFromStyleSheets` helper in lexical-html walks `document.styleSheets` and inlines computed properties — but it's used on **paste** (Excel/Word imports), not copy emission.

**Implications:** Lexical descriptor authors carry the burden — any visible state must round-trip through the LexicalNode's persisted properties. Live preview state (e.g., a video player's `currentTime`, an iframe's mutated DOM) does NOT survive unless the LexicalNode persists it as a property.

---

### Finding 5: TinyMCE clones live DOM but does NOT call `getComputedStyle()`
**Confidence:** CONFIRMED
**Evidence:** TinyMCE's copy handler in `CutCopy.ts:113-117` calls `editor.selection.getContent({ contextual: true })`. The `contextual: true` branch (`GetSelectionContentImpl.ts:64-72`) routes to `FragmentReader.read()` which clones the live `Range` via `rng.cloneContents()` then walks ancestor wrappers.

The only style-preservation call is `Css.getAllRaw(listCont)` in `FragmentReader.ts:24`, which preserves `list-style*` properties from list ancestors. Crucially, `Css.getAllRaw` in `Css.ts:106-118` iterates `dom.style.item(i)` — i.e., reads the inline `style=""` attribute, **NOT** computed styles. The sibling `Css.get` (line 80) does call `window.getComputedStyle` but is used for layout queries, not on the copy path.

TinyMCE's media plugin stores embed metadata as `data-mce-*` attributes on a placeholder element; the real `<iframe>`/`<video>` is a "live preview" rendered for editing only. At serialization, the AST placeholder restores from those attributes — so dynamic preview state (e.g., iframe DOM mutations from a YouTube embed) does NOT survive copy.

**Implications:** TinyMCE preserves whatever inline `style=""` the rendered DOM happened to carry. Cascade-resolved styles (Tailwind utilities → resolved RGB colors) do NOT survive because they live in `getComputedStyle`, not `dom.style`. A Tailwind-classed Callout in TinyMCE makes it to the clipboard as `<div class="callout">...</div>` — destination apps that don't ship the editor's CSS render unstyled.

---

### Finding 6: Slate-react clones live DOM via `cloneContents()` but does NOT call `getComputedStyle()`
**Confidence:** CONFIRMED
**Evidence:** Slate's `onCopy` handler at `editable.tsx:1521-1530` calls `ReactEditor.setFragmentData(editor, event.clipboardData, 'copy')`, delegating to `slate-dom`'s implementation in `with-dom.ts:237-323`:

1. Builds a DOMRange via `DOMEditor.toDOMRange(e, selection)` (line 254)
2. Clones LIVE rendered DOM with `domRange.cloneContents()` (line 255)
3. Strips zero-width spans
4. Stuffs the clone into a hidden `<div>`, appends it to body, reads `div.innerHTML` (line 317)

There is no `getComputedStyle` call anywhere in `slate-dom/src/`. CSS classes survive as classes; cascade-resolved colors do not. Slate also writes a `data-slate-fragment` Base64-encoded JSON of the fragment for intra-Slate paste fidelity (line 309).

**Plate** — `serializeHtml` (plate/packages/core/src/static/serializeHtml.tsx:42-77) is a separate offline export using `ReactDOMServer.renderToStaticMarkup(<PlateStatic editor={editor} />)`. **No live DOM, no getComputedStyle** — runs from `editor.children` data model through React tree to string. Default behavior strips all classes except `slate-*` / `line-clamp` prefixes.

**Implications:** Slate-react's `cloneContents()` approach is closer to "copy what's on screen" than schema-only serialization, but it stops at inline styles. Plate's `serializeHtml` is fully model-based. The `JuicePlugin` in Plate's repo is a paste-direction CSS inliner (transforms inbound `<style>`-bearing HTML), not a copy-direction tool.

---

### Finding 7: Quill 2.0 walks blots, not DOM
**Confidence:** CONFIRMED
**Evidence:** `onCaptureCopy` → `onCopy` → `quill.getSemanticHTML(range)` → `editor.getHTML(index, length)` → `convertHTML(blot, ...)` (`packages/quill/src/modules/clipboard.ts:230-232`, `core/quill.ts:543-552`, `core/editor.ts:198-209,363-411`).

`convertHTML` walks the **blot tree** (the in-memory model) and recurses with `forEachAt`. The narrow caveat: for parent wrappers it reads `blot.domNode.outerHTML` / `innerHTML` (editor.ts:402) to extract the wrapper opening/closing tags — but this is tag splicing, not styling/descriptor capture. No `getComputedStyle`.

`getComputedStyle` calls survive in `src/ui/tooltip.ts:5`, `src/core/utils/scrollRectIntoView.ts:97`, `src/modules/uiNode.ts:51` (RTL key handling) — but **not** in `src/modules/clipboard.ts`. This is the verification of the existing report's mention of Quill's `getComputedStyle` use in `isLine` (still applies to legacy 1.x — Quill 2.0 ported the function but kept clipboard model-based).

**Implications:** Embeds/formulas/images use blot's `html(index, length)` method for serialization. A math/formula blot that lazy-renders KaTeX on mount would emit its serialized form, not the rendered MathML. No live-state capture.

---

### Finding 8: Editor.js is the closest analog — passively snapshots `block.holder.innerHTML`, but does NOT compute styles
**Confidence:** CONFIRMED
**Evidence:** `BlockSelection.copySelectedBlocks` at `src/components/modules/blockSelection.ts:286-321` reads `block.holder.innerHTML` at copy time, where `block.holder` is the live block's rendered DOM container. It then sanitizes via `clean()` and emits as `text/html`. Three formats:

1. `text/plain` — sanitized `textContent`
2. `text/html` — sanitized `block.holder.innerHTML`
3. `application/x-editor-js` — `JSON.stringify(await Promise.all(selectedBlocks.map(block => block.save())))` (model-side serialization)

`getComputedStyle` does appear in this codebase (`polyfills.ts:117`, `rectangleSelection.ts:452`, `toolbar/index.ts:326,339`, `dom.ts:718`) but **none in the copy path**.

**Implications:** Editor.js *passively captures* live render state via `innerHTML`-as-string — no per-element computed-style walk, no descriptor extraction. It's "snapshot the rendered tree" rather than "compute descriptors against the rendered tree." So an embed block that fetched a Twitter preview at render time WOULD carry that rendered preview HTML in clipboard (modulo sanitizer config), but cascade-resolved CSS styling — Tailwind utility classes resolved to RGB literals — would NOT.

This is the closest pattern to OK's walker among all surveyed editors, but it stops one step short of `getComputedStyle` resolution. If a block's render produced `<div class="callout-info">...</div>` (with the styling living in a stylesheet), Editor.js's clipboard payload would carry the `class` but not the resolved `background-color`.

---

### Finding 9: GrapesJS does NOT use the OS clipboard at all for component copy
**Confidence:** CONFIRMED
**Evidence:** `CopyComponent.ts` (full file, 9 lines):

```ts
const models = [...ed.getSelectedAll()].map((md) => md.delegate?.copy?.(md) || md).filter(Boolean);
models.length && em.set('clipboard', models);
```

Internal `editor.set('clipboard', models)` — never participates in OS clipboard. `PasteComponent.ts:7-43` reads from the same internal key and inserts via `collection.add(selected.clone(), addOpts)`. Cross-project transfer is not supported through the OS clipboard via this command.

The Rich Text Editor module's `__onPaste` handler (`packages/core/src/rich_text_editor/model/RichTextEditor.ts:316-334`) does interact with `ev.clipboardData` for **paste**, but there is no symmetric copy handler.

`getComputedStyle` is used heavily across `Property.ts`, `cash-dom.ts`, `Resize.ts`, `CanvasView.ts`, `ShowOffset.ts`, `BaseComponentNode.ts` — but **never in a copy/clipboard path**.

**Implications:** GrapesJS is N/A for the descriptor-state-on-clipboard question. Its "clipboard" is an internal pub/sub state, not the OS clipboard.

---

### Finding 10: Trix performs a clean model-walk at copy time
**Confidence:** CONFIRMED
**Evidence:** Pipeline:

```
copy(event) → serializeSelectionToDataTransfer(event.clipboardData)
  → responder.getSelectedDocument().toSerializableDocument()
  → JSON.stringify + DocumentView.render(document).innerHTML + document.toString()
```

(`level_0_input_controller.js:160-166` for the copy handler; `:464-472` for the serializer; `models/document.js:756-760` for `toSerializableDocument`; `core/serialization.js:35` confirms the same path.)

`toSerializableDocument` walks the block list and copies each block with `block.text.toSerializableText()` — pure model. `DocumentView.render(document)` constructs a *fresh* DOM tree from the serialized model — not a read of the live editor DOM. No `getComputedStyle`. No live-state extraction.

**Implications:** Attachments are serialized through whatever `Attachment.toSerializableAttachment` chooses to retain — typically the URL/href and content-type, not upload progress. In-flight upload state would be lost on copy. Trix explicitly removes elements marked `[data-trix-serialize=false]` and strips internal attributes.

---

### Finding 11: Notion (closed-source) shows no published evidence of a live-DOM walker
**Confidence:** UNCERTAIN (evidence absence; closed-source)

Notion's editor sits on a JSON block tree; rendering happens client-side from server-delivered JSON ([Kowalczyk reverse-engineering analysis](https://blog.kowalczyk.info/article/88aee8f43620471aa9dbcad28368174c/how-i-reverse-engineered-notion-api.html)). Empirical signals point against a live-DOM walker:

- Toggle blocks include hidden children when copied regardless of expansion state ([NoteForms](https://noteforms.com/notion-glossary/toggle-block)). This is the JSON-block-tree shape — children exist regardless of UI render — and is what you'd expect from JSON serialization, not what you'd expect from a `cloneContents()`-style live-DOM read (which would NOT capture undisplayed children of a `<details>` if the renderer omits them).
- The 2022-01-19 Notion changelog frames cross-block copy/paste as block-aware, implying a structural serializer ([notion.com/releases/2022-01-19](https://www.notion.com/releases/2022-01-19)).
- Notion's documented inline-style usage in cross-app paste is consistent with a JSON-block-to-HTML serializer that emits per-block-type inline styles, not with `getComputedStyle` reads.

**Could not find any source confirming `getComputedStyle()` or live-DOM walker at copy time for Notion.** Closed-source means strictly absent evidence.

**Implications:** Notion is best modeled as a "structured serializer with author-written inline styles per block type" — closer to Lexical's `exportDOM` per-node pattern than to OK's getComputedStyle walker.

---

### Finding 12: Linear (closed-source) is built on Tiptap and shows no published evidence of a deviation from Tiptap's defaults
**Confidence:** UNCERTAIN (evidence absence; closed-source)

Linear's editor is built on ProseMirror/Tiptap ([linear.app/docs/editor](https://linear.app/docs/editor)). ProseMirror's default `clipboardSerializer` runs the schema's `toDOM()` for each node into a **detached** document — explicitly NOT the live view. Unless Linear has overridden this with custom DOM-events or an `attributes`-based reader, the default path is schema-serialized.

Linear's recent feature is "Copy as Markdown" (Cmd+Opt+C) — explicitly a schema-driven serializer for LLM consumption ([@linear, 2025-07-13](https://x.com/linear/status/1944758116396024313)).

Cross-app rich-paste survival (e.g., to Slack) appears to rely on link unfurling — Linear puts a link in the clipboard, Slack's unfurler renders the rich pill from the link, **not** from clipboard HTML ([linear.app/docs/slack](https://linear.app/docs/slack)). Whatever Linear puts in the clipboard, the destination-app rich render is unfurler-driven.

**Could not find any tear-down post inspecting Linear's actual clipboard HTML payload.**

**Implications:** Linear most likely follows Tiptap's default schema-driven path. Status pills, assignee avatars, and custom field renders likely emit their schema HTML representation, not their live React-rendered DOM. The closest analog is "rich link with metadata" via the unfurler, not "rich HTML with getComputedStyle resolution."

---

## Negative searches (for NOT FOUND)

- Searched: `getComputedStyle` in `outline/`, `tiptap/packages/`, `ckeditor5/packages/ckeditor5-clipboard/`, `lexical/packages/lexical-clipboard/`, `lexical/packages/lexical-html/`, `quill/packages/quill/src/modules/clipboard.ts`, `slate-dom/src/`, `trix/src/trix/controllers/`, `editor.js/src/components/modules/blockSelection.ts` — **zero matches in clipboard/copy paths** for ALL surveyed editors.
- Searched: `view.nodeDOM(pos)` ProseMirror equivalent calls in clipboard handlers across Outline, Tiptap, CKEditor 5 — **zero matches** in clipboard paths.
- Searched: tear-down posts inspecting Linear's clipboard HTML payload via Google + dev.to + medium.com — **none found**.
- Searched: tear-down posts inspecting whether Notion captures collapsed-toggle children via DOM-read vs JSON serialization — **none found**; only third-party documentation noting the behavior outcome.
- Searched: Tiptap Pro extensions (`Cloud`, `Comments`, `History`, `Conversion`, `Snapshot`, `AI`, `Document AI`, `Doc Conversion`) for live-DOM-walker pattern — **only `Conversion`'s Export Markdown is in the clipboard adjacency**, and its docs explicitly disclaim DOM inspection.

---

## Synthesis

The 13 editors surveyed (Notion, Linear, Outline, Tiptap core, Tiptap Pro, CKEditor 5, TinyMCE, Slate, Plate, Lexical, Quill 2.0, Editor.js, GrapesJS, Trix) cluster into four patterns at the clipboard-copy event:

| Pattern | Editors | Mechanism |
|---|---|---|
| **A. Pure model serialization** | Lexical, Plate (offline), Tiptap core/Pro, CKEditor 5, Outline, Trix, Quill 2.0 | Walks model/schema; calls `exportDOM`/`toDOM`/`html(index,length)`/`toSerializableDocument` against a freshly-constructed DOM. No live DOM consultation. |
| **B. Live DOM clone (preserves inline styles only)** | Slate-react, TinyMCE | Calls `Range.cloneContents()` and reads `innerHTML` of the resulting fragment. Inline `style=""` attributes survive; cascade-resolved styles do NOT. |
| **C. Live innerHTML snapshot** | Editor.js | Reads `block.holder.innerHTML` at copy time; sanitizes; emits. Live render state survives in HTML form, but no per-element computed-style walk. |
| **D. Internal-only / unfurler-driven** | GrapesJS, Linear (likely) | OS clipboard not used (GrapesJS) or used as a link reference for destination-side unfurling (Linear). |
| **OK's prospective walker** | (no precedent) | Walks paired (model node ↔ live DOM element) pairs; calls `getComputedStyle(view.nodeDOM(pos))` to capture cascade-resolved values; writes them as inline `style=""` on detached output. |

**OK's walker pattern remains unprecedented at this scale.** No surveyed editor walks paired (model, live DOM) pairs and calls `getComputedStyle` to resolve cascade values into inline styles at copy event time. The closest precedents:

1. **Editor.js** is the closest analog — it does read live DOM at copy time, but via `innerHTML` snapshot only (Pattern C). It captures whatever's already in the DOM (including author-written inline styles on rendered blocks) but does not resolve the cascade. A Tailwind-utility-classed callout in Editor.js would copy as `<div class="bg-blue-50 ...">...</div>` — the destination app needs Tailwind's CSS to render correctly. OK's walker would resolve `bg-blue-50` to `background-color: rgb(239, 246, 255)` at copy time.
2. **Slate-react** and **TinyMCE** clone live DOM (Pattern B) but stop at inline styles. Same external-paste degradation.
3. The `getComputedStyle`-with-cascade-resolution pattern lives in the **image-conversion library** category — html-to-image, dom-to-image, computed-style-to-inline-style — already covered in the existing 2026-04-30 "Live-DOM walker" amendment of the source report. Among editors specifically, none has converged on this approach.

**Why the divergence?** Two structural reasons:

1. **Most editors run their HTML export server-side or in a fresh React tree** — Plate's `PlateStatic`, Lexical's `$generateHtmlFromNodes` against detached DOM, react-email's Tailwind-compile-at-Node-time. In those contexts, there IS no live editor DOM with resolved styles to walk. OK's all-in-browser editor with live preview is structurally different.
2. **Cascade-style-on-copy adds a runtime cost** that editors building for general-purpose use can't justify when most users' content is plain text + simple formatting marks. OK's specific motivation — extended Callout types whose theme tokens drift between authoring and TS palette duplication — is a niche the wider category hasn't faced.

**Confidence on Outcome A (claim holds):** HIGH for the open-source editors (10 of 13) where source code provided definitive evidence. UNCERTAIN-but-leans-confirming for the closed-source editors (Notion, Linear) where evidence is absence-of-tear-downs plus structural inference from their underlying tech (Notion's JSON-block tree; Linear's Tiptap base).

The §4 claim — *"No surveyed editor uses runtime `getComputedStyle()` against the live editor DOM as a copy-emission strategy"* — holds across the wider survey. OK's walker pattern is genuinely novel for the editor category, paralleling the mature library category.

---

## Gaps / follow-ups

- **Empirical clipboard inspection of Notion and Linear cross-app paste.** The existing report's lines 1601-1605 already capture Notion's "HTML with inline styles for formatting" empirically; a deeper inspection (e.g., copy a callout from Notion to TextEdit, examine the actual `text/html` MIME) would tighten the Notion finding from UNCERTAIN to CONFIRMED. Likewise for Linear's status-pill copy to a destination that doesn't unfurl.
- **Tiptap Pro Cloud extensions not in npm.** Some Tiptap Pro features ship behind authentication; the survey covered the documented `Conversion` extensions but couldn't fully audit Cloud-only paths. The Tiptap Pro Export Markdown disclaimer is the strongest negative signal; the others are inferred.
- **GitBook / Notion clones (AppFlowy, Anytype) not surveyed.** These were de-prioritized vs the user's named priority list. If the §7 conclusion is later challenged, an extension survey could cover them.
- **Mobile editor surfaces (Bear, iA Writer, Obsidian mobile).** Not surveyed — the source report's existing 2026-04-30 amendment covers Obsidian (desktop plugin, hardcoded stylesheet); mobile paths could differ.

---

## Vendor-incentive flags

None of the findings rely on first-party vendor claims about their own product. All "yes/no" claims are grounded in source-code reads (open-source) or third-party reverse-engineering (closed-source). The Tiptap Pro Export Markdown docs disclaimer is the one exception — it's a vendor disclosing a limitation of their commercial product, which is the rare case where vendor claim aligns with product-incentive (admit a gap → contract a future feature). Confidence is appropriate.
