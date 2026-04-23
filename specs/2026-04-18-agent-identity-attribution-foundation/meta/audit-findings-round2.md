---
title: Audit findings — round 2 (post-correction)
baseline_commit: a8b688ce
date: 2026-04-18
scope: post-correction audit — verify corrections from round 1, catch new issues
prior_audits: [audit-findings-batch-a-um.md, audit-findings-batch-b-lifecycle.md, audit-findings-batch-c-history.md, audit-findings-batch-d-product.md]
totals: 3 HIGH, 5 MEDIUM, 1 PRAGMATISM, 3 LOW
---

# Audit Findings — Round 2 (post-correction)

Verification of the 10 specific correction targets plus internal-consistency sweep. Directive filter: greenfield / no-deferred-debt / best correctness. Evidence-anchored against code at worktree HEAD.

**Prior corrections that VERIFIED CLEANLY (no further action):**
- D26 rewrite: Hocuspocus.ts:551 (`shouldUnloadDocument`) + :580 (`document.destroy()`) + UndoManager.js:269-271 (`doc.on('destroy', () => this.destroy())`) all exactly match. DirectConnection gate is real; `dc.disconnect()` is the load-bearing primitive. CONFIRMED.
- D32 context threading: Hocuspocus.ts:593-610 supports `openDirectConnection(documentName, context)`. DirectConnection.ts:21-24,29-44,46-64 hardcode `{source:'local', context:this.context}` for both `.transact()` and `.disconnect()` paths — context threading IS load-bearing. CONFIRMED.
- D42 expansion: handleSyncTrigger (4012), handleSyncSetEnabled (4040), handleSyncAbortMerge (4165) are POST; handleSyncConflicts (4068), handleSyncConflictContent (4122) are GET. Route registry at 4185-4230 matches. CONFIRMED.
- D43 enum extension: `AgentFocusEntry.writeKind` at `packages/core/src/types/awareness.ts:38` is `'write' | 'edit' | null`. Only 2 runtime write-sites (api-extension.ts:1195, 1737) — additive widening is safe. CONFIRMED.
- D25 `ignoreRemoteMapChanges`: `node_modules/yjs/src/utils/UndoManager.js:170` shows default `false`; option is real. CONFIRMED.
- D39 PARK_SNAPSHOT_ORIGIN mechanics: `standalone.ts:1028-1058` park loop precedes `setBatchInProgress(true)` as D39 claims; wrap-in-transact sync-capture semantic is sound for the synchronous read phase (caveat below, M1). CONFIRMED with one qualification.
- D51/D56 subsumption: D51 text explicitly says "D56's directory-wide gitignore entry (`.open-knowledge/`) covers `principal.json` as a subpath" — straightforward subpath match. CONFIRMED.

---

## High Severity

### [H] Finding 1: §7 "code-verified, brief" still cites post-rename fictional paths — batch-D H1 NOT applied

**Category:** COHERENCE
**Source:** L1 cross-finding, L4 evidence-synthesis fidelity
**Location:** SPEC §7 lines 154, 157
**Issue:** Batch-D H1 flagged that §7 cites `history-repo.ts:126-203` and `history-repo.ts:847-951` while the actual file on disk is `packages/server/src/shadow-repo.ts`. The changelog (2026-04-18 Audit phase) enumerates 13 applied corrections; this one is NOT in the list. Verification: `ls packages/server/src/ | grep history` returns nothing; `shadow-repo.ts` is still the real file. §7's framing is "code-verified, brief" — a cold reader trying to open those paths hits `No such file`.
**Current text (SPEC §7 line 154):**
> `commitWip(history, writer, contentRoot, message, branch)` at `history-repo.ts:126-203` — already takes `WriterIdentity`, but auto-save hardcodes `defaultWriter = {id:'server', ...}`.
**Evidence:** `ls packages/server/src/ | grep -E "(shadow|history)"` → `shadow-*.ts` only. D55 enumerates the rename as a future action. §16 SCOPE correctly lists post-D55 names as targets (OK — aspirational), but §7 must cite current code.
**Status:** INCOHERENT (batch-D H1 flagged but not applied; changelog does not mention this line among corrections).
**Action: CORRECT.** Change §7 line 154 to `shadow-repo.ts:126-203` and line 157 to `shadow-repo.ts:847-951`, OR add an explicit footnote `(current file; renamed to history-repo.ts under D55)`. Prefer the former — §7 is the code-anchoring section and should cite present-day paths.

---

### [H] Finding 2: D35 "classification-based sweep via `parseWriterId`" relies on a `parseWriterId` that does not yet classify the new taxonomy

**Category:** FACTUAL + COHERENCE
**Source:** T1 own codebase
**Location:** SPEC §10 D35 (line 436)
**Issue:** D35 claims the sweep is "classification-based via `parseWriterId`" and will match all legacy patterns "that don't match the new `{agent-*, principal-*, classified}` taxonomy." The current `parseWriterId` at `packages/core/src/shadow-repo-layout.ts:281-291` only recognizes `agent-[^/]+`, `human-[^/]+`, `upstream`, `server`. The WRITER_ID_RE regex at line 51 is:
```
/^(human-[^/]+|agent-[^/]+|upstream|server)$/
```
`parseWriterId('principal-abc')` returns `classification: 'unknown'`. `parseWriterId('file-system')` returns `classification: 'unknown'`. `parseWriterId('git-upstream')` returns `classification: 'unknown'`. `parseWriterId('openknowledge-service')` returns `classification: 'unknown'`. In current form, classification-based sweep would classify EVERY new-taxonomy writer as `unknown` and DELETE all their refs on first-run — catastrophic.
**Current text (D35):**
> Sweep is **classification-based via `parseWriterId`**, not a simple `$NF == "server"` regex. Matches all legacy writer patterns ... and any other pre-spec writer IDs that don't match the new `{agent-*, principal-*, classified}` taxonomy.
**Evidence:** `packages/core/src/shadow-repo-layout.ts:27` (`WriterClassification = 'agent' | 'human' | 'upstream' | 'server' | 'unknown'`) + `:51` (regex) + `:281-291` (function body).
**Status:** INCOHERENT (decision depends on a function shape that doesn't exist; silent implementation → catastrophic data deletion).
**Action: CORRECT.** Add an implicit-prerequisite acknowledgment to D35 (or a new decision/FR) that `parseWriterId` itself MUST be extended to recognize the new taxonomy (`principal-<uuid>`, `file-system`, `git-upstream`, `git-branch-switch`, `openknowledge-service`) BEFORE the sweep runs. Suggested wording: "**Prerequisite:** `parseWriterId` in `packages/core/src/history-repo-layout.ts` (per D55 rename) is extended to classify the new taxonomy — `principal-<uuid>` → `principal`, `file-system`/`git-upstream`/`git-branch-switch`/`openknowledge-service` → `classified`. The sweep deletes refs where `classification === 'unknown' || classification === 'server' || id === 'human-server'`. Without this extension, every new-taxonomy ref would be classified `unknown` and erased on first-run." Also: `shadow-branch-gc.ts:68` currently uses `parseWriterId(writerId).classification !== 'unknown'` as a preservation gate — extending `parseWriterId` is also load-bearing for GC correctness under the new taxonomy.

---

### [H] Finding 3: D57 six-site enumeration is incomplete — observers.test.ts and awareness type not covered

**Category:** FACTUAL
**Source:** T1 own codebase
**Location:** SPEC §10 D57 (line 457)
**Issue:** D57 says the rename covers 6 sites: `api-extension.ts:1089,1174,1707; TiptapEditor.tsx:236; agent-flash-source.ts:67; test-harness.ts:538`. Grep across the worktree for `getMap.*'activity'` returns SEVEN sites, including `packages/app/src/editor/observers.test.ts:338`. Additional non-write references that also need rename: `packages/core/src/types/awareness.ts:43` (type doc comment: `/** Entry in Y.Map('activity') side-channel for agent write attribution. */`), `packages/app/src/server/agent-sim.ts:6` (JSDoc comment), `agent-sim.ts:342` (log output text `Activity: Y.Map('activity') updated per write for flash plugins`), and the `ActivityEntry` type name itself at `awareness.ts:44`. If D57's rationale is "eliminate three-way name conflation," these adjacent referents are in scope. Either the grep was narrowed or the inventory is incomplete.
**Current text (D57):**
> The Y.Map currently keyed `'activity'` in code (api-extension.ts:1089,1174,1707; TiptapEditor.tsx:236; agent-flash-source.ts:67; test-harness.ts:538) is renamed to `'agent-flash'`.
**Evidence:** `grep -rn "getMap.*'activity'" packages/` → 7 write sites including `observers.test.ts:338`. `grep -rn "Y\\.Map.'activity'" packages/` → doc comments at `awareness.ts:43`, `agent-sim.ts:6`, and log output at `agent-sim.ts:342`.
**Status:** CONTRADICTED (6 vs 7 write sites).
**Action: CORRECT.** Update D57 to 7 write sites (add `observers.test.ts:338`) and list the adjacent comment/type-name referents that go with the rename: `ActivityEntry` type → rename to `AgentFlashEntry` for symmetry, plus update docstrings at `awareness.ts:43`, `agent-sim.ts:6`, `agent-sim.ts:342`. A cleaner final form: "7 Y.Map write sites (api-extension.ts:1089,1174,1707; TiptapEditor.tsx:236; agent-flash-source.ts:67; test-harness.ts:538; observers.test.ts:338) + type rename `ActivityEntry → AgentFlashEntry` at awareness.ts:44 + matching comment/log updates at awareness.ts:43, agent-sim.ts:6,342."

---

## Medium Severity

### [M] Finding 4: D39 transact-wrap elides sync-vs-async distinction; I/O in the transact is semantically redundant

**Category:** COHERENCE + FACTUAL
**Source:** L3 missing conditionality
**Location:** SPEC §10 D39 (line 440)
**Issue:** D39 says "wrap the per-session park loop inside `doc.transact(fn, PARK_SNAPSHOT_ORIGIN)` so Y.js's internal transaction queue serializes the capture atomically vs concurrent transacts." Y.js's transaction queue serializes SYNCHRONOUS callbacks via `_transactionCleanups` re-entry guarding, but `doc.transact(asyncFn)` does NOT hold the transaction lock across `await` points — the lock releases when the synchronous portion of the callback returns. In `standalone.ts:1032-1056`, the park loop is synchronous for `serializeDoc` (line 1037) but `await parkBranch(...)` at line 1044 is async (git I/O). A single outer `doc.transact` would only serialize the synchronous `serializeDoc` reads; the subsequent `await parkBranch` runs outside transaction lock. The ACTUAL correct shape is: wrap only the synchronous per-session markdown-capture in `doc.transact`, collect all `docs: ParkableDoc[]` atomically, THEN exit the transact and run git I/O. D39's one-line phrasing doesn't distinguish these phases and a naive implementer wrapping the entire async loop in `doc.transact` would get no serialization benefit (and potentially confuse observers that receive an outer origin for effectively-no-op transacts).
**Current text (D39):**
> wrap the per-session park loop inside `doc.transact(fn, PARK_SNAPSHOT_ORIGIN)` so Y.js's internal transaction queue serializes the capture atomically vs concurrent transacts.
**Evidence:** `node_modules/yjs/src/utils/Doc.js:transact` is synchronous; `standalone.ts:1044` is `await parkBranch(...)`. Y.js transaction locking is a synchronous re-entry guard, not an async mutex.
**Status:** INCOHERENT (spec text conflates sync and async phases).
**Action: CORRECT.** Tighten D39's wording: "Wrap the synchronous per-session `serializeDoc` capture phase in a single outer `doc.transact(fn, PARK_SNAPSHOT_ORIGIN)` to serialize markdown capture atomically against concurrent in-process transacts. Git I/O (`parkBranch`) runs AFTER the transact closes — the snapshots already collected inside the transact are immutable. This preserves the correctness property (all sessions' captures taken from the same sync-point) without holding the Y.js lock across async git operations."

---

### [M] Finding 5: D25's `flashMap` parameter name is introduced but spec text still uses legacy `activityMap` shorthand in multiple places

**Category:** COHERENCE (L1)
**Source:** L1, L6
**Location:** SPEC §10 D25 (line 426); §6 FR-3 (line 115); §8.2 and §8.4 surrounding prose; §9 diagram (line 362).
**Issue:** D25 introduces `flashMap` ("post-D57 rename — currently `Y.Map('activity')` in code") in the LOCKED cell. But FR-3 line 115 still says "`[Y.Text('source'), Y.Map('metadata'), Y.Map('activity')]` (per D25)". The §9 system-design diagram at lines 362-365 refers to "Per-Session UM (Y.UndoManager)" without specifying scope. For a reader following the SPEC linearly, the naming is inconsistent — D25 uses `flashMap`, FR-3 uses `Y.Map('activity')`, and no forward-compat breadcrumb ties them. Also D57's point (iii) mentions "D25 UM scope uses `flashMap` name" — but FR-3 (the requirement, not the decision) still has the old name. The requirement is what implementers read first.
**Current text (FR-3 line 115):**
> Each agent session has a dedicated `Y.UndoManager` scoped across `[Y.Text('source'), Y.Map('metadata'), Y.Map('activity')]` (per D25)
**Evidence:** D25 line 426 uses `flashMap`; D57 line 457 ties them ("`flashMap` is `Y.Map('agent-flash')` (post-D57 rename — currently `Y.Map('activity')` in code)"); FR-3 line 115 uses `Y.Map('activity')` without the forward-compat note.
**Status:** INCOHERENT (D25 and FR-3 use different names for the same Y-type without reconciliation at the requirement level).
**Action: CORRECT.** Update FR-3 to match the post-D57 naming, with a breadcrumb: `[Y.Text('source'), Y.Map('metadata'), Y.Map('agent-flash')]` (post-D57 rename from `Y.Map('activity')`, per D25 + D57). Alternatively, pick one name uniformly throughout SPEC.md — the current half-migrated state is the worst of both worlds.

---

### [M] Finding 6: D13 history-body writer shape inconsistent with D34 ref-naming drop

**Category:** COHERENCE
**Source:** L1 cross-finding
**Location:** SPEC §10 D13 (line 414) vs D34 (line 435)
**Issue:** D13 says "`Author = agent_display (session short-id)` for agent sessions; `Author = principal_display` for human sessions; classified for non-attributable." D34 (line 435) says "Ref naming: drop `human-` prefix. Schema is `refs/wip/<branch>/{agent-<connId>|<principalId>|<classified>}` where `principalId` = `principal-<UUID>`." D13's language "human sessions" vs D34's "principal" wording is inconsistent — a reader can ask: is "human session" the thing with `refs/wip/<branch>/principal-<UUID>`? D13 predates D34 and was not retrofitted. If the principal drives ref naming and commit author, the taxonomy should be uniform: `agent session` (author: agent display) vs `principal` (author: principal display). No "human session" as a third concept.
**Current text (D13):**
> History repo: `Author = agent_display (session short-id)` for agent sessions; `Author = principal_display` for human sessions; classified for non-attributable.
**Evidence:** D34 at line 435; D50 at line 451 ("Human browser principal + tab-session hoisting...uses `connection.context.principalId` to resolve human writes to `refs/wip/<branch>/<principalId>`") — two conflicting labels for the same data path.
**Status:** INCOHERENT (terminology drift between D13 and D34/D50).
**Action: CORRECT.** Retrofit D13 to use D34/D50 terminology: "`Author = principal_display` for principal-owned writes (human direct edits)." Drop "human sessions" from D13 — the session concept lives only for agents; principals do not have per-session commits under D50 (all tabs share one principal ref).

---

### [M] Finding 7: NFR-6 still offers two migration options; D35 picks delete — batch-C M1 flagged but NOT in changelog applied list

**Category:** COHERENCE
**Source:** L1 (cross-finding between NFR-6 and D35)
**Location:** SPEC §6 NFR-6 (line 140); SPEC §10 D35 (line 436)
**Issue:** NFR-6 still reads "legacy ref must be rewritten as `refs/wip/<branch>/openknowledge-service` or migrated-to-nothing on first run post-upgrade." D35 locks the `migrated-to-nothing` choice. D52 reserves `openknowledge-service` as narrow fallback only. Batch-C M1 flagged this exact inconsistency — the changelog applied corrections list does NOT include NFR-6 tightening. Cold reader sees "or" and does not know which branch is authoritative; implementer picks the wrong path.
**Current text (NFR-6):**
> however, history refs' `refs/wip/<branch>/server` legacy ref must be rewritten as `refs/wip/<branch>/openknowledge-service` or migrated-to-nothing on first run post-upgrade.
**Evidence:** batch-C M1 flagged this; changelog (line 117-129) enumerates applied corrections; NFR-6 is not in the list; line 140 still has "or."
**Status:** INCOHERENT (batch-C M1 never applied).
**Action: CORRECT.** Tighten NFR-6 to a single branch: "history refs' `refs/wip/<branch>/server` + `refs/wip/<branch>/human-server` legacy refs are deleted on first-run post-upgrade per D35. No archive, no rename."

---

### [M] Finding 8: D9 `<contentDir>/.open-knowledge/` vs D56 `<root>/.open-knowledge/` path terminology drift

**Category:** COHERENCE
**Source:** L1
**Location:** SPEC §6 FR-10 (line 122); §10 D9 (line 410); §10 D56 (line 458); §10 D45 (line 446)
**Issue:** D9 + FR-10 say `<contentDir>/.open-knowledge/principal.json`. D56 says `<root>/.open-knowledge/`. D45 says "attempted when `projectDir` points to a git repo." The codebase has distinct concepts: `contentDir` (where user's markdown lives, per config), `projectRoot`/`projectDir` (where the `.git/` lives). `contentDir` can be inside `projectDir` (common: `docs/` inside a code repo) or coincide with `projectDir`. If the shadow repo lives at `<projectRoot>/.git/openknowledge/` in integrated mode, but principal.json lives at `<contentDir>/.open-knowledge/principal.json`, and D56 unifies them under `<root>/.open-knowledge/` (ambiguous which root), the on-disk path contract is not self-consistent. `shadow-repo-layout.ts:69-82:resolveShadowDir(projectRoot)` keys off `projectRoot`, not `contentDir`.
**Current text (D56):**
> Unified state directory: `.open-knowledge/` for ALL Open Knowledge metadata. Subdirectories: `config.yml`, `principal.json`, `history/` ..., `*.lock` files.
**Current text (D9):**
> Persisted to `<contentDir>/.open-knowledge/principal.json`.
**Evidence:** D45 uses `projectDir` in rationale; D56 uses unqualified `root`; D9 uses `contentDir`; `shadow-repo-layout.ts:72` signature is `resolveShadowDir(projectRoot)`.
**Status:** INCOHERENT (three different root concepts used for what D56 implies is one location).
**Action: CORRECT.** Pin one concept. Suggested: `contentDir` (user's configured content root) is the single `.open-knowledge/` parent. D9, D56, D45 all use that term consistently. Explicit cross-reference: "`.open-knowledge/` lives at `<contentDir>`, not `<projectRoot>`; when `contentDir === projectRoot`, they coincide." Update D56 and D45 to use `contentDir`.

---

## Pragmatism

### [P] Finding 9: Q100 residual "iterate in session-age order, reconcile each against disk in turn" is pragmatism-grade under greenfield directive

**Category:** PRAGMATISM
**Source:** User directive filter
**Location:** SPEC §11 Q100 (line 467)
**Issue:** Q100 describes a real correctness edge (two sessions parked state on same doc, branch switch back, how to restore). The "plan to resolve" reads: "Enumerate during implementation; typical active-session-per-doc is 1, so this is a rare edge. Likely simplest: iterate in session-age order, reconcile each against disk in turn." Under greenfield + no-deferred-debt, a multi-session park-merge semantic should be specified BEFORE implementation, not decided mid-implementation on observed frequency ("typical is 1"). The cost is not observation-driven — it's whether two sessions merging into a branch-restore is a defined operation. D19's per-session park decision COMMITS to this edge existing; the spec should commit to a semantic (e.g., "restore session-age oldest-first; subsequent sessions each reconcile against the running state"). Current phrasing is pragmatism.
**Current text (Q100):**
> Enumerate during implementation; typical active-session-per-doc is 1, so this is a rare edge.
**Status:** PRAGMATISM.
**Action: ESCALATE.** Nick's call: either lock a semantic now ("session-age oldest-first reconcile") or explicitly DEFERRED with "non-correctness-critical — pick ordering at implementation, document outcome post-hoc." Current phrasing straddles.

---

## Low Severity

### [L] Finding 10: D38's `history-repo.ts:133` reference matches D55 aspirational name but evidence Q31 cites `shadow-repo.ts:133`

**Category:** COHERENCE (L1) / forward-compat
**Source:** L1
**Location:** SPEC §10 D38 (line 439); `evidence/history-and-sweep.md:91`
**Issue:** D38 rationale says "Matches per-writer tmp-index isolation (`history-repo.ts:133`)." Evidence file at `history-and-sweep.md:91` uses `shadow-repo.ts:133`. Actual file is `shadow-repo.ts`. Batch-C M3 flagged this; it's not in the applied-corrections list.
**Status:** LOW (mixed naming; both resolve to the same line).
**Action: CORRECT (optional).** Either (a) update D38 to `shadow-repo.ts:133 (→ history-repo.ts per D55)` for correctness against current code, or (b) accept aspirational naming in decisions as a D55-motivated convention and update evidence to match. Whichever; just make them agree.

---

### [L] Finding 11: D19/D40/D53 still have Unicode `→` in one place; D40/D53 use ASCII `->` — batch-C L2 flagged, not applied

**Category:** COHERENCE (L1)
**Source:** L1
**Location:** SPEC §10 D19 (line 420, `park: <old-branch> → <new-branch>`); D40 + D53 use ASCII `->`
**Issue:** Batch-C L2 flagged the ASCII/Unicode mismatch. §5 P4 journey line 90 doesn't use the explicit subject format so is fine. Changelog doesn't list this fix. Git subjects should be ASCII for grep/CI portability.
**Status:** LOW.
**Action: CORRECT.** Normalize D19's `→` to `->` to match D40/D53.

---

### [L] Finding 12: Evidence file `crdt-to-git-translation.md` has `tags: [..., shadow-repo, ...]` and `sources:` list of `shadow-*.ts` — stale under D55

**Category:** COHERENCE
**Source:** L1
**Location:** `evidence/crdt-to-git-translation.md:4-5`; `evidence/history-and-sweep.md:4-5`
**Issue:** Evidence frontmatter tags include `shadow-repo`; sources list includes `packages/server/src/shadow-repo.ts`. Per D55, internal concept is renamed. Evidence is historical record — not a hard error — but if the spec is a single consumable, the frontmatter drift is a readability issue for future agents doing `grep -l "history-repo"`.
**Status:** LOW (evidence-as-history; acceptable if documented).
**Action: CORRECT (optional).** Either update `tags:` / `sources:` frontmatter to post-D55 names, OR add a one-line note at evidence top: "This evidence file was written pre-D55; `shadow-repo.ts` in code refs = `history-repo.ts` in post-spec state."

---

## Confirmed Claims (summary)

- **D26 rewrite correctness:** verified at Hocuspocus.ts:551, :580; UndoManager.js:269-271. Primitive claim ("`dc.disconnect()` is load-bearing") matches source.
- **D32 context threading:** verified at Hocuspocus.ts:593-610 (accepts `context?`), DirectConnection.ts:21-24,29-44,46-64 (hardcodes `{source:'local', context:this.context}`).
- **D42 POST enumeration:** all 12 handlers verified at cited lines; no additional mutating POST handlers found in registry beyond the D42+allowlist set.
- **D25 option:** `ignoreRemoteMapChanges` is a real `UndoManagerOptions` field (UndoManager.js:170, default `false`).
- **D43 enum consumers:** only 2 write-sites (api-extension.ts:1195, 1737) — additive widening safe.
- **D51/D56 gitignore:** `.open-knowledge/` directory subsumes `.open-knowledge/principal.json`. Batch-D M M8 edge cases (EXDEV migration, both-legacy-dirs) NOT addressed in D56 — partial medium-severity carry-over but out of this audit's primary scope (flagged in batch-D M8).

## Unverifiable Claims

- **Q100 session-age-oldest-first ordering:** not committed; see Pragmatism P9.
- **D39 transact-wrap serialization benefit under async I/O:** partial — see M4.

## Internal-consistency new flags (not in prior batches)

1. Terminology drift `contentDir` vs `projectDir` vs `root` (Finding 8).
2. D13 "human sessions" vs D34/D50 "principals" (Finding 6).
3. FR-3 vs D25 UM scope naming (Finding 5).
4. `parseWriterId` shape gap under D35 (Finding 2).

## Prior audit carry-overs with no changelog evidence of application

- Batch-C M1 (NFR-6 one branch): not applied → Finding 7.
- Batch-C M3 (D38 name drift): not applied → Finding 10.
- Batch-C L2 (Unicode arrow): not applied → Finding 11.
- Batch-D H1 (§7 fictional paths): not applied → Finding 1.

None of these four are listed in the changelog's 13-item applied-corrections list. A final pre-close sweep should either apply them or add a one-line "intentionally deferred because X" note per item.

---

*Round 2 audit against SPEC @ a8b688ce + worktree HEAD. No fixes applied.*
