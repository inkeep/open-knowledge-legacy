# Evidence: Production Stability and Adoption (D7)

**Dimension:** Bun's production readiness, adoption, known instability areas vs Node.js LTS
**Date:** 2026-04-03
**Sources:** Production reports, GitHub data, industry analysis

---

## Key files / pages referenced

- [Anthropic acquires Bun](https://www.anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone) -- Acquisition announcement
- [Bun joins Anthropic](https://bun.com/blog/bun-joins-anthropic) -- Bun's perspective
- [Bun quality concerns issue #27664](https://github.com/oven-sh/bun/issues/27664) -- Community quality discussion
- [Bun production assessment 2026](https://dev.to/last9/is-bun-production-ready-in-2026-a-practical-assessment-181h) -- Production readiness
- [3 months production report](https://dev.to/synsun/bun-vs-nodejs-in-production-what-three-months-of-real-traffic-taught-me-3d96) -- Real traffic experience

---

## Findings

### Finding: Anthropic acquired Bun in December 2025; Claude Code ships as Bun executable
**Confidence:** CONFIRMED
**Evidence:** [Anthropic announcement](https://www.anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone)

Anthropic's first acquisition. Claude Code (which reached $1B ARR) ships as a Bun executable to millions of users. Bun remains open-source and MIT-licensed. Enterprise users include Netflix, Spotify, KPMG, L'Oreal, Salesforce (via Claude Code).

**Implications:** Bun has strong financial backing and a high-profile production deployment. Abandonment risk is minimal. However, Anthropic's primary use case (CLI tool) differs from a server with WebSocket connections and file watching.

### Finding: Bun has ~4.8k open issues as of March 2026
**Confidence:** CONFIRMED
**Evidence:** [GitHub Issue #27664](https://github.com/oven-sh/bun/issues/27664)

Community concern about open issue count despite automated duplicate closure. Counterarguments: TypeScript has similar issue counts, high volume reflects popularity not instability.

Known quality concerns:
- Segmentation faults across Windows, macOS, Linux
- AI-generated PRs merged without adequate review
- Feature bloat (Markdown support, etc.) vs core stability focus
- Source maps served in production despite docs saying otherwise (issue #28001)

**Implications:** The open issue count is not disqualifying but indicates ongoing edge-case instability. Node.js LTS has decades of battle-testing and a more conservative release process.

### Finding: Known instability areas in Bun as of 2026
**Confidence:** CONFIRMED
**Evidence:** Multiple sources

Documented instability:
1. **AVX CPU requirement**: Bun crashes with SIGILL on non-AVX CPUs (relevant for some VPS/CI environments)
2. **Windows**: File reading crashes in v1.3.5 (fixed in v1.3.6)
3. **Source maps in production**: Served when they shouldn't be
4. **node:vm**: Partial and fragile implementation
5. **node:cluster**: Edge cases in advanced coordination
6. **APM integration**: Datadog dd-trace had incomplete Bun support (2 weeks blind observability)
7. **Async stack traces**: Significantly worse than Node.js/V8

For our use case relevance:
- AVX: Likely fine on modern developer machines, but could affect CI
- Windows: Our users may be on Windows
- Source maps: Security concern for production deployments
- node:vm: Not used in our stack
- APM: Not relevant for local-first tool
- Async traces: Relevant for debugging

**Implications:** Most instability areas don't affect our specific use case (local-first tool on modern hardware). The async trace quality and Windows stability are the most relevant concerns.

### Finding: Node.js LTS has a proven stability track record
**Confidence:** CONFIRMED
**Evidence:** Industry consensus

Node.js 22 LTS:
- 30-month support lifecycle
- Rigorous release process with RCs
- Decades of production deployment at scale
- Battle-tested WebSocket (ws), file system, and child_process implementations
- Comprehensive APM/observability ecosystem
- Well-understood memory characteristics

**Implications:** Node.js is the safe choice for stability. The question is whether Bun's advantages justify the risk trade-off.

### Finding: Production experience reports are cautiously positive about Bun
**Confidence:** CONFIRMED
**Evidence:** [3 months production report](https://dev.to/synsun/bun-vs-nodejs-in-production-what-three-months-of-real-traffic-taught-me-3d96)

Key production findings:
- 69% cold start reduction (940ms -> 290ms)
- 43% throughput improvement (14,120 vs 9,840 req/sec)
- P99 latency: 48ms -> 31ms (synthetic), 67ms -> 44ms (production)
- Memory: lower at idle, within 15% under sustained load
- Issues: Datadog integration gaps, test mocking inconsistencies, sharp native addon shims needed

Recommendation: "Small team, TypeScript HTTP API, no heavy native addon dependencies -- migrate."

**Implications:** This profile matches our use case: TypeScript server, small team, minimal native addons. The positive production experience is directly relevant.

---

## Gaps / follow-ups

* No production reports specifically for Bun + Hocuspocus + file watching workloads
* Bun stability on Windows for long-running server processes not well-documented
* Long-running process memory stability (memory leaks over hours/days) not benchmarked
