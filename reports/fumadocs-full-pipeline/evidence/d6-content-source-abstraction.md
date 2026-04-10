# Evidence: D6 — Content Source Abstraction

**Dimension:** Content source abstraction
**Date:** 2026-04-03
**Sources:** fumadocs repo source code, official docs

---

## Key files referenced

- `packages/core/src/source/source.ts` — Source interface, VirtualFile types
- `packages/core/src/source/loader.ts` — loader() function
- `packages/core/src/source/storage/content.ts` — ContentStorage
- `packages/core/src/source/storage/file-system.ts` — FileSystem (in-memory)
- `packages/mdx/src/runtime/server.ts` — toFumadocsSource() bridge
- `packages/content/src/runtime.ts` — Fuma Content adapter

---

## Findings

### Finding: The Source interface is a flat array of VirtualFile objects
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/source.ts:1-29`

```typescript
export interface Source<Config extends SourceConfig = SourceConfig> {
  files: VirtualFile<Config>[];
}

export type VirtualFile<Config> = VirtualPage<Config['pageData']> | VirtualMeta<Config['metaData']>;

interface VirtualPage<Data extends PageData> extends BaseVirtualFile {
  type: 'page';
  slugs?: string[];
  data: Data;
}

interface VirtualMeta<Data extends MetaData> extends BaseVirtualFile {
  type: 'meta';
  data: Data;
}

interface BaseVirtualFile {
  path: string;           // virtualized path relative to content dir
  absolutePath?: string;  // absolute filesystem path
}
```

### Finding: The contract between content source and rendering is the Source interface
**Confidence:** CONFIRMED
**Evidence:** Any content source must produce a `Source` object with `files: VirtualFile[]`. Each VirtualFile is either a page (with PageData: title, description, icon) or a meta file (with MetaData: title, icon, pages, defaultOpen).

The loader() function accepts this Source and produces:
- Page tree (navigation structure)
- Page lookup by slugs
- URL generation
- Static param generation

### Finding: Multiple sources can be combined with `multiple()`
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/source.ts:68-84`

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

This allows combining docs from MDX files, a CMS, and other sources into a single page tree.

### Finding: fumadocs-mdx provides toFumadocsSource() to bridge its output to the Source API
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/runtime/server.ts:227-263`

```typescript
export function toFumadocsSource<Page, Meta>(pages, metas): Source {
  const files: VirtualFile[] = [];
  for (const entry of pages) {
    files.push({ type: 'page', path: entry.info.path, absolutePath: entry.info.fullPath, data: entry });
  }
  for (const entry of metas) {
    files.push({ type: 'meta', path: entry.info.path, absolutePath: entry.info.fullPath, data: entry });
  }
  return { files };
}
```

### Finding: A visual editor could plug in as a content source
**Confidence:** INFERRED
**Evidence:** The Source API is content-source-agnostic. A visual editor that produces VirtualFile[] objects would integrate with zero changes to Fumadocs core. The editor would need to:

1. Emit `VirtualPage` objects with: path, data (title, description, body component, toc, structuredData)
2. Emit `VirtualMeta` objects for navigation structure
3. Pass the Source to loader()

The key challenge: `page.data.body` must be a React component (the compiled MDX). For the editor to work, it would either:
- Compile MDX at save time and provide the compiled component
- Use `@fumadocs/mdx-remote` for runtime compilation
- Provide its own rendering pipeline that produces the same interface

### Finding: ContentStorage is an in-memory virtual file system
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/storage/file-system.ts`

```typescript
export class FileSystem<File> {
  files = new Map<string, File>();
  folders = new Map<string, string[]>();
  // read, readDir, write, delete, getFiles, makeDir
}
```

This abstraction means Fumadocs doesn't care about the actual filesystem. Content can come from anywhere — files, databases, APIs — as long as it's transformed into VirtualFile objects.

---

## Gaps / follow-ups

- How Payload CMS integration actually produces VirtualFile objects in practice
- What the minimum PageData contract is for a visual editor
