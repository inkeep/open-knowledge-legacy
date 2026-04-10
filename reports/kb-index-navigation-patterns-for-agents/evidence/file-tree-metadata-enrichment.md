# Evidence: File Tree + Metadata Enrichment Patterns

**Dimension:** D6 — File tree + metadata enrichment patterns
**Date:** 2026-04-02
**Sources:** Static site generator docs, CMS documentation, Obsidian Dataview, llms.txt spec

---

## Key files / pages referenced

- https://www.fumadocs.dev/docs/headless/content-collections — Fumadocs content collections
- https://docs.astro.build/en/guides/content-collections/ — Astro content collections
- https://docusaurus.io/docs/search — Docusaurus search integration
- https://blacksmithgu.github.io/obsidian-dataview/ — Obsidian Dataview documentation
- https://llmstxt.org/ — llms.txt specification
- https://www.notion.com/help/autofill — Notion AI database properties

---

## Findings

### Finding: Static site generators build structured indexes from frontmatter at build time
**Confidence:** CONFIRMED
**Evidence:** Fumadocs, Astro, Docusaurus documentation

Fumadocs: Each document needs a structuredData field processed from Markdown/MDX. Orama (default search engine) indexes these at build time. Astro Content Collections: Collections require a loader + optional schema with Zod validation. getCollection() retrieves entries with filtering on frontmatter properties. Docusaurus: Uses Algolia DocSearch (weekly crawl) or local search plugins (Lunr-based). All three frameworks share a pattern: frontmatter → schema validation → build-time index → search at runtime.

**Implications:** The "frontmatter as database" pattern is well-established in the static site generator ecosystem. The index is built at compile time from file metadata, creating a queryable catalog.

### Finding: Obsidian Dataview treats frontmatter as a queryable database with DQL
**Confidence:** CONFIRMED
**Evidence:** https://blacksmithgu.github.io/obsidian-dataview/

Dataview is "a live index and query engine over your personal knowledge base." It indexes all YAML frontmatter fields automatically, plus inline fields ([key:: value]). Supports three query modes: DQL (Dataview Query Language), inline statements, and JavaScript queries. Can filter, sort, group, and extract data. Creates dynamic views that update in real-time. One of Obsidian's most popular plugins.

**Implications:** Dataview proves that frontmatter metadata IS sufficient for rich querying of a markdown KB. An agent with access to Dataview-style querying could navigate a KB through metadata filtering alone. The key insight: frontmatter is already a database schema.

### Finding: CMS platforms build structured content indexes with typed schemas
**Confidence:** CONFIRMED
**Evidence:** Keystatic, Sanity, Contentful documentation patterns

CMS tools universally maintain a content index: structured type definitions → content entries → queryable APIs. Keystatic uses Git-based storage with YAML/JSON schemas. Sanity uses GROQ queries over a real-time content lake. Contentful uses a REST/GraphQL API over typed content models. The pattern: define a content type schema → store entries with typed fields → query via API.

**Implications:** CMS platforms have solved the "structured access to a collection of documents" problem. The same pattern (typed metadata + query API) maps directly to an MCP server exposing markdown articles with frontmatter.

### Finding: llms.txt is a lightweight human-curated catalog that's gaining adoption
**Confidence:** CONFIRMED
**Evidence:** https://llmstxt.org/, adoption statistics

llms.txt uses Markdown structure (H1 name, blockquote summary, H2 sections with URL lists) to create a machine-readable site map. 844K+ implementations. Designed specifically for LLM consumption. The spec acknowledges that "many of these files are expected to be read by language models and agents." Companion format llms-full.txt provides more complete content.

**Implications:** llms.txt validates the "lightweight catalog" approach for agent consumption. For a KB, the equivalent would be a single markdown file listing all articles with titles, descriptions, and tags — readable by an agent in one pass to build a mental model.

### Finding: The "frontmatter as database" pattern scales to ~5K-10K articles before tooling breaks down
**Confidence:** INFERRED
**Evidence:** Obsidian Dataview performance reports, static site generator build times, practitioner accounts

Dataview handles thousands of notes but slows noticeably above ~5K notes in some vault configurations. Astro content collections work well for hundreds of pages; build times become a concern in the thousands. For the target scale of 100-1000 articles, frontmatter-based indexing is well within the comfort zone of all existing tools.

**Implications:** At the 100-1000 article scale, frontmatter metadata + a generated catalog is sufficient. No graph database, no vector database, no specialized infrastructure needed.

---

## Gaps / follow-ups

* Specific performance benchmarks for Dataview at different vault sizes not found
* How do typing/schema systems affect agent navigation? (Zod validation in Astro vs free-form in Obsidian)
