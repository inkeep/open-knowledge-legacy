# Audit Findings

**Artifact:** specs/2026-04-09-bridge-integration-matrix/SPEC.md
**Audit date:** 2026-04-09
**Total findings:** 6 (2 high, 3 medium, 1 low)

---

## High Severity

### [H1] Finding 1: `hocuspocus.listen()` does not exist on the `Hocuspocus` class — Tier 1 test harness pseudocode is unimplementable as written

**Category:** FACTUAL
**Source:** T2 (OSS repo: hocuspocus source)
**Location:** Section 9 (Proposed solution — Tier 1 programmatic integration tests), Section 15 (Phasing — US-003)
**Issue:** The spec's Tier 1 test harness pseudocode calls `server.hocuspocus.listen()` and reads `server.hocuspocus.address.port`. However, `createServer()` in `packages/server/src/standalone.ts` returns `ServerInstance { hocuspocus: Hocuspocus, ... }` where `hocuspocus` is an instance of the `Hocuspocus` class. The `listen()` method and `address` property belong to the `Server` class (a separate class in `@hocuspocus/server`), NOT the `Hocuspocus` class. The `Hocuspocus` class has no `listen()` method at all — verified by reading `~/.claude/oss-repos/hocuspocus/packages/server/src/Hocuspocus.ts` (no match for "listen").

Additionally, even if the correct `Server` class `listen()` were used, passing port `0` would not work as intended. The `Server.listen()` method uses `if (port)` as a guard (line 140 of Server.ts), and since `0` is falsy in JavaScript, `listen(0)` would fall through to the default port (80), NOT assign a random OS port.

**Current text:** "server = createServer({ contentDir: tmpDir, gitEnabled: false }) / await server.hocuspocus.listen()  // port 0 -> OS-assigned random / port = server.hocuspocus.address.port"
**Evidence:** `~/.claude/oss-repos/hocuspocus/packages/server/src/Hocuspocus.ts` — class has no `listen` method. `~/.claude/oss-repos/hocuspocus/packages/server/src/Server.ts` lines 136-142 — `listen()` belongs to `Server` class, guard is `if (port)` which is falsy for 0. `packages/server/src/standalone.ts` lines 27-29 — `ServerInstance` type exposes `hocuspocus: Hocuspocus`, not `Server`.
**Status:** CONTRADICTED
**Suggested resolution:** The Tier 1 test harness needs a different approach to start a listening server. Options: (1) Use the `Server` class directly (`new Server(Hocuspocus)` then `server.listen()`) and work around the port 0 bug by using Node.js `net.createServer` to find a free port first, then pass it explicitly. (2) Create a raw `http.createServer` + WebSocket upgrade manually, attaching Hocuspocus via its `handleConnection` hook (bypassing `Server.listen()` entirely). (3) Extend `createServer()` in standalone.ts to return a `Server` instance and handle port 0 correctly. The pseudocode in Section 9 and US-003 acceptance criteria need updating to reflect whichever approach is chosen.

---

### [H2] Finding 2: Evidence file miscounts THIN coverage paths (says 4, lists 5)

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** evidence/propagation-matrix.md — Coverage Summary section; SPEC.md Section 7 (Coverage gaps)
**Issue:** The evidence file's Coverage Summary states "THIN (4 paths)" but then lists 5 items: W1-Disk, W2-Disk, W4-Y.Text, W4-XmlFragment, and Redo-Y.Text. The total count across categories is 5+5+2+1=13 items, not 12 as stated in the "Propagation Paths (12 total)" heading. The detailed propagation table has 13 rows (10 directional paths + Undo-Y.Text + Undo-XmlFragment + Redo-Y.Text + Redo-XmlFragment = 13; or 10 + 3 undo/redo rows = 13). This count inconsistency propagates into the spec's Section 7 coverage gaps table and the "4x3 matrix" framing throughout the document (which implies 12 paths, but there are actually 10 directional + 4 undo/redo = 14 if undo/redo is counted per-surface, or 12 if undo+redo are each counted as single paths).

**Current text:** "THIN (4 paths): W1->Disk, W2->Disk, W4->Y.Text, W4->XmlFragment, Redo->Y.Text" (evidence) and "4 write surfaces x 3 read targets = 12 propagation paths" (spec)
**Evidence:** evidence/propagation-matrix.md lines 45-48 — summary counts don't match list items. The detailed table has 13 rows.
**Status:** INCOHERENT
**Suggested resolution:** Fix the THIN count to 5. Clarify the total path count: the 4x3 matrix produces 10 directional paths (not 12 — W1 and W2 each have 2 read targets not 3, since WYSIWYG doesn't directly propagate to XmlFragment via its own mechanism, it goes through Observer A to Y.Text). Alternatively, recount and clarify whether undo/redo surfaces are counted separately or as combined paths. The "12 propagation paths" label should be reconciled with the actual table row count.

---

## Medium Severity

### [M1] Finding 3: Spec claims `setupObservers` imports "only @tiptap/markdown, @tiptap/y-tiptap, yjs, core" — omits two dependencies

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Section 9 (Proposed solution — Tier 1, "What this gives" bullet)
**Issue:** The spec claims setupObservers "has no browser dependencies (verified: imports only @tiptap/markdown, @tiptap/y-tiptap, yjs, core)." The actual imports in observers.ts are: `@inkeep/open-knowledge-core`, `@tiptap/markdown` (type-only), `@tiptap/pm/model` (type-only), `@tiptap/y-tiptap`, `yjs` (type-only), and `./diff-lines-fast` (which imports `diff-match-patch`). Two dependencies are omitted from the spec's list: `@tiptap/pm/model` and `diff-match-patch` (via `diff-lines-fast`). While these are likely Node.js-compatible (not browser-only), the claim is imprecise. Since the "no browser dependencies" conclusion is load-bearing for the entire Tier 1 architecture (D3, D5), the incomplete dependency list weakens confidence.

**Current text:** "setupObservers has no browser dependencies (verified: imports only @tiptap/markdown, @tiptap/y-tiptap, yjs, core)"
**Evidence:** `packages/app/src/editor/observers.ts` lines 34-39 — actual imports include `@tiptap/pm/model` and `./diff-lines-fast`. `packages/app/src/editor/diff-lines-fast.ts` line 9 — imports `diff-match-patch`.
**Status:** INCOHERENT
**Suggested resolution:** Update the dependency list to include all 6 imports. Verify that `@tiptap/pm/model` (ProseMirror model) and `diff-match-patch` work in Node.js without a DOM. If they do, the "no browser dependencies" conclusion still holds but should cite the complete list. If either requires a DOM (e.g., ProseMirror's DOMParser), the Tier 1 architecture needs a shim or alternative approach.

---

### [M2] Finding 4: Assumption A2 marked MEDIUM confidence but its associated OQ3 is already RESOLVED

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 12 (Assumptions — A2) vs. Section 11 (Open questions — OQ3)
**Issue:** Assumption A2 states "The ~/agents port pattern (env var + strictPort) is adaptable to our setup" with MEDIUM confidence and verification plan "Investigation in progress" and expiry "When OQ3 is resolved." However, OQ3 is already marked "RESOLVED -> D2" in the Open Questions table. If OQ3 is resolved, then A2 should either be promoted to HIGH confidence (verified) or removed from the Assumptions table. The current state suggests the assumption was written before OQ3 was resolved and not updated during the cascade.

**Current text:** A2: "The ~/agents port pattern ... is adaptable to our setup" — Confidence: MEDIUM, Expiry: "When OQ3 is resolved" / OQ3: "RESOLVED -> D2"
**Evidence:** SPEC.md Section 11 line for OQ3 shows RESOLVED; Section 12 line for A2 still shows MEDIUM and "in progress"
**Status:** INCOHERENT
**Suggested resolution:** Either promote A2 to HIGH confidence with evidence from the D2 investigation, or remove A2 from the Assumptions table entirely since its verification condition has been met.

---

### [M3] Finding 5: Evidence file line reference for Redo->Y.Text is off by 2 lines

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** evidence/propagation-matrix.md — Redo->Y.Text row
**Issue:** The propagation matrix evidence states `api-extension.ts:262` as the code path for Redo->Y.Text (`um.redo()`). The actual `um.redo()` call is at line 264 in `api-extension.ts`. Line 262 is the `return` statement inside the `canRedo()` early-exit branch.

**Current text:** "Redo->Y.Text | um.redo() + CRDT sync | api-extension.ts:262"
**Evidence:** `packages/server/src/api-extension.ts` line 264 — `um.redo();`; line 262 — `return;` (inside canRedo guard).
**Status:** CONTRADICTED
**Suggested resolution:** Update the line reference to `api-extension.ts:264` for Redo->Y.Text.

---

## Low Severity

### [L1] Finding 6: Test-reset enhancement (D7/R5) says "hocuspocus.closeConnections() (all clients, not just 'test-doc')" but doesn't address production safety

**Category:** COHERENCE
**Source:** L3 (Missing conditionality)
**Location:** Section 9 (Test-reset enhancement), Section 10 (Decision log — D7), Section 6 (Requirements — R5)
**Issue:** The spec proposes changing test-reset from `hocuspocus.closeConnections('test-doc')` to `hocuspocus.closeConnections()` (no argument = all documents). This is presented unconditionally, but the test-reset endpoint is also accessible in production (it's registered in the API extension routes without any environment guard). Calling `closeConnections()` without a document filter in production would disconnect ALL clients on ALL documents, not just the test document. While this is likely acceptable for testing (and may even be intentional for test isolation), the missing conditionality means a reader might not notice the production blast radius.

**Current text:** "Enhancement: add a hocuspocus.closeConnections() call (no document filter) to disconnect ALL clients, not just 'test-doc'."
**Evidence:** `packages/server/src/api-extension.ts` lines 275-301 — `handleTestReset` is registered as a production route with no env guard.
**Status:** INCOHERENT
**Suggested resolution:** Add a note acknowledging that test-reset is available in all environments and that the closeConnections() change affects all documents. Consider whether test-reset should be gated behind a `NODE_ENV=test` or similar check, or whether the "all documents" behavior is intentionally desired for test isolation and acceptable in production.

---

## Confirmed Claims (summary)

**T1 (Own codebase):**
- Observer A (tree->text) code structure, debounce, origin guards at lines 262-339 -- confirmed
- Observer B (text->tree) code structure, typing defer, early-exit at lines 354-442 -- confirmed
- `syncTextToFragment` at agent-sessions.ts:43-66 -- confirmed
- `handleExternalChange` exists in both standalone.ts and hocuspocus-plugin.ts -- confirmed
- `handleAgentWriteMd` transact block at api-extension.ts:145-169 -- confirmed
- Undo code at api-extension.ts:230-231 (um.undo() + syncTextToFragment) -- confirmed
- Redo code at api-extension.ts:264-265 (um.redo() + syncTextToFragment) -- confirmed (line 264, not 262)
- `onStoreDocument` at persistence.ts:165-196 -- confirmed
- Current `reuseExistingServer: true` in playwright.config.ts -- confirmed
- Current test-reset does `hocuspocus.closeConnections('test-doc')` (document-scoped) -- confirmed
- `setupObservers` exported at observers.ts:235 -- confirmed
- Two copies of `handleExternalChange` (OQ8) -- confirmed

**T2 (OSS repos):**
- `Hocuspocus.closeConnections(documentName?: string)` accepts optional string -- confirmed from source
- `Server.listen(port?)` is on the `Server` class, not `Hocuspocus` class -- confirmed from source
- `if (port)` guard in listen() means port 0 is falsy and would not work -- confirmed from source

**L1-L7 (Coherence):**
- Problem statement (SCR) is internally coherent -- confirmed
- Non-goals are well-classified with appropriate temporal tags -- confirmed
- Decision log entries are consistent with proposed solution -- confirmed (except A2/OQ3 drift)
- Phasing is logical (infrastructure -> matrix -> fix -> hardening) -- confirmed
- Agent constraints SCOPE/EXCLUDE are consistent with proposed changes -- confirmed

## Unverifiable Claims

- "Layer C E2E test fails — browser-side undo re-inserts undone content" -- no Playwright test was executed during this audit. The claim is consistent with code analysis (Observer A baseline refresh on remote undo transactions is plausible as a failure path) but the specific browser behavior was not reproduced.
- "5 paths have good coverage, 4 are thin, 2 are untested" -- the coverage characterization (GOOD/THIN/UNTESTED) was not independently verified by running the test suite. The count itself is internally inconsistent (see H2).
- "~1-2s per test, entire matrix in ~30-60s" for Tier 1 -- performance estimate not verifiable without running the tests.
