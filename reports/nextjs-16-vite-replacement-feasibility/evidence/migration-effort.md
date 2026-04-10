# Evidence: Migration Effort & Architectural Changes

**Dimension:** D7 — Migration effort and architectural changes
**Date:** 2026-04-08
**Sources:** Next.js migration guide, codebase analysis

---

## Key sources referenced

- https://nextjs.org/docs/app/guides/migrating/from-vite — Official Vite → Next.js migration guide
- https://www.shsxnk.com/blog/migrating-vite-to-nextjs-16 — Migration experience report
- https://www.inngest.com/blog/migrating-from-vite-to-nextjs — Inngest migration guide

---

## Findings

### Finding: Next.js has an official Vite migration guide with clear steps
**Confidence:** CONFIRMED
**Evidence:** nextjs.org/docs/app/guides/migrating/from-vite covers: removing Vite deps, adding Next.js, creating root layout, catch-all route, updating imports, environment variables, and static assets.

**Implications:** The basic migration path is documented. But this guide assumes a standard React SPA, not one with CRDT collaboration, custom WebSocket servers, and CLI distribution.

### Finding: The React component migration is straightforward — add `"use client"` everywhere
**Confidence:** CONFIRMED
**Evidence:** Since the entire app is client-rendered, every component gets `"use client"`. No RSC refactoring needed. The migration guide confirms this pattern using catch-all `app/[[...slug]]/page.tsx`.

**Implications:** Low effort for the React layer itself.

### Finding: The Hocuspocus integration is the hard migration — no direct equivalent to Vite's plugin API
**Confidence:** CONFIRMED
**Evidence:** Current Vite plugin hooks into `configureServer()` for both WebSocket upgrades and HTTP middleware on the same server. Next.js has no equivalent hook. Options are: (1) custom server.js that wraps Next.js + Hocuspocus, (2) separate process, (3) next-ws patch. All require significant rewiring of the current hocuspocus-plugin.ts.

Files that would need complete rewriting:
- `packages/app/src/server/hocuspocus-plugin.ts` → custom server.js or separate process
- `packages/cli/src/commands/start.ts` → switch from Hocuspocus standalone to Next.js + Hocuspocus
- `packages/app/vite.config.ts` → `next.config.js`

**Implications:** The server integration layer — which is the core architectural differentiator of this project — must be completely redesigned.

### Finding: The CLI distribution model must change fundamentally
**Confidence:** INFERRED
**Evidence:** Current model: `tsdown` builds the CLI, Vite builds the SPA, CLI serves pre-built static assets + Hocuspocus. With Next.js: either (1) CLI runs `next start` (adds 154MB dep + slow startup), or (2) CLI uses `output: 'export'` and serves static files (same as current approach, making Next.js a build-only tool).

**Implications:** Either path is suboptimal — (1) bloats the CLI, (2) negates the value of switching.

---

## Gaps / follow-ups

* Whether the Vite plugin's HMR-surviving watcher pattern has an equivalent in Next.js custom server
