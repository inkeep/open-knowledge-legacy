# Evidence: D2 — Stack-fit evaluation (3P + 1P)

**Dimension:** For each candidate that survived D1's filter, evaluate compatibility with OK's specific stack: Yjs 13.6.30, HocuspocusProvider, Bun 1.3.13 test runner, TypeScript strict + `verbatimModuleSyntax`, ESM-only, React 19 + React Compiler, Electron + web dual target, OTel instrumentation, Biome lint.
**Date:** 2026-04-24
**Sources:** y-indexeddb `package.json`, Bun runtime docs, MDN OPFS docs, [PowerSync 2025 SQLite review](https://www.powersync.com/blog/sqlite-persistence-on-the-web), [RxDB OPFS docs](https://rxdb.info/rx-storage-opfs.html).

---

## Stack-fit matrix

| Constraint | y-indexeddb | DIY Yjs-on-IDB | DIY Yjs-on-OPFS | DIY Yjs-on-SQLite-WASM |
|-----------|:-----------:|:--------------:|:----------------:|:----------------------:|
| Yjs 13.6.30 peer dep | ✅ `^13` | ✅ (build to fit) | ✅ (build to fit) | ✅ (build to fit) |
| TypeScript strict + types | ✅ `.d.ts` shipped | ✅ (own types) | ✅ (own types) | ✅ (own types) |
| ESM-first, `"type": "module"` | ✅ (native ESM + CJS fallback) | ✅ | ✅ (Worker via ESM) | ✅ (Worker via ESM) |
| Bun test runner | ⚠️ needs `fake-indexeddb/auto` | ⚠️ needs `fake-indexeddb/auto` | ❌ no OPFS polyfill for Bun | ❌ no OPFS polyfill for Bun |
| Electron renderer | ✅ IDB available | ✅ | ⚠️ OPFS works but not recommended; prefer Node `fs` | ⚠️ SQLite-WASM works but over-engineered vs `better-sqlite3` in main process |
| Web browser Chrome 108+ / Safari 16.4+ / Firefox 111+ | ✅ IDB universal | ✅ | ✅ (OPFS universal in target browsers) | ✅ (SQLite-WASM + OPFS) |
| Safari private mode | ⚠️ may throw on construct | ⚠️ same | ❌ OPFS disabled in Safari private mode | ❌ OPFS disabled → SQLite-WASM degrades |
| Mobile Safari | ⚠️ see y-indexeddb #44 | ⚠️ same (upstream bug class) | ⚠️ OPFS support known fragile on mobile Safari | ⚠️ same |
| HocuspocusProvider mesh | ✅ canonical | ✅ same origin-filter pattern | ✅ (but main-thread ↔ Worker bridge needed) | ✅ (same) |
| OTel (fs-traced analogue for writes) | ❌ fire-and-forget; no hooks | ✅ (instrument directly) | ✅ (instrument directly in Worker) | ✅ |
| Biome lint + Standard style | — (dep, not our source) | ✅ | ✅ | ✅ |
| React 19 + Compiler | ✅ no React surface | ✅ | ✅ | ✅ |
| `patchedDependencies` friction | ✅ proven pattern in OK | — (no dep) | — (no dep) | — (no dep) |
| Bundle cost on web | +~8 KB min.gz (184 LOC + deps) | +~8 KB (similar scale) | +~10-30 KB (Worker code + bridge) | **+~400-1000 KB** (SQLite WASM) |

---

## Per-candidate detail

### 1. yjs/y-indexeddb

**Verdict:** Fits cleanly. No stack-fit blockers.

**Specifics:**
- `package.json` — `"type": "module"`, with `exports` map providing ESM + CJS + types. TypeScript strict can consume directly.
- Native `.d.ts` shipped: `dist/src/y-indexeddb.d.ts`. No `@types/y-indexeddb` needed.
- Runtime deps: only `yjs` + `lib0`. Both are already OK deps. Zero new transitive footprint.
- Electron: IDB under Chromium. Persists in the Electron user-data directory. Well-behaved.
- Bun test: use `fake-indexeddb/auto` via `bunfig.toml` preload. Per [fake-indexeddb docs](https://www.npmjs.com/package/fake-indexeddb): pure JS in-memory implementation, drop-in. Widely used with Bun test.

**Residual concern:** OTel instrumentation. y-indexeddb's `_storeUpdate` fires `idb.addAutoKey(store, update)` without error handling or tracing. To observe writes (hit-rate, success-rate, latency), we'd need to wrap or patch. See D7.

### 2. DIY Yjs-on-IDB

**Verdict:** Fits cleanly if we're willing to pay the implementation cost. No stack-fit blockers.

**Why consider over upstream y-indexeddb:**
- Full control over TS types (stricter return types, branded types for doc names, discriminated unions for success/failure).
- Native OTel instrumentation (every write + read gets a span).
- Fix y-indexeddb's known issues directly: issue #31 (doc grows on passive refresh), issue #44 (Mobile Safari uncatchable error). Issue #31's community-validated fix is ~3 lines.
- Add explicit error callbacks for quota-exceeded handling.
- Narrow API surface — only expose what OK needs.

**Why NOT consider over upstream y-indexeddb:**
- ~200-300 LOC of maintained custom code vs leveraging 184 LOC of upstream.
- Lose upstream bug fixes if they ever happen.
- Need our own test suite equivalent to fake-indexeddb coverage.

**OK precedent for this decision:** We DO vendor the occasional shim (e.g., `packages/core/src/bridge/` for the CRDT bridge itself). For things where upstream is low-activity and we've hit pain, forking/rewriting is a pattern we already execute.

### 3. DIY Yjs-on-OPFS

**Verdict:** Stack-fit is complicated but not blocking. Feasible; significant implementation cost.

**Key constraints:**
- **Worker-required.** `createSyncAccessHandle()` is workers-only per [MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle). Any OPFS-backed Yjs library MUST spawn a Web Worker.
- **Bun test coverage gap.** There is no OPFS polyfill for Bun test. `fake-indexeddb` mocks IndexedDB but not OPFS. Testing correctness would require:
  - Playwright for real-browser OPFS testing (higher cost, slower).
  - OR a bespoke OPFS stub we maintain.
  - OR using the Bun native `fs` to approximate OPFS semantics in tests (not architecturally isomorphic).
- **Main-thread ↔ Worker bridge** for every read and write. Yjs's `doc.on('update')` fires in the main thread; we'd need to postMessage updates to the Worker for persistence, and postMessage hydration state back. Each round-trip is ~sub-millisecond but adds latency vs y-indexeddb's direct IDB call.
- **Multi-tab coordination.** OPFS supports Web Locks API for mutex-like coordination; but you need SharedService/BroadcastChannel for master-tab election (the [conduit reference implementation pattern](https://github.com/ai25/conduit) is the prior art). Without master-tab coordination, two tabs might corrupt each other's writes to the same OPFS file.
- **Safari private mode:** OPFS is disabled. Fall-through to what? Need a documented fallback (either IDB or in-memory-only).
- **Electron:** OPFS in renderer works but is discouraged. The [RxDB docs](https://rxdb.info/rx-storage-opfs.html) explicitly say "Electron already has unrestricted Node fs, so using OPFS adds Worker plumbing and quota for no real gain." For OK, the Electron target is primary — OPFS contributes nothing over a hypothetical Node-fs-backed client persistence in main process (which we don't have today because there's no equivalent library).

**Honest assessment:** OPFS is a valid engineering choice if you need >100MB Y.Doc sizes (where IDB degrades) OR synchronous writes in a Worker (not a Yjs workload). For OK's typical doc sizes (markdown files, usually <100KB per doc, many docs), OPFS doesn't offer meaningful perf advantage over IDB — and costs substantial implementation + test complexity.

### 4. DIY Yjs-on-SQLite-WASM (via OPFS)

**Verdict:** Stack-fit has significant friction. Not recommended for OK's constraints.

**Key constraints inherit from #3 (OPFS) plus additional:**
- **Bundle cost.** `@sqlite.org/sqlite-wasm` is ~400-1000 KB (depends on build). For a web target, that's a material bundle size hit for optional offline support. y-indexeddb is ~8 KB for comparison.
- **Engineering complexity.** No precedent Yjs+SQLite-WASM integration exists. You'd design the schema, the update-accumulation strategy (table per doc? one-giant-updates table? merged snapshot column?), the query patterns for boot-time hydration, the branch-switch invalidation.
- **Dependency weight.** Adding WASM as a runtime shape changes what our testing, bundling, and deploy stories look like. Vite can bundle WASM but adds build-step considerations.
- **Worker-only.** Same as #3.
- **Over-engineered for our workload.** [PowerSync's 2025 review](https://www.powersync.com/blog/sqlite-persistence-on-the-web) frames SQLite-WASM as the answer for "1GB+ database needs." OK's client-persistence use case is "remember the last edited state per doc across reload" — IDB is more than adequate.

### Bundle size considerations

For web target, adding y-indexeddb is ~8 KB min.gz incremental. For OPFS-based solutions requiring Web Worker + SQLite-WASM, bundle cost can be 50-100x larger. For a web-first persistence layer that's optional (not a core capability), the budget doesn't justify bundled SQLite.

For Electron, bundle cost matters less (no network download) but the "why are we loading this at all" argument gets stronger — Electron has Node `fs` directly; could write Y.Doc binary to a file without any WASM.

---

## Bun test runner compatibility deep-dive

OK's test infrastructure is Bun + `*.test.ts`. For any client-persistence adoption:

### y-indexeddb / DIY IDB test strategy

```toml
# bunfig.toml
preload = ["./test-setup.ts"]
```

```ts
// test-setup.ts
import 'fake-indexeddb/auto';
```

This is a one-line global setup. `fake-indexeddb` is well-maintained, version 6.x, supports the IndexedDB v2/v3 specs. OK's existing 11-test integration suite (T1–T11) already runs in Bun; adding IDB-backed tests would cleanly integrate.

Known gap: `fake-indexeddb` does NOT simulate quota exceeded or eviction. That's a **Playwright gap** — we'd need ~3 additional Playwright tests against real Chrome to cover quota UX paths.

### OPFS test strategy

`fake-indexeddb` does not polyfill OPFS. Options:
1. Skip Bun tests for OPFS-specific paths; cover via Playwright only (slower, higher infra cost).
2. Write our own OPFS stub for Bun — significant test-harness investment.
3. Use Bun's native `fs` as a semantic approximation — architecturally different from OPFS (no Web Locks API, no quota semantics).

None are great. The Bun-test story for OPFS is weaker than for IDB. That's a real penalty for any OPFS-based DIY approach.

---

## Electron-specific constraints

OK's Electron target uses a utility process for the server (Hocuspocus runs in utility) + the main BrowserWindow runs the React app. Server-side disk writes today go through `fs-traced.ts` wrappers. Client-side would run in the BrowserWindow renderer.

- **y-indexeddb in Electron renderer:** IDB stored under Electron's user-data dir. Works without issue. Persists across Electron restarts until user wipes app data.
- **OPFS in Electron renderer:** Works but needs Worker. Discouraged by ecosystem (RxDB docs); gains nothing over IDB for OK's workload.
- **Node fs in Electron renderer:** Not directly available (renderer has limited Node API). Would need IPC to the utility process to write binary. That's feasible but custom.
- **Node fs in Electron utility process:** Already used for server-side sidecar. Could hypothetically extend to "utility process tracks per-tab Y.Doc state." But this isn't a client-side persistence shape anymore — it's a second server-side persistence layer. Philosophically weird and doesn't fit the Hocuspocus model.

---

## Recommendation surface (preview of D7 decision)

Stack-fit alone filters the field:

- **y-indexeddb:** best fit. No stack-fit friction. Patchable. Known quantity.
- **DIY Yjs-on-IDB:** competitive fit. Higher implementation cost but full control.
- **DIY Yjs-on-OPFS:** significant friction (Bun test gap, Worker complexity, Electron skew). Only justified by a real workload need (very large docs).
- **DIY Yjs-on-SQLite-WASM:** too much weight for the marginal benefit over IDB at OK's doc sizes.

None of the four are stack-fit-impossible. The question is "which is the right tradeoff." D3 quantifies feature parity, D4 quantifies correctness under our scenarios, D5 quantifies durability/perf, D6 quantifies maintenance risk, D7 quantifies integration cost — and D8 produces an implementation plan for the preferred option.

---

## Negative findings

- **No candidate presents a TypeScript incompatibility.** All four can ship typed interfaces.
- **No candidate breaks the React Compiler constraint.** Persistence doesn't interact with React state directly.
- **No candidate requires Yjs 14 upgrade.** All four can target Yjs 13.6.30.
- **No candidate conflicts with Biome or ESLint.** They're all vanilla JS/TS; Biome handles them.

---

## Gaps / follow-ups

- OPFS Electron behavior under app-update / quota-exceeded: undocumented. Would need empirical test if OPFS were ever seriously considered.
- Bun-native OPFS mocks: none exist as of 2026-04. If we committed to OPFS, we'd either build one, use Playwright-only, or accept coverage gap.
- `fake-indexeddb` quota simulation: absent. Real-browser test (Playwright or equivalent) required for quota paths.
