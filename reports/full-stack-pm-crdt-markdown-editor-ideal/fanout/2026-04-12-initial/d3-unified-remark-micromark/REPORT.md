# D3: Unified/Remark/Micromark Pipeline Constraints on ProseMirror Schema

**Purpose:** Determine what constraints the unified/remark/micromark pipeline imposes on a ProseMirror schema for a greenfield CRDT markdown editor with MDX support. Map every canonical mdast node type to its PM schema equivalent. Identify pipeline bugs, configuration options, and architectural implications.

**Key finding:** The remark stack produces 32 distinct mdast node types (19 CommonMark + 6 GFM + 2 frontmatter + 5 MDX). Every node carries position info enabling source-text slicing. The pipeline is fully composable but has 3 open serializer bugs that affect round-trip fidelity — all mitigatable via position-based source recovery.

---

## 1. Canonical mdast Node Types

The mdast specification defines node types across four layers. Source: `@types/mdast@4.0.4`. Full catalogue in [evidence/e1-mdast-node-catalogue.md](evidence/e1-mdast-node-catalogue.md).

### CommonMark (19 types)

**Block nodes (10):**

| mdast Type | Base | Key Properties |
|-----------|------|----------------|
| `root` | Parent | Top-level container |
| `paragraph` | Parent | Children: `PhrasingContent[]` |
| `heading` | Parent | `depth: 1-6` |
| `blockquote` | Parent | Children: block content |
| `list` | Parent | `ordered`, `start`, `spread` |
| `listItem` | Parent | `checked` (task lists), `spread` |
| `code` | Literal | `lang`, `meta`, `value` |
| `html` | Literal | `value` (raw HTML) |
| `thematicBreak` | Node | Void |
| `definition` | Node | `identifier`, `label`, `url`, `title` (via Association + Resource mixins) |

**Inline nodes (9):**

| mdast Type | Base | Key Properties |
|-----------|------|----------------|
| `text` | Literal | `value` |
| `emphasis` | Parent | Children: phrasing |
| `strong` | Parent | Children: phrasing |
| `inlineCode` | Literal | `value` |
| `break` | Node | Void (hard break) |
| `link` | Parent + Resource | `url`, `title`, children: phrasing |
| `image` | Node + Resource + Alternative | `url`, `title`, `alt` |
| `linkReference` | Parent + Reference | `identifier`, `label`, `referenceType` |
| `imageReference` | Node + Reference + Alternative | `identifier`, `label`, `referenceType`, `alt` |

### GFM Extension (6 types)

| mdast Type | Base | Key Properties |
|-----------|------|----------------|
| `table` | Parent | `align: AlignType[]` (`"left"\|"right"\|"center"\|null`) |
| `tableRow` | Parent | Children: `tableCell[]` |
| `tableCell` | Parent | Children: phrasing |
| `delete` | Parent | Strikethrough — children: phrasing |
| `footnoteDefinition` | Parent + Association | `identifier`, `label` |
| `footnoteReference` | Node + Association | `identifier`, `label` |

### Frontmatter (2 types)

| mdast Type | Base | Notes |
|-----------|------|-------|
| `yaml` | Literal | Built into `@types/mdast` |
| `toml` | Literal | Via module augmentation (remark-frontmatter) |

### MDX (5 types)

| mdast Type | Base | Key Properties | Content Position |
|-----------|------|----------------|-----------------|
| `mdxJsxFlowElement` | Parent | `name: string\|null`, `attributes[]` | Block |
| `mdxJsxTextElement` | Parent | `name: string\|null`, `attributes[]` | Inline |
| `mdxFlowExpression` | Literal | `value`, `data.estree?` | Block |
| `mdxTextExpression` | Literal | `value`, `data.estree?` | Inline |
| `mdxjsEsm` | Literal | `value`, `data.estree?` | Root-only |

Full MDX attribute shapes documented in [evidence/e2-mdx-node-types.md](evidence/e2-mdx-node-types.md).

---

## 2. MDX Node Types — Verified

The 5 MDX types produced by `remark-mdx` are **confirmed** as:

1. **`mdxJsxFlowElement`** — Block JSX: `<Callout>\n\ncontent\n\n</Callout>`
2. **`mdxJsxTextElement`** — Inline JSX: `click <Button>here</Button>`
3. **`mdxFlowExpression`** — Block JS: `{items.map(...)}`
4. **`mdxTextExpression`** — Inline JS: `count is {count}`
5. **`mdxjsEsm`** — Imports/exports: `import { Foo } from './bar'`

**Attribute system:** JSX elements carry `attributes: (MdxJsxAttribute | MdxJsxExpressionAttribute)[]`:
- `MdxJsxAttribute` — named attribute with string or expression value (or boolean if `value` is null)
- `MdxJsxExpressionAttribute` — spread attribute: `{...props}`
- `MdxJsxAttributeValueExpression` — expression value: `count={3 + 1}`

**Fragment support:** `name: null` indicates a JSX fragment (`<>...</>`).

**ESTree attachment:** All expression/ESM nodes optionally carry `data.estree: Program` for JavaScript AST analysis.

---

## 3. Plugin Ordering

**Finding:** No ordering dependencies between `remark-frontmatter`, `remark-mdx`, `remark-gfm`, and `remark-directive`. All use the same `this.data()` accumulation pattern pushing extensions to shared arrays. See [evidence/e3-plugin-ordering.md](evidence/e3-plugin-ordering.md).

**How it works:** Each plugin pushes to three arrays — `micromarkExtensions`, `fromMarkdownExtensions`, `toMarkdownExtensions`. These are consumed by `remark-parse` and `remark-stringify` after all plugins have registered. Micromark extensions are keyed by trigger character; conflicts only arise if two extensions claim the same character code, which none of these four do.

**Recommended order (conventional, not required):**

```javascript
unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])  // Claim --- before thematicBreak
  .use(remarkMdx)                     // Claim < and { for JSX/expressions
  .use(remarkGfm)                     // GFM extensions
  .use(remarkStringify)
```

**Rationale:** Frontmatter first ensures `---` at document start is frontmatter, not thematic break. MDX before GFM because `<` needs to be claimed for JSX before HTML processing. No actual runtime conflict either way — just convention.

---

## 4. Handler API Shape (mdast-util-to-markdown)

Full reference in [evidence/e4-handler-api.md](evidence/e4-handler-api.md).

**Handler signature:**
```typescript
type Handle = (
  node: any,
  parent: Parents | undefined,
  state: State,
  info: Info
) => string
```

**Extension registration shape:**
```typescript
interface ToMarkdownExtension {
  handlers?: Record<string, Handle>;   // Node type → handler (Object.assign merge)
  join?: Join[];                        // Block spacing rules (array concat)
  unsafe?: Unsafe[];                    // Escape patterns (array concat)
  // + any Options formatting properties
}
```

**Critical design:** Handler merge uses `Object.assign()` — **last extension wins** for same node type. This is important for our fidelity handlers: register them last to override default serialization.

**State utilities for handler authors:**
- `state.enter(constructName)` — push construct onto stack (returns exit fn)
- `state.safe(text, config)` — escape text per unsafe patterns
- `state.containerPhrasing(parent, info)` — serialize inline children
- `state.containerFlow(parent, info)` — serialize block children
- `state.createTracker(info)` — position tracker for line/column accounting
- `state.indentLines(value, mapFn)` — apply line-level prefix (blockquote `> `, list indent)

---

## 5. Position Info Preservation

Full analysis in [evidence/e5-position-preservation.md](evidence/e5-position-preservation.md).

**Key finding:** Every node produced by `mdast-util-from-markdown` has `position.start.offset` and `position.end.offset` populated. These are 0-indexed byte offsets into the source string, enabling:

```typescript
const sourceText = originalMarkdown.slice(
  node.position.start.offset,
  node.position.end.offset
);
```

**This is the foundation for source-text fidelity.** Position-based slicing lets us recover the *exact* source syntax (delimiter choice, whitespace, raw form) without relying on the serializer's output. This bypasses all known serializer bugs (#12, #66, #68).

**Reliability guarantees:**
- Block nodes: always have position
- Inline nodes: always have position
- Text nodes: always have position (merged from adjacent data tokens)
- Generated nodes (added by transforms): no position per unist spec

**Position spans the complete syntactic extent:** A heading position includes the `#` prefix, emphasis includes `*`/`_` delimiters, code blocks include fence lines. This is exactly what we need for fidelity attribute recovery.

---

## 6. mdast → ProseMirror Node Type Mapping

This is the canonical mapping for our greenfield schema. Every mdast type maps to either a PM **node** (block or inline) or a PM **mark** (inline decoration).

### Block Nodes

| mdast Type | PM Node Type | PM Group | Attrs | Notes |
|-----------|-------------|----------|-------|-------|
| `root` | `doc` | — | — | Top-level container |
| `paragraph` | `paragraph` | `block` | — | Standard |
| `heading` | `heading` | `block` | `level: 1-6`, `style: 'atx'\|'setext'` | Fidelity: style from source slice |
| `blockquote` | `blockquote` | `block` | — | Standard |
| `list` | `bulletList` / `orderedList` | `block` | `marker`, `start`, `spread` | Split by `ordered` flag; fidelity: marker char |
| `listItem` | `listItem` | — | `checked: bool\|null`, `spread` | Task list via `checked` attr |
| `code` | `codeBlock` | `block` | `language`, `meta`, `fence`, `fenceLength` | Fidelity: fence char and length |
| `html` | `htmlBlock` | `block` | `content` | Atom node — raw HTML preserved verbatim |
| `thematicBreak` | `horizontalRule` | `block` | `raw` | Fidelity: exact source form (`---`, `***`, etc.) |
| `definition` | `linkRefDef` | `block` | `identifier`, `label`, `url`, `title` | Hidden in WYSIWYG, visible in source |
| `table` | `table` | `block` | `align[]` | GFM |
| `tableRow` | `tableRow` | — | — | GFM |
| `tableCell` | `tableCell` / `tableHeader` | — | `align` | GFM; header detection from row position |
| `footnoteDefinition` | `footnoteDefinition` | `block` | `identifier`, `label` | GFM |
| `yaml` | — (stripped) | — | — | Handled outside PM schema as metadata |
| `mdxJsxFlowElement` | `jsxComponent` | `block` | `name`, `attributes`, `content` | Block atom OR container |
| `mdxFlowExpression` | `mdxExpression` | `block` | `value` | Block atom |
| `mdxjsEsm` | `mdxEsm` | `block` | `value` | Block atom, root-only |

### Inline Marks

| mdast Type | PM Mark Type | Attrs | Notes |
|-----------|-------------|-------|-------|
| `emphasis` | `italic` | `delimiter: '*'\|'_'` | Fidelity: delimiter choice |
| `strong` | `bold` | `delimiter: '**'\|'__'` | Fidelity: delimiter choice |
| `delete` | `strikethrough` | — | GFM |
| `link` | `link` | `href`, `title`, `style` | Fidelity: inline vs reference style |
| `linkReference` | `link` | `href`, `title`, `style`, `refLabel`, `refType` | Resolved to same mark with ref metadata |

### Inline Nodes

| mdast Type | PM Node Type | PM Group | Attrs | Notes |
|-----------|-------------|----------|-------|-------|
| `text` | text | `inline` | — | ProseMirror native text |
| `inlineCode` | `code` (mark) or `inlineCode` (node) | `inline` | — | Usually a mark in PM |
| `break` | `hardBreak` | `inline` | `style: 'backslash'\|'spaces'` | Fidelity: break style |
| `image` | `image` | `inline` | `src`, `alt`, `title` | Atom node |
| `imageReference` | `image` | `inline` | `src`, `alt`, `title`, `refLabel`, `refType` | Resolved to image with ref metadata |
| `footnoteReference` | `footnoteReference` | `inline` | `identifier`, `label` | GFM atom |
| `mdxJsxTextElement` | `jsxInline` | `inline` | `name`, `attributes` | Inline JSX |
| `mdxTextExpression` | `mdxInlineExpression` | `inline` | `value` | Inline expression |

### Key Design Decisions

1. **link + linkReference → unified `link` mark** with `style` attribute distinguishing inline from reference. This matches the current codebase's `LinkFidelity` approach. The definition nodes provide the `url`/`title` for resolution.

2. **image + imageReference → unified `image` node** with reference metadata attrs.

3. **yaml frontmatter → metadata, not schema node.** Frontmatter is stripped before PM parsing and stored in `Y.Map('metadata')`. This matches current architecture and avoids PM schema complexity.

4. **MDX JSX → two node types** (flow and text) rather than one with a group toggle, because ProseMirror's content expressions don't support "block or inline" natively.

5. **inlineCode → PM mark** (not node). Most PM editors implement inline code as a mark because it allows cursor positioning at boundaries. However, some editors use an atom node for better deletion UX.

---

## 7. Known Bugs and Limitations

Full analysis in [evidence/e6-known-bugs.md](evidence/e6-known-bugs.md).

### Open Issues in mdast-util-to-markdown v2.1.2

| Issue | Severity | Trigger | Our Mitigation |
|-------|----------|---------|----------------|
| **#12** — Nested emphasis round-trip | Low | Triple delimiter runs with nested emphasis | Editor produces clean nesting; rare in practice |
| **#68** — Emoji breaks output | Medium | Emoji adjacent to `*`/`**` markers | Patch `.charCodeAt()` → `.codePointAt()`, or custom handler |
| **#66** — Needless char references | High (fidelity) | Any emphasis boundaries since v2.1.1 | Position-based source slicing bypasses serializer |

### Systemic Fidelity Gaps

1. **Character reference injection** at emphasis boundaries (`&#x6F;` for `o`)
2. **Over-escaping** of `_` and `&` in URL destinations
3. **Surrogate pair breakage** — `.slice()` / `.charCodeAt()` throughout serializer

### Our Mitigation Strategy

**Position-based source-text recovery eliminates all serializer-introduced artifacts.** Instead of relying on mdast-util-to-markdown's `safe()` function to reconstruct syntax, we:

1. Store original source alongside parsed mdast
2. Use `node.position.start.offset` / `node.position.end.offset` to slice original source
3. Store fidelity attributes (delimiter, style, raw form) on PM nodes during parse
4. During serialization, reconstruct from fidelity attributes rather than relying on default serializer behavior
5. Fall back to mdast-util-to-markdown only for newly-created content (no source text available)

This is the same strategy as the existing fidelity extensions, but now with position info available at the mdast level instead of relying on regex heuristics on marked tokens.

---

## 8. remark-frontmatter Configuration

Full details in [evidence/e7-frontmatter-gfm-config.md](evidence/e7-frontmatter-gfm-config.md).

**Recommendation: YAML only.**

```javascript
.use(remarkFrontmatter, ['yaml'])
```

- YAML frontmatter is universal across the markdown ecosystem (Hugo, Jekyll, Docusaurus, MDX, Obsidian)
- TOML is Hugo-specific with minimal adoption elsewhere
- Custom matter types add complexity without clear benefit
- Matches existing codebase behavior (regex-based YAML strip/prepend)

The plugin produces a `yaml` node with `value: string` containing raw YAML content. This node appears at position 0 in `root.children` and is trivially stripped before PM parsing.

---

## 9. remark-gfm Subset Selection

**Can you enable tables without footnotes?**

- **At remark-gfm level:** No. The plugin bundles all 5 features (autolink, footnotes, strikethrough, tables, task lists).
- **At micromark level:** Yes. Individual extensions (`micromark-extension-gfm-table`, etc.) can be composed manually.
- **Third-party:** `remark-gfm-configurable` provides per-feature toggles.

**Recommendation: Use full `remark-gfm`.** All 5 features are standard GFM. Footnotes aren't in our current schema but are harmless to parse — they produce `footnoteDefinition`/`footnoteReference` nodes that can be serialized back losslessly even without a PM node type. If we need footnotes later, the AST already supports them.

The `gfm()` micromark extension internally calls `combineExtensions()` on the 5 sub-extensions. There is no meaningful performance or correctness benefit to selective composition.

---

## 10. CommonMark vs GFM Strict Mode

**Is there any reason to disable GFM for stricter markdown?**

No, with caveats:

1. **GFM is a superset of CommonMark.** Enabling GFM doesn't change how CommonMark constructs parse. A `|` in regular text isn't reinterpreted as a table unless it matches the full table syntax (header row + delimiter row).

2. **Autolink literals are the one area of concern.** GFM autolink detection converts bare URLs (`www.example.com`) into links even without explicit `[]()` syntax. This could surprise users who intend literal text. However, this matches GitHub rendering behavior that most markdown authors expect.

3. **Task lists extend listItem** with `checked: boolean | null`. This is backward-compatible — a regular list item has `checked: null`.

4. **Footnotes add two node types** that don't exist in CommonMark. They only activate when `[^id]` syntax is used — no interference with CommonMark content.

5. **Strikethrough (`~~`)** doesn't conflict with any CommonMark construct. Two tildes (`~~`) has no CommonMark meaning.

**Recommendation:** Enable GFM universally. The additional features are backward-compatible and match user expectations for modern markdown editing. Strict CommonMark mode would mean users can't create tables or strikethrough — a significant UX regression.

---

## Synthesis: Pipeline Constraints on Schema Design

### What the Remark Pipeline Gives Us

1. **Structural guarantee:** Every mdast node has a well-defined type with TypeScript interfaces. No ambiguous token streams to interpret.

2. **Position-based fidelity:** Every parsed node carries `position.start.offset` and `position.end.offset`. We can slice original source to recover any syntactic detail the AST doesn't capture (delimiter choice, whitespace, raw form).

3. **Composable extensions:** Plugin ordering doesn't matter. Extensions accumulate cleanly via `this.data()`. No monkey-patching, no global state mutation.

4. **Bidirectional:** `mdast-util-from-markdown` (parse) and `mdast-util-to-markdown` (serialize) use symmetrical extension APIs. Custom node types get round-trip support by implementing both directions.

5. **MDX as first-class citizen:** 5 MDX node types with full attribute shapes, ESTree attachment for expression validation, and clean integration with CommonMark/GFM content.

### What the Pipeline Constrains

1. **PM schema must be mdast-isomorphic.** Every mdast node type that we want to round-trip MUST have a corresponding PM node or mark type. Unmapped types will be lost or corrupted on conversion.

2. **Block vs inline is syntactic, not semantic.** MDX JSX elements are classified block/inline based on surrounding whitespace, not component name. The PM schema must support both `mdxJsxFlowElement` (block) and `mdxJsxTextElement` (inline) as separate node types.

3. **Reference resolution is a transform, not a parse concern.** The parser produces `linkReference`/`imageReference` nodes with identifiers, and separate `definition` nodes with URLs. Resolution (matching refs to defs) is a post-parse step. The PM schema should store both the reference metadata AND the resolved URL.

4. **Frontmatter is metadata, not content.** The `yaml` node is always first child of `root`. It should be extracted before PM conversion and stored separately (matching current `Y.Map('metadata')` approach).

5. **ESM nodes are root-only.** `mdxjsEsm` (import/export) can only appear as direct children of `root`, not nested in blocks. The PM schema should enforce this via content expression constraints.

6. **Serializer has known fidelity gaps** for emphasis boundaries, emoji, and URLs. The schema design must plan for position-based source recovery rather than relying solely on default serialization.

### Minimum PM Schema Surface (27 types)

**Block nodes (17):** `doc`, `paragraph`, `heading`, `blockquote`, `bulletList`, `orderedList`, `listItem`, `codeBlock`, `htmlBlock`, `horizontalRule`, `linkRefDef`, `table`, `tableRow`, `tableCell`, `jsxComponent`, `mdxExpression`, `mdxEsm`

**Inline nodes (5):** `text`, `hardBreak`, `image`, `footnoteReference`, `jsxInline`

**Marks (5):** `bold`, `italic`, `strikethrough`, `link`, `code`

**External (not in schema):** `yaml` (metadata), `mdxInlineExpression` (could be mark or node)

---

## Evidence Files

| File | Content |
|------|---------|
| [e1-mdast-node-catalogue.md](evidence/e1-mdast-node-catalogue.md) | Complete 32-type mdast catalogue with TypeScript definitions |
| [e2-mdx-node-types.md](evidence/e2-mdx-node-types.md) | MDX node types with full attribute shapes |
| [e3-plugin-ordering.md](evidence/e3-plugin-ordering.md) | Plugin registration mechanism and ordering analysis |
| [e4-handler-api.md](evidence/e4-handler-api.md) | mdast-util-to-markdown handler API reference |
| [e5-position-preservation.md](evidence/e5-position-preservation.md) | Position info reliability and source slicing |
| [e6-known-bugs.md](evidence/e6-known-bugs.md) | Known bugs and round-trip fidelity gaps |
| [e7-frontmatter-gfm-config.md](evidence/e7-frontmatter-gfm-config.md) | Frontmatter and GFM configuration details |
