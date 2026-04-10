# Evidence: WebSocket Integration Architecture

**Dimension:** D1 — WebSocket integration architecture
**Date:** 2026-04-08
**Sources:** Next.js docs, GitHub discussions, next-ws repo, community examples

---

## Key sources referenced

- https://github.com/vercel/next.js/discussions/58698 — Feature request for native WebSocket support in route handlers
- https://github.com/apteryxxyz/next-ws — Community WebSocket patch for Next.js (316 stars)
- https://github.com/CafeinoDev/next-hocuspocus-server — Proof-of-concept Next.js + Hocuspocus (0 stars)
- https://nextjs.org/docs/pages/guides/custom-server — Custom server documentation
- https://fly.io/javascript-journal/websockets-with-nextjs/ — WebSocket patterns on Fly.io

---

## Findings

### Finding: Next.js has no native WebSocket support in route handlers
**Confidence:** CONFIRMED
**Evidence:** GitHub Discussion #58698 — "Enable Next.js route handlers to handle WebSocket and other Upgrade requests" — open since 2024, 33 upvotes, no official Vercel/Next.js team response. A PR (#58704) was submitted proposing `NextRequest#upgrade()` but has not been merged.

**Implications:** Any WebSocket integration requires either a custom server, a third-party patch (next-ws), or a separate process.

### Finding: Custom server is the only first-party approach for WebSocket upgrades
**Confidence:** CONFIRMED
**Evidence:** Next.js custom server docs describe intercepting the HTTP server's `upgrade` event. The CafeinoDev/next-hocuspocus-server repo demonstrates this pattern with Hocuspocus.

```javascript
// server.js pattern
const server = createServer(handler);
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/collab')) {
    hocuspocus.handleUpgrade(req, socket, head);
  }
});
```

**Implications:** This mirrors the current Vite plugin approach but with documented trade-offs.

### Finding: Custom server disables Automatic Static Optimization and standalone output tracing
**Confidence:** CONFIRMED
**Evidence:** Next.js docs: "A custom server will remove important performance optimizations, like Automatic Static Optimization." Additionally: "When using standalone output mode, it does not trace custom server files."

**Implications:** The standalone deployment story (important for CLI distribution) is degraded. Static optimization loss is less relevant since the app is 100% client-rendered.

### Finding: next-ws patches Next.js internals and is not suitable for critical infrastructure
**Confidence:** CONFIRMED
**Evidence:** next-ws README: "The library operates by patching your local Next.js installation via a CLI command." 316 stars, 210 dependents. Explicitly states "not suitable for serverless platforms." Requires re-patching on every Next.js update.

**Implications:** Adding a dependency that patches framework internals introduces maintenance risk for each Next.js upgrade. Not appropriate for an OSS CLI tool where users do `npx`.

### Finding: Separate process architecture works but loses the single-port DX
**Confidence:** CONFIRMED
**Evidence:** Multiple community guides (Fly.io, Dev.to) describe running WebSocket servers on separate ports with CORS headers and proxy configurations. This is the most common production pattern for Next.js + WebSockets on Vercel.

**Implications:** Requires configuring CORS, running two processes, and managing two ports in the CLI. The current Vite setup serves everything on port 5173 — splitting this degrades the `npx open-knowledge` single-command experience.

### Finding: Turbopack dev server reserves WebSocket for HMR
**Confidence:** INFERRED
**Evidence:** Next.js 12+ uses WebSocket for HMR. Dev server manages its own WebSocket connection. Custom server upgrade handling must be careful not to conflict with Turbopack's HMR WebSocket.

**Implications:** Additional complexity in dev mode to route WebSocket upgrades correctly between HMR and Hocuspocus.

---

### Finding: Turbopack + custom servers is not officially supported
**Confidence:** CONFIRMED
**Evidence:** GitHub Discussion #49325 ("Can we use Turbopack with a custom server?") — open with no official response. Custom servers call `next({ dev: true })` programmatically, which may bypass Turbopack's dev optimizations. Next.js 16 makes Turbopack the default, meaning custom server users may need `next dev --webpack` to fall back.

**Implications:** The custom server approach may not benefit from Turbopack's HMR performance in dev mode — a key selling point of Next.js 16.

### Finding: The only real-world Next.js + Hocuspocus examples use separate process architecture
**Confidence:** CONFIRMED
**Evidence:** BlockNote + Hocuspocus + Next.js demo (TypeCellOS/BlockNote-demo-nextjs-hocuspocus) uses separate `hocuspocus-server/` and `next-app/` directories with independent processes. The CafeinoDev/next-hocuspocus-server (0 stars) uses a custom server. No production-grade single-process integration examples found.

**Implications:** The community has settled on separate processes as the pragmatic approach, accepting the DX trade-off.

---

## Negative searches

* Searched for "Next.js 16 native WebSocket" → No results showing built-in support
* Searched for "Hocuspocus Next.js production" → Only the CafeinoDev proof-of-concept (0 stars)

---

## Gaps / follow-ups

* next-ws version compatibility with Next.js 16 specifically — not confirmed
* Whether Turbopack's dev server exposes upgrade event hooks the way Vite does
