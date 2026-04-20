---
dimension: Trace Format Evolution 1.40+
date: 2026-04-16
sources: playwright.dev/docs/release-notes, github.com/microsoft/playwright
---

# Evidence: Trace Format Evolution (1.40+)

**Dimension:** D6 — Trace Format Evolution (P1)
**Date:** 2026-04-16

## Key sources referenced
- [Playwright Release Notes](https://playwright.dev/docs/release-notes) — primary source, scanned end-to-end
- Playwright GitHub issue tracker

---

## Findings

### Finding: v1.43 added `retain-on-first-failure` trace mode
**Confidence:** CONFIRMED
**Evidence:** Release notes (v1.43)
> "New mode `retain-on-first-failure` for testOptions.trace — trace is recorded for the first run of each test, but not for retries."

**Implications:** Removes retry-trace bytes for passing-after-retry tests while preserving first-failure traces. Net reduction depends on flakiness rate.

### Finding: v1.49 added `tracing.group()` and canvas snapshot previews
**Confidence:** CONFIRMED
**Evidence:** Release notes (v1.49)
> "New method tracing.group() to visually group actions in the trace." "`<canvas>` elements inside a snapshot now draw a preview."

**Implications:** `tracing.group()` is metadata-only (negligible size). Canvas preview rendering adds minor size per canvas-containing snapshot.

### Finding: v1.50 disabled canvas-content display by default
**Confidence:** CONFIRMED
**Evidence:** Release notes (v1.50)
> "Display of `canvas` content in traces is error-prone. Display is now disabled by default, and can be enabled via the Display canvas content UI setting." "Additional details (such as keys pressed) are now displayed alongside action API calls in traces."

**Implications:** Capture cost unchanged (display-side default); key-press metadata marginally grows `trace.trace`.

### Finding: v1.53 introduced "New Steps" in Trace Viewer + HTML reporter
**Confidence:** CONFIRMED
**Evidence:** Release notes (v1.53) — "New Steps in Trace Viewer and HTML reporter"
**Implications:** UI-level metadata enhancement; size impact not quantified by Playwright.

### Finding: v1.59 introduced CLI trace analysis tools + unified `page.screencast` API
**Confidence:** CONFIRMED
**Evidence:** Release notes (v1.59)
> "New CLI trace analysis tools for agents…`npx playwright trace actions --grep`, `npx playwright trace action`, and `npx playwright trace snapshot`." "New page.screencast API provides a unified interface for capturing page content." "Option `artifactsDir` in browserType.launch() to configure the artifacts directory."

**Implications:**
- CLI trace commands are first-class agent-facing affordances (inspect trace without GUI viewer)
- `artifactsDir` consolidates artifact placement for CI cleanup
- `page.screencast` is a superset of the prior video recording surface — new quality controls likely arrive on this API rather than retrofitted onto `video:`.

### Finding: No in-place compression changes for trace.zip across 1.40–1.59
**Confidence:** INFERRED (negative search)
**Evidence:** Release notes scanned end-to-end — no entries match `compress`, `gzip`, `zstd`, `format`, `deflate`.
**Implications:** ZIP + DEFLATE format is stable; artifact-size optimization is mode-based (retain-on-failure family), not format-based. User request for compression-level control (#29218) closed P3 without implementation.

---

## Negative searches

- "Playwright trace format 1.40 breaking changes" → no release-note entries; trace.zip format stable across 1.40→1.59.
- "Playwright trace compression level option" → #29218 closed without resolution.

## Gaps

- Post-1.53 authoritative size impact numbers for "Steps" metadata not quantified.
- v1.59 `page.screencast` default encoding parameters not yet published in release notes.
- Trace format spec (ZIP internals, DEFLATE settings) not officially documented for third-party tool authors.
