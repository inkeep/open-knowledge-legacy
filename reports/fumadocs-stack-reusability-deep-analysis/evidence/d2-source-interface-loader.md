# Evidence: D2 — Source Interface and loader() Source Analysis

**Dimension:** fumadocs-core Source interface and loader()
**Date:** 2026-04-02
**Sources:** fumadocs monorepo packages/core/src/source/

---

## Key files referenced

- `packages/core/src/source/source.ts` (153 lines) — Source, VirtualFile, multiple() combiner
- `packages/core/src/source/loader.ts` (550 lines) — loader() function, LoaderOutput, plugins
- `packages/core/src/source/loader/llms.ts` (100 lines) — llms() index generator

---

## Findings

### Finding: Source interface is 4 types totaling 97 lines with zero framework coupling
**Confidence:** CONFIRMED
**Evidence:** source.ts lines 1-56

```typescript
export interface Source<Config extends SourceConfig = SourceConfig> {
  files: VirtualFile<Config>[];
}
```

`VirtualFile` is a discriminated union: `VirtualPage` (type: 'page', path, data, optional slugs, optional absolutePath) or `VirtualMeta` (type: 'meta', path, data). `PageData` requires only `title?: string; description?: string; icon?: string`. `MetaData` adds navigation fields: `pages?: string[]; defaultOpen?: boolean; collapsible?: boolean; root?: boolean`.

No framework imports. No React. No Next.js. Pure TypeScript interfaces.

### Finding: multiple() combiner is 16 lines, merges sources with type discrimination
**Confidence:** CONFIRMED
**Evidence:** source.ts lines 68-84

```typescript
export function multiple<T extends Record<string, Source>>(sources: T) {
  const out: Source<_ConfigUnion_<T>> = { files: [] };
  for (const [type, source] of Object.entries(sources)) {
    for (const file of source.files) {
      out.files.push({ ...file, data: { ...file.data, type } });
    }
  }
  return out;
}
```

Adds a `type` discriminator to each file's data. No side effects. Framework-agnostic.

### Finding: loader() produces LoaderOutput with React dependency only in serializePageTree
**Confidence:** CONFIRMED
**Evidence:** loader.ts lines 75-163, 282-461

`loader()` takes a `Source` and `LoaderOptions`, builds a `ContentStorage`, scans pages into an indexer (Map-based), and lazily builds a page tree. The `LoaderOutput` provides:

- `getPage(slugs, language)` — slug-based page lookup
- `getPages(language)` — list all pages
- `getPageByHref(href, options)` — resolve relative paths or URLs to pages
- `resolveHref(href, parent)` — resolve cross-references
- `getPageTree(locale)` — hierarchical navigation tree
- `generateParams()` — Next.js SSG helper (Next.js-specific)
- `serializePageTree(tree)` — uses `react-dom/server.edge` for icon serialization (React-specific)

The React dependency is isolated: `serializePageTree` (lines 439-459) dynamically imports `react-dom/server.edge` to serialize React icon elements to HTML strings. This is the ONLY React touch point in the entire loader.

`generateParams()` returns `Record<string, string[]>[]` — Next.js naming convention but framework-agnostic output format.

### Finding: LoaderPlugin system enables content transformation without forking
**Confidence:** CONFIRMED
**Evidence:** loader.ts lines 490-519

```typescript
export interface LoaderPlugin<Config extends LoaderConfig = LoaderConfig> {
  config?: (config: ResolvedLoaderConfig) => ResolvedLoaderConfig | void;
  transformStorage?: (context: { storage: ContentStorage<Config['source']> }) => void;
  transformPageTree?: PageTreeTransformer<Config['source']>;
}
```

Three hooks: config modification, storage transformation (runs after files are loaded), and page tree transformation. Plugins are sorted by `enforce: 'pre' | 'post'`. This is the extension point for adding backlinks, custom metadata, or content transformations.

### Finding: Y.Doc to VirtualFile[] bridge is architecturally trivial
**Confidence:** INFERRED
**Evidence:** source.ts type definitions

A Y.Doc to VirtualFile[] bridge would map CRDT document state to the minimal Source interface:

```typescript
function crdtToSource(docs: Map<string, Y.Doc>): Source {
  return {
    files: Array.from(docs.entries()).map(([path, ydoc]) => ({
      type: 'page' as const,
      path,
      data: {
        title: ydoc.getText('title').toString(),
        description: ydoc.getText('description').toString(),
        // structuredData would need extraction via remarkStructure
      },
    })),
  };
}
```

The challenge: `loader()` needs `structuredData` for search indexing. This means running each Y.Doc through remarkStructure during the bridge step, not just extracting raw text. For a 100-doc knowledge base, this is ~100 remark pipeline runs per full rebuild.

### Finding: VirtualFile[] to Orama documents bridge exists but is tightly integrated
**Confidence:** CONFIRMED
**Evidence:** loader.ts line 550, create-server.ts lines 270-316

`createFromSource(loaderOutput)` connects loader output directly to Orama indexing. It calls `loaderOutput.getPages()`, runs each through `buildIndexDefault()` (which expects `page.data.structuredData`), then feeds results to `initAdvancedSearch()`.

To skip loader() and feed content directly to Orama, you would use `createSearchAPI('advanced', { indexes: [...] })` with manually constructed `SharedIndex[]` objects. This is a documented API path that does not require loader().

### Finding: loader() is overengineered for a flat wiki but right for hierarchical docs
**Confidence:** INFERRED

The page tree builder, meta.json ordering system, folder-based hierarchy, and breadcrumb generation serve documentation-style content (chapters, sections, subsections). For a flat wiki with tags, most of loader() is unnecessary — you'd need only the slug resolution and page indexing. The Source interface itself is the right abstraction level; loader() may be more than needed.

---

## Gaps / follow-ups

- ContentStorage and FileSystem classes not deeply read (storage/ subdirectory)
- PageTreeBuilder not read (page-tree/ subdirectory)
- Performance characteristics of loader() rebuild not measured
