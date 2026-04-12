# Evidence: E3 — ChromaFs Productization Status

**Dimension:** ChromaFs productization status
**Date:** 2026-04-11
**Sources:** npm registry, PyPI, GitHub mintlify org, docs.mintlify.com, modelcontextprotocol.io, mintlify.com/blog

---

## Key pages referenced

- https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant — Original ChromaFs blog (Mar 24)
- https://www.mintlify.com/docs/guides/assistant — Assistant product docs
- https://www.mintlify.com/docs/ai/model-context-protocol — MCP docs
- https://modelcontextprotocol.io/ — MCP specification site

---

## Findings

### Finding: ChromaFs has NOT been released as an external SDK, library, or API
**Confidence:** CONFIRMED
**Evidence:** Direct registry checks

- `npm view @mintlify/chromafs` → HTTP 404
- `npm search chromafs` → zero results
- PyPI search "chromafs" → no packages
- GitHub mintlify org (26 repositories) → no chromafs, chroma-fs, or filesystem variant repo
- GitHub search `mintlify chromafs` → only unrelated virtual filesystem repos

No SDK, library, or API release announced since March 24 blog.

### Finding: ChromaFs runs on ALL Mintlify-hosted customer docs sites, transparently
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant

The blog states: "Try it on any Mintlify docs site, or at mintlify.com/docs." ChromaFs powers the Assistant widget deployed across all customer documentation sites. Customers get the benefit of ChromaFs but cannot access, configure, or extend it. The assistant docs at mintlify.com/docs/guides/assistant make no mention of ChromaFs as a configurable surface.

### Finding: No customer-facing documentation for ChromaFs exists
**Confidence:** CONFIRMED
**Evidence:** Negative search across docs.mintlify.com

The assistant documentation page describes user-visible capabilities (search, citation, RBAC, bot protection, analytics) with zero mention of ChromaFs. The MCP documentation page also makes no reference. The only documentation is the engineering blog post, aimed at developers understanding internal architecture.

### Finding: No standards-setting signals
**Confidence:** CONFIRMED
**Evidence:** modelcontextprotocol.io, web search

- MCP specification site (Linux Foundation / Anthropic governed): no Mintlify filesystem proposals or ChromaFs mentions
- No conference talks, standards proposals, or adoption by competing frameworks found
- The blog itself does not claim standardization intent
- ChromaFs implements Vercel Labs' open-source `just-bash` IFileSystem interface — but `just-bash` is Vercel's project, not Mintlify's

### Finding: No follow-up technical content since March 24
**Confidence:** CONFIRMED
**Evidence:** mintlify.com/blog index through April 11

Post-March-24 blog posts:
- April 3: "Docs on autopilot" — mentions ChromaFs in passing, not a new announcement
- April 3: "State of agent traffic" — no ChromaFs mention
- April 7: "Improved CLI" — unrelated
No conference talks or technical documentation surfaced.

### Finding: External coverage treats ChromaFs as internal infrastructure
**Confidence:** CONFIRMED
**Evidence:** Third-party coverage

- byteiota.com: "Mintlify Ditches RAG for Filesystem: 460x Faster" — describes as internal architectural decision
- letsdatascience.com: "Mintlify Builds ChromaFs Virtual Filesystem For Docs" — same framing
- HN discussion (409 points): commenters discuss the architecture, no one asks about external availability

**Implications:** ChromaFs remains Assistant-internal infrastructure, unchanged from April 2 baseline. It is a genuine technical investment (powers all customer Assistant widgets) but is NOT a product surface, open spec, or ecosystem play. For competitive assessment: ChromaFs makes Mintlify's Assistant better but does not create a new product category or extensibility surface.

---

## Negative searches

* npm search: "chromafs", "@mintlify/chromafs" → zero results
* PyPI search: "chromafs" → zero results
* GitHub search: "mintlify chromafs" → no relevant repos
* modelcontextprotocol.io search: "chromafs", "mintlify", "filesystem" → no proposals
* docs.mintlify.com: "chromafs", "virtual filesystem" → no customer-facing docs

---

## Gaps / follow-ups

* Whether Mintlify plans to open-source ChromaFs or build an API around it is unknown
* The just-bash/IFileSystem interface relationship could be worth tracking if Vercel pushes standardization
