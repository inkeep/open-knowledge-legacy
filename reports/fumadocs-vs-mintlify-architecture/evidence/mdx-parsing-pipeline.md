# Evidence: MDX Parsing Pipeline

**Dimension:** MDX Parsing Pipeline
**Date:** 2026-04-02
**Sources:** fumadocs.dev, github.com/fuma-nama/fumadocs, github.com/mintlify/mdx, fumadocs.dev/blog/fumadocs-mdx-road-map

---

## Key files / pages referenced

- https://fumadocs.dev/docs/headless/mdx — Fumadocs MDX plugins
- https://fumadocs.dev/blog/fumadocs-mdx-road-map — Fumadocs MDX future (Fuma Content)
- https://fumadocs.dev/docs/headless/mdx/rehype-code — Rehype code plugin
- https://fumadocs.dev/docs/mdx/collections — Collections system
- https://github.com/mintlify/mdx — Mintlify MDX parser repo

---

## Findings

### Finding: Fumadocs uses the full unified pipeline (remark -> rehype -> recma) with custom plugins
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs/headless/mdx

Processing pipeline stages:
1. **Remark plugins (mdast)**: Work on markdown AST. Built-in: remarkStructure (extracts doc info for search), remarkImage, remarkHeading
2. **Rehype plugins (hast)**: Work on HTML AST. Built-in: rehype-code (wrapper of @shikijs/rehype for syntax highlighting), rehype-toc (table of contents extraction)
3. **Recma plugins (esast)**: Work on JavaScript AST. Transform from hast to esast via rehype-recma

Fumadocs MDX applies a remark plugin that turns vfile.data properties into exports. The remarkStructure plugin extracts information from documents for implementing document search.

Customization via `getDefaultMDXOptions`: plugins can be passed as arrays or functions.

**Implications:** Full control over the MDX pipeline. You can inject custom remark/rehype/recma plugins at any stage.

### Finding: Fumadocs MDX is evolving into "Fuma Content" — a framework-agnostic content layer
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/blog/fumadocs-mdx-road-map

Key architectural direction:
- Moving from Fumadocs-specific tool to "a foundational content processing layer"
- Framework-agnostic: supports Vite, Turbopack/Webpack, JS runtimes
- Zero breaking changes to Fumadocs MDX during migration
- New capabilities: custom collection types, Obsidian plugin for editor syntax
- Plugin system that distinguishes from bundler plugins
- MDX preset moves to fumadocs-core as a plugin
- "Foundation for developing a CMS layer" — plugins for MDX editing or remote databases

**Implications:** Fuma Content could become the content processing substrate for other tools. Its evolution toward CMS-layer foundations directly maps to the "agent-native knowledge platform" concept.

### Finding: Mintlify's MDX parser (@mintlify/mdx) is a thin wrapper around next-mdx-remote-client
**Confidence:** CONFIRMED
**Evidence:** https://github.com/mintlify/mdx

Architecture:
- "A thin layer on top of next-mdx-remote-client"
- Adds syntax highlighting on top
- Three APIs: serialize (compiles MDX), MDXClient (client render), MDXRemote (server render)
- Accepts custom remark and rehype plugins via mdxOptions
- Supports Next.js Pages Router and App Router
- TypeScript: 99.1% of codebase

**Implications:** Mintlify's parser is intentionally minimal. The heavy lifting is done by the platform's backend, not the client-side parser. Custom pipeline modifications are limited to what next-mdx-remote-client supports.

### Finding: Fumadocs collections provide type-safe content with Zod schema validation at build time
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs/mdx/collections

- `defineCollections()` defines content collections with type ('doc' or 'meta'), directory, and schema
- `defineDocs()` is a shortcut for the standard doc+meta collection pair
- Schema validation at build time using Standard Schema-compatible libraries (Zod)
- Doc type supports: async loading, on-demand compilation, custom MDX config, postprocessing
- Meta type: accepts JSON/YAML with schema validation and glob pattern filtering
- `includeProcessedMarkdown: true` captures intermediate Markdown before HTML conversion
- `valueToExport` exports compile-time data from remark plugins as ESM properties

**Implications:** Strong type safety with Zod validation at build time is a significant advantage for programmatic content manipulation by agents.

---

## Gaps / follow-ups

- Mintlify's server-side MDX processing pipeline is not publicly documented
- How Mintlify handles custom remark/rehype plugins on their managed platform is unclear
