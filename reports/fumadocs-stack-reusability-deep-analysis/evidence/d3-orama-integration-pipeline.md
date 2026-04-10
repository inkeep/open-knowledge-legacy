# Evidence: D3 — Orama Integration Pipeline Source Analysis

**Dimension:** Orama integration — schema, indexing, search, client
**Date:** 2026-04-02
**Sources:** fumadocs monorepo packages/core/src/search/

---

## Key files referenced

- `packages/core/src/search/orama/create-db.ts` (83 lines) — DB creation with schemas
- `packages/core/src/search/orama/create-server.ts` (328 lines) — Search API, createFromSource
- `packages/core/src/search/server/build-index.ts` (77 lines) — Page to SharedIndex
- `packages/core/src/search/server/build-doc.ts` (70 lines) — SharedIndex to documents
- `packages/core/src/search/server/endpoint.ts` (39 lines) — HTTP endpoint wrapper

---

## Findings

### Finding: The minimal path to "markdown to Orama documents" is 4 functions totaling ~250 lines
**Confidence:** CONFIRMED
**Evidence:** build-doc.ts (70 lines), build-index.ts (48 lines relevant), create-db.ts (53 lines relevant), remark-structure.ts structure() function (15 lines)

The minimal standalone pipeline:
1. `structure(markdownString)` — extracts `StructuredData` (headings + contents) from markdown
2. Construct a `SharedIndex` manually: `{ id, title, url, structuredData, description?, breadcrumbs?, tag? }`
3. `buildDocuments(sharedIndexes)` — explodes each page into per-section Orama documents
4. Use Orama's `create()` + `insertMultiple()` with `advancedSchema`

This bypasses both loader() and createFromSource(). Total code needed from Fumadocs: ~250 lines (structure + buildDocuments + schema definition).

### Finding: advancedSchema includes vector[512] but it's never populated by Fumadocs
**Confidence:** CONFIRMED
**Evidence:** create-db.ts lines 21-30

```typescript
export const advancedSchema = {
  content: 'string',
  page_id: 'string',
  type: 'string',
  breadcrumbs: 'string[]',
  tags: 'enum[]',
  url: 'string',
  embeddings: 'vector[512]',
} as const;
```

The `embeddings` field is declared but never set by `buildDocuments()`. It's a schema placeholder for `@orama/plugin-embeddings`.

### Finding: buildDocuments is a pure function with zero dependencies
**Confidence:** CONFIRMED
**Evidence:** build-doc.ts (complete file, 70 lines)

Takes `SharedIndex[]`, returns `SharedDocument[]`. Each page produces:
- 1 document type='page' (title as content)
- 0-1 document type='text' (description)  
- N documents type='heading' (one per heading, URL includes #anchor)
- M documents type='text' (one per content block, URL includes #anchor)

No imports except the `SharedIndex` type. Could be copy-pasted as a standalone function.

### Finding: createEndpoint wraps search in HTTP handler with 39 lines
**Confidence:** CONFIRMED
**Evidence:** endpoint.ts (39 lines)

Wraps `SearchServer.search()` and `SearchServer.export()` as `GET` and `staticGET` handlers. Uses standard `Request`/`Response` APIs — framework-agnostic (works in any environment with Web API fetch types).

### Finding: createFromSource connects loader to search but is not required
**Confidence:** CONFIRMED
**Evidence:** create-server.ts lines 270-316

`createFromSource(loaderOutput, options?)` calls `loaderOutput.getPages()` and maps each through `buildIndexDefault()`. It's a convenience wrapper. You can achieve the same by:
1. Calling `createSearchAPI('advanced', { indexes: yourIndexes })`
2. Constructing `SharedIndex[]` yourself from any content source

The loader dependency is opt-in, not structural.

---

## Gaps / follow-ups

- Search client components (useDocsSearch, SearchDialog) not analyzed
- Orama search algorithms (search/simple.ts, search/advanced.ts) not read
- Static export/import lifecycle not traced
