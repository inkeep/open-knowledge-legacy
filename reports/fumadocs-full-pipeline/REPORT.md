---
title: "Fumadocs Complete Pipeline: Source-Code-Level Architecture for Building a Visual Editor Layer"
description: "Deep source-code investigation of Fumadocs' full content pipeline — from MDX authoring through component registration, rendering, and publishing — with architectural analysis of how a visual editor would integrate as an authoring layer on top of Fumadocs' rendering/publishing infrastructure."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - Fumadocs
  - fumadocs-mdx
  - fumadocs-core
  - fumadocs-ui
  - Fuma Content
  - MDX
topics:
  - MDX content pipeline
  - component registration architecture
  - visual editor integration
  - content source abstraction
  - React documentation framework
---

# Fumadocs Complete Pipeline: Source-Code-Level Architecture for Building a Visual Editor Layer

**Purpose:** Provide source-code-level understanding of Fumadocs' entire content pipeline — from file structure through MDX compilation, component registration, rendering, and deployment — to evaluate how a visual editor would integrate as an authoring layer where Fumadocs is the rendering/publishing layer.

---

## Executive Summary

Fumadocs is a three-layer React documentation framework (Content -> Core -> UI) where each layer is independently usable and the boundaries between them are clean, typed interfaces. At its center is a remarkably simple abstraction: the `Source` interface — a flat array of `VirtualFile` objects (pages with data + metas with data) that any content source must produce. This is the integration point for a visual editor.

The MDX pipeline compiles content at build time via `@mdx-js/mdx`'s `createProcessor`, producing ES modules that export a React component, TOC, structured search data, and frontmatter. Components are resolved at *runtime* (render time), not build time — they're passed via the standard MDX `components` prop, which is a plain JavaScript object mapping names to React components. There is no global registry, no provider pattern, no magic.

This architecture is favorable for a visual editor overlay because:

1. **The component mapping is a discoverable object.** `defaultMdxComponents` from `fumadocs-ui/mdx` is a plain export. A visual editor can import it, enumerate keys, and introspect each component's TypeScript types via react-docgen-typescript.

2. **The Source API is content-agnostic.** Any system that produces `{ files: VirtualFile[] }` can feed Fumadocs. A visual editor that emits MDX files or compiled components can plug in without modifying Fumadocs core.

3. **Runtime compilation exists.** `@fumadocs/mdx-remote` and the `dynamic` collection mode provide on-demand MDX-to-React compilation, enabling live preview without full rebuild cycles.

4. **Fuma Content is evolving toward exactly this use case.** The roadmap explicitly names "plugins for MDX editing" and "CMS layer foundations" as goals.

**Key Findings:**
- **Component registration is explicit and inspectable** — a plain object mapping, not framework magic. Custom components are added by spreading into `getMDXComponents()`.
- **The Source interface is the integration contract** — `{ files: VirtualFile[] }` where each file has `path`, `data` (with `body: FC<MDXProps>`, `toc`, `structuredData`), and optionally `absolutePath`.
- **TypeScript prop types are not used at runtime** — Fumadocs provides no built-in prop introspection. A visual editor must add its own (react-docgen-typescript recommended).
- **MDX compilation has two modes** — `bundler` (build time, ESM output) and `runtime` (on demand, function-body output via `new AsyncFunction()`).
- **The remark/rehype pipeline is fully extensible** — custom plugins can be injected at any stage (remark, rehype, recma).

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| D1 | Project setup & structure | P0 | Deep |
| D2 | MDX content pipeline | P0 | Deep |
| D3 | Built-in component system | P0 | Deep |
| D4 | Custom component registration | P0 | Deep |
| D5 | Rendering pipeline | P0 | Deep |
| D6 | Content source abstraction | P0 | Deep |
| D7 | Fuma Content evolution | P0 | Moderate |
| D8 | Publishing / deployment | P1 | Moderate |
| D9 | Build-time vs runtime component resolution | P0 | Deep |

**Stance:** Factual with conclusions (the primary question asks for an architectural assessment).
**Non-goals:** Performance benchmarking, comparison with other docs frameworks (see existing `fumadocs-vs-mintlify-architecture` report), visual design quality.

---

## Detailed Findings

### D1: Project Setup & Structure

**Finding:** Fumadocs projects follow a minimal, convention-over-configuration structure centered on three files: `source.config.ts`, `next.config.mjs`, and `components/mdx.tsx`.

**Evidence:** [evidence/d1-project-setup-structure.md](evidence/d1-project-setup-structure.md)

A minimal Fumadocs project:

```
project/
  source.config.ts          # defineDocs() — declares content collections with Zod schemas
  next.config.mjs           # createMDX() wrapping Next.js config
  content/
    docs/                   # MDX files + meta.json navigation overrides
      index.mdx
      guides/
        meta.json           # { title, pages: [...], defaultOpen }
        first-guide.mdx
  .source/                  # AUTO-GENERATED — type-safe virtual modules
    index.ts
  app/
    layout.tsx              # <RootProvider> from fumadocs-ui
    docs/
      layout.tsx            # <DocsLayout tree={source.getPageTree()}>
      [[...slug]]/
        page.tsx            # Catch-all route: source.getPage(slug) -> <MDX>
  components/
    mdx.tsx                 # getMDXComponents() — component mapping
  lib/
    source.ts               # loader() from fumadocs-core/source
```

The monorepo packages (Content -> Core -> UI) are independently usable:

| Package | Role | Can be used alone? |
|---------|------|--------------------|
| `fumadocs-mdx` | MDX compilation, file watching, collection definitions | Yes (content layer only) |
| `fumadocs-core` | Source API, page tree, search, MDX plugins, i18n, negotiation | Yes (headless mode) |
| `fumadocs-ui` | Radix-based React components (DocsLayout, Callout, Tabs, etc.) | Yes (any React docs project) |
| `@fumadocs/base-ui` | Unstyled component variants | Yes (for custom styling) |
| `@fumadocs/content` | Fuma Content adapter to Source API | Yes (with fuma-content) |

The `source.config.ts` file uses `defineDocs()` to declare collections:

```typescript
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { pageSchema, metaSchema } from 'fumadocs-core/source/schema';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: { schema: pageSchema },
  meta: { schema: metaSchema },
});

export default defineConfig({ mdxOptions: {} });
```

**Implications:** The project structure is lightweight and predictable. A visual editor can discover content directories from `source.config.ts`, enumerate MDX files, and understand the navigation structure from `meta.json` files.

---

### D2: MDX Content Pipeline

**Finding:** Fumadocs compiles MDX at build time via `@mdx-js/mdx`'s `createProcessor` with a rich default plugin pipeline (remark-gfm, heading extraction, image processing, Shiki syntax highlighting, structure extraction for search). The pipeline is fully extensible at every stage.

**Evidence:** [evidence/d2-mdx-content-pipeline.md](evidence/d2-mdx-content-pipeline.md)

The compilation pipeline:

```
MDX source file
  -> fumaMatter() — frontmatter extraction
  -> Zod schema validation (from collection config)
  -> Plugin transforms (frontmatter, vfile)
  -> createProcessor(@mdx-js/mdx):
      Remark phase (MDAST):
        1. remarkGfm
        2. remarkHeading (ID + TOC)
        3. remarkImage (import optimization)
        4. remarkCodeTab
        5. remarkNpm
        6. [user remark plugins]
        7. remarkStructure (search indexing data)
        8. remarkPostprocess (markdown capture, link extraction)
      Rehype phase (HAST):
        1. rehypeCode (Shiki highlighting)
        2. [user rehype plugins]
        3. rehypeToc
      Recma phase (ESAST):
        [user recma plugins]
  -> ES module output:
      exports { default: FC<MDXProps>, frontmatter, toc, structuredData, _markdown?, _mdast? }
```

Integration with bundlers:

- **Next.js (webpack):** Custom webpack loader at `fumadocs-mdx/loader-mdx`
- **Next.js (turbopack):** Custom turbopack loader via `turbopack.rules`
- **Vite:** Vite plugin with `enforce: 'pre'`

HMR: Chokidar watches `source.config.ts` and all content directories. Config changes restart the dev server. File changes trigger index file regeneration.

**Implications:** The remark/rehype pipeline is the core transformation layer. A visual editor that needs to inject custom transforms (e.g., component metadata extraction, content validation) can do so via the standard plugin extension points. The `_markdown` and `_mdast` outputs (opt-in via `includeProcessedMarkdown` and `includeMDAST`) provide intermediate representations useful for editor round-tripping.

---

### D3: Built-in Component System

**Finding:** fumadocs-ui ships ~15 components (Callout, Tabs, Card, CodeBlock, Accordion, Steps, Files, TypeTable, etc.) as standard React components. They are NOT auto-injected — they're exported as a plain object (`defaultMdxComponents`) that must be passed explicitly via the MDX `components` prop.

**Evidence:** [evidence/d3-built-in-components.md](evidence/d3-built-in-components.md)

The `defaultMdxComponents` export from `fumadocs-ui/mdx`:

```typescript
const defaultMdxComponents = {
  // HTML element overrides
  pre: (props) => <CodeBlock><Pre>{props.children}</Pre></CodeBlock>,
  a: Link,
  img: Image,
  h1-h6: Heading variants,
  table: Table,
  // Named components (usable as JSX tags in MDX)
  Card, Cards,
  Callout, CalloutContainer, CalloutTitle, CalloutDescription,
  CodeBlockTab, CodeBlockTabs, CodeBlockTabsList, CodeBlockTabsTrigger,
};
```

Component characteristics:

| Component | Server/Client | Props interface |
|-----------|--------------|-----------------|
| Callout | Server | `{ type?: 'info'|'warn'|'error'|'success'|'warning'|'idea', title?: ReactNode, children }` |
| Tabs | Client (`'use client'`) | `{ items?: string[], defaultIndex?: number, label?: ReactNode }` |
| Card | Server | `{ href, icon, title, description }` |
| CodeBlock | Server | Standard pre/code props |
| Steps | Server | `{ children }` |
| Accordion | Client | Radix Accordion props |
| Files | Server | File tree display |
| TypeTable | Server | TypeScript type documentation |

Additional components available (not in defaultMdxComponents but importable):
- `Banner` — announcement banners
- `ImageZoom` — zoomable images
- `InlineTOC` — inline table of contents
- `DynamicCodeblock` — runtime-configurable code blocks
- `GitHubInfo` — GitHub repository info display

**Implications:** Built-in components are ordinary React components with TypeScript interfaces. A visual editor can enumerate them from the `defaultMdxComponents` object, extract prop types via react-docgen-typescript, and render them in a preview panel. There is no special treatment needed — built-in and custom components are identical in mechanism.

---

### D4: Custom Component Registration

**Finding:** Adding a custom component to Fumadocs is a one-line addition to the `getMDXComponents()` return value. There is no registration API, no manifest, no plugin system. It's standard MDX component mapping.

**Evidence:** [evidence/d4-custom-component-registration.md](evidence/d4-custom-component-registration.md)

The pattern:

```typescript
// components/mdx.tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import MyWidget from './my-widget';
import PricingTable from './pricing-table';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    MyWidget,        // Available as <MyWidget /> in all MDX
    PricingTable,    // Available as <PricingTable /> in all MDX
    ...components,   // Per-page overrides
  };
}
```

In `page.tsx`:
```tsx
<MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
```

Key observations:

1. **Global availability** = adding to `getMDXComponents()`. No import needed in each MDX file.
2. **Per-page availability** = passing in the `components` override at the render site.
3. **ESM imports in MDX** also work: `import Chart from '../components/chart'` — resolved by the bundler at build time.
4. **TypeScript types are for DX only** — used for IDE autocomplete, not for runtime validation or introspection.

The global type declaration:
```typescript
declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
```
This enables TypeScript to know about available components in MDX files.

**Implications:** For a visual editor, component discovery is straightforward: import `getMDXComponents()`, enumerate its keys, and for each component, run react-docgen-typescript to extract props. The "registration" step in the editor would just be: user creates a React component file, editor detects it (via file system watch or explicit import), and adds it to the component mapping. This is the model described in the research prompt — "users define custom components as normal React components, the editor discovers them."

---

### D5: Rendering Pipeline

**Finding:** Fumadocs uses a hybrid RSC/Client rendering model. Pages are React Server Components that receive compiled MDX as a component reference. The layout (DocsLayout, sidebar, TOC) is RSC with client sub-components for interactivity. Navigation is generated from the file structure via an in-memory PageTreeBuilder.

**Evidence:** [evidence/d5-rendering-pipeline.md](evidence/d5-rendering-pipeline.md)

The rendering chain:

```
1. source.getPage(slug)         -> Page object with data.body (MDX component)
2. page.data.body               -> FC<MDXProps> (the compiled MDX)
3. <MDX components={...} />     -> Server-rendered React component
4. DocsPage wraps with toc, nav -> Full page layout
5. DocsLayout provides sidebar  -> From source.getPageTree()
```

The `loader()` function from `fumadocs-core/source` is the central orchestrator:

```typescript
const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

// Returns:
// source.getPage(slugs)      -> Page | undefined
// source.getPages()           -> Page[]
// source.getPageTree()        -> PageTree.Root
// source.generateParams()     -> { slug: string[] }[]
// source.getLanguages()       -> { language, pages }[]
```

Search integration:

```
remarkStructure (during MDX compilation)
  -> page.data.structuredData (per-page search data)
  -> Search provider (Orama/Algolia/FlexSearch/etc.)
  -> Search UI component
```

For non-RSC environments (React Router, TanStack Start), `source.serializePageTree()` renders the tree to serializable HTML strings, and `useFumadocsLoader()` deserializes on the client.

---

### D6: Content Source Abstraction

**Finding:** The `Source` interface is a flat array of `VirtualFile` objects. Any system that produces this array can serve as a Fumadocs content source — local MDX files, a CMS, a database, or a visual editor.

**Evidence:** [evidence/d6-content-source-abstraction.md](evidence/d6-content-source-abstraction.md)

The contract:

```typescript
interface Source<Config extends SourceConfig> {
  files: VirtualFile<Config>[];
}

type VirtualFile = VirtualPage<PageData> | VirtualMeta<MetaData>;

interface VirtualPage<Data extends PageData> {
  type: 'page';
  path: string;           // e.g., 'docs/getting-started.mdx'
  absolutePath?: string;
  slugs?: string[];
  data: Data;             // Must include: title, description?, icon?, body (FC<MDXProps>), toc, structuredData
}

interface VirtualMeta<Data extends MetaData> {
  type: 'meta';
  path: string;
  data: Data;             // Must include: title?, icon?, pages?, defaultOpen?, collapsible?
}
```

Multiple sources can be combined:

```typescript
import { multiple } from 'fumadocs-core/source';

const combined = multiple({
  docs: localDocsSource,
  blog: cmsSource,
  api: openApiSource,
});
```

The `loader()` function consumes this and produces the full navigation tree, search index, and page lookup.

**How a visual editor would plug in as a content source:**

Option A — **File-based (recommended for our use case):** Editor writes MDX files to disk. fumadocs-mdx processes them through the standard pipeline. The editor and Fumadocs share the same filesystem, and the dev server's file watcher triggers recompilation on save.

Option B — **Virtual source:** Editor produces `VirtualFile[]` directly, bypassing fumadocs-mdx. This requires the editor to handle MDX compilation itself (or use `@fumadocs/mdx-remote`). The `page.data.body` must be a compiled MDX React component.

Option C — **Hybrid:** Editor writes MDX to files for persistence but uses runtime compilation (`@fumadocs/mdx-remote`) for instant preview, while the build pipeline uses the standard bundler compilation for production.

---

### D7: Fuma Content Evolution

**Finding:** Fuma Content (`fuma-content` npm package) is a framework-agnostic content processing layer being developed as the next-generation engine beneath fumadocs-mdx. It explicitly positions itself as "a foundation for developing a CMS layer, such as plugins for MDX editing or remote databases."

**Evidence:** [evidence/d7-fuma-content-evolution.md](evidence/d7-fuma-content-evolution.md)

Architecture:

```
fuma-content (npm)                 -- framework-agnostic content processing
  |
@fumadocs/content (adapter)       -- bridges fuma-content -> Fumadocs Source API
  |
fumadocs-core (Source API)         -- page tree, search, navigation
  |
fumadocs-ui (components)           -- rendering
```

The `@fumadocs/content` adapter:
- `docsCollection()` wraps fuma-content's `mdxCollection()` with Fumadocs' MDX preset
- `docsStore()` wraps fuma-content's `FileCollectionStore` with `toFumadocsSource()`

Fuma Content goals:
1. Work with any bundler (Vite, Turbopack, Webpack) and JS runtime
2. Zero breaking changes to fumadocs-mdx users
3. Custom collection types
4. Obsidian plugin support
5. CMS layer foundations

**Implications:** The Fuma Content evolution signals that the Fumadocs ecosystem is actively moving toward the "content processing as a composable layer" model. A visual editor built today against the `Source` interface will benefit from Fuma Content's evolution without architectural changes.

---

### D8: Publishing / Deployment

**Finding:** Deployment is standard for the chosen framework. For Next.js: `next build` produces either server-rendered or fully static output. No Fumadocs-specific deployment step exists.

**Evidence:** [evidence/d8-publishing-deployment.md](evidence/d8-publishing-deployment.md)

| Mode | Config | Output |
|------|--------|--------|
| Server-rendered | Default `next build` | Node.js server, Vercel, etc. |
| Static export | `output: 'export'` | CDN-deployable HTML/JS/CSS |
| ISR | `generateStaticParams()` + revalidate | Incrementally updated pages |

Key details:
- `fumadocs-mdx` CLI runs as a `postinstall` script to generate `.source/` files
- `generateStaticParams()` produces routes for all pages
- Search indexes can be pre-built (Orama/FlexSearch) or cloud-hosted (Algolia, Orama Cloud)
- Versioning is not built-in; handled via directory structure or git branches

---

### D9: Build-time vs Runtime Component Resolution

**Finding:** MDX components are compiled to JSX at build time, but component *references* are resolved at runtime via the `components` prop. Fumadocs provides two compilation environments: `bundler` (build time, ESM output) and `runtime` (on demand, evaluatable code string).

**Evidence:** [evidence/d9-build-vs-runtime-component-resolution.md](evidence/d9-build-vs-runtime-component-resolution.md)

The resolution model:

```
BUILD TIME (webpack/vite/turbopack):
  MDX source -> createProcessor({ outputFormat: 'program' }) -> ES module
  <Callout type="warn"> compiles to -> _jsx(Callout, { type: "warn" })
  BUT: Callout is resolved from the `components` prop at RENDER TIME

RENDER TIME (RSC or client):
  <MDX components={{ Callout, Tabs, MyWidget }} />
  -> MDX function receives components, uses them for _jsx() calls
  -> If a component is missing: ReferenceError at render time
```

Runtime compilation (on-demand):

```typescript
// packages/mdx/src/runtime/dynamic.ts
const compiled = await buildMDX(core, collection, {
  environment: 'runtime',  // outputFormat: 'function-body'
});
const result = await executeMdx(String(compiled.value), {
  baseUrl: pathToFileURL(info.fullPath),
});
// result.default is the MDX component
```

`executeMdx` uses `new AsyncFunction()` to evaluate the compiled code string, injecting `react/jsx-runtime` as scope.

Client-side lazy loading:

```typescript
// createClientLoader uses React 19's use() for Suspense-based loading
function Renderer(props) {
  let doc = store.preloaded.get(path);
  doc ??= use(promise ??= getLoader(path)());
  return useRenderer(doc, props);
}
```

**Three paths for editor component previews:**

1. **Standard dev server HMR:** Editor writes MDX -> file watcher -> recompile -> HMR update. Latency: 100-500ms. Fidelity: perfect (same pipeline as production).

2. **Runtime compilation:** Editor sends MDX string -> `executeMdx()` -> React component. Latency: ~50ms for simple pages. Requires component scope injection.

3. **Direct component rendering:** Editor knows the component + props -> renders `<Component {...props} />` directly, bypassing MDX entirely. Latency: instant. Used for in-editor preview panels.

---

## The Key Question: Visual Editor + Fumadocs Architecture

If the visual editor sits on top of Fumadocs' content pipeline — where the editor is the authoring layer and Fumadocs is the rendering/publishing layer — the architecture divides cleanly:

### What the Editor REUSES from Fumadocs

| Layer | What | Why |
|-------|------|-----|
| `fumadocs-core` Source API | Page tree generation, navigation, search indexing, URL generation, i18n | This is the output side — no reason to rebuild |
| `fumadocs-core` MDX plugins | remarkStructure, rehypeToc, remarkHeading | Search and TOC extraction are needed regardless of authoring surface |
| `fumadocs-ui` components | Callout, Tabs, Card, CodeBlock, etc. | These ARE the components being edited — they render in both editor preview and published site |
| `fumadocs-ui` layouts | DocsLayout, DocsPage, sidebar, header | The published site's shell |
| `fumadocs-mdx` file watching + compilation | Build pipeline for production | Editor writes MDX files; Fumadocs compiles them for the published site |
| Content source contract | `Source` interface (`VirtualFile[]`) | The bridge between editor output and Fumadocs rendering |

### What the Editor REPLACES

| Layer | What the editor provides instead | Why |
|-------|----------------------------------|-----|
| Code-based MDX authoring | Visual editor with component palette + prop panels | Core product value |
| `source.config.ts` awareness | Editor-side content collection definition UI or auto-discovery | Users shouldn't need to edit config files |
| Component registration (`getMDXComponents`) | Auto-discovery via filesystem scanning + react-docgen-typescript | "Users define custom components as normal React components, the editor discovers them" |
| HMR-based preview | Runtime compilation via `@fumadocs/mdx-remote` or direct component rendering | Instant preview without full rebuild |

### What the Editor ADDS (new layers)

| Layer | Purpose |
|-------|---------|
| Component introspection | react-docgen-typescript on user components -> prop types -> UI controls |
| Visual MDX editing | Drag-and-drop composition, inline prop editing, void node rendering |
| MDX serialization | Editor state -> MDX text (for git persistence) |
| Real-time preview | Runtime compilation or direct rendering of editor state |
| Component discovery | Watch component files, auto-detect exports, introspect TypeScript |

### The Integration Seam

The cleanest integration point is **the filesystem**:

```
Visual Editor (authoring)
    |
    v
MDX files on disk (git-tracked)
    |
    v
fumadocs-mdx (compilation) -> fumadocs-core (Source API) -> fumadocs-ui (rendering)
    |
    v
Published documentation site
```

The editor writes MDX. Fumadocs reads MDX. Git is the synchronization layer. This is the same model Mintlify uses (bi-directional git sync), and it means:

- The published site uses Fumadocs' production-optimized build pipeline
- The editor can use runtime compilation for instant preview
- No custom content source adapter needed — standard fumadocs-mdx handles everything
- Components are just React components, registered via `getMDXComponents()`
- Built-in components (Callout, Tabs) are no different from user-defined components

---

### Path C: Wiki-Links, Backlinks, and Link Graph Infrastructure

**Finding:** Fumadocs has partial link infrastructure -- forward link extraction, a graph view component, and Obsidian-compatible wiki-link parsing -- but **no backlinks, no reverse link index, and no link-based search ranking**. The pieces that exist are opt-in and not connected into a cohesive link graph system.

**Evidence:** [evidence/wiki-links-backlinks.md](evidence/wiki-links-backlinks.md)

**What exists:**

| Capability | Status | Location |
|-----------|--------|----------|
| Standard markdown links with relative path resolution | Built-in | `createRelativeLink()` in `fumadocs-ui/mdx.server`, `resolveHref()` in loader |
| Wiki-link `[[syntax]]` parsing | Exists (in Obsidian package) | `remarkWikilinks` in `fumadocs-obsidian` |
| Forward link extraction from pages | Opt-in | `extractLinkReferences` in `remarkPostprocess` |
| Graph view visualization | CLI-installable component | `graph-view.tsx` template via `@fumadocs/cli` |
| Link validation | External lint script | `next-validate-link` package |
| **Backlinks / reverse index** | **Does not exist** | -- |
| **Link-based search ranking** | **Does not exist** | Orama indexes text only |
| **Related pages from link proximity** | **Does not exist** | -- |
| **Frontmatter `related` / `see-also` fields** | **Does not exist** | `pageSchema` has no such fields |

**The critical gap for a knowledge platform:**

The `extractLinkReferences` + `buildGraph()` pipeline already computes the outgoing link graph. Building a backlink index requires inverting this graph -- iterating every page's outgoing links and recording each as an incoming link on the target page. The `buildGraph()` function in `apps/docs/lib/build-graph.ts` is the exact starting point: it iterates all pages, loads their `extractedReferences`, resolves each via `source.getPageByHref()`, and builds `{ source, target }` link pairs. Computing backlinks is a map inversion of this data.

**Architecture for adding wiki-links + backlinks to a Fumadocs-based system:**

1. **Wiki-link remark plugin:** Either extract `remarkWikilinks` from `fumadocs-obsidian` into a standalone plugin, or write a focused one that resolves `[[page]]` against the page tree via `loader.getPageByHref()`
2. **Backlink index build step:** After all pages are compiled (with `extractLinkReferences: true`), invert the link graph to produce a `Map<pageUrl, BacklinkEntry[]>`
3. **UI surface:** Bottom-of-page `<BacklinksPanel>` component and/or sidebar section showing "Linked from" pages
4. **MCP server exposure:** `getBacklinks(url)`, `getOutlinks(url)`, `getGraph()` endpoints using the pre-computed index

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Fuma Content internals:** The `fuma-content` npm package source was not cloned and analyzed (it's a separate repo). Its internal collection/plugin API is known at the interface level but not source-code-level.
- **Performance at scale:** No benchmarks for 1000+ page sites or runtime compilation latency.

### Out of Scope
- Comparison with Mintlify (covered in existing `fumadocs-vs-mintlify-architecture` report)
- Visual design quality of fumadocs-ui components
- Search provider implementation details beyond the API surface

---

## References

### Evidence Files
- [evidence/d1-project-setup-structure.md](evidence/d1-project-setup-structure.md) — Monorepo structure, minimal project, file conventions
- [evidence/d2-mdx-content-pipeline.md](evidence/d2-mdx-content-pipeline.md) — MDX compilation, remark/rehype plugins, HMR
- [evidence/d3-built-in-components.md](evidence/d3-built-in-components.md) — Component inventory, defaultMdxComponents, prop interfaces
- [evidence/d4-custom-component-registration.md](evidence/d4-custom-component-registration.md) — getMDXComponents pattern, global availability
- [evidence/d5-rendering-pipeline.md](evidence/d5-rendering-pipeline.md) — RSC/client hybrid, loader(), page tree, search
- [evidence/d6-content-source-abstraction.md](evidence/d6-content-source-abstraction.md) — Source interface, VirtualFile, content source contract
- [evidence/d7-fuma-content-evolution.md](evidence/d7-fuma-content-evolution.md) — Fuma Content roadmap, framework-agnostic layer
- [evidence/d8-publishing-deployment.md](evidence/d8-publishing-deployment.md) — Static/server/ISR deployment, postinstall
- [evidence/d9-build-vs-runtime-component-resolution.md](evidence/d9-build-vs-runtime-component-resolution.md) — Runtime resolution, executeMdx, two compilation environments
- [evidence/wiki-links-backlinks.md](evidence/wiki-links-backlinks.md) — Wiki-links, backlinks, link graph, link extraction, graph view, validation

### External Sources
- [Fumadocs GitHub repository](https://github.com/fuma-nama/fumadocs) — MIT-licensed source code (packages/mdx, packages/core, packages/radix-ui)
- [Fumadocs documentation](https://www.fumadocs.dev/) — Official docs
- [Fumadocs MDX roadmap (Fuma Content)](https://www.fumadocs.dev/blog/fumadocs-mdx-road-map) — Fuma Content vision and goals
- [Adding new Conventions (mdx-components)](https://www.fumadocs.dev/blog/new-conventions) — Component registration convention rationale
- [Content Source documentation](https://www.fumadocs.dev/docs/integrations/content) — Custom content source integration guide
- [Source API documentation](https://www.fumadocs.dev/docs/headless/source-api) — loader() function and Source interface
- [UI Components documentation](https://www.fumadocs.dev/docs/ui/components) — Built-in component reference
- [Graph View component documentation](https://www.fumadocs.dev/docs/ui/components/graph-view) — Link graph visualization
- [Validate Links integration](https://www.fumadocs.dev/docs/integrations/validate-links) — External link validation via next-validate-link
- [GitHub Issue #1571](https://github.com/fuma-nama/fumadocs/issues/1571) — Feature request for wikilinks, backlinks, graph view (closed, community contribution welcome)

### Related Research
- [fumadocs-vs-mintlify-architecture](/Users/edwingomezcuellar/reports/fumadocs-vs-mintlify-architecture/) — Comparative analysis covering architecture, MDX parsing, and AI/agent integration at a higher level
- [component-prop-introspection-visual-editors](/Users/edwingomezcuellar/reports/component-prop-introspection-visual-editors/) — Deep dive on react-docgen-typescript, TypeScript LSP, and prop extraction for visual editor property panels
- [mdx-crdt-roundtrip-fidelity](/Users/edwingomezcuellar/reports/mdx-crdt-roundtrip-fidelity/) — Investigation of MDX survival through CRDT-backed visual editors
