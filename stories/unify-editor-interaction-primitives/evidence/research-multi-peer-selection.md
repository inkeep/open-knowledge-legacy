# Multi-peer selection-presence patterns: OSS survey

**Scope.** Survey of production-grade collaborative editors to answer "when user A selects a block/text-range, where does the selection-presence state LIVE?" for Open Knowledge's downstream decision on whether to extend the existing `SelectionStatePlugin` for peer halos or introduce a separate primitive.

**Classification options:**
- **A.** PM PluginState primary + separate awareness-bridge that broadcasts on change
- **B.** Pure Y.Awareness field (awareness IS source of truth; UI reads directly from awareness)
- **C.** Hybrid — PM PluginState locally for UI reactivity, one-way mirror to awareness for broadcast. Peer-received awareness updates populate a separate local store keyed by user-id.
- **D.** Separate dedicated presence PM plugin (per-peer slots), distinct from local-selection state
- **E.** Something else

---

## 1. Per-editor findings

### y-prosemirror — **C (hybrid, leaning B on read)**

Canonical Yjs binding for ProseMirror. Ships the `yCursorPlugin` that virtually every PM+Yjs editor uses.

- **Selection kinds:** Text-range only (`$anchor`/`$head` resolved positions). `NodeSelection`, `AllSelection`, mark selection degenerate to anchor/head — rendered remotely as a plain inline range, not a node-outline. (`src/plugins/cursor-plugin.js:124-137`, `:222-231`; no `$isNodeSelection` branch anywhere.)
- **Storage shape:** Flat Y.Awareness field `cursor` (configurable key, default `'cursor'`): `{anchor: Y.RelativePosition, head: Y.RelativePosition}`. User identity in a sibling `user` field. (`cursor-plugin.js:243-246`.)
- **Data flow:** PM transaction → `view.update` → `updateCursorInfo` → if `view.hasFocus()` converts via `absolutePositionToRelativePosition`, compares via `Y.compareRelativePositions`, writes `awareness.setLocalStateField('cursor', {anchor, head})`. Peer B's `awareness.on('change')` dispatches a no-op PM transaction with `{awarenessUpdated: true}` meta; plugin's `apply` rebuilds DecorationSet via `createDecorations` iterating `awareness.getStates()`.
- **Coalescing:** None. Fires on every `view.update` + focus events; gated only by relative-position equality check.
- **Asymmetric:** Local keeps PM's native `state.selection`; awareness mirror used only for broadcast. Own clientID filtered from render via `awarenessStateFilter` default (`:161`).
- **Key nuance:** The PM plugin state is a **derived `DecorationSet`**, not a per-peer slot registry. Remote peers read directly from `awareness.getStates()` at decoration-build time — no local cache keyed by user-id. This is why classification leans hybrid (C) but very close to B.

### blocknote — **B (delegated to y-prosemirror)**

TipTap-based block editor with first-class local block-selection.

- **Selection kinds propagated:** Text-cursor + text-range only. BlockNote's own `MultipleNodeSelection.toJSON()` returns `{type:"multiple-node", anchor, head}` (`packages/core/src/extensions/SideMenu/MultipleNodeSelection.ts:85`) but **nothing registers it for awareness**.
- **Storage shape:** Delegates entirely to y-prosemirror's `yCursorPlugin` (`packages/core/src/extensions/Collaboration/YCursorPlugin.ts:126-172`). Only BlockNote-owned field is `"user"` (`:83`, `:177`).
- **Grep evidence:** Across `packages/**`, `setLocalStateField` writes **only** `"user"` — never `selection`, `block`, `presence`, `halo`. `ShowSelection` plugin (`packages/core/src/extensions/ShowSelection/ShowSelection.ts:28-42`) is strictly local; never reads/writes awareness.
- **Negative result (load-bearing):** BlockNote has first-class local block-selection (MultipleNodeSelection, SideMenu drag, NodeSelectionKeyboard) but **does NOT propagate block halos to peers**. A PM NodeSelection over the wire collapses to its anchor/head offsets and is rendered as a text range on peer B.

### blocksuite — **B (pure Y.Awareness, with multi-selection native)**

AFFiNE's editor engine. Not PM-based; has its own block-tree model (`@blocksuite/store`). **This is the primary positive reference for block-halo peer sharing.**

- **Selection kinds propagated:** Four first-class shapes, all peer-shared — `BlockSelection({blockId})`, `TextSelection({from, to, reverse})`, `CursorSelection({x, y})`, `SurfaceSelection`. Each has `toJSON/fromJSON`. Multi-block is a **list** of selections on a single peer.
- **Storage shape:** Single Y.Awareness field, doc-namespaced (`packages/framework/store/src/yjs/awareness.ts:10-14`):
  ```ts
  type RawAwarenessState = {
    user?: UserInfo;
    color?: string;
    selectionV2: Record<string, UserSelection>;  // keys: `${storeId}:${nanoid()}`
  };
  ```
  `UserSelection = Array<Record<string, unknown>>` — one peer can carry selections across multiple open docs.
- **Data flow:** `std.selection.set([new BlockSelection({blockId})])` → `selection-extension.ts:157-164` calls `awarenessStore.setLocalSelection(this._id, selections.map(s => s.toJSON()))` + updates local signal. Peer B: `'change'` listener filters own clientID, picks entries whose key `startsWith(this.store.id)`, rehydrates via `SelectionConstructor.fromJSON`, writes `_remoteSelections: Map<clientID, BaseSelection[]>`.
- **Coalescing:** Writes **per-change, no debounce**. Render read-side throttled at **60ms** (`_updateSelectionsThrottled = throttle(..., 60)`, `doc-remote-selection.ts:326-329`).
- **Local vs remote:** Same JSON shape both ways. Local = `signal<BaseSelection[]>`, remote = `signal<Map<clientID, BaseSelection[]>>`. `clearRemote()` on editor blur (`selection-extension.ts:174-176`).
- **Key insight:** Selections identified by `blockId` (semantic ID), not PM positions — survives structural Y.Doc edits without PM mapping. Peers agree on string IDs, not offsets.

### tldraw — **C (reactive derivation hybrid)**

Canvas editor, not PM-based. Massive production scale; the most sophisticated presence architecture in the survey.

- **Selection kinds propagated:** `selectedShapeIds: TLShapeId[]` + cursor + camera/viewport + brush + scribbles + chat + `followingUserId` + page. Flat ID array (no range/text). (`packages/tlschema/src/records/TLPresence.ts:41-61`.)
- **Storage shape:** Presence lives **in the same store** as documents under a separate `scope: 'presence'` (`packages/store/src/lib/RecordType.ts:27`). Not a separate awareness channel — regular typed records. One `TLInstancePresence` record per peer.
- **Data flow:**
  1. Local editor state → `TLInstancePresence` is a **reactive derivation** — `createPresenceStateDerivation.ts:55-73` builds the record from `TLInstance` + `InstancePageStateRecordType.selectedShapeIds` + camera + pointer. User never writes presence directly.
  2. `TLSyncClient.ts:622-631` — `react('pushPresence', ...)` watches derivation, diffs vs `lastPushedPresenceState`, sends fps-throttled `[Put]` or `[Patch, ObjectDiff]`.
  3. Server rebroadcasts (`TLSyncRoom.ts:1096`).
  4. Peer presence record lands in the store; `Editor._getCollaboratorsQuery()` filters `userId != self` (`Editor.ts:3937-3941`); `getCollaborators()` picks latest per-user by `lastActivityTimestamp`.
- **Coalescing:** fps-throttled, not per-transaction. `COLLABORATIVE_MODE_FPS = 30`, `SOLO_MODE_FPS = 1` (`TLSyncClient.ts:46-50, 860-863`). Diff against `lastPushedPresenceState` skips no-ops.
- **Local vs remote asymmetry:** Strong. Own peer's `TLInstancePresence` is a `computed` signal never written to store. Only **remote peers'** records materialize as store records — filtered out of self's view by query.
- **Key insights:** (1) Presence-as-records reuses document machinery (migrations, diff/patch). (2) Server stamps `presenceId` so peers can't spoof. (3) Derivation-over-event-handlers means new selection sources propagate automatically.

### lexical — **B (pure Y.Awareness)**

Meta's editor. `@lexical/yjs` collab package.

- **Selection kinds propagated:** Text-range only. `packages/lexical-yjs/src/SyncCursors.ts:753` branches on `$isRangeSelection(nextSelection)` — **no `$isNodeSelection` branch anywhere** in `packages/lexical-yjs/src/` (grep: zero matches). NodeSelection silently dropped; peers see no caret for that user.
- **Storage shape:** Single Y.Awareness field, typed `UserState` (`packages/lexical-yjs/src/index.ts:25-33`):
  ```ts
  type UserState = {
    anchorPos: null | RelativePosition; focusPos: null | RelativePosition;
    color: string; name: string; focusing: boolean;
    awarenessData: object; [key: string]: unknown;
  };
  ```
  Positions use Yjs `RelativePosition`.
- **Data flow:** `editor.registerUpdateListener` → `syncLexicalUpdateToYjs` → `syncLexicalSelectionToYjs` (`SyncCursors.ts:720-777`) converts Lexical `Point`s to `RelativePosition`, calls `awareness.setLocalState({...})`. Peer: `awareness.on('update')` → `syncCursorPositions` iterates `getStates()`, paints **`<span>` caret + selection-rect DOM nodes directly into a portal container** (`useYjsCollaboration.tsx:464`) — not Lexical decorations. Direct DOM overlay.
- **Coalescing:** None. Every update listener tick fires; early-out only on `shouldUpdatePosition` equality (`SyncCursors.ts:167-180`).
- **Negative result:** Lexical has first-class `NodeSelection` locally but the collab binding never propagates it to peers.

### slate-yjs — **B (pure Y.Awareness)**

Slate + Yjs binding. Comparison data point.

- **Selection kinds propagated:** Text-range only — always a Slate `BaseRange` (anchor + focus); collapsed = caret. Grep `block|node.?select` in core: zero hits.
- **Storage shape:** Two Y.Awareness fields, default names `'selection'` + `'data'` (`packages/core/src/plugins/withCursors.ts:167-177`). Payload:
  ```ts
  type RelativeRange = { anchor: Y.RelativePosition; focus: Y.RelativePosition };
  ```
- **Data flow:** `withCursors` monkey-patches `editor.onChange` (`:246-252`) to call `CursorEditor.sendCursorPosition(e)` each change, which converts via `slateRangeToRelativeRange` and writes `awareness.setLocalStateField`. React: `useRemoteCursorStateStore` marks clientIds dirty on awareness change; `useDecorateRemoteCursors` rebuilds decorations on render.
- **Coalescing:** None in core. Dedupe guard via `Y.compareRelativePositions` skips equal writes.
- **Asymmetric:** Local peer never reads its own awareness entry — filtered by `clientId === editor.awareness.clientID` (`:102-107`, `:131`).

### automerge-prosemirror — **E (no presence at all)**

- **Selection kinds propagated:** **None.** The `@automerge/prosemirror` package ships zero multi-peer selection primitives.
- **Evidence:** Production deps (`package.json:20-31`) contain no awareness/presence/cursor libs. Public API (`src/index.ts:11-20`) exports schema adapters, `pmDocFromSpans`, `syncPlugin` — nothing for cursors. `DocHandle` event set (`src/DocHandle.ts`) is `"change"` only — no `"ephemeral"` channel. Grep for `ephemeral|awareness|presence` across `src/`: zero hits.
- **The one `Selection` reference** (`src/syncPlugin.ts:1, 134`) is `tr.setSelection(Selection.fromJSON(tr.doc, state.selection.toJSON()))` — restoring **local** caret after reapplying Automerge diffs.
- **Gap, not bug:** Automerge-repo does expose an ephemeral-message API, but this binding deliberately does not consume it. Presence layer is entirely an app-level concern with Automerge.

### yjs core + y-protocols Awareness — **Agnostic primitive**

**Location:** Awareness is NOT in `yjs` core — ships in separate `y-protocols` package (`src/awareness.js`).

- **Field opinionation:** **Fully agnostic.** `this.states = new Map<number /*clientID*/, Object<string, any>>`. No reserved field names — `user`, `cursor`, `selection` are **binding conventions**, not primitive opinions. `setLocalStateField(field, value)` spreads `{...state, [field]: value}`. The `'cursor'` field name convention lives in y-prosemirror (`cursor-plugin.js:166`).
- **Helpers:** Yjs core ships `RelativePosition` (`src/utils/RelativePosition.js:43`) — concurrent-edit-safe text positions, JSON encode/decode. No block/node-selection helper; `RelativePosition` targets text offsets.
- **Update contract:** Two events — `update: ({added, updated, removed}, origin)` (fires on every set) and `change` (deep-equal filtered). Wire: `varUint(len) • [varUint(clientID) • varUint(clock) • varString(JSON.stringify(state))]*`. Monotonic `clock` gates application.
- **Rate-limit:** `outdatedTimeout = 30000` ms. `setInterval(.., outdatedTimeout/10)` renews local clock + evicts remote peers stale >30s. **No debounce, no send-side throttle** — every `setLocalState*` emits immediately. Throttling is binding-side (and almost never exists).
- **Block/node-selection in Yjs sub-packages:** None ships this. `y-protocols/awareness` is transport-agnostic; serialization is entirely binding-concerns.

### Linear / Notion (web search)

Low-signal findings. Linear's editor source is closed; no detailed architecture blog post surfaced. Notion public material confirms avatars + per-block-editor indicators but does not describe the presence storage layer. Generic CRDT/collab-architecture articles dominated results. **Not load-bearing evidence** — treat as confirming "block-level presence is productized" (Notion shows avatars per clicked-into block) but the storage-decomposition choice is not disclosed in any material I retrieved. Representative sources: [notion.com/help/collaborate-within-a-workspace](https://www.notion.com/help/collaborate-within-a-workspace), [educative.io/blog/notion-system-design](https://www.educative.io/blog/notion-system-design).

---

## 2. Pattern synthesis

**Tally across 7 editors with presence** (excluding `yjs` core = N/A, `automerge-prosemirror` = E):

| Pattern | Count | Editors |
|---------|-------|---------|
| **A** (PM plugin primary + awareness bridge) | 0 | — |
| **B** (Pure Y.Awareness) | **4** | blocknote, blocksuite, lexical, slate-yjs |
| **C** (Hybrid — local primary + awareness mirror + remote cache) | **2** | y-prosemirror (leaning B), tldraw |
| **D** (Dedicated presence plugin per-peer slots) | 0 | — |
| **E** (Something else — none) | 1 | automerge-prosemirror |

**High-confidence convergences** (triangulated across ≥3 editors):

1. **Awareness is the source of truth for remote presence.** Every presence-shipping editor puts the remote peers' selection state in Yjs Awareness (or tldraw's scope-separated presence records — functionally equivalent). None uses a dedicated PM plugin as the authoritative store for remote peers. **[HIGH confidence, 6/6]**
2. **Local selection stays in the editor's native state model.** PM `state.selection`, Slate `editor.selection`, Lexical editor state, BlockSuite local signal, tldraw `TLPageState.selectedShapeIds` — local selection is never duplicated into a presence structure. The awareness entry is a write-only mirror. **[HIGH confidence, 6/6]**
3. **No coalescing/debounce on writes.** With the sole exception of tldraw's FPS throttle (30/1 FPS), every editor writes awareness per-change, gated only by equality checks. **[HIGH confidence, 5/6]** Render-side throttling exists (BlockSuite: 60ms) but write-side does not.
4. **Local vs remote is asymmetric by default.** Local peer reads its own selection from the native editor model; remote peers are reconstructed from awareness via either direct iteration (y-prosemirror, Lexical) or a cache map (BlockSuite `_remoteSelections`, tldraw collaborators query). Own-client ID filter is universal. **[HIGH confidence, 6/6]**
5. **Pattern A and D are absent.** No editor in the sample uses a PM PluginState as the authoritative store with a separate awareness-bridge (A), nor a dedicated presence-only PM plugin with per-peer slots (D). The space is clustered at B/C. **[HIGH confidence by absence, 6/6]**

**Selection-kind support** (what propagates to peers):

| Kind | y-pm | blocknote | blocksuite | tldraw | lexical | slate-yjs |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| Text caret | ✅ | ✅ (via y-pm) | ✅ | ✅ cursor | ✅ | ✅ |
| Text range | ✅ | ✅ (via y-pm) | ✅ | n/a canvas | ✅ | ✅ |
| Block/node selection | ❌ (degrades) | ❌ (degrades) | ✅ BlockSelection | ✅ shape IDs | ❌ (dropped) | ❌ |
| Multi-block | ❌ | ❌ | ✅ (array) | ✅ (array) | ❌ | ❌ |
| Mark | ❌ | ❌ | ❌ | n/a | ❌ | ❌ |

**Dominant observation:** Among PM-based editors (y-prosemirror, blocknote) and Lexical/Slate with Yjs, **none** propagate block/node-selection to peers. Only BlockSuite (not PM) and tldraw (canvas) ship block-halo sharing. Both use **semantic IDs** (`blockId`, `shapeId`) in the awareness payload rather than PM/document positions — this is the distinguishing architectural choice for multi-block halos.

---

## 3. Divergences

**Awareness payload granularity.** BlockSuite keys selections by `${storeId}:${nanoid()}` to support multiple open docs per peer within one awareness state; tldraw stores one presence record per session with adaptive FPS; Lexical/y-prosemirror/Slate use fixed top-level field names (`cursor` / `selection` / `UserState`). Suggests a spectrum from "one global field" → "per-doc namespace" → "per-session record".

**Render-side caching.** BlockSuite materializes remote peers into a local `Map<clientID, BaseSelection[]>` signal and throttles re-render at 60ms; tldraw materializes remote presence into the store as records and queries them reactively; y-prosemirror and Slate-yjs **do not cache** — they iterate `awareness.getStates()` at decoration-build time each render. Divergence driven by scale concerns (BlockSuite and tldraw expect larger peer counts).

**Semantic ID vs position.** Only BlockSuite/tldraw use stable semantic IDs (`blockId`, `shapeId`) in the wire payload. PM/Lexical/Slate use `Y.RelativePosition` (text-position-shaped) or equivalent relative coordinates. Relative positions survive text concurrent edits but do not naturally represent "this whole block"; they map awkwardly to NodeSelection — which is why PM-family editors all degrade NodeSelection to anchor/head and ship text-only.

**Write-side throttling.** tldraw is the lone voice for send-side FPS throttling. Every other editor relies on awareness equality checks + transport-layer batching. This is a scale-driven difference (tldraw: many simultaneous peers moving cursors on a canvas).

**Derivation vs event-handler.** tldraw uses a reactive derivation (`computed` signal) from editor records; everyone else uses imperative event handlers (PM transaction listener, Slate onChange, Lexical update listener). Derivation automatically propagates new selection sources without extra plumbing — but requires a reactive store as foundation.

---

## 4. Mapping to Open Knowledge

OK today: HocuspocusProvider (Y.Awareness wrapped) for cursor-sharing via `y-prosemirror`'s `yCursorPlugin`. Local `SelectionStatePlugin` for block-selection in CB-v2 — **explicitly non-awareness-integrated per stated NG**. Considering making the local plugin kind-polymorphic (block | mark | node | text-range); downstream question is "if we want halos, extend the plugin or separate primitive?"

**If OK adopts Pattern B (pure Y.Awareness):**
- Matches 4/6 sample implementations. Simplest shape.
- `SelectionStatePlugin` remains the authoritative local store (kind-polymorphic, for UI reactivity) and does NOT broadcast.
- A thin module (call it `SelectionAwarenessBridge`) subscribes to the plugin's state changes and writes `awareness.setLocalStateField('selection', serialized)`. It also subscribes to `awareness.on('change')` and pushes remote peers into a dedicated React state (or PM plugin that ONLY stores remote peers, not local).
- Render layer reads remote peers from awareness directly (or from the remote-peer store), renders halo decorations separately from local selection decorations.
- **Closest precedents:** BlockSuite (block selection, awareness-native) — use `blockId` or another stable semantic ID in the payload, not PM positions, if halos must survive structural edits. Lexical's `UserState` flat shape is the simplest starter template.
- **Consequence for the polymorphism decision:** extending the local plugin to support multiple kinds is *orthogonal* to the awareness-bridge question. The bridge just serializes whatever the plugin emits. Local plugin can be kind-polymorphic without awareness integration; awareness integration can be added later as a separate module.

**If OK adopts Pattern C (hybrid with derived projection):**
- Matches 2/6 (y-prosemirror, tldraw) — but y-prosemirror's version is degenerate (DecorationSet derived from awareness reads).
- Tldraw-style: `SelectionStatePlugin` is primary local state; a reactive derivation (probably a `useEffect` or a custom hook) computes the awareness payload and writes it. Remote peers materialize into a separate local store (PM plugin B, or React state) keyed by clientID.
- Higher architectural weight than Pattern B. Only justified if OK anticipates tldraw-scale peer counts (>5-10 concurrent peers routinely) where the send-side FPS throttle becomes load-bearing.
- **Practical question:** does OK have a reactive "derived signal" primitive already? If not, Pattern B's imperative bridge is cheaper.

**If OK adopts Pattern A (PM PluginState primary + awareness-bridge):**
- Matches 0/6 sample implementations. The state-ownership stance is "local state is authoritative; awareness is a broadcast side-effect" — which Pattern B already achieves without the PM-plugin-owning-remote-peers decomposition.
- Not recommended as the default; no precedent and no discovered advantage over B.

**If OK adopts Pattern D (dedicated presence PM plugin with per-peer slots):**
- Matches 0/6. No editor in the sample does this.
- The concern that motivates D — "keep local selection state and remote peer state in distinct PM plugins so they don't commingle" — is already achieved by Pattern B's split (local plugin + awareness + remote-peer store) without putting remote peers inside a PM plugin at all.
- The only reason to put remote peers in a PM plugin is if the rendering layer is specifically PM decorations keyed by the plugin's state; this is the `yCursorPlugin` model but it's a derived plugin (B-style), not an authoritative slot store.

**Selection-kind propagation (separate decision, interacts with plugin scope):**
- If OK ships text-cursor only (matching 4/6 editors' default), extending `yCursorPlugin` is sufficient — no change needed.
- If OK ships block-halo propagation (matching only BlockSuite in a PM-compatible shape), OK must use **semantic block IDs** in the awareness payload (not PM positions), and these IDs must survive structural edits. This is a new architectural commitment distinct from the plugin-shape question.
- If OK ships kind-polymorphic local plugin AND also wants to propagate all kinds, the awareness serializer must encode a discriminated union `{kind: 'block'|'text'|'node'|'mark', ...}` — BlockSuite's `BaseSelection.toJSON()/fromJSON` model is the direct precedent.

---

## 5. Remaining gaps (needs human judgment)

1. **Semantic block ID availability.** OK's block model: do blocks have stable semantic IDs that survive structural Y.Doc mutations (insert-above, split, merge)? If yes, block-halo propagation is tractable (BlockSuite model). If blocks are identified only by PM positions, block-halo propagation inherits the "NodeSelection degrades to anchor/head" problem and peer halos will drift during concurrent structural edits. **Investigation:** check `packages/core/src/extensions/` for block-id attrs on sharedExtensions; check if wiki-link / callout / jsx-component nodes carry stable IDs.

2. **Observed peer count.** Is OK's target "≤3 humans co-editing a doc" (typical knowledge-base use case) or "10+ concurrent" (Notion-scale)? This changes whether send-side FPS throttling (tldraw) is worth the complexity, and whether render-side caching (BlockSuite 60ms throttle) is load-bearing.

3. **Kind interactions under network lag.** No editor in the sample handles the case where peer A's block-selection awareness arrives after a structural edit that deleted the block. BlockSuite's behavior in this case is not evident from the code I read (plausibly the rehydration's `SelectionConstructor.fromJSON` accepts a now-invalid blockId and render filters missing blocks). OK should design this explicitly if shipping block-halos.

4. **Interaction with existing `yCursorPlugin`.** OK already runs `yCursorPlugin` for text-cursor sharing. Any new awareness field (`'selection'` or `'presence'`) is additive and doesn't conflict with `'cursor'` — but render layer must merge rendering so one peer with both a cursor AND a block selection renders coherently. **Investigation:** can `yCursorPlugin`'s `selectionBuilder` be extended to draw block-halos when the awareness payload signals a block kind, or is a second decoration plugin needed? This is a tactical question not addressed by any source editor (all source editors ship text-only OR block-only, not both combined).

5. **Linear / Notion architecture is hidden.** Public material describes UX (avatars on blocks) but not the storage decomposition. If OK specifically wants to match Notion's model, additional signal would require reverse-engineering via network inspection — out of scope for this survey.

6. **y-prosemirror's `getSelection` override.** `src/cursor-plugin.js:164` shows `getSelection` is overridable. This is an escape hatch — a downstream could theoretically inject block-selection serialization into the same plugin. Unverified: does any production consumer use this override to extend beyond text-cursor? Worth probing the TipTap + Hocuspocus ecosystems for precedents before committing to a separate bridge.

---

## Sources

Per-editor evidence above; all file:line citations are against the repos checked out in `~/.claude/oss-repos/`. Web search layer (Linear/Notion) used for completeness but did not meaningfully contribute.
