---
title: "Evidence: Milkdown Serialization Pipeline (ProseMirror -> Markdown)"
date: 2026-04-03
type: evidence
source: packages/transformer/src/serializer/state.ts
---

# Serialization Pipeline Evidence

## SerializerState.create -- Factory

File: `packages/transformer/src/serializer/state.ts`, lines 45-51

```typescript
static create = (schema: Schema, remark: RemarkParser): Serializer => {
  const state = new this(schema)
  return (content: Node) => {
    state.run(content)
    return state.toString(remark)
  }
}
```

## SerializerState.run -- Walks ProseMirror Tree

File: `packages/transformer/src/serializer/state.ts`, lines 350-353

```typescript
run = (tree: Node) => {
  this.next(tree)
  return this
}
```

## SerializerState.#runNode -- Mark-First Dispatch

File: `packages/transformer/src/serializer/state.ts`, lines 89-97

```typescript
#runNode = (node: Node) => {
  const { marks } = node
  const getPriority = (x: Mark) => x.type.spec.priority ?? 50
  const tmp = [...marks].sort((a, b) => getPriority(a) - getPriority(b))
  const unPreventNext = tmp.every((mark) => !this.#runProseMark(mark, node))
  if (unPreventNext) this.#runProseNode(node)
  marks.forEach((mark) => this.#closeMark(mark))
}
```

Key: Marks are processed BEFORE the node. Mark runners can return `true` to prevent the node runner from executing (used for marks that fully handle their content).

## SerializerState.toString -- Remark Stringify

File: `packages/transformer/src/serializer/state.ts`, lines 346-347

```typescript
override toString = (remark: RemarkParser): string =>
  remark.stringify(this.build() as Root)
```

The `build()` method closes all stack elements and returns the complete MDAST tree. Then `remark.stringify()` converts MDAST to markdown string using remark-stringify (with custom handlers).

## SerializerState.#moveSpaces -- Mark Space Normalization

File: `packages/transformer/src/serializer/state.ts`, lines 183-232

When closing a mark (trim=true), leading/trailing spaces in the mark's text children are extracted and re-inserted as adjacent text nodes outside the mark. This prevents invalid markdown like `** bold **` and produces ` **bold** ` instead.

## Custom Stringify Handlers

File: `packages/core/src/__internal__/remark-handlers.ts`

```typescript
export const remarkHandlers: Required<Options>['handlers'] = {
  text: (node, _, state, info) => {
    const value = node.value
    if (/^[^*_\\]*\s+$/.test(value)) {
      return value  // Preserve trailing spaces
    }
    return state.safe(value, { ...info, encode: [] })
  },
  strong: (node, _, state, info) => {
    const marker = node.marker || state.options.strong || '*'
    // Uses the per-node marker attribute
    // ...
  },
  emphasis: (node, _, state, info) => {
    const marker = node.marker || state.options.emphasis || '*'
    // Uses the per-node marker attribute
    // ...
  },
}
```

## Serializer Plugin Wiring

File: `packages/core/src/internal-plugin/serializer.ts`, lines 38-41

```typescript
const remark = ctx.get(remarkCtx)
const schema = ctx.get(schemaCtx)
ctx.set(serializerCtx, SerializerState.create(schema, remark))
```

## Listener Plugin -- How Serialization Is Triggered

File: `packages/plugins/plugin-listener/src/index.ts`, lines 175-179

```typescript
if (listeners.markdownUpdated.length > 0 && prevDoc && !prevDoc.eq(doc)) {
  const markdown = serializer(doc)
  listeners.markdownUpdated.forEach((fn) => {
    fn(ctx, markdown, prevMarkdown!)
  })
```

Serialization only happens on-demand: when a listener subscribes to `markdownUpdated`, the serializer runs on every document change (debounced 200ms).
