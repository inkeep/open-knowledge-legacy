# E1: Complete API Surface — @handlewithcare/remark-prosemirror@0.1.5

**Source:** npm package tarball + GitHub repo `handlewithcarecollective/remark-prosemirror`

## Package Exports (index.ts)

```typescript
// Markdown → ProseMirror
export { remarkProseMirror, toPmNode, toPmMark, type Options as RemarkProseMirrorOptions }
  from "./lib/remark-prosemirror.js";

// ProseMirror → Markdown (via mdast)
export { fromProseMirror, fromPmNode, fromPmMark, type Options as FromProseMirrorOptions }
  from "./lib/mdast-util-from-prosemirror.js";
```

Total: **6 functions + 2 type exports**.

## Direction 1: Markdown → ProseMirror (toProseMirror)

### `remarkProseMirror` — Unified compiler plugin

```typescript
// Plugin signature — attaches as unified compiler
const remarkProseMirror: Plugin<[Options], MdastRoot, PmNode>;

// Plugin implementation (entire source):
export const remarkProseMirror = function(options) {
  this.compiler = function(tree) {
    return toProseMirror(tree, options);
  };
};
```

### Options (toProseMirror direction)

```typescript
interface Options {
  schema: Schema;                     // ProseMirror schema
  handlers: MdastHandlers;            // mdast node type → handler
  htmlHandlers?: HastHandlers;        // HTML element tagName → handler (optional)
}

// Handler map — keys are mdast node types
type MdastHandlers = {
  [Type in MdastNodes["type"]]?: MdastNodeHandler<Type>;
};

// Individual handler signature
type MdastNodeHandler<Type extends string> = (
  node: Extract<MdastNodes, { type: Type }>,
  parent: MdastParent,
  state: State,
) => PmNode | PmNode[] | null;
```

### State object (available in handlers)

```typescript
interface State {
  all: (node: MdastNodes) => PmNode[];                    // Convert all children
  definitionById: Map<string, MdastDefinition>;           // Link reference lookup
  footnoteById: Map<string, MdastFootnoteDefinition>;    // Footnote lookup
  footnoteCounts: Map<string, number>;                    // Footnote ref counts
  footnoteOrder: string[];                                // Footnote order
  one: (node: MdastNodes, parent: MdastParent | undefined) => PmNode | PmNode[] | null;
}
```

### `toPmNode` helper

```typescript
function toPmNode<MdastNode extends MdastNodes>(
  nodeType: NodeType,
  getAttrs?: (mdastNode: MdastNode) => Record<string, unknown> | null
): (node: MdastNode, _: MdastParent, state: State) => PmNode | null;

// Implementation: calls state.all(node) for children, then nodeType.createAndFill(attrs, children)
```

### `toPmMark` helper

```typescript
function toPmMark<MdastNode extends MdastNodes>(
  markType: MarkType,
  getAttrs?: (mdastNode: MdastNode) => Record<string, unknown> | null
): (node: MdastNode, _: MdastParent, state: State) => PmNode[];

// Implementation: calls state.all(node) for children, creates mark, applies to each child
```

### `toProseMirror` standalone function

```typescript
const toProseMirror = function(tree: MdastRoot, options: Options): PmNode;
// Not exported from index, but available from mdast-util-to-prosemirror.js
// Calls handle() on root, then doc.check() before returning
```

### Built-in handlers (hardcoded in `handle()`)

| mdast type | Behavior |
|---|---|
| `root` | Creates `schema.topNodeType` with all children |
| `text` | Creates `schema.text()` with newline normalization |
| `html` | Parses with `hast-util-from-html`, dispatches to `htmlHandlers` by tagName |
| `toml` | Ignored (returns undefined) |
| `yaml` | Ignored (returns undefined) |
| `definition` | Ignored (collected into `state.definitionById` during tree walk) |
| `footnoteDefinition` | Ignored (collected into `state.footnoteById`) |
| `linkReference` | Special: resolves via `definitionById`, delegates to `handlers.link` |

### Error handling (unknown nodes)

```typescript
// Unknown mdast node type → THROWS
function unknown(node: unknown): PmNode {
  throw new Error(`unknown markdown node: ${(node as MdastNodes).type}`);
}
```

## Direction 2: ProseMirror → Markdown (fromProseMirror)

### `fromProseMirror` function

```typescript
function fromProseMirror<PmNodes extends string, PmMarks extends string>(
  pmNode: PmNode,
  options: Options<PmNodes, PmMarks>
): MdastRoot;
```

### Options (fromProseMirror direction)

```typescript
interface Options<PmNodes extends string, PmMarks extends string> {
  schema: Schema<PmNodes, PmMarks>;
  nodeHandlers: PmNodeHandlers<PmNodes>;   // PM node name → handler
  markHandlers: PmMarkHandlers<PmMarks>;   // PM mark name → handler
}

type PmNodeHandler = (
  node: PmNode,
  parent: PmNode | undefined,
  state: State<string, string>
) => MdastNodes | MdastNodes[] | null;

type PmMarkHandler = (
  mark: PmMark,
  parent: PmNode,
  children: MdastNodes[],              // Already-converted children
  state: State<string, string>
) => MdastNodes | MdastNodes[] | null;
```

### State object (fromProseMirror direction)

```typescript
interface State<PmNodes extends string, PmMarks extends string> {
  one(pmNode: PmNode, parent?: PmNode): MdastNodes | MdastNodes[] | null;
  all(pmNode: PmNode): MdastNodes[];
  nodeHandlers: PmNodeHandlers<PmNodes>;
  markHandlers: PmMarkHandlers<PmMarks>;
}
```

### `fromPmNode` helper

```typescript
function fromPmNode<Type extends MdastNodes["type"]>(
  type: Type,
  getAttrs?: (pmNode: PmNode) => Omit<Extract<MdastNodes, { type: Type }>, "type" | "children">
): PmNodeHandler;

// Implementation: creates { type, ...getAttrs(node), children: state.all(node) }
```

### `fromPmMark` helper

```typescript
function fromPmMark<Type extends MdastNodes["type"]>(
  type: Type,
  getAttrs?: (pmMark: PmMark) => Omit<Extract<MdastNodes, { type: Type }>, "type" | "children">
): PmMarkHandler;

// Implementation: creates { type, ...getAttrs(mark), children: mdastChildren }
```

### Built-in handlers (fromProseMirror direction)

| PM node type | Behavior |
|---|---|
| `schema.topNodeType` | Returns `{ type: "root", children }` |
| `schema.nodes["text"]` | Returns `{ type: "text", value: pmNode.text }` |
| Everything else with no handler | Returns `null` (silent drop) |

### `hydrateMarks` algorithm

The `hydrateMarks` function in `fromProseMirror` handles mark grouping:

1. Takes PM child nodes with their marks
2. Partitions consecutive children that share the same outermost mark
3. For each partition:
   - Recursively processes with remaining marks (marks.slice(1))
   - Calls the mark handler with the first mark and the processed children
4. Result: properly nested mdast tree from flat PM mark arrays

## Dependency Tree

```
@handlewithcare/remark-prosemirror@0.1.5
├── @types/hast ^3.0.0
├── @types/mdast ^4.0.0
├── @types/unist ^3.0.0
├── devlop ^1.0.0
├── hast-util-from-html ^2.0.0
├── micromark-util-sanitize-uri ^2.0.0
├── trim-lines ^3.0.0
├── unist-util-is ^6.0.0
├── unist-util-visit ^5.0.0
├── zwitch ^2.0.0
└── peerDependencies:
    └── prosemirror-model ^1.24.0
```
