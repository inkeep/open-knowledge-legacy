# Evidence: D3 — Web Vitals + INP measurement

**Dimension:** D3 — Current (late 2025 / early 2026) state of Web Vitals measurement for a complex interactive React editor, focusing on INP (which replaced FID as a Core Web Vital in March 2024) and how to measure it across lab + field.
**Date:** 2026-04-19
**Sources:** web.dev (INP, FID, TBT, optimize-inp), GoogleChrome/web-vitals repo + CHANGELOG, W3C Event Timing draft, Vercel Speed Insights docs, Sentry Performance docs, Palette/Notion typing-latency post, Shopify 2026 Web Perf Tools, Next.js useReportWebVitals

---

## Key pages / files referenced

- https://web.dev/articles/inp (last updated 2025-09-02)
- https://web.dev/articles/fid
- https://web.dev/articles/tbt
- https://web.dev/articles/optimize-inp
- https://github.com/GoogleChrome/web-vitals (README + CHANGELOG)
- https://www.w3.org/TR/event-timing/ (Working Draft 2026-03-19)
- https://vercel.com/docs/speed-insights/metrics
- https://docs.sentry.io/product/insights/web-vitals/
- https://palette.dev/blog/improving-notion-typing-performance
- https://performance.shopify.com/blogs/blog/web-performance-tools-for-2026
- https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals (Next.js 16.2.4)

---

## Findings

### Finding: INP replaced FID as a Core Web Vital on 2024-03-12; FID support ended 2024-09-09

**Confidence:** CONFIRMED

**Evidence:**
- https://web.dev/articles/fid — `"support for FID ended on September 9, 2024"`, FID `"has been replaced by the Interaction to Next Paint (INP) metric"`, and `"You should now focus on INP."`
- https://web.dev/articles/inp (Last updated 2025-09-02) — `"INP is a metric that assesses a page's overall responsiveness to user interactions by observing the latency of all click, tap, and keyboard interactions that occur throughout the lifespan of a user's visit to a page."`

**Implications:** Any tool or rubric built before mid-2024 that only tracks FID is out-of-date; INP is the current responsiveness Core Web Vital.

---

### Finding: INP thresholds are Good ≤200 ms, Needs-Improvement 200–500 ms, Poor >500 ms; scored at 75th percentile with high-interaction outlier reduction

**Confidence:** CONFIRMED

**Evidence:**
- https://web.dev/articles/inp — `"Good: INP at or below 200 milliseconds; Needs improvement: above 200ms and at or below 500 milliseconds; Poor: above 500 milliseconds"`; `"for pages with large numbers of interactions, random hiccups can result in an unusually high-latency interaction … ignores one highest interaction for every 50 interactions, with the 75th percentile of all page views ultimately reported"`
- https://vercel.com/docs/speed-insights/metrics — `"an INP time of 200 milliseconds or less being considered good"` (table restates the same thresholds)

**Implications:** The 200 ms "good" budget on a complex editor with synchronous ProseMirror/Yjs transactions is the practical ceiling for keystroke-to-next-paint on median user hardware.

---

### Finding: `web-vitals` v5.2.0 (2026-03-25) is the current production version; v5.0.0 (2025-05-07) removed `onFID()` and raised browser baseline

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/GoogleChrome/web-vitals/blob/main/CHANGELOG.md —
  - v5.2.0 (2026-03-25): `"Use LargestContentfulPaint.id as fallback when element is removed from DOM"`, `"Add includeProcessedEventEntries option"`;
  - v5.0.0 (2025-05-07): `"Remove the deprecated onFID() function"`, `"Change browser support policy to Baseline Widely available"`, `"Extend INP attribution with extra LoAF information: longest script and buckets"`, `"Sort the classes that appear in attribution selectors to reduce cardinality"`
- https://www.npmjs.com/package/web-vitals (via WebSearch result) — `"the latest version of web-vitals is 5.2.0, which was last published 22 days ago (as of April 19, 2026)"`

**Implications:** Upgrading past v5.0 drops support for FID consumers and narrows browser-compat surface; LoAF (Long Animation Frame) data now flows through the attribution build.

---

### Finding: `web-vitals` exposes five callback APIs + an attribution sub-build; `onINP` takes `reportAllChanges` and `durationThreshold`

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/GoogleChrome/web-vitals/blob/main/README.md — `"function onINP(callback: (metric: INPMetric) => void, opts?: INPReportOpts): void;"` with `"reportAllChanges?: boolean"` and `"durationThreshold?: number"`; `Metric` shape `"name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB'; value: number; rating: 'good' | 'needs-improvement' | 'poor'; delta: number; id: string; entries: PerformanceEntry[]; navigationType: 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender' | 'restore'"`
- https://github.com/GoogleChrome/web-vitals — attribution build: `"import {onCLS, onINP, onLCP} from 'web-vitals/attribution';"`, `"slightly larger than the standard build (by about 1.5K, brotli'd)"`
- https://github.com/GoogleChrome/web-vitals — send pattern: `"navigator.sendBeacon('/analytics', body);"` with JSON payload `{name, value, id}`

**Implications:** Attribution build is the production path to answer "which event caused my 480 ms INP"; standard build gives the number but not the culprit element/script.

---

### Finding: PerformanceObserver with `type: 'event'` and `durationThreshold` is the underlying W3C primitive; default threshold is 104 ms, minimum floor 16 ms

**Confidence:** CONFIRMED

**Evidence:**
- https://www.w3.org/TR/event-timing/ (Working Draft, 2026-03-19) — `"If options is not present or if options's durationThreshold is not present, let minDuration be 104"`; `"the threshold becomes the maximum between 16 and the provided value"`; example `"observer.observe({ type: 'event', buffered: true, durationThreshold: 40 });"`
- `PerformanceEventTiming` exposes `processingStart`, `processingEnd`, `interactionId`

**Implications:** Custom RUM can skip the library entirely and observe Event Timing directly; `durationThreshold: 40` is the sweet spot to catch INP-class events without noise from fast taps.

---

### Finding: Lighthouse cannot produce INP; TBT is the accepted lab proxy, INP is field-only

**Confidence:** CONFIRMED

**Evidence:**
- https://web.dev/articles/tbt — `"TBT predates INP and is useful as an indicator of INP issues, particularly in the lab environment where measuring INP is more difficult."`; `"we recommend measuring INP in the field as a measure of actual responsiveness issues as experienced by users. TBT may be a reasonable proxy metric for INP for the lab but it's not a substitute for INP in and of itself."`; `"TBT is a metric that should be measured in the lab. The best way to measure TBT is to run a Lighthouse performance audit on your site."`

**Implications:** A CI-gated perf setup needs both layers: Lighthouse/TBT for synthetic regression gates, real-user telemetry (CrUX, Sentry, custom beacon) for INP truth.

---

### Finding: Notion publicly adopted Palette's "Keydown to Paint" metric after finding their internal keypress→React-render latency was ~10× lower than perceived

**Confidence:** CONFIRMED

**Evidence:**
- https://palette.dev/blog/improving-notion-typing-performance — Notion's internal `typing_lag` measured `"latency from keypress to React render"`; Palette's KP metric measures `"the perceived latency by measuring latency from the hardware keypress timestamp to the browser's visual update (Paint)"`; `"typing_lag was almost 10x lower than the true perceived latency"`
- Sample config: `"profiler.on(['paint.click', 'paint.keydown', 'paint.scroll', 'markers.measure', 'events.load', 'events.dcl'], { sampleInterval: 10, maxBufferSize: 100_000 });"`
- Impact: `"15% reduction in p75 KP latency"` by removing unnecessary polyfills in the critical render path and memoizing cookie parsing

**Implications:** For a CRDT editor, "keypress → React render" (which is close to Notion's original `typing_lag`) is not the user-perceived number; the real target is keypress timestamp → next paint, which is what INP plus Event Timing's `processingStart`/`processingEnd` directly expose. Palette is a vendor offering; Notion's technique (hardware-stamp-to-paint) is reproducible without it using `event.timeStamp` + `PerformanceEventTiming`.

---

### Finding: Shopify's 2026 web-perf tooling post stays within its own product ecosystem; does not recommend third-party RUM

**Confidence:** CONFIRMED

**Evidence:**
- https://performance.shopify.com/blogs/blog/web-performance-tools-for-2026 — recommends `"Shopify RUM Data"`, `"Chrome DevTools Performance Panel"`, `"Shopify CLI"`, `"AI + MCP Tools"`, `"Sidekick"`; distinguishes lab and field: `"Lab tests have their place for debugging and controlled experiments, but they can't capture the diversity of devices, networks, and conditions that your actual users experience."`; notes `"Safari exposes LCP and INP metrics"` as new (enabling Core Web Vitals across all major browsers)
- No third-party vendors (Sentry, DebugBear, Datadog, LogRocket, New Relic, Vercel, Cloudflare) are mentioned

**Implications:** Vendor-incentive bias: Shopify's post is first-party scoped. For 3P parity, the same moving parts (lab panel + field RUM + AI-assisted trace triage) exist across the stack; the post confirms the pattern, not specific tools.

---

### Finding: Vercel Speed Insights uses real-user beaconing, collects up to 6 data points per visit including INP on page-leave, reports P75 by default

**Confidence:** CONFIRMED

**Evidence:**
- https://vercel.com/docs/speed-insights/metrics — `"RES uses real data points collected from your users' devices"`; `"On leave: Interaction to Next Paint (INP), Cumulative Layout Shift (CLS), and, if not already sent, Largest Contentful Paint (LCP)"`; `"By default, the user experience percentile is set to P75"` with P90/P95/P99 available
- FID is still tracked alongside INP in the Vercel metric table

**Implications:** Vendor RUM that conforms to the `web-vitals` library shape is drop-in compatible with any other reporter — the `Metric` type is effectively the industry contract.

---

### Finding: Sentry captures INP with a 30% weight in its Performance Score, LCP thresholds differ desktop/mobile

**Confidence:** CONFIRMED

**Evidence:**
- https://docs.sentry.io/product/insights/web-vitals/ — `"interactions contribute to INP (Interaction to Next Paint)"` with `"30% weight in the Performance Score calculation on both desktop and mobile browsers, with a 'Good' threshold of 200ms or less"`; LCP thresholds `"on desktop, a score of 'Good (90+)' requires LCP under 1200ms, while 'Meh (50+)' allows up to 2400ms"`

**Implications:** Sentry's score weights are vendor-specified, not a web-standard; they're comparable between Sentry projects but not directly with CrUX buckets.

---

### Finding: Next.js ships the `useReportWebVitals` hook backed by the `web-vitals` library; no equivalent exists in React proper

**Confidence:** CONFIRMED

**Evidence:**
- https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals (Next.js 16.2.4, 2026-04-15) — `"import { useReportWebVitals } from 'next/web-vitals'"`; metric shape matches `web-vitals` library (`id`, `name`, `delta`, `entries`, `navigationType`, `rating`, `value`); `"Possible values are 'good', 'needs-improvement', and 'poor'"`; metric `name` covers `"TTFB, FCP, LCP, FID, CLS"` and `"Interaction to Next Paint (INP)"`
- https://react.dev/reference/react/useReportWebVitals — 404 (confirms no core-React hook)

**Implications:** For a Vite-based app, the Next.js hook is not available; the integration is `onINP`/`onLCP`/etc. directly from `web-vitals`.

---

## Terminology (D3)

- **INP (Interaction to Next Paint):** Stable Core Web Vital since 2024-03-12 (FID support ended 2024-09-09). Measures latency from user interaction to next frame paint. Field-only metric.
- **TBT (Total Blocking Time):** Lab-measurable sum of main-thread blocking time after FCP for tasks >50 ms. Used by Lighthouse as INP proxy but not a substitute.
- **Event Timing API:** W3C Working Draft (2026-03-19) underlying `PerformanceObserver({type:'event', durationThreshold})`. Default threshold 104 ms, minimum 16 ms.
- **LoAF (Long Animation Frame):** Data included in INP attribution as of `web-vitals` v5.0.0 (2025-05-07) — `"longest script and buckets"`.
- **Keydown to Paint (KP):** Palette/Notion metric measuring hardware-keypress-timestamp → browser paint. Distinct from internal "keypress → React render" metrics which can be ~10× lower than perceived latency.

## Gaps / follow-ups

- Exact CrUX methodology page (75th percentile, 28-day rolling, origin-level) did not return the canonical phrasing from https://developer.chrome.com/docs/crux/methodology — the Vercel Speed Insights doc corroborates P75 as default but for Vercel's own aggregation, not CrUX.
- DebugBear's INP-debugging page 404'd.

## Sources (de-duped)

- https://web.dev/articles/inp — INP definition, thresholds, 75th percentile computation (updated 2025-09-02)
- https://web.dev/articles/fid — FID deprecation date (2024-09-09), INP replacement
- https://web.dev/articles/tbt — TBT as lab proxy for INP; lab vs field distinction
- https://web.dev/articles/optimize-inp — referenced for INP optimization guidance
- https://www.w3.org/TR/event-timing/ — Event Timing API WD (2026-03-19); `durationThreshold` default 104 ms, minimum 16 ms
- https://github.com/GoogleChrome/web-vitals — library README: onINP/onLCP/onCLS/onFCP/onTTFB + attribution build
- https://github.com/GoogleChrome/web-vitals/blob/main/CHANGELOG.md — v5.2.0 (2026-03-25), v5.1.0 (2025-07-31), v5.0.0 (2025-05-07)
- https://www.npmjs.com/package/web-vitals — current version 5.2.0
- https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals — Next.js 16.2.4 hook
- https://vercel.com/docs/speed-insights/metrics — Vercel Speed Insights, P75 default, 6-data-point collection
- https://docs.sentry.io/product/insights/web-vitals/ — Sentry Performance Score weights (INP 30%)
- https://palette.dev/blog/improving-notion-typing-performance — Notion's KP adoption, 15% p75 win, profiler config
- https://performance.shopify.com/blogs/blog/web-performance-tools-for-2026 — Shopify 2026 perf toolset; vendor-first-party scope
