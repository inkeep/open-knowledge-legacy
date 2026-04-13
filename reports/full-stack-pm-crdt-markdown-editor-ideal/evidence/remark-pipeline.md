# Evidence: unified/remark/micromark Pipeline

**Sources:** `@types/mdast@4.0.4`, `mdast-util-from-markdown@2.0.3`, `mdast-util-to-markdown@2.1.2`, `micromark@4.0.2`, `remark-gfm@4.0.1`, `remark-frontmatter` (latest), GitHub issues: syntax-tree/mdast-util-to-markdown #12, #66, #68
**Date collected:** 2026-04-12
**Confidence legend:** HIGH = confirmed from package source or types; MEDIUM = inferred from package behavior or issue descriptions; LOW = issue attribution or community comment only

---

## 1. mdast Node Type Inventory (32 types)

**Confidence: HIGH — confirmed from `@types/mdast@4.0.4`**

### 19 CommonMark node types

| Type | Key properties | Notes |
|---|---|---|
| `root` | `children: Content[]` | Document root |
| `paragraph` | `children: PhrasingContent[]` | Block |
| `heading` | `depth: 1–6`, `children: PhrasingContent[]` | Block |
| `thematicBreak` | — | Block; `---` / `***` / `___` |
| `blockquote` | `children: BlockContent[]` | Block |
| `list` | `ordered: boolean`, `start: number \| null`, `spread: boolean`, `children: ListItem[]` | Block |
| `listItem` | `spread: boolean`, `checked: boolean \| null`, `children: BlockContent[]` | `checked` non-null for GFM task items |
| `html` | `value: string` | Block; raw HTML passthrough |
| `inlineHtml` | `value: string` | Inline; raw HTML passthrough |
| `code` | `lang: string \| null`, `meta: string \| null`, `value: string` | Block; fenced/indented code |
| `inlineCode` | `value: string` | Inline |
| `definition` | `identifier: string`, `label: string \| null`, `url: string`, `title: string \| null` | Block; link reference definition |
| `linkReference` | `identifier: string`, `label: string \| null`, `referenceType: 'full' \| 'collapsed' \| 'shortcut'`, `children: StaticPhrasingContent[]` | Inline |
| `imageReference` | `identifier: string`, `label: string \| null`, `referenceType`, `alt: string` | Inline |
| `link` | `url: string`, `title: string \| null`, `children: StaticPhrasingContent[]` | Inline |
| `image` | `url: string`, `title: string \| null`, `alt: string` | Inline; leaf |
| `emphasis` | `children: PhrasingContent[]` | Inline |
| `strong` | `children: PhrasingContent[]` | Inline |
| `text` | `value: string` | Inline leaf |

### 6 GFM node types (via `remark-gfm@4.0.1`)

| Type | Key properties | Notes |
|---|---|---|
| `table` | `align: ('left' \| 'right' \| 'center' \| null)[]`, `children: TableRow[]` | Block |
| `tableRow` | `children: TableCell[]` | — |
| `tableCell` | `children: PhrasingContent[]` | — |
| `delete` (strikethrough) | `children: PhrasingContent[]` | `~~text~~` |
| `listItem` (task) | `checked: boolean \| null` | Extended — `checked` populated for `- [x]` |
| `break` | — | Hard line break `\\\n` |

Note: `break` and extended `listItem` are technically present in CommonMark types but their GFM-specific behaviors (task checkbox, autolink extensions) are activated by `remark-gfm`.

### 2 Frontmatter node types (via `remark-frontmatter`)

| Type | Key properties | Notes |
|---|---|---|
| `yaml` | `value: string` | YAML front matter block |
| `toml` | `value: string` | TOML front matter block (optional plugin config) |

### 5 MDX node types (via `remark-mdx` / `@mdx-js/mdx`)

| Type | Key properties | Notes |
|---|---|---|
| `mdxJsxFlowElement` | `name: string \| null`, `attributes: MdxJsxAttribute[]`, `children: Content[]` | Block JSX element |
| `mdxJsxTextElement` | `name: string \| null`, `attributes: MdxJsxAttribute[]`, `children: Content[]` | Inline JSX element |
| `mdxFlowExpression` | `value: string` | Block `{expression}` |
| `mdxTextExpression` | `value: string` | Inline `{expression}` |
| `mdxjsEsm` | `value: string` | ESM import/export at document top |

---

## 2. MDX Attribute Node Types

**Confidence: HIGH — confirmed from `@types/mdast` and `mdast-util-mdx-jsx`**

MDX JSX elements carry two attribute node types:

```typescript
type MdxJsxAttribute = {
  type: 'mdxJsxAttribute'
  name: string                          // attribute name, e.g. 'className'
  value: string | MdxJsxAttributeValueExpression | null
}

type MdxJsxExpressionAttribute = {
  type: 'mdxJsxExpressionAttribute'
  value: string                         // spread expression, e.g. '{...props}'
}

type MdxJsxAttributeValueExpression = {
  type: 'mdxJsxAttributeValueExpression'
  value: string                         // raw expression, e.g. 'true' or 'count + 1'
}
```

**Attribute value forms:**

| Form | Example | `value` type |
|---|---|---|
| String literal | `prop="value"` | `string` |
| Expression | `prop={expr}` | `MdxJsxAttributeValueExpression` |
| Boolean shorthand | `isOpen` | `null` (presence = true) |
| Spread | `{...props}` | `MdxJsxExpressionAttribute` (separate type) |

---

## 3. Plugin Ordering and `this.data()` Accumulation

**Confidence: HIGH**

unified plugins that contribute to the parser or compiler register their extensions via `this.data()`. Multiple plugins accumulate into the same array without conflict as long as they follow the conventional pattern:

```typescript
// Conventional safe pattern — used by remark-gfm, remark-frontmatter, remark-mdx
export default function myPlugin() {
  const data = this.data()

  // fromMarkdown extensions (parser)
  const fromMarkdownExtensions = data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = [])
  fromMarkdownExtensions.push(myFromMarkdownExtension())

  // toMarkdown extensions (compiler)
  const toMarkdownExtensions = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  toMarkdownExtensions.push(myToMarkdownExtension())

  // micromark extensions (tokenizer)
  const micromarkExtensions = data.micromarkExtensions ?? (data.micromarkExtensions = [])
  micromarkExtensions.push(myMicromarkExtension())
}
```

**No conflicts:** Because each plugin pushes to the shared array (rather than replacing it), plugins compose without ordering issues for the accumulation step. Ordering matters only when:
1. Two plugins define handlers for the same node type — last registered wins.
2. A plugin depends on a node type registered by another plugin (dependency ordering).

**Conventional plugin order for this codebase:**

```
remark-frontmatter    (must be first — modifies root parsing)
remark-gfm            (GFM extensions before MDX)
remark-mdx            (MDX extensions; depends on baseline parser)
custom plugins        (application-specific; depend on above)
```

---

## 4. Position Preservation

**Confidence: HIGH — confirmed from `@types/mdast@4.0.4` and mdast-util-from-markdown source**

Every mdast node produced by `mdast-util-from-markdown` carries a `position` property populated with the exact source location. This is guaranteed — the parser always writes positions.

**Point type:**

```typescript
type Point = {
  line: number    // 1-indexed (first line = 1)
  column: number  // 1-indexed (first column = 1)
  offset: number  // 0-indexed byte offset from start of input
}
```

**Position type:**

```typescript
type Position = {
  start: Point
  end: Point
}
```

**Spans complete syntactic extent:** `position.start` points to the first character of the opening delimiter (e.g., `#` for a heading, `[` for a link). `position.end` points to the character after the last character of the closing delimiter (e.g., the character after `]` in `[text]`).

**Source slicing example:**

```typescript
import { fromMarkdown } from 'mdast-util-from-markdown'

const source = '# Hello\n\nA [link](https://example.com).\n'
const tree = fromMarkdown(source)

const heading = tree.children[0]
// heading.position = { start: { line: 1, column: 1, offset: 0 },
//                       end: { line: 1, column: 8, offset: 7 } }

const exactSource = source.slice(heading.position.start.offset, heading.position.end.offset)
// '# Hello'

const link = tree.children[1].children[1]
// link.position = { start: { line: 3, column: 3, offset: 10 },
//                   end: { line: 3, column: 36, offset: 43 } }
```

**Usage in remark-to-ProseMirror mapping:** Position data enables accurate source-map generation when converting mdast nodes to ProseMirror nodes. This is critical for the planned remark-prosemirror bridge: each PM node can carry a `position` decoration linking it back to the source offset.

---

## 5. mdast-util-to-markdown Handler API

**Confidence: HIGH — confirmed from `mdast-util-to-markdown@2.1.2` source and types**

**Handle function signature:**

```typescript
type Handle = (
  node: MdastNode,
  parent: MdastParent | null,
  state: State,
  info: Info
) => string
```

**State object key methods:**

```typescript
interface State {
  // Serialize a child node (calls the appropriate handler)
  handle(node: MdastNode, parent: MdastParent | null, info: Info): string

  // Serialize all children and join with separator
  containerFlow(node: MdastParent, info: Info): string
  containerPhrasing(node: MdastParent, info: Info): string

  // Track which characters need escaping in current context
  safe(value: string, config: SafeConfig): string

  // Apply indentation prefix to all lines
  indentLines(value: string, map: Map): string

  // Compile options (merged from all plugins)
  options: Options

  // Unsafe patterns (characters that need escaping)
  unsafe: Unsafe[]

  // Join rules between adjacent nodes
  join: Join[]
}
```

**Info object:**

```typescript
interface Info {
  before: string   // character immediately before this node in output
  after: string    // character immediately after this node in output
  indent: number[] // current indentation stack
}
```

**Options/extension shape:**

```typescript
interface Options {
  handlers?: Record<string, Handle>   // per-type serialization handlers
  join?: Join[]                       // rules for blank lines between nodes
  unsafe?: Unsafe[]                   // char patterns that need escaping
  bullet?: '-' | '*' | '+'
  bulletOrdered?: '.' | ')'
  emphasis?: '_' | '*'
  strong?: '_' | '*'
  fence?: '`' | '~'
  fences?: boolean
  incrementListMarker?: boolean
  listItemIndent?: 'tab' | 'one' | 'mixed'
  rule?: '-' | '_' | '*'
  ruleRepetition?: number
  ruleSpaces?: boolean
  setext?: boolean
  tightDefinitions?: boolean
}
```

**Configure merge logic:**

```typescript
// From mdast-util-to-markdown source (paraphrased)
function configure(config: Options, extensions: Options[]): FullOptions {
  for (const extension of extensions) {
    // handlers: Object.assign — later extension wins for same key
    Object.assign(config.handlers, extension.handlers ?? {})

    // join/unsafe: push — all rules accumulate; no override
    config.join.push(...(extension.join ?? []))
    config.unsafe.push(...(extension.unsafe ?? []))
  }
}
```

**Critical implication:** `handlers` use `Object.assign` — if two extensions define a handler for the same node type, the last one registered wins and the first is silently replaced. `join` and `unsafe` use `push` — all rules from all extensions accumulate. There is no deduplication for `unsafe` entries.

---

## 6. Known Bugs in mdast-util-to-markdown

**Confidence: HIGH (issue existence confirmed); MEDIUM (severity/workaround)**

### Issue #12: Nested Emphasis

**Severity: LOW**
**Status:** Open (as of 2026-04-12)
**URL:** github.com/syntax-tree/mdast-util-to-markdown/issues/12

Nested emphasis of the same delimiter type (e.g., `*_text_*` inside `*outer*`) can produce ambiguous output that some parsers round-trip incorrectly. The serializer does not always select delimiters that prevent the ambiguity.

```markdown
<!-- Input that may serialize incorrectly -->
*text with _nested_ emphasis*
<!-- May serialize as: *text with _nested_ emphasis* (correct)
     or: *text with *nested* emphasis* (incorrect — re-entry confusion) -->
```

**Impact for this codebase:** LOW. Nested same-type emphasis is uncommon in technical documentation. The fidelity test suite (I1–I7) should catch regressions.

### Issue #68: Emoji Round-Trip

**Severity: MEDIUM**
**Status:** Open (as of 2026-04-12)
**URL:** github.com/syntax-tree/mdast-util-to-markdown/issues/68

Emoji characters in certain positions (particularly at start of line or adjacent to punctuation) may be escaped unnecessarily, producing `\🎉` instead of `🎉` in the serialized output. The escaped form renders identically in most parsers but fails strict `serialize(parse(md)) === md` invariant (I1).

```markdown
<!-- Input -->
🎉 Congratulations

<!-- Incorrectly serialized output -->
\🎉 Congratulations
```

**Impact for this codebase:** MEDIUM. The I1 identity invariant specifically tests this. The fidelity gap NG1–NG5 list may need to be extended to include emoji serialization as NG6 if this remains unfixed.

### Issue #66: Character References (HTML Entities)

**Severity: HIGH (fidelity)**
**Status:** Open (as of 2026-04-12)
**URL:** github.com/syntax-tree/mdast-util-to-markdown/issues/66

HTML entity references (`&amp;`, `&lt;`, `&gt;`, `&nbsp;`, named entities) in source markdown are decoded to literal characters during parsing (mdast-util-from-markdown calls micromark which decodes entities). The serializer then emits the literal character, not the entity form. This means:

```markdown
<!-- Input -->
AT&amp;T and 2 &lt; 3

<!-- After parse → serialize -->
AT&T and 2 < 3
```

The decoded form is semantically equivalent but violates the I1 identity invariant. This is recorded as fidelity gap **NG5** in the codebase's invariant list:

> **NG5:** HTML entity references (`&amp;` `&lt;` `&gt;`) in source markdown are decoded to literal characters on first parse and remain as literals — the entity form is not preserved.

**Impact for this codebase:** HIGH for strict I1 testing, but classified as an accepted irreducible gap (NG5). No workaround exists without forking mdast-util-from-markdown to preserve raw entity tokens — not planned.

---

## 7. Configuration: YAML Frontmatter and GFM

**Confidence: HIGH**

**YAML-only frontmatter:** `remark-frontmatter` supports both YAML and TOML frontmatter formats, but this codebase uses YAML only. The plugin is configured with:

```typescript
unified()
  .use(remarkFrontmatter, ['yaml'])  // YAML only; TOML not enabled
  .use(remarkGfm)
```

Enabling `'toml'` would parse TOML-fenced blocks (`+++`) as frontmatter. Not enabling it means TOML blocks are passed through as fenced code blocks.

**Full remark-gfm — no selective GFM:** `remark-gfm` is an all-or-nothing plugin. It activates all GFM extensions (tables, strikethrough, task lists, autolinks) simultaneously. There is no supported API to enable individual GFM features at the plugin level.

```typescript
// Cannot do this — no selective GFM
.use(remarkGfm, { tables: true, strikethrough: false })  // NOT SUPPORTED

// remark-gfm options only control serialization style, not parsing:
.use(remarkGfm, {
  tablePipeAlign: true,       // controls table column alignment padding
  singleTilde: false,          // require ~~ for strikethrough (not ~)
})
```

**GFM is a backward-compatible CommonMark superset:** All valid CommonMark documents are valid GFM documents. Enabling remark-gfm does not break CommonMark parsing. GFM extends CommonMark with additional constructs; it does not redefine existing ones.

**`remark-gfm@4.0.1` vs `@3.x`:** Version 4 requires unified v11+ and uses the ESM-only distribution. It is not compatible with CommonJS `require()`. This matches the codebase's `"type": "module"` ESM-everywhere convention.
