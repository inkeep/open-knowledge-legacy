# Evidence: D3 — MCP / Agent Integration Deep Dive

**Dimension:** Technical depth on MCP server, ChromaFs, skill.md, llms.txt, content negotiation
**Date:** 2026-04-02
**Sources:** Mintlify MCP docs, ChromaFs blog, skill.md docs, llms.txt docs, content negotiation blog

---

## Key pages referenced
- https://www.mintlify.com/docs/ai/model-context-protocol — MCP server documentation
- https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant — ChromaFs architecture
- https://www.mintlify.com/docs/ai/skillmd — skill.md specification
- https://www.mintlify.com/docs/ai/llmstxt — llms.txt specification
- https://www.mintlify.com/blog/context-for-agents — Content negotiation details

---

## Findings

### Finding: MCP server exposes exactly two read-only tools with well-defined parameters
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/ai/model-context-protocol

**Tool 1: Search**
- Description: "Searches across your documentation to find relevant content, returning snippets with titles and links"
- Parameters:
  - `pageSize`: 1-50 results (default 10)
  - `scoreThreshold`: 0-1 relevance filtering
  - `version`: Target specific doc versions (e.g., 'v0.7')
  - `language`: Filter by language code ('en', 'zh', 'es')

**Tool 2: Get Page**
- Description: "Retrieves the full content of a specific documentation page by its path"
- Parameters:
  - `page`: Documentation path (sourced from search results)

**Rate limits:**
| Category | Limit |
|----------|-------|
| Per-user (IP-based) | 5,000 req/hr |
| Search (domain-wide) | 10,000 req/hr |
| Get Page (domain-wide) | 10,000 req/hr |
| Authenticated search | 5,000 req/hr |
| Authenticated retrieval | 5,000 req/hr |

**Auth model:**
- Public docs: No auth required; `/mcp` endpoint
- Partial auth: `/mcp` (public) + `/authed/mcp` (user-scoped via OAuth)
- Full auth: OAuth required; MCP scoped to user permissions via user groups

**Content indexing:** Indexes pages in docs.json navigation. Hidden pages need `seo.indexing: all`. Pages excluded via `noindex: true` frontmatter or `.mintignore`.

### Finding: MCP server CAN be used for agent Q&A but only for retrieval
**Confidence:** CONFIRMED
**Evidence:** MCP documentation + rate limits

An agent can:
1. Search documentation (semantic search via Trieve)
2. Retrieve full page content
3. Reason over the content client-side (agent's own LLM)

An agent CANNOT:
- Create new pages
- Update existing pages
- Delete pages
- Suggest edits
- Provide feedback
- Track which content was useful

The MCP server is a read-only documentation API. For Q&A against ~100 articles (~400K words, Karpathy's scale), the rate limits (5K req/hr per user) are generous. But the search is limited to what's in the docs — no custom embedding, no user-defined similarity, no raw source search.

### Finding: ChromaFs is a sophisticated virtual filesystem, but internal to Mintlify's AI Assistant
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant

**Architecture:**
- Built on just-bash (Vercel Labs TypeScript bash reimplementation)
- Implements `IFileSystem` interface
- Intercepts UNIX commands (grep, cat, ls, find, cd) and translates to Chroma DB queries

**Bootstrap:** Complete file tree stored as gzipped JSON (`__path_tree__`) in Chroma collection. On init, decompressed into:
- `Set<string>` of all file paths
- `Map<string, string[]>` of directory -> children

**Grep optimization:** Two-stage: (1) coarse Chroma query for matching slugs, (2) bulk prefetch to Redis, (3) in-memory regex execution.

**Access control:** Path tree pruned per user session token before building. Files excluded from tree are invisible to agents.

**Read-only:** All writes throw EROFS. Stateless — no session cleanup needed.

**Performance:** P90 boot ~100ms (vs ~46s for sandbox). Marginal cost ~$0/conversation (vs $0.0137 for sandbox). At 850K monthly conversations, saves ~$70K+/year.

**CRITICAL: ChromaFs is NOT externally accessible.** It is an internal implementation detail of Mintlify's AI Assistant. There is no API to ChromaFs. External agents cannot use it. It powers the embedded chat widget, not the MCP server.

### Finding: skill.md is auto-generated with rich agent-oriented content
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/ai/skillmd

**Format:**
- Served at `/.well-known/skills/default/skill.md` and `/skill.md`
- Follows agentskills.io 0.2.0 specification
- YAML frontmatter: name, description, license, compatibility, metadata, allowed-tools

**Auto-generated sections:**
1. Metadata (project name, description, version)
2. Capabilities (what agents can accomplish)
3. Skills (category-organized actions)
4. Workflows (step-by-step procedures)
5. Integration (supported tools/services)
6. Context (product architecture background)

**Discovery:** Two endpoints:
1. `/.well-known/agent-skills/` — agent-skills 0.2.0 spec with SHA256 integrity verification
2. `/.well-known/skills/` — simpler format without crypto verification

**Generation:** Auto-regenerated on every docs update. Can take up to 24 hours. Custom override by placing skill.md in repo root.

**Installable:** `npx skills add https://mintlify.com/docs` — installable into 20+ coding agents.

### Finding: llms.txt provides structured page index with machine-optimized format
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/ai/llmstxt

**Format:** Plain Markdown with H1 site title, structured sections with links and descriptions.

**Structure:**
```
# Site title
## Docs
- [Page Name](url.md): Description (from frontmatter, truncated at 300 chars)
## OpenAPI Specs
- [openapi](url.json)
## AsyncAPI Specs
- [asyncapi](url.yaml)
```

**Two files:**
- `/llms.txt` — Page index with links and descriptions
- `/llms-full.txt` — Complete site content in single file

**HTTP discovery headers:**
- `Link: </llms.txt>; rel="llms-txt", </llms-full.txt>; rel="llms-full-txt"`
- `X-Llms-Txt: /llms.txt`

**Auth-aware:** Excludes user-group-gated pages. Requires auth for authenticated sites.

**Customizable:** Place custom files in repo root to override auto-generation.

### Finding: Content negotiation serves markdown to agents with 30x token reduction
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/context-for-agents

When a request includes `Accept: text/markdown`:
- Response body is clean Markdown (not HTML)
- Prepended with llms.txt index for context
- 30x reduction in token usage vs HTML
- Link and X-Llms-Txt headers on ALL responses (including HTML)

This is automatic for all Mintlify docs sites. No configuration required.

---

## Negative searches

* Searched: "ChromaFs API external access" — Not externally accessible
* Searched: "Mintlify MCP write create update" — No write tools in MCP server
* Searched: "Mintlify MCP response format JSON" — Response format not documented in detail

---

## Gaps / follow-ups

* Exact response format of MCP Search results (JSON schema) not publicly documented
* Whether the MCP server uses Trieve search or a simpler index is not explicitly confirmed in docs
* ChromaFs source code availability — the blog describes architecture but code is not open-sourced
