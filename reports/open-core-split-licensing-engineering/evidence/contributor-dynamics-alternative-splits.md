# Evidence: Contributor Dynamics & Alternative Split Patterns

**Dimension:** Contributor Dynamics + Alternative Splits
**Date:** 2026-04-11
**Sources:** Company CONTRIBUTING.md files, CLA configurations, blog posts, GitHub repos

---

## Key sources
- [GitLab single codebase blog](https://about.gitlab.com/blog/contributor-after-single-code-base/)
- [Grafana CLA docs](https://grafana.com/docs/grafana/latest/developers/cla/)
- [Cal.com CONTRIBUTING.md](https://github.com/calcom/cal.com/blob/main/CONTRIBUTING.md)
- [Cal.com license key docs](https://cal.com/docs/self-hosting/license-key)
- [Formbricks license docs](https://formbricks.com/docs/self-hosting/advanced/license)
- [Tldraw license docs](https://tldraw.dev/community/license)
- [Liveblocks open-sourcing blog](https://liveblocks.io/blog/open-sourcing-the-liveblocks-sync-engine-and-dev-server)
- [Firecrawl docs](https://docs.firecrawl.dev/contributing/open-source-or-cloud)
- [Dify LICENSE](https://github.com/langgenius/dify/blob/main/LICENSE)

---

## Contributor Dynamics Findings

### Finding: CODEOWNERS + social convention (not CI) enforces ee/ boundary
**Confidence:** CONFIRMED
**Evidence:** GitLab blog, Cal.com contributing guide

GitLab: "As long as community contributors do not change anything in the ee/ directory, their workflow is unchanged." No CI linting rule blocks community commits touching ee/. Enforcement via CODEOWNERS approval gating.

### Finding: Feature gating universally uses environment-variable license keys
**Confidence:** CONFIRMED
**Evidence:** Cal.com, Formbricks, Infisical docs

Pattern: (1) env var (CALCOM_LICENSE_KEY, ENTERPRISE_LICENSE_KEY), (2) server validates against remote API at startup, (3) EE features disabled (not removed) without key. Code ships in every deployment but is inert without the key.

### Finding: Grafana requires CLA; most AGPL-first companies don't
**Confidence:** CONFIRMED (Grafana), INFERRED (Cal.com, Infisical)
**Evidence:** Grafana CLA docs, Cal.com CONTRIBUTING.md

Grafana uses Apache Foundation CLA template via CLA assistant bot. Cal.com and Infisical CONTRIBUTING.md files don't mention CLAs. AGPLv3 base may reduce CLA need since copyleft already governs downstream use.

### Finding: Internal vs external contributors differ by access scope, not process
**Confidence:** INFERRED
**Evidence:** GitLab blog, Cal.com contributor guide

Same Git flow; different access. External contributors fork + PR, are told not to touch ee/. Internal employees have direct push access to all directories. ee/ changes always reviewed by internal maintainers.

---

## Alternative Split Patterns

### Finding: Tldraw enforces licensing via client-side license key with watermark fallback
**Confidence:** CONFIRMED
**Evidence:** Tldraw license docs, SDK 4.0 announcement

`licenseKey` prop on `<Tldraw>` component. Keys validated client-side, work offline. Without key: SDK doesn't work in production. Trial keys ping analytics. Hobby licenses show "made with tldraw" watermark. Commercial: $6K/year. Runtime enforcement, no ee/ split.

### Finding: Liveblocks splits by package + license tier (cleanest per-package model)
**Confidence:** CONFIRMED
**Evidence:** Liveblocks blog, GitHub repo

Client packages (`@liveblocks/client`, `@liveblocks/react`) = Apache 2.0. Server (`@liveblocks/server`) = AGPL. Cloud features (Comments, Notifications, AI) = proprietary cloud-only. Rationale: client code bundles into user apps where AGPL would create friction.

### Finding: AFFiNE splits along client/server boundary
**Confidence:** CONFIRMED
**Evidence:** AFFiNE GitHub discussions, backend LICENSE

Root LICENSE = MIT. `packages/backend/server/LICENSE` = proprietary EE. Frontend (editor, local-first) works fully offline under MIT. Backend (sync, collaboration) requires proprietary server. Natural for local-first apps.

### Finding: Firecrawl uses cloud-advantage model with no code split
**Confidence:** CONFIRMED
**Evidence:** Firecrawl docs, pricing page

Entire repo AGPL-3.0, no ee/. Self-hosted = "subset, not mirror" of cloud. Cloud-only: Agent mode, browser sandbox, proxy rotation, dashboard. Credit-based pricing. AGPL prevents competitors from offering self-hosted as service.

### Finding: Dify's modified Apache 2.0 is legally controversial
**Confidence:** CONFIRMED
**Evidence:** Dify LICENSE, GitHub discussions #10139, #17109

Apache 2.0 base + added restrictions: (1) no multi-tenant without authorization, (2) can't remove logos. Contradicts Apache 2.0 terms. Community flagged as misleading. Neither OSI-approved nor clearly source-available.

---

## Gaps / follow-ups
* How self-hosters actually bypass license key checks (technical ease) not investigated
* Whether shipped ee/ source creates a security risk (exposing enterprise logic) not covered
