# Evidence: D7 — Content Collections Adapter and Fuma Content

**Dimension:** Content processing adapters
**Date:** 2026-04-02
**Sources:** fumadocs monorepo packages/content-collections/, packages/content/

---

## Key files referenced

- `packages/content-collections/src/index.ts` (37 lines) — Content Collections bridge
- `packages/content/src/runtime.ts` (57 lines) — Fuma Content to Fumadocs Source bridge

---

## Findings

### Finding: Content Collections adapter is literally a 37-line type mapper
**Confidence:** CONFIRMED
**Evidence:** content-collections/src/index.ts (complete file)

```typescript
export function createMDXSource<Docs extends BaseDocsData, Meta extends BaseMetaData>(
  allDocs: Docs[], allMetas: Meta[],
): Source<{ metaData: Meta; pageData: Docs }> {
  return {
    files: [
      ...allDocs.map(v => ({ type: 'page', data: v, path: v._meta.filePath })),
      ...allMetas.map(v => ({ type: 'meta', data: v, path: v._meta.filePath })),
    ],
  };
}
```

Maps `_meta.filePath` to `path` and passes data through. Zero transformation logic.

### Finding: Fuma Content bridge (toFumadocsSource) is 43 lines
**Confidence:** CONFIRMED
**Evidence:** content/src/runtime.ts lines 12-42

Maps `FileCollectionStore` entries to `VirtualFile[]`. Handles two variants: `MDXStoreData` (pre-compiled, frontmatter in `.compiled.frontmatter`) and `MDXStoreLazyData` (lazy-loaded, frontmatter at top level). Also maps `fullPath` to `absolutePath`.

### Finding: For our needs, gray-matter + Zod is simpler than either adapter
**Confidence:** INFERRED

Both adapters exist to bridge EXTERNAL content systems (Content Collections, Fuma Content) to Fumadocs' Source interface. For our use case (markdown files in git, parsed by our pipeline), neither adapter is needed. We would:
1. Read markdown files from disk
2. Parse frontmatter with `gray-matter`
3. Validate with Zod
4. Construct `VirtualFile[]` directly

This is ~30 lines of code and avoids the Content Collections or Fuma Content dependency chains entirely.

---

## Gaps / follow-ups

- Fuma Content's build-time compilation pipeline not investigated
- Standard Schema support in Fuma Content not explored
