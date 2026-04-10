# Evidence: SPA Mode Viability

**Dimension:** D2 — SPA mode viability
**Date:** 2026-04-08
**Sources:** Next.js docs, Dan Abramov's gist, community guides

---

## Key sources referenced

- https://nextjs.org/docs/app/guides/single-page-applications — Official SPA guide
- https://gist.github.com/gaearon/9d6b8eddc7f5e647a054d7b333434ef6 — Dan Abramov's SPA pattern
- https://nextjs.org/docs/app/guides/static-exports — Static export documentation
- https://nextjs.org/blog/next-16 — Next.js 16 release blog

---

## Findings

### Finding: Next.js officially supports SPA mode with `output: 'export'`
**Confidence:** CONFIRMED
**Evidence:** Official guide at nextjs.org/docs/app/guides/single-page-applications. Next.js "fully supports building Single-Page Applications (SPAs) with fast route transitions with prefetching, client-side data fetching, using browser APIs, integrating with third-party client libraries." Uses `output: 'export'` for static HTML/JS/CSS output.

**Implications:** The app CAN be built as an SPA with Next.js. The question is whether the added framework complexity is justified.

### Finding: Client-only rendering requires `next/dynamic` with `{ ssr: false }` for browser-dependent libs
**Confidence:** CONFIRMED
**Evidence:** Official docs: "To disable prerendering for a Client Component and only load it in the browser environment, you can use next/dynamic with the { ssr: false } option, which can be useful for third-party libraries that rely on browser APIs like window or document."

**Implications:** Every editor component (TipTap, CodeMirror, HocuspocusProvider) needs wrapping with `next/dynamic({ ssr: false })` or a `"use client"` boundary. This is ceremony that doesn't exist in the current Vite setup.

### Finding: The catch-all route pattern enables SPA-style routing
**Confidence:** CONFIRMED
**Evidence:** Dan Abramov's gist demonstrates `app/[[...slug]]/page.tsx` as a catch-all client component entry point. This effectively makes Next.js serve a single page with client-side routing.

**Implications:** Viable but awkward — file-system routing exists but is bypassed for a catch-all. This is working against the framework's grain.

### Finding: `output: 'export'` produces static files that ANY HTTP server can serve
**Confidence:** CONFIRMED
**Evidence:** Next.js docs: "Since Next.js supports this static export, it can be deployed and hosted on any web server that can serve HTML/CSS/JS static assets."

**Implications:** With `output: 'export'`, the built assets could be served by the existing Hocuspocus standalone server (or any HTTP server), similar to how Vite's `dist/` output works today. This means Next.js could be a BUILD tool only, not the runtime.

### Finding: SPA mode loses server-side features
**Confidence:** CONFIRMED
**Evidence:** Static export does not support: Server Components, Server Actions, Middleware, Incremental Static Regeneration, Image Optimization (requires server), draft mode, and dynamic routes.

**Implications:** These are exactly the features that would be the reason to switch TO Next.js. Without them, the value proposition shrinks to "Turbopack as a build tool."

### Finding: Next.js framework overhead adds ~85-100KB to client bundle
**Confidence:** INFERRED
**Evidence:** Community benchmarks and discussions indicate Next.js adds its runtime (router, hydration, etc.) to the client bundle. For SPA mode with `output: 'export'`, the overhead is the Next.js client-side router + React framework runtime. Vite adds essentially zero framework overhead (just React itself).

**Implications:** Marginal for an editor app where TipTap + CodeMirror + Y.js dominate the bundle. Not a blocker.

---

## Gaps / follow-ups

* Exact client bundle size comparison between Next.js SPA export and Vite build for this specific app
* Whether `output: 'export'` with a catch-all route produces a true single HTML file or multiple
