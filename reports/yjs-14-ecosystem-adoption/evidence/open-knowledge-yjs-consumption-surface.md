# OK 1P Yjs Consumption Surface

**Scope.** Every `import` of `yjs`, `y-prosemirror` (transitive only — see below), `y-codemirror.next`, `@tiptap/y-tiptap`, `@hocuspocus/server`, `@hocuspocus/provider`, `@hocuspocus/common`, `y-protocols/awareness`, `@tiptap/extension-collaboration`, and `@tiptap/extension-collaboration-cursor` across `packages/`. Every meaningful indirect use of these APIs (`getXmlFragment`, `getText`, `getMap`, `Y.UndoManager`, `Y.RelativePosition`, `Y.applyUpdate`, `Y.encodeStateAsUpdate`, `transaction.origin`, `transaction.local`, `transaction.changedParentTypes`, `awareness.*`, `Document#broadcastStateless`, `hocuspocus.openDirectConnection`, etc.). Source-level verification: every line cited has been read.

**Pinned versions** (from `packages/*/package.json`):

| Dep | Version | Used in |
| --- | --- | --- |
| `yjs` | `^13.6.30` | `core`, `server`, `app` |
| `@hocuspocus/server` | `4.0.0-rc.1` | `server`, `app` (via dev plugin) |
| `@hocuspocus/provider` | `4.0.0-rc.1` | `app`, `cli` |
| `@tiptap/y-tiptap` | `^3.0.3` | `core`, `server`, `app` |
| `y-codemirror.next` | `^0.3.5` | `app` |
| `@tiptap/extension-collaboration` | `^3.22.3` | `app` |
| `@tiptap/extension-collaboration-cursor` | `3.0.0` | `app` (CSS class names only — see Frontend §) |
| `y-protocols/awareness` | (transitive via @hocuspocus/provider, y-codemirror.next) | direct usage zero |
| `y-prosemirror` | (transitive via @tiptap/y-tiptap; **patched** at `1.3.7`) | direct imports zero |
| `@hocuspocus/common` | (none in repo) | n/a |

> **There is no direct `from 'y-prosemirror'` import anywhere in `packages/**`** — verified with two ripgrep passes. We consume `y-prosemirror`'s API exclusively via the `@tiptap/y-tiptap` re-export wrapper. Our `bun patch y-prosemirror@1.3.7` patches the underlying CJS dist that `@tiptap/y-tiptap` resolves at runtime; consumer call sites do not depend on `y-prosemirror`'s import surface but DO depend on the patched `createNodeFromYElement` / `createTextNodesFromYText` runtime behavior. See **Patches matrix** below.

---

## Summary

- **Direct Yjs ecosystem import sites:** 89 (across 64 distinct files)
  - `from 'yjs'`: 41 sites in 41 files (production: 13 sites in 13 files; tests: 28 sites in 28 files)
  - `from '@tiptap/y-tiptap'`: 24 sites in 24 files (production: 11; tests: 13)
  - `from 'y-codemirror.next'`: 1 site (`SourceEditor.tsx`)
  - `from '@hocuspocus/server'`: 28 sites in 27 files (production: 13; tests: 14; including 1 in `app/src/server/hocuspocus-plugin.ts` and 1 in `app/src/editor/observers.ts` for `LocalTransactionOrigin` type only)
  - `from '@hocuspocus/provider'`: 17 sites in 17 files (production: 12; tests: 5)
  - `from '@tiptap/extension-collaboration'`: 1 site (`TiptapEditor.tsx`)
- **Production LOC of files containing Yjs imports:** ~12,861 (server: 6,452; app: ~3,500; core: ~416; tests: ~9,000+ already excluded from this number)
- **Test LOC referencing Yjs:** ~9,000 (50+ test files)
- **Migration cost classes (rolled up across all surfaces):**
  - **Trivial (rename / DConf swap):** ~70% of API call sites — `getText/getMap/getXmlFragment/getArray`, basic CRUD on `Y.Text`/`Y.Map`, `transaction.origin` reads, observer attach/detach, `broadcastStateless`. These map to the `@y/y` `YType` + DConf API or to a thin facade layer.
  - **Moderate (refactor function/module):** ~25% — origin-guard truth table, `Y.UndoManager` instantiation + tracked-origin matching, `LocalTransactionOrigin` typed-object pattern (Hocuspocus 4 contract), bridge invariant watcher's `afterTransaction` hook, `transaction.changedParentTypes` private-field access.
  - **Heavy (redesign module):** ~5% — the **R13 y-prosemirror patch** (the critical schema-throw substitution lives in `node_modules/y-prosemirror/dist/y-prosemirror.cjs` lines that don't exist in `@y/prosemirror`'s rewrite); the **`updateYFragment` consumers** (this is `@tiptap/y-tiptap`'s primary export — its v14 successor MUST exist or our four agent-write paths break); the **`@tiptap/extension-collaboration` v3 → ProseMirror plugin chain** which transitively depends on `y-prosemirror`'s `ySyncPlugin` / `yCursorPlugin` / `ySyncPluginKey` identity.
  - **Blocked (depends on missing upstream):** the **whole stack** is blocked on `@y/prosemirror`, `@y/codemirror`, `@y/tiptap` (or third-party equivalents) and on Hocuspocus 5 (or another server) supporting the `@y/y` Doc shape. Until those exist publicly we cannot port; until those exist with stable APIs we should not start. See **Migration shape** column on each row.

**File counts (production vs tests):**

| Layer | Production files | Test files |
| --- | --- | --- |
| Bridge | 6 | 11 |
| Server lifecycle | 8 | 17 |
| Server extensions | 3 | 2 |
| Editor bindings (app/src/editor) | 9 | 4 |
| Frontend components (app/src/components) | 4 | 1 |
| App server (Vite plugin) | 1 | 1 |
| Test harness | 0 | 2 (`test-harness.ts`, `network-control.ts`) |
| Stress / fuzz | 0 | 6 |
| MCP tools (cli) | **0** | **0** |
| Docs site | **0** | **0** |

---

## By surface

### Bridge layer (HIGH impact)

The cross-CRDT bridge between Y.XmlFragment (TipTap) and Y.Text (CodeMirror). All citations are object-position aware — `transaction.origin`, `transaction.local`, `Y.UndoManager.trackedOrigins` use **identity matching on `LocalTransactionOrigin` object refs** per CLAUDE.md precedent #1.

| File:line | Imports | Yjs API used | Migration shape | Effort |
| --- | --- | --- | --- | --- |
| `packages/server/src/server-observers.ts:19` | `LocalTransactionOrigin` (type) from `@hocuspocus/server` | type only | Hocuspocus 5 must re-export an identical object-shape contract OR we own a local typed-origin definition. | trivial |
| `packages/server/src/server-observers.ts:34` | `updateYFragment, yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` | bidirectional bridge between Y.XmlFragment ↔ PM JSON. `updateYFragment` is the **structural-diff write** (used at line 337 of Observer B). | `@y/tiptap` (does not exist publicly) or `@y/prosemirror` if we drop TipTap. Without an equivalent `updateYFragment`, every agent-write + observer-write surface breaks. | **heavy** |
| `packages/server/src/server-observers.ts:35` | `* as Y` from `yjs` (type only — `Y.Doc`, `Y.XmlFragment`, `Y.Text`, `Y.YEvent`, `Y.YTextEvent`, `Y.Transaction`) | structural types passed through 9 function signatures. | Replace with `@y/y`'s `YType` + DConf-typed handles. Type-level only at this site, but the cascade is large. | trivial (here) |
| `packages/server/src/server-observers.ts:56-60` | — | `OBSERVER_SYNC_ORIGIN` typed object | One of seven typed-origin singletons (precedent #1). v14 must accept arbitrary opaque object-refs as `transact(_, origin)` — verify before porting. | trivial |
| `packages/server/src/server-observers.ts:128, 148, 216, 246, 296, 333, 347` | — | `yXmlFragmentToProsemirrorJSON(xmlFragment)` | hot path — reads XmlFragment to compute baseline for diff. | **heavy** (no public successor) |
| `packages/server/src/server-observers.ts:166, 250, 303, 335` | — | `doc.transact(fn, OBSERVER_SYNC_ORIGIN)` | v14 `YDoc#transact` exists; signature similar. | trivial |
| `packages/server/src/server-observers.ts:204, 378` | — | observer callbacks: `(events: Y.YEvent<Y.XmlFragment>[], transaction: Y.Transaction) => void`, `(event: Y.YTextEvent, transaction: Y.Transaction) => void` | `YEvent`/`YTextEvent` are renamed in v14 to typed events derived from the YType variant. Callback shape preserved. | moderate |
| `packages/server/src/server-observers.ts:206, 214, 380` | — | `transaction.origin === OBSERVER_SYNC_ORIGIN` (identity) and `isPairedWriteOrigin(transaction.origin)` (identity match against `AGENT_WRITE_ORIGIN` / `FILE_WATCHER_ORIGIN`) | v14 must preserve identity-based origin tracking across `YDoc#transact`. If v14 changes origin to a normalized stringification (some research notes hint at this), the entire enforcing-origin Set becomes unsound. **Verify before porting.** | moderate (potentially heavy) |
| `packages/server/src/server-observers.ts:251, 316, 392, 399` | — | `ytext.insert(0, md)`, `ytext.toString()`, `ytext.observe(observerB)`, `ytext.unobserve(observerB)` | DConf-text `Y.Text` analog in v14. Call surface should map. | trivial |
| `packages/server/src/server-observers.ts:300, 338` | — | `doc.getMap('metadata')` + `metaMap.get/set('frontmatter', ...)` | v14 has `Y.Map` analog under DConf. | trivial |
| `packages/server/src/server-observers.ts:391, 398` | — | `xmlFragment.observeDeep(observerA)` / `unobserveDeep` | v14 Y.XmlFragment may not exist as a discrete type — the prosemirror-binding successor takes its place. **Replacement required.** | **heavy** |
| `packages/app/src/editor/observers.ts:30` | `LocalTransactionOrigin` (type) from `@hocuspocus/server` | type only | same as server-observers | trivial |
| `packages/app/src/editor/observers.ts:41` | `yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` | read XmlFragment → md for baseline tracking only (writes deleted per precedent #14) | same as server-observers | **heavy** |
| `packages/app/src/editor/observers.ts:42` | `* as Y` from `yjs` (type only) | type only | trivial | trivial |
| `packages/app/src/editor/observers.ts:57-71` | — | `ORIGIN_TREE_TO_TEXT`, `ORIGIN_TEXT_TO_TREE` typed origins | precedent #1 typed origins. | trivial |
| `packages/app/src/editor/observers.ts:114, 116` | — | `WeakMap<Y.Doc, TypingState>` per-doc state map | trivial — `WeakMap<YDoc, _>` analog. | trivial |
| `packages/app/src/editor/observers.ts:255-289, 344, 399-411, 413-414, 419-422, 441-442` | — | `transaction.origin === ORIGIN_TEXT_TO_TREE`, `transaction.local`, `transaction.changedParentTypes?.has(ytext)`, `xmlFragment.observeDeep`, `ytext.observe`, `doc.transact(_, ORIGIN_TEXT_TO_TREE)` | `transaction.changedParentTypes` is **private API** (cast through `as Y.Transaction & { changedParentTypes?: Map<unknown, unknown> }`). v14's transaction shape may not expose this. Mitigation noted in code comment: "If a future Yjs release removes or renames it, this degrades to arming the grace window for every remote XmlFragment change." Acceptable but worth re-validating. | moderate |
| `packages/server/src/external-change.ts:9` | `Hocuspocus, LocalTransactionOrigin` (types) from `@hocuspocus/server` | types | Hocuspocus 5 contract | trivial |
| `packages/server/src/external-change.ts:11` | `updateYFragment` from `@tiptap/y-tiptap` | structural diff write | **heavy** (no public successor) |
| `packages/server/src/external-change.ts:27-31` | — | `FILE_WATCHER_ORIGIN` typed origin (`skipStoreHooks: true`) | precedent #1. The `skipStoreHooks` field is a **Hocuspocus extension contract**, not a Yjs contract. Hocuspocus 5 must preserve. | moderate |
| `packages/server/src/external-change.ts:54-72` | — | `hocuspocus.documents.get(docName)`, `document.getXmlFragment('default')`, `document.getText('source')`, `document.getMap('metadata')`, `document.transact(fn, FILE_WATCHER_ORIGIN)`, `ytext.toString()`, `applyFastDiff(ytext, currentText, content)` | full disk → CRDT bridge in 18 lines. v14 mapping: `YDoc#transact` + DConf-typed handles + `applyFastDiff` rewritten on `@y/y`'s YType-text. | moderate |
| `packages/server/src/agent-sessions.ts:11-16` | `DirectConnection, Document, Hocuspocus, LocalTransactionOrigin` (types) from `@hocuspocus/server` | types | Hocuspocus 5 contract | trivial |
| `packages/server/src/agent-sessions.ts:26` | `updateYFragment, yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` | XmlFragment-authoritative agent write composition | **heavy** |
| `packages/server/src/agent-sessions.ts:52-56` | — | `AGENT_WRITE_ORIGIN` typed origin | precedent #1 | trivial |
| `packages/server/src/agent-sessions.ts:88-138` | — | `applyAgentMarkdownWrite(document, markdown, position)` — reads `document.getXmlFragment('default')` / `getText('source')` / `getMap('metadata')`, runs `yXmlFragmentToProsemirrorJSON`, calls `updateYFragment`, mirrors via `applyFastDiff(ytext, ytext.toString(), canonicalFull)`. **Template per precedent #10/#12 — mirrored by V0-14 agent-undo handler when it lands.** | The full `applyAgentMarkdownWrite` template (lines 88-138) is the consensus pattern for ALL future server-side write surfaces. Migrating means rewriting this AND mechanically validating every successor agent-write/agent-undo surface uses the v14 equivalent. Cross-references the FR-17 fuzzer's coverage gate. | **heavy** |
| `packages/server/src/agent-sessions.ts:174` | — | `await this.hocuspocus.openDirectConnection(docName)` | Hocuspocus 4 DirectConnection API. v5 surface unknown. | moderate |
| `packages/server/src/agent-sessions.ts:177-247` | — | `dc.document.awareness.setLocalState(...)` (5 sites), `dc.document.transact(fn, AGENT_WRITE_ORIGIN)` | `awareness.setLocalState` is `y-protocols/awareness`-derived. Hocuspocus 5 must preserve. | trivial-moderate |
| `packages/core/src/bridge/apply-diff.ts:30` | `* as Y` (type only) from `yjs` | `Y.Text` parameter type | trivial | trivial |
| `packages/core/src/bridge/apply-diff.ts:47-95` | — | `applyIncrementalDiff(ytext, currentText, newText)` — calls `ytext.delete(offset, len)` + `ytext.insert(offset, value)` | Pure function on `Y.Text` insert/delete primitives. v14 maps trivially. | trivial |
| `packages/core/src/bridge/apply-diff.ts:112-127` | — | `applyFastDiff(ytext, currentText, newText)` — same primitives via DMP-driven offsets | trivial | trivial |
| `packages/core/src/bridge/frontmatter-y.ts:13-19` | `* as Y` (type only) from `yjs` | `getFrontmatter(doc: Y.Doc)` reads `doc.getMap('metadata').get('frontmatter')` | trivial | trivial |
| `packages/core/src/utils/apply-by-prefix-suffix.ts:1, 15-34` | `* as Y` (type only) from `yjs` | `applyByPrefixSuffix(ytext, currentText, newText)` — `ytext.delete()` + `ytext.insert()` | trivial — pure delta application | trivial |
| `packages/core/src/utils/chunked-insert.ts:34, 64, 74, 141, 158` | type-shaped `InsertableYText { insert; length }` + `InsertableYDoc { transact }` (no Y import — duck-typed) | calls `ydoc.transact(fn, origin)` and `ytext.insert(absoluteIndex, chunk)`. JSDoc references `Y.createRelativePositionFromTypeIndex` for the production `resolveOffset` callback (passed in by `source-clipboard.ts`). | trivial here — the abstraction is already typed structurally | trivial (here); see `source-clipboard.ts` for the `RelativePosition` consumer |
| `packages/core/src/constants/activity.ts:4-41` | `* as Y` (type only) from `yjs` | `evictStaleEntries(activityMap: Y.Map<unknown>)`, `hasNewEntries(activityMap, since)` | trivial | trivial |

### Server lifecycle (HIGH impact)

`createServer()`, persistence, file-watcher reconciliation, batch lifecycle, shutdown ordering. Holds the `Hocuspocus` instance ref + DirectConnection lifecycle for the `__system__` doc + every agent session.

| File:line | Imports | Yjs API used | Migration shape | Effort |
| --- | --- | --- | --- | --- |
| `packages/server/src/standalone.ts:3` | `Hocuspocus` from `@hocuspocus/server` | constructor + lifecycle | Hocuspocus 5 (or successor) MUST exist with equivalent extension contract before this can port. | **heavy/blocked** |
| `packages/server/src/standalone.ts:5` | `yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` | `serializeDoc()` reads XmlFragment → md for park / branch-switch / rescue-buffer paths | **heavy** |
| `packages/server/src/standalone.ts:190-198` | — | `new Hocuspocus({quiet, debounce, maxDebounce, extensions})` | Hocuspocus 4 constructor shape. v5 unknown. | moderate |
| `packages/server/src/standalone.ts:204, 222, 224, 531` | — | `hocuspocus.configuration.extensions.push(...)` (vs `hocuspocus.configure({ extensions: [...] })` which spreads — see **WARN** in CLAUDE.md) | Hocuspocus 5 must preserve `configuration.extensions.push` behavior or we re-architect extension wiring. | moderate |
| `packages/server/src/standalone.ts:241, 279, 395, 449, 476, 545, 547, 548, 554, 669, 861, 890, 897, 952, 1002, 1013` | — | `hocuspocus.documents.get(docName)`, `.documents.size`, `.documents.keys()`, `.closeConnections()`, `.flushPendingStores()`, `.unloadDocument(doc)`, `.openDirectConnection(SYSTEM_DOC_NAME)` | Hocuspocus runtime API surface — large blast radius across `standalone.ts` alone (~16 sites). | moderate |
| `packages/server/src/standalone.ts:243-249` | — | `serializeDoc()`: `document.getXmlFragment('default')` → `yXmlFragmentToProsemirrorJSON` → `mdManager.serialize(json)` → `document.getMap('metadata').get('frontmatter')` → `prependFrontmatter(...)` | Same as server-observers — needs `@y/tiptap` or replacement bridge. | **heavy** |
| `packages/server/src/standalone.ts:384, 428, 462, 479, 982` | — | `document.getMap('lifecycle')` (5 distinct write-paths set lifecycle status) | trivial Y.Map ops | trivial |
| `packages/server/src/persistence.ts:13` | `Extension` (type) from `@hocuspocus/server` | extension contract | Hocuspocus 5 must define the same hook lifecycle (`onLoadDocument`, `onStoreDocument`, `afterUnloadDocument`, etc.) | **heavy/blocked** |
| `packages/server/src/persistence.ts:15` | `updateYFragment, yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` | `onLoadDocument` writes XmlFragment from disk-parsed PM JSON; `onStoreDocument` reads XmlFragment → md for disk write | **heavy** |
| `packages/server/src/persistence.ts:358, 369, 376-379, 385-390, 401, 409-410, 413-417, 436-437` | — | `document.getMap('metadata').set('frontmatter', frontmatter)`, `document.getXmlFragment('default')`, `updateYFragment(document, xmlFragment, pmNode, meta)`, `xmlFragment.observeDeep(callback)`, `yXmlFragmentToProsemirrorJSON(xmlFragment)`, `document.getXmlFragment('default').length` | Persistence is the **canonical disk-of-record bridge** — rewriting requires `@y/tiptap` or equivalent. | **heavy** |
| `packages/server/src/api-extension.ts:25` | `Extension, Hocuspocus, LocalTransactionOrigin` (types) from `@hocuspocus/server` | types | Hocuspocus 5 contract | trivial |
| `packages/server/src/api-extension.ts:35` | `updateYFragment, yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` | rollback path + agent-patch path | **heavy** |
| `packages/server/src/api-extension.ts:104-108` | — | `ROLLBACK_ORIGIN` typed origin (`skipStoreHooks: false`) | precedent #1 | trivial |
| `packages/server/src/api-extension.ts:110-114` | — | `MANAGED_RENAME_ORIGIN` typed origin | precedent #1 — **NOT** in the bridge-invariant watcher's enforcing set per `test-harness.ts:526-533`. Verified by source read. | trivial |
| `packages/server/src/api-extension.ts:529, 605, 685, 698-702, 755, 788, 873, 1699-1710, 1975, 2091` | — | `hocuspocus.documents.get(docName)`, `.closeConnections(docName)`, `.unloadDocument(document)` | ~12 sites. Hocuspocus 5 surface. | moderate |
| `packages/server/src/api-extension.ts:531, 687, 757, 795-796, 1023-1033, 1108-1118, 1175, 1602-1631, 1983, 2103-2120` | — | `doc.getMap('metadata').get('frontmatter')`, `document.getText('source').toString()`, `document.getXmlFragment('default')`, `dc.document.transact(fn, AGENT_WRITE_ORIGIN)` (3 sites: write, write-md, patch), `dc.document.getMap('activity').set(agentId, {...})` (3 sites), `doc.getText('source').toString()` (timeline diff), `document.transact(fn, ROLLBACK_ORIGIN)` | All 4 agent-write surfaces (`agent-write`, `agent-write-md`, `agent-patch`, `rollback`) are textbook `applyAgentMarkdownWrite`-shaped (precedent #10) plus rollback's direct `ytext.delete(0, len) + ytext.insert(0, markdown)` for full-doc replacement. | moderate (template-mirrored) |
| `packages/server/src/api-extension.ts:626-627, 1705-1706` | — | `hocuspocus.debouncer.isDebounced(debounceId)` + `hocuspocus.debouncer.executeNow(debounceId)` | Hocuspocus internal `debouncer` API. **Worth probing** — this might be private/internal in v5. | moderate |
| `packages/server/src/cc1-broadcast.ts:1` | `Hocuspocus` (type) from `@hocuspocus/server` | type | Hocuspocus 5 contract | trivial |
| `packages/server/src/cc1-broadcast.ts:53-79, 86-87` | — | `hocuspocus.documents.get(SYSTEM_DOC_NAME)`, `doc.broadcastStateless(JSON.stringify(payload))`, `doc.getConnectionsCount()` | `broadcastStateless` is a Hocuspocus 4 extension (not Yjs core). v5 must preserve OR we redesign CC1 to ride Yjs awareness instead. | moderate |
| `packages/server/src/agent-focus.ts:20-21` | `Hocuspocus` (type) from `@hocuspocus/server`; reuses `__system__` from cc1 | system doc reference | Hocuspocus 5 contract | trivial |
| `packages/server/src/agent-focus.ts:80-110` | — | `this.hocuspocus.documents.get(SYSTEM_DOC_NAME)?.awareness.setLocalState/getLocalState` | y-protocols awareness via Hocuspocus's per-doc awareness. **Note: this is server-side awareness mutation on the `__system__` doc** — clients receive via Hocuspocus broadcast. | moderate |
| `packages/server/src/live-derived-index.ts:1` | `Document, Extension` (types) from `@hocuspocus/server` | types | Hocuspocus 5 contract | trivial |
| `packages/server/src/live-derived-index.ts:3` | `yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` | live document serialization to compute backlink delta | **heavy** |
| `packages/server/src/live-derived-index.ts:23-79` | — | extension `onChange({ documentName, document, transactionOrigin })` reads `document.getXmlFragment('default')` + `getMap('metadata')`. Custom `isLocalOriginLike` type guard checks `origin.source === 'local' && origin.context?.origin === 'file-watcher'` — duplicates the typed-origin shape but doesn't import the actual ref. **Refactor opportunity:** could import `FILE_WATCHER_ORIGIN` and use identity match (matches precedent #1). | moderate |
| `packages/server/src/live-derived-index.ts:82` | — | `beforeUnloadDocument` extension hook | Hocuspocus 5 contract | trivial |
| `packages/server/src/suggest-links.ts:2, 9` | `Document, Hocuspocus` (types) from `@hocuspocus/server`; `yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` | live doc serialize | **heavy** (same as live-derived-index) |
| `packages/server/src/suggest-links.ts:499-505, 512, 521` | — | `serializeLiveDocument(document)` reads xmlFragment + metaMap; fallback `liveDocument.getText('source').toString()` | trivial-once-bridge-ports | moderate |
| `packages/app/src/server/hocuspocus-plugin.ts:10` | `Hocuspocus` from `@hocuspocus/server` | constructor (Vite dev plugin parallel to `standalone.ts`) | Hocuspocus 5 contract | **heavy** |
| `packages/app/src/server/hocuspocus-plugin.ts:193-228, 271, 330, 386-387` | — | `new Hocuspocus({ extensions: [persistence.extension] })`, `hocuspocus.configuration.extensions.push(...)` (3 sites), `hocuspocus.handleConnection(ws, req)`, `hocuspocus.openDirectConnection(SYSTEM_DOC_NAME)`, `systemDocConnection.disconnect()` | Mirrors `standalone.ts` boot path. The dev-mode parallel of the same Hocuspocus 5 dependency. | **heavy/blocked** |

### Server extensions (HIGH impact)

| File:line | Imports | Yjs API used | Migration shape | Effort |
| --- | --- | --- | --- | --- |
| `packages/server/src/server-observer-extension.ts:12` | `Extension` (type) from `@hocuspocus/server` | extension contract | Hocuspocus 5 contract | **heavy/blocked** |
| `packages/server/src/server-observer-extension.ts:15` | `* as Y` (type) from `yjs` | `Y.Doc` cast: `const doc = document as unknown as Y.Doc` | Hocuspocus's `Document` IS a `Y.Doc` extension at runtime (see `agent-sessions.ts:39-41` which redeclares `document: Document` as `Y.Doc`-compatible). v14 must preserve this OR we need a discriminator. | moderate |
| `packages/server/src/server-observer-extension.ts:42-43` | — | `doc.getXmlFragment('default')`, `doc.getText('source')` per-doc on `afterLoadDocument` hook | trivial | trivial |
| `packages/server/src/server-observer-extension.ts:47-67, 89-115` | — | extension hooks `afterLoadDocument`, `afterUnloadDocument`, `onDestroy` — wires `setupServerObservers` per-doc. | Hocuspocus 5 contract | moderate |

### Editor bindings (HIGH impact)

| File:line | Imports | Yjs API used | Migration shape | Effort |
| --- | --- | --- | --- | --- |
| `packages/app/src/editor/TiptapEditor.tsx:1` | `HocuspocusProvider` (type) from `@hocuspocus/provider` | type | Hocuspocus 5 client | trivial |
| `packages/app/src/editor/TiptapEditor.tsx:12` | `Collaboration` from `@tiptap/extension-collaboration` | `Collaboration.configure({ document: provider.document })` at line 145-147. **Internally wires y-prosemirror's `ySyncPlugin`.** | TipTap v3 → v4? `@y/tiptap`? Currently no public migration target. **`Collaboration` IS the integration shim** — without it, no PM ↔ Y.XmlFragment binding. | **heavy/blocked** |
| `packages/app/src/editor/TiptapEditor.tsx:15` | `yCursorPlugin` from `@tiptap/y-tiptap` | `yCursorPlugin(awareness, { cursorBuilder: renderCursor })` at line 166. Critical comment at line 154-155: "Use yCursorPlugin from `@tiptap/y-tiptap` directly (same module as Collaboration v3) to avoid `ySyncPluginKey` mismatch with y-prosemirror's yCursorPlugin." **Identity coupling between `@tiptap/y-tiptap`'s and `y-prosemirror`'s `ySyncPluginKey` is load-bearing.** | This identity-coupling is a known TipTap v3 footgun. The Hocuspocus 5 / `@y/y` migration must validate the sync-plugin-key contract. **Re-test the y-prosemirror patch behavior under the v14 prosemirror binding.** | **heavy/blocked** |
| `packages/app/src/editor/TiptapEditor.tsx:146-147` | — | `Collaboration.configure({ document: provider.document })` | type-safe wiring | trivial |
| `packages/app/src/editor/TiptapEditor.tsx:159, 166-169, 199-211, 236, 354, 371, 438, 449, 450, 455-465` | — | `provider.awareness`, `provider.document.getMap('activity').observe(observer)`, `unobserve`, `provider.document.getMap('metadata').observe(observer)`, `awareness.setLocalStateField('user'/'mode', ...)` | Awareness + Y.Map observation. v14 maps cleanly to `@y/y` map type + an awareness facade (currently no public `@y/awareness`). | moderate |
| `packages/app/src/editor/TiptapEditor.tsx:399, 408, 411` | — | `provider.on('synced', tryScroll)`, `provider.off(...)` | trivial | trivial |
| `packages/app/src/editor/SourceEditor.tsx:5` | `HocuspocusProvider` (type) | type | Hocuspocus 5 client | trivial |
| `packages/app/src/editor/SourceEditor.tsx:31` | `yCollab` from `y-codemirror.next` | `yCollab(ytext, provider.awareness)` at line 89. **Single import of `y-codemirror.next` in the entire repo.** | `y-codemirror.next` does not have a published `@y/codemirror` v14 successor at time of writing. Without it, the source-mode editor cannot bind. | **heavy/blocked** |
| `packages/app/src/editor/SourceEditor.tsx:32` | `* as Y` (type only) | `Y.Text` parameter type | trivial | trivial |
| `packages/app/src/editor/SourceEditor.tsx:55-60, 89, 74` | — | `provider.awareness.setLocalStateField('mode', ...)`, `yCollab(ytext, provider.awareness)`, `provider.document` (passed to source-clipboard, agent-flash extensions) | trivial | trivial |
| `packages/app/src/editor/clipboard/source-clipboard.ts:40` | `* as Y` from `yjs` (**value, not type**) | `Y.createRelativePositionFromTypeIndex(deps.ytext, anchorIndex)` (line 288) and `Y.createAbsolutePositionFromRelativePosition(relPos, deps.ydoc)` (line 294, line 373). Used to track concurrent paste anchors during chunked insertion. | v14 RelativePosition API — needs verification. The `@y/y` rewrite likely has a moved-to-DConf equivalent. **The `Y.RelativePosition` type at line 358 is exported as a public type, not a private one — should still be portable.** | moderate |
| `packages/app/src/editor/provider-pool.ts:1` | `HocuspocusProvider` from `@hocuspocus/provider` | constructor | Hocuspocus 5 client | trivial |
| `packages/app/src/editor/provider-pool.ts:145-149, 199-216, 230, 239-241, 353` | — | `new HocuspocusProvider({ url, name, forceSyncInterval })`, `provider.document.getXmlFragment('default')`, `provider.document.getText('source')`, `provider.unsyncedChanges`, `provider.on('status'/'synced'/'disconnect', ...)`, `entry.provider.destroy()` | LRU pool + WebSocket lifecycle wiring. Surface area is Hocuspocus-client-shaped, not Yjs-shaped. | moderate |
| `packages/app/src/editor/sync-promise.ts:23` | `HocuspocusProvider, onCloseParameters` (types) from `@hocuspocus/provider` | types | Hocuspocus 5 client | trivial |
| `packages/app/src/editor/sync-promise.ts:230-231, 376-377` | — | `provider.on('synced', ...)`, `provider.off('synced'/'close', ...)` | Hocuspocus client event wiring | trivial |
| `packages/app/src/editor/DocumentContext.tsx:1` | `HocuspocusProvider` (type) from `@hocuspocus/provider` | type | trivial | trivial |
| `packages/app/src/editor/plugins/agent-flash-source.ts:18` | `* as Y` (type only) | `Y.Doc`, `Y.Map`, `Y.YMapEvent` parameter types | trivial | trivial |
| `packages/app/src/editor/plugins/agent-flash-source.ts:66-67, 96-97, 121, 144` | — | `doc.getMap('activity')`, `activityMap.observe`, `unobserve`, `_event: Y.YMapEvent<unknown>` | trivial Y.Map ops | trivial |
| `packages/app/src/presence/use-presence.ts:1` | `HocuspocusProvider` (type) | type | trivial | trivial |
| `packages/app/src/presence/use-presence.ts:21, 25, 43, 45` | — | `provider.awareness.getStates().entries()`, `awareness.on('change', handler)`, `awareness.off(...)` | y-protocols awareness — needs Hocuspocus 5's awareness facade. | moderate |
| `packages/app/src/presence/use-sync-status.ts:1, 20-21, 48-55` | `HocuspocusProvider` (type); `provider.configuration.websocketProvider.status`, `provider.isSynced`, `provider.on('status'/'synced'/'disconnect', ...)` | Hocuspocus 5 client surface | trivial |

### Frontend components (LOW-MEDIUM impact)

| File:line | Imports | Yjs API used | Migration shape | Effort |
| --- | --- | --- | --- | --- |
| `packages/app/src/components/SystemDocSubscriber.tsx:1` | `HocuspocusProvider` from `@hocuspocus/provider` | constructor for `__system__` connection | trivial-once-Hocuspocus-5 | trivial |
| `packages/app/src/components/SystemDocSubscriber.tsx:4` | `* as Y` from `yjs` (**value, not type**) | `new Y.Doc()` at line 50, `doc.destroy()` at line 142 | trivial — needs `new YDoc()` analog | trivial |
| `packages/app/src/components/SystemDocSubscriber.tsx:51-69, 82, 109, 120, 131-132, 140` | — | `provider.awareness.on('change'/'states'/'emit')`, `awareness.states.set(...)` (test-only DEV hook injects fake `clientID = 999999`) | y-protocols `awareness.states` Map exposed publicly. v14 may hide this — the test-only hook would need a different injection path. | moderate (test hook only) |
| `packages/app/src/components/SystemDocSubscriber.tsx:55-58` | — | Hocuspocus stateless message handler `onStateless: ({ payload }) => parseCC1Signal(payload)` | Hocuspocus 5 `onStateless` callback contract | moderate |
| `packages/app/src/components/DocumentBoundary.tsx:21` | `HocuspocusProvider` (type) | type | trivial | trivial |
| `packages/app/src/components/EditorActivityPool.tsx:321` | — | `entry.provider.document.getText('source')` | passes `Y.Text` ref to child editor | trivial |
| `packages/app/src/env.d.ts:4` | `HocuspocusProvider` (type) | global window type augmentation `window.__activeProvider?: HocuspocusProvider` | trivial | trivial |

### Test harness (HIGH impact)

| File:line | Imports | Yjs API used | Migration shape | Effort |
| --- | --- | --- | --- | --- |
| `packages/app/tests/integration/test-harness.ts:25-26` | `HocuspocusProvider` from `@hocuspocus/provider`; `LocalTransactionOrigin` (type) from `@hocuspocus/server` | client + type | Hocuspocus 5 contract | trivial |
| `packages/app/tests/integration/test-harness.ts:33-41` | `AGENT_WRITE_ORIGIN, createServer, FILE_WATCHER_ORIGIN, OBSERVER_SYNC_ORIGIN, ROLLBACK_ORIGIN` from `@inkeep/open-knowledge-server` | typed-origin object refs for the enforcing set + `ServerInstance` for boot | trivial | trivial |
| `packages/app/tests/integration/test-harness.ts:43, 45` | `yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap`; `* as Y` from `yjs` | bridge serialize + structural types | **heavy** (matches all bridge sites) |
| `packages/app/tests/integration/test-harness.ts:47-52` | `ORIGIN_TEXT_TO_TREE, ORIGIN_TREE_TO_TEXT, type Scheduler, setupObservers` from `../../src/editor/observers` | typed-origin object refs + observer wiring | trivial | trivial |
| `packages/app/tests/integration/test-harness.ts:240-242, 261-263, 311-312, 322` | — | `new Y.Doc()`, `doc.getText('source')`, `doc.getXmlFragment('default')`, `new HocuspocusProvider(opts)`, `provider.destroy()`, `doc.destroy()`, `provider.isSynced`, `provider.on('synced', ...)` | trivial | trivial |
| `packages/app/tests/integration/test-harness.ts:339, 354-356, 487-509` | — | `serializeFragment(fragment)` calls `mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment))`; `getServerState(server, docName)` extracts `document.getText('source')`, `getXmlFragment('default')`, `getMap('metadata')`, `getMap('activity')`, `document.getConnectionsCount?.()` | inspector encapsulation — Hocuspocus 5 will need `getConnectionsCount` analog | trivial-moderate |
| `packages/app/tests/integration/test-harness.ts:526-533` | — | `BRIDGE_ENFORCING_ORIGINS: Set<LocalTransactionOrigin>` containing all 7 typed-origin object refs (`ORIGIN_TREE_TO_TEXT, ORIGIN_TEXT_TO_TREE, AGENT_WRITE_ORIGIN, FILE_WATCHER_ORIGIN, ROLLBACK_ORIGIN, OBSERVER_SYNC_ORIGIN`). Note: `MANAGED_RENAME_ORIGIN` is **deliberately excluded**. | If v14 changes origin semantics from "opaque object passed through `transact`" to anything else, this Set's identity-match contract breaks → 50+ integration tests + the fuzzer go red. **Single-point-of-failure for the typed-origin pattern.** | moderate (potentially heavy) |
| `packages/app/tests/integration/test-harness.ts:572-611` | — | **`attachBridgeInvariantWatcher(doc, opts?)`** — attaches `doc.on('afterTransaction', afterTx)` + returns `() => doc.off('afterTransaction', afterTx)`. Inside `afterTx`: `if (!enforcing.has(tx.origin)) return; ... mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment))`. | **Single-point-of-contact for invariant enforcement.** Survives v14 IFF: (1) `YDoc#on('afterTransaction', ...)` is preserved in `@y/y`; (2) `Set.has(tx.origin)` identity match still works; (3) `yXmlFragmentToProsemirrorJSON` has a successor. (1) is documented v14 behavior; (2) and (3) are the open questions. | moderate |
| `packages/app/tests/integration/test-harness.ts:629-675` | — | `createManualScheduler()` — pure JS, no Yjs API | survives unchanged | trivial |
| `packages/app/tests/integration/test-harness.ts:701-770` (lines 716+) | — | `createItemOriginProbe(ytext, { trackedOrigins: Array<LocalTransactionOrigin> })` wraps `new Y.UndoManager(ytext, { trackedOrigins: new Set(opts.trackedOrigins) })`. **Identity-based** Set match per CLAUDE.md precedent #1. | `Y.UndoManager` is in v13; its v14 successor must accept identity-keyed `trackedOrigins`. **Validate before porting**, this is the same risk surface as the bridge-invariant watcher. | moderate |
| `packages/app/tests/integration/network-control.ts` (166 LOC) | (no Yjs imports — wraps the WebSocket layer below Hocuspocus) | `ControllableWebSocket` proxy + `pauseInbound()`/`resumeInbound()` API | survives unchanged (Hocuspocus 5 is still WebSocket-based per public statements) | trivial |

### Tests (HIGH impact at the call-site count level, MEDIUM at conceptual level)

50+ test files import Yjs surface. Sampling of the load-bearing ones:

| File:line | Imports | Notable usage | Migration shape | Effort |
| --- | --- | --- | --- | --- |
| `packages/app/src/editor/observers.test.ts:25-26` | `updateYFragment, yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap`; `* as Y` from `yjs` | 7 `new Y.UndoManager(ytext, { trackedOrigins })` with **identity-keyed** typed-origin Sets | identity contract IS load-bearing | moderate |
| `packages/app/src/editor/observers.test.ts:528, 584` | — | `Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))` — multi-doc sync simulation | v14 must preserve cross-doc binary update format OR we re-encode via the new transport | moderate |
| `packages/app/tests/fidelity/invariant-i6.test.ts:40, 65, 74-75` | — | 4 `Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))` cross-doc round-trips | binary update format compatibility — v14 likely renames but should preserve concept | moderate |
| `packages/app/src/editor/observer-sync.test.ts:11, 12` | `updateYFragment` from `@tiptap/y-tiptap`; `* as Y` | observer self-skip behavior tests | moderate | moderate |
| `packages/app/tests/integration/bridge-matrix.test.ts:20-21` | `updateYFragment, yXmlFragmentToProsemirrorJSON`; `* as Y` | Tier 1 bridge matrix — `client.doc.transact(fn)`, `new Y.UndoManager(srv.ytext, { trackedOrigins })` (line 780) | trivial site-by-site | trivial-moderate |
| `packages/app/tests/integration/c1-concurrent-wysiwyg.test.ts:14`, `c2-concurrent-source.test.ts`, `c3-mixed-mode.test.ts:15`, ..., `c10-server-restart.test.ts:176` | `* as Y` from `yjs` | C1-C10 server-authoritative integration suite — multi-client `client.doc.transact(...)` | trivial | trivial |
| `packages/app/tests/integration/bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts:25-26, 70, 89, 157, 172, 179, 181` | `updateYFragment, yXmlFragmentToProsemirrorJSON`; `* as Y` | **skip-guarded V0-14 agent-undo test.** When V0-14 lands, this test unskips. The migration must validate this works under v14 simultaneously. | moderate |
| `packages/app/tests/integration/rawmdxfallback-multi-client.test.ts:28, 143, 165, 199, 263, 267` | `* as Y` | `Y.createRelativePositionFromTypeIndex` + `createAbsolutePositionFromRelativePosition` for cursor-survival assertions | moderate | moderate |
| `packages/app/tests/integration/cc1-broadcast.test.ts:12, 306` | `* as Y`; `HocuspocusProvider` | `server.instance.hocuspocus.documents.get(SYSTEM_DOC_NAME)` — verifies CC1 push contract | trivial | trivial |
| `packages/app/tests/stress/bridge-convergence.fuzz.test.ts:50, 105, 191, 260, 268-280, 451, 653` | `* as Y` | **D18 multi-client convergence fuzzer.** `Y.RelativePosition` chunked-insert fuzzing op. Replay via `STRESS_FUZZ_SEED=<n>`. | moderate | moderate |
| `packages/app/tests/stress/server-authoritative-stress.test.ts:32, 72` | `* as Y` | 5-client × 30s mixed edits stress | trivial | trivial |
| `packages/app/tests/stress/stress-api.ts:18-19, 75-92, 165, 199, 215, 227` | `HocuspocusProvider`; `* as Y` | Layer B stress against running dev server. `new Y.Doc()`, `doc.getText('source')` per client | trivial | trivial |
| `packages/server/src/standalone.test.ts:6, 125, 145, 183, 192, 228, 234, 243, 299, 306, 374-376, 399` | `* as Y` | server boot tests use `await server.hocuspocus.openDirectConnection(docName)` | Hocuspocus 5 contract | moderate |
| `packages/server/src/server-observers.test.ts:19-20, 90-91` | `updateYFragment, yXmlFragmentToProsemirrorJSON`; `* as Y` | unit tests for `setupServerObservers`. 8 sites of `doc.on('afterTransaction', (tx: Y.Transaction) => { ... })` (lines 127, 238, 260, 364, 391, 423, 551, 582). | identity contract is load-bearing | moderate |
| `packages/server/src/external-change.test.ts:13, 14, 19-20, 52, 56, 62, 79, 83, 87-92, 108, 156-170` | `Hocuspocus`; `* as Y` (type) | external-change roundtrips, `ytext.observe(observer)`, `doc.on('beforeTransaction', (tx: Y.Transaction) => { ... })` | moderate | moderate |
| `packages/server/src/cc1-broadcast.test.ts:2, 40-47` | `Hocuspocus` (type); mock `{ broadcastStateless, getConnectionsCount }` | mock-based tests | trivial | trivial |
| `packages/server/src/api-patch.test.ts:12-13, 36, 60, 79, 98, 128, 149, 169` | `Hocuspocus`; `* as Y` (type) | patch endpoint tests reading `doc.getText('source')` | trivial | trivial |
| `packages/server/src/api-agent-patch.test.ts:7, 79, 84, 121, 126, 160, 165` | `Hocuspocus`; (no Y direct, uses dc) | agent-patch handler tests | trivial | trivial |
| `packages/server/src/api-file-ops.test.ts:17-18, 195-218` | `Hocuspocus`; `* as Y` (type) | file ops + `await hocuspocus.openDirectConnection('journal')` | moderate | moderate |
| `packages/server/src/agent-sessions.test.ts:2, 21` | `Document` (type); mock `{ setLocalStateField, ... }` | mock-based tests | trivial | trivial |
| `packages/server/src/agent-focus.test.ts:2` | `Hocuspocus` (type) | tests | trivial | trivial |
| `packages/server/src/api-suggest-links.test.ts:7` | `Hocuspocus` (type) | tests | trivial | trivial |
| `packages/server/src/live-derived-index.test.ts:2-3` | `Hocuspocus`; `* as Y` (type) | tests | trivial | trivial |
| `packages/server/src/on-agent-write.test.ts:14` | `Hocuspocus` | tests | trivial | trivial |
| `packages/server/src/suggest-links.test.ts:5-6, 211, 215` | `Hocuspocus`; `* as Y` (type); `await hocuspocus.openDirectConnection('notes')`; `doc.transact(() => { ... })` | tests | moderate | moderate |
| `packages/server/src/api-extension.test.ts:100` | — | `hocuspocus.configuration.extensions.push(ext)` | tests | trivial |
| `packages/app/tests/integration/provider-pool-reconnect.test.ts:7, 113, 159, 160, 163, 165, 205-206, 221` | `Hocuspocus`; `provider.isSynced`, `provider.unsyncedChanges`, `hocuspocus.handleConnection`, `hocuspocus.closeConnections`, `hocuspocus.flushPendingStores`, `hocuspocus.documents.values()`, `hocuspocus.unloadDocument(doc)` | client-side reconnect tests | moderate | moderate |
| `packages/app/src/editor/sync-promise.test.ts:9` | `HocuspocusProvider` from `@hocuspocus/provider` | tests | trivial | trivial |
| `packages/app/src/components/DocumentBoundary.test.ts:17` | `HocuspocusProvider` from `@hocuspocus/provider` | tests | trivial | trivial |
| `packages/app/src/server/agent-flow.test.ts:15, 18-19, 44-265, 242, 259` | `Hocuspocus`; `updateYFragment, yXmlFragmentToProsemirrorJSON`; `* as Y` | end-to-end agent flow tests, `fragment.observeDeep(observer)` | moderate | moderate |
| `packages/app/tests/conversion/conversion-fidelity.test.ts:17-18, 356, 384` | `updateYFragment, yXmlFragmentToProsemirrorJSON`; `* as Y` | conversion fidelity round-trip | trivial-moderate | moderate |
| `packages/app/tests/fidelity/invariant-i5.test.ts:12, 14`, `invariant-i6.test.ts:12, 14`, `invariant-i7.test.ts:13, 15` | `updateYFragment, yXmlFragmentToProsemirrorJSON`; `* as Y` | I5/I6/I7 PBT invariants | moderate | moderate |
| `packages/app/tests/integration/bug-c-real-reachability.test.ts:20-22, 42, 84, 152` | `HocuspocusProvider`; `updateYFragment, yXmlFragmentToProsemirrorJSON`; `* as Y` | empirical reachability reproducer | moderate | moderate |
| `packages/app/tests/integration/bug-a-mechanism-isolation.test.ts:18, 40, 59` | `updateYFragment, yXmlFragmentToProsemirrorJSON` | mechanism-isolation reproducer | moderate | moderate |
| `packages/app/tests/integration/bridge-convergence-regression.test.ts:17, 47` | `updateYFragment` | primary 4-test regression harness for Bug-A + Bug-B | moderate | moderate |
| `packages/app/tests/integration/c4-agent-plus-wysiwyg.test.ts`, `c5-agent-plus-source.test.ts`, `c6-mode-switch-mid-debounce.test.ts:20, 93+, c7-disconnect-reconnect-burst.test.ts:14, c8-triple-concurrent.test.ts:20, c9-join-mid-debounce.test.ts:14, 187, 254`, `c10-server-restart.test.ts:176` | `* as Y` | C-suite integration tests | trivial | trivial |
| `packages/app/tests/integration/symlink-alias.test.ts:69` | — | `srv.hocuspocus.handleConnection(...)` | trivial | trivial |
| `packages/core/src/y-prosemirror-patch.test.ts:81-135` | — | `expect(patched?.['y-prosemirror@1.3.7']).toBeDefined()`, asserts the installed `node_modules/y-prosemirror/dist/y-prosemirror.cjs` contains `[y-prosemirror] schema.node(` and `[y-prosemirror] schema.text(` markers | This test is the **single source of truth for the patch surviving install**. v14 migration deletes this test wholesale OR replaces with the v14 patch verification. | trivial (delete) |
| `packages/core/src/schema-invariant.test.ts:16, 137, 169` | — | references the y-prosemirror R13 patch behavior in assertions | review on v14 port | moderate |
| `packages/core/src/metrics/parse-health.test.ts:77` | — | references the patch's `globalThis.__okYpsCounters` | review on v14 port | moderate |
| `packages/core/src/metrics/parse-health.ts:14, 70` | — | reads `globalThis.__okYpsCounters` populated by the y-prosemirror CJS patch | If the patch is replaced under v14, this counter wiring needs an equivalent. | moderate |
| `packages/core/src/utils/apply-by-prefix-suffix.test.ts:2` | `* as Y` from `yjs` | unit tests for the prefix/suffix bridge utility | trivial | trivial |

### MCP tools (LOW impact)

| File | Imports | Notes |
| --- | --- | --- |
| `packages/cli/src/mcp/tools.ts` | **zero Yjs imports** | Communicates with running server exclusively via HTTP (`POST /api/agent-write-md` etc.). |
| `packages/cli/src/mcp/*.ts` (all) | **zero Yjs imports** | MCP stdio + tool layer is decoupled. |
| `packages/cli/package.json:34` | `@hocuspocus/provider: 4.0.0-rc.1` | Listed as dep but **not actually imported** anywhere in `packages/cli/src` — verified by ripgrep. Likely vestigial; can be dropped before/during the v14 port. |

### Docs site (NONE)

| Result | Notes |
| --- | --- |
| 0 imports of Yjs ecosystem in `docs/src` | Verified. The 4 `.mdx` files mentioning yjs/hocuspocus (`docs/content/internals/{architecture,server-lifecycle,service-topology,validations}.mdx`) reference the names in prose only. |

---

## Patches matrix

We carry **two** patches via `bun patch`:

### 1. `patches/y-prosemirror@1.3.7.patch` (100 lines)

**What it patches.** `node_modules/y-prosemirror/dist/y-prosemirror.cjs` and `src/plugins/sync-plugin.js`, two coupled hunks each. Replaces the destructive `Item.delete(transaction)` in `createNodeFromYElement` and `createTextNodesFromYText` (the `catch (e)` branches at the original lines 876 and 911 of the dist) with:

  - block context (`!isInline`): substitute a `rawMdxFallback` PM node carrying the failed `nodeName` as text, increment `__okYpsCounters.block`, return the substitute (preserving Y.Item identity);
  - inline context (`isInline`): increment `__okYpsCounters.inline`, return null (skip without delete).

**Why it exists.** The upstream destructive delete is **CRDT-permanent**, **multi-peer broadcast**, and **undo-resistant** (CLAUDE.md precedent #9). Reverting would silently delete user content on schema-throw failures.

**Consumer call sites that depend on the patched runtime behavior** (none import the patched module directly — they consume it via `@tiptap/y-tiptap`'s `updateYFragment`, which internally invokes `createNodeFromYElement` and `createTextNodesFromYText`):

| Call site | Patched behavior dependency |
| --- | --- |
| `packages/server/src/server-observers.ts:337` (`updateYFragment` in Observer B) | If a parsed PM JSON contains a node whose `schema.node()` throws (unknown attr, narrowed validate, missing node type), the patch substitutes `rawMdxFallback` instead of deleting the Y.Item. |
| `packages/server/src/external-change.ts:63` (`updateYFragment` in `applyExternalChange`) | Same — disk-bridge writes survive schema mismatches. |
| `packages/server/src/agent-sessions.ts:124` (`updateYFragment` in `applyAgentMarkdownWrite`) | Same — agent writes survive. |
| `packages/server/src/api-extension.ts:810, 2107` (`updateYFragment` in managed-rename + rollback paths) | Same. |
| `packages/server/src/persistence.ts:376` (`updateYFragment` in `onLoadDocument`) | Same — disk loads survive parse degradation. |
| `packages/app/src/editor/observers.ts` (uses `yXmlFragmentToProsemirrorJSON` only — read side, not mutated) | Read-side does not invoke the patched code path (that fires on `Y.XmlFragment` → PM node materialization, not the JSON serialization). |
| `packages/core/src/metrics/parse-health.ts:14, 70` | Reads the global `__okYpsCounters` populated by the patch — direct dependency. |

**v14 port risk.** `@y/prosemirror` is a rewrite. Its analog of `createNodeFromYElement`/`createTextNodesFromYText` may not exist or may already handle schema-throw without destructive delete. **Probe required:** before porting, build a test fixture that throws in `schema.node()` and observe whether v14 destroys, substitutes, or skips. If it destroys, the patch must be re-ported; if it substitutes, our fallback can simplify; if it skips, parse-health metrics break and need a new event source. Verification owner: `packages/core/src/y-prosemirror-patch.test.ts` is the trip-wire.

### 2. `patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch`

Out of scope for Yjs migration — this is a markdown-pipeline patch (PR #3 + US-017 hydrateMarks rewrite). Mentioned for completeness only; it does not touch Yjs internals.

### Yjs internals reach-in (probably none, verified)

We **do not import or depend on Yjs internals** from any production file:

- No `import` of `'yjs/dist/...'` or `'yjs/internals/...'` paths anywhere in `packages/`.
- The single private-API touch: `transaction.changedParentTypes` in `packages/app/src/editor/observers.ts:268-271`, accessed via `as Y.Transaction & { changedParentTypes?: Map<unknown, unknown> }` cast, with a degradation comment ("If a future Yjs release removes or renames it, this degrades to arming the grace window for every remote XmlFragment change, which adds latency but preserves convergence.").
- The single public-but-uncommon-shape touch: `awareness.states` map (a `y-protocols/awareness` internal Map exposed publicly), used **only** in the DEV-only test hook at `packages/app/src/components/SystemDocSubscriber.tsx:131` (`awareness.states.set(fakeClientId, fakeState)` and `awareness.emit('change', ...)`).

---

## Origin truth table delta

The 7 typed origins (all `LocalTransactionOrigin` object refs per CLAUDE.md precedent #1 — identity-keyed in every `Set.has` / `trackedOrigins` / enforcing-origin call site):

| Origin name | Defined at | `skipStoreHooks` | In bridge invariant enforcing set | Used by |
| --- | --- | :-: | :-: | --- |
| `OBSERVER_SYNC_ORIGIN` | `server-observers.ts:56-60` | `true` | yes | server observer A/B writes (cross-CRDT sync) |
| `AGENT_WRITE_ORIGIN` | `agent-sessions.ts:52-56` | `false` | yes | `applyAgentMarkdownWrite` callers (agent-write, agent-write-md, agent-patch) |
| `FILE_WATCHER_ORIGIN` | `external-change.ts:27-31` | `true` | yes | `applyExternalChange` (disk → CRDT bridge) |
| `ROLLBACK_ORIGIN` | `api-extension.ts:104-108` | `false` | yes | timeline rollback handler |
| `MANAGED_RENAME_ORIGIN` | `api-extension.ts:110-114` | `false` | **no** (deliberately excluded; verified at `test-harness.ts:526-533`) | `applyManagedRenameToLoadedDocument` rewrite path |
| `ORIGIN_TREE_TO_TEXT` | `observers.ts:57-61` | `false` | yes | client observer A self-skip guard (write paths deleted per precedent #14, but the ref is retained for identity matching) |
| `ORIGIN_TEXT_TO_TREE` | `observers.ts:67-71` | `false` | yes | client observer B self-skip guard (same as above) |

**What changes if Yjs v14 changes `transaction.origin` semantics:**

1. **If v14 keeps `origin` as a per-transaction opaque value passed through `transact(_, origin)` and preserved on `transaction.origin`** (most likely): identity-based matching survives unchanged. `Set<LocalTransactionOrigin>.has(tx.origin)` still works. Only typedef churn (rename `LocalTransactionOrigin` to whatever Hocuspocus 5 names it).
2. **If v14 normalizes/serializes `origin`** (e.g. forces it to a string at boundary): the entire enforcing-origin Set's identity contract breaks. Mutation G's safety net (the integration test that validates the deletion of client cross-CRDT writes is load-bearing) silently passes. **Every typed-origin guard would need to become a `context.origin` string match.** This is the heavy-port scenario.
3. **If v14 keeps origin per-transaction but changes how it interacts with `Y.UndoManager.trackedOrigins`** (e.g. moves to a registration model): the 7 `new Y.UndoManager(ytext, { trackedOrigins: new Set([...]) })` sites in tests + the `createItemOriginProbe` factory at `test-harness.ts:716` need re-architecting. V0-14 agent-undo's planned per-agent UndoManager design is also exposed.
4. **If v14 removes `transaction.changedParentTypes` (private API)**: `observers.ts:268-271` degrades gracefully per the in-source comment — all remote XmlFragment changes arm the grace window, costing slight latency but preserving convergence. Acceptable.

**Files that would change if v14 alters origin semantics scenario (2):** all 7 origin-defining files + `test-harness.ts:526-533` (the enforcing Set) + `test-harness.ts:716` (UndoManager factory) + `server-observers.ts:206, 214, 380` + `observers.ts:255-289, 399-411` + `live-derived-index.ts:23-26` (the `isLocalOriginLike` type guard duplicate). ~50-100 LOC across ~10 files; mechanical but mandatory.

---

## Bridge invariant watcher

**Single point of contact:** `packages/app/tests/integration/test-harness.ts:572-611`.

```typescript
export function attachBridgeInvariantWatcher(
  doc: Y.Doc,
  opts: { onViolation?: (info: InvariantViolation) => void; enforcingOrigins?: Set<unknown> } = {},
): () => void {
  const fragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  const enforcing = opts.enforcingOrigins ?? BRIDGE_ENFORCING_ORIGINS;

  const afterTx = (tx: Y.Transaction): void => {
    if (!enforcing.has(tx.origin)) return;

    const ytextStr = ytext.toString();
    const fm = (doc.getMap('metadata').get('frontmatter') as string | undefined) ?? '';
    const fragBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
    const fragMd = prependFrontmatter(fm, fragBody);
    // ... assertion + throw ...
  };

  doc.on('afterTransaction', afterTx);
  return () => doc.off('afterTransaction', afterTx);
}
```

**Yjs API dependencies, inventoried:**

1. `doc.on('afterTransaction', cb)` and `doc.off('afterTransaction', cb)` — Yjs 13 public API. v14: Yjs's `YDoc#on/#off('afterTransaction', ...)` is documented as preserved. **Survives.**
2. `tx.origin` — identity-comparable opaque value. **Survives** under origin-truth-table scenario (1) above; **breaks** under (2).
3. `doc.getXmlFragment('default')`, `doc.getText('source')`, `doc.getMap('metadata').get('frontmatter')` — Yjs 13 public APIs. v14: replaced by DConf-typed `YDoc#get(name, type)` accessors. **Mechanical port.**
4. `yXmlFragmentToProsemirrorJSON(fragment)` — `@tiptap/y-tiptap` API. v14: needs `@y/tiptap` or `@y/prosemirror` successor. **Heavy.**

**Verdict:** the watcher itself survives Yjs 14 unchanged in shape. Its dependencies — the `getXmlFragment`/`getText`/`getMap` accessor pattern + `yXmlFragmentToProsemirrorJSON` + the typed-origin Set's identity-matching contract — are all documented elsewhere in this report. The watcher does not introduce new risk; it inherits the bridge layer's risk.

---

## Aggregate findings (one-line)

The **majority** of OK's Yjs surface (call sites) is trivial-to-port (CRUD, observer attach/detach, `getMap`/`getText`/`getXmlFragment` accessors, basic `transact`). The **load-bearing** surface that gates the entire migration is concentrated in three places: (1) the `@tiptap/y-tiptap` exports `updateYFragment` + `yXmlFragmentToProsemirrorJSON` used in 11 production files for cross-CRDT bridging; (2) the `y-prosemirror@1.3.7` patch's destructive-delete substitution that 5 production write paths transitively rely on for data preservation; (3) the `LocalTransactionOrigin` typed-object identity contract that 7 origin singletons + 1 enforcing-Set + 8+ `Y.UndoManager.trackedOrigins` sites depend on. None of these have published Yjs 14 successors as of 2026-04-16; the migration is **blocked at the upstream library layer**, not at our code layer.
