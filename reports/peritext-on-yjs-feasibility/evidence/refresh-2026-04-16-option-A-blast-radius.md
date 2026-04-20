---
name: Option A — Yjs 14 + @y/* stack greenfield blast-radius map
description: Source-traced map of every component that REPLACES, PATCHES, gets WRITE-CUSTOM-built, or SURVIVES-AS-IS if Open Knowledge rebuilds its CRDT layer on Yjs 14 + @y/*
sources:
  - npm registry direct (registry.npmjs.org JSON)
  - GitHub raw source (raw.githubusercontent.com)
  - packages/{core,server,cli,app}/package.json
  - packages/server/src/* + packages/app/src/editor/*
  - patches/y-prosemirror@1.3.7.patch
date: 2026-04-16
---

# Option A: Yjs 14 + @y/* Stack — Full Blast Radius Map

## Stack-level summary

**Today's stack (verified from `packages/{core,server,cli,app}/package.json`, root `package.json`):**

| Layer | Package | Pinned version | Notes |
| --- | --- | --- | --- |
| CRDT core | `yjs` | `^13.6.30` (4 packages) | Y.XmlFragment + Y.Text dual model |
| Server | `@hocuspocus/server` | `4.0.0-rc.1` | Lifecycle hooks + `openDirectConnection` + `broadcastStateless` |
| Client provider | `@hocuspocus/provider` | `4.0.0-rc.1` | WebSocket transport + `synced` event |
| TipTap binding | `@tiptap/y-tiptap` | `^3.0.3` | Re-exports `y-prosemirror`'s `updateYFragment`, `yXmlFragmentToProsemirrorJSON`, `yCursorPlugin` |
| TipTap collab | `@tiptap/extension-collaboration` | `^3.22.3` | Wires y-prosemirror sync plugin |
| TipTap cursor | `@tiptap/extension-collaboration-cursor` | `3.0.0` | Wires yCursorPlugin via custom renderer |
| CodeMirror binding | `y-codemirror.next` | `^0.3.5` | `yCollab(ytext, awareness)` — text-only |
| Patch | `y-prosemirror@1.3.7` | via `bun patch` | R13 substitution for destructive-delete (precedent #9 safety net) |
| Patch | `@handlewithcare/remark-prosemirror@0.1.5` | via `bun patch` | US-017 outside-in mark nesting (REMARK pipeline, not CRDT — survives Option A) |

**Greenfield Option A target stack (verified Apr 16, 2026):**

| Layer | Package | Status today | Yjs 14 readiness |
| --- | --- | --- | --- |
| CRDT core | `@y/y` | `14.0.0-rc.13` (Apr 14, 2026) — beta dist-tag; latest dist-tag still `14.0.0-rc.7` | Pre-release; engines: Node ≥22 |
| ProseMirror binding | `@y/prosemirror` | `2.0.0-2` (Dec 16, 2025) | Pre-release; pinned to `@y/y@^14.0.0-16`; PM-tree delta only |
| CodeMirror binding | `@y/codemirror` | `0.0.0-3` (Jan 19, 2026) | Pre-release; pinned to `@y/y@^14.0.0-22` (older numeric scheme — peer mismatch) |
| Awareness/Sync protocols | `@y/protocols` | `1.0.6-rc.1` (Feb 13, 2026) | Pinned `@y/y: *`; `awareness.js` API preserved (setLocalState, setLocalStateField) |
| WS client provider | `@y/websocket` | `4.0.0-rc.2` (Apr 15, 2026) | **Client only** — its server was extracted to `@y/websocket-server` |
| WS server | `@y/websocket-server` | `0.1.5` (Feb 18, 2026) | **CRITICAL FINDING:** dep `yjs: ^14.0.0-7` (NOT `@y/y`); peer `yjs: ^13.5.6` (CONFLICTING). 250 LOC starter kit. NO lifecycle hooks. |

**One-paragraph stack consequence.** Option A is not a peer-dep bump. It is the wholesale replacement of three load-bearing libraries (Yjs core, the ProseMirror binding, the CodeMirror binding) AND the loss of every Hocuspocus-only feature this codebase depends on (`openDirectConnection`, `broadcastStateless`, the 13-hook lifecycle, structured `LocalTransactionOrigin` integration, per-connection sequential message routing, `Document extends Y.Doc` semantics, `documents.get(name)` registry). The markdown pipeline (`packages/core/src/markdown/*` — `~917` LOC for index.ts alone), the file-watcher disk side, the shadow repo, the persistence + reconciliation logic, the MCP write tools (HTTP layer), and the React app shell **survive as-is** because they don't depend on CRDT type shape. The bridge layer collapses (precedent #11–#14 either disappear or transform into a single-CRDT projection problem). **Net new code we'd have to write is dominated by re-implementing Hocuspocus's server lifecycle on top of `@y/websocket-server`'s 250 LOC starter, plus the dual-view single-YType binding which has zero public reference implementation.**

---

## Library-level changes

### REPLACE (full swap, new package on npm registry today)

| Today's package | Replaced by | Verified | Notes |
| --- | --- | --- | --- |
| `yjs@^13.6.30` | `@y/y@^14.0.0-rc.13` | npm registry | New scope; Node ≥22 engines requirement |
| `y-prosemirror@1.3.7` (via `@tiptap/y-tiptap` re-export) | `@y/prosemirror@^2.0.0-2` | npm registry | Same author (dmonad); `syncPlugin(opts)` accepts opts only — YType set via plugin metadata |
| `y-codemirror.next@^0.3.5` | `@y/codemirror@^0.0.0-3` | npm registry | Constructor accepts `Y.Type<{text:true}>`; hard-casts `op.insert` to string at `y-sync.js:209` |
| `@hocuspocus/provider@4.0.0-rc.1` | `@y/websocket@^4.0.0-rc.2` (client only) | npm registry | Loses HocuspocusProvider's `synced` event lifecycle; no provider-pool semantics out of the box |
| `@hocuspocus/server@4.0.0-rc.1` | `@y/websocket-server@^0.1.5` STARTER + custom code (see WRITE-CUSTOM) | npm registry | 250 LOC starter; missing every advanced feature we use |

**Mismatch finding to flag.** `@y/prosemirror@2.0.0-2` peers `@y/y: ^14.0.0-rc.13` while `@y/codemirror@0.0.0-3` peers `@y/y: ^14.0.0-22` (old numeric). Today, installing both requires a `bun overrides` or `pnpm.overrides` to coerce a single Yjs 14 prerelease. (Source: registry.npmjs.org/@y/prosemirror, registry.npmjs.org/@y/codemirror, both fetched 2026-04-16.)

**Critical finding to flag.** `@y/websocket-server@0.1.5` `package.json` direct-dependencies block declares `"yjs": "^14.0.0-7"` (NOT `@y/y`!) AND `peerDependencies: { yjs: "^13.5.6" }`. This is contradictory on its face — verified via `curl -s registry.npmjs.org/@y/websocket-server/0.1.5` 2026-04-16. The direct-dep `yjs: ^14.0.0-7` resolves on the legacy `yjs` npm name's v14 RC line (which is on `14.0.0-16` beta dist-tag — `^14.0.0-7` satisfies). The peer `yjs: ^13.5.6` will fail Bun's solver if a dependent app expresses `yjs@^14`. This package is in mid-migration limbo. Practical implication: if you build on top of `@y/websocket-server`, you live with this conflict until upstream cleans it up.

### PATCH (current package needs a fork or upstream PR)

| Package | Today's pin | Required change | Why |
| --- | --- | --- | --- |
| `@hocuspocus/server@4.0.0-rc.5` | `peerDependencies.yjs: ^13.6.8`, `dependencies.lib0: ^0.2.47` | bump `yjs` peerDep to `^14` AND bump `lib0` dep to `^1.0.0-rc.12` | If you want Hocuspocus on Yjs 14 — but no upstream signal of this. Zero PRs/issues mention "yjs 14" (refresh-2026-04-16-yjs14-ecosystem.md §D5). The runtime modernization release does NOT touch Yjs version. |
| `@hocuspocus/provider@4.0.0-rc.5` | `peerDependencies.yjs: ^13.6.8` | bump `yjs` peerDep to `^14` | Same rationale; same fork cost |
| `@tiptap/y-tiptap@3.0.3` | `peerDependencies.yjs: ^13.5.38` | bump `yjs` peerDep to `^14`; refactor internal `updateYFragment` and `yXmlFragmentToProsemirrorJSON` to consume the new `applyDelta`/`toDeltaDeep` API | TipTap chose to release fresh on yjs ^13.5.38 8 days ago. Upstream not migrating. Substantial internal refactor. |
| `@tiptap/extension-collaboration@3.22.3` | `peerDependencies.yjs: ^13` + `@tiptap/y-tiptap: ^3.0.2` | bump both | Trivial peerDep bump, but transitively requires y-tiptap fork |
| `@tiptap/extension-collaboration-cursor@3.0.0` | wires `yCursorPlugin` from `y-prosemirror` v1 line | swap to `@y/prosemirror@2.0.0-2`'s cursor plugin | y-prosemirror v2 has a cursor plugin per Apr 8, 2026 commits |
| `patches/y-prosemirror@1.3.7.patch` | R13 destructive-delete substitution into rawMdxFallback | re-port to `@y/prosemirror@2.0.0-2` source (or upstream the substitution upstream) | The destructive-delete pattern at `sync-plugin.js:801,804-810,834-844` may or may not exist in v2 with the same shape — needs source diff. The new diff-based protocol could surface schema-throw failures differently; the substitution-into-rawMdxFallback semantics need reverification. (Reference: CLAUDE.md precedent #9 + `evidence/y-prosemirror-failure-modes.md`.) |
| `patches/@handlewithcare/remark-prosemirror@0.1.5.patch` | US-017 outside-in mark nesting + PR #3 NBSP + empty-text-node | survives Option A unchanged — REMARK pipeline, not CRDT | (Listed for completeness; not affected.) |

### WRITE-CUSTOM (no equivalent in @y/* ecosystem; we'd build it)

See dedicated section below — this is the painful list.

### SURVIVES-AS-IS (no CRDT-shape coupling)

| Package / module | Lines | Why it survives |
| --- | --- | --- |
| `packages/core/src/markdown/*` | ~917 LOC `index.ts` + ~30 sibling files | Pure unified/remark mdast pipeline. Zero CRDT touch. (Verified: `grep "from 'yjs'\\|from '@y/" packages/core/src/markdown/` returns zero results.) |
| `packages/core/src/extensions/*-fidelity.ts` | ~12 fidelity extensions | TipTap `Extension`/`Node`/`Mark` definitions — ProseMirror schema. PM survives Option A; only the CRDT binding under it changes. |
| `packages/core/src/extensions/shared.ts` | 81 LOC | Re-exports all ProseMirror schema extensions. Survives. |
| `packages/core/src/metrics/parse-health.ts` | bridge to `globalThis.__okYpsCounters` | Survives — but the y-prosemirror patch counter bridge needs re-port (see PATCH above). |
| `packages/core/src/schema-invariant.test.ts` | precedent #9 enforcement | Survives unchanged — schema is independent of CRDT |
| `packages/server/src/persistence.ts` | 530 LOC | Reads from XmlFragment via `yXmlFragmentToProsemirrorJSON` — depends on which YType is canonical post-Option-A. The READ path needs a new projector function (XmlFragment-to-PM-JSON-equivalent for the new YType shape). |
| `packages/server/src/file-watcher.ts` | disk-side | Survives — pure filesystem watcher |
| `packages/server/src/shadow-repo.ts` | bare git | Survives — operates at markdown bytes level |
| `packages/server/src/reconciliation.ts` | three-way merge dispatcher | Survives — operates on markdown strings |
| `packages/server/src/head-watcher.ts` | git HEAD watcher | Survives — pure filesystem |
| `packages/server/src/managed-rename-*.ts` | rename journal + rewrite | Survives at journal layer; `applyManagedRenameToLoadedDocument` (api-extension.ts:794) needs port |
| `packages/server/src/content-filter.ts` | gitignore + glob | Survives |
| `packages/server/src/backlink-index.ts` | derived index | Survives at structure level; needs port to use the new YType reader instead of XmlFragment reader |
| `packages/server/src/server-lock.ts`, `shadow-lock.ts`, `process-alive.ts` | OS lock files | Survives — pure filesystem + PID check |
| `packages/cli/src/mcp/tools/*` | HTTP MCP tools | All MCP tools talk to the server via HTTP (`httpPost`, `resolveServerUrl`) — verified via grep: zero direct `openDirectConnection` use in `packages/cli/src/`. Survives 100%. The server-side endpoint implementations change. |
| `packages/cli/src/commands/*` | CLI shell | Survives — orchestration, not CRDT |
| `packages/cli/src/config/*` | YAML config | Survives — pure config loading |
| `packages/app/src/components/*` | React shell | Mostly survives. Hybrid Activity + Suspense + `use(promise)` precedent #18 needs `syncPromise` re-implementation against `@y/websocket` instead of `@hocuspocus/provider`'s `synced` event. |
| `packages/app/src/editor/sync-promise.ts` | precedent #18 module-level promise cache | Pattern survives; binds `HocuspocusProvider.on('synced')` → bind to whatever `@y/websocket` exposes (TBD source-trace). |
| `packages/app/src/editor/provider-pool.ts` | LRU-bounded provider pool | Pattern survives; provider class swaps. |
| `packages/app/src/editor/source-polish/*`, `clipboard/*`, `slash-command/*`, etc. | CodeMirror / TipTap UI plugins | Survives — bound to PM/CM, not CRDT |
| `packages/app/src/components/{FileSidebar, FileTree, GraphView, NewItemDialog, ...}` | UI components | Survives |
| `packages/app/src/server/agent-flow.test.ts`, `agent-sim.ts` | dev tooling | Survives at HTTP layer |

---

## Component-by-component map (10 surfaces from SPEC §8 + bridge surface map)

### Surface 1 — Bridge layer (`packages/core/src/bridge/*`, `packages/server/src/server-observers*.ts`)

**Today** (per `evidence/bridge-surface-map.md`):
- `apply-diff.ts`, `diff-lines.ts`, `merge-three-way.ts`, `normalize.ts`, `scheduler.ts`, `frontmatter-y.ts` — bridge utilities (file:lines per surface map)
- `server-observers.ts` (401 LOC) — Observer A (XmlFragment→Y.Text) and Observer B (Y.Text→XmlFragment), both gated by `OBSERVER_SYNC_ORIGIN` (`server-observers.ts:56-60`)
- `server-observer-extension.ts` (117 LOC) — wires observers per-doc at Hocuspocus `afterLoadDocument` (line 37)
- `applyFastDiff` consumed by 4 call sites (server-observers.ts:173, agent-sessions.ts:130, external-change.ts:70, api-extension.ts:814)
- `lastSyncedXmlMd` baseline tracking; per-document `Map<doc, baseline>`
- `mergeThreeWay` invoked when Y.Text diverged from XmlFragment baseline (Path B)
- 4 paired-write origin objects (`OBSERVER_SYNC_ORIGIN`, `AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN`)

**Under Option A — single YType collapse:**

- **REPLACE.** All bridge utilities (`apply-diff.ts`, `merge-three-way.ts`, `normalize.ts`) become **OBSOLETE**. The dual-CRDT bridge stops existing.
- **REPLACE.** `server-observers.ts` + `server-observer-extension.ts` — DELETE entirely. No bridge, no observers, no debounce, no Path A/B selection, no `mergeThreeWay`, no `applyFastDiff`.
- **REPLACE.** All 5 paired-write origin objects collapse to potentially 2 (`AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`) — depends on whether new write surfaces still need origin discrimination.
- **REPLACE.** Precedents #10 (XmlFragment-authoritative), #11 (minimize CRDT mutation in bridges), #12 (XmlFragment is authoritative; Y.Text mirrors), #13 (bridge invariants auto-enforced), #14 (cross-CRDT sync is single-writer server-side) — ALL OBSOLETE. CLAUDE.md sections rewritten or removed.
- **REPLACE.** `attachBridgeInvariantWatcher` (`test-harness.ts:572-611`) — needs new invariant or deletion.
- **WRITE-CUSTOM.** Source-mode projection: a "tree-YType → flat-string" projector for CodeMirror (since `@y/codemirror`'s YSyncConfig hard-casts `op.insert` to string and cannot consume a tree-shaped delta — verified at `@y/codemirror@0.0.0-3/src/y-sync.js:209`).
- **SURVIVES.** Three bridge invariants (bridge, baseline, item-preservation) collapse to ONE (single-CRDT canonical state). Item-preservation invariant becomes the `@y/y` core's responsibility.

Net: ~1500 LOC of bridge code deleted. Replaced by ~500-1500 LOC of single-YType projection code (Architecture C bridging — see WRITE-CUSTOM list).

---

### Surface 2 — Editor (`packages/app/src/editor/{TiptapEditor,SourceEditor}.tsx`, `observers.ts`)

**Today:**
- `TiptapEditor.tsx` (490 LOC) — `useEditor` with `Collaboration` extension + `yCursorPlugin(awareness)` (line 166). Imports from `@tiptap/extension-collaboration`, `@tiptap/y-tiptap`.
- `SourceEditor.tsx` (207 LOC) — CodeMirror 6 `EditorState.create(...)` with `yCollab(ytext, provider.awareness)` (line 89). Imports from `y-codemirror.next`.
- `observers.ts` (444 LOC) — client baseline tracker only (cross-CRDT writes deleted per precedent #14)
- Both editors mount concurrently with `display:none` mode toggle (precedent #18, see `EditorActivityPool.tsx`)

**Under Option A:**

- **PATCH (extensive).** `TiptapEditor.tsx` — replace `Collaboration` extension's wiring with `@y/prosemirror@2.0.0-2`'s `syncPlugin(opts)` set up via `tr.setMeta(ySyncPluginKey, { ytype })`. The `useEditor({extensions:[Collaboration.configure({document, field})]})` pattern doesn't exist in v2 — TipTap's `extension-collaboration` package would need re-implementation against the v2 plugin contract. **Confidence: HIGH** that TipTap's collab package architecture changes meaningfully. Source: `@y/prosemirror@2.0.0-2/src/sync-plugin.js` lines 78-101 (verified via WebFetch 2026-04-16).
- **PATCH (extensive).** `SourceEditor.tsx` — replace `yCollab(ytext, awareness)` with `@y/codemirror@0.0.0-3`'s `YSyncConfig(ytype, awareness, am)` constructor + the relevant CM6 extension plumbing. NEW: must pass an `AbstractAttributionManager` (typically `Y.noAttributionsManager` or `new Y.TwosetAttributionManager(...)`).
- **REPLACE.** `observers.ts` (client baseline tracker) — DELETE. The bridge layer it tracks no longer exists.
- **WRITE-CUSTOM (load-bearing).** Single-YType serving both editors: see WRITE-CUSTOM #1.
- **PATCH.** `markUserTyping(doc)` — survives in shape; the typing-defer logic was a bridge consequence; if the bridge is gone, the typing-defer state is unneeded. Likely DELETE.
- **PATCH.** `agent-flash-source.ts`, `agent-flash` extension — survives but rebinds to whatever derived event signal we use for agent attribution under single-YType.
- **SURVIVES.** TipTap cursor plugin → `yCursorPlugin` from `@y/prosemirror@2.0.0-2` (per Apr 8, 2026 commits "added cursor plugin to demos"). The `renderCursor` custom function (line 31 of TiptapEditor.tsx) survives.
- **SURVIVES.** All `source-polish/`, `clipboard/`, `bubble-menu/`, `slash-command/` UI plugins — bound to ProseMirror/CodeMirror APIs, not CRDT.
- **SURVIVES.** `EditorActivityPool` (precedent #18) hybrid Activity render tree — pattern is CRDT-agnostic. The concrete `provider` instance changes type.

---

### Surface 3 — Server lifecycle + persistence (`packages/server/src/standalone.ts`, `persistence.ts`, `external-change.ts`, `agent-sessions.ts`, `api-extension.ts`)

**Today:**
- `standalone.ts` (1143 LOC) — `createServer({...})` factory; instantiates `Hocuspocus`, wires extensions
- `persistence.ts` (530 LOC) — `createPersistenceExtension()` Hocuspocus extension; uses `onLoadDocument`, `onStoreDocument`, `afterStoreDocument` hooks
- `external-change.ts` (95 LOC) — `applyExternalChange(hocuspocus, docName, content)` — looks up doc via `hocuspocus.documents.get(docName)`; mutates inside `document.transact(..., FILE_WATCHER_ORIGIN)`
- `agent-sessions.ts` (270 LOC) — `AgentSessionManager.getSession()` calls `this.hocuspocus.openDirectConnection(docName)` (line 174); `dc.document.awareness.setLocalState({...})` (line 177)
- `api-extension.ts` (~2100 LOC) — HTTP API; uses `hocuspocus.documents.get(docName)` 14+ times (grep: lines 529, 605, 685, 698, 755, 788, 873, 1709, 1975, 2091, ...); `applyAgentMarkdownWrite(dc.document, ...)` 3 times (lines 1024, 1109, 1622); `dc.document.awareness.setLocalStateField('mode', 'editing')` 6 times (lines 1021, 1036, 1106, 1121, 1600, 1634)
- `cc1-broadcast.ts` (~110 LOC) — `doc.broadcastStateless(JSON.stringify(payload))` (line 75)
- `live-derived-index.ts` — uses `onChange` hook (line 66)

**Under Option A:**

- **WRITE-CUSTOM (massive).** Build a Hocuspocus-equivalent on top of `@y/websocket-server@0.1.5`'s 250 LOC starter. See WRITE-CUSTOM #2 and #3.
- **REPLACE.** `LocalTransactionOrigin` typed-origin convention (precedent #1) — currently imported from `@hocuspocus/server`. Move to repo-local definition. (Trivial but load-bearing.)
- **WRITE-CUSTOM.** `openDirectConnection`-equivalent — does NOT exist in `@y/websocket-server`. Closest equivalent: `import { docs } from '@y/websocket-server/utils'` then `docs.get(docName)` returns the `WSSharedDoc` (extends `Y.Doc`). Direct `.transact()` works. NO connection-count tracking, NO awareness tied to the direct connection, NO automatic auth.
- **PATCH (extensive).** `agent-sessions.ts` — `AgentSessionManager.getSession()` cannot use `openDirectConnection`; needs custom DirectConnection-equivalent shim. Awareness state assignment via direct `awareness.setLocalState()` survives (Awareness API preserved per `@y/protocols/awareness`).
- **WRITE-CUSTOM.** `Document.broadcastStateless(payload)` — does NOT exist in `@y/websocket-server`. We'd manually iterate `WSSharedDoc.conns: Map<conn, Set<number>>` and `conn.send(...)` a custom message type. Need to extend the message-type enum (currently only `messageSync=0`, `messageAwareness=1`; commented-out `messageAuth=2`).
- **PATCH.** `cc1-broadcast.ts` — Replace `doc.broadcastStateless(JSON.stringify(payload))` with the custom broadcast primitive (above). Subscriber-count tracking via `WSSharedDoc.conns.size` instead of `doc.getConnectionsCount()`.
- **PATCH.** `external-change.ts` — `hocuspocus.documents.get(docName)` becomes `docs.get(docName)`. `document.transact(..., FILE_WATCHER_ORIGIN)` survives if Y.Doc.transact's third parameter (origin) survives in @y/y — verified: yes, `Doc.transact(f, origin, local)` in `@y/y` (per Doc.js source).
- **PATCH.** `persistence.ts` — Hocuspocus's `onLoadDocument`/`onStoreDocument` hooks don't exist in `@y/websocket-server`. Reimplement the lifecycle: `onLoadDocument` is the `setContentInitializor` hook (per y-websocket-server/src/utils.js — single hook, not split into pre/post). `onStoreDocument` doesn't exist; closest is the `CALLBACK_URL` HTTP POST (debounced) or the `setPersistence({bindState, writeState})` pair. WRITE-CUSTOM the equivalent. The serialization READ path (`yXmlFragmentToProsemirrorJSON(xmlFragment)` → markdown) needs a single-YType reader.
- **PATCH.** `api-extension.ts` — every `hocuspocus.documents.get(...)` call site (~20 sites) replaced with `docs.get(...)` from `@y/websocket-server/utils`. Behavior identical for in-memory `Y.Doc` lookup.
- **REPLACE.** `applyAgentMarkdownWrite` (`agent-sessions.ts:88-138`) — the XmlFragment-authoritative composition pattern collapses. Under single-YType, agent writes apply directly to the YType via `applyDelta`. **The pattern simplifies dramatically** — but we lose the ability to compose at markdown level if the YType holds non-markdown shape. **Open question:** does the new YType serialize-to-markdown round-trip cleanly enough to compose at markdown level, or do we compose at delta level? See WRITE-CUSTOM #5.
- **WRITE-CUSTOM.** Stateless message broadcast for CC1 (and any future broadcast channel). The contract `{v:1, ch, seq}` is preserved; the transport changes.
- **WRITE-CUSTOM.** Per-connection sequential message routing — Hocuspocus 4.x advertises this as a feature; `@y/websocket-server` processes messages in arrival order without ordering guarantees across connections (verified: `messageListener` is event-driven on `conn.on('message', ...)`). Likely a no-op for our use case (single Y.Doc serializes via `transact()`), but worth confirming.
- **WRITE-CUSTOM.** Authentication hooks. Hocuspocus's `onAuthenticate` is gone. `@y/websocket-server`'s `server.on('upgrade', ...)` block has a comment "You may check auth of request here.." and a sample `wss.handleUpgrade(...)` invocation — auth is bring-your-own.
- **SURVIVES.** Persistence's `reconciledBaseByBranch` (`Map<branch, Map<docName, string>>`) — pure data structure, survives.
- **SURVIVES.** Shadow repo (`shadow-repo.ts`), HEAD watcher, branch-scoped state, file watcher, content filter, reconciliation three-way merge dispatcher — all operate on markdown strings + filesystem. Zero CRDT touch.

---

### Surface 4 — Agent write paths (server-side `applyAgentMarkdownWrite`, `agent-patch`, `agent-write`, `agent-write-md`)

**Today:**
- `applyAgentMarkdownWrite` (agent-sessions.ts:88-138) — XmlFragment-authoritative composition: read XmlFragment → serialize to markdown → compose delta → `mdManager.parseWithFallback(newBody)` → `schema.nodeFromJSON(parsedJson)` → `updateYFragment(document, xmlFragment, pmNode, meta)` → mirror Y.Text via `applyFastDiff`
- Called by `handleAgentWrite`, `handleAgentWriteMd`, `handleAgentPatch` in api-extension.ts

**Under Option A:**

- **REPLACE/PATCH.** The composition pattern transforms based on which canonical form survives. Two sub-shapes:
  - **Sub-shape A (recommended): YType-authoritative under markdown projection.** Read YType → project to markdown via a custom `ytype.toMarkdown()` (write-custom, see WRITE-CUSTOM #4) → compose delta at markdown layer (preserve current logic) → parse-back to YType delta → apply via `ytype.applyDelta(delta, am)`. This preserves the markdown-level composition semantics (precedent #10 logic) but moves the read+write through a single CRDT.
  - **Sub-shape B: Direct delta composition.** Skip the markdown round-trip; compose the agent's edit directly as a `delta.Delta` against the YType. Cheaper but harder to reason about for line-level "append/prepend/replace" semantics.
- **WRITE-CUSTOM.** Either sub-shape requires writing the YType ↔ markdown projector (see WRITE-CUSTOM #4).
- **REPLACE.** `updateYFragment` and `yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` — these utilities are XmlFragment-specific. Under single YType, replace with `ytype.applyDelta` and a new `ytypeToProsemirrorJSON` helper.
- **STOP rule (CLAUDE.md) becomes obsolete.** "STOP: Server-side agent writes MUST use the XmlFragment-authoritative pattern" — under single-YType collapse, this STOP is moot. Replaced by "STOP: Server-side agent writes MUST use single-YType `applyDelta` with `AGENT_WRITE_ORIGIN`."
- **STOP rule (CLAUDE.md) becomes obsolete.** "STOP: `syncTextToFragment` has been deleted" — moot under single-YType.
- **SURVIVES.** Origin-tagged transactions (`document.transact(fn, AGENT_WRITE_ORIGIN)`) — Y.Doc.transact's `origin` parameter survives in @y/y.

---

### Surface 5 — Markdown pipeline (`packages/core/src/markdown/*`)

**Today:**
- ~30 files; `index.ts` is 917 LOC alone
- `MarkdownManager` (`md-manager.ts` server-side; `MarkdownManager` from `@inkeep/open-knowledge-core` client-side)
- `parseProcessor` and `serializeProcessor` (cached per US-006)
- 17+ remark/mdast handlers, position-slice walker, escapeMark, R23 PUA guard, parseWithFallback for crash-class MDX
- ProseMirror schema bridge via `@handlewithcare/remark-prosemirror@0.1.5` (PATCH carries 2 hunks)

**Under Option A:**

- **SURVIVES 100%.** The markdown pipeline is pure unified/remark; it knows nothing about CRDTs. Verified: `grep "from 'yjs'\\|from '@y/" packages/core/src/markdown/` returns zero matches.
- **SURVIVES.** `@handlewithcare/remark-prosemirror@0.1.5` patch + R13 y-prosemirror patch reverification (the y-prosemirror patch needs re-port to v2; the remark-prosemirror patch survives unchanged).
- **PATCH (small).** `mdManager.parseWithFallback(body) → schema.nodeFromJSON(parsedJson) → updateYFragment(document, xmlFragment, pmNode, meta)` chain — the last step changes (see Surface 4).
- **SURVIVES.** All fidelity invariants I1-I10, the ng-pinned fixtures, the parse-health metric system, the property-based tests.

---

### Surface 6 — Clipboard (`packages/app/src/editor/clipboard/*`, `packages/core/src/markdown/{html-to-mdast,mdast-to-html}.ts`)

**Today:** mdast-canonical clipboard pipeline (precedent #19) — no CRDT coupling at all.

**Under Option A:** **SURVIVES 100%.** Clipboard operates between PM/CM and the OS clipboard, traversing mdast as the canonical hub. Zero CRDT touch.

---

### Surface 7 — Tests (~7,500 LOC bridge-coupled per spec scaffold)

**Today (per CLAUDE.md "Testing" section + bridge-surface-map.md):**
- Tier 1 integration: `bridge-matrix.test.ts`, `c1-*.test.ts`–`c10-*.test.ts`, `cc1-broadcast.test.ts`, `bridge-convergence-regression.test.ts`, plus 3 bug-* tests
- Stress: `bridge-convergence.fuzz.test.ts` (D fuzzer), `server-authoritative-stress.test.ts`
- Unit: `observers.test.ts` (client baseline), `server-observers.test.ts`
- Test harness: `test-harness.ts` (`createTestServer`, `createTestClient`, `attachBridgeInvariantWatcher`, `BRIDGE_ENFORCING_ORIGINS`)
- Mutation gates: E (server B), F (skipStoreHooks A), G (client write-path deletion)

**Under Option A:**

- **REPLACE/DELETE.** Every bridge-specific test (~7,500 LOC) becomes obsolete or rewritten:
  - `bridge-matrix.test.ts` (W1×W2×W3×W4 paired writes) — **DELETE**, no bridge to test
  - `c1-*.test.ts` through `c10-*.test.ts` (server-authoritative bridge integration) — **DELETE**
  - `bridge-convergence.fuzz.test.ts` (D fuzzer for cross-CRDT convergence) — **DELETE/REWRITE** as single-CRDT consistency test
  - `server-authoritative-stress.test.ts` (5-client × 30s mixed edits) — **REWRITE** for single-YType
  - `bug-a-mechanism-isolation.test.ts`, `bug-c-real-reachability.test.ts`, `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` — **DELETE** (bugs disappear)
  - `observers.test.ts`, `server-observers.test.ts`, `observer-sync.test.ts` — **DELETE**
  - `bridge-convergence-regression.test.ts` — **DELETE**
- **REPLACE.** `attachBridgeInvariantWatcher` (test-harness.ts:572-611) — **DELETE** or replace with a "single-YType integrity invariant" watcher (much smaller).
- **REPLACE.** `BRIDGE_ENFORCING_ORIGINS` (test-harness.ts:526-533) — collapse to ~2 origins (agent-write, file-watcher).
- **WRITE-CUSTOM.** New test surface for the YType ↔ markdown projector (Surface 4 + WRITE-CUSTOM #4) — needs PBT + integration coverage.
- **WRITE-CUSTOM.** New test surface for the YType ↔ CodeMirror flat-string projector (WRITE-CUSTOM #1) — needs a fuzz harness for source-mode + WYSIWYG concurrent typing.
- **WRITE-CUSTOM.** Mutation gates equivalent for the new architecture (M-tests that prove specific code paths are load-bearing). Today's M-E/M-F/M-G all collapse — they validate bridge-specific behavior.
- **SURVIVES.** Tier 1 integration `cc1-broadcast.test.ts` survives in shape (custom broadcast primitive replaces `broadcastStateless`).
- **SURVIVES.** Fidelity layer (`tests/fidelity/`) — pure markdown round-trip tests; zero CRDT touch.
- **SURVIVES.** Parse-health gates, perf-regression gates, conversion gates.

Net: ~7,500 LOC test deletion. ~2,000-3,000 LOC new test code for the projector + single-YType behavior + new server primitives.

---

### Surface 8 — CLAUDE.md precedents

**Today (CLAUDE.md "Architectural precedents" §):**
- 19 numbered precedents
- Precedent #1 (typed transaction origins) — survives, but `LocalTransactionOrigin` type moves out of `@hocuspocus/server`
- Precedent #4 (shared computation) — survives
- Precedent #5 (contract-first MCP tools) — survives
- Precedent #6-7 (mode enums, remove broken capabilities) — survives
- Precedent #8 (separate long-lived identity from session) — survives
- Precedent #9 (schema is add-only forever) — survives; the y-prosemirror v2 patch port reverifies the destructive-delete failure class
- Precedent #10 (XmlFragment-authoritative agent writes) — **OBSOLETE under single-YType collapse**
- Precedent #11 (minimize CRDT mutation in sync bridges) — **OBSOLETE** (no bridges)
- Precedent #12 (XmlFragment-authoritative; Y.Text mirrors) — **OBSOLETE**
- Precedent #13 (bridge invariants auto-enforced + property-verified) — **OBSOLETE**
- Precedent #14 (cross-CRDT sync is single-writer server-side) — **OBSOLETE**
- Precedent #15-17 (markdown pipeline discipline) — survives
- Precedent #18 (Hybrid Activity + Suspense + use(promise)) — survives in pattern; concrete subscription source (`@hocuspocus/provider.synced`) → new `@y/websocket` event
- Precedent #19 (clipboard pipeline mdast-canonical) — survives

**Net: 5 of 19 precedents become obsolete.** Replaced by ~2-3 new precedents around single-YType discipline, projector design, and the new server lifecycle.

---

### Surface 9 — Libraries (root `package.json`, all 4 sub-packages)

**Today:**
- Root: `node-diff3`, `bun`, biome, codemirror state/view (via overrides for dedup)
- `core`: yjs ^13.6.30 + ~30 unified/remark/mdast packages + tiptap pm/core/extension-* + diff-match-patch + node-diff3
- `server`: yjs ^13.6.30 + @hocuspocus/server + @tiptap/y-tiptap + @tiptap/core + chokidar + ws + simple-git
- `cli`: @hocuspocus/provider + @modelcontextprotocol/sdk + commander + just-bash + ws + chokidar
- `app`: yjs ^13.6.30 + @hocuspocus/provider + tiptap-everything + y-codemirror.next + @codemirror/* + react 19.2 + react-dom 19.2

**Under Option A:**
- **REPLACE.** All `yjs ^13.6.30` → `@y/y@^14.0.0-rc.13` in 4 packages
- **REPLACE.** All `@hocuspocus/server`/`provider` → `@y/websocket-server@^0.1.5` (server) + `@y/websocket@^4.0.0-rc.2` (client) — both are starters that need extensive WRITE-CUSTOM scaffolding
- **REPLACE.** `@tiptap/y-tiptap@^3.0.3` → forked or replaced; `@y/prosemirror@^2.0.0-2` is the new authoritative ProseMirror binding
- **REPLACE.** `@tiptap/extension-collaboration@^3.22.3` → REWRITE against `@y/prosemirror@2.0.0-2`'s `syncPlugin(opts)` API
- **REPLACE.** `y-codemirror.next@^0.3.5` → `@y/codemirror@^0.0.0-3`
- **REPLACE.** `@y/protocols@^1.0.6-rc.1` becomes a new direct dependency (Awareness primitive)
- **PATCH.** `bun overrides`/`pnpm.overrides` block needed in root package.json to coerce Yjs prerelease across `@y/codemirror` (peers `^14.0.0-22`) vs `@y/prosemirror` (peers `^14.0.0-rc.13`) mismatch
- **CHANGE.** `engines.node: >=22` mandatory (was `>=22` in CLI but inherited by other packages now mandatory due to `@y/y` requirement)
- **PATCH.** `patches/y-prosemirror@1.3.7.patch` — re-port to `@y/prosemirror@2.0.0-2/src/y-prosemirror.js`. Must reverify the destructive-delete failure class still exists with the new diff-protocol approach. Per `@y/prosemirror@2.0.0-2/src/sync-plugin.js:330-348`, the new approach uses `d.diff(ycontent, pcontent)` + `ytype.applyDelta(diff, am)` — the destructive-delete code path is structurally different. **Open question:** does schema-throw still cascade to a destructive delete in v2? Needs source-trace of `applyDelta` error handling. The patch may not need to exist in v2.
- **SURVIVES.** All other dependencies (markdown pipeline, CodeMirror language packs, React, Tailwind, shadcn, fastify-pattern HTTP code, etc.).

---

### Surface 10 — Product/UX (rendered to user, not architecture)

**Today:**
- Dual-mode WYSIWYG/source toggle (precedent #18 hybrid render tree)
- Real-time collaboration cursors (humans only; agents have no fake cursor)
- Agent activity flash via Y.Map('activity') side-channel
- Source-mode toggle disabled when `provider.status !== 'connected'` (FR-7a)
- Hybrid Activity + Suspense + `use(promise)` for sync-time UX
- `NavigationPendingBar` 4-tier escalation tied to `syncPromise` resolution

**Under Option A:**
- **SURVIVES.** All UX patterns survive at the React component level. Provider class swap is a search-and-replace.
- **PATCH.** `syncPromise` (sync-promise.ts) — `HocuspocusProvider.on('synced')` → `@y/websocket` provider's equivalent event (TBD — needs source-trace of `@y/websocket@4.0.0-rc.2/src/y-websocket.js`).
- **PATCH.** Provider status enum (`provider.status`) — Hocuspocus exposes `'connected'`/`'connecting'`/`'disconnected'` etc. `@y/websocket` may have a different enum. FR-7a check must port.
- **CHANGE/IMPROVE.** Source-mode + WYSIWYG-mode hot-swap. Today the dual mount + display:none pattern is necessary because TipTap's `editor.swapDoc` is broken (see CLAUDE.md "WARN: TipTap's editor.view is a throwing proxy..."). Under single-YType collapse, both editors share ONE YType — display:none toggle still works, but the structural reason for "two editors" weakens. Consider single-editor mount with mode toggle; needs UX evaluation.
- **CHANGE.** Agent activity flash via `Y.Map('activity')` — under @y/y, `Y.Map` doesn't exist as a separate class. Use `doc.get('activity', 'map')` instead. (Per @y/y/src/utils/Doc.js:179-203 — `Doc.get(key, name)` is the unified accessor.)
- **CHANGE.** Frontmatter cache via `Y.Map('metadata')` — same as activity. Use `doc.get('metadata', 'map')`.

---

## WRITE-CUSTOM list (the painful parts)

These are the items that have NO equivalent in the `@y/*` ecosystem today. Building each is original work — verified by source-trace and the prior research refresh files.

### WRITE-CUSTOM #1 — Single-YType dual-view binding

**The problem.** `@y/prosemirror@2.0.0-2` and `@y/codemirror@0.0.0-3` cannot today bind to the SAME YType simultaneously:
- `@y/prosemirror`'s sync plugin uses `$prosemirrorDelta = delta.$delta({name: s.$string, attrs: ..., text: true, recursiveChildren: true})` (sync-utils.js:19) — emits a TREE delta with nested children
- `@y/codemirror`'s `YSyncConfig` constructor types `ytext` as `Y.Type<{text: true}>` and at `y-sync.js:209` does `changes.push({from: pos, to: pos, insert: /** @type {string} */ (op.insert)})` — hard-casts insert content to string. A nested-children insert would crash or silently drop content.

**What we'd build.** One of two shapes:
1. **Custom CM-from-tree fork** — fork `@y/codemirror@0.0.0-3`, replace `ydeltaToCmChanges`'s string cast with a tree-flatten step that serializes the tree delta to markdown (or a flat string projection) on the fly. Source-of-truth ownership of the markdown serializer moves into the binding. ~500-1000 LOC binding fork.
2. **Two-YType + lib0 Binding pattern** — keep two YTypes (one tree-flavored for PM, one text-flavored for CM), bind via lib0's `Binding<DeltaA, DeltaB>` (`lib0/src/delta/binding.js`) with a transformer. **But this is morally the same as our current bridge** — just relocated to a different layer. Wins/losses: gains lib0's mutex (no feedback loops), loses our hand-rolled `mergeThreeWay` lossless invariant. Verified: `lib0/src/delta/binding.js` ships with `// @ts-nocheck` and multiple `@todo` markers — early scaffolding. (Source: `evidence/refresh-2026-04-16-bindings-architecture-c.md` §D8.4.)

**What does NOT exist anywhere.** No public dual-view binding example. Zero in `@y/*` demos, zero in lib0/binding.js examples, zero in y-prosemirror v2 issues, zero in y-codemirror.next issues. The first user in production will be doing original work. (Source: `evidence/refresh-2026-04-16-bindings-architecture-c.md` §D8.6.)

**Estimate.** 2-4 weeks for a SPIKE; production-grade with existing OK invariants — substantially more (refresh evidence §"Sharp findings" #5).

### WRITE-CUSTOM #2 — Hocuspocus lifecycle equivalent on `@y/websocket-server`

**What's missing in `@y/websocket-server@0.1.5`** (verified via `raw.githubusercontent.com/yjs/y-websocket-server/main/src/utils.js` 2026-04-16 — full source ~250 LOC):

| Hocuspocus feature | y-websocket-server equivalent | Build cost |
| --- | --- | --- |
| `onAuthenticate` | NONE (commented out: `// const messageAuth = 2`); the bin entry has a comment "You may check auth of request here.." | Build custom auth in `wss.on('connection', authMiddleware → setupWSConnection)` wrapper |
| `onConnect` | NONE | Wrap `setupWSConnection` |
| `connected` | `WSSharedDoc.conns.set(conn, ...)` post-connection | Build hook around `setupWSConnection`'s `doc.conns.set(...)` |
| `onLoadDocument` | `setContentInitializor(f)` — single hook, ALL docs | Build per-docName initializer dispatch + try-catch + retry |
| `afterLoadDocument` | NONE | Build a custom dispatcher that fires after `getYDoc(docname)` resolves |
| `onChange` | Listen to `doc.on('update', ...)` directly | Manual subscription |
| `onStoreDocument` (debounced save) | `setPersistence({bindState, writeState})` — `writeState` fires on connection close | DOES NOT debounce; build our own debounce. Critical for our 2000ms persistence window. |
| `onAwarenessUpdate` | Listen to `doc.awareness.on('update', ...)` directly | Manual subscription |
| `onDisconnect` | `closeConn(doc, conn)` is internal | Build wrapper |
| `onDestroy` | NONE | Build custom |
| `beforeHandleMessage` | NONE — `messageListener` is internal | Fork the package or wrap WSS connection |
| `beforeBroadcastStateless` | NONE — no broadcast primitive at all | See WRITE-CUSTOM #3 |
| `afterUnloadDocument` | `closeConn` doc-destroys when last conn drops; `docs.delete(doc.name)` removes registry entry | Build doc-unload hook |

**Estimate.** ~2,000-3,000 LOC of server scaffolding to reach feature parity with the Hocuspocus surface our codebase relies on. The existing `standalone.ts` is 1143 LOC and that's mostly orchestration; the new code is genuinely new lifecycle plumbing.

### WRITE-CUSTOM #3 — Stateless message broadcast (CC1)

**Today:** `Document.broadcastStateless(payload, filter?)` → `connection.sendStateless(payload)` for each conn in `Document.connections` (verified at `raw.githubusercontent.com/ueberdosis/hocuspocus/main/packages/server/src/Document.ts`).

**Under Option A:** Manually iterate `WSSharedDoc.conns: Map<conn, Set<number>>`, write a custom message envelope (define `messageStateless = 3` extension to the `messageSync=0`, `messageAwareness=1` enum), and `conn.send(...)` per peer. Client side: extend `@y/websocket`'s message dispatcher to recognize `messageStateless` and emit a custom event (subscribers wire to that event).

**Estimate.** ~100-200 LOC server + ~100 LOC client + protocol versioning consideration (the contract `{v:1, ch, seq}` in `cc1-broadcast.ts` survives; the wire envelope changes).

### WRITE-CUSTOM #4 — Single-YType ↔ markdown projector

**The problem.** Today, `mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment))` and `mdManager.parseWithFallback(body) → schema.nodeFromJSON(parsed) → updateYFragment(...)` provide bidirectional Y.XmlFragment ↔ markdown projection through the ProseMirror schema. Under single-YType collapse, the YType's shape determines which side bears the projection cost.

**Three sub-shapes:**
1. **YType-as-PM-tree.** YType holds tree-shaped data (ProseMirror JSON-like). Source-mode CM is a derived projection. Projection function: `treeYTypeToMarkdown(yt: YType): string` — walks the tree, produces markdown. The reverse: `markdownToTreeDelta(md: string, currentYt): delta` — parses markdown, diffs against current state, emits delta. ~500-800 LOC inclusive of tests.
2. **YType-as-flat-text.** YType holds the raw markdown bytes (Y.Text-like). WYSIWYG TipTap is the derived projection — every PM transaction roundtrips markdown→PM→markdown. ProseMirror update is ~O(N) per keystroke. Painful for large docs.
3. **YType-as-Quill-style-flat-text-with-block-attrs.** Newline-attribute encoding (y-quill model). Hybrid; trade-offs documented in REPORT.md §D2.

For our agent-write composition logic to remain marker-clean, sub-shape 1 (YType-as-PM-tree) is the most natural fit — agent writes today already operate in PM-JSON space.

**Estimate.** 500-1500 LOC for the projector + invariants + fuzz coverage.

### WRITE-CUSTOM #5 — Replacement for `applyAgentMarkdownWrite`

**Today's contract** (agent-sessions.ts:88-138): given a `(document, markdown, position)` triple, produce a deterministic CRDT mutation that:
1. Preserves user's concurrent WYSIWYG content under XmlFragment (precedent #10)
2. Preserves Y.Text non-agent Items by minimal mutation (precedent #11)
3. Maintains origin attribution for `Y.UndoManager({trackedOrigins})` (precedent #11(c))
4. Tags the transaction with `AGENT_WRITE_ORIGIN` so observers can early-exit (origin-guard truth table)

**Under Option A:** `apply_agent_markdown_write_v2(yt: YType, md: string, position: 'append'|'prepend'|'replace')`. With single-YType, contract simplifies:
- Read current state via projector (WRITE-CUSTOM #4)
- Compose at markdown level (preserves current `'append'/'prepend'/'replace'` semantics)
- Project back via parser to a `delta` against the current YType
- Apply via `yt.applyDelta(delta, am)` inside `doc.transact(fn, AGENT_WRITE_ORIGIN)`

The key win: no Y.Text mirror step (that whole class of bug class disappears). The cost: ALL OF WRITE-CUSTOM #4 must work first.

### WRITE-CUSTOM #6 — Per-origin Y.UndoManager port + agent-undo

**Today:** Y.UndoManager (Yjs core) tracks origins via `trackedOrigins: Set<object>` — identity-matched. Agent-undo uses this with `AGENT_WRITE_ORIGIN` (per V0-14 STOP rule in CLAUDE.md).

**Under Option A:** Yjs 14 exports `UndoManager` (verified at `@y/y@14.0.0-rc.13/src/index.js:13`). Origin-based tracking should survive in shape; `trackedOrigins` parameter remains. Need to verify with source-trace of `@y/y/src/UndoManager.js`. Per refresh evidence §D7 of REPORT.md, "UndoManager accepts any YType" — should work.

**Estimate.** Likely a port not a rewrite, but reverify source.

### WRITE-CUSTOM #7 — Server-side single-YType reader for derived indices

**Today:** `backlink-index.ts`, `live-derived-index.ts`, persistence's serialize-to-disk all read from `Y.XmlFragment` via `yXmlFragmentToProsemirrorJSON(xmlFragment)`.

**Under Option A:** Replace each call site with `ytype.toDeltaDeep(am)` (or whatever the canonical read primitive is for the new YType shape). For `backlink-index`, this means walking the YType's structure to find link nodes — straightforward but new code.

**Estimate.** ~200-500 LOC across 3-4 files.

### WRITE-CUSTOM #8 — `LocalTransactionOrigin` typed-origin registry

**Today:** `import type { LocalTransactionOrigin } from '@hocuspocus/server'` — a Hocuspocus type defining `{source: 'local'|'remote', skipStoreHooks: boolean, context: {...}}`. Used by 5 origin objects in our codebase.

**Under Option A:** No equivalent in `@y/y` or `@y/websocket-server`. Lift the type definition to `packages/core/src/types/transaction-origin.ts`. The `skipStoreHooks` semantic was Hocuspocus-specific (gated `onStoreDocument`); under our custom server lifecycle (WRITE-CUSTOM #2), we re-introduce the equivalent gate ourselves. Trivial port (~30 LOC).

### WRITE-CUSTOM #9 — Provider-pool + sync-promise refactor

**Today:** `packages/app/src/editor/provider-pool.ts` — LRU-bounded `Map<docName, HocuspocusProvider>`; `sync-promise.ts` — module-level `Map<docName, CacheEntry>` bridging `HocuspocusProvider.on('synced')` to `use(promise)`.

**Under Option A:** Survives in pattern (precedent #18 holds). `HocuspocusProvider` → `@y/websocket`'s WebsocketProvider. `'synced'` event → `@y/websocket` equivalent (needs source-trace; likely `'sync'` event).

**Estimate.** ~200-400 LOC refactor.

### WRITE-CUSTOM #10 — `Y.Map`, `Y.Array` accessor pattern for activity + metadata + frontmatter

**Today:** `document.getMap('activity')`, `document.getMap('metadata')` — used for agent activity flash and frontmatter cache.

**Under Option A:** Y.Map and Y.Array don't exist as separate classes. Use `doc.get('activity', 'map')` and `doc.get('metadata', 'map')` (per @y/y/src/utils/Doc.js Doc.get(key, name)). The `name` parameter discriminates the delta-schema flavor. **Open question:** is `'map'` the right name string for a key-value YType in @y/y? Source-trace via the @y/y code or test files needed. (Per the unified `YType` having both `_map` (KV) and `_start` (sequence), the same instance can serve as a Map; the `name` selects the delta protocol.)

**Estimate.** Search-and-replace for ~20 call sites; likely under 200 LOC inclusive of tests.

---

## Open questions / unverifiable items

These require running code or talking to upstream maintainers — flagged for the spec process to decide whether to spike-and-resolve or accept as risk:

1. **Q1.** Does `@y/prosemirror@2.0.0-2`'s diff-based syncPlugin still cause schema-throw → destructive-delete cascades (precedent #9 failure class)? Need to source-trace `applyDelta` error handling. If yes, the R13 patch must be re-ported. If no, the patch may be obsolete.
2. **Q2.** Does `@y/codemirror@0.0.0-3`'s `YSyncConfig` accept a YType whose `name` is something other than `'text'` (e.g. a `'markdown-source'`-named YType)? The text-flavored constraint at `Y.Type<{text: true}>` is structural, but the `name` parameter is independent.
3. **Q3.** Does `@y/websocket-server@0.1.5`'s in-process `docs: Map<string, WSSharedDoc>` registry survive concurrent direct-access from custom server code without races? It's a plain JS Map mutated synchronously inside `setupWSConnection`. Likely yes (single-threaded JS), but worth a stress test.
4. **Q4.** What does `@y/websocket@4.0.0-rc.2`'s connection lifecycle look like? Specifically, does it expose a `'synced'` event equivalent to HocuspocusProvider's? Needs source-trace of `@y/websocket/src/y-websocket.js`. (Verified at npm-registry level; source-trace needed.)
5. **Q5.** Does `@y/y` UndoManager track origin objects identity-equal-matched (same as Yjs 13)? Needs source-trace of `@y/y/src/UndoManager.js`.
6. **Q6.** Yjs 14 ContentFormat is byte-identical to v13 (verified by `evidence/refresh-2026-04-16-peritext-implementations.md` D7). Does the boundary anomaly (Peritext semantics) matter for our use case under single-YType collapse? Per REPORT.md §D11 verdict: "for OUR use case the anomaly is unlikely to be product-visible." Stays as a known limitation, not a blocker.
7. **Q7.** What's the actual production stability of `@y/y@14.0.0-rc.13`? Released 2026-04-14 (yesterday at the time of writing). v14 main has open bugs like #694 (`Y.Array.move()` corruption on v14.0.0-1) per `evidence/refresh-2026-04-16-peritext-implementations.md` §D12. Building on a moving target.
8. **Q8.** Does `@y/protocols@1.0.6-rc.1`'s `Awareness` API exactly match `y-protocols`'s? Exports preserved per refresh evidence (`./awareness` export). Needs minor smoke test.
9. **Q9.** What's the wire-protocol compat between `@y/y@14.0.0-rc.13` and the legacy `yjs@13.6.30`? The `__$YJS14$__` runtime guard suggests intentional incompatibility detection. A hybrid deployment (some clients v13, some v14) is likely impossible during migration.
10. **Q10.** How do `bun overrides` resolve the peer-dep mismatch between `@y/prosemirror` (peers `@y/y@^14.0.0-rc.13`) and `@y/codemirror` (peers `@y/y@^14.0.0-22`)? Probably fine via a single override pin, but worth verifying in a clean install.

---

## Adversarial check

### What the prior research got right

- **REPORT.md "Path C" architecture is sound in principle.** Single YType serving both editors is structurally feasible per the unified `YType<DConf>` class (HIGH confidence, source-verified at `@y/y@14.0.0-rc.13/src/ytype.js:633-639`).
- **The 5 precedent obsolescence finding (#10-#14)** is correct. Bridge-correctness work this spec scoped becomes moot under Option A.
- **The Hocuspocus replacement gap is real and load-bearing.** No drop-in Yjs server replicates Hocuspocus's lifecycle hooks + `openDirectConnection` + `broadcastStateless` (refresh evidence §D13).

### What the prior research underplayed

- **The `@y/websocket-server` package was not analyzed in the prior refresh files.** This is a critical omission — it's the only "official" Yjs 14 server, and at 250 LOC of starter code, it leaves Hocuspocus-equivalent feature reconstruction as our problem. Direct source-trace today (2026-04-16) reveals a contradictory peer/dep block (`peerDependencies: {yjs: ^13.5.6}` vs `dependencies: {yjs: ^14.0.0-7}`) that signals upstream is in mid-migration.
- **The Hocuspocus 4.0.0-rc.5 release notes "modernization not Yjs 14 adoption" finding** (refresh §D5) is verified — but the implication is sharper than stated: Hocuspocus's "structured transaction origins" feature (one of v4's headline) is exactly the `LocalTransactionOrigin` type our codebase depends on. The Hocuspocus team is INVESTING in this surface on Yjs 13, signaling no intent to bridge to Yjs 14 in the medium term.
- **The `@y/codemirror` text-flavor constraint is structurally load-bearing.** Refresh evidence §D4.4 shows the hard cast `(op.insert as string)` at line 209. This is not just a typing assertion — `ydeltaToCmChanges` builds CM transactions from string-typed insert payloads; tree-typed inserts would either crash or produce malformed CM transactions. **A custom CM-from-tree fork is mandatory for Architecture C dual-view, not optional.**

### What the prior research did not catch

- **The `@y/websocket` vs `@y/websocket-server` package split.** `@y/websocket@4.0.0-rc.2` is CLIENT-ONLY. The server lives at `@y/websocket-server@0.1.5`. Verified via WebFetch on `github.com/yjs/y-websocket` README — explicit note: "This package was previously included in y-websocket and now lives in a forkable repository."
- **`Document` extends `Y.Doc` is Hocuspocus-specific.** Our `applyAgentMarkdownWrite(document, ...)` and `external-change.ts:applyExternalChange(hocuspocus, ...)` rely on the Hocuspocus `Document` class extending `Y.Doc`. This is verified in `Hocuspocus/main/packages/server/src/Document.ts` ("`export class Document extends Doc`"). Under Option A, our code passes raw `Y.Doc` instead — small change in shape but every type signature touches it.
- **DirectConnection's connection-count side-effect.** The Hocuspocus `openDirectConnection` increments connection count, which prevents the document from unloading during shutdown. `server-observer-extension.ts:5-6` explicitly chose `Document` from the lifecycle payload OVER `openDirectConnection` for this exact reason. Under Option A, we lose both options — connection-count tracking is gone entirely; `WSSharedDoc.conns: Map` only tracks WebSocket connections.

### What new risks Option A surfaces that prior research did not

- **`@y/y@14.0.0-rc.13` was published yesterday (Apr 14, 2026 at 23:31Z).** The pre-release churn is 2-day-cycle. Any commit we make against it is essentially against an unstable target.
- **`@y/codemirror` peer-dep is `@y/y@^14.0.0-22`** while `@y/prosemirror` peer-dep is `@y/y@^14.0.0-rc.13`. **Today, you cannot install both with a clean peer-dep solver result.** Bun overrides required.
- **No production user.** Per `evidence/refresh-2026-04-16-production-survey-full.md`: 0 of ~60 surveyed Yjs adopters on v14. Open Knowledge would be the reference implementation. **No prior art to copy bug fixes from.**
- **The Hocuspocus team's current trajectory contradicts Option A.** TipTap published `@tiptap/y-tiptap@3.0.3` on Apr 8, 2026 (8 days ago) with `yjs ^13.5.38`. Hocuspocus published `@hocuspocus/server@4.0.0-rc.5` TODAY with `yjs ^13.6.8`. Both made fresh choices to stay on Yjs 13 within the last 8 days. Adopting Yjs 14 means stepping off the maintained path with no upstream commitment to follow.
- **Yjs 14's wire format contains the `__$YJS14$__` runtime guard.** This is the duplicate-import detector at `@y/y/src/index.js:30`. Implication: a hybrid deployment of v13 + v14 clients on the same doc IS NOT supported. Migration must be all-at-once, with both server and all clients flipping atomically.

### Net adversarial verdict

The prior research's "Architecture C is feasible in 2-4 weeks" estimate **survives at the SPIKE level** but **does not survive as a production-grade replacement** for the bridge correctness spec we're scoping. Option A is genuinely a multi-month commitment with no upstream production reference, against pre-release packages from a single maintainer (Kevin Jahns / @dmonad), with a documented peer-dep mismatch in the stack today. Our existing architecture (Yjs 13 + Hocuspocus + TipTap-collab + y-codemirror.next) IS the maintained path.

The bridge-correctness spec's D4 (LOCKED) "Single-CRDT collapse out-of-scope" is the right scoping decision — the post-condition (R1) + elevated fuzz (R2) generate production telemetry that calibrates whether Option A is necessary at all, before committing to the multi-month rebuild.

---

## Source manifest (re-verifiable)

Direct npm registry probes (curl/WebFetch on registry.npmjs.org), all 2026-04-16:
- `https://registry.npmjs.org/yjs` — latest 13.6.30, beta 14.0.0-16
- `https://registry.npmjs.org/@y/y` — latest 14.0.0-rc.7, beta 14.0.0-rc.13 (Apr 14 2026)
- `https://registry.npmjs.org/@y/protocols` — latest 1.0.6-0, beta 1.0.6-rc.1
- `https://registry.npmjs.org/@y/websocket` — latest 4.0.0-0, beta 4.0.0-rc.2 (Apr 15 2026)
- `https://registry.npmjs.org/@y/websocket-server` — latest 0.1.5 (Feb 18 2026); contradictory peer ^13.5.6 + dep ^14.0.0-7
- `https://registry.npmjs.org/@y/prosemirror` — latest 2.0.0-0, beta 2.0.0-2 (Dec 16 2025); peer @y/y ^14.0.0-rc.13
- `https://registry.npmjs.org/@y/codemirror` — latest 0.0.0-0, beta 0.0.0-3 (Jan 19 2026); peer @y/y ^14.0.0-22 (older scheme — peer mismatch with prosemirror)
- `https://registry.npmjs.org/@hocuspocus/server` — latest 3.4.4, next 4.0.0-rc.5 (Apr 16 2026); peer yjs ^13.6.8, dep lib0 ^0.2.47
- `https://registry.npmjs.org/@hocuspocus/provider` — latest 3.4.4, next 4.0.0-rc.5
- `https://registry.npmjs.org/@tiptap/y-tiptap` — latest 3.0.3 (Apr 8 2026); peer yjs ^13.5.38

GitHub raw source (verified 2026-04-16):
- `https://raw.githubusercontent.com/yjs/yjs/main/src/ytype.js` — single YType class (lines 633-639), Doc.get(key, name) accessor, applyDelta (lines 1078-1100), toDelta (line 835)
- `https://raw.githubusercontent.com/yjs/yjs/main/src/index.js` — single export `YType as Type`; no YText/YMap/YArray/YXmlFragment exports
- `https://raw.githubusercontent.com/yjs/yjs/main/src/utils/Doc.js` — Doc.get(key, name) only accessor; no getText/getMap/getXmlFragment
- `https://raw.githubusercontent.com/yjs/yjs/main/src/structs/Item.js` — ContentFormat byte-identical to v13.6.30 (only key + value, no expand)
- `https://raw.githubusercontent.com/yjs/y-prosemirror/master/src/sync-plugin.js` — syncPlugin(opts) signature; YType set via plugin metadata; appendTransaction commented out
- `https://raw.githubusercontent.com/yjs/y-prosemirror/master/src/sync-utils.js` line 19 — `$prosemirrorDelta` schema (tree+text+recursiveChildren)
- `https://raw.githubusercontent.com/yjs/y-codemirror.next/main/src/y-sync.js` — YSyncConfig(ytext, awareness, am); ydeltaToCmChanges hard-casts op.insert to string at line 209
- `https://raw.githubusercontent.com/yjs/y-websocket-server/main/src/utils.js` — ~250 LOC; setPersistence + setContentInitializor + getYDoc + setupWSConnection; no broadcastStateless, no openDirectConnection, no auth, no lifecycle hooks
- `https://raw.githubusercontent.com/yjs/y-websocket-server/main/src/server.js` — ~30 LOC bin; just WSS upgrade + setupWSConnection
- `https://raw.githubusercontent.com/ueberdosis/hocuspocus/main/packages/server/src/Document.ts` — Document extends Y.Doc; broadcastStateless implementation
- `https://raw.githubusercontent.com/ueberdosis/hocuspocus/main/packages/server/src/Hocuspocus.ts` — openDirectConnection implementation (returns DirectConnection wrapping a created document)

Local source (verified via Read/Bash 2026-04-16):
- `packages/core/package.json` — `yjs: ^13.6.30` direct dep
- `packages/server/package.json` — `@hocuspocus/server: 4.0.0-rc.1`, `@tiptap/y-tiptap: ^3.0.3`, `yjs: ^13.6.30`
- `packages/cli/package.json` — `@hocuspocus/provider: 4.0.0-rc.1`
- `packages/app/package.json` — full TipTap stack on `^3.22.3`, `y-codemirror.next: ^0.3.5`, `@hocuspocus/provider: 4.0.0-rc.1`
- `packages/server/src/server-observers.ts` — 401 LOC, `OBSERVER_SYNC_ORIGIN` typed object (lines 56-60), `isPairedWriteOrigin` (lines 82-83)
- `packages/server/src/server-observer-extension.ts` — 117 LOC, attaches via `afterLoadDocument` (line 37)
- `packages/server/src/agent-sessions.ts` — 270 LOC, `applyAgentMarkdownWrite` (lines 88-138), `openDirectConnection` use (line 174), `awareness.setLocalState` (lines 177, 209, 222, 241)
- `packages/server/src/external-change.ts` — 95 LOC, `FILE_WATCHER_ORIGIN` (lines 27-31), `hocuspocus.documents.get` (line 54)
- `packages/server/src/cc1-broadcast.ts` — `doc.broadcastStateless` (line 75)
- `packages/server/src/api-extension.ts` — `hocuspocus.documents.get` 14+ sites; `applyAgentMarkdownWrite` 3 sites; `awareness.setLocalStateField` 6 sites
- `packages/app/src/editor/observers.ts` — 444 LOC client baseline tracker
- `packages/app/src/editor/SourceEditor.tsx` — 207 LOC; `yCollab(ytext, provider.awareness)` (line 89)
- `packages/app/src/editor/TiptapEditor.tsx` — 490 LOC; `Collaboration` extension + `yCursorPlugin(awareness)` (line 166)
- `packages/core/src/extensions/shared.ts` — 81 LOC; sharedExtensions array
- `packages/core/src/markdown/index.ts` — 917 LOC; markdown pipeline (zero CRDT touch)
- `patches/y-prosemirror@1.3.7.patch` — R13 destructive-delete substitution into rawMdxFallback
- Bridge surface map: `.claude/worktrees/bridge-correctness/specs/2026-04-16-bridge-correctness/evidence/bridge-surface-map.md` (used as starting inventory; this map extends it with greenfield Option A consequences)

Prior research re-verified:
- `reports/peritext-on-yjs-feasibility/REPORT.md` — 2026-04-07 baseline + 2026-04-16 refresh section
- `reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-yjs14-ecosystem.md` — Yjs 14 RC.13, Hocuspocus 4.0.0-rc.5 still pins yjs ^13
- `reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-bindings-architecture-c.md` — @y/prosemirror v2 + @y/codemirror source-trace; Architecture C dual-view gap
- `reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-peritext-implementations.md` — Yjs 14 ContentFormat unchanged
- `reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-adjacent-crdts-and-server-alternatives.md` — Hocuspocus alternatives mapped
- `reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-production-survey-full.md` — 0 of ~60 production users on v14
