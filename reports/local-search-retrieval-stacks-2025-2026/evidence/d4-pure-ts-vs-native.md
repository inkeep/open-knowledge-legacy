# Evidence: Pure TypeScript vs Native Modules for Search

**Dimension:** D6 — Portability/performance trade-offs, transformers.js, WASM options
**Date:** 2026-04-03
**Sources:** npm packages, HuggingFace docs, ONNX Runtime GitHub, benchmark articles

---

## Key files / pages referenced

- [transformers.js docs](https://huggingface.co/docs/transformers.js/index) — v3/v4 documentation
- [transformers.js v4 blog](https://huggingface.co/blog/transformersjs-v4) — WebGPU rewrite
- [onnxruntime-node npm](https://www.npmjs.com/package/onnxruntime-node) — ~220MB prebuilt
- [onnxruntime-web npm](https://www.npmjs.com/package/onnxruntime-web) — ~138MB WASM
- [ONNX Runtime #11181](https://github.com/microsoft/onnxruntime/issues/11181) — WASM 11-17x slower than native
- [transformers.js #1406](https://github.com/huggingface/transformers.js/issues/1406) — WASM in Node.js feature request
- [SitePoint WebGPU vs WASM](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/) — benchmarks
- [SitePoint Optimizing transformers.js](https://www.sitepoint.com/optimizing-transformers-js-production/) — memory
- [TF.js WASM blog](https://blog.tensorflow.org/2020/03/introducing-webassembly-backend-for-tensorflow-js.html) — WASM 10-30x faster than pure JS
- [better-sqlite3 benchmarks](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/benchmark.md)
- [node-sqlite3-wasm](https://github.com/tndrle/node-sqlite3-wasm) — WASM SQLite
- [Orama Vector Search docs](https://docs.orama.com/docs/orama-js/search/vector-search) — BYO embeddings

---

## Findings

### Finding: No performant pure-JS embedding solution exists
**Confidence:** CONFIRMED
**Evidence:** [TF.js blog](https://blog.tensorflow.org/2020/03/introducing-webassembly-backend-for-tensorflow-js.html)

`@tensorflow/tfjs-backend-cpu` is the only pure-JS option. It is 10-30x slower than WASM and 100-500x slower than native for ML inference. Not viable for real-time embedding generation.

**Implications:** Any "pure TS" hybrid search stack must either (a) accept impractical embedding speeds, (b) use pre-computed embeddings from an external source, or (c) accept a native/WASM dependency for the embedding layer.

### Finding: Orama + transformers.js is the practical "zero compilation" stack
**Confidence:** CONFIRMED
**Evidence:** [Orama GitHub](https://github.com/oramasearch/orama), [onnxruntime-node npm](https://www.npmjs.com/package/onnxruntime-node)

Orama: genuinely pure TS, zero native deps. transformers.js: uses `onnxruntime-node` which ships prebuilt binaries (no node-gyp, no C++ toolchain). Together: `npm install @orama/orama @huggingface/transformers`. Total: ~220MB for onnxruntime-node + 23MB model download.

### Finding: WASM is a real middle ground but awkward in Node.js for embeddings
**Confidence:** CONFIRMED
**Evidence:** [transformers.js #1406](https://github.com/huggingface/transformers.js/issues/1406)

transformers.js auto-selects `onnxruntime-node` (native) in Node.js, `onnxruntime-web` (WASM) in browsers. Using WASM in Node.js is an open feature request, not officially supported. WASM is 11-17x slower than native for ONNX inference.

### Finding: For search engines specifically, WASM options are immature
**Confidence:** CONFIRMED
**Evidence:** Searched for tantivy-wasm, tinysearch, stork-search

tantivy-wasm is a demo/POC (browser-targeted). No mature WASM-compiled general-purpose search engine for Node.js exists. Orama (pure TS) is strictly better than any WASM search engine.

### Finding: At 1000 documents, the pure TS vs native distinction barely matters
**Confidence:** CONFIRMED
**Evidence:** Synthesized from D5 benchmarks

All engines handle 1K docs trivially. Embedding 1K docs at 20ms/sentence native = ~80-100s build time (acceptable). Even WASM at 11-17x slower = ~15-30 min build time (tolerable for a one-time operation). The critical path is search latency, where Orama is sub-50ms regardless.

### Finding: transformers.js v4 is the current stable version with improved performance
**Confidence:** CONFIRMED
**Evidence:** [v4 blog](https://huggingface.co/blog/transformersjs-v4)

Released Feb 2026. Major WebGPU rewrite, 10x faster build times, 53% smaller bundle. Maintained by Hugging Face. Supports q4/q8/fp16/fp32 quantized models. Offline mode via `env.localModelPath`. all-MiniLM-L6-v2: 384-dim, ~23MB quantized.

### Finding: onnxruntime-node has prebuilt Apple Silicon binaries (no compilation)
**Confidence:** CONFIRMED
**Evidence:** [onnxruntime #15226](https://github.com/microsoft/onnxruntime/issues/15226)

arm64 binaries available since v1.10. Downloads from CDN at install time. No node-gyp. Works on macOS M1/M2/M3/M4.

---

## Trade-off Matrix

| Path | Portability | Embed Perf | Search Perf | Install Size | Compilation |
|------|------------|-----------|-------------|-------------|-------------|
| Pure TS (Orama + tfjs-cpu) | 10/10 | 100-500x slower | Sub-50ms | Small | None |
| Prebuilt (Orama + transformers.js) | 8/10 | Fast (~sub-1ms/sentence native) | Sub-50ms | ~220MB | None |
| WASM (Orama + onnxruntime-web) | 9/10 | 11-17x slower than native | Sub-50ms | ~138MB | None |
| Full native (better-sqlite3 + sqlite-vec) | 6/10 | Fastest | 1-3ms hybrid | ~30MB | Possible fallback |

---

## Gaps / follow-ups

* transformers.js WASM-in-Node.js support (Issue #1406) could change this analysis if shipped
* No benchmarks for onnxruntime-node specifically on Apple Silicon M-series
