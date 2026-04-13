# D5: CodeMirror 6 Source Editor Integration

**Parent question:** What constraints does the CodeMirror source editor impose on the full-stack ProseMirror-based CRDT markdown editor architecture?

**Bottom line:** CodeMirror 6 is architecturally independent of ProseMirror. It binds to Y.Text (flat string), not Y.XmlFragment (tree), so the ProseMirror schema, markdown parser pipeline, and node extensions can change freely without touching the source editor. The only coupling surface is the bidirectional observer layer that bridges Y.Text ↔ Y.XmlFragment — and that layer depends on the markdown serializer/parser, not on CodeMirror itself. **CodeMirror imposes zero constraints on the ProseMirror schema or remark/prosemirror-markdown pipeline choice.**

---

## 1. y-codemirror.next Binding Model

**Source:** `node_modules/y-codemirror.next/src/` (v0.3.5)

The binding uses a `ViewPlugin` (not a StateField or transaction filter) via `cmView.ViewPlugin.fromClass(YSyncPluginValue)`.

### Sync mechanism

| Direction | Mechanism | Origin guard |
|---|---|---|
| CM → Y.Text | `update.changes.iterChanges()` → `ytext.delete()`/`ytext.insert()` inside `ytext.doc.transact(fn, syncConf)` | Y.Text observer skips events where `tr.origin === syncConf` |
| Y.Text → CM | `ytext.observe(callback)` reads `event.delta` → `view.dispatch({changes, annotations: [ySyncAnnotation]})` | CM `update()` skips transactions carrying `ySyncAnnotation` |

Echo prevention is symmetric: local edits tag the Y.Doc transaction with the config object as origin; the observer skips that origin. Remote deltas dispatch with a CM annotation; the update handler skips that annotation.

### Cursor preservation

Remote cursors use **Yjs relative positions** (`Y.createRelativePositionFromTypeIndex()`), not absolute offsets. When concurrent edits shift text, relative positions resolve to the correct new absolute positions automatically — no manual delta adjustment.

### API

```typescript
yCollab(ytext: Y.Text, awareness: Awareness, opts?: { undoManager?: Y.UndoManager | false }): Extension
```

Returns an Extension array containing: sync ViewPlugin, remote selections (if awareness truthy), UndoManager integration (unless `false`), and native undo/redo interception.

**Evidence:** [y-codemirror-next-binding.md](evidence/y-codemirror-next-binding.md)

---

## 2. ProseMirror Schema Coupling

**Finding: None.** The source editor operates on Y.Text — a flat string. It has no awareness of:
- ProseMirror node types, marks, or schema rules
- Y.XmlFragment structure
- The markdown parser or serializer used

The bridge between source mode and WYSIWYG is handled by a separate observer layer (`packages/app/src/editor/observers.ts`), which:
- **Observer A** (XmlFragment → Y.Text): Serializes the PM tree to markdown via `mdManager.serialize()`, diffs against a baseline, applies incremental changes to Y.Text
- **Observer B** (Y.Text → XmlFragment): Parses Y.Text via `mdManager.parse()`, applies to XmlFragment via `updateYFragment()`

The observers depend on the markdown manager (serialize/parse), not on CodeMirror. If the project migrates from `@tiptap/markdown` to `remark-prosemirror` or `prosemirror-markdown`, the observers' `mdManager` reference changes — CodeMirror's configuration stays identical.

**Architectural implication:** The source editor is a pure text view. Schema changes, extension additions, and parser pipeline swaps are invisible to it.

---

## 3. @codemirror/lang-markdown Capabilities

**Source:** `node_modules/@codemirror/lang-markdown/` (v6.5.0), `node_modules/@lezer/markdown/` (v1.6.3)

The Lezer markdown parser is a hand-written, incremental, two-phase parser (block then inline) that produces Lezer-compatible syntax trees. **It is not an LR parser** — Markdown's context-sensitivity makes LR parsing infeasible.

### GFM support

| Feature | Status | Extension |
|---|---|---|
| Tables | Built-in | `Table` |
| Strikethrough | Built-in | `Strikethrough` |
| Task lists | Built-in | `TaskList` |
| Autolinks | Built-in | `Autolink` |
| All GFM | Bundle | `GFM` (convenience) |

Additionally: `Subscript`, `Superscript`, `Emoji` are built-in extensions.

`markdownLanguage` (exported preset) includes GFM + Sub/Super/Emoji. `commonmarkLanguage` (default) does **not** include GFM.

**Current project gap:** `SourceEditor.tsx` calls `markdown()` with no config, defaulting to `commonmarkLanguage`. Tables, strikethrough, and task lists are **not highlighted** in source mode. Fix: `markdown({ base: markdownLanguage })`.

### MDX/JSX support

**Not available.** No built-in MDX or JSX awareness. The [discuss.codemirror.net thread](https://discuss.codemirror.net/t/how-to-syntax-highlight-mdx-in-codemirror-v6/8849) (Dec 2024) posed the question with no official solution.

Approaches to add MDX highlighting:
1. **Custom `parseInline`** with `before: "HTMLTag"` — can match `<Component ...>` but conflicts with the built-in HTML tag parser
2. **Custom `parseBlock`** with `before: "HTMLBlock"` — for block-level JSX components
3. **Nested parser via `wrap`** — delegate JSX regions to `@codemirror/lang-javascript` via `parseMixed`
4. **Decoration-based** (like the current wiki-link approach) — regex ViewPlugin applies styling without modifying the syntax tree

For a greenfield editor, option 3 (nested parser) is architecturally cleanest: define a `parseBlock` for JSX component blocks that delegates inner content to a JSX parser, and a `parseInline` for inline JSX expressions.

### Frontmatter support

**Not built-in.** The `---` delimiter is parsed as `HorizontalRule`. A custom `parseBlock` extension with `before: "HorizontalRule"` can intercept it, and `parseMixed` can delegate the inner YAML to `@codemirror/lang-yaml`.

**Evidence:** [lang-markdown-capabilities.md](evidence/lang-markdown-capabilities.md)

---

## 4. Syntax Highlighting Gaps for MDX

Known gaps for MDX/JSX in a markdown context:

| Gap | Severity | Mitigation |
|---|---|---|
| No JSX syntax tree nodes | Medium | Custom `parseInline`/`parseBlock` with nested JS parser |
| JSX conflicts with HTML parser | Medium | Insert custom parsers `before: "HTMLTag"`/`before: "HTMLBlock"` |
| No JSX expression highlighting (`{variable}`) | Medium | Custom inline parser triggered on `{` |
| Import/export statements not recognized | Low | Custom block parser for lines starting with `import`/`export` |
| No frontmatter highlighting | Low | Custom block parser + nested YAML parser |
| Component prop type awareness | None | Out of scope for syntax highlighting |

The Lezer extension model is well-designed for this — each gap maps to a specific `MarkdownConfig` extension. The work is non-trivial (each custom parser needs careful interaction testing with built-in parsers) but architecturally straightforward.

---

## 5. Extension Model for Custom Syntax

The `MarkdownConfig` interface provides five extension points:

1. **`defineNodes`** — declare new node types with optional `@lezer/highlight` tag styling
2. **`parseInline`** — custom inline parsers (trigger on char code, scan forward, `before`/`after` ordering)
3. **`parseBlock`** — custom block parsers (eager/leaf/composite, `before`/`after` ordering)
4. **`remove`** — disable built-in parsers by name
5. **`wrap`** — parse wrappers for nested language embedding via `parseMixed`

### Wiki-link example (Lezer approach)

```typescript
const WikiLink: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: t.link },
    { name: "WikiLinkMark", style: t.processingInstruction }
  ],
  parseInline: [{
    name: "WikiLink",
    parse(cx, next, pos) {
      if (next !== 91 || cx.char(pos + 1) !== 91) return -1;
      for (let i = pos + 2; i < cx.end - 1; i++) {
        if (cx.char(i) === 93 && cx.char(i + 1) === 93) {
          return cx.addElement(cx.elt("WikiLink", pos, i + 2, [
            cx.elt("WikiLinkMark", pos, pos + 2),
            cx.elt("WikiLinkMark", i, i + 2)
          ]));
        }
      }
      return -1;
    },
    before: "Link"
  }]
};
```

**Current project approach:** The project uses a regex-based `ViewPlugin` with `Decoration.mark()` instead of a Lezer extension. This is pragmatic — it provides highlighting, click navigation, and completion without modifying the syntax tree. Trade-off: wiki-links don't participate in fold, indent, or tree-based queries (minor for wiki-links specifically).

### Two approaches compared

| Aspect | Lezer parser extension | Decoration ViewPlugin |
|---|---|---|
| Syntax tree participation | Yes — visible to fold, indent, tree queries | No — visual only |
| Incremental reparsing | Automatic (Lezer handles it) | Manual viewport rebuild |
| Complexity | Higher (parser interaction testing needed) | Lower (regex + decorations) |
| Composability | High (other extensions can query the tree) | Low (standalone) |
| Good for | Core syntax (MDX components, frontmatter) | UI chrome (wiki-links, agent flash) |

**Recommendation for greenfield:** Use Lezer extensions for MDX components and frontmatter (syntax that other tooling needs to understand). Use decoration ViewPlugins for UI-specific overlays like wiki-links and agent activity.

---

## 6. Interaction with Markdown Pipeline (remark/micromark)

**Finding: Completely separate tokenization.** There is no shared tokenization between:
- **@lezer/markdown** (CodeMirror's syntax highlighting) — hand-written incremental parser, produces Lezer syntax trees for editor features (highlighting, fold, indent)
- **remark/micromark** (semantic parsing pipeline) — state-machine tokenizer producing mdast/CST, used for markdown↔PM conversion

These serve fundamentally different purposes:
- Lezer needs to be **incremental** (reparse only changed regions on keystroke) and **fault-tolerant** (incomplete/invalid markdown must still produce a usable tree)
- remark/micromark needs to be **semantically complete** (full AST for transformation) and **spec-compliant** (CommonMark/GFM/MDX spec conformance)

### Alignment concerns

When using remark for the PM pipeline and @lezer/markdown for highlighting, the two parsers may disagree on edge cases. This is generally harmless because:
1. Highlighting errors are cosmetic, not semantic
2. The PM tree (from remark) is the source of truth for document structure
3. Users see the remark interpretation when they switch to WYSIWYG mode

The risk is confusion if a construct highlights as X in source mode but renders as Y in WYSIWYG. This already exists today (e.g., GFM tables highlight correctly in WYSIWYG but not in source mode because `commonmarkLanguage` is used). Adding GFM to the source editor's language config would largely eliminate this class of divergence for standard markdown.

For MDX specifically, adding Lezer extensions that match remark-mdx's parsing rules would keep the two in sync. The extensions should be tested against the same corpus the remark pipeline uses.

---

## 7. Performance

CodeMirror 6 uses viewport-based rendering and incremental parsing. The [million-line demo](https://codemirror.net/examples/million/) demonstrates handling documents of several million lines.

Key techniques:
- **Viewport rendering:** Only DOM nodes for visible lines are created
- **Incremental parsing:** Lezer reparses only changed regions, with work-limiting to avoid battery/memory waste
- **Idle scheduling:** Parser stops entirely when editor is inactive
- **Tree-shaped document model:** O(log n) for most position operations

For a markdown editor with CRDT collaboration, performance is unlikely to be a concern:
- Markdown documents rarely exceed tens of thousands of lines
- The Lezer markdown parser is simpler than language parsers (no deep nesting)
- y-codemirror.next applies deltas incrementally (no full-document replace)
- Remote cursor rendering is O(n) in collaborator count, not document size

The main performance consideration is the **observer layer**, not CodeMirror itself. Observer A's `diffLinesFast()` and Observer B's full `mdManager.parse()` are the expensive operations during sync, and those are independent of CodeMirror.

---

## Architectural Summary

```
┌─────────────────────────────────────────────────┐
│                 Y.Doc                            │
│  ┌──────────────┐    ┌────────────────────────┐  │
│  │ Y.XmlFragment│    │ Y.Text                 │  │
│  │ ('default')  │    │ ('source')             │  │
│  │              │    │                        │  │
│  │  ProseMirror │    │  CodeMirror 6          │  │
│  │  schema +    │    │  (pure text view)      │  │
│  │  remark      │    │                        │  │
│  └──────┬───────┘    └────────┬───────────────┘  │
│         │                     │                   │
│         │   Observer Layer    │                   │
│         │  (mdManager only)   │                   │
│         └─────────┬───────────┘                   │
│                   │                               │
│          serialize / parse                        │
│          (remark pipeline)                        │
└─────────────────────────────────────────────────┘

CodeMirror knows about: Y.Text, awareness, theme
CodeMirror does NOT know about: ProseMirror, remark, schema, extensions
```

### Constraints imposed on architecture: None

The source editor is fully decoupled from:
- ProseMirror schema design
- Markdown parser/serializer choice (remark, prosemirror-markdown, @tiptap/markdown)
- Extension set (headings, tables, code blocks, MDX components)
- CRDT tree structure (Y.XmlFragment schema)

### Opportunities for improvement

1. **Enable GFM highlighting** — switch to `markdown({ base: markdownLanguage })` (one-line change)
2. **Add frontmatter highlighting** — custom Lezer block parser + nested YAML parser
3. **Add MDX/JSX highlighting** — custom Lezer inline/block parsers + nested JS parser
4. **Upgrade wiki-links to Lezer extension** — optional, current decoration approach is adequate
5. **Add `codeLanguages` resolver** — highlight fenced code blocks by language info string

None of these require changes to the ProseMirror side or the observer layer.

---

## Sources

- [y-codemirror.next source](https://github.com/yjs/y-codemirror.next) — v0.3.5, `node_modules/y-codemirror.next/src/`
- [@codemirror/lang-markdown source](https://github.com/codemirror/lang-markdown) — v6.5.0
- [@lezer/markdown source](https://github.com/lezer-parser/markdown) — v1.6.3
- [CodeMirror million-line demo](https://codemirror.net/examples/million/)
- [MDX highlighting discussion](https://discuss.codemirror.net/t/how-to-syntax-highlight-mdx-in-codemirror-v6/8849) — discuss.codemirror.net, Dec 2024
- [CM6 performance benchmarks discussion](https://discuss.codemirror.net/t/cm6-performance-benchmarks/2471) — discuss.codemirror.net
- [CodeMirror language package guide](https://codemirror.net/examples/lang-package/)
