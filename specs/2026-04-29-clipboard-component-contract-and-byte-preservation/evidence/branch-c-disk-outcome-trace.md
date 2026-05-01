---
date: 2026-04-29
type: meta
sources:
  - packages/app/src/editor/clipboard/handle-paste.ts (96-104, 168-197)
  - packages/core/src/extensions/shared.ts
  - packages/app/src/editor/extensions/shared.ts
  - packages/app/src/editor/extensions/internal-link.ts
  - packages/core/src/extensions/{heading,emphasis,code-block,thematic-break,hard-break,link,html-block,code-mark}-fidelity.ts
  - packages/core/src/extensions/{list,jsx-component,jsx-inline,wiki-link,raw-mdx-fallback,escape-mark,source-literal-mark,link-ref-def-fidelity}.ts
  - node_modules/@tiptap/starter-kit/src/starter-kit.ts
  - node_modules/@tiptap/extension-{image,bold,italic,heading,code,code-block,hard-break,horizontal-rule,strike,underline,paragraph,blockquote,link,list}/dist/index.js
  - node_modules/@tiptap/extension-{table,highlight}/dist/index.js
  - packages/core/src/markdown/index.ts (mdast<->PM handlers)
  - packages/core/src/markdown/to-markdown-handlers.ts (image, code, list, heading overrides)
  - packages/server/src/persistence.ts (800-839 for serialize call site; 215-221 for snapshot)
---

# Branch C disk-outcome trace

Goal: enumerate exactly what bytes land in `<doc>.md` when a WYSIWYG paste enters
Branch C of the dispatcher (`/data-pm-slice/i.test(html)` is true; dispatcher
returns `false` and PM's default `parseFromClipboard` runs).

Branch A (vscode-editor-data path) is included as the contrast point.

## 1. Branch C mechanics — step-by-step

Dispatcher (`packages/app/src/editor/clipboard/handle-paste.ts:95-104`):

```ts
// Branch C: PM-origin slice → let PM handle natively.
if (html && /data-pm-slice/i.test(html)) {
  logSourceDetected({ view: 'wysiwyg', branch: 'C', source });
  logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'C', source });
  return false;
}
```

Returning `false` hands the event to PM's default. PM's default `handlePaste`
(`prosemirror-view/src/input.ts`):

1. Calls `parseFromClipboard(view, text/plain, text/html, plainOnly, $context)`.
2. `parseFromClipboard` reads the `data-pm-slice` attribute on the outer node
   to decide context-depth + open-start/open-end of the slice it returns. It
   does NOT use the attribute as schema info — only as slice metadata.
3. `parseFromClipboard` parses `text/html` via `DOMParser.parseFromString(...)`,
   then runs `DOMParser.parse` (the schema-driven parser) over the document
   body.
4. The schema's parse rules are walked in **priority order** (highest first;
   ties broken by registration order). For each DOM node, the **first** rule
   whose `tag` selector matches AND whose `getAttrs` does not return `false`
   wins, and the node is converted into the rule's PM type.
5. The resulting PM Slice is dispatched via `view.dispatch(tr.replaceSelection(slice))`.
6. Y-prosemirror's `ySyncPlugin` mirrors the resulting XmlFragment edits to the
   shared `Y.Doc`.
7. The **server-authoritative bridge** (`server-observers.ts`) observes the
   XmlFragment change and writes the equivalent markdown to `Y.Text('source')`
   — that's a separate path; it does NOT influence what hits disk.
8. **Persistence** (`packages/server/src/persistence.ts:800-808`) runs on the
   2 s Hocuspocus debounce. It calls
   `captureDocSnapshotForPersistence(document)` which does:

   ```ts
   yXmlFragmentToProseMirrorRootNode(document.getXmlFragment('default'), schema).toJSON()
   ```

   Then `mdManager.serialize(json)` produces the markdown bytes. Frontmatter
   from `Y.Map('metadata')` is prepended. Bytes are written to disk via
   `tracedWriteFile`.

**Disk bytes = `mdManager.serialize(yXmlFragmentToProseMirrorRootNode(default, schema).toJSON())`**.

The bridge to `Y.Text` and the clipboard's `text/plain` are **not** consulted
by the persistence path. The PM tree built by `parseFromClipboard` is the
sole source of truth for disk.

## 2. Full parseDOM rule table — extensions in `sharedExtensions`

OK's `sharedExtensions` registers (`packages/core/src/extensions/shared.ts:26-84`):

| Order | Extension | Origin | Schema name | parseDOM `tag` | Notes |
|---|---|---|---|---|---|
| 1 | JsxComponent | OK custom | `jsxComponent` (block) | `div[data-jsx-component]` | priority default (50). `getAttrs` reads `data-component-name`, `data-source-raw` (encoded). |
| 2 | RawMdxFallback | OK custom | `rawMdxFallback` (block) | `div[data-raw-mdx-fallback]` | Carries unparseable MDX source. |
| 3 | JsxInline | OK custom | `jsxInline` (inline atom) | `span[data-jsx-inline]` | NG14 thin shape — text content IS the source. |
| 4 | WikiLink | OK custom | `wikiLink` (inline atom) | `span[data-wiki-link]`, `a.wiki-link[data-target]` | Two rules. |
| 5 | List | OK custom | `list` (block) | `ul`, `ol` | priority **60** — wins over upstream BulletList/OrderedList (which are disabled anyway). |
| 6 | ListItem | OK custom | `listItem` (block) | `li` | priority 60. `getAttrs` reads `input[type="checkbox"]` for task items. |
| 7 | EmphasisFidelity | extends `@tiptap/extension-italic` | `emphasis` (mark) | `em`, `i` (font-style style rule), inline-style `font-style: italic` | priority 60. |
| 8 | StrongFidelity | extends `@tiptap/extension-bold` | `strong` (mark) | `strong`, `b` (font-weight gate), `font-weight=400` (clearMark), `font-weight` (computed bold) | priority 60. |
| 9 | CodeMarkFidelity | extends `@tiptap/extension-code` | `code` (mark) | `code` | priority default. R24/US-017 `excludes: ''`. |
| 10 | CodeBlockFidelity | extends `@tiptap/extension-code-block` | `codeBlock` (block) | `pre` (`preserveWhitespace: 'full'`) | priority 60. Reads child `<code class="language-X">` for language. |
| 11 | HeadingFidelity | extends `@tiptap/extension-heading` | `heading` (block) | `h1`..`h6` (one rule each, default levels 1-6) | priority 60. |
| 12 | ThematicBreakFidelity | extends `@tiptap/extension-horizontal-rule` | `thematicBreak` (block) | `hr` | priority 60. |
| 13 | LinkFidelity → InternalLink (app) | extends `@tiptap/extension-link` | `link` (mark) | `a[href]` with `getAttrs` URL allowlist | priority 60. |
| 14 | HtmlBlockFidelity | OK custom | `htmlBlock` (block) | `div[data-html-block]` | priority default. |
| 15 | LinkRefDefFidelity | OK custom | `linkRefDef` (block) | `div[data-link-ref-def]` | priority default. |
| 16 | HardBreakFidelity | extends `@tiptap/extension-hard-break` | `hardBreak` (inline) | `br` | priority default. |
| 17 | EscapeMark | OK custom | `escapeMark` (mark) | `span[data-escape-mark]` | priority default. |
| 18 | SourceLiteralMark | OK custom | `sourceLiteral` (mark) | `span[data-source-literal]` | priority default. |
| 19 | StarterKit (with disable list) | TipTap | several | (see below) | wraps remaining base extensions. |
| 20 | Table | TipTap | `table` | `table` | resizable. |
| 21 | TableRow | TipTap | `tableRow` | `tr` | |
| 22 | TableHeader | TipTap | `tableHeader` | `th` | |
| 23 | TableCell | TipTap | `tableCell` | `td` | |
| 24 | **Image** | TipTap (`@tiptap/extension-image`) | `image` (inline node, `Image.configure({inline: true})`) | **`img[src]:not([src^="data:"])`** | priority default 50. **No `data-` filter.** Wins for any `<img>` with a non-data-URI `src`. |
| 25 | Highlight | TipTap | `highlight` (mark) | `mark`, `style: background-color` | |

StarterKit extensions still active after the disable list in `shared.ts:62-75`:

| Extension | Tag selector | Notes |
|---|---|---|
| Document | (root) | No parseDOM rule. |
| Paragraph | `p` | Default. |
| Text | n/a | Schema text. |
| Blockquote | `blockquote` | Default. |
| Strike | `s`, `del`, `strike` | Default. |
| Underline | `u` | Default. |
| ListKeymap | n/a | Keymap only — no schema. |
| Dropcursor / Gapcursor / TrailingNode | n/a | Plugins only — no schema. |

Extensions disabled in StarterKit (so do **not** contribute parseDOM rules):
`bulletList`, `orderedList`, `listItem` (replaced by OK `List`/`ListItem`),
`italic`, `bold`, `code`, `codeBlock`, `heading`, `horizontalRule`,
`hardBreak`, `link` (each replaced by OK fidelity extension).

### The decision-implicating row

**Row 24 — Image — has the highest reach for any HTML containing
`<img src="...">`**: it ships the rule `img[src]:not([src^="data:"])` with no
JSX-aware filter. JsxComponent's `div[data-jsx-component]` matches a different
DOM shape (a `<div>` wrapper), so PM's parser **never sees** the JSX wrapper
that the source OK tab thought it copied.

When OK's `text/html` clipboard payload is just `<img src="x.png">` (the
"Option B native + PM auto-attaches `data-pm-slice`" shape characterized in
prior payload investigation), the `<img>` matches `Image`. There is no rule
in the schema that would re-promote a bare `<img>` back to a JSX
`jsxComponent` node — Image's parseDOM is the terminal match.

## 3. Four payload traces

### Payload (a) — Pre-fix OK→OK paste of `<img src="x.png" />`

**HTML on the clipboard** (Option B native shape, post-`data-pm-slice` attach):

```html
<img src="x.png" data-pm-slice="0 0 []">
```

(`text/plain` carries `![](x.png)` or similar; irrelevant for Branch C.)

**parseDOM walk:** the only DOM node is `<img>`. PM walks the schema's parse
rule set and matches **`Image`'s `img[src]:not([src^="data:"])`** (row 24).
`getAttrs` returns `{src: 'x.png', alt: null, title: null, width: null, height: null}`.

JsxComponent's `div[data-jsx-component]` does not match — there is no `<div>`.

**PM tree** (slice content):

```
image { src: "x.png", alt: null, title: null }
```

Because `Image.configure({inline: true})`, this is an inline node; PM wraps it
in a paragraph during slice fitting:

```
paragraph
  image { src: "x.png", alt: null, title: null }
```

**Y.XmlFragment** receives that subtree.

**On persistence**, `yXmlFragmentToProseMirrorRootNode(...).toJSON()` →
the PM-to-mdast handler in `packages/core/src/markdown/index.ts:952-959`:

```ts
nodeHandlers.image = (pmNode) => ({
  type: 'image',
  url: pmNode.attrs.src,
  alt: pmNode.attrs.alt,
  title: pmNode.attrs.title,
});
```

Producing mdast `paragraph(image(url: "x.png", alt: null, title: null))`.

**Serialize** (`to-markdown-handlers.ts:172-203` `image` handler) emits
`![](x.png)`. The paragraph wrapper renders as a paragraph block.

**Disk bytes:**

```
![](x.png)
```

(with trailing newline). The JSX wrapper is **gone**. The user sees a CommonMark
image where they had a `<img>` JSX element.

### Payload (b) — Pre-fix OK→OK paste of `<Callout type="note">body</Callout>`

The shape characterized in prior-art (pre-Option-C clipboard fallback):

```html
<pre class="mdx-component" data-pm-slice="0 0 []"><code>&lt;Callout type=&quot;note&quot;&gt;body&lt;/Callout&gt;</code></pre>
```

**parseDOM walk:** outer node is `<pre>`. The schema's matching rule is
**CodeBlockFidelity → `tag: 'pre'`** (row 10, priority 60). `preserveWhitespace: 'full'`
keeps the inner text intact. `language` attr handler (`addAttributes()` from
`@tiptap/extension-code-block`) inspects `firstElementChild.classList` for
`language-*`; the inner `<code>` has class `mdx-component` carried on the
parent, no `language-*`, so language = `null`.

JsxComponent's `div[data-jsx-component]` rule does not match `<pre>`.

The browser HTML-decodes `&lt;` → `<` and `&quot;` → `"` while reading the
`<code>` child's textContent.

**PM tree:**

```
codeBlock { language: null, fenceDelimiter: '`', fenceLength: 3 }
  text "<Callout type=\"note\">body</Callout>"
```

**Persistence** — PM-to-mdast handler in `index.ts:873-884`:

```ts
nodeHandlers.codeBlock = (pmNode) => ({
  type: 'code',
  lang: pmNode.attrs.language ?? null,
  meta: pmNode.attrs.meta ?? null,
  value: pmNode.textContent ?? '',
  data: {
    sourceFenceChar: pmNode.attrs.fenceDelimiter,
    sourceFenceLength: pmNode.attrs.fenceLength,
  },
});
```

mdast: `code { lang: null, meta: null, value: '<Callout type="note">body</Callout>' }`.

**Serialize** (`to-markdown-handlers.ts:245-256` `code` handler) emits a fenced
code block with the carried fence char and length.

**Disk bytes:**

```
```
<Callout type="note">body</Callout>
```
```

The Callout that was a real component in the source tab becomes **literal text
inside a fenced code block** in the destination — the destination renders
"`<Callout type="note">body</Callout>`" instead of the styled callout.

### Payload (c) — Linear-style heading + paragraph with strong + emphasis

**HTML on the clipboard:**

```html
<h2 data-pm-slice="0 0 []">Heading</h2>
<p>Some <strong>bold</strong> and <em>italic</em> text.</p>
```

**parseDOM walk:**

- `<h2>` → matches **HeadingFidelity** (row 11, priority 60, `tag: 'h2'`).
  `getAttrs` returns `{level: 2}`; the OK extension defaults `headingStyle: 'atx'`.
- `<p>` → matches **Paragraph** (StarterKit, `tag: 'p'`).
- `<strong>` → matches **StrongFidelity** (row 8, priority 60). Default
  `sourceDelimiter: '**'`.
- `<em>` → matches **EmphasisFidelity** (row 7, priority 60). Default
  `sourceDelimiter: '*'`.
- Plain text nodes inside paragraphs become `text`.

**PM tree:**

```
heading { level: 2, headingStyle: 'atx' }
  text "Heading"
paragraph
  text "Some "
  text "bold" [strong{sourceDelimiter: '**'}]
  text " and "
  text "italic" [emphasis{sourceDelimiter: '*'}]
  text " text."
```

**Persistence** — handlers in `index.ts:866-871, 1122-1131`:

```ts
nodeHandlers.heading = fromPmNode('heading', (pmNode) => ({
  depth: pmNode.attrs.level,
  data: { sourceStyle: pmNode.attrs.headingStyle },
}));
markHandlers.strong = fromPmMark('strong', (mark) => ({
  data: { sourceDelimiter: mark.attrs.sourceDelimiter },
}));
markHandlers.emphasis = fromPmMark('emphasis', (mark) => ({
  data: { sourceDelimiter: mark.attrs.sourceDelimiter },
}));
```

mdast:

```
root
  heading{depth:2, data:{sourceStyle:'atx'}}
    text "Heading"
  paragraph
    text "Some "
    strong{data:{sourceDelimiter:'**'}}
      text "bold"
    text " and "
    emphasis{data:{sourceDelimiter:'*'}}
      text "italic"
    text " text."
```

**Serialize** — `to-markdown-handlers.ts:259-276` heading handler emits ATX
form (`## `). `mdast-util-to-markdown` defaults handle strong (`**...**`) and
emphasis (`*...*`); fidelity attrs carry through.

**Disk bytes:**

```
## Heading

Some **bold** and *italic* text.
```

(Trailing newline normalization handled by `serialize-helpers.ts`.) Branch C
on Linear HTML produces clean GFM. This is the case where Branch C **works
well** — Linear's HTML maps cleanly to OK's schema.

### Payload (d) — Outline-style bullet list with `<span data-mention>`

**HTML on the clipboard:**

```html
<ul data-pm-slice="0 0 []">
  <li>Item with <span data-mention="user-123">@mention</span></li>
</ul>
```

**parseDOM walk:**

- `<ul>` → matches **OK List** (row 5, priority 60, `tag: 'ul'`,
  `getAttrs` returns `{ordered: false}`).
- `<li>` → matches **OK ListItem** (row 6, priority 60). Inspects
  `input[type="checkbox"]`; finds none, returns `{checked: null}`.
- `<span data-mention="...">` — **does not match any rule**. There is no
  `span[data-mention]` rule in the schema. The only `span[...]` rules are
  `span[data-jsx-inline]`, `span[data-wiki-link]`, `span[data-escape-mark]`,
  `span[data-source-literal]` — none match.
  ProseMirror's `DOMParser` treats unrecognized inline elements as a passthrough:
  it descends into the children but discards the wrapper node. The text content
  `@mention` is preserved as a plain text run with no marks.

**PM tree:**

```
list { ordered: false, start: 1, spread: false, bulletMarker: null, listMarkerDelimiter: null }
  listItem { checked: null, spread: false }
    paragraph        // synthesized by `createAndFill` to satisfy `paragraph block*`
      text "Item with @mention"
```

**Persistence** — `index.ts:902-942`. The `listItem` handler strips a leading
empty paragraph (`isEmptyMdastParagraph`) but a paragraph with text is kept.
mdast:

```
root
  list{ordered:false, start:null, spread:false, data:{bulletMarker:null, listMarkerDelimiter:null}}
    listItem{checked:null, spread:false}
      paragraph
        text "Item with @mention"
```

**Serialize** — `to-markdown-handlers.ts:280` list handler picks bullet marker
(default `-` when `bulletMarker` is null).

**Disk bytes:**

```
- Item with @mention
```

The mention identity (`data-mention="user-123"`) is **silently dropped**. This
is structurally identical to the JSX-component-loss class — Branch C silently
discards any rich payload not in OK's schema, regardless of which app produced
it. The user gets text-only fidelity for things OK doesn't model.

## 4. Branch A vs Branch C — disk-bytes comparison

| Aspect | Branch A (`vscode-editor-data`) | Branch C (`data-pm-slice`) |
|---|---|---|
| Trigger | `dt.getData('vscode-editor-data')` truthy | `text/html` matches `/data-pm-slice/i` |
| Dispatcher behavior | Builds a `codeBlock` PM node from `text/plain` directly via `tr.replaceSelectionWith(codeNode)`; returns `true` | Returns `false`; PM's default `parseFromClipboard` walks `text/html` against schema parseDOM rules |
| Source of disk bytes | `text/plain` payload, wrapped in a fenced code block with VS Code's language ident | PM tree built from `text/html` by schema-driven DOM parser; whatever `mdManager.serialize` produces from that PM tree |
| Disk bytes for `<img src="x.png" />` clipboard | ` ```mdx\n<img src="x.png" />\n``` ` (literal text in fence) | `![](x.png)` — Image extension consumed the `<img>`, lost the JSX wrapper |
| Disk bytes for `<Callout type="note">body</Callout>` clipboard | ` ```mdx\n<Callout type="note">body</Callout>\n``` ` (literal text in fence) | ` ```\n<Callout type="note">body</Callout>\n``` ` (CodeBlockFidelity matched the `<pre>` wrapper, captured decoded text) |
| Disk bytes for Linear heading + bold + italic | Whatever `text/plain` was, fenced as code with VS Code's language | `## Heading\n\nSome **bold** and *italic* text.` (clean GFM) |
| Fidelity for things in OK's schema | None — everything is treated as code | Faithful — headings, lists, marks, links round-trip through PM |
| Fidelity for things NOT in OK's schema (mentions, JSX components, custom inline nodes) | Preserved literally as code | Silently dropped; only text runs are kept |
| Reversibility | Round-trippable as text in a fence | Lossy — once the JSX wrapper is gone, no schema rule can restore it |

## 5. The decision-implicating finding

The user's regression mechanism, confirmed by code:

1. **OK source tab** holds a `jsxComponent` node with `componentName: "Image"`,
   `sourceRaw: '<Image src="x.png" />'`, etc. (or `Callout`, etc.)
2. The clipboard `text/html` payload is shaped by `mdast-to-html` →
   `customNodeHandlers[mdxJsxFlowElement]`. For component shapes that
   `mdast-to-hast-handlers.ts` knows how to render, the HTML is the
   **rendered shape** (e.g. an `<img>` for an Image component, or a
   `<pre class="mdx-component">` fallback for unknown components). The
   `data-pm-slice="..."` attribute is auto-attached by PM when copying from
   inside ProseMirror.
3. **OK destination tab** sees the `data-pm-slice`, hits Branch C, returns
   `false`. PM's `parseFromClipboard` walks the HTML.
4. The schema's `Image` extension (`tag: 'img[src]:not([src^="data:"])'`,
   priority 50) matches the `<img>` node before any custom rule could catch
   the JSX-component intent. **There is no schema rule with `getAttrs` that
   could detect "this `<img>` was a JSX component"** — every `<img>` looks
   the same to the schema.
5. The PM tree gets a plain `image` node. Y.XmlFragment, persistence, and
   serialize all faithfully convert that to `![](x.png)`.

For the `<Callout>` case the same mechanism applies one level up: the
clipboard `<pre class="mdx-component"><code>...</code></pre>` fallback shape
matches `CodeBlockFidelity` (`tag: 'pre'`, priority 60) before any
`div[data-jsx-component]` rule could fire — there is no `<div>` in the
payload.

The fix space is necessarily structural: either (i) the source clipboard
payload must contain a DOM shape that **matches a schema rule that yields
`jsxComponent`**, or (ii) the dispatcher must intercept Branch C with a
JSX-aware pre-check before delegating to PM. Both paths are within the
spec's scope.

## 6. Notes on the persistence pipeline

- The bridge (Server Observer A: `XmlFragment → Y.Text`, Observer B: reverse)
  runs on every XmlFragment change including paste, but does **not** influence
  what hits disk. Disk reads come from the XmlFragment via
  `yXmlFragmentToProseMirrorRootNode` directly (see
  `packages/server/src/persistence.ts:215-221, 800-808`). The bridge is for
  Source-mode rendering, not persistence.
- `frontmatter` is read from `Y.Map('metadata')` and prepended to the
  serialized body; for paste flows that don't touch metadata, the existing
  frontmatter passes through unchanged.
- The `markdownSemanticallyUnchanged` short-circuit at
  `persistence.ts:833-839` compares `normalizeBridge(markdown) ===
  normalizeBridge(currentBase)` to skip no-op stores. A paste that genuinely
  alters the document never trips this; a paste that resolves back to the
  same byte string (after normalization) won't write to disk.
- The `phantom-doc guard` and the writerId taxonomy
  (`agent-<connId>` / `principal-<UUID>` / `file-system` /
  `git-upstream` / `openknowledge-service`) don't affect the byte content;
  they only affect attribution and which writer triggers L2 git commits.

