---
title: y-indexeddb adoption for OK CRDT restart recovery
description: Evaluates whether adopting yjs/y-indexeddb on the client would replace any part of PR #311, and if so, which shape of adoption is architecturally correct.
topics: [crdt, yjs, persistence, restart-recovery, hocuspocus, offline-support, indexeddb]
subjects: [y-indexeddb, HocuspocusProvider, ProviderPool, sidecar.ts, persistence.ts, server-instance-id, PR-311]
date: 2026-04-24
evidenceCount: 7
---

# y-indexeddb adoption for OK CRDT restart recovery

## Executive summary

**The question:** PR #311 introduces a server-side Yjs binary sidecar + server-instance-ID defense to fix CRDT content duplication across server restart. Would adopting [yjs/y-indexeddb](https://github.com/yjs/y-indexeddb) — the canonical client-side Yjs-on-IndexedDB persistence provider — replace any of that work?

**The answer:** y-indexeddb replaces **~18% of PR #311's LOC** (the server-side `sidecar.ts` module and its integration, ~1100 LOC) and adds **~230 LOC** of new client wiring. It does **NOT** replace the other ~82% (server-instance-ID generation + broadcast, Zod-typed auth-token schema, `onAuthenticate` rejection, client-side `authenticationFailed` → recycle handler, 11-test suite). That 82% is load-bearing for the bug-class fix and remains necessary in every scenario.

**The recommendation:** **Ship PR #311 as-is (Shape 0).** Then, in a follow-on PR, consider layering y-indexeddb on top (Shape 1 — dual-layer). Do **NOT** replace the server-side sidecar with y-indexeddb (Shape 2) — the LOC savings (~900 net) come at the cost of (a) losing preserved unsynced edits on the degraded-path recycle and (b) shifting durability from server (disk) to client browser (IDB, with quota + eviction variance). Shape 1 as an additive follow-on captures y-indexeddb's genuine UX value (instant Cmd-R render, offline editing) without regressing anything in PR #311.

**Confidence:** HIGH on the component map (D3 — direct code inspection), HIGH on "y-indexeddb alone is insufficient" (D2 — CRDT item semantics), HIGH on maintenance signals (D6 — verified commit history + issue tracker), MEDIUM on UX value estimation (no user research; derived from ecosystem convention).

---

## Research rubric

Confirmed with user on 2026-04-24. Seven dimensions, all with P0 priority except D5-D7 at P1.

| ID | Dimension | Priority | Evidence file |
|----|-----------|---------:|---------------|
| D1 | y-indexeddb API + primitive surface | P0 | [d1-y-indexeddb-primitive-surface.md](evidence/d1-y-indexeddb-primitive-surface.md) |
| D2 | Yjs meshed-provider model (IDB + Hocuspocus composition) | P0 | [d2-yjs-meshed-provider-model.md](evidence/d2-yjs-meshed-provider-model.md) |
| D3 | PR #311 component map — what y-indexeddb replaces | P0 | [d3-pr311-component-map.md](evidence/d3-pr311-component-map.md) |
| D4 | OK codebase touchpoints for adoption | P0 | [d4-ok-codebase-touchpoints.md](evidence/d4-ok-codebase-touchpoints.md) |
| D5 | What y-indexeddb does NOT solve | P1 | [d5-what-idb-does-not-solve.md](evidence/d5-what-idb-does-not-solve.md) |
| D6 | Integration constraints + risks | P1 | [d6-integration-constraints-risks.md](evidence/d6-integration-constraints-risks.md) |
| D7 | Alternative adoption shapes + recommendation | P1 | [d7-alternative-adoption-shapes.md](evidence/d7-alternative-adoption-shapes.md) |

---

## Key findings

### 1. y-indexeddb is small, stable, and composes trivially with HocuspocusProvider (D1, D2)

- **Library size:** 184 LOC total. Single exported class `IndexeddbPersistence`. Two IDB stores per doc: `updates` (auto-incrementing binary updates) + `custom` (kv metadata).
- **Meshed-provider pattern is canonical:** documented by Yjs, [Tiptap/Hocuspocus examples](https://tiptap.dev/docs/hocuspocus/provider/examples), and the `docs.yjs.dev/getting-started/allowing-offline-editing` guide. Construction is order-independent — just attach both providers to the same `Y.Doc`.
- **Origin filtering prevents feedback loops:** `_storeUpdate` filters `origin !== this` so IDB hydration doesn't re-persist its own restore, and HocuspocusProvider-originated updates DO get persisted. This is the same primitive OK's bridge already uses for `OBSERVER_SYNC_ORIGIN`.
- **Sync order in practice:** IDB resolves synchronously (ms-scale); WebSocket handshake is slower (100–2000ms). IDB hydration typically wins; HocuspocusProvider syncs on top via standard state-vector delta exchange. HocuspocusProvider tolerates a pre-populated Y.Doc — the sync protocol is delta-based, not snapshot-based.

### 2. y-indexeddb alone does NOT fix PR #311's bug class (D2, D5)

The specific bug is: server restart → fresh server `clientID` → `updateYFragment` produces items under new clientID → client's preserved items under old server's clientID are NOT structurally deduplicated against the new server's items → content duplicates at the markdown-serialization layer.

**y-indexeddb preserves CLIENT-side Y.Doc state across reload, not across server restart.** Concretely:

```
Client IDB state: items under {(S1, …), (C1, …)}   where S1 = pre-restart server clientID
Server restarts. updateYFragment produces items under {(S2, …)}
Client reconnects with IDB-restored state. State-vector exchange → both send deltas.
Final state: items under {S1, C1, S2} — S1 and S2 encode the SAME markdown content under
different Yjs identities → content doubles.
```

**The instance-ID defense is what cuts this path.** Server rejects the claim in `onAuthenticate`; client's pool receives `authenticationFailed` with `reason: 'server-instance-mismatch'`, nulls its cached claim, and recycles all entries BEFORE any Yjs sync message runs. That's what prevents the additive merge.

Therefore: y-indexeddb cannot substitute for the instance-ID defense. Both mechanisms exist in different layers addressing different concerns.

### 3. PR #311 component map: 82% is instance-ID defense, 18% is server-side sidecar (D3)

Components grouped by what each scenario would do with them:

| Component group | LOC | Replaceable by y-indexeddb? |
|---|---:|---|
| Server-side sidecar (`sidecar.ts` + `sidecar.test.ts` + persistence integration + branch-switch delete) | ~1100 | **YES** (with equivalent client-side machinery) |
| Server-instance-ID generation + `/api/server-info` endpoint + CC1 `server-info` channel + `onAuthenticate` enforcement | ~170 | NO |
| Auth-token Zod schema + validation | ~77 | NO |
| Client-side `ProviderPool.cachedServerInstanceId` + `buildAuthToken()` + `onAuthenticationFailed` + `recycleAllEntries` | ~80 | NO |
| `DocumentContext.tsx` boot-time `/api/server-info` fetch | ~32 | NO |
| `SystemDocSubscriber.tsx` CC1 `server-info` listener | ~26 | NO |
| `packages/app/src/lib/cc1.ts` `parseCC1ServerInfo` | ~39 | NO |
| Test harness + 11-test behavioral suite (T1–T11) | ~1700 | NO (behavioral, not mechanism-specific) |

Adoption requires adding ~130–230 LOC of new client wiring + branch-switch handling. So net LOC delta is **~−900 LOC in Scenario A** (remove sidecar, add client IDB) or **+~230 LOC in Scenario B** (add client IDB on top of sidecar).

### 4. Codebase touchpoints are narrow and localized (D4)

Adoption requires touching:

- `packages/app/src/editor/provider-pool.ts` (~6 LOC) — construct `IndexeddbPersistence(docName, provider.document)` in `open()`; destroy in recycle/dispose paths.
- `packages/app/tests/integration/test-harness.ts` (~20 LOC) + `bunfig.toml` preload (`fake-indexeddb/auto`).
- `packages/app/src/editor/sync-promise.ts` (optional, ~50 LOC) — if we want the instant-IDB-render UX during initial load.
- Branch-switch coordination: CC1 `branch-switched` channel + client-side `idbPersistence.clearData()` + `recycleAllEntries` (~100–200 LOC if Scenario A; unchanged server-side delete in Scenario B).

No changes to: `DocumentContext.tsx`, `SystemDocSubscriber.tsx`, client observers, editor cache, shadow repo, or persistence. `__system__` Y.Doc is ephemeral — should NOT be persisted to IDB.

### 5. Adoption risks are "degrades gracefully" rather than "breaks correctness" (D5, D6)

Known limitations of y-indexeddb:

- **Fire-and-forget write path:** no quota-exceeded handling. Silently drops writes if browser quota hits.
- **No multi-tab live coordination:** two tabs on same origin without a network provider diverge locally; reconcile only through Hocuspocus round-trip. Non-issue when server is up; UX hiccup during offline multi-tab.
- **Mobile Safari fetch failures** ([issue #44](https://github.com/yjs/y-indexeddb/issues/44), unresolved since Aug 2025) — uncatchable error crashes page. Mitigation: wrap construction in try/catch and fall through to Hocuspocus-only.
- **IDB growth on passive refresh** ([issue #31](https://github.com/yjs/y-indexeddb/issues/31), unresolved since Jun 2023) — bloat until PREFERRED_TRIM_SIZE=500 compaction. Mitigation: `patchedDependencies` (OK already has this pattern for `remark-prosemirror`).
- **Y.applyUpdate infinite loop on corrupt bytes** ([yjs #479](https://github.com/yjs/yjs/issues/479)) — low probability / high consequence. Pre-existing risk that also applies to PR #311's server-side sidecar. Not a y-indexeddb-specific new risk.
- **Browser quota eviction:** Chrome LRU-evicts at 80% disk full; Safari ITP clears after 7 days. Markdown remains authoritative → degrades to today's "rebuild Y.Doc from markdown on open" behavior. No correctness regression.

Maintenance signals:

- **Library is in low-activity-but-stable mode.** Latest version 9.0.12 (~2 years ago); one merge in 2025 (typo fix). Five open issues, some 2+ years old without maintainer response.
- **~80,515 weekly npm downloads.** Non-trivial adoption across the ecosystem.
- **Peer dep on yjs is loose** — compatible with 13.6.x line. Yjs 14 upgrade path is uncertain.

None of these are blockers. All have small, well-understood mitigations.

### 6. Shape 3 (y-indexeddb only, no instance-ID) is NOT viable; Shape 2 requires `clearData()` on recycle (D7)

Shape 3 fails because both pre-restart and post-restart server items would appear in the final Y.Doc state (both `S1` and `S2` items present, encoding the same markdown content under different Yjs identities).

Shape 2 (y-indexeddb replaces sidecar, instance-ID defense preserved) requires a crucial additional step: when `authenticationFailed` fires, the client must `idbPersistence.clearData()` BEFORE recycling. Otherwise, the client's IDB is "polluted" with pre-restart-server items that would reintroduce the bug on the next provider hydration. This `clearData()` loses any unsynced edits still in IDB — same UX gap as PR #311's explicit out-of-scope "buffer-and-replay" deferral, without PR #311's server-side sidecar redundancy that would otherwise have preserved them.

---

## Recommendation

**Shape 0 — ship PR #311 as-is.** Instance-ID defense + server-side sidecar + 11-test suite.

**Shape 1 as a follow-on PR** — add y-indexeddb as a complementary client-side layer. Purely additive; ~230 LOC. Gains:

- Cmd-R instant render (no server round-trip during tab reload).
- Offline editing continues when Hocuspocus is down.
- Tab-close-then-reopen retains unsynced local state.

Shape 1's value is orthogonal to the bug-class fix. It doesn't change PR #311's shipped behavior; it just adds a new UX layer on top.

**Do NOT do Shape 2.** The LOC savings (~900) come with behavioral regressions (lost unsynced edits on degraded path; shifted durability to browser IDB with its platform variance). The architectural "cleanup" is attractive on paper but introduces new edge cases without proportional benefit.

**Do NOT do Shape 3.** Not viable — CRDT merge semantics don't allow it.

---

## Dimension-by-dimension analysis

See the seven evidence files in `evidence/` for full depth. The short-form:

- **D1** — y-indexeddb's internal API is 184 LOC. Small, patchable, well-understood. Two IDB stores, origin-filtered write path, `whenSynced` promise contract, `destroy()` preserves data vs `clearData()` wipes.

- **D2** — Yjs updates are commutative, associative, and idempotent. Meshed providers on same Y.Doc converge automatically. Origin filtering prevents feedback loops. HocuspocusProvider tolerates pre-populated Y.Doc via delta-based sync protocol. But: y-indexeddb alone does NOT prevent duplicate-content items on server restart because `updateYFragment`-under-fresh-clientID is a separate mechanism.

- **D3** — 82% of PR #311's LOC is the instance-ID defense + auth-token schema + client-side recycle + test suite. 18% is the server-side sidecar. y-indexeddb can only replace the 18%, and only with equivalent client-side machinery.

- **D4** — Codebase integration is surgical: provider-pool + test harness + optional sync-promise change. `__system__` Y.Doc does NOT need IDB. Observers, editor cache, shadow repo are all orthogonal. Branch-switch coordination is the load-bearing new concern in Scenario A.

- **D5** — y-indexeddb does NOT solve: (1) the duplicate-content bug class, (2) multi-tab live coordination, (3) quota-exceeded handling, (4) schema migrations, (5) Y.applyUpdate infinite loop, (6) Safari private-mode. Each limitation has a workaround.

- **D6** — Production risks are all low severity or low probability. Maintenance signals show low-activity but stable; library is patchable via `patchedDependencies`. No yjs-version incompat today. Electron + desktop browsers are the primary OK targets and the highest-reliability IDB environments.

- **D7** — Shape 0 (ship PR #311 as-is) recommended. Shape 1 (add IDB layer as follow-on) recommended as natural next step. Shape 2 (replace sidecar with IDB) not recommended due to degraded-path regressions. Shape 3 (IDB-only, no instance-ID) not viable — CRDT item semantics forbid it.

---

## Out of scope

- **Formal UX validation** of "Cmd-R feels faster" as a product value proposition. Would need quantitative measurement.
- **Measuring quota behavior** under real browser conditions. `fake-indexeddb` in bun-test cannot simulate quota failures. Deferred to post-merge Playwright verification if Shape 1 is adopted.
- **`y-broadcastchannel` adoption** for live multi-tab offline sync. Orthogonal to this research. Revisit if "offline multi-tab" becomes a product concern.
- **Worker-thread isolation of `Y.applyUpdate`** as a defense against issue #479 infinite loop. Adds significant complexity; not required for PR #311 scope; pre-existing risk applies equally to Shape 0's server-side sidecar.
- **Schema migrations for client-side Yjs state cache.** Current thinking: `provider.clearData()` + refetch from server is acceptable for breaking migrations.
- **Detailed user-research on "offline editing"** as a product capability. If OK ever positions offline as a first-class feature, Shape 1 becomes load-bearing; today it's a convenience.

---

## Sources

- [y-indexeddb source (GitHub)](https://github.com/yjs/y-indexeddb) — library source (184 LOC), local clone at `~/.claude/oss-repos/y-indexeddb/`
- [Yjs docs — y-indexeddb page](https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb)
- [Yjs docs — allowing offline editing](https://docs.yjs.dev/getting-started/allowing-offline-editing)
- [Tiptap/Hocuspocus provider examples](https://tiptap.dev/docs/hocuspocus/provider/examples)
- [Yjs forum — IndexedDB + WebSocket data loss thread](https://discuss.yjs.dev/t/local-data-lost-with-indexeddb-websocket-providers/1816)
- [Yjs issue #479 — applyUpdate infinite loop on corrupt bytes](https://github.com/yjs/yjs/issues/479)
- [y-indexeddb issue #44 — Mobile Safari fetch failures](https://github.com/yjs/y-indexeddb/issues/44)
- [y-indexeddb issue #31 — doc grows on passive refresh](https://github.com/yjs/y-indexeddb/issues/31)
- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- `reports/crdt-server-restart-recovery/REPORT.md` — this repo's prior research on the restart-recovery architecture; PR #311's spec basis
- 1P inspection: `git diff origin/main --stat` + spot reads of `packages/server/src/sidecar.ts`, `packages/server/src/persistence.ts`, `packages/app/src/editor/provider-pool.ts`, `packages/app/src/components/SystemDocSubscriber.tsx` at worktree head

---

## Decision log

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Keep PR #311's instance-ID defense in every adoption scenario | D2 + D5: y-indexeddb cannot substitute for this layer; the bug returns without it | D2, D5 |
| Frame the decision as "replace sidecar" vs "augment with IDB" — these are the only two architecturally sensible shapes | D7: Shape 3 (IDB-only) is CRDT-infeasible; Shape 0 (status quo) is current; Shape 1 (augment) and Shape 2 (replace) are the real choices | D7 |
| Ship PR #311 as-is; defer IDB adoption to a follow-on | Shape 1 is additive + preserves existing behavior; Shape 2 is a lateral move with regressions | D7 |
| Do NOT persist `__system__` Y.Doc to IDB | Ephemeral channels; no user content; wastes space without benefit | D4 |
| Pin y-indexeddb at 9.0.12 if adopted; prepare `patchedDependencies` for issue #31 | Low-activity upstream + known bloat issue with community-validated patch | D6 |
