# Option B: Loro Full Migration — Full Blast Radius Map

**Date:** 2026-04-16
**Scope:** Greenfield framing — what would actually need to exist if Open Knowledge's CRDT layer were rebuilt on Loro (no migration cost from existing code; map every component that must exist on the other side).
**Method:** Direct npm registry probes (loro-crdt, loro-prosemirror, loro-codemirror, loro-websocket, @loro-extended/repo, prosekit), GitHub gh-API on issues/commits, raw source-trace of `loro-prosemirror/src/{sync-plugin,lib,undo-plugin,text-style,index}.ts`, `loro-codemirror/src/{index,sync}.ts`, `loro-websocket/src/server/simple-server.ts`, `loro-extended/packages/repo/src/repo.ts`, the Loro WASM `.d.ts` (3.1 MB raw / ≈1.0 MB gzipped). Source-traced our repo: `package.json` files, `bridge/`, `server-observers.ts`, `agent-sessions.ts`, `external-change.ts`, `api-extension.ts`, `extensions/shared.ts`, `clipboard/source-clipboard.ts`, `mcp/tools/{edit,write}-document.ts`, `patches/y-prosemirror@1.3.7.patch`. All claims source-cited file:line where applicable.

**Companion to:** `reports/loro-ecosystem-readiness-assessment/REPORT.md` (2026-04-07) and `reports/peritext-on-yjs-feasibility/REPORT.md` (2026-04-07 + 2026-04-16 refresh).

---

## Stack-level summary

A Loro greenfield rebuild is **not** "swap one yjs import for one loro-crdt import." It is a **full sync-stack swap + custom server build + dual-binding rewrite + per-write-surface re-architecting + tests-coupled-to-Yjs-internals deletion**. Concretely, every piece of the stack except the markdown pipeline (`packages/core/src/markdown/`) and the React app shell + clipboard mdast hub changes shape:

- **Editor bindings:** TipTap's `@tiptap/y-tiptap` (Y.XmlFragment-based) is replaced by `loro-prosemirror@0.4.3` (LoroDoc tree shape — `LoroMap<{nodeName, attributes, children: LoroList<LoroMap | LoroText>}>`). y-codemirror.next is replaced by `loro-codemirror@0.3.3`, BUT — critical — `loro-codemirror` accepts only a flat `LoroText` via `getTextFromDoc(doc) => LoroText` and cannot consume the tree shape that `loro-prosemirror` writes. The dual-view model the OK editor depends on does not exist out-of-the-box; we'd be writing a tree-to-flat-text bridge that is *exactly the analogue of what we just spent 3 specs eliminating* (server-authoritative observer bridge in `specs/2026-04-15-server-authoritative-observer-bridge/`).
- **CRDT primitives:** Y.XmlFragment + Y.Text + Y.Map → LoroMap-tree (rich text shape) + LoroText (source) + LoroMap (metadata/activity). UndoManager differs structurally (per-doc, exclude-origin-prefix-based, NOT per-origin-set-based). No `Y.RelativePosition` — Loro has `Cursor` with similar semantics but a different API.
- **Server:** Hocuspocus 4.0.0-rc.1 must be REPLACED. There is no Loro server with comparable lifecycle hooks. SimpleServer (loro-websocket@0.6.2) covers `onLoadDocument` / `onSaveDocument` / `authenticate` / `handshakeAuth` only — no `afterLoadDocument`, no `openDirectConnection`, no `beforeBroadcastStateless`, no `afterUnloadDocument`. Two options: (a) extend SchoolAI's `@loro-extended/repo` (5.4.2, 2026-02-24) which is a *client-shape framework*, not a server-authoritative-bridge orchestrator; (b) WRITE-CUSTOM the entire document lifecycle layer on top of `loro-websocket`'s SimpleServer + raw `LoroDoc` server-side. Option (b) is what we'd actually do.
- **Server-side cross-CRDT bridge:** The current `server-observers.ts` (401 LOC) + `external-change.ts` (95 LOC) + bridge utilities (854 LOC) all assume Y.XmlFragment ↔ Y.Text divergent representations bound by `OBSERVER_SYNC_ORIGIN`. Under Loro, the dual-CRDT bridge problem reshapes — the WYSIWYG and source mode would either (a) bind to the *same* LoroDoc using the `loro-prosemirror` tree shape (then `loro-codemirror` cannot consume it — see above), or (b) bind to two different LoroDocs synced via a WRITE-CUSTOM observer pair semantically equivalent to today's bridge but rewritten against Loro's `subscribe(LoroEventBatch)` API. Option (a) requires forking `loro-codemirror` to consume tree shape; option (b) keeps the bridge problem we're solving today, just relocates it.
- **Agent write surfaces:** `applyAgentMarkdownWrite` (`agent-sessions.ts:88-138`), `applyExternalChange` (`external-change.ts:48-77`), and the rollback / managed-rename paths in `api-extension.ts` all rely on `document.transact(fn, AGENT_WRITE_ORIGIN)` — Hocuspocus's typed-origin transaction wrapper. Loro has NO `transact(fn, origin)` API. The closest equivalent is `doc.setNextCommitOrigin(string)` + mutate + `doc.commit()` — origin is a STRING, not a typed object reference. Precedent #1 (typed origins, identity-based matching in Sets) does not translate cleanly.
- **Markdown pipeline (`packages/core/src/markdown/`):** SURVIVES nearly unchanged — only depends on mdast/PM types, not Y.* internals. The two consumers (parse → JSON → schema.nodeFromJSON; serialize ← JSON ← yXmlFragmentToProsemirrorJSON) change at their boundaries.
- **Clipboard mdast pipeline (precedent #19):** Hub layer SURVIVES. Per-view CRDT writes change. `chunkedYTextInsert` (FR-21 large-paste) and `Y.RelativePosition` cursor-anchoring need Loro re-implementations.
- **MCP tools:** 4 write tools (write_document / edit_document / init_content / consolidate / ingest) keep their HTTP contracts — `/api/agent-write-md` and `/api/agent-patch` payloads are markdown text, not Y.* binary updates. Server-side handlers REWRITE. ~16 read tools SURVIVE.
- **Tests:** ~7,500 LOC of bridge-coupled integration + stress + fuzz tests directly depend on Y.* internals (`Y.Doc`, `Y.Text.toString()`, `Y.XmlFragment` serialization, `Y.UndoManager.trackedOrigins` Set identity, `doc.on('afterTransaction', tx => Set.has(tx.origin))`). All REWRITE — none survive without rewrite to Loro's `LoroEventBatch.by/origin` model.
- **Architectural precedents:** Half SURVIVE conceptually, half need re-anchoring against Loro's primitives. Precedent #9 (schema add-only) translates differently — Loro doesn't have y-prosemirror's destructive-delete failure mode (the `r13 patch` in `patches/y-prosemirror@1.3.7.patch` becomes moot), but Loro's `createNodeFromLoroObj` in `lib.ts:115-128` has its own try/catch-and-skip that loses content silently.
- **Pre-1.0 risk:** `loro-prosemirror@0.4.3` is February 2026; **issue #77 (data-wipe on docChanged-before-init) remains OPEN as of 2026-03-28 with zero comments and zero engagement from maintainers**. Loro core has open production-panic regressions (#943) and an unsafe-decode flagged 2026-04-09 (#945). Single-maintainer (`leon7hao` for codemirror; `rem2018` for prosemirror) bus factor.
- **Bundle size:** WASM is **3.1 MB raw / 1,016,551 bytes (≈1.0 MB) gzipped**. App bundle has a `size-limit` of `800 kB gzipped` for `index-*.js` and `950 kB gzipped` for all chunks combined (`packages/app/package.json:24-43`). Adding ~1 MB gzipped of Loro WASM blows BOTH ceilings on first load — the size-limit gate fails CI. CLI distribution (`@inkeep/open-knowledge`) gets the same WASM into its `dist/public/` via `bun run build:assets`.

**Headline:** Greenfield Loro rebuild is a 12–20 week effort (matches the 2026-04-07 prior-art assessment), and that estimate **does not include rewriting the entire test suite** or fixing the `loro-codemirror` dual-view gap. The two large pieces of original work nobody else has done are: (1) build a Hocuspocus-feature-parity Loro server with `openDirectConnection`-equivalent direct-CRDT manipulation, lifecycle hooks (`afterLoadDocument`, `afterUnloadDocument`, `beforeBroadcastStateless`), and stateless broadcast for CC1; (2) bridge `loro-prosemirror`'s tree shape and `loro-codemirror`'s flat-text shape so dual-view actually works (the same architectural problem as the Yjs bridge, just relocated and not solved by Loro's primitives).

---

## Library-level changes

### REPLACE / PATCH / WRITE-CUSTOM / SURVIVES table — every npm dep involved

#### CRDT layer

| Current | Action | Replacement / verified version | Notes |
|---|---|---|---|
| `yjs@^13.6.30` | REPLACE | `loro-crdt@1.11.0` (2026-04-12) | Per `registry.npmjs.org/loro-crdt/latest`; peer-deps: none; ships 3.1 MB WASM. |
| `@hocuspocus/server@4.0.0-rc.1` | WRITE-CUSTOM | (no equivalent on npm) | `loro-websocket@0.6.2` SimpleServer covers ~30% of needed lifecycle. `@loro-extended/repo@5.4.2` is a CLIENT-shape framework. Hocuspocus features missing: `openDirectConnection`, `afterLoadDocument`, `beforeBroadcastStateless`, `afterUnloadDocument`, structured `LocalTransactionOrigin`, `Document.transact(fn, origin)`, awareness binding, per-doc memory limits, debounce-store. |
| `@hocuspocus/provider@4.0.0-rc.1` | REPLACE | `loro-websocket@0.6.2` `LoroWebsocketClient` | Different room-multiplexing model (4-byte magic prefix per-room: `%LOR`, `%EPH`, `%ELO`, `%YJS`/`%YAW`); message fragmentation at 256 KiB. |
| `@tiptap/y-tiptap@^3.0.3` | REPLACE | `loro-prosemirror@0.4.3` (2026-02-19) | Peer-dep `loro-crdt@^1.10.2`. Provides `LoroSyncPlugin`, `LoroUndoPlugin`, `LoroEphemeralCursorPlugin`, `LoroCursorPlugin` (deprecated), `CursorEphemeralStore`. |
| `@tiptap/extension-collaboration@^3.22.3` | REPLACE | (covered by `loro-prosemirror`) | Loro doesn't need the TipTap extension wrapper — `LoroSyncPlugin` is a bare ProseMirror plugin. The `@tiptap/extension-collaboration` v2 wrapper around y-prosemirror gets dropped. |
| `@tiptap/extension-collaboration-cursor@3.0.0` | REPLACE | `LoroEphemeralCursorPlugin` from `loro-prosemirror` | Different presence model — Loro `EphemeralStore` uses LWW per-key with timeout (default 30 s); Y.js `Awareness` is offset-encoded full-state per peer. |
| `y-codemirror.next@^0.3.5` | REPLACE | `loro-codemirror@0.3.3` (2025-10-07) + WRITE-CUSTOM tree-flat bridge | **Critical gap** — `loro-codemirror`'s `LoroSyncPlugin(doc, getTextFromDoc?)` accepts only a `(doc) => LoroText` reducer; it cannot consume the `LoroMap<LoroNodeContainerType>` tree shape that `loro-prosemirror` writes. Single-maintainer (`leon7hao`), 41 stars, 36 commits, last release 6 months ago. |
| `y-prosemirror@1.3.7` (transitively via `@tiptap/y-tiptap`) | REPLACE | `loro-prosemirror@0.4.3` | Eliminates our `patches/y-prosemirror@1.3.7.patch` (R13 destructive-delete substitution, see below). Loro has its own try/catch-and-skip in `lib.ts:115-128` and `lib.ts:135-150` — when `schema.node()` throws, it `console.error(e)` and *continues without the node*. Same risk class, different shape — see "Pre-1.0 risk" §. |

#### Markdown / serialization (largely unchanged)

| Current | Action | Notes |
|---|---|---|
| `@handlewithcare/remark-prosemirror@0.1.5` (patched) | SURVIVES-AS-IS | Operates on PM JSON, not Y.*. Patch persists. |
| `unified` + `remark-parse` + `remark-frontmatter` + `remark-gfm` + `mdast-util-mdx` family | SURVIVES-AS-IS | Markdown pipeline is CRDT-orthogonal. |
| `prosemirror-*` packages | SURVIVES-AS-IS | Same PM model both sides. |
| `diff-match-patch@^1.0.5` | SURVIVES-AS-IS in PRINCIPLE, MAY-BE-DROPPED | We use it for `applyFastDiff` (server bridge → Y.Text) and for source-clipboard chunked insert. Loro's `LoroText` has its own efficient delta application via `applyDelta(Delta<string>[])` — for the new tree-flat bridge, DMP may still be the best fit; for direct LoroText writes, Loro's native ops outperform. |
| `node-diff3@^3.2.0` | SURVIVES-AS-IS in PRINCIPLE | We use it for `mergeThreeWay` (Path B in Observer A). The function still applies if the new bridge keeps a "merge two text views" pattern; it dies if we collapse to a single LoroDoc shape. |

#### Editor + clipboard

| Current | Action | Notes |
|---|---|---|
| `@codemirror/state` + `@codemirror/view` + `@codemirror/lang-*` family | SURVIVES-AS-IS | Loro-codemirror binding sits below CM6 extensions. |
| `@tiptap/core` + `@tiptap/starter-kit` + extension family | SURVIVES-AS-IS | Loro-prosemirror is below TipTap; TipTap extensions don't care which CRDT binding is below. |
| `@tiptap/react` | SURVIVES-AS-IS | React glue. |
| All `rehype-*` + `remark-*` + `mdast-util-*` clipboard pipeline modules | SURVIVES-AS-IS | precedent #19 mdast-canonical hub is CRDT-orthogonal. |
| `react@^19.2.5` + `react-dom` + Activity/Suspense + `react-error-boundary` | SURVIVES-AS-IS | Hybrid render tree (precedent #18) operates above the CRDT layer. |

#### Server-side (most things rewrite)

| Current | Action | Notes |
|---|---|---|
| `chokidar` + `@parcel/watcher` (file-watcher) | SURVIVES-AS-IS | Disk watcher is CRDT-orthogonal. The `applyExternalChange` consumer rewrites. |
| `simple-git` (shadow-repo) | SURVIVES-AS-IS | git plumbing is CRDT-orthogonal. The flush trigger (currently `flushDocToGit` after agent write) has to dispatch from new Loro-side hooks instead of Hocuspocus `onChange`. |
| `pino` logging | SURVIVES-AS-IS | |
| `ws` (WebSocket) | SURVIVES-AS-IS | Loro's SimpleServer also uses `ws`. |
| `busboy` (multipart upload) | SURVIVES-AS-IS | API server is HTTP-side — independent of CRDT choice. |
| `ignore` + `picomatch` (content-filter) | SURVIVES-AS-IS | |

#### MCP tooling

| Current | Action | Notes |
|---|---|---|
| `@modelcontextprotocol/sdk@^1.28.0` | SURVIVES-AS-IS | MCP protocol is HTTP/JSON, not CRDT-aware. |
| `commander` + `@clack/prompts` + `picocolors` (CLI) | SURVIVES-AS-IS | |
| `zod` (config + tool schemas) | SURVIVES-AS-IS | |

#### Build / quality

| Current | Action | Notes |
|---|---|---|
| `vite` + `tsdown` + `turbo` | SURVIVES-AS-IS | Build chain unaffected. |
| `@biomejs/biome` | SURVIVES-AS-IS | |
| `@playwright/test` | SURVIVES-AS-IS toolchain; tests rewrite | |
| `fast-check` (PBT) | SURVIVES-AS-IS toolchain; PBT generators on rich-text need port to Loro APIs | |
| `bun` runtime | SURVIVES-AS-IS | Loro WASM works under Bun (loro-crdt's own test suite includes `bun test`). |
| `size-limit` | NEEDS-RECALIBRATION | Current limits (`800 kB gzipped` main, `950 kB gzipped` total) WILL fail with +1 MB Loro WASM. Either raise limits to ~2 MB (a 2.1× regression vs today), or move WASM to lazy-loaded async chunk and accept first-edit latency hit. |

#### Patches — what becomes moot, what's needed

| Patch | Action under Loro |
|---|---|
| `patches/y-prosemirror@1.3.7.patch` (R13 destructive-delete substitution) | DROP — y-prosemirror gone; Loro has different failure mode (try/catch-and-skip in `lib.ts:115-128`). New equivalent patch may be needed against `loro-prosemirror` if we need rawMdxFallback substitution there too — see Pre-1.0 risk §. |
| `patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch` | SURVIVES-AS-IS | Patches PM-side behavior, not CRDT. |

---

## Component-by-component map

For every surface in OK today, what changes / what survives.

### Editor surfaces

#### TipTap WYSIWYG

**Today:** `@tiptap/extension-collaboration` wires `Y.XmlFragment` to TipTap via `@tiptap/y-tiptap`'s `updateYFragment(doc, fragment, pmNode, meta)` (called from `applyAgentMarkdownWrite`, `applyExternalChange`, server observer B, all integration tests). `yXmlFragmentToProsemirrorJSON(fragment)` reads the Y.XmlFragment back as PM JSON.

**Under Loro:** `loro-prosemirror`'s `LoroSyncPlugin({doc, mapping?, containerId?})` (`sync-plugin.ts:38-105`) wires a `LoroDoc` to PM. Initialization path (`init()` at `sync-plugin.ts:107-150`) reads `doc.getMap(ROOT_DOC_KEY)` (default `"doc"`) and reconstructs the PM document via `createNodeFromLoroObj(schema, loroMap, mapping)` (`lib.ts:99-167`). Updates flow:
- **PM → Loro:** `appendTransaction` watches `tr.docChanged`, sets meta `{type: 'doc-changed'}`, then `updateLoroToPmState(doc, mapping, newEditorState, containerId)` (`lib.ts:71-96`) walks the PM tree and mutates the Loro tree in place.
- **Loro → PM:** `doc.subscribe(event => updateNodeOnLoroEvent(view, event))` fires on remote/checkout events, runs `clearChangedNodes` + `createNodeFromLoroObj` + dispatches a full document `view.state.tr.replace(0, doc.content.size, new Slice(...))`.

**Classification:** REPLACE the binding wiring; SURVIVES the TipTap extension list (`packages/core/src/extensions/shared.ts`). Note the **full-document-replace pattern** for Loro→PM (`sync-plugin.ts:147-153`) — for a 100 KB document this re-creates the entire PM tree on every remote update, vs y-prosemirror's incremental approach. Production caveat for large docs.

**Risk:** No TipTap-specific Loro extension exists. Direct `LoroSyncPlugin` use is fine inside TipTap (`useEditor({ editorProps, extensions: [..., new Plugin(LoroSyncPlugin({doc, mapping}))] })` works mechanically), but precedent #14 (server-authoritative bridge) needs reconfirming under Loro's update-fanout model.

#### CodeMirror Source

**Today:** `y-codemirror.next` binds `Y.Text('source')` to a CodeMirror EditorState; `awareness` for cursors. Custom CM6 extensions for source-polish + clipboard.

**Under Loro:** `loro-codemirror@0.3.3` provides `LoroSyncPlugin(doc, getTextFromDoc?)` (`index.ts:43-56`). The plugin assumes `getTextFromDoc(doc)` returns a **flat `LoroText`**. `sync.ts:16-117` consumes the LoroDoc as a single text container — `doc.subscribe`'s event payload is checked `if (diff.type !== 'text') return` (`sync.ts:67`), so any non-text diff (the Map/List structure that `loro-prosemirror` produces) is silently dropped.

**Classification:** WRITE-CUSTOM **the dual-view bridge**. Two architectural shapes:

- **Shape 1 — same LoroDoc, fork loro-codemirror to consume tree:** Add a tree→string flattener on the codemirror side and re-emit string-shaped diffs from tree mutations. Effort: ~600–1,000 LOC + maintenance burden. This is the one we'd want, but no published prior art.

- **Shape 2 — two LoroDocs (one tree-shape for PM, one flat-text for CM6) bound by an observer pair:** Architecturally identical to today's Y.XmlFragment ↔ Y.Text bridge — including the same convergence-under-concurrent-writes problem we just spent 3 specs solving. The rewrite would be against Loro's `subscribe(LoroEventBatch)` API but the algorithmic shape is the same: server-authoritative, origin-aware, paired-write-respecting, debounced. **This is the silent killer of the migration estimate** — the Yjs bridge problem doesn't go away under Loro; it relocates.

**Verified the gap:** `loro-codemirror`'s issue tracker has 3 open issues (#20 multicursor, #19 prevent undo/redo reentering, #12 silent failure on invalid colorClassName); none address tree-shape consumption.

#### Mode toggle (WYSIWYG ↔ Source)

**Today:** Both editors bind to the *same* Y.Doc — XmlFragment vs Y.Text are different containers under the same doc. Mode toggle is a UI-only switch.

**Under Loro:** Depends on bridge shape (above). Under Shape 1 (forked loro-codemirror), mode toggle remains UI-only. Under Shape 2 (two LoroDocs + bridge), mode toggle stays UI-only too because both editors sync to their own LoroDoc which sync via the bridge (same as today's Y.XmlFragment + Y.Text dual-binding).

### CRDT primitives

#### Y.XmlFragment + Y.Text → Loro types

| Today (Yjs) | Under Loro | Notes |
|---|---|---|
| `Y.XmlFragment('default')` (TipTap WYSIWYG bind) | `LoroDoc.getMap('doc')` returning `LoroMap<{nodeName: 'doc', attributes: LoroMap, children: LoroList<LoroMap | LoroText>}>` (`lib.ts:23-35`) | Recursive map-of-map shape; rich text is `LoroText` leaves with `applyDelta`-compatible mark deltas. |
| `Y.Text('source')` (CodeMirror bind) | `LoroDoc.getText('source')` returning `LoroText` | Flat text, supports `insert(pos, text)`, `delete(pos, len)`, `mark(range, key, value)`, `unmark`, `applyDelta`. |
| `Y.Map('metadata')` (frontmatter cache) | `LoroDoc.getMap('metadata')` | LoroMap supports `set/get/delete/subscribe`. Conflict resolution is LWW per key (Lamport timestamps). |
| `Y.Map('activity')` (agent write attribution) | `LoroDoc.getMap('activity')` | Same. |

**Question we couldn't validate:** Loro's tree shape is documented but its **per-keystroke-mutation cost** under a typing user is not benchmarked publicly for large docs. y-prosemirror has `equalYTypePNode` deep-attr-equality that triggers full-Item-replace on attr change for atom nodes (precedent #10) — Loro's `updateLoroMap` (`lib.ts:lookup needed in source`) walks the children list and replaces non-matching subtrees. For our `rawMdxFallback` and `jsxInline` content-bearing nodes (precedent #10), behavior would need empirical validation.

#### Y.UndoManager → Loro UndoManager

**Today:** `Y.UndoManager(yType, { trackedOrigins: Set<LocalTransactionOrigin> })` — origin matching is identity-based on object references (precedent #1). Per-origin scoping makes per-user / per-agent undo possible (V0-14 deferred, but the type system supports it).

**Under Loro:** `UndoManager(doc, UndoConfig)` where `UndoConfig` is:
```
{
  mergeInterval?: number,
  maxUndoSteps?: number,
  excludeOriginPrefixes?: string[],
  onPush?: (...) => UndoStackItem,
  onPop?: (...) => void,
}
```
(verified `loro_wasm.d.ts:1-200` and `loro-prosemirror/src/undo-plugin.ts:21-92`). The `excludeOriginPrefixes` field is a STRING-prefix array — origin matching is **string-based**, not identity-based. To get a per-agent undo, you'd configure each agent's UndoManager with `excludeOriginPrefixes: ['observer-sync', 'file-watcher', ...all other agent prefixes...]`.

**Translation cost for V0-14 (per-agent undo):** the architecture works but you'd need a string-naming scheme for origins (e.g., `agent-write:<agentId>`, `file-watcher`, `observer-sync`). The typed-origin-object pattern in precedent #1 collapses to a string-prefix convention — semantically equivalent but loses TypeScript-enforced origin identity.

**Classification:** REPLACE; same concept, different API; precedent #1 needs re-anchoring to a string convention.

#### Y.RelativePosition (chunked source paste)

**Today:** `packages/app/src/editor/clipboard/source-clipboard.ts:288-302` uses `Y.createRelativePositionFromTypeIndex(deps.ytext, anchorIndex)` and `Y.createAbsolutePositionFromRelativePosition(relPos, deps.ydoc)` to anchor the chunked-insert target across concurrent peers writing during rAF yields.

**Under Loro:** `LoroText.getCursor(pos: number, side?: Side): Cursor | undefined` returns a `Cursor` opaque token; `LoroDoc.getCursorPos(cursor: Cursor): {update?: Cursor, offset: number, side: Side} | undefined` resolves it to current absolute. (Source-traced from `loro_wasm.d.ts` `getCursor` + `getCursorPos`.)

**Classification:** REPLACE; semantically equivalent. `chunkedYTextInsert` (`packages/core/src/...` — couldn't find exact path in time, but referenced from `source-clipboard.ts:34, 302, 416`) needs a Loro-shaped sibling.

### Server / Hocuspocus replacement

This is the largest piece of work in the migration.

#### Hocuspocus features needed (verified via grep + source-trace)

| Hocuspocus feature | OK usage | Loro equivalent | Action |
|---|---|---|---|
| `Hocuspocus.openDirectConnection(docName)` returning `{transact, document}` | `agent-sessions.ts:174` (per-agent persistent connection); `standalone.ts:861` (system-doc); `api-extension.ts:1023, 1108, 1602` (rollback / managed-rename) | **None on npm.** SchoolAI's `@loro-extended/repo` provides `repo.get(docId, schema)` for client use; for server-side direct mutation you instantiate `new LoroDoc()` + `import(savedState)` + mutate + `export({mode: 'update'})` then broadcast to all peers manually. | WRITE-CUSTOM. ~400 LOC of orchestration + connection-counter management. |
| `document.transact(fn, LocalTransactionOrigin)` | `agent-sessions.ts:130` (within `applyAgentMarkdownWrite` caller); `external-change.ts:61`; `api-extension.ts:1023, 1108, 1602` | `doc.setNextCommitOrigin(string)` + mutate + `doc.commit({origin: string, timestamp?, message?})` (verified `loro_wasm.d.ts` `setNextCommitOrigin`, `setNextCommitOptions`, `commit({origin, timestamp, message})`). NO atomic transact-with-origin wrapper; the "next commit" pattern is single-use per `doc.commit()` call. | REPLACE; semantically thin. The `LocalTransactionOrigin` typed-object pattern (precedent #1) collapses to string identifiers. `skipStoreHooks: true` (used by `OBSERVER_SYNC_ORIGIN`, `FILE_WATCHER_ORIGIN`) has no analogue — there is no Loro-server-side hook system to skip. |
| `afterLoadDocument({documentName, document})` lifecycle hook | `server-observer-extension.ts:37` (attach observers); `cc1-broadcast.ts` (subscribe to system-doc) | **None.** SimpleServer has `onLoadDocument(roomId, crdtType): Promise<Uint8Array | null>` (`loro-websocket/src/server/simple-server.ts:32-40`) which only hands you persisted bytes, not a live LoroDoc reference. | WRITE-CUSTOM equivalent on the WRITE-CUSTOM server. |
| `afterUnloadDocument({documentName})` lifecycle hook | `server-observer-extension.ts:89` (detach observers) | None. SimpleServer's room cleanup is internal (`handleDisconnect` in `simple-server.ts:170-180`). | WRITE-CUSTOM. |
| `onStoreDocument(document)` debounced save | `persistence.ts` (Layer 1: serialize CRDT → markdown → disk) | `onSaveDocument(roomId, crdtType, data)` exists in SimpleServer config (`simple-server.ts:35-40`) but it hands you raw bytes (a Loro snapshot/update), not a live LoroDoc. To serialize to markdown, you'd need to `LoroDoc.fromSnapshot(data)` server-side and walk the tree. | WRITE-CUSTOM serialize layer; debounce is also custom (SimpleServer's `saveInterval` is global across rooms, default 60 s — coarser than Hocuspocus's per-doc-debounce). |
| `onAuthenticate(...)` per-doc auth | none active in OK currently, but the hook exists | SimpleServer has `authenticate(roomId, crdtType, auth): Promise<Permission | null>` and `handshakeAuth(req): boolean | Promise<boolean>` (`simple-server.ts:42-58`). | SURVIVES; semantically equivalent. |
| `beforeBroadcastStateless` (CC1 push-over-awareness) | `cc1-broadcast.ts:53-100` uses `Document.broadcastStateless(payload)` for derived-view invalidation | Loro has no stateless-broadcast primitive. Closest is `EphemeralStore` (LWW per key, timeout-based), but semantic mismatch: stateless-broadcast is fire-and-forget, EphemeralStore is replicated state. | WRITE-CUSTOM CC1 channel: either a separate WebSocket message type wired through SimpleServer's protocol fork, or use `EphemeralStore` and accept a small state footprint. |
| `Awareness` (cursors, presence) | `@hocuspocus/provider`'s default Awareness, used in cursor extensions | Loro 1.x deprecated `Awareness` in favor of `EphemeralStore` (`loro_wasm.d.ts` shows `Awareness` class still present but flagged `@deprecated Please use EphemeralStore`). | REPLACE with `EphemeralStore`; semantic mismatch on timeout behavior (default 30 s expiry — verify our cursor flash UX still works). |
| `Hocuspocus.documents.get(docName)` for direct access | `external-change.ts:54`; `cc1-broadcast.ts:53, 86`; `agent-sessions.ts` | The WRITE-CUSTOM server would maintain its own `Map<docName, LoroDoc>`. | WRITE-CUSTOM. |
| `Document.awareness.setLocalStateField(...)` | `agent-sessions.ts:177-185` (agent identity); `api-extension.ts` (mode toggle) | `EphemeralStore.set(key, value)` per-document. | REPLACE; surface compatible. |
| Per-doc connection-count / lifecycle (load on first connect, unload after grace) | Hocuspocus internal, exposed via lifecycle hooks | DIY: track WS connection counts per room in custom server. SimpleServer doesn't expose this. | WRITE-CUSTOM. |
| Stateless broadcast routing | `Document.broadcastStateless(payload)` reaches all subscribers of a doc | DIY: track room subscribers, send custom message type to all. | WRITE-CUSTOM. |
| `LocalTransactionOrigin` type with `skipStoreHooks` flag | Used to suppress persistence on bridge writes (precedent #14) | DIY equivalent. The custom server's `onStoreDocument`-equivalent would need to inspect commit `origin` (string) and skip if it's an internal sync write. | WRITE-CUSTOM. |

#### Two viable WRITE-CUSTOM server architectures

**Architecture I: extend `loro-websocket`'s SimpleServer.** Fork or wrap SimpleServer (`simple-server.ts:84-260`), add: per-room LoroDoc registry, lifecycle hooks (`afterLoad`, `afterUnload`), direct-mutation API for server-side writes, debounced markdown serialization, stateless-broadcast channel, awareness/EphemeralStore wiring, CC1 channel routing. Estimated 2,000–3,000 LOC of new server code. **High control; high maintenance burden.**

**Architecture II: extend `@loro-extended/repo` (5.4.2, 2026-02-24).** SchoolAI's `Repo` (`repo.ts:1-165`) is *client-shape* — it manages document instances, network adapters, storage adapters, and synchronizer state from the client perspective. To server-host it, you'd run `Repo` server-side with a Hono/Express adapter (they have `@loro-extended/hono` and SSE/WebSocket/WebRTC adapters), use their `@loro-extended/lens` for query-shape access, and add OK-specific custom logic via their `Middleware` API (`repo.ts:55-69`). Their `permissions: {visibility, mutability, deletion}` model is simpler than Hocuspocus auth but extensible.

**Trade-off:** Architecture I gives you minimal-surface-area server, control over every hook timing. Architecture II gives you battle-tested-by-SchoolAI persistence + network adapters but you inherit their data model assumptions (Shape-based schemas, `sync(doc)` API). For OK's server-authoritative direct-CRDT-mutation pattern (`applyAgentMarkdownWrite`), Architecture I is the natural fit.

**Either way:** estimate **4–8 weeks** of dedicated server-side work. Matches the prior-art assessment.

### Agent write paths

`applyAgentMarkdownWrite` (`agent-sessions.ts:88-138`) is the canonical XmlFragment-authoritative composition pattern (precedent #10, #12). Translation under Loro:

```typescript
// Today (Yjs)
export function applyAgentMarkdownWrite(document, markdown, position) {
  const xmlFragment = document.getXmlFragment('default');  // tree CRDT
  const ytext = document.getText('source');                 // flat CRDT
  const metaMap = document.getMap('metadata');
  const currentJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
  const currentBody = mdManager.serialize(currentJson);
  // ... compose new body ...
  const parsedJson = mdManager.parseWithFallback(newBody);
  const pmNode = schema.nodeFromJSON(parsedJson);
  updateYFragment(document, xmlFragment, pmNode, meta);  // structural diff
  const canonicalBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
  applyFastDiff(ytext, ytext.toString(), canonicalFull);  // mirror Y.Text
}

// Under Loro (sketch — source-traced from loro-prosemirror/src/lib.ts)
export function applyAgentMarkdownWrite(loroDoc, markdown, position) {
  const docMap = loroDoc.getMap('doc');                          // LoroMap tree
  const sourceText = loroDoc.getText('source');                  // LoroText
  const metaMap = loroDoc.getMap('metadata');
  // Read current state from tree
  const currentNode = createNodeFromLoroObj(schema, docMap, mapping);  // PM Node
  const currentJson = currentNode.toJSON();
  const currentBody = mdManager.serialize(currentJson);
  // Compose new body
  const parsedJson = mdManager.parseWithFallback(newBody);
  const pmNode = schema.nodeFromJSON(parsedJson);
  // Write to tree — Loro's equivalent of updateYFragment is updateLoroToPmState
  loroDoc.setNextCommitOrigin('agent-write');
  updateLoroToPmState(loroDoc, mapping, /* synthetic editorState with pmNode */);
  // Mirror to flat text. Loro's LoroText.applyDelta is more efficient than DMP for short changes;
  // for large changes, DMP delta still wins.
  const canonicalBody = mdManager.serialize(currentNode.toJSON());
  // applyFastDiff equivalent on LoroText:
  applyDmpDiffToLoroText(sourceText, sourceText.toString(), prependFrontmatter(frontmatter, canonicalBody));
  loroDoc.commit({origin: 'agent-write'});
}
```

**Classification:** REPLACE — same algorithmic shape, different primitive APIs. Precedent #10 (XmlFragment-authoritative) translates to "tree-Map-authoritative." Precedent #12 (XmlFragment is canonical, Y.Text mirrors) translates directly. STOP rules in CLAUDE.md need rewording but conceptually intact.

**Risk:** Loro's `updateLoroToPmState` is in `loro-prosemirror`'s codebase; using it server-side requires importing that package on the server (peer-dep `prosemirror-{model,state,view}` get pulled in). Either inline the relevant subset of `lib.ts` server-side, or accept the dep bloat.

### Markdown pipeline

**Today:** `packages/core/src/markdown/` (~30 files, R23 PUA guard, two-phase post-parse walker, position-slice, autolink-promotion, doc-start-thematic-fix, unknown-mdast-guard, `parseWithFallback` for crash-class MDX).

**Under Loro:** SURVIVES-AS-IS in totality. The pipeline operates on `mdast` ↔ `PM JSON`. The only consumer-side change: where today the result of `mdManager.parseWithFallback(md)` feeds into `schema.nodeFromJSON(json)` then `updateYFragment(doc, fragment, pmNode, meta)`, under Loro it feeds into `updateLoroToPmState` or equivalent.

**Verified independence:** grep'd the markdown pipeline — zero references to `Y.`, `yjs`, or `XmlFragment`. The pipeline is CRDT-orthogonal.

**One nit:** the precedent #15 "idempotent micromark-extension attachers" rule and precedent #16 "phase-ordered visitor dispatchers" are pipeline-internal — survive untouched.

### Clipboard

#### Hub layer (precedent #19)

`packages/core/src/markdown/html-to-mdast.ts` and `mdast-to-html.ts` — SURVIVES-AS-IS. mdast is the canonical intermediate hub.

#### Per-view CRDT writes

- **WYSIWYG paste (PM dispatch):** PM Slice insertion via TipTap. Under Loro: same PM Slice, dispatched into `LoroSyncPlugin`-bound editor. SURVIVES.
- **Source paste (CM6 dispatch):** Today's `chunkedYTextInsert(ydoc, ytext, anchorIndex, markdown)` (`source-clipboard.ts:302`) for >500KB payloads. Under Loro: WRITE-CUSTOM `chunkedLoroTextInsert(loroDoc, loroText, anchorIndex, markdown)`. The chunking + rAF yield + cursor-anchor pattern is identical; primitives change.
- **`Y.RelativePosition` cursor anchoring:** REPLACE with `LoroText.getCursor(pos, side)` + `LoroDoc.getCursorPos(cursor)`.

**Classification:** Hub SURVIVES; per-view CRDT writes REPLACE (mechanical).

### Tests

This is the **second silent killer** of the migration estimate.

#### What changes

| Test category | LOC (approx) | Action |
|---|---|---|
| **Bridge integration tests** (`packages/app/tests/integration/{bridge-matrix,bridge-convergence-regression,bug-{a,b,c,d}-*,c{1-10}-*}.test.ts`) | ~3,500 | REWRITE — every test imports `Y.Doc`, `updateYFragment`, `yXmlFragmentToProsemirrorJSON`, `attachBridgeInvariantWatcher` (uses `doc.on('afterTransaction', tx => Set.has(tx.origin))`). All Yjs-internals-coupled. |
| **Convergence fuzz** (`packages/app/tests/stress/bridge-convergence.fuzz.test.ts`) | ~600 | REWRITE — replays Y.Doc state via Y.encodeStateAsUpdate; CRDT update format incompatible. |
| **Server-authoritative stress** (`packages/app/tests/stress/server-authoritative-stress.test.ts`) | ~400 | REWRITE — multi-client Y.Doc + provider stress. |
| **Conversion fidelity** (`packages/app/tests/conversion/conversion-fidelity.test.ts`) | ~1,200 | REWRITE partially — round-trips through Y.XmlFragment for assertion. |
| **PBT invariants** (`packages/app/tests/fidelity/invariant-i{1..10}.test.ts`, plus US-014's six handler-specific PBTs) | ~2,000 | SURVIVES-AS-IS for I1–I4 (markdown round-trip — CRDT-orthogonal). I5 (Layer A === Layer B) compares mdManager vs Y.Doc paths — REWRITE to Y.Doc → Loro doc. I6 (multi-client preservation) REWRITE. I7 (cross-path consistency) REWRITE. I8–I10 SURVIVES (CRDT-orthogonal). |
| **Server unit tests** (`packages/server/src/*.test.ts`) | ~2,500 | Mostly REWRITE — `agent-sessions.test.ts`, `server-observers.test.ts`, `external-change.test.ts`, `persistence.test.ts` all reach into Hocuspocus internals. |
| **Playwright E2E** (`packages/app/tests/stress/*.e2e.ts`) | ~1,500 | SURVIVES-AS-IS (mostly) — DOM-level interactions. Tests that scrape Y.Doc state via `window.__yDoc__` debug refs need rewriting. |
| **MCP tool tests** (`packages/cli/src/mcp/tools/*.test.ts`) | ~1,000 | SURVIVES — tools mostly hit HTTP. |
| **Markdown pipeline tests** (`packages/core/src/markdown/*.test.ts`) | ~3,500 | SURVIVES-AS-IS. |
| **Bridge invariant watcher (`test-harness.ts:572-611`)** | ~200 (just the watcher; the test plumbing is bigger) | REWRITE — uses `doc.on('afterTransaction', tx => enforcing.has(tx.origin))`. Loro has `subscribePreCommit(e => {changeMeta, origin, modifier})` (verified `loro_wasm.d.ts` `subscribePreCommit`) which is the closest analogue but fires *before* commit, not after settlement. The "settled-state assertion" pattern (precedent #13(a)) needs `subscribe(LoroEventBatch)` post-commit. |

**Estimated total test rewrite:** ~7,500 LOC. At a typical 100 LOC/day for tests, that's ~14–18 weeks of dedicated test work. **Not factored into the 12–20 week prior-art estimate.**

#### `attachBridgeInvariantWatcher` translation

```typescript
// Today (Yjs)
const afterTx = (tx: Y.Transaction) => {
  if (!enforcing.has(tx.origin)) return;  // identity match on object ref
  // assert bridge invariant
};
doc.on('afterTransaction', afterTx);

// Under Loro (verified subscribePreCommit signature in loro_wasm.d.ts)
const sub = doc.subscribe((e: LoroEventBatch) => {
  if (!enforcingPrefixes.some(p => e.origin?.startsWith(p))) return;
  // assert bridge invariant (post-commit, on event fanout)
});
```

The shift from object-identity to string-prefix matching is the recurring theme. Watcher semantics shift from "fire on every transaction with matching origin" to "fire on every event batch, filter by origin prefix." LoroEventBatch fires per-import / per-local-commit / per-checkout (`by` field tells you which) — closer to `afterTransaction` than `afterAllTransactions`.

### Architectural precedents (CLAUDE.md numbered list)

| # | Precedent | Translation status |
|---|---|---|
| 1 | Typed transaction origins | DEGRADES — Loro origins are strings (`commit({origin: 'agent-write'})`). Identity-based matching via object references collapses to string-prefix convention. Same engineering goal, weaker type system. |
| 2 | Generic primitives over specific ones | SURVIVES — language-level pattern, CRDT-agnostic. |
| 3 | Structured event schemas | SURVIVES. |
| 4 | Shared computation, per-surface rendering | SURVIVES. The bridge utilities in `packages/core/src/bridge/` (854 LOC) survive in shape; their Y.* internals get re-anchored to Loro. |
| 5 | Contract-first MCP tools | SURVIVES. |
| 6 | Mode state as enums | SURVIVES. |
| 7 | Remove broken capabilities rather than shipping them | SURVIVES — meta-principle. |
| 8 | Long-lived identity vs short-lived session | SURVIVES. |
| 9 | Schema is add-only forever | TRANSLATES DIFFERENTLY — y-prosemirror's destructive-delete-on-schema-throw failure mode (the reason precedent #9 exists) is gone. Loro's `createNodeFromLoroObj` (`lib.ts:115-128`) instead `console.error(e); meta.mapping.delete(obj.id); return null` — the node is silently dropped from the rendered PM tree, but its Loro container is **preserved in the tree**. Schema narrowing under Loro produces a partial render but no CRDT data loss. **The R13 patch we ship today (`patches/y-prosemirror@1.3.7.patch`) becomes unnecessary** — but a semantically equivalent rawMdxFallback substitution should be added to a forked `loro-prosemirror` for the same UX reason (visible degraded blocks vs invisible dropped nodes). |
| 10 | Opaque-but-content-bearing nodes for Y.Item identity | UNCERTAIN — Loro's tree shape uses LoroMap with mutable `nodeName`/`attributes`/`children`. The y-prosemirror `equalYTypePNode` deep-attr-equality issue (atom node attr change → full-Item-replace) doesn't have a direct Loro analogue, but Loro's `updateLoroToPmState` (`lib.ts:71-96`) walks and replaces children when shapes differ. Behavior under per-keystroke attr mutation needs empirical test. The `rawMdxFallback` and `jsxInline` `content: 'text*'` shape probably still works because text content goes into `LoroText` leaves which mutate granularly. |
| 11 | Minimize CRDT mutation in sync bridges | TRANSLATES — same principle, different APIs. The three sub-patterns (content-comparison gate, hybrid diff3+DMP, origin-aware reconciliation) all reapplicable on Loro's primitives. The cited research report (`reports/crdt-origin-laundering-prior-art/`) confirms these patterns are unclaimed in literature — works on any CRDT. |
| 12 | XmlFragment is authoritative; Y.Text mirrors it | TRANSLATES — "tree-Map is authoritative; LoroText mirrors." Same shape. |
| 13 | Bridge invariants auto-enforced and property-verified | TRANSLATES with watcher rewrite (above). |
| 14 | Cross-CRDT sync is single-writer, server-side | SURVIVES IN PRINCIPLE — but if we adopt Shape 1 (forked loro-codemirror, single LoroDoc), the cross-CRDT sync problem dissolves entirely (no two CRDTs to bridge). If Shape 2 (two LoroDocs), precedent #14 is more important than ever. |
| 15 | Idempotent micromark-extension attachers | SURVIVES (pipeline-internal). |
| 16 | Phase-ordered visitor dispatchers | SURVIVES (pipeline-internal). |
| 17 | Byte-for-byte equivalence validators gate high-risk refactors | SURVIVES (process precedent). |
| 18 | Hybrid Activity + Suspense + `use(promise)` | SURVIVES — render-tree pattern, CRDT-orthogonal. The HocuspocusProvider `'synced'` event becomes Loro's `await sync(doc).waitForSync()` (loro-extended) or a custom Promise wrapping the WebSocket handshake. |
| 19 | Clipboard mdast-canonical + per-view hooks | SURVIVES — mdast hub. Per-view writes change. |

### MCP tools

| Tool | Action under Loro |
|---|---|
| `write_document`, `edit_document`, `init_content`, `consolidate`, `ingest` (4 write tools, all use `/api/agent-write-md` or `/api/agent-patch`) | SURVIVES at HTTP-contract level — body is markdown text. Server-side handlers REWRITE: replace `dc.document.transact(fn, AGENT_WRITE_ORIGIN)` with `loroDoc.setNextCommitOrigin('agent-write'); applyAgentMarkdownWrite(loroDoc, ...); loroDoc.commit()`. |
| `get_preview_url`, `read_document`, `list_documents`, `search`, `get_backlinks`, `get_forward_links`, `get_dead_links`, `get_orphans`, `get_hubs`, `get_history`, `exec`, `research`, `rename_document`, `rollback_to_version`, `save_version`, `preview_url` (~16 read/utility tools) | SURVIVES — read-only or HTTP-only. `rollback_to_version` and `rename_document` server-side handlers REWRITE for CRDT primitive change. |

### Boundary semantics (Peritext)

**Verified:** Loro's `configTextStyle({ mark: { expand: 'before'|'after'|'none'|'both' } })` (source-traced `loro_wasm.d.ts` line ~110: `configTextStyle(styles: {[key: string]: { expand: 'before'|'after'|'none'|'both' }}): void;`) implements correct Peritext boundary semantics. `loro-prosemirror`'s `configLoroTextStyle` (`text-style.ts:7-23`) auto-derives the config from PM's mark `inclusive` spec: `inclusive ? 'after' : 'none'`.

**Effect on OK:** the boundary anomaly (Yjs's lack of per-mark expand) genuinely goes away. For an MDX editor where rich-text formatting is uncommon and agent writes go through markdown not format-marks, this is a small upside, but it IS an upside. The 2026-04-16 prior-art refresh (`refresh-2026-04-16-peritext-implementations.md`) notes Loro is "the only Peritext-implementing CRDT with a TipTap-compatible-by-construction editor binding shipping today."

### Issue #77 (data-loss bug, 2026-03-28)

**Verified status as of 2026-04-16:** **STILL OPEN**. Source: `gh api repos/loro-dev/loro-prosemirror/issues/77` returned `{state: 'open', closed_at: null, comments: 0, updated_at: '2026-03-28T17:13:29Z'}`. Zero comments. Zero engagement from maintainers in 19 days.

**Failure shape (verified from issue body):**
> "I hit this when trying to make a site that went between pages: Page A → Page B → Page A using TipTap+Loro instead of TipTap+Hocuspocus. When I went back to Page A, all of the content was wiped. Basically, the problem looks like this:
>  1. LoroDoc is populated with server content
>  2. Editor state created with LoroSyncPlugin
>  3. any `docChanged` transaction before `setTimeout(init, 0)` fires
>  4. `appendTransaction` creates `doc-changed`
>  5. `apply` calls `updateLoroToPmState` with the empty mapping..."

**Could it manifest in OK?** Yes, **directly**. OK uses precedent #18's hybrid Activity + Suspense + ProviderPool model (`packages/app/src/components/EditorActivityPool.tsx`) which is structurally identical to the reporter's "Page A → Page B → Page A" navigation flow. The `LoroSyncPlugin` initialization race (init runs in `setTimeout(0)` per `sync-plugin.ts:108`; meanwhile `appendTransaction` can fire on `tr.docChanged` before `init` completes) directly hits OK's hot path: `EditorActivityPool` mounts a new editor with a pooled-but-empty mapping, the user types or the agent writes, `docChanged` fires, `updateLoroToPmState` runs with empty mapping, ALL CONTENT DELETED.

**Fix path:** patch `loro-prosemirror`'s `sync-plugin.ts:107-150` to gate `apply` on `mapping.size > 0`. Trivial fix; the bug exists because no one has cared enough. **We'd need to fork the binding** to ship.

**Open issues #75 (race condition with TimerlessEphemeralStore, 2026-03-18), #74 (cursorToAbsolutePosition guard for missing text container, 2026-03-12), and Loro core #943 ("Fix March 2026 production panic regressions"), #945 ("LoroDoc::decode_import_blob_meta(check_checksum=false) is unsafe", 2026-04-09)** are additional pre-1.0 stability indicators for the binding/runtime combo.

### Performance / bundle

**Verified WASM bundle size (loro-crdt@1.11.0, 2026-04-12):**
- Raw: **3,214,132 bytes (3.07 MB)** for `bundler/loro_wasm_bg.wasm`
- Gzipped: **1,016,551 bytes (≈1.0 MB)** (verified via `gzip -c` on the local tarball)

**Compare:**
- Yjs (`yjs@13.6.30`): **~50–80 KB gzipped** (pure JS).
- Difference: **+~12–20× larger** than Yjs.

**OK's current size-limit gates** (`packages/app/package.json:24-43`):
- main app bundle: 800 kB gzipped
- all JS chunks combined: 950 kB gzipped
- main CSS: 25 kB gzipped

**Effect:** adding ~1 MB gzipped of WASM to either limit fails CI. Three mitigation paths:
1. **Raise size limits to ≥2 MB.** A 2.1× regression vs today; ~1 MB extra cold-load on slow networks.
2. **Lazy-load WASM as async chunk.** First-edit latency hit (WASM compile is ~50–200 ms on a typical laptop, longer on mobile). Editor doesn't render until WASM resolves.
3. **Server-only Loro + thin client.** Server holds the LoroDoc, client gets serialized PM JSON over WebSocket. Eliminates WASM bundle but breaks the local-first / offline story Loro is supposed to enable.

**CLI distribution impact:** `@inkeep/open-knowledge` ships `dist/public/` from `bun run build:assets` (`packages/cli/package.json:27`), so the WASM ships with the CLI npm package. Total package size grows by ~1 MB compressed.

---

## WRITE-CUSTOM list (the painful parts)

The buildable-but-novel pieces. Every item: what we need + what doesn't exist + source-trace.

### 1. Hocuspocus-feature-parity Loro server (~2,000–3,000 LOC + 4–8 weeks)

**Need:** `openDirectConnection`-equivalent direct-CRDT-mutation API; `afterLoadDocument` / `afterUnloadDocument` lifecycle hooks; debounced markdown serialization (Layer 1) + git auto-commit (Layer 2); CC1 stateless-broadcast channel; per-doc connection-count tracking; awareness/ephemeral wiring.

**Doesn't exist:** No published Loro server has these. SimpleServer (`loro-websocket@0.6.2`, `simple-server.ts:84-260`) has only `onLoadDocument` / `onSaveDocument` / `authenticate` / `handshakeAuth`. SchoolAI's `Repo` (`@loro-extended/repo@5.4.2`) is client-shape with adapter pattern — running it server-side via `@loro-extended/hono` is possible but requires building the OK-specific lifecycle on top.

**Source-trace:** `gh api repos/SchoolAI/loro-extended/contents/packages/repo/src` returns 22 files; the synchronizer (`synchronizer.ts:30,927 bytes`) and `sync.ts` (19,850 bytes) are the closest you get to lifecycle orchestration — but it's their model, not ours.

### 2. Dual-view tree-flat bridge (~600–1,500 LOC + 2–4 weeks)

**Need:** Either (a) fork `loro-codemirror` to consume the `LoroMap<LoroNodeContainerType>` tree shape that `loro-prosemirror` writes (Shape 1), or (b) build a server-authoritative observer pair between two LoroDocs (Shape 2 — the same problem we just solved for Yjs, relocated).

**Doesn't exist:** `loro-codemirror`'s `sync.ts:67` early-returns on `if (diff.type !== 'text') return` — it physically cannot consume tree diffs. No public fork addresses this. Single-maintainer (`leon7hao`).

**Source-trace:** `loro-codemirror/src/sync.ts:65-94` — the `for ({ diff, target } of e.events)` loop checks `diff.type !== 'text'` and returns; only flat-text diffs get applied to CM6.

### 3. CC1 push-over-awareness equivalent (~200–400 LOC + 1 week)

**Need:** Pure-signal push for derived-view invalidation (`{v:1, ch, seq}` payload, 100 ms debounce per channel, server-emitted on file/backlink/graph changes).

**Doesn't exist:** Loro has no `broadcastStateless` primitive. `EphemeralStore` (LWW per key, timeout-based) is the closest but semantically wrong (it's replicated state, not fire-and-forget signal). Either: extend the WebSocket protocol fork in (1) with a custom `%CCN` message type, or accept EphemeralStore semantics with short timeout.

**Source-trace:** `packages/server/src/cc1-broadcast.ts:53-100` uses `Document.broadcastStateless(payload)` — we'd swap this for our custom server's broadcast primitive. CC1 contract (`{v:1, ch:string, seq:number}`) survives — it's CRDT-orthogonal.

### 4. Server-side `applyAgentMarkdownWrite` rewrite (~150 LOC + 1 week)

**Need:** Translate the XmlFragment-authoritative composition pattern (`agent-sessions.ts:88-138`) to LoroMap-tree-authoritative.

**Doesn't exist:** No existing server-side Loro write helper that composes markdown deltas. The `loro-prosemirror` package has `updateLoroToPmState` and `createNodeFromLoroObj` (`lib.ts:71-167`) but those expect a PM `EditorState` reference — server-side we don't have an editor mounted, so we'd construct a minimal synthetic `EditorState` shim or inline the write logic.

**Source-trace:** `packages/server/src/agent-sessions.ts:88-138` is the template; the new file would import `createNodeFromLoroObj` + `updateLoroToPmState` (or inlined equivalents) from `loro-prosemirror/src/lib.ts`.

### 5. Bridge invariant watcher rewrite (~200 LOC + 0.5 week)

**Need:** Loro-side equivalent of `attachBridgeInvariantWatcher` (`test-harness.ts:572-611`) for test-suite invariant enforcement.

**Doesn't exist:** No published Loro test harness with bridge-invariant assertion. The LoroEventBatch event model fires on every commit (`subscribe((e: LoroEventBatch) => ...)`); equivalent watcher logic adapts straightforwardly. The only API mismatch is origin matching: object-identity on Yjs → string-prefix on Loro.

**Source-trace:** `packages/app/tests/integration/test-harness.ts:572-611`.

### 6. Forked `loro-prosemirror` with init-race fix + rawMdxFallback substitution (~50 LOC patch + maintenance burden)

**Need:** Patch `sync-plugin.ts:107-150` to gate `apply` on `mapping.size > 0` (fix issue #77). Add rawMdxFallback substitution in `createNodeFromLoroObj` (`lib.ts:115-128`) for schema-throw cases — same UX rationale as our R13 patch on y-prosemirror.

**Doesn't exist:** No published patch. Maintainer engagement on issue #77 has been zero for 19 days.

**Source-trace:** `loro-prosemirror/src/sync-plugin.ts:107-150` (init race); `lib.ts:115-128` (silent skip on schema throw).

### 7. `chunkedLoroTextInsert` (~150 LOC + 0.5 week)

**Need:** Loro-side equivalent of `chunkedYTextInsert` (referenced from `source-clipboard.ts:34, 302, 416`) — chunk a >500KB payload into rAF-yielded inserts, anchor target via `LoroText.getCursor` to survive concurrent peer writes.

**Doesn't exist:** No published Loro chunked-insert primitive. LoroText supports `insert(pos, text)` but no chunking helper.

**Source-trace:** `packages/app/src/editor/clipboard/source-clipboard.ts:268-302` is the template.

### 8. Test-suite rewrite (~7,500 LOC + 14–18 weeks)

Already broken out in "Tests" section above. **The single largest line item** if the migration is done thoroughly. Cutting corners here risks losing the bridge-correctness invariants we currently enforce.

---

## Pre-1.0 risk assessment

### Specifically: issue #77

- **Severity:** data-loss class. User-visible content disappears on document re-open.
- **Reachability in OK:** HIGH. OK's `EditorActivityPool` (`packages/app/src/components/EditorActivityPool.tsx`) navigates Page A → Page B → Page A pattern as its core UX (precedent #18). The reporter's exact reproducer is OK's hot path.
- **Maintainer engagement:** Zero comments, zero engagement, zero linked PRs in 19 days (2026-03-28 → 2026-04-16).
- **Implication:** **We must fork loro-prosemirror to ship.** This contradicts the "use the published binding" assumption in the prior-art assessment.

### Other open data-loss / stability issues

- **`loro-prosemirror#75` (2026-03-18):** "addEphemeral races with auto-created TimerlessEphemeralStore from applyRemote." Concurrency bug in presence sync. Open.
- **`loro-prosemirror#74` (2026-03-12):** Guard against missing text container in cursorToAbsolutePosition. Open.
- **`loro-prosemirror#67` (open since 2026-03-17):** Add checks when `containerId` is provided. Open.
- **`loro-prosemirror#28` (open since April 2025):** TypeScript type errors. Still open after 12+ months.
- **`loro-prosemirror#23` (open since 2025-02-25):** How to customize cursor style? Documentation gap. Open after 14 months.
- **`loro/loro#943` (2026-04-13):** "Fix March 2026 production panic regressions." Loro core. Open.
- **`loro/loro#945` (2026-04-09):** "LoroDoc::decode_import_blob_meta(_, check_checksum=false) is unsafe." Loro core. Open.
- **`loro/loro#944` (2026-04-04):** "I restored an older backed up loro doc - then tried to sync it with devices, it would keep crashing." Loro core. Open.
- **`loro/loro#929` (open):** "import_batch panics in ensure_vv_for when DAG has shared dependency." Loro core. Open.
- **`loro/loro#938` (2026-03-29):** "UndoManager: redo across separate undo steps loses text when LoroTree node is recreated with new TreeID." Loro core. Open.

**Pattern:** active production-bug discovery as of *this week*. Loro 1.0 has been out since October 2024 but recent releases (`loro-crdt@1.11.0` on 2026-04-12) include fixes for "March 2026 production panic regressions" — bug discovery rate is still elevated.

### Single-maintainer / bus factor

- `loro-prosemirror`: maintainer `rem2018` (from npm metadata).
- `loro-codemirror`: maintainer `leon7hao` (from npm metadata).
- `loro-crdt` core: small team (2–4 contributors per the prior research).
- `@loro-extended/repo`: SchoolAI's project; recent (2026-02-24) but a third-party community framework, not first-party.

### Breaking-change history

- `loro-prosemirror@0.3.4` (Oct 2025) was a BREAKING release "upgrade to loro v0.13.0 API."
- `loro-prosemirror@0.4.0` (Nov 2025) introduced CursorEphemeralStore.
- `loro-prosemirror@0.4.2` (Nov 2025) "removed attributes in loro map."
- `loro-prosemirror@0.4.3` (Feb 2026) `module type → 'module'`.
- The binding has had multiple breaking changes in the last 6 months. Pre-1.0 stability is genuinely pre-1.0.

---

## Open questions / unverifiable items

1. **Loro tree-shape under per-keystroke attr churn — does it have an equivalent of y-prosemirror's `equalYTypePNode` deep-equal-then-replace bug?** (precedent #10 motivation). Cannot verify without running benchmarks against a `rawMdxFallback`-style atom node with raw-attr-on-every-keystroke.
2. **`loro-prosemirror`'s full-document-replace pattern under large-doc remote updates — how bad is the cursor-jump / re-render cost?** No public benchmarks; no perf test in the repo. We'd need to measure on a 100 KB doc with 10 concurrent peers.
3. **Does `@loro-extended/repo` work with Bun?** Their tests run under Node ≥22. Unknown for Bun; would need to verify.
4. **Can a forked `loro-prosemirror` be maintained long-term given the binding's pre-1.0 churn?** Each upstream release is potentially-breaking; we'd need a patch re-port discipline like our `y-prosemirror@1.3.7.patch`.
5. **Is there a path to upstream the rawMdxFallback substitution and the issue-#77 fix, or are we maintaining a permanent fork?** Maintainer engagement signal is poor (zero comments on #77 for 19 days).
6. **What does Loro's actual production telemetry look like at AFFiNE-scale or Notion-scale?** No published case studies; SchoolAI is the only known production user. The ~18.6k weekly npm downloads (per prior research, 2026-04-07) is small enough that bug-surface-area exposure is limited.
7. **Does Loro's `EphemeralStore` work as a CC1-equivalent with sub-second timeout?** The default 30 s timeout is wrong for our use case; can it be configured to <100 ms? Need to verify.
8. **Loro's `LoroEventBatch` ordering guarantees vs Yjs's `afterTransaction` ordering** — does our `attachBridgeInvariantWatcher` settled-state assertion still get a clean post-commit fire window?

---

## Adversarial check

**What did the prior Loro research get wrong, or insufficiently emphasize?**

1. **The dual-view bridge gap is bigger than implied.** The 2026-04-07 prior-art report and the 2026-04-16 refresh both flag `loro-codemirror` as "exists and is simpler than the ProseMirror binding" (D3 of the Loro report). Source-tracing today reveals it physically cannot consume tree-shaped Loro docs, which is precisely what `loro-prosemirror` writes. That's a *structural* dual-view-binding problem, not a "let's add a CodeMirror extension" problem. **Our convergent-bridge work is not eliminated by Loro; it is relocated.**

2. **Issue #77's reachability in OK was understated.** The 2026-04-07 report flagged it as "the most serious stability issue." It was filed 11 days later (2026-03-28). Today we can confirm: *zero maintainer engagement in 19 days*, and OK's hybrid Activity+Suspense navigation is the *exact reporter's reproducer*. Forking loro-prosemirror is not optional.

3. **Test-suite rewrite was not separately estimated.** The 12–20 week prior-art estimate was for "production sync server, persistence, loro-prosemirror stabilization, TipTap integration, branch merge UI, server-side write pipeline." It does NOT call out the ~7,500 LOC of bridge-coupled tests we'd rewrite. Add 14–18 weeks. Realistic total: **6–9 months of dedicated work**.

4. **Bundle size impact understated.** "970KB gzipped" was correct (today's measurement: 1,016,551 bytes ≈ 1.0 MB), but the report didn't flag that this **directly violates OK's existing size-limit CI gate** (`800 kB` main, `950 kB` total). Either we accept a 2.1× bundle regression or build a lazy-WASM-load architecture (which complicates the editor mount lifecycle precedent #18 already manages).

5. **Origin-typing degradation was implicit.** Loro's `commit({origin: string})` is fundamentally string-based. Precedent #1 (typed transaction origins, identity matching in Sets) is one of the load-bearing engineering disciplines we recently established. Translating it to a string-prefix convention is *fine*, but it's a real type-safety regression that should be called out.

6. **Loro core production-bug discovery rate is high *right now*.** Issue #943 ("Fix March 2026 production panic regressions") tells you that as of 2026-04-13 they're shipping fixes for production bugs found in March. If we were to migrate today, we'd be exposed to pre-1.0-quality stability for the first 6–12 months while the ecosystem matures.

7. **The "Loro is greenfield, ignore migration cost" framing obscures one real cost.** Even greenfield, the 12–20 week / 6–9 month effort buys us:
   - **Correct Peritext semantics** (real, but Yjs's anomaly is unlikely product-visible per CLAUDE.md inference).
   - **Native fork/merge** (real differentiator IF the product needs it; OK's branch model uses Hocuspocus document-naming today and works).
   - **Worse server tooling** (clear regression).
   - **Worse type system for origins** (clear regression).
   - **Worse bundle size** (clear regression).
   - **Pre-1.0 binding stability** (clear regression).
   - **No proven production users at scale** (Notion-scale, AFFiNE-scale telemetry absent).

**Net adversarial verdict:** Greenfield Loro is not just "swap Yjs for Loro and get Peritext free." It's "rebuild the server, rewrite the bridge, rewrite all bridge tests, fork the prosemirror binding, fix init race, work around bundle gate, accept origin-typing regression, and bet on pre-1.0 stability for 6–12 months." The 2026-04-07 conclusion ("12–20 weeks") was directionally right but the qualitative bar — **"the bridge problem doesn't go away, just relocates"** — was missed. That's the single most important update to surface.

---

## Sources cited (all 2026-04-16 unless noted)

### npm registry (verified directly)

- `registry.npmjs.org/loro-crdt/latest` → `1.11.0` (2026-04-12), no peerDeps.
- `registry.npmjs.org/loro-prosemirror/latest` → `0.4.3` (2026-02-19), peerDeps `loro-crdt: ^1.10.2`.
- `registry.npmjs.org/loro-codemirror/latest` → `0.3.3` (2025-10-07), peerDeps `loro-crdt: ^1.8.2`, `@codemirror/state: ^6.0.0`, `@codemirror/view: ^6.7.0`.
- `registry.npmjs.org/loro-websocket/latest` → `0.6.2`, peerDeps `loro-crdt: ^1.9.0`.
- `registry.npmjs.org/@loro-extended/repo/latest` → `5.4.2`, peerDeps `loro-crdt: ^1.10.3`.
- `registry.npmjs.org/prosekit/latest` → `0.19.0`, peerDeps include both `loro-crdt: >= 1.10.0` and `loro-prosemirror: >= 0.4.1` (and equivalents for Yjs).
- `registry.npmjs.org/@prosekit/extensions/latest` → `0.15.0`, dual peerDeps for both stacks.

### GitHub (verified via `gh api`)

- `gh api repos/loro-dev/loro-prosemirror/issues/77` → state=open, comments=0, updated 2026-03-28.
- `gh api repos/loro-dev/loro-prosemirror/issues?state=open` → 10 open issues.
- `gh api repos/loro-dev/loro-prosemirror/commits` → most recent 2026-02-19 (release 0.4.3).
- `gh api repos/loro-dev/loro/releases` → most recent `loro-crdt@1.11.0` (2026-04-12).
- `gh api repos/loro-dev/loro/issues?state=open&sort=updated` → #947 (sourcemap escape), #943 (March 2026 panic regressions), #945 (unsafe decode), #944 (sync crash on restore), #929 (import_batch panic), #938 (UndoManager redo loses text).
- `gh api repos/loro-dev/loro-codemirror/issues?state=open` → 3 open (#20, #19, #12).
- `gh api repos/loro-dev/loro-codemirror/commits` → most recent 2025-10-07.
- `gh api repos/SchoolAI/loro-extended/commits` → most recent 2026-02-24.
- `gh api repos/SchoolAI/loro-extended/contents/packages/repo/src` → 22 files including `repo.ts (11,044 bytes)`, `synchronizer.ts (30,927 bytes)`, `sync.ts (19,850 bytes)`.
- `gh api repos/loro-dev/protocol/contents/packages/loro-websocket/src/server` → includes `simple-server.ts (22,611 bytes)`.

### Direct source fetches

- `raw.githubusercontent.com/loro-dev/loro-prosemirror/main/src/sync-plugin.ts` (148 lines).
- `raw.githubusercontent.com/loro-dev/loro-prosemirror/main/src/lib.ts` (~250 lines, key handlers).
- `raw.githubusercontent.com/loro-dev/loro-prosemirror/main/src/undo-plugin.ts` (~150 lines).
- `raw.githubusercontent.com/loro-dev/loro-prosemirror/main/src/text-style.ts` (~25 lines).
- `raw.githubusercontent.com/loro-dev/loro-prosemirror/main/src/index.ts` (28 lines, full export surface).
- `raw.githubusercontent.com/loro-dev/loro-codemirror/main/src/index.ts` (98 lines).
- `raw.githubusercontent.com/loro-dev/loro-codemirror/main/src/sync.ts` (118 lines).
- `raw.githubusercontent.com/loro-dev/protocol/main/packages/loro-websocket/src/server/simple-server.ts` (260+ lines).
- `raw.githubusercontent.com/SchoolAI/loro-extended/main/packages/repo/src/repo.ts` (~165 lines).
- `raw.githubusercontent.com/SchoolAI/loro-extended/main/packages/repo/README.md` (~120+ lines).

### Local probes

- `loro-crdt-1.11.0.tgz` downloaded and inspected; WASM size measured (raw + gzipped).
- `loro_wasm.d.ts` (115,837 bytes) grepped for `configTextStyle`, `UndoManager`, `commit`, `getCursor`, `subscribePreCommit`, `fork`, `applyDelta`, `ExportMode`, `setNextCommitOrigin`, `setNextCommitOptions`, `LoroEventBatch`, `excludeOriginPrefixes`, `transact`.

### Our repo (file:line cited inline)

- `package.json` (root + 4 packages).
- `packages/server/src/{agent-sessions,server-observers,server-observer-extension,external-change,persistence,api-extension,cc1-broadcast,standalone}.ts`.
- `packages/core/src/bridge/{index,scheduler,apply-diff}.ts`.
- `packages/core/src/extensions/shared.ts`.
- `packages/app/src/editor/clipboard/source-clipboard.ts`.
- `packages/cli/src/mcp/tools/edit-document.ts`.
- `patches/y-prosemirror@1.3.7.patch`.
- `specs/2026-04-16-bridge-correctness/evidence/bridge-surface-map.md` (companion bridge inventory).
- `reports/loro-ecosystem-readiness-assessment/REPORT.md` and 9 evidence files (2026-04-07 prior art).
- `reports/peritext-on-yjs-feasibility/REPORT.md` + `evidence/refresh-2026-04-16-{peritext-implementations,adjacent-crdts-and-server-alternatives}.md`.
- `CLAUDE.md` (architectural precedents 1–19; STOP/WARN rules).
