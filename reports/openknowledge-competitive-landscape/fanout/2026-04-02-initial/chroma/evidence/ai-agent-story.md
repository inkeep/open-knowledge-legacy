---
title: "Chroma AI/Agent Story Evidence"
source_type: primary
collection_date: 2026-04-02
sources:
  - url: https://github.com/chroma-core/chroma-mcp
    type: github
  - url: https://www.trychroma.com/package-search
    type: product_page
  - url: https://www.trychroma.com/research/context-1
    type: research
  - url: https://playbooks.com/mcp/chroma
    type: integration
  - url: https://docs.trychroma.com/
    type: documentation
---

# Chroma AI/Agent Story Evidence

## Official MCP Server (chroma-core/chroma-mcp)

Chroma maintains a first-party MCP server at github.com/chroma-core/chroma-mcp.

### 12 Tools Exposed
**Collection Management:**
- Create collection
- List collections
- Peek at collection
- Get collection info/count
- Modify collection
- Delete collection

**Document Operations:**
- Add documents
- Query documents
- Get documents
- Update documents
- Delete documents

**Search:**
- Semantic search via vector operations
- Full-text search
- Metadata filtering

### Client Types Supported
- Ephemeral (in-memory)
- Persistent (file-based storage)
- HTTP (self-hosted Chroma instances)
- Cloud (Chroma Cloud integration)

### Configuration
Supports CLI arguments, environment variables, and .env files.

### Embedding Functions
Configurable embedding providers: default (all-MiniLM-L6-v2), Cohere, OpenAI, Jina, VoyageAI, Roboflow.

## Package Search MCP
Separate MCP server for coding agents. Hosted at https://mcp.trychroma.com/package-search/v1.

**Supported registries:** NPM, PyPI, Go, Crates.io, RubyGems, Terraform

**Three tools:**
1. `package_search_hybrid` - Vector-based semantic search ($4.50/1K embeddings + $0.50/1K queries)
2. `package_search_grep` - Source code text search ($0.50/1K queries)
3. `package_search_read_file` - Direct file retrieval ($0.50/1K queries)

## Context-1: Agentic Search Model
20B parameter model purpose-built for multi-turn retrieval tasks.

**Key positioning quote**: Functions as a specialized search agent that "produces a ranked list of documents relevant to satisfying the query" rather than answering questions directly.

**Self-editing innovation**: Model actively discards tangential documents mid-search using a `prune_chunks` tool that "removes specified chunks from the model's view" to free capacity.

**Strategic significance**: This positions Chroma as building agent infrastructure, not just a database. The model separates retrieval from generation -- returns documents to downstream reasoning models.

## Framework Integrations
- **LangChain**: First-class integration (Python and JS)
- **LlamaIndex**: Vector store integration
- **CrewAI**: Usable as vector store backend
- **Google ADK**: Chroma MCP tool for Agent Development Kit
- **OpenAI**: Client integration via MCP

## Agent Memory Positioning
The MCP server is described as providing "a standardized bridge to a persistent, searchable memory" that "empowers engineers to move beyond simple prompt-and-response bots and start creating true AI agents that can learn, remember, and interact with data in a meaningful way."

This is explicitly agent-memory framing, not knowledge-management framing.

## Third-Party MCP Servers
Multiple community MCP servers also exist:
- djm81/chroma_mcp_server (for Cursor integration)
- Various community wrappers

## What This Means for Agent-Native Knowledge
Chroma is positioning as "memory infrastructure for AI agents" -- a plumbing layer. Their MCP server provides CRUD operations on collections/documents, not knowledge authoring or curation tools. There is no concept of:
- Human-in-the-loop knowledge curation
- Knowledge quality or trust scoring
- Collaborative knowledge building
- Content editing workflows
- Structured knowledge organization beyond collections + metadata
