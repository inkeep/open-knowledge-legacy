# Design Challenge Findings

**Artifact:** specs/2026-04-09-bridge-integration-matrix/SPEC.md
**Challenge date:** 2026-04-09
**Total findings:** 5 (2 high, 2 medium, 1 low)

---

## High Severity

### [H] Finding 1: Tier 1 test harness pseudocode assumes `hocuspocus.listen()` which does not exist on the `Hocuspocus` class

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC2 (Stakeholder gap)
**Location:** Section 9 (Proposed solution), Section 10 (Decision log, D2), Section 15 (Phasing, US-003), Section 16 (Agent constraints, STOP_IF)

**Issue:** The spec's Tier 1 pseudocode calls `server.hocuspocus.listen()` (port 0) and reads `server.hocuspocus.address.port`. The `createServer()` factory in `packages/server/src/standalone.ts` returns a `ServerInstance` whose `hocuspocus` field is a `Hocuspocus` class instance (line 54: `const hocuspocus = new Hocuspocus({...})`). The `Hocuspocus` class has no `listen()` method and no HTTP server -- those belong to the separate `Server` class (line 6413 of the Hocuspocus ESM bundle). Furthermore, the API endpoints (`/api/agent-write-md`, `/api/agent-undo`, `/api/test-reset`) are implemented as `onRequest` hooks, which are only triggered when an HTTP server calls `hocuspocus.hooks('onRequest', ...)`. Without a manually created HTTP server, Tier 1 tests cannot reach any API endpoint.

Both production wiring paths confirm this:
- CLI `start.ts` (line 81-129): creates its own `createHttpServer()`, manually calls `hocuspocus.hooks('onRequest', ...)` for API routes, creates a separate `WebSocketServer({ noServer: true })`, and manually wires up `upgrade` handling.
- Vite plugin `hocuspocus-plugin.ts` (line 69-116): uses Vite's built-in HTTP server, registers middleware that calls `hocuspocus.hooks('onRequest', ...)`, and creates a separate `WebSocketServer({ noServer: true })`.

**Current design:** "server = createServer({ contentDir: tmpDir, gitEnabled: false }); await server.hocuspocus.listen() // port 0 -> OS-assigned random; port = server.hocuspocus.address.port" (Section 9, Tier 1 pseudocode)

**Alternative:** The test harness `createTestServer()` factory (US-003) needs to either:
(A) Use the `Server` class from `@hocuspocus/server` instead of `Hocuspocus`, passing the same extensions. The `Server` class wraps `Hocuspocus` and provides `listen()`, an HTTP server, and WebSocket upgrade handling. This is simpler but means the test uses a different wiring path than production (which uses `Hocuspocus` directly + manual HTTP/WS setup).
(B) Replicate the CLI/Vite pattern: create a `node:http` server, wire `onRequest` hooks manually, create a `ws.WebSocketServer({ noServer: true })`, handle `upgrade` events, and call `httpServer.listen(0)`. This matches production wiring exactly but adds ~30 lines of boilerplate to the test harness.
(C) Extend `createServer()` in `packages/server/src/standalone.ts` to optionally create and manage its own HTTP server, so both CLI and tests can use the same factory with different options. This is a production code change but reduces test-vs-production divergence.

**Trade-off:** Option A is simplest but introduces a test-only code path that diverges from production wiring. Option B is most production-accurate but adds boilerplate. Option C is the cleanest long-term but changes production code.

The STOP_IF condition "hocuspocus.listen(0) doesn't work with API extension" effectively predicts this problem, but frames it as an edge case rather than the expected behavior. The API extension will not work with `Hocuspocus.listen()` because that method does not exist.

**Status:** CHALLENGED
**Suggested resolution:** The spec should prescribe which wiring approach `createTestServer()` uses and verify it exercises the same code paths as production. At minimum, update the pseudocode and US-003 acceptance criteria to reflect that HTTP + WebSocket server setup is explicit, not inherited from `hocuspocus.listen()`.

---

### [H] Finding 2: Tier 1 "programmatic" tests may not faithfully reproduce the Layer C undo failure because the observer `transaction.local` behavior differs between in-process Hocuspocus mutations and over-the-wire HocuspocusProvider mutations

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** Section 9 (Proposed solution, "Layer C undo fix strategy"), Decision D6

**Issue:** The spec correctly identifies the `transaction.local` distinction as the "critical insight" (Section 9, paragraph 1): in-process mutations have `transaction.local === true` and fire observers for everything, while over-the-wire mutations have `transaction.local === false` and cause observers to SKIP them. The spec then proposes (D6) diagnosing the Layer C undo failure via Tier 1 programmatic tests, reasoning that "a programmatic undo test with setupObservers over real WebSocket exercises the exact same observer code path as the browser."

However, the undo operation itself is server-side: `um.undo()` mutates Y.Text on the server's Y.Doc, then `syncTextToFragment(dc.document)` updates XmlFragment on the server's Y.Doc. These mutations propagate to the client Y.Doc via CRDT sync as remote transactions (`transaction.local === false`). On the client, Observer A's guard (line 320: `if (!transaction.local) { ... return; }`) correctly skips re-syncing -- but it does update `lastSyncedXmlMd`. Observer B's guard (confirmed at line 430+ of observers.ts) similarly skips remote transactions.

The question the spec leaves unresolved: if both observers correctly skip remote undo transactions, and the server-side `syncTextToFragment` already paired Y.Text and XmlFragment before sync, what mechanism would cause browser-side "re-insertion"? The spec's diagnosis strategy (D6) assumes the Tier 1 test will reproduce the failure. But if the failure is specific to ProseMirror's `ySyncPlugin` reconciliation -- which runs in the browser when the CRDT state update arrives and ProseMirror re-renders its document state from XmlFragment -- then Tier 1 tests (which have no ProseMirror) will pass while Layer C still fails.

The spec acknowledges this possibility in the STOP_IF condition ("Tier 1 undo test passes but Layer C still fails -> need ProseMirror-level debugging (escalate)"), but the D6 diagnosis strategy is framed as "Tier 1 first, Playwright if needed." If the most likely failure mode is ProseMirror reconciliation (which ProseMirror-less Tier 1 cannot reproduce), the diagnosis order is inverted. The spec would benefit from acknowledging that the Tier 1 undo test is primarily a coverage improvement (ensuring observers handle undo correctly), not a diagnosis tool for the existing Layer C failure.

**Current design:** "The browser-side undo re-insertion (OQ1) will be diagnosed using Tier 1 tests first" (Section 9, Layer C undo fix strategy)

**Alternative:** Prioritize browser-level instrumentation of the existing Layer C failure (add `console.log` or `page.evaluate` tracing to the existing Playwright test to capture what happens between undo CRDT sync arriving and ProseMirror re-rendering). This costs ~1 hour of targeted debugging and directly addresses the most likely failure mode. Tier 1 undo tests should still be written (they close real coverage gaps), but they should not be positioned as the primary diagnostic tool for a browser-specific failure.

**Trade-off:** Flipping the diagnosis order means touching Playwright tests before the port isolation infrastructure is in place (Phase 1 depends on port isolation). But if the Layer C failure is in ProseMirror reconciliation, the port isolation work is orthogonal to the diagnosis, and waiting for Tier 1 adds delay without diagnostic value.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine whether D6's "Tier 1 first" ordering is diagnostic strategy or coverage strategy. If diagnostic, it should address the most likely failure mode first (ProseMirror reconciliation, which requires browser instrumentation). If coverage, rename it and add a separate diagnosis strategy for OQ1 that starts with browser-level tracing.

---

## Medium Severity

### [M] Finding 3: Disk bridge test timing (5s polling timeout) may be insufficient given the 2s persistence debounce + file watcher latency + CRDT sync round-trip

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 9 (Proposed solution, "Disk timing strategy"), Decision D4

**Issue:** The spec prescribes content-based polling with a 5s timeout for disk bridge tests. The full propagation path for a client edit reaching disk is: client edit -> observer sync (50ms debounce) -> CRDT sync to server (network) -> Hocuspocus `onStoreDocument` (2s debounce, configurable up to 10s maxDebounce) -> persistence writes file. This chain totals ~2.1s minimum under ideal conditions.

For the reverse path (disk -> client): file system event -> @parcel/watcher event delivery (~50-200ms on macOS) -> `handleExternalChange` -> CRDT sync to client (network). This is faster (~300ms) but file watcher event delivery varies by OS and load.

The 5s timeout provides ~2.9s of margin for the client-to-disk path. On a loaded CI machine or under macOS file system event delays (known to occasionally lag 1-2s), this margin could be tight. The `createServer` defaults `debounce: 2000` but this could interact with test execution order (previous test's debounce timer still running when next test starts, even after test-reset).

Risk R2 ("File watcher tests are flaky due to FS event timing") identifies this concern at MEDIUM likelihood / MEDIUM impact but the mitigation ("Use explicit wait + content verification, not event timing") is exactly what the spec already proposes -- it doesn't add additional defense for the timing budget.

**Current design:** "Content-based polling with timeout, not event timing... writeFileSync -> poll ytext.toString() until content appears (timeout 5s)... Client edit -> poll readFileSync until file contains content (timeout 5s, accounts for 2s persistence debounce)" (Section 9)

**Alternative:** The test harness `createTestServer()` (US-003) should configure a shorter persistence debounce for tests (e.g., `debounce: 200`) while keeping the production default at 2000ms. This reduces the minimum propagation time from ~2.1s to ~0.3s, giving 4.7s of margin within the same 5s timeout. The existing `createServer` API already accepts `debounce` as an option. This is a test-only configuration change, not a production change.

**Trade-off:** Using a shorter debounce in tests means tests don't exercise the exact production timing. But the purpose of these tests is propagation correctness (does the content arrive?), not timing accuracy (does it arrive within 2s?). A shorter debounce makes tests faster and more reliable without sacrificing correctness coverage.

**Status:** CHALLENGED
**Suggested resolution:** Consider adding `debounce: 200` (or similar) to the `createTestServer()` factory configuration. Document that this is a deliberate deviation from production timing for test reliability, and that production debounce timing is covered by the existing stress test suite.

---

### [M] Finding 4: The test-reset enhancement (D7) calls `hocuspocus.closeConnections()` (no filter) which disconnects ALL documents, not just `test-doc`

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 9 (Test-reset enhancement), Decision D7, US-005

**Issue:** The spec proposes changing `/api/test-reset` from `hocuspocus.closeConnections('test-doc')` (current, line 283 of api-extension.ts) to `hocuspocus.closeConnections()` (no document filter) to disconnect ALL clients. The `closeConnections()` API signature (from the Hocuspocus type definition, line 375 of index.d.ts) accepts an optional `documentName` parameter -- when omitted, it disconnects connections across ALL documents.

In the Tier 1 test context (single `test-doc` document, programmatic server), this distinction is irrelevant. But in the Tier 2 Playwright context (Vite dev server with potentially multiple documents loaded from `packages/app/content/`), calling `closeConnections()` without a filter would disconnect all active documents, not just the test document. If a developer has the app open in a browser tab on a different document while running tests, `test-reset` would sever their active editing session.

The current filtered `closeConnections('test-doc')` is actually the safer behavior. The real gap the spec identifies (browser tabs not being disconnected) is already addressed by the filtered call -- it disconnects all connections to `test-doc` specifically, including browser tabs.

**Current design:** "Test-reset enhancement: hocuspocus.closeConnections() (all clients, not just 'test-doc')" (D7, US-005)

**Alternative:** Keep the current filtered `hocuspocus.closeConnections('test-doc')`. The filtered version already disconnects all client connections (including browser tabs) for the test document. The unfiltered version adds risk (disconnecting unrelated documents) without additional test isolation benefit.

**Trade-off:** The filtered version is narrower in scope but sufficient for test isolation. The unfiltered version is maximally aggressive but has side effects on non-test documents.

**Status:** CHALLENGED
**Suggested resolution:** Verify whether the existing `closeConnections('test-doc')` already handles the identified gap (browser tabs connected to `test-doc`). If it does, D7 should be revised to keep the filtered call. The actual gap may be that the current test-reset doesn't reset the file watcher's writeTracker state (identified in evidence/test-infrastructure.md "Known gaps"), which is unrelated to connection scope.

---

## Low Severity

### [L] Finding 5: The propagation matrix counts 12 paths but the test matrix has 14 user stories (US-006 through US-019), with US-018 (initial sync) and US-019 (bridge invariant) being cross-cutting, not path-specific

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** Section 9 (Propagation tests table), Section 15 (Phase 2)

**Issue:** The spec frames the problem as "12 propagation paths" (4 write surfaces x 3 read targets) and this framing drives the scope. However, US-018 (initial sync: server restart with existing .md file populates client Y.Text) is not one of the 12 W1-W4/Undo/Redo paths -- it tests the `onLoadDocument` -> initial CRDT sync -> Observer A initial sync path, which is a distinct lifecycle event. US-019 (bridge invariant holds after every propagation path) is a meta-assertion that runs after each of the other tests, not a path itself.

This is a minor framing inconsistency (14 stories for "12 paths"), not a gap in coverage. The initial sync test (US-018) is valuable and correctly tagged as derived from OQ10. The bridge invariant assertion (US-019) is good engineering practice.

**Current design:** "Design and implement a comprehensive integration test matrix covering all 12 propagation paths + undo/redo" (Section 1, Resolution item 2)

**Alternative:** No change needed in scope or coverage -- just acknowledge in the spec that the test suite covers 12 propagation paths + 2 cross-cutting concerns (initial sync lifecycle, bridge invariant assertion). The "12-path matrix" framing is a simplification.

**Trade-off:** None -- purely editorial clarity.

**Status:** CHALLENGED
**Suggested resolution:** Minor reframing: "12 propagation paths + initial sync lifecycle + bridge invariant assertion" rather than implying all 14 stories map 1:1 to the 12-path matrix.

---

## Confirmed Design Choices (summary)

### DC1 (Simpler alternative)
- **Two-tier architecture (D5):** The split between programmatic Tier 1 and Playwright Tier 2 is well-justified. Tier 1 exercises the real observer code path over real WebSocket (production-accurate for the observer layer), while Tier 2 covers ProseMirror/React-specific behavior that Tier 1 cannot reach. No credibly simpler single-tier alternative achieves both.
- **Real file watcher (D4):** Using the real @parcel/watcher instead of mocked FS events is the right call. The writeTracker self-write detection logic is a production-critical code path that mocking would skip.
- **HocuspocusProvider as test client (D3):** Verified that Bun provides a global `WebSocket`, so `HocuspocusProvider` works in Node.js/Bun without a polyfill. The spec's claim that `setupObservers` has no browser dependencies is confirmed for the specific imports it uses (`@tiptap/markdown`, `@tiptap/y-tiptap`'s `updateYFragment` and `yXmlFragmentToProsemirrorJSON`, `yjs`, `core`). Browser globals in `@tiptap/y-tiptap` are in `CollaborationCursor` code, not in the functions `setupObservers` imports.

### DC2 (Stakeholder gap)
- **Port isolation approach (D2):** Using `listen(0)` for kernel-allocated ports (Tier 1) and `VITE_PORT` + `strictPort` + `reuseExistingServer: false` (Tier 2) is sound. The `reuseExistingServer: false` change from the current `true` directly addresses the documented stale-server contamination bug.
- **`handleExternalChange` duplication (OQ8):** Correctly noted as P2. The Vite copy and standalone copy are structurally identical, and Tier 1 exercises the standalone copy via `createServer()`.

### DC3 (Framing validity)
- **Problem statement SCR:** The three dimensions (Layer C failure, coverage gaps, port conflicts) are genuinely interconnected -- the port conflict problem blocks reliable diagnosis of the Layer C failure, and the coverage gaps mean the Layer C failure is the only E2E test for the most complex flow. Removing any one dimension weakens the case but doesn't eliminate it. The framing is not post-hoc.
- **Non-goal temporal tags:** NG1 (NOT NOW, updateYFragment optimization) and NG3 (NOT NOW, modal architecture) have correct temporal tags. NG4 (NEVER, CRDT fuzzing) is appropriately NEVER -- Yjs internals are outside this project's responsibility boundary.
