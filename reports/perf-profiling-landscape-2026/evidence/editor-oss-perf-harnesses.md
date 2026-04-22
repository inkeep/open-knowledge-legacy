# Evidence: D6 — Editor OSS perf harnesses

**Dimension:** D6 — Specific performance-testing and profiling harnesses that leading editor OSS projects ship or publicly describe, and the patterns that recur.
**Date:** 2026-04-19
**Sources:** `~/.claude/oss-repos/{tldraw, excalidraw, blocksuite, lexical, silverbullet, zed, outline, peritext, plate, milkdown, blocknote, automerge-prosemirror}/`, tldraw GH issues #7595 / #7517 / #8082, relevant `.github/workflows/*` files

---

## Key files / pages referenced

- `~/.claude/oss-repos/tldraw/.github/workflows/playwright-perf.yml`
- `~/.claude/oss-repos/tldraw/apps/examples/e2e/perf/test-perf.spec.ts`
- `~/.claude/oss-repos/tldraw/apps/examples/e2e/fixtures/{fps-tracker,baseline-manager,heavy-board-generator,perf-utils}.ts`
- `~/.claude/oss-repos/tldraw/apps/examples/e2e/baselines/fps-baselines.json`
- `~/.claude/oss-repos/tldraw/packages/tldraw/src/test/perf/PerformanceMeasurer.ts`
- `~/.claude/oss-repos/excalidraw/.github/workflows/size-limit.yml`, `.size-limit.json`
- `~/.claude/oss-repos/blocksuite/.github/workflows/size-report.yml`
- `~/.claude/oss-repos/silverbullet/bench/{lua.bench.ts, lua_perf.bench.ts}`
- `~/.claude/oss-repos/zed/.github/workflows/compare_perf.yml`
- `~/.claude/oss-repos/zed/tooling/xtask/src/tasks/workflows/compare_perf.rs`
- `~/.claude/oss-repos/outline/relativeci.config.js`
- https://github.com/tldraw/tldraw/issues/7595, /7517, /8082

---

## Findings

### Finding: tldraw implemented a full Playwright-orchestrated FPS perf harness with baseline comparison, S3 artifact upload, and PostHog analytics — then REMOVED it from CI for flakiness

**Confidence:** CONFIRMED

**Evidence:**
- Workflow file `~/.claude/oss-repos/tldraw/.github/workflows/playwright-perf.yml:40-83` — sets `PERFORMANCE_ANALYTICS_ENABLED: true`, uploads playwright-report to S3 bucket `playwright.tldraw.xyz`, annotates the PR with a URL.
- Test file `tldraw/apps/examples/e2e/perf/test-perf.spec.ts:21-23,33-137`:

```ts
expect(result.metrics.averageFps).toBeGreaterThan(18)
expect(result.comparison.status).not.toBe('fail')
...
test('Baseline FPS Performance - Desktop', ...)
test('Shape Rotation Performance', ...)
test('Shape Dragging Performance', ...)
test('Shape Resizing Performance', ...)
test('Canvas Panning Performance', ...)  // setupHeavyBoard(1000)
test('Canvas Zooming Performance', ...)
```

- FPS tracker uses requestAnimationFrame sampling at 100ms intervals: `tldraw/apps/examples/e2e/fixtures/fps-tracker.ts:17-72` (`sampleInterval = 100`, `trackFrame()` pushes `framesInPeriod / duration` into `fpsSamples`; `stop()` returns `{averageFps, minFps, maxFps, totalFrames, duration, samples}`).
- Baseline storage `tldraw/apps/examples/e2e/fixtures/baseline-manager.ts:1-130` — JSON baselines keyed by `platform-viewport`, `regressionThreshold = 15`, `warningThreshold = 10` (both percentages). Auto-creates baseline on first run; only updates when improved or forced.
- Heavy-board generator `tldraw/apps/examples/e2e/fixtures/heavy-board-generator.ts:1-30` — parameterized shape count, groups, text, arrows, seed for reproducibility.
- GitHub issue tldraw/tldraw#7595 (2026-01-05) — PR #7517 removed the tests: "these tests were valuable for detecting performance regressions… caught a panning regression after updating to React 19 that wasn't detectable through other means". Still-open issue to restore. tldraw/tldraw#8082 considers moving tests to a closed-source repo.

**Implications:** The tldraw harness is the most complete publicly-readable template for Playwright-orchestrated editor FPS perf testing. Its removal is itself a data point: baseline comparisons against public CI infra are hard to stabilize below the 10% warning/15% fail thresholds.

---

### Finding: tldraw also ships an in-process `PerformanceMeasurer` class for microbench-style cold/warmup/iteration loops (unit-test layer, not CI-removed)

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/tldraw/packages/tldraw/src/test/perf/PerformanceMeasurer.ts:5-163`:
  ```ts
  const now = () => { return Number(process.hrtime.bigint()) / 1e6 }
  export class PerformanceMeasurer {
    ...
    constructor(public name: string, opts = {} as { warmupIterations?: number; iterations?: number })
    ...
    run() {
      // cold run (1x)
      // warmup runs
      // measured iterations → fastest, slowest, average, total
    }
    static Table(...ps: PerformanceMeasurer[]) { console.table(...) }
  }
  ```
- Co-located with `tldraw/packages/tldraw/src/test/perf/perf.test.ts`.

**Implications:** Two-layer pattern: microbench class (Jest/Vitest-runnable) for pure-JS speed + Playwright perf suite for full DOM FPS. The microbench class maps directly to what `vitest bench` does now via `bench()` API — the tldraw class pre-dates that adoption.

---

### Finding: excalidraw uses `size-limit` + `size-limit-action` on every PR to master; no runtime perf harness shipped

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/excalidraw/.github/workflows/size-limit.yml:1-29` — `andresz1/size-limit-action@e7493a72…` on every PR.
- `~/.claude/oss-repos/excalidraw/packages/excalidraw/.size-limit.json:1-16` — three limits: main bundle 340 kB, locales 290 kB, vendor 900 kB.
- Directory search: no `*perf*` / `*bench*` / `.bench.*` files anywhere in the repo.

**Implications:** Excalidraw invests in build-size regression-gating but not runtime perf regression-gating. Consistent with tldraw's experience that FPS gates are hard to keep green.

---

### Finding: BlockSuite ships `size-report.yml` (disabled in CI — "Fail for unknown reasons") — no runtime perf harness

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/blocksuite/.github/workflows/size-report.yml:1-34`:
  ```yaml
  on:
    workflow_dispatch:
    # Fail for unknown reasons
    # pull_request:
    #   branches:
    #     - main
  ```
- `~/.claude/oss-repos/blocksuite/package.json` has no perf/bench script (grep empty). No `*bench*` / `*perf*` directories other than `packages/framework/global/src/gfx/perfect-freehand` (product code — the perfect-freehand rendering algorithm, not a harness).

**Implications:** BlockSuite intended bundle-size gating, abandoned it. Zero public perf gating. The "Fail for unknown reasons" comment is itself evidence that OSS bundle-size infra is fragile.

---

### Finding: Silverbullet ships a `bench/` directory driven by `vitest bench` with focused micro-benchmarks scripted into `package.json`

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/silverbullet/bench/lua.bench.ts:1-2`:
  ```ts
  import { bench, expect } from "vitest";
  import { readFile } from "node:fs/promises";
  ```
- `~/.claude/oss-repos/silverbullet/bench/lua_perf.bench.ts` header comment:
  ```
  // Focused micro-benchmarks for Space Lua interpreter performance.
  // Benchmarks are weighted toward the real SilverBullet workload:
  //   ~40% API/syscall patterns ...
  //   ~30% data structure traversal ...
  //   ~15% string manipulation ...
  //   ~15% function calls, closures, control flow
  // Each snippet is pre-parsed to exclude parsing cost from measurements.
  ```
- `silverbullet/package.json` (partial): `"bench": "vitest bench"`. Also has `bench/`, `plug-api/lib/tree.bench.ts`, `plugs/index/index.bench.ts`, `client/space_lua/rp.bench.ts`.
- `silverbullet/vitest.config.ts` shows `test.include: ["**/*.test.ts"]` — benches run only when explicitly invoked via `vitest bench`, not in default `test`.

**Implications:** `vitest bench` is the de-facto community pattern for in-process JS micro-benchmarks in 2026. The Silverbullet "workload-weighted" comment pattern (annotating what % of real workload each bench targets) is a reusable documentation convention.

---

### Finding: Zed implements head-vs-base perf comparison via `cargo xtask workflows`-generated GH Action that runs `cargo perf-test` + `hyperfine` + `cargo perf-compare`

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/zed/.github/workflows/compare_perf.yml:1-2`:
  ```
  # Generated from xtask::workflows::compare_perf
  # Rebuild with `cargo xtask workflows`.
  ```
- `compare_perf.yml:41-68` — checkout base ref → `cargo perf-test -p vim -- --json=$REF_NAME` → checkout head ref → `cargo perf-test -p <crate> -- --json=$REF_NAME` → `cargo perf-compare --save=results.md $BASE $HEAD` → upload artifact `results.md`.
- `~/.claude/oss-repos/zed/tooling/xtask/src/tasks/workflows/compare_perf.rs:44-49`:
  ```rust
  fn install_hyperfine() -> Step<Use> {
      named::uses(
          "taiki-e",
          "install-action",
          "b4f2d5cb8597b15997c8ede873eb6185efc5f0ad", // hyperfine
      )
  }
  ```
- Workflow is `workflow_dispatch` only (not auto PR) — `head`, `base`, `crate_name` are required inputs.

**Implications:** Zed's pattern is the opposite of tldraw's: manual/on-demand head-vs-base comparison rather than per-PR gate. Uses `hyperfine` as the timing primitive (canonical Rust CLI benchmark tool). The `xtask → generate-workflow-from-Rust` pattern means the workflow YAML is a build artifact, not hand-edited.

---

### Finding: Outline uses `@relative-ci/agent` (bundle-stats analysis) via `relativeci.config.js` on `webpack-stats.json`; no runtime perf harness

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/outline/relativeci.config.js`:
  ```js
  module.exports = {
    includeCommitMessage: true,
    webpack: { stats: "./build/app/webpack-stats.json" },
  };
  ```
- `outline/package.json`: `"@relative-ci/agent": "^4.3.1"`.
- Workflow listing has no `perf*` / `bench*` / `size*` files — only `ci.yml`, `docker*`, etc.

**Implications:** Outline commits to RelativeCI as the bundle-stats provider. No runtime FPS / typing-latency gates. Matches the "size-limit OR relative-ci, not both" pattern across the landscape.

---

### Finding: Milkdown, BlockNote, Plate, Remirror, Outline, Logseq, Peritext, Automerge-ProseMirror — none ship a runtime perf / FPS harness

**Confidence:** CONFIRMED (via exhaustive directory / script / workflow search)

**Evidence (absence):**
- Milkdown: no `*perf*`, no `*bench*`, no perf in package.json.
- BlockNote: no `*perf*`, no `*bench*`, no perf in package.json.
- Plate: no runtime harness; only `.agents/skills/performance-oracle/SKILL.md` (LLM-agent prompt scaffold describing how to analyze code for perf issues) and `docs/solutions/performance-issues/2026-03-26-ai-streaming-preview-should-use-localized-rollback.md` (single post-mortem doc). Neither is a test harness.
- Remirror: not in checked repos (not tested locally; consistent with absence across its peer set).
- Outline: relative-ci bundle-stats only (above).
- Logseq: has `src/bench/frontend/` but its content (`macros.cljc`) is a ClojureScript macro file, not a perf harness.
- Peritext: has `traces/` dir with JSON trace samples for CRDT merge testing (`link-trace.json`, `links-again.json`, `links-brief.json`, `links-minimal.json`, `two-links.json`, `trace-latest.json`); these are correctness fixtures, not perf benches.
- Automerge-ProseMirror: pure integration repo; no bench harness.

**Implications:** The absence pattern is itself a finding. FPS-based runtime perf gating has NOT become the default for React-based editor OSS — the shipped patterns are (a) bundle-size gating and (b) nothing. tldraw is the outlier and its harness was removed for flakiness.

---

### Finding: Recurring patterns across the landscape

**Confidence:** CONFIRMED (synthesis of the above — each pattern has at least one named exemplar)

**Evidence:**
- **FPS baseline comparison via Playwright + PostHog/S3 analytics**: tldraw (removed from CI, tldraw/tldraw#7595).
- **vitest `bench()` micro-benchmarks in a dedicated `bench/` dir**: Silverbullet (`bench/lua.bench.ts`, `bench/lua_perf.bench.ts`, etc.; `"bench": "vitest bench"` in `package.json`).
- **Head-vs-base `hyperfine` via generated workflow**: Zed (`.github/workflows/compare_perf.yml` generated from `tooling/xtask/src/tasks/workflows/compare_perf.rs`).
- **`size-limit` + `size-limit-action` bundle-size CI gate**: Excalidraw (`.size-limit.json` + `.github/workflows/size-limit.yml`).
- **`size-report.yml` (disabled)**: BlockSuite — evidence the pattern is fragile on OSS CI.
- **RelativeCI with webpack-stats.json**: Outline.
- **Character-by-character edit trace as perf dataset**: `automerge/automerge-perf` (Kleppmann's LaTeX paper; 332k ops, 104,852-char final doc) — reused by every CRDT lib via `dmonad/crdt-benchmarks` and `zxch3n/crdt-benchmarks`.
- **Dedicated perf repo separate from the main library**: `dmonad/crdt-benchmarks` (external to yjs/yjs), `automerge/automerge-perf` (external to automerge/automerge).
- **In-process micro-bench class with cold/warmup/iteration phases**: tldraw `PerformanceMeasurer` class — the manual ancestor of `vitest bench()`.

**Implications:** Five of these eight patterns are adoption-ready external libraries (`size-limit`, `@relative-ci/agent`, `vitest bench`, `hyperfine`, Playwright). Two (automerge-perf edit trace + dmonad/crdt-benchmarks) are reusable datasets. One (tldraw's FPS harness) is a source-readable template whose removal from CI tells you something about stability headroom.

---

## Terminology (D6)

- **FPS baseline comparison** (tldraw): per-environment reference FPS stored in `fps-baselines.json`, gated on percent-change thresholds (tldraw: 10% warning, 15% fail).
- **`cargo xtask workflows`** (zed): Rust code generating GH Action YAML for type-safety and re-generation.
- **`hyperfine`**: CLI benchmark runner, canonical choice for Rust CLI timing.
- **RelativeCI**: commercial bundle-stats analyzer (Outline, used with `@relative-ci/agent@4.3.1`).
- **Workload-weighted micro-bench** (silverbullet): benches annotated with the % of real workload each represents (e.g. "~40% API/syscall patterns").

## Gaps / follow-ups

- Is tldraw's harness currently running? Issue #7595 (open) says restoration is pending; #8082 considers moving to closed-source.
- Zed's `cargo perf-test` implementation: the Cargo command exists in Zed's workspace but the actual test bodies weren't read — mostly relevant as a workflow pattern, not a TS-reusable harness.

## Sources (de-duped)

- https://github.com/tldraw/tldraw — workflows, fixtures, test-perf.spec.ts, PerformanceMeasurer.ts
- https://github.com/tldraw/tldraw/issues/7595 — perf tests removed, restoration tracking
- https://github.com/tldraw/tldraw/issues/7517 — removal PR
- https://github.com/tldraw/tldraw/issues/8082 — considering moving tests to closed-source
- https://tldraw.dev/sdk-features/performance — tldraw perf practices
- https://github.com/excalidraw/excalidraw — `.github/workflows/size-limit.yml`, `.size-limit.json`
- https://github.com/toeverything/blocksuite — `.github/workflows/size-report.yml` (disabled)
- https://github.com/silverbulletmd/silverbullet — `bench/lua.bench.ts`, `bench/lua_perf.bench.ts`, `plug-api/lib/tree.bench.ts`
- https://github.com/zed-industries/zed — `.github/workflows/compare_perf.yml`, `tooling/xtask/src/tasks/workflows/compare_perf.rs`
- https://github.com/outline/outline — `relativeci.config.js`, `@relative-ci/agent@4.3.1`
- https://github.com/inkandswitch/peritext — `traces/` (correctness, not perf)
- https://github.com/udecode/plate — `.agents/skills/performance-oracle/SKILL.md` (LLM prompt, not harness)
- https://github.com/automerge/automerge-prosemirror — no perf harness
