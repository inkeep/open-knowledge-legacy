# Audit Findings

**Artifact:** `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md`
**Audit date:** 2026-04-15
**Total findings:** 10 (4 high, 4 medium, 2 low)

---

## High Severity

### [H1] Finding 1: Code sample in section 7b uses `onDestroyDocument` hook which does not exist in Hocuspocus

**Category:** FACTUAL
**Source:** T2 (OSS dependency types)
**Location:** SPEC section 7b "Hocuspocus extension wiring" (line 203 of spec)
**Issue:** The `createServerObserverExtension` code sample uses `async onDestroyDocument({ documentName })` as the per-document cleanup hook. This hook does not exist in the Hocuspocus Extension interface.
**Current text:** `"async onDestroyDocument({ documentName }) { cleanups.get(documentName)?.(); cleanups.delete(documentName); }"`
**Evidence:** Hocuspocus `Extension` interface at `node_modules/@hocuspocus/server/dist/index.d.ts:481-483` defines:
- `beforeUnloadDocument?(data: beforeUnloadDocumentPayload): Promise<any>` (payload: `{ instance, documentName, document }`)
- `afterUnloadDocument?(data: afterUnloadDocumentPayload): Promise<any>` (payload: `{ instance, documentName }`)
- `onDestroy?(data: onDestroyPayload): Promise<any>` (server-level, NOT per-document)

The `HookName` union at line 485 lists all valid hooks: `"onConfigure" | "onListen" | ... | "beforeUnloadDocument" | "afterUnloadDocument" | "onDestroy"`. No `onDestroyDocument` appears. An implementer following this code sample would get a dead handler that never fires, causing **memory leaks** (observer cleanups never run, `cleanups` Map grows unbounded).
**Status:** CONTRADICTED
**Suggested resolution:** Replace `onDestroyDocument` with `afterUnloadDocument` in the code sample. The payload `{ documentName }` is available on `afterUnloadDocument`, so the cleanup logic works unchanged.

---

### [H2] Finding 2: Code sample in section 7b contradicts LOCKED decision SA-D12

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** SPEC section 7b code sample vs. section 9 Decision Log SA-D12
**Issue:** SA-D12 (LOCKED) decides: "Server observer attachment via `openDirectConnection`, not direct `document` access from the extension hook." Its rationale states: "Direct `document.getXmlFragment()` from a hook does not trigger broadcast to clients." Yet the code sample in section 7b does the exact opposite:

```ts
async afterLoadDocument({ document, documentName }) {
  const doc = document;
  const xmlFragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
```

The code accesses `document` directly from the hook parameter and never calls `openDirectConnection`. An implementer must choose between following the code sample (which works but contradicts SA-D12) or following SA-D12 (which requires restructuring the extension to call `hocuspocus.openDirectConnection(documentName)` inside `afterLoadDocument`).
**Current text (SA-D12):** `"openDirectConnection is the supported public API for server-side Y.Doc mutation that participates in CRDT propagation. Direct document.getXmlFragment() from a hook does not trigger broadcast to clients."`
**Evidence:** The code sample at section 7b directly uses `document` from the hook payload. SA-D12 explicitly says not to do this.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) update the section 7b code sample to use `openDirectConnection` inside `afterLoadDocument` per SA-D12, or (b) downgrade SA-D12 to reflect that direct document access works (see H3 below) and keep the simpler code sample.

---

### [H3] Finding 3: SA-D12's rationale ("direct document access does not trigger broadcast") is likely factually incorrect

**Category:** FACTUAL
**Source:** T2 (OSS dependency architecture)
**Location:** SPEC section 9 Decision Log SA-D12
**Issue:** SA-D12 claims "Direct `document.getXmlFragment()` from a hook does not trigger broadcast to clients." This appears incorrect. The `document` field in Hocuspocus's `afterLoadDocumentPayload` (type at `node_modules/@hocuspocus/server/dist/index.d.ts:625-634`) is the Hocuspocus `Document` object, which extends `Y.Doc`. Mutations on this object fire `Y.Doc.afterTransaction`, which is the mechanism Hocuspocus uses to propagate updates to connected WebSocket clients. All client connections share the same `Document` instance. `openDirectConnection` creates a `DirectConnection` wrapper over the same underlying `Document`/`Y.Doc` — it adds lifecycle management and a connection-count increment, but the broadcast mechanism is on the `Document` itself.

**Rationale for `openDirectConnection` that does hold:**
- Prevents premature document unloading: an `openDirectConnection` increments the connection count, keeping the document loaded even if all browser clients disconnect momentarily.
- Clean lifecycle: `DirectConnection.disconnect()` provides explicit teardown.

These are valid reasons, but they differ from the stated rationale ("broadcast won't work").
**Current text:** `"Direct document.getXmlFragment() from a hook does not trigger broadcast to clients. Pattern already used for __system__ at standalone.ts:210."`
**Evidence:** Hocuspocus's `Document` class extends `Y.Doc`. Mutations on the Y.Doc fire `afterTransaction` events that Hocuspocus's sync protocol uses for WebSocket broadcast. The `__system__` pattern at `standalone.ts:845` uses `openDirectConnection` for the stateless broadcast feature (`broadcastStateless`), which IS DirectConnection-specific — but normal Y.Doc mutations propagate regardless.
**Status:** CONTRADICTED (rationale incorrect; conclusion may be right for different reasons)
**Suggested resolution:** Rewrite SA-D12's rationale to cite the actual benefits (connection-count lifecycle, prevent premature unload) rather than the incorrect claim about broadcast. Then update the section 7b code sample to match — it should call `openDirectConnection` and store/close the `DirectConnection` in the cleanup.

---

### [H4] Finding 4: FR-1 contradicts SA-D9 on which hook to use

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** SPEC section 6 FR-1 vs. section 9 SA-D9
**Issue:** Two spec sections specify different Hocuspocus hooks:
- **FR-1:** "Attached via new `createServerObserverExtension()` wired in `standalone.ts` per-document at **`onLoadDocument`** time using `hocuspocus.openDirectConnection(documentName)`"
- **SA-D9:** "Server Observer A/B use **`afterLoadDocument`**, not `onLoadDocument`. `afterLoadDocument` fires after persistence has loaded canonical state into the doc. Attaching observers earlier would see an empty doc and fire spurious 'divergence' writes."

SA-D9's rationale is correct: persistence's `onLoadDocument` hook (at `persistence.ts:319`) loads content from disk into the Y.Doc. Attaching observers in `onLoadDocument` risks racing with persistence's load — the observers would see an empty doc and attempt to sync empty content. `afterLoadDocument` fires after all `onLoadDocument` hooks complete, guaranteeing the doc is populated.
**Current text (FR-1):** `"...at onLoadDocument time using hocuspocus.openDirectConnection(documentName)"`
**Current text (SA-D9):** `"Server Observer A/B use afterLoadDocument, not onLoadDocument."`
**Evidence:** Hocuspocus `HookName` order at `index.d.ts:485`: `onLoadDocument` precedes `afterLoadDocument`. Persistence uses `onLoadDocument`. The section 7b code sample correctly uses `afterLoadDocument`.
**Status:** INCOHERENT
**Suggested resolution:** Fix FR-1 to say `afterLoadDocument` (matching SA-D9 and the section 7b code sample).

---

## Medium Severity

### [M1] Finding 5: standalone.ts line numbers are wrong throughout the spec

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC section 6 FR-1, section 8, section 9 SA-D12
**Issue:** The spec repeatedly cites `standalone.ts:210` and `standalone.ts:825` as the location of the `openDirectConnection('__system__')` pattern.
**Current text (FR-1):** `"pattern established by __system__ doc pre-materialization at standalone.ts:210, 825"`
**Evidence:** Actual locations in `standalone.ts`:
- Line 213: `let systemDocConnection: Awaited<ReturnType<...>> | null = null;` (variable declaration)
- Line 845: `systemDocConnection = await hocuspocus.openDirectConnection(SYSTEM_DOC_NAME);` (actual call)
- Line 210: `releaseServerLock(lockDir)` (completely unrelated — server lock cleanup)

Neither cited line number is correct. An implementer searching for "the pattern at line 210" would find lock-release code, not the openDirectConnection pattern.
**Status:** CONTRADICTED
**Suggested resolution:** Update all references to `standalone.ts:213` (declaration) and `standalone.ts:845` (call), or remove line numbers and reference by pattern name only.

---

### [M2] Finding 6: Evidence file cites wrong line numbers for `applyUserDelta` in observers.ts

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** `evidence/root-cause-multi-writer-rga-interleave.md` line 28
**Issue:** The evidence file states "Path B (`observers.ts:440-500` `applyUserDelta`)" for the DMP three-way merge logic.
**Current text:** `"Path B (observers.ts:440-500 applyUserDelta) uses diff-match-patch three-way merge"`
**Evidence:** `applyUserDelta` is at `observers.ts:280-319`. Lines 440-500 are inside the Observer A callback's remote-change baseline-refresh logic — a different code path.
**Status:** CONTRADICTED
**Suggested resolution:** Update the evidence file to cite `observers.ts:280-319`.

---

### [M3] Finding 7: Section 7b mischaracterizes how existing extensions are wired in standalone.ts

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC section 7b, below the code sample
**Issue:** The spec says the new extension is "Wired in `standalone.ts` alongside the existing `cc1Broadcaster`, `persistenceExtension`, `apiExtension`, `agentSessionManager`." This implies all four are Hocuspocus extensions.
**Current text:** `"Wired in standalone.ts alongside the existing cc1Broadcaster, persistenceExtension, apiExtension, agentSessionManager."`
**Evidence:** In `standalone.ts`:
- `persistence.extension` is in the initial `extensions: [...]` array (line 183)
- `liveDerivedIndexExtension` is pushed via `configuration.extensions.push()` (line 192)
- `apiExtension` is pushed via `configuration.extensions.push()` (line 208)
- `CC1Broadcaster` is instantiated as a standalone class (line 185), NOT wired as a Hocuspocus extension
- `AgentSessionManager` is instantiated as a standalone class (line 187), NOT wired as a Hocuspocus extension

Only `persistence.extension`, `liveDerivedIndexExtension`, and `apiExtension` are Hocuspocus extensions. The spec also omits `liveDerivedIndexExtension`.
**Status:** CONTRADICTED
**Suggested resolution:** Update to: "Wired in `standalone.ts` via `configuration.extensions.push()` alongside the existing `persistence.extension`, `liveDerivedIndexExtension`, and `apiExtension`."

---

### [M4] Finding 8: Feature-flag broadcast via awareness channel (FR-8) is architecturally underspecified

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** SPEC section 6 FR-8
**Issue:** FR-8 says "Server broadcasts its authority mode to connecting clients via the existing awareness channel (new `serverAuthorityMode` field on awareness state)." Yjs awareness is per-client-connection — each connected peer has its own awareness state. There is no built-in "server awareness" concept. The spec doesn't specify:
1. Which awareness instance sets the field (the `__system__` DirectConnection's? Each document's DirectConnection's?)
2. How per-document awareness reaches all clients across documents
3. Whether the awareness field is readable by clients that connect after the broadcast

For a flag that changes only at maintenance-window server restarts (SA-D11), a simpler mechanism (e.g., include the mode in the Hocuspocus connection handshake response, or a CC1 broadcast on `__system__` doc, or initial WebSocket message) would avoid the awareness complexity. The spec says "config-injected" as an alternative in passing but doesn't evaluate the trade-offs.
**Current text:** `"Server broadcasts its authority mode to connecting clients via the existing awareness channel (new serverAuthorityMode field on awareness state). Client reads awareness on connect..."`
**Status:** INCOHERENT
**Suggested resolution:** Either (a) specify the exact mechanism (which awareness instance, how clients discover it) or (b) switch to a simpler delivery method — e.g., a `serverCapabilities` field in the Hocuspocus `onAuthenticate` or `connected` response, or injected via the initial HTML payload (already done for theme config).

---

## Low Severity

### [L1] Finding 9: Precedent numbering in FR-13 is incorrect

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC section 6 FR-13
**Issue:** FR-13 says the new precedent goes "after #10 and #11 added by 2026-04-14 spec." CLAUDE.md currently has 13 architectural precedents (#1-#13). The 2026-04-14 spec added #11 ("Minimize CRDT mutation"), #12 ("XmlFragment is authoritative"), and #13 ("Bridge invariants are auto-enforced"). The next available number is #14.
**Current text:** `"new number, after #10 and #11 added by 2026-04-14 spec"`
**Evidence:** `CLAUDE.md` lines 61-77: precedents #1 through #13 are present. #12 and #13 are from the same 2026-04-14 spec that added #11.
**Status:** STALE
**Suggested resolution:** Update to "new precedent #14, after #11-#13 added by 2026-04-14 spec."

---

### [L2] Finding 10: test-harness.ts ManualScheduler line number is slightly wrong

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC section 8 "Current state"
**Issue:** The spec says "ManualScheduler available in tests (packages/app/tests/integration/test-harness.ts:578)."
**Current text:** `"ManualScheduler available in tests (packages/app/tests/integration/test-harness.ts:578)"`
**Evidence:** `ManualScheduler` interface is at lines 587-599; `createManualScheduler` function starts at line 601. Line 578 is in a different section of the file.
**Status:** CONTRADICTED
**Suggested resolution:** Update to `test-harness.ts:587` (interface) or `test-harness.ts:601` (factory function), or remove the line number.

---

## Confirmed Claims (summary)

**T1 — Own codebase (verified):**
- `ORIGIN_TREE_TO_TEXT` and `ORIGIN_TEXT_TO_TREE` are `LocalTransactionOrigin` objects with `satisfies LocalTransactionOrigin` (observers.ts:69-83). Shape matches spec.
- `DEBOUNCE_MS = 50` (observers.ts:85) and `TYPING_DEFER_MS = 300` (observers.ts:94). Exact values match.
- Observer A has Path A (`applyIncrementalDiff`, diffLines + content-comparison gate) and Path B (`applyUserDelta`, DMP three-way merge + `applyByPrefixSuffix`). Logic matches spec description.
- Observer B `!transaction.local` guard at observers.ts:608. Exact code matches evidence file.
- `setupObservers` accepts optional `scheduler?: Scheduler` in `ObserverDeps`. Confirmed.
- `AGENT_WRITE_ORIGIN` is a `LocalTransactionOrigin` object with `skipStoreHooks: false` (agent-sessions.ts:44-48). Writes both XmlFragment and Y.Text atomically.
- `FILE_WATCHER_ORIGIN` has `skipStoreHooks: true` (external-change.ts:26-30). Writes both sides in a single transaction.
- `applyByPrefixSuffix` exists at `packages/core/src/utils/apply-by-prefix-suffix.ts` and is exported from core.
- `isSystemDoc()` exported from `packages/server/src/cc1-broadcast.ts:15-17`.
- `setReconciledBase` exported from `packages/server/src/persistence.ts:89`. NOT called from `external-change.ts` (FR-6 correctly identifies this as new work).
- `applyExternalChange` writes both XmlFragment and Y.Text atomically under `FILE_WATCHER_ORIGIN` (external-change.ts:60-72).

**T2 — Hocuspocus types (verified):**
- `afterLoadDocument` hook exists in Hocuspocus Extension interface (index.d.ts:470). Payload includes `document`, `documentName`, `instance`.
- `openDirectConnection(documentName)` is a public method on the Hocuspocus class (index.d.ts:407).
- `LocalTransactionOrigin` has optional `skipStoreHooks?: boolean` (index.d.ts:420).
- Persistence uses `onLoadDocument` (persistence.ts:319), confirming SA-D9's rationale that `afterLoadDocument` fires after persistence loads content.

**Coherence (verified):**
- The root-cause analysis (evidence/root-cause-multi-writer-rga-interleave.md) is logically sound: multi-client Observer A writes producing RGA interleave is a real CRDT race, not a test artifact.
- The rejected-alternatives analysis (evidence/rejected-alternatives.md) covers each alternative with specific failure mechanisms. The summary table is consistent with the per-option narratives.
- Goals G1-G8 are non-contradictory and trace to requirements FR-1 through FR-14.
- The origin-guard truth table in section 7d is internally consistent: self-origin skips prevent infinite loops, already-in-sync early-exits prevent double-writes.
- The rollout sequence (section 7e) correctly phases: server code first (behind default-off flag), then client gating, then tests, then flip.

## Unverifiable Claims

- **G1's "0% flake rate across 100 seeds"** — cannot verify without running the implementation. The claim is a testable goal, not a factual assertion.
- **G7's "<5% server CPU at 10 concurrent clients"** — performance claim that requires measurement under the new architecture.
- **SA-D12's claim about `openDirectConnection` behavior** was partially verified (the types confirm the API exists and is used), but the claim that direct document access "does not trigger broadcast" could not be verified from types alone — it requires runtime testing or reading Hocuspocus's internal broadcast implementation. The architectural analysis strongly suggests the claim is incorrect (see H3), but runtime confirmation would be definitive.
