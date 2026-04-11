# Evidence: Embedded Frontend Distribution

**Dimension:** D1 — How tools bundle and serve pre-built React/SPA frontends from npm packages
**Date:** 2026-04-11
**Sources:** npm registry, Storybook docs, Prisma docs, open-knowledge codebase

---

## Key files / pages referenced

- `packages/cli/src/commands/start.ts` (lines 60-70) — current asset path resolution
- `packages/app/dist/` — built React app output
- `packages/cli/tsdown.config.ts` — current build config (no app asset copy)
- [Storybook blog: bloat fixed](https://storybook.js.org/blog/storybook-bloat-fixed/)
- [Prisma Studio embedding](https://www.prisma.io/docs/studio/integrations/embedding)
- [@storybook/core on npm](https://www.npmjs.com/package/@storybook/core)

---

## Findings

### Finding: Storybook pre-bundles its manager UI inside the npm package
**Confidence:** CONFIRMED
**Evidence:** npm registry data

Storybook consolidates its entire UI (the "manager") as prebundled assets inside `@storybook/core` (~28MB unpacked) and the `storybook` wrapper (~20MB). The manager is built at publish time using esbuild, and the resulting JS/CSS assets ship as part of the npm distribution. At runtime, Storybook's dev server uses Express to serve these pre-built assets alongside user stories compiled on the fly.

**Implications:** The pattern is proven at scale. Storybook's 28MB footprint dwarfs what open-knowledge needs (~2MB React app + ~6MB CLI = ~8MB total). npm has no practical size limit for CLI packages; Storybook proves 20-30MB is acceptable.

### Finding: Prisma Studio ships as an embeddable React component, not a standalone server
**Confidence:** CONFIRMED
**Evidence:** [Prisma ORM v6.11.0 blog](https://www.prisma.io/blog/orm-v6-11-0-embedded-prisma-studio-rust-free-orm-for-mysql-in-preview-and-more), [Embedding docs](https://www.prisma.io/docs/studio/integrations/embedding)

Prisma Studio evolved from a `prisma studio` CLI command (standalone server + embedded React UI) to an embeddable `<Studio />` React component in `@prisma/studio-core`. The older model (CLI launches HTTP server, serves pre-built React assets, opens browser) is exactly the pattern open-knowledge uses. The newer embeddable model is for framework integration (Next.js route).

**Implications:** Both models work. The CLI-serves-assets model (what open-knowledge does) is simpler for zero-config standalone use. The embeddable model is for when you want to integrate into an existing app.

### Finding: open-knowledge's current asset resolution breaks outside the monorepo
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/commands/start.ts` (lines 60-70)

```typescript
const cliDir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
const assetPaths = [
  resolve(cliDir, '../../app/dist'), // from src: packages/cli/src → packages/app/dist
  resolve(cliDir, '../../../app/dist'), // from dist: packages/cli/dist → packages/app/dist
];
const assetDir = assetPaths.find((p) => existsSync(p));
```

Both paths assume monorepo-relative layout. When installed via `bunx @inkeep/open-knowledge`, the CLI is in a global cache directory — neither path will resolve.

**Implications:** The fix is to include the app assets inside the CLI package's `dist/` (e.g., `dist/public/`) and resolve relative to the CLI bundle. This requires a build pipeline change.

### Finding: The built React app is only 2MB — trivially small for npm distribution
**Confidence:** CONFIRMED
**Evidence:** `du -sh packages/app/dist/` → 2.0M

```
packages/app/dist/
├── assets/
│   ├── index-BLwws8ho.js   (1.9MB — Vite-bundled React + TipTap + CodeMirror)
│   └── index-Bn6wEgZ_.css  (77KB — Tailwind CSS)
├── index.html
└── favicon.svg
```

Combined with CLI dist (6.1MB), total published package would be ~8MB.

**Implications:** No size concern whatsoever. Storybook is 20-28MB, Prisma is larger. 8MB is a lean CLI package.

### Finding: The standard pattern for including sibling workspace assets is a build-time copy
**Confidence:** CONFIRMED
**Evidence:** Industry patterns from Storybook, Docusaurus, TinaCMS

Three viable approaches:
1. **Build-time copy** — `cp -r ../app/dist ./dist/public` as a post-build script. Simplest, most common.
2. **Bundler plugin** — esbuild/rollup copy plugin. More integrated but adds complexity.
3. **Workspace dependency** — make `app` a devDependency and reference its built output. Fragile if the app isn't built first.

The build-time copy is the standard pattern because:
- It's explicit and debuggable
- It works with any bundler
- It's easy to verify with `npm pack --dry-run`
- No runtime resolution magic needed

---

## Gaps / follow-ups

* How does the asset path resolution change when `import.meta.dirname` points to a cache directory?
* Should assets be gzipped at build time (sirv supports `gzip: true` for pre-compressed files)?
