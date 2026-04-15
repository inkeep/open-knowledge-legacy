# Design Challenge Findings

**Artifact:** `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md`
**Challenge date:** 2026-04-15
**Baseline commit:** `3eb50c2`
**Total findings:** 12 (4 high, 5 medium, 3 low)

---

## High Severity

### [H1] Finding 1: Rollout mode-coordination via awareness is gossip-based — the same property that disqualified awareness leader-election (Option A)

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap) + DC3 (Framing validity)
**Location:** SA-D5 (runtime feature flag), FR-8, R2, §7e rollout sequence
**Issue:** The spec rejects awareness-based leader election (Option A in `evidence/rejected-alternatives.md`) because "Yjs awareness is gossip-based, not consensus-based. Network partitions produce two 'leaders.'" Yet the rollout mechanism (SA-D5, FR-8) uses the same awareness channel to coordinate the `serverAuthorityMode` field between server and clients. The same gossip-eventual-consistency criticism applies to mode coordination: between client connection and awareness convergence, a window exists where the client doesn't know the mode and defaults to `serverAuthoritativeMode: false` (client-mode). During this window, BOTH the client AND the server write the derived CRDT — reproducing the multi-writer race the spec exists to eliminate.

R2 acknowledges this risk but calls it LOW severity with mitigation "atomic flag flip, all clients reconnect." But "atomic flag flip" is aspirational — the spec provides no mechanism to enforce it. Awareness broadcast is eventual, not atomic. And "all clients reconnect" requires either (a) server-initiated disconnection of all clients (not specified) or (b) clients voluntarily reconnecting on awareness change (out of scope per SA-D11).

**Current design:** "Server broadcasts its authority mode to connecting clients via the existing awareness channel (new `serverAuthorityMode` field on awareness state). Client reads awareness on connect, wires `setupObservers({ ..., serverAuthoritativeMode: mode === 'server' })`." (FR-8)
**Alternative:** Use the Hocuspocus `onAuthenticate` or connection handshake response to inject the mode into the initial WebSocket connection. The client reads `serverAuthorityMode` from the connection metadata (synchronous with connect), not from awareness (eventual). This makes mode agreement atomic with connection establishment. Alternatively, the server could refuse client-origin observer writes (by detecting and discarding transactions with `ORIGIN_TREE_TO_TEXT` / `ORIGIN_TEXT_TO_TREE` origins) as a server-side safety net regardless of client mode.
**Trade-off:** Handshake-based mode adds a custom field to the Hocuspocus connection response (minor coupling). Server-side write rejection adds origin-checking overhead per transaction (negligible). Both eliminate the gossip-window race that awareness-based coordination cannot prevent.
**Status:** CHALLENGED
**Suggested resolution:** Replace awareness-based mode broadcast with connection-handshake-based mode injection. Add a server-side safety net that discards client-origin observer-sync transactions when in server-authoritative mode, so a stale-mode client cannot produce multi-writer races even if the mode handshake fails.

---

### [H2] Finding 2: Server CPU budget (<5% at 10 clients) contradicts the latency research report's cost model

**Category:** DESIGN
**Source:** DC1 (Simpler alternative — napkin math challenge)
**Location:** G7, A2, R1, FR-14
**Issue:** The spec claims "<5% of server CPU for 10 concurrent clients" (G7) and treats this as achievable. The `crdt-observer-bridge-latency-analysis` report (referenced in the spec's own Links section) measured parse+serialize costs that are non-linear with document size: at 10K lines, serialization alone takes 7.4 seconds for a full pipeline run. Even with the 50ms debounce coalescing edits, server observer fires at the capped rate of ~20/s per document (2 directions × 1 fire per 50ms debounce). For a 10K-line document, each serialize pass consumes hundreds of milliseconds. At 2K lines (a more typical document), the report shows ~500ms per pipeline run — still 25ms per serialize, producing ~500ms/s of CPU at 20 fires/s.

The napkin math:
- **Small doc (500 lines):** serialize ~5ms. 20 fires/s × 5ms = 100ms/s = 10% of one core. Already exceeds 5%.
- **Medium doc (2K lines):** serialize ~25ms. 20 fires/s × 25ms = 500ms/s = 50% of one core. 10× budget.
- **Large doc (10K lines):** serialize ~370ms. 20 fires/s × 370ms = 7.4s/s. More than one full core.

The 20 fires/s rate assumes continuous concurrent editing from multiple clients where the debounce timer fires every 50ms because new edits keep arriving. In practice, typical editing has pauses that let the debounce quiesce. But the spec's target scale is "10 concurrent clients" — under burst conditions (e.g., paste, rapid typing from multiple users), the debounce fires continuously. The 5% budget is plausible only if either (a) documents are very small (<200 lines) or (b) editing bursts are rare and short.

The gap between the 5% target (G7) and the 20% rejection threshold (G7 acceptance criteria) is itself a red flag — it suggests the budget is aspirational rather than derived from measurement.

**Current design:** "<5% of server CPU for 10 concurrent clients. Reject the design if measured cost exceeds 20% at target scale."
**Alternative:** (a) Accept that the CPU cost will exceed 5% for non-trivial documents and adjust the budget to a realistic range (10-15%); or (b) implement adaptive debounce (longer debounce under load, e.g., 200ms instead of 50ms during bursts) as a first-class requirement, not a NOT NOW deferral; or (c) optimize the serialize path to avoid full-document serialization on every fire by caching the last-serialized body and applying only the diff (the client observers' Path A already does this via `applyIncrementalDiff` — the server should reuse this optimization rather than re-serializing from scratch each time).
**Trade-off:** (a) Honest budgeting vs. discovering the design fails acceptance criteria in FR-14. (b) Adaptive debounce trades latency for CPU but conflicts with the spec's NG7 deferral. (c) Incremental serialize is a significant optimization that narrows the spec scope but avoids the scale wall.
**Status:** CHALLENGED
**Suggested resolution:** Re-derive the CPU budget from the latency report's actual measurements. If the budget is unrealistic, either adjust the acceptance threshold or make incremental serialization (Path A reuse) a Must requirement instead of porting the full-serialize path naively.

---

### [H3] Finding 3: Test matrix C1-C5 misses four structurally distinct concurrent-writer scenarios

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — testing completeness)
**Location:** FR-11, §5 user journeys
**Issue:** The C1-C5 test matrix covers the five persona combinations (P1-P5) but misses scenarios that exercise unique code paths in the server observer:

1. **Mode-switch during pending debounce (not covered):** Client switches from WYSIWYG to source-mode while Server Observer A has a pending 50ms debounce. The debounce fires and writes Y.Text, but the client has already switched to source-mode and is now directly writing Y.Text via CodeMirror. The server's Observer A write and the client's direct Y.Text write are concurrent on the SAME CRDT — this is the native Y.Text RGA merge (correct), but the server observer's debounced write may contain stale content from before the mode switch. The spec's C3 (mixed mode) tests A-in-WYSIWYG + B-in-source, but never a single client switching modes mid-edit.

2. **Disconnect-reconnect with buffered CRDT state (partially covered in failure paths but no test):** The spec's failure-path journey says "Client's local CRDT state buffers unsent updates. On reconnect, CRDT sync propagates. Server observer fires." But no integration test validates this. When multiple clients reconnect simultaneously after a partition, their buffered states merge at the server, and the server observer fires on the merged result. If the merged result has conflicting edits in the same paragraph, the observer's serialize+write may produce unexpected results.

3. **File-watcher + agent + human triple-concurrent (not covered):** External file change (FILE_WATCHER_ORIGIN) + agent write (AGENT_WRITE_ORIGIN) + human typing (undefined origin) — three concurrent write surfaces that all trigger server observer reactions. The origin guard truth table (§7d) shows each origin's handling, but no test exercises all three simultaneously. This is the highest-dimensional concurrent case in production.

4. **New client joining mid-debounce (not covered):** A new client connects while server Observer A has a pending debounce. The joining client receives the initial Y.Doc state via Hocuspocus sync, which includes the current Y.Text (not yet updated by the pending Observer A write). The client sees stale Y.Text until the debounce fires and propagates. If the client immediately switches to source mode, they see stale content. This is a user-visible correctness gap, even if transient.

**Current design:** "C1-C5 test matrix covers the five persona combinations."
**Alternative:** Add C6 (mode-switch-mid-debounce), C7 (disconnect-reconnect-burst), C8 (triple-concurrent: file+agent+human), C9 (join-mid-debounce). At minimum, C6 and C8 should be Must — they exercise unique code paths. C7 and C9 can be Should.
**Trade-off:** 4 additional integration tests (~2-3 hours of implementation). Catches bugs that C1-C5 structurally cannot reach.
**Status:** CHALLENGED
**Suggested resolution:** Promote C6 (mode-switch) and C8 (triple-concurrent) to Must. Add C7 and C9 as Should. The fuzzer rebalance (FR-10) partially covers these via random op sequences, but deterministic reproducers are needed for regression gating.

---

### [H4] Finding 4: No mutation test for broken client gate (FR-7) — the most direct regression path

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — validation completeness)
**Location:** FR-12 (Mutation tests E + F), SA-D10
**Issue:** Mutation E tests "revert server Observer B attachment → C2 fails" and Mutation F tests "revert skipStoreHooks → persistence feedback loop." Both validate server-side components. But neither validates the CLIENT-SIDE gate (FR-7). The most direct regression path for the original bug is: someone accidentally removes or bypasses the `if (!serverAuthoritativeMode)` guard in `observers.ts`, causing the client to write the derived CRDT ALONGSIDE the server. This produces the exact multi-writer race the spec exists to fix.

A **Mutation G** is needed: "Revert client Observer A/B write-path gate (remove `if (!serverAuthoritativeMode)` checks) → C1/C2 convergence tests fail with Y.Text/XmlFragment duplicates under multi-client scenarios." This mutation validates that the client gate is load-bearing, not decorative.

Without Mutation G, the following scenario is undetected by the validation suite: an implementer correctly wires server observers (Mutation E passes) and correctly sets skipStoreHooks (Mutation F passes), but forgets to gate the client write path. All tests pass because the server observer's writes happen to overwrite the client's writes (LWW at server). But under specific timing (client write arrives at server AFTER the server observer writes, but BEFORE the next debounce cycle), the client's redundant write produces RGA interleave — the original bug, with lower probability.

**Current design:** "Mutation tests E + F replace 2026-04-14 spec's Mutation A-D as this ship's validation gates."
**Alternative:** Add Mutation G: revert client gate → C1+C2+C3 fail. This completes the validation triangle: server attachment (E), server feedback prevention (F), client write suppression (G).
**Trade-off:** One additional mutation test (~30 minutes of implementation). Catches the most likely regression path.
**Status:** CHALLENGED
**Suggested resolution:** Add Mutation G as a Must validation gate alongside E and F.

---

## Medium Severity

### [M1] Finding 5: Frontmatter sync handling unspecified in server observer

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — implementation completeness)
**Location:** FR-1, §7a `SetupServerObserversOpts`
**Issue:** Client Observer B reads frontmatter from Y.Text via `stripFrontmatter(md)` and writes it to `Y.Map('metadata')` (lines 501, 510-513 of `observers.ts`). The spec's server Observer B description (FR-1, FR-4) mentions "mirrors client-side observer bridge's write-side logic" but never explicitly addresses frontmatter. The `SetupServerObserversOpts` interface includes `doc: Y.Doc` (so `doc.getMap('metadata')` is accessible), but the frontmatter sync is implicit.

If the implementer ports the Y.Text→XmlFragment write path but omits the `Y.Map('metadata')` update, frontmatter changes made in source mode won't propagate to the metadata map. Persistence reads frontmatter from the metadata map (or from its own cache), so frontmatter edits could be silently dropped.

**Current design:** FR-1 says "Mirrors the client-side observer bridge's write-side logic." Frontmatter handling is not explicitly called out.
**Alternative:** Add a note to FR-1 or FR-4 explicitly requiring server Observer B to port the frontmatter→metadata sync from client Observer B (lines 500-513 of `observers.ts`). Symmetric: server Observer A should read frontmatter from Y.Map('metadata') and prepend it when serializing XmlFragment→Y.Text (matching client Observer A's `getFrontmatter(doc)` calls at lines 378, 449, 642).
**Trade-off:** Documentation clarity. No design change needed.
**Status:** CHALLENGED
**Suggested resolution:** Add explicit frontmatter-handling requirement to FR-1 or create FR-1a.

---

### [M2] Finding 6: REMOTE_TREE_SYNC_GRACE_MS removal is correct but undocumented — future implementers may re-add it

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — operational clarity)
**Location:** §7a, FR-1
**Issue:** Client Observer B has a `REMOTE_TREE_SYNC_GRACE_MS = 150ms` grace window (line 109 of `observers.ts`) that delays Observer B's Y.Text→XmlFragment write when a remote XmlFragment-only change recently arrived, waiting for the paired Observer A Y.Text sync. The spec says "No typing-defer (server never 'types')" but doesn't mention the grace window or why it's unnecessary on the server.

On the server, the grace window is indeed unnecessary because the origin guard prevents the cascade: Server Observer A writes Y.Text under `OBSERVER_SYNC_ORIGIN` → Server Observer B skips `OBSERVER_SYNC_ORIGIN`-origin Y.Text changes. No waiting needed. But a future implementer porting client code to the server will see the grace window logic in the client source and wonder whether it should be ported. Without an explicit "and here's why we omit the grace window" note, they may defensively re-add it, introducing an unnecessary 150ms latency on the server path.

**Current design:** §7a says "No typing-defer (server never 'types'; typing-defer was a client-specific UX concern)."
**Alternative:** Add a companion note: "No REMOTE_TREE_SYNC_GRACE_MS — the server's origin guard (OBSERVER_SYNC_ORIGIN self-skip) eliminates the cascade that the client grace window exists to prevent. Server Observer B never needs to wait for Server Observer A because cross-observer writes are origin-guarded, not timing-guarded."
**Trade-off:** Documentation clarity. No design change.
**Status:** CHALLENGED
**Suggested resolution:** Add explicit rationale for grace-window omission to §7a or FR-1.

---

### [M3] Finding 7: Server-side post-merge reconciliation was not evaluated as an alternative

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §1 (Problem statement), `evidence/rejected-alternatives.md`
**Issue:** The spec's rejected-alternatives analysis evaluates 7 alternatives, all of which attempt to PREVENT the multi-writer race. A reactive approach — server-side post-merge reconciliation — was not evaluated. In this alternative:

1. Client observers continue to write the derived CRDT (no change).
2. The server runs a reconciliation pass after CRDT sync settles.
3. If the server detects that Y.Text content diverges from the canonical XmlFragment serialization (or vice versa), it performs a corrective write under a reconciliation origin.

This is the same pattern as `applyExternalChange` → `reconcile()` in the current file-watcher path: detect divergence, correct it. It avoids the latency cost of server round-trips, avoids the CPU cost of server-side serialize-per-edit, avoids the complexity of client mode gating (FR-7), and avoids the rollout coexistence problem entirely (no mode flag needed).

The reconciliation approach has real problems: (a) There's a brief window where clients see duplicated/corrupted content before the server corrects it. (b) Detection is heuristic — distinguishing RGA-interleave duplication from intentional repeated content is non-trivial. (c) The corrective write itself could trigger more observer fires, creating a cascade risk.

However, the spec doesn't evaluate these trade-offs. The framing assumes "prevent the race" is the only viable strategy. A "detect and correct" strategy might be simpler for the 2-4% of seeds that actually trigger the race, deferring the full server-authority refactor to a later milestone.

**Current design:** "Relocate both observers to the server — a single coordination point."
**Alternative:** Server-side reconciliation: after CRDT sync settles (debounced), the server compares `serialize(XmlFragment)` vs. `Y.Text.toString()`. If diverged, the server performs a corrective write (XmlFragment→Y.Text or Y.Text→XmlFragment depending on which is canonical for the edit direction). This is the existing `applyExternalChange` pattern applied to observer-bridge divergence.
**Trade-off:** Simpler rollout (no mode flag), no client-side changes, no server-side observer wiring. But: brief user-visible corruption window (50-150ms), heuristic detection, corrective-write cascade risk. Viable only if the race frequency is low (currently 2-4% of fuzzer seeds).
**Status:** CHALLENGED
**Suggested resolution:** Evaluate the reconciliation alternative explicitly. If the brief corruption window is unacceptable (likely — it's visible in the UI), document why in rejected-alternatives.md. If it's acceptable for the 2-4% case, it could serve as a faster interim fix while server-authority is developed.

---

### [M4] Finding 8: openDirectConnection lifecycle management not specified in extension

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — resource management)
**Location:** §7b (`createServerObserverExtension`), SA-D12
**Issue:** The extension code in §7b stores `cleanup` functions (from `setupServerObservers`) in a Map, keyed by `documentName`. But `setupServerObservers` receives `doc`, `xmlFragment`, and `ytext` as arguments — it does not open or manage a DirectConnection. The extension's `afterLoadDocument` accesses `document` directly from the hook parameter.

SA-D12 says "Server observer attachment via `openDirectConnection`, not direct `document` access from the extension hook." But the code sample in §7b does NOT use `openDirectConnection` — it accesses `document` directly from the hook: `const doc = document`. This contradicts the LOCKED decision.

If the intent is to use `openDirectConnection` (as the AgentSessionManager does for agent writes), the extension needs to:
1. Call `hocuspocus.openDirectConnection(documentName)` in `afterLoadDocument`
2. Store the DirectConnection reference (not just the cleanup function)
3. Call `dc.disconnect()` in `onDestroyDocument` before deleting the cleanup

The current §7b code sample manages `cleanup` (observer unsubscription) but not the DirectConnection lifecycle. If `openDirectConnection` creates a persistent internal reference, failing to `disconnect()` on document unload leaks it.

**Current design:** §7b stores `cleanups` Map but not DirectConnection references. Code sample uses `document` directly, contradicting SA-D12.
**Alternative:** Update §7b code sample to: (a) call `openDirectConnection(documentName)` and store the DC; (b) use `dc.document` for Y.Doc access (matching agent-sessions.ts pattern); (c) call `dc.disconnect()` + `cleanup()` in `onDestroyDocument`.
**Trade-off:** Code sample correction. No design change to the architecture — this is a §7b implementation detail that contradicts a LOCKED decision.
**Status:** CHALLENGED
**Suggested resolution:** Reconcile §7b code with SA-D12. Either update the code sample to use `openDirectConnection`, or revisit SA-D12 if direct `document` access from hooks is actually sufficient (and document why the direct path works for read+write despite the SA-D12 rationale about broadcast participation).

---

### [M5] Finding 9: Disconnect-then-mode-switch produces stale source view with no user feedback

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — user experience)
**Location:** §5 failure-path journeys ("Server unreachable while client types WYSIWYG")
**Issue:** The spec acknowledges that when a client is disconnected and switches to source mode, "Y.Text is stale relative to XmlFragment." The mitigation is "on mode switch, show a 'Syncing...' indicator if disconnected. (Optional UX polish; not a correctness issue.)"

This understates the problem. In server-authoritative mode, the client Observer A write path is disabled. When disconnected, Y.Text receives NO updates — not from the server (disconnected) and not from the client (gated). If the user types extensively in WYSIWYG while disconnected, then switches to source mode, they see content that may be minutes or hours stale. In the CURRENT (client-authoritative) architecture, this scenario works correctly because the client's Observer A updates Y.Text locally.

The spec's rejected alternative ("fall back to client-authoritative mode when disconnected → reintroduces the multi-writer race when reconnected") is correctly rejected — but the alternative should be "disable mode-switching when disconnected" or "display a blocking modal explaining source mode is unavailable during disconnect." A "Syncing..." indicator suggests the content will update soon; in reality, it won't update until reconnection + server observer fire + CRDT sync — which could be never if the server is permanently unreachable.

**Current design:** "Acceptable trade-off — source-mode is a secondary view, disconnect is transient. Mitigation: on mode switch, show a 'Syncing...' indicator if disconnected."
**Alternative:** (a) Block mode-switching to source mode when disconnected (strongest UX guarantee). (b) Show a clear warning: "Source mode is read-only during disconnect. Edits will be lost." (c) Fall back to client-authoritative mode ONLY for local-display purposes (client Observer A updates local Y.Text for display, but does NOT propagate to server; on reconnect, server's authoritative Y.Text overwrites the client's).
**Trade-off:** (a) Limits user capability during disconnect — but prevents confusion. (b) Warning is honest but may still confuse users. (c) Complex hybrid mode with local-display-only writes.
**Status:** CHALLENGED
**Suggested resolution:** Evaluate whether option (a) (block mode-switch when disconnected) is acceptable as a Must. If source-mode access during disconnect is a product requirement, option (c) needs full specification.

---

## Low Severity

### [L1] Finding 10: Single-threaded event loop assumption is implicit and load-bearing

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — platform dependency)
**Location:** §7a, FR-1, FR-5
**Issue:** The entire server-observer design relies on JavaScript's single-threaded event loop ensuring that Observer A/B debounce callbacks, `applyAgentMarkdownWrite` transact blocks, and CRDT sync processing execute atomically within their event loop task. Specifically: if Observer A's debounced callback reads XmlFragment, computes a delta, and writes Y.Text, no other code (agent write, file-watcher write, another observer fire) can interleave between the read and write.

This is currently guaranteed by Node.js/Bun's event loop model. But:
- Hocuspocus has discussed worker-thread document processing for scale.
- Bun has experimental worker support with SharedArrayBuffer.
- If either platform introduces concurrent Y.Doc access (unlikely but not impossible), the race returns at a lower level.

The assumption should be explicit: "Server observer correctness depends on single-threaded Y.Doc access. If Hocuspocus or the runtime introduces concurrent document processing, server observers must be protected by a per-document mutex."

**Current design:** Implicit assumption throughout.
**Alternative:** Add a note to A2 or a new assumption: "A6-prime: Server observer correctness requires single-threaded Y.Doc access per document."
**Trade-off:** Documentation only.
**Status:** CHALLENGED
**Suggested resolution:** Make the event-loop assumption explicit in Assumptions or Agent Constraints.

---

### [L2] Finding 11: Latency perceptibility claim (+50ms) is best-case, not typical-case

**Category:** DESIGN
**Source:** DC1 (Simpler alternative — napkin math)
**Location:** R3, NFR Performance
**Issue:** The spec claims "+50ms for cross-CRDT visibility" as the latency cost. The actual path is:

1. Client writes source CRDT (local, ~0ms)
2. CRDT sync to server via WebSocket (~10-30ms depending on network)
3. Server observer debounce fires (50ms trailing edge — worst case, full 50ms; best case, 0ms if debounce already expired)
4. Server computes delta + writes derived CRDT (~5-370ms depending on document size, per latency report)
5. CRDT sync to client via WebSocket (~10-30ms)
6. Client renders (~0ms, framework handles)

Total best case: 10 + 0 + 5 + 10 = 25ms (small doc, debounce already fired).
Total typical case: 20 + 50 + 25 + 20 = 115ms (medium doc, full debounce).
Total worst case: 30 + 50 + 370 + 30 = 480ms (large doc, full debounce).

The 115ms typical case is above the 100ms imperceptibility threshold cited in HCI research. Users switching from WYSIWYG to source mode will notice a ~115ms lag before their recent WYSIWYG edits appear in the source view. This is tolerable but should be documented accurately.

**Current design:** "Additional ~50ms latency for cross-CRDT visibility." (NFR Performance)
**Alternative:** Update to "60-120ms typical latency for cross-CRDT visibility (50ms debounce + 2× network RTT + serialize cost). Exceeds 200ms for documents >5K lines."
**Trade-off:** Honest documentation. No design change.
**Status:** CHALLENGED
**Suggested resolution:** Update the latency claim to reflect the full path, not just the debounce.

---

### [L3] Finding 12: Bug-D (V0-14 agent undo) interaction is correctly handled but should document WHY

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — handoff clarity)
**Location:** §1 (Resolution, final bullet), P4, NG3
**Issue:** The spec correctly identifies that V0-14's `applyAgentUndo` handler is unaffected by the server-authority refactor: agent writes via `applyAgentMarkdownWrite` write both CRDTs atomically under `AGENT_WRITE_ORIGIN`, server observer sees the paired write and early-exits (already-in-sync check). Agent undo would follow the same template (§7e of the bridge-convergence SPEC).

However, the spec doesn't document WHY this is safe — specifically, that JavaScript's single-threaded event loop guarantees sequential execution of `applyAgentMarkdownWrite`'s transact block and the server observer's debounced callback. An agent undo cannot interleave with a server observer's mid-computation state because both run as atomic event loop tasks. Without this explanation, a V0-14 implementer might defensively add locking or sequencing that's unnecessary (and might introduce deadlocks).

**Current design:** "Agent path unchanged — `applyAgentMarkdownWrite` still writes both sides atomically server-side under `AGENT_WRITE_ORIGIN`. Server observer sees the paired update and early-exits."
**Alternative:** Add a note to §7a or a new evidence file: "Agent writes and server observer writes are sequentially ordered by the JavaScript event loop. `applyAgentMarkdownWrite` runs as a synchronous `doc.transact()` block; the server observer fires as a subsequent `setTimeout` callback. No interleaving is possible. V0-14's `applyAgentUndo` inherits this guarantee."
**Trade-off:** Handoff clarity. No design change.
**Status:** CHALLENGED
**Suggested resolution:** Add a brief note in the handoff section (§13 Agent Constraints or FR-1) explaining the event-loop serialization guarantee for V0-14's benefit.

---

## Confirmed Design Choices (summary)

### DC1: Simpler alternative lens

- **SA-D1 (server-authoritative) holds.** The core insight — that Y.Text's RGA CRDT merges concurrent writes by preserving all intents, producing duplication when the "intent" was full-content replacement — is correct and well-evidenced. No client-side coordination mechanism can achieve single-writer semantics without consensus, and the server IS the consensus point. The seven rejected alternatives are correctly rejected with adequate evidence. The one unevaluated alternative (M3: server-side reconciliation) is likely inferior but should be explicitly rejected.
- **SA-D4 (50ms debounce) holds** for correctness. Whether it holds for performance is challenged (H2).
- **SA-D7 (no new CRDT types) holds.** The refactor is purely a relocation of logic.

### DC2: Stakeholder gap lens

- **SA-D3 (`skipStoreHooks: true`) holds.** Observer writes are derived operations that don't need independent persistence. The original source-CRDT mutation already triggers persistence, and the 2000ms persistence debounce ensures the derived write completes before serialization. The two-layer feedback prevention (`writeTracker` hash + `skipStoreHooks`) is well-established.
- **SA-D9 (`afterLoadDocument` not `onLoadDocument`) holds.** Persistence populates the doc in `onLoadDocument`; observers must attach after to see populated state.
- **SA-D11 (skip mid-session flips) holds.** The complexity of mid-session mode switching is disproportionate to the benefit, given that mode changes are rare operational events.

### DC3: Framing validity lens

- **The problem framing (SCR) holds.** The complication is real (RGA interleave from concurrent observer writes), well-evidenced (fuzzer snapshot with character-level proof), and the resolution follows from the complication. The intersection of "bidirectional observers must stay" (user directive) and "concurrent client writes produce CRDT-level interleave" (fundamental Y.Text property) genuinely constrains the solution space to server-authority. The framing is not post-hoc.
- **The symmetry claim (Observer B race) holds.** The source-toggle-architecture report confirms that concurrent tree updates from independent parses produce structural corruption. The fuzzer's current 0.5% `source-type` op frequency hides this race, supporting the spec's claim of coverage-theater.
