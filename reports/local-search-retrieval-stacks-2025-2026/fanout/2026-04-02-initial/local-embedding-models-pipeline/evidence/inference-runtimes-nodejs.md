# Evidence: Inference Runtimes for Node.js/TypeScript

**Dimension:** D2 — Inference Runtimes for Node.js/TypeScript
**Date:** 2026-04-03
**Sources:** npm package pages, GitHub repositories, official documentation, Hugging Face blog posts

---

## Key sources referenced
- [@huggingface/transformers on npm](https://www.npmjs.com/package/@huggingface/transformers) — v4.0.1
- [Transformers.js v4 release blog](https://huggingface.co/blog/transformersjs-v4) — Architecture and benchmarks
- [huggingface/transformers.js GitHub](https://github.com/huggingface/transformers.js) — 15.3k stars
- [onnxruntime-node on npm](https://www.npmjs.com/package/onnxruntime-node) — v1.24.3
- [ONNX Runtime Node.js docs](https://onnxruntime.ai/docs/get-started/with-javascript/node.html) — Official docs
- [node-llama-cpp on npm](https://www.npmjs.com/package/node-llama-cpp) — v3.18.1, 4.4M weekly downloads
- [node-llama-cpp embedding guide](https://node-llama-cpp.withcat.ai/guide/embedding) — API docs
- [fastembed-js GitHub](https://github.com/Anush008/fastembed-js) — Archived January 2026
- [huggingface/candle GitHub](https://github.com/huggingface/candle) — No Node.js bindings

---

## Findings

### Finding: @huggingface/transformers (v4) is the simplest path to embeddings in Node.js
**Confidence:** CONFIRMED
**Evidence:** 6 lines of code for working embeddings, auto-downloads models, 15.3k GitHub stars, 567+ npm dependents, v4.0.1 shipped Feb 2026

```typescript
import { pipeline } from "@huggingface/transformers";
const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
const result = await embed("text", { pooling: "mean", normalize: true });
```

Uses ONNX Runtime under the hood (via onnxruntime-node or onnxruntime-web). v4 added a new C++ WebGPU runtime with ~4x speedup for BERT-based models via `com.microsoft.MultiHeadAttention` operator. ESM-only package — requires dynamic `import()` in CommonJS projects.

**Implications:** This is the recommended default for Node.js embedding inference. Zero system dependencies, largest model hub, best DX.

### Finding: onnxruntime-node provides maximum control at the cost of ~80-120 lines of boilerplate
**Confidence:** CONFIRMED
**Evidence:** v1.24.3, requires manual tokenization, pooling, and normalization. ARM64 macOS pre-built binaries included.

Direct ONNX Runtime usage requires: downloading model, loading tokenizer separately, creating tensors, running session, implementing mean pooling, and L2-normalizing. CoreML execution provider is NOT included in pre-built Node.js binaries — Apple Silicon runs on ARM64 CPU path only.

**Implications:** Only use direct onnxruntime-node if you need control not available through transformers.js (custom execution providers, non-HuggingFace models, or minimal dependency tree).

### Finding: node-llama-cpp supports embeddings with Metal acceleration and clean API
**Confidence:** CONFIRMED
**Evidence:** v3.18.1, 4.4M weekly downloads, 110+ dependents, ~8 lines for embeddings, Metal GPU backend supported

```typescript
const context = await model.createEmbeddingContext();
const embedding = await context.getEmbeddingFor("text");
```

Metal acceleration available for transformer layers. GGUF embedding models available (bge-small-en-v1.5-Q8_0.gguf = ~24 MB). GGUF model ecosystem for embeddings is smaller than ONNX — fewer models converted.

**Implications:** Best choice when the app already uses llama.cpp for LLM inference (shared runtime). Metal acceleration could outperform WASM-based transformers.js on Apple Silicon. Not the default choice for embedding-only workloads.

### Finding: fastembed-js is archived and should not be used for new projects
**Confidence:** CONFIRMED
**Evidence:** [Archived January 15, 2026](https://github.com/Anush008/fastembed-js). Latest version 2.1.0.

The package still functions but is read-only. Used onnxruntime-node with BGE models. `@mastra/fastembed` provides a maintained alternative in the Mastra ecosystem.

**Implications:** Use @huggingface/transformers instead.

### Finding: candle has no Node.js bindings and is not feasible for this use case
**Confidence:** CONFIRMED
**Evidence:** 19.9k GitHub stars, Python and WASM bindings only. No npm package. No NAPI bindings.

Building custom Rust NAPI bindings would be a significant engineering investment with no existing community work to build on.

**Implications:** Not feasible without major engineering investment. Skip.

---

## Runtime comparison table

| Runtime | Install | Lines of code | Model hub | Auto-download | Metal/GPU | Maintained | DX |
|---|---|---|---|---|---|---|---|
| @huggingface/transformers | `npm i @huggingface/transformers` | ~6 | HF Hub (huge) | Yes | No (WASM) | Active (Feb 2026) | Excellent |
| onnxruntime-node | `npm i onnxruntime-node` + tokenizer | ~80-120 | Manual ONNX | No | No (CPU ARM64) | Active (Microsoft) | Poor |
| node-llama-cpp | `npm i node-llama-cpp` | ~8 | GGUF (smaller) | No | Yes (Metal) | Active (Mar 2026) | Good |
| fastembed | `npm i fastembed` | ~6 | Limited (7) | Yes | No | Archived Jan 2026 | Good (archived) |
| candle | N/A | N/A | N/A | N/A | N/A | No Node.js pkg | N/A |

---

## Gaps / follow-ups

* Direct Apple Silicon WASM vs Metal performance comparison for embedding workloads would clarify whether node-llama-cpp's Metal path outperforms transformers.js WASM.
* transformers.js v4 WebGPU support in Node.js (via Dawn) is experimental — worth monitoring for future CPU+GPU hybrid inference.
