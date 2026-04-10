# Evidence: D5 — Rendering Pipeline

**Dimension:** Rendering pipeline
**Date:** 2026-04-03
**Sources:** fumadocs repo source code

---

## Key files referenced

- `examples/next/app/docs/[[...slug]]/page.tsx` — page rendering
- `examples/next/app/docs/layout.tsx` — DocsLayout with sidebar
- `examples/next/app/layout.tsx` — RootProvider
- `packages/radix-ui/src/layouts/docs/index.tsx` — DocsLayout component
- `packages/radix-ui/src/page.tsx` — DocsPage component
- `packages/core/src/source/loader.ts` — loader() and page tree generation
- `packages/core/src/source/page-tree/builder.ts` — PageTreeBuilder
- `packages/mdx/src/runtime/server.ts` — server-side runtime
- `packages/mdx/src/runtime/browser.tsx` — client-side runtime

---

## Findings

### Finding: MDX pages are React Server Components by default
**Confidence:** CONFIRMED
**Evidence:** `examples/next/app/docs/[[...slug]]/page.tsx`

```typescript
export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsBody>
        <MDX components={getMDXComponents({...})} />
      </DocsBody>
    </DocsPage>
  );
}
```

The page is an async function (RSC). `page.data.body` is the compiled MDX component. It's invoked server-side.

### Finding: Hybrid RSC/Client model — layout is RSC, some components are 'use client'
**Confidence:** CONFIRMED
**Evidence:** 
- `packages/radix-ui/src/components/tabs.tsx:1` has `'use client'`
- `packages/radix-ui/src/components/callout.tsx` has NO directive (server component)
- `packages/radix-ui/src/page.tsx:1` has `'use client'`

Components that need React state (Tabs, sidebar, TOC) are client components. Pure presentational components (Callout, Card, Heading) are server components.

### Finding: Navigation/sidebar is generated from file structure via PageTreeBuilder
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/page-tree/builder.ts`

The `PageTreeBuilder` class takes a `ContentStorage` (in-memory virtual file system) and builds a hierarchical `PageTree.Root` with:
- `PageTree.Item` — individual pages
- `PageTree.Folder` — directory groupings
- `PageTree.Separator` — visual separators

The tree is built by scanning files and applying transformers. `meta.json` files in directories control ordering, titles, and icons.

Usage in layout: `<DocsLayout tree={source.getPageTree()} />`

### Finding: Search is powered by structured data extracted during MDX compilation
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/search/` directory contains: orama.ts, algolia.ts, flexsearch.ts, orama-cloud.ts, mixedbread.ts

The `remarkStructure` plugin (in the remark pipeline) extracts `structuredData` from each page during MDX compilation. This is then fed to the search provider.

Search providers are pluggable via a unified `SearchAPI` interface.

### Finding: loader() is a server-only in-memory operation
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/loader.ts:282-293`

```typescript
export function loader(...args) {
  const loaderConfig = args.length === 2 ? resolveConfig(args[0], args[1]) : resolveConfig(args[0].source, args[0]);
  const storage = i18n
    ? createContentStorageBuilder(loaderConfig).i18n()
    : createContentStorageBuilder(loaderConfig).single();
  const indexer = createPageIndexer(loaderConfig);
  // ...
}
```

All content is loaded into memory. Page tree construction is lazy (computed on first access). This runs once at server startup (or per request in dev mode).

### Finding: For non-RSC environments, page tree can be serialized
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/loader.ts:439-459`

```typescript
async serializePageTree(tree) {
  const { renderToString } = await import('react-dom/server.edge');
  return {
    $fumadocs_loader: 'page-tree',
    data: visit(tree, (node) => {
      // render icons and names to HTML strings
    }),
  };
}
```

This enables React Router, TanStack Start, and other non-Next.js frameworks to use the page tree on the client.

---

## Gaps / follow-ups

- Streaming/Suspense patterns for large page trees
- Performance characteristics of the in-memory loader at scale
