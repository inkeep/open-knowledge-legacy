# Evidence: D2 — MDX Content Pipeline

**Dimension:** MDX content pipeline
**Date:** 2026-04-03
**Sources:** fumadocs repo source code, official docs

---

## Key files referenced

- `packages/mdx/src/loaders/mdx/build-mdx.ts` — MDX compilation entry point
- `packages/mdx/src/loaders/mdx/index.ts` — MDX loader (webpack/turbopack)
- `packages/mdx/src/config/preset.ts` — default remark/rehype plugin pipeline
- `packages/core/src/mdx-plugins/index.ts` — plugin exports
- `packages/mdx/src/next/index.ts` — Next.js integration (createMDX)
- `packages/mdx/src/vite/index.ts` — Vite plugin
- `packages/mdx/src/core.ts` — Core engine (createCore)

---

## Findings

### Finding: MDX is compiled via @mdx-js/mdx's `createProcessor` at build time through bundler loaders
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/loaders/mdx/build-mdx.ts:92-98`

```typescript
processor = createProcessor({
  outputFormat: 'program',
  development: isDevelopment,
  ...mdxOptions,
  remarkPlugins: [
    remarkInclude,
    ...(mdxOptions.remarkPlugins ?? []),
    [remarkPostprocess, postprocessOptions],
  ],
  format,
});
```

The output is JavaScript code (ESM) that exports the MDX component + frontmatter + TOC + structuredData.

### Finding: Default remark/rehype plugin pipeline
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/config/preset.ts:68-130`

Default remark plugins (in order):
1. `remarkGfm` — GitHub Flavored Markdown
2. `remarkHeading` — heading ID generation + TOC extraction
3. `remarkImage` — image processing with `useImport` for bundler
4. `remarkCodeTab` — code tab grouping
5. `remarkNpm` — npm/pnpm/yarn command formatting
6. User-provided remark plugins (injected here)
7. `remarkStructure` — structured data extraction for search indexing

Default rehype plugins:
1. `rehypeCode` — Shiki-based syntax highlighting
2. User-provided rehype plugins
3. `rehypeToc` — TOC generation

Additional plugins (from core exports): `remarkAdmonition`, `remarkDirectiveAdmonition`, `remarkSteps`, `remarkMdxFiles`, `remarkMdxMermaid`, `remarkFeedbackBlock`

### Finding: Frontmatter is parsed with custom `fumaMatter` (gray-matter variant) and validated via Zod
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/loaders/mdx/index.ts:31-33`

```typescript
const value = await getSource();
const matter = fumaMatter(value);
```

Schema validation happens in `core.transformFrontmatter()` which calls `validate()` using the collection's Zod schema.

### Finding: HMR works via chokidar file watcher + bundler hot module replacement
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/next/index.ts:132-176`

```typescript
async function devServer() {
  const { FSWatcher } = await import('chokidar');
  const watcher = new FSWatcher({ ignoreInitial: true, persistent: true, ignored: [outDir] });
  watcher.add(configPath);
  for (const collection of core.getCollections()) {
    watcher.add(collection.dir);
  }
  // ...
  watcher.on('all', async (_event, file) => {
    if (path.resolve(file) === absoluteConfigPath) {
      watcher.removeAllListeners();
      await watcher.close();
      await initOrReload();
      await devServer(); // restart on config change
    }
  });
  await core.initServer({ watcher });
}
```

Config changes trigger full restart. Content file changes trigger index file regeneration via the index-file plugin's watcher listener.

### Finding: fumadocs-mdx integrates as webpack loader + turbopack loader
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/next/index.ts:50-115`

Turbopack rules: `*.{md,mdx}` -> `fumadocs-mdx/loader-mdx` -> `*.js`
Webpack rules: `test: mdxLoaderGlob` -> `fumadocs-mdx/loader-mdx`

For Vite: a Vite plugin with `enforce: 'pre'` handles the same transform.

### Finding: Compiled MDX exports specific properties
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/loaders/mdx/build-mdx.ts:31-45`

```typescript
export interface CompiledMDXProperties<Frontmatter> {
  frontmatter: Frontmatter;
  structuredData: StructuredData;
  toc: TOCItemType[];
  default: FC<MDXProps>;  // The React component
  _markdown?: string;     // from postprocess option
  _mdast?: string;        // from postprocess option
}
```

---

## Gaps / follow-ups

- Incremental compilation performance at scale (1000+ pages)
- How the experimental build cache works in detail
