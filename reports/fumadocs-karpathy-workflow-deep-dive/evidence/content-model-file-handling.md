# Evidence: Content Model and File Handling (D1)

**Dimension:** D1 — Content model and file handling
**Date:** 2026-04-02
**Sources:** Fumadocs OSS repo (github.com/fuma-nama/fumadocs), fumadocs.dev official docs

---

## Key files referenced

- `packages/core/src/source/source.ts` — Source/VirtualFile interfaces
- `packages/core/src/source/loader.ts` — loader() API, LoaderOutput, LoaderPlugin
- `packages/core/src/source/storage/content.ts` — ContentStorage abstraction
- `packages/core/src/source/storage/file-system.ts` — In-memory FileSystem class
- `packages/core/src/source/schema.ts` — Zod schemas (pageSchema, metaSchema)
- `packages/core/src/source/page-tree/builder.ts` — PageTreeBuilder
- `packages/content/src/index.ts` — Fuma Content: docsCollection, docsMdxCollection
- `packages/content/src/runtime.ts` — toFumadocsSource bridge
- `packages/content-collections/src/index.ts` — Content Collections adapter
- `packages/mdx-remote/src/compile.ts` — Remote MDX compilation

---

## Findings

### Finding: Source interface is a flat array of VirtualFiles
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/source.ts`

```typescript
export interface Source<Config extends SourceConfig = SourceConfig> {
  files: VirtualFile<Config>[];
}

export type VirtualFile<Config extends SourceConfig = SourceConfig> =
  | VirtualPage<Config['pageData']>
  | VirtualMeta<Config['metaData']>;
```

The Source interface is a single `files` array of VirtualPage | VirtualMeta objects. Each has a `path` (virtual, relative), optional `absolutePath`, `type` discriminator, and a `data` payload. The `multiple()` function merges multiple sources with type discrimination. The `update()` function provides chainable transforms on source objects.

**Implications:** This flat array design means ANY content source that can produce {path, type, data} objects can plug into Fumadocs. Filesystem is just one provider. A CRDT-backed source, a database, or an API could produce the same array.

### Finding: loader() builds hierarchical navigation from flat sources
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/loader.ts` (lines 253-461)

The `loader()` function takes a Source + options and produces a LoaderOutput with:
- `pageTree` — hierarchical PageTree.Root
- `getPage(slugs)` — content by slug
- `getPages()` — all pages
- `getPageByHref()` — resolve relative file paths and URLs
- `resolveHref()` — resolve cross-references
- `generateParams()` — Next.js SSG params
- `getLanguages()` — i18n pages

The loader works entirely in-memory via ContentStorage, which is a virtual FileSystem class (Map-based, no disk I/O). The PageTreeBuilder constructs hierarchy from flat file paths using meta.json ordering. File paths like `guides/meta.json` with `pages: ["intro", "setup"]` control ordering.

**Implications:** The loader's in-memory architecture means it never touches the actual filesystem during operation. It processes whatever VirtualFiles are given to it. This is the key abstraction layer that makes Fumadocs adaptable.

### Finding: ContentStorage is a pure in-memory virtual filesystem
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/storage/file-system.ts`

```typescript
export class FileSystem<File> {
  files = new Map<string, File>();
  folders = new Map<string, string[]>();
  // read, readDir, write, delete, getFiles, makeDir
}
```

85 lines total. Map-based. Supports read, write, delete, readDir, makeDir. Has folder inheritance for i18n fallback. No disk I/O whatsoever.

**Implications:** This is the integration seam. Any source that can populate this in-memory filesystem can power Fumadocs. The ContentStorageBuilder normalizes VirtualFiles into this structure, handling locale parsing.

### Finding: Fuma Content (packages/content) bridges fuma-content to Fumadocs
**Confidence:** CONFIRMED
**Evidence:** `packages/content/src/index.ts`, `packages/content/src/runtime.ts`

```typescript
export function docsCollection(config) {
  return {
    index: new DocsCollection(),
    meta: dataCollection({ dir: config.dir, ...config.meta }),
    doc: docsMdxCollection({ dir: config.dir, ...config.docs }),
  };
}
```

The `toFumadocsSource()` function in runtime.ts bridges fuma-content FileCollectionStore to Fumadocs Source:

```typescript
export function toFumadocsSource(mdxStore, metaStore) {
  const out: Source = { files: [] };
  for (const page of mdxStore?.list() ?? []) {
    out.files.push({ type: 'page', data: {...page, ...page.frontmatter}, path: page.path });
  }
  // ...
}
```

**Implications:** Fuma Content is the next-gen content layer. It uses Standard Schema (not Zod-specific) for validation. The bridge pattern (toFumadocsSource) means Fuma Content can evolve independently while Fumadocs Core consumes it through the Source interface.

### Finding: Zod schemas define minimal but extensible page/meta contracts
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/schema.ts`

```typescript
export const pageSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  full: z.boolean().optional(),
  _openapi: z.looseObject({}).optional(),
});

export const metaSchema = z.object({
  title: z.string().optional(),
  pages: z.array(z.string()).optional(),
  description: z.string().optional(),
  root: z.boolean().optional(),
  defaultOpen: z.boolean().optional(),
  collapsible: z.boolean().optional(),
  icon: z.string().optional(),
});
```

**Implications:** The schemas are minimal — title + description + icon + a few flags. This is extensible via Zod's `.extend()`. For a wiki, you'd add `tags`, `category`, `backlinks`, `lastModified`, `author`, etc. The schema is enforced at build time, catching errors before deploy.

### Finding: Wiki-style structures require meta.json for flat navigation
**Confidence:** INFERRED
**Evidence:** PageTreeBuilder source + meta.json conventions

Fumadocs is designed for hierarchical docs (folder-based). For flat wiki-style structures, you'd need:
- All .mdx files in one flat directory
- A meta.json with all pages listed (or use `...` rest syntax for auto-inclusion)
- Custom slug generation via the `slugs` plugin

The `...` (rest) and `z...a` (reversed rest) patterns in PageTreeBuilder allow auto-inclusion of unlisted files. Parenthesized folders `(name)` are excluded from URL slugs.

**Implications:** Fumadocs CAN handle flat wiki structures, but it's not the natural fit. You'd fight the hierarchy model. The loader plugin system allows custom transformations, but wiki-style navigation (tags, categories, graph views) would need to be built on top.

### Finding: mdx-remote enables runtime MDX compilation from any source
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx-remote/src/compile.ts`

```typescript
export function createCompiler(mdxOptions?: CompilerOptions) {
  return {
    async render(compiled, scope, filePath) { /* ... */ },
    async compileFile(from) { /* ... */ },
    async compile(options) { /* ... */ },
  };
}
```

The mdx-remote package compiles MDX strings at runtime (not build time). It supports the full Fumadocs plugin pipeline (remarkHeading, rehypeCode, rehypeToc, etc.). This means content can come from anywhere — API, database, CRDT — and be compiled on-demand.

**Implications:** This is the key enabler for dynamic content. Build-time compilation (fumadocs-mdx) is for static sites. Runtime compilation (mdx-remote) is for dynamic sources. For a wiki with LLM-generated content, mdx-remote is the right tool.

---

## Gaps / follow-ups

- How does Fuma Content handle file watching for dev-mode hot reload?
- What's the actual memory overhead per page in the in-memory FileSystem?
- Content Collections adapter: is it maintained? (last update needed)
