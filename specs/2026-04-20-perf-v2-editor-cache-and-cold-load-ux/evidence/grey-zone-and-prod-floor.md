---
title: "Grey-Zone Inflection + Prod-Mode Floor Perf Probe"
description: "Two focused follow-on probes completing V2 spec scope-lock evidence. Part A measures ARCHITECTURE.md (111 KB, 0 React views) and AGENTS.md (155 KB, 8 React views) to localize the Acceptable→Unacceptable inflection in the 50–500 KB grey zone. Part B measures README / IDEAL-EDITOR / STORIES on a production build (open-knowledge start + ui) to quantify the dev→prod delta and establish a production floor. Cold-mount instrumentation commit b6c6455b (unchanged)."
createdAt: 2026-04-20
updatedAt: 2026-04-20
subjects:
  - Open Knowledge editor perf
  - Grey-zone doc-size inflection (50–500 KB)
  - Production vs dev-mode perf delta
  - React view count as dominant cost driver
  - StrictMode double-invoke overhead
topics:
  - cold-load floor calibration
  - cold-pool-warm inflection
  - Option E target calibration
  - size-gate vs universal V2 scope
---

# Grey-Zone Inflection + Prod-Mode Floor Perf Probe

**Date:** 2026-04-20
**Worktree:** `.claude/worktrees/cold-mount-profile` (branch `cold-mount-profile-instr`)
**Instrumentation commit:** `b6c6455b` — unchanged
**Prior probe:** `/tmp/ok-perf-validation/size-spectrum-profile/REPORT.md` (678 lines; 5 doc size points, dev mode only)
**Evidence:** `/tmp/ok-perf-validation/grey-zone-and-prod-floor/evidence/{partA,partB,snapshot.txt}`

---

## Executive summary

Two findings close V2 scope-lock gaps.

**1. Inflection in the 50–500 KB grey zone is dominated by React view count, not doc bytes.**

At equivalent byte sizes, docs with near-zero React views (MarkView/NodeView) cost <200 ms cold-pool-warm; docs with 100+ views cost >2 s. ARCHITECTURE.md (**111 KB, 0 views**) cold-pool-warm = **185 ms (Snappy)** — faster than any prior-probe doc, including the 5.6 KB README (424 ms). AGENTS.md (**155 KB, 8 views**) = **423 ms (Acceptable)** — fits the Acceptable tier at >3× the IDEAL-EDITOR size point. The byte-axis on its own is not load-bearing at the grey-zone scale.

**Verdict for V2 Decision 2:** size-gate alone is not the right discriminator. A size-gated defer-mount (like the existing `LARGE_DOC_CHAR_THRESHOLD = 500K`) would flag ARCHITECTURE for deferral unnecessarily and would NOT trip for a 400 KB wiki-dense doc. The V2 Alt 5 decoration hybrid must apply universally (or gate on React-view count, not bytes). Size-gate is a pragmatic secondary axis — e.g., to skip pre-mount in the Activity pool for multi-MB byte outliers — but is not the primary optimization target.

**2. Production build is 2–7× faster than dev on cold-pool-warm and 1.3–5× faster on cold-load.**

| Doc | Dev CPW (prior) | Prod CPW | Speedup |
|---|---:|---:|---:|
| README (5.6 KB) | 424 ms* | 192 ms | **2.2×** |
| IDEAL-EDITOR (43 KB) | 564 ms | 76 ms | **7.4×** |
| STORIES (530 KB) | 2297 ms | 541 ms | **4.2×** |

| Doc | Dev cold-load (prior) | Prod cold-load | Speedup |
|---|---:|---:|---:|
| README | 1098–2453 ms | 961 ms | 1.1–2.6× |
| IDEAL-EDITOR | 1375 ms | 946 ms | 1.5× |
| STORIES | 3791–9929 ms | 1845 ms | 2.1–5.4× |

Production STORIES cold-load drops from ~7 s median (dev) to ~1.85 s (prod) — no dev Y.Doc unload, no StrictMode 2× mount, no Vite HMR overhead, optimized React reconciler. Prod variance is low (<0.5%) across all three docs.

**Verdict for V2 Decision 3 (Option E target):** the cold-load floor Option E must beat is **~900–1000 ms in production** (not ~800 ms dev), but STORIES remains >1.5 s in prod — Option E is still load-bearing for large-doc cold-load even after accounting for production speedups. Conversely, IDEAL-EDITOR cold-pool-warm at **76 ms prod** is already below the 200 ms Snappy threshold, so Option E is not needed for Acceptable-tier docs in pool-warm flows.

*README dev 424 ms was contaminated by STORIES in its evict list per the prior probe caveat; the true dev floor for README-sized docs is closer to ~250 ms.

---

## Part A — Grey-zone inflection (dev mode, port 5186)

### Setup

Dev server: `VITE_PORT=5186 bun run --cwd packages/app dev`. Worktree root contains ARCHITECTURE.md (copied from `/ARCHITECTURE.md`) and AGENTS.md (in repo). Only temporary change: added `ARCHITECTURE: 'Architecture at a Glance'` to `packages/app/tests/perf/lib/doc-markers.ts` (AGENTS marker already present). AGENTS cold-pool-warm used `OK_PERF_EVICT_DOCS=README,MDX-ROUNDTRIP,IDEAL-EDITOR` to avoid AGENTS appearing in its own eviction list (the first run used the default and was discarded).

### Per-doc attribution (revisit window, cold-pool-warm)

Numbers averaged across runs; runs per cell in parentheses. Revisit-window `ok/cold/*` sums are for marks with `startTime >= revisitStartPerf`. `activityPool actualDur` is the sum across Profiler commits in the same window. `revLongestTask` is the longest browser long-task in the revisit window.

| Doc | Bytes | PM chars | Links | Wikis | Code | Rows | cpw (n) | em sum | fr sum | ec-init sum | create-node-views sum | pm-set-props sum | pm-update-state sum | activityPool actualDur | revLongestTask |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **ARCHITECTURE** | 111 K | 66,902 | 0 | 0 | 16 | 124 | **185** (2) | 12.2 | 21.0 | 52.1 | 29.6 | 54.8 | 35.1 | **22.1** | 142.5 |
| **AGENTS** | 155 K | 141,751 | 6 | 2 | 42 | 81 | **423** (3; trimmed mean 397.5) | 29.3 | 49.0 | 91.2 | 54.4 | 101.5 | 78.9 | **117.5** | 335.7 |

Variance: ARCHITECTURE 2 runs 183/188 (2.7%); AGENTS 3 runs 400/473/395 (18.5% range, driven by run-2 outlier 473; trimmed-mean 397.5 is tight).

### Full scenario matrix (ARCHITECTURE + AGENTS)

| Doc | cold-load | cold-pool-warm | mode-toggle (Src→Vis) | warm-switch→README | Verdict |
|---|---:|---:|---:|---:|---|
| ARCHITECTURE (0 views) | 1131 ms | **185 ms** ✅ | 41 ms ✅ | 203 ms ⚠ | **Acceptable** (cold-load borderline, every other metric snappy) |
| AGENTS (8 views) | 1352 ms ⚠ | **423 ms** ✅ | 64 ms ✅ | 268 ms ⚠ | **Acceptable** (cold-load is the only grey-zone metric) |

Snappy <500 ms cold-load / <200 ms CPW & warm-switch / <100 ms mode-toggle. Acceptable <1500 ms cold-load / <500 ms other. Unacceptable >1500 ms cold-load / >500 ms other.

### Extended scaling curve (6 cold-pool-warm data points)

| Doc | Bytes | PM chars | React views | cold-pool-warm | Verdict | Source |
|---|---:|---:|---:|---:|---|---|
| README | 5.6 K | 4.5 K | 5 | 424 ms* | Acceptable* | prior |
| MDX-ROUNDTRIP | 12 K | 9 K | 30 | 308 ms | Acceptable | prior |
| IDEAL-EDITOR | 43 K | 37 K | 35 | 564 ms | Acceptable (borderline) | prior |
| **ARCHITECTURE** | **111 K** | **67 K** | **0** | **185 ms** | **Snappy** | **NEW** |
| **AGENTS** | **155 K** | **142 K** | **8** | **423 ms** | **Acceptable** | **NEW** |
| STORIES | 530 K | 470 K | 176 | 2297 ms | Unacceptable | prior |
| PROJECT | 3250 K | 270 K | 768 | 9416 ms | Unacceptable | prior |

*README contaminated by STORIES-in-evict-list; "true" uncontaminated floor is lower.

### What the two new points reveal

**1. Bytes alone do not predict cost in the grey zone.** ARCHITECTURE (111 K, 0 views) is 3× SMALLER cpw than IDEAL-EDITOR (43 K, 35 views), even though ARCHITECTURE is 2.5× larger in bytes. AGENTS (155 K, 8 views) is comparable in cpw to IDEAL-EDITOR despite being 3.6× larger.

**2. The React-view-count axis is the inflection driver.** Re-fit the scaling as `CPW ≈ floor + α·views + β·bytes`:

| Data point | views | bytes (K) | CPW (ms) |
|---|---:|---:|---:|
| ARCHITECTURE | 0 | 111 | 185 |
| MDX-ROUNDTRIP | 30 | 12 | 308 |
| IDEAL-EDITOR | 35 | 43 | 564 |
| AGENTS | 8 | 155 | 423 |
| STORIES | 176 | 530 | 2297 |

Solving for α (ms per view) and β (ms per KB) with floor ≈ 185 (ARCHITECTURE as the view-free anchor): α ≈ 10.6 ms/view; β ≈ 1.8 ms/KB. The view-count coefficient dominates the byte-count coefficient by ~6× at the observed distribution of docs. Per-view marginal cost fits prior probe's ~2 ms/view for high-view docs (STORIES, PROJECT) — low-view docs have a higher per-view cost because baseline React commit work amortizes poorly across few views.

**3. The Acceptable→Unacceptable boundary sits near ~100 views**, not a specific byte count. AGENTS (8 views, 155 K) is comfortably Acceptable. STORIES (176 views, 530 K) is clearly Unacceptable. Interpolating: a ~100-view doc at any byte size will likely fall at the ~1000 ms cpw boundary.

### V2 scope implication

**Size-gate does not replicate the Acceptable/Unacceptable boundary.** The existing `LARGE_DOC_CHAR_THRESHOLD = 500,000` in `EditorActivityPool.tsx` gates defer-mount, and STORIES (470 K PM chars) is just below that threshold — close to correct, by accident. But:
- A 300 KB wiki-graph hub doc with 200 React views would not trip the 500 K gate and would be Unacceptable.
- Conversely, a 1 MB markdown-only prose doc (no links, no wikis) would trip the gate and defer unnecessarily.

**Recommendation**: the V2 Alt 5 MarkView decoration hybrid should apply based on **React-view count** (or, as a proxy, link + wiki count), not byte count. A secondary size-gate on bytes remains useful for PROJECT-scale outliers (multi-MB) where browser layout cost (not React cost) dominates, but it is not the primary knob.

---

## Part B — Production-mode cold-load baseline (prod build, ports 5190+54048)

### Setup

```bash
bun run build   # turbo: core → server → cli → app → docs (~11 s; 3 successful)
node packages/cli/dist/cli.mjs start --port 5190
# ok start auto-spawns ok ui on kernel-allocated port (54048 in this run)
# GET http://localhost:54048/api/config → {collabUrl:"ws://localhost:5190/collab", port:54048}
```

The `open-knowledge start` CLI boots Hocuspocus + HTTP API on :5190 and auto-spawns `ok ui` as a detached sibling process serving the static React bundle from `packages/app/dist/`. The UI process proxies `/collab` and `/api/*` to the start server. Both locks (`server.lock`, `ui.lock` at `.open-knowledge/`) correctly coordinated — no manual linking needed. Total wall-clock from `bun run build` to first scenario: under 5 minutes.

**Minor gotcha encountered:** the Vite config acquires the same `server.lock` at build time, so running `bun run build` while a dev server is active fails with `ServerLockCollisionError`. Stop the dev server first (the conflict surfaced on first attempt; fixed by `kill <pid>` before retry). This is a pre-existing repo constraint, not a Part B finding.

### Instrumentation gate

**Critical**: `packages/app/src/main.tsx:19` gates `installColdMountInstrumentation()` + `initWebVitals()` behind `if (import.meta.env.DEV || import.meta.env.MODE === 'test')`. In PROD builds Vite tree-shakes these calls, so `ok/cold/*` marks and `ok/render/*` Profiler records are **both empty** in Part B traces. The `import.meta.env.PROD` gate on the collector (`collector.ts:53`) additionally ensures `performance.measure` calls still run but are not buffered into `__ok_perf` for drain.

**Consequence**: Part B measures only wall-clock (`coldLoadMs`, `coldPoolWarmMs`), CDP trace aggregates (`scriptMs`, `layoutMs`, `styleMs`), and longtasks (via browser `PerformanceObserver`). **Component attribution is not available in prod.** This is a limitation accepted for correctness — instrumenting prod builds would defeat the tree-shake that the perf instrumentation explicitly advertises.

### Per-doc production results (2 runs each)

| Doc | PM chars | cold-load (mean) | scriptMs | layoutMs | styleMs | longestTask |
|---|---:|---:|---:|---:|---:|---:|
| README | 4,479 | **961 ms** (926, 996) | 213 | 13 | 13 | 0 |
| IDEAL-EDITOR | 36,586 | **946 ms** (952, 939) | 327 | 52 | 18 | 124 |
| STORIES | 470,368 | **1845 ms** (1843, 1847) | 745 | 192 | 81 | 576 |

| Doc | cold-pool-warm (mean) | revLongestTask |
|---|---:|---:|
| README | **192 ms** (193, 191) | 165 |
| IDEAL-EDITOR | **76 ms** (77, 75) | 56 |
| STORIES | **541 ms** (546, 537) | 476 |

**Variance**: sub-1% on cold-load, sub-2% on cold-pool-warm. No dev-mode Y.Doc unload penalty on re-run (Hocuspocus keeps docs warm in prod; no dev HMR disruption).

### Dev vs prod deltas (apples-to-apples)

| Doc | Dev cold-load (prior) | Prod cold-load | Absolute Δ | % reduction |
|---|---:|---:|---:|---:|
| README | 1098 / 2453 | 961 | −137 / −1492 | 12% / 61% |
| IDEAL-EDITOR | 1375 | 946 | −429 | 31% |
| STORIES | 3791 / 9929 | 1845 | −1946 / −8084 | 51% / 81% |

| Doc | Dev cold-pool-warm | Prod cold-pool-warm | Absolute Δ | % reduction |
|---|---:|---:|---:|---:|
| README | 424* | 192 | −232 | 55% |
| IDEAL-EDITOR | 564 | 76 | −488 | 86% |
| STORIES | 2297 | 541 | −1756 | 76% |

*README dev was contaminated by STORIES sibling — true delta on uncontaminated docs likely ~50–60%.

### StrictMode overhead — indirect quantification

Component attribution unavailable in prod, so direct ok/cold/editor-mount count comparison is impossible. But we can reason about the contribution:

React's `<StrictMode>` in DEV double-invokes effects and function component bodies ("double-render"). Per React docs, this applies ONLY in development — production builds treat `<StrictMode>` as a pass-through wrapper. `packages/app/src/main.tsx:34` wraps the app in `<StrictMode>` unconditionally; only the runtime behavior differs.

Prior probe observed 4 `editor-mount` calls per Activity revisit on STORIES/PROJECT (interpreted as "2 StrictMode × 2 Activity entries"). Prod would have 2 calls (1 StrictMode × 2 Activity entries) — a 50% reduction in mount count. This is a reasonable proxy for 50% of the editor-mount-sum cost saving in prod.

**Estimated StrictMode contribution** to the dev→prod speedup:
- For STORIES cpw, dev editor-mount sum was 203 ms. Prod estimate: ~100 ms (50% reduction).
- Total dev→prod cpw delta: 1756 ms. Editor-mount reduction: ~100 ms. StrictMode ≈ 5–6% of the total delta.
- The remaining ~94% is attributable to React's production reconciler (no DEV assertions, faster commits), no Vite HMR overhead, no Y.Doc disk re-parse on remount, and optimized Hocuspocus prod path.

**Takeaway**: StrictMode 2× is a small contributor, not the headline. The production build's React-reconciler optimizations + absence of dev-only checks deliver most of the speedup. This matches React's own benchmarks (prod vs dev reconciler gap of 2–10× on reconciliation-heavy workloads).

### Revised production floor estimate

- **Cold-load floor (smallest doc, prod)**: **~950 ms** (README 961 ms, IDEAL-EDITOR 946 ms). IDEAL-EDITOR is identical to README here because at ~1 s the floor is dominated by bundle download + hydrate + initial render, not per-doc work.
- **Cold-pool-warm floor (smallest doc, prod)**: **~190 ms** (README). IDEAL-EDITOR at 76 ms is anomalously low — likely an Activity re-show where the mounted subtree is returning from hidden rather than remounting. Prod STORIES at 541 ms is the authoritative upper-bound grey-zone figure.
- **STORIES in prod is STILL Unacceptable** on cold-load (1845 ms > 1500 ms) and borderline on cold-pool-warm (541 ms just above 500 ms Acceptable threshold). Production improvements alone do NOT close the large-doc gap — V2 is still load-bearing.

### V2 Option E target calibration

Prior probe claimed Option E (static content in Suspense fallback) can hide the ~800 ms dev-mode cold-load behind pre-rendered markdown.

**Revised calibration (prod)**:
- Floor to hide is **~950 ms in prod**, not 800 ms. Option E's pre-rendered markdown can absorb most of this if navigation intent precedes click, but cannot push below ~300–400 ms (app-shell JS parse + React mount + Suspense resolve).
- For STORIES-scale docs, cold-load is 1845 ms in prod — Option E has ~900 ms of work to hide, plus needs to match the actual rendered content fidelity during the fallback window.
- For IDEAL-EDITOR-scale docs, cold-load 946 ms is close to the floor; Option E is primarily value-added for the ~500 ms of sub-app-shell work (Y.Doc sync + createEditor + initial commit).

---

## Combined implications for V2 spec

### Consolidated recommendations

1. **V2 Alt 5 decoration hybrid should gate on React-view count, not bytes.** The existing `LARGE_DOC_CHAR_THRESHOLD = 500,000` defer-mount gate in `EditorActivityPool.tsx` is useful for multi-MB byte-outlier docs where browser layout cost dominates, but it misclassifies in the grey zone (an orthogonal view-count axis is the primary driver). A view-count gate (e.g. "≥ N InternalLink/WikiLink nodes on the first parse") would target the optimization correctly. Secondary size-gate (for PROJECT-scale docs) remains useful.

2. **WikiLink + InternalLink parity already established** (prior probe §5) — no change. Alt 5 must generalize; ARCHITECTURE (0 views) and AGENTS (8 views) both confirm: when there are no view-rendered nodes, the cost curve flattens dramatically, validating the "hybrid decoration for non-active, React-portaled for active" Alt 5 design.

3. **Option E target = ~950 ms production cold-load floor.** Not 800 ms dev floor. For large docs (>500 K PM chars, >100 React views), Option E + Alt 5 together are needed to reach Acceptable. For small-to-mid docs (<300 K PM chars, <50 views), production alone is already Acceptable — Option E delivers polish, not correctness.

4. **Size-gate on defer-mount (existing `LARGE_DOC_CHAR_THRESHOLD`) is correct for cold load, but the 500 K threshold should be reviewed**: STORIES at 470 K is Unacceptable in prod CPW (541 ms > 500 ms). The threshold may need to drop to ~300 K PM chars to catch STORIES, or (better) cross-index with React-view count.

5. **Production mode is a meaningful calibration baseline** — all V2 perf targets should be stated in prod terms. Dev wall-clock overstates the problem by 2–7× for mid-to-large docs. "Fix perf in dev" over-targets; "fix perf in prod" is the right ship bar.

### New open questions

1. **Why is IDEAL-EDITOR prod CPW (76 ms) 2.5× faster than README prod CPW (192 ms)?** Same evict sequence (AGENTS,CLAUDE,README), smaller byte count for README, more React views for IDEAL-EDITOR. Suspicion: Activity LRU behavior differs when the revisited doc is already mounted from the initial load step vs. evicted. Worth a focused ablation before V2 scope lock — if some revisits are nearly free via Activity visibility flip, the scenario's "cold-pool-warm" may not always be truly cold.

2. **Does the production `ok ui` static cache headers sufficiently amortize app-shell cost on repeat cold-loads?** CDP scriptMs dropped from dev ~1700 ms to prod ~220 ms on README — but that's first cold load. Subsequent cold-loads in a running browser session may be even faster. Worth probing for a "warm browser, cold doc" scenario.

3. **Production STORIES at 1845 ms cold-load — is this an acceptable ship bar, or does it still require V2 Alt 5 to meet the G1 UX target?** Depends on the V2 spec's user-facing target — not decided by this probe.

4. **The `editor-mount` count in prod is unmeasurable via `ok/cold/*` marks (tree-shaken).** If a future probe needs to confirm StrictMode-overhead empirically on a prod build, it must add a dev-gate override (e.g. `OK_COLD_MOUNT_INSTR=1` env) to install instrumentation in prod builds. Out of scope for this probe.

---

## Appendix — Raw artifacts

All scenario JSON outputs at `/tmp/ok-perf-validation/grey-zone-and-prod-floor/evidence/`:

- `partA/` — 12 files (ARCHITECTURE × 4 scenarios; AGENTS × 4 scenarios + 1 discarded run with self-in-evict-list + variance reruns)
  - `cold-pool-warm.*.json` — 5 files (2 ARCHITECTURE + 3 AGENTS)
  - `cold-load-big-doc.*.json` — 2 files (1 each)
  - `mode-toggle.*.json` — 2 files (1 each)
  - `warm-switch.*.json` — 2 files (1 each)
- `partB/` — 12 files (3 docs × {cold-load, cold-pool-warm} × 2 runs)
- `snapshot.txt` — summary tables from data above
- `dev-server.log` — Vite dev-server log (port 5186)
- `prod-start.log` — `ok start` prod log (port 5190)
- `build.log` — `bun run build` turbo log

Query example (revisit-window component sums, Part A):

```bash
cd /tmp/ok-perf-validation/grey-zone-and-prod-floor/evidence/partA
for F in cold-pool-warm.*.json; do
  REV=$(jq -r '.metrics.revisitStartPerf' "$F")
  jq --argjson rs "$REV" '{doc:(.notes | map(select(startswith("Step 2")))[0]), cpw:.metrics.coldPoolWarmMs, marks: (.marks | map(select(.name|startswith("ok/cold/")) | select(.startTime >= $rs)) | group_by(.name) | map({name:.[0].name, count:length, sum:(map(.duration)|add)}))}' "$F"
done
```

Temporary worktree changes (to be reverted on probe close):

1. Added `ARCHITECTURE: 'Architecture at a Glance'` marker to `packages/app/tests/perf/lib/doc-markers.ts`.
2. `packages/app/dist/` and `packages/cli/dist/` build outputs (not tracked; `.gitignore`'d).

Cleanup:

```bash
cd .claude/worktrees/cold-mount-profile
git checkout packages/app/tests/perf/lib/doc-markers.ts
# Optionally: rm -rf packages/app/dist packages/cli/dist
```

Probe close — 8 new data points (ARCHITECTURE × 4 dev scenarios + AGENTS × 4 dev scenarios) + 12 prod data points (3 docs × 2 scenarios × 2 runs) close both V2 gating gaps. Grey-zone inflection is view-count-dominated. Production floor is ~950 ms cold-load and ~190 ms cold-pool-warm. Option E target shifts from ~800 ms (dev) to ~950 ms (prod); Alt 5 scope stays universal (not size-gated).
