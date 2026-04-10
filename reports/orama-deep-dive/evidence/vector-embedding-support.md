# Evidence: Vector / Embedding Support

**Dimension:** D3 — Vector / embedding support
**Date:** 2026-04-02
**Sources:** Orama source code (github.com/askorama/orama)

---

## Key files referenced

- `packages/orama/src/trees/vector.ts` — VectorIndex class, brute-force cosine similarity
- `packages/orama/src/methods/search-vector.ts` — vector search entry point
- `packages/orama/src/types.ts` — Vector type definition, search params
- `packages/plugin-embeddings/src/index.ts` — built-in embedding plugin (TensorFlow.js USE)
- `packages/plugin-secure-proxy/src/index.ts` — OpenAI embeddings via proxy

---

## Findings

### Finding: Vector search uses brute-force cosine similarity — no ANN index
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/trees/vector.ts` (lines 77-111)

```typescript
export function findSimilarVectors(
  targetVector: Float32Array,
  keys: Set<InternalDocumentID> | undefined,
  vectors: Map<InternalDocumentID, [Magnitude, VectorType]>,
  length: number,
  threshold
): SimilarVector[] {
  const targetMagnitude = getMagnitude(targetVector, length)
  const similarVectors: SimilarVector[] = []
  const base = keys ? keys : vectors.keys()

  for (const vectorId of base) {
    const entry = vectors.get(vectorId)
    if (!entry) continue
    const magnitude = entry[0]
    const vector = entry[1]

    let dotProduct = 0
    for (let i = 0; i < length; i++) {
      dotProduct += targetVector[i] * vector[i]
    }
    const similarity = dotProduct / (targetMagnitude * magnitude)
    if (similarity >= threshold) {
      similarVectors.push([vectorId, similarity])
    }
  }
  return similarVectors
}
```

This is O(n*d) where n = number of documents and d = vector dimensions. Linear scan with no index structure.

### Finding: Vectors stored as Float32Array in a Map keyed by internal document ID
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/trees/vector.ts` (line 12)

```typescript
private vectors: Map<InternalDocumentID, [Magnitude, VectorType]> = new Map()
```

Pre-computed magnitudes stored alongside vectors for efficient cosine computation.

### Finding: Any vector dimensionality supported — declared in schema as `vector[N]`
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/types.ts` (lines 86-87, 127)

```typescript
Value extends `vector[${number}]` ? number[] : ...
export type Vector = `vector[${number}]`
```

Common sizes: 384 (bge-small), 512 (USE), 768 (bge-base), 1536 (OpenAI ada-002).

### Finding: External embeddings fully supported — just pass number[] or Float32Array
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/trees/vector.ts` (lines 16-19)

```typescript
add(internalDocumentId: InternalDocumentID, value: VectorTypeLike) {
  if (!(value instanceof Float32Array)) {
    value = new Float32Array(value)  // accepts number[] or Float32Array
  }
```

You generate embeddings however you want and pass them in. No coupling to any embedding provider.

### Finding: Built-in embedding plugin uses TensorFlow.js Universal Sentence Encoder (512-dim)
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-embeddings/src/index.ts` (lines 2, 33)

```typescript
import { load as loadModel } from '@tensorflow-models/universal-sentence-encoder'
export const embeddingsType = 'vector[512]'
```

This is a basic plugin using TF.js USE model. NOT recommended for production — bge-small-en-v1.5 via @huggingface/transformers is far better quality.

### Finding: Secure Proxy plugin routes embedding generation through Orama Cloud for OpenAI models
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-secure-proxy/src/index.ts` — Uses `@oramacloud/client` OramaProxy to generate embeddings server-side, keeping API keys safe in browser environments.

### Finding: Vector-only search fully supported via mode: 'vector'
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/search-vector.ts` — Standalone `searchVector()` export, plus `search()` with `mode: 'vector'`.

### Finding: Default similarity threshold is 0.8
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/trees/vector.ts` (line 9) — `export const DEFAULT_SIMILARITY = 0.8`

### Finding: Vector search supports where clause filters (pre-filtering)
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/search-vector.ts` (lines 38-43) — Filter IDs computed first, then passed to vector.find() which iterates only matching IDs.

### Finding: Source code TODO acknowledges need for parallel computation plugins
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/trees/vector.ts` (line 77)

```typescript
// @todo: Write plugins for Node and Browsers to use parallel computation for this function
```

---

## Scaling implications

At 1,000 documents with 384-dim vectors:
- Each vector: 384 * 4 bytes = 1,536 bytes
- Total vector memory: ~1.5 MB
- Brute-force scan: 1,000 * 384 multiply-adds = ~384K FLOPs (microseconds on modern CPU)

At 10,000 documents: ~15 MB vectors, ~3.84M FLOPs (still < 10ms)
At 100,000 documents: ~150 MB vectors, ~38.4M FLOPs (starts becoming noticeable, 50-100ms)

The brute-force approach is adequate up to ~10K documents. Beyond that, an ANN index (HNSW, IVF) would be needed.

---

## Gaps / follow-ups

- No ANN index implementation — brute-force only
- No vector quantization for memory reduction
- No batch vector search API
