# Evidence: OSS Status & Licensing

**Dimension:** OSS Status & Licensing
**Date:** 2026-04-02
**Sources:** github.com/fuma-nama/fumadocs, github.com/mintlify, openalternative.co

---

## Key files / pages referenced

- https://github.com/fuma-nama/fumadocs — Fumadocs repository
- https://github.com/mintlify — Mintlify GitHub org
- https://openalternative.co/fumadocs — OSS alternative listing
- https://www.mintlify.com/oss-program — Mintlify OSS program

---

## Findings

### Finding: Fumadocs is fully open source under MIT license with strong community metrics
**Confidence:** CONFIRMED
**Evidence:** https://github.com/fuma-nama/fumadocs

- License: MIT
- Stars: 11.4k
- Forks: 642
- Watchers: 15
- Total releases: 1,657 (latest: fumadocs-twoslash@3.1.15, April 2026)
- Open PRs: 2, Closed PRs: 1,415
- Language: TypeScript 79%, MDX 17.4%, CSS 2.4%
- Primary maintainer: fuma-nama (single primary contributor)
- Build: pnpm workspace, Turborepo, Changesets
- Node.js requirement: >= 18.17.0 (scaffolding requires Node 22+)

**Implications:** Truly open source with permissive license. High star count and release velocity indicate healthy project. Single-maintainer risk is notable.

### Finding: Mintlify is a proprietary platform with select open-source components
**Confidence:** CONFIRMED
**Evidence:** https://github.com/mintlify, https://www.mintlify.com/oss-program

- Platform: Proprietary, closed source
- Open-source components: @mintlify/mdx (MIT), docs repo (MIT), starter template (MIT), components repo (MIT), install-md (Apache 2.0)
- GitHub org: 25 repositories total
- Core platform (build, deploy, editor, AI): closed source
- OSS program: 90% discount for recognized OSS projects (MIT, Apache 2.0, GPL, etc.)
- Pricing: Free tier (Hobby), $300/month (Pro), Custom

**Implications:** You can use Mintlify's open components (MDX parser, starter template) but the core value (visual editor, MCP generation, AI assistant, agent analytics, hosting) is proprietary. You're buying a service, not adopting a framework.

---

## Gaps / follow-ups

- Fumadocs' bus factor (single primary maintainer) is a risk to assess
- Mintlify's revenue/funding status to assess platform longevity is not covered
