# Evidence: Core Search Capabilities

**Dimension:** D1 — Core search capabilities
**Date:** 2026-04-02
**Sources:** Orama source code (github.com/askorama/orama), official docs (docs.orama.com)

---

## Key files referenced

- `packages/orama/src/methods/search-fulltext.ts` — full-text search implementation
- `packages/orama/src/methods/search-hybrid.ts` — hybrid search fusion logic
- `packages/orama/src/methods/search-vector.ts` — vector search implementation
- `packages/orama/src/trees/vector.ts` — vector index (brute-force cosine similarity)
- `packages/orama/src/components/tokenizer/index.ts` — tokenizer implementation
- `packages/orama/src/components/tokenizer/languages.ts` — language splitters
- `packages/orama/src/types.ts` — full type definitions including search params, where clauses, facets

---

## Findings

### Finding: Full-text search uses BM25 with configurable k, b, d parameters
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (lines 337-350)

```typescript
relevance?: BM25Params  // { k?: number; b?: number; d?: number }
// k: Term frequency saturation (default 1.2, range 1.2-2.0)
// b: Document length saturation (default 0.75)
// d: Frequency normalization lower bound (default 0.5)
```

### Finding: Tokenization splits on language-specific regex, supports diacritics removal, optional stemming, optional stop words
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/components/tokenizer/index.ts` (lines 57-93)

Tokenizer pipeline: input.toLowerCase() -> split(SPLITTERS[language]) -> normalizeToken (stopword removal -> stemming -> diacritics replacement) -> deduplicate.

Only English stemmer is bundled. Non-English stemmers require `@orama/stemmers` package.

### Finding: 30 languages supported with specific regex splitters
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/components/tokenizer/languages.ts` — 30 languages with custom regex splitters (English, French, German, Spanish, Italian, Portuguese, Russian, Arabic, Turkish, Japanese via @orama/tokenizers, Mandarin via @orama/tokenizers, etc.)

### Finding: Hybrid search uses weighted-sum score fusion with min-max normalization — NOT RRF
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/search-hybrid.ts` (lines 109-168)

```typescript
// Step 1: Min-max normalize full-text scores
function minMaxScoreNormalization(results) {
  const maxScore = Math.max(...results.map(extractScore))
  return results.map(([id, score]) => [id, score / maxScore])
}

// Step 2: Build hybrid score = textScore * textWeight + vectorScore * vectorWeight
function hybridScoreBuilder(textWeight, vectorWeight) {
  return (textScore, vectorScore) => textScore * textWeight + vectorScore * vectorWeight
}

// Step 3: Default weights are 0.5/0.5 (configurable via hybridWeights param)
function getQueryWeights(query) {
  return { text: 0.5, vector: 0.5 }
}
```

Fusion is configurable via `hybridWeights: { text: number, vector: number }` in search params.

### Finding: Boolean queries supported via where clause with AND, OR, NOT operators
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (lines 243-255)

```typescript
export type WhereCondition<TSchema> =
  | { [key in keyof TSchema]?: Operator<TSchema[key]> }
  | { and?: WhereCondition<TSchema>[] }
  | { or?: WhereCondition<TSchema>[] }
  | { not?: WhereCondition<TSchema> }
```

### Finding: Numeric filters support gt, gte, lt, lte, eq, between operators
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (lines 182-189)

```typescript
export type ComparisonOperator = {
  gt?: number; gte?: number; lt?: number; lte?: number; eq?: number; between?: [number, number]
}
```

### Finding: Enum filters support eq, in, nin; Enum array filters support containsAll, containsAny
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (lines 191-200)

### Finding: Geosearch supported via BKD tree with radius and polygon queries
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (lines 202-222), `packages/orama/src/trees/bkd.ts`

Supports radius (coordinates + value + unit) and polygon (coordinates array) search, with configurable distance units (cm, m, km, ft, yd, mi) and inside/outside filtering.

### Finding: Fuzzy matching via Levenshtein distance (tolerance parameter)
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (lines 328-335)

```typescript
tolerance?: number  // Maximum Levenshtein distance between term and searchable property
```

### Finding: Faceted search on string, number (ranges), and boolean fields
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (lines 150-168)

String facets: limit, offset, sort. Number facets: ranges array. Boolean facets: true/false counts.

### Finding: Search params include limit, offset, sortBy, exact match, threshold, boost, groupBy, distinctOn, preflight
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` — Full search API parameters documented in type definitions.

- `threshold`: 0 = all terms must match, 1 = any term matches (AND vs OR behavior)
- `boost`: per-property score multiplier
- `preflight`: returns just facets and count without fetching documents
- `distinctOn`: deduplicate results by a property
- `groupBy`: group results by properties with optional reduce function

### Finding: Search response format
**Confidence:** CONFIRMED
**Evidence:** README.md code example

```typescript
{
  elapsed: { raw: 21492, formatted: '21μs' },
  hits: [{ id: string, score: number, document: { ...fields } }],
  count: number,
  facets?: { ... },
  groups?: { ... }
}
```

---

## Gaps / follow-ups

- No built-in query decomposition (multi-step query planning)
- threshold parameter acts as AND/OR toggle, not a minimum score cutoff despite the name
