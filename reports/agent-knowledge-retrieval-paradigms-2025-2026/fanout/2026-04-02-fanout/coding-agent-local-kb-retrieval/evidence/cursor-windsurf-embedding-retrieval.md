---
title: "Cursor & Windsurf: Embedding-Based Retrieval Pipelines"
type: evidence
dimension: D2
source_type: primary
confidence: high
date_collected: 2026-04-03
sources:
  - url: https://cursor.com/blog/secure-codebase-indexing
    title: "Securely indexing large codebases"
    type: official_blog
  - url: https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast
    title: "How Cursor Indexes Codebases Fast"
    type: blog
  - url: https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/
    title: "How Cursor Actually Indexes Your Codebase"
    type: blog
  - url: https://cursor.com/docs/cookbook/large-codebases
    title: "Large Codebases - Cursor Docs"
    type: official_docs
  - url: https://windsurf.com/cascade
    title: "Cascade - Windsurf"
    type: official_docs
  - url: https://markaicode.com/windsurf-flow-context-engine/
    title: "Understand Windsurf Flow: How the Context Engine Works"
    type: blog
  - url: https://forum.cursor.com/t/cannot-perform-codebase-indexing-with-bm25-when-using-codebase/50130
    title: "Cannot perform Codebase indexing with BM25 when using @Codebase"
    type: forum_post
---

# Cursor & Windsurf: Embedding-Based Retrieval Pipelines

## Cursor Architecture

### Indexing Pipeline

1. **Local chunking**: Files split into semantically meaningful pieces using tree-sitter (parses source code into syntax trees). Chunks align to logical boundaries (functions, classes) rather than arbitrary line counts.

2. **Merkle tree hashing**: Cursor computes a Merkle tree of hashes of all valid files. Cryptographic hash per file, folder hashes based on children. Every 10 minutes, checks for hash mismatches — only changed files get re-embedded.

3. **Embedding generation**: Chunks sent to Cursor servers. Cursor has **trained its own custom embedding model** — not off-the-shelf. Trained using agent session traces: when an agent works through a task, an LLM retroactively ranks what content would have been most helpful at each step. The embedding model is trained to align its similarity scores with those LLM-generated rankings. Emphasizes comments and docstrings.

4. **Vector storage**: Embeddings + metadata (start/end line numbers, file paths) stored in **Turbopuffer** — serverless high-performance search engine combining vector and full-text search backed by object storage.

### Privacy Architecture

- Only embeddings and metadata stored in cloud — source code never stored on Cursor servers
- File path obfuscation: each path component split by `/` and `.`, masked using secret key + 6-byte deterministic nonce
- "None of your code is stored in our databases. It's gone after the life of the request." — Cursor founder

### Two-Stage Retrieval

1. **Vector search**: Query embedded, sent to Turbopuffer for nearest-neighbor search finding semantically similar code chunks
2. **AI reranking**: Results re-ranked by a model for relevance

### @codebase Feature

- Queries without re-ranking: ~10-20 seconds latency
- With re-ranking: 20-30 second range
- Agent mode reads first 250 lines of a file, occasionally extending by another 250

### Instant Grep (Sparse N-Gram Index)

Cursor also maintains a separate **sparse n-gram index** for regex search, cutting regex search from **16.8 seconds to 13 milliseconds** on enterprise monorepos. Uses trigram-like variable-length substrings with deterministic weights, memory-mapped lookup tables, and disk-based postings. Syncs with Git commits and layers agent/user changes on top. Source: [cursor.com/blog/fast-regex-search](https://cursor.com/blog/fast-regex-search)

### Scale

Per Turbopuffer case study: **100B+ total vectors**, **10M+ active namespaces**, **10GB/s peak ingestion** (~1M docs/second). Tiered storage: S3/GCS at ~$0.02/GB, NVMe/RAM cache for active codebases. Cold query: ~500ms; warm: <10ms. Source: [turbopuffer.com/customers/cursor](https://turbopuffer.com/customers/cursor)

### Known Limitations

- **Indexing failures**: Previously fell back to BM25 when indexing failed; now requires successful embedding indexing
- **Context gaps**: Users report @codebase "doesn't add any files to context" even when indexed
- **Semantic vs lexical mismatch**: Searching for `getUserById` may return `findUserByEmail`, `updateUserProfile` — semantically similar but functionally wrong
- **Token limits**: Embedding models have finite token limits; large functions may lose cross-chunk context
- **Large codebases**: >100,000 files is complex and resource-intensive
- For files >600 lines, explicitly @-referencing files outperforms @codebase
- **Embedding reversibility**: Academic research indicates embeddings may be partially reversible, raising privacy concerns

## Windsurf (Codeium) Architecture

### Context Engine — "Flow"

Multi-layer context system with distinct components:

1. **RAG-based codebase indexing**: Builds local project index using embeddings generated locally (code used to generate embeddings locally; embeddings, not raw source, power retrieval)
2. **Cascade action tracking**: Tracks edits, commands, conversation history, clipboard, terminal commands to infer intent in real time
3. **Memories**: Persistent context across sessions
4. **.windsurfrules**: Project-specific instructions (equivalent to CLAUDE.md)

### Cascade — The Agentic Engine

Context assembly pipeline:
1. Load rules
2. Load relevant memories
3. Read open files
4. Run codebase retrieval (RAG)
5. Read recent actions
6. Assemble final prompt

### Key Differentiators

- Generates embeddings **locally by default** (768-dimensional vectors), unlike Cursor's cloud storage
- **Fast Context** powered by SWE-grep (Cognition's RL-trained models): 10x faster than standard agentic search
- **Memories** system for cross-session persistent context
- Proprietary **M-Query** retrieval technique (details undisclosed)

## Cursor vs Windsurf vs Claude Code — Architectural Comparison

| Dimension | Claude Code | Cursor | Windsurf |
|-----------|------------|--------|----------|
| Indexing | None | Cloud-side (Turbopuffer) | Local |
| Embedding model | None | Cloud/OpenAI | Local |
| Search mechanism | Grep/glob/read | Vector + rerank | RAG + action tracking |
| Setup required | None | Index build (minutes) | Local index build |
| Privacy | Full local | Path-obfuscated cloud | Full local |
| Staleness risk | None (live filesystem) | 10-min refresh cycle | Near-real-time |
| Latency | Multiple tool calls | 10-30s per query | Real-time context |
| Best for | Known patterns, refactoring | Semantic discovery, unfamiliar codebases | Contextual suggestions |
