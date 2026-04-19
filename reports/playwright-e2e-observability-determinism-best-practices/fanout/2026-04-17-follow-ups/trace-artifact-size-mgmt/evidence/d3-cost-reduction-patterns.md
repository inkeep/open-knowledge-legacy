---
dimension: Cost-Reduction Patterns
date: 2026-04-16
sources: playwright.dev, github.com/microsoft/playwright, github.com/actions/upload-artifact, Testrig case study
---

# Evidence: Cost-Reduction Patterns

**Dimension:** D3 — Cost-Reduction Patterns (P0 Moderate)
**Date:** 2026-04-16

## Key sources referenced
- [Playwright TestOptions](https://playwright.dev/docs/api/class-testoptions)
- [Playwright CI intro](https://playwright.dev/docs/ci-intro)
- [Playwright Videos](https://playwright.dev/docs/videos)
- [Playwright Sharding](https://playwright.dev/docs/test-sharding)
- [microsoft/playwright#29531](https://github.com/microsoft/playwright/issues/29531) — retain-on-first-failure mode
- [microsoft/playwright#29218](https://github.com/microsoft/playwright/issues/29218) — reduce trace sizes (closed P3)
- [microsoft/playwright#32405](https://github.com/microsoft/playwright/issues/32405) — trace sub-option parity
- [actions/upload-artifact issue #36](https://github.com/actions/upload-artifact/issues/36) — archive uploads discussion
- [GitHub Community Discussion #166576](https://github.com/orgs/community/discussions/166576) — artifact storage management
- [WordPress/gutenberg PR #45187](https://github.com/WordPress/gutenberg/pull/45187) — fix artifact uploading
- [Testrig — Reduced Playwright Artifact Storage by 60%+](https://www.testrigtechnologies.com/how-testrig-reduced-playwright-test-artifact-storage-by-more-than-60-real-ci-cd-insights/)

---

## Patterns

### Pattern 1: `trace: 'on-first-retry'` (Playwright CI default recommendation)
**Config:**
```ts
use: { trace: 'on-first-retry' }
```
**Savings:** In a ~1–5% flake-rate CI, produces traces for ~1–5% of runs vs `'on'` at 100%.
**Tradeoff:** No trace on *first* failing attempt — only the retry. Requires `retries > 0`. With `retries: 0`, use `retain-on-failure`.
**Source:** Playwright TestOptions docs + CI intro

### Pattern 2: `trace: 'retain-on-failure'` (no-retry CI)
**Config:**
```ts
use: { trace: 'retain-on-failure' }
```
**Savings:** Full trace-recording runtime on every test; artifact upload only for failed tests (~<5% typically).
**Tradeoff:** Pays runtime cost of recording on all tests. Disk I/O cost paid; storage cost not.
**Source:** Playwright TestOptions docs

### Pattern 3: Selective trace sub-options
**Config:**
```ts
use: {
  trace: {
    mode: 'retain-on-failure',
    snapshots: true,
    screenshots: false,
    sources: false
  }
}
```
**Savings:** Not quantified in primary sources. Screenshots build the per-action filmstrip; disabling typically saves 30–60% on interactive tests (inferred from trace-internals structure). `sources: false` removes embedded test files from each trace zip.
**Tradeoff:** `snapshots: false` makes Trace Viewer near-useless (no DOM time-travel). `screenshots: false` loses filmstrip. `sources: false` breaks source-line jumps but safe for most debugging.
**Source:** Playwright TestOptions docs; issue #32405

### Pattern 4: `video: 'retain-on-failure'` with resolution override
**Config:**
```ts
use: {
  video: {
    mode: 'retain-on-failure',
    size: { width: 640, height: 480 }
  }
}
```
**Measured savings (one case study):** Average video 9 MB → 2.7 MB (70% reduction); overall disk usage >60% reduction (video was >60% of disk).
**Tradeoff:** Reduced sharpness; small fonts/icons harder to read. Case study: "sufficient for UI bug diagnosis."
**Source:** Testrig case study; Playwright Videos docs

### Pattern 5: `screenshot: 'only-on-failure'`
**Config:**
```ts
use: { screenshot: 'only-on-failure' }
```
**Measured savings (case study):** 850 KB → 420 KB per screenshot (51% reduction, combined with viewport-only capture).
**Tradeoff:** No visual baseline on passing tests.
**Source:** Testrig case study; Playwright TestOptions docs

### Pattern 6: `if: failure()` / `if: ${{ !cancelled() }}` gating
**Config:**
```yaml
- uses: actions/upload-artifact@v7
  if: ${{ !cancelled() }}   # or: if: failure()
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 30
```
**Savings:** `if: failure()` uploads 0 bytes on green runs. 95%-green pipeline keeps ~5% of artifact bytes vs `always()`.
**Tradeoff:** `if: failure()` skips when an *earlier* step failed (install, lint). `!cancelled()` uploads on both pass + fail, skips cancel. Pair with `retain-on-failure` trace to keep evidence only when needed.
**Source:** Playwright CI intro; WordPress/gutenberg PR #45187

### Pattern 7: Tiered `retention-days` per purpose
**Config:**
```yaml
- uses: actions/upload-artifact@v7
  with:
    name: blob-report-${{ matrix.shardIndex }}
    path: blob-report
    retention-days: 1
- uses: actions/upload-artifact@v7
  with:
    name: html-report--attempt-${{ github.run_attempt }}
    path: playwright-report
    retention-days: 14
```
**Savings:** Blob intermediates evicted in 1 day — steady-state ≈ 1/14 of a flat 14-day plan. 6-shard × 50 MB × 14d → 4.2 GB; with 1d blobs → ~0.3 GB.
**Tradeoff:** Cannot re-merge after 1 day; re-run required.
**Source:** Playwright sharding docs

### Pattern 8: `compression-level` tuning
**Config:**
```yaml
- uses: actions/upload-artifact@v7
  with:
    compression-level: 9   # text-heavy (HTML report)
    # compression-level: 0 for pre-compressed (trace.zip, .webm)
```
**Savings:** Level 9 shrinks text-heavy payloads; level 0 on pre-compressed avoids double-work (faster upload).
**Tradeoff:** Level 9 adds runner CPU time (minimal).
**Source:** upload-artifact README

### Pattern 9: Pre-upload `tar -czf` bundling
**Config:**
```yaml
- name: Tar test-results
  if: failure()
  run: tar -czf test-results.tar.gz test-results/
- uses: actions/upload-artifact@v7
  if: failure()
  with:
    name: playwright-test-results
    path: test-results.tar.gz
```
**Measured savings (community report):** 900 MB directory → 175 MB tar.gz; upload time 1.5h → 25s. Primary gain: per-file upload overhead collapses to a single stream.
**Tradeoff:** Lose GitHub UI browse-individual-files view; reviewers need `tar -xzf` locally. Best for dirs with many small files (HTML report).
**Source:** upload-artifact issue #36; community discussion #166576

### Pattern 10: Selective `path:` glob for failed attempts only
**Config:**
```yaml
- uses: actions/upload-artifact@v7
  if: failure()
  with:
    name: failed-shard-${{ matrix.shardIndex }}
    path: |
      test-results/**/*-retry*/trace.zip
      test-results/**/*-retry*/video.webm
      playwright-report/
    if-no-files-found: ignore
```
**Savings:** `*-retry*` glob matches only retry-attempt subdirectories (Playwright names retries `-retry1`, `-retry2`), excluding first-attempt outputs.
**Tradeoff:** Trickier config; `if-no-files-found: ignore` required.
**Source:** upload-artifact README; Playwright sharding docs

### Pattern 11: Matrix sharding
**Config:**
```yaml
strategy:
  matrix:
    shardIndex: [1, 2, 3, 4]
    shardTotal: [4]
steps:
  - run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
  - uses: actions/upload-artifact@v7
    with:
      name: blob-${{ matrix.shardIndex }}-of-${{ matrix.shardTotal }}
      path: blob-report
      retention-days: 1
```
**Savings:** Cap-avoidance (not reduction). Distributes across N distinct artifact names.
**Tradeoff:** Merge job required (`playwright merge-reports`).
**Source:** Playwright sharding docs

### Pattern 12: FFmpeg post-encode of failed videos
**Config:**
```yaml
- name: Recompress failure videos
  if: failure()
  run: |
    find test-results -name "*.webm" -exec \
      ffmpeg -i {} -c:v libx264 -crf 25 -preset fast {}.mp4 \;
```
**Measured savings (one source):** Additional ~50% beyond the 640×480 downsize.
**Tradeoff:** Adds 2–3 min to pipeline per shard. Changes format `.webm` → `.mp4`. Requires ffmpeg in runner (ubuntu-latest ships it).
**Source:** Testrig case study

---

## Negative searches

- Measured per-sub-option (`snapshots`/`screenshots`/`sources: false`) savings not in primary sources.
- No Playwright-native trace-compression-level option (#29218 closed P3).
- No built-in per-branch retention; requires ternary `${{ github.ref == 'refs/heads/main' && 30 || 3 }}`.

## Gaps

- Trace-component breakdown (% savings per sub-option disabled) requires local measurement; unpublished.
- `retain-on-first-failure` (v1.43+, #29531) cost profile at scale not yet blogged.
- Only one end-to-end measured-savings source (Testrig) located; a second would strengthen confidence on Pattern 4.
