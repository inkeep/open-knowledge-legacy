---
title: "Evidence: Milkdown Parsing Pipeline (Markdown -> ProseMirror)"
date: 2026-04-03
type: evidence
source: packages/transformer/src/parser/state.ts
---

# Parsing Pipeline Evidence

## ParserState.create -- Factory

File: `packages/transformer/src/parser/state.ts`, lines 36-47

```typescript
static create = (schema: Schema, remark: RemarkParser): Parser => {
  const state = new this(schema)
  return (text) => {
    state.run(remark, text)
    return state.toDoc()
  }
}
```

## ParserState.run -- Entry Point

File: `packages/transformer/src/parser/state.ts`, lines 208-216

```typescript
run = (remark: RemarkParser, markdown: string) => {
  const tree = remark.runSync(
    remark.parse(markdown),
    markdown
  ) as MarkdownNode
  this.next(tree)
  return this
}
```

Key: `remark.parse()` produces raw MDAST, `remark.runSync()` applies all remark transformer plugins, then `this.next()` walks the resulting MDAST.

## ParserState.#matchTarget -- Schema Lookup

File: `packages/transformer/src/parser/state.ts`, lines 67-79

```typescript
#matchTarget = (node: MarkdownNode): NodeType | MarkType => {
  const result = Object.values({
    ...this.schema.nodes,
    ...this.schema.marks,
  }).find((x): x is NodeType | MarkType => {
    const spec = x.spec as NodeSchema | MarkSchema
    return spec.parseMarkdown.match(node)
  })
  if (!result) throw parserMatchError(node)
  return result
}
```

Critical: scans ALL registered nodes AND marks. First match wins. Unmatched MDAST nodes cause hard errors.

## ParserState.#runNode -- Dispatch

File: `packages/transformer/src/parser/state.ts`, lines 82-87

```typescript
#runNode = (node: MarkdownNode) => {
  const type = this.#matchTarget(node)
  const spec = type.spec as NodeSchema | MarkSchema
  spec.parseMarkdown.runner(this, node, type as NodeType & MarkType)
}
```

## Remark Pipeline Construction

File: `packages/core/src/internal-plugin/init.ts`, lines 44, 51-54

Initial:
```typescript
ctx.inject(remarkCtx, unified().use(remarkParse).use(remarkStringify))
```

After config:
```typescript
ctx.set(remarkCtx, unified().use(remarkParse).use(remarkStringify, options))
```

File: `packages/core/src/internal-plugin/schema.ts`, lines 56-61

Remark plugins applied:
```typescript
const processor = remarkPlugins.reduce(
  (acc, plug) => acc.use(plug.plugin, plug.options),
  remark
)
ctx.set(remarkCtx, processor)
```

## Parser Plugin Wiring

File: `packages/core/src/internal-plugin/parser.ts`, lines 38-41

```typescript
const remark = ctx.get(remarkCtx)
const schema = ctx.get(schemaCtx)
ctx.set(parserCtx, ParserState.create(schema, remark))
```
