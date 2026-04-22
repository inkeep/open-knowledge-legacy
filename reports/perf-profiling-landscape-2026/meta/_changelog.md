# Changelog — perf-profiling-landscape-2026

Append-only process history. Orchestrator-owned.

---

## 2026-04-19 — Initial report + audit resolution

### Initial harvest (2026-04-19-initial run)

- Worldmodel (light): `perf-tooling-landscape` topic — 10-dimension rubric confirmed by user, no Open-Knowledge-specific overlap in existing reports (`crdt-observer-bridge-latency-analysis` is 1P companion; `otel-local-dev-viewers` is aborted with only evidence/).
- 5 parallel research subagents, each covering 2 dimensions. Deep research mode per `/research` skill protocol.
- Evidence files written for all 10 dimensions from worker findings + primary-source traces.
- REPORT.md synthesized across dimensions with implications / decision triggers / remaining uncertainty per dimension. Stance: factual, 3P-external per user feedback memory "research reports stay portable."

### Audit (2026-04-19)

`/audit` dispatched via general-purpose subagent reading the artifact cold. 12 findings (2 High, 6 Medium, 4 Low) written to `meta/audit-findings.md`. See that file for full details.

### Audit resolution via `/assess-findings` methodology

Classifications per Phase 4 of `eng:assess-findings`:

| Finding | Classification | Action | Resolution type |
|---|---|---|---|
| F1 — 332,702 vs 259,778 B4 conflation | Valid bug (factual error) | Fix | Sharpen — REPORT.md Exec Summary + §D5 now distinguish `automerge-perf` total (332,702 incl. cursor moves) from `crdt-benchmarks` B4 subset (259,778 insert+delete ops) |
| F2 — Elastic/Sentry/OneUptime overreach in exec summary | Valid improvement (recalibrate) | Fix | Recalibrate — REPORT.md Exec Summary + §D10 now separate OneUptime (contradicts upstream) from Elastic (reproduces caveat) from Sentry (separate OTLP-ingestion topic) |
| F3 — Performance Tracks conditionality flattened | Valid improvement (add conditions) | Fix | Add conditions — Exec Summary Para 1 now carries "Scheduler track default; Components track requires `<Profiler>` or DevTools extension; Server tracks dev-only" |
| F4 — "tldraw is the outlier" overreach | Valid improvement (sharpen) | Fix | Sharpen — Exec Summary Para 2 now includes Silverbullet (vitest bench) + Zed (hyperfine) + Excalidraw/Outline (bundle-size) patterns; tldraw scoped specifically to "full Playwright-orchestrated full-DOM FPS harness" |
| F5 — CodSpeed full-DOM overreach | Valid improvement (add conditions) | Fix | Add conditions — Exec Summary Para 3 now states CodSpeed applies to "micro-benchmarks only; full-DOM Playwright-orchestrated FPS gates still require dedicated-runner + production-build + serial-execution mitigations" |
| F6 — INFERRED hedge on React DevTools badges | Valid improvement (recalibrate) | Fix | Recalibrate — §D1 Implications now carries "Compiler-badge behavior in React DevTools v5+ is reported by secondary sources, flagged INFERRED in the evidence file" |
| F7 — react-scan prod-gate under-surfaced | Valid improvement (sharpen) | Fix | Sharpen — Exec Summary Para 1 now mentions "react-scan's OSS build is gated off in production by default"; §D1 Implications carries the `dangerouslyForceRunInProduction=false` detail |
| F8 — D9 2× memory community-source framing | Style/preference (already hedged adequately) | Decline | Existing prose "community sources cite '2× memory' and 'LRU is being considered' — no primary-source confirmation" is sufficient; further sharpening would be polish without correctness impact |
| F9 — clinic.js + 0x dates verified | No fix needed | No action | Audit verified CONFIRMED; no change required |
| F10 — size-limit v12.1.0 date partially verifiable | Uncertain after investigation | Acknowledge | Audit received conflicting signals (GitHub shows 12.1.0; Snyk shows 12.0.1). Cannot resolve without direct npm registry call. Flagged for downstream verification; evidence file retains the 2026-04-13 date as received. |
| F11 — million "soft-deprecation" inference | Style/preference | Decline | Current phrasing is a defensible characterization of CONFIRMED facts (1 substantive commit since mid-2024 + README banner pointing to React Grab as successor). Not a correctness issue. |
| F12 — 0x vs Sentry/Datadog Bun phrasing asymmetry | Style/preference | Decline | Cosmetic only; all three tools are V8-native and don't run on Bun (content is consistent). |

### Declined findings — none carried forward as deferred scope

F8, F11, F12 are style/preference items judged to not rise to correctness impact; F9 requires no action; F10 is flagged for future verification but does not alter the report's claims. Per `/assess-findings` anti-deferral guardrail, declined findings are not promissory — future researchers can re-raise with new evidence if needed.
