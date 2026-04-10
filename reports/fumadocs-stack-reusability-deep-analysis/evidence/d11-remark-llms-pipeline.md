# Evidence: D11 — remark-llms Pipeline (MDX-to-Markdown, Content Negotiation, llms.txt)

**Dimension:** remark-llms pipeline — MDX-to-Markdown conversion, content negotiation, llms.txt generation
**Date:** 2026-04-05
**Sources:** fumadocs monorepo (packages/core/src/mdx-plugins/remark-llms.ts, stringifier.ts, remark-llms.runtime.ts, utils.ts; packages/core/src/negotiation/index.ts; packages/core/src/source/loader/llms.ts; packages/core/test/negotiation.test.ts, mdx-plugins.test.ts; packages/mdx/src/loaders/mdx/remark-postprocess.ts; apps/docs/proxy.ts; apps/docs/content/docs/(framework)/integrations/llms.mdx)

---

## Key files referenced

- `packages/core/src/mdx-plugins/remark-llms.ts` (130 lines) — The remark plugin: MDX AST to clean Markdown
- `packages/core/src/mdx-plugins/stringifier.ts` (201 lines) — Core AST-to-Markdown engine shared by remarkLLMs and remarkStructure
- `packages/core/src/mdx-plugins/remark-llms.runtime.ts` (44 lines) — Runtime placeholder renderer
- `packages/core/src/mdx-plugins/utils.ts` (60 lines) — MDX ESM export injection helpers
- `packages/core/src/negotiation/index.ts` (46 lines) — isMarkdownPreferred + rewritePath
- `packages/core/src/source/loader/llms.ts` (100 lines) — llms.txt index generator from PageTree
- `packages/core/src/page-tree/definitions.ts` (67 lines) — PageTree types (Root, Node, Item, Folder, Separator)
- `packages/core/test/negotiation.test.ts` (49 lines) — Tests for isMarkdownPreferred and rewritePath
- `packages/core/test/mdx-plugins.test.ts` (lines 172-195) — Tests for remarkLLMs + placeholder round-trip
- `packages/mdx/src/loaders/mdx/remark-postprocess.ts` (161 lines) — Integration point: how remarkLLMs is invoked during MDX compilation
- `apps/docs/proxy.ts` (22 lines) — Production content negotiation middleware (Next.js)

---

## Findings

### Finding: remarkLLMs is a 3-layer architecture — plugin, stringifier, runtime
**Confidence:** CONFIRMED
**Evidence:** remark-llms.ts lines 60-107, stringifier.ts lines 91-200, remark-llms.runtime.ts lines 1-43

The pipeline has three separable layers:

**Layer 1 — remarkLLMs plugin** (remark-llms.ts, 130 lines): A remark transformer that takes an MDX AST (Root node), converts it to clean Markdown via the stringifier, and injects the result as an ESM export (`_markdown`) into the AST. The plugin itself is thin — it configures the stringifier with LLM-specific defaults and delegates all conversion work.

```typescript
export function remarkLLMs(this: Processor, { as = '_markdown', headingIds = true, _data = false, mdxAsPlaceholder, ...rest }: LLMsOptions = {}): Transformer<Root, Root> {
  const stringifier = defaultStringifier({
    ...rest,
    filterElement(node) {
      switch (node.type) { case 'mdxjsEsm': return false; default: return true; }
    },
    stringify(node, parent, state, info, ctx) {
      if (mdxAsPlaceholder) {
        switch (node.type) {
          case 'mdxJsxFlowElement': case 'mdxJsxTextElement':
            if (node.name && mdxAsPlaceholder.includes(node.name))
              return placeholder(node, parent, state, info);
        }
      }
      return rest.stringify?.(node, parent, state, info, ctx);
    },
    handlers: {
      heading(node: Heading, _p, state, info) {
        const id = node.data?.hProperties?.id;
        const content = state.containerPhrasing(node, info);
        return headingIds && id ? `${content} [#${id}]` : content;
      },
      ...rest.handlers,
    },
  });
  return (node, file) => {
    const value = stringifier.call(this, node, undefined);
    node.children.unshift(toMdxExport(as, value));
    if (_data) file.data.markdown = value;
  };
}
```

Key behaviors:
- Strips `mdxjsEsm` nodes (import/export statements) via `filterElement`
- Preserves heading IDs in `[#id]` suffix format for LLM anchor references
- Supports `mdxAsPlaceholder` for named MDX components that should be serialized as JSON tokens
- Outputs result as an ESM export named `_markdown` (configurable via `as`)
- The `_data` flag also stores result on `file.data.markdown` for in-pipeline access

**Layer 2 — stringifier** (stringifier.ts, 201 lines): The core conversion engine. `defaultStringifier()` returns a function that wraps `mdast-util-to-markdown` with three extension mechanisms:

1. **filterElement**: Per-node visibility control returning `true` (include), `false` (exclude), or `'children-only'` (unwrap: keep children, drop the wrapper). Default behavior: `File`, `TypeTable`, `Callout`, `Card` are included with attributes; all other MDX JSX elements are unwrapped to children-only.
2. **filterMdxAttributes**: Per-attribute filtering on MDX JSX elements. Expression attributes are always skipped. String attributes pass through unless filtered.
3. **stringify callback**: Custom per-node override — return a string to replace the default handler, or undefined to fall through.

The internal `modHandler` function wraps every handler with the filter chain. The `_custom` root handler bootstraps the context system — it intercepts the root call, wraps all handlers with the mod chain, then delegates.

```typescript
function modHandler(handler: Handle, ctx: Context): Handle {
  return function (node: Nodes, parent, state, info) {
    let visibility = filterElement(node);
    if (visibility === false) return '';
    if (stringify) { const v = stringify(node, parent, state, info, ctx); if (v) return v; }
    const extraInfo = node.data?._stringify;
    if (extraInfo) { /* handle children-only, text override, node replacement */ }
    if (visibility === 'children-only') { /* unwrap: containerPhrasing or containerFlow */ }
    // For MDX JSX elements: filter attributes, stringify remaining
    switch (node.type) {
      case 'mdxJsxFlowElement': case 'mdxJsxTextElement': { /* filter attrs, delegate */ }
      default: return handler(node, parent, state, info);
    }
  };
}
```

Edge cases handled:
- `node.data._stringify` allows nodes to declare how they should be stringified: `'children-only'`, `{ text: '...' }` (literal text), or `{ node: ... }` (replace with different node)
- MDX JSX text elements use `containerPhrasing` (inline), flow elements use `containerFlow` (block)
- Expression attributes (`{ ...props }`) are silently dropped — only named string attributes survive

**Layer 3 — runtime** (remark-llms.runtime.ts, 44 lines): `renderPlaceholder()` is an async function that finds NUL-delimited JSON tokens in the stringified markdown and replaces them with custom renderer output.

```typescript
const regex = /\0(.+?)\0/gs;
export async function renderPlaceholder(text: string, renderers: Record<string, (data: PlaceholderData) => Awaitable<string>>): Promise<string> {
  // For each \0{json}\0 match: parse JSON, find renderer by name, call renderer, replace token
  // Recursively processes children before rendering parent (nested placeholders)
}
```

The PlaceholderData interface: `{ name: string | null, attributes: Record<string, unknown>, children: string }`.

**Implications:** Each layer is independently importable and testable. The stringifier is the highest-value piece — it's the engine that makes MDX-to-Markdown work. The plugin is configuration on top. The runtime is optional (only needed if using placeholders).


### Finding: The stringifier has zero Fumadocs type coupling
**Confidence:** CONFIRMED
**Evidence:** stringifier.ts imports only mdast-util-mdx types and mdast-util-to-markdown

```typescript
import type { Nodes, Parents } from 'mdast';
import { type MdxJsxFlowElement, type MdxJsxTextElement, type MdxJsxAttribute, type MdxJsxExpressionAttribute, mdxToMarkdown } from 'mdast-util-mdx';
import { type Handle, type Options, toMarkdown, type Info, type State } from 'mdast-util-to-markdown';
import type { Processor } from 'unified';
```

No imports from `@/` paths (Fumadocs internals). No React dependency. No framework dependency. The only declared module augmentation is `mdast.Data._stringify` — a convenience, not a hard coupling.

**Implications:** The stringifier can be imported from `fumadocs-core/mdx-plugins` and used in any remark/unified pipeline without pulling Fumadocs framework code.


### Finding: remarkLLMs integrates into the MDX build via remarkPostprocess
**Confidence:** CONFIRMED
**Evidence:** remark-postprocess.ts lines 88-94

```typescript
if (includeProcessedMarkdown) {
  const llms = remarkLLMs.call(this, typeof includeProcessedMarkdown === 'object' ? includeProcessedMarkdown : undefined);
  llms(tree, file, () => undefined);
}
```

When `includeProcessedMarkdown` is set in the collection config, the MDX postprocessor calls `remarkLLMs` directly (not as a plugin in the pipeline — as a function called at postprocess time). The result is injected as an ESM export `_markdown` and made available via `page.data.getText('processed')`.

This means the stringified Markdown is computed at build time and stored alongside the compiled MDX. The `llms-full.txt` endpoint concatenates all pages' processed markdown; the `.mdx` endpoint serves individual pages' processed markdown.

**Implications:** For our product, we would call `remarkLLMs` at publish time (S-L2) to generate the clean Markdown for each page. This is a build-time cost, not a runtime cost.


### Finding: Content negotiation is 3 standalone functions with 2 npm dependencies
**Confidence:** CONFIRMED
**Evidence:** negotiation/index.ts lines 1-46

The negotiation module exports exactly three functions:

1. **getNegotiator(request)** (lines 4-10): Converts a standard `Request` object to a `Negotiator` instance by extracting headers. Uses the `negotiator` npm package.

2. **rewritePath(source, destination)** (lines 21-33): Creates a URL rewriter using `path-to-regexp`'s `match` and `compile`. Returns `{ rewrite(pathname): string | false }`. Pure function, framework-agnostic.

3. **isMarkdownPreferred(request, options?)** (lines 35-46): Checks if the Accept header includes markdown media types. Default media types: `['text/plain', 'text/markdown', 'text/x-markdown']`. Returns boolean.

```typescript
export function isMarkdownPreferred(request: Request, options?) {
  const { markdownMediaTypes = ['text/plain', 'text/markdown', 'text/x-markdown'] } = options ?? {};
  const mediaTypes = getNegotiator(request).mediaTypes();
  return markdownMediaTypes.some((type) => mediaTypes.includes(type));
}
```

Dependencies: `negotiator` (npm), `path-to-regexp` (npm). Zero Fumadocs imports.

**Implications:** `isMarkdownPreferred` and `rewritePath` are fully standalone. They could be imported from `fumadocs-core/negotiation` or trivially reimplemented (combined: ~30 lines without the npm packages, or ~15 lines with them).


### Finding: isMarkdownPreferred has a semantic gap — it checks presence, not preference
**Confidence:** INFERRED
**Evidence:** negotiation/index.ts line 44, negotiation.test.ts lines 4-36

The function name says "preferred" but the implementation checks `.includes()` — whether the markdown type appears anywhere in the Accept list, regardless of quality weight. From the test:

```typescript
test('html', () => {
  const result = isMarkdownPreferred(new Request('https://example.com', {
    headers: { Accept: 'text/html, application/xhtml+xml, application/xml;q=0.9, image/webp, */*;q=0.8' },
  }));
  expect(result).toBe(false);
});
```

This works because `*/*;q=0.8` is a wildcard, not a specific markdown type. But an Accept header like `text/html, text/markdown;q=0.1` would return `true` even though HTML is strongly preferred over Markdown. The `negotiator` package returns mediaTypes in preference order, but the code doesn't check ordering — it checks inclusion via `.some()`.

In practice this is fine because real AI agents send `text/markdown` or `text/plain` as their primary Accept type, not as a low-weight fallback. But for correct implementation, the function should check if markdown is the *preferred* type (first in the list) rather than merely present.

**Implications:** If we copy this function, we should consider tightening it: either check `mediaTypes()[0]` or use `negotiator.mediaType(['text/markdown', 'text/html'])` to get the truly preferred type.


### Finding: rewritePath uses path-to-regexp v8+ syntax for .mdx endpoint routing
**Confidence:** CONFIRMED
**Evidence:** negotiation.test.ts lines 38-49, apps/docs/proxy.ts lines 4-5

```typescript
test('rewrite paths', () => {
  const { rewrite } = rewritePath('/docs/*path.mdx', '/llms.txt/*path');
  expect(rewrite('/docs/index.mdx')).toMatchInlineSnapshot(`"/llms.txt/index"`);
  expect(rewrite('/docs/nested/folder/hello-world.mdx')).toMatchInlineSnapshot(`"/llms.txt/nested/folder/hello-world"`);
});
```

Production usage from `apps/docs/proxy.ts`:
```typescript
const { rewrite: rewriteLLM } = rewritePath('/docs/*path', '/llms.mdx/*path');
const { rewrite: rewriteMdx } = rewritePath('/docs{/*path}.mdx', '/llms.mdx{/*path}');
```

This implements two routing strategies:
1. Accept-header negotiation: `/docs/foo` with `Accept: text/markdown` -> rewritten to `/llms.mdx/foo`
2. Extension-based: `/docs/foo.mdx` -> rewritten to `/llms.mdx/foo`

**Implications:** The rewritePath utility is generic enough to use in any framework. For Vite, the same patterns work in a middleware function. The `.mdx` extension convention is a good pattern for our publishing layer.


### Finding: llms() generator walks a typed PageTree with 3 node types
**Confidence:** CONFIRMED
**Evidence:** llms.ts lines 14-93, page-tree/definitions.ts lines 1-67

The `llms()` function takes a `LoaderOutput` and produces an `{ index(): string }` object. The `index()` method walks `loader.getPageTree()` recursively:

```typescript
function onNode(node: PageTree.Node, indent: number) {
  switch (node.type) {
    case 'page':    // -> "- [Title](url): description"
    case 'folder':  // -> "- Folder name: description\n" + recurse children
    case 'separator': // -> "- **Section name**\n\n" (visual break)
  }
}
```

The PageTree types (from definitions.ts) use `ReactNode` for `name` and `description` fields. The llms generator handles this by checking `typeof node.name === 'string'` and falling back to `loader.getNodePage()` to extract the title from page data.

Coupling points to LoaderOutput:
- `loader.getPageTree(lang?)` — gets the page tree
- `loader.getNodePage(node, lang?)` — resolves page data from a tree node
- `loader._i18n` — checks for i18n configuration

The output format is a simple indented markdown list with `[Title](url): description` for pages and nested entries for folders.

**Implications:** The output format is trivially replicable from any flat page list (~30-40 lines). The value of the `llms()` function is in handling the hierarchical PageTree + i18n, which we don't need at P0. Build our own from a flat page inventory.


### Finding: The full llms.txt content delivery system has 4 endpoints
**Confidence:** CONFIRMED
**Evidence:** apps/docs/content/docs/(framework)/integrations/llms.mdx lines 1-350

Fumadocs documents 4 endpoint types for LLM content delivery:

1. **`/llms.txt`** — Page tree index generated by `llms(source).index()`. Lists all pages with URLs and descriptions.
2. **`/llms-full.txt`** — Full content dump: `source.getPages().map(getLLMText)` joined with `\n\n`. Each page is `# Title (url)\n\n{processed markdown}`.
3. **`/docs/:path.mdx`** — Per-page MDX/Markdown endpoint. Serves individual page content via `getLLMText(page)`.
4. **Accept-header negotiation** — Middleware that rewrites `/docs/:path` to `/llms.mdx/docs/:path` when `isMarkdownPreferred(request)` is true.

The `getLLMText` function pattern:
```typescript
async function getLLMText(page) {
  const processed = await page.data.getText('processed');
  return `# ${page.data.title} (${page.url})\n\n${processed}`;
}
```

`getText('processed')` returns the `_markdown` export from remarkLLMs. This is lazy-loaded — the MDX module is imported and the export extracted on demand.

**Implications:** For S-L2, we need all 4 endpoints. The patterns are simple and framework-agnostic (standard Request/Response). The only Fumadocs-coupled part is `getText('processed')` — we would call remarkLLMs at build time and store the result ourselves.


### Finding: The placeholder system enables component-aware Markdown for LLMs
**Confidence:** CONFIRMED
**Evidence:** remark-llms.ts lines 112-129 (placeholder function), remark-llms.runtime.ts lines 12-43 (renderPlaceholder), test/mdx-plugins.test.ts lines 172-195

The placeholder system is the most novel part of the pipeline. It solves a real problem: MDX components like `<Callout type="tip">Important!</Callout>` contain semantic information that would be lost if you just strip the tags.

Serialization (build time): The `placeholder()` function serializes an MDX JSX element as a NUL-delimited JSON token: `\0{"name":"Callout","attributes":{"type":"tip"},"children":"Important!"}\0`. NUL bytes ensure no collision with actual content.

Deserialization (runtime): `renderPlaceholder(markdown, renderers)` finds these tokens and calls the appropriate renderer. Renderers are async — they can fetch data, compute values, etc.

Test demonstrates the round-trip:
```typescript
const result = await remark().use(remarkMdx).use(remarkLLMs, {
  _data: true,
  stringify(node, parent, state, info) {
    if (node.type === 'mdxJsxFlowElement' && node.name === 'MyPage')
      return placeholder(node, parent, state, info);
  },
}).process(content);

const markdown = result.data.markdown;
const rendered = await renderPlaceholder(markdown, {
  async MyPage({ attributes, children }) {
    return `title: ${attributes.title}, children: ${children}`;
  },
});
```

Input: `<MyPage title="test">Hello \`world\`.</MyPage>`
After stringification: `\0{"name":"MyPage","children":"Hello \`world\`.<Leaf />...","attributes":{"title":"test"}}\0`
After rendering: `title: test, children: Hello \`world\`.<Leaf />...`

Nested placeholders are supported — `renderPlaceholder` recursively processes children before calling the parent renderer.

**Implications:** This is directly useful for our product. Our TipTap void nodes (Callout, Tabs, Card) are MDX components. When publishing to llms.txt, we need to convert them to meaningful text. The placeholder system does exactly this — serialize component semantics at build time, render to text at serve time. We can import this directly.


### Finding: The mdxAsPlaceholder shortcut simplifies the common case
**Confidence:** CONFIRMED
**Evidence:** remark-llms.ts lines 49, 81-87

Instead of writing a custom `stringify` callback for each component, `mdxAsPlaceholder: ['Callout', 'Card']` automatically routes those component names to the `placeholder()` function:

```typescript
if (mdxAsPlaceholder) {
  switch (node.type) {
    case 'mdxJsxFlowElement': case 'mdxJsxTextElement':
      if (node.name && mdxAsPlaceholder.includes(node.name))
        return placeholder(node, parent, state, info);
  }
}
```

This is pure convenience — the `stringify` callback can do the same thing with more control. But for the common case of "these components should be placeholders," it's a one-liner.


### Finding: toMdxExport injects the result as an ESM export in the AST
**Confidence:** CONFIRMED
**Evidence:** utils.ts lines 14-50, remark-llms.ts line 104

```typescript
node.children.unshift(toMdxExport(as, value));
```

`toMdxExport('_markdown', value)` creates an `mdxjsEsm` AST node that, when the MDX compiler runs, produces `export let _markdown = "..."`. The `valueToEstree()` function from `estree-util-value-to-estree` handles serialization.

This means the Markdown output is embedded in the compiled MDX module. When you `import { _markdown } from './page.mdx'`, you get the stringified Markdown. The `getText('processed')` convenience in Fumadocs MDX lazily loads this export.

**Implications:** This is specific to the MDX compilation pipeline. For our product, if we use remarkLLMs standalone (not in an MDX compiler), we would use the `_data: true` option to get the result from `file.data.markdown` instead of relying on ESM export injection.

---

## Negative searches

* Searched for streaming/incremental support in remarkLLMs -> NOT FOUND. The stringifier processes the full AST synchronously.
* Searched for caching of stringification results -> NOT FOUND. Each call re-stringifies the full tree.
* Searched for Markdown-to-MDX reverse conversion -> NOT FOUND. The pipeline is one-way: MDX AST -> Markdown. No round-trip.

---

## Gaps / follow-ups

* Performance characteristics of the stringifier on large documents (>10K lines) — not measured
* Whether `renderPlaceholder` handles deeply nested placeholder chains correctly — the recursive call is there but no test for >2 levels
* How the `.mdx` extension routing interacts with static site generation (pre-rendered vs on-demand)
