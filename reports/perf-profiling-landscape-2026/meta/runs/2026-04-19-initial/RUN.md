# Run: 2026-04-19-initial

**Status:** Active
**Orchestrator:** /research (supervised mode)
**Started:** 2026-04-19

## Purpose

Initial harvest for the 10-dimension rubric. Five parallel subagents, each owns 2 related dimensions. Primary-source evidence only — orchestrator synthesizes REPORT.md from worker findings.

## Delta rubric (all dimensions are fresh — no prior coverage)

| # | Dimension | Owner (subagent) | Priority | Depth |
|---|-----------|------------------|----------|-------|
| D1 | React 19 + React Compiler profiling | W1 | P0 | Deep |
| D2 | Browser main-thread tracing | W1 | P0 | Deep |
| D3 | Web Vitals + INP | W2 | P0 | Moderate |
| D4 | Bundle analysis (Vite + Rolldown + React Compiler) | W2 | P0 | Deep |
| D5 | CRDT / Yjs / Hocuspocus profiling | W3 | P0 | Deep |
| D6 | Editor OSS perf harnesses | W3 | P0 | Deep |
| D7 | Node.js tracing for long-lived WebSocket servers | W4 | P1 | Moderate |
| D9 | Memory profiling + leak detection | W4 | P1 | Moderate |
| D8 | CI-gated perf regression patterns | W5 | P0 | Deep |
| D10 | OpenTelemetry readiness (frontend + Node) | W5 | P1 | Moderate |

## Source anchors

Primary (code-first where available):
- `~/.claude/oss-repos/tldraw`, `excalidraw`, `blocksuite`, `zed`, `silverbullet`, `lexical`, `plate`, `outline`, `react-scan`, `bippy`, `million`, `yjs`, `y-prosemirror`, `y-codemirror.next`, `hocuspocus`, `tiptap`, `automerge-prosemirror`

Secondary (web-first):
- react.dev (React 19.2 Performance Tracks), web.dev (INP), perfetto.dev, chrome DevTools docs, Playwright 1.57+ docs, OpenTelemetry JS docs, RelativeCI, DebugBear, Shopify Web Perf blog, Figma engineering blog, Notion engineering blog, Vercel, Sentry Profiling docs, dmonad/crdt-benchmarks, automerge/automerge-perf

Tool releases / posts since mid-2025 (already surfaced):
- React 19.2 Performance Tracks (late 2025) — react.dev
- Playwright 1.58 Speedboard (2026) — official changelog
- Playwright 1.57 Chrome for Testing default (late 2025)
- @relative-ci/rollup-plugin Vite+Rolldown (2026-03-07)
- INP stable CWV (2024, dominant 2025/26)

## Confidence ceilings (research-wide)

- Library API claims: MEDIUM without web-verification of current docs
- Version-specific claims: LOW without confirming version from manifest/lockfile
- Production-readiness claims by vendors: always flag "vendor-promoted about own product"

## Evidence file targets (orchestrator-owned)

- `evidence/react-compiler-profiling.md` — D1
- `evidence/browser-main-thread-tracing.md` — D2
- `evidence/web-vitals-inp-measurement.md` — D3
- `evidence/bundle-analysis-vite-rolldown.md` — D4
- `evidence/crdt-yjs-profiling.md` — D5
- `evidence/editor-oss-perf-harnesses.md` — D6
- `evidence/node-server-tracing.md` — D7
- `evidence/memory-profiling-leak-detection.md` — D9
- `evidence/ci-gated-perf-regression.md` — D8
- `evidence/opentelemetry-readiness.md` — D10

## Subagent contract

All subagents return structured Markdown (NOT evidence files — orchestrator writes those). Shape:

```
## Dimension: <name>
**Primary question:** …

### Finding: <declarative statement>
**Confidence:** CONFIRMED | INFERRED | UNCERTAIN | NOT FOUND
**Evidence:**
- <file:line-range OR URL> — <primary-source snippet in code block>
**Implications:** <what this means>

### Finding: …
…

## Terminology (new this dimension)
- <term>: <gloss>

## Divergences / open questions
- …

## Sources (all URLs cited above, de-duped)
- URL — one-line description
```

No evaluation. No "recommend X". Primary-source snippets for every CONFIRMED finding.
