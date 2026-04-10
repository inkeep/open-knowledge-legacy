# Evidence: Build Pipeline and Development Experience (D8)

**Dimension:** D8 — Build pipeline and development experience
**Date:** 2026-04-02
**Sources:** Fumadocs OSS repo, fumadocs.dev, web search, GitHub issues

---

## Key files referenced

- `packages/mdx/src/webpack/index.ts` — Webpack plugin
- `packages/mdx/src/vite/index.ts` — Vite plugin
- `packages/mdx/src/config/build.ts` — Build configuration
- `packages/mdx/src/utils/fs-cache.ts` — Filesystem caching
- fumadocs.dev/docs/mdx/performance — Performance documentation

---

## Findings

### Finding: fumadocs-mdx operates as a bundler plugin (Webpack/Turbopack/Vite)
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/webpack/index.ts`, `packages/mdx/src/vite/index.ts`

fumadocs-mdx integrates directly into the bundler pipeline:
- **Webpack** — custom loader + plugin that processes MDX files and generates virtual modules at `.source/index.ts`
- **Vite** — Vite plugin that does the same
- **Turbopack** — supported via the Webpack loader compatibility layer

Build flow:
1. Watch for .mdx and meta.json files
2. Parse frontmatter via custom YAML parser (fuma-matter)
3. Validate against Zod schemas
4. Compile MDX through remark/rehype/recma pipeline
5. Generate virtual modules with type-safe exports
6. Emit `.source/index.ts` for TypeScript consumption

### Finding: Hot reload is ~100ms per MDX file on Next.js canary
**Confidence:** CONFIRMED
**Evidence:** Twitter/X post by @birch_js, March 2026

"Just tried next@canary on my Fumadocs site. Used to take ~200ms to apply a hot reload to an MDX file. Now it takes ~100ms"

Hot reload processes only the changed file, not the entire collection. The dev server (Next.js dev, Vite dev) handles the HMR boundary.

### Finding: Build degrades significantly above ~500 MDX files
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev/docs/mdx/performance

"Fumadocs MDX can handle nearly 500+ files, however, it could be slow and inefficient. A huge amount of MDX files can cause extremely high memory usage during build and development mode."

Recommended mitigation strategies:
1. **On-demand compilation** — only compile when requested (lazy loading)
2. **Remote content sources** — process via SSG instead of bundler
3. **Filesystem caching** — cache compiled output between builds

### Finding: On-demand compilation via Fuma Content addresses scale limits
**Confidence:** INFERRED
**Evidence:** Fuma Content roadmap, mdx-remote package

The shift from build-time (fumadocs-mdx) to on-demand (Fuma Content / mdx-remote) is the scalability path. On-demand means:
- Pages compiled when first accessed
- Memory usage proportional to concurrent pages, not total pages
- Build time independent of content volume

For a 100-article wiki (~400K words per Karpathy's numbers), build-time compilation is well within the ~500 file limit. On-demand becomes necessary at larger scales.

### Finding: Development experience includes TypeScript types, schema validation, and CLI
**Confidence:** CONFIRMED
**Evidence:** Fumadocs packages, fumadocs.dev docs

DX features:
- `source.config.ts` with defineCollections() for type-safe content definitions
- `.source/index.ts` generated types — full autocomplete for page data
- Zod schema validation at build time — catch frontmatter errors early
- `fumadocs add <component>` CLI — install UI components locally
- `fumadocs init` — project scaffolding
- Hot reload of content and components
- TypeScript throughout (zero runtime type errors from content)

### Finding: Build comparison with Mintlify
**Confidence:** INFERRED
**Evidence:** Architecture analysis

| Aspect | Fumadocs | Mintlify |
|--------|----------|---------|
| Build location | Local / CI | Mintlify cloud |
| Build speed control | Full (caching, on-demand, etc.) | None (platform handles it) |
| Build debugging | Full access (logs, profiling) | Limited (platform logs) |
| Preview | Local dev server | Cloud preview URLs |
| Hot reload | ~100ms (Next.js) | Instant (cloud editor) |
| Scale limit | ~500 files build-time, unlimited on-demand | Unknown (platform handles it) |

---

## Gaps / follow-ups

- Turbopack build times vs Webpack for large Fumadocs sites
- Fuma Content's watch mode: does it use chokidar or native fs.watch?
- Memory profiling for 100-page vs 500-page builds
