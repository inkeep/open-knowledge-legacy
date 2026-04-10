# Evidence: Small Embedding Models for CPU

**Dimension:** D1 — Small Embedding Models for CPU
**Date:** 2026-04-03
**Sources:** HuggingFace model cards, MTEB leaderboard, vendor technical reports, benchmark blog posts

---

## Key sources referenced
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — Authoritative benchmark for embedding model quality
- [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) — Baseline model card
- [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) — BGE small model card
- [Snowflake/snowflake-arctic-embed-s](https://huggingface.co/Snowflake/snowflake-arctic-embed-s) — Arctic embed small
- [nomic-ai/nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) — Nomic embed v1.5
- [thenlper/gte-small](https://huggingface.co/thenlper/gte-small) — GTE small model card
- [intfloat/e5-small-v2](https://huggingface.co/intfloat/e5-small-v2) — E5 small v2
- [HuggingFace embedding quantization blog](https://huggingface.co/blog/embedding-quantization) — INT8 quality retention data
- [Intel fast embedding blog](https://huggingface.co/blog/intel-fast-embedding) — CPU optimization benchmarks
- [Arctic-Embed arXiv paper](https://arxiv.org/html/2405.05374v1) — Technical report
- [Nomic Embed arXiv paper](https://arxiv.org/html/2402.01613v2) — Technical report

---

## Findings

### Finding: bge-small-en-v1.5 offers the best quality/size ratio among 384-dim models
**Confidence:** CONFIRMED
**Evidence:** MTEB retrieval NDCG@10 = 51.68; model size = 67 MB FP32, ~34 MB INT8 ONNX; 33.4M parameters; 512-token context

bge-small-en-v1.5 scores 51.68 NDCG@10 on MTEB retrieval tasks — 24% better than all-MiniLM-L6-v2 (41.7) in a smaller disk footprint (67 MB vs 91 MB). INT8 quantization retains 99.4% of quality (only -0.3 NDCG@10 points), the best retention of any model tested. Official Xenova ONNX export available for transformers.js.

**Implications:** bge-small-en-v1.5 is the recommended default for CPU-only local search at this scale.

### Finding: arctic-embed-s narrowly leads on retrieval but lacks official Node.js ONNX export
**Confidence:** CONFIRMED
**Evidence:** MTEB retrieval NDCG@10 = 51.98; 33M params; 67 MB FP32; no official Xenova ONNX export as of April 2026

arctic-embed-s edges out bge-small on pure retrieval score (52.0 vs 51.7), but lacks first-party transformers.js ONNX exports. The 0.3 NDCG@10 point difference is within noise. Without an official ONNX export, using arctic-embed-s requires manual conversion.

**Implications:** bge-small-en-v1.5 is preferred over arctic-embed-s for Node.js deployment due to ecosystem maturity.

### Finding: nomic-embed-text-v1.5 eliminates chunking with 8192-token context
**Confidence:** CONFIRMED
**Evidence:** 137M params, 768 dims, 8192 max tokens, MTEB retrieval 52.8 NDCG@10, Matryoshka dimension reduction (768→256 with 61.04 vs 62.28 quality)

nomic-embed-text-v1.5 can embed entire markdown articles without chunking — a significant architectural simplification. At FP16 (~274 MB) or GGUF Q4 (~78 MB), it fits within the 2GB memory budget. Estimated CPU inference: ~50-120ms per article on M1/M2.

**Implications:** nomic-embed-text-v1.5 is the upgrade path if bge-small's 512-token chunking proves limiting.

### Finding: all-MiniLM-L6-v2 is dominated on every axis except ubiquity
**Confidence:** CONFIRMED
**Evidence:** MTEB retrieval 41.7 NDCG@10, 256-token max context, 91 MB FP32, INT8 retention only 90.8%

MiniLM scores 24% lower on retrieval than bge-small, has half the context window (256 vs 512 tokens), uses more disk space (91 vs 67 MB), and retains quality worse under INT8 quantization (90.8% vs 99.4%). It remains the most commonly referenced model due to historical ubiquity.

**Implications:** Not recommended for new projects. bge-small-en-v1.5 is strictly better.

### Finding: INT8 ONNX quantization provides 2-3x speedup on Apple Silicon with minimal quality loss for BGE models
**Confidence:** INFERRED
**Evidence:** INT8 speedup on x86 with VNNI is 3-4.5x; Apple Silicon ARM estimates 2-3x. bge-small INT8 retention is 99.4%.

Apple Silicon lacks AVX-VNNI instruction set but has ARM NEON. ONNX Runtime ARM backend provides INT8 acceleration, though exact Apple Silicon benchmarks for embedding models are sparse in public literature.

**Implications:** Use INT8 ONNX quantized models on Apple Silicon for best speed. bge-small-en-v1.5 retains quality almost perfectly under INT8.

---

## Model comparison table

| Model | Params | Disk (FP32) | Disk (INT8) | Dims | Max Tokens | MTEB Retrieval | INT8 Retention | Xenova ONNX |
|---|---|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 | 22.7M | 91 MB | ~46 MB | 384 | 256 | 41.7 | 90.8% | Yes |
| e5-small-v2 | 33M | 127 MB | ~64 MB | 384 | 512 | 49.0 | ~97% | Community |
| gte-small | 33.4M | 70 MB | ~35 MB | 384 | 512 | 49.5 | ~98% | Yes |
| bge-small-en-v1.5 | 33.4M | 67 MB | ~34 MB | 384 | 512 | 51.7 | 99.4% | Yes |
| arctic-embed-s | 33M | 67 MB | ~34 MB | 384 | 512 | 52.0 | ~98% | No |
| nomic-embed-text-v1.5 | 137M | 274 MB | ~78 MB (Q4) | 768 | 8192 | 52.8 | ~97% | ONNX available |
| arctic-embed-m | 110M | 440 MB | ~220 MB | 768 | 512 | 54.9 | ~98% | No |

---

## Gaps / follow-ups

* Apple Silicon-specific embedding inference benchmarks are scarce — most published numbers are x86/VNNI. ARM NEON INT8 performance for these models would benefit from direct benchmarking.
* arctic-embed-s official ONNX export status should be rechecked periodically.
