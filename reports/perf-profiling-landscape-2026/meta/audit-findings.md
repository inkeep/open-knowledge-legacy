# Audit Findings — perf-profiling-landscape-2026

**Date:** 2026-04-19
**Auditor:** audit subagent
**Report:** reports/perf-profiling-landscape-2026/REPORT.md
**Evidence:** reports/perf-profiling-landscape-2026/evidence/ (10 files, D1–D10)

## Summary

- Total findings: 12
- High: 2
- Medium: 6
- Low: 4

Report is broadly well-sourced — evidence files are thorough, cite primary URLs, and distinguish CONFIRMED vs INFERRED vs UNCERTAIN vs NOT FOUND with care. The critical primary claims on React 19.2 date (Oct 1 2025), INP replacing FID (2024-03-12), FID sunset (2024-09-09), Bun 1.3.7 profilers, CodSpeed technique, clinic.js deprecation, Playwright 1.57/1.58 features, OTel Profiling alpha (2026-03-26), and LoAF / 50 ms / 104 ms thresholds all check against primary sources.

Two High findings are factual-slip numeric conflations: (a) the 332,702-op vs 259,778-op attribution for automerge-perf / B4 is internally inconsistent, (b) one vendor claim about Elastic / OneUptime recipes is characterized with a more aggressive framing in the executive summary than the evidence supports. Six Medium findings are confidence-prose misalignments, unstated conditionality, and small inline-attribution gaps. Low findings are mostly typographic / placement issues.

## Findings

### Finding F1: Conflation of automerge-perf total count (332,702) with crdt-benchmarks B4 op count (259,778)
**Severity:** High
**Type:** Factual error / Logical contradiction across sections
**Location:** REPORT.md Executive Summary line 59 ("sharing a canonical 332,702-op LaTeX-edit-trace dataset"); REPORT.md §D5 Finding line 185 ("with B4 being Kleppmann's 332,702-op LaTeX-paper edit trace from automerge-perf")
**Issue:** REPORT.md labels "B4" as a 332,702-op trace, but per the evidence file itself (`crdt-yjs-profiling.md` Finding: "scenarios B1 (no conflicts, two clients), B2 (two users, concurrent conflicts), B3 (many conflicts, √N concurrent actions), B4 (real-world LaTeX-paper edit trace, 259,778 ops)") and the upstream crdt-benchmarks README (primary-source WebFetch confirms B4 is 259,778 operations: 182,315 insertions + 77,463 deletions). The 332,702 figure is the automerge-perf `edit-history/paper.json.gz` total `changes` count (1 initial object-creation + 182,315 ins + 77,463 del + 102,049 cursor moves; crdt-benchmarks B4 replays only the insertions + deletions, the subset that mutates the Text CRDT).

Meanwhile the D6 evidence file (`editor-oss-perf-harnesses.md` synthesis bullet) correctly says: "`automerge/automerge-perf` (Kleppmann's LaTeX paper; 332k ops, 104,852-char final doc) — reused by every CRDT lib via `dmonad/crdt-benchmarks` and `zxch3n/crdt-benchmarks`" — so D6 is right about automerge-perf being 332k, but REPORT.md attaches 332,702 to B4 specifically, contradicting D5's own evidence.
**Current text:** REPORT.md §D5: "`dmonad/crdt-benchmarks` (4 scenarios: B1-B4, with B4 being Kleppmann's 332,702-op LaTeX-paper edit trace from `automerge-perf`) is the canonical external suite."
**Evidence:** Primary-source fetch of https://github.com/dmonad/crdt-benchmarks confirms B4 is 259,778 ops (182,315 + 77,463); primary-source fetch of https://github.com/automerge/automerge-perf confirms the source trace contains 332,702 total changes including cursor moves. The evidence file `crdt-yjs-profiling.md` lines 39–40 state "B4 (real-world LaTeX-paper edit trace, 259,778 ops)" — so REPORT.md also contradicts its own evidence file.
**Status:** CONTRADICTED
**Suggested resolution:** Rewrite to separate the two numbers: "`automerge-perf`'s LaTeX-paper edit trace contains 332,702 total changes (including cursor moves); the subset used in `crdt-benchmarks` B4 is 259,778 mutating ops (182,315 insertions + 77,463 deletions)." Update both the Executive Summary line and D5's detailed finding to match.

---

### Finding F2: Executive-summary framing of Elastic/OneUptime overstates what the evidence files support
**Severity:** High
**Type:** Confidence-prose misalignment / Synthesis overreach
**Location:** REPORT.md Executive Summary line 67; REPORT.md §D10 line 286; evidence `opentelemetry-readiness.md` Finding "Vendor divergence"
**Issue:** The Executive Summary says Elastic, Sentry, OneUptime "publish production-ready-looking OTel browser recipes that the upstream docs contradict — vendor incentive bias." The evidence, however, is more carefully hedged:
- The Elastic post evidence file explicitly quotes Elastic as acknowledging: "client instrumentation for the browser is experimental and mostly unspecified. It is subject to breaking change." (evidence file, D10 Finding "Vendor divergence")
- Elastic therefore does NOT contradict upstream — Elastic's own docs reproduce the upstream caveat verbatim.
- Sentry is listed alongside Elastic/OneUptime in Executive-Summary framing but Sentry is NOT called out in the D10 evidence bullet "Vendor divergence" — only Elastic and OneUptime are (with Elastic acknowledged as carrying the upstream caveat). Sentry is addressed in a separate D10 finding ("Sentry OTLP ingestion is open-beta") with neutral framing.
- Only OneUptime is unambiguously flagged as contradicting upstream framing.

So the executive summary's "Elastic, Sentry, OneUptime publish production-ready-looking OTel browser recipes that the upstream docs contradict" is three names when the evidence supports one (OneUptime) clearly, names Sentry for a different claim, and documents Elastic as carrying the upstream caveat.
**Current text:** REPORT.md Exec Summary line 67: "Vendors (Elastic, Sentry, OneUptime) publish production-ready-looking OTel browser recipes that the upstream docs contradict — vendor incentive bias."; REPORT.md §D10 line 286: "Elastic, OneUptime publish production-ready-looking browser OTel recipes that the upstream docs contradict (vendor incentive bias)."
**Evidence:** `opentelemetry-readiness.md` Finding "Vendor divergence" — Elastic's own post is quoted acknowledging the upstream caveat; OneUptime is the one clearly framed as "ready-to-use"; Sentry is not discussed under this framing at all.
**Status:** INCOHERENT (exec summary overreaches vs. evidence; D10 section prose drops Sentry but still conflates Elastic with OneUptime despite Elastic acknowledging the caveat)
**Suggested resolution:** Rewrite exec-summary to: "OneUptime publishes browser-OTel recipes framed as ready-to-use; Elastic publishes recipes that reproduce the upstream experimental caveat; Sentry's browser SDK is a separate vendor layer (OTLP ingestion is open-beta). Collectively this is vendor incentive bias — careful reading required." The D10 section already mentions "Elastic and OneUptime" but should similarly separate Elastic's caveat-acknowledging posture from OneUptime's ready-to-use posture.

---

### Finding F3: React Performance Tracks framing "no extension required" elides the `<Profiler>`-gated Components-track caveat
**Severity:** Medium
**Type:** Missing conditionality / Oversimplification
**Location:** REPORT.md Executive Summary line 57 ("React emits custom Scheduler/Components/Server tracks directly into the browser Performance panel — no extension required, no extra profiler install"); REPORT.md §D1 line 105 ("no extension install required for the Scheduler track; `<Profiler>` boundaries gate the Components track")
**Issue:** The D1 detailed finding correctly states the nuance ("no extension install required for the Scheduler track; `<Profiler>` boundaries gate the Components track in production-profiling builds (unless the React DevTools extension is installed)"), matching the primary-source react.dev phrasing. But the executive summary strips that to "no extension required, no extra profiler install" which drops the two conditions: (1) Components-track visibility requires `<Profiler>` wrapping OR the React DevTools extension; (2) Server Components/Server Requests tracks are dev-builds-only per the same react.dev page. The summary reads like the full stack is free-for-free out of the box.
**Current text:** "React emits custom Scheduler/Components/Server tracks directly into the browser Performance panel — no extension required, no extra profiler install."
**Evidence:** https://react.dev/reference/dev-tools/react-performance-tracks (primary, quoted in evidence file): "Only Scheduler tracks are enabled by default. The Components track only lists Components that are in subtrees wrapped with `<Profiler>`. If you have [React Developer Tools extension] enabled, all Components are included in the Components track even if they're not wrapped in `<Profiler>`." + "Server Components and Server Requests tracks are only available in development builds."
**Status:** INCOHERENT (exec summary drops evidence-file-documented conditionality)
**Suggested resolution:** Replace with "React emits a Scheduler track directly into the Performance panel with no extension required; the Components track requires either `<Profiler>` boundaries or the React DevTools extension; Server tracks are dev-only." Adds three dependent clauses but preserves the scan-for-the-gist reading.

---

### Finding F4: "Tldraw is the outlier" — D6 synthesis omits that silverbullet and zed also ship functioning runtime perf infrastructure
**Severity:** Medium
**Type:** Internal inconsistency (L1)
**Location:** REPORT.md Executive Summary line 59 ("**tldraw is the outlier** with a full Playwright-orchestrated FPS harness"); REPORT.md §D6 line 206
**Issue:** The executive summary claims "tldraw is the outlier with a full Playwright-orchestrated FPS harness" — but the D6 evidence finding lists eight active patterns across the landscape, several of which represent functioning runtime perf infra at other projects:
- Silverbullet's `vitest bench` micro-benches (active, in `bench/`)
- Zed's head-vs-base hyperfine comparison (functioning `cargo xtask`-generated workflow)
- Excalidraw + Outline's bundle-size gates (different category of perf gating, but still shipping)

Calling tldraw "the outlier" is correct specifically for full-DOM Playwright FPS gating (Silverbullet and Zed are different technique families), but the framing reads like tldraw alone ships any runtime perf infrastructure. A more precise claim: "Tldraw is the outlier for Playwright-orchestrated FPS gating on full DOM; Silverbullet ships micro-benches and Zed ships head-vs-base CLI comparison under different technique families." This also bears on §D6's "Absence pattern is itself a finding" — which is correct for Milkdown/BlockNote/Plate/Remirror/Logseq but not for Silverbullet/Zed.
**Current text:** "**tldraw is the outlier** with a full Playwright-orchestrated FPS harness (baseline-per-environment, 15% regression / 10% warning thresholds, PostHog reporting)"
**Evidence:** `editor-oss-perf-harnesses.md` Finding "Recurring patterns across the landscape" enumerates multiple functioning techniques at different projects, not just tldraw.
**Status:** INCOHERENT (overreach in exec summary; §D6 bullets at the end handle the nuance correctly)
**Suggested resolution:** "Tldraw is the outlier **for Playwright-orchestrated full-DOM FPS gating**; other patterns (silverbullet's `vitest bench` micro-benches, zed's head-vs-base `hyperfine` dispatch, excalidraw's bundle-size gate) survive in different technique families."

---

### Finding F5: "CodSpeed … brings variance below 1% on shared GitHub Actions runners" lacks the caveat that CodSpeed's technique applies to micro-benchmarks only, not full-DOM tests
**Severity:** Medium
**Type:** Missing conditionality
**Location:** REPORT.md Executive Summary line 61; REPORT.md §D8 line 250
**Issue:** The exec summary and D8 both say CodSpeed brings variance below 1% on shared runners; the D8 evidence file confirms this via the CodSpeed site claim. However both readings elide that CodSpeed's `valgrind`/`cachegrind` instruction-counting technique applies to pure-JS micro-benchmarks (wraps `vitest bench` / `tinybench` — confirmed in evidence). It does NOT and cannot substitute for Playwright-orchestrated full-DOM FPS tests where the bottleneck is compositor/paint/layout in a real browser, which is exactly the surface the tldraw harness was covering. A reader could walk away thinking "CodSpeed is the 2026 answer to tldraw's flake problem" which would be wrong — they're complementary surfaces.

The D8 "Implications" bullet does allude to this ("Micro-bench via `vitest bench` vs Playwright-orchestrated FPS covers different questions — pure-JS perf vs full-DOM interaction perf") but the executive-summary juxtaposition with tldraw's flake narrative implies otherwise.
**Current text:** "CI-gated perf regression without flake is now addressable via CodSpeed's hardware-counter approach. CodSpeed uses `valgrind`/`cachegrind` instruction counting rather than wall-clock time, bringing variance below 1% on shared GitHub Actions runners; it wraps `vitest bench` (tinybench-backed, the current OSS JS micro-bench mainstream) unchanged."
**Evidence:** https://codspeed.io primary + `ci-gated-perf-regression.md` Finding "Implications" clarifies the technique scope is micro-bench not full-DOM.
**Status:** INCOHERENT (exec summary overreaches; full-DOM perf flake is NOT solved by CodSpeed)
**Suggested resolution:** Add a sentence: "CodSpeed's instruction-counting approach applies to JS micro-benchmarks only; full-DOM Playwright-orchestrated FPS tests (the tldraw pattern) still require dedicated-runner + production-build mitigations." Either in exec summary or in D8's finding body.

---

### Finding F6: INFERRED confidence label on "React DevTools badges" is applied correctly in D1 evidence but "surfaced as first-party" reading in exec summary drops the label
**Severity:** Medium
**Type:** Confidence-prose misalignment (L2)
**Location:** REPORT.md Executive Summary line 57 ("This makes the DevTools Performance panel the default interactive surface for React-aware tracing"); §D1 line 111 ("Compiler badges in ≥v5 of the extension — INFERRED")
**Issue:** D1 evidence file cleanly labels the DevTools Compiler-badge behavior as INFERRED (secondary sources, DebugBear/dev.to, not a primary react.dev extension docs page). The D1 detailed finding also preserves "(INFERRED)" inline — good practice. But the executive summary's stronger framing "the DevTools Performance panel the default interactive surface" elides this, and the React-Scan-vs-DevTools-Profiler-vs-Sentry "three viable answers" line in §D1 implications doesn't carry the INFERRED marker either. A cautious reader would want to know that Compiler-badge behavior is secondary-sourced.
**Current text:** REPORT.md §D1 implications line 111 "For apps running React Compiler, the 'why did this render?' question has three viable answers: DevTools Profiler (with Compiler badges in ≥v5 of the extension — INFERRED), react-scan/bippy, or Sentry."
**Evidence:** `react-compiler-profiling.md` Finding: React DevTools Compiler badges = INFERRED.
**Status:** Mostly OK at §D1 detail level; exec summary drops the hedge
**Suggested resolution:** Add a parenthetical to exec summary: "DevTools is the default interactive surface for React-aware tracing (React DevTools v5+ Compiler-badge behavior is reported by secondary sources; primary-source extension docs not yet retrieved)."

---

### Finding F7: "react-scan gated off in prod by default" claim in the prompt is accurate but omits the nuance around `dangerouslyForceRunInProduction`
**Severity:** Medium
**Type:** Factual precision / inline attribution gap
**Location:** REPORT.md §D1 line 105 ("react-scan (v0.5.3, active) and bippy (v0.5.32, active) are the runtime fiber-level tools"); evidence `react-compiler-profiling.md` Finding "react-scan OSS is gated off in production by default"
**Issue:** REPORT.md §D1 finding does not directly repeat "gated off in prod by default" — this is stated only in the evidence file. The evidence is correct (gate code at `react-scan/packages/scan/src/core/index.ts:437-443` is quoted in evidence, and web-search confirms `dangerouslyForceRunInProduction` defaults to `false`). But REPORT.md leaves "OSS is dev-only by default, commercial Monitoring product handles prod" entirely to §D1's implications — and the exec summary lists react-scan alongside bippy as "runtime fiber-level tools" without the gate callout. A reader scanning just the REPORT won't learn the prod constraint.

Also: the evidence file's confidence on the OSS-vs-commercial product separation is INFERRED (react-scan.com secondary), but REPORT.md §D1 just states "the commercial 'React Scan Monitoring' product is a separate offering" via implications without carrying the INFERRED tag.
**Current text:** REPORT.md Executive Summary line 57 "react-scan/bippy and the React DevTools extension Profiler as complementary lenses" (no prod-gate mention)
**Evidence:** `react-compiler-profiling.md` Finding: gate is CONFIRMED via source read; commercial-product separation is INFERRED.
**Status:** Evidence is solid; REPORT.md under-surfaces the prod constraint
**Suggested resolution:** Add to §D1 main finding: "react-scan's OSS build is gated off in production by default (`dangerouslyForceRunInProduction` defaults to `false`); the commercial React Scan Monitoring product (separation INFERRED via secondary sources) targets production use."

---

### Finding F8: D9 finding "React 19.2 Activity … community sources cite '2× memory'" is reported with mixed confidence that could be cleaner
**Severity:** Medium
**Type:** Confidence-prose misalignment
**Location:** REPORT.md §D9 line 265 ("React 19.2 `<Activity mode="hidden">` preserves state + DOM but cleans up Effects; React docs are silent on eviction policy"); REPORT.md §D9 line 279 ("community sources cite '2× memory' and 'LRU is being considered' — no primary-source confirmation")
**Issue:** The D9 finding both (a) asserts the React-docs-silence as CONFIRMED in the evidence file and (b) correctly flags the "2×" and "LRU is being considered" as community sources without primary confirmation. REPORT.md repeats this carefully in §D9 Remaining Uncertainty. BUT the body of §D9 still uses the "~2×" framing earlier on ("community sources cite…") without prepending "unverified" — a reader tempted to cite the 2× number could slip into treating it as primary. Also the evidence file's finding is labeled CONFIRMED for the React-docs silence but "Secondary reporting (not official React doc, flag as MEDIUM confidence)" for the 2× number — this granularity doesn't translate to REPORT.md.
**Current text:** "React 19.2 `<Activity mode=\"hidden\">` preserves state + DOM but cleans up Effects; React docs are silent on eviction policy — host applications must implement their own mount cap." (Fine.) "Community sources cite '2× memory' and 'LRU is being considered' — no primary-source confirmation." (Also fine but could be sharper.)
**Evidence:** `memory-profiling-leak-detection.md` Finding "React 19.2 Activity" — CONFIRMED for state-preservation semantics + docs-silent-on-eviction; the "2× memory" quote is explicitly called MEDIUM confidence in the evidence file.
**Status:** OK but inline-attribution could be sharpened
**Suggested resolution:** In REPORT.md §D9, explicitly tag the community-quoted numbers: "community reports (not on react.dev; flag as MEDIUM confidence) cite a ~2× memory ratio and an unconfirmed LRU-eviction RFC; primary-source react.dev Activity docs remain silent on both."

---

### Finding F9: "clinic.js last release 2023-06-28" — verified correct; "0x v6.0.0 (2025-07-07) supports Node 20+ only" — verified
**Severity:** Low
**Type:** CONFIRMED claim, no fix needed
**Location:** REPORT.md §D7 line 226; evidence `node-server-tracing.md`
**Issue:** Spot-check only — verified via primary-source WebSearch that clinic.js/node-clinic is unmaintained with last release at v13.0.0 / 2023-06-28. 0x v6.0.0 Node-only is also verified.
**Evidence:** https://github.com/clinicjs/node-clinic README (WebSearch-confirmed); https://github.com/davidmarkclements/0x
**Status:** CONFIRMED
**Suggested resolution:** No fix.

---

### Finding F10: size-limit v12.1.0 version + April 2026 date — partial verification inconclusive
**Severity:** Low
**Type:** Factual (version-pinned claim partially verified)
**Location:** REPORT.md §D8 line 245 (no explicit version in §D8 body, only references through D4); REPORT.md §D4 line 165; evidence `bundle-analysis-vite-rolldown.md` Finding "size-limit v12.1.0 (2026-04-13) is actively maintained"
**Issue:** Two public sources on size-limit gave conflicting signals: GitHub releases confirms v12.1.0 exists, and the evidence file cites it as 2026-04-13. Snyk / some npm-search results show 12.0.1 as latest and date v12.1.0 to 2024-04-13 (not 2026-04-13). This could be a date-parsing artifact (GitHub release dates are ambiguous without the year unless you fetch the raw page). Worth spot-checking directly if tooling supports it — the audit could not conclusively verify 2026-04-13 as the release date. The version number itself (v12.1.0) is plausible.
**Evidence:** Evidence file cites 2026-04-13 date. External verification via search partially conflicts (Snyk shows 12.0.1 as latest). Cannot fully resolve without a direct registry call.
**Status:** UNVERIFIABLE (partial)
**Suggested resolution:** Spot-check https://registry.npmjs.org/size-limit for the authoritative version + publishDate before relying on "v12.1.0 (2026-04-13)" in downstream work. If primary source shows 12.0.1 is latest as of 2026-04-19, correct the version in both evidence and REPORT.md; otherwise retain.

---

### Finding F11: "million — 1 substantive commit since mid-2024" framing is accurate but "soft-deprecation" is an inference
**Severity:** Low
**Type:** Characterization
**Location:** REPORT.md §D1 line 105 ("million is in soft-deprecation (1 substantive commit since mid-2024)"); evidence `react-compiler-profiling.md` Finding "million — last real commit June 2024, now in soft-deprecation"
**Issue:** The evidence marks this as CONFIRMED via `git log --since=2025-01-01 --oneline | wc -l` returning 1. The commit-count is verifiable; "soft-deprecation" is an inference from the author's readme banner (pointing at "React Grab" as successor). REPORT.md uses the inferred term without a hedge. Minor.
**Current text:** "million is in soft-deprecation (1 substantive commit since mid-2024)"
**Evidence:** `react-compiler-profiling.md` Finding: CONFIRMED via commit counts + README banner — but "soft-deprecation" is the auditor's term, not the author's word.
**Status:** Minor characterization
**Suggested resolution:** Consider softening to "million has not had a substantive commit since mid-2024 and the author's README now points at React Grab as successor — effectively in deprecation-by-inactivity."

---

### Finding F12: "0x v6.0.0 is Node-only (V8-bound)" vs exec summary "0x is Node-only" — correct but doesn't fully parallel "will not run on Bun" used for Sentry/Datadog
**Severity:** Low
**Type:** Typo/framing consistency
**Location:** REPORT.md Executive Summary line 65 ("0x v6.0.0 is Node-only (V8-bound)"); REPORT.md §D7 line 226
**Issue:** Other vendor profilers in the same executive-summary paragraph are qualified with "will not run on Bun" (Sentry, Datadog). 0x gets a shorter "Node-only" label. This is technically the same claim but the framing asymmetry may confuse a reader skimming for "what runs on Bun." Not a factual error, just a framing inconsistency the report could smooth.
**Current text:** Exec summary: "0x v6.0.0 is Node-only (V8-bound). ... Sentry and Datadog Node profilers are both V8-only and will not run on Bun."
**Evidence:** `node-server-tracing.md` corroborates: 0x is V8-tick-processor-based (thus same Bun-incompatibility as Sentry / Datadog).
**Status:** Cosmetic
**Suggested resolution:** Parallelize phrasing: "0x v6.0.0 is Node-only — V8-tick-processor-based, does not run on Bun (same as Sentry / Datadog Node profilers below)."

---

## Confirmed Claims (summary)

Verified against primary sources — no fix needed:

- **React 19.2 release date (Oct 1 2025)** — confirmed via react.dev and GitHub release.
- **React 19.2 Performance Tracks ship the Scheduler/Components/Server track taxonomy + `react-dom/profiling` build** — confirmed against react.dev primary.
- **why-did-you-render v10 React 19 support + React-Compiler incompatibility statement** — confirmed against welldone-software/why-did-you-render v10.0.0 release notes + README.
- **INP replaced FID on 2024-03-12; FID support ended 2024-09-09** — confirmed via web.dev primary + Google Search Central blog.
- **INP thresholds: Good ≤200 ms / NI 200–500 ms / Poor >500 ms; p75 with outlier reduction** — confirmed against web.dev.
- **Event Timing API default `durationThreshold` 104 ms, minimum 16 ms** — confirmed against W3C WD 2026-03-19.
- **Long Tasks API 50 ms / LoAF Chrome 123+ shipping** — confirmed against Chrome developer docs.
- **Lighthouse cannot produce INP; TBT is the lab proxy** — confirmed against web.dev TBT page.
- **Notion's Palette "Keydown to Paint" vs "keypress → React render" ≈10× difference** — confirmed against Palette blog post.
- **web-vitals v5.2.0 (2026-03-25) CHANGELOG entries (LCP fallback, includeProcessedEventEntries)** — confirmed against GitHub CHANGELOG.
- **Vite bundle analyzer v1.3.7 Rolldown adapter + `-e=rolldown-vite` CLI** — confirmed via GitHub README.
- **Rolldown "alpha, powering Vite 8+"** — confirmed against rolldown.rs primary.
- **React Compiler ships as a Babel plugin emitting `react/compiler-runtime` imports + cache-sentinel memoization** — confirmed against react.dev primary.
- **dmonad/crdt-benchmarks scenarios B1-B4 + external-repo pattern** — confirmed against GitHub primary.
- **automerge-perf 332,702 total changes breakdown (182,315 ins + 77,463 del + 102,049 cursor + 1 initial)** — confirmed against GitHub primary. (Note: see Finding F1 for how this number is misattributed to B4 in REPORT.md.)
- **Hocuspocus ships zero benchmark / load-testing infra; scalability doc is Redis + sharding with a TODO** — confirmed via local oss-repo read.
- **CM6 maintainer quote "no benchmarks have been done"** — confirmed against discuss.codemirror.net primary.
- **tldraw PR #7517 merged Dec 30 2025, removed playwright-perf infra** — confirmed via GitHub PR fetch.
- **Playwright 1.57 switched default browser to Chrome for Testing; 1.58 added Timeline in Speedboard** — confirmed via GitHub releases.
- **clinic.js deprecation notice + v13.0.0 (2023-06-28) last release** — confirmed via GitHub README + npm.
- **0x v6.0.0 Node 20+, V8-bound, no Bun support** — confirmed via GitHub README.
- **Bun 1.3.7 `--cpu-prof` / `--heap-prof` flags with Chrome DevTools compat; 1.3.9 `--cpu-prof-interval` default 1000 μs** — confirmed via bun.com blog primary.
- **OTel JS SDK: traces Stable, metrics Stable, logs Development; browser experimental** — confirmed against opentelemetry.io status + docs.
- **OTel Profiling alpha 2026-03-26** — confirmed via opentelemetry.io blog primary + Polar Signals post.
- **Pyroscope v1.21.0 release in 2026-04 (approximately 2026-04-17)** — confirmed via GitHub releases page.
- **tldraw harness regressionThreshold=15 / warningThreshold=10 / averageFps>18** — confirmed via local oss-repo read of `baseline-manager.ts` + `test-perf.spec.ts`.
- **CodSpeed `valgrind`/`cachegrind` instruction-counting approach for <1% variance** — confirmed via codspeed.io primary.

## Unverifiable Claims

- **size-limit v12.1.0 (2026-04-13) release date** — partial conflict between GitHub release (12.1.0 exists) and Snyk/npm-search reporting 12.0.1 as latest. See Finding F10. Not blocking.
- **React Scan Monitoring commercial product pricing / production-safety SLA** — flagged as gap in evidence; not carried into REPORT.md as a specific claim.
- **OTel agent overhead "~2–5%" / "under 3% CPU"** — evidence file itself flags these as vendor-promoted with no rigorous 2026 third-party benchmark. REPORT.md does not lean on the number, but any downstream consumer should treat as UNCERTAIN.

## Overall assessment

This is a solidly-sourced, well-organized 3P-factual landscape survey. The evidence files are consistently thorough: each dimension names primary sources, distinguishes CONFIRMED from INFERRED from UNCERTAIN from NOT FOUND, and carries vendor-incentive flags where appropriate (Sentry, Shopify's first-party scope, Pyroscope overhead numbers, RelativeCI being a SaaS agent). The 10-dimension rubric is well-scoped and the "D6 absence pattern is itself a finding" insight is the right synthesis move.

Two High findings are the only ones likely to affect reader decisions: F1 (the B4 = 259,778 vs automerge-perf = 332,702 conflation) is a crisp factual error that recurs in both the executive summary and the D5 main finding; it contradicts the report's own evidence file. F2 (the Elastic/Sentry/OneUptime executive-summary framing) overreaches relative to what the D10 evidence supports, especially Elastic's caveat-acknowledging posture. Both are high-leverage because they sit in the first readable prose a skimmer will encounter.

The Medium findings are mostly confidence-prose drift from evidence file INFERRED labels into REPORT.md's more confident summary voice (F3, F5, F6, F7, F8), plus one internal-consistency observation (F4). None are falsifying; all can be handled with small edits adding dependent clauses or relocating hedges from evidence files into REPORT.md prose. Low findings are cosmetic.

Net: the report is fit for purpose as a portable 3P landscape survey. Recommend editing F1 before wider distribution (factual error, trivial fix), editing F2 before wider distribution (exec summary overreach, 1-sentence fix), and opportunistically addressing F3–F8 when the report is next touched. F9–F12 can be deferred or ignored.
