# Discriminated PluginState ergonomics — prior art across production editors

**Question.** OK proposes a kind-polymorphic `ActiveInteractable` union (4 kinds: `mark | node | block | text-range`) in a single PM PluginState, consumed by breadcrumb, popover, announcer, presence halo. Does this shape work ergonomically at 4 kinds, and does it collapse as the union grows to 5-8?

**Method.** Read the selection-type surface of five production editors (ProseMirror, Lexical, Slate/Plate, BlockSuite, BlockNote) and tabulate consumer-side narrowing patterns. Local OSS copies under `~/.claude/oss-repos/`; ProseMirror from repo `node_modules/`.

## 1. Per-editor findings

### 1.1 ProseMirror — abstract class + `jsonID` registry (OOP, not discriminated union)

**Shape.** `abstract class Selection` with three core subclasses: `TextSelection`, `NodeSelection`, `AllSelection`.
- `node_modules/prosemirror-state/src/selection.ts:9-188` — base class + abstract `eq`, `map`, `toJSON`
- `selection.ts:229-305` TextSelection, `325-376` NodeSelection, `399-432` AllSelection
- Registration: `Selection.jsonID(id, cls)` — static registry keyed by string tag for JSON round-trip (`selection.ts:166`)

**Extension seam.** Third-party packages extend `Selection` and register a JSON ID. `prosemirror-tables` contributes `CellSelection`:
- `node_modules/prosemirror-tables/dist/index.js:508` `CellSelection extends Selection`
- `index.js:671` `Selection.jsonID("cell", CellSelection)`

**Consumer patterns.**
1. `instanceof` checks, no narrowing helpers in core: `other instanceof TextSelection` (`selection.ts:257`), `other instanceof NodeSelection` (`selection.ts:350`), `other instanceof AllSelection` (`selection.ts:422`).
2. `selection.visible` flag overridable at prototype level — each subclass can opt out without a consumer branch (`selection.ts:187, 378`).
3. PM does NOT export a union type. Consumers write `if (state.selection instanceof NodeSelection) ...` at call sites.

**No switch-on-kind anywhere in PM core.** Every consumer narrows via `instanceof` to the subclass it cares about.

### 1.2 Lexical — `BaseSelection` interface + `$is*` type predicates

**Shape.** Structural interface `BaseSelection` with multiple implementations.
- `packages/lexical/src/LexicalSelection.ts:303-320` `interface BaseSelection` — 13 required methods (`clone`, `extract`, `getNodes`, `insertText`, `is`, `insertNodes`, `getStartEndPoints`, `isCollapsed`, `isBackward`, etc.)
- `LexicalSelection.ts:322` `class NodeSelection implements BaseSelection`
- `LexicalSelection.ts:468` `class RangeSelection implements BaseSelection`
- `packages/lexical-table/src/LexicalTableSelection.ts:109` `class TableSelection implements BaseSelection` — added in a separate npm package

**Narrowing API.** Exported type-predicate functions, one per kind:
- `LexicalSelection.ts:464` `$isRangeSelection(x: unknown): x is RangeSelection` → `x instanceof RangeSelection`
- `LexicalSelection.ts:1971` `$isNodeSelection(x)` → `x instanceof NodeSelection`
- `packages/lexical-table/src/LexicalTableSelection.ts:381` `$isTableSelection(x) → x instanceof TableSelection`

**Consumer patterns.** Three shapes observed across `packages/lexical/src/` and `packages/lexical-rich-text/src/`:

1. **Single-kind early return** (most common — `packages/lexical/src/nodes/LexicalTextNode.ts:847, 906, 994, 1098, 1136`):
   ```ts
   const selection = $getSelection();
   if (!$isRangeSelection(selection)) return;
   // rest of handler assumes RangeSelection
   ```

2. **If/else-if ladder** (explicit dispatch, `packages/lexical-rich-text/src/index.ts:491-495, 585-593`):
   ```ts
   const selection = $getSelection();
   if ($isRangeSelection(selection)) {
     selection.removeText();
   } else if ($isNodeSelection(selection)) {
     selection.getNodes().forEach((n) => n.remove());
   }
   // falls through for TableSelection / unknown — intentional
   ```

3. **React hook as narrowing wrapper** — consumers get a scalar, not the union (`packages/lexical-react/src/useLexicalNodeSelection.ts:57`):
   ```ts
   const [isSelected, setSelected, clearSelected] = useLexicalNodeSelection(key);
   // hook internally does: if ($isNodeSelection(selection)) ...
   ```

**Key observations.**
- Consumers deliberately **do not handle every kind**. Falling through is the norm. `registerCommand(DELETE_CHARACTER_COMMAND, ...)` handles `RangeSelection` and `NodeSelection`, silently ignores `TableSelection`.
- `$is*` predicates are **stand-alone functions**, not methods. Works with TS narrowing but stays tree-shakable.
- `instanceof` under the hood means hot reload can break cross-bundle identity checks — a real but niche cost, unrelated to union ergonomics.
- Lexical's own docs describe these as "a discriminated union of selection types" (search result: lexical.dev/docs/concepts/selection) even though the TS shape is interface + predicates, not `kind` literal union.

### 1.3 Slate / Plate — single selection shape; discrimination moved to operations

**Selection shape.** NOT polymorphic at all — `Selection = Range | null`, where `Range = { anchor: Point; focus: Point }`.
- `packages/slate/src/interfaces/range.ts:13-18` `TRange` — single structural type

**Discrimination lives on `Operation`.** The discriminated-union pattern IS used, but for operations, not selections:
- `packages/slate/src/interfaces/operation.ts:13-16`
  ```ts
  export type Operation<N extends Descendant = Descendant> =
    | NodeOperation<N>
    | SelectionOperation
    | TextOperation;
  ```
- Six `NodeOperation` variants + two `TextOperation` + one `SetSelectionOperation` with three sub-shapes. All use `type: 'insert_node' | 'remove_node' | ...` string literal discriminant (`operation.ts:39-131`).
- Narrowing helpers: `OperationApi.isNodeOperation`, `isSelectionOperation`, `isTextOperation` as `value is X` predicates (`operation.ts:19-37`).

**Lesson.** Slate chose to keep selection scalar and discriminate at the operation layer where the exhaustive switch appears (in the reducer that applies operations to state). The selection layer never forces consumers through a kind match.

### 1.4 BlockSuite — class hierarchy + static `type` tag + lookup helpers + array-store

**Shape.** Abstract class with static `type` string, multiple concrete classes, and — crucially — the store holds `BaseSelection[]` not `BaseSelection | null`. Different kinds **coexist**.
- `packages/framework/store/src/extension/selection/base.ts:9-47` abstract `class BaseSelection` with `static type: string`, `static group: string`, `static recoverable: boolean`
- `packages/framework/std/src/selection/block.ts:8` BlockSelection
- `packages/framework/std/src/selection/text.ts:34` TextSelection
- `packages/framework/std/src/selection/cursor.ts:9` CursorSelection
- `packages/framework/std/src/selection/surface.ts:*` SurfaceSelection

**Type narrowing API.** `StoreSelectionExtension` exposes type-directed lookup (`selection-extension.ts:137-155`):
```ts
filter<T extends SelectionConstructor>(type: T): InstanceType<T>[]
find<T extends SelectionConstructor>(type: T): InstanceType<T> | undefined
filter$<T>(type): Signal<InstanceType<T>[]>  // reactive
find$<T>(type): Signal<InstanceType<T> | undefined>  // reactive
```

Plus an instance-level predicate that returns a type guard:
```ts
// base.ts:40-45
is<T extends SelectionConstructor>(type: T): this is T extends SelectionConstructor<infer U> ? U : never {
  return this.type === type.type;
}
```

**Consumer patterns.** Across `packages/affine/blocks/*/src/` — every single call site is type-directed, not kind-dispatching:
- `packages/affine/blocks/note/src/move-block.ts:11` `selection.filter(BlockSelection)`
- `packages/affine/blocks/note/src/move-block.ts:18` `selection.find(TextSelection)`
- `packages/affine/blocks/note/src/note-keymap.ts:511` `selection.find(BlockSelection)`
- `packages/affine/blocks/paragraph/src/paragraph-keymap.ts:35, 76, 105` — three adjacent handlers each call `selection.find(TextSelection)` independently
- `packages/affine/blocks/latex/src/latex-block.ts:24` `this.selection.filter(BlockSelection)`
- `packages/affine/blocks/note/src/commands/block-type.ts:173` `selectionManager.filter(BlockSelection)`

Searched ~40 call sites, **zero use a switch on `selection.type`**. Consumers always request a specific constructor.

**Multi-kind coexistence.** Because the store is a list, a doc can have `[BlockSelection, CursorSelection]` simultaneously — e.g. a block highlighted in the note while the user hovers over the whiteboard. This avoids the "one-or-the-other" tension at design time; no kind is mutually exclusive.

**Remote-selection path.** `selection-extension.ts:68-93` — remote selections come over awareness as JSON, `_jsonToSelection` looks up the constructor by `json.type` and calls `ctor.fromJSON(json)`. Extensible: register a new `SelectionIdentifier`, and remote clients deserialize it via the registry.

### 1.5 BlockNote — separate APIs, no union

**Shape.** Selection is literally one struct, not polymorphic (`packages/core/src/editor/selectionTypes.ts:9-15`):
```ts
export type Selection<BSchema, I, S> = {
  blocks: Block<BSchema, I, S>[];
};
```
Text cursor position is exposed through a **separate** API — `editor.getTextCursorPosition()` (`BlockNoteEditor.ts:935`), not a `kind: 'text-cursor'` branch. Block selection and text cursor are intentionally disjoint surfaces.

BlockNote wraps Tiptap/ProseMirror, so internally it still has PM's OOP `Selection` model, but its public API hides it behind two scalar getters.

### 1.6 Tiptap

Same selection model as ProseMirror (wraps PM directly). Extension packages like `@tiptap/extension-table` inherit PM's inheritance + `jsonID` pattern — no custom union.

## 2. Cross-editor pattern synthesis

| Editor | Shape | Narrowing | Multi-kind coexist? | Extension seam |
|---|---|---|---|---|
| ProseMirror | `abstract class Selection` + subclasses | `instanceof` inline | No (one at a time) | `Selection.jsonID` registry |
| Lexical | `interface BaseSelection` + classes | exported `$isX` predicates; `useLexicalNodeSelection` hook | No | `implements BaseSelection` anywhere |
| Slate / Plate | NOT polymorphic — single `Range \| null` | n/a at selection layer | n/a | discrimination is at `Operation` layer instead |
| BlockSuite | abstract class + static `type` tag | `.filter(Type)` / `.find(Type)` / `.is(Type)` | **Yes** — `BaseSelection[]` | DI via `SelectionIdentifier` |
| BlockNote | single struct + separate text-cursor API | n/a — split | n/a | — |

**Convergences.**

1. **No editor in the sample models selection as a TS literal `kind: '...'` discriminated union.** All use either class hierarchy with `instanceof`-based predicates (PM, Lexical, BlockSuite) OR deliberately split the concern into separate APIs (Slate, BlockNote). A discriminated `kind` would be a TS-idiomatic translation of the class-hierarchy pattern; nobody has written it that way in the production editors examined.

2. **Consumers almost never write an exhaustive switch.** The dominant pattern is *narrow-to-the-one-I-care-about, silently ignore the rest*. See Lexical `registerCommand` handlers (`lexical-rich-text/src/index.ts:572-593`) — they cover the 2 kinds they act on and fall through for TableSelection.

3. **Type-directed lookup helpers are the best-developed ergonomic pattern.** BlockSuite's `filter/find(Type)` (`selection-extension.ts:137-155`) is the most polished surface across the sample — consumers never see the union; they request by constructor. React-hook wrappers (Lexical's `useLexicalNodeSelection`) achieve the same narrowing at the component boundary.

4. **Extension-without-touching-core is load-bearing.** PM's `jsonID`, Lexical's interface-based `BaseSelection`, BlockSuite's DI — all three were explicitly designed so a third-party package (tables, bridges, gfx, etc.) can add a selection kind without the core editor changing. A closed-literal-union shape (TS `kind: 'mark' | 'node' | 'block' | 'text-range'`) forecloses this; you'd need `kind: string` or a brand type to keep it open.

**Divergences.**

- **BlockSuite's multi-kind coexistence** is a structurally different model from the other four. A `BaseSelection[]` lets `BlockSelection` and `CursorSelection` (whiteboard) both be active at once. The other editors force a single active selection.
- **Slate's operation-first discrimination** pushes the switch out of selection and into the reducer, where it's natural to be exhaustive (the reducer must apply every op kind).
- **BlockNote's split API** is an explicit "don't unify at all" — two concerns, two APIs, no bridge.

## 3. Type-narrowing helpers that work well

**Pattern A — exported predicate function** (Lexical, works with TS user-defined type guard):
```ts
export function $isRangeSelection(x: unknown): x is RangeSelection {
  return x instanceof RangeSelection;
}
// consumer:
if ($isRangeSelection(selection)) selection.removeText();
```
Pros: tree-shakable, works outside method context, one import per kind. `packages/lexical/src/LexicalSelection.ts:464, 1971`; `packages/lexical-table/src/LexicalTableSelection.ts:381`.

**Pattern B — instance predicate method** (BlockSuite `.is(Type)`):
```ts
// base.ts:40-45
is<T>(type: T): this is InstanceType<T> { return this.type === type.type; }
// consumer: sel.is(TextSelection)
```
Pros: chainable, works with inheritance. Cons: needs `this` so doesn't work on `null`.

**Pattern C — store-level `.find(Type)` / `.filter(Type)` with generic infer** (BlockSuite):
```ts
// selection-extension.ts:147-155
find<T extends SelectionConstructor>(type: T): InstanceType<T> | undefined
```
Pros: consumers never handle the union — they get exactly the type they asked for, or `undefined`. Sites like `selection.find(TextSelection)?.from.blockId` are readable. Cons: requires a store/manager; doesn't fit a single `state.selection` shape without a wrapper.

**Pattern D — hook wrapper** (Lexical `useLexicalNodeSelection`):
```ts
const [isSelected, setSelected, clear] = useLexicalNodeSelection(nodeKey);
```
Hides the union behind an API that returns scalar booleans. Ideal for per-node components — they don't need to know the union exists. `packages/lexical-react/src/useLexicalNodeSelection.ts:57-113`.

## 4. Scale concerns when the union has 5-8 kinds

The production editors do not provide a clean "5-kinds-vs-8-kinds" comparison — nobody encodes a TS literal-kind union, so "adding a kind" in these codebases means adding a class + a predicate + maybe a `jsonID`. That rings two real-world load-bearing seams:

**What actually gets expensive as the union grows.**

1. **Serialization drift.** Each new kind adds a `toJSON/fromJSON` pair. In BlockSuite's awareness/remote pipeline (`selection-extension.ts:68-93`) a typo in a `type` string on one client silently drops remote selections with a console error. OK's CRDT layer would have the same failure mode.

2. **Equality / identity.** Each kind needs `eq/equals/is`. ProseMirror's `TextSelection.eq` checks `instanceof TextSelection` first (`selection.ts:257`); Lexical's `RangeSelection.is` uses `$isRangeSelection` (`LexicalSelection.ts:506-509`). Getting cross-kind equality wrong (e.g. `markSel.equals(nodeSel) → true`) causes subtle invalidation bugs. More kinds = more pair-wise equality surface.

3. **Shared-field refactors.** Renaming `origin` across 4 kinds is painful; across 8, worse. Lexical sidesteps this because `BaseSelection` is structural — shared fields live on the interface, each class duplicates. BlockSuite stores `blockId` on the base (`base.ts:14`). If OK's `origin` genuinely applies to every kind, it should live on a base type, not be duplicated per branch.

4. **Multi-kind consumers.** The concern *is* real for consumers that need to handle every kind — e.g. an announcer that speaks the active selection. In Lexical these look like if/else-if ladders with a silent "else" (`lexical-rich-text/src/index.ts:572-593`). That pattern scales OK to ~5 kinds; at 8 it's noisy but not broken. Exhaustive `assertNever(kind)` can be added at the tail to force compile errors when a new kind is missed — TS has good support (`basarat.gitbook.io/typescript/type-system/discriminated-unions`).

5. **Tight coupling between kinds.** If `announcer` branch for `block` kind needs `ancestorChain`, and the `presence-halo` branch for `block` also needs `ancestorChain`, you have two consumers depending on one branch's internals. This is where polymorphic selections sometimes get refactored toward: (a) a common method on every branch (`describe(): string`) or (b) a sum-of-accessors layer over the union. BlockSuite's branches carry their own domain fields (`TextRangePoint`, `x/y` for CursorSelection) — consumers that need the same string from different kinds write separate handlers.

**What does NOT break at scale.**

- TypeScript narrowing — `kind: 'mark'` works at 4 and at 20 kinds; the compiler is unfazed.
- `switch (s.kind)` with `assertNever` at tail — if anything, more kinds make the exhaustiveness check more valuable.
- React hook narrowing — a `useActivePlugin.asMark()` hook scales regardless of union width.

## 5. Implication for OK's proposed `ActiveInteractable`

OK's proposal:
```ts
type ActiveInteractable =
  | { kind: 'mark', id: string, markType: string, origin: Origin }
  | { kind: 'node', id: string, pos: number, origin: Origin }
  | { kind: 'block', id: string, bridgeId: string, ancestorChain: Ancestor[], origin: Origin }
  | { kind: 'text-range', from: number, to: number, origin: Origin }
  | null;
```

**Observations from the prior art.**

1. **The 4-branch switch concern is overstated if you never write the switch.** No editor in this sample forces consumers through exhaustive kind dispatch. They all provide filter/narrow helpers (`$isX`, `.find(X)`, `.is(X)`) and consumers only handle the kinds they care about. Breadcrumb, popover, announcer, and presence-halo are natural candidates for per-kind helpers (e.g. `asMark(ap)`, `asBlock(ap)`), each of which is a 3-line filter.

2. **Closed literal-union vs. open class-hierarchy is a real trade-off.** A `kind: 'mark' | 'node' | 'block' | 'text-range'` union is **closed** — adding a 5th kind is a core edit. PM / Lexical / BlockSuite chose **open** because third-party packages need to contribute new kinds. OK's context (cite: "CB-v2's `BlockSelection` explicitly declined kind-polymorphism") suggests there's no third-party extension story yet, so closed is defensible. If OK ever wants plugin-contributed interactables, the closed union becomes a bottleneck. BlockSuite's DI registry is a reference pattern for that eventual transition.

3. **`origin` appearing on every branch is a smell toward a base type.** Lexical puts shared concerns on `BaseSelection` (`LexicalSelection.ts:303-320`); BlockSuite puts `blockId` on base (`base.ts:14`). OK could write:
   ```ts
   type ActiveInteractable = { origin: Origin } & (
     | { kind: 'mark', id, markType }
     | { kind: 'node', id, pos }
     | { kind: 'block', id, bridgeId, ancestorChain }
     | { kind: 'text-range', from, to }
   ) | null;
   ```
   — reduces refactor cost if `Origin` evolves.

4. **The `id` field repetition across mark/node/block is a near-duplicate that merits attention.** Three kinds share a string id; `text-range` doesn't. If id semantics actually differ per kind (mark-id vs node-id vs block-id), the union tag is doing real work. If they're interchangeable, consider whether `text-range` is the one that wants a different base shape. BlockSuite hits this exact question with `TextSelection.blockId` + `from.blockId` + `to.blockId` — three levels of id, each meaningful.

5. **Narrowing-helper ergonomics are doable.** Write:
   ```ts
   export const isMark = (a: ActiveInteractable): a is Extract<ActiveInteractable, { kind: 'mark' }> => a?.kind === 'mark';
   // and similar for node, block, text-range
   ```
   This is Lexical's `$is*` pattern translated to discriminated union — same ergonomics, compile-time narrowed. Every consumer that cares about one kind writes `if (!isMark(ap)) return; …`.

6. **For multi-kind consumers** (breadcrumb, announcer) a `switch (ap.kind)` with `assertNever` at tail is idiomatic TypeScript and catches new-kind addition at compile time. Lexical's if/else-if ladders are the same pattern in less typesafe form. At 4 kinds this is 8-12 lines; at 8 kinds, ~24 lines — readable, not painful.

7. **BlockSuite's coexisting-selection model is worth noting as a deliberate shape.** If OK ever wants e.g. "a block is highlighted AND a mark popover is active AND a remote peer's cursor is in a text-range" simultaneously, the `ActiveInteractable | null` shape forecloses that — it's strictly one-at-a-time. BlockSuite's `BaseSelection[]` handles it natively. Current OK requirements don't seem to need coexistence, but the shape choice is load-bearing for future multi-peer-presence-halo if that's an ambition. The V2 context snippet mentions this as a future concern.

**What's missing from the evidence.**

- Nobody in the sample has written the exact shape OK is proposing (discriminated literal union over 4 selection-like kinds). Prior art is all class hierarchies. The discriminated-union variant is a reasonable TS-native translation, but its maintenance profile at 5-8 kinds is inferred from general TS patterns, not from a production editor using that exact shape.
- Confidence in "4-kind switch is ergonomically fine" is high (Lexical if/else-if ladders, BlockSuite's 4 kinds today). Confidence in "8-kind scales cleanly" is lower — no editor has pushed past ~4-5 selection kinds in the surveyed code.

---

**Sources**
- Lexical — [lexical.dev/docs/concepts/selection](https://lexical.dev/docs/concepts/selection); local tree at `~/.claude/oss-repos/lexical/`
- ProseMirror — [prosemirror-state README](https://github.com/ProseMirror/prosemirror-state/blob/master/src/README.md); local tree at `node_modules/prosemirror-state/src/`
- Slate / Plate — local tree at `~/.claude/oss-repos/plate/packages/slate/`
- BlockSuite — local tree at `~/.claude/oss-repos/blocksuite/packages/framework/`
- BlockNote — local tree at `~/.claude/oss-repos/blocknote/packages/core/`
- Discriminated-union TS patterns — [FullStory](https://www.fullstory.com/blog/discriminated-unions-and-exhaustiveness-checking-in-typescript/), [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/type-system/discriminated-unions)
