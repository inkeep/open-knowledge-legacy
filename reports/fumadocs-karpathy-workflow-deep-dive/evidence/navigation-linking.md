# Evidence: Navigation and Linking (D4)

**Dimension:** D4 — Navigation and linking
**Date:** 2026-04-02
**Sources:** Fumadocs OSS repo, fumadocs.dev docs

---

## Key files referenced

- `packages/core/src/source/page-tree/builder.ts` — PageTreeBuilder
- `packages/core/src/page-tree/definitions.ts` — PageTree type definitions
- `packages/core/src/source/loader.ts` — resolveHref, getPageByHref
- `packages/core/src/mdx-plugins/rehype-toc.ts` — Table of contents
- `packages/core/src/search/server/build-index.ts` — Breadcrumbs generation
- `packages/obsidian/src/remark/remark-wikilinks.ts` — Wiki-link support

---

## Findings

### Finding: Sidebar is auto-generated from file structure with meta.json overrides
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/page-tree/builder.ts`

The PageTreeBuilder takes ContentStorage (virtual filesystem) and constructs a PageTree.Root. Key conventions:
- Folders become nested navigation groups
- `meta.json` files control page ordering via `pages: ["intro", "setup", ...]`
- `...` (rest) and `z...a` (reversed rest) auto-include unlisted files
- `---Title---` creates separators
- `[Name](url)` creates external links
- `(name)` parenthesized segments are excluded from URLs
- PageTreeTransformers allow custom modifications (sorting, filtering, icons)

**Implications:** The sidebar is hierarchical by design. For a wiki, you'd need either: (a) a flat structure with meta.json managing all articles, or (b) category folders with auto-include rest syntax. The transformer API allows custom sorting (by date, alphabetical, category).

### Finding: Cross-references resolve via relative file paths
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/loader.ts` (lines 347-378)

```typescript
getPageByHref(href, { dir = '', language } = {}) {
  const [value, hash] = href.split('#', 2);
  if (value.startsWith('./') || value.startsWith('../')) {
    const path = joinPath(dir, value);
    target = indexer.getPage(path, language);
  } else {
    target = this.getPages(language).find((item) => item.url === value);
  }
}

resolveHref(href, parent) {
  if (href.startsWith('./') || href.startsWith('../')) {
    const target = this.getPageByHref(href, { dir: path.dirname(parent.path), language: parent.locale });
    if (target) return target.hash ? `${target.page.url}#${target.hash}` : target.page.url;
  }
  return href;
}
```

Two cross-reference mechanisms:
1. **Relative file paths** — `./my/page.mdx` resolved relative to the current file
2. **Generated URLs** — `/docs/my/page` matched against page URLs

Both support hash fragments for heading links.

**Implications:** Standard markdown links (`[text](./other-page.mdx)`) work as cross-references. No wiki-link syntax (`[[page]]`) in core Fumadocs — that requires the Obsidian package.

### Finding: Wiki-links ([[...]]) ARE supported via the Obsidian package
**Confidence:** CONFIRMED
**Evidence:** `packages/obsidian/src/remark/remark-wikilinks.ts`

```typescript
const RegexWikilink = /!?\[\[(?<content>([^\]]|\\])+)]]/g;
const RegexContent = /^(?<name>...)(?:#(?<heading>...))?(?:\|(?<alias>...))?$/;
```

The Obsidian package provides `remarkWikilinks` that:
- Parses `[[page]]`, `[[page#heading]]`, `[[page|alias]]`
- Resolves links via VaultResolver (maps wiki names to files)
- Handles embed syntax `![[image.png]]` and `![[content-block]]`
- Converts to standard markdown links or MDX components

**Implications:** Full wiki-link support exists but requires the Obsidian package. For a Karpathy-style wiki, this is the natural authoring syntax. The VaultResolver abstracts the name-to-path mapping.

### Finding: Backlinks are NOT natively supported
**Confidence:** NOT FOUND
**Evidence:** Searched: "backlink" in packages/core, packages/obsidian, packages/mdx — no results. Searched fumadocs.dev docs — no backlinks feature documented.

Negative searches:
- `grep -r "backlink" packages/` — no results
- `grep -r "back.link" packages/` — no results
- fumadocs.dev search for "backlinks" — no results

**Implications:** Backlinks would need to be built as a custom feature. The infrastructure exists (loader has getPages(), each page has cross-references resolvable via getPageByHref), but the reverse mapping (which pages link TO this page) is not computed. A loader plugin could compute this at build time.

### Finding: Table of contents generated via rehypeToc
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/mdx-plugins/rehype-toc.ts`

rehypeToc extracts heading hierarchy and exports as `toc` data. Available as a component (inline-toc, sidebar TOC).

### Finding: Breadcrumbs computed from page tree path
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/search/server/build-index.ts` (lines 54-76)

```typescript
export function buildBreadcrumbs(source, page) {
  const pageTree = source.getPageTree(page.locale);
  const path = findPath(pageTree.children, (node) => node.type === 'page' && node.url === page.url);
  // builds breadcrumbs from path segments
}
```

---

## Gaps / follow-ups

- Could backlinks be computed as a loader plugin?
- Tag/category-based navigation (not folder-based)
- Graph visualization of page connections (like Obsidian graph view)
