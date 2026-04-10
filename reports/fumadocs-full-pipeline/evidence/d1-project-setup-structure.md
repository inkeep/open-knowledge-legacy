# Evidence: D1 — Project Setup & Structure

**Dimension:** Project setup and structure
**Date:** 2026-04-03
**Sources:** fumadocs repo (github.com/fuma-nama/fumadocs), official docs (fumadocs.dev)

---

## Key files referenced

- `/tmp/fumadocs/package.json` — monorepo root, pnpm + Turborepo
- `/tmp/fumadocs/pnpm-workspace.yaml` — workspace config
- `/tmp/fumadocs/packages/` — all packages
- `/tmp/fumadocs/examples/next/` — canonical Next.js example
- `/tmp/fumadocs/examples/next/source.config.ts` — collection definition
- `/tmp/fumadocs/examples/next/next.config.mjs` — Next.js config with createMDX()
- `/tmp/fumadocs/examples/next/app/docs/[[...slug]]/page.tsx` — catch-all docs route
- `/tmp/fumadocs/examples/next/lib/source.ts` — loader + source wiring
- `/tmp/fumadocs/examples/next/components/mdx.tsx` — component registration

---

## Findings

### Finding: Fumadocs is a pnpm monorepo with Turborepo orchestration
**Confidence:** CONFIRMED
**Evidence:** `package.json` root

```json
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "release": "turbo run build --filter=./packages/* && changeset publish"
  },
  "packageManager": "pnpm@10.18.3"
}
```

### Finding: Three-layer package architecture
**Confidence:** CONFIRMED
**Evidence:** `packages/` directory listing

Core packages:
1. `fumadocs-mdx` (packages/mdx) — content processing, webpack/vite loaders, source.config
2. `fumadocs-core` (packages/core) — framework-agnostic: Source API, page tree, search, MDX plugins, negotiation
3. `fumadocs-ui` (packages/radix-ui) — Radix-based React components for docs layout
4. `@fumadocs/base-ui` (packages/base-ui) — unstyled base component variants

Additional packages: create-app, content (Fuma Content adapter), mdx-remote, openapi, doc-gen, obsidian, cli, stf (story), press, python, epub, tailwind, twoslash, typescript, shared, tsconfig

### Finding: Minimal project structure from scaffold
**Confidence:** CONFIRMED
**Evidence:** `examples/next/` directory

```
project/
  source.config.ts          # defineDocs() — collection definitions
  next.config.mjs           # createMDX() wrapping Next.js config
  content/
    docs/                   # MDX files + meta.json for navigation
  app/
    layout.tsx              # RootProvider from fumadocs-ui
    docs/
      layout.tsx            # DocsLayout with source.getPageTree()
      [[...slug]]/
        page.tsx            # Dynamic catch-all route
  components/
    mdx.tsx                 # getMDXComponents() — component registration
  lib/
    source.ts               # loader() from fumadocs-core/source
```

### Finding: File-based routing with `content/docs` as default directory
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/config/define.ts:115-120`

```typescript
export function defineDocs(options) {
  const dir = options.dir ?? 'content/docs';
  return {
    type: 'docs',
    dir,
    docs: defineCollections({ type: 'doc', dir, schema: pageSchema, ...options?.docs }),
    meta: defineCollections({ type: 'meta', dir, schema: metaSchema, ...options?.meta }),
  };
}
```

### Finding: .source/ directory is auto-generated output
**Confidence:** CONFIRMED
**Evidence:** `core.ts:131-134`

```typescript
export const _Defaults = {
  configPath: 'source.config.ts',
  outDir: '.source',
};
```

The `.source/` directory contains generated virtual modules (index.ts, type definitions) that provide type-safe access to content collections.

---

## Gaps / follow-ups

- `create-fumadocs-app` templates beyond Next.js (React Router, TanStack, Waku) — their structure variations
