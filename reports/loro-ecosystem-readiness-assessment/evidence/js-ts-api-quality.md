# Evidence: JavaScript/TypeScript API Quality

**Dimension:** D6 — JS/TS binding quality, WASM, bundle size, cross-environment
**Date:** 2026-04-07
**Sources:** npm, loro.dev/llms-full.txt, Yjs community discussion

---

## Key files / pages referenced

- https://www.npmjs.com/package/loro-crdt — npm package
- https://www.loro.dev/llms-full.txt — Full API documentation
- https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567 — Bundle size discussion

---

## Findings

### Finding: WASM-based binding — ~970KB gzipped
**Confidence:** CONFIRMED
**Evidence:** Web search results citing Loro docs

The loro-crdt npm package uses WebAssembly (compiled from Rust). The WASM binary is approximately 970KB gzipped.

For comparison:
- Yjs: ~50-80KB (pure JavaScript, no WASM)
- Automerge (@automerge/automerge): ~500-700KB (also WASM)

Kevin Jahns (Yjs author) flagged this as a concern: "WASM implementations introduce substantial overhead (1MB+ typically requiring base64 encoding with 30% additional size)."

**Implications:** The 970KB WASM bundle is significant for web applications, especially on slow connections. For server-side Node.js usage, bundle size matters less. The WASM approach gives Loro its performance advantages but at a download cost.

### Finding: Works in both browser and Node.js
**Confidence:** CONFIRMED
**Evidence:** loro-crdt npm package, API documentation

The loro-crdt package works in:
- Browser (via WASM)
- Node.js (via WASM / native bindings)

The API is the same across environments. Server-side usage enables the DirectConnection-equivalent pattern for server-side mutations.

### Finding: TypeScript types are included but have known issues
**Confidence:** CONFIRMED
**Evidence:** loro-prosemirror issue #28, loro.dev docs

The package ships TypeScript definitions. However:
- Issue #28 in loro-prosemirror ("Type error for loro doc") has been open since April 2025
- The API surface is well-typed (LoroDoc, LoroText, LoroList, LoroMap, LoroTree, etc.)
- Generic container types support type parameters (e.g., `LoroMap<SchemaType>`)

### Finding: API is comprehensive and well-documented
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt

Complete API surface (key types and methods):

**LoroDoc** (central document):
- `commit()`, `export()`, `import()`, `importBatch()`
- `getText()`, `getList()`, `getMap()`, `getTree()`, `getMovableList()`
- `fork()`, `forkAt()`, `checkout()`, `checkoutToLatest()`
- `version()`, `frontiers()`, `subscribe()`, `subscribeLocalUpdates()`
- `getChangeAt()`, `getOpsInChange()`

**LoroText**:
- `insert()`, `delete()`, `mark()`, `unmark()`, `updateByLine()`, `getCursor()`

**LoroList / LoroMovableList**:
- `insert()`, `delete()`, `push()`, `pushContainer()`, `toArray()`, `clear()`, `move()`

**LoroMap**:
- `set()`, `setContainer()`, `get()`, `clear()`, `keys()`

**LoroTree**:
- `createNode()`, `nodes()`, `contains()`, `toJSON()`, `enableFractionalIndex()`

### Finding: Event system became synchronous in v1.8.0 — significant API change
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt (v1.8.0 changelog)

Events now fire synchronously (as of v1.8.0, Sept 2025), eliminating the previous microtask delay. This was a major behavioral change — code relying on deferred event handling needed updates.

### Finding: Active release cadence with breaking changes at 0.x milestones
**Confidence:** CONFIRMED
**Evidence:** GitHub releases

Release cadence: every 2-3 weeks (Jan-Mar 2026: v1.10.4 → v1.10.8)
Key breaking changes:
- v1.0.0: Renamed `Loro` to `LoroDoc`; deprecated `exportFrom()`/`exportSnapshot()` for unified `export(mode)`
- v1.8.0: Synchronous event emission
- v1.5.0: EphemeralStore (replacing Awareness)

Post-1.0, breaking changes have been limited to new APIs, not removals.

---

## Gaps / follow-ups

- Exact bundle size with tree-shaking not measured
- WASM startup time (initialization overhead) not benchmarked
- Memory usage characteristics of the WASM module not documented
