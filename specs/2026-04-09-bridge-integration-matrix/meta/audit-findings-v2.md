# Audit Findings (v2)

**Artifact:** specs/2026-04-09-bridge-integration-matrix/SPEC.md
**Audit date:** 2026-04-09
**Scope:** Content added after v1 audit — Phase 5 stories, D9/D10, AGENTS.md target structure, OQ1/OQ11/OQ12, updated SCOPE, story renumbering
**Total findings:** 7 (2 high, 4 medium, 1 low)

---

## High Severity

### [H1] OQ11 status contradicts D9 and actual story state — three-way merge is simultaneously "promoted to In Scope" and "DEFERRED"

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 11 (OQ11), Section 10 (D9), Section 15 (Phase 5 — US-036/037/038)
**Issue:** Three mutually contradictory statements about three-way merge scope:

1. **OQ11** (line 294) says: "RESOLVED — promoted to In Scope. US-033/034/035 cover simple, conflicting, and structural divergence."
2. **D9** (line 277) says: "Three-way merge DEFERRED — function exists but not wired into production. Needs own spec..."
3. **Phase 5 stories** (lines 443-445): US-036/037/038 are struck through with `~~` and marked "DEFERRED."

OQ11 says the merge is In Scope and resolved; D9 says it's deferred; the stories are struck through. A reader cannot determine whether three-way merge testing is in scope or not. This is the most critical coherence issue because it affects story count, phase scope, and implementation planning.

Additionally, OQ11 references the wrong story numbers — it says "US-033/034/035" but the three-way merge stories are US-036/037/038. US-033 is "Disk round-trip," US-034 is "Full-stack chain," and US-035 is "Agent-as-file-editor fidelity" — none of which are three-way merge stories.

**Current text:**
- OQ11: "RESOLVED — promoted to In Scope. US-033/034/035 cover simple, conflicting, and structural divergence."
- D9: "Three-way merge DEFERRED — function exists but not wired into production."
- US-036: `~~US-036~~ | ~~Three-way merge~~ | DEFERRED`

**Evidence:** SPEC.md lines 277, 294, 443-445. The three sources give three different answers to the same question.
**Status:** INCOHERENT
**Suggested resolution:** Pick one stance and cascade it everywhere:
- If DEFERRED (matching D9 and the struck-through stories): Update OQ11 to say "RESOLVED — deferred to Future Work. See D9." Remove the incorrect US-033/034/035 reference. Add three-way merge to the Future Work section with an "Explored" maturity tier.
- If IN SCOPE (matching OQ11's claim): Un-strike US-036/037/038, update D9 to say "promoted to P0," and fix OQ11's story number references to US-036/037/038.

---

### [H2] Stale `hocuspocus.listen(0)` references survive in D2, US-003, and port isolation summary table — contradicts the corrected pseudocode

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions), follow-up from v1 audit H1
**Location:** Section 10 (D2, line 270), Section 15 Phase 1 (US-003, line 333), Section 9 (Port isolation summary, line 253)
**Issue:** The v1 audit identified that `hocuspocus.listen(0)` does not work (port 0 is falsy, bypasses the `if (port)` guard). The Tier 1 pseudocode in Section 9 (lines 144-153) was corrected to use `Server` class + `getFreePort()`. However, three other locations still reference the old, broken pattern:

1. **D2** (line 270): "Port randomization: `hocuspocus.listen(0)` for Tier 1"
2. **US-003** (line 333): "Test harness: `createTestServer()` factory that calls `createServer()` + `hocuspocus.listen(0)` + returns `{ port, server, cleanup }`"
3. **Port isolation summary table** (line 253): "Tier 1 (programmatic) | `hocuspocus.listen()` (port 0) | OS kernel assigns random port"

An implementer reading D2 or US-003 would use the wrong API. The corrected pseudocode and these stale references coexist in the same document, creating an actionable contradiction.

**Current text:** See three locations above.
**Evidence:** SPEC.md lines 144-153 (corrected pseudocode uses `Server` class + `getFreePort()`) vs lines 253, 270, 333 (still reference `hocuspocus.listen(0)`). v1 audit H1 identified the root issue.
**Status:** INCOHERENT
**Suggested resolution:** Update all three locations to reference `Server` class + `getFreePort()` pattern. Specifically:
- D2: "Port randomization: `getFreePort()` + `Server.listen(port)` for Tier 1; ..."
- US-003: "Test harness: `createTestServer()` factory that uses `getFreePort()` + `new Server(...)` + `server.listen(port)` + returns `{ port, server, cleanup }`"
- Port isolation summary: "Tier 1 (programmatic) | `getFreePort()` + `Server.listen(port)` | Pre-allocated random port | Guaranteed — no TOCTOU race"

---

## Medium Severity

### [M1] US-005 and Section 9 test-reset prose contradict D7 — unfiltered vs filtered closeConnections

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions), related to v1 audit L1
**Location:** Section 9 (Test-reset enhancement, line 263), Section 15 Phase 1 (US-005, line 335), Section 10 (D7, line 275)
**Issue:** D7 was updated (correctly) to say: "keep filtered `hocuspocus.closeConnections('test-doc')` — already disconnects all clients for the test doc." However, two other locations still describe the pre-correction unfiltered behavior:

1. **US-005** (line 335): "`hocuspocus.closeConnections()` (all clients) before unload"
2. **Section 9 prose** (line 263): "add a `hocuspocus.closeConnections()` call (no document filter) to disconnect ALL clients"

An implementer following US-005 would use unfiltered `closeConnections()` (disconnecting all documents), contradicting the decision in D7 to keep it filtered to 'test-doc'.

**Current text:**
- D7: "keep filtered `hocuspocus.closeConnections('test-doc')`"
- US-005: "`hocuspocus.closeConnections()` (all clients) before unload"
- Section 9: "add a `hocuspocus.closeConnections()` call (no document filter)"

**Evidence:** SPEC.md lines 263, 275, 335.
**Status:** INCOHERENT
**Suggested resolution:** Update US-005 and Section 9 prose to match D7: use `hocuspocus.closeConnections('test-doc')` (filtered).

---

### [M2] Three-way merge stories (US-036/037/038) describe "WYSIWYG user" scenarios but three-way merge only operates on source mode toggle-back

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Section 15 Phase 5 (US-036/037/038, lines 443-445)
**Issue:** The three-way merge stories describe scenarios where "WYSIWYG user adds paragraph" or "user restructures headings in WYSIWYG." However, `threeWayMerge()` in `packages/app/src/editor/three-way-merge.ts` operates exclusively on the source mode toggle-back path. Its inputs are `snapshotMarkdown` (taken when entering source mode) and `userEditedMarkdown` (what the user typed in source mode). It does not handle WYSIWYG edits — WYSIWYG edits go through Observer A, not through three-way merge.

The existing tests in `agent-flow.test.ts` all simulate the source mode toggle-back workflow (user edits markdown string, agent writes via DirectConnection, merge on toggle-back). None involve WYSIWYG editing.

If these stories are un-deferred in the future, the acceptance criteria need to describe source mode toggle-back scenarios, not WYSIWYG scenarios. As written, the stories are unimplementable because the described user actions don't trigger the three-way merge code path.

**Current text:** US-036: "WYSIWYG user adds paragraph + agent writes section via Y.Text -> merge produces correct combined content"
**Evidence:** `packages/app/src/editor/three-way-merge.ts` function signature (lines 100-106): `threeWayMerge(doc, fragment, snapshotMarkdown, userEditedMarkdown, ...)`. Called exclusively from source mode toggle-back contexts per `agent-flow.test.ts`.
**Status:** CONTRADICTED
**Suggested resolution:** If un-deferred, rewrite stories to describe source mode scenarios: "User enters source mode, snapshot is taken. Agent writes via Y.Text/DirectConnection. User edits in source mode. User toggles back. Three-way merge preserves both sides." This matches the actual code path.

---

### [M3] SCOPE lists `three-way-merge.ts` as in-scope but D9 defers three-way merge — scope section is stale

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 16 (SCOPE, line 462), Section 10 (D9, line 277)
**Issue:** The SCOPE section lists: `packages/app/src/editor/three-way-merge.ts — test coverage (read-only, no production changes unless bugs found)`. D9 says three-way merge is DEFERRED and "needs its own spec." If three-way merge testing is deferred, the file should not appear in the SCOPE section for this spec's implementation.

**Current text:** SCOPE: "packages/app/src/editor/three-way-merge.ts — test coverage (read-only, no production changes unless bugs found)"
**Evidence:** D9 (line 277): "Three-way merge DEFERRED."
**Status:** INCOHERENT
**Suggested resolution:** If three-way merge is deferred (per D9), remove `three-way-merge.ts` from SCOPE. If it's in scope, update D9.

---

### [M4] Phase 5 conversion fidelity stories (US-033, US-035) depend on Phase 1 infrastructure but no dependency is stated

**Category:** COHERENCE
**Source:** L3 (Missing conditionality)
**Location:** Section 15 Phase 5 (US-033, US-035), Section 15 Phase 1
**Issue:** US-033 ("Disk round-trip") is labeled "Tier 1 integration" and US-035 ("Agent-as-file-editor fidelity") is also labeled "Tier 1 integration." Both require the `createTestServer()` and `createTestClient()` harness factories from Phase 1 (US-003, US-004). However, Phase 5 has no stated dependency on Phase 1. The phase ordering (1 through 6) implies sequential execution, but this ordering is not explicit and an implementer could attempt Phase 5 stories before Phase 1 is complete.

The other Phase 5 stories (US-030, US-031, US-032, US-034) are labeled "Pure unit" or "Unit with setupObservers" and have no infrastructure dependency, so they could be started in parallel. But an implementer needs to know which stories require the Tier 1 harness.

**Current text:** US-033: "Tier 1 integration. Verifies content survives disk persistence + reload"
**Evidence:** Phase 1 US-003/US-004 define `createTestServer()` and `createTestClient()` which are prerequisites for any "Tier 1 integration" test.
**Status:** INCOHERENT
**Suggested resolution:** Add a note at the top of Phase 5 stating that "Tier 1 integration" stories (US-033, US-035) depend on Phase 1 infrastructure (US-003, US-004). Or add explicit `Depends: US-003, US-004` annotations to those stories.

---

## Low Severity

### [L1] US-028 and US-029 are missing from the story numbering sequence — gap between Phase 4 (US-027) and Phase 5 (US-030)

**Category:** COHERENCE
**Source:** L5 (Summary coherence — cross-section consistency)
**Location:** Section 15 Phase 4 (US-027) and Phase 5 (US-030)
**Issue:** Story IDs jump from US-027 (Phase 4, last story) to US-030 (Phase 5, first story). US-028 and US-029 do not exist in the document. While gaps in numbering are not inherently harmful, they create ambiguity — a reader might wonder if stories were deleted and whether any references to US-028/029 exist elsewhere.

No references to US-028 or US-029 were found in the spec or evidence files, so this is likely a numbering artifact from story reorganization rather than missing content.

**Current text:** Phase 4 ends at US-027; Phase 5 starts at US-030.
**Evidence:** Full-text search of SPEC.md for "US-028" and "US-029" returns zero matches.
**Status:** INCOHERENT
**Suggested resolution:** Either renumber Phase 5 stories to start at US-028, or add a comment noting the gap was intentional (e.g., reserved IDs for future Phase 4 stories).

---

## Confirmed Claims (summary)

**T1 (Own codebase):**
- `three-way-merge.ts` exists at `packages/app/src/editor/three-way-merge.ts` with `threeWayMerge()` function -- confirmed
- `threeWayMerge()` takes `snapshotMarkdown` and `userEditedMarkdown` string params (source mode toggle-back path) -- confirmed
- Existing three-way merge tests in `agent-flow.test.ts` use DirectConnection + markdown strings (5 test sites) -- confirmed
- Observer A's origin guard checks for `ORIGIN_TEXT_TO_TREE` ('sync-from-text') at observers.ts:319 -- confirmed
- Observer A's remote transaction guard at observers.ts:320 (`!transaction.local`) returns early after baseline refresh -- confirmed
- `ySyncPluginKey` is importable from `@tiptap/y-tiptap` (verified from tiptap OSS repo: `extension-collaboration/src/helpers/isChangeOrigin.ts` imports it) -- confirmed
- OQ1 hypothesis mechanism is structurally sound: ySyncPlugin write-back would be LOCAL with origin `ySyncPluginKey`, would pass Observer A's origin guard (line 319) and local guard (line 320), and would schedule debounced sync -- confirmed via code trace
- `conversion-fidelity.test.ts` does not yet exist (marked NEW in SCOPE) -- confirmed
- Phase 4 AGENTS.md target structure references real code paths and file names -- confirmed (observers.ts, agent-sessions.ts, persistence.ts patterns verified)

**T2 (OSS repos):**
- `ySyncPluginKey` exported from `@tiptap/y-tiptap` -- confirmed from tiptap OSS repo

**L1-L7 (Coherence):**
- Phase 5 conversion fidelity stories US-030 through US-035 are internally coherent and cover progressive layers of the conversion stack (markdown -> tree -> observer -> disk -> full-stack -> agent coexistence) -- confirmed
- D10 is consistent with US-030-US-035 scope -- confirmed
- OQ12 is well-formed and correctly references US-030 as the resolution mechanism -- confirmed
- Phase 4 AGENTS.md target structure is well-organized with clear story-to-section mapping (US-023 through US-027) -- confirmed
- Phase 6 hardening stories (US-039, US-040) correctly reference prerequisite phases -- confirmed
- Evidence file `oq1-ysyncplugin-writeback.md` is internally coherent and the proposed diagnostic plan (D6) aligns with US-020 -- confirmed

## Unverifiable Claims

- The ySyncPlugin `view.update` callback line references (y-tiptap.js:230-268) could not be verified — `node_modules` not installed in this worktree. The OQ1 evidence file's source references are `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` which is a build artifact. The structural mechanism is confirmed from the OSS repo source, but specific line numbers in the compiled output are unverifiable.
- Whether US-032's "Unit with setupObservers" approach exercises the same Observer A behavior as production (the spec itself notes Layer A uses `transaction.local === true` which differs from production). The story does not address this caveat.
