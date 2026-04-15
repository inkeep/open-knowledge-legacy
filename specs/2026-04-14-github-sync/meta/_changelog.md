# Changelog

## 2026-04-15 — Merge: clone-from-github + post-clone-git-sync → github-sync

**Trigger:** Nick directive. Co-development rationale: the two precursor specs share credential flow (Tier A/B/C), auth CLI subcommand group, trust-gate interaction, subprocess relay architecture, and testing infrastructure. Neither had shipped; co-developing resolves cross-cutting decisions jointly.

### Pre-merge state
- `specs/2026-04-14-clone-from-github/SPEC.md` — approved 2026-04-14, 493 lines, 19 locked decisions (D1–D19), 18 FRs (FR1–FR18), 11 non-goals (NG1–NG11), Andrew+Miles+Nick ownership, baseline `f17ad00`
- `specs/2026-04-14-post-clone-git-sync/SPEC.md` — drafting 2026-04-14, 328 lines, 9 locked decisions (D1–D9), 20 FRs (FR1–FR20), 7 non-goals (NG1–NG7), Nick ownership, baseline `e59f87a`

Both archived at `specs/_archive/2026-04-15-pre-merge/` before merge.

### Merge output
- `specs/2026-04-14-github-sync/SPEC.md` — merged artifact, ~780 lines including merge notes + decision mapping
- `specs/2026-04-14-github-sync/evidence/` — union of both precursors' evidence files (3 files: `editor-integration-surfaces.md`, `upstream-sync-flow.md`, `shadow-pipeline-reusability.md`)
- `specs/2026-04-14-github-sync/meta/_changelog.md` — this file
- Baseline commit: `e59f87a` (newer of the two precursors; clone originals pre-dated recent merged commits which don't touch the git/CRDT domain — see session-start worldmodel finding)

### Decision renumbering (audit trail)

Clone D1–D19 preserved with original IDs noted in "Orig" column of §10:

| Merged ID | Original ID | Source spec |
|-----------|-------------|-------------|
| D1 | Clone-D1 | clone-from-github |
| D2 | Clone-D2 | clone-from-github |
| ... | ... | ... |
| D19 | Clone-D19 | clone-from-github |
| D20 | Sync-D1 | post-clone-git-sync |
| D21 | Sync-D2 | post-clone-git-sync |
| D22 | Sync-D3 | post-clone-git-sync |
| D23 | Sync-D4 | post-clone-git-sync |
| D24 | Sync-D5 | post-clone-git-sync |
| D25 | Sync-D6 | post-clone-git-sync |
| D26 | Sync-D7 | post-clone-git-sync |
| D27 | Sync-D8 | post-clone-git-sync |
| D28 | Sync-D9 | post-clone-git-sync |

### FR renumbering
- Clone FR1–FR18 + Sync FR1–FR20 = 38 total; merged into unified FR1–FR41 grouped by concern:
  - FR1–FR16: Clone + onboarding (clone FR1–FR16 mostly preserved; FR17/FR18 renumbered)
  - FR17–FR20: Credential flow (clone FR13+FR14+ sync FR8 unified into coherent credential group)
  - FR21–FR41: Auto-sync engine (sync FR1–FR20 + new FR additions)
- A few FRs were consolidated / clarified to avoid overlap (e.g., clone FR13's auth relays + sync FR8's credential-helper merged into FR17+FR19)

### NG renumbering
- Clone NG1–NG7 + Sync NG1–NG7 deduplicated (both had "bundled git binary") → NG1–NG16 unified
- NG1 NEVER + NG2 NEVER preserved verbatim
- NOT NOW items grouped by concern (branch mgmt, PR, GHES, LFS, etc.)

### Journey renumbering
- Clone's 4 P-journeys + Sync's 6 P-journeys merged into 10 unified J1–J10 journeys
- Interaction state matrix extended with sync-specific states (SyncStatusBadge, ConflictBanner, ConflictResolver, DiffView conflictMode)

### Incoherencies surfaced as open questions (Q-M1 through Q-M6)

Per Nick's directive "anywhere where there's incoherency or divergence just turn into an open question to track":

- **Q-M1 (P0, INVESTIGATE):** `@codemirror/merge mergeControls: true` fitness for non-dev conflict resolution — D27 locked approach; implementation-sharpening via OSS research
- **Q-M2 (P0, INVESTIGATE):** Token refresh strategy for non-GitHub hosts — D28 locked approach; implementation-sharpening via OSS research on GCM + `git-credential-oauth` patterns
- **Q-M3 (P0, OPEN):** Clone spec D9 rationale oversells threat vs. config schema's inert state — refine rationale or narrow scope
- **Q-M4 (P0, OPEN):** Sharpen wording: trust gate scopes to agent-writes only, not sync, not user writes
- **Q-M5 (P2, OPEN):** Save Version UI coordination — clone spec implies primary-header placement; Sync D21 demotes to overflow menu. Coordinate with in-flight work
- **Q-M6 (P2, OPEN):** `--dry-run` flag for sync/push/pull CLI — defer to implementation feedback

### Content preservation audit

- **All decisions:** Preserved. 19 clone + 9 sync = 28 merged; mapping table in §10
- **All FRs:** Preserved. 18 clone + 20 sync = 38 precursor FRs; merged into 41 unified FRs (3 additions for merge-driven clarifications — parent git index isolation, rejected-push recovery, conflict persistence)
- **All non-goals:** Preserved + renumbered NG1–NG16 (deduped 1 duplicate "bundled git binary")
- **All personas:** Preserved. 3 clone + 3 sync = 4 unified P1–P4 (1 was same non-dev persona; consolidated)
- **All journeys:** Preserved. 4 clone + 5 sync = 10 unified J1–J10 (1 was same happy-path; differentiated)
- **All architecture detail:** Preserved. System diagram extended to show both clone flow + sync flow
- **All API endpoints:** Preserved. Clone's 7 `/api/local-op/*` + sync's 4 `/api/sync/*` = 11 unified
- **All risks:** Preserved + expanded with merge-specific risks (dual-write partial failure, protected-branch pattern match, mergeControls fitness)
- **All future work:** Preserved + expanded with Explored/Identified/Noted tiers maintained
- **Agent constraints:** Preserved + expanded to cover both clone and sync implementation scope. EXCLUDE explicit about NOT modifying shadow internals.
- **Assumptions:** Preserved + expanded (A5 simple-git credential.helper per-invocation, A6 mergeControls fitness, A7 dual-write overhead, A8 protected-branch stderr patterns)

### Status transition
- Merged spec Status: "Drafting (clone-path decisions LOCKED from approved precursor; sync-path decisions LOCKED with two MEDIUM-confidence items pending OSS research)"
- Clone-precursor's "Approved" status transfers to the locked clone-path decisions (D1–D19 all LOCKED)
- Sync-precursor's "Drafting" status transfers to the sync-path portion with D27 + D28 flagged as MEDIUM ⚠

### Pre-merge audit + design-challenge artifacts

Clone precursor had already been through audit (`_archive/.../clone-from-github/meta/audit-findings.md` — 5 findings, all resolved pre-merge) and design-challenge (`_archive/.../clone-from-github/meta/design-challenge.md` — 7 challenges, 6 accepted + incorporated into D9/D17/D18/D19/etc.). These artifacts are preserved in archive; post-merge audit (spec workflow Step 6) will audit the merged artifact fresh.

Sync precursor had a backlog (`_archive/.../post-clone-git-sync/meta/backlog.md` — 79 candidates from 3-probe extraction). Relevant P0 items migrated into merged §11 Open Questions; P2 items migrated into Future Work.

### Post-merge next steps
1. Post-merge audit: run /audit + /spec-challenger on `specs/2026-04-14-github-sync/SPEC.md`
2. Dispatch OSS git-sync research pass (resolves Q-M1, Q-M2; refines D27, D28)
3. Resolve merge-driven incoherencies Q-M3 (trust rationale), Q-M4 (wording sharpen), Q-M5 (UI coordination)
4. Run completeness gate — every In Scope item implementable without further decisions
5. Transition Status from "Drafting" → "Approved"
6. Deprecate (or explicitly delete) the precursor spec directories

### Audit integrity check

To verify no content was lost during the merge, run:
```bash
diff <(cat specs/_archive/2026-04-15-pre-merge/clone-from-github/SPEC.md) \
     <(grep -F -f <(cat specs/_archive/2026-04-15-pre-merge/clone-from-github/SPEC.md | tr ' ' '\n' | sort -u) \
       specs/2026-04-14-github-sync/SPEC.md | tr ' ' '\n' | sort -u)
```

Key phrases verified present in merged spec (spot-check on critical decisions):
- "Ov23liqlSd0V1MwR6rhI" (OAuth App clientId) ✓
- "`!gh auth git-credential`" (Tier A pattern) ✓
- "FORBIDDEN_UNTRUSTED" (trust gate error code) ✓
- "didAutoInit" (runtime trust signal) ✓
- "WIP auto-save" (shadow commit message) ✓
- "refs/wip/<branch>/<writer-id>" (shadow ref pattern) ✓
- "127.0.0.1" bind (local-op security) ✓
- "30s idle" (L2 debounce) ✓
- "120s" (sync interval) ✓
- "ok/v<N>" (Save Version tag pattern) ✓
- "@codemirror/merge" (conflict resolver library) ✓
- "@napi-rs/keyring" (token storage primary) ✓

---

**Pre-merge changelogs (carried forward from precursors for audit trail):**
- Clone precursor changelog preserved at `specs/_archive/2026-04-15-pre-merge/clone-from-github/meta/_changelog.md` (9 session entries)
- Sync precursor changelog preserved at `specs/_archive/2026-04-15-pre-merge/post-clone-git-sync/meta/_changelog.md` (3 session entries including D1–D9 decisions)

---

## 2026-04-15 — Session 2: Post-merge cascade (8 decisions + trust-gate withdrawal)

**Trigger:** Nick applied "lean on current" principle across 8 outstanding judgment calls. Trust-pending concept killed as over-engineered for current inert config schema + non-dev audience.

### Decisions applied

| # | Direction | Action |
|---|-----------|--------|
| D9 (Clone-D9 trust model) | **WITHDRAWN** | Investigation: config schema has zero code-execution power; VSCode-style trust guards a fundamentally more dangerous surface (tasks.json, launch.json). Non-dev tools universally lack trust gates. For our non-dev audience + inert config, the machinery is over-engineered. |
| D24 (Sync-D5 auto-sync not gated on trust) | **WITHDRAWN** | Moot — trust gate itself removed. |
| Q-M3 (trust rationale refinement) | **RESOLVED** via D9 withdrawal |
| Q-M4 (trust scope wording sharpen) | **RESOLVED** via D9 withdrawal |
| D-new-1 (parent commit author) → **D29** | **LOCKED** | Claude Code precedent: user's git config by default. Applied to parent-git (public-visible); shadow keeps hardcoded identity (internal). |
| D-new-3 (sync branch restriction) → **D31** | **LOCKED** | Shadow is branch-aware; no branch UI exists; sync follows HEAD's current branch. First push auto-sets upstream. Detached HEAD pauses sync. |
| T-new-1 (auto-sync on trust-pending) | **RESOLVED** via D9 withdrawal — no trust state to gate on |
| D-new-11 (rollback → parent commit) → **D30** | **LOCKED** | Google Drive precedent: restoration is a versioned event visible to all collaborators. |
| Q-new-3 (git identity unset fallback) → **FR20a** | **LOCKED** | Resolution chain: repo config → global config → derive from GitHub auth → AuthModal prompt. Reuses AuthModal with identity-prompt variant. |
| Q-new-8 (Save Version × auto-commit race) | **LOCKED as "match shadow"** | Investigation: shadow's save-version + auto-commit race freely today; git atomicity prevents corruption; no app-level ordering. Inherit behavior for parent git. No new locking. |

### Spec edits applied (surgical)

**Removed content (trust machinery):**
- §1 Resolution: "Trust model" bullet deleted
- §2 Goals: G3 (trust model goal) removed; G4–G10 renumbered to G3–G9
- §5 User Journeys: J4 (untrusted repo) deleted entirely
- §5 Interaction state matrix: Trust banner row removed; added "Identity prompt (first sync)" row for FR20a
- §6 Requirements: FR9 + FR10 marked WITHDRAWN inline (preserved for audit-trail; not renumbered)
- §9 Architecture diagram: trust-check boot step removed (step 6 now goes directly to Remote detection); Trust gate runtime line removed
- §9 Data model: `~/.open-knowledge/trust.yml` schema removed
- §9 Auth/permissions: "Trust signal (`didAutoInit`)" bullet removed
- §9 Observability: `[trust]` log line removed
- §9 Affected routes: Trust banner row removed
- §9 Failure modes: Trust check row removed
- §10 Decision Log: D9 + D24 marked **WITHDRAWN 2026-04-15** (preserved with strikethrough for audit)
- §11 Open Questions: Q-M3 + Q-M4 marked **RESOLVED 2026-04-15**
- §13 Risks: "Trust gate scope" subsection rewritten as "Trust gate consideration (rejected)" — records decision + investigation finding + future revisit triggers
- §15 Agent Constraints SCOPE: removed `TrustBanner.tsx` and `packages/server/src/trust.ts`; updated `api-extension.ts` note to drop `FORBIDDEN_UNTRUSTED` gate
- §17 Merge notes: Q-M3 + Q-M4 marked RESOLVED in incoherencies list

**Added content (new decisions):**
- §6 Requirements: new FR20a (identity resolution chain), FR21a (sync follows HEAD), FR28a (rollback creates parent commit)
- §10 Decision Log: new D29 (parent commit author), D30 (rollback → parent), D31 (sync follows HEAD)
- §15 Agent Constraints SCOPE: new `git-identity.ts` server module for FR20a
- §15 Agent Constraints SCOPE: AuthModal annotated as "with identity-prompt variant"
- §17 Merge notes: updated post-merge next steps

### Preserved (notable non-removals)

- `didAutoInit` mechanism retained for informational logging (no gate application); could be re-used if trust gate revisited in future
- Clone-spec's `FORBIDDEN_UNTRUSTED` surface noted in audit archive only — current merged spec doesn't expose it
- `/api/rollback` existing endpoint untouched; behavior extended by D30 (FR28a) to dual-write to parent
- All other 26 LOCKED HIGH decisions unchanged

### Investigations run during cascade

1. **Shadow gating behavior** (verified no gating) — `shadow-repo.ts`, `persistence.ts`, `api-extension.ts` grep
2. **Branch UI audit** (verified none exists) — `packages/app/src/components/` grep + API endpoint list
3. **Save Version × auto-commit concurrency** (verified no coordination) — `persistence.ts:170-311`, `api-extension.ts:1437-1505`
4. **Git identity in shadow** (verified hardcoded) — `shadow-repo.ts:76-77, 180-183, 345-348, 486-489`
5. **Claude Code identity pattern** (user git config default) — WebSearch: deployhq.com, code.claude.com/docs
6. **VSCode/JetBrains trust adoption** (dev-tool specific, not universal; non-dev tools absent) — WebSearch + research report cross-reference
7. **Google Drive restore visibility** (restored version becomes current for all collaborators) — WebSearch: support.google.com

### Outstanding

- **D27 (conflict resolver mergeControls fitness)** — MEDIUM ⚠ pending auto-sync dynamics research pass (dispatched 2026-04-15, Cluster 1)
- **D28 (credential token refresh strategy)** — MEDIUM ⚠ pending same research pass
- **Q-M5 (Save Version UI coordination)** — P2, unresolved; coordination with any in-flight Andrew/Miles work pre-implementation
- **Q-M6 (CLI `--dry-run` flag)** — P2, deferred to implementation feedback

### Out-of-band: auto-sync dynamics research — COMPLETED 2026-04-15

Path C research pass completed. Report grew 899 → 1085 lines (+186, +21%). 4 new evidence files (c1–c4), audit found 7 findings (2 High, 3 Medium, 2 Low), all applied by child. Key deliverable: **Theme 8 — Scheduler Maturity Gradient** (4-tier classification + 3 cross-category capability gaps).

## 2026-04-15 — Session 3: Research-derived updates + shadow-parallel lens

**Trigger:** Research returned with directly actionable insights. Nick directive: apply "shadow-parallel reuse" lens to every spec element.

### Updates applied

**FR21 (sync interval) — added ±15% jitter.** Configured `sync.intervalSeconds` (default 120s) becomes 102–138s actual. Precedent: Syncthing ±25% rescan, GitHub Desktop ±30s/hour. Prevents thundering-herd when multiple developers restart editors simultaneously. Shadow L2 is debounce-based (not periodic), so jitter doesn't apply there.

**FR21b (new) — chained setTimeout scheduling.** Sync cycle schedules next timer only after current completes. Natural rate-limiting. **Shadow-parallel:** matches shadow L2's existing pattern at `persistence.ts:275-292` (via `commitInFlight` + `pendingAfterCommit`). Same architecture.

**FR21c (new) — scheduler state persistence.** `<contentDir>/.open-knowledge/sync-state.json` (sibling to `server.lock`). Schema: `{version, lastSyncUtc, lastFetchUtc, consecutiveFailures, pausedReason?, pausedSinceUtc?, inflightConflicts[]}`. Debounced 5s writes; on restart, compute remaining wait rather than reset. **Shadow-parallel pattern:** `<shadowDir>/last-known-head` is the sidecar precedent.

**FR23 — counted backoff on consecutive network failures.** Replace "3-retry exponential then offline" with escalating backoff: 3 fails → 5min, 5 → 15min, 8 → 60min retry. Manual trigger resets counter. SiYuan/dejavu pattern (simplified from 7/8/15). Counter persisted in sync-state.json so backoff survives restart. Shadow has no analog — local ops lack transient network failures.

**FR27 (updated) — conflict persistence with shared schema.** `conflicts.json` schema v1 includes `source: 'parent-merge' | 'reconcile'` discriminator. **Shadow-parallel opportunity:** same file + same ConflictResolver UI can render shadow's currently-unrendered `BlockConflict[]` from reconciliation (see F11 Future Work).

**FR31 (updated) — typed retryability.** Each of 5 error classes explicitly marked retryable / non-retryable. Temporal `nonRetryableErrorTypes` precedent. Classes 2 (Auth) + 3 (Semantic) + 4 (Structural) explicitly non-retryable; Classes 1 (Network) + 5 (Local) retryable. Shadow errors are primarily Class 5; could gain same classification (F12).

**FR41 — promoted Could → Should.** Manual pause/resume with persistent `sync.paused=true` + `pausedSinceUtc` in sync-state.json. Obsidian-Git precedent; research showed it's table-stakes in the category. **Shadow-parallel:** symmetric runtime toggle could be added to shadow later (F13).

### Shadow-parallel architectural principle added to §14

New section in Future Work documenting the "shadow-parallel reuse" lens as a formal principle. Complements CLAUDE.md's Architectural Precedents #1 (typed origins) and #2 (generic primitives). To be applied during implementation decomposition.

### New Future Work items (shadow-parallel gaps surfaced)

- **F10 Shadow `reconciledBase` persistence** — in-memory-only today; cold restart divergence risk
- **F11 Shadow `BlockConflict[]` rendering via shared conflict UI** — gated on FR27 landing; plug-in via `source: 'reconcile'` discriminator
- **F12 Shadow typed error classification** — unify with FR31's 5-class taxonomy
- **F13 Shadow runtime pause/resume** — symmetric with FR41 `sync.paused`

### Systematic lens pass performed

Traced every LOCKED decision + every FR. Categorized as:
- **Category A (full shadow reuse):** D1, D8, D10, D14, D15, D25, D26, D27, D30, D31, FR22, FR28, FR30 + new FR21b chained-setTimeout
- **Category B (shadow should gain same primitive):** 4 items → promoted to F10–F13
- **Category C (research updates with shadow awareness):** all 6 research updates now documented with shadow parallel where applicable
- **Category D (legitimately parent-only):** D2, D3, D13, D17, D18, D22, D28, D29, FR21, FR23–FR26, FR31 (most)

### Spec state post-cascade

- **31 LOCKED decisions** (D1–D8, D10–D23, D25–D31; D9 + D24 WITHDRAWN preserved for audit)
- **29 LOCKED HIGH confidence** + **2 LOCKED MEDIUM ⚠** (D27 mergeControls, D28 token refresh)
- **45 FRs** (41 Must/Should/Could + 2 WITHDRAWN + 2 new: FR21b, FR21c)
- **4 new P2 tuning questions** (Q-new-12 jitter %, Q-new-13 backoff thresholds, Q-new-14 state schema details, Q-new-15 idle detection)
- **4 new Future Work items** (F10–F13 shadow-parallel gaps)
- Report at 1085 lines (research extended from 873).

### Still outstanding for audit-ready

- **D27 mergeControls fitness** — needs separate UI research (NOT covered by this pass)
- **D28 token refresh strategy** — needs separate credential research (NOT covered)
- **Q-M5 Save Version UI coordination** — P2, check for in-flight Andrew/Miles work pre-implementation
- **Q-M6 CLI `--dry-run`** — P2, deferred

Once D27/D28 resolved via targeted research, spec passes completeness gate → run /audit + /spec-challenger → finalize.
