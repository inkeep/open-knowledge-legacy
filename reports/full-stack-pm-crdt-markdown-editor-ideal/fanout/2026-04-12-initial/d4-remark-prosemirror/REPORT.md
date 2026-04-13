# D4: @handlewithcare/remark-prosemirror — Deep Technical Analysis

**Parent question:** What is the architecturally-ideal full-stack configuration for a greenfield ProseMirror-based CRDT markdown editor with MDX support?

**Scope:** Complete API surface, extension points, coverage gaps, and integration implications for `@handlewithcare/remark-prosemirror@0.1.5`.

**Sources:** npm tarball (v0.1.5, published 2025-01-03), [GitHub source](https://github.com/handlewithcarecollective/remark-prosemirror) (26 commits), [npm registry](https://www.npmjs.com/package/@handlewithcare/remark-prosemirror), [ProseMirror Discuss thread](https://discuss.prosemirror.net/t/new-markdown-library-remark-prosemirror/8049)

---

## 1. Complete Handler API

The library exports **6 functions + 2 type aliases** across two conversion directions. Evidence: [e1-complete-api-surface.md](evidence/e1-complete-api-surface.md)

### Direction 1: Markdown → ProseMirror

**Entry point:** `remarkProseMirror` (unified compiler plugin) or `toProseMirror` (standalone function)

```typescript
// Unified pipeline
const doc = await unified()
  .use(remarkParse)
  .use(remarkProseMirror, {
    schema: mySchema,
    handlers: { /* mdast type → handler */ },
    htmlHandlers: { /* HTML tag → handler */ },
  })
  .process(markdown);

// Standalone (no unified dependency needed for this path)
import { toProseMirror } from "@handlewithcare/remark-prosemirror";
const doc = toProseMirror(mdastTree, { schema, handlers });
```

**Handler signature:**
```typescript
type MdastNodeHandler<Type> = (
  node: Extract<MdastNodes, { type: Type }>,
  parent: MdastParent,
  state: State,
) => PmNode | PmNode[] | null;
```

**State object** provides:
- `state.all(node)` — recursively convert all children to PM nodes
- `state.one(node, parent)` — convert a single node
- `state.definitionById` — pre-collected link definitions (Map)
- `state.footnoteById` — pre-collected footnote definitions (Map)

**Helper: `toPmNode(nodeType, getAttrs?)`** — Creates a handler that calls `state.all(node)` then `nodeType.createAndFill(attrs, children)`. Works for both container nodes (paragraph, blockquote) and atom nodes (image, horizontal_rule).

**Helper: `toPmMark(markType, getAttrs?)`** — Creates a handler that converts children and applies the mark to each child via `child.mark(mark.addToSet(child.marks))`.

### Direction 2: ProseMirror → Markdown

**Entry point:** `fromProseMirror(pmNode, options)` → returns `MdastRoot`

```typescript
const mdast = fromProseMirror(doc, {
  schema: mySchema,
  nodeHandlers: { /* PM node name → handler */ },
  markHandlers: { /* PM mark name → handler */ },
});
const markdown = unified().use(remarkStringify).stringify(mdast);
```

**Node handler signature:**
```typescript
type PmNodeHandler = (
  node: PmNode,
  parent: PmNode | undefined,
  state: State,
) => MdastNodes | MdastNodes[] | null;
```

**Mark handler signature — critically different from node handlers:**
```typescript
type PmMarkHandler = (
  mark: PmMark,
  parent: PmNode,
  children: MdastNodes[],    // Already-converted mdast children
  state: State,
) => MdastNodes | MdastNodes[] | null;
```

Mark handlers receive **already-converted children**, not the raw PM nodes. This is because the `hydrateMarks` algorithm recursively processes marks before calling handlers.

**Helper: `fromPmNode(type, getAttrs?)`** — Creates `{ type, ...getAttrs(node), children: state.all(node) }`.

**Helper: `fromPmMark(type, getAttrs?)`** — Creates `{ type, ...getAttrs(mark), children: mdastChildren }`.

---

## 2. Atom Node Support

Evidence: [e2-atom-node-and-custom-type-analysis.md](evidence/e2-atom-node-and-custom-type-analysis.md)

### toPmNode works for atoms

`toPmNode` calls `nodeType.createAndFill(attrs, children)`. For atom nodes, `children = []` (mdast nodes like `image` or `thematicBreak` have no children), and `createAndFill({}, [])` succeeds for atoms because they have no content expression.

```typescript
// Simple atom — toPmNode works directly
handlers: {
  thematicBreak: toPmNode(schema.nodes.horizontal_rule),
  image: toPmNode(schema.nodes.image, (n) => ({ src: n.url, alt: n.alt })),
}
```

### Custom atom handler for wiki-links

For custom atom nodes like wiki-links, write a handler directly:

```typescript
handlers: {
  wikiLink(node, _, state) {
    // node.data.alias, node.value, node.data.permalink from remark-wiki-link
    return schema.nodes.wikiLink.create({
      target: node.data?.alias ?? node.value,
      href: node.data?.permalink,
    });
  }
}
```

### fromProseMirror direction

Atom nodes in the reverse direction:
```typescript
nodeHandlers: {
  horizontal_rule: (node) => ({ type: "thematicBreak" }),
  image: fromPmNode("image", (n) => ({ url: n.attrs.src, alt: n.attrs.alt })),
  wikiLink: (node) => ({
    type: "wikiLink",  // requires module augmentation
    value: node.attrs.target,
    data: { permalink: node.attrs.href },
  }),
}
```

---

## 3. Mark Handling & `hydrateMarks`

Evidence: [e3-mark-hydration-algorithm.md](evidence/e3-mark-hydration-algorithm.md)

The `hydrateMarks` algorithm solves the fundamental impedance mismatch between ProseMirror (flat mark arrays on text nodes) and mdast (nested tree structure).

### Algorithm Summary

1. **Partition** consecutive PM children by their outermost mark (`marks[0]`), using `Mark.eq()` for comparison
2. **Recursively strip** the outermost mark from each partition and re-partition on the next mark
3. **Apply mark handlers** bottom-up, wrapping already-converted children

### Key properties

- **Mark ordering matters:** ProseMirror's mark ordering determines nesting. The first mark becomes the outermost wrapper.
- **Missing mark handler → passthrough:** If no handler exists for a mark type, children pass through unwrapped (the mark is silently dropped, not errored).
- **Mark attrs affect partitioning:** Two link marks with different `href` values create separate partitions (because `Mark.eq()` compares attrs), producing separate link mdast nodes as expected.

### Example

Input: `This *is a **document.***`

PM representation:
```
text("This ")         marks: []
text("is a ")         marks: [em]
text("document.")     marks: [em, strong]
```

After hydrateMarks:
```
paragraph
├── text("This ")
└── emphasis
    ├── text("is a ")
    └── strong
        └── text("document.")
```

---

## 4. Custom mdast Types

Evidence: [e2-atom-node-and-custom-type-analysis.md](evidence/e2-atom-node-and-custom-type-analysis.md)

### TypeScript constraint

The handler map is typed as:
```typescript
type MdastHandlers = { [Type in MdastNodes["type"]]?: MdastNodeHandler<Type>; };
```

Custom types (e.g., `mdxJsxFlowElement`, `wikiLink`) are not in the `MdastNodes` union by default. **The TypeScript compiler will reject them.**

### Solution: Module augmentation (idiomatic)

```typescript
// mdast-util-mdx-jsx already does this for MDX:
declare module 'mdast' {
  interface RootContentMap {
    mdxJsxFlowElement: MdxJsxFlowElement;
    mdxJsxTextElement: MdxJsxTextElement;
  }
  interface PhrasingContentMap {
    mdxJsxTextElement: MdxJsxTextElement;
  }
}
```

Once the type augmentation is in scope (e.g., by importing `mdast-util-mdx-jsx`), the handler map naturally accepts these keys. **No type assertions needed.**

For our custom `wikiLink` type, we would need our own module augmentation.

### Runtime behavior

The dispatch mechanism (`zwitch`) is type-agnostic — any string key works at runtime. The constraint is purely TypeScript-level.

### fromProseMirror direction

No restrictions on custom types. The `PmNodeHandlers` type is `Partial<Record<PmNodes, ...>>` where `PmNodes` comes from your schema's type parameter — automatically includes all your custom node types.

---

## 5. Coverage Gaps

Evidence: [e4-coverage-gaps-and-error-handling.md](evidence/e4-coverage-gaps-and-error-handling.md)

### The library provides ZERO default handlers for standard markdown

This is a deliberate design choice. Unlike `prosemirror-markdown` which bundles a default schema with handlers, remark-prosemirror requires the consumer to register handlers for **every mdast type** that can appear in their documents.

### Types requiring custom handlers

**CommonMark (mandatory for any markdown editor):**
- `paragraph`, `heading`, `blockquote`, `list`, `listItem`, `code`, `inlineCode`, `emphasis`, `strong`, `link`, `image`, `thematicBreak`, `break`

**GFM (if using remark-gfm):**
- `table`, `tableRow`, `tableCell`, `delete`

**MDX (if using remark-mdx):**
- `mdxJsxFlowElement`, `mdxJsxTextElement`, `mdxFlowExpression`, `mdxTextExpression`, `mdxjsEsm`

**Custom (our extensions):**
- `wikiLink`

### What's handled for you

- `root` → schema.topNodeType
- `text` → schema.text()
- `yaml`, `toml`, `definition`, `footnoteDefinition` → ignored
- `linkReference` → resolved to `link` handler
- `html` → dispatched to htmlHandlers

### Handler count estimate for our schema

| Category | toProseMirror | fromProseMirror (nodes) | fromProseMirror (marks) |
|---|---|---|---|
| CommonMark blocks | 7 | 7 | — |
| CommonMark inline | 2 atoms + 4 marks | 2 + 4 | 4 |
| GFM | 3 | 3 | 1 |
| MDX | 2-5 | 2-5 | — |
| Custom (wikiLink) | 1 | 1 | — |
| **Total** | **~19-22** | **~19-22** | **~5** |

---

## 6. From-ProseMirror: Two-Stage Pipeline

### Stage 1: PM → mdast (this library)

`fromProseMirror(doc, options)` produces an `MdastRoot`. This is a full mdast abstract syntax tree — not a markdown string.

### Stage 2: mdast → markdown string (remark-stringify)

```typescript
const markdown = unified().use(remarkStringify, remarkStringifyOptions).stringify(mdast);
```

**Key implication:** Source-text fidelity features (delimiter preservation, marker style, etc.) are handled at the mdast → string stage, NOT in this library. The library produces clean mdast nodes; `remark-stringify` (via `mdast-util-to-markdown`) controls how they become markdown text.

### Integration with remark-stringify extensions

`remark-stringify` accepts extensions via its options:

```typescript
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { mdxToMarkdown } from 'mdast-util-mdx';

const markdown = toMarkdown(mdast, {
  extensions: [gfmToMarkdown(), mdxToMarkdown()],
  // Per-node serialization options:
  bullet: '-',
  emphasis: '_',
  strong: '**',
  rule: '---',
});
```

For delimiter preservation, the `fromProseMirror` handler can store delimiter info in the mdast node's `data` field, and a custom `mdast-util-to-markdown` handler can read it:

```typescript
// In fromProseMirror handler:
nodeHandlers: {
  heading: (node, _, state) => ({
    type: "heading",
    depth: node.attrs.level,
    children: state.all(node),
    data: { hProperties: { delimiter: node.attrs.delimiter } },
  }),
}

// In mdast-util-to-markdown extension:
{
  handlers: {
    heading(node, parent, state) {
      // Read delimiter from node.data to choose # vs === style
    }
  }
}
```

---

## 7. Error Handling — Asymmetric by Direction

Evidence: [e4-coverage-gaps-and-error-handling.md](evidence/e4-coverage-gaps-and-error-handling.md)

### toProseMirror: THROWS on unknown mdast types

```typescript
function unknown(node) {
  throw new Error(`unknown markdown node: ${node.type}`);
}
```

Any mdast node type without a registered handler causes a runtime crash. This is fail-fast — you discover missing handlers immediately.

**Implication:** When adding remark plugins (remark-gfm, remark-mdx, remark-wiki-link, etc.), you MUST simultaneously register handlers for all new mdast types they introduce.

### fromProseMirror: SILENT DROP on unknown PM nodes

PM nodes without handlers return `null` and are silently removed from the mdast tree.

**Implication:** Missing handlers in the reverse direction cause data loss without any error signal. This is dangerous for round-trip fidelity.

### `toPmNode` → `createAndFill` → null

`toPmNode` uses `createAndFill()` which returns `null` if children don't match the node's content expression. The null propagates silently — the node is dropped from the document without error.

### `doc.check()` at the end

After building the complete document, `toProseMirror` calls `doc.check()` which throws if the document violates ProseMirror schema constraints. This catches structural issues but only as a final validation.

---

## 8. Breaking Changes History

Evidence: [e5-version-history-and-ecosystem.md](evidence/e5-version-history-and-ecosystem.md)

### No breaking changes in 0.1.x

All 6 versions (0.1.0 → 0.1.5) were published in two bursts (2024-12-18, 2025-01-03). Changes were:
- Dependency cleanup (0.1.1, 0.1.2)
- Added peerDependency on prosemirror-model (0.1.3)
- Root node construction fix (0.1.5)

### Maintenance status

- **Last commit:** 2025-05-09 (11 months ago)
- **Unreviewed PR:** #3 open since 2025-12-21 (4 months)
- **No CHANGELOG, no releases, no tags**
- Assessment: "works for us at moment.dev" maintenance mode

### 1.0 outlook

No roadmap published. Given the small API surface (~650 LOC) and stable handler model, the pre-1.0 status is more about the author's caution than API instability. The handler signatures are unlikely to change significantly.

---

## 9. Reference Consumers

Evidence: [e5-version-history-and-ecosystem.md](evidence/e5-version-history-and-ecosystem.md)

### Primary production consumer: moment.dev

Confirmed by smoores in ProseMirror Discuss thread. moment.dev is the driving use case for this library.

### GitHub dependents (9 repos)

- 3 same-org repos (handlewithcarecollective)
- 2 forks
- 2 external: `mmounirf/tiptap-dev-kit`, `vangberg/skrift`

### npm dependents: 0

The library has no npm dependents in the public registry. All consumers are either private (moment.dev) or use it via git/direct dependency.

### Lessons from consumers

**vangberg/skrift:** Author submitted the README fix PR (process not parse). Shows that even small API misunderstandings are possible — the README originally showed `parse()` instead of `process()`.

**acorduan (issues #2, #3):** Encountered whitespace handling issues — empty lines and empty text nodes. These are genuine edge cases that any production consumer will hit.

---

## 10. Architectural Implications for Our Migration

### What this library gives us

1. **Clean mdast ↔ PM conversion** with type-safe handler registration
2. **Full remark ecosystem access** — any remark plugin's mdast types can be handled
3. **Mark hydration** — the hardest part of PM → mdast conversion is solved
4. **HTML handling** — raw HTML → hast → PM pipeline included
5. **Link reference resolution** — automatic definition lookup

### What we must build

1. **~40-45 handlers** (19-22 toProseMirror + 19-22 fromProseMirror node + 5 mark handlers)
2. **Module augmentation** for wikiLink and any custom mdast types
3. **Source-text fidelity** — delimiter/marker preservation flows through mdast `data` fields, serialized by custom `mdast-util-to-markdown` handlers (NOT this library's concern)
4. **Error boundaries** — wrap toProseMirror calls to handle unknown node types gracefully instead of crashing
5. **Missing handler detection** — add validation for fromProseMirror to warn on nodes without handlers (prevent silent data loss)

### Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Pre-1.0, low maintenance | Low | API is tiny (~650 LOC), trivially forkable |
| THROWS on unknown types | Medium | Register handlers for all types, add error boundary |
| Silent DROP in reverse direction | High | Add validation wrapper to detect missing handlers |
| Empty text node bug (Issue #3) | Medium | Apply the PR #3 fix ourselves or in a fork |
| No built-in handlers | Low (feature, not bug) | We need custom handlers anyway for our schema |

### Total integration surface

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

---

## Evidence Files

| File | Content |
|---|---|
| [e1-complete-api-surface.md](evidence/e1-complete-api-surface.md) | Full API surface with function signatures, type definitions, dependency tree |
| [e2-atom-node-and-custom-type-analysis.md](evidence/e2-atom-node-and-custom-type-analysis.md) | Atom node support analysis, custom mdast type registration patterns |
| [e3-mark-hydration-algorithm.md](evidence/e3-mark-hydration-algorithm.md) | Deep dive on `hydrateMarks` algorithm with worked examples |
| [e4-coverage-gaps-and-error-handling.md](evidence/e4-coverage-gaps-and-error-handling.md) | Complete gap analysis, error handling asymmetry, known bugs |
| [e5-version-history-and-ecosystem.md](evidence/e5-version-history-and-ecosystem.md) | Version history, breaking changes, GitHub dependents, author context |
