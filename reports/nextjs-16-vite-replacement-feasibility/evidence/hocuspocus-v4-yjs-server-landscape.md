# Evidence: Hocuspocus v4 & Yjs Server Landscape

**Dimension:** Follow-up F2 — Hocuspocus v3/v4 architecture and alternatives
**Date:** 2026-04-08
**Sources:** Hocuspocus GitHub, TipTap blog, npm registry, y-sweet, PartyKit, Liveblocks

---

## Key sources referenced

- https://github.com/ueberdosis/hocuspocus/blob/main/CHANGELOG.md — Hocuspocus changelog
- https://tiptap.dev/blog/release-notes/our-roadmap-for-2026 — TipTap 2026 roadmap
- https://tiptap.dev/open-source-to-platform — OSS vs Cloud strategy
- https://crossws.h3.dev/ — crossws (multi-runtime WebSocket)
- https://jamsocket.com/y-sweet — y-sweet (Rust Yjs server)
- https://github.com/cloudflare/partykit — PartyKit (Cloudflare)
- https://liveblocks.io/blog/open-sourcing-the-liveblocks-sync-engine-and-dev-server — Liveblocks OSS

---

## Findings

### Finding: Hocuspocus v4 is in active RC phase — migrates from `ws` to crossws for multi-runtime support
**Confidence:** CONFIRMED
**Evidence:** npm registry shows v4.0.0-rc.0 (Mar 16, 2026), rc.1 (Mar 30), rc.2 (Apr 8 — today). The project (`packages/server/package.json`) already consumes v4.0.0-rc.1. The single biggest change: migration from Node.js `ws` to [crossws](https://crossws.h3.dev/), enabling Bun, Deno, Cloudflare Workers, and uWebSockets runtimes — not just Node.js.

Other v4 changes: `sqlite3` → `better-sqlite3`, generic Context TypeScript support, memory optimization (Uint8Arrays created once, not per connection), session awareness feature.

**Implications:** v4 makes Hocuspocus more framework-agnostic at the runtime level. The crossws migration is the most relevant development for this project's deployment flexibility. It does NOT add HTTP-based transport — still WebSocket-only.

### Finding: Hocuspocus remains WebSocket-only — no HTTP/long-polling fallback
**Confidence:** CONFIRMED
**Evidence:** Neither v3 nor v4 provides HTTP-based transport. No long-polling fallback. This means serverless deployments on platforms without persistent WebSocket support (plain Vercel serverless functions) are still not supported.

**Implications:** This doesn't change the Next.js integration story — you still need a persistent WebSocket server process regardless of framework. The crossws migration helps with which runtimes can host that process, not whether you can avoid having one.

### Finding: TipTap's 2026 strategy is cloud-first — Hocuspocus is maintained but not the innovation surface
**Confidence:** CONFIRMED
**Evidence:** [2026 roadmap](https://tiptap.dev/blog/release-notes/our-roadmap-for-2026) names three bets: AI in Documents, Document Conversion, and Flex (AI-native editor) — all cloud-oriented. Hocuspocus not mentioned by name. However: MIT license explicitly preserved, v4 RCs published weekly, Q1 2026 hackathon confirms active internal investment.

**Implications:** Hocuspocus is a safe dependency. The MIT license protects the project. Active development continues. The risk is that advanced features (AI toolkit, version history, comments) will only be available via TipTap Cloud, not the OSS layer.

### Finding: y-sweet (Rust, Jamsocket) is the strongest Hocuspocus alternative for scale
**Confidence:** CONFIRMED
**Evidence:** y-sweet is a Rust-based Yjs server with S3-native storage. Key trade-offs vs Hocuspocus:

| Dimension | y-sweet | Hocuspocus |
|-----------|---------|------------|
| Language | Rust | TypeScript |
| Storage | S3-native (object storage) | Extension-based (SQLite, Redis) |
| License | **GPL v3** (copyleft) | MIT |
| GitHub stars | ~986 | ~2,213 |
| Hooks/middleware | Minimal | Rich (onConnect, onAuthenticate, etc.) |
| Scaling insight | Cost-efficient at scale (S3 = pay for access) | Single-process + Redis |

**Implications:** y-sweet's GPL license makes it incompatible with MIT-licensed open-knowledge without careful isolation. Hocuspocus's rich hook system is more aligned with the current agent session architecture.

### Finding: PartyKit (now Cloudflare) is the best option for edge-deployed collaboration
**Confidence:** CONFIRMED
**Evidence:** Acquired by Cloudflare April 2024. Built on Workers + Durable Objects. First-class Yjs via `y-partykit`. No extra charges beyond Workers pricing.

**Implications:** If the project ever moves to a cloud-hosted model, PartyKit/Cloudflare is compelling. Not relevant for the current CLI-distributed local-first architecture.

### Finding: Liveblocks open-sourced their sync engine (Feb 2026) but self-hosting is not production-ready
**Confidence:** CONFIRMED  
**Evidence:** `@liveblocks/server` released under AGPL v3 in February 2026. Currently for local dev/testing only — production self-hosting not yet supported.

**Implications:** Not a near-term option for this project.

---

## Gaps / follow-ups

* Whether crossws in Hocuspocus v4 changes the custom server WebSocket wiring pattern — specifically whether `handleConnection()` API changes
* Whether the v4 RC is stable enough for production use (currently consumed in this project as rc.1)
