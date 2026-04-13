---
name: handlewithcare-remark-prosemirror-source
date: 2026-04-12
sources:
  - ~/.claude/oss-repos/remark-prosemirror/ (v0.1.5, cloned 2026-04-12)
---

# Evidence: @handlewithcare/remark-prosemirror — Source-Code Analysis

## Key files (4 production files, ~550 LOC total)

- `lib/mdast-util-to-prosemirror.ts` (371 lines) — mdast→PM conversion
- `lib/mdast-util-from-prosemirror.ts` (~180 lines) — PM→mdast conversion  
- `lib/remark-prosemirror.ts` (15 lines) — unified plugin wrapper
- `index.ts` (12 lines) — re-exports

---

## Findings

### Finding: Handler registration uses a flat `Record<string, handler>` keyed on mdast node type
**Confidence:** CONFIRMED
**Evidence:** `mdast-util-to-prosemirror.ts:358-360`

```typescript
type MdastHandlers = {
  [Type in MdastNodes["type"]]?: MdastNodeHandler<Type>;
};
```

**TypeScript constraint:** Keys are constrained to the `MdastNodes` union from `@types/mdast`. Custom types like `mdxJsxFlowElement` or `wikiLink` require TypeScript module augmentation of the mdast `Nodes` type. **At runtime, any string key works** — the handlers map is spread into a `zwitch` dispatch table at line 290.

### Finding: Full bidirectional support via separate functions
**Confidence:** CONFIRMED
**Evidence:** `mdast-util-to-prosemirror.ts:371`, `mdast-util-from-prosemirror.ts:128`

- `toProseMirror(tree: MdastRoot, options) → PmNode` — mdast→PM
- `fromProseMirror(pmNode: PmNode, options) → MdastRoot` — PM→mdast

### Finding: Attribute mapping via `getAttrs` callback on helper functions
**Confidence:** CONFIRMED
**Evidence:** `mdast-util-to-prosemirror.ts:324-327`

```typescript
function toPmNode<MdastNode>(
  nodeType: NodeType,
  getAttrs?: (mdastNode: MdastNode) => Record<string, unknown> | null,
)
```

Mark equivalent at `mdast-util-to-prosemirror.ts:335-338`:
```typescript
function toPmMark<MdastNode>(
  markType: MarkType,
  getAttrs?: (mdastNode: MdastNode) => Record<string, unknown> | null,
)
```

Both receive the full mdast node — handlers have complete freedom to read any mdast field (including `data.*` populated by position-slice) and map to arbitrary PM attrs.

### Finding: Raw handler signature allows atom node creation
**Confidence:** CONFIRMED
**Evidence:** `mdast-util-to-prosemirror.ts:352-356`

```typescript
type MdastNodeHandler<Type> = (
  node: Extract<MdastNodes, { type: Type }>,
  parent: MdastParent | undefined,
  state: { all: (node: MdastParent) => PmNode[]; schema: Schema },
) => PmNode | PmNode[] | null;
```

For atom nodes: bypass `toPmNode` helper (which always calls `state.all()` for children), call `nodeType.createAndFill(attrs)` directly. No dedicated atom API but full control.

### Finding: Position and data fields are NOT stripped
**Confidence:** CONFIRMED
**Evidence:** `mdast-util-to-prosemirror.ts:245` — `handle` function passes node directly through `zwitch` dispatch. No `delete`, `omit`, destructuring-with-rest, or field stripping found anywhere in the codebase. Handlers receive the original mdast node object with `node.position` and `node.data` intact.

### Finding: Mark flattening via recursive `toPmMark` + `hydrateMarks` for reverse
**Confidence:** CONFIRMED
**Evidence:** 
- mdast→PM: `toPmMark` at line 335-343 recurses into children via `state.all(node)`, then applies mark to each child via `child.mark(mark.addToSet(child.marks))`. Marks accumulate as recursion unwinds.
- PM→mdast: `hydrateMarks` at `mdast-util-from-prosemirror.ts:76-110` reconstructs nested tree by partitioning children by first mark, peeling one mark layer per recursion via `marks.slice(1)`.

### Finding: Unknown mdast node types THROW
**Confidence:** CONFIRMED
**Evidence:** `mdast-util-to-prosemirror.ts:190-192`

```typescript
function unknown(node: unknown): PmNode {
  throw new Error(`unknown markdown node: ${(node as MdastNodes).type}`);
}
```

Some built-in types are pre-ignored: `toml`, `yaml`, `definition`, `footnoteDefinition` → `ignore` (return undefined, line 215-217).

### Finding: Native remark plugin via `this.compiler`
**Confidence:** CONFIRMED
**Evidence:** `remark-prosemirror.ts:10-15`

```typescript
const remarkProseMirror: Plugin<[Options], MdastRoot, PmNode> = function (options) {
  this.compiler = function (tree) {
    return toProseMirror(tree as MdastRoot, options);
  };
};
```

Slots into `unified().use(remarkParse).use(remarkProseMirror, { schema, handlers })`.

### Finding: Total API surface = 6 values + 2 types
**Confidence:** CONFIRMED
**Evidence:** `index.ts:1-12`

Values: `remarkProseMirror`, `toPmNode`, `toPmMark`, `fromProseMirror`, `fromPmNode`, `fromPmMark`
Types: `RemarkProseMirrorOptions`, `FromProseMirrorOptions`
