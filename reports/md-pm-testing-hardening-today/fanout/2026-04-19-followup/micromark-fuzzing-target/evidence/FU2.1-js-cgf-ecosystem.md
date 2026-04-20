# Evidence: FU2.1 — JS Coverage-Guided Fuzzing Ecosystem (2025–2026)

**Dimension:** Coverage-guided fuzz in JS ecosystem today
**Date:** 2026-04-19
**Sources:** npm registry, GitHub API, OSS-Fuzz repo, Code Intelligence blog, Project Zero repos

---

## Key files / pages referenced

- https://github.com/CodeIntelligenceTesting/jazzer.js — primary live tool repo
- https://registry.npmjs.org/@jazzer.js/core — version/publish timestamps
- https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-targets.md — harness API
- https://github.com/CodeIntelligenceTesting/jazzer.js/issues/343 — Vitest integration (still open)
- https://github.com/fuzzitdev/jsfuzz — archived 2021-04-30
- https://github.com/connor4312/js-fuzz — WIP, unpublished to npm
- https://github.com/googleprojectzero/fuzzilli — engine-level, out of scope
- https://github.com/google/oss-fuzz/issues/11652 — OSS-Fuzz re: Jazzer.js "discontinued" claim (contradicted by v4.0.0 shipping 2026-04-15)
- https://www.code-intelligence.com/blog/cve-protobufjs-prototype-pollution-cve-2023-36665 — one documented Jazzer.js parser find

---

## Findings

### Finding: Jazzer.js is the only actively-maintained coverage-guided fuzzer for pure-JS targets as of April 2026
**Confidence:** CONFIRMED
**Evidence:** `@jazzer.js/core@4.0.0` published 2026-04-15T14:10:03Z (npm `time["4.0.0"]`); repo `pushed_at: 2026-04-16T23:32:31Z`; `archived: false`.
```
npm registry @jazzer.js/core time["4.0.0"]: 2026-04-15T14:10:03Z
GitHub API CodeIntelligenceTesting/jazzer.js pushed_at: 2026-04-16T23:32:31Z
weekly downloads (2026-04-12..2026-04-18): @jazzer.js/core=1486, @jazzer.js/jest-runner=345
```
**Implications:** The "JS CGF ecosystem" effectively means Jazzer.js — there is no live second choice. This is a single-vendor, ~1.5k-weekly-download project, with a known open-source-status ambiguity (OSS-Fuzz issue #11652 claim contradicted by the repo's continued publishing cadence).

### Finding: Jazzer.js uses libFuzzer via a C++ native addon; instrumentation is Babel AST rewrites through `istanbul-lib-hook` (CJS) or `module.register` ESM loader hook
**Confidence:** CONFIRMED
**Evidence:** `packages/instrumentor` README — "provides and registers Babel plugins to transform code in such a way that it provides feedback to the fuzzer"; `@jazzer.js/core@4.0.0` deps include `istanbul-lib-coverage`, `istanbul-lib-report`, `istanbul-reports`; repo language breakdown 63.7% TS, 27.8% JS, 6.2% C++.
**Implications:** Node (>= 20.6 for ESM support); vitest runner not supported (issue #343 open since 2023-02-23). Bun/Deno support is not documented — flagged NOT FOUND.

### Finding: Fuzz target signature is `module.exports.fuzz = function(data: Buffer)` (CJS) or `export function fuzz(data)` (ESM), with optional `FuzzedDataProvider` for structured input
**Confidence:** CONFIRMED
**Evidence:** https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-targets.md
```js
module.exports.fuzz = function (data /* Buffer */) {
  myCode(data.toString());
};
```
**Implications:** Harness for micromark looks like `micromark(data.toString("utf-8"))` with `-max_len=512000`.

### Finding: jsfuzz (fuzzitdev) is archived since 2021-04-30; last npm publish 1.0.15 on 2021-01-09
**Confidence:** CONFIRMED
**Evidence:** GitHub API `archived: true`, `pushed_at: 2021-04-30T03:40:55Z`; npm `jsfuzz@1.0.15` publish date 2021-01-09.
**Implications:** Not a live option in 2025-2026.

### Finding: connor4312/js-fuzz is effectively dormant and never published to npm
**Confidence:** CONFIRMED
**Evidence:** GitHub `pushed_at: 2025-02-12T19:52:37Z` but no releases; `js-fuzz` npm `dist-tags.latest: null`; README self-describes as "work in progress and is probably not suitable for 'real' use yet".
**Implications:** Not installable as a dependency; not a live option.

### Finding: fuzzilli fuzzes the JS engine itself (V8, JSC, SpiderMonkey, Duktape, JerryScript, Hermes) via FuzzIL + engine patches — NOT user-package level
**Confidence:** CONFIRMED
**Evidence:** https://github.com/googleprojectzero/fuzzilli README; saelo's FuzzIL thesis https://saelo.github.io/papers/thesis.pdf
**Implications:** Explicitly out of scope — cannot target micromark as a package.

### Finding: Jazzer.js has documented finds in JS parser-adjacent targets (protobuf.js CVE-2023-36665), but NO documented micromark/markdown-it/marked/remark find as of April 2026
**Confidence:** CONFIRMED for protobuf.js (CVE + blog); NOT FOUND for any markdown parser.
**Evidence:** https://www.code-intelligence.com/blog/cve-protobufjs-prototype-pollution-cve-2023-36665 (2023-06-27, Peter Samarin). Searched: Code Intelligence blog, `site:github.com Jazzer.js markdown`, CVE DBs for "markdown-it", "marked", "micromark" 2023-2026 — no match.
**Implications:** Empirical track record for Jazzer.js on markdown is zero published datapoints. Not a disqualifier, but worth noting.

---

## Negative searches (for NOT FOUND)

- Searched: "jazzer.js Bun support" — no primary-source docs found.
- Searched: "jazzer.js Deno" — no primary-source docs.
- Searched: "jazzer.js vitest" — Issue #343 open, no integration.
- Searched: OSS-Fuzz `projects/<name>/project.yaml` for {markdown-it, marked, micromark, remark, htmlparser2, cheerio, node} → all 404 (only `javascript-example` and `js-yaml` returned 200).
- Searched: `fuzztest` on npm → `dist-tags.latest: null` (doesn't exist as JS package).

---

## Gaps / follow-ups

- The OSS-Fuzz issue #11652 claim of "Jazzer.js discontinued" contradicts v4.0.0 shipping 2026-04-15 and continued commits. Code Intelligence's stance on long-term maintenance is ambiguous — a support-continuity risk worth noting in the report but not resolvable from primary sources.
