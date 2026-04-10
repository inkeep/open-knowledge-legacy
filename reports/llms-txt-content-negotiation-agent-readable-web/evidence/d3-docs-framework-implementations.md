# Evidence: Docs Framework Implementations

**Dimension:** D3 — How Fumadocs, Mintlify, Fern, Docusaurus, others implement llms.txt + content negotiation
**Date:** 2026-04-07
**Sources:** Fumadocs OSS source, Mintlify docs/blog, Fern docs, Docusaurus plugins, Starlight plugin, VitePress plugins, GitBook docs, ReadMe docs

---

## Summary Matrix

| Framework | llms.txt | llms-full.txt | Content Negotiation | MCP Server | SKILL.md | Level |
|---|---|---|---|---|---|---|
| **Fumadocs** | Yes (code) | Yes (code) | Yes (Accept header + rewritePath) | No | Yes | Code-level (OSS) |
| **Mintlify** | Yes (auto) | Yes (auto) | Yes (Accept + Link + X-Llms-Txt headers) | No | No | Platform |
| **Fern** | Yes (auto) | Yes (auto, w/ query params) | Yes (Accept header) | Yes (auto) | No | Platform |
| **GitBook** | Yes (auto) | Yes (auto) | No (uses .md URLs) | Yes (auto) | No | Platform |
| **ReadMe** | Yes (auto) | Unconfirmed | No (uses .md URLs) | Yes (auto) | No | Platform |
| **Docusaurus** | Plugin (4+) | Plugin | No | No | No | Plugin/build-time |
| **Starlight** | Plugin | Plugin (+small.txt) | No | No | No | Plugin/build-time |
| **VitePress** | Plugin (2) | Plugin | No | No | No | Plugin/build-time |

## Key Findings

### Fumadocs is the only OSS framework with code-level content negotiation
**Confidence:** CONFIRMED (source code verified)
`isMarkdownPreferred(request)` checks Accept header. `rewritePath()` rewrites URLs. remark-llms plugin converts MDX to clean markdown. Per-page `.mdx` endpoint returns Content-Type: text/markdown.

### Fern is most feature-rich overall
**Confidence:** CONFIRMED
Unique: `<llms-only>` / `<llms-ignore>` content tags, query params (?lang=python), AI analytics dashboard, auto-generated MCP servers.

### Mintlify leads in header-based discoverability
**Confidence:** CONFIRMED
Sends Link and X-Llms-Txt headers on EVERY response. Prepends llms.txt index blockquote to all markdown pages.

### Platforms provide zero-config; OSS frameworks rely on community plugins
**Confidence:** CONFIRMED
Mintlify/Fern/GitBook: zero config. Docusaurus/Starlight/VitePress: community plugins, build-time only, no runtime content negotiation.
