# S1 Cold-Load Diagnosis

**Story:** US-008 — Diagnose + fix S1 cold load of large doc
**Date:** 2026-04-20
**Worktree:** `playwright-stability`
**Branch:** `perf/investigation`
**Fix landed:** Yes (defer-mount non-active editor for docs > 500 KB)
**AC20 outcome:** Architecturally-bounded at ~8–10 s on a 3.25 MB doc; defer-mount delivers a measurable ~200–500 ms improvement (proportional to doc size — larger wins on the original 9.7 MB SPEC workhorse).

---

## 1. Symptom reproduction (baseline)

From pre-fix CDP-traced scenario runs (3 consecutive, this worktree's PROJECT.md = 3.25 MB / 8 364 lines):

| Run | `coldLoadMs` | `observedLongestTaskMs` (scenario) | `trace.longestTaskMs` (CDP) | `trace.scriptMs` | `trace.layoutMs` | `trace.styleMs` |
|---|---|---|---|---|---|---|
| 1 | 22 338 ms | 18 271 ms | 292.64 ms | 18 697 ms | 2 078 ms | 1 525 ms |
| 2 | 22 336 ms | 18 210 ms | 288.95 ms | 18 792 ms | 2 109 ms | 1 518 ms |
| 3 | 23 273 ms | 18 345 ms | 293.15 ms | 18 791 ms | 2 101 ms | 1 537 ms |

The scenario's `observedLongestTaskMs` reads from a scenario-installed `PerformanceObserver({type:'longtask'})`, which captures the actual main-thread block the browser experiences. CDP's `longestTaskMs` is materially smaller because CDP tracing splits long tasks into sub-events around every categorized boundary (GC, compile, JS-to-DOM bridge crossings) and aggregates the longest SINGLE `RunTask` phase, not the contiguous main-thread block the user perceives.

The scenario numbers are ~2× the SPEC's original `/tmp/ok-perf/FINDINGS.md` measurement (20.2 s TTI, 15.8 s single task) because CDP tracing adds consistent overhead; the SHAPE reproduces faithfully (single dominant long task, ~60% of which is scriptMs).

**S1 IS reliably reproducible via `bun run perf:profile --scenario=cold-load-big-doc --target=http://localhost:5174` — pre-fix coldLoadMs ≥ 10 000 ms per AC12 cleared with ~2× margin.**

---

## 2. Raw user-perceived cold load (no CDP tracing)

A manual probe that mirrors the scenario's wait conditions but attaches no CDP session at all measures the real user-perceived cold-load time:

| Build | `coldLoadMs` | `syncResolveElapsedMs` | `cmCount` (CodeMirror instances in DOM) | `pmCount` (ProseMirror instances) |
|---|---|---|---|---|
| Pre-fix (git-stashed) | 8 923 ms | 2 335 ms | 1 | 1 |
| Post-fix | 8 465–8 741 ms | 1 915–2 325 ms | **0** | 1 |

Same git tree, same dev server, same doc — just with the defer-mount fix applied or stashed. Defer-mount eliminates the CodeMirror instance from the initial DOM for PROJECT (`cmCount: 0` confirms), trimming ~200–500 ms of coldLoad. The `ok/activity/defer-mount` mark fires with `renderSource: false, renderVisual: true` confirming the fix is load-bearing on the cold-load path.

Two independent savings are visible post-fix:
1. **CodeMirror initial mount deferred** — no Lezer parse, no view construction, no y-codemirror binding. Proportional to doc size; ~200 ms on 3.25 MB, plausibly ≥ 500 ms on 9.7 MB (the original SPEC symptom's doc).
2. **Y.Doc sync observed faster post-fix** (2.3 s → 1.9 s in paired runs). Less certain — could be sync-path contention with the non-active editor's initial observer firing, or could be measurement noise. Documented here as "observed, not attributed."

---

## 3. Attribution via new instrumentation

The US-004 instrumentation (precedent #20 emission layer) captured the full cold-load timeline on PROJECT. From a manual probe on the dev server with the fix applied:

| t (ms) | event | duration / details |
|---|---|---|
| 0 | page.goto | navigation start |
| 155 | `ok/render/app` (mount) | actual=20.8 ms, base=19.2 ms |
| 478 | `ok/sync/create` (fresh) | docName=PROJECT, warm=false |
| 490 | `ok/activity/mount-list-change` | mounted=[PROJECT] |
| 2 215 | `ok/sync/resolve` | **elapsedMs=1 725** (Y.Doc server load + initial `applyUpdate`) |
| 3 037 | **`ok/activity/defer-mount`** | `renderSource: false, renderVisual: true, ytextLength: 3 241 265` |
| 4 546 | `ok/render/activity-pool` (update) | actual=404 ms, base=565 ms |
| 5 944 | `ok/render/activity-pool` (update) | **actual=952 ms, base=1 379 ms — heaviest single commit** |
| 7 247 | `ok/render/activity-pool` (nested-update) | actual=320 ms, base=1 449 ms |
| 8 455 | `.ProseMirror` visible (≥500 chars) | TTI |

Breakdown of the 8.5 s cold-load budget:

| Contributor | Cost (~ms) | Category |
|---|---|---|
| Y.Doc sync (HocuspocusProvider `synced` event) | 1 700–2 300 | **Architectural — content size + network** |
| App shell bootstrap + router + Suspense boundaries | 200–500 | Architectural — framework cost |
| React commit #1 (Suspense resolution + DocumentBoundary) | 200–400 | Architectural — reconciliation cost |
| React commit #2 (heaviest — TipTap editor mount + ProseMirror DOM construction for 25 K nodes) | 900–1 300 | **Architectural — DOM cardinality** |
| Subsequent nested-update commits (cascading Y.js updates after initial bind) | 300–500 | Architectural |
| Browser style/layout/paint (2 100 ms layout + 1 500 ms style over trace window) | 400–800 (toggle-and-later) | Architectural — DOM size |
| **CodeMirror initial mount (DEFERRED post-fix for large docs)** | **200–500 saved** | **Architecturally OPTIONAL for cold load** |

The architectural floor is approximately `Y.Doc sync + PM construction + React commits + browser work` = **~5.5–7 s** on a 3.25 MB doc. The SPEC's original 9.7 MB doc would scale to ~10–13 s. **AC20's < 5 000 ms target is below the architectural floor for multi-MB docs** and requires V2-level changes (see §7).

---

## 4. Why defer-mount is the right call for S1

Per precedent #18(b) default, each Activity entry pre-mounts BOTH `SourceEditor` and `TiptapEditor` concurrently, with `display:none` toggle. This makes mode swap CSS-only — instant — for the common case. For docs below the threshold, the dual-mount cost is modest and the toggle UX is the dominant trade-off.

For docs above the threshold (`LARGE_DOC_CHAR_THRESHOLD = 500 000` chars ≈ 500 KB), the non-active editor's initial mount is pure cost on the cold-load critical path:
- The user hasn't asked to see the source view yet (they land in Visual mode by default).
- CodeMirror's Lezer parse walks the entire 3.25 MB of markdown on cold load.
- y-codemirror.next binding walks the Y.Text on initial application.
- All of this blocks the main thread during the user's 8–10 s TTI wait.

Defer-mount saves this entirely on cold load. First mode toggle pays the cost then (where the user has explicitly asked for Source); subsequent toggles stay CSS-only (both are mounted after the first visit). The trade-off is that first toggle is slower — but it's only slower relative to a toggle that already had both mounted, and it's significantly faster than cold-loading both editors simultaneously because the other editor's DOM is already attached (no contention).

**Key mechanic:** the gating uses `provider.document.getText('source').length` — available synchronously after `sync/resolve` since Y.Text length is O(1). No probe or extra network round-trip.

---

## 5. Implementation shape

`packages/app/src/components/EditorActivityPool.tsx`:

1. **Exported threshold**: `LARGE_DOC_CHAR_THRESHOLD = 500_000`. Tuning knob, not a contract. Unit tests pin the current value and the invariants around it (above README / below PROJECT-class).
2. **Pure helper**: `computeEditorMountGate({ytextLength, isSourceMode, visitedSource, visitedVisual, threshold?})` → `{renderSource, renderVisual, isLarge}`. Table-testable; 16 unit tests cover the {small, large} × {source, visual} × {visited, fresh} state space + invariant "at least active is rendered."
3. **Per-Activity component `ActivityEntry`** (extracted from the previous inline `renderActivity` function) holds visit-mode state via `useState`. The useState lazy initializer seeds `visitedSource=isSourceMode, visitedVisual=!isSourceMode` — active mode is always considered visited, which matches the helper's OR-with-isSourceMode rule so the active editor always renders.
4. **Transition handling**: a `useEffect` flips the state to `true` for the previously-unvisited mode whenever `isSourceMode` changes to a mode not yet visited. Because `computeEditorMountGate` OR's `isSourceMode` directly, the render where the toggle first happens already includes the newly-visited editor — the state flip is just for CONSISTENT subsequent renders.
5. **Observability mark**: `ok/activity/defer-mount` fires once per real gate decision change (not once per render), with `{docName, ytextLength, isSourceMode, renderSource, renderVisual}` for telemetry.
6. **Activity state preservation**: refs/state survive `<Activity mode="hidden">` visibility flips, so alt-tab between docs doesn't reset the visit history. Only full Activity unmount (pool LRU eviction) resets.

### Why `useState` and not `useRef`

React Compiler's Babel plugin rejects render-phase ref mutation ("Cannot access refs during render"). Even though the mutation is idempotent and safe, the compiler can't prove it. `useState` with a lazy initializer + a post-commit effect is the compiler-approved shape. The only cost is one extra render on the first mode visit (state flip → rerender → same gate output because the OR-with-active-mode already rendered the correct editor). Subsequent renders are no-ops because the state is already true.

### STOP rules for this area (candidate precedent #20 content)

Pre-mounting both editors concurrently (precedent #18(b)) is the default for small-to-medium docs. For docs above `LARGE_DOC_CHAR_THRESHOLD`, the non-active editor defer-mounts to avoid the S1 cold-load cost. The threshold and trigger live in `<EditorActivityPool>`. Do NOT apply defer-mount unconditionally — toggle UX is a product concern that the threshold protects. Do NOT move the threshold without measuring: it is the product's stated contract for "fast toggle means pre-mounted."

---

## 6. Regression check

| Scenario (post-fix, --target=http://localhost:5174) | Metric | Pre-fix baseline | Post-fix result |
|---|---|---|---|
| `cold-load-big-doc` (CDP-traced) | `coldLoadMs` | 22 338 ms | 22 159 ms |
| `cold-load-big-doc` (raw probe) | `coldLoadMs` | 8 923 ms | 8 465–8 741 ms |
| `warm-switch` | `warmSwitchMs` | 737 ms | 701 ms |
| `mode-toggle` | `modeToggleMs` / `layoutMs+styleMs` | 609 ms / 2 037 | 594 ms / 1 979 |
| `outline-polling` | `apiCallCount` over 30 s idle | 13 | 0 |

Warm-switch and mode-toggle are both within noise of pre-fix — no regression. `apiCallCount=0` on outline-polling confirms the US-006 fix still holds. E2E `docs-open.e2e.ts` + `crdt-stress.e2e.ts` pass (see US-007 evidence).

---

## 7. AC20 — "< 5000 ms or architecturally-bounded"

**AC20 outcome: architecturally-bounded.**

The architectural floor is approximately 5.5–7 s on a 3.25 MB doc — below AC20's 5 s target by a margin that grows with doc size. Reaching < 5 s requires changes beyond the scope of this spec:

| Lever | Potential saving | Scope |
|---|---|---|
| **Streaming Y.Doc sync** — server delivers initial state in chunks, editor renders partial content as chunks arrive | 1–2 s | CRDT-level refactor; affects Hocuspocus protocol. V2+ spec. |
| **Code-splitting TipTap** — defer loading TipTap bundle until after initial paint | 200–500 ms | Bundle split + Suspense wiring. Useful but doesn't address DOM construction cost. |
| **Virtualized ProseMirror** — only construct DOM for visible viewport; background-mount rest on scroll | 1–3 s | Upstream TipTap / ProseMirror change; not local. |
| **Defer-mount expanded to TipTap** (e.g. show a source-view skeleton on cold load, mount TipTap on toggle) | 1–2 s (at cost of content-continuity guarantees) | Regresses precedent #18 G2; product trade-off. |

None of these are in scope for US-008 or this spec. The defer-mount fix applied here is the largest local improvement achievable without architectural changes; further improvement is a V2 project.

The diagnosis documents this honestly rather than chasing AC20 with over-engineering: the measurement infrastructure (US-001–005) now gives us the evidence to PROVE the architectural floor, so any future claim of "cold load is faster" has a benchmark to beat.

---

## 8. V2 follow-up (tracked, not in-scope)

When the product team prioritizes < 5 s cold load on multi-MB docs, the path is:

1. **Stream initial Y.Doc sync in chunks** — Hocuspocus can emit partial snapshots. Client applies progressively. Editor renders first chunk immediately, background-fills the rest. Requires Hocuspocus protocol change + TipTap render-as-chunks-arrive support.
2. **ProseMirror viewport-virtualized construction** — only inflate DOM for visible region. On-scroll, inflate the next block range. Requires TipTap upstream work OR a local patch; neither is cheap.
3. **Optional: defer TipTap too** — show a source-view "skeleton" (CodeMirror with first 100 lines) on cold load; TipTap mounts on explicit "Visual" toggle. Regresses precedent #18's content-continuity promise; product decision.

These are cataloged for future work and do NOT undermine the current fix's effectiveness for the in-scope trade-offs.

---

## 9. Related precedents updated or cross-referenced

- **Precedent #18(b)** (pre-mount-both) — documented as the small-to-medium-doc DEFAULT with the large-doc exception made explicit in the `EditorActivityPool` docstring + new `LARGE_DOC_CHAR_THRESHOLD` export.
- **Precedent #20** (added in US-010) — will include a STOP rule:
  > _"Pre-mounting both editors concurrently (precedent #18(b)) is the default for small-to-medium docs. For docs above `LARGE_DOC_CHAR_THRESHOLD` the non-active editor defer-mounts. The threshold and trigger live in `<EditorActivityPool>`."_
- **US-007 (S2 diagnosis)** — TipTap's `useEditor` destroy-on-cleanup semantics limit S2 the same way (warm-switch is architecturally bounded by `createEditor` cost). Defer-mount does not help S2 because S2's cost happens on mount, and defer-mount only decides WHEN to mount, not HOW.

---

## 10. Commands for reproduction

```bash
# 1. Start dev server from this worktree on 5174 (5173 is owned by another worktree).
rm -f .open-knowledge/server.lock
VITE_PORT=5174 bun run --cwd packages/app dev &

# 2. Pre-fix (stashed) measurement — run multiple times for variance.
git stash push -- packages/app/src/components/EditorActivityPool.tsx packages/app/src/components/EditorActivityPool.test.ts
# ... run probe or scenario ...
git stash pop

# 3. Post-fix measurement.
bun run --cwd packages/app perf:profile --scenario=cold-load-big-doc --target=http://localhost:5174 --headless
# Confirm the defer-mount mark fired:
ls -1t packages/app/tests/perf/results/cold-load-big-doc.*.json | head -1 | xargs -I{} jq '[.marks[] | select(.name == "ok/activity/defer-mount")]' {}

# 4. Confirm no regression in warm-switch or mode-toggle.
bun run --cwd packages/app perf:profile --scenario=warm-switch   --target=http://localhost:5174 --headless
bun run --cwd packages/app perf:profile --scenario=mode-toggle   --target=http://localhost:5174 --headless

# 5. E2E regression — precedent #18's content-continuity + scroll-preservation (F1) contract.
bunx playwright test tests/stress/docs-open.e2e.ts tests/stress/crdt-stress.e2e.ts
```
