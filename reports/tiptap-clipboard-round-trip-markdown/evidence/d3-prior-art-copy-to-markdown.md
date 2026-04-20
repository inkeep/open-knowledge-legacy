# Evidence: D3 — Prior Art: Copy-to-Markdown in WYSIWYG Editors

**Dimension:** D3 (prior art — how other editors serialize selection to clipboard as markdown)
**Date:** 2026-04-15
**Sources:** Outline, BlockNote, Milkdown, TipTap core, tiptap-markdown, BlockSuite/AFFiNE, Keystatic, Plate, ProseMirror reference, community plugins. All repos inspected via local OSS cache or GitHub raw URLs.

---

## Summary

Ten editor/framework repositories inspected at the clipboard-serialization path. The **dominant pattern among markdown-canonical ProseMirror editors** is: register a Plugin with `props: { clipboardTextSerializer }` that wraps `slice.content` in the schema's `topNodeType` and runs it through the editor's own markdown serializer. Variants exist on whether to (a) fall through to plain text for simple selections, (b) also override `clipboardSerializer` (text/html), or (c) write additional private MIME types.

**No surveyed editor writes `text/markdown`** as a MIME type. All markdown emission uses `text/plain`.

---

## Summary table

| Editor | Copies as MD? | Hook | MIME | Full-doc Cmd+A? | Reuses own serializer? | Source |
|---|---|---|---|---|---|---|
| **Outline** | YES (conditional) | `clipboardTextSerializer` | text/plain (MD); text/html via PM default | Yes | Yes — `this.editor.extensions.serializer()` | `app/editor/extensions/ClipboardTextSerializer.ts:26` |
| **BlockNote** | YES | `handleDOMEvents.copy` (DOM-level, preventDefault) | text/plain=MD + text/html=external + blocknote/html=internal | Yes | Partial — HTML → markdown via `cleanHTMLToMarkdown` | `packages/core/src/api/clipboard/toClipboard/copyExtension.ts:186-199` |
| **Milkdown** | YES (unconditional) | `clipboardTextSerializer` | text/plain (MD); text/html via PM default | Yes | Yes — `ctx.get(serializerCtx)` | `packages/plugins/plugin-clipboard/src/index.ts:133-147` |
| **tiptap-markdown** (community) | YES (opt-in: `transformCopiedText: true`) | `clipboardTextSerializer` | text/plain only | Yes | Yes — `editor.storage.markdown.serializer.serialize` | `src/extensions/tiptap/clipboard.js:33-38` |
| **TipTap core** | NO — plain text only via `getTextBetween` | `clipboardTextSerializer` (blockSeparator config only) | text/plain (flat text) | Yes | N/A | `packages/core/src/extensions/clipboardTextSerializer.ts:25-39` |
| **TipTap `@tiptap/markdown`** (official) | NO — not wired to clipboard | — | — | — | Serializer exists but not hooked | `packages/markdown/src/Extension.ts` |
| **BlockSuite/AFFiNE** | PARTIAL — adapter-based; text/plain is `MixTextAdapter` (delta-text extract, NOT markdown) | `navigator.clipboard.write` + adapter registry | BLOCKSUITE/SNAPSHOT, text/html (with snapshot attr), image/png, text/_notion-text-production, text/plain, */* | Yes | MarkdownAdapter exists but only for file-export | `packages/framework/std/src/clipboard/clipboard.ts:270-321` + `packages/affine/foundation/src/clipboard.ts:46-50` |
| **Keystatic** (Markdoc editor) | YES | `clipboardTextSerializer` + `clipboardTextParser` (symmetric) | text/plain (Markdoc); text/html via PM default | Yes | Yes — `proseMirrorToMarkdoc` + `format` | `packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx:22-55` |
| **Plate** (Slate-based) | NO — writes x-slate-fragment + HTML + derived plain | `ViewPlugin` (Slate, not PM) | application/x-slate-fragment + text/html + text/plain (derived, NOT MD) | Yes | serializeMd API exists but not clipboard-hooked | `packages/markdown/src/lib/MarkdownPlugin.ts:107-128` + `packages/core/src/static/plugins/ViewPlugin.ts:25-33` |
| **ProseMirror official markdown example** | NO | — | default | N/A | No — example just toggles views | `ProseMirror/website/example/markdown/index.js` |
| **prosemirror-example-setup** | NO | — | default | N/A | N/A | `ProseMirror/prosemirror-example-setup/src/index.ts` |
| **Novel** (TipTap-based) | NOT FOUND | — | default (TipTap core fallback) | — | — | `github.com/steven-tey/novel` |
| **MDXEditor** (Lexical-based) | N/A for `clipboardTextSerializer` (not a PM hook) | — | — | — | — | — |
| **HedgeDoc** | N/A (source-is-markdown via CodeMirror) | Separate "Copy as Markdown/HTML" buttons in preview | n/a | Yes (native) | n/a | — |
| **Obsidian** | N/A (source-is-markdown) | Community plugins go OTHER direction (MD→HTML) | n/a | Yes (native) | n/a | `mvdkwast/obsidian-copy-as-html` |

---

## Detailed findings

### Finding D3-1: Outline — conditional heuristic (CONFIRMED)

File: `outline/app/editor/extensions/ClipboardTextSerializer.ts` (full 72-line file inspected).

```ts
// ClipboardTextSerializer.ts:26-66 (excerpt)
clipboardTextSerializer: (slice, view) => {
  // Heuristic: isSingleCodeBlock / hasOnlyCodeMark / hasSingleBlockType
  return usePlainText
    ? slice.content.content.map((node) => ProsemirrorHelper.toPlainText(node)).join("\n")
    : mdSerializer.serialize(slice.content, { softBreak: true });
},
```

- Simple selections (single code block, single code mark, uniform single block type with no nested lists) → plain text.
- Complex selections → full markdown serializer via `this.editor.extensions.serializer()` (`shared/editor/lib/ExtensionManager.ts:128`).
- Full-doc Cmd+A: multi-block, falls into the markdown path.
- Does NOT override `clipboardSerializer` (text/html) — lets PM emit default HTML.
- Separate `transformCopied` plugin for table-cell unwrapping (`shared/editor/nodes/TableCell.ts:154-179`) — structural, not markdown-related.

### Finding D3-2: BlockNote — DOM-level, 3 MIME types (CONFIRMED)

File: `blocknote/packages/core/src/api/clipboard/toClipboard/copyExtension.ts` (full 283-line file inspected).

```ts
// copyExtension.ts:183-199
event.preventDefault();
event.clipboardData!.clearData();
const { clipboardHTML, externalHTML, markdown } = selectedFragmentToHTML(view, editor);
event.clipboardData!.setData("blocknote/html", clipboardHTML);  // private, round-trippable
event.clipboardData!.setData("text/html", externalHTML);         // portable HTML
event.clipboardData!.setData("text/plain", markdown);            // markdown as plain
```

- Bypasses `clipboardTextSerializer`; uses `handleDOMEvents.copy/cut/dragstart`.
- Markdown produced via `cleanHTMLToMarkdown(externalHTML)` — HTML → Markdown, not PM → Markdown directly.
- Comment at line 194: "TODO: Writing to other MIME types not working in Safari for some reason." — Safari restricts custom MIME types on DataTransfer.
- Paste handling docs (`docs/content/docs/reference/editor/paste-handling.mdx:8-15`) confirm priority: VS Code → Files → BlockNote HTML → Markdown → HTML → plain.

### Finding D3-3: Milkdown — unconditional, topNodeType wrap (CONFIRMED)

File: `milkdown/packages/plugins/plugin-clipboard/src/index.ts:133-147`:

```ts
clipboardTextSerializer: (slice) => {
  const serializer = ctx.get(serializerCtx);
  const isText = isPureText(slice.content.toJSON());
  if (isText)
    return (slice.content as unknown as ProsemirrorNode).textBetween(0, slice.content.size, '\n\n');

  const doc = schema.topNodeType.createAndFill(undefined, slice.content);
  if (!doc) return '';
  const value = serializer(doc);
  return value;
},
```

**This is the canonical pattern.** Pure-text shortcut using `textBetween`, then `schema.topNodeType.createAndFill(undefined, slice.content)` for structural content → serializer.

- Does NOT override `clipboardSerializer` (text/html).
- Paste side in same file also strips Google Docs `docs-internal-guid` wrappers at `:52-61` — a known regression.

### Finding D3-4: TipTap core — no markdown path (CONFIRMED NOT FOUND)

File: `tiptap/packages/core/src/extensions/clipboardTextSerializer.ts:11-44`.

Emits plain text via `getTextBetween` with `textSerializers` from schema's `toText` hooks. Configurable `blockSeparator` (default `\n\n` per FAQ). No markdown path.

Official `@tiptap/markdown` (`tiptap/packages/markdown/src/Extension.ts`) adds `editor.getMarkdown()`, `editor.markdown.parse/serialize`, and `contentType: 'markdown'` but does NOT register any clipboard props.

Confirmed by TipTap Issue #3392: "*the clipboardTextSerializer arguments are ignored in favour of a custom implementation*" and TipTap does not yet support `transformCopied`.

### Finding D3-5: tiptap-markdown (community) — opt-in pattern (CONFIRMED)

File: `tiptap-markdown/src/extensions/tiptap/clipboard.js:33-38`:

```js
clipboardTextSerializer: (slice) => {
  if (!this.options.transformCopiedText) {
    return null;       // null = fall through to PM default
  }
  return this.editor.storage.markdown.serializer.serialize(slice.content);
},
```

- Gated behind `transformCopiedText: false` default (opt-in).
- **Returning `null` is the documented opt-out pattern** — falls through to PM's default `textBetween`.
- Tests (`__tests__/clipboard.spec.js:47-85`):
  - `transformCopiedText: true`: `# My title` content copies as `# My title`.
  - `transformCopiedText: false`: copies as `My title` (text only).

### Finding D3-6: BlockSuite/AFFiNE — adapter registry, `text/plain` is NOT markdown (CONFIRMED)

Files:
- `blocksuite/packages/framework/std/src/clipboard/clipboard.ts:119-145, 270-322`
- `blocksuite/packages/affine/foundation/src/clipboard.ts:12-65`
- `blocksuite/packages/affine/shared/src/adapters/mix-text.ts:25-108`

NOT ProseMirror — custom block editor. Uses async `navigator.clipboard.write` with `ClipboardItem` containing multiple Blobs. Adapter registry:

| Priority | MIME | Adapter | Content |
|---|---|---|---|
| 100 | `BLOCKSUITE/SNAPSHOT` | ClipboardAdapter | JSON snapshot, round-trippable |
| 95 | `text/_notion-text-production` | NotionTextAdapter | Notion compat |
| 90 | `text/html` | HtmlAdapter | HTML with `data-blocksuite-snapshot` attr encoding JSON |
| 80 | image/* | ImageAdapter | — |
| 70 | `text/plain` | **MixTextAdapter** | delta-text extract — NOT markdown |
| 60 | `*/*` | AttachmentAdapter | — |

`MixTextAdapter._traverseSnapshot` (`mix-text.ts:69-108`) emits raw `delta.insert` text + `---` for dividers. **No heading `#`, no bold `**`, no lists.** MarkdownAdapter exists but is wired to file-export only, not clipboard.

`clipboard.ts:314-319` wraps non-standard MIME adapter outputs inside a `<div data-blocksuite-snapshot='{lz-JSON}'>` attribute on `text/html` because browsers only reliably accept `text/plain`, `text/html`, and `image/png` on the async API.

### Finding D3-7: Keystatic — cleanest symmetric pattern (CONFIRMED)

File: `keystatic/packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx:14-73`:

```ts
clipboardTextSerializer(content, view) {
  try {
    return format(proseMirrorToMarkdoc(view.state.doc.type.create({}, content.content), {...}));
  } catch (err) {
    console.log('failed to serialize clipboard text as markdoc', err);
    return content.content.textBetween(0, content.content.size, '\n\n');
  }
},
clipboardTextParser(text, $context, plain, view) { /* markdocToProseMirror + Slice.maxOpen */ },
handlePaste(view, event) { /* VS Code html-detection special case */ },
```

- Both directions on the same plugin — symmetric.
- **Try/catch fallback to plain text** on serialize error — robustness pattern worth copying.
- VS Code paste-detection branch (`isProbablyHtmlFromVscode`, :77-97) recognizes VS Code's monospace-span HTML and prefers plain text (prevents styled-span-per-char pollution).

### Finding D3-8: Plate — no markdown on copy (CONFIRMED NOT FOUND)

Files: `plate/packages/markdown/src/lib/MarkdownPlugin.ts:107-128`, `plate/packages/core/src/static/plugins/ViewPlugin.ts:25-33`.

```ts
data.setData('application/x-slate-fragment', encoded);   // base64 Slate JSON
data.setData('text/html', html.innerHTML);
data.setData('text/plain', getPlainText(html));          // text from HTML, NOT markdown
```

`MarkdownPlugin` wires markdown on PASTE only (`parser.format: 'text/plain'` → `deserialize`). `api.markdown.serialize` exists for consumers to call manually but is never hooked to copy events.

### Finding D3-9: ProseMirror official markdown example — no clipboard hooks (CONFIRMED NOT FOUND)

- `ProseMirror/prosemirror-example-setup/src/index.ts` — no clipboard props.
- `ProseMirror/website/example/markdown/index.js` — just toggles `MarkdownView` (textarea) ↔ `ProseMirrorView`; no clipboard config.

This gap is why every downstream editor reinvents the hook.

### Finding D3-10: Novel / MDXEditor / HedgeDoc / Obsidian / Ghost (NOT FOUND / N/A)

- **Novel:** GitHub code search zero matches for "clipboard" in `steven-tey/novel`. Inherits TipTap core's default plain-text behavior.
- **MDXEditor:** Lexical-based, no PM clipboard hooks. Lexical uses `CUT_COMMAND`/`COPY_COMMAND`; MDXEditor does not override.
- **HedgeDoc:** CodeMirror 6 over `.md` — selection IS markdown. Separate "Copy as Markdown/HTML" buttons in preview pane.
- **Obsidian:** CodeMirror 6 over `.md`. Community "Copy as HTML" plugins go the OTHER direction (MD → HTML for pasting to rich destinations).
- **Ghost Koenig:** Lexical-based, out of scope.

---

## Patterns across editors

### Dominant pattern (markdown-canonical PM editors): `clipboardTextSerializer` + reuse-the-serializer

Adopted by **Outline, Milkdown, tiptap-markdown, Keystatic**:

1. Plugin with `props: { clipboardTextSerializer }`.
2. Inside callback, call the editor's own PM→markdown serializer on `slice.content`.
3. Do NOT override `text/html` — let PM emit default DOM-serialized HTML for rich-text destinations.
4. Return `null` to fall through to PM's default text extraction (opt-out).

### Outlier 1: DOM-level override (BlockNote)

Full DOM-level `handleDOMEvents.copy` with `event.preventDefault()`. Writes 3 MIME types including a private BlockNote-HTML for round-trip. Safari MIME limitations called out inline. More code, more flexibility.

### Outlier 2: Adapter registry + async clipboard API (BlockSuite/AFFiNE)

`navigator.clipboard.write` with priority-ordered `ClipboardItem` array. Snapshot round-trip via embedded HTML attribute. Requires transient user activation; browser MIME restrictions force workarounds.

### Outlier 3: No copy-to-markdown (Plate, TipTap core, Novel, ProseMirror examples)

Full markdown round-trip pipelines exist but aren't wired to copy. A design decision, not an oversight — markdown is seen as the authoring format, not the interchange format.

### Common sub-patterns

- **Pure-text shortcut** (Milkdown): `isPureText(slice.content.toJSON())` → `textBetween` with `\n\n`. Avoids `# `, `**`, etc. for inline selections.
- **Conditional simplification** (Outline): single code block / single mark / uniform block → plain text.
- **Fallback-on-error** (Keystatic): try/catch around the serializer, fall back to `textBetween`.
- **Three MIME types** (BlockNote): internal-roundtrip + external HTML + markdown-as-plain.
- **VS Code paste detection** (Keystatic, Milkdown): recognize VS Code's distinctive monospace-span HTML and prefer plain text on paste.

### What nobody writes: `text/markdown`

No surveyed editor writes `text/markdown` MIME. All markdown emission uses `text/plain`. Reasons: non-standard MIMEs on DataTransfer work unreliably (Safari especially), and async-clipboard allowlists gate to `text/plain`/`text/html`/`image/png`.

---

## Reference implementations (copy-paste-ready)

### Pattern 1 — Minimal Milkdown-style (unconditional)

```ts
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',
  addProseMirrorPlugins() {
    const serializer = /* your MD serializer */;
    return [new Plugin({
      key: new PluginKey('markdownClipboard'),
      props: {
        clipboardTextSerializer: (slice) => {
          if (isPureText(slice)) return null;  // fall through
          return serializer.serialize(slice.content);
        },
      },
    })];
  },
});
```

### Pattern 2 — Outline-style heuristic

```ts
clipboardTextSerializer: (slice, view) => {
  const shouldUsePlainText =
    isSingleCodeBlock(slice) ||
    hasOnlyCodeMark(slice) ||
    (hasSingleBlockType(slice) && !hasMultipleListItems(slice));
  return shouldUsePlainText
    ? plainTextFromSlice(slice)
    : mdSerializer.serialize(slice.content, { softBreak: true });
},
```

### Pattern 3 — BlockNote-style multi-MIME

```ts
new Plugin({
  props: {
    handleDOMEvents: {
      copy(view, event) {
        event.preventDefault();
        event.clipboardData!.clearData();
        const slice = view.state.selection.content();
        const html = view.serializeForClipboard(slice).dom.innerHTML;
        const markdown = serializer.serialize(slice.content);
        event.clipboardData!.setData('text/html', html);
        event.clipboardData!.setData('text/plain', markdown);
        return true;
      },
      cut(view, event) { /* same + deleteSelection */ },
    },
  },
});
```

### Pattern 4 — Keystatic-style fallback

```ts
clipboardTextSerializer(content) {
  try { return serializer.serialize(content.content); }
  catch (err) {
    console.warn('markdown serialization failed, falling back', err);
    return content.content.textBetween(0, content.content.size, '\n\n');
  }
},
```

---

## Gaps / follow-ups

- **Notion / Linear exact clipboard code is closed-source** — documented from external observation, not from their source.
- **Anytype, Bear, Typora** — not inspected at source level in this pass; R18 covered their PASTE behavior.

---

## Sources

All accessed 2026-04-15. Local cache paths under `/Users/edwingomezcuellar/.claude/oss-repos/` where present.

- Outline: [outline/outline](https://github.com/outline/outline) — `app/editor/extensions/ClipboardTextSerializer.ts`, `shared/editor/nodes/TableCell.ts`, `shared/editor/lib/ExtensionManager.ts`
- BlockNote: [TypeCellOS/BlockNote](https://github.com/TypeCellOS/BlockNote) — `packages/core/src/api/clipboard/toClipboard/copyExtension.ts`, `docs/content/docs/reference/editor/paste-handling.mdx`
- Milkdown: [Milkdown/milkdown](https://github.com/Milkdown/milkdown) — `packages/plugins/plugin-clipboard/src/index.ts`
- TipTap core: [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) — `packages/core/src/extensions/clipboardTextSerializer.ts`, `packages/core/src/Editor.ts`, `packages/markdown/src/Extension.ts`
- tiptap-markdown (community): [aguingand/tiptap-markdown](https://github.com/aguingand/tiptap-markdown) — `src/extensions/tiptap/clipboard.js`, `__tests__/clipboard.spec.js`
- BlockSuite / AFFiNE: [toeverything/AFFiNE](https://github.com/toeverything/AFFiNE), [toeverything/BlockSuite](https://github.com/toeverything/BlockSuite) — clipboard adapters
- Keystatic: [Thinkmill/keystatic](https://github.com/Thinkmill/keystatic) — `packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx`
- Plate: [udecode/plate](https://github.com/udecode/plate) — `packages/markdown/src/lib/MarkdownPlugin.ts`, `packages/core/src/static/plugins/ViewPlugin.ts`
- TipTap FAQ: https://tiptap.dev/docs/guides/faq
- TipTap Issue #3392 (custom renderText duplicates): https://github.com/ueberdosis/tiptap/issues/3392
- TipTap Discussion #4550 (copying lists to external programs): https://github.com/ueberdosis/tiptap/discussions/4550
- ProseMirror discuss: https://discuss.prosemirror.net/t/how-to-copy-text-in-markdown-format-from-marks/4054
- ProseMirror discuss: https://discuss.prosemirror.net/t/customize-how-content-is-copied-text-html-text-plain/407
- ProseMirror discuss: https://discuss.prosemirror.net/t/clipboard-with-custom-mime/8542
- Obsidian community: https://github.com/mvdkwast/obsidian-copy-as-html (inverse direction)
- Novel: https://github.com/steven-tey/novel
- MDXEditor: https://github.com/mdx-editor/editor
- Ghost Koenig: https://github.com/TryGhost/Koenig
