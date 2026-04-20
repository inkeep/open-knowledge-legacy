# Evidence: FU2.6 — Practical Fuzz Harness Architecture

**Dimension:** Minimum viable harness + CI gating + corpus + worker-thread isolation
**Date:** 2026-04-19
**Sources:** Jazzer.js docs, LLVM libFuzzer docs, OSS-Fuzz CIFuzz, ClusterFuzzLite, Node worker_threads, Piscina, micromark README

---

## Key files / pages referenced

- https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-targets.md
- https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-settings.md
- https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/jest-integration.md
- https://github.com/CodeIntelligenceTesting/jazzer.js/tree/main/examples — js-yaml, xml, protobufjs, jpeg, jpeg_es6, jest_integration, jest_typescript_integration, spectral, bug-detectors, custom-hooks, FuzzedDataProvider, maze
- https://llvm.org/docs/LibFuzzer.html — `-max_len`, `-merge`, `-max_total_time` semantics
- https://google.github.io/oss-fuzz/getting-started/continuous-integration/ — CIFuzz is PR-only, `fuzz-seconds` default 600
- https://google.github.io/clusterfuzzlite/running-clusterfuzzlite/github-actions/ — batch/prune/coverage cron modes
- https://google.github.io/clusterfuzzlite/ — JS not in supported language list
- https://github.com/micromark/micromark#safety — 500KB + worker-thread recommendation
- https://nodejs.org/api/worker_threads.html — `resourceLimits`, `terminate()`
- https://github.com/piscinajs/piscina — worker pool manager (no fuzz docs)

---

## Findings

### Finding: Harness signature is `module.exports.fuzz = function (data: Buffer)` (CJS) or `export function fuzz(data)` (ESM); CLI corpus is positional
**Confidence:** CONFIRMED
**Evidence:**
```js
const { FuzzedDataProvider } = require("@jazzer.js/core");
module.exports.fuzz = function (fuzzerInputData) {
    micromark(fuzzerInputData.toString("utf-8"));
};
```
CLI: `npx jazzer fuzz-target ./corpus -- -max_len=512000 -max_total_time=1800`
**Implications:** Harness itself is ~10 lines. The complexity lives in build config, CI scheduling, corpus management — not target code.

### Finding: libFuzzer `-max_len` is bytes, default 4096 when no corpus; pass `-max_len=512000` for the 500KB cap
**Confidence:** CONFIRMED
**Evidence:** LLVM libFuzzer docs `-max_len`: "Maximum length of a test input. If 0 (the default), libFuzzer tries to guess a good value based on the corpus (and reports it)."
**Implications:** Maps cleanly to micromark's 500KB recommendation. UTF-8 caveat: the cap is on pre-decode bytes; multi-byte characters produce a shorter post-decode string — fine, since micromark consumes the original bytes.

### Finding: micromark README Safety section (primary source of 500KB cap + worker-thread recommendation)
**Confidence:** CONFIRMED
**Evidence:** https://github.com/micromark/micromark#safety: "It is wise to cap the accepted size of input (500kb can hold a big book) and to process content in a different thread or worker so that it can be stopped when needed."
**Implications:** The recommendation is a documented library posture, not a benchmark-derived threshold.

### Finding: OSS-Fuzz CIFuzz is PR-only with `fuzz-seconds: 600` default; ClusterFuzzLite adds batch/prune/coverage cron modes
**Confidence:** CONFIRMED
**Evidence:**
- CIFuzz docs: "on: [pull_request]", 600s default, max 21600s GH Actions run time.
- ClusterFuzzLite modes:
  - code-change (PR): `fuzz-seconds: 600`, `pull_request`
  - batch (continuous): `cron: '0 0/6 * * *'`, `fuzz-seconds: 3600`, `mode: 'batch'`
  - prune (daily): `cron: '0 0 * * *'`, `mode: 'prune'`
  - coverage: `sanitizer: 'coverage'`, `mode: 'coverage'`
**Implications:** Templates exist for GitHub Actions cron-triggered nightly fuzz runs. BUT:

### Finding: ClusterFuzzLite does NOT list JavaScript/Jazzer.js in supported languages
**Confidence:** CONFIRMED
**Evidence:** ClusterFuzzLite overview lists: C, C++, Java, Go, Swift, Python, Rust.
**Implications:** The polished CI template from Google is not directly applicable to Jazzer.js. A Jazzer.js CI workflow must be hand-rolled — Node/npm GH Actions + `npx jazzer` + corpus artifacts + cron trigger.

### Finding: No published GitHub Action wraps Jazzer.js for nightly fuzzing
**Confidence:** NOT FOUND
**Evidence:** Searched "Jazzer.js GitHub Actions nightly fuzz 2025", "jazzer.js action marketplace".
**Implications:** CI integration is bespoke. This is additional implementation burden vs e.g. cargo-fuzz (which has well-trodden paths).

### Finding: Jazzer.js crash inputs land at `./[testFileName]/[describeBlock]/[testName]/`; corpus at `./.cifuzz-corpus/...`; regression replay is default, fuzz mode is `JAZZER_FUZZ=1`
**Confidence:** CONFIRMED
**Evidence:** jest-integration.md — "the file name of every input is used to generate a dedicated test entry in the overall Jest report. Each saved crash input becomes an individual test case verifying the fix."
**Implications:** Regression-suite story is good: crash seeds are committed as files, auto-replayed by Jest (or Vitest, if the open issue is ever closed).

### Finding: Node `worker_threads` provides `resourceLimits.maxOldGenerationSizeMb`, `maxYoungGenerationSizeMb`, `stackSizeMb`, and `worker.terminate()` for isolation + timeout
**Confidence:** CONFIRMED
**Evidence:** https://nodejs.org/api/worker_threads.html — `resourceLimits` docs: "Reaching these limits leads to termination of the Worker instance."
```js
const worker = new Worker('./script.js', {
  resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 128, stackSizeMb: 4 }
});
const timeout = setTimeout(() => worker.terminate(), 5000);
worker.on('exit', () => clearTimeout(timeout));
```
**Implications:** Node primitives support the pattern micromark's README recommends. For a fuzz harness: process = 1 worker per micromark invocation, with heap + time budget, so OOM/hangs don't kill the Jazzer.js driver.

### Finding: No primary source documents running a Jazzer.js harness inside a Node worker thread
**Confidence:** NOT FOUND
**Evidence:** Searched "Jazzer.js worker_threads isolation", "jazzer.js worker pool". Jazzer.js itself runs as a Node process via `npx jazzer`; wrapping micromark inside a worker inside the harness is an additional pattern not covered in official docs.
**Implications:** Feasible combinatorially from primitives but not published as a pattern. A harness builder would write this glue themselves.

---

## Negative searches (for NOT FOUND)

- Searched: "Jazzer.js GitHub Actions nightly" — no marketplace action.
- Searched: "Jazzer.js Piscina integration" — no documentation.
- Searched: "libfuzzer max_len UTF-8 multibyte" — no UTF-8-specific guidance.

---

## Gaps / follow-ups

- No primary-source benchmark of Jazzer.js per-iteration overhead on a small parser target. Affects CI budgeting.
