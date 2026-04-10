# Evidence: Performance for Auto-Persistence Workload

**Dimension:** D4 — Performance for auto-persistence workload
**Date:** 2026-04-02
**Sources:** Val Town blog, Node.js issues, isomorphic-git issues, Azure Fluid Relay blog, local-git-merge-infrastructure report

---

## Key files / pages referenced

- https://blog.val.town/blog/node-spawn-performance/ — Node.js spawn performance benchmarks
- https://github.com/nodejs/node/issues/21632 — Windows spawn slowness
- https://github.com/nodejs/node/issues/14917 — spawn blocks event loop
- https://github.com/isomorphic-git/isomorphic-git/issues/291 — pack file performance
- https://github.com/isomorphic-git/isomorphic-git/issues/1841 — readBlob slowness
- https://isomorphic-git.org/docs/en/cache — cache parameter docs
- https://devblogs.microsoft.com/microsoft365dev/azure-fluid-relay-leveraging-azure-blob-storage-to-scale-git/ — Azure Fluid Relay pattern
- /Users/edwingomezcuellar/reports/local-git-merge-infrastructure/REPORT.md — prior research on CLI overhead

---

## Findings

### Finding: Node.js child_process.spawn overhead is ~1.5ms per invocation on Linux
**Confidence:** CONFIRMED
**Evidence:** Val Town blog benchmarks (Hetzner CCX33, 8 vCPUs, 32GB RAM)

Benchmarks show Node.js can handle ~651 spawns/second, meaning ~1.5ms per spawn including HTTP overhead. For comparison: Bun achieves 2,208/s, Deno 2,290/s, Go 5,227/s, Rust 5,466/s.

Node "spends 30% of its time with the main thread blocked on calls to spawn." The spawn function is synchronous in the main thread — it waits for fork(2) to complete and for all other threads to stop.

**Implications:** For the auto-commit hot path (every 30-60s), a single spawn of ~1.5ms is negligible. But if the auto-commit requires 4-5 sequential git commands (hash-object x N + mktree + commit-tree + update-ref), the overhead is 6-8ms total on Linux. Still well within budget for a 30s interval.

### Finding: Windows spawn overhead is dramatically worse — 10-100x slower
**Confidence:** CONFIRMED
**Evidence:** Node.js issue #21632, Val Town blog

On Windows, `child_process.spawn` can take up to 161ms per invocation, and in pathological cases with large process counts, minutes. This is a known Node.js limitation on Windows.

**Implications:** If the auto-commit pipeline requires multiple sequential git CLI invocations, Windows users could see 500ms-1s total overhead per auto-commit cycle. Still acceptable for a 30s interval, but noticeable. isomorphic-git's in-process approach eliminates this overhead entirely.

### Finding: isomorphic-git's in-process operations avoid spawn overhead entirely
**Confidence:** CONFIRMED
**Evidence:** isomorphic-git architecture (pure JS, no subprocess)

isomorphic-git runs entirely in-process. writeBlob, writeTree, and commit are function calls — no fork(2), no exec(2), no IPC. The overhead is the JS computation + filesystem I/O to .git/objects/.

**Implications:** For the hot path (WIP auto-commits), isomorphic-git provides the lowest possible latency by avoiding process spawn entirely.

### Finding: isomorphic-git has known performance issues with large repos
**Confidence:** CONFIRMED
**Evidence:** isomorphic-git issues #291, #1841, cache documentation

- Issue #291: "bad performance with a huge pack and idx files" — reading large packfiles is slow
- Issue #1841: "Git.readBlob is too slow" for cross-branch reading/writing
- Cache parameter documentation: "reading and parsing git packfiles can take a 'long' time for large repositories" — using cache reduces execution from "over 2 minutes to under 8 seconds"
- Adding files one-by-one "takes minutes to complete" for large file counts; using `git.add({ filename: '.' })` is much faster

**Implications:** For 100-1000 markdown files, caching is essential. The auto-commit pipeline should maintain a persistent cache object across invocations to avoid re-parsing packfiles.

### Finding: Prior research confirms CLI overhead is negligible for small workloads
**Confidence:** CONFIRMED
**Evidence:** local-git-merge-infrastructure report D3

"CLI invocation overhead is 10-50ms per call. For a merge queue processing 5-20 branches, total git CLI overhead is under one second — negligible compared to test suite execution."

**Implications:** For auto-commit (single pipeline) and branch operations (user-triggered, infrequent), CLI overhead is not a dealbreaker.

### Finding: Auto-commit performance budget is generous
**Confidence:** INFERRED
**Evidence:** Workload analysis

With 30-60s intervals, the auto-commit pipeline has a budget of ~1-5 seconds before it becomes noticeable. The operations are:
- Read current tree for changed files: <10ms (isomorphic-git with cache) or <50ms (native git)
- Write blobs for changed files: N * <1ms per blob (isomorphic-git) or N * ~2ms (native git hash-object)
- Write tree: <5ms (either approach)
- Create commit: <5ms (either approach)
- Update ref: <2ms (either approach)

For N=10 changed files (typical between auto-commits), total is <50ms with isomorphic-git, <200ms with native git. Both are well within budget.

**Implications:** Performance is not a differentiator between the approaches for this workload. Both are fast enough.

---

## Gaps / follow-ups

* Actual benchmarks on macOS with the specific workload (10-50 changed markdown files)
* Test isomorphic-git with cache persistence across invocations
* Test Windows latency with simple-git for the full auto-commit pipeline
