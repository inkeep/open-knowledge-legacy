# Evidence: Schema and Document Model

**Dimension:** D2 — Schema and document model
**Date:** 2026-04-02
**Sources:** Orama source code (github.com/askorama/orama)

---

## Key files referenced

- `packages/orama/src/types.ts` — schema types, document types, searchable types
- `packages/orama/src/methods/create.ts` — database creation with schema
- `packages/orama/src/methods/insert.ts` — document insertion with validation
- `packages/orama/src/methods/update.ts` — update (implemented as remove + insert)
- `packages/orama/src/methods/remove.ts` — document removal
- `packages/orama/src/methods/upsert.ts` — upsert operations

---

## Findings

### Finding: Schema defined as a plain object literal with string type descriptors
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (lines 107-109), README.md

```typescript
const db = create({
  schema: {
    title: 'string',
    description: 'string',
    price: 'number',
    embedding: 'vector[1536]',
    meta: { rating: 'number' }  // nested objects supported
  }
})
```

Schema is NOT TypeScript types — it's a runtime object with string values. But Orama provides strong TypeScript inference from the schema definition.

### Finding: 10 field types supported
**Confidence:** CONFIRMED
**Evidence:** README.md, `packages/orama/src/types.ts` (lines 129-131)

| Type | Description |
|------|------------|
| `string` | Full-text indexed string |
| `number` | Numeric value (float or integer) |
| `boolean` | Boolean value |
| `enum` | Filterable enum (string or number value) |
| `geopoint` | `{ lat: number, lon: number }` |
| `string[]` | Array of strings |
| `number[]` | Array of numbers |
| `boolean[]` | Array of booleans |
| `enum[]` | Array of enums |
| `vector[N]` | Vector of N dimensions |

### Finding: Nested objects supported in schema
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (line 54) — The Flatten type recursively flattens nested objects into dot-notation keys. Schema like `{ meta: { rating: 'number' } }` becomes searchable as `meta.rating`.

### Finding: Schema is fixed at creation — no schema evolution after creation
**Confidence:** INFERRED
**Evidence:** `packages/orama/src/methods/create.ts` — Schema is passed at `create()` time and used to initialize the index. No `addField()` or `alterSchema()` methods exist in the exported API. The only way to add fields is to create a new database and re-insert documents.

### Finding: Documents have auto-generated string IDs, or can be overridden
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/insert.ts` (line 50) — `const id = orama.getDocumentIndexId(doc)`. Default implementation generates a unique ID. Can be overridden via components. IDs must be strings.

### Finding: insert, insertMultiple, update, updateMultiple, remove, removeMultiple, upsert, upsertMultiple all available
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/index.ts` (lines 1-10)

### Finding: update is implemented as remove + insert (not an in-place update)
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/update.ts` (lines 41-42)

```typescript
await remove(orama, id, language, skipHooks)
const newId = await insert(orama, doc, language, skipHooks)
```

### Finding: insertMultiple supports configurable batch size (default 1000)
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/insert.ts` (line 294)

```typescript
batchSize: number = 1000
```

With a configurable timeout parameter for yielding to the event loop between batches.

### Finding: No explicit maximum document size or field length limits
**Confidence:** INFERRED
**Evidence:** No size limits found in source code. Since Orama is in-memory, the practical limit is available RAM. String fields are stored as-is in the document store and tokenized for the index.

### Finding: DOCUMENT_ALREADY_EXISTS error thrown on duplicate ID insertion
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/insert.ts` (line 64) — `throw createError('DOCUMENT_ALREADY_EXISTS', id)`

---

## Gaps / follow-ups

- Schema evolution would require rebuilding the entire index
- No partial document updates — update requires a full document replacement
