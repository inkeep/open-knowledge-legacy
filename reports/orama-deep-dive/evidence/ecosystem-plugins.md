# Evidence: Orama Ecosystem and Plugins

**Dimension:** D7 — The Orama ecosystem and plugins
**Date:** 2026-04-02
**Sources:** Orama source code (github.com/askorama/orama), npm

---

## Key files referenced

- `packages/` directory — all 19 packages in the monorepo
- Individual plugin package.json files for descriptions and versions

---

## Findings

### Finding: Orama monorepo contains 19 packages
**Confidence:** CONFIRMED
**Evidence:** `ls packages/`

Complete package inventory:

| Package | Description |
|---------|------------|
| `orama` | Core search engine (the main package) |
| `plugin-data-persistence` | Serialize/deserialize Orama databases (JSON, binary, dpack, seqproto) |
| `plugin-embeddings` | Auto-generate embeddings using TensorFlow.js Universal Sentence Encoder (512-dim) |
| `plugin-secure-proxy` | Generate embeddings via Orama Cloud proxy (hides API keys from browser) |
| `plugin-analytics` | Send search analytics to Orama Cloud |
| `plugin-match-highlight` | Track token positions for search result highlighting |
| `plugin-docusaurus` | Docusaurus v2 integration for local search |
| `plugin-docusaurus-v3` | Docusaurus v3 integration for local search |
| `plugin-astro` | Astro integration |
| `plugin-nextra` | Nextra (Next.js docs framework) integration |
| `plugin-vitepress` | VitePress integration |
| `plugin-parsedoc` | Parse HTML/Markdown documents into Orama-compatible format |
| `plugin-pt15` | Performant search algorithm optimized for descriptive texts |
| `plugin-qps` | Another performant search algorithm variant |
| `stemmers` | Stemmers for 30 languages (separate package to keep core small) |
| `stopwords` | Stop words for 30+ languages |
| `tokenizers` | Additional tokenizers (Japanese, Mandarin Chinese) |
| `switch` | Unified interface for Orama JS, Orama Cloud, and OramaCore |

### Finding: plugin-embeddings uses TensorFlow.js USE — not @huggingface/transformers
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-embeddings/src/index.ts` (line 2)

```typescript
import { load as loadModel } from '@tensorflow-models/universal-sentence-encoder'
```

This produces 512-dim vectors. Quality is significantly lower than bge-small-en-v1.5 (384-dim) via @huggingface/transformers.

### Finding: plugin-secure-proxy is a cloud-dependent embedding/chat gateway
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-secure-proxy/src/index.ts` — requires `@oramacloud/client` and an Orama Cloud API key. Routes embedding and chat (LLM) requests through Orama's proxy to protect API keys in browser environments.

### Finding: plugin-analytics sends search telemetry to Orama Cloud
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-analytics/src/index.ts` — collects search queries, result counts, and round-trip times. Flushes batched events to an Orama Cloud endpoint. Requires apiKey and indexId.

### Finding: @orama/stemmers provides stemmers for 30 languages as separate imports
**Confidence:** CONFIRMED
**Evidence:** `packages/stemmers/lib/` — individual files for am, ar, bg, de, dk, en, es, fi, fr, gr, hu, id, ie, in, it, lt, nl, no, np, pt, ro, rs, ru, se, sk, ta, tr, uk, and more.

Core Orama only bundles the English stemmer. Other languages require `@orama/stemmers`.

### Finding: @orama/tokenizers provides Japanese and Mandarin Chinese tokenizers
**Confidence:** CONFIRMED
**Evidence:** `packages/tokenizers/src/` — `japanese.ts`, `mandarin.ts`, `index.ts`

These languages need specialized tokenization (word segmentation) beyond regex splitting.

### Finding: Orama Cloud is a separate commercial product — NOT the OSS package
**Confidence:** CONFIRMED
**Evidence:** Web search results. Orama Cloud provides: managed search infrastructure, automatic embedding generation, webhook-based index management, analytics dashboard. The @orama/switch package lets you swap between OSS and Cloud backends.

### Finding: OramaCore is a separate Rust-based server runtime (NOT the JS library)
**Confidence:** CONFIRMED
**Evidence:** github.com/oramasearch/oramacore — "OramaCore is the complete runtime you need for your projects, answer engines, copilots, and search." Written in Rust. This is the server-side product that powers Orama Cloud.

---

## Community plugins / integrations

### Finding: fastify-orama exists as a community plugin
**Confidence:** CONFIRMED
**Evidence:** github.com/mateonunez/fastify-orama — "Orama search-engine plugin for Fastify"

### Finding: No official React component library — Orama is headless
**Confidence:** INFERRED
**Evidence:** No React package in the monorepo. Orama is a data layer; UI is consumer's responsibility. Fumadocs and Docusaurus plugins include their own search UI.

---

## Gaps / follow-ups

- No official MCP server plugin
- No CRDT/Yjs integration plugin
- No filesystem watcher plugin
- plugin-embeddings is outdated (TF.js USE) — consumers should use @huggingface/transformers directly
