---
title: "Context7 (Upstash): MCP Server for Library Documentation"
dimension: D3
facet: "MCP-native documentation retrieval for coding agents"
collected: 2026-04-03
confidence: high
---

# Context7 by Upstash

## What It Is

Documentation delivery platform exposing library docs to AI coding assistants via MCP. Built by Upstash (serverless Redis/Kafka/Vector company).

Core idea: Instead of LLMs relying on stale training data, agents call Context7 at inference time for current, version-specific documentation.

- **Open source (MIT)**: MCP server, CLI, SDK, AI SDK integration -- [github.com/upstash/context7](https://github.com/upstash/context7)
- **Proprietary**: API backend, parsing engine, crawling engine, vector DB infrastructure
- **Published packages**: `@upstash/context7-mcp` (v2.1.6), `@upstash/context7-sdk`, `ctx7` CLI

## MCP Interface: Two Tools

| Tool | Input | Output |
|------|-------|--------|
| `resolve-library-id` | Library name string (e.g., "next.js") | Context7-compatible library ID (e.g., `/vercel/next.js`) |
| `query-docs` | Library ID + topic query | Reranked, deduplicated markdown snippets |

**Agent flow**: Developer prompt -> agent calls `resolve-library-id` -> calls `query-docs` -> snippets injected into LLM context -> grounded code generation.

**Rate limiting**: Max 3 tool calls per question to prevent context stuffing.
**Transports**: stdio (local) and HTTP with SSE (remote).

Source: [DeepWiki Architecture](https://deepwiki.com/upstash/context7)

## Technical Architecture

**Processing pipeline** (5 stages):
1. **Parse** -- Extract code snippets from documentation
2. **Enrich** -- Add explanations via LLMs (Claude Opus, Gemini Pro as "jury" models)
3. **Vectorize** -- Embed content using Upstash Vector (DiskANN algorithm)
4. **Rerank** -- LLM-based reranking for relevance
5. **Cache** -- Redis for performance

**Underlying vector DB**: Upstash Vector using DiskANN/FreshDiskANN -- indexes on disk, hybrid in-memory transient + disk persistent index. Supports cosine similarity, Euclidean, dot product.

**Quality stack** (6 mechanisms): source reputation scoring, benchmark scoring, LLM model benchmarking, injection prevention, user feedback, library ownership config.

Sources: [Upstash Blog - Quality Stack](https://upstash.com/blog/context7-quality), [Upstash Vector Docs](https://upstash.com/docs/vector/overall/whatisvector)

## Adoption

| Metric | Value |
|--------|-------|
| GitHub stars | ~51,600 |
| npm downloads (total) | 8M+ |
| Weekly npm downloads | 240K+ |
| Indexed libraries | 33,000+ |
| Supported AI assistants | 30+ |
| Contributors | 114 |

One of the most-starred MCP servers. Thoughtworks Technology Radar: "Trial" status.

## Security Incident: ContextCrush (Patched)

- **Discovered**: Feb 18, 2026 by Noma Security
- **Attack**: Malicious instructions injected via "Custom Rules" field in open library registry
- **Impact**: Credential theft (.env exfil), data exfiltration, file deletion on victim machines
- **Fixed**: Feb 23, 2026
- Highlights structural risk in MCP servers aggregating third-party content

Source: [Noma Security Report](https://noma.security/blog/contextcrush-context7-the-mcp-server-vulnerability/)

## Limitations

1. Cloud dependency -- every query routes through Upstash servers, no offline mode
2. Indexing lag -- days for bleeding-edge releases
3. Free tier reduced from ~6K to 1K requests/month (Jan 2026)
4. Proprietary backend -- cannot self-host full system
5. Only library documentation -- no arbitrary content types

## Implications for Agent-Native KB Design

1. **The two-tool MCP pattern** (resolve entity -> query content) is clean and proven at scale
2. **Pre-chunked, reranked snippets** beat raw web pages for token efficiency
3. **The ContextCrush vulnerability** is a warning: any MCP server serving third-party content needs injection prevention
4. Context7 proves the model: specialized, curated retrieval via MCP outperforms general web search for domain-specific knowledge
5. For a KB MCP server, the same pattern applies: resolve article -> return relevant snippets, not whole articles
