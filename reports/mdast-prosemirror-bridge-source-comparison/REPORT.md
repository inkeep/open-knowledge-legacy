---
title: "mdast↔ProseMirror Bridge Library Source-Code Comparison"
description: "Source-code-level comparison of @handlewithcare/remark-prosemirror (v0.1.5) vs prosemirror-remark (v0.6.3) + prosemirror-unified (v0.8.4) for a greenfield ProseMirror-based CRDT markdown editor migration. Evaluates 10 dimensions: handler API, bidirectional support, attribute preservation, mark handling, atom nodes, position/data passthrough, inline content model, error handling, unified pipeline integration, and API surface."
createdAt: 2026-04-12
updatedAt: 2026-04-12
subjects:
  - "@handlewithcare/remark-prosemirror"
  - "prosemirror-remark"
  - "prosemirror-unified"
topics:
  - mdast ProseMirror bridge
  - source-text fidelity
  - remark pipeline integration
---

# mdast↔ProseMirror Bridge Library Source-Code Comparison

**Purpose:** Verify at source-code level whether `@handlewithcare/remark-prosemirror` (D1 in our migration spec) actually supports all 10 requirements for our mdast↔ProseMirror bridge, and whether `prosemirror-remark` would be a better fit.

---

## Executive Summary

Both libraries are **fully capable** of handling our requirements. Both support bidirectional conversion, custom node/mark types, arbitrary PM attributes, atom nodes, and preserve mdast `position`/`data` fields. The decisive differences are architectural:

1. **Pipeline composability:** `@handlewithcare` is a native remark plugin (`.use(remarkProseMirror, { schema, handlers })`). `prosemirror-remark` **wraps unified internally** — you cannot compose it with an existing `unified().use(remarkParse).use(remarkGfm).use(remarkMdx)` chain. This is a **hard disqualifier** for our architecture, where the pipeline is the integration seam.

2. **API ergonomics:** `@handlewithcare` uses flat handler functions (one function per mdast type, ~5 lines each). `prosemirror-remark` requires subclassing `NodeExtension`/`MarkExtension` (one class per type, 5 mandatory method overrides, ~30-50 lines each). For ~40-45 handlers, this is the difference between ~200-300 LOC and ~1200-2000 LOC of boilerplate.

3. **Error handling philosophy:** `@handlewithcare` **throws** on unknown mdast types (fail-fast). `prosemirror-remark` **warns and drops** (fail-silent). For source-text fidelity where silently losing nodes is data corruption, fail-fast is correct.

4. **One real concern with `@handlewithcare`:** The TypeScript type constraint on handler keys is limited to standard mdast `Nodes` union. Custom types (`mdxJsxFlowElement`, `wikiLink`, `containerDirective`) require module augmentation. This is the standard mdast pattern but adds a setup step.

**Verdict:** D1 confirmed. `@handlewithcare/remark-prosemirror` is the correct choice for our architecture.

---

## Side-by-Side Comparison

| # | Dimension | @handlewithcare/remark-prosemirror | prosemirror-remark + prosemirror-unified |
|---|---|---|---|
| **1** | **Handler registration** | Flat `Record<string, handler>` keyed on mdast type. TS keys constrained to `MdastNodes["type"]` — custom types need module augmentation. **Runtime: any string key works.** (`mdast-util-to-prosemirror.ts:358`) | Subclass `NodeExtension` or `MarkExtension`. Override `unistNodeName()` returning any string. 5 mandatory method overrides per extension. (`NodeExtension.ts:10-34`) |
| **2** | **Bidirectional** | **Yes.** `toProseMirror(tree, opts) → PmNode` + `fromProseMirror(pmNode, opts) → MdastRoot`. Separate functions, separate handler maps. (`to:371`, `from:128`) | **Yes.** `parse(source) → PmNode` + `serialize(doc) → string`. Each extension defines both directions in one class. (`ProseMirrorUnified.ts:67-81`) |
| **3** | **Attribute mapping** | `getAttrs` callback on `toPmNode`/`toPmMark` helpers. Receives full mdast node, returns `Record<string, unknown>`. Raw handler has full control. (`to:324-327`) | `createProseMirrorNode(name, schema, children, attrs)` helper. Attrs set manually in `unistNodeToProseMirrorNodes()` override. (`createProseMirrorNode.ts:6-20`) |
| **4** | **Mark handling** | `toPmMark(markType, getAttrs)` helper. Mark handlers go in the same `handlers` map as nodes. Custom attrs: yes (`test:134` shows link attrs). Reverse: `hydrateMarks` reconstructs nested tree. (`to:335-338`, `from:76-110`) | `MarkExtension` base class. `processConvertedUnistNode()` for PM→mdast, `unistNodeToProseMirrorNodes()` for mdast→PM. Custom attrs: yes (`LinkExtension.ts:34-36`). |
| **5** | **Atom nodes** | Raw handler bypasses `toPmNode` helper, calls `nodeType.createAndFill(attrs)` directly. No dedicated atom API but full control. (`to:352-356`) | `proseMirrorNodeSpec()` can include `atom: true`. `convertedChildren` is empty array for atoms. (`HorizontalRuleExtension.ts:68-74`) |
| **6** | **Position/data passthrough** | **Preserved.** No stripping found. Handler receives original mdast node with `position` and `data` intact. (`to:245`) | **Preserved.** No stripping found. Extension receives original mdast node with all fields. (`UnistToProseMirrorConverter.ts:34-61`) |
| **7** | **Inline model (mark flattening)** | `toPmMark` recurses children via `state.all()`, applies mark via `child.mark(mark.addToSet(child.marks))`. Reverse: `hydrateMarks` partitions by first mark, peels layers recursively. | `unistNodeToProseMirrorNodes()` receives already-converted children, adds marks via `child.mark(child.marks.concat([mark]))`. Natural recursion flattening. |
| **8** | **Error handling (unknown type)** | **Throws:** `throw new Error("unknown markdown node: ${type}")` (`to:190-192`). Some built-in types pre-ignored: `toml`, `yaml`, `definition`, `footnoteDefinition`. | **Warns + drops:** `console.warn(...)`, returns `[]`. Node silently disappears. (`UnistToProseMirrorConverter.ts:57-60`) |
| **9** | **Pipeline integration** | **Native remark plugin.** `unified().use(remarkProseMirror, { schema, handlers })`. Sets `this.compiler`. (`remark-prosemirror.ts:10-15`) | **Wraps unified internally.** `UnifiedBuilder.build()` creates fresh `unified()` from extension hooks. **Cannot compose with existing pipeline.** (`UnifiedBuilder.ts:14-33`) |
| **10** | **API surface** | **8 exports** (6 values + 2 types): `remarkProseMirror`, `toPmNode`, `toPmMark`, `fromProseMirror`, `fromPmNode`, `fromPmMark`, + 2 option types. | **31 exports** (7 base + 24 extensions): `ProseMirrorUnified`, `NodeExtension`, `MarkExtension`, `SyntaxExtension`, `Extension`, `createProseMirrorNode`, `MarkInputRule`, + 20 extension classes + 3 context types. |

---

## Critical Finding: Pipeline Integration Incompatibility

prosemirror-remark's `UnifiedBuilder` constructs its own unified pipeline via extension hooks:

```typescript
// UnifiedBuilder.ts:14-33
public build(): Processor {
  let processor: Processor = unified();
  for (const extension of this.extensions) {
    extension.unifiedInitializationHook(processor);
  }
  return processor;
}
```

Our migration architecture requires composing remark plugins in a specific order:

```typescript
unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter)
  .use(remarkMdx)          // MDX support (D13 sprint goal)
  .use(remarkDirective)    // D12: registered day one
  .use(wikiLinkPlugin)     // custom micromark extension
  .use(positionSliceWalker) // R5: delimiter recovery
  .use(remarkProseMirror, { schema, handlers })  // bridge
```

With prosemirror-remark, each of these would need to be wrapped in an Extension subclass with `unifiedInitializationHook()`. But worse: the library creates a **fresh** `unified()` processor — we can't inject our existing pipeline. The hooks model means plugin ordering is determined by extension registration order, not explicit `.use()` chaining.

This makes prosemirror-remark architecturally incompatible with our pipeline-first design.

---

## Handler Boilerplate Comparison

For a typical node (heading):

**@handlewithcare (~5 LOC):**
```typescript
heading: toPmNode(schema.nodes.heading!, (node) => ({
  level: node.depth,
  sourceStyle: node.data?.sourceStyle ?? 'atx',
}))
```

**prosemirror-remark (~50 LOC):**
```typescript
class HeadingExtension extends NodeExtension<Heading> {
  unistNodeName() { return "heading"; }
  proseMirrorNodeName() { return "heading"; }
  proseMirrorNodeSpec() {
    return { content: "inline*", group: "block", attrs: { level: { default: 1 }, sourceStyle: { default: 'atx' } } };
  }
  unistNodeToProseMirrorNodes(node, schema, children) {
    return [createProseMirrorNode("heading", schema, children, { level: node.depth, sourceStyle: node.data?.sourceStyle ?? 'atx' })];
  }
  proseMirrorNodeToUnistNodes(node, children) {
    return [{ type: "heading", depth: node.attrs.level, children }];
  }
}
```

For ~40-45 handlers, this compounds to **~200-300 LOC** (handlewithcare) vs **~1200-2000 LOC** (prosemirror-remark).

---

## One Concern: TypeScript Module Augmentation for Custom Types

The handler map type constrains keys to `MdastNodes["type"]` from `@types/mdast`. To register handlers for `mdxJsxFlowElement`, `wikiLink`, `containerDirective`, etc., we need:

```typescript
declare module 'mdast' {
  interface RootContentMap {
    mdxJsxFlowElement: MdxJsxFlowElement;
    wikiLink: WikiLinkNode;
    containerDirective: ContainerDirective;
    // ...
  }
}
```

This is the **standard mdast pattern** (remark-mdx, remark-directive, remark-frontmatter all document it). It's a one-time setup, not an ongoing burden. At runtime, any string key works regardless.

---

## Limitations

- Analysis based on cloned source at v0.1.5 (remark-prosemirror) and v0.6.3/v0.8.4 (prosemirror-remark/unified).
- No runtime testing performed — analysis is source-code-only.
- prosemirror-remark's extension hooks model may be more flexible than assessed here for non-remark unified processors (rehype, retext).

---

## References

### Evidence Files
- [evidence/handlewithcare-remark-prosemirror.md](evidence/handlewithcare-remark-prosemirror.md) — full source analysis with file:line citations
- [evidence/prosemirror-remark.md](evidence/prosemirror-remark.md) — full source analysis with file:line citations

### Source Repos
- [@handlewithcare/remark-prosemirror](https://github.com/handlewithcarecollective/remark-prosemirror) — v0.1.5
- [prosemirror-remark](https://github.com/marekdedic/prosemirror-remark) — v0.6.3
- [prosemirror-unified](https://github.com/marekdedic/prosemirror-unified) — v0.8.4
