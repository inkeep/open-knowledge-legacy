# Evidence: D7 — Fuma Content Evolution

**Dimension:** The "Fuma Content" evolution
**Date:** 2026-04-03
**Sources:** fumadocs repo source code, fumadocs.dev blog, npm

---

## Key files referenced

- `packages/content/src/index.ts` — @fumadocs/content package
- `packages/content/src/runtime.ts` — docsStore/toFumadocsSource bridge
- `packages/content/package.json` — peer dependency on fuma-content
- fumadocs.dev/blog/fumadocs-mdx-road-map — roadmap blog post

---

## Findings

### Finding: Fuma Content (fuma-content npm package) is a separate, framework-agnostic content processing layer
**Confidence:** CONFIRMED
**Evidence:** `packages/content/package.json`

```json
{
  "name": "@fumadocs/content",
  "description": "The Fuma Content adapter for Fumadocs",
  "peerDependencies": {
    "fuma-content": "^1.2.3",
    "fumadocs-core": "^16.6.17"
  }
}
```

`@fumadocs/content` is an adapter that bridges `fuma-content` (the framework-agnostic layer) to `fumadocs-core` (the Fumadocs Source API).

### Finding: @fumadocs/content provides docsCollection and docsMdxCollection
**Confidence:** CONFIRMED
**Evidence:** `packages/content/src/index.ts`

```typescript
import { Collection } from 'fuma-content/collections';
import { mdxCollection } from 'fuma-content/collections/mdx';
import { dataCollection } from 'fuma-content/collections/data';
import { mdxPreset } from 'fumadocs-core/content/mdx/preset-bundler';

export function docsMdxCollection(config) {
  return mdxCollection({
    ...config,
    async options() {
      return mdxPreset({ ...(typeof config.options === 'object' ? config.options : await config.options()) });
    },
  });
}

export function docsCollection(config) {
  return {
    index: new DocsCollection(),
    meta: dataCollection({ dir: config.dir, ...config.meta }),
    doc: docsMdxCollection({ dir: config.dir, ...config.docs }),
  };
}
```

### Finding: docsStore bridges fuma-content stores to Fumadocs Source API
**Confidence:** CONFIRMED
**Evidence:** `packages/content/src/runtime.ts`

```typescript
export function docsStore(mdxStore, metaStore) {
  return {
    toFumadocsSource() {
      return toFumadocsSource(mdxStore, metaStore);
    },
  };
}
```

This creates a `Source` object from fuma-content's collection stores.

### Finding: Fuma Content's roadmap positions it as a CMS foundation layer
**Confidence:** CONFIRMED
**Evidence:** From the fumadocs.dev blog roadmap:

> "Fuma Content should work anywhere, including Vite, Turbopack/Webpack, and even JS runtimes."

> "Fuma Content provides a foundation for developing a CMS layer, such as plugins for MDX editing or remote databases."

Goals:
1. Framework-agnostic (Vite, Turbopack, Webpack, JS runtimes)
2. Zero breaking changes to fumadocs-mdx
3. Custom collection types
4. Obsidian plugin for editor-specific syntax
5. CMS layer foundations (MDX editing, remote databases)

### Finding: The transition follows the same pattern as Vite adopting Rolldown
**Confidence:** CONFIRMED
**Evidence:** Blog post explicitly draws this analogy — maintaining surface-level API compatibility (fumadocs-mdx stays the same) while replacing the underlying engine (fuma-content).

**Implications for visual editor:** Fuma Content's explicit goal of being a "foundation for a CMS layer" means the architecture is evolving toward exactly the kind of content processing layer a visual editor would need. The `fuma-content/collections` API provides typed collection definitions that could be the basis for editor-side content introspection.

---

## Gaps / follow-ups

- fuma-content's internal architecture (separate npm package, not in fumadocs monorepo)
- Plugin API details for fuma-content
