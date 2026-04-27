# Evidence: D1 — Alternatives inventory (3P survey)

**Dimension:** Catalogue every reputable Yjs-compatible client-side persistence option. Classify each by viability (drop-in candidate, architectural replacement, DIY pattern, abandoned).
**Date:** 2026-04-24
**Sources:** npm registry metadata, GitHub repo inspection, Yjs forum, three parallel research dispatches (`@toeverything/*`, OPFS ecosystem, `y-sweet`/`y-pouchdb`/others).

---

## Survey results

### Table 1: All candidates encountered

| # | Library | Latest ver | Published | Stars | License | Peer dep | Stack-fit | Verdict |
|---|---------|-----------|-----------|-------|---------|----------|-----------|---------|
| 1 | **yjs/y-indexeddb** | 9.0.12 | 2023-11-02 | ~270 | MIT | yjs ^13 | ✅ browser + Electron | **Canonical — primary candidate** |
| 2 | **@toeverything/y-indexeddb** | 0.10.0-canary.9 | 2023-11-01 | (AFFiNE monorepo) | MIT | yjs ^13 | ⚠️ depends on unpublished `y-provider` | **Abandoned + supply-chain risk — DECLINE** |
| 3 | **@affine/nbstore** (successor to #2) | 0.26.3 | ongoing | AFFiNE private | AGPL (workspace) | yjs ^13.6.27 | ❌ `private: true`, not publishable | **Not available to 3P consumers — DECLINE** |
| 4 | **y-sweet (`@y-sweet/client`)** | 0.9.1 | 2025-09-16 | ~989 | MIT | yjs ^13 | ❌ replaces HocuspocusProvider AND server | **Architectural fork, not persistence — DECLINE as persistence option** |
| 5 | **y-localforage** | 0.1.5 | 2024-09-18 | ~5 | MIT | yjs ^13 | ✅ browser | **Individual effort, near-zero adoption — DECLINE** |
| 6 | **y-pouchdb** | (none) | (never published) | — | — | — | — | **Vaporware — DECLINE** |
| 7 | **y-opfs** | (none on npm) | (not published) | — | — | — | — | **Vaporware — DECLINE** |
| 8 | **yjs/y-leveldb** | 0.1.x | active | ~100 | MIT | yjs ^13 | ❌ Node.js only — not browser | **Server-side only — OUT OF SCOPE** |
| 9 | **y-op-sqlite / y-expo-sqlite** | (minor) | 2024 | <50 | MIT | yjs ^13 | ❌ React Native only | **Not browser — OUT OF SCOPE** |
| 10 | **Custom: Dexie.js + Yjs binding** | N/A | DIY | — | N/A | N/A | ✅ (if built) | **DIY pattern — viable but not a library** |
| 11 | **Custom: idb-keyval + Yjs binding** | N/A | DIY | — | N/A | N/A | ✅ (if built) | **DIY pattern — viable but trivial above raw IDB API** |
| 12 | **Custom: OPFS + SyncAccessHandle + Yjs** | N/A | DIY | — | N/A | N/A | ✅ (if built; Worker req'd) | **DIY pattern — original engineering, no prior art library** |
| 13 | **Custom: SQLite-WASM (OPFS) + Yjs** | N/A | DIY | — | N/A | N/A | ✅ (if built; complex) | **DIY pattern — no prior art library; significant engineering** |
| 14 | **Custom: PGlite + Yjs** | N/A | DIY | — | N/A | N/A | ✅ (if built) | **DIY pattern — no prior art, speculative** |
| 15 | **RxDB (with Yjs adapter)** | RxDB 16.x active | 2026 | ~22K | Apache-2.0 | yjs optional | ⚠️ major dep; Yjs is adapter, not primary | **Architectural weight — DECLINE for just-persistence** |
| 16 | **TinyBase (with Yjs persister)** | TinyBase 6.x active | 2026 | ~5K | MIT | yjs optional | ⚠️ Yjs is DESTINATION not SOURCE | **Not a fit for our direction — DECLINE** |

**Candidates that survive the first filter (maintained + browser-compatible + HocuspocusProvider-mesh-compatible):**
- **yjs/y-indexeddb** (baseline, already evaluated in prior report)
- **DIY: custom Yjs-on-IDB library** (hand-rolled; reference patterns exist)
- **DIY: custom Yjs-on-OPFS library** (original engineering; no prior art)
- **DIY: custom Yjs-on-SQLite-WASM (OPFS)** (significant engineering; no prior art)

That's it. **No other maintained public npm package exists that satisfies our constraints.**

---

## Per-candidate detailed assessments

### 1. yjs/y-indexeddb

Covered comprehensively in the prior report at [`reports/y-indexeddb-adoption-for-ok-restart-recovery/`](../y-indexeddb-adoption-for-ok-restart-recovery/REPORT.md). Summary for this survey:
- 184 LOC, single class, two IDB stores, origin filtering, `synced` event.
- Stable + low-activity maintenance (one merge in 2025, typo fix).
- ~80,515 weekly npm downloads; non-trivial ecosystem adoption.
- Known open issues: mobile Safari transient fetch failures (#44), doc growth on passive refresh (#31).
- Patchable via OK's existing `patchedDependencies` pattern if upstream stalls.

### 2. @toeverything/y-indexeddb — DECLINE

**Status:** Effectively deprecated. The AFFiNE team removed it from their monorepo in April 2024 ([PR #6728](https://github.com/toeverything/AFFiNE/issues/6728)) and replaced it with `@affine/nbstore` (workspace-private, not publishable).

**Red flags:**
- Latest publish: 2023-11-01 on `0.10.0-canary.9` tag — no stable release ever.
- Transitive dep on `@toeverything/y-provider@0.10.0-canary.9`, which is **not published to the public npm registry** (returns 404). Installation resolves only via cached npm artifacts — effectively a supply-chain time bomb.
- Peer dep `yjs ^13` — no Yjs 14 compat advertised.
- API shape is different from y-indexeddb's `IndexeddbPersistence` class. Not a drop-in.
- Subdoc-aware lazy provider + workspace-specific `markMilestone`/`revertUpdate` features lock in AFFiNE-specific concepts.

**Could we extract the ideas?** The `nbstore` successor has clean pluggable-storage abstractions (`./idb`, `./sqlite`, `./broadcast-channel`, `./worker/*`) — worth looking at AS INSPIRATION if we ever build our own pluggable persistence layer. But the code itself is AGPL inside AFFiNE's workspace; a clean-room reimplementation would be from zero.

### 3. @affine/nbstore — NOT AVAILABLE

Workspace-private (`"private": true`). Cannot be installed from npm. Only mentioned here for completeness because it's the successor to #2 and may inspire future DIY patterns. Architecture highlights:
- Pluggable storage backends via interface (IDB, SQLite, BroadcastChannel, cloud).
- First-class multi-tab coordination via BroadcastChannel.
- First-class worker support.
- Subdoc-aware.
- AGPL-licensed workspace — not copyable even with attribution.

### 4. y-sweet (Jamsocket) — DECLINE AS PERSISTENCE OPTION

y-sweet is a **full CRDT collaboration stack**, not a persistence library. Picking y-sweet means:
- Replacing HocuspocusProvider with `YSweetProvider`.
- Replacing the Hocuspocus server with the y-sweet Rust server.
- Persistence tier moves to y-sweet's S3-compatible backend.

The `@y-sweet/client` package DOES include an internal IndexedDB layer (`createIndexedDBProvider` in `src/idb.ts`), but it is **not re-exported** and is tightly coupled to `YSweetProvider`'s lifecycle. Cannot be extracted as a standalone y-indexeddb alternative without vendoring the file.

**For our stack** (Hocuspocus + server-auth bridge + shadow repo + markdown truth), y-sweet is off the table unless we also want to migrate the server. That's a separate architectural conversation, not a persistence decision.

### 5. y-localforage — DECLINE

- Individual effort (`@rozek`), 5 GitHub stars, 1 maintainer.
- Last published 2024-09-18. No commit activity since. 
- Uses localForage under the hood — adds WebSQL / localStorage fallback (irrelevant in 2026; IDB is universally supported).
- No HocuspocusProvider integration example in README.
- No Safari / Electron / Bun compatibility testing documented.

Would we bet production correctness on this? No. Baseline is y-indexeddb, which has at least orders-of-magnitude more production usage.

### 6. y-pouchdb — DECLINE (VAPORWARE)

- No npm package exists (`npm view y-pouchdb` → 404).
- Only artifact: a [2022 alpha gist by @samwillis](https://gist.github.com/samwillis/1465da23194d1ad480a5548458864077). Never became a library.
- PouchDB itself is still maintained, but the Yjs binding never materialized.

### 7. y-opfs — DECLINE (VAPORWARE)

- No npm package.
- Only reference: a **private, one-off implementation** inside the archived [ai25/conduit](https://github.com/ai25/conduit) app.
- Author's rationale for building it: IDB's cost of reading multi-MB Y.Doc state at boot. OPFS sidesteps the boot cost but isn't dramatically faster post-boot.
- Requires a Web Worker (sync access handles are Worker-only) + SharedService/Web Locks for multi-tab master-tab ownership + BroadcastChannel for update propagation.
- No one has extracted this into a reusable library.

Building our own would mean:
- ~500-1000 LOC of original engineering.
- Worker message protocol + lifecycle.
- Multi-tab coordination primitive (BroadcastChannel).
- Boot-time hydration + incremental append logic.
- Migration path from y-indexeddb if users have existing IDB state.
- Test harness + Safari + Firefox + Electron coverage.

Significant engineering for marginal (possibly zero) user-visible benefit over y-indexeddb in our workload profile. See D5 for perf details.

### 8. yjs/y-leveldb — OUT OF SCOPE

Node.js only. Valid server-side replacement for persistence-plus-Hocuspocus, but that is a **different architectural conversation** (Hocuspocus's `@hocuspocus/extension-database` adapter family). Not a client-side persistence option. Parked for future consideration if we decide to move server-side persistence away from file-per-doc + sidecar.

### 9. y-op-sqlite / y-expo-sqlite — OUT OF SCOPE

React Native-only. OK's desktop app is Electron; OK's web is a browser app. No React Native target today.

### 10-14. DIY patterns

Listed for completeness:
- **Dexie.js + Yjs binding** — Dexie is a mature IDB wrapper. Could build Yjs-persistence-via-Dexie, but vs. using upstream y-indexeddb directly, the benefit is marginal (API sugar, queryable secondary indexes). Dexie adds ~30KB bundle vs y-indexeddb's tiny footprint.
- **idb-keyval + Yjs binding** — idb-keyval is a trivial IDB wrapper. Building Yjs persistence atop it re-implements most of y-indexeddb's work. Not a net-improvement.
- **OPFS + SyncAccessHandle + Yjs** — see #7 above. Original engineering.
- **SQLite-WASM (OPFS) + Yjs** — SQLite-WASM via wa-sqlite or @sqlite.org/sqlite-wasm is production-real (per [PowerSync's Nov 2025 review](https://www.powersync.com/blog/sqlite-persistence-on-the-web), handles 1GB+ databases where IDBBatchAtomicVFS degrades at ~100MB). But no Yjs binding exists; original engineering required. Workspace-private inside AFFiNE's nbstore.
- **PGlite + Yjs** — PGlite is Electric SQL's WASM Postgres. No Yjs binding exists; no Yjs-forum chatter about it; not in any production project's roadmap (per survey).

### 15. RxDB — DECLINE FOR THIS USE CASE

RxDB is a real-time database for offline-first apps. Supports Yjs as an optional adapter, but:
- Architectural weight — RxDB is a heavy dependency (~100KB), not a narrow persistence primitive.
- RxDB uses Yjs as one of MANY storage shapes it supports. It's not a "Yjs-persistence" library; it's a full DB system that can model Yjs docs as one datatype.
- For our stack (Yjs is THE primary datatype, Hocuspocus manages sync, markdown is source of truth), RxDB's data-model abstractions add overhead without fit.
- RxDB has documented its own [OPFS-backed RxStorage](https://rxdb.info/rx-storage-opfs.html) — but it doesn't automatically give you "Yjs on OPFS." You'd bolt Yjs persistence on top of RxDB's OPFS layer, which is more indirection than value.

### 16. TinyBase — DECLINE (WRONG SHAPE)

TinyBase is a relational + key-value in-memory data store with pluggable persisters. It ships two persisters relevant here:
- `createOpfsPersister` — persists TinyBase state to OPFS.
- `createYjsPersister` — persists TinyBase state INTO a Yjs doc (uses Yjs as a SYNC layer, not persistence backend).

These do NOT compose into "Yjs-on-OPFS." TinyBase treats Yjs as a destination, not a source. Wrong shape for our need.

---

## Negative findings

- **No maintained public library for "Yjs + OPFS" or "Yjs + SQLite-WASM" exists on npm as of 2026-04-24.** Anyone shipping this has built it themselves.
- **No `yjs/y-opfs` official library is hinted or planned** by the Yjs maintainer. dmonad's public guidance on large-scale Yjs persistence is "append-only file" or "y-indexeddb / y-leveldb" — no OPFS or SQLite mention ([discuss.yjs.dev #377](https://discuss.yjs.dev/t/how-to-sync-thousands-of-documents-and-have-local-persistent-store/377)).
- **No npm library that replaces y-indexeddb in the "Yjs-in-browser-persistence" slot** exists. Full stop.
- **No viable server-side alternative emerged that would replace PR #311's sidecar from a different angle.** `yjs/y-leveldb` is valid for the server-side file-per-doc + sidecar pattern replacement (you'd stop writing a sidecar + write to a leveldb-backed `@hocuspocus/extension-database` instead), but that's a fundamentally different architecture — the sidecar pattern follows Jupyter RTC's markdown-authoritative model (precedent #1) and moving to leveldb-as-source would invert that primacy. Worth noting for the alternative-architectures discussion in D4.

---

## Framing for subsequent dimensions

Because the alternatives landscape is this tight, the remaining dimensions (D2-D7) narrow to evaluating:

1. **yjs/y-indexeddb** (baseline, covered).
2. **DIY Yjs-on-IDB** (hand-rolled, better control, higher engineering cost).
3. **DIY Yjs-on-OPFS** (significant engineering, possibly better perf for large docs, no ecosystem to lean on).
4. **DIY Yjs-on-SQLite-WASM (OPFS)** (most engineering, most durable shape, zero Yjs precedent, operational risk).

Each of these is evaluated in detail in D2-D7. **There is no fifth option worth considering.**

If the user's implicit question was "is there a BETTER maintained alternative to y-indexeddb we should adopt instead" — the honest answer is NO. If the implicit question was "is there a more-engineered-but-custom path that would be architecturally cleaner" — the answer is MAYBE, via DIY OPFS+SQLite, but see D7 (integration cost) before committing.

---

## Sources

- Prior report: [`reports/y-indexeddb-adoption-for-ok-restart-recovery/REPORT.md`](../../y-indexeddb-adoption-for-ok-restart-recovery/REPORT.md)
- [@toeverything/y-indexeddb npm page](https://www.npmjs.com/package/@toeverything/y-indexeddb)
- [AFFiNE PR #6728 — removing y-indexeddb](https://github.com/toeverything/AFFiNE/issues/6728)
- [AFFiNE nbstore source (AGPL workspace)](https://github.com/toeverything/AFFiNE/tree/canary/packages/common/nbstore)
- [y-sweet GitHub](https://github.com/jamsocket/y-sweet)
- [y-sweet client README](https://y-sweet.cloud/advanced/the-ysweet-provider)
- [y-localforage GitHub](https://github.com/rozek/y-localforage)
- [conduit repo (archived y-opfs prior art)](https://github.com/ai25/conduit)
- [PowerSync: SQLite persistence on the Web, Nov 2025](https://www.powersync.com/blog/sqlite-persistence-on-the-web)
- [RxDB OPFS RxStorage docs](https://rxdb.info/rx-storage-opfs.html)
- [TinyBase persister docs](https://tinybase.org/api/persister-yjs/)
- [Yjs forum — large-scale persistence thread](https://discuss.yjs.dev/t/how-to-sync-thousands-of-documents-and-have-local-persistent-store/377)
- npm registry for all publish dates + download counts
