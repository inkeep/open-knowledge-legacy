---
title: Audit findings — Batch C (history-repo + migration + writer topology + observer threading + park + reconcile)
description: Cold-read audit of D33-D42 + related FRs (FR-6, FR-7, FR-8, FR-16, FR-18, FR-19). Evidence-anchored claim verification, coherence checks, pragmatism/forward-compat review.
scope: D33-D42, FR-5, FR-6, FR-7, FR-8, FR-16, FR-18, FR-19
date: 2026-04-18
baseline_commit: 420f2b5e
artifact: specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md
evidence: specs/2026-04-18-agent-identity-attribution-foundation/evidence/history-and-sweep.md
---

# Audit findings — Batch C (history + migration + writer topology)

**Artifact:** `specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md`
**Audit date:** 2026-04-18
**Directive filter:** greenfield / no-deferred-debt / best correctness + clean codebase. Pragmatism-mode locks flagged.
**Total findings:** 9 (3 HIGH, 4 MEDIUM, 2 LOW/PRAGMATISM)

## Coverage summary

Claims verified per decision (file:line quotes below). Code under audit:
- `packages/server/src/shadow-repo.ts` (pre-D55 filename; 951 lines)
- `packages/server/src/persistence.ts` (530 lines)
- `packages/server/src/api-extension.ts` (4267 lines)
- `packages/server/src/standalone.ts` (1319 lines)
- `packages/server/src/external-change.ts` (101 lines)
- `packages/server/src/contributor-tracker.ts` (115 lines)
- `packages/server/src/shadow-branch-gc.ts` (263 lines)

Code-trace claims in D33, D35, D36, D38, D39, D40, D41, D42 match current source (file:line quotes verified). Three non-trivial gaps flagged below (H1–H3). Four medium-severity wording / enumeration concerns (M1–M4). One pragmatism flag (P1) — D39's "known tolerated smallness" does not satisfy Nick's greenfield directive on its face and should either be upgraded to a real synchronization barrier or reframed as a documented data-loss class with explicit test coverage. Two low-severity drift notes (L1–L2).

---

## High severity

### [H1] D42 (FR-5) enumeration is incomplete — three POST handlers unaccounted for

**Category:** COHERENCE (L1 / L5) + FACTUAL (T1)
**Source:** Lens L1 cross-finding consistency; Track T1 grep of `api-extension.ts` route registry.
**Location:** §10 D42; §6 FR-5.
**Issue:** D42 says the meta-test "scans route registry and asserts every POST handler calls `extractAgentIdentity` or is on an explicit allowlist." The allowlist names only GET-only handlers, `test-reset`, `local-op/*`. The sync/* family is partially covered (only `sync/resolve-conflict` is listed as needing threading); `sync/trigger`, `sync/set-enabled`, `sync/abort-merge` are POSTs that are NEITHER threaded NOR in the allowlist.
**Evidence (file:line):**
- `api-extension.ts:4185-4230` — route registry enumerates 12 POST-mutating `/api/sync/*` and `/api/local-op/*` endpoints plus the content-mutating routes.
- `api-extension.ts:4012` `async function handleSyncTrigger` → `req.method !== 'POST'`.
- `api-extension.ts:4040` `async function handleSyncSetEnabled` → `req.method !== 'POST'`.
- `api-extension.ts:4165` `async function handleSyncAbortMerge` → `req.method !== 'POST'`.
- `api-extension.ts:4079` `async function handleSyncResolveConflict` → `req.method !== 'POST'` (the only sync/* in D42).
**Status:** INCOHERENT.
**Suggested resolution:** Either (a) add `sync/trigger`, `sync/set-enabled`, `sync/abort-merge` to D42's allowlist with rationale "git-sync state mutation — attributes to `openknowledge-service` classified writer at commit time, no per-caller identity threading needed because the action has no per-agent semantics"; or (b) thread identity (they can be triggered by an agent/user and that actor IS identifiable). Choose one and say so explicitly in D42. Without the explicit allowlist entry, the meta-test will fail on day one.

### [H2] D35 legacy-ref sweep regex `$NF == "server"` misses `human-server` variant actually written today

**Category:** FACTUAL (T1) + COHERENCE (L3 missing conditionality)
**Source:** Track T1 grep of code for `refs/wip/.../server` write paths.
**Location:** `evidence/history-and-sweep.md` Q26 + §10 D35.
**Issue:** D35 delete-sweep uses `awk -F/ '$NF == "server"'`, matching only refs where the writer-id is literally `server`. But today's code writes to **two** legacy-style server refs:
  - `refs/wip/<branch>/server` from `persistence.ts:169-170` (default L2 writer) and `api-extension.ts:1866` (save-version default). Matches the sweep.
  - `refs/wip/<branch>/human-server` from `standalone.ts:1044` (parkBranch hardcodes sessionId='server') — ref is built at `shadow-repo.ts:722` `const ref = \`refs/wip/${branch}/human-${sessionId}\``. Does NOT match the sweep (final segment is `human-server`, not `server`).
**Evidence (file:line):**
- `persistence.ts:169-170` — `const defaultWriter: WriterIdentity = { id: 'server', ... }`.
- `persistence.ts:191` — `commitWip(shadow, defaultWriter, contentRoot, message, branch)` — every L2 drain commits to `refs/wip/<branch>/server`.
- `api-extension.ts:1866` — `{ id: 'server', name: 'openknowledge-server', email: 'noreply@openknowledge.local' }` — save-version default writer.
- `standalone.ts:1044` — `parkBranch(shadowRef.current, currentBranch, 'server', docs)`.
- `shadow-repo.ts:722` — `const ref = \`refs/wip/${branch}/human-${sessionId}\`;`
- `standalone.test.ts:200` — asserts `refs/wip/main/server` exists post-auto-save; will break post-D35.
**Status:** INCOHERENT (sweep predicate is narrower than the legacy-ref surface it claims to remove).
**Suggested resolution:** Broaden sweep. Two options: (a) extend predicate to `awk -F/ '$NF == "server" || $NF == "human-server"'` — explicit and evidence-matched; (b) delete ALL refs whose writer-id does not match the post-D34 schema (`agent-<connId>` | `principal-<UUID>` | known classified) — more robust, forward-compatible when migration lands after additional writer classes accumulate. Option (b) composes with D34 and the existing `parseWriterId` classification helper already used by `shadow-branch-gc.ts:68`. Preferred under greenfield directive. Update Q26 + D35 to match.

### [H3] D40/D19 parkBranch refactor is larger than "one-line reorder" — D19 is code-silent on signature change

**Category:** COHERENCE (L5 summary coherence) + FACTUAL (T1)
**Source:** Lens L5 — D19/D39/D40 together imply a refactor the decision log doesn't cost out.
**Location:** §10 D19, D39, D40; `shadow-repo.ts:712-797` and `shadow-repo.ts:803-832`.
**Issue:** D39 reads "One-line reorder at `standalone.ts:1058`." D40 reconciles D19 (per-session park) with D8 (writer=identity). But current `parkBranch` and `readParkedState` bundle all docs into ONE commit per call, take a single `sessionId` parameter, and hardcode `refs/wip/<branch>/human-<sessionId>`. Under D19+D34+D40 the required refactor is: (a) caller in `standalone.ts:1032-1056` becomes a loop over active sessions; (b) `parkBranch` ref drops `human-` prefix (D34); (c) writer identity threaded as `WriterIdentity` (not the opaque `sessionId: string`); (d) restore loop in `standalone.ts:1160-1167` walks per-session refs on old branch and reconciles each. This is a non-trivial refactor and its cost is understated across D19/D39/D40.
**Evidence (file:line):**
- `shadow-repo.ts:712-716` — `parkBranch(shadow, branch, sessionId: string, documents: ParkableDoc[])` signature takes scalar `sessionId`, loops documents.
- `shadow-repo.ts:722` — ref template hardcodes `human-${sessionId}` (D34 says drop `human-`).
- `shadow-repo.ts:775-776` — author hardcoded `openknowledge`/`noreply@openknowledge.local` (NOT session identity; D40 author-is-session-identity contract requires threading `WriterIdentity`).
- `shadow-repo.ts:810` — `readParkedState` ref template hardcodes `human-${sessionId}`.
- `standalone.ts:1044` — single call site passes `'server'` hardcoded.
- `standalone.ts:1160-1167` — restore loop iterates docs, not sessions.
**Status:** INCOHERENT.
**Suggested resolution:** D19 needs an Implications column entry that enumerates the signature changes (parkBranch/readParkedState take `WriterIdentity`; standalone becomes a session-loop). D39 needs to clarify it is "one-line reorder PLUS full parkBranch refactor per D19/D40." D40 is the natural owner of the author-identity-threading contract — add an explicit point that `parkBranch` author env vars (`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL` at `shadow-repo.ts:775-776`) become writer-driven like `commitWip` does at `shadow-repo.ts:186-189`. Without this tightening a reader implementing against D39-as-written will produce a half-fix.

---

## Medium severity

### [M1] NFR-6 offers two migration options; D35 picks one — leave NFR-6 consistent

**Category:** COHERENCE (L1)
**Source:** Lens L1 cross-finding.
**Location:** §6 NFR-6; §10 D35; §10 D52.
**Issue:** NFR-6 says legacy `refs/wip/<branch>/server` "must be rewritten as `refs/wip/<branch>/openknowledge-service` **or** migrated-to-nothing." D35 picks "migrated-to-nothing" (delete). D52 says `openknowledge-service` has no current caller and is reserved for future. So the rename-to-`openknowledge-service` option NFR-6 mentions is inconsistent with D52's "narrow fallback" posture.
**Status:** INCOHERENT.
**Suggested resolution:** Tighten NFR-6 to a single choice matching D35: "must be deleted on first-run post-upgrade per D35. No archive, no rename."

### [M2] `pg.commit` line range drift between evidence and code

**Category:** FACTUAL (T1) — minor numeric drift
**Source:** Track T1.
**Location:** `evidence/history-and-sweep.md` Q23.
**Issue:** Evidence says "Main-git save-version at `api-extension.ts:1878-1893`." Actual span is 1877-1897 (the `try { versionTag = await withParentLock(async () => { ... } catch (e) { log.warn ... })` block). The `pg.commit()` call itself is at line 1889.
**Evidence (file:line):**
- `api-extension.ts:1877` — `if (projectDir) {`
- `api-extension.ts:1889` — `await pg.commit(autoMsg, { '--allow-empty': null });`
- `api-extension.ts:1897` — end of the outer if.
**Status:** STALE (off-by-4 on upper bound; lower bound off by 1).
**Suggested resolution:** Update Q23 to `api-extension.ts:1877-1897` (outer `if (projectDir)` block) with `pg.commit()` at 1889 called out as the porcelain hook that honors `commit.gpgSign` and fires hooks.

### [M3] D38 cites `history-repo.ts:133` in post-D55 naming; evidence file cites `shadow-repo.ts:133` pre-D55

**Category:** COHERENCE (L1 cross-finding) / forward-compat
**Source:** Lens L1.
**Location:** §10 D38.
**Issue:** D38 says "Matches per-writer tmp-index isolation (`history-repo.ts:133`)." The filename doesn't exist yet — D55 is the rename decision, and the actual current file is `shadow-repo.ts`. Evidence Q31 (which D38 points at) uses the old name `shadow-repo.ts:133`. Decision log is ahead of evidence on naming. Fine as an aspirational forward-compat note, but readers following evidence links will hit mismatched filenames.
**Evidence (file:line):** `shadow-repo.ts:133` → `const tmpIndex = resolve(shadow.gitDir, \`index-wip-${writer.id}\`);`. Claim verified; only the filename is drifted.
**Status:** LOW / forward-compat consistency.
**Suggested resolution:** In D38's Implications column, add a breadcrumb `(file currently named shadow-repo.ts → history-repo.ts per D55)`. Or update evidence Q31 to use the post-D55 name with a "(formerly shadow-repo.ts)" aside. Either path makes both readable across the rename.

### [M4] D41 says "extends `recordContributor` signature or adds `recordFileSystemChange(docName)`" — indecisive; pick one

**Category:** COHERENCE (L6 stance consistency)
**Source:** Lens L6.
**Location:** §10 D41.
**Issue:** The Implications column offers two implementation shapes without choosing. Under greenfield directive, a spec line that says "A or B" produces a handoff ambiguity at implementation time. The right shape is decidable now with the facts we have: `recordContributor(docName, agentId, displayName, colorSeed)` at `contributor-tracker.ts:26-38` is already the structural entry point and `file-system` can pass as a valid writer-id. The alternative — a separate `recordFileSystemChange(docName)` — duplicates the accumulator machinery for one extra writer-id.
**Evidence (file:line):** `contributor-tracker.ts:26-38` — signature accepts arbitrary `agentId`; classified writer IDs work unchanged. D7/D8/D41 already treat classified writers as just another writer-id value.
**Status:** INCOHERENT (decision deferred into implications).
**Suggested resolution:** Lock: "`applyExternalChange` calls `recordContributor(docName, 'file-system', 'File System', 'file-system')`. No new function." The signature is already sufficient.

---

## Pragmatism flag

### [P1] D39 "known tolerated smallness: microsecond-late transact between two sessions' captures" does not satisfy greenfield + best-correctness posture

**Category:** PRAGMATISM
**Source:** User directive filter.
**Location:** §10 D39 + `evidence/history-and-sweep.md` Q33.
**Issue:** D39's rationale acknowledges a bug and frames it as "known tolerated smallness." The semantic: under the proposed mutex-before-park-loop, session A's `serializeDoc(docName)` fires at T0; a session-B transact lands at T0.5; session B's `serializeDoc` fires at T1 and captures the post-T0.5 state (which includes content session A technically authored between the two serialize points). The mutex blocks L1 flush but does NOT block Y.Doc transact landing. Under "best correctness / no-deferred-debt," this is either a real invariant violation (per-session park should isolate per-session state) or a documented non-invariant (parks are "doc state at session-park-time," not "session-authored-content at park-time"). The spec currently does neither.
**Why this matters under the directive:** Nick's directive names "best correctness" as the filter. A microsecond-scale race in a park path IS observable under stress (fuzzer, multi-client), IS recoverable (reconcile re-runs), but IS a real correctness gap the spec doesn't gate on a test.
**Suggested resolution:** Two paths, both greenfield-consistent:
  (a) Upgrade the mutex to a **synchronous session-scoped Y.Doc transact wrapper** — for each session's park, wrap `serializeDoc` in `doc.transact(fn, PARK_SNAPSHOT_ORIGIN)` so Y.js's internal lock serializes the capture against any concurrent writes. One-pass capture + commit inside the same lock. No "microsecond-late" window.
  (b) Explicitly reclassify the invariant: "park captures Y.Doc state at park-call time, not session-authored-only content. Cross-session authorship within a single park burst is a known non-invariant and is fuzzer-covered by <new-op>." Add the fuzzer op, add a specific test that asserts this outcome, move the evidence from "tolerated loss" to "tested non-invariant."
Either path is a clean cut; the current phrasing is pragmatism dressed as acknowledgment.

---

## Low severity

### [L1] `standalone.test.ts:200` asserts `refs/wip/main/server` — will break post-D35

**Category:** FACTUAL (T1) — test dependency
**Source:** Track T1.
**Location:** `packages/server/src/standalone.test.ts:200`.
**Issue:** The test asserts `refs/wip/main/server` exists. Under D35, that ref is deleted on first-run and the underlying write path is refactored to per-session classified writers. Test will fail post-spec.
**Status:** STALE under implementation.
**Suggested resolution:** Add a note in D42 / FR-5's Implications that `standalone.test.ts:200` (and any parallel test asserting the legacy shape) must be updated as part of the sweep. Low priority — will be caught at implementation, but cheap to pre-document.

### [L2] D40 + D53 subject format: "park: <old> -> <new>" uses ASCII `->`; §5 P4 journey uses unicode `→`; §10 D19 uses `→`

**Category:** COHERENCE (L1)
**Source:** Lens L1 inline formatting consistency.
**Location:** §5 P4 journey line 90, §10 D19, §10 D40, §10 D53.
**Issue:** Subject-prefix target format is stated as both `park: <old-branch> -> <new-branch>` (ASCII arrow, D40/D53) and `park: <old-branch> → <new-branch>` (unicode arrow, D19 + §5). Git commit subjects should be ASCII for grep/CI portability.
**Status:** INCOHERENT.
**Suggested resolution:** Standardize on ASCII `->` in all decisions + user journeys + fixture snapshots. D40/D53 are the authoritative owners.

---

## Confirmed claims (summary)

- **D33 split** (commit-tree plumbing vs pg.commit porcelain): VERIFIED. `shadow-repo.ts:179` uses `commit-tree` (no signing/hooks); `api-extension.ts:1889` uses `pg.commit()` (simpleGit porcelain, honors config). Evidence Q23 line-range slightly off (M2 above).
- **D34 drop human-prefix** (ref schema = `{agent-<connId>|<principalId>|<classified>}`): evidence-driven and internally consistent across §8.6 table and D34 rationale. Code currently still writes `human-<sessionId>` at `shadow-repo.ts:722,810`, which D19/D40 explicitly touch.
- **D36 sanitizeGitIdentity**: extends existing CRLF strip. `api-extension.ts:1025,1029` confirm current strip; `AGENT_NAME_MAX_LEN = 128` at `api-extension.ts:1008` matches D36's slice(128). Coherent.
- **D37 effect-diff error handling**: structured event + metric + dev-mode throw. Consistent with AGENTS.md §Logging conventions (structured JSON for counted events).
- **D38 per-writer partition**: tmp-index isolation at `shadow-repo.ts:133` confirmed. `contributor-tracker.ts:57-71` currently has bulk `restoreContributors`; D38's `restoreContributorEntry(writerId, entry)` is a new additive helper. Shape matches.
- **D39 park mutex ordering**: `standalone.ts:1028-1056` park logic precedes `standalone.ts:1058 setBatchInProgress(true)`. Claim "currently after" is verified. Fix is the proposed reorder (+ see P1 for correctness caveat and H3 for refactor-scope caveat).
- **D41 applyExternalChange no contributor**: `external-change.ts:54-83` does NOT call `recordContributor`. Bug verified. Fix is recordContributor on `file-system` writer-id (see M4 for signature decisiveness).
- **D42 enumeration** (most of it): the 9 enumerated handlers exist at the cited lines. Gap flagged in H1.
- **FR-16 origin threading**: `persistence.ts:405 onStoreDocument` destructures only `{document, documentName}` — D31/FR-16 claim verified.
- **`handleApplyLinks`**: confirmed absent today (Q101 ACTIVE). D42's "future" wording is appropriate.
- **`closeAllForAgent`**: no production callers (`agent-sessions.ts:242` def, `agent-sessions.test.ts` only consumer). Problem-statement claim holds.

---

## Unverifiable claims

- **Hocuspocus `MessageReceiver.ts:188-220`** cited in D32 (batch B) — not checked here as out-of-scope for batch C; flag for batch B audit.
- **Expected behavior of concurrent transacts landing during park** (D39 Q33 evidence) — assertion is plausible from Yjs semantics (single-threaded event loop + transact serialization) but not empirically validated in-repo. Recommend a test asserting the claimed "Yjs internal lock serializes transacts; they can land during park but won't flush to L1 (blocked by batch gate)" — would convert P1 from pragmatism to proof.

---

## Meta-note: documentation strategy (audit-adjacent)

D38/D55/D56 interact: once `shadow-repo.ts` → `history-repo.ts` (D55) and `.open-knowledge/` unification (D56) land, every file:line quote in this audit shifts. Recommend the implementation PR batch (a) D33-D42 code changes, (b) D55 rename, (c) D56 path unification be sequenced so line numbers can be locked against a single post-D55 baseline in a follow-up meta-file rather than being corrected after each re-landing.
