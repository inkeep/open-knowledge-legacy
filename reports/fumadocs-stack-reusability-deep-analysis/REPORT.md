---
title: "Fumadocs Monorepo: Source-Level Reusability Analysis for a TipTap/Yjs/Hocuspocus Knowledge Platform"
description: "Per-component, per-function source code analysis of the Fumadocs monorepo, evaluating every reusable piece against an agent-native knowledge platform built on TipTap/ProseMirror + Yjs CRDT + Hocuspocus. Produces three lists: import as dependency, pattern-copy, build from scratch."
createdAt: 2026-04-02
updatedAt: 2026-04-05
subjects:
  - Fumadocs
  - TipTap
  - Hocuspocus
  - Yjs
  - Orama
  - ProseMirror
topics:
  - component reusability analysis
  - framework selection
  - monorepo dependency analysis
  - agent-native knowledge platform
  - local catalog generation
---

# Fumadocs Monorepo: Source-Level Reusability Analysis

**Purpose:** Determine, at the source code level, which specific pieces of Fumadocs to import as dependencies, which to pattern-copy, and which are irrelevant for an agent-native knowledge platform built on TipTap/ProseMirror + Yjs CRDT + Hocuspocus.

---

## Executive Summary

Fumadocs is a three-layer monorepo (content processing, core logic, UI) where each layer can be consumed independently. After reading every primary source file across 10 investigation dimensions, the core finding is: **Fumadocs' value to our product is concentrated in ~800 lines of content extraction code, not in the framework itself.**

The remark/rehype plugins (`remarkStructure`, `remarkLLMs`, `remarkHeading`, the shared `stringifier`) are genuinely standalone: they run in any unified/remark pipeline with zero Fumadocs coupling. The `structure()` convenience function extracts heading-level content blocks from markdown in a single call. The `buildDocuments()` function explodes those blocks into per-section search documents. Together, these ~800 lines replace what would be our most complex custom code.

The Source/loader system is well-designed but overengineered for a flat wiki. The `Source` interface itself (4 types, 97 lines) is the right abstraction level. The `loader()` function (540 lines) adds page tree building, breadcrumbs, slug resolution, i18n, and SSG helpers -- features we don't need at P0. A Y.Doc to `VirtualFile[]` bridge is trivial; whether to run it through `loader()` depends on whether we want hierarchical navigation.

The UI components (Callout, Tabs, Steps, Accordion, Card, CodeBlock, Files, ImageZoom, TypeTable, InlineTOC) are self-contained React components with no global context dependencies. They could serve as TipTap void node renderers. However, importing `fumadocs-ui` pulls in 7 Radix UI packages, Framer Motion, and other dependencies. Pattern-copying the 3-5 components we need (~400 lines total) is more appropriate than adding the full package.

The framework decision is clear: **Vite, not Next.js.** Hocuspocus embeds natively in Vite's dev server via `configureServer`. In Next.js, it requires a custom server that disables optimizations. TipTap works in both but requires workarounds in Next.js (client directives, `immediatelyRender: false`). Fumadocs for publishing can consume the same markdown files from a separate deployment.

**Key Findings:**
- **Import as dependency:** `fumadocs-core/mdx-plugins` (remarkStructure, remarkLLMs, remarkHeading, stringifier, placeholder/renderPlaceholder) + `fumadocs-core/search` (buildDocuments, advancedSchema) -- total ~1,000 lines of battle-tested content extraction and LLM content generation
- **Pattern-copy:** 3-5 UI components (~400 lines), wiki-link resolution algorithm (~300 lines), content negotiation utilities (~25 lines), 4-endpoint llms.txt delivery pattern
- **Build from scratch:** CRDT-to-markdown bridge, incremental indexing, backlink computation, MCP server, editor shell, llms.txt index generator (from flat page list, ~35 lines)
- **Total dependency footprint of recommended imports:** `fumadocs-core` with `react` and `@orama/orama` as peers -- Next.js peer dep is optional, not required for mdx-plugins or search
- **Framework recommendation:** Vite for the editor; Fumadocs/Next.js only for S-L2 publishing layer
- **remark-llms pipeline (D11):** The MDX-to-Markdown conversion system is a 3-layer architecture (plugin + stringifier + placeholder runtime) with zero Fumadocs coupling. The stringifier and placeholder system are directly importable. The content negotiation and llms.txt endpoint patterns are the template for our S-L2 publishing story.
- **Local catalog reusability (D13):** The same per-page content conversion functions (remarkLLMs + stringifier + placeholder, ~375 lines) that power Fumadocs' web llms.txt delivery are directly reusable for local filesystem catalog generation. The pipeline is pure `AST -> string` with zero IO coupling. Only the index generator (llms(), coupled to LoaderOutput) needs replacement (~35 lines). Build-time vs on-change timing is a non-factor -- the functions are stateless.

---

## Research Rubric

| # | Dimension | Priority | Depth | Coverage |
|---|-----------|----------|-------|----------|
| D1 | fumadocs-core/mdx-plugins | P0 | Deep (Primary source) | Complete |
| D2 | Source interface and loader() | P0 | Deep (Primary source) | Complete |
| D3 | Orama integration pipeline | P0 | Deep (Primary source) | Complete |
| D4 | UI components | P0 | Deep (Primary source) | Complete |
| D5 | Obsidian/wiki-links package | P0 | Deep (Primary source) | Complete |
| D6 | mdx-remote / runtime MDX | P0 | Deep (Primary source) | Complete |
| D7 | Content Collections / Fuma Content | P0 | Moderate | Complete |
| D8 | Agent accessibility primitives | P0 | Moderate | Complete |
| D9 | Next.js vs Vite | P0 | Deep (Adversarial) | Complete |
| D10 | Synthesis -- reusability matrix | P0 | Synthesis | Complete |
| D11 | remark-llms pipeline (MDX-to-Markdown, content negotiation, llms.txt) | P0 | Deep (Primary source) | Complete |
| D13 | llms.txt internals reusability for local filesystem catalog generation | P0 | Deep (Primary source) | Complete |

**Stance:** Factual with decision-informing analysis. Recommendations tied to evidence.

**Non-goals:** Performance benchmarking, visual design evaluation, Mintlify comparison (covered elsewhere), production deployment topology.

---

## Detailed Findings

### D1: fumadocs-core/mdx-plugins — Every Plugin Assessed

**Finding:** Of the 15+ remark/rehype plugins, 4 are high-value standalone tools for our pipeline. The rest are syntax sugar (useful but replaceable). All plugins except `remarkImage` (Next.js-coupled in default mode) can run in any remark/rehype pipeline.

**Evidence:** [evidence/d1-mdx-plugins-source-analysis.md](evidence/d1-mdx-plugins-source-analysis.md)

#### High-value plugins (recommend importing)

**remarkStructure** (258 lines) -- Extracts `StructuredData` from markdown: an array of headings (with IDs) and an array of content blocks (each associated with the nearest heading). The configurable stringifier handles MDX components intelligently: wrapper components (`<Tabs>`, `<Steps>`) are unwrapped to text content; content-bearing components (`<Callout>`, `<Card>`) are preserved with attributes. The `structure(markdownString)` convenience function creates a self-contained remark pipeline that processes markdown and returns `StructuredData` in one call.

Dependencies: `remark`, `remark-gfm`, `unist-util-visit`, `mdast-util-mdx` (types), local `remarkHeading`, local `stringifier`. No Fumadocs-specific types needed for standalone use.

**remarkLLMs** (130 lines) -- Converts MDX AST back to clean markdown for LLM consumption. Strips ESM imports, preserves heading IDs in `[#id]` format, and supports `mdxAsPlaceholder` (named MDX components serialized as JSON tokens that can be rendered back at runtime). The placeholder system (44-line runtime) enables preserving component semantics in plain text.

Dependencies: `mdast-util-to-markdown`, `mdast-util-mdx` (types), local `stringifier`. Zero Fumadocs coupling.

**remarkHeading** (99 lines) -- Generates heading IDs via `github-slugger`, supports custom `[#slug]` syntax, and extracts TOC (`{ title, url, depth }[]`). Required by remarkStructure.

Dependencies: `github-slugger`, `unist-util-visit`. One coupling point: imports `TOCItemType` from `@/toc` (a 3-field interface).

**stringifier** (201 lines) -- The shared AST-to-markdown engine used by both remarkStructure and remarkLLMs. Wraps `mdast-util-to-markdown` with `filterElement` (include/exclude/children-only for MDX components), `filterMdxAttributes`, and custom stringify callbacks. This is the core technology that makes structured extraction work.

Dependencies: `mdast-util-mdx`, `mdast-util-to-markdown`. Zero Fumadocs types.

#### Useful syntax plugins (pattern-copy if needed)

| Plugin | Lines | What it does | Dependencies | Standalone? |
|--------|-------|-------------|--------------|-------------|
| remarkSteps | 139 | `1. Heading` -> `<div class="fd-steps">` | unist-util-visit | Yes |
| remarkCodeTab | 284 | Consecutive code blocks with `tab="name"` -> `<Tabs>` | local codeblock-utils | Yes |
| remarkNpm | 92 | `npm` code blocks -> multi-PM tabs | npm-to-yarn | Yes |
| remarkMdxMermaid | 42 | `mermaid` code blocks -> `<Mermaid chart="...">` | None (types only) | Yes |
| remarkAdmonition | 98 | `:::type` -> `<Callout>` (deprecated) | unist-util-visit | Yes |
| remarkFeedbackBlock | 110 | Block elements -> `<FeedbackBlock id="hash">` | node:crypto | Yes |
| remarkGfm | 3 | Re-export of remark-gfm | remark-gfm | Yes |

#### Framework-coupled plugins (replace or configure)

**remarkImage** (336 lines) -- Default mode (`useImport: true`) generates ESM imports for Next.js Image. Alternate mode (`useImport: false`) fetches image dimensions and sets width/height -- this mode is framework-agnostic. Hard dependency on `image-size`. Uses Node.js `node:path`, `node:url`.

**rehypeCode** (37 + 191 lines) -- Wraps `@shikijs/rehype` with Fumadocs defaults. The transformers (highlight, diff, focus, word highlight) are from `@shikijs/transformers`. Imports internal Shiki helpers from `@/highlight/`. Could use `@shikijs/rehype` directly with the same transformer config.

#### Decision triggers

- If you need heading-level content extraction for search: import remarkStructure (it does this better than anything custom)
- If you need LLM-clean markdown from MDX: import remarkLLMs (the placeholder system is non-trivial)
- If you're using Shiki: use `@shikijs/rehype` directly rather than Fumadocs' wrapper
- If you need admonition syntax: pattern-copy remarkAdmonition (98 lines) or use `remark-directive`

---

### D2: Source Interface and loader()

**Finding:** The `Source` interface is an elegant 97-line abstraction that should inform our content model design. The `loader()` function is overengineered for a flat wiki but provides value if we want hierarchical navigation. A Y.Doc to VirtualFile[] bridge is architecturally trivial -- the challenge is running remarkStructure during the bridge for search indexing.

**Evidence:** [evidence/d2-source-interface-loader.md](evidence/d2-source-interface-loader.md)

The `Source` interface is pure data:

```typescript
interface Source<Config> { files: VirtualFile<Config>[] }
type VirtualFile = VirtualPage | VirtualMeta
interface VirtualPage { type: 'page'; path: string; data: PageData; slugs?: string[] }
```

No filesystem dependency. No framework dependency. Any content source that can produce `{path, type, data}` objects can feed the pipeline.

`loader()` (540 lines) takes a Source and produces a `LoaderOutput` with: page lookup by slugs, cross-reference resolution, page tree generation, breadcrumb building, i18n support, and Next.js SSG parameter generation. The React dependency is isolated to a single method (`serializePageTree` dynamically imports `react-dom/server.edge`).

The `multiple()` combiner (16 lines) merges multiple sources with type discrimination -- useful if we have content from both filesystem and CRDT sources.

The `LoaderPlugin` system allows adding backlinks, metadata enrichment, or custom transformations without forking. Three hooks: `config` (modify options), `transformStorage` (modify content after loading), `transformPageTree` (modify navigation tree).

**For our product:** The Source interface pattern is worth adopting as our own content model interface. Whether to use `loader()` depends on whether we need hierarchical navigation (documentation-style sidebar) vs flat navigation (wiki-style search + tags). At P0, we likely don't need loader() -- a simpler page indexer would suffice.

---

### D3: Orama Integration Pipeline

**Finding:** The minimal path from "markdown string to searchable Orama documents" is 4 functions totaling ~250 lines of Fumadocs code. The full `createFromSource` pipeline adds loader() dependency but is not required. The `buildDocuments()` function (70 lines, zero dependencies) is the key piece.

**Evidence:** [evidence/d3-orama-integration-pipeline.md](evidence/d3-orama-integration-pipeline.md)

The minimal standalone pipeline:

```
markdown string
  -> structure(markdown)                    // remarkStructure: extract StructuredData
  -> manually construct SharedIndex         // { id, title, url, structuredData }
  -> buildDocuments(sharedIndexes)          // explode to per-section documents
  -> Orama create() + insertMultiple()      // with advancedSchema
```

`buildDocuments()` is a pure function: takes `SharedIndex[]`, returns `SharedDocument[]`. Each page produces 1 page document + N heading documents + M content documents. A 100-article wiki produces ~1,000-2,000 Orama documents at heading-level granularity.

The `advancedSchema` includes `embeddings: 'vector[512]'` as a placeholder -- Fumadocs never populates it. We would populate it ourselves or via `@orama/plugin-embeddings`.

The `createEndpoint` wrapper (39 lines) provides `GET` and `staticGET` HTTP handlers using standard `Request`/`Response` APIs -- framework-agnostic.

**For our product:** Import `buildDocuments` and `advancedSchema` from `fumadocs-core/search`. Use `structure()` from `fumadocs-core/mdx-plugins` for extraction. Build our own incremental indexing layer (Orama's `insert`/`update`/`remove` APIs) rather than the full-rebuild pattern Fumadocs uses.

---

### D4: UI Components

**Finding:** Content components are self-contained React components with no global context dependencies. They could serve as TipTap void node renderers. However, importing `fumadocs-ui` pulls a heavy dependency tree. Pattern-copying the specific components we need is more appropriate.

**Evidence:** [evidence/d4-ui-components-source-analysis.md](evidence/d4-ui-components-source-analysis.md)

Per-component assessment:

| Component | Lines | Verdict | Rationale |
|-----------|-------|---------|-----------|
| Callout | 98 | Pattern-copy | Perfect void node. RSC-compatible. Only deps: lucide-react, Tailwind. |
| Steps/Step | 10 | Pattern-copy | Two `<div>` wrappers with CSS classes. Trivial. |
| Tabs/Tab | 190 | Pattern-copy | Good void node for tabbed content. Self-contained context. |
| Card/Cards | 48 | Pattern-copy | Clean component. Replace `fumadocs-core/link` with standard `<a>`. |
| Accordion | 106 | Pattern-copy | Uses Radix Accordion. Replace with our own collapsible. |
| CodeBlock | 240 | Evaluate | Most complex. Copy button, tabs, line numbers. May overlap with TipTap code extension. |
| Files/Folder | 68 | Pattern-copy | File tree display. Uses Radix Collapsible. |
| ImageZoom | 50 | Pattern-copy | Wraps react-medium-image-zoom. Replace `fumadocs-core/framework` Image. |
| TypeTable | 180 | Defer | Type documentation table. Not needed at P0. |
| InlineTOC | 45 | Pattern-copy | Collapsible TOC. Replace `fumadocs-core/toc` type with inline interface. |
| Banner | 142 | Skip | Dismissable banner. Not relevant for editor. |

The `fd-*` CSS variable system (`--color-fd-card`, `--color-fd-muted`, etc.) maps to standard Tailwind V4 variables. We can adopt these names or remap to our own design tokens.

No global context provider (DocsProvider, ThemeProvider, etc.) is required by any content component. Layout components (sidebar, TOC panel, DocsLayout) do require context, but content components are independent.

**For our product:** Pattern-copy Callout, Tabs/Tab, Steps/Step, Card (~350 lines total). These become our built-in void node components in TipTap. CodeBlock may be handled differently in the editor (TipTap's own code block extension with Shiki).

---

### D5: Obsidian/Wiki-Links Package

**Finding:** The wiki-link resolution algorithm is ~300 lines of extractable code. It works with a flat file inventory (no Fumadocs page tree needed). Backlinks do not exist anywhere in the package or the monorepo. The plugin requires file-level context (`file.data.source`) which must be set manually for standalone use.

**Evidence:** [evidence/d5-obsidian-wikilinks.md](evidence/d5-obsidian-wikilinks.md)

Syntax supported: `[[page]]`, `[[page#heading]]`, `[[page|alias]]`, `![[page]]` (embed content), `![[image.png]]` (embed image), `[[#heading]]` (same-page link). Frontmatter `aliases` are indexed for alternative name resolution.

The `VaultResolver` builds two maps from a file inventory: name-to-file and path-to-file. Resolution: relative path > full path > name match. This needs only a `Map<string, FileInfo>` -- no Fumadocs loader required.

Error handling: `console.warn()` on unresolved links, silently drops the node. No error collection API. For our product, we'd want to collect broken links for display in the editor.

Backlinks are NOT FOUND. The resolver is read-only (name to file). A reverse index (file to files-that-link-to-it) would be ~50 lines of additional code on top of the forward resolution.

**For our product:** Pattern-copy the resolution algorithm (~300 lines: remarkWikilinks + VaultResolver). Modify to: collect broken links instead of console.warn, add backlink computation, accept our own file inventory format instead of VaultStorage.

---

### D6: mdx-remote / Runtime MDX Compilation

**Finding:** `@fumadocs/mdx-remote` wraps `@mdx-js/mdx` with the Fumadocs plugin preset (7 plugins pre-configured). It's framework-agnostic (no Next.js dependency). For our live preview pane, it saves ~100 lines of plugin configuration. Could also use `@mdx-js/mdx` directly with our own config.

**Evidence:** [evidence/d6-mdx-remote.md](evidence/d6-mdx-remote.md)

`createCompiler()` returns compile/render methods. The `fumadocs` preset includes: remarkGfm, remarkHeading, remarkImage (useImport: false), remarkCodeTab, remarkNpm, rehypeCode (Shiki), rehypeToc. Each plugin is individually configurable or disableable.

MDX execution uses `new AsyncFunction()` -- compiles to JavaScript string, executes via dynamic function constructor. Output: `{ default: MdxContent, toc?: TOCItemType[] }`.

Dependencies: `@mdx-js/mdx`, `gray-matter`, `unified`, `vfile`, `zod`. Peer: `fumadocs-core` (for plugin imports), `react`. No Next.js.

**For our product:** If using Fumadocs remark plugins (which we recommend), import `@fumadocs/mdx-remote` for the convenience of preset configuration. If we diverge from Fumadocs plugins, use `@mdx-js/mdx` directly. The compilation latency bottleneck is Shiki initialization (~200-500ms first call), not mdx-remote itself.

---

### D7: Content Collections and Fuma Content

**Finding:** Both adapters are thin type mappers (37 and 57 lines respectively) that bridge external content systems to the Source interface. For our use case (markdown files in git parsed by our pipeline), neither adapter is needed. `gray-matter` + Zod is simpler and more appropriate.

**Evidence:** [evidence/d7-content-processing.md](evidence/d7-content-processing.md)

The Content Collections adapter is literally: map `_meta.filePath` to `path`, pass `data` through, output `VirtualFile[]`. The Fuma Content adapter does the same with slightly different input shapes.

For our pipeline: read markdown from disk, parse frontmatter with `gray-matter`, validate with Zod, construct `VirtualFile[]` directly. This is ~30 lines of code.

---

### D8: Agent Accessibility Primitives

**Finding:** `isMarkdownPreferred()` is a 12-line standalone function worth copying. The `llms()` index generator is tightly coupled to LoaderOutput but the output format (markdown page list) is trivial to replicate. Our MCP server should implement these patterns directly rather than depending on Fumadocs' implementations.

**Evidence:** [evidence/d8-agent-accessibility.md](evidence/d8-agent-accessibility.md)

`isMarkdownPreferred(request)` checks Accept headers for `text/plain`, `text/markdown`, `text/x-markdown` using the `negotiator` package. Zero Fumadocs coupling. Copy or reimplement in 12 lines.

`llms(loaderOutput)` walks the page tree and generates a markdown-formatted index. Tightly coupled to `LoaderOutput.getPageTree()`. The output format itself is ~50 lines of custom code to replicate from any page list.

Our MCP server (4-tool progressive disclosure: `get_overview`, `search_articles`, `list_articles`, `read_article`) would use: our own page inventory for `list_articles`, our Orama index for `search_articles`, direct markdown reading for `read_article`, and a custom index generator for `get_overview`.

---

### D9: Next.js vs Vite

**Finding:** Vite is the clear choice for the editor product. Hocuspocus embeds natively in Vite's dev server via `configureServer`. TipTap works without workarounds. SSR is unnecessary at P0. Fumadocs/Next.js serves the S-L2 publishing layer as a separate deployment consuming the same markdown files.

**Evidence:** [evidence/d9-nextjs-vs-vite.md](evidence/d9-nextjs-vs-vite.md)

| Factor | Vite | Next.js |
|--------|------|---------|
| Hocuspocus embedding | Native via `configureServer` hook | Requires custom server (disables optimizations) |
| TipTap integration | Standard, no workarounds | Requires `'use client'`, `immediatelyRender: false` |
| SSR for editor | Not needed (editor is client-side) | Overhead without benefit for editor |
| HMR for editor dev | ESM-based, faster for client components | Webpack/Turbopack, RSC boundary overhead |
| Fumadocs support | React Router adapter (secondary support) | Primary support |
| Publishing (S-L2) | Separate deployment needed | Could be same app (but shouldn't be for our case) |

The S-L2 publishing bridge: Editor (Vite) writes markdown to git. Published docs site (Fumadocs/Next.js, separate deployment) reads the same files. Git is the bridge. Clean separation of concerns.

Fumadocs' React Router adapter provides `serializePageTree()`, DocsLayout, and provider components for non-Next.js environments. It works but is documented as "Next.js first" -- meaning edge cases may arise. Since we only need Fumadocs for S-L2 publishing (not the editor), this is acceptable.

---

### D10: Synthesis -- The Reusability Matrix

Based on D1-D9, here are the three definitive lists.

#### List 1: Import as Dependency

| What | Import Path | Why | Dependency Footprint |
|------|-------------|-----|---------------------|
| remarkStructure + structure() | `fumadocs-core/mdx-plugins` | Per-heading content extraction for search and LLM output | remark, remark-gfm, unist-util-visit, github-slugger |
| remarkLLMs | `fumadocs-core/mdx-plugins` | MDX-to-clean-markdown with placeholder preservation | mdast-util-to-markdown, mdast-util-mdx |
| remarkHeading | `fumadocs-core/mdx-plugins` | Heading ID generation + TOC extraction | github-slugger, unist-util-visit |
| stringifier | `fumadocs-core/mdx-plugins` | Shared AST-to-markdown engine | mdast-util-to-markdown, mdast-util-mdx |
| buildDocuments | `fumadocs-core/search` | SharedIndex to per-section Orama documents | None (pure function) |
| advancedSchema | `fumadocs-core/search` | Orama schema definition | @orama/orama (types only) |
| @fumadocs/mdx-remote | `@fumadocs/mdx-remote` | Runtime MDX compilation with preset | @mdx-js/mdx, gray-matter, vfile |
| placeholder + renderPlaceholder | `fumadocs-core/mdx-plugins/remark-llms` + `fumadocs-core/mdx-plugins/remark-llms.runtime` | Preserve MDX component semantics in plain text for LLM consumption | None beyond stringifier deps |

**Total dependency footprint:** Installing `fumadocs-core` adds: `@orama/orama`, `@shikijs/rehype`, `@shikijs/transformers`, `shiki`, `remark`, `remark-gfm`, `remark-rehype`, `unified`, `unist-util-visit`, `vfile`, `github-slugger`, `mdast-util-mdx`, `mdast-util-to-markdown`, `image-size`, `npm-to-yarn`, `negotiator`, `path-to-regexp`, `tinyglobby`, `estree-util-value-to-estree`, `hast-util-to-estree`, `hast-util-to-jsx-runtime`, `scroll-into-view-if-needed`.

**Critical: `react` and `next` are OPTIONAL peer dependencies of fumadocs-core.** The mdx-plugins and search subpaths do not require React or Next.js at runtime. Tree-shaking ensures only the imported subpaths are bundled.

#### List 2: Pattern-Copy

| What | Source Lines | Why Copy Not Import | Modifications Needed |
|------|-------------|--------------------|--------------------|
| Callout component | ~98 | Avoids fumadocs-ui dependency tree (7 Radix packages, Framer Motion) | Replace `fd-*` CSS vars with our tokens, or adopt fd-* naming |
| Tabs/Tab component | ~190 | Same -- heavy package deps | Replace Radix Tabs with our own or keep Radix as direct dep |
| Steps/Step component | ~10 | Two div wrappers -- simpler to own | Map CSS classes to our design system |
| Card component | ~48 | Replace fumadocs-core/link with standard link | Remove fumadocs-core/link import |
| Wiki-link resolution | ~300 | Plugin requires file-level context we control differently | Add broken-link collection, backlink computation, adapt to our file inventory |
| isMarkdownPreferred() | ~12 | Tiny utility; importing pulls path-to-regexp we may not need | Consider tightening to check preference order, not just presence |
| rewritePath() | ~13 | Generic but we may use different routing in Vite | Adapt URL patterns for our framework |
| 4-endpoint llms delivery pattern | ~50 | Route handler patterns, not importable code | Implement as `/llms.txt`, `/llms-full.txt`, `/:path.mdx`, Accept negotiation middleware |
| buildBreadcrumbs() | ~25 | Needs LoaderOutput | Adapt to our navigation structure |

**Estimated total pattern-copy: ~750 lines.**

#### List 3: Build from Scratch

| What | Complexity | Why No Fumadocs Equivalent |
|------|-----------|---------------------------|
| TipTap/ProseMirror editor with void nodes | High | Fumadocs has zero editor code |
| Y.Doc to markdown serialization (CRDT bridge) | High | No CRDT support in Fumadocs |
| Hocuspocus integration (embedded in Vite dev server) | Medium | No real-time support in Fumadocs |
| Incremental Orama indexing | Medium | Fumadocs rebuilds entire index from scratch |
| Backlink computation | Low | Forward links exist, reverse mapping does not |
| MCP server (4-tool progressive disclosure) | Medium | Community MCP exists but targets Fumadocs' own docs |
| Draft management (CRDT state + published state) | Medium | No concept of drafts in Fumadocs |
| llms.txt index generator (from flat page list) | Low (~35 lines) | Fumadocs' llms() is coupled to LoaderOutput/PageTree we don't use |
| Content negotiation middleware (Vite) | Low | Fumadocs' is 12 lines but Next.js-oriented middleware pattern |
| File browser / sidebar for editor | Medium | Fumadocs sidebar assumes static page tree from loader() |
| Git-based persistence layer | Medium | Fumadocs reads files, never writes them |

---

### D11: remark-llms Pipeline — MDX-to-Markdown Conversion, Content Negotiation, llms.txt Generation

**Finding:** The remark-llms pipeline is a 3-layer architecture (plugin, stringifier, runtime) totaling ~375 lines. The stringifier (201 lines) is the core engine with zero Fumadocs coupling. The content negotiation module (46 lines) is fully standalone. The llms.txt generator (100 lines) is tightly coupled to LoaderOutput but the output format is trivially replicable. The placeholder system for preserving MDX component semantics in plain text is the most novel and directly useful piece for our product.

**Evidence:** [evidence/d11-remark-llms-pipeline.md](evidence/d11-remark-llms-pipeline.md)

#### Architecture: 3 separable layers

**Layer 1 -- remarkLLMs plugin** (130 lines): A remark transformer that configures the stringifier with LLM-specific defaults and injects the result as an ESM export (`_markdown`). Default behavior: strips `mdxjsEsm` nodes (import/export statements), preserves heading IDs as `[#id]` suffixes, delegates all conversion to the stringifier. The `mdxAsPlaceholder` option names MDX components to serialize as JSON tokens instead of stripping or inlining.

**Layer 2 -- defaultStringifier** (201 lines): The core engine shared by both remarkLLMs and remarkStructure. Wraps `mdast-util-to-markdown` with three extension hooks: `filterElement` (per-node visibility: include/exclude/children-only), `filterMdxAttributes` (per-attribute filtering), and `stringify` (custom per-node override). Default component handling: `File`, `TypeTable`, `Callout`, `Card` are preserved with attributes; all other MDX JSX elements are unwrapped to children-only (the wrapper tag is dropped, children text is kept). Handles edge cases via `node.data._stringify` annotation: nodes can declare themselves as children-only, provide literal text, or redirect to a different node.

Dependencies: `mdast-util-mdx` (types), `mdast-util-to-markdown`, `unified` (types). Zero Fumadocs internal imports.

**Layer 3 -- renderPlaceholder runtime** (44 lines): An async function that finds NUL-delimited JSON tokens (`\0{json}\0`) in stringified markdown and replaces them via named renderer functions. Supports nested placeholders (recursively processes children before parent). The `PlaceholderData` interface: `{ name: string | null, attributes: Record<string, unknown>, children: string }`.

#### Content negotiation: 3 standalone functions

The `fumadocs-core/negotiation` module exports three functions with zero Fumadocs coupling:

1. **`isMarkdownPreferred(request, options?)`** -- Checks Accept headers for markdown media types (`text/plain`, `text/markdown`, `text/x-markdown`). Uses the `negotiator` npm package. Returns boolean. Note: checks presence via `.includes()`, not preference ordering -- an Accept header with `text/html, text/markdown;q=0.1` returns `true` even though HTML is preferred. In practice this is fine because AI agents send markdown as primary type.

2. **`rewritePath(source, destination)`** -- Generic URL pattern rewriter using `path-to-regexp` v8+ syntax. Returns `{ rewrite(pathname): string | false }`. Used to map `.mdx` extension requests and Accept-negotiated requests to content endpoints.

3. **`getNegotiator(request)`** -- Converts standard `Request` headers to a `Negotiator` instance.

#### llms.txt index generator

The `llms()` function (100 lines) takes a `LoaderOutput` and walks the PageTree to produce a markdown-formatted site index. Handles three node types: `page` (rendered as `[Title](url): description`), `folder` (indented section with recursive children), `separator` (bold section header). Supports i18n by generating separate indices per language.

Coupling to `LoaderOutput` is structural: uses `loader.getPageTree()`, `loader.getNodePage()`, and `loader._i18n`. Cannot be used without a LoaderOutput.

The output format itself is ~35 lines of code to replicate from a flat page list.

#### The 4-endpoint content delivery system

Fumadocs documents a complete LLM content delivery architecture:

| Endpoint | Purpose | Implementation |
|----------|---------|---------------|
| `/llms.txt` | Page tree index | `llms(source).index()` |
| `/llms-full.txt` | All pages concatenated | `source.getPages().map(getLLMText).join('\n\n')` |
| `/docs/:path.mdx` | Individual page as Markdown | `getLLMText(page)` with Content-Type: text/markdown |
| Accept-header negotiation | Transparent Markdown for AI agents | Middleware: `isMarkdownPreferred(request)` -> rewrite to `.mdx` endpoint |

The `getLLMText` pattern: `# ${title} (${url})\n\n${processed}` where `processed` is the `_markdown` export from remarkLLMs.

#### Integration point: build-time vs runtime

remarkLLMs runs at MDX compilation time (build). The `remarkPostprocess` function in the MDX package calls `remarkLLMs.call(this, options)` directly, and the result is stored as an ESM export in the compiled module. At serve time, endpoints lazy-load the module and extract the export. No re-stringification at runtime.

For standalone use outside the MDX compiler, the `_data: true` option stores the result on `file.data.markdown` instead of relying on ESM export injection.

#### Assessment: import vs pattern-copy vs build for each piece

| Piece | Lines | Verdict | Rationale |
|-------|-------|---------|-----------|
| **stringifier** (defaultStringifier) | 201 | **Import** | Zero coupling. Battle-tested MDX-to-Markdown engine. Core of remarkStructure too. |
| **remarkLLMs plugin** | 130 | **Import** | Zero coupling beyond stringifier. Configures LLM-specific defaults. |
| **placeholder + renderPlaceholder** | 44+18 | **Import** | Novel system for preserving component semantics. Non-trivial to reimplement (NUL delimiters, nested recursion, async renderers). |
| **isMarkdownPreferred** | 12 | **Pattern-copy** | Tiny utility. Importing `fumadocs-core/negotiation` pulls `path-to-regexp` we may not need. Consider tightening to check preference order, not just presence. |
| **rewritePath** | 13 | **Pattern-copy** | Generic but we may use different routing patterns in Vite. |
| **llms() index generator** | 100 | **Build from scratch** | Tightly coupled to LoaderOutput + PageTree. Our flat page inventory produces the same output in ~35 lines. |
| **4-endpoint pattern** | ~50 | **Pattern-copy** | The endpoint structure is the valuable knowledge. Implementation is straightforward route handlers. |

**Decision triggers:**
- If using remarkStructure (recommended from D1): the stringifier is already a transitive dependency -- remarkLLMs adds minimal overhead
- If building llms.txt for S-L2 publishing: the endpoint pattern is the template; the remarkLLMs plugin provides the content
- If our TipTap void nodes need text representation for LLMs: the placeholder system solves this directly -- serialize `<Callout type="tip">` as `[tip] content` via renderPlaceholder

**Remaining uncertainty:**
- Performance of the stringifier on very large documents (>10K lines) is unmeasured
- Whether the NUL-byte delimiter choice in placeholders interacts with any downstream text processing is untested in our stack

---

## Dependency Footprint Analysis

**If we import only `fumadocs-core` for mdx-plugins and search:**

```
fumadocs-core (the package)
  Hard deps we actually use:
    remark, remark-gfm, unified, vfile          (remark ecosystem -- we'd install these anyway)
    unist-util-visit                             (AST traversal -- we'd install this anyway)
    github-slugger                               (heading IDs -- we'd install this anyway)
    mdast-util-mdx, mdast-util-to-markdown       (MDX/markdown -- we'd install these anyway)
    @orama/orama                                 (search -- we'd install this anyway)
    
  Hard deps we DON'T use but are installed:
    @shikijs/rehype, @shikijs/transformers, shiki (code highlighting -- may use separately)
    image-size                                    (image dimensions)
    npm-to-yarn                                   (package manager conversion)
    negotiator                                    (content negotiation)
    path-to-regexp                                (URL routing)
    estree-util-value-to-estree                   (AST utilities)
    hast-util-to-estree, hast-util-to-jsx-runtime (HAST utilities)
    scroll-into-view-if-needed                    (DOM utility)
    tinyglobby                                    (file globbing)
    @formatjs/intl-localematcher                  (i18n)

  Peer deps (ALL optional):
    react, react-dom                              (optional -- not needed for mdx-plugins/search)
    next                                          (optional -- not needed)
    zod                                           (optional -- not needed for our import paths)
```

The unused hard dependencies (shiki, image-size, npm-to-yarn, etc.) are installed but not imported by our code paths. They add to `node_modules` size but not to bundle size (tree-shaking). The overhead is ~15 packages we wouldn't otherwise install. This is acceptable for the ~800 lines of battle-tested content extraction code we gain.

**Alternative: Extract the ~800 lines we need into our own package.** This eliminates the unused dependency overhead but creates a maintenance burden (tracking upstream changes, fixing bugs ourselves). Recommended only if the dependency overhead becomes a problem.

---

### D12: meta.json — Folder Metadata System

**Finding:** Fumadocs uses `meta.json` (or `meta.yaml`) files in each folder to define folder-level metadata: title, description, icon, child ordering, and sidebar behavior. The schema is strictly typed (7 fields, Zod-validated, no passthrough). meta.json fields override index page frontmatter. The system is extensible via 3 mechanisms (SourceConfig generics, PageTree transformers, schema override) but does NOT support arbitrary custom fields by default.

**Evidence:** [evidence/d12-meta-json-folder-metadata.md](evidence/d12-meta-json-folder-metadata.md)

#### Schema (7 fields, all optional)

| Field | Type | Purpose | Fallback |
|---|---|---|---|
| `title` | string | Folder display name | Index page title → folder name |
| `description` | string | Folder description | undefined |
| `icon` | string | Folder icon identifier | Index page icon |
| `pages` | string[] | Explicit child ordering | Alphabetical |
| `defaultOpen` | boolean | Sidebar expanded by default | false |
| `collapsible` | boolean | Sidebar collapsible | true |
| `root` | boolean | Mark as root section | false |

#### Precedence: meta.json > index page > generated

When a folder has both `meta.json` and an `index.md`, meta.json wins for `title` and `icon`. The index page provides fallback values only. `description` comes exclusively from meta.json (index page description is not used for the folder).

#### Pages ordering — rich syntax

The `pages` array supports 7 syntax patterns:
- `"page-name"` — direct reference (priority 2)
- `"..."` — remaining files ascending
- `"z...a"` — remaining files descending
- `"...folderName"` — extract subfolder children into parent
- `"!path"` — exclude from rest insertions
- `"---Section Title---"` — visual separator
- `"external:[Icon][Label](url)"` — external link

Without `pages`, children sort alphabetically with index pages first.

#### Missing meta.json → graceful degradation

All defaults apply: folder name from directory name, children alphabetical, index page provides fallback title/icon. No meta.json required for basic operation.

#### Extensibility assessment

Fumadocs' meta schema is closed (strictly typed, no passthrough). To add custom fields (e.g., `ai_description`, `agent_instructions`), you must:
1. Override the meta schema via collection config (`meta.schema` accepts custom Zod)
2. Use a PageTree transformer to process custom fields after parsing
3. Extend the SourceConfig generic for full type safety

This is viable but requires Fumadocs knowledge. For our product (which builds its own source pipeline), the meta.json concept is pattern-copy — we define our own schema, our own parser, our own PageTree integration. The ordering syntax (`...`, `!path`, separators) is the most complex piece (~100 lines) worth studying.

#### Reusability for our product

| Piece | Approach | Rationale |
|---|---|---|
| meta.json concept (per-folder metadata file) | **Pattern-copy** | Same concept, different schema (we need open/flexible fields, Fumadocs is strictly typed) |
| Pages ordering syntax | **Pattern-copy** | Rich, well-designed, ~100 lines. Worth studying and adapting. |
| Zod schema validation | **Import pattern** | Use Zod but define our own schema. Same approach, different fields. |
| Precedence logic (meta > index > generated) | **Pattern-copy** | Same priority model works for our index.md generation. |
| PageTree transformer API | **Build from scratch** | Our data flow (CRDT → index.md) is fundamentally different from Fumadocs' (files → PageTree → sidebar). |

---

### D13: llms.txt Internals Reusability for Local Filesystem Catalog Generation

**Finding:** The Fumadocs llms.txt internals decompose into 3 abstraction levels. The per-page content conversion layer (remarkLLMs + stringifier + placeholder runtime, ~375 lines) is a pure `AST -> string` pipeline with zero IO, zero HTTP, and zero build-system coupling. It is directly reusable for local filesystem catalog generation with no modifications. The index generator (llms(), 100 lines) is NOT reusable due to structural coupling to LoaderOutput + PageTree, but is trivially replaceable (~35 lines). The HTTP delivery layer (content negotiation, route handlers) is web-only and irrelevant for local use.

**Evidence:** [evidence/d13-llms-internals-local-reusability.md](evidence/d13-llms-internals-local-reusability.md)

#### Core answer: the shared kernel already exists

The question "can the same functions power both web delivery and local disk writing?" has a clear answer: **yes, for the content conversion layer; no, for the index generator; irrelevant, for the HTTP layer.** The system decomposes cleanly:

| Abstraction level | Functions | Reusable for local? | Why |
|---|---|---|---|
| **Per-page content conversion** | `defaultStringifier()`, `remarkLLMs()`, `renderPlaceholder()` | **Yes -- import as-is** | Pure `AST -> string`. No IO, no side effects, no build-system coupling. |
| **Cross-page index generation** | `llms()` | **No -- build from scratch** | Structurally coupled to `LoaderOutput.getPageTree()` + `ReactNode` types. Replace with ~35 lines for flat page list. |
| **HTTP delivery** | `isMarkdownPreferred()`, `rewritePath()`, route handlers | **N/A for local** | Web-only concern. Pattern-copy for S-L2 publishing layer. |

#### Why the content conversion layer is output-target agnostic

The `defaultStringifier()` is a pure function: `(AST: Nodes, context) => string`. It calls `toMarkdown()` from `mdast-util-to-markdown` with configured extensions. No filesystem, no HTTP, no global state.

The `remarkLLMs()` plugin wraps the stringifier with LLM-specific configuration and provides two output paths:
1. **ESM export** (default `as = '_markdown'`): Injects an export into the MDX AST. Only works inside an MDX compiler.
2. **Direct data** (`_data: true`): Stores result on `file.data.markdown`. Works in any remark pipeline.

For local catalog generation, use `_data: true`. The string returned is identical regardless of output path.

#### Why build-time vs on-change timing is a non-factor

Fumadocs calls remarkLLMs at MDX compilation time (build). Our product calls it on every `onStoreDocument` event. The function is stateless -- no caching, no global state, no build-system dependencies. It takes an AST, returns a string. Whether called once at build time or 100 times per minute at runtime, the behavior is identical.

The only difference is AST construction: Fumadocs gets the AST from the MDX compiler pipeline; we construct it via `remark().use(remarkMdx).parse(mdxContent)`. This is standard remark usage and introduces no dependency on Fumadocs.

#### The shared pipeline, concretely

Both web serving and local disk writing follow the same data flow through the shared kernel:

```
pages: { title, url, mdxContent }[]
  |
  |-- [Per-page] remark().use(remarkMdx).parse(content) -> AST
  |-- [Per-page] remarkLLMs (with _data: true) -> clean Markdown string
  |-- [Per-page] Template: "# ${title} (${url})\n\n${markdown}"
  |
  v
strings[] -- target-agnostic from here
  |
  |-- Web: new Response(string)              // Fumadocs path
  |-- Disk: fs.writeFile(path, string)       // Our product path
```

The per-page content generation function (`getLLMText` in Fumadocs examples) is the reusable template:

```typescript
// Fumadocs pattern (from examples/tanstack-start/src/lib/source.ts)
async function getLLMText(page) {
  const processed = await page.data.getText('processed');
  return `# ${page.data.title} (${page.url})\n\n${processed}`;
}
```

Our equivalent uses the same stringification but different input/output:

```typescript
// Our pattern (Hocuspocus onStoreDocument)
async function generateCatalogEntry(page: { title: string; url: string; mdxContent: string }) {
  const file = await remark().use(remarkMdx).use(remarkLLMs, { _data: true }).process(page.mdxContent);
  return `# ${page.title} (${page.url})\n\n${file.data.markdown}`;
}

// Then: fs.writeFile(catalogPath, await generateCatalogEntry(page))
```

#### What CANNOT be shared

1. **The llms() index generator** (100 lines) -- Hard-coupled to `LoaderOutput.getPageTree()`, `LoaderOutput.getNodePage()`, and `LoaderOutput._i18n`. PageTree types use `ReactNode` for names/descriptions. Not worth decoupling; our flat page list produces the same output in ~35 lines.

2. **Content negotiation** (`isMarkdownPreferred`, `rewritePath`) -- Web-only concern. The functions are standalone (no Fumadocs coupling) but serve no purpose for local disk writing. Relevant only for the S-L2 publishing layer.

3. **The `getText('processed')` lazy-loading mechanism** -- Specific to the MDX compilation + module system. We bypass this entirely by calling remarkLLMs directly.

#### Assessment for our catalog generation use case

| Our catalog need | Fumadocs function | Reuse approach |
|---|---|---|
| Convert article CRDT content to clean Markdown | `defaultStringifier()` + `remarkLLMs()` | **Import** from `fumadocs-core/mdx-plugins` |
| Preserve TipTap void node semantics in Markdown | `placeholder()` + `renderPlaceholder()` | **Import** from `fumadocs-core/mdx-plugins/remark-llms` |
| Generate per-folder catalog index | `llms()` | **Build from scratch** (~35 lines for flat list) |
| Write catalog files to disk on content change | N/A (Fumadocs only serves over HTTP) | **Build from scratch** (~20 lines: `fs.writeFile`) |
| Assemble full catalog from all pages | `getLLMText` pattern | **Pattern-copy** the template; adapt input source |

**Decision triggers:**
- If using remarkStructure for search indexing (recommended from D1/D3): the stringifier is already a transitive dependency, so remarkLLMs is zero marginal cost
- If TipTap void nodes (Callout, Tabs, Card) need text representation in catalogs: the placeholder system is the only clean solution -- import it rather than reimplementing NUL-delimited JSON tokens
- If catalog generation latency matters: the stringifier is synchronous and fast, but `remark().use(remarkMdx).parse()` at runtime adds ~5-15ms per document (needs benchmarking)

**Remaining uncertainty:**
- Whether `remark-mdx` alone (without the full MDX compiler) produces a sufficiently complete AST for remarkLLMs -- needs integration testing
- Performance of remark parsing at Hocuspocus event frequency (burst saves) -- not benchmarked
- Memory characteristics when processing hundreds of documents in rapid succession

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Orama search client components** (useDocsSearch, SearchDialog): Not analyzed for reusability because our search UI will be integrated into the TipTap editor, not a standalone dialog
- **Layout components** (DocsLayout, sidebar, TOC panel): Not analyzed because our editor shell will be custom-built on Vite, not wrapping Fumadocs layouts
- **Fuma Content build pipeline**: Not deeply investigated because we're using gray-matter + Zod, not Fuma Content's collection system
- **Performance characteristics**: No benchmarks run (would require building and running the pipeline)

### Out of Scope
- MDX-CRDT roundtrip fidelity (covered in separate report)
- Mintlify comparison (covered in existing `fumadocs-vs-mintlify-architecture` report)
- Production deployment topology for Vite + Hocuspocus
- Vercel deployment constraints for WebSocket servers

---

## References

### Evidence Files
- [evidence/d1-mdx-plugins-source-analysis.md](evidence/d1-mdx-plugins-source-analysis.md) — Per-plugin source analysis, dependencies, coupling assessment
- [evidence/d2-source-interface-loader.md](evidence/d2-source-interface-loader.md) — Source types, loader() function, plugin system, bridge design
- [evidence/d3-orama-integration-pipeline.md](evidence/d3-orama-integration-pipeline.md) — Schema, buildDocuments, createFromSource, minimal pipeline
- [evidence/d4-ui-components-source-analysis.md](evidence/d4-ui-components-source-analysis.md) — Per-component assessment, dependencies, context requirements
- [evidence/d5-obsidian-wikilinks.md](evidence/d5-obsidian-wikilinks.md) — Wiki-link syntax, VaultResolver, backlinks NOT FOUND
- [evidence/d6-mdx-remote.md](evidence/d6-mdx-remote.md) — Runtime MDX compilation, preset, execution model
- [evidence/d7-content-processing.md](evidence/d7-content-processing.md) — Content Collections adapter, Fuma Content bridge
- [evidence/d8-agent-accessibility.md](evidence/d8-agent-accessibility.md) — llms(), isMarkdownPreferred(), content negotiation
- [evidence/d9-nextjs-vs-vite.md](evidence/d9-nextjs-vs-vite.md) — Hocuspocus embedding, TipTap integration, SSR assessment
- [evidence/d11-remark-llms-pipeline.md](evidence/d11-remark-llms-pipeline.md) — Complete remark-llms pipeline: stringifier, plugin, placeholder runtime, content negotiation, llms.txt generation, 4-endpoint delivery system
- [evidence/d13-llms-internals-local-reusability.md](evidence/d13-llms-internals-local-reusability.md) — Reusability analysis: can llms.txt internals power local filesystem catalog generation?

### External Sources
- [Fumadocs GitHub Repository](https://github.com/fuma-nama/fumadocs) — Source code analyzed (MIT license, v16.7.10)
- [Hocuspocus Server Examples](https://tiptap.dev/docs/hocuspocus/server/examples) — handleConnection() API documentation
- [TipTap Next.js Installation](https://tiptap.dev/docs/editor/getting-started/install/nextjs) — SSR/hydration workarounds
- [Vite Server Options](https://vite.dev/config/server-options) — configureServer hook documentation
- [Fumadocs React Router Guide](https://fumadocs.dev/docs/ui/manual-installation/react-router) — Vite adapter documentation
- [Next.js + Hocuspocus Example](https://github.com/CafeinoDev/next-hocuspocus-server) — Custom server pattern

### Related Research
- [fumadocs-karpathy-workflow-deep-dive](../fumadocs-karpathy-workflow-deep-dive/) — Architecture assessment against Karpathy LLM Knowledge Base workflow (covers content model, search, rendering at higher level)
