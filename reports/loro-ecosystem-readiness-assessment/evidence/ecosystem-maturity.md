# Evidence: Ecosystem Maturity Signals

**Dimension:** D7 — Downloads, stars, contributors, production users, release cadence
**Date:** 2026-04-07
**Sources:** npm, GitHub, npmtrends.com, Yjs community

---

## Key files / pages referenced

- https://npmtrends.com/automerge-vs-yjs-vs-loro-crdt — Download comparison
- https://github.com/loro-dev/loro — Core repo (5.5k stars)
- https://github.com/loro-dev/loro/releases — Release history
- https://github.com/SchoolAI/loro-extended — SchoolAI production user

---

## Findings

### Finding: npm downloads — Loro is 172x smaller than Yjs, 2.4x larger than Automerge
**Confidence:** CONFIRMED
**Evidence:** npmtrends.com (accessed April 2026)

| Package | Weekly Downloads |
|---------|-----------------|
| yjs | 3,200,289 |
| loro-crdt | 18,627 |
| automerge | 7,777 |

Loro has ~18.6k weekly downloads vs Yjs's ~3.2M. However, Loro has more than 2x Automerge's downloads, suggesting faster adoption trajectory than Automerge despite being newer.

### Finding: GitHub stars — Loro is comparable to Automerge, 1/3 of Yjs
**Confidence:** CONFIRMED
**Evidence:** GitHub repositories

| Library | Stars | Forks |
|---------|-------|-------|
| Yjs | ~18k | ~1.5k |
| Loro | ~5.5k | ~138 |
| Automerge | ~5k | ~200 |

Loro has slightly more stars than Automerge despite being significantly newer, indicating strong developer interest.

### Finding: Contributor count is very small — core team of 2-3
**Confidence:** INFERRED
**Evidence:** GitHub contributors page (loading issues), Swift bindings listing, release authorship

The Loro core team appears to be led by Zixuan Chen (zxch3n) with 2-4 additional contributors. This is a small team compared to:
- Yjs: Kevin Jahns + ~10-15 regular contributors
- Automerge: Martin Kleppmann + Ink & Switch team (~5-10 active)

Bus factor is a significant concern.

### Finding: Known production user — SchoolAI (loro-extended)
**Confidence:** CONFIRMED
**Evidence:** GitHub SchoolAI/loro-extended, npm packages

SchoolAI has built `loro-extended` — a comprehensive toolkit on top of Loro with:
- Schema-driven development
- Multiple network adapters (SSE, WebSocket, WebRTC, HTTP polling)
- Multiple persistence adapters (IndexedDB, LevelDB, PostgreSQL)
- React hooks
- 676 commits in the monorepo

SchoolAI appears to be using Loro in production for multi-agent AI systems and collaborative apps. This is the only publicly identifiable production user.

One other testimonial exists: a company using Loro "as the document representation for web-based computational notebook software" (name not identified).

### Finding: Release cadence is rapid — every 2-3 weeks
**Confidence:** CONFIRMED
**Evidence:** GitHub releases page

From Jan-Mar 2026: v1.10.4 → v1.10.8 (5 releases in ~10 weeks)
Post-1.0 releases have been non-breaking (patch/minor), focused on performance and new features.

Major version history:
- v1.0.0 (Oct 2024) — stable encoding format, WASM-first
- v1.1.0 (Nov 2024) — fork API
- v1.3.0 (Jan 2025) — UndoManager improvements
- v1.5.0 (Apr 2025) — EphemeralStore
- v1.6.0 (Aug 2025) — 2x snapshot performance
- v1.8.0 (Sept 2025) — synchronous events
- v1.10.8 (Mar 2026) — latest

### Finding: Issue response time appears fast but sample is limited
**Confidence:** INFERRED
**Evidence:** Community reports, GitHub activity

Users describe the Loro team as "extremely helpful and responsive." The loro-prosemirror repo shows recent issues getting responses within days. However, the small team size means this responsiveness may not scale.

### Finding: No formal stability guarantees beyond encoding format
**Confidence:** CONFIRMED
**Evidence:** loro.dev docs, HN discussion, Velt blog

The Velt CRDT comparison blog states: "Loro's API and encoding schema remain experimental. The library advises against production use."

However, this may be outdated — the Loro 1.0 release (Oct 2024) committed to stable encoding. The API has been relatively stable post-1.0 with only additive changes.

**Implications:** There is tension between the library's actual stability (encoding format locked, API stable for 18 months) and the perception/messaging around production readiness. The core CRDT engine appears production-quality; the ecosystem (bindings, servers, tooling) is what's immature.

---

## Gaps / follow-ups

- No case studies or postmortems from production deployments
- Community size (Discord/forum) not measured
- Documentation quality relative to Yjs/Automerge not formally assessed
