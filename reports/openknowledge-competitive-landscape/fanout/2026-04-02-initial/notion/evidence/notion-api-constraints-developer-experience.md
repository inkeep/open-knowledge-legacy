---
title: "Notion API Constraints and Developer Experience"
type: technical-analysis
created: 2026-04-02
---

# Notion API Constraints and Developer Experience

## Sources
- https://developers.notion.com/reference/request-limits
- https://developers.notion.com/reference/search-optimizations-and-limitations
- https://developers.notion.com/docs/getting-started
- https://dev.to/brainhubeu/make-notion-search-great-again-notion-api-55pp
- https://thomasjfrank.com/how-to-handle-notion-api-request-limits/

## Rate Limits
- **3 requests per second** per integration (average; brief spikes allowed)
- HTTP 429 with `Retry-After` header when exceeded
- Rate limits may change; tiered limits for different subscription levels possible
- No built-in rate limiter in the API; caller must implement

## Size Constraints
- Max 1,000 block elements per request
- Max 500KB total payload size
- Text content: 2,000 characters per block
- URLs: 2,000 characters
- Email: 200 characters
- Phone: 200 characters
- Equation expressions: 1,000 characters
- Multi-select options: 100 max
- Relations: 100 related pages
- People mentions: 100 users
- Rich text arrays: 100 elements
- Pagination: max 100 results per page

## Nesting Limits
- API allows max **2 levels of nested children** arrays per request
- Max 100 blocks in any individual array

## Search API Limitations
- Search indexing is NOT immediate (pages may not appear right after sharing)
- Cannot reliably enumerate all accessible documents
- Not suited for filtering within a database (use Query a Data Source instead)
- Best for querying pages/databases by name

## SDK Ecosystem
- **Official**: JavaScript/TypeScript SDK (`@notionhq/client`)
- **Community**: Python SDK (`notion-sdk-py` by ramnes on GitHub)
- No official Go, Rust, Java, or other SDKs

## Integration Model
- Two types: Internal (private) and Public (OAuth-based)
- Internal: API token per workspace
- Public: OAuth 2.0 flow
- Webhook support for real-time change notifications
- No plugin/extension model for the Notion UI itself

## Developer Pain Points (from community sources)
1. Reconstructing a full page requires recursive API calls at every nesting level
2. Pagination at every level of the block tree
3. 3 req/s rate limit is among the tightest in the SaaS ecosystem
4. 429 errors common at scale; silent pagination failures
5. Deeply nested content is painful to work with via API
6. No concept of "diff" or "delta" -- must re-fetch to detect changes (webhooks help but are coarse)

## API Versioning
- Current: 2025-09-03
- Major breaking change: database -> data source migration
- Semantic versioning by date

## Implications for Agent-Native Knowledge Platforms

The 3 req/s rate limit and 2-level nesting constraint make Notion's API poorly suited for heavy agent workloads that need to read/write large volumes of content programmatically. The search API's non-immediate indexing is a significant limitation for real-time agent workflows. A platform built on git+markdown sidesteps all of these constraints -- agents can read/write files directly at filesystem speed with no rate limits, full-text search is instant via local indexing, and content diffs are native to git.
