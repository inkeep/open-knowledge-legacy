---
dimension: Retention-Days Tradeoffs
date: 2026-04-16
sources: docs.github.com, github.blog, playwright.dev, editor-OSS workflow files
---

# Evidence: Retention-Days Tradeoffs

**Dimension:** D5 — Retention-Days Tradeoffs (P0 Moderate)
**Date:** 2026-04-16

## Key sources referenced
- [GitHub Docs: configuring retention period](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization)
- [GitHub changelog: retention-days for artifacts (2020-10-08)](https://github.blog/changelog/2020-10-08-github-actions-ability-to-change-retention-days-for-artifacts-and-logs/)
- [Playwright CI docs](https://playwright.dev/docs/ci)
- [Playwright sharding docs](https://playwright.dev/docs/test-sharding)
- [Community discussion #166576](https://github.com/orgs/community/discussions/166576)
- [Kyrre on Playwright CI/CD](https://www.kyrre.dev/blog/playwright-ci-cd)
- BlockNote, Milkdown, Lexical workflow files (see D4 evidence)

---

## Findings

### Finding 1: 90-day default universally shortened for Playwright
**Confidence:** CONFIRMED
**Evidence:** GitHub retention docs + 2020-10-08 changelog establish default. All four sampled editor repos with Playwright CI set explicit `retention-days ≤ 30`.
**Implications:** 90 days is a billing default nobody sampled keeps. 7–30d is the realistic range.

### Finding 2: Two-tier retention (blob/intermediate=1d, final/merged=14–30d) is dominant
**Confidence:** CONFIRMED
**Evidence:** BlockNote `build.yml` — blob=1d, merged HTML=30d. Playwright sharding docs — blob retention "lowered to 1 day because files will be replaced by the single output file."
**Implications:** Intermediate artifacts replaced by merge step; merge output takes the debug-window retention.

### Finding 3: Editor-OSS convergence on 7-day retention for failure-only artifacts
**Confidence:** CONFIRMED
**Evidence:** Milkdown `ci.yml` (`retention-days: 7`, `if: ${{ failure() }}`); Lexical `call-e2e-test.yml` (`retention-days: 7`, `if: failure()`).
**Implications:** 7 days = weekend + contributor next-weekday turnaround. Validated at Lexical's scale (3 OSes × 3 browsers × many modes).

### Finding 4: Playwright-docs `retention-days: 30` reflects merged HTML reports, not raw traces
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/ci shows `retention-days: 30` in `playwright-report` upload (HTML only). Kyrre blog mirrors.
**Implications:** A report-only artifact without traces/videos is small; a `test-results/` dir with traces is mostly bytes. The 30-day default doesn't map well to trace retention.

### Finding 5: `if: failure()` vs `!cancelled()` is the high-leverage knob
**Confidence:** CONFIRMED
**Evidence:** BlockNote uses `!cancelled()` (driven by merge requirement); Milkdown + Lexical use `failure()`; Playwright docs page uses `!cancelled()`.
**Implications:** For a 95%-green pipeline, switching from `!cancelled()` to `failure()` cuts artifact bytes ~20× (~5% retained vs 100%). BlockNote's `!cancelled()` is explained by its blob-report merge step needing ALL shard outputs.

### Finding 6: `trace: 'on-first-retry'` + `video: 'off'` is editor-OSS consensus
**Confidence:** CONFIRMED
**Evidence:** Milkdown, Plate, Outline, and Playwright-docs default all use `trace: 'on-first-retry'`. Outline config comment: "Disable video recording to reduce overhead."
**Implications:** Video is the biggest artifact-size contributor; editors-OSS consensus treats it as not worth it when traces exist.

### Finding 7: Storage billed per-GB-day; overage pressure dominates retention decisions
**Confidence:** CONFIRMED
**Evidence:** GitHub billing docs; community discussion #166576
**Cost math:** `retention_days × failure_rate × avg_artifact_size_GB × $0.25/GB-month`
For 5-shard suite, 50 MB trace bundles, 2% fail rate, 30d retention: ~30 × 0.02 × 5 × 0.05 GB = 0.15 GB-days = immaterial.
**Implications:** Costs dominate when: (a) retention defaults to 90d, (b) failure rate spikes during a flake crisis, (c) traces balloon to GBs (long-running editor collab scenarios).

### Finding 8: `!cancelled()` gate common in Playwright docs but masks real practice
**Confidence:** INFERRED
**Evidence:** Playwright `ci.md` uses `!cancelled()`; three of four sampled editor projects use `failure()`.
**Implications:** Copying Playwright's example verbatim gives "upload on success too" semantics. Teams tighten to `failure()` unless a downstream job needs the output regardless of pass/fail.

### Finding 9: Debugging window in practice — traces useful for ~3–5 business days
**Confidence:** INFERRED (no survey; inferred from retention-days convergence)
**Evidence:** Editor-OSS convergence on 7-day retention (Milkdown, Lexical); Playwright-blog-recommended 14-day merged-report retention.
**Implications:** If nobody opened the trace in 5 business days, they're not going to. 7d covers Fri-fail → Mon-investigate; 14d covers week-off contributor; 30d is vacation/hand-off insurance.

### Finding 10: PR-branch vs main-branch retention asymmetry is rare in practice
**Confidence:** CONFIRMED (across sample)
**Evidence:** None of the four sampled editor-OSS repos branch retention on `github.ref`. All use a flat retention-days value.
**Implications:** Theoretical asymmetry (PR=7d, main=30d) is under-used. main-branch failures are rare and captured by the PR's artifact for the same commit. Flat retention is simpler and buys little less.

---

## Negative searches

- No 2025-2026 community survey on retention-days choices found.
- No post-mortem from any editor-OSS project on "we chose X retention because Y".

## Gaps

- No measurement of how often traces ARE opened within 1, 3, 7, 14, 30 days post-failure — would sharpen Finding 9.
- No data on "retention-spike during flake crisis" economic impact.
- Per-branch retention patterns (PR vs main) under-represented in OSS; enterprise patterns unknown.
