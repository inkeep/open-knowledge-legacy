# Evidence: Vector Types & Quantization

**Dimension:** D2 — Vector types, quantization, max dimensions, storage efficiency
**Date:** 2026-04-04
**Sources:** pgvector GitHub, sqlite-vec API reference, Orama docs, Neon blog, Jonathan Katz blog

---

## Key files / pages referenced

- [pgvector GitHub README](https://github.com/pgvector/pgvector) — vector, halfvec, bit, sparsevec types
- [sqlite-vec API Reference](https://alexgarcia.xyz/sqlite-vec/api-reference.html) — float, int8, bit types
- [Orama vector search docs](https://docs.orama.com/docs/orama-js/search/vector-search) — number[] only
- [Neon halfvec blog](https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost)
- [Jonathan Katz quantization benchmarks](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/)
- [pgvector dimension limits #461](https://github.com/pgvector/pgvector/issues/461)

---

## Findings

### Finding: pgvector has the richest type system (4 vector types)
**Confidence:** CONFIRMED

| Type | Max dims (storage) | Max dims (indexed) | Bytes/element |
|------|-------------------|-------------------|---------------|
| vector | 16,000 | 2,000 | 4 |
| halfvec | 16,000 | 4,000 | 2 |
| bit | 83,000+ | 64,000 | 1/8 |
| sparsevec | arbitrary | 1,000 nonzero | 8 per nonzero + 16 |

### Finding: sqlite-vec supports 3 dense vector types
**Confidence:** CONFIRMED

| Type | Bytes/element | Distance metrics |
|------|---------------|-----------------|
| float[N] (float32) | 4 | L2, cosine |
| int8[N] | 1 | L2, cosine |
| bit[N] | 1/8 | Hamming |

`vec_quantize_binary()` built-in. `vec_quantize_i8()` documented but marked TODO.

### Finding: Orama supports only JavaScript number[] (float64)
**Confidence:** CONFIRMED
No int8, no binary, no half-precision, no sparse. Schema: `vector[N]`. ~8 bytes per element in V8.

### Finding: halfvec (float16) quantization has negligible recall loss
**Confidence:** CONFIRMED
**Evidence:** [Jonathan Katz benchmarks](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/)

sift-128: 77.5% vs 77.7% (f32). gist-960: 78.1% vs 78.0%. <0.3% loss. Safe default.

### Finding: Binary quantization has catastrophic recall loss without reranking
**Confidence:** CONFIRMED
sift-128: 2.2-2.5% recall. gist-960: 0% recall. Only viable for high-dim OpenAI-style embeddings + rerank pass (dbpedia-1536: 91.6-99.0% with rerank).

### Finding: Storage at 384 dims, 1K docs

| Engine | Type | Per vector | 1K docs |
|--------|------|-----------|---------|
| pgvector | vector | 1,544B | ~1.5MB |
| pgvector | halfvec | 776B | ~0.8MB |
| sqlite-vec | float | 1,536B | ~1.5MB |
| sqlite-vec | int8 | 384B | ~0.4MB |
| sqlite-vec | bit | 48B | ~0.05MB |
| Orama | number[] | ~3,072B | ~3MB |

---

## Gaps / follow-ups

- No product quantization (PQ) support in any engine — pgvector has open feature request #605
- sqlite-vec int8 quantization quality not benchmarked publicly
- Orama's actual V8 memory representation may differ from naive 8 bytes/number calculation
