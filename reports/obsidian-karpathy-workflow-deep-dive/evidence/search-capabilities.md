# Evidence: Obsidian Search Capabilities — Complete Inventory

## 1. Built-in Search (Core Plugin)

**Source:** https://help.obsidian.md/plugins/search

### Operators
| Operator | Function |
|----------|----------|
| `file:` | Match text in filename |
| `path:` | Match text in file path |
| `tag:` | Search for tag (e.g., `tag:#work`) |
| `line:` | Search within single lines |
| `block:` | Search within blocks |
| `section:` | Search within sections (heading-delimited) |
| `task:` | Search task items |
| `task-todo:` | Search uncompleted tasks |
| `task-done:` | Search completed tasks |
| `match-case:` | Force case-sensitive match |
| `ignore-case:` | Force case-insensitive match |

### Boolean Logic
- Implicit AND (space-separated terms)
- `OR` between terms
- `-` prefix for negation/exclusion
- `()` for grouping: `task:(call OR email)`
- Nested operators: `section:(tag:#important)`

### Regex
- `/[a-z]{3}/` forward-slash delimited regex
- Standard JavaScript regex syntax
- Works within operators: `file:/^2024/`

### Limitations
- No fuzzy matching in built-in search
- No BM25 or relevance ranking (results ordered by file modification time)
- No semantic/meaning-based search
- No programmatic API for search results (plugins can't easily consume results)
- Performance degrades with very large vaults (10K+ notes)
- No date range operator (must use regex or frontmatter search)

---

## 2. Omnisearch Plugin

**Source:** https://github.com/scambier/obsidian-omnisearch
**Stats:** Popular (exact stars not confirmed), actively maintained
**Engine:** MiniSearch library with BM25 scoring

### Features
- Fuzzy matching with smart weighting
- BM25 automatic document scoring
- PDF indexing (via Text Extractor)
- Image OCR indexing (via Text Extractor)
- `path:"somepath"` filter
- `ext:"png jpg"` filetype filter
- `"exact expressions"` in quotes
- Keyboard-navigable results with preview
- Quick switcher replacement

### What it adds over built-in
- ✅ Fuzzy matching (tolerates typos)
- ✅ BM25 relevance ranking
- ✅ PDF content indexing
- ✅ Image OCR indexing
- ❌ No semantic search
- ❌ No embedding-based similarity

---

## 3. Smart Connections Plugin

**Source:** https://github.com/brianpetro/obsidian-smart-connections
**Stats:** 4,400+ stars, 786K+ downloads
**Website:** https://smartconnections.app

### Architecture
- Local-first semantic search with on-device embeddings
- Default model: TaylorAI/bge-micro-v2 (384 dimensions)
- Supports 100+ models via APIs (Claude, Gemini, ChatGPT, Llama 3)
- Local models via Ollama supported

### Chunk-Level Retrieval
- **Note-level embeddings:** Full note as single vector
- **Block-level embeddings:** Paragraph/section-level vectors (configurable)
- Separate embedding models for note-level and block-level
- Minimum character threshold for embedding (configurable)
- "Context-aware" chunking based on headings and file path

### Chat Feature
- "Smart Chat" — Q&A against your vault
- RAG-like: retrieves relevant chunks, passes to LLM
- Source citations in responses

### Configuration
- Embedding model selection (local or cloud)
- Block embedding enable/disable
- Minimum embedding length
- Exclusion patterns
- Data reset capability

### Performance
- BGE-micro: ~3,000 notes in <10 minutes for initial indexing
- Incremental updates for changed notes
- Stored locally in vault

### Limitations
- No BM25/keyword search (semantic only)
- No hybrid retrieval built-in
- No reranking
- No metadata-filtered semantic search
- Search quality depends heavily on embedding model choice
- Block-level results can be noisy with small chunks

---

## 4. Obsidian Copilot (logancyang/obsidian-copilot)

**Source:** https://github.com/logancyang/obsidian-copilot
**Website:** https://www.obsidiancopilot.com

### Vault QA Feature
- RAG (Retrieval-Augmented Generation) for Q&A against notes
- Lexical search (always active, no index needed) — keyword-based, chunk retrieval
- Semantic search (optional) — vector embeddings via Orama database
- Supports: OpenAI, Google, Cohere, local models (Ollama)
- Source citations in responses

### Known Issues
- GitHub Issue #1799: "RAG hybrid search not choosing obvious candidates"
- Inconsistent results with nomic-embed-text embeddings
- Re-indexing doesn't always fix quality issues
- Hybrid configuration can perform worse than dense-only baseline when poorly tuned

---

## 5. Sonar Plugin (NEW — Feb 2026)

**Source:** https://forum.obsidian.md/t/ann-sonar-offline-semantic-search-and-agentic-ai-chat-for-obsidian-powered-by-llama-cpp/110765
**Author:** aviatesk
**Released:** February 3, 2026

### Architecture
- Fully offline via llama.cpp
- Default models: BGE-M3 (embeddings), BGE Reranker v2-m3 (reranking), Qwen3-8B (chat)
- All local, no API keys

### Hybrid Retrieval
- Vector embeddings + BM25 keyword matching
- Optional cross-encoder reranking for improved precision
- Automatic indexing of Markdown, PDFs, audio transcription

### Requirements
- 32GB+ RAM recommended
- GPU support (Metal/CUDA) recommended
- Significant resource requirements for default models

### Notable
- Only Obsidian plugin with built-in reranking
- Agentic AI chat with tool-use capabilities
- Extensible custom tools via JavaScript modules

---

## 6. Obsidian QMD Plugin

**Source:** https://github.com/thirteen37/obsidian-qmd (Obsidian plugin port of [QMD by Tobi Lutke](https://github.com/tobi/qmd), Shopify CEO)
**Stats:** Very new

### Hybrid Search
- BM25 full-text + semantic vector + query expansion
- all-MiniLM-L6-v2 embeddings (384 dimensions) via Transformers.js
- ~900-token chunks with 15% overlap, preferring markdown heading boundaries via scoring algorithm
- AST-aware chunking for code files
- Qwen3-Reranker-0.6B for LLM-based reranking
- Reciprocal Rank Fusion (RRF): `RRF_score = Σ (1 / (k + rank))` where k=60
- Position-aware blending: top results 75% RRF / 25% reranker, lower results 40% RRF / 60% reranker
- Entirely local, no external APIs

---

## 7. Hybrid Search MCP Server + CLI

**Source:** Obsidian Forum (flowing.abyss)
**Architecture:** External MCP server + CLI tool

### Triple-Path Retrieval
1. BM25 via SQLite FTS5 (title 10×, aliases 5×, content 1×)
2. Fuzzy trigram matching on titles/aliases
3. Semantic vector search (cosine similarity)
- Combined via Reciprocal Rank Fusion (RRF)

### Features
- Obsidian-specific: aliases, tags, folders indexed
- Graph traversal at configurable depths
- Real-time incremental indexing
- Single SQLite database at vault root
- Bundled multilingual embedding model
- Offline, no external dependencies

---

## Comparison Matrix

| Feature | Built-in | Omnisearch | Smart Connections | Copilot | Sonar | QMD | Hybrid MCP |
|---------|----------|------------|-------------------|---------|-------|-----|------------|
| Fuzzy match | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| BM25 ranking | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Semantic search | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reranking | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Hybrid (BM25+semantic) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Block-level chunks | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| PDF indexing | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| OCR (images) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fully local | ✅ | ✅ | ✅* | ❌* | ✅ | ✅ | ✅ |
| MCP integration | ❌ | ❌ | via mcp-tools | ❌ | ❌ | ❌ | ✅ |
| Q&A / RAG | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |

*Smart Connections supports local models but defaults to cloud. Copilot requires cloud models for chat.
