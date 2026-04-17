# Parse-health counter + gate contract

Authoring reference for the parse-health subsystem: four in-memory counters that signal when the markdown pipeline exercises its fallback paths, a CI gate that fails PRs when those counters cross calibrated thresholds, and a structured-JSON log channel that downstream aggregators consume.

This document is the contract. The code is the implementation.

---

## Contents

1. [What parse-health is](#what-parse-health-is)
2. [Counter catalog](#counter-catalog)
3. [Where counters fire](#where-counters-fire)
4. [Log events](#log-events)
5. [Gate contract](#gate-contract)
6. [Baseline lifecycle](#baseline-lifecycle)
7. [CI tier placement](#ci-tier-placement)
8. [HTTP endpoint](#http-endpoint)
9. [How to add a new counter](#how-to-add-a-new-counter)
10. [Design notes](#design-notes)
11. [Cross-references](#cross-references)

---

## What parse-health is

Parse-health is a **process-local counter suite** observed at two surfaces:

- **Structured `console.warn` per event** — one JSON line per fallback, consumed by log aggregators and test helpers (`packages/app/tests/fidelity/expect-parse-event.ts`).
- **Aggregate counters** exposed via `GET /api/metrics/parse-health` — consumed by tests, ops dashboards, and the CI gate.

The counters answer the question: *"is the pipeline silently degrading for documents it used to handle cleanly?"*. Fidelity PBT invariants (I1-I11) prove the pipeline **can't** crash on generated inputs; parse-health counters prove the pipeline **isn't** exercising fallback paths on real corpus.

The two channels are complementary: PBT is forward-looking (proves crash resistance under synthetic pressure), counters are backward-looking (proves no regression on committed fixtures).

**Why in-memory, not CRDT.** Parse events don't need convergence across peers — each client re-parses independently and produces the same counts. A Y.Map of counters would bleed CRDT history for values nobody reads collaboratively. The counters live in module-local state and `globalThis`; they reset on process restart. See [Design notes](#design-notes) for the CJS ↔ ESM bridge rationale.

---

## Counter catalog

| Counter | Type | Origin | Fire condition |
|---|---|---|---|
| `parseFallback.blockLevel` | cumulative | `parse-with-fallback.ts` | `parseWithFallback` isolates a failing block, emits `rawMdxFallback`, and the rest of the doc parses clean |
| `parseFallback.wholeDoc` | cumulative | `parse-with-fallback.ts` | `parseWithFallback` gave up on split-then-rejoin recovery; whole doc becomes one `rawMdxFallback` |
| `ypsMismatch.block` | cumulative | `patches/y-prosemirror@1.3.7.patch` | `y-prosemirror` `schema.node()` throws at block context during CRDT → PM materialization; patch substitutes a visible `rawMdxFallback` node instead of the destructive delete |
| `ypsMismatch.inline` | cumulative | `patches/y-prosemirror@1.3.7.patch` | Same, but inline context — patch logs + skips the offending mark/text (no inline fallback node exists) |

All four are monotonic in-process counters. There is no rate, timestamp, or window — every fire increments by 1 over the process's lifetime. `resetParseHealth()` exists for test-only reset; production callers never reset.

**Read path:** `getParseHealth(): ParseHealthMetrics` at `packages/core/src/metrics/parse-health.ts:83-89`.

**Write paths:**

| Counter | Increment helper | Actual caller |
|---|---|---|
| `parseFallback.blockLevel` | `incrementBlockFallback()` | `parse-with-fallback.ts:81, 324` |
| `parseFallback.wholeDoc` | `incrementWholeDocFallback()` | `parse-with-fallback.ts:49, 71, 123` |
| `ypsMismatch.block` | `incrementYpsMismatchBlock()` (ESM test seeding only) | `patches/y-prosemirror@1.3.7.patch` at `createNodeFromYElement` (block-context substitution path); `globalThis.__okYpsCounters.block++` is patched in both CJS dist and ESM sibling (doubled so the patched dist loaded at runtime always increments regardless of which module-system path touched it first) |
| `ypsMismatch.inline` | `incrementYpsMismatchInline()` (ESM test seeding only) | Same patch at `createTextNodesFromYText` (inline-context log+skip path); doubled across CJS + ESM as above |

---

## Where counters fire

The fire-site map is load-bearing — when investigating a counter bump you should know which code path produced it without reading the full source.

### `parseFallback.blockLevel` fire sites

1. **Positional parse error, recursive split.** `parseRecursive` catches a throw whose error has `.place.offset` (or `.position.offset`). It increments, walks the source for an enclosing paired JSX tag or blank-line block boundary, emits a `rawMdxFallback` node for the failing region, and parses the before/after halves recursively. Most production block-level fires land here. Log event: `mdx-block-fallback` with `{offset, reason}`.

2. **Position-less parse error, per-block recovery.** `parseRecursive` catches a throw with no `.place`/`.position` (e.g., `prosemirror-model/schema.ts:201` RangeError from `PmNode.fromJSON`). At `depth === 0` only, `tryPerBlockFallback` splits the source at blank-line boundaries (fence-aware), parses each block independently, and substitutes `rawMdxFallback` for each failing block. **Each failing block increments the counter.** Log event: `mdx-block-fallback` with `{offset: blockStart, reason: "Per-block recovery after position-less error: …", blockError, blockErrorName}`.

The second site is what makes `blockLevel >= 2` possible on a single-document parse.

### `parseFallback.wholeDoc` fire sites

1. **Position-less error with no per-block recovery.** `tryPerBlockFallback` returned `null` (single block, or every block failed). `parseRecursive` increments `wholeDoc` and returns the source as raw text inside a paragraph. Log: `mdx-whole-doc-fallback` with `{reason}`.

2. **Recovery path itself throws.** The `try { … }` around the split-then-rejoin inner block catches unexpected errors (e.g., a bug in region detection), increments `wholeDoc`, and falls through. Log: `mdx-whole-doc-fallback` with `{reason: "Recovery failed: …"}`.

3. **Recursion exceeds `MAX_SPLIT_DEPTH = 20`.** The guard at the top of `parseRecursive` increments + returns whole-doc raw text. Protects against pathological MDX that keeps re-splitting into still-broken halves. Log: `mdx-whole-doc-fallback` with `{reason: "MAX_SPLIT_DEPTH exceeded"}`.

`MAX_SPLIT_DEPTH` is exported so US-015's parametric boundary test exercises depth=N / depth=N+1 without duplicating the literal. Do not inline.

### `ypsMismatch.*` fire sites

Both live inside the `y-prosemirror@1.3.7` patch at the `schema.node()` call where upstream would call `Item.delete()` on a schema-throw. The patch replaces destructive delete with:

- **Block context** (attempting to materialize a block-level element that doesn't exist in our schema): increment `ypsMismatch.block`, substitute a `rawMdxFallback` node carrying the raw source. Visible in the editor; user sees "this block didn't match any known component" surface.
- **Inline context** (schema throw on a mark or inline node): increment `ypsMismatch.inline`, log + skip. We don't have an inline fallback node, so the offending mark is silently dropped from the materialized PM tree.

See AGENTS.md precedent #9 for the CRDT-permanent multi-peer data loss that motivated the patch, and `specs/2026-04-13-mdx-tolerant-parsing/evidence/y-prosemirror-failure-modes.md` for the full propagation trace.

---

## Log events

All parse-health events use **structured JSON** `console.warn` (not bracket-prefixed). The shape is fixed — test helpers assert on field presence. See AGENTS.md §Logging conventions for when to use structured-JSON vs bracket-prefix.

### `mdx-block-fallback`

Emitted once per block-level fallback.

```json
{"event":"mdx-block-fallback","offset":42,"reason":"Cannot close `span` (1:5-1:10) before end of paragraph"}
```

Per-block-recovery variant adds `blockError` and `blockErrorName`:

```json
{"event":"mdx-block-fallback","offset":0,"reason":"Per-block recovery after position-less error: Invalid content for node doc","blockError":"Expected '>' but got 'EOF'","blockErrorName":"MdxJsxError"}
```

### `mdx-whole-doc-fallback`

Emitted once per whole-doc fallback.

```json
{"event":"mdx-whole-doc-fallback","reason":"Recovery failed: Cannot read property 'slice' of undefined"}
```

Three `reason` families: `"MAX_SPLIT_DEPTH exceeded"`, `"Recovery failed: <err>"`, or the raw parse error message when no position info was available.

### `y-prosemirror` patch events

The patch emits events in the same structured-JSON pattern. Consult the patch file for exact shapes — they're versioned with the patch rather than pinned here, because the y-prosemirror upgrade re-ports them.

### Asserting events in tests

`packages/app/tests/fidelity/expect-parse-event.ts` intercepts `console.warn`, parses each line as JSON, and exposes matchers over the captured events. Use it whenever a fidelity test wants to assert "this input produced exactly one block-level fallback at offset 42" rather than "this input produced a block-level fallback somewhere."

---

## Gate contract

File: `packages/core/tests/health/parse-health-gate.ts`

The gate is two parts:

1. **Pure comparator** — `compareParseHealth(baseline, observed) → ParseHealthReport`. No side effects, unit-testable with synthetic inputs. Fails PRs.
2. **Effectful harvester** — `harvestParseHealth({corpus}) → ParseHealthSample`. Resets counters, drives `MarkdownManager.parseWithFallback` over the corpus, returns the snapshot. Used by the CLI entry and the tier-2 job.

### Threshold semantics

| Threshold | Formula | Meaning |
|---|---|---|
| `wholeDocMax` | pinned at `0` | **Absolute.** Any whole-doc fallback on the committed fidelity corpus means the pipeline silently degraded for a document it previously handled. Bumping this above 0 requires a decision-log entry. |
| `blockLevelMax` | captured at baseline run | Ratchet. Baseline captures the observed count from a clean run; CI fails if a PR increases it. Legitimate reductions tighten the ceiling immediately. |

Both use `>` comparison (boundary `==` passes). See test `'block-level fallback at baseline ceiling ⇒ PASS (boundary)'` at `parse-health-gate.test.ts:63-72`.

### What the gate catches

- **R6 block-level fallback regressions.** A refactor that reintroduces a crash where we previously caught + degraded cleanly.
- **R16 processor-caching state bleed.** Shared `MarkdownManager` accumulates extension state across parses; bleed causes a doc to fail parse on run 2 that passed on run 1. Gated by the "shared instance reused across harvests" test at `parse-health-gate.test.ts:170-184`.
- **R17 merged-walker ordering drift.** Phase A→B dispatcher passes that re-order silently produce different mdast; R20 validator caught this during the ship; the gate is the ongoing guard.
- **Latency-invisible regressions.** R4 perf gate catches slowdowns; parse-health catches regressions that are fast *because they skipped doing the work* (degraded to raw text).

### What the gate does NOT enforce (currently)

- **`ypsMismatch.*` counters are not gated yet.** The baseline only tracks `parseFallback`. ypsMismatch fires are observational — visible via `/api/metrics/parse-health` and logs, but not PR-blocking. Adding a gate requires extending both the `ParseHealthSample` interface and the baseline schema. See [How to add a new counter](#how-to-add-a-new-counter) §6.

---

## Baseline lifecycle

File: `packages/core/tests/health/baseline.json`

### Schema

```json
{
  "schemaVersion": 1,
  "capturedAt": "2026-04-16T08:20:00.000Z",
  "runnerClass": "local-m-series",
  "corpus": {
    "commonmarkExamples": 652,
    "gfmExamples": 20
  },
  "thresholds": {
    "wholeDocMax": 0,
    "blockLevelMax": 0
  },
  "observed": {
    "parseFallback": {
      "blockLevel": 0,
      "wholeDoc": 0
    }
  }
}
```

Field notes:

- `schemaVersion` — pinned at 1. `loadBaseline` throws on mismatch; don't bump silently.
- `capturedAt` — ISO 8601 UTC. Stamps the ratchet state for traceability.
- `runnerClass` — `local-m-series`, `local-x86`, `ci-ubuntu-latest`, etc. Different runner classes don't share baselines; baselines captured on hardware that differs materially in parse throughput will skew which thresholds are reachable.
- `corpus` — documents what was run. If the corpus changes (e.g., CommonMark version bump from 0.30 to 0.31), re-harvest before comparing.
- `thresholds` — the gate values.
- `observed` — stored for traceability; not used by the comparator.

### When to refresh

| Situation | Action |
|---|---|
| Legitimate regression reduction (refactor tightens coverage) | Harvest, update `blockLevelMax` down, commit with clear PR message |
| Corpus expansion (new fixtures added) | Re-harvest; expect `blockLevelMax` to change; update `corpus.*` counts |
| CommonMark / GFM version bump | Re-harvest on new corpus; check for threshold movement; decision-log if `wholeDocMax` needs to change |
| New fallback path added (e.g., tolerant-parsing spec's additional handlers) | Re-harvest to capture the new baseline |
| Runner class changed | Re-harvest; update `runnerClass`; never reuse a baseline across classes |
| Regression detected in PR | **Don't** refresh baseline to hide it. Investigate + fix. |

Rule of thumb: the baseline ratchets monotonically tighter. An upward bump (loosening) requires justification that survives review.

### Refresh command

```bash
bun run packages/core/tests/health/parse-health-gate.ts packages/core/tests/health/baseline.json
```

The CLI entry loads the baseline, harvests the real CommonMark + GFM corpus via `loadFidelityCorpus()`, compares, prints `formatReport`, exits 0 on pass / 1 on fail.

To capture fresh observed counts for a baseline rewrite, edit `baseline.json` with `observed` zeroed, run the CLI — the report will print the actual counts. Update `thresholds` and `observed` to match, commit.

---

## CI tier placement

| Tier | Task | What it runs | Wall-clock |
|---|---|---|---|
| Tier 1 (every PR) | `test:health:unit` | `parse-health-gate.test.ts` — synthetic comparator tests + end-to-end fixture harvest on the 5 pinned crash classes | <1s |
| Tier 2 (nightly) | `test:health` | Full fidelity-corpus harvest (652 CommonMark + 20 GFM) vs committed baseline | ~10s |

Turbo task definitions at `turbo.json`:

```json
"test:health:unit": {
  "dependsOn": [],
  "cache": true,
  "inputs": [
    "src/metrics/parse-health.ts",
    "src/markdown/**/*.ts",
    "tests/health/parse-health-gate.ts",
    "tests/health/parse-health-gate.test.ts"
  ]
},
"test:health": {
  "dependsOn": [],
  "cache": true,
  "inputs": [
    "src/metrics/parse-health.ts",
    "src/markdown/**/*.ts",
    "src/markdown/fixtures/**",
    "tests/health/parse-health-gate.ts",
    "tests/health/baseline.json"
  ]
}
```

Cache key design: tier-1 does not include `baseline.json` (the unit tests don't depend on it); tier-2 does. This lets baseline edits invalidate only the tier-2 cache without re-running tier-1 logic.

Why tier-1 gets the synthetic-regression tests but not the corpus harvest: 10s is acceptable for nightly but noticeable on every PR when most PRs don't touch the markdown pipeline. The synthetic crash-class coverage (5 classes from `crash-taxonomy.json`) is the PR-time confidence that the gate itself still works.

---

## HTTP endpoint

`GET /api/metrics/parse-health` at `packages/server/src/api-extension.ts`.

Response shape is the `ParseHealthMetrics` interface from `packages/core/src/metrics/parse-health.ts:50-53`:

```json
{
  "parseFallback": { "blockLevel": 0, "wholeDoc": 0 },
  "ypsMismatch": { "block": 0, "inline": 0 }
}
```

Use cases:

- **Tests** — Playwright E2E fetches the endpoint and asserts a user action didn't trip a counter.
- **Ops dashboards** — poll + diff between scrapes to surface per-session counter growth.
- **Debugging** — hit the endpoint after reproducing a suspected parse issue to confirm which code path handled it.

The endpoint is unauthenticated; it exposes no user content, only counter integers. If future auth is added, the shape does not change — stay compatible with existing consumers.

---

## How to add a new counter

Numbered so a future contributor can check off as they go.

1. **Name the counter.**
   - Group (top-level object key): existing groups are `parseFallback`, `ypsMismatch`. Add a new group if the counter is semantically independent; extend an existing group if it's a sibling fire site.
   - Field (camelCase): describes the fire condition, not the symptom. Prefer `blockLevel` over `partialFallback`.

2. **Decide the storage mechanism.**
   - If the counter fires from this module or its ESM importers only, put it on the local `metrics` const (see `parse-health.ts:55-57` for the pattern).
   - If it needs to be shared with a CJS patch (like `ypsMismatch`), use a `globalThis`-bridged store and document the bridge. See `ypsCounters()` at `parse-health.ts:42-48`.

3. **Extend the `ParseHealthMetrics` interface** at `parse-health.ts:50-53`. Add a `/** … */` comment describing the counter.

4. **Add increment + reset logic.**
   - Export `incrementX(): void` helper.
   - Add reset to `resetParseHealth()` at `parse-health.ts:91-97`.
   - Read path: extend `getParseHealth()` to return the new field.

5. **Emit a structured-JSON log event at the fire site.**

   ```typescript
   console.warn(JSON.stringify({ event: 'your-event-name', /* metadata */ }));
   ```

   Naming: `<subsystem>-<condition>`, lowercase, kebab-case. Examples: `mdx-block-fallback`, `yps-schema-throw`, `guard-over-restore`.

6. **Decide whether the counter should be gated.**
   - **Gate it** if: counter growth is a regression signal on the committed fixture corpus. Extend `ParseHealthSample` + `ParseHealthBaseline.thresholds` + `compareParseHealth()` with a new check. Update `baseline.json`. Add a `compareParseHealth` unit test in `parse-health-gate.test.ts`.
   - **Don't gate it** if: counter fires on valid in-the-wild content (e.g., `ypsMismatch` fires when a user document uses an unrecognized component — not a regression, just a signal). Expose via HTTP + logs; leave gating to future PRs.

7. **Expose via `/api/metrics/parse-health`.** No code change needed — the endpoint returns the whole `ParseHealthMetrics` interface. Verify the new field shows up.

8. **Add a synthetic-regression unit test** to `parse-health-gate.test.ts`. Three shapes:
   - Clean observed ⇒ PASS (proves no false positive).
   - Over-threshold observed ⇒ FAIL (proves gate fires).
   - Boundary observed (==) ⇒ PASS (proves `>` not `>=`).

9. **If gated, update the turbo task inputs** in `turbo.json` so editing the counter's fire site invalidates the tier-2 cache.

10. **Update this document.** Counter catalog, fire-site map, log event shapes. The contract stays accurate.

---

## Design notes

### CJS ↔ ESM counter bridge

The `ypsMismatch` counters live on `globalThis.__okYpsCounters` because the y-prosemirror patch runs in the package's CJS dist (and its ESM sibling). Both runtimes execute in the same Node.js / Bun process, but the CJS module cannot `require()` this ESM module. Shared-object mutation via `globalThis` is the standard cross-module-system instrumentation pattern.

Load ordering is irrelevant: whichever side touches `ypsCounters()` first creates the object; the other side binds to the same reference. The structural cast `globalThis as YpsCountersHost` keeps the global-namespace interaction local to this helper — no `declare global` pollution.

### Why counters and not events

A counter is a summary; an event stream is a log. We have both because they answer different questions:

- **"How many fallbacks happened this session?"** → counter (O(1) read, no log parsing).
- **"Which specific input caused the fallback at offset 42?"** → event (structured log).

A Y.Map of counters would conflate these with convergent state nobody reads collaboratively. Process-local counters + structured log is the right shape.

### Why `wholeDoc` is pinned to 0

The CommonMark corpus is 652 examples of valid CommonMark. Any whole-doc fallback means the pipeline couldn't even isolate a failing block — it lost the entire document to a raw-text paragraph. On valid CommonMark, this should **never** happen. The pin is an absolute correctness contract, not a perf metric.

---

## Cross-references

- **Counter source:** `packages/core/src/metrics/parse-health.ts`
- **Fallback site:** `packages/core/src/markdown/parse-with-fallback.ts`
- **y-prosemirror patch:** `patches/y-prosemirror@1.3.7.patch`
- **Gate logic:** `packages/core/tests/health/parse-health-gate.ts`
- **Gate tests:** `packages/core/tests/health/parse-health-gate.test.ts`
- **Baseline:** `packages/core/tests/health/baseline.json`
- **HTTP endpoint:** `packages/server/src/api-extension.ts`
- **Test helper (event assertions):** `packages/app/tests/fidelity/expect-parse-event.ts`
- **CI tier structure:** AGENTS.md §CI tier structure
- **Logging conventions:** AGENTS.md §Logging conventions
- **Precedent #9 (schema add-only):** AGENTS.md §Architectural precedents — motivates the y-prosemirror patch
- **Observability pattern:** `specs/2026-04-13-mdx-tolerant-parsing/evidence/observability-pattern.md`
- **Spec §R19:** `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md` — gate requirement + acceptance criteria
- **Related PBT invariants:** I8 (crash resistance), I9 (guard completeness), I10 (structural crash resistance), I11 (guard precision)
