---
title: "Can Next.js 16 Replace Vite for a TipTap + Hocuspocus CRDT Collaboration App?"
description: "End-to-end feasibility analysis of replacing Vite with Next.js 16 as the dev server and SPA host for a real-time collaborative editor (TipTap + Hocuspocus + Y.js) distributed as an npm CLI package. Covers WebSocket integration, SPA mode, library compatibility, CLI distribution weight, DX, migration effort, and trade-offs."
createdAt: 2026-04-08
updatedAt: 2026-04-09
subjects:
  - Next.js 16
  - Vite
  - Vite 8
  - Rolldown
  - Hocuspocus
  - TipTap
  - Turbopack
  - Y.js
  - React Router v7
  - TanStack Router
  - Rsbuild
  - crossws
topics:
  - framework migration feasibility
  - WebSocket server integration
  - CLI distribution architecture
  - collaborative editor infrastructure
  - bundler landscape
  - SPA routing options
---

# Can Next.js 16 Replace Vite for a TipTap + Hocuspocus CRDT Collaboration App?

**Purpose:** Determine whether Next.js 16 can replace Vite as the dev server and SPA host for `@inkeep/open-knowledge` — a TipTap + Hocuspocus CRDT editor distributed as an npm CLI package — and whether the switch is worth making.

---

## Executive Summary

**Recommendation: Do not switch. Stay on Vite.**

Next.js 16 *can* technically host a TipTap + Hocuspocus CRDT editor, but the integration is awkward, the trade-offs are unfavorable, and the gains don't materialize for this use case. Every advantage Next.js offers (SSR, API routes, middleware, image optimization, Vercel deployment) is irrelevant for a local-first CLI tool that serves a 100% client-rendered SPA on localhost.

The critical blockers are architectural, not technical:

First, **WebSocket integration requires fighting the framework.** Next.js has no native WebSocket support in route handlers ([Discussion #58698](https://github.com/vercel/next.js/discussions/58698) — open since 2024, no official response). Integrating Hocuspocus requires either a custom server (which disables key Next.js optimizations), a third-party patch ([next-ws](https://github.com/apteryxxyz/next-ws) — 316 stars, patches Next.js internals), or running Hocuspocus as a separate process (breaking the single-port experience). The current Vite plugin achieves this in 160 lines by hooking into Vite's `configureServer()` API — an elegant approach with no Next.js equivalent.

Second, **the CLI distribution model is incompatible.** The `next` package is 154.4 MB unpacked (8,065 files) vs Vite's ~2.2 MB. For a CLI tool where users expect sub-second `npx` startup, this is disqualifying. Even using `output: 'export'` to build static assets and serve them without the Next.js runtime reduces Next.js to a build-only tool — which Vite already is, at 1/70th the dependency weight.

Third, **every editor library needs SSR workarounds that don't exist in Vite.** TipTap requires `"use client"` + `immediatelyRender: false`. Critically, `"use client"` does NOT prevent SSR — Next.js still pre-renders client components on the server. The current codebase's module-level singleton (`window.location.host`) would crash during server rendering. y-prosemirror, y-codemirror.next, and HocuspocusProvider all need either `next/dynamic({ ssr: false })` wrappers or refactoring into `useEffect` hooks. This is pure ceremony — in Vite, there's no SSR path to protect against.

The one scenario where Next.js might make sense is if the product evolves to need server-rendered pages (public document viewing, SEO-optimized sharing). That's speculative and can be addressed incrementally if it arises.

**Key Findings:**
- **WebSocket: No native support.** Custom server or separate process required — both degrade the developer experience and CLI distribution story.
- **SPA mode works but is swimming upstream.** `output: 'export'` + catch-all route produces static files, but bypasses everything that makes Next.js valuable.
- **Library compatibility is solvable but adds friction.** TipTap, Y.js, and CodeMirror all work with `"use client"` wrappers, but the entire app must be wrapped — adding complexity with zero benefit.
- **Package weight is disqualifying for CLI distribution.** 317 MB total node_modules (next) vs 39 MB (vite) — an 8x difference. The `next` package alone is 154 MB (70x vite's 2.2 MB).
- **HMR performance is a wash.** Turbopack: 84-335ms, Vite: 142-338ms. Not a differentiator.
- **Migration effort is high in the wrong places.** The React component migration is trivial; the Hocuspocus server integration must be completely redesigned.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| D1 | WebSocket integration architecture | P0 | Deep | Covered |
| D2 | SPA mode viability | P0 | Deep | Covered |
| D3 | TipTap / Y.js / CodeMirror compatibility | P0 | Moderate | Covered |
| D4 | CLI distribution & package weight | P0 | Deep | Covered |
| D5 | Dev experience comparison | P1 | Moderate | Covered |
| D6 | Bun runtime compatibility | P2 | Light | Covered |
| D7 | Migration effort & architectural changes | P1 | Moderate | Covered |
| D8 | What Next.js gains | P1 | Moderate | Covered |

**Stance:** Conclusions — the reader needs a recommendation.

**Non-goals:** Comparison with other frameworks (Remix, Astro); Vercel-specific deployment; deep RSC migration patterns.

---

## Detailed Findings

### D1: WebSocket Integration Architecture

**Finding:** Next.js has no native WebSocket support. Integrating Hocuspocus requires a custom server, a third-party patch, or a separate process — all of which degrade the current single-port, single-process architecture.

**Evidence:** [evidence/websocket-integration.md](evidence/websocket-integration.md)

Three integration paths exist, all problematic:

```
┌─────────────────────────────────────────────────────────┐
│ Current: Vite Plugin (single port, single process)      │
│                                                         │
│  Vite Dev Server :5173                                  │
│  ├── HTTP → React SPA (HMR, assets)                    │
│  ├── WS /collab → Hocuspocus (CRDT sync)               │
│  └── HTTP /api/* → Agent endpoints                     │
│                                                         │
│  Integration: 160 lines in hocuspocus-plugin.ts         │
│  via configureServer() hook                             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Option A: Next.js Custom Server                         │
│                                                         │
│  Custom server.js :3000                                 │
│  ├── HTTP → Next.js handler (React SPA)                │
│  ├── WS /collab → Hocuspocus (manual upgrade)          │
│  └── HTTP /api/* → Next.js API routes                  │
│                                                         │
│  Trade-offs:                                            │
│  - Disables Automatic Static Optimization               │
│  - output: 'standalone' doesn't trace custom server     │
│  - Must manage upgrade routing manually                 │
│  - Turbopack HMR WebSocket may conflict                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Option B: Separate Process                              │
│                                                         │
│  Next.js :3000          Hocuspocus :3001                │
│  ├── HTTP → SPA         ├── WS /collab                 │
│  └── HTTP /api/*        └── HTTP /api/*                │
│                                                         │
│  Trade-offs:                                            │
│  - Two ports, CORS configuration                        │
│  - Two processes to manage in CLI                       │
│  - Breaks single-command experience                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Option C: next-ws Patch                                 │
│                                                         │
│  Next.js :3000 (patched)                                │
│  ├── HTTP → SPA                                        │
│  ├── WS UPGRADE handler → Hocuspocus                   │
│  └── HTTP /api/* → API routes                          │
│                                                         │
│  Trade-offs:                                            │
│  - Patches Next.js internals on install                 │
│  - Must re-patch on every Next.js update                │
│  - 316 stars, unknown production reliability             │
│  - Not suitable for npx-distributed CLI tools           │
└─────────────────────────────────────────────────────────┘
```

[Discussion #58698](https://github.com/vercel/next.js/discussions/58698) requesting native WebSocket support has 33 upvotes and no official response from the Next.js team. A PR (#58704) proposing `NextRequest#upgrade()` exists but has not been merged. There is no roadmap indication that this will ship.

**Decision triggers:**
- If Next.js adds native WebSocket support in route handlers, Option A becomes significantly simpler
- If the app moves to a cloud-hosted architecture (not CLI-distributed), the separate process model becomes more natural

**Remaining uncertainty:**
- Whether Turbopack's dev server exposes HTTP upgrade events for custom routing (not documented)

---

### D2: SPA Mode Viability

**Finding:** Next.js officially supports SPA mode via `output: 'export'` and catch-all routes, but this bypasses every feature that differentiates Next.js from Vite.

**Evidence:** [evidence/spa-mode-viability.md](evidence/spa-mode-viability.md)

Next.js's [official SPA guide](https://nextjs.org/docs/app/guides/single-page-applications) confirms the pattern: create a catch-all `app/[[...slug]]/page.tsx` with `"use client"`, set `output: 'export'` in `next.config.js`, and the build produces static HTML/JS/CSS servable by any HTTP server.

This works. But it means:
- No Server Components (irrelevant for this app, but the whole point of Next.js)
- No API routes (must run a separate server anyway)
- No Middleware (no auth layer to protect)
- No Image Optimization (no images to optimize)
- No Incremental Static Regeneration (no static pages to regenerate)
- No Cache Components or "use cache" (server-side caching features)

What remains is essentially Turbopack as a build tool + React framework runtime. The build output is functionally identical to Vite's `dist/` directory — static assets served by a plain HTTP server.

**Decision triggers:**
- If the product adds public-facing pages that need SSR/SEO, Next.js's SPA → SSR upgrade path becomes valuable
- If the team adopts Next.js for other projects and wants tooling consistency

---

### D3: TipTap / Y.js / CodeMirror Compatibility

**Finding:** All three libraries work in Next.js with `"use client"` wrappers and SSR guards, but the workarounds add friction that doesn't exist in Vite.

**Evidence:** [evidence/tiptap-yjs-codemirror-compat.md](evidence/tiptap-yjs-codemirror-compat.md)

[TipTap's official Next.js guide](https://tiptap.dev/docs/editor/getting-started/install/nextjs) documents the pattern: `"use client"` + `immediatelyRender: false`. However, [issue #5856](https://github.com/ueberdosis/tiptap/issues/5856) shows that SSR detection errors persist even with the recommended configuration.

The full collaboration stack (y-prosemirror, y-codemirror.next, HocuspocusProvider) accesses browser APIs (DOM Selection, WebSocket) that cannot run on the server. Each library needs `next/dynamic({ ssr: false })` or must be imported only within `"use client"` components.

In the current codebase, essentially 100% of the app is client-rendered:
- `TiptapEditor.tsx` — WYSIWYG editor with collaboration
- `SourceEditor.tsx` — CodeMirror with y-codemirror.next
- `PresenceBar.tsx` — Awareness/presence display
- `AgentUndoButton.tsx` — Agent edit undo
- All observer sync logic — bidirectional Y.Doc observers

Every one of these would need a `"use client"` directive. The entire app tree is client-only. There is no server component anywhere in the architecture.

**Decision triggers:**
- Not a blocker — works with workarounds
- Adds maintenance burden for zero gain in this architecture

---

### D4: CLI Distribution & Package Weight

**Finding:** The `next` package at 154.4 MB is disqualifying for CLI distribution via `npx`. The only viable pattern (build-with-Next.js, serve-without) reduces Next.js to a build tool that Vite already fills at 1/70th the weight.

**Evidence:** [evidence/cli-distribution-weight.md](evidence/cli-distribution-weight.md)

| Metric | Vite | Next.js | Factor |
|--------|------|---------|--------|
| Package size (unpacked) | ~2.2 MB | 154.4 MB | 70x |
| Total node_modules | 39 MB | 317 MB | 8.1x |
| File count | 35 | 8,065 | 230x |
| Cold start (plain HTTP vs `next start`) | ~138ms | ~436ms | 3.2x |

The current distribution model: `npx @inkeep/open-knowledge` installs the CLI, which starts a Hocuspocus server and serves pre-built SPA assets from `dist/`. Next.js would need to be either:

1. **A runtime dependency** — adds 154 MB to install, 500-2000ms to cold start. No known npm CLI tools use this pattern.
2. **A build-only dependency** — `output: 'export'` at build time, ship `out/` directory in the npm package, serve with plain HTTP server at runtime. This is exactly what Vite does today — making the switch pointless.

**Decision triggers:**
- If the product moves to a cloud-hosted SaaS model (not CLI-distributed), package weight becomes irrelevant
- If `next` package size decreases significantly in future versions

---

### D5: Developer Experience Comparison

**Finding:** HMR speeds are comparable. Vite is simpler to configure for client-only apps. Community consensus: "For pure client-side React SPAs, Vite remains the king."

**Evidence:** [evidence/dx-comparison.md](evidence/dx-comparison.md)

[Evan You's HMR benchmark](https://github.com/yyx990803/vite-vs-next-turbo-hmr) (M1 MacBook Pro, 1,000 components with SWC):

| Scenario | Vite | Turbopack | Diff |
|----------|------|-----------|------|
| Root component | 338ms | 335ms | ~1% |
| Leaf component | 142ms | 84ms | 40% faster |

Turbopack's leaf component advantage is real but modest. For an editor app where most edits are in a small number of files, this difference is imperceptible.

Configuration overhead with Next.js: `"use client"` directives, `next/dynamic` wrappers, `next.config.js` for `output: 'export'`, custom server setup. Vite requires: a `vite.config.ts` with the React plugin and the Hocuspocus plugin — done.

---

### D6: Bun Runtime Compatibility

**Finding:** Next.js 16 works with Bun via `bun --bun next dev`, with 95-98% API compatibility. Not a constraint since Bun migration is acceptable.

[Bun's official Next.js guide](https://bun.com/docs/guides/ecosystem/nextjs) and [Next.js Conf 2025 talk](https://nextjs.org/conf/session/nextjs-bun) confirm the integration. Native Bun support is coming to Vercel with ~30% CPU reduction.

This dimension is moot per the user's confirmation that moving from Bun is acceptable.

---

### D7: Migration Effort & Architectural Changes

**Finding:** The React migration is trivial (add `"use client"` everywhere). The Hocuspocus integration must be completely redesigned. The CLI distribution model must change fundamentally.

**Evidence:** [evidence/migration-effort.md](evidence/migration-effort.md)

Next.js has an [official Vite migration guide](https://nextjs.org/docs/app/guides/migrating/from-vite) covering standard patterns. For this project, the effort breaks down:

| Layer | Effort | Risk |
|-------|--------|------|
| React components | Low — add `"use client"`, wrap with `next/dynamic` | Low |
| Editor state (Y.Doc, observers) | Low — unchanged, runs in client | Low |
| Hocuspocus server integration | **High** — complete redesign of server wiring | **High** |
| CLI command (`start.ts`) | **High** — new startup sequence | **High** |
| File watcher integration | Medium — must work with new server lifecycle | Medium |
| Agent API endpoints | Medium — move to API routes or custom server | Medium |
| Build pipeline | Medium — tsdown + Vite → tsdown + Next.js | Low |
| Dev mode HMR | Medium — re-solve collaboration state preservation across reloads | Medium |

The effort concentrates in the server layer — exactly where the current Vite setup provides the most value via its clean `configureServer()` hook.

---

### D8: What Next.js Would Provide

**Finding:** Next.js 16's headline features (Cache Components, SSR, API routes, Middleware, Image Optimization, Vercel ecosystem) are either irrelevant or inaccessible for a CLI-distributed, client-rendered, local-first editor tool.

**Evidence:** [evidence/nextjs-gains.md](evidence/nextjs-gains.md)

| Next.js Feature | Relevance to This App |
|-----------------|----------------------|
| Server Components | None — app is 100% client |
| Cache Components / "use cache" | None — server-side feature |
| API Routes | Marginal — need shared state with Hocuspocus |
| Middleware | None — no auth layer |
| Image Optimization | None — no images |
| Vercel deployment | None — CLI tool runs locally |
| Turbopack builds | Marginal — Vite builds are already fast |
| SSR/ISR/PPR | None — no server rendering |
| DevTools MCP | Minor — AI debugging aid |

The primary gain would be **future optionality**: if the product later needs server-rendered pages (public sharing, SEO), Next.js provides that path. This is speculative value that doesn't justify the migration cost or the architectural degradation.

---

---

## Follow-Up Research

Three follow-up directions were investigated to round out the analysis.

### F1: Turbopack as Standalone Build Tool

**Finding:** Turbopack standalone does not exist. Vite 8 + Rolldown has already closed the performance gap.

**Evidence:** [evidence/turbopack-standalone-bundler-landscape.md](evidence/turbopack-standalone-bundler-landscape.md)

There is no `@vercel/turbopack` npm package. [Discussion #86533](https://github.com/vercel/next.js/discussions/86533) asks directly whether standalone is still planned — no Vercel response. Third-party sources cited a Q1 2026 target that has been missed with no public update.

Meanwhile, **[Vite 8 shipped March 12, 2026](https://vite.dev/blog/announcing-vite8) with Rolldown as the default bundler**, replacing the dual Rollup + esbuild architecture with a single Rust-based engine:

| Metric | Before (Vite 7 / Rollup) | After (Vite 8 / Rolldown) |
|--------|--------------------------|---------------------------|
| 19K module build | 40.10s | 1.61s (25x faster) |
| Linear production build | 46s | 6s |
| Dev server startup | baseline | 3x faster |
| Full reload | baseline | 40% faster |
| Network requests | baseline | 10x fewer |

The dev/prod inconsistency that was Vite's main architectural criticism is now resolved — both dev and prod use the same Rolldown bundler.

Other alternatives assessed:
- **Rsbuild** (ByteDance) — production-ready, ~23x faster than Webpack, Vite migration guide exists. Good alternative if Vite ever becomes a constraint.
- **Farm** — viable but niche (~5,566 stars vs Vite's ~72K). Outpaced by Vite 8.

**Recommendation:** Upgrade `packages/app` from Vite 6 to Vite 8. Same config, same plugins, Rust-speed builds, zero framework lock-in. This is the highest-impact, lowest-risk change available.

---

### F2: Hocuspocus v4 Architecture

**Finding:** Hocuspocus v4 (currently in RC) migrates from `ws` to crossws for multi-runtime support. This strengthens the case for staying on the current Vite + Hocuspocus architecture.

**Evidence:** [evidence/hocuspocus-v4-yjs-server-landscape.md](evidence/hocuspocus-v4-yjs-server-landscape.md)

v4's crossws migration is the biggest architectural change in Hocuspocus history:

```
v3: ws (Node.js only) → v4: crossws (Node.js, Bun, Deno, Cloudflare Workers)
```

This project already consumes `@hocuspocus/server@4.0.0-rc.1`. The v4 timeline:

| Version | Date | Status |
|---------|------|--------|
| v4.0.0-rc.0 | Mar 16, 2026 | First RC |
| v4.0.0-rc.1 | Mar 30, 2026 | Current (in this project) |
| v4.0.0-rc.2 | Apr 8, 2026 | Published today |

**What v4 does NOT change:** Hocuspocus remains WebSocket-only. No HTTP/long-polling fallback. This means the Next.js integration story is unchanged — you still need a persistent WebSocket server process.

**TipTap's 2026 direction:** Cloud-first. The [roadmap](https://tiptap.dev/blog/release-notes/our-roadmap-for-2026) names AI in Documents, Document Conversion, and Flex as strategic bets — all cloud-oriented. Hocuspocus is not mentioned by name but remains MIT-licensed and actively developed. Advanced features (AI toolkit, version history, comments) are cloud-only.

**Yjs server landscape:**

| Server | Language | License | Stars | Best for |
|--------|----------|---------|-------|----------|
| **Hocuspocus** | TypeScript | MIT | 2,213 | Rich hooks, app integration |
| **y-sweet** | Rust | GPL v3 | 986 | Scale (S3-native storage) |
| **PartyKit** | JS | MIT | Cloudflare | Edge-deployed collaboration |
| **Liveblocks** | JS | AGPL v3 | N/A | Not production self-host (yet) |

**Implications for the Next.js question:** Hocuspocus v4's crossws migration makes it more portable, but doesn't change the fundamental WebSocket requirement. The Vite plugin's `configureServer()` hook remains the cleanest integration pattern. y-sweet's GPL license makes it incompatible without careful isolation. PartyKit is compelling for cloud but not for CLI-distributed local-first tools.

---

### F3: SPA Routing Options

**Finding:** The app doesn't need a router today. When it does, React Router v7 Declarative mode or TanStack Router are the right choices — not Next.js.

**Evidence:** [evidence/spa-routing-options.md](evidence/spa-routing-options.md)

The current `packages/app/` has no router and doesn't need one — it's a single-page editor with conditional WYSIWYG/Source toggle. Adding a router is premature.

When multi-document support arrives, the options ranked by complexity:

| Need | Router | Size | Key feature |
|------|--------|------|-------------|
| 2-3 simple routes | [Wouter](https://github.com/molefrog/wouter) | ~1.5KB | Zero-dep, minimal API |
| Standard SPA routing | [React Router v7](https://reactrouter.com/start/modes) Declarative | ~8KB | Battle-tested, hooks API |
| Type-safe URL state | [TanStack Router](https://tanstack.com/router/latest) | ~12KB | Zod-validated search params |
| File-based routing | TanStack Router + Vite plugin | ~12KB | Next.js-style DX without SSR |

React Router v7 now has three modes: Declarative (classic `<BrowserRouter>`), Data (loaders/actions), and Framework (full Remix-like with Vite plugin). For this use case, Declarative or Data mode — not Framework mode. Framework mode adds SSR machinery that isn't needed.

TanStack Router's type-safe search params are genuinely valuable for an editor app where URLs might encode document ID, editor mode, and cursor position:

```typescript
validateSearch: zodValidator(z.object({
  docId: z.string().optional(),
  mode: z.enum(['wysiwyg', 'source']).default('wysiwyg'),
}))
```

File-based routing for Vite exists without Next.js via TanStack Router's Vite plugin or [Generouted](https://github.com/oedotme/generouted). **Next.js is not needed for file-based routing.**

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Turbopack dev server upgrade events:** Whether Turbopack's dev server exposes HTTP upgrade hooks for custom WebSocket routing is not documented. The custom server approach should work but hasn't been verified with Turbopack specifically.
- **Exact bundle size comparison:** Client-side bundle size difference between Next.js SPA export and Vite build for this specific app was not measured.

### Out of Scope (per Rubric)
- Comparison with Remix, Astro, or other frameworks
- Vercel-specific deployment considerations
- Deep RSC migration patterns

---

## References

### Evidence Files
- [evidence/websocket-integration.md](evidence/websocket-integration.md) — WebSocket architecture analysis (3 integration paths)
- [evidence/spa-mode-viability.md](evidence/spa-mode-viability.md) — SPA mode and static export viability
- [evidence/tiptap-yjs-codemirror-compat.md](evidence/tiptap-yjs-codemirror-compat.md) — Editor library SSR compatibility
- [evidence/cli-distribution-weight.md](evidence/cli-distribution-weight.md) — Package size and cold start measurements
- [evidence/dx-comparison.md](evidence/dx-comparison.md) — HMR benchmarks and DX comparison
- [evidence/migration-effort.md](evidence/migration-effort.md) — Migration effort breakdown
- [evidence/nextjs-gains.md](evidence/nextjs-gains.md) — Next.js feature relevance assessment
- [evidence/turbopack-standalone-bundler-landscape.md](evidence/turbopack-standalone-bundler-landscape.md) — Turbopack standalone status, Vite 8/Rolldown, Rsbuild, Farm
- [evidence/hocuspocus-v4-yjs-server-landscape.md](evidence/hocuspocus-v4-yjs-server-landscape.md) — Hocuspocus v4 crossws migration, y-sweet, PartyKit, Liveblocks
- [evidence/spa-routing-options.md](evidence/spa-routing-options.md) — React Router v7, TanStack Router, Wouter, file-based routing

### External Sources
- [Next.js 16 Blog](https://nextjs.org/blog/next-16) — Release announcement
- [Next.js Discussion #58698](https://github.com/vercel/next.js/discussions/58698) — WebSocket support feature request
- [next-ws](https://github.com/apteryxxyz/next-ws) — Community WebSocket patch (316 stars)
- [CafeinoDev/next-hocuspocus-server](https://github.com/CafeinoDev/next-hocuspocus-server) — Proof-of-concept integration
- [Evan You's HMR Benchmark](https://github.com/yyx990803/vite-vs-next-turbo-hmr) — Vite vs Turbopack performance comparison
- [TipTap Next.js Guide](https://tiptap.dev/docs/editor/getting-started/install/nextjs) — Official installation docs
- [TipTap Issue #5856](https://github.com/ueberdosis/tiptap/issues/5856) — SSR detection bug
- [Next.js Vite Migration Guide](https://nextjs.org/docs/app/guides/migrating/from-vite) — Official migration docs
- [Vite 8.0 Announcement](https://vite.dev/blog/announcing-vite8) — Rolldown migration, 10-30x faster builds
- [Turbopack Discussion #86533](https://github.com/vercel/next.js/discussions/86533) — Standalone status
- [TipTap 2026 Roadmap](https://tiptap.dev/blog/release-notes/our-roadmap-for-2026) — Cloud-first strategy
- [crossws](https://crossws.h3.dev/) — Multi-runtime WebSocket library (Hocuspocus v4)
- [Hocuspocus CHANGELOG](https://github.com/ueberdosis/hocuspocus/blob/main/CHANGELOG.md) — v4 RC changes
- [y-sweet](https://jamsocket.com/y-sweet) — Rust-based Yjs server (GPL v3)
- [PartyKit / Cloudflare](https://github.com/cloudflare/partykit) — Edge Yjs collaboration
- [React Router v7 Modes](https://reactrouter.com/start/modes) — Declarative / Data / Framework
- [TanStack Router](https://tanstack.com/router/latest/docs/overview) — Type-safe routing
- [Wouter](https://github.com/molefrog/wouter) — Minimalist router (~1.5KB)
- [Rsbuild](https://rsbuild.rs/) — Rspack-based build tool (Vite alternative)

### Related Research
- [bun-vs-node-runtime/](../bun-vs-node-runtime/) — Runtime selection analysis for this same project; covers CLI distribution constraints and startup time benchmarks
- [rsc-nextjs-visual-editor-implications/](../rsc-nextjs-visual-editor-implications/) — RSC implications for visual editors; covers instrumentation strategies and HMR behavior in Next.js
