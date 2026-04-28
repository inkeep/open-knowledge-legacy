# Evidence: D3 — Open Knowledge Architectural Composition (1P)

**Dimension:** D3 — How does dual persistence (Yjs binary sidecar + markdown truth) compose with existing Open Knowledge primitives?
**Date:** 2026-04-23
**Sources:** Open Knowledge monorepo source + prior `auto-persistence-version-history-patterns` report + `bridge-correctness` spec evidence

---

## 1P scope note

This dimension analyzes Open Knowledge's internal codebase per user-explicit request in the research scoping. Findings here should NOT be used as generalizable evidence — they're specific to this monorepo's architecture as of 2026-04-23.

---

## Key sources referenced

- `packages/server/src/persistence.ts` — L1/L2 persistence, `reconciledBase`, `onLoadDocument`, `onStoreDocument`
- `packages/server/src/standalone.ts` — `onBatchBegin`/`onBatchEnd`, HEAD-watcher lifecycle, extension wiring
- `packages/server/src/shadow-repo.ts` — `parkBranch`, `restoreBranchWIP`, `readParkedState`, `commitWip`
- `packages/server/src/agent-sessions.ts` — `AgentSessionManager`, `closeAllForAgent`, per-session `session.origin`
- `packages/server/src/external-change.ts` — `applyExternalChange`, `FILE_WATCHER_ORIGIN`
- `packages/server/src/cc1-broadcast.ts` — `__system__` broadcaster, `isSystemDoc`
- `packages/server/src/boot.ts` — keepalive WS, `/collab/keepalive` lifecycle
- `reports/auto-persistence-version-history-patterns/REPORT.md` §D5 — prior-art framing of the bug

---

## Findings

### Finding 1: The `.open-knowledge/` directory is the natural home for a sidecar binary

**Confidence:** CONFIRMED

**Evidence:** `standalone.ts:189` defines `lockDir = resolve(contentDir, '.open-knowledge')` as the per-project state directory. Already holds `server.lock`, `principal.json`, `conflicts.json`. The directory is part of the project's content dir but is operational metadata — not part of the user's documents.

`/Users/edwingomezcuellar/projects/open-knowledge/.gitignore` does NOT currently gitignore `.open-knowledge/`, but per the auto-persistence report's D5 recommendation ("Store Yjs binary in `.openknowledge/cache/` (gitignored, regenerable from markdown as fallback)"), the sidecar location should be added to gitignore at init-time.

**Implication:** Binary sidecar at `<contentDir>/.open-knowledge/ystate/<docName>.bin` is the idiomatic location. Matches Jupyter's `.jupyter_ystore.db` pattern (disposable cache alongside the source-of-truth text file).

### Finding 2: Shadow repo is NOT the right location for binary sidecar

**Confidence:** INFERRED

**Evidence:** The shadow repo at `.git/open-knowledge/` uses refs `refs/wip/<branch>/<writer-id>` to track per-writer commits. Each commit has a tree containing the content directory's markdown state plus `ok-actor:` metadata. Binary blobs for Yjs state would need to live either:
- (a) As separate refs (`refs/ystate/<docName>`), outside the WIP-ref lifecycle, requiring new GC machinery + atomicity concerns.
- (b) Embedded in WIP commits as additional tree entries, violating the shadow repo's per-writer-text-content convention.

Either option couples the binary cache to git commit lifecycle — which is expensive (blob-hash computation, tree-building) for an ephemeral cache that writes on every L1 debounce.

**Implication:** Sidecar files under `.open-knowledge/ystate/` keep binary-as-cache decoupled from git semantics. The shadow repo's WIP refs already preserve all authored content; binary is just a CRDT-identity preservation cache, not an archival format.

### Finding 3: `onLoadDocument` is the natural binary-load hook

**Confidence:** CONFIRMED

**Evidence:** `persistence.ts:504-581` `onLoadDocument` currently reads markdown → parses → `updateYFragment`. The length-zero guard at `persistence.ts:550` means no double-population. A new path for binary-cache load would:
```
1. Check if <contentDir>/.open-knowledge/ystate/<docName>.bin exists + is valid.
2. If yes: Y.applyUpdate(document, readFileSync(sidecar)). Skip markdown path.
3. If no/invalid: fall through to current markdown path.
4. Either way: setReconciledBase(documentName, ...) with the serialized state.
```

**Implication:** The hook surface is already the right shape. Implementation adds 10-15 LOC of binary-cache-first-then-fallback logic, guarded by format-header validation per D2 Finding 1.

### Finding 4: `onStoreDocument` is the natural binary-write hook

**Confidence:** CONFIRMED

**Evidence:** `persistence.ts:583-739` `onStoreDocument` already handles markdown write on L1 debounce (default 2000ms). Adding `encodeStateAsUpdate(document)` at the same cycle writes both formats atomically-per-debounce (not true atomicity across formats, but they share a drain window).

Key ordering: binary first (cheap, always succeeds if Y.Doc is valid), THEN markdown (involves parser, serializer, file rename). If markdown fails, the binary is already safely on disk — and on next load, the binary reflects the Y.Doc state that would have been written. No split-brain.

**Implication:** Add ~5 LOC to `onStoreDocument` to produce+atomic-write the binary sidecar alongside markdown. Same temp+rename pattern.

### Finding 5: `applyExternalChange` invalidates the sidecar (not the Y.Doc)

**Confidence:** INFERRED

**Evidence:** `external-change.ts:57-98` `applyExternalChange` runs when a disk edit is detected (file-watcher → `handleDiskEvent('update')`). It reconciles disk content into the live Y.Doc via `updateYFragment` + `applyFastDiff` under `FILE_WATCHER_ORIGIN` (paired, skipStoreHooks: true).

For the sidecar:
- Disk edit means markdown has changed WITHOUT going through CRDT.
- The in-memory Y.Doc is still authoritative (applyExternalChange merged into it).
- The sidecar should be REGENERATED on the next `onStoreDocument` cycle — not deleted, not fighted with.
- No new code required — the sidecar write path naturally reflects post-merge state.

**Implication:** External disk edits compose cleanly with the sidecar approach. The existing reconciliation path is unaffected.

### Finding 6: Branch switch (`parkBranch` / `restoreBranchWIP`) requires per-branch sidecar

**Confidence:** INFERRED (architecture design choice)

**Evidence:** `shadow-repo.ts:942-953` `parkBranch` writes current Y.Doc markdown state to `refs/wip/<oldBranch>/<writer-id>` before HEAD moves. `standalone.ts:1193-1401` `onBatchEnd` handles the cross-branch case: resets Y.Docs from new-branch disk state via `applyToDoc` (= `applyExternalChange`).

For the sidecar, branch switch must:
1. Before park: flush the current sidecar for each open doc to `refs/ystate/<oldBranch>/<docName>` OR delete the sidecar (accept ephemeral loss).
2. After switch: attempt to load sidecar for new branch; fall through to markdown reconstruction if missing.

The simpler path is **branch-scoped sidecar directories**: `<contentDir>/.open-knowledge/ystate/<branch>/<docName>.bin`. On branch switch, switch the scope directory (no copy, no git). On branch switch BACK, the old sidecar is still there.

Alternatively, sidecar can be aggressively deleted on branch switch — branch switch already forces a CRDT reset via `applyExternalChange` on all open docs (T5 passing proves this is safe), so there's no live-client stale state to preserve across a switch.

**Implication:** Two viable patterns; the "aggressive delete on branch switch" approach is simpler and matches the T5 passing semantics. Per-branch sidecar directories preserve CRDT identity across branch re-visits, which is a UX nicety but not a correctness requirement.

### Finding 7: Agent sessions are automatically disposed on server restart

**Confidence:** CONFIRMED

**Evidence:** `agent-sessions.ts:353` `AgentSessionManager.getSession` keys by `${docName}\0${agentId}`. The map is in-memory on the `ServerInstance`. On process restart, the map is GC'd. First post-restart agent write creates a NEW `SessionRecord` with a fresh `session.origin` object.

The MCP keepalive WS (`boot.ts:255`) reconnects via exponential backoff with the SAME `connectionId` UUID (per-MCP-process). But the server's session map is new — so the first post-restart agent write creates a fresh session tied to that connectionId. Attribution is preserved via `resolveWriterFromOrigin` extracting `context.session_id` which matches the persistent UUID.

**Implication:** Sidecar approach composes cleanly with agent sessions. Agent writes post-restart land on a Y.Doc loaded from the sidecar (fresh clientID avoided), so no duplication from the agent-write path — matches T6's observation that "post-restart agent write lands once; pre-restart marker duplicated."

### Finding 8: `reconciledBase` is the existing change-detection primitive

**Confidence:** CONFIRMED

**Evidence:** `persistence.ts:197-207` `getReconciledBase` / `setReconciledBase` scoped by `activeBranch`. Used in `onStoreDocument` at `:635-644` to skip the disk write when serialized content matches the last-known-synced markdown.

For the sidecar, `reconciledBase` can gate the BINARY write the same way: if the current `encodeStateAsUpdate` output matches the last-written sidecar bytes, skip. This is a minor optimization (the sidecar write is cheap) but aligns with the existing "debounce + skip-if-unchanged" pattern.

**Implication:** No new gating primitive needed. Existing `reconciledBase` machinery extends to the binary sidecar cleanly.

### Finding 9: `__system__` Y.Doc is the natural transport for server instance ID

**Confidence:** CONFIRMED

**Evidence:** `cc1-broadcast.ts` already provides a stateless broadcast primitive on the `__system__` Y.Doc. Clients open `__system__` on app mount (per CLAUDE.md §CC1 push-over-awareness). Adding a new channel `ch: 'server-info'` with a `{v:1, serverInstanceId}` payload requires ~10 LOC on each side.

**Implication:** Defense-in-depth instance-ID check (D5) uses existing infrastructure. No new WebSocket protocol, no new endpoint required — just a new CC1 channel name.

### Finding 10: Precedent #1 (markdown-first persistence) is preserved

**Confidence:** CONFIRMED

**Evidence:** CLAUDE.md §"Architectural precedents" lists "Generic primitives over specific ones" and the full precedent list. Precedent #1 is "Typed transaction origins" but the broader architectural commitment (per the auto-persistence report's framing) is that markdown is the source of truth, all other representations are derivative.

A sidecar binary explicitly positioned as "disposable cache, regenerable from markdown" respects this precedent. The moment the sidecar is missing, corrupt, or stale, the system falls through to markdown reconstruction — the same path that works today.

Prior-art report's own framing (`REPORT.md:260`): _"This does not change the markdown-canonical principle. Yjs binary is a performance/correctness cache, not a source of truth."_ This framing is already-accepted architectural doctrine.

**Implication:** The sidecar approach is constitutionally compatible with Open Knowledge's architectural commitments. No precedent rework required.

---

## Composition summary

| OK primitive | Interaction with sidecar | Code change |
|---|---|---|
| `persistence.onLoadDocument` | Try sidecar first; fall through to markdown | ~15 LOC |
| `persistence.onStoreDocument` | Write sidecar AND markdown on L1 debounce | ~5 LOC |
| `reconciledBase` | Extends to gate sidecar-write-if-unchanged | No new code; reuse |
| `applyExternalChange` | Sidecar naturally regenerated on next store | No change |
| `parkBranch` / `restoreBranchWIP` | Delete sidecar on branch switch; regenerate after new-branch sync | ~5 LOC |
| `AgentSessionManager` | No interaction; sessions are per-process | No change |
| `__system__` CC1 broadcast | Carries instance ID for defense-in-depth | ~10 LOC |
| `.gitignore` | Add `.open-knowledge/ystate/` | 1 line |
| Shadow repo WIP refs | No interaction; binary stays separate | No change |

**Total estimate:** ~50-70 LOC of new/modified code in the server package, plus a small client-side change in `ProviderPool` for the instance-ID check.

---

## Gaps / follow-ups

- `pycrdt SQLiteYStore` exact schema not read in source — D1 inferred Jupyter's model from docs.
- The "corrupt-sidecar detection" post-apply state assertion needs a specific shape (e.g., `fragment.length > 0 && metaMap.get('frontmatter') === expected`). Exact shape is implementation detail.
- The sidecar GC policy (when to delete stale `.bin` files) not decided — simplest answer is "delete on process shutdown," leaving only fresh-session caches. Longer retention requires thinking through multi-session restart scenarios.
