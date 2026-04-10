# Evidence: What Next.js Gains

**Dimension:** D8 — What Next.js would provide
**Date:** 2026-04-08
**Sources:** Next.js 16 blog, framework comparisons

---

## Key sources referenced

- https://nextjs.org/blog/next-16 — Next.js 16 release
- https://nextjs.org/blog/next-16-1 — Next.js 16.1 release
- https://designrevision.com/blog/vite-vs-nextjs — 2026 comparison
- https://prismic.io/blog/vite-vs-nextjs — Feature comparison

---

## Findings

### Finding: Next.js 16 brings Cache Components, Turbopack default, DevTools MCP
**Confidence:** CONFIRMED
**Evidence:** Next.js 16 blog: "use cache" directive for caching pages/components/functions, Turbopack as default bundler (2-5x faster builds), DevTools MCP for AI-assisted debugging, proxy.ts replacing middleware.ts.

**Implications:** Cache Components and "use cache" are server-side features — irrelevant for a 100% client-rendered SPA. DevTools MCP is interesting but not a migration driver.

### Finding: SSR/RSC provides future optionality for the editor platform
**Confidence:** INFERRED
**Evidence:** If the platform ever needs server-rendered pages (e.g., a document viewer, public sharing page, SEO-optimized content), Next.js would provide that path without a second framework.

**Implications:** This is speculative future value. The current product is a local-first CLI tool with no SSR use cases.

### Finding: API routes could replace the custom Hocuspocus API extension
**Confidence:** INFERRED
**Evidence:** Next.js API routes (app/api/*/route.ts) provide typed handlers for HTTP endpoints. The current `/api/agent-write`, `/api/agent-undo` etc. could be implemented as Next.js API routes.

**Implications:** However, these API routes need access to the Hocuspocus instance and AgentSessionManager, which requires shared state across routes. In a custom server setup, this is already handled. In Next.js API routes, managing singleton server state is more complex.

### Finding: Image optimization is irrelevant for an editor tool
**Confidence:** CONFIRMED
**Evidence:** Next.js Image component provides automatic AVIF/WebP conversion, lazy loading, responsive sizing. But the open-knowledge editor doesn't serve images — it's a document editing tool.

**Implications:** No value for this use case.

### Finding: Middleware provides auth/routing capabilities not currently needed
**Confidence:** CONFIRMED
**Evidence:** Next.js Middleware intercepts requests for auth, redirects, A/B testing. The current app is a local-first tool with no authentication layer.

**Implications:** No value for the current use case. Could matter if the platform adds multi-user auth, but that's speculative.

### Finding: Next.js ecosystem (Vercel, deployment, analytics) doesn't apply to a CLI tool
**Confidence:** CONFIRMED
**Evidence:** Next.js's strongest value proposition is the Vercel deployment ecosystem — automatic preview deployments, edge functions, analytics, speed insights. A CLI tool installed via `npx` and run locally cannot use any of these.

**Implications:** The primary ecosystem advantage of Next.js is entirely irrelevant for this distribution model.

---

## Gaps / follow-ups

* Whether React 19 features (Actions, use) provide value independent of Next.js server features
