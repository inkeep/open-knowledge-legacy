---
title: "Evidence: Extension API and MDX Feasibility"
date: 2026-04-03
type: evidence
sources:
  - packages/utils/src/composable/composed/$node-schema.ts
  - packages/utils/src/composable/composed/$remark.ts
  - packages/plugins/preset-gfm/src/plugin/remark-gfm-plugin.ts
  - https://github.com/orgs/Milkdown/discussions/772
---

# Extension API and MDX Feasibility Evidence

## $nodeSchema Utility

File: `packages/utils/src/composable/composed/$node-schema.ts`

```typescript
export function $nodeSchema<T extends string>(
  id: T,
  schema: GetNodeSchema
): $NodeSchema<T> {
  const schemaCtx = $ctx(schema, id)
  const nodeSchema = $node(id, (ctx) => {
    const userSchema = ctx.get(schemaCtx.key)
    return userSchema(ctx)
  })
  // ... result composition with extendSchema support
}
```

Each schema returned from the factory must implement `NodeSchema` which extends ProseMirror's `NodeSpec` with:
- `parseMarkdown: { match, runner }` -- MDAST node type matching + ProseMirror node construction
- `toMarkdown: { match, runner }` -- ProseMirror node matching + MDAST node construction

## $remark Utility

File: `packages/utils/src/composable/composed/$remark.ts`

```typescript
export function $remark<Id extends string, Options>(
  id: Id,
  remark: (ctx: Ctx) => RemarkPluginRaw<Options>,
  initialOptions?: Options
): $Remark<Id, Options> {
  const options = $ctx<Options, Id>(initialOptions ?? ({} as Options), id)
  const plugin: MilkdownPlugin = (ctx) => async () => {
    await ctx.wait(InitReady)
    const re = remark(ctx)
    const remarkPlugin: RemarkPlugin<Options> = {
      plugin: re,
      options: ctx.get(options.key),
    }
    ctx.update(remarkPluginsCtx, (rp) => [...rp, remarkPlugin as RemarkPlugin])
    // cleanup removes from array
  }
  // ...
}
```

## GFM as Extension Template

File: `packages/plugins/preset-gfm/src/plugin/remark-gfm-plugin.ts`

```typescript
import remarkGFM from 'remark-gfm'
export const remarkGFMPlugin = $remark('remarkGFM', () => remarkGFM)
```

File: `packages/plugins/preset-gfm/package.json`
```json
"dependencies": {
  "remark-gfm": "^4.0.1"
}
```

The GFM preset demonstrates the complete pattern:
1. Wrap the remark plugin with `$remark()`
2. Define `$nodeSchema` for each new MDAST node type
3. Register both as Milkdown plugins via `editor.use()`

## GitHub Discussion #772: remark-mdx Attempt

URL: https://github.com/orgs/Milkdown/discussions/772

### What Was Attempted
User Leo Petrucci tried adding `remark-mdx` to the remark plugins array to detect MDX components in the editor.

### What Worked
- remark-mdx successfully parses MDX syntax into MDAST nodes
- After removing `filterHTMLPlugin`, HTML/JSX content reached the parser

### What Blocked
- No ProseMirror node schemas exist for MDX MDAST types:
  - `mdxJsxFlowElement`
  - `mdxJsxTextElement`
  - `mdxjsEsm`
  - `mdxFlowExpression`
  - `mdxTextExpression`
- The parser throws `parserMatchError` for unhandled MDAST node types
- Attempting to treat MDX components as paragraphs lost their identity on serialization

### Maintainer Response
The discussion indicates awareness but no concrete implementation plan for MDX support.

## HTML Node Schema (Current Limitation)

File: `packages/plugins/preset-commonmark/src/node/html.ts`

```typescript
export const htmlSchema = $nodeSchema('html', (ctx) => {
  return {
    atom: true,        // NOT editable
    group: 'inline',   // Inline only
    inline: true,
    attrs: {
      value: { default: '', validate: 'string' },
    },
    parseMarkdown: {
      match: ({ type }) => Boolean(type === 'html'),
      runner: (state, node, type) => {
        state.addNode(type, { value: node.value as string })
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'html',
      runner: (state, node) => {
        state.addNode('html', undefined, node.attrs.value)
      },
    },
  }
})
```

HTML is stored as an opaque string in an atom (non-editable) inline node. This pattern could be adapted for simple MDX support (store component as string), but would not support rich editing of component children.

## remarkHtmlTransformer -- The Blocker

File: `packages/plugins/preset-commonmark/src/plugin/remark-html-transformer.ts`

```typescript
/// This plugin should be deprecated after we support HTML.
export const remarkHtmlTransformer = $remark(
  'remarkHTMLTransformer',
  () => () => (tree: Node) => {
    flatMapWithDepth(tree, (node, _index, parent) => {
      if (!isHTML(node)) return [node]
      if (parent && BLOCK_CONTAINER_TYPES.includes(parent.type)) {
        node.children = [{ ...node }]
        delete node.value
        ;(node as { type: string }).type = 'paragraph'
      }
      return [node]
    })
  }
)
```

This wraps block-level HTML in paragraphs. For MDX support, this would need to be disabled or modified to skip MDX node types, since MDX elements should not be wrapped in paragraphs.

## What MDX Integration Would Require

### Minimal (Opaque Components)

1. `$remark('remarkMdx', () => remarkMdx)` -- add remark-mdx to pipeline
2. `$nodeSchema('mdx_jsx_flow', ...)` -- block JSX as atom node (like current HTML)
3. `$nodeSchema('mdx_jsx_text', ...)` -- inline JSX as atom node
4. `$nodeSchema('mdx_esm', ...)` -- import/export as atom node
5. Remove `remarkHtmlTransformer` from plugin list
6. Store full JSX/expression text as string attribute for round-trip

### Full (Editable Component Children)

All of the above, plus:
7. Container nodes for JSX elements with children (`content: 'block+'`)
8. Attribute editing UI (component props)
9. Custom serializer that reconstructs JSX attribute syntax
10. Handle self-closing vs wrapping elements
11. Validate that ProseMirror content model matches MDX component expectations
