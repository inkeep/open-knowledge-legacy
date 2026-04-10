# Evidence: Snippet / Highlight Extraction

**Dimension:** D4 — Snippet / highlight extraction
**Date:** 2026-04-02
**Sources:** Orama source code (github.com/askorama/orama)

---

## Key files referenced

- `packages/plugin-match-highlight/src/index.ts` — position tracking and highlight extraction

---

## Findings

### Finding: Match highlighting available via @orama/plugin-match-highlight plugin
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-match-highlight/src/index.ts` — full implementation

The plugin provides:
1. **Position tracking** — records exact `{ start, length }` positions of every token in every document during insertion
2. **Search with positions** — returns matched token positions in search results

### Finding: Plugin returns character-level positions, NOT pre-built snippets
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-match-highlight/src/index.ts` (lines 16-19, 92-134)

```typescript
export interface Position {
  start: number
  length: number
}

// Result includes per-property, per-token position arrays:
// hit.positions = { "content": { "search": [{ start: 45, length: 6 }] } }
```

The plugin returns raw positions. Building snippets (extracting surrounding text context) is left to the consumer.

### Finding: Plugin uses afterInsert hook — must be initialized before inserting documents
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-match-highlight/src/index.ts` (line 37) — `export async function afterInsert<T extends AnyOrama>(orama: T, id: string)`

Positions are computed at insert time and stored in `orama.data.positions`. This adds memory overhead but makes search-time highlighting fast.

### Finding: Fuzzy matching supported in highlights — uses Levenshtein distance
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-match-highlight/src/index.ts` (lines 113-116)

```typescript
if (params.tolerance) {
  const distance = boundedLevenshtein(token, queryToken, params.tolerance)
  if (distance.isBounded) {
    matchWithSearchTokens.push(tokenEntry)
```

### Finding: Only works with full-text search (not hybrid or vector)
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-match-highlight/src/index.ts` (line 92) — `searchWithHighlight` uses `SearchParamsFullText`, not hybrid params.

### Finding: Save/load functions provided for persistence with highlight data
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-match-highlight/src/index.ts` (lines 136-148)

```typescript
export function saveWithHighlight<T extends AnyOrama>(orama: T): RawDataWithPositions
export function loadWithHighlight<T extends AnyOrama>(orama: T, raw: RawDataWithPositions): void
```

---

## Gaps / follow-ups

- No built-in snippet extraction (surrounding text window) — consumer must implement
- Not available for hybrid or vector search results
- Memory overhead: positions stored for every token in every document
- No control over snippet length or format — raw positions only
