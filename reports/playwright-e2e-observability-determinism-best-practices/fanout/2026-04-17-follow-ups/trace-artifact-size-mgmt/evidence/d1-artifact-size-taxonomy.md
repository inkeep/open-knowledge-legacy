---
dimension: Artifact Size Taxonomy
date: 2026-04-16
sources: playwright.dev, github.com/microsoft/playwright issues, Momentic blog
---

# Evidence: Artifact Size Taxonomy

**Dimension:** D1 — Artifact Size Taxonomy (P0 Deep)
**Date:** 2026-04-16

## Key sources referenced
- [Playwright Trace Viewer docs](https://playwright.dev/docs/trace-viewer) — trace.zip internal layout
- [Playwright Videos docs](https://playwright.dev/docs/videos) — viewport/size semantics
- [Playwright issue #8263 — Smaller trace files](https://github.com/microsoft/playwright/issues/8263) — user request, bounds discussion
- [Playwright issue #29218 — Reduce sizes of screenshots and trace files](https://github.com/microsoft/playwright/issues/29218) — closed P3 without implementation
- [Playwright issue #31424 — Video quality control](https://github.com/microsoft/playwright/issues/31424) — VP8 bitrate hardcoded
- [Playwright issue #20157 — Large uploads and trace performance](https://github.com/microsoft/playwright/issues/20157) — multi-GB trace reports
- [Playwright issue #12056 — Configure video quality](https://github.com/microsoft/playwright/issues/12056)
- [Momentic Trace Viewer Guide](https://momentic.ai/blog/the-ultimate-guide-to-playwright-trace-viewer-master-time-travel-debugging) — 47 MB complex-app anecdote

---

## Findings

### Finding: trace.zip decomposes into four top-level entries
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/trace-viewer
> "trace.trace — Records of actions and events · trace.network — Network request and response data · trace.stacks — JavaScript stack traces · resources/ — Snapshots, screenshots, and source files."

**Implications:** `resources/` is typically the size-dominant entry; profiling via `unzip trace.zip && du -ah resources/` reveals per-category cost.

### Finding: Three DOM snapshots per action (Before / Action / After)
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/trace-viewer
> "Complete DOM snapshots for each action" — Before (when action is called), Action (at moment of input), After (following the action)

**Implications:** Action count is a direct multiplier. A 50-action test ≈ 150 snapshots; for an editor with a large ProseMirror/Y.Doc-bound DOM, each snapshot can reach hundreds of KB.

### Finding: Reported trace.zip sizes range 1–50 MB typical, 47 MB+ for complex apps
**Confidence:** INFERRED (community-reported)
**Evidence:** Issue #8263 user quote — "I propose to exclude large network requests to JS and CSS files from trace zip file. They can be quite large." Momentic guide — "trace files can become large (47MB or more for complex applications)."

**Implications:** 1–50 MB is a credible planning range for standard apps; collaborative editors with WebSocket + Y.Doc serialization land in the upper half.

### Finding: File-upload test pages push trace.zip to multiple GB
**Confidence:** CONFIRMED (issue text; user-reported but direct evidence)
**Evidence:** https://github.com/microsoft/playwright/issues/20157
> "Uploading large files like CT scans (~180 MB per scan)" — "Playwright traces can become multiple gigabytes in size"; separate report — "trace .zip files up to 135 MB" with "trace.trace file itself being 367 MB" uncompressed internal.

**Implications:** Network-body capture is unbounded. E2E suites that round-trip large payloads need per-request filtering or must fall back to `retain-on-failure`.

### Finding: Video defaults — WebM container, VP8 codec, 1 Mbit/s bitrate (Chromium path)
**Confidence:** CONFIRMED
**Evidence:** https://github.com/microsoft/playwright/issues/31424
> "Target bitrate = 1Mbit/s is hardcoded"; ffmpeg args: `-c:v vp8 -b:v 1M -threads 1 -qmin 0 -qmax 50 -crf 8 -deadline realtime -speed 8`

**Implications:** Video grows at ~125 KB/s = 7.5 MB/min regardless of content activity. Duration, not viewport, is the size driver.

### Finding: Video resolution defaults to viewport scaled to fit 800×800
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/videos
> "The video size defaults to the viewport size scaled down to fit 800x800."

**Implications:** Default viewport 1280×720 renders at ~800×450. To keep full 1280×720, explicitly set `video: { size: { width: 1280, height: 720 } }` — roughly doubles size.

### Finding: Video bitrate is not publicly configurable
**Confidence:** CONFIRMED
**Evidence:** Issues #31424, #12056, #10855, #4266 — "Video recording only has mode and size options, and it's not possible to configure quality"

**Implications:** For long-running tests, video-duration linearity cannot be mitigated without shorter tests or `retain-on-failure` mode.

### Finding: Screenshots default to PNG; full-page optional
**Confidence:** CONFIRMED
**Evidence:** Playwright API docs (page.screenshot); v1.41 release notes for `style` option
**Implications:** 1280×720 desktop PNG typically 50–300 KB; full-page long docs can reach 1–2 MB. `type: 'jpeg'` with `quality` cuts 5–10× when lossy is acceptable.

### Finding: Trace recording modes trade coverage vs. cost
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/trace-viewer — five modes: `off`, `on` (not recommended), `on-first-retry` (CI default), `on-all-retries`, `retain-on-failure`; v1.43 added `retain-on-first-failure`

**Implications:** Docs explicitly discourage `'on'` in CI due to runtime cost. `on-first-retry` records zero traces on first-attempt pass.

---

## Negative searches

- "Playwright video H.264 mp4 default" → no hits; VP8/WebM is the only supported codec path.
- "Playwright trace compression level option" → issue #29218 closed without implementation.
- "Playwright screenshot default JPEG" → PNG remains default.

## Gaps

- Exact PNG size distribution per viewport × content density is not published — requires suite-specific measurement.
- Per-action DOM-snapshot size histogram on real-world apps is unpublished.
- Firefox/WebKit video paths likely differ from Chromium (they use native APIs, not ffmpeg) — bitrate specifics not visible.
- Whether `resources/` entries are individually DEFLATE-compressed inside the outer ZIP is unconfirmed; the 367 MB uncompressed / 135 MB compressed ratio in #20157 suggests heavy compression.
