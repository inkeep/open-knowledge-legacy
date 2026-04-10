---
title: "Chroma Developer Experience & Extensibility Evidence"
source_type: primary
collection_date: 2026-04-02
sources:
  - url: https://docs.trychroma.com/
    type: documentation
  - url: https://docs.trychroma.com/reference/chroma-reference
    type: api_reference
  - url: https://pypi.org/project/chromadb/
    type: package_registry
  - url: https://github.com/chroma-core/chroma
    type: github
  - url: https://cookbook.chromadb.dev/
    type: documentation
---

# Chroma Developer Experience & Extensibility Evidence

## SDK Support
First-party clients for:
- **Python**: `pip install chromadb`
- **JavaScript/TypeScript**: `npm install chromadb` (v3 released June 2025)
- **Go**: Available
- **Rust**: Available (Chroma core is now Rust)

## API Design Philosophy
"The core API is only 4 functions" -- extreme simplicity:
```python
import chromadb
client = chromadb.Client()
collection = client.create_collection("my_collection")
collection.add(documents=["doc1", "doc2"], ids=["id1", "id2"])
results = collection.query(query_texts=["search query"], n_results=2)
```

When only documents are provided (no embeddings), Chroma auto-generates embeddings using the collection's embedding function.

## Default Embedding
Default embedding function: Onnx Runtime with all-MiniLM-L6-v2 model. No external API calls needed for basic usage.

## API Documentation
- Full reference docs at docs.trychroma.com/reference
- Swagger REST API docs available at http://localhost:8000/docs when running server
- OpenAPI specification available for generating clients in other languages
- Chroma Cookbook at cookbook.chromadb.dev with practical guides

## Embedding Function Flexibility
Configurable embedding providers:
- Default (all-MiniLM-L6-v2 via Onnx)
- OpenAI
- Cohere
- Hugging Face
- Jina
- VoyageAI
- Roboflow
- Custom implementations

## Getting Started Experience
- Zero-config local mode: `import chromadb; client = chromadb.Client()` starts in-memory
- Persistent mode: `client = chromadb.PersistentClient(path="./chroma_data")`
- Cloud mode: `client = chromadb.CloudClient(tenant="...", database="...")`
- No external dependencies needed for basic usage (default embedding built in)

## Integration Ecosystem
**AI Frameworks:**
- LangChain (Python + JS) -- first-class integration
- LlamaIndex -- vector store integration
- CrewAI -- supported as vector backend
- Google ADK -- Chroma MCP tool
- Haystack -- integration available

**MCP Servers:**
- Official: chroma-core/chroma-mcp
- Package Search MCP: hosted at mcp.trychroma.com
- Community: djm81/chroma_mcp_server (Cursor-focused)

**Data Connectors (via Sync):**
- GitHub repositories
- S3 buckets
- Web pages (crawl + scrape)

## Developer Workflow
1. Install package
2. Create client (in-memory, persistent, HTTP, or cloud)
3. Create collection
4. Add documents (auto-embedded) or pre-computed embeddings
5. Query by text similarity, full-text, regex, or metadata filters

No complex configuration, schema design, or infrastructure setup needed for development.

## Limitations / Developer Friction Points
- No web UI for browsing collections or data (purely CLI/SDK)
- Collection management is programmatic only
- No visual query builder or exploration tool
- Debugging requires API calls -- no built-in data inspector
- Multi-tenancy requires application-level implementation for advanced patterns
