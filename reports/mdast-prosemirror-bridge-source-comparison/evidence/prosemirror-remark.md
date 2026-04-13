---
name: prosemirror-remark-source
date: 2026-04-12
sources:
  - ~/.claude/oss-repos/prosemirror-remark/ (v0.6.3, cloned 2026-04-12)
  - ~/.claude/oss-repos/prosemirror-unified/ (v0.8.4, cloned 2026-04-12)
---

# Evidence: prosemirror-remark + prosemirror-unified — Source-Code Analysis

## Key files

**prosemirror-unified (~16 files, ~800 LOC):**
- `src/NodeExtension.ts` — abstract base class for node extensions
- `src/MarkExtension.ts` — abstract base class for mark extensions
- `src/SyntaxExtension.ts` — intermediate base (has `unifiedInitializationHook`)
- `src/Extension.ts` — root base class
- `src/UnistToProseMirrorConverter.ts` — mdast→PM recursive converter
- `src/ProseMirrorToUnistConverter.ts` — PM→mdast recursive converter
- `src/ExtensionManager.ts` — classifies extensions by `instanceof`
- `src/ProseMirrorUnified.ts` — top-level orchestrator
- `src/UnifiedBuilder.ts` — constructs unified pipeline from extension hooks
- `src/createProseMirrorNode.ts` — helper for creating PM nodes

**prosemirror-remark (~24 extensions, ~1200 LOC):**
- `src/syntax-extensions/*.ts` — one extension file per markdown construct
- `src/MarkdownExtension.ts` — root extension adding remarkParse + remarkStringify
- `src/GFMExtension.ts` — composite adding GFM extensions

---

## Findings

### Finding: Registration via class instantiation, not handler maps
**Confidence:** CONFIRMED
**Evidence:** `prosemirror-unified/src/NodeExtension.ts:10-34`

Must subclass `NodeExtension<UNode>` and override 5 methods:
- `unistNodeName(): string` — the mdast type string
- `proseMirrorNodeName(): string | null`
- `proseMirrorNodeSpec(): NodeSpec | null`
- `unistNodeToProseMirrorNodes(node, schema, convertedChildren, context): PmNode[]`
- `proseMirrorNodeToUnistNodes(node, convertedChildren): UNode[]`

Register: `new ProseMirrorUnified([new MyExtension(), ...])` at `ProseMirrorUnified.ts:36`.

### Finding: Full bidirectional support
**Confidence:** CONFIRMED
**Evidence:** `ProseMirrorUnified.ts:67-81`

- `parse(source: string): ProseMirrorNode` — string→mdast→PM
- `serialize(doc: ProseMirrorNode): string` — PM→mdast→string

Internal converters: `UnistToProseMirrorConverter.convert()` at `UnistToProseMirrorConverter.ts:22-32`, `ProseMirrorToUnistConverter.convert()` at `ProseMirrorToUnistConverter.ts:13-21`.

### Finding: Attributes via explicit mapping in extension methods
**Confidence:** CONFIRMED
**Evidence:** `createProseMirrorNode.ts:6-20`

```typescript
function createProseMirrorNode(
  nodeName: string, schema: Schema, children: PmNode[], attrs: Attrs = {}
)
```

Calls `schema.nodes[nodeName].createAndFill(attrs, children)`. Examples: `HeadingExtension.ts:177-190` maps `node.depth` → `{ level: node.depth }`, `ImageExtension.ts:80-95` maps `node.url/alt/title`.

### Finding: MarkExtension base class with custom attrs support
**Confidence:** CONFIRMED
**Evidence:** `prosemirror-unified/src/MarkExtension.ts:9-24`

Required overrides: `proseMirrorMarkName()`, `proseMirrorMarkSpec()`, `processConvertedUnistNode(convertedNode, originalMark)`, `unistNodeToProseMirrorNodes()`. Custom attrs confirmed via `LinkExtension.ts:34-36` defining `attrs: { href: {}, title: { default: null } }`.

### Finding: Atom nodes work — no library restriction
**Confidence:** CONFIRMED
**Evidence:** `HorizontalRuleExtension.ts:68-74`, `BreakExtension.ts:61-62`

Both return leaf unist nodes with no children. PM-to-mdast: `convertedChildren` is empty array for atom nodes. `proseMirrorNodeSpec()` can include `atom: true`.

### Finding: Position and data fields are NOT stripped
**Confidence:** CONFIRMED
**Evidence:** `UnistToProseMirrorConverter.ts:34-61` — passes original mdast `node` directly to `extension.unistNodeToProseMirrorNodes(node, ...)`. Only structural operation: checks `"children" in node` (line 43) to recurse. No `delete`, `omit`, or field stripping found.

### Finding: Mark flattening via recursive conversion + mark.concat
**Confidence:** CONFIRMED
**Evidence:** `BoldExtension.ts:73-85` — takes already-converted children (flat PM text nodes), calls `child.mark(child.marks.concat([strongMark]))`. Marks accumulate via `concat` as recursion unwinds. Natural flattening.

### Finding: Unknown node types emit console.warn, node is DROPPED (not thrown)
**Confidence:** CONFIRMED
**Evidence:** `UnistToProseMirrorConverter.ts:57-60`

```
console.warn('Couldn't find any way to convert unist node of type "${node.type}"...')
```
Returns `[]`. Node is silently dropped. Same pattern in PM-to-mdast at `ProseMirrorToUnistConverter.ts:41-46`.

### Finding: Library wraps unified internally — NOT composable with existing pipeline
**Confidence:** CONFIRMED
**Evidence:** `UnifiedBuilder.ts:14-33` — creates a fresh `unified()` processor, then calls each extension's `unifiedInitializationHook(processor)`. You CANNOT pass an existing `unified().use(remarkParse).use(remarkGfm)` pipeline. To add remark plugins, you must create an Extension subclass that calls `processor.use(plugin)` in its hook.

### Finding: Large API surface — 7 base exports + 24 extension exports
**Confidence:** CONFIRMED
**Evidence:** `prosemirror-unified/src/index.ts` (7 exports), `prosemirror-remark/src/index.ts` (24 exports incl. types)

prosemirror-unified: `createProseMirrorNode`, `Extension`, `MarkExtension`, `MarkInputRule`, `NodeExtension`, `ProseMirrorUnified`, `SyntaxExtension`
prosemirror-remark: 20+ extensions (GFMExtension, MarkdownExtension, BoldExtension, ItalicExtension, HeadingExtension, etc.) + 3 context types
