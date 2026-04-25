---
title: Yjs client-persistence alternatives (and implementation plan for replacing OK's sidecar)
description: Surveys maintained alternatives to y-indexeddb; concludes upstream y-indexeddb is the only production-grade choice; presents Shape 2+ (y-indexeddb with buffer-and-replay) as the architecturally-correct replacement for PR #311's server-side sidecar; delivers end-to-end implementation plan.
topics: [crdt, yjs, persistence, restart-recovery, hocuspocus, y-indexeddb, OPFS, SQLite-WASM, y-sweet, buffer-and-replay, offline-support]
subjects: [y-indexeddb, "@toeverything/y-indexeddb", "@y-sweet/client", y-localforage, y-pouchdb, OPFS, SQLite-WASM, PGlite, RxDB, TinyBase, ProviderPool, Shape-2-plus, PR-311]
date: 2026-04-24
evidenceCount: 8
---

# Yjs client-persistence alternatives (and OK sidecar replacement plan)

## Executive summary

**The question:** Are there reputable alternatives to `yjs/y-indexeddb` that fit OK's stack? If so, how do they compare for replacing PR #311's server-side sidecar?

**The answer:** No reputable drop-in alternatives exist. The Yjs client-persistence ecosystem has effectively one production-grade library — `yjs/y-indexeddb` — and that is unchanged from the prior report's finding. Every other surveyed option is either abandoned (`@toeverything/y-indexeddb`), architecturally incompatible (y-sweet is a full Hocuspocus replacement, not a persistence layer), insufficient (y-localforage is a 5-star individual effort), or vaporware (y-opfs, y-pouchdb). DIY routes (custom IDB, OPFS, SQLite-WASM) are all feasible but each requires significant original engineering and offer no production precedent for Yjs.

**The recommendation (REVISED from prior report):** Adopt **Shape 2+** — y-indexeddb PLUS buffer-and-replay on mismatch-recycle, ELIMINATING the server-side sidecar entirely. This reverses the prior report's "ship Shape 0" recommendation because that prior analysis evaluated Shape 2 WITHOUT buffer-and-replay, which has a legitimate unsynced-edit regression. Shape 2+ (with buffer-and-replay) closes that regression cleanly at ~50-100 LOC of client-side machinery, achieving all of Shape 0's correctness properties AND eliminating ~1100 LOC of server-side sidecar code.

Net change: roughly LOC-neutral (~+10 LOC net), but shifts complexity to the idiomatic Yjs-ecosystem pattern (client-side persistence is canonical; server-side binary sidecar is a Jupyter-specific port). Also captures UX wins: instant Cmd-R, offline editing, no sub-L1-debounce server-side-only loss window.

**Implementation plan:** 8 phases, TDD-anchored, with `/tdd` + `/type-safety` skills loaded at start and `/qa-plan` + `/qa` + `/nest-claude` dispatched for end-to-end validation. Full spec in D8 and at [`~/.claude/plans/client-persistence-replaces-sidecar.md`](../../..//.claude/plans/client-persistence-replaces-sidecar.md).

**Confidence:** HIGH on the landscape survey (D1 — exhaustive npm + GitHub sweep via three parallel research dispatches). HIGH on Shape 2+ correctness (D4 — follows from CRDT item semantics + explicit unsynced-buffer design). MEDIUM-HIGH on LOC estimates (D7 — based on current worktree diff analysis; may vary ±10% at implementation).

---

## Research rubric

Confirmed with user on 2026-04-24. Eight dimensions.

| ID | Dimension | Priority | Evidence file |
|----|-----------|---------:|---------------|
| D1 | Alternatives inventory (ecosystem survey) | P0 | [d1-alternatives-inventory.md](evidence/d1-alternatives-inventory.md) |
| D2 | Stack-fit evaluation (Bun, TS strict, Electron, Hocuspocus) | P0 | [d2-stack-fit-evaluation.md](evidence/d2-stack-fit-evaluation.md) |
| D3 | Feature parity matrix vs y-indexeddb | P0 | [d3-feature-parity-matrix.md](evidence/d3-feature-parity-matrix.md) |
| D4 | Correctness under PR #311 scenarios (Shapes 1/2/2+/3) | P0 | [d4-correctness-under-pr311-scenarios.md](evidence/d4-correctness-under-pr311-scenarios.md) |
| D5 | Durability + performance (quota, eviction, hydration speed) | P1 | [d5-durability-performance.md](evidence/d5-durability-performance.md) |
| D6 | Maintenance signals | P1 | [d6-maintenance-signals.md](evidence/d6-maintenance-signals.md) |
| D7 | Integration cost (LOC, files, tests, patches) | P1 | [d7-integration-cost.md](evidence/d7-integration-cost.md) |
| D8 | Implementation plan (operational spec) | P1 | [d8-implementation-plan.md](evidence/d8-implementation-plan.md) |

---

## Key findings

### 1. The alternatives landscape is empty beyond y-indexeddb (D1)

Sixteen candidates surveyed across npm, GitHub, Yjs ecosystem pages, and community discussions. Post-filter for "maintained + browser-compatible + HocuspocusProvider-mesh-compatible":

- ✅ **yjs/y-indexeddb** — the baseline. 184 LOC, stable, low-activity, ~80K weekly downloads.
- ⚠️ **DIY Yjs-on-IDB** — viable; higher implementation cost.
- ⚠️ **DIY Yjs-on-OPFS** — viable but significant engineering (Worker boundary + multi-tab coordination + Bun test gap). No precedent library.
- ⚠️ **DIY Yjs-on-SQLite-WASM** — too heavy; WASM bundle + no Yjs precedent.

Rejected:
- `@toeverything/y-indexeddb`: abandoned; AFFiNE team removed it from their monorepo and replaced with workspace-private `@affine/nbstore`. Transitive dep is unpublished → supply-chain risk.
- `y-sweet`: a full Hocuspocus replacement, not a persistence layer. Mutually exclusive with our stack.
- `y-localforage`, `y-pouchdb`, `y-opfs`: individual efforts, vaporware, or never materialized.
- `yjs/y-leveldb`: Node.js only (server-side) — out of scope for client persistence.
- `y-op-sqlite`, `y-expo-sqlite`: React Native only — not applicable.
- `RxDB`, `TinyBase`: architecturally wrong shape (too heavy / use Yjs as destination not source).

**Short version:** the Yjs client-persistence ecosystem has one library. There is no better choice.

### 2. Storage backend is orthogonal to the bug-fix (D3, D4)

For every PR #311 scenario (T1-T11), the correctness outcome is determined by:
- (a) server-instance-ID defense catching mismatch BEFORE Yjs sync runs, AND
- (b) `clearData()` on the client persistence during recycle, AND
- (c) buffer-and-replay preserving unsynced edits across the clearData wipe, AND
- (d) branch-switch invalidation via CC1 signal.

None of these depend on which storage substrate (IDB / OPFS / SQLite-WASM) the client uses. Picking between y-indexeddb and a DIY backend is purely a **stack-fit + engineering-cost** decision. y-indexeddb wins.

### 3. Shape 2+ closes the unsynced-edit regression of raw Shape 2 (D4)

The prior report recommended against Shape 2 (y-indexeddb replaces sidecar) because the recycle-time `clearData()` loses unsynced edits, which PR #311's server-side sidecar preserved at the L1-debounce window.

**Shape 2+ fixes this** by computing the unsynced delta BEFORE clearData:

```
On authenticationFailed (reason='server-instance-mismatch'):
  unsyncedBytes = Y.encodeStateAsUpdate(doc, lastServerSyncedSV)  ← memory-buffered
  persistence.clearData()
  provider.destroy()
  → fresh provider + persistence + open
  → await provider.on('synced')
  Y.applyUpdate(newDoc, unsyncedBytes)  ← replay buffer
  → HocuspocusProvider auto-syncs replayed items to fresh server
```

The buffer contains ONLY items under the client's own clientID created after the last server-acknowledged sync vector. Pre-restart server items are NOT in the buffer → no duplication. Client's unsynced typing IS in the buffer → preserved.

Net: Shape 2+ achieves every correctness property Shape 0 achieved, PLUS:
- Instant Cmd-R UX.
- Offline editing across tab close.
- Eliminates the server-side sidecar (~1100 LOC) and the `.open-knowledge/ystate/` directory convention.

The trade-off: ~50-100 LOC of buffer-and-replay machinery on the client. Worth it.

### 4. Integration cost is roughly LOC-neutral (D7)

| Category | LOC |
|----------|-----|
| Eliminated (server-side sidecar + tests + docs) | ~−1054 |
| Added (client-persistence wrapper + buffer-and-replay + CC1 branch-invalidation + tests + docs + patch) | ~+1064 |
| **Net delta** | **~+10 LOC** |

Net-zero LOC but idiomatic Yjs-ecosystem pattern replaces a Jupyter-port pattern. Cleaner architecturally.

### 5. TDD-anchored phased rollout (D8)

Eight phases, each independently testable:

- Phase 0: Setup (skill loads, deps, bunfig).
- Phase 1: Remove server-side sidecar. Expected intermediate state: 6 tests go red.
- Phase 2: Create `client-persistence.ts` primitive + buffer-and-replay helpers. Unit-tested in isolation.
- Phase 3: Wire into ProviderPool. Buffer-and-replay fires on `authenticationFailed`. Tests go from 6 red to 0 red. Adds T12, T13, T14.
- Phase 4: Branch-switch CC1 signal + client-side invalidation. T5 updated.
- Phase 5: Composition hardening for managed-rename + external-edit scenarios.
- Phase 6: OTel instrumentation + documentation.
- Phase 7: QA via `/qa-plan` + `/qa` + `/nest-claude`.

Full phase-by-phase spec in D8 and at `~/.claude/plans/client-persistence-replaces-sidecar.md`.

---

## Why this reverses the prior report's recommendation

The prior [y-indexeddb adoption report](../y-indexeddb-adoption-for-ok-restart-recovery/REPORT.md) recommended Shape 0 (ship PR #311 as-is) with Shape 1 (add IDB on top) as a follow-on. It evaluated Shape 2 as "not recommended" due to the unsynced-edit regression.

That analysis was correct for **raw Shape 2** (clearData without preservation). It did NOT evaluate **Shape 2+** (with buffer-and-replay).

Shape 2+ achieves:
- Every correctness property Shape 0 has.
- Every UX property Shape 1 adds.
- Elimination of the server-side sidecar (neither Shape 0 nor Shape 1 achieves this).

Greenfield-mindset directive: "NO DEFERRED TECH DEBT; optimize for best architecture + clean codebase + best product experience." Shape 2+ satisfies all three:
- Best architecture: client-side persistence is idiomatic; server stays markdown-authoritative per precedent #1.
- Clean codebase: -1100 LOC of Jupyter-port, +1100 LOC of Yjs-idiomatic client code.
- Best product: instant Cmd-R, offline editing, restart-invisible.

---

## Anti-recommendations

### Do NOT adopt `@toeverything/y-indexeddb`

Abandoned. Transitive dep `@toeverything/y-provider` is NOT published to public npm — installation is a time bomb. Any "use AFFiNE's fork instead" intuition should be declined.

### Do NOT build DIY OPFS just for this

OPFS gains become material only at Y.Doc state sizes >10MB single doc. OK's markdown workload is far below that. OPFS would add ~500-1000 LOC of Worker + multi-tab coordination + Bun-test-gap plumbing for zero user-visible benefit.

### Do NOT build DIY SQLite-WASM

Bundle cost (400-1000 KB WASM) + no Yjs precedent + engineering complexity makes it unjustifiable for a capability y-indexeddb handles adequately.

### Do NOT adopt y-sweet as a persistence alternative

y-sweet is a full CRDT collaboration stack (Rust server + custom client + S3 backend). Picking it means replacing Hocuspocus AND the Hocuspocus server — an architectural migration outside the scope of "client-side persistence."

### Do NOT ship raw Shape 2 (without buffer-and-replay)

It loses unsynced edits on recycle. This is the trap the prior report identified.

---

## Out of scope

- **y-sweet migration** as an architectural alternative to Hocuspocus. Worth a separate research report if ever contemplated; not on the table today.
- **Server-side persistence alternatives** (e.g., replacing file-per-doc + sidecar with `@hocuspocus/extension-database` + y-leveldb). Different architectural direction; inverts markdown-authoritative primacy (precedent #1). Out of scope.
- **OPFS adoption path**. Parked; revisit if OK starts handling >10MB single Y.Docs.
- **Sub-document support via AFFiNE's nbstore patterns**. AFFiNE's workspace-private nbstore has interesting pluggable-storage abstractions; we can steal ideas but not code. Revisit if OK adds multi-hierarchical doc structures.
- **PGlite + Yjs binding**. Speculative; no prior art; not justified for OK's workload.

---

## Sources

- Prior report: [`reports/y-indexeddb-adoption-for-ok-restart-recovery/REPORT.md`](../y-indexeddb-adoption-for-ok-restart-recovery/REPORT.md)
- [yjs/y-indexeddb](https://github.com/yjs/y-indexeddb)
- [AFFiNE nbstore successor (AGPL)](https://github.com/toeverything/AFFiNE/tree/canary/packages/common/nbstore)
- [AFFiNE PR #6728 removing y-indexeddb](https://github.com/toeverything/AFFiNE/issues/6728)
- [y-sweet (Jamsocket)](https://github.com/jamsocket/y-sweet)
- [y-localforage (@rozek)](https://github.com/rozek/y-localforage)
- [conduit archived y-opfs prior art](https://github.com/ai25/conduit)
- [PowerSync: SQLite persistence on the Web, Nov 2025](https://www.powersync.com/blog/sqlite-persistence-on-the-web)
- [RxDB OPFS RxStorage docs](https://rxdb.info/rx-storage-opfs.html)
- [TinyBase persister docs](https://tinybase.org/api/persister-yjs/)
- [MDN Origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [MDN storage quotas + eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Yjs forum — large-scale persistence thread](https://discuss.yjs.dev/t/how-to-sync-thousands-of-documents-and-have-local-persistent-store/377)
- [yjs/yjs #479 — applyUpdate infinite loop](https://github.com/yjs/yjs/issues/479)
- [y-indexeddb #44 — Mobile Safari fetch failures](https://github.com/yjs/y-indexeddb/issues/44)
- [y-indexeddb #31 — doc grows on refresh](https://github.com/yjs/y-indexeddb/issues/31)
- 1P: current worktree `git diff origin/main --stat`; inspection of PR #311's server-side sidecar + client-side provider-pool

---

## Decision log

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Pick y-indexeddb over DIY approaches | Stack-fit best; ecosystem gravity; tiny LOC; stable library; patchable via existing pattern | D2, D6 |
| Reject y-sweet / @toeverything / y-localforage / y-pouchdb / y-opfs | Survey findings: abandoned, architecturally incompatible, vaporware, or individual efforts | D1 |
| Recommend Shape 2+ over Shape 0 | Greenfield directive: eliminate sidecar if buffer-and-replay closes the regression cleanly. It does, at ~50-100 LOC. | D4, D7 |
| Reject Shape 3 (IDB only, no instance-ID) | CRDT additive merge forbids; duplicates content | D4 |
| Buffer-and-replay preserves unsynced edits via state-vector delta | Yjs primitives (`encodeStateAsUpdate(doc, SV)` + `applyUpdate`) handle this natively | D4 |
| Apply `patchedDependencies` patch to y-indexeddb | Fixes issue #31 (3 LOC) + adds error callback for observability. Low risk; prior art in OK | D6, D7 |
| Branch-switch via CC1 broadcast + client clearData | Matches PR #311's existing CC1 pattern for `server-info`. Lower friction than per-branch IDB namespacing | D4, D7 |
| TDD + type-safety + qa-plan skill chain for execution | Per user directive; matches greenfield-engineer rigor | D8 |
