---
title: "Architecturally-Ideal ProseMirror Schema for a CRDT Markdown Editor with MDX"
description: "Validated schema design for a greenfield ProseMirror-based CRDT markdown editor backed by the unified/remark pipeline, with MDX support. Synthesizes constraints from ProseMirror core, Y.js collaboration, the remark/micromark pipeline, the remark-prosemirror bridge library, CodeMirror source mode, and reference editor architectures (Milkdown, BlockNote, Plate)."
createdAt: 2026-04-12
updatedAt: 2026-04-12
subjects:
  - ProseMirror
  - TipTap
  - Y.js
  - remark
  - micromark
  - remark-prosemirror
  - CodeMirror
  - Milkdown
  - BlockNote
  - Plate
topics:
  - editor schema design
  - CRDT collaboration
  - markdown fidelity
  - MDX support
---

# Architecturally-Ideal ProseMirror Schema for a CRDT Markdown Editor with MDX

**Purpose:** Determine the ideal full-stack configuration for a greenfield ProseMirror-based CRDT markdown editor backed by the unified/remark pipeline, with MDX support. Validate a proposed schema against constraints from six technical dimensions.

---

## Executive Summary

The proposed schema is **architecturally sound**, validated against ProseMirror core constraints, Y.js CRDT semantics, the remark/micromark pipeline, the remark-prosemirror bridge library, CodeMirror's source-mode architecture, and three reference editors. Six hard constraints, four soft recommendations, and four confirmed non-constraints emerged. Two design corrections are required: `checked` must move from `list` to `listItem` (mdast parity), and all fidelity attributes must be flat primitives (Y.js type contract).

The recommended schema maps all 32 mdast node types to **17 block nodes, 5 inline nodes, and 5 marks** — a complete 1:1 mapping with zero lossy translations. Source-text fidelity is achievable via mdast position-based source slicing, which bypasses all known serializer bugs. The remark-prosemirror bridge (~650 LOC) provides type-safe mdast↔PM conversion; consumers must register ~40-45 handlers. CodeMirror imposes zero constraints on the schema or pipeline choice.

**Key Findings:**
- **Schema naming is free:** y-prosemirror and ProseMirror core are fully name-agnostic. Renaming `bold`→`strong` or `horizontalRule`→`thematicBreak` is low-friction.
- **Schema evolution is destructive in Y.js** but mitigated by markdown-on-disk canonical storage: Y.Docs are ephemeral, rebuilt from markdown on every load.
- **Source-text fidelity is a genuine differentiator:** No reference editor (Milkdown, BlockNote, Plate, prosemirror-markdown) preserves per-node source form. The remark pipeline's position info enables a cleaner fidelity approach than the current regex-heuristic strategy.
- **remark-prosemirror is the right bridge:** Marijn-approved, 650 LOC, stable handler API. Pre-1.0 and low-maintenance, but trivially forkable.

---

## 1. Recommended Schema

Every schema choice below cites the dimension(s) whose evidence supports it. The schema produces a complete 1:1 mapping to all 32 mdast node types.

### 1.1 Block Nodes (17 types)

| PM Node | mdast Type | Attrs | Content | Evidence |
|---|---|---|---|---|
| `doc` | `root` | — | `block+` | D1 §10, D2 §8 |
| `paragraph` | `paragraph` | — | `inline*` | D1 §10 |
| `heading` | `heading` | `level: 1-6`, `sourceStyle: 'atx'\|'setext'` | `inline*` | D1 §10, D3 §6, D6 §1 |
| `blockquote` | `blockquote` | — | `block+` | D1 §10 |
| `list` | `list` | `ordered: boolean`, `start: number\|null`, `spread: boolean` | `listItem+` | D1 §3, D3 §6, D6 §1 |
| `listItem` | `listItem` | `checked: boolean\|null`, `spread: boolean` | `paragraph block*` | D1 §3-4, D3 §6 |
| `codeBlock` | `code` | `language: string\|null`, `meta: string\|null`, `sourceFenceChar: string`, `sourceFenceLength: number` | `text*` | D1 §8, D3 §6 |
| `htmlBlock` | `html` | `content: string` | — (atom) | D1 §9, D3 §6 |
| `thematicBreak` | `thematicBreak` | `sourceRaw: string` | — (atom) | D1 §5, D3 §6 |
| `linkDefinition` | `definition` | `identifier: string`, `label: string`, `url: string`, `title: string\|null` | — (atom) | D3 §6 |
| `table` | `table` | `align: string[]` | `tableRow+` | D3 §6 |
| `tableRow` | `tableRow` | — | `tableCell+` | D3 §6 |
| `tableCell` | `tableCell` | `header: boolean` | `inline*` | D3 §6 |
| `jsxComponent` | `mdxJsxFlowElement` | `name: string\|null`, `sourceContent: string` | — (atom) | D3 §2, D4 §4, D6 §3 |
| `mdxExpression` | `mdxFlowExpression` | `value: string` | — (atom) | D3 §2 |
| `mdxEsm` | `mdxjsEsm` | `value: string` | — (atom) | D3 §2 |
| `footnoteDefinition` | `footnoteDefinition` | `identifier: string`, `label: string\|null` | `block+` | D3 §1 |

### 1.2 Inline Nodes (5 types)

| PM Node | mdast Type | Attrs | Evidence |
|---|---|---|---|
| `hardBreak` | `break` | `sourceStyle: 'backslash'\|'spaces'` | D1 §1, D3 §6 |
| `image` | `image` | `src: string`, `alt: string\|null`, `title: string\|null` | D1 §2, D6 §1 |
| `footnoteReference` | `footnoteReference` | `identifier: string`, `label: string\|null` | D3 §1 |
| `jsxInline` | `mdxJsxTextElement` | `name: string\|null`, `sourceContent: string` | D3 §2, D4 §4 |
| `mdxInlineExpression` | `mdxTextExpression` | `value: string` | D3 §2 |

### 1.3 Marks (5 types)

| PM Mark | mdast Type | Attrs | Evidence |
|---|---|---|---|
| `strong` | `strong` | `sourceDelimiter: '**'\|'__'` | D1 §5, D2 §7, D6 §1 |
| `emphasis` | `emphasis` | `sourceDelimiter: '*'\|'_'` | D1 §5, D2 §7, D6 §1 |
| `strikethrough` | `delete` | — | D3 §1 |
| `link` | `link` | `href: string`, `title: string\|null`, `sourceStyle: 'inline'\|'full'\|'collapsed'\|'shortcut'`, `sourceRefLabel: string\|null` | D1 §2, D3 §6 |
| `code` | `inlineCode` | — | D6 §4 |

### 1.4 Frontmatter (Outside Schema)

YAML frontmatter is stripped before ProseMirror parsing and stored in `Y.Map('metadata')`. This matches the current architecture and [Marijn's explicit recommendation](https://discuss.prosemirror.net/t/prosemirror-and-front-matter-metadata/1620): extract before editing, re-attach after. The remark-frontmatter plugin produces a `yaml` node at position 0 in `root.children` that is trivially removed before conversion.

**Evidence:** D3 §8, D6 §4

### 1.5 Unified List NodeSpec

The proposed unified list follows [prosemirror-flat-list](https://github.com/ocavue/prosemirror-flat-list)'s proven model with mdast-aligned attribute names:

```typescript
list: {
  content: 'listItem+',
  group: 'block',
  attrs: {
    ordered: { default: false },
    start: { default: null },
    spread: { default: false },
  },
}

listItem: {
  content: 'paragraph block*',
  attrs: {
    checked: { default: null },  // null=normal, false=unchecked, true=checked
    spread: { default: false },
  },
}
```

**Mapping to/from mdast:**
- `- text` → `list(ordered:false) > listItem(checked:null)`
- `1. text` → `list(ordered:true) > listItem(checked:null)`
- `- [ ] text` → `list(ordered:false) > listItem(checked:false)`
- `- [x] text` → `list(ordered:false) > listItem(checked:true)`

ProseMirror's list commands (`wrapInList`, `splitListItem`, `liftListItem`, `sinkListItem`) accept `NodeType` parameters — not strings. The unified type works without modification.

**TipTap integration cost:** Replacing three TipTap extensions (BulletList + OrderedList + TaskList) with a single custom extension. TipTap's `wrappingInputRule` wrapper has hardcoded `"bulletList"`/`"orderedList"`/`"taskList"` strings in its `keepAttributes` logic — must be updated.

**Evidence:** D1 §3-4, D3 §6

### 1.6 Wiki-Links (Inline Atom)

```typescript
wikiLink: {
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: {
    target: { default: '' },
    alias: { default: null },
    anchor: { default: null },
    resolved: { default: false },
  },
}
```

**Why inline atom, not mark:** Wiki-links are indivisible semantic units that shouldn't be partially selected, split, or have cursor positions within them. This is the [industry consensus](https://discuss.prosemirror.net/t/discussion-what-are-marks/862) (TipTap Mention, Remirror MentionAtom, BlockNote inline content). Marks cannot be disabled per inline node type (HC4); wiki-link atoms will inherit bold/italic from their parent paragraph — mitigate via `appendTransaction` stripping if needed.

**remark-wiki-link integration:** Three layers: `micromark-extension-wiki-link` (tokenizer) → `mdast-util-wiki-link` (AST: `wikiLink` node type) → `remark-wiki-link` (plugin). Set `aliasDivider: '|'` for Obsidian compatibility (default is `:`).

**Evidence:** D1 §2, D6 §6

### 1.7 Recommended Plugin Pipeline

```typescript
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])    // Claim --- before thematicBreak
  .use(remarkMdx)                       // Claim < and { for JSX/expressions
  .use(remarkGfm)                       // GFM extensions (tables, strikethrough, task lists, autolinks)
  .use(remarkWikiLink, { aliasDivider: '|' })
  .use(remarkProseMirror, { schema, handlers })
```

No ordering dependencies between plugins. The conventional order places frontmatter first to ensure `---` at document start is recognized as frontmatter, not thematic break.

**Evidence:** D3 §3

---

## 2. Hard Constraints

These constraints MUST be satisfied. Violating them causes data loss, runtime errors, or incorrect behavior.

| # | Constraint | Source | Impact |
|---|---|---|---|
| HC1 | All node/mark attributes must be flat primitives (string, number, boolean, null) | Y.XmlElement.setAttribute type contract; `compareDeep` O(n) for objects | Nested `source: { fence: '`', length: 3 }` must become `sourceFenceChar` + `sourceFenceLength` |
| HC2 | `checked` belongs on `listItem`, not `list` | mdast semantics: a single list can mix task and non-task items | Move `checked: boolean\|null` from list to listItem |
| HC3 | All required-position node attrs must have defaults | ProseMirror `fillBefore` / synthesizability — cannot auto-create nodes with required attrs | Every fidelity attr needs a default value (`''`, `null`, `0`) |
| HC4 | Marks cannot be disabled per inline node type | ProseMirror parent-level mark permission model | Bold/italic will apply to wiki-link and MDX atoms — mitigate via `appendTransaction` stripping |
| HC5 | Don't name any mark `ychange` | y-prosemirror reserves it for internal change tracking | Choose any other name |
| HC6 | Schema renames are destructive for in-flight Y.Docs | y-prosemirror permanently deletes elements with unknown `nodeName` | Names are permanent once deployed. Markdown-on-disk mitigates for this project |

**Evidence:** D1 §7, D1 §3, D1 §10, D1 §1, D2 §1, D2 §3

---

## 3. Soft Recommendations

Strong recommendations based on evidence. Violating them is possible but increases complexity or risk.

| # | Recommendation | Reason | Evidence |
|---|---|---|---|
| SR1 | Use unified `list` type (not separate `bulletList`/`orderedList`/`taskList`) | Proven viable by [prosemirror-flat-list](https://github.com/ocavue/prosemirror-flat-list); 1:1 mdast mapping; eliminates three TipTap extensions | D1 §3, D3 §6 |
| SR2 | Place `paragraph` first in schema node ordering | First type in a group becomes the default for `fillBefore`; prevents infinite recursion | D1 §10 |
| SR3 | Use `source*` prefix for fidelity attributes | Consistent naming convention; distinguishes fidelity metadata from semantic attrs | D1 §7 |
| SR4 | Design atom node attributes for independent editing | Each attribute is a separate CRDT merge unit (last-write-wins per key, not per object) | D2 §2 |

---

## 4. Confirmed Non-Constraints

Things that seem problematic but aren't, based on evidence.

| Concern | Why It's Not a Constraint | Evidence |
|---|---|---|
| Schema naming (`bold`→`strong`, `horizontalRule`→`thematicBreak`) | Commands decouple from names; input rules use `NodeType` objects; y-prosemirror is fully name-agnostic | D1 §5, D2 §1 |
| HTML round-trip for a markdown editor | Only clipboard operations use HTML; storage uses markdown, collaboration uses Y.js binary | D1 §9 |
| CodeBlock syntax highlighting | Decoration-layer only — no schema, CRDT, or round-trip impact | D1 §8 |
| CodeMirror source-mode integration | Zero coupling to PM schema. Operates on Y.Text (flat string), not Y.XmlFragment (tree) | D5 §2 |
| Hocuspocus server configuration | Completely schema-agnostic; all schema awareness lives in the persistence extension | D2 §5 |
| Adding new node/mark types to existing schema | Always safe — existing Y.Docs are unaffected | D2 §3 |
| @tiptap/y-tiptap vs direct y-prosemirror | 1:1 fork, identical API, zero constraint difference | D2 §6 |

---

## 5. Unified/Remark/Micromark Pipeline

### 5.1 mdast Node Type Catalogue

The remark stack produces **32 distinct mdast node types**: 19 CommonMark + 6 GFM + 2 frontmatter + 5 MDX. Every type is defined in `@types/mdast@4.0.4` with full TypeScript interfaces. The 5 MDX types are confirmed as: `mdxJsxFlowElement`, `mdxJsxTextElement`, `mdxFlowExpression`, `mdxTextExpression`, `mdxjsEsm`.

Each MDX JSX element carries a typed `attributes` array supporting string values, expression values (`{3+1}`), and spread attributes (`{...props}`). Fragment syntax (`name: null`) is supported.

**Evidence:** [evidence/remark-pipeline.md](evidence/remark-pipeline.md)

### 5.2 Plugin Ordering

No ordering dependencies exist between `remark-frontmatter`, `remark-mdx`, `remark-gfm`, and `remark-directive`. All use the identical `this.data()` accumulation pattern, pushing extensions to shared arrays consumed by `remark-parse` and `remark-stringify`. The conventional order (frontmatter → MDX → GFM) is convention, not requirement.

### 5.3 Position-Based Source Fidelity

Every node produced by `mdast-util-from-markdown` carries `position.start.offset` and `position.end.offset` — 0-indexed byte offsets into the source string. These span the **complete syntactic extent** (heading includes `#`, emphasis includes `*`/`_` delimiters, code blocks include fence lines).

This enables exact source recovery:
```typescript
const sourceText = originalMarkdown.slice(node.position.start.offset, node.position.end.offset);
```

This is the foundation for source-text fidelity in the remark pipeline. It bypasses all known serializer bugs and makes regex-based delimiter detection unnecessary.

### 5.4 Handler API

`mdast-util-to-markdown` exposes a handler-based extension API. Handler merge uses `Object.assign()` (last wins for same node type). Join and unsafe arrays use `push()` (accumulative). Custom fidelity handlers should be registered last to override defaults.

### 5.5 Configuration Recommendations

- **Frontmatter:** YAML only (`.use(remarkFrontmatter, ['yaml'])`). TOML is Hugo-specific with minimal adoption.
- **GFM:** Full `remark-gfm`. The plugin is all-or-nothing; selective feature composition is possible at the micromark level but adds maintenance burden for no benefit.
- **Strict mode:** Enable GFM universally. It's a backward-compatible CommonMark superset — no interference with standard constructs.

### 5.6 Known Serializer Bugs

Three open issues in `mdast-util-to-markdown@2.1.2` affect round-trip fidelity:

| Issue | Severity | Trigger | Mitigation |
|---|---|---|---|
| [#12](https://github.com/syntax-tree/mdast-util-to-markdown/issues/12) — nested emphasis | Low | Triple delimiter runs with nested emphasis | Editor produces clean nesting; rare in practice |
| [#68](https://github.com/syntax-tree/mdast-util-to-markdown/issues/68) — emoji | Medium | Emoji adjacent to `*`/`**` markers | Patch `.charCodeAt()` → `.codePointAt()` |
| [#66](https://github.com/syntax-tree/mdast-util-to-markdown/issues/66) — char references | High (fidelity) | Any emphasis boundary since v2.1.1 | Position-based source slicing bypasses this entirely |

**All three are mitigated by the position-based fidelity strategy.** For newly-created content (no original source), only #68 requires attention.

---

## 6. remark-prosemirror Bridge

### 6.1 API Surface

[`@handlewithcare/remark-prosemirror@0.1.5`](https://www.npmjs.com/package/@handlewithcare/remark-prosemirror) exports 6 functions + 2 type aliases:

**Markdown → ProseMirror:** `remarkProseMirror` (unified plugin) or `toProseMirror` (standalone). Handlers registered as `{ [mdastType]: handler }`. Helper utilities: `toPmNode(nodeType, getAttrs?)`, `toPmMark(markType, getAttrs?)`.

**ProseMirror → Markdown:** `fromProseMirror(doc, { nodeHandlers, markHandlers })` → returns `MdastRoot` (not a string). The mdast tree is then serialized by `remark-stringify`. This two-stage pipeline means **source-text fidelity belongs in remark-stringify handlers**, not in this library.

### 6.2 Handler Requirements

The library provides **zero default handlers** — deliberate design, not a gap. Consumers register handlers for every mdast type in their documents:

| Category | toProseMirror | fromProseMirror |
|---|---|---|
| CommonMark blocks | 7 | 7 |
| CommonMark inline/marks | 6 | 6 + 4 mark handlers |
| GFM | 4 | 4 + 1 mark handler |
| MDX | 2-5 | 2-5 |
| Custom (wikiLink) | 1 | 1 |
| **Total** | **~20-23** | **~20-23 + ~5 marks** |

### 6.3 Error Handling Asymmetry

**toProseMirror throws** on unknown mdast types (fail-fast). **fromProseMirror silently drops** unknown PM nodes (data loss risk). When adding remark plugins, handlers must be registered simultaneously. The reverse direction needs a validation wrapper to detect missing handlers.

### 6.4 `hydrateMarks` Algorithm

The library solves the ProseMirror↔mdast mark impedance mismatch. ProseMirror stores marks as flat arrays on text nodes; mdast nests them as tree wrappers. The algorithm:

1. **Partition** consecutive PM children by their outermost mark (`marks[0]`), using `Mark.eq()` for comparison
2. **Recursively strip** the outermost mark from each partition and re-partition on the next mark
3. **Apply mark handlers** bottom-up, wrapping already-converted children

**Worked example:** Input `This *is a **document.***`

```
PM representation:
  text("This ")         marks: []
  text("is a ")         marks: [em]
  text("document.")     marks: [em, strong]

After hydrateMarks:
  paragraph
  ├── text("This ")
  └── emphasis
      ├── text("is a ")
      └── strong
          └── text("document.")
```

Mark ordering in ProseMirror determines nesting order in mdast. Mark attrs affect partitioning: two link marks with different `href` values produce separate partitions. Missing mark handler → children pass through unwrapped (silently dropped, not errored).

### 6.5 Handler Examples

**Wiki-link handler (toProseMirror):**
```typescript
handlers: {
  wikiLink(node, _, state) {
    return schema.nodes.wikiLink.create({
      target: node.data?.alias ?? node.value,
      href: node.data?.permalink,
    });
  }
}
```

**Wiki-link handler (fromProseMirror):**
```typescript
nodeHandlers: {
  wikiLink: (node) => ({
    type: "wikiLink",
    value: node.attrs.target,
    data: { permalink: node.attrs.href },
  }),
}
```

### 6.6 Custom Type Registration

Custom mdast types (wiki-links, MDX) need [TypeScript module augmentation](https://github.com/syntax-tree/mdast-util-mdx-jsx) to be accepted by the handler type map. The `mdast-util-mdx-jsx` package already does this for MDX types:

```typescript
declare module 'mdast' {
  interface RootContentMap {
    mdxJsxFlowElement: MdxJsxFlowElement;
  }
  interface PhrasingContentMap {
    mdxJsxTextElement: MdxJsxTextElement;
  }
}
```

Wiki-links need a custom augmentation. Runtime dispatch (`zwitch`) is type-agnostic — the constraint is TypeScript-only.

### 6.7 Two-Stage Serialization Pipeline

`fromProseMirror` produces an `MdastRoot` — not a markdown string. Serialization to markdown is handled by `remark-stringify`:

```typescript
// Stage 1: PM → mdast (remark-prosemirror)
const mdast = fromProseMirror(doc, { schema, nodeHandlers, markHandlers });

// Stage 2: mdast → markdown (remark-stringify + extensions)
const markdown = toMarkdown(mdast, {
  extensions: [gfmToMarkdown(), mdxToMarkdown()],
  bullet: '-',
  emphasis: '_',
});
```

Source-text fidelity belongs in Stage 2. The `fromProseMirror` handler stores delimiter info in mdast `data` fields; a custom `mdast-util-to-markdown` handler reads it:

```typescript
// In fromProseMirror:
nodeHandlers: {
  heading: (node, _, state) => ({
    type: "heading", depth: node.attrs.level, children: state.all(node),
    data: { sourceStyle: node.attrs.sourceStyle },
  }),
}

// In mdast-util-to-markdown extension:
{ handlers: { heading(node, parent, state) { /* read node.data.sourceStyle */ } } }
```

### 6.8 Maturity and Risk

| Factor | Assessment |
|---|---|
| Last commit | 2025-05-09 (11 months) |
| Open PRs | 1 unreviewed (4 months) |
| LOC | ~650 |
| npm dependents | 0 public |
| Production consumer | [moment.dev](https://moment.dev) (confirmed) |
| 1.0 outlook | No roadmap. API stable. |

**Risk assessment:** Low overall. The API surface is tiny and the handler model is unlikely to change. Pre-1.0 status reflects author caution, not instability. The library is trivially forkable if maintenance lapses further. The PR #3 fix (empty text node crash) should be applied.

### 6.9 Integration Surface

```
┌─────────────────────────────────────────────────┐
│  Our Code                                       │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  ~22 mdast→PM    │  │  ~22 PM→mdast node  │  │
│  │  handlers        │  │  handlers           │  │
│  │  (toProseMirror) │  │  (fromProseMirror)  │  │
│  └────────┬─────────┘  └────────┬────────────┘  │
│           │                     │                │
│  ┌────────▼─────────────────────▼────────────┐  │
│  │  remark-prosemirror (~650 LOC)            │  │
│  │  - Handler dispatch (zwitch)              │  │
│  │  - Mark hydration (hydrateMarks)          │  │
│  │  - Link ref resolution                   │  │
│  │  - HTML→hast→PM pipeline                  │  │
│  └────────┬─────────────────────┬────────────┘  │
│           │                     │                │
│  ┌────────▼─────────┐  ┌───────▼─────────────┐  │
│  │  remark-parse     │  │  remark-stringify   │  │
│  │  + remark-gfm     │  │  + gfm/mdx exts    │  │
│  │  + remark-mdx     │  │  + custom handlers  │  │
│  │  + remark-wikilink│  │  (fidelity layer)   │  │
│  └──────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Evidence:** [evidence/remark-prosemirror-bridge.md](evidence/remark-prosemirror-bridge.md)

---

## 7. CRDT Collaboration Constraints

### 7.1 y-prosemirror Is Fully Name-Agnostic

y-prosemirror uses strict `===` comparison between `Y.XmlElement.nodeName` and PM `Node.type.name` at runtime. No node or mark names are hardcoded. Any valid ProseMirror schema works. The one reserved name is the mark `ychange` (used for change tracking snapshots).

### 7.2 Destructive Error Recovery

When `schema.node()` throws for any reason (unknown type, invalid content), y-prosemirror **permanently deletes** the Y.XmlElement and propagates the deletion to all clients:

```javascript
// y-prosemirror sync-plugin.js:804-811
} catch (e) {
  el.doc.transact((transaction) => {
    el._item.delete(transaction)  // PERMANENT DELETION — propagates to all peers
  }, ySyncPluginKey)
  return null
}
```

This is the mechanism that makes schema renames destructive.

### 7.3 Schema Evolution via Markdown

Y.js has no migration mechanism. The impact matrix:

| Operation | Y.js Layer | y-prosemirror Layer | Data Safety |
|---|---|---|---|
| Add new node type | No effect | No effect | **Safe** |
| Remove node type | Old `nodeName` persists | Elements **deleted** | **DATA LOSS** |
| Rename node type | Old `nodeName` persists | Elements **deleted** | **DATA LOSS** |
| Add attribute | No effect | Missing attrs get defaults | **Safe** |
| Remove attribute | Old attr stays in CRDT | Old attr ignored | **Safe** |
| Change content model | No effect | `schema.node()` may throw → **deletion** | **RISKY** |
| Add new mark type | No effect | Old text lacks mark | **Safe** |
| Remove mark type | Old format keys persist | `schema.mark()` throws → **text deleted** | **DATA LOSS** |

From [Y.js discussion forum](https://discuss.yjs.dev/t/what-is-the-correct-way-to-apply-document-migrations/2321): "Migrations are...the biggest glaring flaw with Yjs, and pretty much every local-first solution."

**This project's mitigation:** Markdown-on-disk canonical storage. Y.Docs are ephemeral session state rebuilt from markdown on every `onLoadDocument`. Schema changes are safe as long as the parser handles both old and new markdown formats. The `onLoadDocument` persistence hook re-parses markdown into the current schema on every document load.

### 7.4 Attribute Granularity

Atom node attributes are stored as atomic values in Y.js — last-write-wins per key. Nested objects are replaced entirely (no deep merge). Multiple small attributes are preferred over one large attribute for concurrent editing safety. Mark fidelity attributes (delimiter choice) use non-overlapping mark semantics: concurrent changes are last-write-wins, which produces valid results since all delimiter choices are cosmetically correct.

### 7.5 Concurrent Mark Operations

Non-overlapping marks (bold, italic, code) merge via union of ranges. Overlapping marks (link, comment) use SHA-256 hashed keys — concurrent creation with different attrs produces coexisting instances. Mark `excludes` configuration determines which category a mark falls into.

**Evidence:** [evidence/crdt-collaboration.md](evidence/crdt-collaboration.md)

---

## 8. CodeMirror Source Editor

CodeMirror 6 binds to `Y.Text` (flat string) via y-codemirror.next. It has **zero awareness** of ProseMirror schemas, remark plugins, or Y.XmlFragment structure. The coupling surface is the observer layer (`observers.ts`), which depends on the markdown serializer/parser — not CodeMirror.

**Architectural implication:** The ProseMirror schema, markdown parser pipeline, and node extensions can change freely without touching the source editor.

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

Migrating from `@tiptap/markdown` to remark-prosemirror changes the observer's `mdManager` reference — CodeMirror's configuration stays identical.

### Source-Mode Improvement Opportunities

| Gap | Fix | Effort |
|---|---|---|
| GFM not highlighted | `markdown({ base: markdownLanguage })` | One-line change |
| No frontmatter highlighting | Custom Lezer block parser + nested YAML | Medium |
| No MDX/JSX highlighting | Custom Lezer inline/block parsers + nested JS | Medium-High |
| Wiki-links use decorations, not syntax tree | Upgrade to Lezer `parseInline` extension | Optional |
| No fenced code block language highlighting | Add `codeLanguages` resolver | Low |

None require changes to the ProseMirror side or observer layer.

**Evidence:** [evidence/codemirror-source-editor.md](evidence/codemirror-source-editor.md)

---

## 9. Reference Editor Patterns

### 9.1 Naming Conventions

The ProseMirror ecosystem universally uses **snake_case** for multi-word node names (`code_block`, `list_item`, `bullet_list`). Milkdown uses mdast-canonical names for marks (`strong`, `emphasis`, `inlineCode`). This diverges from TipTap defaults (`bold`, `italic`, `codeBlock`) — a deliberate choice for remark alignment that is low-friction to implement.

| Convention | Used By | Pattern |
|---|---|---|
| snake_case nodes | prosemirror-markdown, Milkdown | `code_block`, `list_item` |
| mdast mark names | Milkdown | `strong`, `emphasis` |
| TipTap defaults | Current codebase, BlockNote | `bold`, `italic`, `codeBlock` |

### 9.2 List Architecture

All three reference editors use **separate list types**, not unified. Milkdown: `bullet_list`, `ordered_list` (bridge splits mdast's unified `list` by `ordered` boolean). BlockNote: `bulletListItem`, `numberedListItem` (items ARE blocks, no list container). Plate: `ul`, `ol`.

The proposed unified `list` type diverges from this pattern but is validated by [prosemirror-flat-list](https://github.com/ocavue/prosemirror-flat-list) and provides a cleaner 1:1 mdast mapping. The tradeoff is replacing three TipTap extensions with one custom extension.

### 9.3 Milkdown Three-Layer Architecture

Milkdown is the closest architectural reference — ProseMirror + remark + Y.js:

```
Layer 1: Remark Pipeline      unified().use(remarkParse).use(remarkStringify)
Layer 2: Transformer           ParserState / SerializerState (mdast ↔ ProseMirror)
Layer 3: Schema Specs          Co-located parseMarkdown + toMarkdown on each node/mark
```

Each node file contains `parseDOM`, `toDOM`, `parseMarkdown`, and `toMarkdown` together. The bridge to mdast splits the unified `list` type by `ordered` boolean: `bullet_list.match: ({ type, ordered }) => type === 'list' && !ordered`. Milkdown also has a custom internal remark plugin (`remarkMarker`) that adds `marker` properties to `strong`/`emphasis` mdast nodes for delimiter preservation.

### 9.4 MDX Models

Milkdown has no official MDX. BlockNote has no MDX. **Plate has the strongest MDX story** — remark-mdx integration with explicit bidirectional `serialize`/`deserialize` rules per component type:

```typescript
// Plate's MDX rule system
rules: {
  date: {
    deserialize: (mdastNode) => ({ type: 'date', date: mdastNode.children?.[0]?.value }),
    serialize: (slateNode) => ({
      type: 'mdxJsxTextElement', name: 'date',
      children: [{ type: 'text', value: slateNode.date }]
    })
  }
}
```

Built-in MDX conversions include marks (`<del>`, `<sub>`, `<sup>`, `<u>`, `<mark>`), elements (`<date>`, `<callout>`, `<column_group>`, `<toc>`, `<audio>`, `<video>`), and mentions (`[display](mention:id)`). This rule-based model (explicit handler per component) is the pattern to follow, not generic pass-through.

### 9.4 Source-Text Fidelity Landscape

**No JavaScript WYSIWYG editor preserves per-node source form** except Open Knowledge's existing 12 fidelity extensions. Milkdown has an internal `remarkMarker` plugin for delimiter tracking (bold/italic only). BlockNote is explicitly lossy (`blocksToMarkdownLossy`). Plate uses global remark-stringify pass-through. prosemirror-markdown normalizes output by design. remark's own design philosophy: "think of it as prettier" ([remark #303](https://github.com/remarkjs/remark/issues/303)).

### 9.5 Patterns to Adopt

1. **Co-located handlers** (from Milkdown) — parseMarkdown + toMarkdown in one file per node type
2. **Explicit MDX rules** (from Plate) — bidirectional serialize/deserialize per component
3. **remark-prosemirror handler model** — handler functions per mdast type, composable with the full remark ecosystem
4. **Custom remark plugins for fidelity** — like Milkdown's `remarkMarker`, build plugins that populate `data` fields during parse

### 9.6 Patterns to Avoid

1. **BlockNote's HTML intermediary** — routes markdown through HTML, adding unnecessary information loss
2. **Plate's separate heading types** (`h1`-`h6`) — a single `heading` with `level` attr is simpler and matches mdast
3. **Generic MDX pass-through** — every component should have an explicit handler; unrecognized components should be errors

**Evidence:** [evidence/reference-editors.md](evidence/reference-editors.md)

---

## 10. Version and Maturity Summary

| Library | Version | Maintained | Bus Factor | Notes |
|---|---|---|---|---|
| ProseMirror | 1.x (stable) | Active (Marijn) | 1 | De facto standard. Stable API. |
| TipTap | 2.x | Active (team) | Team | Extensions ecosystem. |
| Y.js | 13.x | Active (Kevin Jahns) | 1 | CRDT standard. |
| y-prosemirror | 1.3.7 | Moderate | 1 | Stable. Critical destructive catch block. |
| @tiptap/y-tiptap | 3.0.3 | Active | Team | 1:1 fork of y-prosemirror. |
| Hocuspocus | 2.x | Active (TipTap team) | Team | Schema-agnostic server. |
| y-codemirror.next | 0.3.5 | Moderate | 1 | Stable binding. Zero PM coupling. |
| remark-prosemirror | 0.1.5 | Low (11mo gap) | 1 | ~650 LOC. Trivially forkable. |
| @codemirror/lang-markdown | 6.5.0 | Active (Marijn) | 1 | Lezer-based. No MDX. |
| remark/micromark | 15.x / 4.x | Active (wooorm) | 1 | 100% CommonMark. Full MDX. |
| Milkdown | 7.x | Active (Saul-Mirone) | 1 | PM + remark reference. No MDX yet. |

**Key risk:** remark-prosemirror's maintenance status. Mitigation: small codebase, stable API, fork-ready. The PR #3 fix should be applied proactively.

---

## Cross-Cutting Synthesis

### Theme 1: Source-Text Fidelity as Architectural Differentiator

No reference editor (Milkdown, BlockNote, Plate, prosemirror-markdown) preserves per-node source form (§9.4). The remark ecosystem explicitly declines to support this ("think of it as prettier"). Yet mdast's position information (§5.3) provides a **cleaner** fidelity mechanism than the current regex-heuristic approach: exact source slicing via `position.start.offset`/`position.end.offset` recovers delimiter choice, whitespace, and raw form without guessing. This simultaneously bypasses all three known serializer bugs (§5.6) and eliminates the need for 12 separate fidelity extensions — a single remark transform plugin can populate fidelity attributes from position slices during the mdast→PM conversion.

**Implication:** The migration to remark is not just a parser swap — it upgrades the fidelity mechanism from heuristic to exact.

### Theme 2: Markdown-on-Disk as Universal Migration Lever

Y.js schema evolution is destructive (§7.3): renaming or removing a type deletes instances from in-flight Y.Docs with no recovery. Every reference editor lacks formal schema versioning (§9, §10). But this project's markdown-on-disk canonical storage makes both problems irrelevant. Y.Docs are ephemeral session state rebuilt from markdown via `onLoadDocument`. Schema changes deploy freely — the markdown parser handles format differences, and the PM schema reconstructs the tree from scratch. This architecture converts a hard distributed-systems problem (CRDT migration) into a simple parsing problem.

**Implication:** The schema can be aggressive about naming choices (mdast-canonical `strong` instead of `bold`, `thematicBreak` instead of `horizontalRule`) without migration risk, because the canonical storage format (markdown) is schema-independent.

### Theme 3: Zero-Coupling Architecture Enables Incremental Migration

CodeMirror has zero PM-schema coupling (§8). Hocuspocus is completely schema-agnostic (§7, D2 §5). y-codemirror.next binds to Y.Text, not Y.XmlFragment. The only coupling surfaces are: (1) the bidirectional observer layer that calls `mdManager.serialize()`/`mdManager.parse()`, and (2) the persistence extension that uses `getSchema(sharedExtensions)`. A migration from `@tiptap/markdown` to remark-prosemirror changes exactly these two surfaces. The server, source editor, CRDT layer, and Hocuspocus extensions are untouched.

**Implication:** The migration blast radius is confined to the markdown pipeline and handler registration. It can be done incrementally (swap the pipeline, then add MDX handlers, then upgrade fidelity).

### Theme 4: The Two-Stage Serialization Pipeline

remark-prosemirror produces mdast trees, not markdown strings (§6.1). `remark-stringify` converts mdast to markdown. This two-stage design (confirmed by D4 §6) means fidelity belongs in remark-stringify handlers — not in the bridge library. Custom `mdast-util-to-markdown` handlers read fidelity attributes from mdast `data` fields and override remark-stringify's global defaults. This separates concerns cleanly: the bridge handles structural conversion (mdast↔PM), and the serializer handles syntactic choices (delimiter, marker, fence style).

**Implication:** The ~40-45 bridge handlers are structurally simple (map types and attrs). The complexity lives in the ~10-15 fidelity-aware serialization handlers that read `source*` attributes.

### Theme 5: Unified List Type — Viable but Unconventional

The proposed unified `list` type is validated by prosemirror-flat-list (§2, D1 §3) and provides a clean 1:1 mdast mapping. However, **every reference editor uses separate list types** (§9.2). The tradeoff: unified lists require a custom TipTap extension (replacing three built-in extensions) and updating TipTap's `wrappingInputRule` `keepAttributes` logic (which hardcodes `"bulletList"`/`"orderedList"`/`"taskList"` strings). The payoff: simpler schema, cleaner mdast mapping, no need for bridge code that splits/merges list types. Milkdown's bridge already demonstrates the split logic for separate types — the code is straightforward but adds a translation layer.

**Implication:** Both approaches work. Unified lists are architecturally cleaner but require more custom TipTap code. Separate lists follow established patterns but add bridge complexity.

---

## Conflicts and Disagreements

### C1: Unified vs Separate List Types

**Position A (proposed schema):** Unified `list` type with `ordered: boolean` + `listItem` with `checked: boolean|null`. Validated by prosemirror-flat-list. Clean 1:1 mdast mapping.
**Position B (reference editors):** Separate `bullet_list`, `ordered_list` types. Used by Milkdown, prosemirror-markdown, prosemirror-schema-list.
**Type:** Conclusion disagreement — shared evidence, different recommendations.
**Resolution:** Both are technically viable. The choice is between mdast alignment (unified) and ecosystem convention (separate). For a greenfield editor using remark as the pipeline, unified is slightly favored because it eliminates the split/merge translation layer. For incremental migration from TipTap's existing three-extension model, separate may be lower friction.

### C2: Naming Convention — TipTap vs mdast

**Position A:** Use mdast-canonical names (`strong`, `emphasis`, `thematicBreak`) for maximum remark alignment.
**Position B:** Use TipTap defaults (`bold`, `italic`, `horizontalRule`) for ecosystem familiarity.
**Type:** Complementary — D1 §5 confirms renames are low-friction; D2 §1 confirms y-prosemirror is name-agnostic.
**Resolution:** No constraint prevents either choice. For a remark-based pipeline, mdast-canonical names reduce the conceptual mapping layer. The rename cost is a one-time TipTap extension configuration change.

---

## Open Questions

### OQ1: prosemirror-flat-list Accessibility
Marijn flagged accessibility concerns with Tab/Shift-Tab override in prosemirror-flat-list. The proposed unified list would need to address keyboard navigation patterns for screen readers.

### OQ2: remark-prosemirror Fork Timing
The library's maintenance gap (11 months) and unreviewed PR suggest a fork may be needed. The question is whether to fork proactively or wait for a blocking issue.

### OQ3: MDX Component Registry
Plate's explicit rule system requires a handler per component type. The question of how to handle unknown/unregistered MDX components in the editor (error? pass-through? code block fallback?) needs a design decision.

---

## Limitations

- **No performance benchmarks.** This report covers architectural constraints, not runtime performance of any library.
- **No migration cost analysis.** The effort to migrate from `@tiptap/markdown` to remark-prosemirror is out of scope.
- **remark-prosemirror analysis based on v0.1.5.** The library is pre-1.0; API changes are possible though unlikely given the stable handler model.
- **Reference editor analysis based on latest stable releases** as of April 2026. Milkdown's MDX support may have shipped since this analysis.

---

## References

### Evidence Files
- [evidence/remark-pipeline.md](evidence/remark-pipeline.md) — mdast types, plugin ordering, position preservation, handler API, known bugs, configuration
- [evidence/remark-prosemirror-bridge.md](evidence/remark-prosemirror-bridge.md) — API surface, handler requirements, hydrateMarks, error handling, maturity
- [evidence/crdt-collaboration.md](evidence/crdt-collaboration.md) — y-prosemirror naming, schema evolution, attribute granularity, concurrent marks
- [evidence/codemirror-source-editor.md](evidence/codemirror-source-editor.md) — y-codemirror.next binding, PM-schema coupling, lang-markdown capabilities
- [evidence/reference-editors.md](evidence/reference-editors.md) — Milkdown, BlockNote, Plate schemas, fidelity landscape, wiki-links, MDX models
- [evidence/prosemirror-tiptap-constraints.md](evidence/prosemirror-tiptap-constraints.md) — Atom nodes, marks, content expressions, attribute shapes, command coupling

### External Sources
- [ProseMirror Reference Manual](https://prosemirror.net/docs/ref/) — Schema API, content expressions, NodeSpec
- [prosemirror-flat-list](https://github.com/ocavue/prosemirror-flat-list) — Unified list implementation
- [remark-prosemirror](https://github.com/handlewithcarecollective/remark-prosemirror) — mdast↔PM bridge library
- [@types/mdast](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/mdast) — mdast TypeScript definitions (v4.0.4)
- [Y.js documentation](https://docs.yjs.dev/) — CRDT types and collaboration semantics
- [y-prosemirror source](https://github.com/yjs/y-prosemirror) — Sync plugin, name handling, destructive catch
- [Milkdown source](https://github.com/Milkdown/milkdown) — ProseMirror + remark reference editor
- [Plate MarkdownPlugin](https://github.com/udecode/plate) — MDX rule system
- [mdast-util-to-markdown issues](https://github.com/syntax-tree/mdast-util-to-markdown/issues) — Known serializer bugs (#12, #66, #68)
- [remark issue #303](https://github.com/remarkjs/remark/issues/303) — "think of it as prettier" design philosophy
