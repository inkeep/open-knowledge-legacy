---
title: "Wiki-Links, Backlinks, and Link Graph Infrastructure in Fumadocs"
description: "Source-code investigation of how Fumadocs handles internal links, cross-references, backlinks, link extraction, graph views, and wiki-link syntax -- with analysis of gaps and extension points for building a knowledge platform with first-class link infrastructure."
createdAt: 2026-04-03
updatedAt: 2026-04-03
path: C
subjects:
  - Fumadocs
  - fumadocs-core
  - fumadocs-mdx
  - fumadocs-obsidian
  - fumadocs-ui
topics:
  - internal links
  - wiki-links
  - backlinks
  - link graph
  - cross-references
  - link validation
  - search ranking
---

# Wiki-Links, Backlinks, and Link Graph Infrastructure in Fumadocs

## Summary of Findings

Fumadocs has **more link infrastructure than a typical docs framework** but **significantly less than a knowledge management tool**. The key pieces:

1. **Internal links** use standard markdown `[text](/docs/path)` with a `createRelativeLink` helper that resolves `./file.mdx` paths to URLs at render time.
2. **Wiki-link support exists** in the `fumadocs-obsidian` package -- a full `remarkWikilinks` plugin that converts `[[page]]` syntax to standard markdown links during the Obsidian-to-Fumadocs conversion pipeline.
3. **Link extraction exists** via `extractLinkReferences` in `remarkPostprocess` -- opt-in, extracts all `href` values from a page's MDAST at build time, exported as `extractedReferences`.
4. **A graph view component exists** (`graph-view.tsx`) that uses `extractedReferences` + `react-force-graph-2d` to visualize the link graph. Installable via `npx @fumadocs/cli add graph-view`.
5. **Backlinks do not exist.** No reverse link index, no "linked from" panel, no backlinks computation anywhere in the codebase.
6. **Link validation** is external -- delegated to `next-validate-link`, a separate npm package run as a lint script.
7. **Search does not use link relationships.** Orama indexes only text content (title, description, content, breadcrumbs). No PageRank or link-based boosting.

---

## 1. Internal Link Handling

### Standard Markdown Links

Fumadocs uses standard markdown link syntax. In MDX content:

```mdx
[Getting Started](/docs/getting-started)
[Relative Link](./other-page.mdx)
[Hash Link](#section-heading)
```

### The `<Link>` Component (`fumadocs-core/link`)

All markdown `[text](url)` links are overridden via the `a` entry in `defaultMdxComponents`:

```typescript
// packages/base-ui/src/mdx.tsx
const defaultMdxComponents = {
  a: Link as FC<AnchorHTMLAttributes<HTMLAnchorElement>>,
  // ...
};
```

The `Link` component (`packages/core/src/link.tsx`) is a client component that:
- Detects external URLs (any protocol, `//`-prefixed) and renders `<a target="_blank" rel="noreferrer noopener">`
- Internal links render via the framework's `<Link>` (Next.js `next/link`, etc.) with optional `prefetch`
- **No link tracking, no analytics hooks, no interception beyond external detection**

Source: `/packages/core/src/link.tsx`

### Relative File Path Resolution (`createRelativeLink`)

The key link resolution function is `createRelativeLink` from `fumadocs-ui/mdx.server`:

```typescript
// packages/base-ui/src/mdx.server.tsx
export function createRelativeLink<C extends LoaderConfig>(
  source: LoaderOutput<C>,
  page: Page,
  OverrideLink: FC<ComponentProps<'a'>> = defaultMdxComponents.a,
): FC<ComponentProps<'a'>> {
  return async function RelativeLink({ href, ...props }) {
    return <OverrideLink href={href ? source.resolveHref(href, page) : href} {...props} />;
  };
}
```

This is used in `page.tsx`:
```tsx
<MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
```

The `resolveHref` method on the loader output (`packages/core/src/source/loader.ts`):

```typescript
resolveHref(href, parent) {
  if (href.startsWith('./') || href.startsWith('../')) {
    const target = this.getPageByHref(href, {
      dir: path.dirname(parent.path),
      language: parent.locale,
    });
    if (target) {
      return target.hash ? `${target.page.url}#${target.hash}` : target.page.url;
    }
  }
  return href;
}
```

**Key insight:** Relative file paths (`./other.mdx`, `../sibling/page.mdx`) are resolved at **render time** by looking up the page in the loader's index. This means the content files can use filesystem-relative paths, and Fumadocs resolves them to the correct URL based on the page tree.

### `getPageByHref` -- The Core Link Resolution

```typescript
// packages/core/src/source/loader.ts
getPageByHref(href, { dir = '', language = i18n?.defaultLanguage } = {}) {
  const [value, hash] = href.split('#', 2);
  let target;

  if (value.startsWith('./') || value.startsWith('../')) {
    const path = joinPath(dir, value);
    target = indexer.getPage(path, language);
  } else {
    target = this.getPages(language).find((item) => item.url === value);
  }

  if (target) return { page: target, hash };
}
```

**Supported link formats:**
- `./relative/path.mdx` -- resolved relative to current page's directory
- `../sibling/path.mdx` -- parent-relative paths
- `/docs/absolute/path` -- matched against page URLs
- `#hash` -- in-page anchor (not resolved by `getPageByHref`)

**NOT supported natively:**
- `[[wiki-links]]` -- no built-in parser (exists only in `fumadocs-obsidian`)
- Slug-based resolution without path prefix
- Auto-linking by title match

---

## 2. Wiki-Link Support (fumadocs-obsidian)

### The `remarkWikilinks` Plugin

`fumadocs-obsidian` includes a complete Obsidian-compatible wiki-link parser:

**Source:** `packages/obsidian/src/remark/remark-wikilinks.ts`

**Regex pattern:** `!?\[\[(?<content>([^\]]|\\])+)]]`

**Content parsing:** `^(?<name>(?:\\#|\\\||[^#|])*)(?:#(?<heading>(?:\\\||[^|])+))?(?:\|(?<alias>.+))?$`

This handles:
- `[[Page Name]]` -- basic wiki-link
- `[[Page Name|Display Text]]` -- aliased wiki-link
- `[[Page Name#Heading]]` -- wiki-link with heading anchor
- `![[Page Name]]` -- embedded content (Obsidian transclusion)
- `![[image.png]]` -- embedded image

**Resolution pipeline:**

1. Regex matches `[[...]]` in text nodes within paragraphs
2. For each match, calls `resolveWikilink()`:
   - If embed (`!`): resolves to an image node or an `<include>` MDX component
   - If link: resolves via `VaultResolver.resolveAny(name, fromPath)` which tries:
     1. Relative vault path (if starts with `./` or `../`)
     2. Full vault path
     3. Vault name/alias (filename without extension)
   - Produces a standard MDAST `link` node with `data.isWikiLink = true`

**VaultResolver** (`packages/obsidian/src/build-resolver.ts`) builds two lookup maps:
- `pathToFile`: maps both `dir/filename` and `dir/filename.ext` to files
- `nameToFile`: maps `filename`, `filename.ext`, and frontmatter aliases to files

**Output example:** The wiki-link `[[Welcome#Introduction!!]]` in `hello world.md` becomes:
```mdx
[Welcome#Introduction!!](./welcome.mdx#introduction)
```

### Important Architectural Note

The `remarkWikilinks` plugin operates in the **Obsidian conversion pipeline**, not the Fumadocs MDX pipeline. It converts wiki-links to standard markdown links as a pre-processing step. The converted output is then processed by the standard Fumadocs MDX pipeline.

This means wiki-links are **not preserved in the compiled output** -- they become standard `[text](./path.mdx)` links. There is no `wikiLink` MDAST node type in the Fumadocs pipeline.

---

## 3. Backlinks: DO NOT EXIST

**Comprehensive search confirms: Fumadocs has no backlinks feature.**

Searched for:
- `backlink`, `back-link`, `back_link`: Zero matches in packages
- `linkedFrom`, `linked-from`: Zero matches
- `reverseLink`, `reverse-link`: Zero matches
- `related`, `see-also`, `seeAlso`: One match in `packages/core/src/source/client/index.tsx` -- unrelated (React context)

**The `pageSchema` and `metaSchema`** (`packages/core/src/source/schema.ts`) have no fields for related pages, backlinks, or cross-references:

```typescript
export const pageSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  full: z.boolean().optional(),
  _openapi: z.looseObject({}).optional(),
});
```

**The `PageTree` definitions** (`packages/core/src/page-tree/definitions.ts`) model navigation hierarchy only -- `Item`, `Folder`, `Separator`. No cross-references, no link relationships.

**The `Source` interface** (`packages/core/src/source/source.ts`) has no concept of link relationships between pages.

**GitHub issue #1571** (`[feat] support obsidian style wikilinks, backlinks, embeds, graph view`) was closed with the maintainer's response: *"Not planning to support obsidian style markdown, community contribution is welcome"*. The Obsidian package was later added, addressing wiki-links and embeds but NOT backlinks.

---

## 4. Link Extraction (`extractLinkReferences`)

### The Mechanism

`remarkPostprocess` in `fumadocs-mdx` has an opt-in `extractLinkReferences` option:

**Source:** `packages/mdx/src/loaders/mdx/remark-postprocess.ts`

```typescript
if (extractLinkReferences) {
  const urls: ExtractedReference[] = [];

  visit(tree, 'link', (node) => {
    urls.push({
      href: node.url,
    });
    return 'skip';
  });

  file.data['mdx-export'].push({
    name: 'extractedReferences',
    value: urls,
  });
}
```

**What it captures:** Every `link` node in the MDAST (after all remark transforms). This means:
- Standard markdown links: `[text](./path.mdx)` -> `{ href: "./path.mdx" }`
- Auto-links
- Converted wiki-links (if using `fumadocs-obsidian`)
- **NOT:** `<Card href="...">` or other JSX components with href attributes (those need `next-validate-link`'s `components` config)

**Configuration:**
```typescript
// source.config.ts
export const docs = defineDocs({
  docs: {
    postprocess: {
      extractLinkReferences: true,
    },
  },
});
```

**Access at runtime:**
```typescript
const { extractedReferences = [] } = await page.data.load();
// extractedReferences: Array<{ href: string }>
```

**Important:** This was previously enabled by default but was changed to opt-in in fumadocs-mdx v14.

### The `ExtractedReference` Type

```typescript
export interface ExtractedReference {
  href: string;
}
```

Minimal -- just the raw href string. No anchor text, no context, no source position.

---

## 5. Graph View Component

### Architecture

Fumadocs provides a `GraphView` component installable via CLI:

```bash
npx @fumadocs/cli add graph-view
```

**Source:** `apps/docs/components/graph-view.tsx` (template for CLI installation)

It consists of:

1. **`buildGraph()` function** (`apps/docs/lib/build-graph.ts`):
   ```typescript
   export async function buildGraph(): Promise<Graph> {
     const graph: Graph = { links: [], nodes: [] };

     await Promise.all(
       source.getPages().map(async (page) => {
         graph.nodes.push({
           id: page.url,
           url: page.url,
           text: page.data.title,
           description: page.data.description,
         });

         const { extractedReferences = [] } = await page.data.load();
         for (const ref of extractedReferences) {
           const refPage = source.getPageByHref(ref.href);
           if (!refPage) continue;

           graph.links.push({
             source: page.url,
             target: refPage.page.url,
           });
         }
       }),
     );

     return graph;
   }
   ```

2. **`GraphView` component** -- React client component using `react-force-graph-2d` with d3-force:
   - Renders nodes as circles with text labels
   - Directed links between pages
   - Hover highlights connected nodes
   - Click navigates to page
   - Tooltip shows page description

### The `Graph` Type

```typescript
export interface Graph {
  links: Link[];
  nodes: Node[];
}

export interface NodeType {
  text: string;
  description?: string;
  neighbors?: string[];
  url: string;
}
```

### What the Graph View Does and Does NOT Do

**Does:**
- Visualizes outgoing links between pages
- Uses `extractedReferences` (requires opt-in)
- Resolves relative hrefs via `source.getPageByHref()`
- Interactive force-directed layout

**Does NOT:**
- Compute or display backlinks (reverse direction)
- Persist the graph (computed fresh each render)
- Provide a per-page "related pages" panel
- Integrate with search ranking
- Track bidirectional relationships
- Filter by link type or context

---

## 6. Link Validation

### External Tool: `next-validate-link`

Fumadocs delegates link validation to `next-validate-link`, a separate npm package. It is NOT part of the build pipeline -- it runs as a manual lint script.

**Source of the pattern:** `apps/docs/content/docs/(framework)/integrations/validate-links.mdx`

The validation process:
1. `scanURLs()` enumerates all valid URLs and their heading anchors from the page tree
2. `validateFiles()` reads raw MDX content, parses links (including from JSX components like `<Card href="...">`), and checks them against scanned URLs
3. `printErrors()` reports broken links

**Key configuration:**
```typescript
await validateFiles(files, {
  scanned,
  markdown: {
    components: {
      Card: { attributes: ['href'] },
    },
  },
  checkRelativePaths: 'as-url',
});
```

**Important:** This is a **lint-time** check, not a **build-time** check. It does not block builds. It runs via `bun ./scripts/lint.ts` (requires Fumadocs MDX loader for Bun).

### No Build-Time Link Validation

There is **no remark plugin** in Fumadocs that validates links during MDX compilation. Broken links produce either:
- A `console.warn` from `remarkWikilinks` in the Obsidian pipeline: `"failed to resolve ${name} wikilink"`
- A silent broken link that 404s at runtime (standard markdown links)

---

## 7. Search and Link Discovery

### Orama Search Schema

The Orama search database schema (`packages/core/src/search/orama/create-db.ts`):

**Simple schema:**
```typescript
const simpleSchema = {
  url: 'string',
  title: 'string',
  breadcrumbs: 'string[]',
  description: 'string',
  content: 'string',
  keywords: 'string',
};
```

**Advanced schema:**
```typescript
const advancedSchema = {
  content: 'string',
  page_id: 'string',
  type: 'string',
  breadcrumbs: 'string[]',
  tags: 'enum[]',
  url: 'string',
  embeddings: 'vector[512]',
};
```

**No link-based ranking.** The search indexes text content only. There is no:
- PageRank or link-count boosting
- "Related pages" from link proximity
- Link text as search signal
- Inbound link count as relevance factor

### `remarkStructure` -- Does It Extract Links?

No. `remarkStructure` (`packages/core/src/mdx-plugins/remark-structure.ts`) extracts headings and paragraph content for search indexing. Its stringifier **strips links** -- the `link` handler returns only the link text, discarding the URL:

```typescript
handlers: {
  link(node: Link, _, state, info) {
    return state.containerPhrasing(node, info); // text only, no URL
  },
  image() {
    return ''; // images stripped entirely
  },
}
```

---

## 8. How Links Are Represented in MDX

### Standard Markdown Links

```mdx
[Text](/docs/some-page)
[Relative](./other.mdx)
[With Hash](/docs/page#section)
[External](https://example.com)
```

All rendered via the `a` override in `defaultMdxComponents`, which maps to `fumadocs-core/link`.

### `<Card>` Component with `href`

```mdx
<Card href="/docs/getting-started" title="Get Started" />
```

The `Card` component accepts an `href` prop. This is NOT tracked by `extractLinkReferences` (which only visits MDAST `link` nodes). It IS tracked by `next-validate-link` when configured with `components: { Card: { attributes: ['href'] } }`.

### No Custom Link Component

There is no `<Link>` or `<InternalLink>` MDX component for authors. The `Link` component from `fumadocs-core/link` is used internally via the `a` override, but authors just use standard markdown syntax.

### `DynamicLink` Component

`fumadocs-core/dynamic-link` supports dynamic hrefs with route parameters:

```typescript
// Supports /[lang]/my-page pattern
<DynamicLink href="/[lang]/my-page" />
```

This resolves `[param]` segments from `useParams()` at runtime. Used for i18n URL patterns.

---

## 9. Architecture Gap Analysis: What Would Be Needed for Wiki-Links + Backlinks

### Adding Wiki-Link Syntax to Fumadocs MDX

**Option A: Use fumadocs-obsidian's `remarkWikilinks`**

The `fumadocs-obsidian` package already has a complete wiki-link parser. However, it operates in a separate conversion pipeline (Obsidian vault -> Fumadocs MDX). To use it directly in the Fumadocs MDX pipeline:

1. Use `remarkObsidian` from `fumadocs-obsidian/mdx` as a remark plugin in `source.config.ts`
2. Provide the vault file list (which requires reading all content files upfront)
3. The plugin converts `[[wiki-links]]` to standard `[text](./path.mdx)` links

**Limitation:** The `remarkObsidian` plugin is marked `[Experimental]` and requires pre-loading all files.

**Option B: Use `remark-wiki-link` (external package)**

The `remark-wiki-link` package (cloned at `~/.claude/oss-repos/remark-wiki-link`) provides:
- Micromark extension for wiki-link syntax
- `mdast-util-wiki-link` for AST manipulation
- Configurable `pageResolver`, `hrefTemplate`, `permalinks`

Would need:
1. A custom `pageResolver` that maps wiki-link names to Fumadocs page slugs
2. A `permalinks` list generated from `source.getPages()` at build time
3. An `hrefTemplate` that generates correct URLs

**Option C: Custom remark plugin (recommended for knowledge platform)**

Write a focused remark plugin that:
1. Parses `[[wiki-link]]` syntax using the same regex as fumadocs-obsidian
2. Resolves against the page tree using `loader.getPageByHref()`
3. Produces standard MDAST link nodes with metadata (`data.isWikiLink = true`)
4. **Additionally** collects outgoing links in a structured format for the backlink index

### Building a Backlink Index

**Where it would live:**

The backlink index must be built **after** all pages are processed (since you need outgoing links from every page to compute incoming links). Two approaches:

**Approach 1: Build-time index (build step after MDX compilation)**

```
MDX compilation (all pages)
  -> extractedReferences per page
  -> buildBacklinkIndex():
       for each page:
         for each outgoing link:
           backlinks[targetPage].push(sourcePage)
  -> Serialize as JSON or inject into page data
```

This is essentially what `buildGraph()` already does, but needs to be inverted:

```typescript
function buildBacklinkIndex(source: LoaderOutput): Map<string, BacklinkEntry[]> {
  const backlinks = new Map<string, BacklinkEntry[]>();

  for (const page of source.getPages()) {
    const { extractedReferences = [] } = await page.data.load();
    for (const ref of extractedReferences) {
      const refPage = source.getPageByHref(ref.href);
      if (!refPage) continue;

      const targetUrl = refPage.page.url;
      if (!backlinks.has(targetUrl)) backlinks.set(targetUrl, []);
      backlinks.get(targetUrl)!.push({
        sourceUrl: page.url,
        sourceTitle: page.data.title,
        // could include anchor text, context snippet, etc.
      });
    }
  }

  return backlinks;
}
```

**Approach 2: Loader plugin**

A Fumadocs loader plugin that computes backlinks during `transformStorage`:

```typescript
const backlinkPlugin: LoaderPlugin = {
  name: 'backlinks',
  transformStorage({ storage }) {
    // Iterate all pages, extract links, build reverse index
    // Inject backlinks data into each page's data
  },
};
```

**Limitation:** The loader plugin sees pages after storage is built but before the page tree. It would need to access `extractedReferences` which requires page data to be loaded.

### Surfacing Backlinks in the UI

**Option A: Bottom-of-page component**

```tsx
// In page.tsx
const backlinks = backlinkIndex.get(page.url) ?? [];
return (
  <DocsPage>
    <MDX />
    {backlinks.length > 0 && (
      <BacklinksPanel backlinks={backlinks} />
    )}
  </DocsPage>
);
```

**Option B: Sidebar section**

Add a "Linked From" section to `DocsLayout`'s sidebar after the TOC.

**Option C: Both + graph view integration**

The existing `GraphView` component already computes the full link graph. It could be extended to highlight backlinks for the current page.

### Exposing Link Data via MCP Server

An MCP server could expose:
- `getBacklinks(pageUrl)` -> pages that link to this page
- `getOutlinks(pageUrl)` -> pages this page links to
- `getGraph()` -> full link graph (nodes + edges)
- `findShortestPath(fromUrl, toUrl)` -> navigation path through links
- `getRelated(pageUrl)` -> pages with shared link neighborhoods

The `buildGraph()` function already produces the data structure needed. The MCP server would pre-compute and cache the graph at startup, with invalidation on content changes.

---

## Source File Reference

| File | What It Contains |
|------|-----------------|
| `packages/core/src/link.tsx` | `<Link>` component -- external detection, framework link delegation |
| `packages/core/src/dynamic-link.tsx` | `<DynamicLink>` -- dynamic href with route params |
| `packages/base-ui/src/mdx.server.tsx` | `createRelativeLink()` -- resolve `./path.mdx` to URLs |
| `packages/core/src/source/loader.ts` | `resolveHref()`, `getPageByHref()` -- core link resolution |
| `packages/core/src/source/source.ts` | `Source`, `VirtualFile` -- no link relationship fields |
| `packages/core/src/source/schema.ts` | `pageSchema`, `metaSchema` -- no related/backlink fields |
| `packages/core/src/page-tree/definitions.ts` | `Item`, `Folder`, `Separator` -- navigation only, no cross-refs |
| `packages/core/src/mdx-plugins/remark-structure.ts` | Search data extraction -- strips link URLs, keeps text only |
| `packages/core/src/search/orama/create-db.ts` | Orama schema -- text-only, no link-based ranking |
| `packages/mdx/src/loaders/mdx/remark-postprocess.ts` | `extractLinkReferences` -- opt-in link extraction |
| `packages/obsidian/src/remark/remark-wikilinks.ts` | `remarkWikilinks` -- full Obsidian wiki-link parser |
| `packages/obsidian/src/build-resolver.ts` | `VaultResolver` -- name/path/alias resolution for wiki-links |
| `packages/obsidian/src/remark/remark-convert.ts` | `remarkConvert` -- resolves standard markdown links in Obsidian content |
| `apps/docs/lib/build-graph.ts` | `buildGraph()` -- computes link graph from extractedReferences |
| `apps/docs/components/graph-view.tsx` | `GraphView` -- d3-force visualization of link graph |
| `apps/docs/scripts/lint.ts` | Link validation script using `next-validate-link` |
| `apps/docs/source.config.ts` | Fumadocs docs site config -- `extractLinkReferences: true` |
