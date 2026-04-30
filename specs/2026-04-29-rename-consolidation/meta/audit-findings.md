# Audit Findings — rename-consolidation spec

**Artifact:** `specs/2026-04-29-rename-consolidation/SPEC.md`
**Audit date:** 2026-04-29
**Total findings:** 12 (3 high, 5 medium, 4 low)

---

## High Severity

### [H] Finding 1: §9 Affected Routes table contradicts D-A11 by including `principalId` in rollback payload

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §9 "Affected routes / pages" table, line 213
**Decision-implicating:** Yes — undermines the cascade from D-A11 (LOCKED 1-way door)
**Issue:** Inside the same §9 section, line 200 explicitly states the Restore button payload is unchanged (`{docName, commitSha}`), but line 213 in the routes table specifies the payload as `POST /api/rollback { principalId }`. These two passages disagree about whether `principalId` is in the body.
**Current text:** Line 213: `Editor's Restore button | App | Click → POST /api/rollback { principalId } → principal contributor in timeline`
Line 200: `Editor UI (Restore button). TimelinePanel.tsx Restore button payload unchanged ({docName, commitSha}). The server-side amendment automatically attributes UI rollbacks to the loaded principal via getPrincipal().`
**Evidence:** D-A11 (line 346) LOCKS server-side `getPrincipal()` as the only source of principal identity and explicitly rejects body-supplied `principalId`. §16 SCOPE (line 469) reaffirms TimelinePanel.tsx payload is unchanged. This is the same trust-boundary that the spec's central pivot rests on.
**Status:** INCOHERENT
**Suggested resolution:** Replace line 213's payload with `{docName, commitSha}` (matches actual code at `TimelinePanel.tsx:540`). Drop the `principalId` token. Optionally add a note: "principal contributor recorded server-side via `getPrincipal()`".

---

### [H] Finding 2: §7 Metric 2 target line still pivots on body-supplied `principalId`

**Category:** COHERENCE
**Source:** L1
**Location:** §7 Success metrics & instrumentation, Metric 2 Target, line 149
**Decision-implicating:** Yes — undermines D-A11
**Issue:** The success metric for "UI rename attribution coverage" is keyed off `principalId in the body`, but D-A11 forbids body-supplied `principalId` and FR5 routes principal attribution through `getPrincipal()` server-side regardless of body content.
**Current text:** "Target: 100% of UI renames carry `principal-<uuid>` attribution when `principalId` is in the body."
**Evidence:** D-A11 (line 346) and FR5 (line 121) both establish that `principalId` is NEVER in the body. The condition described in this metric is unsatisfiable under the chosen design.
**Status:** INCOHERENT
**Suggested resolution:** Rewrite the target as: "100% of UI renames (no `agentId` in body) carry `principal-<uuid>` attribution when the server has a principal loaded." This matches FR5 (line 121) and the FR6 null-principal edge case (line 122).

---

### [H] Finding 3: Stale evidence file (`oq-8-rollback-symmetry.md`) recommends a payload change that D-A11 prohibits

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** Evidence file `evidence/oq-8-rollback-symmetry.md`, "Implication for the spec" section
**Decision-implicating:** Yes — the spec correctly diverges from the evidence; future readers may follow the evidence and re-introduce a body-trust pattern
**Issue:** The evidence file says: "TimelinePanel Restore button payload should include `principalId`." This recommendation predated the OQ-7 pivot (D-A11) and was not updated. The spec correctly doesn't follow this recommendation, but the evidence file remains as a future-maintenance trap.
**Current text:** Evidence file line 60-61: "TimelinePanel Restore button payload should include `principalId`."
Same file line 63: "Tests must pin: rollback with `principalId` records principal contributor"
**Evidence:** Spec D-A11 (LOCKED) explicitly rejects body-supplied `principalId` for rollback. Spec line 469 says payload unchanged. The changelog at `meta/_changelog.md` line 26 acknowledges OQ-7 was a "design pivot" that landed AFTER OQ-8.
**Status:** STALE / INCOHERENT
**Suggested resolution:** Append a note to the OQ-8 evidence file: e.g. "**Update 2026-04-29:** OQ-7 resolution (D-A11) supersedes the payload-change recommendation. The symmetry conclusion (rollback gets the same `extractActorIdentity` helper) stands; the payload change does NOT — server-side `getPrincipal()` resolves principal identity, body payload unchanged." Or at minimum, retroactively cross-link to OQ-7 / D-A11.

---

## Medium Severity

### [M] Finding 4: §10 "Decisions still open" lists OQ-7 as remaining, but OQ-7 is closed

**Category:** COHERENCE
**Source:** L1 (resolved-question integrity)
**Location:** §10 Decision log → "Decisions still open" subsection, line 352
**Decision-implicating:** No (pure correction)
**Issue:** The placeholder row says "OQ-5, OQ-7, plus any audit-introduced items" — but OQ-7 is explicitly closed (RESOLVED in D-A11) at line 366.
**Current text:** Line 352: `| (See §11 for remaining open questions OQ-5, OQ-7, plus any audit-introduced items.) | | | |`
**Evidence:** OQ-7 status at line 366: "Closed". D-A11 at line 346 references OQ-7 as resolved. The changelog at line 39 confirms OQ-7 is closed.
**Status:** STALE
**Suggested resolution:** Update line 352 to read: `(See §11 — OQ-5 remains open; all others resolved in D-A1 through D-A11.)`

---

### [M] Finding 5: D-A9's claim about offline-doc concurrency primitives misidentifies `writeTracker`

**Category:** FACTUAL
**Source:** T1 (codebase verification)
**Location:** §10 D-A9, line 344
**Decision-implicating:** No (decision intent stands; the rationale citation is wrong)
**Issue:** D-A9 says: "Concurrent edits during rewrite are handled by inherited Y.js merge for open docs and `writeTracker` for offline docs." The first half is correct (`document.transact()` in `applyManagedRenameToLoadedDocument` uses Y.js native locks). The second half misidentifies the primitive: `writeTracker` is a self-write detection map (records hashes of our own persistence writes so the file watcher skips them — see `file-watcher.ts:9-10, 85-92`). It is NOT a concurrency primitive for offline-doc rewrites. The actual mechanism that prevents concurrent rewrites is `runSerialized` (`api-extension.ts:942, 958, 1118`) — `_performManagedRename` runs serialized so only one rename executes at a time.
**Current text:** "Concurrent edits during rewrite are handled by inherited Y.js merge for open docs and `writeTracker` for offline docs — no new concurrency primitives."
**Evidence:**
  - `packages/server/src/api-extension.ts:1118` — `return runSerialized(async () => { ... })` wraps the entire `_performManagedRename` body.
  - `packages/server/src/file-watcher.ts:5-13, 85-92` — writeTracker described as content-hash self-write detection: "writeTracker records hashes of our own persistence writes. Watcher skips events matching a tracked hash (self-write detection)."
**Status:** CONTRADICTED
**Suggested resolution:** Replace the offline-doc clause with the correct primitive. Suggested text: "Concurrent edits during rewrite are handled by Y.js native locks for open docs (via `document.transact()`) and `runSerialized` for offline docs — `_performManagedRename` is wrapped in `runSerialized` so renames are globally single-threaded. `writeTracker` is unrelated; it prevents the file-watcher from re-emitting events for our own persistence writes."

---

### [M] Finding 6: Assumption A3 ("`principalId` is already known to the browser at rename time") is no longer relevant

**Category:** COHERENCE
**Source:** L1 (cascade completeness)
**Location:** §12 Assumptions, A3, line 377
**Decision-implicating:** No
**Issue:** A3 was authored before the OQ-7 pivot. After D-A11, the browser doesn't send `principalId`, so the assumption "no need for a fetch round trip" is moot. Leaving it Active misleads implementers into thinking it's a load-bearing constraint.
**Current text:** "A3 | `principalId` is already known to the browser at rename time — no need for a fetch round trip. | HIGH | Confirm by reading the principal-loading code in app. | Before finalization | Active"
**Evidence:** D-A11 LOCKED at line 346; spec line 199 explicitly says "Payload shape unchanged from today (no `principalId` field)"; §16 SCOPE line 469 says "no client work required for principal attribution." Browser principal-loading is now irrelevant to this spec.
**Status:** STALE
**Suggested resolution:** Mark A3 as `Obsolete (superseded by D-A11)` or remove it entirely. Adding a fresh assumption may be appropriate: "A3 (replacement). The server's loaded principal at `<contentDir>/.open-knowledge/principal.json` is reliably available at HTTP request time. Verification: bootstrap order in `standalone.ts:1223` (`loadedPrincipal = await loadPrincipal(contentDir)`) precedes the API extension wiring."

---

### [M] Finding 7: §14 Risks table — `principalId` spoofing risk is now obsolete; should be marked resolved

**Category:** COHERENCE
**Source:** L1 (cascade completeness)
**Location:** §14 Risks & mitigations, line 414
**Decision-implicating:** No
**Issue:** The risk row says: "`principalId` validation gap exposes spoofing (any client claims to be any principal)" with mitigation "OQ-7 — must investigate server-side principal source of truth before this lands." This risk is the entire reason D-A11 exists; it's been resolved by design, not just mitigated.
**Current text:** Line 414: `| principalId validation gap exposes spoofing (any client claims to be any principal) | L | H | OQ-7 — must investigate server-side principal source of truth before this lands. If body is unauthenticated, this spec doesn't ship the principal branch until auth is wired. | spec author |`
**Evidence:** D-A11 (line 346) LOCKED. Per the design, body never carries `principalId`, so spoofing via this vector is impossible. Risk is closed.
**Status:** STALE
**Suggested resolution:** Either delete the row or repurpose it to reflect a residual risk. E.g.: "`principal.json` corruption / load failure leaves all UI renames anonymous (FR6 invariant)" — likelihood L, impact L, mitigation: "loaded once at server boot via `loadPrincipal`; bootstrap is monitored; corruption triggers fallback to anonymous attribution per D22 invariant."

---

### [M] Finding 8: D-A5 v2 schema does not specify how recovery cleans up multiple destination paths

**Category:** COHERENCE
**Source:** L4 / L1 (evidence-synthesis fidelity, cascade completeness)
**Location:** §9 Data model — recovery journal v2 schema, line 269-280; §6 FR4 acceptance, line 120
**Decision-implicating:** No (implementation gap, not a decision contradiction)
**Issue:** v1 recovery (`recoverPendingManagedRename` at `managed-rename-journal.ts:145-201`) cleans up the single `destinationDocName` (line 174-192) — that file is removed if it's not in the snapshots set. The v2 schema replaces `destinationDocName` with `affectedDocs[]`. The spec's §6 FR4 acceptance (line 120) says recovery "removes any new destination files" (plural), but the §9 data model section (line 269-280) doesn't spell out that recovery iterates `affectedDocs[]` to clean every `to` path. Implementer might unintentionally drop the cleanup step or mis-implement it for the folder case.
**Current text:** Spec §9: "v1 journals at startup are still readable via the v1 parser; recovery routine tries v2 first, falls back to v1." (No explicit text about iterating `affectedDocs[].to` for destination cleanup.)
**Evidence:** `managed-rename-journal.ts:174-192` — current cleanup loop assumes a single `destinationDocName`. The cleanup is non-trivial and load-bearing for the "no observable partial state" guarantee.
**Status:** UNDERSPECIFIED
**Suggested resolution:** Add a sentence to the §9 data model after the v2 schema: "Recovery iterates `affectedDocs[]` and, for each entry whose `to` path is not present in the restored snapshot set, removes the destination file. This generalizes the v1 single-destination cleanup to N destinations."

---

## Low Severity

### [L] Finding 9: D-A4 cites `_performManagedRename` at lines 1104-1233; actual range is 1114-1244

**Category:** FACTUAL
**Source:** T1 (cite-checking)
**Location:** §10 D-A4, line 339
**Decision-implicating:** No
**Issue:** Off-by-10 line citation for `_performManagedRename` function boundaries.
**Current text:** "World model §6 gap 1; api-extension.ts:1104-1233."
**Evidence:** Function declaration at `api-extension.ts:1114` (`async function _performManagedRename`). Closing brace at `api-extension.ts:1244`. The world model report at line 81 also cites 1104-1233 — the report likely had the wrong numbers and the spec inherited them.
**Status:** STALE (codebase has likely shifted since the report was written)
**Suggested resolution:** Update D-A4 evidence column: `api-extension.ts:1114-1244`. Optionally also fix the world model report.

---

### [L] Finding 10: §9 cites `FileTree.tsx:687` as the rename dispatch, but actual dispatch is at lines 753 and 812

**Category:** FACTUAL
**Source:** T1 (cite-checking)
**Location:** §9 User experience / surfaces, line 199
**Decision-implicating:** No
**Issue:** "The dispatch in `FileTree.tsx:687` collapses to one endpoint." Line 687 is the `applyRenamedDocuments` helper, not the dispatch. There are TWO dispatch sites: line 753 in `handleTreeRename` (drag-rename via inline edit) and line 812 in `handleDropComplete` (drag-drop across folders). Both pick `'/api/rename-path'` for folders and `'/api/rename'` for files via `event.isFolder` / `operation.sourcePath.endsWith('/')`.
**Current text:** "The dispatch in `FileTree.tsx:687` collapses to one endpoint."
**Evidence:**
  - `packages/app/src/components/FileTree.tsx:685` — `const applyRenamedDocuments = ...` (helper, not dispatch).
  - `packages/app/src/components/FileTree.tsx:753` — `const endpoint = event.isFolder ? '/api/rename-path' : '/api/rename';` (rename dispatch).
  - `packages/app/src/components/FileTree.tsx:812` — `const endpoint = isFolder ? '/api/rename-path' : '/api/rename';` (drop-complete dispatch).
**Status:** STALE / INCOMPLETE
**Suggested resolution:** Update §9 line 199: "The two dispatches in `FileTree.tsx:753` (`handleTreeRename`) and `FileTree.tsx:812` (`handleDropComplete`) both collapse to `/api/rename-path`." This also flags to the implementer that there are TWO call sites to update, not one.

---

### [L] Finding 11: §8 Current state table says folder branch updates in-memory backlink index; both in-memory AND on-disk are updated

**Category:** FACTUAL
**Source:** T1 (cite-checking)
**Location:** §8 Current state table, line 177
**Decision-implicating:** No
**Issue:** Row 3 (`/api/rename-path` folder branch) under "Link rewrite" column says: "✗ (only updates in-memory backlink index)". But code at `api-extension.ts:4083-4088` calls `backlinkIndex.saveToDisk()` — both in-memory and on-disk caches update.
**Current text:** Line 177: `| /api/rename-path folder branch | UI folder rename via FileTree | — | ✓ | None | ✗ (only updates in-memory backlink index) | ✗ |`
**Evidence:**
  - `packages/server/src/api-extension.ts:4073-4082` — folder branch loops `backlinkIndex.renameDocument(fromDocName, toDocName, ...)` (in-memory).
  - `packages/server/src/api-extension.ts:4083-4088` — `void backlinkIndex.saveToDisk().catch(...)` (on-disk persistence).
  - The world model REPORT.md table at §2.5 (line 69) correctly notes folder branch calls `backlinkIndex.renameDocument` per affected doc.
**Status:** CONTRADICTED (minor — wording imprecision)
**Suggested resolution:** Change the cell to "✗ link text; ✓ backlink index (in-memory + on-disk)" or just "✗ (updates backlink index but not link text)".

---

### [L] Finding 12: Evidence cite "`persistence.ts:106-131`" describes the connection branch, but the function is `resolveWriterFromOrigin`, not "verifies principalId"

**Category:** FACTUAL
**Source:** T1 (cite-checking + interpretation)
**Location:** Evidence file `evidence/oq-7-principal-trust-boundary.md`, line 38
**Decision-implicating:** No (the design decision is correct; the citation interpretation is slightly imprecise)
**Issue:** Evidence file says: "On Y.Doc transactions, `resolveWriterFromOrigin` (`persistence.ts:106-131`) verifies the origin's principalId against the loaded principal: `if (loaded && loaded.id === principalId && ...)` (line 118)." This makes it sound like `resolveWriterFromOrigin` is the gatekeeper that rejects mismatched principalIds. Actually, on mismatch, `resolveWriterFromOrigin` lines 125-129 RETURN a writer with the **claimed** principalId (just using `'Local User'` as the stub display name). The real verification gate is at `standalone.ts:450-462` (`onAuthenticate` extension), which only sets `ctx.principalId` when the claim matches the loaded principal — so on mismatch, `resolveWriterFromOrigin` falls through to `SERVICE_WRITER` (line 131), not the stub.
**Current text:** Evidence line 38: "On Y.Doc transactions, `resolveWriterFromOrigin` (`persistence.ts:106-131`) verifies the origin's principalId against the loaded principal."
**Evidence:**
  - `packages/server/src/standalone.ts:450-462` — the actual verification: `if (loadedPrincipal && parsed.principalId === loadedPrincipal.id) ctx.principalId = loadedPrincipal.id; else if (loadedPrincipal) console.warn(...)` (mismatch is logged + dropped).
  - `packages/server/src/persistence.ts:118-129` — `resolveWriterFromOrigin` returns a writer with the claimed principalId regardless of match (just degrades to stub display name on miss).
**Status:** UNVERIFIABLE / IMPRECISE (the spec's broader claim that "principalId is verified through the WS auth path" stands; the specific cite is just slightly off)
**Suggested resolution:** Update evidence file line 38 to: "principalId is verified at `standalone.ts:450` (onAuthenticate extension), where mismatched claims are dropped from the connection context — `resolveWriterFromOrigin` (`persistence.ts:106-131`) consumes the verified `ctx.principalId` and returns the principal writer, falling back to `SERVICE_WRITER` (line 131) when the context lacks principalId."

---

## Confirmed Claims (summary)

The audit verified the following load-bearing claims, all CONFIRMED:

**Architectural claims (T1 codebase):**
- OK is single-principal per `standalone.ts:389` ("This closes attribution-forgery on the single-user loopback deployment") — confirmed verbatim.
- `getPrincipal()` exists as a `createApiExtension` option (`api-extension.ts:631`), threaded from `standalone.ts:324, 542`, and is already used in `buildAgentActor` at `api-extension.ts:1323`.
- `extractAgentIdentity` defaults `agentId` to `'claude-1'` and `agentName` to `'Claude'` (`api-extension.ts:1266-1268`) — supports the spec's claim that the D22 `hasAgentId` guard is load-bearing.
- `handleRename` lives at `api-extension.ts:3798`, `handleRollback` at `3013`, `handleRenamePath` at `3949`. Routes registered at `5578-5591`.
- `_performManagedRename` runs the full link-rewrite spine (lines 1114-1244) and is called only by `handleRename` (line 3887). The file branch of `handleRenamePath` (lines 4043-4052) does NOT call it — confirms FR2 / FR10 / Problem Statement 5.
- File branch of `handleRenamePath` does NOT update backlink index (only folder branch at lines 4073-4082 does) — confirms world model §2.5 / spec §1 problem #5.
- Folder branch of `handleRenamePath` calls `applyRename` directly (line 4054) without `withManagedRenameRecovery` — confirms Problem Statement 2 (folder rename has no crash safety) and FR4.
- File-watcher rename detection at `file-watcher.ts:298-307` (content-hash pairing within batch) — confirms NG1 framing.
- TimelinePanel.tsx Restore button payload `{docName, commitSha: entry.sha}` at line 540, button at lines 656-677 — confirms §16 SCOPE and FR7b.
- v1 journal schema at `managed-rename-journal.ts:13-19` includes `version: 1`, `sourceDocName`, `destinationDocName`, `createdAt`, `snapshots[]` — confirms baseline for D-A5 v2 schema.
- `withManagedRenameRecovery` semantics: write-then-clear, no try/finally, rationale matches CLAUDE.md STOP rule — confirms §8 "Key constraints".

**Coherence (lenses):**
- §1 problem statement, §6 functional requirements, §9 design, §10 decisions, §13 in-scope, §16 agent-constraints align on the central D22 supersession (D-A1) and trust boundary (D-A11) — apart from the three High findings above.
- D-A1 and D-A11 collectively form a coherent 1-way-door pair; OQ-6 → D-A8 (agent precedence) is well-grounded.
- D-A10 (rollback symmetry) cleanly extends D-A1's pattern.
- The §3 NG enumeration is consistent: NG7 (default-attribute UI to agent) and NG8 (side-effect doc carve-out) preserve D22's anonymity invariant in the failure case + the agent-side carve-out.
- §11 OQ status: 7 of 8 closed with explicit decision links; OQ-5 remains Open with a clear in-implementation resolution plan.

## Unverifiable Claims

- **Spec claim about backlink-index cache shape ("content-hashed, not path-keyed").** This is not in the spec body but in the world model report at §2.5. The world model labels it MEDIUM confidence. Did not verify against `backlink-index.ts` source — out of audit scope.
- **NFR performance numbers (5s for 100 docs / 500 rewrites).** No baseline measurement evidence. The NFR is stated as a design target; whether the lifted spine actually achieves it on warm-server hardware is empirical. Acceptable as a forward-looking target; verification is implementation-time.
- **Assumption A4 ("Folder renames of >100 docs are rare").** No data; flagged as MEDIUM confidence in spec. Standard product-judgment territory.
