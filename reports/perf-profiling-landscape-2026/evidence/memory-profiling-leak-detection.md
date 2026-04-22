# Evidence: D9 — Memory profiling + leak detection

**Dimension:** D9 — Techniques and tools best-in-class for detecting memory leaks and profiling memory in a React + editor + CRDT app, across dev and prod.
**Date:** 2026-04-19
**Sources:** Chrome Developer docs, Facebook memlab, npm/leakage, why-is-node-running, Node heapdump, React 19.2 Activity reference, Yjs discuss forum, Playwright GH issues

---

## Key pages referenced

- https://developer.chrome.com/docs/devtools/memory-problems
- https://facebook.github.io/memlab/docs/guides/integrate-with-e2e-frameworks/
- https://www.npmjs.com/package/leakage
- https://www.npmjs.com/package/why-is-node-running
- https://github.com/bnoordhuis/node-heapdump
- https://react.dev/reference/react/Activity
- https://discuss.yjs.dev/t/understanding-memory-requirements-for-production-usage/198
- https://github.com/microsoft/playwright/issues/20246

---

## Findings

### Finding: Chrome DevTools Memory panel exposes three distinct modes with documented triggers

**Confidence:** CONFIRMED

**Evidence:**
- https://developer.chrome.com/docs/devtools/memory-problems — three explicit radio-button modes:
  1. **Heap snapshot** — point-in-time memory distribution across JS objects + DOM; find "Detached" nodes via Class filter.
  2. **Allocations on timeline** — blue bars indicate allocation bursts; used while reproducing a suspect flow.
  3. **Allocation sampling** — low-overhead breakdown by JavaScript function, top-N allocators.
- Method (quoted): *"open DevTools and go to the Memory panel, select the Heap Snapshot radio button, and then press the Take snapshot button."*

**Implications:** For a React SPA, the canonical flow is: snapshot before → exercise the suspected flow → snapshot after → Comparison view → scan for detached-DOM + retained-closure growth.

---

### Finding: memlab is the Meta-originated automated heap-comparison framework; Playwright-compatible via 3-snapshot pipe

**Confidence:** CONFIRMED

**Evidence:**
- https://facebook.github.io/memlab/docs/guides/integrate-with-e2e-frameworks/ — three-label snapshot protocol: `baseline`, `target`, `final`. Flow: framework (Playwright/Cypress) takes snapshots via `takeJSHeapSnapshot()`, writes to disk with metadata, memlab `findLeaks()` analyzes.
- memlab uses Puppeteer natively; other frameworks integrate by capturing snapshots and piping to memlab core API.
- Output: leak report + optional pixel-chart of memory across steps.

**Implications:** The only documented automated leak-detection pipeline that integrates with Playwright end-to-end.

---

### Finding: `leakage` is a Mocha/Tape-oriented iterate-and-diff helper for unit-level leak assertions

**Confidence:** CONFIRMED

**Evidence:**
- https://www.npmjs.com/package/leakage — wraps `node-memwatch` to force GC, takes heap diffs across iterations, throws `MemoryLeakError` on growth trend. CLI flag `--heap-file` writes per-test heap diff JSON.
- Test harness integration: Mocha or Tape are recommended *"since they are quite simple and don't produce much noise in the captured data."*

**Implications:** Complementary to memlab — `leakage` operates at Node-unit-test scope, memlab at browser E2E scope. Neither fully replaces Chrome DevTools for root-cause retention walks.

---

### Finding: `why-is-node-running` diagnoses handles preventing process exit (not leaks per se, but related)

**Confidence:** CONFIRMED

**Evidence:**
- https://www.npmjs.com/package/why-is-node-running — CLI + library; SIGUSR1/SIGINFO dumps active handles. Used to diagnose tests that don't exit and long-lived timers/sockets.
- Repo: github.com/mafintosh/why-is-node-running (actively maintained).

**Implications:** Diagnoses a narrower failure mode (process won't exit) distinct from heap-growth leaks.

---

### Finding: `heapdump` npm is legacy — Node 22+ natively covers the use case via `v8.writeHeapSnapshot` + `--heapsnapshot-near-heap-limit`

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/bnoordhuis/node-heapdump — original author Ben Noordhuis. Writes synchronously, causes "hitch" on large heaps.
- Built-in replacement: `require('node:v8').writeHeapSnapshot()` since 11.13.0.
- `node-oom-heapdump` — maintained alternative that snapshots just before an OOM; tested Node 10.x–24.x.

**Implications:** Prefer `v8.writeHeapSnapshot()` + `--heapsnapshot-near-heap-limit` over the legacy `heapdump` package.

---

### Finding: React 19.2 `<Activity mode="hidden">` preserves state + DOM but cleans up Effects; memory cost is non-trivial and not bounded by React

**Confidence:** CONFIRMED

**Evidence:**
- https://react.dev/reference/react/Activity — *"React will save its state for later"* and *"It will also destroy their Effects, cleaning up any active subscriptions."* DOM also preserved: *"Since Activity boundaries hide their children using `display: none`, their children's DOM is also preserved when hidden."*
- React docs DO NOT specify: explicit memory cost, LRU eviction, memory limits, or GC behavior.
- Secondary reporting (not official React doc, flag as MEDIUM confidence): community sources cite React team saying Activity trades memory for speed with ~2× memory consumption and acknowledge that an LRU-style automatic destruction policy is "being considered." This is not stated on react.dev.

**Implications:** Hidden-mode DOM + Fiber + closure retention is an application-level memory concern. Host app must implement its own mount cap (reference implementation: Open Knowledge's `ACTIVITY_MOUNT_LIMIT`) — React provides no built-in eviction.

---

### Finding: Y.js Y.Doc in-memory cost is ~2 MB for a ~260k-edit "conference paper"-scale document; production scale depends on keep-in-memory vs delta-only server model

**Confidence:** CONFIRMED for the single data point; UNCERTAIN for generalizability

**Evidence:**
- https://discuss.yjs.dev/t/understanding-memory-requirements-for-production-usage/198 — maintainer quote: *"The memory usage of representing a conference paper is about ~2MB (260k edits)."* (≈8 bytes per edit in that example).
- Same thread: maintainer plan to *"rework y-websocket server not to load the document to memory at all"* (delta-only). Scale pattern: *"you can scale indefinitely using a simple pubsub server"* absent full-doc load.
- Thread does NOT document UndoManager RAM cost or tombstone retention shape.
- Independent anecdotal case (forum — UNCERTAIN): 84.45 MB → 190.22 MB RSS after loading one large doc on a Node server.

**Implications:** For a Hocuspocus fleet of N docs, RSS is roughly N × (2 MB + per-agent UndoManager overhead + tombstones). Precise numbers require repo-local measurement — no canonical benchmark in the Y.js primary docs.

---

### Finding: Playwright-native heap-snapshot capture is not a first-party API; requires CDP session via `context.newCDPSession()`

**Confidence:** INFERRED

**Evidence:**
- https://github.com/microsoft/playwright/issues/20246 — open question "How to take heap snapshot" indicates no first-class primitive.
- Community pattern: `const client = await context.newCDPSession(page); await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });` — CDP-level, not a Playwright API.
- Chrome DevTools MCP adds a `take_memory_snapshot` tool that captures standard V8 `.heapsnapshot` format (mentioned in secondary search — flag as INFERRED).

**Implications:** Playwright + CDP is viable for E2E memory regression gates, but the integration is hand-rolled. memlab is the published wrapper.

---

### Finding: Sentry / Datadog / NewRelic RUM memory tracking surfaces are product-specific and vendor-promoted

**Confidence:** UNCERTAIN

**Evidence:**
- Sentry `@sentry/browser` + Replay exposes memory via `performance.memory` (Chrome-only, non-standard) in session replays; not explicitly called out as a stable API.
- No primary-source confirmation gathered in this pass for Datadog RUM memory panels or New Relic equivalents.

**Implications:** Flag for follow-up; not load-bearing for the open-source profiling decision.

---

### Finding: ProseMirror + Y.XmlFragment large-doc memory is not published as a canonical benchmark

**Confidence:** NOT FOUND

**Evidence:**
- No primary-source benchmark surfaced in this pass for ProseMirror + Y.XmlFragment heap-size-vs-document-size curves.

**Implications:** Repo-local measurement required (via `writeHeapSnapshot` at graduated document sizes).

---

## Terminology (D9)

- **Allocation timeline vs Allocation sampling (DevTools):** timeline records every allocation (higher overhead, full fidelity); sampling does statistical sampling (lower overhead, function-bucket breakdown).
- **Detached DOM:** DOM node unreachable from `document` but still referenced by a JS closure/listener — the canonical React leak signature.
- **Heap diff / Three-snapshot method (memlab):** baseline → target → final snapshots; leak = object class set with net growth across baseline→target that does not shrink in target→final.

## Gaps / follow-ups

- React 19.2 Activity memory policy: React docs are silent on eviction. Community sources cite "2× memory" and "LRU is being considered" — primary-source confirmation would require digging into React 19.2 release notes or RFC.
- Y.Doc production-RAM curve: only one data point (~2 MB / 260k edits) is in the Y.js thread. No published curve for Y.UndoManager + tombstone retention over hours of edits.
- Sentry / Datadog / New Relic RUM memory surfaces: not primary-source confirmed in this pass.

## Sources (de-duped)

- https://developer.chrome.com/docs/devtools/memory-problems — three memory modes + official flow
- https://facebook.github.io/memlab/docs/guides/integrate-with-e2e-frameworks/ — three-snapshot protocol
- https://www.npmjs.com/package/leakage — Mocha/Tape iterate-and-diff assertion
- https://www.npmjs.com/package/why-is-node-running — handle-dump diagnostic
- https://github.com/bnoordhuis/node-heapdump — legacy heapdump
- https://github.com/blueconic/node-oom-heapdump — maintained OOM-triggered alternative
- https://discuss.yjs.dev/t/understanding-memory-requirements-for-production-usage/198 — Y.Doc ~2 MB / 260k edits data point
- https://react.dev/reference/react/Activity — state/DOM preservation semantics, Effects cleaned, no memory guidance
- https://github.com/microsoft/playwright/issues/20246 — no first-party Playwright heap-snapshot API
