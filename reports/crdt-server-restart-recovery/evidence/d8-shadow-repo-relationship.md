# Evidence: D8 — Shadow Repo Relationship to Restart-Recovery

**Dimension:** D8 (follow-up) — How does the shadow repo compose with, substitute for, or conflict with the proposed Yjs binary sidecar approach?
**Date:** 2026-04-23
**Sources:** Open Knowledge monorepo source (shadow-repo.ts, persistence.ts, standalone.ts, api-extension.ts)

This is a 1P exploration commissioned to close a gap in the prior report — the shadow repo was mentioned only in passing as "not the right location for the sidecar," with thin reasoning. This brief provides the source-grounded analysis.

---

## Key sources referenced

- `packages/server/src/shadow-repo.ts` — all shadow-repo primitives (1203 lines)
- `packages/server/src/persistence.ts:504-739` — L1/L2 persistence pipeline
- `packages/server/src/standalone.ts:900-948` — shutdown phase ordering
- `packages/server/src/standalone.ts:1193-1401` — onBatchEnd branch-switch handler
- `packages/server/src/api-extension.ts:2659-2779` — rollback handler
- CLAUDE.md §Shadow repo & branch runtime — catalog

---

## Factual foundation: what the shadow repo actually is

**Code-verified — the shadow repo stores markdown text, never Yjs binary.**

- `commitWip` (shadow-repo.ts:216-293) uses `git add <contentRoot>` to stage the LIVE on-disk markdown, then `write-tree` + `commit-tree` + `update-ref refs/wip/<branch>/<writer-id>`. Tree entries are git blobs containing UTF-8 markdown.
- `buildWipTree` (shadow-repo.ts:328-351) + `commitWipFromTree` (shadow-repo.ts:357-395) is the fan-out variant — same markdown-staging pattern, shared tree across per-writer commits.
- `parkBranch` (shadow-repo.ts:942-1036) writes TWO blobs per doc: (a) `<docName>` = live Y.Doc serialized to markdown, (b) `.park-base/<docName>` = `reconciledBase` (last-synced disk content). Both are markdown, not binary.
- `safetyCheckpoint` (shadow-repo.ts:477-498) + `saveInMemoryCheckpoint` (shadow-repo.ts:551-629) — both write markdown blobs, distinguished only by ref namespace (`refs/wip/*` vs `refs/checkpoints/<branch>/*`) and commit message prefix.
- `saveVersion` (shadow-repo.ts:1086+) — full-tree markdown snapshot with per-writer WIP refs as multi-parent ancestry.

**There is no path in the shadow-repo module that writes Yjs binary state.** All blobs are markdown.

**Code-verified — shutdown releases the shadow lock but does NOT park the branch.**

Phase ordering in `standalone.ts:908-934`:
1. File watchers stopped (phase 1)
2. Agent sessions drained (phase 2)
3. L1 flush — final `onStoreDocument` on all docs (phase 3)
4. L2 flush — drain pending contributor commits (phase 4)
5. **Shadow repo released** via `destroyShadowRepo` → `releaseLock` (phase 5)

`parkBranch` does NOT appear in the shutdown phase list. It is invoked solely from `onBatchBegin` (HEAD-move trigger). The `last-known-head` file is written to the shadow gitDir at phase 5 but this is just a SHA reference, not a content snapshot.

**Implication:** on clean shutdown, the server writes markdown to disk + commits to shadow repo + releases locks. The in-memory Y.Doc state is discarded (Hocuspocus `unloadDocument` drops the doc from its Map). On the next restart, the server has no CRDT state beyond what markdown reconstruction can produce — which is precisely where the bug class lives.

---

## Q1 — Could the shadow repo serve as binary-sidecar storage?

**Finding:** Technically possible but architecturally poor fit.

**Code-verified technical feasibility:** Git blobs can hold any bytes. A hypothetical `refs/ystate/<branch>/<docName>` ref pointing at a blob-only commit (no tree) with binary Yjs content would work at the git-plumbing level. Alternative: embed binary as an additional tree entry alongside markdown in existing WIP commits.

**Inferred blockers:**

1. **Performance cost per L1 debounce.** Current sidecar write path: ~1 `fs.writeFileSync` + `fs.rename` call — sub-millisecond on local SSD. Shadow-repo path: spawn `git hash-object -w` subprocess → spawn `git update-ref` subprocess → atomic ref rewrite. Each spawn is ~5-15ms on macOS. Active editing produces ~1 store per 2s per doc; at 5 open docs that's 10-30 subprocess spawns per minute just for sidecar cache maintenance. The sidecar file approach is orders of magnitude cheaper for a purely-operational cache.

2. **GC story is more complex, not simpler.** Git's built-in GC has a 2-week grace period for unreachable objects. Orphaned binary blobs (from deleted/renamed docs) would accumulate until the next `git gc` pass. Sidecar files can be deleted with `rmSync` — immediate reclamation.

3. **Architectural coupling.** Binary cache would become tied to:
   - Branch-switch lifecycle (ref-update sequencing on branch change)
   - Named-checkpoint lifecycle (should a save-version checkpoint include binary? Answer: no — see Q6)
   - Rollback lifecycle (does rolling back markdown also roll back binary? Answer: no — see Q6)
   - Shadow-lock contention (binary writes would now need the writer lock)

   Sidecar files are architecturally isolated — they compose with every other primitive without interaction.

4. **Recovery on corruption.** If a binary blob is corrupt, git will fail to read the ref — the whole ref becomes inaccessible until `git fsck` + manual repair. Sidecar files: corrupt file → fall through to markdown → done. The per-file blast radius of sidecar corruption is smaller.

**Answer:** Shadow repo is NOT the right home for the binary sidecar. The performance cost is material and the coupling adds complexity without benefit. Sidecar files at `.open-knowledge/ystate/` remain the recommended location.

---

## Q2 — Does the shadow repo already provide restart recovery for some class of state?

**Finding:** Yes, but for MARKDOWN state + attribution, NOT CRDT state.

**Code-verified recovery surfaces the shadow repo provides:**

| Recovery class | Mechanism | Preserved across restart? |
|---|---|---|
| Named checkpoints | `saveVersion` → `refs/checkpoints/<branch>/<sha>` | YES |
| Per-writer attribution history | `commitWip` / `commitWipFromTree` → `refs/wip/<branch>/<writer-id>` | YES |
| In-memory rescue checkpoints | `saveInMemoryCheckpoint` (kind: `bridge-merge-loss`, `external-change-rescue`) | YES |
| Parked branch WIP (markdown-level delta) | `parkBranch` → `refs/wip/<branch>/openknowledge-service` + `.park-base/<docName>` blobs | YES (but only used on branch switch, not restart) |
| Safety checkpoints | `safetyCheckpoint` → `refs/wip/<branch>/openknowledge-service` | YES |
| **Y.Doc CRDT state (clientID + items)** | **NONE** | **NO** |
| **Unsynced in-memory edits** | **Partially** — survive if they reached L1 flush; lost otherwise | **PARTIAL** |

**Critical distinction:** WIP commits contain markdown, not Yjs updates. Could they be replayed to reconstruct a Y.Doc with original clientIDs? NO — replaying markdown through `updateYFragment` produces fresh Yjs Items under the CURRENT server's clientID, which is exactly the bug-triggering path. Per-writer attribution at the markdown level has no bearing on CRDT-level identity.

**What the shadow repo handles today:** test T11 (mid-drain server restart) passes specifically because markdown durability is preserved across restart via the L1 disk write + L2 shadow commit — even if attribution for the in-flight drain cycle is forfeit. The shadow repo guarantees "you won't lose content that reached L1."

**What the shadow repo does NOT handle:** tests T1, T2, T4, T6, T9, T10 — all the CRDT-identity failure modes. The shadow repo has no mechanism for preserving Y.Doc `clientID` → `items` mapping across a process restart.

**Answer:** Shadow repo provides markdown-state-plus-attribution recovery. It already covers T11 (content durability). It cannot cover the clientID-mismatch bug class because it stores markdown, not CRDT state. The sidecar fills this specific gap.

---

## Q3 — Is parkBranch relevant to restart-recovery?

**Finding:** `parkBranch` does NOT run on restart — only on HEAD-move. It solves a different problem and does not substitute for the sidecar approach. Neither does the sidecar make `parkBranch` redundant.

**Code-verified triggers:** `parkBranch` is invoked exclusively from `standalone.ts:1149-1189` inside `onBatchBegin`, which fires only when the HEAD watcher detects `.git/HEAD` / `MERGE_HEAD` / `ORIG_HEAD` / `index.lock` changes. It is NOT invoked:
- During clean shutdown (Phase 4 L2 flush does a normal commit cycle; `parkBranch` is separate)
- On process crash (no shutdown path runs)
- From any API endpoint

**What parkBranch captures (code-verified):**

```typescript
// From parkBranch at shadow-repo.ts:957-979
for (const doc of documents) {
  // Store Y.Doc state at the doc's path (markdown serialization, NOT Yjs binary)
  writeFileSync(tmpBlobFile, doc.markdown, 'utf-8');
  // ... hash-object + update-index at <docName> ...

  // Store disk snapshot at .park-base/<docName> (reconciledBase, also markdown)
  writeFileSync(tmpBlobFile, doc.diskSnapshot, 'utf-8');
  // ... hash-object + update-index at .park-base/<docName> ...
}
```

The `ParkableDoc.markdown` field is the Y.Doc's LIVE serialized-to-markdown state (from memory at park time). The `diskSnapshot` field is `reconciledBase` — the last-known-synced disk content. On `restoreBranchWIP`, both are fed into `reconcile({base, ours: parked.markdown, theirs: currentDisk})` for three-way merge.

**Purpose of parkBranch:** when the user checkouts from branch A to branch B, the live Y.Doc's markdown may have in-memory deltas not yet reconciled with branch A's disk state. These deltas must not be silently discarded. parkBranch snapshots them to shadow. On return to branch A, the three-way merge re-integrates the delta against whatever branch A's disk now contains.

**Composition with sidecar:** parkBranch and sidecar solve orthogonal problems.
- parkBranch: preserves markdown-level delta across branch switches.
- Sidecar: preserves CRDT identity across restarts (same process, no branch switch).

Neither substitutes for the other. In combination:
- On branch switch: parkBranch runs (unchanged). The sidecar is branch-scoped — either stored per-branch or deleted on switch (recommended Strategy A for simplicity).
- On restart: sidecar loads (if present + valid). parkBranch is not relevant — no HEAD moved.
- On restart-during-branch-switch (rare): if the process dies mid-switch, the sidecar may be in an inconsistent state relative to the new branch. Instance-ID defense catches any stale-client reconnect; next L1 writes a fresh sidecar. Covered.

**Answer:** parkBranch doesn't run on restart and doesn't replace the sidecar. They compose cleanly — different problems, different triggers, no overlap.

---

## Q4 — Does the bug class affect shadow-repo attribution?

**Finding:** YES — the bug class causes doubled content to be committed to the shadow repo under `openknowledge-service` attribution. This is a real attribution artifact but not a data-integrity or false-credit problem.

**Code-traced bug-state commit flow:**

1. Server restarts. Client reconnects with stale Y.Doc holding clientID `C_A`.
2. Server's fresh Y.Doc has clientID `C_S_new` (populated from markdown via `updateYFragment`).
3. Yjs sync protocol runs. Client sends sync-step-2 with all its `C_A` items; server sends sync-step-2 with all its `C_S_new` items. Both Y.Docs accumulate BOTH clientID sets.
4. Server's `onUpdate` handler fires for the newly-absorbed `C_A` items. Transaction origin is from the WebSocket protocol layer — `local: false`, origin is typically `undefined` or the remote-sync marker.
5. Hocuspocus debounces L1 (2000ms default). `onStoreDocument` fires.
6. Inside `onStoreDocument` at `persistence.ts:598`: `resolveWriterFromOrigin(lastTransactionOrigin, getPrincipal)` is called.
7. For `origin: undefined` or unclassifiable remote origin: `resolveWriterFromOrigin` returns `null`. Writer is not recorded via `contributor-tracker`. But the markdown file IS written (L1 proceeds normally).
8. L2 debounce fires (`commitDebounceMs` default 15s). `commitToWipRef` at `persistence.ts:261`.
9. `swapContributors()` drains the pending contributor map. If no contributors were recorded (step 7), the `snapshot.size === 0` branch fires at line 268 — commits via `SERVICE_WRITER` (`openknowledge-service`) to `refs/wip/<branch>/openknowledge-service`.

**Result:** the doubled markdown on disk becomes a commit on `refs/wip/<branch>/openknowledge-service`. The commit message is the default `formatWipSubject([])` since `docs` is empty. Author: `Open Knowledge (service)` / `service@openknowledge.local`. No real user or agent is falsely credited.

**Strategy A side-effect check:** When we delete the sidecar on divergent reload:
- Y.Doc is fresh from markdown (bug-class fresh clientID).
- Instance-ID defense fires if a stale client reconnects → client recycles.
- Fresh post-recycle clients + fresh server = normal sync, normal L1, normal L2 commit. No attribution artifact.
- If no client reconnected at all (server was down long enough that all tabs gave up) — sidecar is deleted, fresh markdown is the truth, no orphan commits.

**Code-verified conclusion:** the bug class produces a polluted commit trail in the `openknowledge-service` writer ref (doubled-content commits). Fix at the Y.Doc level (sidecar + instance-ID) prevents the pollution. No existing shadow-repo commits under legitimate writer IDs are corrupted by the bug — attribution integrity is preserved.

**Latent risk:** the polluted service commits exist in shadow repo history from any unfixed bug occurrence. If a user runs `open-knowledge timeline` or queries `/api/timeline` on an affected doc, the service-writer commits will appear in history with doubled content. This is existing pre-fix technical debt; the fix doesn't retroactively clean it. A one-shot migration to sweep / collapse service-writer commits matching known bug-pattern signatures would be a follow-up task if the pollution matters in practice.

**Answer:** Bug class produces doubled content committed under `openknowledge-service` writer. Attribution integrity is preserved (no real writer is falsely credited). Strategy A doesn't create new attribution issues. Existing polluted commits from pre-fix bug occurrences are a separate cleanup concern.

---

## Q5 — Could writer-ID taxonomy inform the sidecar approach?

**Finding:** Writer IDs and Y.Doc clientIDs are orthogonal axes. Embedding a `clientID → writer-ID` mapping in the sidecar would enable attribution continuity across restart, but it's a nice-to-have, not load-bearing for the primary fix.

**Code-verified taxonomy** (from `shadow-repo.ts:400-418` + `shadow-repo-layout.ts` referenced):
- `file-system` — disk writes, reconciliation (`FILE_SYSTEM_WRITER`)
- `git-upstream` — pull imports (`GIT_UPSTREAM_WRITER`)
- `openknowledge-service` — service operations (`SERVICE_WRITER`)
- `agent-<connId>` — per-agent-session writes (via `resolveWriterFromOrigin` matching `session_id`)
- `principal-<UUID>` — per-browser-principal writes (via `resolveWriterFromOrigin` matching `connection.context.principalId`)

**Orthogonality:**
- Y.Doc clientID: ephemeral, 32-bit random, per `new Y.Doc()`. Identifies the Yjs-layer authoring instance.
- Writer ID: durable, per user/agent/classification. Identifies who is responsible for a commit.
- Current mapping (in-memory only): server tracks `clientID → session.origin → writer-id` via `contributor-tracker.ts` + `resolveWriterFromOrigin`. Lost on restart.

**Could the sidecar carry attribution metadata?** Potentially:
```json
{
  "yjsVersion": "13.6.30",
  "formatVariant": "v1",
  "schemaVersion": 1,
  "writtenAt": "2026-04-23T12:00:00Z",
  "clientIdToWriter": {
    "1829076747": "agent-a4f2b91c",
    "3563372259": "principal-6f3a..."
  }
}
```

**Benefit:** on restart, the server reads the sidecar + header, reconstructs the clientID → writer mapping into contributor-tracker state. Subsequent `onStoreDocument` calls can correctly attribute commits for items under pre-restart clientIDs.

**Blocker against doing this today:** the fresh-server scenario (no sidecar, load from markdown) would still produce fresh clientIDs with no attribution. This is inherent to the markdown-as-truth architecture — markdown has no CRDT-level attribution (precedent #9 + auto-persistence D7 both note this).

**Weight:** useful feature for "better attribution across restart" but not required for the primary fix. Easy to add to the header format without breaking the load path. Recommend leaving optional — populate the mapping if the runtime knows it, ignore it on load if the format version doesn't support it.

**Answer:** Writer-ID taxonomy can be embedded optionally in the sidecar header as `clientIdToWriter: Record<number, string>` for post-restart attribution continuity. Not required for the primary fix. Implementation cost: ~10 LOC to write, ~10 LOC to read + restore tracker state.

---

## Q6 — Interaction with rollback, save-version, branch switch

### Rollback (`/api/rollback` at api-extension.ts:2660)

**Current behavior (code-verified):** Reads markdown at `shadow:<commitSha>:<docName>` via `git show`, parses → `schema.nodeFromJSON` → `updateYFragment(document, fragment, pmNode, meta)` under `ROLLBACK_ORIGIN` (paired, skipStoreHooks: false). The MUTATION is applied to the LIVE Y.Doc — clients see it via normal sync.

**Interaction with sidecar:**
- Rollback mutates the Y.Doc. On next L1 debounce, `onStoreDocument` fires. Sidecar is rewritten with current Y.Doc state (which is now the rolled-back state).
- No sidecar invalidation needed — sidecar always mirrors the Y.Doc; rollback mutates the Y.Doc; sidecar updates follow.
- **T7's PASS signal is preserved.** Multi-client replace (which is structurally similar to rollback) passes today without the bug class. The sidecar respects the T7 exemption because `updateYFragment` on the existing Y.Doc preserves the server's clientID.

**Answer:** Rollback composes cleanly with sidecar. No additional code needed.

### Save-version (`saveVersion` at shadow-repo.ts:1086+)

**Current behavior (code-verified):** Creates `refs/checkpoints/<branch>/<sha>` with a full-tree snapshot from current on-disk markdown. Uses current writer WIP refs + `GIT_UPSTREAM_WRITER` as parents for ancestry preservation. Does NOT touch Y.Doc state. Does NOT reset in-memory CRDT.

**Interaction with sidecar:**
- save-version is purely a shadow-repo operation. Y.Doc is unaffected.
- Sidecar is unaffected (it reflects Y.Doc state; Y.Doc didn't change).

**Design question: should named checkpoints snapshot the sidecar?** Rationale: "restore to checkpoint V1" would then preserve CRDT identity. BUT:
- Restoring a checkpoint's sidecar into a live server would produce clientID mismatch with all currently-connected clients (they weren't connected when the sidecar was snapshotted). Instant bug-class-equivalent scenario.
- Y.Doc clientIDs are ephemeral; preserving them across a named-version restore has no product value. The user wants to restore CONTENT, not CRDT identity.
- If the checkpoint's sidecar is restored, the instance-ID defense would fire on the first client reconnect — forcing a clean recycle. Net effect: same as not restoring the sidecar, just with more ceremony.

**Answer:** Named checkpoints should NOT snapshot the sidecar. Restore-to-checkpoint should read only markdown, produce a fresh Y.Doc, and rely on the instance-ID defense + client recycle to sync cleanly. This matches save-version's current (markdown-only) scope.

### Branch switch (onBatchBegin + onBatchEnd at standalone.ts:1138-1401)

**Current behavior (code-verified):**

**onBatchBegin:**
1. L1 + L2 flush (persist current state before HEAD moves)
2. `setBatchInProgress(true)` — gate new writes
3. For each open doc: serialize Y.Doc markdown + reconciledBase → `parkBranch` writes to shadow
4. (parkBranch does NOT mutate Y.Doc — it's a read-only snapshot)

**onBatchEnd (cross-branch):**
1. Drop buffered DiskEvents (wrong-branch state)
2. `switchReconciledBaseScope(newBranch)` (module-level state)
3. Backlink index switch branch
4. For each open doc: read new-branch disk content → `applyToDoc` = `applyExternalChange` → `updateYFragment` under `FILE_WATCHER_ORIGIN`
5. Optionally: `readParkedState(newBranch)` → three-way merge for restore

**Interaction with sidecar — two viable designs:**

**Design A (recommended for v1): delete-on-switch.**
- On onBatchBegin: delete all sidecar files in the current branch scope (before parkBranch).
- On onBatchEnd: no-op for sidecar (fresh on next L1 debounce).
- Rationale: T5 (branch switch with live tab) PASSES today without the bug class. `updateYFragment` on existing Y.Doc preserves server clientID. The sidecar isn't needed to prevent the bug during branch switch — branch switch is bug-exempt.
- Trade-off: on branch switch AND then immediate restart, the post-restart reload is from markdown (no sidecar) — the instance-ID defense handles any stale clients. No user-visible regression.

**Design B (optional): per-branch sidecar directories.**
- Path: `<contentDir>/.open-knowledge/ystate/<branch>/<docName>.bin`
- On branch switch: change the scope directory. No copy, no delete.
- On return to a prior branch: old sidecar loads if present (preserves CRDT identity across branch re-visits).
- Trade-off: more complex GC (when to delete old-branch sidecars?). Possibly more complex filesystem operations.

**Answer:** Design A (delete-on-switch) is simpler and matches T5's existing passing behavior. Design B is an optional enhancement for better CRDT-identity continuity across branch re-visits; defer unless specifically requested.

---

## Q6-adjacent: safetyCheckpoint as sidecar-operation wrapper?

**Finding:** The shadow repo's `safetyCheckpoint` (shadow-repo.ts:477-498) could optionally wrap sidecar-deleting operations (Strategy A divergent reload) to provide a rollback point. This is belt-and-suspenders protection.

**Mechanism:** `safetyCheckpoint(shadow, contentRoot, { action: 'sidecar-divergent-reload', context: {docName} })` commits a pre-action snapshot of current markdown to `refs/wip/<branch>/openknowledge-service`. If the subsequent sidecar-delete + markdown-reload goes wrong (e.g., markdown parse fails in a way the current codebase doesn't handle), the shadow commit provides a recovery point.

**Cost:** ~1 extra shadow commit per divergent reload. Cheap — divergent reloads are rare events (requires external disk edit during downtime).

**Value:** small but non-zero. Gives operators a traceable pre-reload state. Could be opt-in via a feature flag.

**Answer:** Optional enhancement. Not load-bearing for the primary fix but worth considering as part of the implementation for belt-and-suspenders safety.

---

## Synthesis

**The shadow repo and the sidecar occupy different architectural layers:**

| Layer | Purpose | State preserved | Cross-restart? |
|---|---|---|---|
| Shadow repo | Attribution history + rescue artifacts + named checkpoints | Markdown + actor metadata | YES (durable) |
| Sidecar | CRDT operational cache for restart recovery | Yjs binary state (clientID + items) | YES (happy path) |
| Markdown on disk | Source of truth | Current markdown text | YES (durable) |
| In-memory Y.Doc | Live CRDT state | Full Y.Doc | NO (process-scoped) |

**The shadow repo already recovers markdown + attribution across restart. It cannot recover CRDT state — it stores the wrong format.**

**The sidecar fills the specific gap: CRDT state recovery across process restart.** It is narrowly scoped and avoids stepping on any shadow-repo responsibility.

**Composition model:**
- On restart: sidecar loads (if valid). Shadow repo is unchanged (no read, no write). Markdown-reload fallback engages if sidecar fails — in which case shadow-repo history is intact for attribution queries.
- On branch switch: parkBranch runs (unchanged). Sidecar deleted. After switch, sidecar regenerates on first L1 debounce.
- On rollback / save-version: shadow repo operates (unchanged). Sidecar follows Y.Doc state automatically.
- On normal L1/L2: shadow repo commits markdown with attribution (unchanged). Sidecar writes binary.

**No shadow-repo code changes are needed for the primary fix.** The sidecar is additive.

**Two optional enhancements surfaced:**
1. Embed `clientID → writer-ID` mapping in sidecar header for post-restart attribution continuity (~20 LOC, feature-forward).
2. Wrap divergent reload in `safetyCheckpoint` for pre-reload recovery point (~5 LOC, belt-and-suspenders).

**One latent concern surfaced:**
- Pre-fix bug occurrences have left doubled-content commits in `refs/wip/<branch>/openknowledge-service`. Not retroactively cleaned by the fix. Worth a separate one-shot migration if it causes timeline-panel noise in practice.

---

## Gaps / follow-ups

- **`resolveWriterFromOrigin` behavior on remote-sync origin** (Q4) — I inferred from grep that remote-WS origins produce `null`. Not source-verified at the `Hocuspocus.ts` WebSocket handler level.
- **parkBranch's disk-snapshot consumption on restore** — `reconcile` three-way merge referenced but not traced through `reconciliation.ts`. The interaction with sidecar (if both exist) not verified.
- **Per-branch sidecar directory GC** — Design B trade-offs not fully explored. Deferred to implementation if Design A proves insufficient.
- **Cross-restart contributor-tracker continuity** — the optional `clientID → writer-ID` mapping in the sidecar header would require `contributor-tracker` to accept a restore operation. Not currently supported.
