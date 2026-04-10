---
title: "Fumadocs vs Mintlify: Architecture Deep Dive for Agent-Native Knowledge Platforms"
description: "Comparative architectural analysis of Fumadocs and Mintlify documentation frameworks, examining MDX parsing pipelines, content models, editor experiences, search architectures, AI/agent integration patterns, and extensibility — with a focus on lessons for building an agent-native knowledge platform backed by markdown files in git."
createdAt: 2026-04-02
updatedAt: 2026-04-02
subjects:
  - Fumadocs
  - Mintlify
  - Fuma Content
  - Orama
  - Trieve
  - ChromaFs
topics:
  - docs-as-code architecture
  - MDX parsing pipelines
  - agent-native documentation
  - git-backed content systems
  - MCP server integration
---

# Fumadocs vs Mintlify: Architecture Deep Dive for Agent-Native Knowledge Platforms

**Purpose:** This report examines how Fumadocs and Mintlify handle the docs-as-code model across architecture, MDX parsing, editor experience, content model, search, AI/agent integration, extensibility, and open-source posture. The findings are intended to inform the design of an agent-native knowledge platform that uses markdown files in git as its substrate, provides a rich editor + MCP server, and involves zero LLM compute on the platform side.

---

## Executive Summary

Fumadocs and Mintlify represent two fundamentally different approaches to the same problem space. Fumadocs is a fully open-source (MIT), self-hosted React documentation framework with a three-layer architecture (Content -> Core -> UI) that treats the filesystem as the content database. Mintlify is a proprietary managed platform that layers a visual editor, AI assistant, auto-generated MCP servers, and agent analytics on top of a git-backed MDX substrate.

For building an agent-native knowledge platform, both offer essential lessons but serve different roles:

**Fumadocs provides the architectural template** — its layered, pluggable design (swappable search, content sources, UI, framework adapters), type-safe content collections with Zod validation, and pure filesystem-as-database model demonstrate how to build a content processing engine where git is the only storage layer. Its evolution toward [Fuma Content](https://fumadocs.dev/blog/fumadocs-mdx-road-map) (a framework-agnostic content processing layer) is directionally aligned with the knowledge platform concept.

**Mintlify provides the product template** — its bi-directional git sync (visual editor changes commit to git, git pushes appear in editor), auto-generated MCP servers, content negotiation middleware (30x token reduction for agents), ChromaFs virtual filesystem for AI search, skill.md agent onboarding standard, and agent analytics demonstrate what the user-facing product surface of an agent-native docs platform looks like.

**Key Findings:**
- **Content negotiation** (same URL serves HTML to browsers, Markdown to agents) is the emerging standard for agent-accessible content, validated by both frameworks.
- **MCP servers over documentation** require only two tools (search + get-page) to be useful — zero LLM compute on the server side.
- **Fumadocs' type-safe collections** (Zod-validated frontmatter at build time) provide a content model that agents can programmatically manipulate with confidence.
- **Mintlify's bi-directional git sync** proves that visual editors and git-backed storage can coexist without compromising either authoring surface.
- **ChromaFs** (filesystem abstractions over vector databases) demonstrates that agents work best when given familiar file operations, not custom APIs.

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| 1 | Architecture & Build Pipeline | P0 | Deep |
| 2 | MDX Parsing Pipeline | P0 | Deep |
| 3 | Project Structure & Content Model | P0 | Deep |
| 4 | Editor Experience | P0 | Moderate |
| 5 | Search Architecture | P1 | Moderate |
| 6 | AI/Agent Integration | P0 | Deep |
| 7 | OSS Status & Licensing | P1 | Moderate |
| 8 | Extensibility & Plugin Model | P1 | Moderate |
| 9 | Git Integration & Docs-as-Code | P0 | Deep |
| 10 | Patterns for Agent-Native Knowledge Platforms | P0 | Deep |

**Stance:** Factual. No recommendations — findings inform downstream product decisions.

**Non-goals:** Pricing comparison, marketing site design assessment, visual design quality, performance benchmarks.

---

## Comparative Overview

| Dimension | Fumadocs | Mintlify |
|-----------|----------|----------|
| **Type** | Open-source framework (MIT) | Proprietary managed platform |
| **Hosting** | Self-hosted (any provider) | Managed (Mintlify-hosted only) |
| **Framework** | React (Next.js, React Router, TanStack, Waku) | Platform-managed (internal build) |
| **Content format** | MDX + JSON/YAML meta files | MDX + docs.json config |
| **Navigation** | Filesystem-derived + meta.json | Declarative in docs.json |
| **Editor** | Code-only (IDE + dev server) | Visual editor + Markdown + IDE (bi-directional) |
| **MDX parser** | Full unified pipeline (remark/rehype/recma) | Thin wrapper on next-mdx-remote-client |
| **Search** | Pluggable (Orama, Algolia, FlexSearch, custom) | Managed (Trieve + ChromaFs) |
| **AI/Agent** | Building blocks (llms.txt, .mdx endpoints) | Full stack (MCP, skill.md, analytics, content negotiation) |
| **MCP server** | DIY setup | Auto-generated, hosted |
| **Content negotiation** | Middleware helper available | Automatic, 30x token reduction |
| **Stars** | 11.4k | N/A (proprietary) |
| **License** | MIT | Proprietary (select components MIT) |
| **Extensibility** | Deep (pipeline, loader, UI, search, framework) | Constrained (components, config, snippets) |

---

## Detailed Findings

### 1. Architecture & Build Pipeline

**Finding:** Fumadocs operates as a three-layer, self-hosted framework; Mintlify operates as a fully managed cloud platform. Both use git as the content substrate.

**Evidence:** [evidence/architecture-build-pipeline.md](evidence/architecture-build-pipeline.md)

Fumadocs is a pnpm workspace monorepo orchestrated by Turborepo. Its three layers are independently usable:

1. **fumadocs-mdx** — transforms raw content files into type-safe virtual modules at `.source/index.ts`
2. **fumadocs-core** — provides framework-agnostic content loading, page tree generation, search indexing, and framework adapters (Next.js, React Router, TanStack Start, Waku)
3. **fumadocs-ui** / **@fumadocs/base-ui** — React component libraries (Radix-based and base variants)

The build uses tsdown for TypeScript bundling, @tailwindcss/cli for CSS, and supports full static export for CDN deployment. Additional packages handle OpenAPI rendering, TypeScript documentation, and CLI tooling.

Mintlify is a closed-source platform where the build pipeline runs entirely on their infrastructure. Users connect a GitHub/GitLab repository, install a GitHub App, and Mintlify automatically builds and deploys on push to the default branch. Internally, their pipeline uses Bull on Redis for job queuing and Daytona for ephemeral sandboxes. Pages are pre-rendered for performance.

**Decision triggers:**
- If you need full control over the build pipeline, hosting, and deployment: Fumadocs.
- If you want zero infrastructure management: Mintlify.
- If you're building a platform that others will self-host: Fumadocs' architecture provides the template.

**Remaining uncertainty:**
- Mintlify's internal rendering framework is not publicly documented.
- Fumadocs build-time performance at 1000+ page scale is not benchmarked in available sources.

---

### 2. MDX Parsing Pipeline

**Finding:** Fumadocs exposes the full unified pipeline (remark -> rehype -> recma) with custom plugin support at every stage. Mintlify wraps next-mdx-remote-client with minimal customization surface.

**Evidence:** [evidence/mdx-parsing-pipeline.md](evidence/mdx-parsing-pipeline.md)

**Fumadocs pipeline (full control):**

```
MDX source
  -> Remark plugins (mdast): remarkStructure, remarkImage, remarkHeading + custom
  -> Rehype plugins (hast): rehype-code (@shikijs/rehype wrapper), rehype-toc + custom
  -> Recma plugins (esast): JavaScript AST transforms + custom
  -> Virtual module output (.source/index.ts)
```

Key capabilities:
- Custom remark/rehype/recma plugins at any stage
- `remarkStructure` extracts document info for search indexing
- `rehype-code` wraps Shiki for syntax highlighting with dual-theme support
- `includeProcessedMarkdown: true` captures intermediate Markdown before HTML conversion (critical for AI endpoints)
- `valueToExport` exports compile-time data from remark plugins as ESM properties
- Collection schema validation via Zod at build time

The `getDefaultMDXOptions` function allows extending or overriding the default pipeline per-collection.

**Fumadocs future direction:** [Fuma Content](https://fumadocs.dev/blog/fumadocs-mdx-road-map) is being designed as a framework-agnostic content processing layer. It will support multiple bundlers (Vite, Turbopack, Webpack), custom collection types, an Obsidian plugin, and a new plugin system distinct from bundler plugins. It positions itself as "a foundation for developing a CMS layer, such as plugins for MDX editing or remote databases."

**Mintlify pipeline (managed):**

[@mintlify/mdx](https://github.com/mintlify/mdx) is "a thin layer on top of next-mdx-remote-client." Three APIs:
- `serialize`: Compiles MDX source into SerializeResult
- `MDXClient`: Client-side rendering component
- `MDXRemote`: Server component for both serialization and rendering

Accepts custom remark and rehype plugins via `mdxOptions` parameter. But on the managed platform, the server-side MDX processing pipeline is closed-source and not user-modifiable.

**Decision triggers:**
- If you need to inject custom transforms (e.g., auto-linking terms, injecting metadata, content analysis): Fumadocs' pipeline gives full access.
- If you need the intermediate Markdown representation (for AI consumption): Fumadocs' `includeProcessedMarkdown` is purpose-built for this.
- If you want zero pipeline configuration: Mintlify handles it silently.

---

### 3. Project Structure & Content Model

**Finding:** Fumadocs derives navigation from the filesystem with meta.json overrides; Mintlify decouples navigation from files via a declarative docs.json config.

**Evidence:** [evidence/project-structure-content-model.md](evidence/project-structure-content-model.md)

**Fumadocs project structure:**

```
project/
  source.config.ts          # defineDocs() with Zod schemas
  content/
    docs/
      index.mdx             # /docs
      getting-started.mdx    # /docs/getting-started
      guides/
        meta.json            # { title, icon, pages: [...], defaultOpen }
        first-guide.mdx      # /docs/guides/first-guide
      (internal)/             # Parenthesized = excluded from slugs
        setup.mdx            # /docs/setup (not /docs/internal/setup)
  .source/
    index.ts                 # Auto-generated type-safe virtual modules
```

The `loader()` function from fumadocs-core/source produces a `LoaderOutput` containing:
- `pageTree`: Hierarchical PageTree.Root with Item, Folder, Separator nodes
- `getPage(slugs)`: Content access by slug
- `getPages()`: All pages
- Search index data

The `PageTreeBuilder` scans files via a `ContentStorage` abstraction, applies `PageTreeTransformer` hooks (file, folder, separator, root), and builds hierarchy from flat file paths. This virtualizes filesystem access, supporting locale-aware file resolution for i18n.

**Mintlify project structure:**

```
project/
  docs.json                 # Single config: name, theme, colors, navigation
  index.mdx                 # Home page
  quickstart.mdx
  api-reference/
    endpoint.mdx
  snippets/
    reusable-component.mdx  # Not rendered as pages
```

Navigation is entirely declarative in docs.json. The `navigation` property supports recursive nesting of pages, groups, tabs, anchors, and dropdowns — all interchangeable. The `$ref` directive enables modular config splitting across files.

**Architectural difference:** In Fumadocs, the filesystem IS the navigation (with meta.json overrides). In Mintlify, navigation is an independent declaration that references files by path. Fumadocs can derive structure from files; Mintlify requires explicit declaration.

**Decision triggers:**
- If agents will create/organize content by manipulating files: Fumadocs' filesystem-derived navigation means file operations directly change the site structure.
- If navigation needs to differ from file organization: Mintlify's declarative model allows arbitrary navigation without file reorganization.
- If type safety at build time matters (content validation): Fumadocs' Zod-validated collections catch errors before deploy.

---

### 4. Editor Experience

**Finding:** Mintlify has a full browser-based visual editor with bi-directional Git sync. Fumadocs is code-only with local dev server preview.

**Evidence:** [evidence/editor-experience.md](evidence/editor-experience.md)

**Mintlify editor capabilities:**
- Dual modes: visual WYSIWYG and Markdown source editing
- Live preview updates in real time (no local build)
- Drag-and-drop navigation management
- Built-in media asset management
- Branch-based workflows for concurrent editing
- "/" command menu for component insertion
- AI-powered content generation, rewriting, restructuring
- Shareable preview links for team review
- Publish button for immediate deployment
- All changes automatically committed to Git repository

**Fumadocs authoring:**
- MDX files edited directly in IDE (VS Code recommended)
- `npm run dev` for local preview at localhost:3000/docs
- Hot-reload via framework dev server
- No built-in visual editor, no web-based editing, no collaborative features

**Decision triggers:**
- If non-technical contributors need to author content: Mintlify's visual editor is essential.
- If the platform needs a rich editing experience: Mintlify's bi-directional sync pattern is the reference implementation.
- If the target users are developers only: Fumadocs' code-only workflow is sufficient and faster for technical users.

---

### 5. Search Architecture

**Finding:** Fumadocs offers pluggable search with multiple providers (Orama default). Mintlify uses a managed hybrid stack combining Trieve semantic search with a ChromaFs virtual filesystem for AI retrieval.

**Evidence:** [evidence/search-architecture.md](evidence/search-architecture.md)

**Fumadocs search providers:**

| Provider | Type | Static support | Notes |
|----------|------|---------------|-------|
| [Orama](https://fumadocs.dev/docs/headless/search/orama) (default) | Full-text | Yes (cached JSON) | Same engine as Node.js docs |
| Orama Cloud | Managed full-text | N/A | Cloud-hosted indexing |
| [Algolia](https://fumadocs.dev/docs/headless/search/algolia) v5 | Full-text | N/A | Per-paragraph records |
| Mixedbread SDK | Semantic/vector | N/A | Vector search option |
| [FlexSearch](https://fumadocs.dev/docs/search/flexsearch) | Full-text | Yes (cached JSON) | Lightweight alternative |

Unified API: `createFromSource()` abstraction with SearchAPI interface. Static mode pre-renders indexes — critical for CDN-deployed sites. i18n supported with per-locale indexes.

**Mintlify search stack:**
1. **[Trieve](https://www.mintlify.com/blog/mintlify-acquires-trieve-to-improve-rag-search-in-documentation)** (acquired): Dense vector semantic search + cross-encoder re-ranking
2. **AI Assistant**: Agentic retrieval — LLM uses tool calling to search, not pre-constructed context
3. **[ChromaFs](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant)**: Virtual filesystem over Chroma vector DB. Unix commands (grep, cat, ls, find) translated to DB queries. Boot: ~100ms. Cost: ~$0/conversation. Scale: 30,000+ conversations/day.

ChromaFs is built on "just-bash" (Vercel Labs TypeScript bash implementation) with a pluggable `IFileSystem` interface. It uses a gzipped JSON path tree for O(1) directory operations, two-stage grep filtering (coarse Chroma filter -> fine in-memory filter), and chunk reassembly for split documents. All writes return EROFS (read-only).

---

### 6. AI/Agent Integration

**Finding:** Mintlify provides a complete managed AI/agent stack (MCP, skill.md, analytics, content negotiation). Fumadocs provides building blocks that require developer assembly.

**Evidence:** [evidence/ai-agent-integration.md](evidence/ai-agent-integration.md)

**Fumadocs AI primitives:**
- `/llms.txt`: Auto-generated page index via Loader API
- `/llms-full.txt`: All pages combined via `getLLMText()` function
- `.mdx` URL suffix: Raw Markdown for any page (Content-Type: text/markdown)
- `isMarkdownPreferred(request)`: Content negotiation middleware
- Page Actions component: Copy/view markdown buttons (CLI-installable)
- Chat integrations: OpenRouter (Vercel AI SDK) and Inkeep AI
- Requires: `includeProcessedMarkdown: true` in source config

**Mintlify AI/agent stack:**

| Feature | Details |
|---------|---------|
| **MCP server** | Auto-generated at `/mcp` (public) + `/authed/mcp` (authenticated). Tools: search + get-page. Rate limits: 5K req/hr per user. OAuth for web tools. |
| **[skill.md](https://www.mintlify.com/blog/skill-md)** | At `/.well-known/skills/default/skill.md`. Decision tables, boundaries, gotchas. Auto-regenerated on updates. Installable via `npx skills add`. |
| **Content negotiation** | `Accept: text/markdown` -> clean Markdown. `Link` and `X-Llms-Txt` HTTP headers for discovery. Prepends llms.txt index. 30x token reduction. |
| **[Agent analytics](https://www.mintlify.com/blog/agent-analytics)** | Identifies agents via user-agent matching. Tracks: which agents, most-accessed pages, MCP searches. |
| **AI Assistant** | Agentic retrieval via ChromaFs. Claude Sonnet 4.5 powered. Citations. Topic categorization. |
| **Mintlify Agent (Autopilot)** | Monitors repos for code changes. Auto-generates doc drafts. Creates PRs. Configurable via AGENTS.md. Pro plan. |

The gap between the two is significant: Fumadocs gives you ingredients (llms.txt generation, content negotiation helper), Mintlify gives you a complete product (hosted MCP server, analytics dashboard, auto-regenerating skill.md).

**Decision triggers:**
- If building a knowledge platform with MCP as a first-class feature: Mintlify's implementation is the reference. Two tools (search + get-page) is sufficient for a useful MCP server.
- If you need agent analytics (which agents are querying, what they're reading): Only Mintlify provides this currently.
- If you want to control the AI/agent layer entirely: Fumadocs' building-block approach lets you build a custom stack.

---

### 7. OSS Status & Licensing

**Finding:** Fumadocs is fully MIT-licensed with 11.4k stars but single-maintainer risk. Mintlify is proprietary with select MIT components.

**Evidence:** [evidence/oss-status-licensing.md](evidence/oss-status-licensing.md)

**Fumadocs:**
- License: MIT (all packages)
- Stars: 11.4k, Forks: 642
- Releases: 1,657 total (high velocity)
- Primary maintainer: [fuma-nama](https://github.com/fuma-nama) (single primary contributor)
- Closed PRs: 1,415 (healthy merge activity)
- Monorepo: pnpm, Turborepo, Changesets
- 3x download growth year-over-year (per PkgPulse)

**Mintlify:**
- Core platform: Proprietary, closed source
- Open components: @mintlify/mdx (MIT), docs starter (MIT), components (MIT)
- GitHub org: 25 repositories
- OSS program: 90% discount for recognized open-source projects
- Pricing: Free (Hobby), $300/month (Pro), Custom
- Notable customers: Anthropic, Perplexity, Cursor, Zapier, Coinbase, Vercel

**Decision triggers:**
- If you need to fork and modify the entire stack: Only Fumadocs (MIT) allows this.
- If single-maintainer risk is a concern: Fumadocs has one primary maintainer. Community contributions exist but core development is concentrated.
- If you want Mintlify's features without vendor dependency: Their open-source components (@mintlify/mdx) are usable independently but don't include the platform features.

---

### 8. Extensibility & Plugin Model

**Finding:** Fumadocs is extensible at nearly every architectural layer. Mintlify constrains extensibility to component-level customization within the platform.

**Evidence:** [evidence/extensibility-plugin-model.md](evidence/extensibility-plugin-model.md)

**Fumadocs extensibility points:**

| Layer | Mechanism | Example |
|-------|-----------|---------|
| MDX pipeline | Custom remark/rehype/recma plugins | Auto-link terms, inject metadata |
| Loader | Loader plugins (slugs, icons, custom) | Custom slug generation |
| Page tree | PageTreeTransformer hooks | Custom sorting, filtering |
| UI | Shadcn-inspired components, installable via CLI | Full component source control |
| Theming | CSS variables, Tailwind presets, next-themes | Custom design system |
| Content sources | Pluggable adapters | Fumadocs MDX, Content Collections, headless CMS |
| Search | Pluggable providers | Orama, Algolia, FlexSearch, custom |
| Framework | Adapter system | Next.js, React Router, TanStack, Waku |

The `fumadocs add` CLI command installs components locally for full modification — the Shadcn "copy the source" model rather than wrapping opaque library components.

**Mintlify extensibility:**
- Reusable snippets in `snippets/` directory (arrow function syntax only)
- Built-in component library (Tabs, Cards, Steps, Callouts, etc.)
- JSX components in MDX files
- docs.json configuration for appearance/navigation
- OpenAPI integration for API playgrounds
- **Cannot:** modify build pipeline, add remark/rehype plugins, swap search, add hooks

---

### 9. Git Integration & Docs-as-Code

**Finding:** Fumadocs is natively git-backed (files ARE content). Mintlify adds a bi-directional sync layer between Git and a visual editor — proving both surfaces can coexist.

**Evidence:** [evidence/git-integration-docs-as-code.md](evidence/git-integration-docs-as-code.md)

**Fumadocs git model:**
Git is not "integrated" — it's inherent. MDX files in `content/docs/` are the documentation. meta.json files control organization. source.config.ts defines schema. Build reads directly from the filesystem. Git history = version history. PRs = review workflow. There is no sync layer, no adapter, no database — the filesystem IS the API.

**Mintlify git model:**
Bi-directional sync between three surfaces:
1. **Git repository** (GitHub/GitLab): Source of truth
2. **Web editor**: Visual authoring surface that commits to Git
3. **Deployed site**: Auto-built on push to default branch

Engineers work in IDEs + Git. Writers use the web editor. Both converge on the same repository. Preview deployments exist for every branch.

**Decision triggers:**
- If building a platform where agents create content via file operations: Fumadocs' pure filesystem model means `git add` + `git commit` is the entire authoring API.
- If building a platform with multiple authoring surfaces (editor, CLI, agent, API): Mintlify's bi-directional sync pattern demonstrates how to converge them on Git.

---

### 10. Patterns for Agent-Native Knowledge Platforms

**Finding:** Five architectural patterns emerge from both frameworks that directly apply to building an agent-native knowledge platform with markdown+git as substrate.

**Evidence:** [evidence/patterns-for-agent-native-platforms.md](evidence/patterns-for-agent-native-platforms.md)

**Pattern 1: Git-backed filesystem as the content database**

Both frameworks validate that MDX files in git repos serve as a complete content layer. No separate database is needed for content storage. Fumadocs reads files at build time. Mintlify syncs files bidirectionally with a visual editor. In both cases, git provides versioning, branching, access control, and collaboration workflows without additional infrastructure.

For the knowledge platform: The filesystem IS the API. Agents create content by writing files. Organization changes by editing meta.json or equivalent. Version history by git log. This eliminates an entire class of infrastructure (content databases, sync engines, migration scripts).

**Pattern 2: Content negotiation middleware for dual-audience serving**

Same URL, different formats:
- Browser requests -> HTML (rendered page)
- Agent requests (`Accept: text/markdown`) -> clean Markdown
- Fumadocs: `.mdx` URL suffix as alternative
- Mintlify: HTTP headers (`Link: </llms.txt>; rel="llms-txt"`) for discovery

Mintlify reports 30x token reduction when serving Markdown instead of HTML to agents. The middleware is lightweight — a single `isMarkdownPreferred(request)` check.

For the knowledge platform: Build content negotiation into the serving layer from day one. Every page should be queryable as both rendered HTML and clean Markdown.

**Pattern 3: MCP server as a content query interface**

Mintlify's auto-generated MCP server exposes exactly two tools:
1. `search`: Find relevant documentation (with pageSize, scoreThreshold, version, language filters)
2. `get-page`: Retrieve full content by path

This is sufficient for AI agents to navigate and consume documentation. The server does zero LLM compute — it serves content, the client's LLM reasons over it.

For the knowledge platform: An MCP server over markdown content is the primary agent interface. Two tools (search + read) cover the core use case. Authentication layers (public vs. authed endpoints) enable access control. Rate limiting prevents abuse. This maps directly to the "MCP server + git-backed storage with zero LLM compute" requirement.

**Pattern 4: Multi-layer agent entry points (llms.txt -> skill.md -> MCP -> content negotiation)**

The emerging stack for agent-accessible content has four layers:

| Layer | Purpose | Example |
|-------|---------|---------|
| `llms.txt` | Index of all pages | `/llms.txt` — page list with URLs |
| `llms-full.txt` | Complete content dump | `/llms-full.txt` — all pages concatenated |
| `skill.md` | Agent onboarding guide | Decision tables, boundaries, gotchas |
| MCP server | Real-time query interface | search + get-page tools |
| Content negotiation | Per-page Markdown access | Accept header -> Markdown response |

Each layer serves a different agent interaction pattern: context stuffing (llms-full.txt), discovery (llms.txt), orientation (skill.md), and interactive querying (MCP).

**Pattern 5: Type-safe content collections for programmatic manipulation**

Fumadocs' `defineCollections()` with Zod schemas validates content at build time:
- Frontmatter types are checked
- Schema violations fail the build
- The `.source/index.ts` virtual module provides typed access to all content

For the knowledge platform: Schema-validated content means agents can programmatically create pages knowing exactly what frontmatter is required and what types are expected. Build-time validation catches errors before deployment — a safety net for agent-authored content.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Mintlify's internal build technology**: What framework renders the pages is not publicly documented.
- **Conflict resolution**: How Mintlify handles simultaneous web editor and Git push conflicts.
- **Scale benchmarks**: Neither framework provides published performance data at 1000+ page scale.
- **ChromaFs availability**: Whether ChromaFs components are or will be open-sourced.

### Out of Scope (per Rubric)
- Pricing comparison
- Marketing site design quality assessment
- Visual design quality comparison
- Performance benchmarks

---

## References

### Evidence Files
- [evidence/architecture-build-pipeline.md](evidence/architecture-build-pipeline.md) — Framework architecture, build systems, hosting models
- [evidence/mdx-parsing-pipeline.md](evidence/mdx-parsing-pipeline.md) — MDX parsing, remark/rehype/recma, collections, Fuma Content roadmap
- [evidence/project-structure-content-model.md](evidence/project-structure-content-model.md) — File routing, meta.json, docs.json, content schemas
- [evidence/editor-experience.md](evidence/editor-experience.md) — Visual editor, code-only authoring, bi-directional sync
- [evidence/search-architecture.md](evidence/search-architecture.md) — Search providers, ChromaFs, Trieve, Orama
- [evidence/ai-agent-integration.md](evidence/ai-agent-integration.md) — MCP, llms.txt, skill.md, content negotiation, agent analytics
- [evidence/oss-status-licensing.md](evidence/oss-status-licensing.md) — Licenses, community health, maintainer model
- [evidence/extensibility-plugin-model.md](evidence/extensibility-plugin-model.md) — Plugin systems, custom components, theming
- [evidence/git-integration-docs-as-code.md](evidence/git-integration-docs-as-code.md) — Git models, bi-directional sync
- [evidence/patterns-for-agent-native-platforms.md](evidence/patterns-for-agent-native-platforms.md) — Cross-cutting patterns for knowledge platforms

### External Sources
- [Fumadocs Official Documentation](https://fumadocs.dev/docs) — Framework docs, API reference
- [Fumadocs GitHub Repository](https://github.com/fuma-nama/fumadocs) — Source code, 11.4k stars, MIT license
- [Fumadocs Comparisons](https://fumadocs.dev/docs/comparisons) — Official comparison with Nextra, Mintlify, Docusaurus
- [Fumadocs MDX Roadmap / Fuma Content](https://fumadocs.dev/blog/fumadocs-mdx-road-map) — Future architectural direction
- [Fumadocs DeepWiki Analysis](https://deepwiki.com/fuma-nama/fumadocs) — Architectural analysis, package breakdown
- [Mintlify Official Documentation](https://www.mintlify.com/docs) — Platform docs
- [Mintlify MCP Documentation](https://www.mintlify.com/docs/ai/model-context-protocol) — MCP server implementation
- [Mintlify Web Editor](https://www.mintlify.com/docs/editor) — Visual editor features
- [Mintlify ChromaFs Blog](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) — Virtual filesystem architecture
- [Mintlify Content Negotiation](https://www.mintlify.com/blog/context-for-agents) — Agent content delivery
- [Mintlify skill.md Standard](https://www.mintlify.com/blog/skill-md) — Agent skill specification
- [Mintlify Agent Analytics](https://www.mintlify.com/blog/agent-analytics) — AI traffic analytics
- [Mintlify MDX Parser](https://github.com/mintlify/mdx) — Open-source MDX component
- [Mintlify Trieve Acquisition](https://www.mintlify.com/blog/mintlify-acquires-trieve-to-improve-rag-search-in-documentation) — Search infrastructure
- [Mintlify Review (Ferndesk)](https://ferndesk.com/blog/mintlify-review) — Independent 2026 review
