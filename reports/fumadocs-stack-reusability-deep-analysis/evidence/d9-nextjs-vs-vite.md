# Evidence: D9 — Next.js vs Vite for Our Product

**Dimension:** Framework decision for editor product
**Date:** 2026-04-02
**Sources:** Web search results, Hocuspocus docs, TipTap docs, Vite docs, Fumadocs source

---

## Key sources referenced

- [Hocuspocus Server Examples](https://tiptap.dev/docs/hocuspocus/server/examples)
- [Hocuspocus Usage](https://tiptap.dev/docs/hocuspocus/server/usage)
- [Next.js + Hocuspocus example](https://github.com/CafeinoDev/next-hocuspocus-server)
- [TipTap Next.js Installation](https://tiptap.dev/docs/editor/getting-started/install/nextjs)
- [TipTap SSR Issue #5856](https://github.com/ueberdosis/tiptap/issues/5856)
- [Vite Server Options](https://vite.dev/config/server-options)
- [Fumadocs React Router Installation](https://fumadocs.dev/docs/ui/manual-installation/react-router)
- [Fumadocs v16](https://www.fumadocs.dev/blog/v16)

---

## Findings

### Finding: Hocuspocus in Vite uses configureServer hook with handleConnection()
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus docs (server/examples), Vite docs (server-options)

Hocuspocus supports a `handleConnection()` API where it does NOT start its own server. Instead, you pass incoming WebSocket connections to it:

```typescript
// Vite plugin pattern
export function hocuspocusPlugin(hocuspocus: Hocuspocus) {
  return {
    name: 'hocuspocus',
    configureServer(server) {
      server.httpServer?.on('upgrade', (request, socket, head) => {
        if (request.url === '/collaboration') {
          const wss = new WebSocketServer({ noServer: true });
          wss.handleUpgrade(request, socket, head, (ws) => {
            hocuspocus.handleConnection(ws, request);
          });
        }
      });
    }
  };
}
```

This is the proven pattern: Vite's `configureServer` hook provides access to the underlying Node.js HTTP server, which can be upgraded to WebSocket. Hocuspocus runs in-process with the dev server.

### Finding: Hocuspocus in Next.js requires a custom server or separate process
**Confidence:** CONFIRMED
**Evidence:** github.com/CafeinoDev/next-hocuspocus-server, Hocuspocus docs

Next.js App Router does NOT support WebSocket upgrades natively. Options:
1. **Custom server** (`server.ts`): Creates a custom Node.js server that handles both Next.js and WebSocket. This disables some Next.js optimizations (Vercel Edge deployment, automatic static optimization).
2. **Separate process**: Run Hocuspocus on a different port/process. Standard for production but adds complexity in development.

The CafeinoDev example demonstrates option 1, but it's a workaround, not a first-class integration.

### Finding: TipTap in Next.js requires `immediatelyRender: false` and 'use client'
**Confidence:** CONFIRMED
**Evidence:** TipTap docs, GitHub issue #5856

TipTap is client-only. In Next.js App Router:
- Must use `'use client'` directive on editor component
- Must set `immediatelyRender: false` in `useEditor()` to prevent SSR hydration mismatch
- Cannot use `EditorProvider` and `useEditor` together (common mistake)

This is a solved problem but adds friction. Every component touching TipTap must be a client component.

### Finding: TipTap in Vite is standard, no gotchas
**Confidence:** CONFIRMED
**Evidence:** TipTap docs — Vite is listed as a supported framework with no special configuration needed

No SSR/RSC concerns. No hydration issues. Standard React component rendering. TipTap's React bindings work out of the box.

### Finding: Fumadocs React Router adapter exists but is "Next.js first"
**Confidence:** CONFIRMED
**Evidence:** Fumadocs v15.2 release notes, v16 blog post

Fumadocs v15.2 added Vite support. v16 improved Vite framework compatibility. However, the documentation explicitly states "Fumadocs continues to be Next.js first." The React Router adapter provides:
- DocsLayout, DocsPage layouts adapted for React Router
- `serializePageTree()` for non-RSC environments
- Provider components (search, tree, i18n contexts)

Production builds with React Router take ~4 seconds. The support works but is secondary to Next.js.

### Finding: SSR is unnecessary for our editor product; it becomes relevant only for publishing
**Confidence:** INFERRED

The editor is a client-side application. Key interactions:
- TipTap editor: fully client-side
- Y.js CRDT sync: WebSocket, client-side
- File browser/sidebar: could be SSR but not required
- Search: client-side (Orama runs in browser or server)
- Preview pane: could use mdx-remote server-side compilation but renders client-side

SSR becomes relevant only for S-L2 publishing (SEO, performance for public docs). At P0 we're building the editor. SSR can be added later via:
- Static site generation from markdown files (any framework)
- Next.js/Fumadocs for the published site (separate deployment)

### Finding: Vite HMR is faster for client-heavy editor development
**Confidence:** INFERRED

Vite's ESM-based HMR updates individual modules without rebundling. For a TipTap-heavy editor with many client components, this provides faster iteration than Next.js's webpack/turbopack HMR which must handle RSC boundaries.

### Finding: The S-L2 publishing bridge from Vite would be a separate build step
**Confidence:** INFERRED

If the editor runs on Vite and publishing uses Fumadocs:
1. Editor (Vite): writes/saves markdown files to git
2. Publishing (separate): Fumadocs (Next.js) reads those same markdown files and renders a static docs site
3. Bridge: git is the bridge. Same files, different rendering pipelines.

This is architecturally clean — the editor and publisher share content (markdown files) but not runtime. Fumadocs is used only for the publishing layer, not embedded in the editor.

---

## Gaps / follow-ups

- Deployment topology for Vite + Hocuspocus production setup not researched
- Vercel deployment constraints for WebSocket servers not investigated
- Bundle size comparison Next.js vs Vite for TipTap applications not measured
