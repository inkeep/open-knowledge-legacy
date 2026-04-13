# Audit Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/spec-v0-2-sidebar-push/specs/2026-04-13-v0-2-sidebar-push/SPEC.md`
**Audit date:** 2026-04-13
**Total findings:** 11 (2 High, 6 Medium, 3 Low)

---

## High Severity

### [H1] Finding: Server cannot call `hocuspocus.documents.get('__system__')` before any client connects — no bootstrap path specified

**Category:** COHERENCE / FACTUAL
**Source:** T1 (own codebase), L1 (cross-finding)
**Location:** §9 "System design" (line 125), §9 "Transport" (line 135), D8 (line 179)
**Issue:** Hocuspocus' `documents` map is populated lazily — a `Document` is only inserted into `this.documents` after `createDocument()` runs, which happens when the first client connects (`node_modules/@hocuspocus/server/src/Hocuspocus.ts:333-357`) or when the server calls `openDirectConnection()` (`Hocuspocus.ts:593-611`). Until then, `hocuspocus.documents.get('__system__')` returns `undefined`. If a DiskEvent fires before the first browser connects (e.g., a git checkout during server startup, or a warm server with zero clients), the broadcaster has no Document to call `.broadcastStateless()` on.

**Current text:** "Server broadcasts via `hocuspocus.documents.get('__system__').broadcastStateless()` (`node_modules/@hocuspocus/server/src/Document.ts:238`)" (D8, line 179).

**Evidence:** `Hocuspocus.ts:66` (`documents: Map<string, Document> = new Map()` — empty by default), `:316-357` (insertion only on connect/createDocument). `Document.ts:238-251` (broadcast iterates `this.getConnections()` — zero work if no connections, but only reachable if the Document exists).

**Status:** INCOHERENT (design gap not addressed in the spec)

**Suggested resolution:** Add an explicit bootstrap step in §9 and/or Next Actions: "On server startup, call `hocuspocus.openDirectConnection('__system__')` (or equivalent) to pre-materialize the `__system__` Document before the first DiskEvent." Also clarify behavior if zero clients are connected when a broadcast fires: `broadcastStateless` will be a no-op (no one to send to), and the next client's reconnect-fetch catches up — confirm this is acceptable (likely yes, since first-client-connect triggers initial `GET /api/documents`). Also: A5 assumes persistence skip via `docName === '__system__'` — the bootstrap call still goes through `createDocument → loadDocument`, which invokes `onLoadDocument`, so the skip must be in place before bootstrap, not just before first browser connect.

---

### [H2] Finding: 100 ms / >5 event coalescing rule does not cover slow-arrival bursts

**Category:** COHERENCE
**Source:** L3 (missing conditionality), reader-pass intuition
**Location:** §6 Functional requirements row 8 (line 70), D10 (line 181), §9 "Coalescing" (line 157)
**Issue:** The rule as written — "100 ms window; >5 events → `{kind:'resync'}` sentinel" — only triggers the sentinel when more than 5 events arrive *within a single 100 ms tumbling window*. `git checkout` of a large branch, or `rsync`-style bulk writes, can produce 200 events spaced 30-80 ms apart but always ≤5 per window. In that case, every window emits 1-5 typed events individually — the client gets 200 typed events in sequence, patches the tree 200 times, and A6 ("100ms is sufficient") silently fails.

The spec's own acceptance criterion says "`git checkout` of branch changing 200 files → ≤ ~2 broadcasts" (line 70) — but nothing in D10 enforces that outcome. `@parcel/watcher` commonly coalesces FS events at the OS level, which may make this moot on some platforms but not others (Linux inotify floods are notoriously uneven).

**Current text:** "Server coalesces bursts: 100 ms window; >5 events → `{kind:'resync'}` sentinel" (§6) and "100 ms tumbling window per channel. Bursts >5 events within a window collapse to a single `{kind: 'resync'}` sentinel" (§9 line 157).

**Evidence:** A6 itself flags this as MEDIUM confidence with verification plan "Measure during implementation against a real repo" (line 210). The acceptance criterion and the rule are not equivalent.

**Status:** INCOHERENT (acceptance criterion stronger than stated invariant)

**Suggested resolution:** Either (a) strengthen D10 to include a trailing-edge rule — e.g., "also trigger `resync` if ≥N cumulative events since last flush, regardless of per-window count" or "switch to sliding/hysteretic window after first burst" — or (b) weaken the acceptance criterion to match D10 ("200-file checkout produces ≤40 broadcasts, not ≤2"). Option (a) is better aligned with the stated goal; option (b) concedes that §9 is not load-bearing for `git checkout` UX. Add a STOP_IF clause: "If coalescing produces >10 broadcasts for a 200-file DiskEvent burst in measurement, redesign coalescer before merging."

---

## Medium Severity

### [M1] Finding: Seq-gap recovery under multiple gaps / server restart mid-burst is under-specified

**Category:** COHERENCE
**Source:** L3
**Location:** §9 "Sequence discipline" (line 153), D7 (line 178), §6 requirement rows 4 and 6, Risk row 4
**Issue:** Contract says "`seq !== lastSeq + 1` → re-fetch and advance." Two ambiguities:

1. **Advance to what?** If three broadcasts arrive with seqs `[42, 43, 45]` (one dropped), client re-fetches on `45`, `lastSeq` becomes `45`. Then `46` arrives — fine. But if `44` eventually arrives late (e.g., connection hiccup), client sees `44 !== 45+1` and re-fetches *again*. That's wasteful but correct. Worth documenting the "late messages after gap = additional re-fetch" behavior so it's not a bug in review.

2. **Server restart mid-burst.** Risk row 4 says "server starts seq=1; client treats seq regression as gap → re-fetches." But `seq=1` is not a gap from a previous `lastSeq=100` — it's a *regression*. The client code must distinguish `seq < lastSeq` (regression, probably restart) from `seq > lastSeq + 1` (drop). Either case re-fetches, but the reconnect path (D3) likely already covers restart because the WebSocket disconnects. The contract §9 paragraph only lists gap and reconnect, not explicit regression. In pathological cases (e.g., two servers alternating behind a flaky load balancer — not current deployment but possible in Electron multi-window per CC6), regression without disconnect could happen.

3. **Gap + reconnect interleaving.** If client detects a gap AND a reconnect happens before the re-fetch returns, should the re-fetch be cancelled and re-tried? Spec is silent. Benign but worth a sentence.

**Evidence:** §9 lines 150-155; §11 Q8/Q9 closures handwave "resolved by D8" without addressing multi-gap convergence.

**Status:** UNVERIFIABLE from the spec alone — implementation-detail questions that affect correctness under failure.

**Suggested resolution:** Add a paragraph to §9 "Sequence discipline" covering: (a) `seq < lastSeq` (regression) treated as gap; (b) late-arrival after gap triggers additional re-fetch (acceptable); (c) overlapping re-fetches coalesce (at most one in flight at a time). Acceptance test: "kill server mid-broadcast burst, restart, verify sidebar converges to disk state within RTT of first post-restart event."

---

### [M2] Finding: `ProviderPool.maxSize` semantic for `__system__` is ambiguous

**Category:** COHERENCE
**Source:** L3, T1
**Location:** D8 (line 179), A4 (line 208), §13 Next actions item 4 (line 221)
**Issue:** D8 says "`ProviderPool.maxSize` default 10 unchanged — `__system__` counts as one." This is ambiguous: does `__system__` occupy a slot (reducing user capacity from 10 to 9), or is it out-of-band (full 10 user slots preserved)? The current `ProviderPool` has no "pinned" concept — eviction only skips `activeDocName` (`provider-pool.ts:233-242`). The spec acknowledges a pin is needed (A4, Next action 4) but doesn't resolve the semantic of whether the pin counts toward `maxSize`.

**Current text:** "`ProviderPool.maxSize` default 10 unchanged — `__system__` counts as one" (D8).

**Evidence:** `provider-pool.ts:42-55`, `:87-88` (eviction triggers when `entries.size >= maxSize`), `:233-242` (eviction skips only active).

**Status:** INCOHERENT

**Suggested resolution:** Pick one and write it explicitly. Recommended: "`__system__` is pinned and does NOT count toward `maxSize` — user content docs retain 10 slots. Implementation: `evictLru` also skips pinned entries; `maxSize` check excludes pinned entries from the count." Add a unit test.

---

### [M3] Finding: Persistence-skip surface area may be incomplete

**Category:** FACTUAL
**Source:** T1
**Location:** §6 row 7, A5, D8, §13 next action 2, §16 SCOPE
**Issue:** A5 only mentions `onLoadDocument` / `onStoreDocument`. But `packages/server/src/persistence.ts` also registers `afterStoreDocument`, `onChange`, and connects into reconciliation (`reconciledBase`), backlink index updates (`backlinkIndex.updateFromMarkdown`), frontmatter cache (`frontmatterCache`), and agent-session write-origins. All of these must also short-circuit for `__system__` to avoid: (a) polluting the backlink index with a ghost doc, (b) calling `backlinkIndex.deleteDocument('__system__')` on the Y.Doc's eventual GC, (c) `reconciledBase` carrying an entry for `__system__`, (d) file-watcher's delete handler at `standalone.ts:322-368` (cited in CLAUDE.md) being called if something ever touches a `__system__.md` file.

The SCOPE list (§16) mentions `persistence.ts`, `file-watcher.ts`, `content-filter.ts`, `standalone.ts` — but does not mention `backlink-index.ts`, `agent-sessions.ts`, `reconciliation.ts`, or `external-change.ts`. At minimum the backlink index and reconciliation must be aware.

**Current text:** "Persistence extension's `onLoadDocument` / `onStoreDocument` hooks can be gated on `docName === '__system__'`" (A5).

**Evidence:** `packages/server/src/persistence.ts:316-397` (onLoadDocument, onStoreDocument, afterStoreDocument); `standalone.ts` various handlers reference `hocuspocus.documents.get(docName)` which will find `__system__`; `api-extension.ts:545` and `:1131` iterate `getFileIndex()` which is watcher-level (safe if `__system__` never enters the index, per Deployment table row 4). Confirmed the file-walk filter is handled, but CRDT-level hooks may not be.

**Status:** CONTRADICTED (by code) — incomplete skip list.

**Suggested resolution:** Audit all hook sites on `documentName` in `persistence.ts`, `reconciliation.ts`, `agent-sessions.ts`, `backlink-index.ts`, `external-change.ts`, and `standalone.ts`. Expand A5 to "every hook that takes `documentName` short-circuits on `__system__`." Add to §16 SCOPE: `packages/server/src/backlink-index.ts`, `packages/server/src/reconciliation.ts` (and possibly `agent-sessions.ts`). Add integration test: "start server, broadcast 10 CC1 events, verify no backlink-index entries, no reconciledBase entries, no frontmatter cache entries for `__system__`."

---

### [M4] Finding: SCOPE list omits the test file location mismatch and `document-list.test.ts` assertion

**Category:** COHERENCE
**Source:** L1
**Location:** §13 Next actions (line 220), §16 SCOPE (line 268), §13 Deployment table row 4 (line 235)
**Issue:** Next actions item 3 says the Layer-1 test goes in `packages/server/tests/integration/cc1-broadcast.test.ts`, and SCOPE (line 274) lists the same path. But no such `packages/server/tests/` directory exists in the current repo — Tier 1 integration tests live in `packages/app/tests/integration/` per CLAUDE.md ("Testing → Tier 1 integration harness" references `packages/app/tests/integration/test-harness.ts`). Also the Deployment row 4 says "Assertion in `document-list.test.ts`" — that file is `packages/server/src/document-list.test.ts` (co-located with source), not an integration harness. So the spec is mixing two different test venues and referencing a directory that doesn't exist yet.

**Evidence:** Only `packages/server/src/document-list.test.ts` exists; no `packages/server/tests/integration/` directory. `packages/app/tests/integration/test-harness.ts` is the existing Tier-1 harness.

**Status:** CONTRADICTED (by repo structure)

**Suggested resolution:** Resolve the test location: either (a) create `packages/server/tests/integration/` as a new harness (explicitly noted as new in SCOPE), or (b) place the Layer-1 test at `packages/app/tests/integration/cc1-broadcast.test.ts` (reuses the existing harness — recommended). Separately, add a specific assertion to `document-list.test.ts` for the Deployment row 4 claim, or move that assertion into the same new Layer-1 harness. Update SCOPE accordingly.

---

### [M5] Finding: `update` DiskEvent exclusion may under-serve Deployment row 4

**Category:** COHERENCE
**Source:** L1
**Location:** D9 (line 180), Risk row 1 (line 241), §13 Deployment row 4 (line 235)
**Issue:** D9 excludes `update` from broadcast. Risk row 1 says "`__system__` accidentally persisted as `__system__.md` or walked by file-watcher — mitigation: Explicit skip in persistence extension + file-watcher + ContentFilter." But this mitigation addresses creation, not contamination from an external tool that someone-who-knows names a file `__system__.md` by hand. That file would create a `create` DiskEvent for a real `.md` file named `__system__`, which enters the file index, and (per §9 broadcast logic) emits a CC1 event for `ch:'files' kind:'create' docName:'__system__'`. Clients would then try to display `__system__.md` in the sidebar — same collision as the doc name.

This is a deliberate choice (reserve `__system__` as a forbidden name) but the spec doesn't flag that user content cannot use that name. Worth an explicit constraint.

**Current text:** Risk row 1 mitigation only addresses self-creation, not user-creation of `__system__.md`.

**Status:** INCOHERENT

**Suggested resolution:** Add to D8 or Risk row 1: "`__system__` (and any future reserved channel docName) is a reserved name. `ContentFilter` must deny `__system__.md` at the index level, and `POST /api/create-page` must reject the name." This is a tiny surface but a 1-way-door naming decision — easier to lock now. Alternative: use a name guaranteed unreachable from a filename, e.g., `\x00system`, `__cc1__` + guard, or a leading slash prefix.

---

### [M6] Finding: D12 claim `handleDocumentList` is "already O(1) in-memory" — true for lookup, but iteration is O(indexSize)

**Category:** FACTUAL
**Source:** T1
**Location:** D12 (line 183), §15 "Noted → List endpoint scalability" (line 262)
**Issue:** D12 says "`handleDocumentList` already reads in-memory file index (no `readdirSync`)." True — verified at `api-extension.ts:425-426`. But it then states "already O(1) in-memory" in Future Work Noted (§15). Iterating a Map of N entries is O(N), not O(1). For a 10k-file vault, this is ~10k iterations per reconnect per client. That's still fast (microseconds) but not O(1), and if CC1 pushes `resync` on every burst, every client re-fetches the full list — which is O(N × clients).

This doesn't change the decision, but the framing "already O(1)" is wrong and the re-open trigger ("vault exceeds ~10k files") might understate the real fan-out cost under push-based resync.

**Evidence:** `api-extension.ts:436-456` is a `for` loop over all entries.

**Status:** CONTRADICTED (precision)

**Suggested resolution:** Change wording: "`handleDocumentList` reads from in-memory file index (no filesystem scan). Iteration is O(N) but JSON-serialization cost dominates; measured ~1-2 ms for 1k files." Keep D12 resolution as-is; tighten the re-open trigger to include "if `resync` rate × client count × list size starts to hurt."

---

## Low Severity

### [L1] Finding: `node_modules` path citation in D8 won't survive dependency upgrade

**Category:** FACTUAL
**Source:** T1
**Location:** D8 (line 179), §9 line 135
**Issue:** Spec cites `node_modules/@hocuspocus/server/src/Document.ts:238` — this location is pinned to a specific installed version and the `src/` directory is only present because the package ships TypeScript sources (most distributed packages strip these). On upgrade the line number will drift. This is fine as evidence-at-time-of-writing but brittle as a long-lived citation.

**Evidence:** Confirmed at `/Users/andrew/Documents/code/open-knowledge/node_modules/@hocuspocus/server/src/Document.ts:238` — `public broadcastStateless(payload: string, filter?: ...): void` is the correct signature. The API is publicly documented at https://tiptap.dev/docs/hocuspocus/server/methods.

**Status:** Minor staleness risk.

**Suggested resolution:** Leave citation; add a note "API: `Document#broadcastStateless(payload, filter?)` — Hocuspocus public API" so the citation is interpretive, not load-bearing.

---

### [L2] Finding: Citation drift — PROJECT.md line numbers mostly correct, a few off-by-one

**Category:** FACTUAL
**Source:** T5
**Location:** Multiple — header, §1, D2, D3, D6, D9, D10, D12
**Issue:** Line citations were cross-checked against `projects/v0-launch/PROJECT.md`. Most are exact; a few are within a 1-3 line tolerance:

- Spec header "V0-2 entry line 480" — exact match (header `#### V0-2: Push-based real-time sidebar updates` at 480). ✓
- "CC1 cross-cutting concern (line 991)" — exact match (`### CC1:` at 991). ✓
- D2 "PROJECT.md:922" for "first one defines" — matches line 922 exactly. ✓
- D9 cites `file-watcher.ts:33-45` — exact. ✓
- D1 cites `PROJECT.md:487` for CC1 constraint — exact. ✓
- §1 cites `packages/app/src/components/FileSidebar.tsx:144` — exact. ✓
- §1 cites `BacklinksPanel.tsx:57` — confirmed exact (`const interval = window.setInterval(...)` at 57). ✓
- §8 cites `standalone.ts:322-368` — verified the region covers the delete reconciliation path. ✓
- Intake evidence cites V0-3 at `PROJECT.md:332-346` — V0-3 header starts at 332. ✓
- Lateral link in header: V0-3 at `PROJECT.md:332`, V0-11 at `:303`, V0-4 at `:632` — all exact matches.

**Status:** CONFIRMED (with minor imprecision)

**Suggested resolution:** None — citations are within an acceptable tolerance. If tightening desired, `api-extension.ts:405-426` could be `:405-456` (covers the full iteration block), and `standalone.ts:322-368` drifts as code changes.

---

### [L3] Finding: §16 EXCLUDE list is narrow; a few plausible-to-touch paths are unmentioned

**Category:** COHERENCE
**Source:** L1
**Location:** §16 EXCLUDE (line 278)
**Issue:** EXCLUDE lists `BacklinksPanel.tsx`, sidebar UX, persistence/reconciliation (except `__system__` skip), and `packages/core` markdown. But an implementer could plausibly touch: (a) `packages/server/src/api-extension.ts` to add a `/api/cc1/status` debug endpoint (not wanted unless negotiated); (b) `packages/app/src/main.tsx` to wire `__system__` open on mount (legitimately in scope — should be ADDED to SCOPE, not excluded); (c) `packages/app/src/editor/TiptapEditor.tsx` to pipe `__system__` awareness (not wanted); (d) `docs/` (irrelevant, worth excluding).

**Status:** COHERENT but incomplete.

**Suggested resolution:** Add to SCOPE: `packages/app/src/main.tsx` (or wherever app mount lives — verify) if that's where `__system__` open happens. Add to EXCLUDE: `packages/app/src/editor/TiptapEditor.tsx`, `packages/app/src/editor/observers.ts` (unrelated), `docs/`, `packages/cli/`, `packages/core/`. STOP_IF already covers the main hazards, so this is polish.

---

## Confirmed Claims (summary)

**Factual — verified against codebase:**
- `FileSidebar.tsx:144` — 5 s setInterval exists (line 144 exact).
- `BacklinksPanel.tsx:57` — 2 s polling (window.setInterval at 57 exact).
- `DiskEvent` taxonomy at `file-watcher.ts:33-45` — exact; `create | update | delete | rename | conflict` match.
- `Document#broadcastStateless(payload, filter?): void` at Hocuspocus `Document.ts:238` — correct signature and semantics; iterates connections, calls `sendStateless`.
- `HocuspocusProvider.onStateless` callback at provider `HocuspocusProvider.ts:110` — documented; emits `stateless` event with `{payload}`.
- `handleDocumentList` reads in-memory `getFileIndex()` at `api-extension.ts:425-426` — no filesystem scan. D12 correct in substance.
- `hocuspocus.documents: Map<string, Document>` is public at `Hocuspocus.ts:66` — accessible for broadcast.
- `persistence.ts` hooks take `documentName` argument — gateable on `docName === '__system__'` (A5 premise correct).
- `ProviderPool` has LRU eviction with single-doc active-protection only — no pin today (A4 needs work).
- `reconciledBase`, `frontmatterCache`, `backlinkIndex.updateFromMarkdown` all driven by `documentName` in persistence — gateable.
- PROJECT.md line citations 480 (V0-2), 991 (CC1), 487 (CC1 constraint), 489 (fallback), 922 ("first one defines"), 332 (V0-3), 303 (V0-11), 632 (V0-4), 1038 (RH2), 38 (pattern decisions) — all exact.
- Intake context pointers evidence file consistent with SPEC.md claims.

**Coherence — spec-internal:**
- §9 invariants, §6 requirements, and D7/D8/D9/D10 decisions align with each other on the happy path.
- Non-goals (§3) track the referenced PROJECT.md guardrails (RH2) and consumer stories.
- Risks table covers each LOCKED 1-way-door decision with an owner and mitigation.
- Assumption verification plans have owners and expiries.

## Unverifiable Claims

- Performance claim "p95 sidebar update latency <500 ms post-disk-write" (§6 NFR, §7) — cannot be verified without measurement; A6 flags the adjacent coalescing assumption as needing runtime validation. Accept as target, not current state.
- "Bandwidth ≪ current polling under nominal load (1 small message per change vs. 12 list-fetches/min/client)" (§6 NFR Cost) — directionally correct; no napkin math provided for worst-case (e.g., burst scenarios where `resync` forces full list refetch across N clients).
- "V0-3 lands consuming the same CC1 primitive without contract revision" (§7 Pattern reuse metric) — forward-looking; unverifiable until V0-3 lands.
