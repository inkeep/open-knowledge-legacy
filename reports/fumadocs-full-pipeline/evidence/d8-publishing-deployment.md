# Evidence: D8 — Publishing / Deployment

**Dimension:** Publishing / deployment
**Date:** 2026-04-03
**Sources:** fumadocs repo examples

---

## Key files referenced

- `examples/next/next.config.mjs` — standard Next.js config
- `examples/next-static/next.config.mjs` — static export config
- `examples/next/package.json` — build scripts

---

## Findings

### Finding: Deployment is standard Next.js — no Fumadocs-specific deployment step
**Confidence:** CONFIRMED
**Evidence:** `examples/next/next.config.mjs`

```javascript
import { createMDX } from 'fumadocs-mdx/next';
const withMDX = createMDX();

const config = { reactStrictMode: true };
export default withMDX(config);
```

Build: `next build`. Deploy to any Next.js-compatible host (Vercel, Netlify, AWS, self-hosted).

### Finding: Static export is supported via Next.js `output: 'export'`
**Confidence:** CONFIRMED
**Evidence:** `examples/next-static/next.config.mjs`

```javascript
const config = {
  output: 'export',
  reactStrictMode: true,
};
export default withMDX(config);
```

This generates a fully static site deployable to any CDN/static host.

### Finding: `generateStaticParams()` enables static generation of all doc pages
**Confidence:** CONFIRMED
**Evidence:** `examples/next/app/docs/[[...slug]]/page.tsx`

```typescript
export async function generateStaticParams() {
  return source.generateParams();
}
```

`source.generateParams()` returns `{ slug: string[] }[]` for all pages, enabling Next.js ISR or full static generation.

### Finding: postinstall script generates .source/ files
**Confidence:** CONFIRMED
**Evidence:** `examples/next/package.json`

```json
{
  "scripts": {
    "postinstall": "fumadocs-mdx"
  }
}
```

The `fumadocs-mdx` CLI runs during `postinstall` to generate the `.source/` directory with type-safe virtual modules. This ensures the generated files exist before the first build.

### Finding: Versioning is not a built-in Fumadocs feature
**Confidence:** CONFIRMED
**Evidence:** No versioning mechanism found in the codebase. The docs framework delegates versioning to git branches or manual directory structures (e.g., `content/docs/v1/`, `content/docs/v2/`).

### Finding: Non-Next.js deployment works via framework-specific conventions
**Confidence:** CONFIRMED
**Evidence:** Examples exist for: React Router, TanStack Start, Waku, Astro. Each uses its own build/deploy model. The Vite plugin replaces the Next.js integration for Vite-based frameworks.

---

## Gaps / follow-ups

- ISR (Incremental Static Regeneration) patterns for CMS-sourced content
