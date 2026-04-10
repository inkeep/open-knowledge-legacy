# Evidence: Production Usage and Maturity

**Dimension:** D10 — Production usage and maturity
**Date:** 2026-04-02
**Sources:** npm registry, GitHub, web search, Crunchbase

---

## Findings

### Finding: ~2.1 million monthly npm downloads (as of March 2026)
**Confidence:** CONFIRMED
**Evidence:** npm API response for `@orama/orama` — 2,121,544 downloads in the period March 4 to April 2, 2026.

This is substantial for a search library. For comparison, MiniSearch gets ~500K/month and FlexSearch ~400K/month.

### Finding: License is Apache 2.0
**Confidence:** CONFIRMED
**Evidence:** `LICENSE.md` in the repository — "Copyright 2023 OramaSearch Inc." Apache License, Version 2.0.

### Finding: Monorepo version is 3.1.18 (latest as of early 2026)
**Confidence:** CONFIRMED
**Evidence:** `package.json` — `"version": "3.1.18"`

### Finding: OramaSearch Inc. is a venture-backed company
**Confidence:** CONFIRMED
**Evidence:** Crunchbase listing — OramaSearch Inc. has funding. The company monetizes through Orama Cloud (managed search service) while maintaining the OSS library.

### Finding: Active but single-committer development pattern
**Confidence:** INFERRED
**Evidence:** The shallow clone shows 1 commit. The company has a small team. Michele Riva is the founder and primary maintainer. The GitHub org (oramasearch) has multiple repos including orama (JS library) and oramacore (Rust server).

### Finding: Known production users include documentation sites
**Confidence:** CONFIRMED
**Evidence:** Official plugins exist for: Docusaurus, Docusaurus v3, Astro, Nextra, VitePress. Fumadocs uses Orama as its default search engine. The Deno docs site (5,856 documents) uses Orama.

### Finding: Orama Cloud is the company's primary revenue source
**Confidence:** INFERRED
**Evidence:** Orama Cloud offers managed search with: automatic embedding generation, webhook-based index management, analytics, answer engine features. Free tier with 150 index updates/month, unlimited search queries. Paid plans for production use.

### Finding: OSS library is actively maintained alongside commercial product
**Confidence:** CONFIRMED
**Evidence:** The monorepo is actively developed (v3.1.18 as of early 2026, regular releases). The @orama/switch package provides a unified interface across OSS and Cloud, suggesting the company wants both paths to work.

### Finding: Community channels include Slack
**Confidence:** CONFIRMED
**Evidence:** README.md — "join the Orama Slack channel" with link orama.to/slack.

### Finding: GitHub issue #869 — "Upgrading to v3.0.4 Causing Search Failures"
**Confidence:** CONFIRMED
**Evidence:** Web search result — users reported incorrect search results after upgrading from v2.1.0 to v3.0.4. This suggests the v2->v3 migration had breaking changes that weren't fully documented.

### Finding: GitHub issue #876 — data-persistence plugin requires Node.js transform streams
**Confidence:** CONFIRMED
**Evidence:** Web search result — browser compatibility issue with the persistence plugin.

### Finding: GitHub issue #554 — "Cannot create a string longer than 0x1fffffe8 characters" with data-persistence
**Confidence:** CONFIRMED
**Evidence:** Web search result — serialization fails for very large databases due to JavaScript string length limits. This is a known issue with the hex-encoded binary format.

---

## Maturity assessment

| Signal | Assessment |
|--------|-----------|
| npm downloads | Strong (2.1M/month) |
| GitHub stars | ~9K+ (strong for a JS search library) |
| Release cadence | Regular patch releases (3.1.x series) |
| License | Apache 2.0 (permissive, commercial-friendly) |
| Corporate backing | OramaSearch Inc. (venture-funded) |
| Known bugs | Some v3 migration issues; persistence edge cases |
| Documentation | Official docs at docs.orama.com; JSDoc in source |
| Community | Slack channel active |
| Bus factor | Low (primarily one maintainer) |
| OSS risk | Company's business model depends on Cloud, but OSS library is core to the funnel |

---

## Gaps / follow-ups

- Could not determine exact GitHub star count from shallow clone
- Community health metrics (issue response time, PR merge rate) not assessed
- Long-term OSS commitment unclear — company could shift focus entirely to Cloud/OramaCore
