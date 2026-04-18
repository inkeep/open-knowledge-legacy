---
dimension: GitHub Actions Storage Limits 2026
date: 2026-04-16
sources: docs.github.com, github.blog, github.com/actions/upload-artifact
---

# Evidence: GitHub Actions Storage Limits (2026)

**Dimension:** D2 — GitHub Actions Storage Limits (P0 Moderate)
**Date:** 2026-04-16

## Key sources referenced
- [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions) — plan quotas + overage rates
- [GitHub Actions reference limits](https://docs.github.com/en/actions/reference/limits) — hard limits
- [actions/upload-artifact README](https://github.com/actions/upload-artifact) — parameter surface
- [actions/upload-artifact releases](https://github.com/actions/upload-artifact/releases) — v4/v5/v6/v7 timeline
- [v3 deprecation notice (2024-04-16)](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/)
- [Artifacts v4 GA (2023-12-14)](https://github.blog/changelog/2023-12-14-github-actions-artifacts-v4-is-now-generally-available/)
- [Cache >10 GB (2025-11-20)](https://github.blog/changelog/2025-11-20-github-actions-cache-size-can-now-exceed-10-gb-per-repository/)
- [Non-zipped artifacts / v7 (2026-02-26)](https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/)
- [Pricing update (2025-12-16)](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)
- [Retention configuration docs](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization)
- [Community discussion #169789 — Artifact storage quota has been hit](https://github.com/orgs/community/discussions/169789)

> **Vendor-incentive bias flag:** GitHub sets plan quotas, overage rates, and recalculation cadence. Billing structure is self-interested; facts are verifiable via docs/changelog.

---

## Findings

### Finding: 500 artifacts-per-job hard cap
**Confidence:** CONFIRMED
**Evidence:** actions/upload-artifact README
> "Within an individual job, there is a limit of 500 artifacts that can be created for that job."

**Implications:** Per-test artifact fan-out must aggregate before upload.

### Finding: Plan-tiered free storage pooled across Artifacts + Packages
**Confidence:** CONFIRMED
**Evidence:** GitHub billing docs — "Free 500 MB; Pro 1 GB; Team 2 GB; Enterprise Cloud 50 GB. Storage amounts shown are shared with GitHub Packages."

**Implications:** Repos using Docker registry or npm packages share the quota — "2 GB" is NOT 2 GB of CI artifacts, it's 2 GB total.

### Finding: Public-repo free-minutes does NOT extend to storage
**Confidence:** INFERRED
**Evidence:** GitHub billing docs — free-minutes language for public repos does not mention storage; storage quotas apply per plan regardless of repo visibility

**Implications:** Widely misunderstood. Public OSS repos on Free plans still operate against the 500 MB pooled cap.

### Finding: Artifact/packages overage billed at $0.25/GB-month
**Confidence:** CONFIRMED
**Evidence:** GitHub billing docs; pricing page

**Implications:** 100 GB overage ≈ $25/month; 1 TB ≈ $250/month.

### Finding: Cache storage is separate pool at $0.07/GiB-month
**Confidence:** CONFIRMED
**Evidence:** 2025-11-20 changelog — "GitHub Actions cache size can now exceed 10 GB per repository" with "$0.07 per GiB, per month"

**Implications:** Cache is ~3.6× cheaper than artifacts per GB and uses a separate quota. Derivable build state (node_modules, build caches) should live in cache, not artifacts.

### Finding: Default retention 90 days; max 90 public, 400 private/org
**Confidence:** CONFIRMED
**Evidence:** GitHub retention-configuration docs + upload-artifact README
> "Artifacts are retained for 90 days by default." `retention-days` "must be between 1 and 90 inclusive." Admins can raise to 400 for private repos; public capped at 90.

**Implications:** Retention tuning compounds linearly with storage bill. 7d vs 90d ≈ 7.7% of the cost.

### Finding: `compression-level: 0..9` (default 6); v7 adds `archive: false`
**Confidence:** CONFIRMED
**Evidence:** upload-artifact README; 2026-02-26 changelog
> "0: No compression / 1: Best speed / 6: Default compression (same as GNU Gzip) / 9: Best compression." "Direct uploads enable single file uploads without zipping by setting `archive` to false."

**Implications:** For Playwright traces (already zipped) and videos (.webm, compressed), `compression-level: 0` saves upload time with negligible byte penalty. For HTML reports, level 9 shrinks text-heavy payloads meaningfully.

### Finding: v3 deprecated 2024-04-16; v4+ artifacts are immutable and job-scoped
**Confidence:** CONFIRMED
**Evidence:** 2024-04-16 changelog + upload-artifact MIGRATION.md
> "Artifacts v4 is not cross-compatible with previous versions" — v4 artifacts are immutable; v3 "merge on same name" pattern now requires `actions/upload-artifact/merge@v4`

**Implications:** Matrix jobs on v4+ MUST upload distinct names per shard or explicitly use the merge sub-action.

### Finding: Version timeline — v4 (Dec 2023), v5 (Oct 2024), v6 (Dec 2024), v7 (Feb 2026)
**Confidence:** CONFIRMED
**Evidence:** GitHub Releases for actions/upload-artifact
- v4.0.0 — 2023-12-14 GA
- v5.0.0 — 2024-10-24 (Node.js 20/24 bump)
- v6.0.0 — 2024-12-12 (Node.js 24 default; requires runner ≥2.327.1)
- v7.0.0 — 2026-02-26 (ESM + `archive: false`)

**Implications:** v5/v6 are runtime bumps (self-hosted runner upgrade may be required). v7 is the feature break (unzipped uploads).

### Finding: Hidden files excluded by default from v4.4+
**Confidence:** CONFIRMED
**Evidence:** upload-artifact README — "With v4.4 and later, hidden files are excluded by default"

**Implications:** `.last-run.json`, `.cache/`, `.env` files silently dropped unless `include-hidden-files: true`.

### Finding: December 2025 pricing announcement — compute down up to 39%; storage unchanged
**Confidence:** CONFIRMED
**Evidence:** 2025-12-16 changelog — "Reduce prices by up to 39%" on GitHub-hosted runners from 2026-01-01; self-hosted $0.002/min (later postponed). No storage price changes.

**Implications:** Compute got cheaper; storage pressure is unchanged. Retention and compression tuning remain the primary cost levers.

### Finding: GitHub Support cannot increase storage quota
**Confidence:** CONFIRMED
**Evidence:** GitHub Actions reference limits — "GitHub Support cannot increase storage limits for GitHub Actions"

**Implications:** Monitoring + automated cleanup is the only defense. Exhaustion triggers silent upload refusal.

### Finding: Usage recalculated every 6–12 hours; deletes do not instantly free quota
**Confidence:** CONFIRMED
**Evidence:** Community discussion #169789 — "GitHub recalculates usage only every 6-12 hours, and sometimes the recalculation can take longer"

**Implications:** Emergency cleanup must happen ≥12h before expected traffic. Preemptive pruning > reactive.

---

## Negative searches

- **Per-artifact byte cap**: Current `docs.github.com/en/actions/reference/limits` (April 2026) does NOT publish the v3-era 2 GB / 5 GB numbers. Treat community-cited "5 GB" as folklore until GitHub republishes.
- **Artifact-upload rate limit**: No dedicated limit documented beyond general REST API limits (1,000 req/hr/repo for GITHUB_TOKEN; 15,000/hr on Enterprise Cloud).
- **2026 artifact quota changes**: None announced since cache's 10 GB-per-repo lift (2025-11-20).

## Gaps

- Empirical per-artifact byte ceiling for v4+ uncertain — requires testing >5 GB upload.
- GHES (Enterprise Server / self-hosted) may operate differently; not probed.
- `archive: false` interaction with `compression-level` is undocumented.
- Concurrent-upload rate-limit behavior (>20 parallel matrix uploads) undocumented.
