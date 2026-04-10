# Evidence: Migration Effort Estimate

**Dimension:** D9 — Prototype feasibility, gaps, timeline estimate
**Date:** 2026-04-07
**Sources:** Synthesis of all other dimensions

---

## Findings

### Finding: A working prototype on Loro is feasible today
**Confidence:** CONFIRMED
**Evidence:** Existence of loro-prosemirror, loro-codemirror, Loro Protocol, SchoolAI's production use

The minimum viable prototype requires:
1. ProseMirror editor with loro-prosemirror (v0.4.3 exists)
2. CodeMirror editor with loro-codemirror (v0.3.3 exists)
3. WebSocket sync using Loro Protocol SimpleServer
4. Fork/merge using Loro's native API

All four pieces exist. SchoolAI has built a significantly more complex system on top of Loro (loro-extended), validating that the core API is sufficient for real applications.

### Finding: What's missing for production
**Confidence:** CONFIRMED
**Evidence:** Synthesis across all evidence files

Critical gaps:
1. **Production sync server**: SimpleServer is testing-grade. Need to build: document lifecycle management, horizontal scaling, authentication, rate limiting, metrics. Effort: 4-8 weeks.
2. **Persistence layer**: No built-in persistence (Hocuspocus has onStoreDocument hooks and extensions). Need: database integration for document snapshots, update history, branch metadata. Effort: 2-4 weeks.
3. **loro-prosemirror stability**: Pre-1.0, content wipe bug (#77), single maintainer. Risk: bugs discovered under load, breaking API changes. Mitigation: vendor/fork the binding.
4. **TipTap integration**: No TipTap extension exists. If using TipTap: need custom extension wrapping loro-prosemirror. Effort: 1-2 weeks.
5. **Branch merge UI**: Loro handles the CRDT merge automatically, but the application needs conflict detection (both branches edited same paragraph), diff visualization, and merge approval workflow. Effort: 4-8 weeks.
6. **Server-side write pipeline**: Need DirectConnection-equivalent for AI agent writes, content transformations, migration scripts. Effort: 1-2 weeks.

### Finding: Build vs buy comparison
**Confidence:** INFERRED
**Evidence:** Ecosystem analysis

With Yjs + Hocuspocus + TipTap:
- Editor: TipTap Collaboration extension (batteries included)
- Sync server: Hocuspocus (production-ready, extension system)
- Persistence: Hocuspocus extensions (Prisma, S3, Redis)
- Client sync: y-websocket (production-ready)
- Server writes: DirectConnection (built-in)
- Total custom code: ~2-4 weeks to integrate
- Missing: branching (must use git workaround)

With Loro:
- Editor: loro-prosemirror (pre-1.0, manual integration)
- Sync server: SimpleServer (testing-grade, must extend)
- Persistence: DIY (can reference loro-extended patterns)
- Client sync: Loro Protocol (functional, not battle-tested)
- Server writes: DIY (LoroDoc in Node.js)
- Total custom code: ~12-20 weeks to reach production
- Gained: native branching, Peritext semantics, Fugue merge

### Finding: loro-extended could accelerate but introduces dependency risk
**Confidence:** INFERRED
**Evidence:** SchoolAI/loro-extended analysis

Using loro-extended could reduce the sync/persistence/lifecycle gap by 4-8 weeks. But it introduces:
- Dependency on SchoolAI (not Loro core team)
- Unknown production track record
- Schema-driven approach may conflict with custom requirements

### Finding: Ecosystem maturity timeline estimate — 12-18 months to production-grade
**Confidence:** INFERRED
**Evidence:** Release cadence, trajectory analysis

Based on current development velocity:
- loro-prosemirror 1.0: likely 6-12 months (at current pace, stabilizing through v0.5, v0.6, etc.)
- Production sync server: community or Loro team would need to build — no clear timeline
- Managed service: no indication this is planned

Practical recommendation for a team evaluating today: use Yjs + Hocuspocus for production, build the branching layer on top using Hocuspocus document naming (per prior report recommendation), and plan a migration to Loro when their ecosystem matures in 12-18 months.

---

## Gaps / follow-ups

- SchoolAI engagement — could they share production experience?
- Loro team roadmap — is a production sync server planned?
- Cost of maintaining a forked loro-prosemirror vs tracking upstream
