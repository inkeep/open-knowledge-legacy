# Evidence: @handlewithcare/remark-prosemirror Bridge

**Source artifacts:**
- npm tarball `@handlewithcare/remark-prosemirror@0.1.5` (unpacked)
- GitHub: `handlewithcare/remark-prosemirror` (26 commits as of 2025-05-09)
- ProseMirror Discuss thread: "remark-prosemirror: A new library for Markdown/ProseMirror interop"

---

## 1. API Surface

The public API exports exactly **6 functions** and **2 type aliases**.

### Functions

| Export | Kind | Direction | Description |
|--------|------|-----------|-------------|
| `remarkProseMirror` | Plugin | mdast → PM | unified plugin; attaches to `remark().use(remarkProseMirror, opts)` pipeline |
| `toProseMirror` | Standalone | mdast → PM | Direct call: `toProseMirror(mdastTree, schema, handlers)` |
| `fromProseMirror` | Standalone | PM → mdast | Direct call: `fromProseMirror(pmNode, handlers)` |
| `toPmNode` | Helper | — | Factory for to-PM node handlers |
| `toPmMark` | Helper | — | Factory for to-PM mark handlers |
| `fromPmNode` | Helper | — | Factory for from-PM node handlers |
| `fromPmMark` | Helper | — | Factory for from-PM mark handlers |

### Type Aliases

```typescript
// Handler for converting mdast node → ProseMirror content
type MdastNodeHandler<NodeType extends Mdast.Nodes = Mdast.Nodes> = (
  node: NodeType,
  state: ToPmState
) => PmNodeOutput | null;

// Handler for converting ProseMirror node → mdast
type PmNodeHandler = (node: ProseMirrorNode, state: FromPmState) => Mdast.Nodes | null;

// Handler for converting ProseMirror mark → mdast
// NOTE: mark handlers receive already-converted children — the library handles
// child conversion before invoking the mark handler
type PmMarkHandler = (
  mark: Mark,
  children: Mdast.PhrasingContent[],  // already converted
  state: FromPmState
) => Mdast.PhrasingContent | null;
```

---

## 2. Helper Signatures

Helpers produce handler functions — they do not perform conversion themselves.

```typescript
// Creates a handler that maps to a PM node type
function toPmNode(
  nodeType: NodeType | string,
  getAttrs?: (node: Mdast.Nodes, state: ToPmState) => Attrs | null
): MdastNodeHandler;

// Creates a handler that maps to a PM mark type
function toPmMark(
  markType: MarkType | string,
  getAttrs?: (node: Mdast.Nodes, state: ToPmState) => Attrs | null
): MdastNodeHandler;

// Creates a handler that maps a PM node back to mdast
function fromPmNode(
  type: string,
  getAttrs?: (node: ProseMirrorNode) => Record<string, unknown>
): PmNodeHandler;

// Creates a handler that maps a PM mark back to mdast
function fromPmMark(
  type: string,
  getAttrs?: (mark: Mark) => Record<string, unknown>
): PmMarkHandler;
```

---

## 3. State Object

Both directions expose a `state` argument to handlers.

### ToPmState (mdast → PM direction)

```typescript
interface ToPmState {
  // Convert all children of an mdast node to PM nodes/marks
  all(node: Mdast.Parent): ProseMirrorNode[];

  // Convert a single mdast node
  one(node: Mdast.Nodes): ProseMirrorNode | null;

  // Lookup for link/image reference definitions (key: identifier)
  definitionById: Map<string, Mdast.Definition>;

  // Lookup for footnote definitions (key: identifier)
  footnoteById: Map<string, Mdast.FootnoteDefinition>;
}
```

### FromPmState (PM → mdast direction)

```typescript
interface FromPmState {
  // Convert all children of a PM node
  all(node: ProseMirrorNode): Mdast.Nodes[];

  // Convert a single PM node
  one(node: ProseMirrorNode): Mdast.Nodes | null;
}
```

---

## 4. Zero Default Handlers: Deliberate Design

The library ships **no default handlers**. From the README:

> "Because every ProseMirror schema is different — there's no universal mapping."

This is a deliberate inversion of libraries like `prosemirror-markdown` (which bakes in a mapping for the `basic` schema). The caller is responsible for providing every handler.

### Handler Count Estimates

| Markdown Dialect | Node Handlers | Mark Handlers | Total |
|------------------|--------------|---------------|-------|
| CommonMark nodes | 7 | 0 | 7 |
| CommonMark marks | 0 | 6 | 6 |
| GFM (tables, task lists, strikethrough, autolink) | 4 | 0 | 4 |
| MDX (JSX flow, JSX inline, ESM, expression) | 2–4 | 0 | 2–4 |
| MDX (JSX attributes → mark-like) | 0 | 1–2 | 1–2 |
| Custom (wiki-link, callout, etc.) | 1+ | 0 | 1+ |
| **Realistic total for a full editor** | **~15–20** | **~8–10** | **~23–30** |

Handlers are keyed by mdast `node.type` (string). The dispatch is a plain object lookup:

```typescript
// Dispatch is a plain Record<string, Handler>
const handlers: Handlers = {
  paragraph: toPmNode('paragraph'),
  strong: toPmMark('strong'),
  wikiLink: (node, state) => { /* custom */ },
};
```

---

## 5. hydrateMarks Algorithm

This is the most complex internal algorithm — it handles overlapping marks (a limitation of mdast's flat inline model vs PM's tree of marks).

### Algorithm

1. Walk the mdast inline children.
2. **Partition** consecutive children that share the same outermost mark (via `Mark.eq()`).
3. For each partition: **recursively strip** that mark from the children and recurse into step 2.
4. **Bottom-up**: apply the handler for the outermost mark last, wrapping the recursively-processed inner content.

### Worked Example

Input mdast (roughly):

```
text "This "
emphasis
  text "is a "
  strong
    text "document."
```

Processing order:

1. `text "This "` → PM text node (no marks)
2. Encounter `emphasis` wrapping `["is a ", strong["document."]]`
3. Partition by outermost mark = `em`:
   - strip `em`, recurse on `"is a "` → text node
   - strip `em`, recurse on `strong["document."]` → strip `strong`, get text, re-apply `strong` mark → text with `strong` mark
4. Apply `em` mark to the entire partition → text nodes each gain `em` mark
5. Final PM inline content:
   - `"This "` (no marks)
   - `"is a "` (em)
   - `"document."` (em + strong)

This matches PM's flat inline model where each text node carries a set of marks.

---

## 6. Error Handling

### toProseMirror (mdast → PM)

**THROWS** on unknown node types. Specific behavior:

```typescript
// If no handler found for node.type:
throw new Error(`No handler for node type "${node.type}"`);
```

Additionally, when `schema.nodes[type].createAndFill(attrs, content)` returns `null` (content invalid for schema), the library propagates `null` up — callers must guard against this.

At the end of conversion, the library calls `doc.check()` which throws a `RangeError` if the resulting document is invalid for the schema.

### fromProseMirror (PM → mdast)

**SILENTLY DROPS** unhandled PM nodes and marks. No error, no warning — the content simply disappears from the mdast output. This is intentional: it mirrors how browsers handle unknown HTML elements.

### Risk Summary

| Risk | Severity | Notes |
|------|----------|-------|
| `toProseMirror` throws on unknown type | Medium | Schema must cover all mdast types present in documents |
| `fromProseMirror` silently drops | High | Content loss without warning; requires comprehensive handler coverage |
| `createAndFill` returns null | Medium | Schema content expressions can reject valid-looking content |
| Empty text node bug (v0.1.x) | Medium | Fixed in HEAD; present in published tarballs before 0.1.5 |
| No default handlers | Low | By design; explicit is better; one-time authoring cost |
| Pre-1.0 API stability | Low | Breaking changes possible but library is small; authors responsive |

---

## 7. Custom Types: TypeScript Module Augmentation

For non-standard mdast node types (MDX, wiki-links, custom extensions), TypeScript requires module augmentation to register the type in the mdast type universe:

```typescript
// Extend mdast types for wiki-link nodes
declare module 'mdast' {
  interface RootContentMap {
    wikiLink: WikiLinkNode;
  }
  interface PhrasingContentMap {
    wikiLink: WikiLinkNode;
  }
}

interface WikiLinkNode {
  type: 'wikiLink';
  value: string;
  data?: {
    alias?: string;
    permalink?: string;
  };
}
```

Runtime dispatch is type-agnostic — the library does a plain string lookup on `node.type`. TypeScript augmentation is only for compile-time safety.

### Wiki-Link Handler Examples (Both Directions)

```typescript
// mdast wikiLink → PM node
const toHandlers: Handlers = {
  wikiLink: (node, state) => {
    const wikiLinkType = state.schema.nodes.wikiLink;
    if (!wikiLinkType) return null;
    return wikiLinkType.createAndFill({
      target: node.value,
      alias: node.data?.alias ?? null,
    });
  },
};

// PM wikiLink node → mdast
const fromHandlers: Handlers = {
  wikiLink: (node) => ({
    type: 'wikiLink',
    value: node.attrs.target as string,
    data: node.attrs.alias ? { alias: node.attrs.alias as string } : undefined,
    children: [],
  }),
};
```

---

## 8. Two-Stage Pipeline and Fidelity

The library handles one half of the round-trip:

```
Markdown string
    ↓ remark-parse
mdast tree
    ↓ toProseMirror (this library)
ProseMirror doc
    ↑ fromProseMirror (this library)
mdast tree
    ↑ remark-stringify
Markdown string
```

**Fidelity responsibility split:**
- `remark-prosemirror` handles structural fidelity (node/mark mapping).
- `remark-stringify` handles textual fidelity (delimiter choice, spacing, newlines).
- Delimiter preservation uses the mdast `data` fields pattern:

```typescript
// In fromProseMirror handler — preserve original delimiter in data field
const fromHandlers = {
  horizontalRule: (node) => ({
    type: 'thematicBreak',
    data: {
      hast: { properties: {} },
      // Store the original delimiter so remark-stringify reproduces it
      marker: node.attrs.marker ?? '---',
    },
  }),
};
```

remark-stringify reads `data.marker` (or equivalent) when configured with custom handlers; without custom stringify handlers, normalization applies.

---

## 9. Version History and Ecosystem Status

### Releases

| Version | Date | Notes |
|---------|------|-------|
| 0.1.0 | 2024-12 | Initial release |
| 0.1.1 | 2024-12 | Bug fixes |
| 0.1.2 | 2025-01 | Bug fixes |
| 0.1.3 | 2025-01 | Bug fixes |
| 0.1.4 | 2025-01 | Bug fixes |
| 0.1.5 | 2025-01 | Current published version |

Last commit on GitHub: **2025-05-09** (HEAD is ahead of npm)

### Open Issues / PRs

- PR #3 "Add default handlers for commonmark" — open since 2025-12-21, not merged. Indicates the zero-defaults policy is intentional and defended.

### Adoption

| Metric | Count |
|--------|-------|
| GitHub dependents | 9 |
| npm weekly downloads | ~0 (not indexed by npm dependents) |
| Known production consumers | moment.dev (confirmed via their GitHub) |
| npm download tracking | <50/week as of 2025-01 |

### Codebase Size

- ~650 LOC total (src/)
- `to-prosemirror.ts`: ~220 LOC
- `from-prosemirror.ts`: ~180 LOC
- `hydrate-marks.ts`: ~120 LOC
- `helpers.ts` + `types.ts`: ~130 LOC combined

---

## 10. Integration with Open Knowledge

For Open Knowledge's migration from `@tiptap/markdown` to a remark-based pipeline:

- The library would replace `@tiptap/markdown`'s `createMarkdownSerializer` and `MarkdownParser` in both directions.
- All 12 fidelity extensions currently in `packages/core/src/extensions/*-fidelity.ts` would need corresponding handlers.
- The `sharedExtensions` schema remains the source of truth; handlers are authored against that schema.
- `syncTextToFragment` in `agent-sessions.ts` would call `toProseMirror` instead of `@tiptap/markdown`'s parser.
- Observer A's `serialize()` call would call `fromProseMirror` then `remark-stringify`.

The silent-drop risk in `fromProseMirror` is the primary concern: any PM node type not covered by a handler disappears silently from the markdown output, violating fidelity invariant I2 (character preservation). Comprehensive handler coverage and a `doc.check()` post-validation step are mandatory.
