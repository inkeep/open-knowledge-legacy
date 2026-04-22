# ActivePlugin ↔ PM state.selection — composition semantics

Investigating whether an app-layer `ActivePlugin` with `kind: 'text-range' | 'node'` variants duplicates ProseMirror's built-in `state.selection`. Evidence below is code-verified against `node_modules/prosemirror-state@1.4.x`, CB-v2 branch (`worktree-component-blocks-v2`), TipTap (`@tiptap/core`, `@tiptap/extension-bubble-menu`), and y-prosemirror.

---

## 1. PM's state.selection model — write path, read path

**Write path — one channel.** `tr.setSelection(sel)` is the only way to change a selection explicitly.

- `node_modules/prosemirror-state/src/transaction.ts:81-89` — `setSelection(selection)` stores `this.curSelection = selection` and flips the `UPDATED_SEL` bit. No meta-key alternative.
- `tr.selection` getter at `transaction.ts:71-77` — transparently maps the prior selection through any steps added since the last explicit set. This is why selection *automatically* survives doc edits without plugin help.
- A plugin cannot write to `state.selection` via `tr.setMeta(...)`. Plugins can append transactions (`appendTransaction`) or call `view.dispatch(tr)` from event handlers / `view.update`, and those transactions can include `tr.setSelection(...)` — but the tr→selection commit point is a fixed PM primitive, not a pluggable meta key.

**Read path — base field with deterministic apply order.** Every `EditorState` has `state.selection` as a **base field**, computed from `tr.selection` once per transaction.

- `node_modules/prosemirror-state/src/state.ts:27-30`
  ```ts
  new FieldDesc<Selection>("selection", {
    init(config, instance) { return config.selection || Selection.atStart(instance.doc) },
    apply(tr) { return tr.selection }     // no plugin influence
  })
  ```
- `state.ts:173-179` (`applyInner`) iterates `fields` **in order**: base fields first (`doc`, `selection`, `storedMarks`, `scrollToSelection`), then plugin fields. When plugin `apply(tr, value, oldState, newState)` runs, `newState.selection` is **already the post-transaction value** — the selection FieldDesc ran before any plugin FieldDesc.
- Therefore: **reading `newState.selection` inside a plugin's `apply` is the canonical pattern**, not a hazard.

**Selection types** — `selection.ts:229` `TextSelection`, `:325` `NodeSelection`, `:399` `AllSelection`. Registered via `Selection.jsonID` (`selection.ts:166-171`). Custom selection classes are permitted but must self-register.

## 2. Can plugins safely read state.selection in `apply` without re-apply cascades?

**Yes, unconditionally.** Verified from the PM runtime:

1. `applyInner` (`state.ts:171-179`) is a single pass over fields. Each field's `apply` is called exactly once per transaction. Reading `newState.selection` from a plugin's `apply` does not re-enter selection-apply.
2. The transaction-pipeline loop that *can* re-invoke apply is `applyTransaction`'s `appendTransaction` loop (`state.ts:144-167`). That loop only iterates when a plugin's `appendTransaction` **dispatches a new transaction**. Reading `newState.selection` is side-effect-free and cannot trigger it.
3. The only cascade hazard is if a plugin's `apply` dispatched a view-level transaction. `apply` is pure by contract — violating that is a self-inflicted bug, unrelated to reading selection.

**Corollary — you cannot write selection from inside `apply`.** `apply` returns the new plugin-state value; it has no `dispatch` and no transaction handle. If an ActivePlugin variant needs to force `state.selection`, it must do so from a view-layer handler (`handleDOMEvents`, `view.update`) or via `appendTransaction` — which is exactly what CB-v2's `scheduleRefresh` does (see §3).

## 3. CB-v2 SelectionStatePlugin — prior art inside this repo

CB-v2's `selection-state-plugin.ts` (branch `worktree-component-blocks-v2`) is the direct precedent for ActivePlugin and has already resolved this question in practice: **derive from `state.selection`, enrich, never duplicate**.

- **Plugin state** (`:51-72`) — `BlockSelection = { selectedBlockId, ancestorChain, selectionOrigin, isDragging }`. Every field is derived or event-sourced; none stores `{from, to}`.
- **Derivation reads state.selection directly** (`:127-145`):
  ```ts
  export function deriveAncestorChain(state, selection) {
    const { $from } = selection       // from state.selection
    for (let depth = 1; depth <= $from.depth; depth++) { ... }
    if (selection instanceof NodeSelection) { ... }
  }
  export function deriveBlockSelection(state, prev, overrides) {
    const chain = deriveAncestorChain(state, state.selection)
    ...
  }
  ```
- **apply reads newState** (`:320`): `apply(tr, prev, _oldState, newState) { return computeSelectionApply(tr, prev, newState, RUNTIME.get(plugin)) }`.
- **Selection-change gate uses PM's own primitive** (`:279`): `tr.selectionSet` — the `UPDATED_SEL` bit flag set by `tr.setSelection` (`transaction.ts:92-94`). CB-v2 does not reinvent change detection.
- **Origin enrichment — the value-add over raw state.selection**:
  - `SELECTION_ORIGIN_META_KEY = 'selectionStatePlugin/origin'` (`:93`) — PM tr-meta string. Agent writes and programmatic `setNodeSelection` tag their transactions; `apply` reads the meta via `tr.getMeta(key)` (`:281`).
  - `pendingOrigin` event-sourced from `handleDOMEvents.mousedown/pointerdown` and `handleKeyDown` (`:319-347`) — populates a plugin-instance WeakMap runtime.
  - Precedence (`:265-283`): `metaOrigin ?? pendingOrigin ?? prev.selectionOrigin`.
- **Drag state — orthogonal to PM selection** (`:355-380`): `dragstart` / `dragend` on `view.dom` in capture phase mutate `runtime.isDragging`, then `scheduleRefresh` dispatches a **meta-only** tx (`SELECTION_REFRESH_META_KEY`) that contains no steps and no `setSelection`; it exists solely to trigger `apply` so the new `isDragging` flows into plugin state.
- **Read-only over the PM doc** — docstring invariant SC-INV-1 (`:13-16`): "Never dispatches a transaction that mutates the document." The one dispatch (`scheduleRefresh`) is doc-neutral.

**Inference on the `{kind: 'text-range', from, to}` variant the user is weighing.** CB-v2 does not carry `from`/`to` in `BlockSelection` — when consumers need the PM range, they read `editor.state.selection.from` / `.to`. The plugin only carries the semantic enrichment that cannot be derived from state.selection alone (which jsxComponent, which bridgeId, which origin, whether dragging).

## 4. TipTap ecosystem convention — read-through on every update

TipTap's own selection-aware plugins follow Option 1 (Defer) / Option 2 (Proxy) strictly. No duplicate selection storage anywhere in `@tiptap/core` or its extensions.

- **BubbleMenu's PluginView update loop** (`node_modules/@tiptap/extension-bubble-menu/src/bubble-menu-plugin.ts:470-483`):
  ```ts
  update(view, oldState) {
    const hasValidSelection = view.state.selection.from !== view.state.selection.to
    const selectionChanged = !oldState?.selection.eq(view.state.selection)
    ...
  }
  ```
  Reads `view.state.selection` on every update. Stores nothing. Change detection via `Selection.eq` (defined for each subclass at `selection.ts:256, 349, 422`).
- **Commands write via `tr.setSelection` only** (`@tiptap/core/src/commands/`):
  - `setNodeSelection.ts:25-27` → `NodeSelection.create(doc, from); tr.setSelection(selection)`
  - `setTextSelection.ts:29-31` → `TextSelection.create(doc, from, to); tr.setSelection(selection)`
  - Also: `cut.ts`, `extendMarkRange.ts`, `focus.ts`, `selectAll.ts`, `splitListItem.ts` — all use `tr.setSelection`. Zero instances of `tr.setMeta(...)` as a selection channel.
- **Type guards are trivial `instanceof` checks** (`isNodeSelection.ts`, `isTextSelection.ts`) — i.e., TipTap expects consumers to type-narrow `state.selection` as the canonical source, not a parallel union.

## 5. y-prosemirror awareness cursor — the strongest Option-1 prior art

`yCursorPlugin` is the canonical multi-client cursor/selection plugin in the PM ecosystem. Its composition with `state.selection` is the strongest precedent for the Defer pattern.

- **Local selection → awareness projection** (`node_modules/y-prosemirror/src/plugins/cursor-plugin.js:203-253`):
  ```js
  const updateCursorInfo = () => {
    if (view.hasFocus()) {
      const selection = getSelection(view.state)    // default: state => state.selection
      const anchor = absolutePositionToRelativePosition(selection.anchor, ...)
      const head = absolutePositionToRelativePosition(selection.head, ...)
      awareness.setLocalStateField(cursorStateField, { anchor, head })
    }
  }
  ```
  Default `getSelection` at `:157` is literally `(state) => state.selection`. The plugin does not cache, mirror, or proxy the local selection — it **reads on every `view.update()` and on focusin/focusout**.
- **Plugin state stores remote peer cursors, not local** (`:163-189`): the plugin's own `state` field holds a `DecorationSet` of remote cursors derived from `awareness.getStates()`. Local selection is entirely outsourced to `state.selection`.
- **Write path: awareness, not PM selection.** The plugin never calls `tr.setSelection` for the local cursor. It writes to `awareness.setLocalStateField(...)` — a completely different outbound channel — and receives remote peer positions through `awareness.on('change', ...)`.

This is the load-bearing signal: the PM-ecosystem solution for "I need to track the current selection plus metadata across a network" does not duplicate `state.selection`. It reads through on demand and projects outward.

## 6. Verdict matrix

| Option | Cost | Precludes | Prior art |
|---|---|---|---|
| **1. Defer** — omit `kind: 'text-range'` / `kind: 'node'`; consumers read `state.selection` directly. | Two API surfaces for consumers (`activePlugin.getState` for non-selection kinds, `editor.state.selection` for text/node). Callers must type-narrow PM's `Selection` union. | Attaching **enrichment** to a text-range (origin classification, "the user is editing inside `<Card bridgeId=b4>`", "this range is a managed-link edit") inside the ActivePlugin union — unless you add a sibling field to carry the enrichment. | y-prosemirror `yCursorPlugin` (`cursor-plugin.js:157`); TipTap BubbleMenu (`bubble-menu-plugin.ts:470`). |
| **2. Proxy** — ActivePlugin has `kind: 'text-range'` / `kind: 'node'` variants, but `apply` **derives** them from `newState.selection` and enriches. No independent `{from, to}` storage; when queried, the variant reads from `editor.state.selection`. | `apply` must consume `tr.selectionSet` to detect change (`transaction.ts:92-94`); derivation must be a pure function of `state.selection` + origin hints. Minor subscription-layer work to expose the derived shape to React consumers. | Nothing material. Enrichment is first-class. Still single-source-of-truth (PM selection); plugin never diverges. | **CB-v2 `SelectionStatePlugin`** (this repo, `worktree-component-blocks-v2`) — literally the same shape CB-v2 uses for `BlockSelection`. |
| **3. Supersede** — ActivePlugin stores `{from, to}` / `{pos, nodeId}` independently; consumers always read from ActivePlugin. | Two sources of truth that must stay in lockstep. Every external integrator (TipTap commands, y-prosemirror `yCursorPlugin`, copy/paste, input rules, marks-at-cursor) still reads `state.selection` — you now have the bridge problem OK has wrestled with for XmlFragment ↔ Y.Text, but at the selection layer. Any `tr.setSelection` from outside ActivePlugin arrives at state.selection first; ActivePlugin has to observe + mirror, and the mirror is always one frame behind. Mapping through steps must be reimplemented (PM does it for free via `tr.selection` getter). | Interop with every community PM plugin that reads `state.selection`. Drift-free guarantees. | **None found** in PM, TipTap, Lexical (Lexical has its own `$getSelection` but that IS PM's equivalent — not a *second* store layered on top of it), y-prosemirror, or CB-v2. |

**Observation (surface-level, not prescriptive):** Option 2 (Proxy) is the only path where the ActivePlugin union remains semantically complete (`kind: 'text-range' | 'node' | 'link-chip' | 'jsx-component' | ...`) without creating a parallel selection store. It matches CB-v2's shipped pattern verbatim. Option 1 (Defer) is the lowest-risk path and matches y-prosemirror's prior art, but fragments the consumer API across two systems (PM selection + ActivePlugin registry). Option 3 (Supersede) has no precedent in the PM ecosystem and would require OK to reinvent primitives PM already provides (mapping through steps, change detection, multi-range support).

## Gaps and unknowns

- **Custom Selection subclasses.** Did not investigate whether OK would extend `Selection` (via `Selection.jsonID`) for a domain-specific selection type. This would unlock Option 3 variants that are less divergent, because a custom Selection participates in PM's mapping/apply machinery. No prior art found in CB-v2 or any extension inspected.
- **`appendTransaction` interaction.** Option 2 derivations that need to *force* a selection (e.g. "activate this chip moves the caret inside it") would need to dispatch from `appendTransaction` or a view handler. Not examined in detail; CB-v2 does not do this — it only classifies, never forces.
- **React 19 `useSyncExternalStore` semantics with derived plugin state.** CB-v2 uses the `useState + subscribe` pattern explicitly (see `interaction-layer.tsx:301-315` for a parallel case, and `use-block-selection.ts` reference in CB-v2). The subscription-shape choice is orthogonal to the Defer/Proxy/Supersede question but worth confirming before committing to Option 2.

## Key source references

- `node_modules/prosemirror-state/src/selection.ts:9-188` — Selection base class, `jsonID` registration
- `node_modules/prosemirror-state/src/selection.ts:229-305` — TextSelection
- `node_modules/prosemirror-state/src/selection.ts:325-376` — NodeSelection
- `node_modules/prosemirror-state/src/state.ts:27-30` — selection as base field with `apply(tr) { return tr.selection }`
- `node_modules/prosemirror-state/src/state.ts:171-179` — `applyInner` base-first field order
- `node_modules/prosemirror-state/src/transaction.ts:71-94` — `tr.selection` getter, `tr.setSelection`, `tr.selectionSet`
- CB-v2 `packages/app/src/editor/extensions/selection-state-plugin.ts` (branch `worktree-component-blocks-v2`) — derive-and-enrich reference implementation
- `packages/app/src/editor/interaction-layer.tsx` — OK HEAD's `InteractionLayerStore` (app-layer; no PM-state integration yet)
- `node_modules/y-prosemirror/src/plugins/cursor-plugin.js:151-267` — canonical read-through-and-project pattern
- `node_modules/@tiptap/extension-bubble-menu/src/bubble-menu-plugin.ts:470-519` — BubbleMenu reads `state.selection` on update, no duplicate storage
- `node_modules/@tiptap/core/src/commands/setNodeSelection.ts:19-31` and `setTextSelection.ts:19-35` — canonical TipTap write path via `tr.setSelection`
