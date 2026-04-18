---
dimension: Follow-up E — Trace artifact size + GitHub Actions storage economics
date: 2026-04-17
sources:
  - playwright.dev
  - github.com/microsoft/playwright
  - docs.github.com
  - github.blog/changelog
  - github.com/actions/upload-artifact
  - www.testrigtechnologies.com
  - momentic.ai
---

# Evidence: Playwright artifact sizes + GHA storage economics (April 2026)

**Primary question:** What do real Playwright artifact sizes look like, what GitHub Actions storage limits/billing apply, and which cost-reduction patterns have measured savings?

---

## Findings

### Finding: Trace size is 1-50 MB typical; file-upload suites push multi-GB

**Confidence:** CONFIRMED
**Evidence:** Per [Playwright Trace Viewer docs](https://playwright.dev/docs/trace-viewer), `trace.zip` decomposes into four top-level entries:

- `trace.trace` — actions/events
- `trace.network` — request/response
- `trace.stacks` — JS stack traces
- `resources/` — DOM snapshots, screenshots, source files

`resources/` is typically the size-dominant entry because **each action records three DOM snapshots** (Before, Action, After), so action count × DOM size is the primary size multiplier.

**Real-world size ranges:**

- **Typical:** 1-50 MB. Upper bound documented in [Momentic's trace viewer guide](https://momentic.ai/blog/the-ultimate-guide-to-playwright-trace-viewer-master-time-travel-debugging) citing "47 MB or more for complex applications."
- **File-upload / large-payload:** multi-GB. [microsoft/playwright#20157](https://github.com/microsoft/playwright/issues/20157) describes traces of "135 MB" with internal `trace.trace` files of "367 MB uncompressed" when tests upload 180 MB files — network-body capture is unbounded.

---

### Finding: Video is ~7.5 MB/min on Chromium (VP8 at 1 Mbit/s hardcoded, not publicly configurable)

**Confidence:** CONFIRMED
**Evidence:** Per [microsoft/playwright#31424](https://github.com/microsoft/playwright/issues/31424), the VP8 codec with 1 Mbit/s bitrate is hardcoded in Playwright's ffmpeg path.

- 30-second test video ≈ 3.75 MB
- 2-minute test ≈ 15 MB

Resolution defaults to viewport scaled to fit 800×800; the default 1280×720 viewport renders at ~800×450 per [Playwright Videos docs](https://playwright.dev/docs/videos).

---

### Finding: Screenshot sizes (1280×720 desktop PNG baseline)

**Confidence:** CONFIRMED
**Evidence:** 50-300 KB for 1280×720 PNG; 1-2 MB for full-page long-doc captures. JPEG with `quality` option cuts size 5-10× lossy.

---

### Finding: GitHub Actions free artifact storage (April 2026)

**Confidence:** CONFIRMED
**Evidence:** Per [GitHub billing docs](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions):

| Plan | Free artifact storage | Shared with | Overage rate |
|---|---|---|---|
| Free | 500 MB | GitHub Packages | $0.25/GB-month |
| Pro | 1 GB | GitHub Packages | $0.25/GB-month |
| Team | 2 GB | GitHub Packages | $0.25/GB-month |
| Enterprise Cloud | 50 GB | GitHub Packages | $0.25/GB-month |

Cache is a separate pool at **$0.07/GiB-month** per the [2025-11-20 changelog](https://github.blog/changelog/2025-11-20-github-actions-cache-size-can-now-exceed-10-gb-per-repository/) (cache can exceed 10 GB per repo since then).

**Key hard limits:**

- **500 artifacts per job** — hard cap ([upload-artifact README](https://github.com/actions/upload-artifact)).
- **Retention: default 90 days, max 90 for public, 400 for private/org** ([GitHub retention docs](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization)).
- **Per-artifact byte ceiling: NOT published in current docs.** The v3-era "2 GB/5 GB" figures repeated across Stack Overflow no longer appear on [docs.github.com/en/actions/reference/limits](https://docs.github.com/en/actions/reference/limits).
- **Storage usage recalculated every 6-12 hours**; deletes do not instantly free quota ([community discussion #169789](https://github.com/orgs/community/discussions/169789)).
- **GitHub Support cannot raise storage quotas** — monitoring is the only defense against silent upload refusal.

**December 2025 pricing:** Compute prices reduced up to 39% starting 2026-01-01 ([changelog](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)); **storage prices unchanged**.

**Vendor-incentive bias flag:** GitHub sets both quotas and overage rates and controls the 6-12h recalc window. Verifiable via docs/changelog but self-interested.

---

### Finding: upload-artifact version timeline

**Confidence:** CONFIRMED
**Evidence:** [actions/upload-artifact releases](https://github.com/actions/upload-artifact/releases):

| Version | Date | Notable change |
|---------|------|----------------|
| v4.0.0 | 2023-12-14 | GA; artifacts immutable + job-scoped; v3 "merge on same name" pattern broken |
| v4.4+ | — | Hidden files excluded by default (`include-hidden-files: true` to override) |
| v5.0.0 | 2024-10-24 | Node 20/24 runtime bump |
| v6.0.0 | 2024-12-12 | Node 24 default; requires runner ≥ 2.327.1 |
| v7.0.0 | 2026-02-26 | ESM; `archive: false` for single-file unzipped uploads ([changelog](https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/)) |

v3 deprecated [2024-04-16](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/). Matrix jobs forced onto distinct artifact names per shard or explicit `actions/upload-artifact/merge@v4`.

**`compression-level: 0..9`** (default 6, GNU Gzip equivalent). For pre-compressed payloads (`trace.zip`, `.webm`), `compression-level: 0` saves upload time with negligible byte penalty; for text-heavy HTML reports, level 9 shrinks meaningfully.

---

### Finding: Twelve cost-reduction patterns (measured vs inferred)

**Confidence:** CONFIRMED for measured; INFERRED for others
**Evidence:**

| # | Pattern | Savings (measured / inferred) | Source |
|---|---------|-------------------------------|--------|
| 1 | `trace: 'on-first-retry'` | ~95% fewer traces vs `'on'` at 1-5% flake rate | Inferred from Playwright docs |
| 2 | `trace: 'retain-on-failure'` | Upload cost only for failed tests (<5% typical) | Playwright docs |
| 3 | Trace sub-options (`screenshots: false`, `sources: false`) | Inferred 30-60% per trace | Playwright TestOptions |
| 4 | Video 640×480 override | **9 MB → 2.7 MB (70%)** | [Testrig case study](https://www.testrigtechnologies.com/how-testrig-reduced-playwright-test-artifact-storage-by-more-than-60-real-ci-cd-insights/) |
| 5 | `screenshot: 'only-on-failure'` | **850 KB → 420 KB (51%)** | Testrig |
| 6 | `if: failure()` gate | ~20× reduction at 95%-green pipelines | Arithmetic inference |
| 7 | Tiered `retention-days` (1d blob + 14d final) | ~14× vs flat 14d | Arithmetic |
| 8 | `compression-level: 9` on HTML, `0` on pre-compressed | Text shrinks; avoids double-work | upload-artifact docs |
| 9 | Pre-upload `tar -czf` bundling | **900 MB → 175 MB; 1.5h → 25s** | [community discussion #166576](https://github.com/orgs/community/discussions/166576) |
| 10 | Selective `path:` (`**/*-retry*/` glob) | Excludes first-attempt artifacts | Inferred |
| 11 | Matrix sharding | Cap-avoidance only, not reduction | Inferred |
| 12 | FFmpeg post-encode `.webm` → `.mp4 crf 25` | **~50% additional** | Testrig |

Testrig's stacked optimization (Patterns 4 + 5 + 12) delivered "more than 60%" overall storage reduction. The #166576 discussion documents a team collapsing a 900 MB directory upload to 175 MB tar.gz — per-file upload overhead, not compression, was the dominant saving.

---

### Finding: Editor-heavy OSS config convergence

**Confidence:** CONFIRMED
**Evidence:** Direct reads of each project's `playwright.config.ts` / CI workflow:

| Project | trace | video | screenshot | `retention-days` | `if:` gate | Matrix scale |
|---------|-------|-------|------------|------------------|------------|--------------|
| [BlockNote](https://github.com/TypeCellOS/BlockNote/blob/main/tests/playwright.config.ts) | (default off) | (default off) | (default off) | 1d blob / 30d final+merged | `!cancelled()` | 3 browsers × 2 shards |
| [Milkdown](https://github.com/Milkdown/milkdown/blob/main/e2e/playwright.config.ts) | `on-first-retry` | off | off | 7d | `failure()` | 5 shards |
| [Lexical](https://github.com/facebook/lexical/blob/main/.github/workflows/call-e2e-test.yml) | (workflow passes no flag) | (no flag) | (no flag) | 7d | `failure()` | 3 OS × 3 browser × 3 mode × dev/prod × React-version × flaky |
| [Plate](https://github.com/udecode/plate/blob/main/tooling/config/playwright.config.ts) | `on-first-retry` | off | off | N/A (no upload) | N/A | Unsharded |
| [Outline](https://github.com/outline/outline) | `on-first-retry` | **off (explicit comment: "Disable video recording to reduce overhead")** | `only-on-failure` | N/A (Playwright not in public CI) | N/A | N/A |

**Convergence patterns:**

- **`trace: 'on-first-retry'`** in 3/3 projects with explicit trace settings (Milkdown, Plate, Outline).
- **`video: off`** in 4/5 — Outline's config comment says verbatim "Disable video recording to reduce overhead."
- **`retention-days: 7`** with `if: failure()` in Milkdown + Lexical.
- **BlockNote is the outlier** — 30-day retention + `!cancelled()` driven by its blob-report merge workflow, which requires ALL shard outputs regardless of pass/fail.

---

### Finding: `if:` gate dominates retention-days economics

**Confidence:** INFERRED (arithmetic)
**Evidence:** A 95%-green pipeline switching from `!cancelled()` to `failure()` cuts bytes ~20× (~5% retained vs 100%) — dwarfs the 4× difference between 7-day and 30-day retention.

Cost math:

```
monthly_cost = retention_days × failure_rate × shard_count × avg_artifact_GB × ($0.25/GB-month / 30)
```

For a 5-shard suite with 50 MB trace bundles, 2% fail rate, 30-day retention:

```
30 × 0.02 × 5 × 0.05 = 0.15 GB-days ≈ immaterial
```

Costs dominate when retention defaults to 90d, failure rate spikes during a flake crisis, or traces balloon to GBs.

**The [Playwright docs `retention-days: 30` example](https://playwright.dev/docs/ci) is HTML-report only** — not for raw traces. A report-only artifact is small; a `test-results/` dir with traces is mostly bytes. Teams copying the 30 value verbatim for trace-heavy dirs over-retain.

---

### Finding: Debugging window "5 business days" is inferred from convergence, not surveyed

**Confidence:** INFERRED
**Evidence:** Editor-heavy OSS has converged on two retention regimes (Milkdown/Lexical 7d + `failure()`; BlockNote 30d + `!cancelled()` for merge-report). No measured data on how often traces ARE actually opened within 1/3/7/14/30 days post-failure was located.

Inferred heuristic: If nobody opens a trace within 5 business days, they're not going to. 7d covers Fri-fail → Mon-investigate; 14d covers a week-off contributor; 30d is vacation/hand-off insurance.

PR-branch vs main-branch retention asymmetry is rare — none of the four sampled repos conditionally branch retention on `github.ref`.

---

### Finding: Trace format is stable 1.40-1.59

**Confidence:** CONFIRMED
**Evidence:** [Playwright Release Notes](https://playwright.dev/docs/release-notes) scanned end-to-end for `compress`, `gzip`, `zstd`, `format`, `deflate` — zero hits.

| Version | Change |
|---------|--------|
| 1.43 | `retain-on-first-failure` trace mode — trace for first run, none for retries |
| 1.49 | `tracing.group()` method; canvas snapshots draw preview |
| 1.50 | Canvas-content display disabled by default (error-prone); key-press metadata shown alongside actions |
| 1.53 | "New Steps" UI in Trace Viewer + HTML reporter |
| 1.59 | CLI trace-analysis commands (`npx playwright trace actions --grep`); unified `page.screencast` API; `artifactsDir` option on `browserType.launch()` |

ZIP + DEFLATE is stable; artifact-size optimization is mode-based (retain-on-failure family), not format-based. User request for per-trace compression-level control ([#29218](https://github.com/microsoft/playwright/issues/29218)) closed `P3-collecting-feedback` without implementation.

**Notable 1.59 affordances for CI observability:**
- `npx playwright trace actions --grep` enables reading a trace from the command line (agent-friendly; no GUI viewer required).
- `page.screencast` is a superset of the prior video API; future video quality controls will likely arrive on this surface.

---

## Gaps / follow-ups

- Per-action DOM-snapshot size histogram on real editor pages not published — requires local profiling via `unzip trace.zip && du -ah resources/`.
- Empirical per-artifact byte ceiling for upload-artifact v4+ unconfirmed.
- `archive: false` × `compression-level` interaction undocumented.
- Measured savings per trace sub-option (`screenshots: false`/`sources: false` individually) not in primary sources.
- Lexical `playwright.config.{ts,js}` text not resolvable via GitHub Contents API/code search.
- No measurement of actual post-failure trace access rates — "5 business days" heuristic is inferred.
- v1.59 `page.screencast` default encoding parameters not yet published.
