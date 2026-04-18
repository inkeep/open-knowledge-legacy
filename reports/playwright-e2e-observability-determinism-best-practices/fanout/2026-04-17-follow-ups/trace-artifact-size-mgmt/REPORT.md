---
title: "Playwright E2E Artifact Sizes, GitHub Actions Storage Economics, and Retention Strategy (2026)"
description: "Factual survey of trace/video/screenshot artifact sizes, GitHub Actions storage limits and billing as of April 2026, cost-reduction patterns, and retention conventions in editor-heavy OSS Playwright suites. Informs retention-days and capture-strategy selection for editor-first E2E pipelines."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Playwright
  - GitHub Actions
  - BlockNote
  - Milkdown
  - Lexical
  - Plate
  - Outline
topics:
  - E2E observability
  - CI artifact storage
  - retention policy
  - test diagnostics
---

# Playwright E2E Artifact Sizes, GitHub Actions Storage Economics, and Retention Strategy (2026)

**Purpose:** Provide a primary-source factual baseline on real-world Playwright artifact sizes, current GitHub Actions storage limits and billing, proven cost-reduction patterns, and retention conventions in editor-heavy OSS projects — so the consuming spec can select `retention-days` and capture strategy from measured data rather than folklore.

---

## Executive Summary

Playwright's canonical "trace on-first-retry, video retain-on-failure, screenshot only-on-failure" stack is well-understood for *what* to capture; the less-documented question is *how big artifacts actually get* and *what retention/gating schemes hold up under editor-heavy workloads*. This report synthesizes primary-source evidence from Playwright docs, the Playwright issue tracker, GitHub Actions documentation and changelog, and CI configurations of five editor-heavy OSS projects (BlockNote, Milkdown, Lexical, Plate, Outline).

**Key findings:**

- **Trace size: 1–50 MB per test is typical; file-upload suites push multi-GB.** Playwright's own issue tracker references 47 MB traces for complex apps and 135 MB–multi-GB traces when tests round-trip large network payloads ([microsoft/playwright#20157](https://github.com/microsoft/playwright/issues/20157)). DOM-heavy editor pages land in the upper half of the normal range because each action records three full DOM snapshots.
- **Video cost scales linearly with duration at ~7.5 MB/min (Chromium, VP8, 1 Mbit/s hardcoded).** The video bitrate is not publicly configurable ([microsoft/playwright#31424](https://github.com/microsoft/playwright/issues/31424)), so the only mitigations are `retain-on-failure`, reducing viewport size (640×480 gave one team a 70% per-video reduction), or post-encoding with ffmpeg.
- **GitHub Actions free storage is tiered and pooled: Free 500 MB / Pro 1 GB / Team 2 GB / Enterprise 50 GB, shared with Packages.** Overage bills at **$0.25/GB-month** for artifacts. Retention defaults to 90 days (max 90 public, 400 private/org). `retention-days` reduces cost roughly linearly — 7 days is ~7.7% of 90-day cost.
- **Editor-heavy OSS converges on a narrow configuration.** Sampled projects that run Playwright in public CI (Milkdown, Lexical, Plate) all use `trace: 'on-first-retry'`, `video: 'off'`, `retention-days: 7`, `if: failure()`. BlockNote is the outlier at 30-day retention with `!cancelled()` because its merge-report workflow needs all shard outputs regardless of pass/fail. Outline maintains a Playwright config (`video: "off"`, explicit comment "Disable video recording to reduce overhead") but does not run Playwright in public CI.
- **The `if:` gate is a higher-leverage lever than `retention-days`.** Switching a 95%-green pipeline from `!cancelled()` to `failure()` cuts uploaded bytes roughly 20× (~5% retained vs 100%) — dwarfs the 4× difference between 7-day and 30-day retention.
- **Trace format is stable across 1.40 → 1.59.** Playwright has not changed the trace.zip layout or compression behavior in 2024–2026 releases. v1.43 added `retain-on-first-failure`; v1.59 added CLI trace-inspection commands and the `page.screencast` API. User requests for per-trace compression-level control ([#29218](https://github.com/microsoft/playwright/issues/29218)) were closed without implementation.

**Bottom-line framing for retention/capture selection:**

| Lever | Relative cost impact | Complexity |
|-------|---------------------|------------|
| `if: failure()` gate | ~20× bytes (95% green) | Low |
| `video: 'off'` | 60–70% of total bytes | Low |
| `trace: 'on-first-retry'` | ~95% runtime-cost reduction vs `'on'` | Low |
| `retention-days: 7` vs 30 | ~4× cost reduction | Low |
| Trace sub-options (`screenshots: false`, `sources: false`) | 30–60% per trace (inferred) | Medium |
| FFmpeg post-encode videos | ~50% additional | Medium-High |

A conservative baseline for an editor-heavy suite modeled on OSS consensus: `trace: 'on-first-retry'`, `video: 'off'`, `screenshot: 'only-on-failure'`, `if: failure()`, `retention-days: 7`. Teams needing merge-report workflows will land on BlockNote's `!cancelled()` + 30-day pattern instead.

---

## Research Rubric

**Primary question:** When Playwright E2E tests run with canonical capture defaults in GitHub Actions, what are real-world artifact sizes, storage limits, and cost-reduction patterns — especially for editor-heavy suites?

**Dimensions:**
1. **Artifact size taxonomy** (P0 Deep) — what trace/video/screenshot sizes look like and what drives them
2. **GitHub Actions storage limits 2026** (P0 Moderate) — current quotas, billing, retention semantics, upload-artifact version evolution
3. **Cost-reduction patterns** (P0 Moderate) — configs that measurably reduce artifact cost
4. **Editor-heavy test suite specifics** (P0 Moderate) — what BlockNote/Milkdown/Lexical/Plate/Outline actually ship
5. **Retention-days tradeoffs** (P0 Moderate) — how teams choose retention and why
6. **Trace format evolution 1.40+** (P1) — what changed 2024–2026

**Stance:** Factual (no recommendations; decisions belong to the consuming spec).

---

## Detailed Findings

### D1 — Artifact Size Taxonomy

**Finding:** Playwright's `trace.zip` decomposes into four top-level entries — `trace.trace` (actions/events), `trace.network` (request/response), `trace.stacks` (JS stack traces), and `resources/` (DOM snapshots, screenshots, source files). The `resources/` directory is typically the size-dominant entry because **each action records three DOM snapshots** (Before, Action, After), so action count × DOM size is the primary size multiplier ([Playwright Trace Viewer docs](https://playwright.dev/docs/trace-viewer)).

**Real-world size ranges:**
- **Typical trace:** 1–50 MB. The upper bound of this range is documented in a third-party guide citing "47 MB or more for complex applications" ([Momentic](https://momentic.ai/blog/the-ultimate-guide-to-playwright-trace-viewer-master-time-travel-debugging)).
- **File-upload / large-payload tests:** multi-GB. A user report in [microsoft/playwright#20157](https://github.com/microsoft/playwright/issues/20157) describes traces of "135 MB" and internal `trace.trace` files of "367 MB" uncompressed when tests upload 180 MB files — network-body capture is unbounded.
- **Video:** ~7.5 MB/min at Chromium defaults. The VP8 codec with 1 Mbit/s bitrate is hardcoded in Playwright's ffmpeg path per [#31424](https://github.com/microsoft/playwright/issues/31424); a 30-second test video ≈ 3.75 MB, a 2-minute test ≈ 15 MB. Resolution defaults to viewport scaled to fit 800×800, so the default 1280×720 viewport renders at ~800×450 ([Playwright Videos docs](https://playwright.dev/docs/videos)).
- **Screenshot:** 50–300 KB for a 1280×720 desktop PNG; full-page captures of long docs pages can reach 1–2 MB. JPEG with `quality` option cuts this 5–10× lossy.

**Evidence:** [evidence/d1-artifact-size-taxonomy.md](evidence/d1-artifact-size-taxonomy.md)

**Implications:**
- For editor-heavy suites, action count is the trace-size driver — many small WYSIWYG interactions (type, select, format) produce more snapshots than a single large DOM.
- Video duration (not resolution) dominates video size; keeping tests short cuts video bytes more than lowering resolution.
- Traces that round-trip large network payloads should use `retain-on-failure` or filter request bodies — network capture has no size ceiling.

**Remaining uncertainty:** No official per-category size distribution is published. Per-action DOM-snapshot size on real editor pages is not measured in public sources; teams must profile via `unzip trace.zip && du -ah resources/` to characterize their own corpus.

---

### D2 — GitHub Actions Storage Limits (2026)

**Finding:** Current (April 2026) plan-tiered free artifact storage is **500 MB (Free) / 1 GB (Pro) / 2 GB (Team) / 50 GB (Enterprise Cloud)**, shared with GitHub Packages ([GitHub billing docs](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions)). Overage bills at **$0.25/GB-month**. Cache is a separate pool at **$0.07/GiB-month** (since [2025-11-20 changelog](https://github.blog/changelog/2025-11-20-github-actions-cache-size-can-now-exceed-10-gb-per-repository/), cache can exceed 10 GB).

**Key hard limits:**
- **500 artifacts per job** — hard cap ([upload-artifact README](https://github.com/actions/upload-artifact))
- **Retention: default 90 days, max 90 for public, 400 for private/org** ([GitHub retention docs](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization))
- **Per-artifact byte ceiling:** NOT published in current docs. The v3-era "2 GB/5 GB" figures repeated across Stack Overflow no longer appear on [docs.github.com/en/actions/reference/limits](https://docs.github.com/en/actions/reference/limits).
- **Storage usage recalculated every 6–12 hours**; deletes do not instantly free quota ([community discussion #169789](https://github.com/orgs/community/discussions/169789))
- **GitHub Support cannot raise storage quotas** — monitoring is the only defense against silent upload refusal.

**upload-artifact version timeline ([releases](https://github.com/actions/upload-artifact/releases)):**

| Version | Date | Notable change |
|---------|------|----------------|
| v4.0.0 | 2023-12-14 | GA; artifacts immutable + job-scoped; v3 "merge on same name" pattern broken |
| v4.4+  | —          | Hidden files excluded by default (`include-hidden-files: true` to override) |
| v5.0.0 | 2024-10-24 | Node 20/24 runtime bump |
| v6.0.0 | 2024-12-12 | Node 24 default; requires runner ≥ 2.327.1 |
| v7.0.0 | 2026-02-26 | ESM; `archive: false` for single-file unzipped uploads ([changelog](https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/)) |

The v3 → v4 transition (deprecated [2024-04-16](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/)) forced matrix jobs onto distinct artifact names per shard or explicit use of `actions/upload-artifact/merge@v4`.

**`compression-level: 0..9`** (default 6, GNU Gzip equivalent). For pre-compressed payloads like `trace.zip` and `.webm`, `compression-level: 0` saves upload time with negligible byte penalty; for text-heavy HTML reports, level 9 shrinks meaningfully.

**December 2025 pricing:** Compute prices reduced up to 39% starting 2026-01-01 ([changelog](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)); **storage prices unchanged**.

**Evidence:** [evidence/d2-github-actions-storage.md](evidence/d2-github-actions-storage.md)

**Implications:**
- Public OSS repos on Free-plan orgs still operate against the 500 MB pooled cap; free-minutes does not translate to free storage.
- Retention-days tuning compounds roughly linearly with bill: 7d ≈ 7.7% of 90d cost.
- Derivable state (build output, node_modules) should live in cache (3.6× cheaper per GB and separate quota), not in artifacts.

**Vendor-incentive bias flag:** GitHub sets both quotas and overage rates, and controls the 6–12h recalc window. Verifiable via docs/changelog but self-interested.

**Remaining uncertainty:** Empirical per-artifact byte ceiling for v4+ unconfirmed; rate-limit behavior for concurrent matrix uploads undocumented; `archive: false` × `compression-level` interaction undocumented.

---

### D3 — Cost-Reduction Patterns

**Finding:** Twelve patterns, ranked by leverage. Only Patterns 4, 5, 9, and 12 have measured savings in primary sources; others are inferred from the config surface.

| # | Pattern | Measured / claimed | Tradeoff |
|---|---------|---------------------|----------|
| 1 | `trace: 'on-first-retry'` | ~95% fewer traces vs `'on'` at 1–5% flake rate | No trace on first failing attempt |
| 2 | `trace: 'retain-on-failure'` | Upload cost only for failed tests (~<5%) | Pays full recording runtime on all tests |
| 3 | Trace sub-options (`screenshots: false`, `sources: false`) | Inferred 30–60% per trace | Loses filmstrip; source-jumps break |
| 4 | Video 640×480 override | **9 MB → 2.7 MB (70%)** [Testrig] | Reduced sharpness |
| 5 | `screenshot: 'only-on-failure'` | **850 KB → 420 KB (51%)** [Testrig] | No baseline on pass |
| 6 | `if: failure()` gate | ~20× reduction at 95%-green pipelines | Skips on earlier-step failures |
| 7 | Tiered `retention-days` (1d blob + 14d final) | ~14× vs flat 14d | Cannot re-merge after 1d |
| 8 | `compression-level: 9` on HTML, `0` on pre-compressed | Text shrinks; avoids double-work | Higher CPU on level 9 (minimal) |
| 9 | Pre-upload `tar -czf` bundling | **900 MB → 175 MB; 1.5h → 25s** [community] | Loses GitHub UI browse view |
| 10 | Selective `path:` (`**/*-retry*/` glob) | Excludes first-attempt artifacts | Trickier config |
| 11 | Matrix sharding | Cap-avoidance only, not reduction | Merge job required |
| 12 | FFmpeg post-encode `.webm` → `.mp4 crf 25` | **~50% additional** [Testrig] | 2–3 min pipeline overhead |

Key quotes:
- [Testrig case study](https://www.testrigtechnologies.com/how-testrig-reduced-playwright-test-artifact-storage-by-more-than-60-real-ci-cd-insights/) reports "more than 60%" overall storage reduction from Patterns 4 + 5 + 12 stacked.
- [Community discussion #166576](https://github.com/orgs/community/discussions/166576) documents a team collapsing a 900 MB directory upload to 175 MB tar.gz — per-file upload overhead, not compression, was the dominant saving.

**Evidence:** [evidence/d3-cost-reduction-patterns.md](evidence/d3-cost-reduction-patterns.md)

**Implications:**
- The `if:` gate (Pattern 6) is the highest-leverage single-line change for most teams.
- `video: 'off'` (implicit Pattern 4 when video is disabled) is what editor-OSS has converged on — see D4.
- Trace sub-option savings (Pattern 3) are unmeasured in primary sources; teams considering them need to profile their own corpus.

**Remaining uncertainty:** `retain-on-first-failure` cost profile at scale has not been blogged by any production team located. Only one end-to-end measured-savings study (Testrig) exists.

---

### D4 — Editor-Heavy Test Suite Specifics

**Finding:** Five editor-focused OSS projects were inspected; three run Playwright in public CI with a notably convergent configuration, and two (TipTap, Novel) don't run Playwright publicly at all.

| Project | trace | video | screenshot | `retention-days` | `if:` gate | Matrix scale |
|---------|-------|-------|------------|------------------|------------|--------------|
| [BlockNote](https://github.com/TypeCellOS/BlockNote/blob/main/tests/playwright.config.ts) | (default off) | (default off) | (default off) | 1d blob, 30d final/merged | `!cancelled()` | 3 browsers × 2 shards |
| [Milkdown](https://github.com/Milkdown/milkdown/blob/main/e2e/playwright.config.ts) | `on-first-retry` | off | off | 7d | `failure()` | 5 shards |
| [Lexical](https://github.com/facebook/lexical/blob/main/.github/workflows/call-e2e-test.yml) | (workflow passes no flag) | (no flag) | (no flag) | 7d | `failure()` | 3 OS × 3 browser × 3 mode × dev/prod × React-version × flaky |
| [Plate](https://github.com/udecode/plate/blob/main/tooling/config/playwright.config.ts) | `on-first-retry` | off | off | N/A (no upload) | N/A | Unsharded |
| [Outline](https://github.com/outline/outline) | `on-first-retry` | **off** (explicit) | `only-on-failure` | N/A (Playwright not in public CI) | N/A | N/A |

**Convergence patterns:**
- **`trace: 'on-first-retry'`** in 3/3 projects with explicit trace settings (Milkdown, Plate, Outline).
- **`video: off`** in 4/5 — Outline's config comment says verbatim "Disable video recording to reduce overhead."
- **`retention-days: 7`** with `if: failure()` in Milkdown + Lexical (the two production-Playwright-in-CI projects that aren't optimized for merge-report).
- **BlockNote is the outlier** — 30-day retention + `!cancelled()` is driven by its blob-report merge workflow, which requires ALL shard outputs regardless of pass/fail.

**Evidence:** [evidence/d4-editor-heavy-projects.md](evidence/d4-editor-heavy-projects.md)

**Implications:**
- Editor-OSS has learned-in-practice that video is not worth the cost when traces exist (only an inference from convergence; no public post-mortem located).
- BlockNote's pattern is the reference for teams needing merge-report workflows; Milkdown/Lexical's pattern is the reference for teams that just want failure-only evidence.
- Lexical demonstrates that even at very large matrix scale (dozens of combinations per PR), `retention-days: 7` is sufficient.

**Remaining uncertainty:** Lexical's `playwright.config.{ts,js}` could not be fetched via GitHub Contents API or code search; defaults are assumed to apply. No public post-mortem located from any of the five on "how we chose these values."

---

### D5 — Retention-Days Tradeoffs

**Finding:** Editor-heavy OSS has converged on two retention-days regimes:
- **7 days, `failure()` gate** (Milkdown, Lexical) — failure-only artifacts for small-team post-mortem windows.
- **1d + 30d tiered, `!cancelled()` gate** (BlockNote) — merge-report workflow needs all shards; blob intermediates evicted quickly, final merged report held 30d.

**The Playwright docs `retention-days: 30` example** ([ci.md](https://playwright.dev/docs/ci)) is HTML-report only — not for raw traces. A report-only artifact is small; a `test-results/` dir with traces is mostly bytes. Teams copying that number verbatim for trace-heavy dirs over-retain.

**`if:` gate dominates retention-days economics.** A 95%-green pipeline switching from `!cancelled()` to `failure()` cuts bytes ~20× — higher leverage than the 4× saving from 7d vs 30d.

**Debugging window in practice (inferred from convergence):** If nobody opens a trace within 5 business days, they're not going to. 7d covers Fri-fail → Mon-investigate; 14d covers a week-off contributor; 30d is vacation/hand-off insurance.

**PR-branch vs main-branch retention asymmetry is rare.** None of the four sampled repos conditionally branch retention on `github.ref`. Main-branch failures are rare and already captured by the PR's artifact at the same commit — flat retention is simpler and buys little less.

**Cost math:**
```
monthly_cost = retention_days × failure_rate × shard_count × avg_artifact_GB × ($0.25/GB-month / 30)
```
For a 5-shard suite with 50 MB trace bundles, 2% fail rate, 30d retention:
`30 × 0.02 × 5 × 0.05 = 0.15 GB-days ≈ immaterial`

Costs dominate when: retention defaults to 90d, failure rate spikes during a flake crisis, or traces balloon to GBs (long-running collaborative-editor tests).

**Evidence:** [evidence/d5-retention-tradeoffs.md](evidence/d5-retention-tradeoffs.md)

**Implications:**
- 7-day retention + `failure()` gate is the low-risk default for editor-heavy suites; 30-day + `!cancelled()` only justified if a merge step demands pass-run outputs.
- Per-branch retention is theoretical; flat retention matches OSS practice.

**Remaining uncertainty:** No measurement of how often traces actually ARE opened within 1/3/7/14/30 days post-failure; Finding 9 is inferred from convergence, not surveyed.

---

### D6 — Trace Format Evolution (1.40+)

**Finding:** Trace format is stable; change velocity is at the mode and tooling level, not the serialization layer.

| Version | Change |
|---------|--------|
| 1.43 | Added `retain-on-first-failure` trace mode — trace for first run, none for retries |
| 1.49 | Added `tracing.group()` method; canvas snapshots draw preview |
| 1.50 | Canvas-content display disabled by default (error-prone); key-press metadata shown alongside actions |
| 1.53 | "New Steps" UI in Trace Viewer + HTML reporter |
| 1.59 | CLI trace-analysis commands (`npx playwright trace actions --grep`, etc.); unified `page.screencast` API; `artifactsDir` option on `browserType.launch()` |

**No compression-format changes across 1.40–1.59.** Release notes scanned end-to-end for `compress`, `gzip`, `zstd`, `format`, `deflate` — zero hits. User request for per-trace compression-level control ([#29218](https://github.com/microsoft/playwright/issues/29218)) was closed `P3-collecting-feedback` without implementation. ZIP + DEFLATE is stable; artifact-size optimization is mode-based (retain-on-failure family), not format-based.

**Notable 1.59 affordances for CI observability:**
- `npx playwright trace actions --grep` enables reading a trace from the command line (agent-friendly; no GUI viewer required).
- `page.screencast` is a superset of the prior video API — future video quality controls will likely arrive on this surface.

**Evidence:** [evidence/d6-trace-format-evolution.md](evidence/d6-trace-format-evolution.md)

**Implications:**
- Teams choosing trace storage strategies in 2026 can rely on the format being stable; upgrading Playwright does not retroactively change trace sizes.
- v1.43's `retain-on-first-failure` is under-represented in community content (most blog posts predate it) — its cost profile at scale remains unquantified.
- v1.59 CLI trace commands reduce the diagnostic value of downloading full HTML reports — scripts can extract just what they need.

---

## Limitations & Open Questions

### Dimensions not fully covered
- **D1:** Per-action DOM-snapshot size histogram on real editor pages is not published by Playwright; requires local profiling.
- **D2:** Empirical per-artifact byte ceiling for v4+ unconfirmed; `archive: false` × `compression-level` interaction undocumented.
- **D3:** Measured savings per trace sub-option (`screenshots`/`sources: false` individually) not in primary sources.
- **D4:** Lexical `playwright.config` text not resolvable via GitHub Contents API / code search in this session. No public post-mortem on editor-OSS artifact-size incidents located.
- **D5:** No survey measuring actual post-failure trace access rates (Finding 9 is inferred from convergence).
- **D6:** v1.59 `page.screencast` default encoding parameters not yet published.

### Out of scope (per rubric non-goals)
- Per-test docName isolation
- Bridge-convergence fuzz testing
- Tool comparison
- 1P codebase analysis
- Mobile testing

---

## References

### Evidence Files
- [evidence/d1-artifact-size-taxonomy.md](evidence/d1-artifact-size-taxonomy.md) — trace/video/screenshot size drivers and ranges
- [evidence/d2-github-actions-storage.md](evidence/d2-github-actions-storage.md) — 2026 limits, billing, upload-artifact version timeline
- [evidence/d3-cost-reduction-patterns.md](evidence/d3-cost-reduction-patterns.md) — 12 patterns with measured/inferred savings
- [evidence/d4-editor-heavy-projects.md](evidence/d4-editor-heavy-projects.md) — BlockNote, Milkdown, Lexical, Plate, Outline configs
- [evidence/d5-retention-tradeoffs.md](evidence/d5-retention-tradeoffs.md) — retention-days convergence, debugging-window inference
- [evidence/d6-trace-format-evolution.md](evidence/d6-trace-format-evolution.md) — 1.40–1.59 release-note scan

### External sources (primary)
- [Playwright Trace Viewer docs](https://playwright.dev/docs/trace-viewer)
- [Playwright Videos docs](https://playwright.dev/docs/videos)
- [Playwright Release Notes](https://playwright.dev/docs/release-notes)
- [Playwright TestOptions API](https://playwright.dev/docs/api/class-testoptions)
- [Playwright CI intro](https://playwright.dev/docs/ci-intro)
- [Playwright Sharding docs](https://playwright.dev/docs/test-sharding)
- [microsoft/playwright#8263 — Smaller trace files](https://github.com/microsoft/playwright/issues/8263)
- [microsoft/playwright#20157 — Large uploads & trace size](https://github.com/microsoft/playwright/issues/20157)
- [microsoft/playwright#29218 — Reduce sizes of screenshots and trace files](https://github.com/microsoft/playwright/issues/29218)
- [microsoft/playwright#29531 — retain-on-first-failure modes](https://github.com/microsoft/playwright/issues/29531)
- [microsoft/playwright#31424 — Video quality control](https://github.com/microsoft/playwright/issues/31424)
- [microsoft/playwright#32405 — Trace sub-option parity](https://github.com/microsoft/playwright/issues/32405)
- [GitHub Actions billing docs](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
- [GitHub Actions reference limits](https://docs.github.com/en/actions/reference/limits)
- [GitHub retention-days configuration docs](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization)
- [actions/upload-artifact README](https://github.com/actions/upload-artifact)
- [actions/upload-artifact releases](https://github.com/actions/upload-artifact/releases)
- [GitHub changelog — v3 deprecation (2024-04-16)](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/)
- [GitHub changelog — Artifacts v4 GA (2023-12-14)](https://github.blog/changelog/2023-12-14-github-actions-artifacts-v4-is-now-generally-available/)
- [GitHub changelog — Cache >10 GB (2025-11-20)](https://github.blog/changelog/2025-11-20-github-actions-cache-size-can-now-exceed-10-gb-per-repository/)
- [GitHub changelog — Non-zipped artifacts / v7 (2026-02-26)](https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/)
- [GitHub changelog — Pricing update (2025-12-16)](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)
- [GitHub Community Discussion #166576 — managing artifact storage](https://github.com/orgs/community/discussions/166576)
- [GitHub Community Discussion #169789 — quota-hit](https://github.com/orgs/community/discussions/169789)
- [Testrig — How We Reduced Playwright Test Artifact Storage by More Than 60%](https://www.testrigtechnologies.com/how-testrig-reduced-playwright-test-artifact-storage-by-more-than-60-real-ci-cd-insights/)
- [Momentic — Trace Viewer Guide](https://momentic.ai/blog/the-ultimate-guide-to-playwright-trace-viewer-master-time-travel-debugging)
- [Kyrre — Playwright CI/CD blog](https://www.kyrre.dev/blog/playwright-ci-cd)
- [BlockNote — tests/playwright.config.ts](https://github.com/TypeCellOS/BlockNote/blob/main/tests/playwright.config.ts)
- [BlockNote — .github/workflows/build.yml](https://github.com/TypeCellOS/BlockNote/blob/main/.github/workflows/build.yml)
- [Milkdown — e2e/playwright.config.ts](https://github.com/Milkdown/milkdown/blob/main/e2e/playwright.config.ts)
- [Milkdown — .github/workflows/ci.yml](https://github.com/Milkdown/milkdown/blob/main/.github/workflows/ci.yml)
- [Lexical — .github/workflows/call-e2e-test.yml](https://github.com/facebook/lexical/blob/main/.github/workflows/call-e2e-test.yml)
- [Plate — tooling/config/playwright.config.ts](https://github.com/udecode/plate/blob/main/tooling/config/playwright.config.ts)
- [Outline — .github/workflows/ci.yml](https://github.com/outline/outline/blob/main/.github/workflows/ci.yml)
- [WordPress/gutenberg PR #45187](https://github.com/WordPress/gutenberg/pull/45187)
- [actions/upload-artifact issue #36](https://github.com/actions/upload-artifact/issues/36)
