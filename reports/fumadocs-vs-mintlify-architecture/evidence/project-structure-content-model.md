# Evidence: Project Structure & Content Model

**Dimension:** Project Structure & Content Model
**Date:** 2026-04-02
**Sources:** fumadocs.dev, mintlify.com, github.com/fuma-nama/fumadocs

---

## Key files / pages referenced

- https://fumadocs.dev/docs — Quick start, project structure
- https://fumadocs.dev/docs/headless/page-conventions — Page tree, meta.json, file routing
- https://fumadocs.dev/docs/mdx/collections — Collection definitions, source.config.ts
- https://www.mintlify.com/docs/quickstart — Mintlify project setup
- https://www.mintlify.com/docs/settings — docs.json configuration
- https://www.mintlify.com/docs/organize/navigation — Navigation structure

---

## Findings

### Finding: Fumadocs uses filesystem-based routing with meta.json for ordering and organization
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs/headless/page-conventions

File structure:
- Content lives in `content/docs/` by default (configurable)
- Slugs generated from file paths
- `meta.json` per folder controls: title, icon, page order, defaultOpen, root folder designation
- Parenthesized folders `(name)` excluded from slugs
- Items sorted alphabetically by default; `pages` array in meta.json overrides order
- Page URLs must be unique across the entire page tree
- Root folders create sidebar tabs automatically

Page tree built by PageTreeBuilder:
- Scans files via ContentStorage
- Creates nodes per file
- Applies PageTreeTransformer hooks (file, folder, separator, root)
- Builds hierarchy from flat paths
- Node types: Item (page), Folder, Separator

**Implications:** The file system IS the content model. Agents can create, move, and reorganize docs by manipulating files and meta.json files — no database needed.

### Finding: Fumadocs configuration lives in source.config.ts with typed collections
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs/mdx/collections

```typescript
// source.config.ts
import { defineDocs } from 'fumadocs-mdx/config';
export const docs = defineDocs({
  dir: 'content/docs',
  docs: { schema: ... },
  meta: { schema: ... },
});
```

The loader from 'fumadocs-core/source' builds the LoaderOutput:
- `pageTree`: PageTree.Root hierarchical structure
- `getPage()`, `getPages()`: Content access methods
- Search index data
- Virtual file generation with type-safe exports at `.source/index.ts`

**Implications:** Type-safe, schema-validated content at build time. Agents get compile-time guarantees about content shape.

### Finding: Mintlify uses docs.json as the single configuration file with declarative navigation
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/settings, https://www.mintlify.com/docs/organize/navigation

docs.json structure:
- Required fields: name, theme, colors.primary, navigation
- Navigation supports: pages, groups, tabs, anchors, dropdowns — all nestable and interchangeable
- `$ref` for modular config (split across files, resolved at build)
- Migration from deprecated mint.json via `mint upgrade` CLI
- Schema reference enables editor autocomplete: `"$schema": "https://mintlify.com/docs.json"`
- Configuration manages: appearance, site structure, API settings, integrations, SEO

Navigation is entirely declarative in JSON — not derived from filesystem.

**Implications:** Mintlify decouples navigation from file structure. You can reorganize navigation without moving files. This is a trade-off: simpler for humans but requires keeping docs.json in sync with file changes.

### Finding: Mintlify uses MDX files with frontmatter, organized in flat or nested directories
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/quickstart

- Every page = one MDX file in the Git repo
- Frontmatter: title, description (required)
- `snippets/` directory for reusable components (not rendered as pages)
- Pages referenced by path in docs.json navigation
- No meta.json equivalent — all navigation in the single docs.json

**Implications:** Simpler mental model (one config file) but less filesystem-derived structure.

---

## Gaps / follow-ups

- Mintlify's support for multi-docs or monorepo documentation sites is unclear
- Fumadocs' support for cross-collection references is not fully documented
