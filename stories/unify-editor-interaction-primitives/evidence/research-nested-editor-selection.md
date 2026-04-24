# Nested-Editor Selection Composition Research

**Scope:** When a nested CodeMirror editor inside a ProseMirror NodeView has focus / active selection, what does the outer editor's "active interactable" state say? Surface tradeoffs across three architectural options.

**Date:** 2026-04-21
**Consumer:** OK ActiveInteractable union design for CB-v2 per-block source-toggle

---

## TL;DR

Our own cm-in-pm report answers the **focus-ownership** question cleanly (§5.3 — HIGH confidence: exactly one editor holds focus; PM should present a NodeSelection when CM has focus) but is **silent on the UI-state-model question** (whether OK's `ActiveInteractable` should have a `kind: 'nested-editor'` variant, what that carries, and how it generalizes to N-deep nesting).

The report's §5.3 recommendation ("PM's selection should be a NodeSelection of the rawMdxFallback node") **diverges from the canonical PM tutorial pattern**, which actually sets a **TextSelection with positions *inside* the node** via `forwardUpdate` + `setSelection` NodeView method. CB-v2's current implementation does neither — PM selection stays stale while CM has focus (verified via `RawMdxFallbackView.tsx`).

Two production reference points:

- **Lexical** has first-class nested editors with `_parentEditor` refs (LexicalEditor.ts:823) and a pub/sub `SELECTION_CHANGE_COMMAND` that bubbles the active nested editor up to any subscriber — the toolbar tracks `activeEditor` as React state (Editor.tsx:137). N-deep generalizes naturally.
- **Blocksuite** rejects the premise — there is no nested editor. Every block holds an inline editor, coordinated by a single `StoreSelectionExtension` with a typed `BaseSelection` array (block / text / cursor / surface variants). Not applicable as reference — OK's CM-in-PM hybrid has no counterpart in their model.

---

## 1. Report synthesis

### 1.1 What cm-in-pm answers

| Question                                        | Report answer                                                                     | Confidence     | Source                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | -------------- | ---------------------------------- |
| Can nested CM reuse y-codemirror.next?          | **No** — direct PM dispatch pattern                                               | HIGH           | §8.3                               |
| Who owns the CRDT layer for nested-CM content?  | **y-prosemirror**, CM is view-only facade                                         | HIGH           | §1, §8.3                           |
| How does CM → PM sync work?                     | `forwardUpdate` dispatches PM transactions, `updating` flag prevents loops        | HIGH           | §3.1 (forwardUpdate), §4.1 (trace) |
| When CM has focus, what about PM focus?         | "Exactly one editor holds focus at any time"                                      | HIGH           | §5.3                               |
| What is PM's selection state when CM has focus? | "Should be a `NodeSelection` of the rawMdxFallback node"                          | HIGH (claimed) | §5.3                               |
| How does `selectNode()` fire?                   | "When node is selected (e.g., via mouse click on the node boundary)" — cm.focus() | HIGH           | §5.1                               |
| How to escape back to PM?                       | `maybeEscape('line'\|'char', -1\|1)` boundary-arrow keybindings                   | HIGH           | §5.2, §6.2                         |
| Multi-instance focus coordination?              | "Only one CM can have focus. Browser focus semantics enforce this"                | HIGH           | §5.4                               |

### 1.2 What cm-in-pm does NOT answer

The report is **scoped to the bridge mechanics**, not the app-level UI state model. It does not address:

- Whether there should be a first-class UI-state primitive (OK's `ActiveInteractable`) that carries `kind: 'nested-editor'`, `editorRef`, `innerSelection`
- How awareness/presence should expose a nested selection to remote peers (§13.1 explicitly lists "Per-block collaborative cursors" as **NOT investigated**, "Low value for rawMdxFallback (degraded state)")
- N-deep nesting (nested-in-nested): every example is one-deep raw-MDX-inside-PM
- How per-block-source-toggle (making EVERY JsxComponent potentially a nested editor) changes the calculus. Report's §14 forward-compat claim ("createNestedCMExtensions factory pattern") covers extension composition only, not selection state
- How an outer PM-level toolbar decides "am I talking to the outer editor or the nested one?" — the Lexical `$isEditorIsNestedEditor` question

### 1.3 Critical caveat — §5.3 is prescriptive, not descriptive

The claim "When CM has focus, PM's selection **should be** a `NodeSelection` of the rawMdxFallback node" is a **design recommendation**, not observed runtime behavior. The PM tutorial (which the report cites at §5.3) actually uses a **TextSelection with positions inside the nested node** via `forwardUpdate`:

> `tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo))` where `selFrom = offset + main.from` (prosemirror.net/examples/codemirror/)

This is a material divergence. CB-v2's current code (below) does neither — it runs "Option 3 (split ownership)" whether it meant to or not.

---

## 2. Lexical's nested-editor selection model

Lexical has **first-class nested editor support** with parent/child editor refs and a command-based selection-change notification.

### 2.1 Parent pointer

```
packages/lexical/src/LexicalEditor.ts:823
  _parentEditor: null | LexicalEditor;

packages/lexical/src/LexicalEditor.ts:893
  this._parentEditor = parentEditor;
```

Every editor carries a ref to its parent. `null` for root. Used to propagate config (theme, nodes) on construction.

### 2.2 "Is this a nested editor" predicate

```
packages/lexical-utils/src/index.ts:745
  export function $isEditorIsNestedEditor(editor: LexicalEditor): boolean {
    return editor._parentEditor !== null;
  }
```

One-liner. No fancy tracking — `parentEditor != null` ≡ nested.

### 2.3 Active-editor tracking — pub/sub via SELECTION_CHANGE_COMMAND

```
packages/lexical-playground/src/Editor.tsx:137
  const [activeEditor, setActiveEditor] = useState(editor);

packages/lexical-playground/src/plugins/ToolbarPlugin/index.tsx:785
  editor.registerCommand(
    SELECTION_CHANGE_COMMAND,
    (_payload, newEditor) => {
      setActiveEditor(newEditor);   // ← update React state
      $updateToolbar();
      return false;
    },
    COMMAND_PRIORITY_CRITICAL,
  );
```

The ROOT editor receives `SELECTION_CHANGE_COMMAND` events tagged with whichever editor (root or nested) owns the new selection. Toolbar subscribes on the root, tracks `activeEditor` as component state. A separate effect on `activeEditor` reads the toolbar state from whichever editor is live:

```
ToolbarPlugin/index.tsx:797
  activeEditor.getEditorState().read(
    () => $updateToolbar(),
    {editor: activeEditor},
  );
```

### 2.4 Nested-editor-aware toolbar logic

```
ToolbarPlugin/index.tsx:645
  if (activeEditor !== editor && $isEditorIsNestedEditor(activeEditor)) {
    const rootElement = activeEditor.getRootElement();
    updateToolbarState(
      'isImageCaption',
      !!rootElement?.parentElement?.classList.contains('image-caption-container'),
    );
  }
```

Note the pattern: the toolbar **branches behavior** based on whether `activeEditor` is nested (and which kind, via DOM ancestor check). This is a clean mapping to OK's proposed `ActiveInteractable { kind: 'nested-editor' }` — the kind variant encodes "the thing the toolbar/command palette/shortcut should route to is NOT the outer editor."

### 2.5 Awareness / collaboration — sub-document model

Lexical nested editors that participate in CRDT collaboration get their **own Y.Doc** (sub-document pattern):

```
packages/lexical-yjs/src/Utils.ts:333
  const nestedEditor = createEditor();
  ...
  nestedEditor._key = key;
  yjsDocMap.set(key, nextValue);
```

Each nested editor has a distinct `Y.Doc` in the binding's `docMap`. Awareness at the top level naturally describes which sub-doc the remote cursor is in. **OK's architecture is different** — CB-v2 uses ONE `Y.Doc` with nested content as `Y.XmlText` inside the parent `Y.XmlFragment`. No sub-doc boundary for awareness to key off.

### 2.6 Generalizes to N-deep

`_parentEditor` is a single pointer, not a depth counter, but chaining walks the hierarchy: `editor._parentEditor?._parentEditor?...`. `SELECTION_CHANGE_COMMAND` bubbles through the root editor regardless of depth. The toolbar-sees-active-editor pattern works at any nesting depth with no code change.

---

## 3. Blocksuite's nested-editor selection model

**Blocksuite does not have nested editors in the OK/Lexical sense.** Code blocks use an `InlineEditor` (custom, Shiki-highlighted) — one of many inline editors, each paired with a block, all coordinated by one top-level selection manager.

### 3.1 Selection as a typed, flat array

```
packages/framework/store/src/extension/selection/selection-extension.ts:17
  private readonly _selections = signal<BaseSelection[]>([]);

packages/framework/store/src/extension/selection/base.ts:9
  export abstract class BaseSelection {
    static readonly group: string;  // e.g. 'note', 'gfx'
    static readonly type: string;   // 'text' | 'block' | 'cursor' | 'surface'
    readonly blockId: string;
    ...
  }
```

Selections are persisted as a `BaseSelection[]` on a signal, each subtype carries `blockId` and a `type` discriminator. Variants in `packages/framework/std/src/selection/`:

- `TextSelection` — per-block text caret/range (text.ts:34)
- `BlockSelection` — block-level selection (block.ts)
- `CursorSelection` — cross-block cursor
- `SurfaceElementSelection` — edgeless/canvas elements (gfx/selection.ts)

### 3.2 Why Blocksuite isn't comparable

The `InlineEditor` is **not a separate editor with its own selection subsystem**. It's a lightweight rich-text widget that *reports into* the shared selection manager via `TextSelection { blockId, from, to }`. There is no concept of "which editor is active" because there's only one selection manager — the focused block's inline editor is simply whichever `TextSelection.blockId` is current.

This is a tempting architectural endpoint for OK ("flatten nested CM into inline-editor-per-block") but would require decomposing PM's fragment-based selection model, which is a much larger rewrite than the question at hand.

### 3.3 What Blocksuite contributes to the decision

- **Evidence that kind-polymorphic selection** (text/block/cursor/surface) is a proven pattern for a multi-surface editor — BaseSelection subclasses with a `type` discriminator
- **Remote selection broadcasting** works the same way regardless of subtype (selection-extension.ts:66-94) — the map is `Map<clientID, BaseSelection[]>`, awareness doesn't care whether the remote peer's selection is in a code block or a paragraph

---

## 4. PM-level selection semantics during nested focus

### 4.1 `EditorView.hasFocus()` returns false when nested CM has focus

```
node_modules/prosemirror-view/dist/index.js:5618
  hasFocus() {
    ...
    return this.root.activeElement == this.dom;
  }
```

The non-IE branch is strict: `activeElement === view.dom`. When focus is inside a nested CM's `contentDOM`, `view.dom` is an **ancestor** of `activeElement`, not equal. `hasFocus()` returns false.

The IE branch walks up from `activeElement`, but short-circuits to `false` on any `contentEditable="false"` ancestor. Since CB-v2's NodeViewWrapper is `contentEditable={false}`, this also returns false.

**Consequence:** PM's focus-awareness is blind to nested-CM focus. The PM selection is "stale" — whatever it was before the click.

### 4.2 PM NodeView selection hooks

```
node_modules/prosemirror-view/dist/index.d.ts:314-327
  selectNode?: () => void;
  deselectNode?: () => void;
  setSelection?: (anchor: number, head: number, root: Document | ShadowRoot) => void;
```

- `selectNode()` — fires when PM dispatches a `NodeSelection` wrapping the node. Report's pattern: `selectNode() { this.cm.focus() }`.
- `setSelection()` — fires when PM attempts to place a `TextSelection` inside the node (e.g., `Selection.near()` lands inside). Report doesn't override this, but the PM tutorial does: places cursor in CM at the mapped anchor/head.
- `deselectNode()` — fires when PM selection moves off the node. Report says "No-op; CM keeps its visual state" (§3.1).

### 4.3 The canonical PM tutorial sets a TextSelection INSIDE the node

```js
// from prosemirror.net/examples/codemirror/
forwardUpdate(update) {
  ...
  let offset = this.getPos() + 1
  let {main} = update.state.selection
  let selFrom = offset + main.from
  let selTo = offset + main.to
  let pmSel = TextSelection.create(tr.doc, selFrom, selTo)
  this.view.dispatch(tr.setSelection(pmSel))
}
```

This is **not a NodeSelection on the outer node** — it's a TextSelection with from/to **inside** the node. The outer PM's selection "moves with" the CM cursor. The cm-in-pm report §5.3 says the opposite (NodeSelection on the node).

### 4.4 CB-v2 today does NEITHER

From `packages/app/src/editor/extensions/RawMdxFallbackCMView.tsx` (branch `worktree-component-blocks-v2`):

```js
const forwardUpdate = (newText: string) => {
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  if (pos === undefined) return;
  const pmView = editor.view;
  if (!pmView) return;
  const currentNode = pmView.state.doc.nodeAt(pos);
  if (!currentNode) return;
  const start = pos + 1;
  const end = pos + currentNode.nodeSize - 1;
  updatingRef.current = true;
  try {
    const tr = pmView.state.tr;
    if (newText.length === 0) {
      tr.delete(start, end);
    } else {
      const textNode = pmView.state.schema.text(newText);
      tr.replaceWith(start, end, textNode);
    }
    pmView.dispatch(tr);   // ← no setSelection
  } ...
};
```

CB-v2 **does not sync selection at all** — neither the PM tutorial's TextSelection-inside-node pattern, nor the report's NodeSelection pattern. Also: no `selectNode` override, no `setSelection` override. PM's selection state whatever it was before CM got focus; it stays that way until the user does something that triggers a PM transaction that changes selection.

**This is Option 3 (split ownership) by omission.** Not necessarily by design — the report specifies §5.3 but the implementation didn't wire it.

---

## 5. CB-v2's current rawMdxFallback — full picture

Branch: `worktree-component-blocks-v2`
Files:

- `packages/app/src/editor/extensions/raw-mdx-fallback.ts` — TipTap extension that swaps in the React NodeView
- `packages/app/src/editor/extensions/RawMdxFallbackView.tsx` (aliased from RawMdxFallbackCMView) — React component that imperatively mounts CM
- `packages/core/src/extensions/raw-mdx-fallback.ts` — core schema (`atom: false, content: 'text*'`)

### 5.1 Key architectural properties (verified from source)

| Aspect                               | Value                                                                            | Source                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| NodeView mount                       | `ReactNodeViewRenderer` with `stopEvent: () => true, ignoreMutation: () => true` | raw-mdx-fallback.ts:15-23                                |
| Wrapper contentEditable              | `false`                                                                          | RawMdxFallbackCMView\.tsx:205                            |
| CM mount style                       | Imperative (ref'd `cmContainerRef`, `new CMEditorView` in useEffect) — NOT React | RawMdxFallbackCMView\.tsx:100-140                        |
| CM→PM sync                           | `forwardUpdate` fires from CM `updateListener`; guards via `updatingRef.current` | RawMdxFallbackCMView\.tsx:58-99                          |
| PM→CM sync                           | `useEffect([textContent])` runs `computeChange` + `cmView.dispatch`              | RawMdxFallbackCMView\.tsx:149-171                        |
| Selection sync (either direction)    | **None**                                                                         | absence; grep for `setSelection` in file returns nothing |
| `selectNode`/`deselectNode` override | **None**                                                                         | absence in React NodeView config                         |
| Undo/redo                            | Delegates via `editor.commands.undo()` / `redo()` — routed through PM history    | RawMdxFallbackCMView\.tsx:118-138                        |
| Boundary-escape (`maybeEscape`)      | **Not implemented** in CB-v2                                                     | absence; report's §6.2 not wired                         |
| markUserTyping forwarding            | Yes — `keydown/paste/drop/cut` on `cm.contentDOM`                                | RawMdxFallbackCMView\.tsx:145-156                        |

### 5.2 Observed gaps vs cm-in-pm report recommendations

| Report § | Recommendation                                                  | Implemented?                                  |
| -------- | --------------------------------------------------------------- | --------------------------------------------- |
| §5.1     | `selectNode() { this.cm.focus() }` on click-to-boundary         | ✗                                             |
| §5.2     | `maybeEscape` with `ArrowUp/Down/Left/Right` boundary detection | ✗                                             |
| §5.3     | NodeSelection-on-node while CM has focus                        | ✗                                             |
| §6.2     | Arrow keybindings delegated to maybeEscape                      | ✗                                             |
| §6.3     | Outer PM `arrowHandler` keymap for entry                        | ✗                                             |
| §9.4     | Click-to-edit lazy init                                         | ✗ (CM always mounts on NodeView construction) |

### 5.3 What this means for the selection-composition question

CB-v2 is **not** implementing Option 1 (transparent bubbling) — PM doesn't get a NodeSelection, and `selectNode`/`deselectNode` are absent. It's **not** implementing Option 2 (first-class nested-kind) — there's no shared UI-state that reads "nested-editor is active." It's **Option 3 (split ownership) by omission** — CM manages its browser focus, PM's state.selection is whatever the last PM transaction left it at, and no bridge exists at hard boundaries either (no `maybeEscape`, no `selectNode`).

The stakes for "which option" are therefore: **OK has a blank slate.** The current CB-v2 code is not a reference implementation of any of the three options — it's a working bridge for content sync with selection deliberately (or accidentally) decoupled.

---

## 6. Decision matrix

### 6.1 The three options recapped

1. **Transparent bubbling** — PM treats nested-CM focus as "the rawMdxFallback node is active." PM `state.selection` holds a `NodeSelection` on the node; nested CM selection is internal-only.
2. **First-class nested-kind** — `ActiveInteractable` gains `kind: 'nested-editor'` carrying the nested `EditorView` ref + its `EditorState.selection`. Shared UI state tracks it.
3. **Split ownership** — Outer PM state is unaware of nested selection. Bridge only at hard boundaries (boundary-escape, click-outside). CM manages its state standalone.

### 6.2 Cost / enables / forbids

|                                                                                  | Option 1 — Transparent bubbling                                                                                         | Option 2 — First-class nested-kind                                                                                                                                                  | Option 3 — Split ownership                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Mental model**                                                                 | "There is one editor; NodeViews are black-box nodes"                                                                    | "There are N editors organized hierarchically; one is currently active"                                                                                                             | "There are N editors, no shared notion of who is active"                         |
| **Prior-art match**                                                              | PM tutorial partially (via `selectNode`, but tutorial uses TextSelection-inside-node not NodeSelection)                 | Lexical (LexicalEditor.ts:823 `_parentEditor`, SELECTION\_CHANGE\_COMMAND bubbling, `$isEditorIsNestedEditor`)                                                                      | CB-v2 today by omission; no OSS reference                                        |
| **Outer toolbar/shortcut routing**                                               | Commands land on PM; PM forwards to NodeView or no-op                                                                   | Toolbar reads `activeInteractable.kind`, branches to appropriate editor (Lexical pattern `activeEditor.dispatchCommand(...)`)                                                       | Toolbar must query DOM for focus each time; no single source of truth            |
| **N-deep nested (JsxComponent inside JsxComponent)**                             | Works trivially — the innermost NodeView gets the NodeSelection, ancestors don't know                                   | Generalizes: `activeInteractable` always points to the deepest focused editor; UI code walks the chain via `_parentEditor` if needed                                                | Requires ad-hoc DOM walking every time; brittle                                  |
| **Awareness / presence cost**                                                    | Low — remote peer sees a single PM NodeSelection; "who's editing the code block" is implicit                            | Medium — need to broadcast nested-editor selection payload (similar to Lexical's sub-doc awareness); schema change to awareness state                                               | High — each nested editor must independently broadcast, consumers must correlate |
| **Cost to implement from here**                                                  | Low. Add `selectNode()` → focus CM + set NodeSelection. CB-v2 needs +50 LOC. Report §5.3 gives the target               | Medium. New `ActiveInteractable` union, event bus (like Lexical SELECTION\_CHANGE\_COMMAND), subscribers for toolbar/shortcuts. +300 LOC across app; schema additions to awareness. | Very low — already shipped in CB-v2                                              |
| **Enables: cursor-position-aware toolbar**                                       | ✗ (toolbar only knows "a code block is selected"; no access to CM caret)                                                | ✓ (toolbar reads `activeInteractable.inner.selection` for caret-context menus)                                                                                                      | ✓ but toolbar does DOM-walk every time                                           |
| **Enables: block-level chrome** (border highlight, etc.)                         | ✓ (NodeSelection drives `selected` attr on NodeView DOM via PM decorations)                                             | ✓                                                                                                                                                                                   | ✗ (must reverse-engineer from DOM focus)                                         |
| **Enables: cross-editor undo stack**                                             | Already done (PM history owns it per report §6.2)                                                                       | Already done                                                                                                                                                                        | Already done                                                                     |
| **Enables: keyboard escape (arrow to outer)**                                    | Requires `maybeEscape` regardless                                                                                       | Requires `maybeEscape` regardless                                                                                                                                                   | Requires `maybeEscape` regardless                                                |
| **Enables: arrow-entry from outer to inner**                                     | Via PM arrowHandler + NodeSelection → cm.focus                                                                          | Via activeInteractable transition event                                                                                                                                             | Via ad-hoc listener on click; keyboard-entry hard                                |
| **Enables: nested cursors in awareness**                                         | Hard — PM NodeSelection is coarse; no caret info for remote peer                                                        | Natural — `ActiveInteractable.inner.selection` broadcastable                                                                                                                        | Works per-CM, but aggregation is ad-hoc                                          |
| **Forbids: two nested CMs being "semi-active" simultaneously**                   | Browser focus already enforces one (report §5.4)                                                                        | Same                                                                                                                                                                                | Same                                                                             |
| **Forbids: outer PM having a TextSelection that crosses a nested node boundary** | Yes — NodeSelection is opaque; no selection spans into the node                                                         | No, unless enforced                                                                                                                                                                 | No, unless enforced                                                              |
| **Correctness risk: selection becomes wrong after PM transaction**               | Low — NodeSelection is a single node ref; stable under most edits                                                       | Medium — nested editor selection is an inner position; PM-level transaction may invalidate (node removed, replaced)                                                                 | Low                                                                              |
| **Correctness risk: PM tutorial divergence**                                     | Medium — report §5.3 says NodeSelection but tutorial uses TextSelection-inside-node; two different patterns both "work" | Low — Option 2 makes this irrelevant (source of truth moves to ActiveInteractable)                                                                                                  | —                                                                                |
| **Blast radius if changed later**                                                | Low. Local to NodeView class.                                                                                           | Medium. All ActiveInteractable consumers.                                                                                                                                           | Low.                                                                             |

### 6.3 Forward-compat to per-block-source-toggle

If every JsxComponent becomes a potential nested editor (CB-v2's NG direction):

- **Option 1** — Every JsxComponent NodeView implements `selectNode() { this.innerEditor.focus() }`. Toolbar sees a NodeSelection on any of them; shortcuts route to the wrapped editor. **Scales if the outer editor's behavior is uniform across JsxComponent kinds** — which may not be true (a Tabs block's "active interactable" is different from a CodeBlock's).
- **Option 2** — Each nested-editor kind (CM, perhaps a future Monaco for TSX, perhaps an inline-rich-editor for captions) emits a typed variant. Tool/shortcut consumers pattern-match on kind. **The Lexical toolbar's `isImageCaption` branch is exactly this pattern, at page-root level** (ToolbarPlugin/index.tsx:645).
- **Option 3** — Per-JsxComponent selection is fully local; no shared state. Works, but every toolbar/shortcut/presence-consumer must independently discover which editor has focus. Composability cost grows with kinds.

### 6.4 Nested-in-nested (JsxComponent containing another JsxComponent with source-toggle)

- **Option 1** — PM NodeSelection is always the **outermost selected node**, opaque to children. If inner JsxComponent is source-toggled, the outer is ALSO selected from PM's POV. Confusing.
- **Option 2** — `ActiveInteractable` points to the **deepest** active editor, matching Lexical (`activeEditor` is always the leaf). Parent chain walkable via `editor._parentEditor`. Cleanest.
- **Option 3** — Each level of CM does its own thing. No "deepest" concept.

---

## Sources

### Primary (anchored against)

- **cm-in-pm-nested-editor-architecture REPORT** — `reports/cm-in-pm-nested-editor-architecture/REPORT.md:582-611` (§5 Selection + Focus Contract), `:962-984` (§13 What was NOT investigated)

### CB-v2 code

- `worktree-component-blocks-v2:packages/app/src/editor/extensions/raw-mdx-fallback.ts:14-24` (NodeView swap)
- `worktree-component-blocks-v2:packages/app/src/editor/extensions/RawMdxFallbackCMView.tsx:58-99` (forwardUpdate — no setSelection)
- `worktree-component-blocks-v2:packages/app/src/editor/extensions/RawMdxFallbackCMView.tsx:100-171` (CM mount + PM→CM sync)

### Lexical

- `oss-repos/lexical/packages/lexical/src/LexicalEditor.ts:823, :893` (\_parentEditor)
- `oss-repos/lexical/packages/lexical-utils/src/index.ts:745` ($isEditorIsNestedEditor predicate)
- `oss-repos/lexical/packages/lexical-react/src/LexicalNestedComposer.tsx:118` (parent link established)
- `oss-repos/lexical/packages/lexical-playground/src/Editor.tsx:137` (activeEditor as React state)
- `oss-repos/lexical/packages/lexical-playground/src/plugins/ToolbarPlugin/index.tsx:645, :785-794` (active-editor routing pattern)
- `oss-repos/lexical/packages/lexical-yjs/src/Utils.ts:327-338` (sub-doc-per-nested-editor awareness)
- `oss-repos/lexical/packages/lexical-react/src/useLexicalNodeSelection.ts:57-114` (per-key isSelected hook — alternative to activeEditor pattern)

### Blocksuite (demonstrative, not directly applicable)

- `oss-repos/blocksuite/packages/framework/store/src/extension/selection/selection-extension.ts:17` (single flat selections array)
- `oss-repos/blocksuite/packages/framework/store/src/extension/selection/base.ts:9-29` (BaseSelection discriminator)
- `oss-repos/blocksuite/packages/framework/std/src/selection/text.ts:34-115` (TextSelection variant)
- `oss-repos/blocksuite/packages/affine/blocks/code/src/code-block.ts:1-70` (code-block uses inline editor, not nested editor)

### ProseMirror

- `node_modules/prosemirror-view/dist/index.js:5618-5638` (hasFocus returns activeElement === view\.dom)
- `node_modules/prosemirror-view/dist/index.d.ts:314-339` (NodeView selectNode/deselectNode/setSelection/stopEvent/ignoreMutation surface)
- prosemirror.net/examples/codemirror/ (tutorial's `forwardUpdate` sets TextSelection inside node — divergent from report §5.3)

### Cross-reference (nested-selection UX)

- `worktree-component-blocks-v2:reports/block-selection-indicator-patterns/evidence/nested-and-multi-selection.md` — Gutenberg's `has-child-selected` class propagation, Lexical's $isRangeSelection vs $isNodeSelection split, "innermost wins for visible chrome"

# Nested-Editor Selection Composition Research

**Scope:** When a nested CodeMirror editor inside a ProseMirror NodeView has focus / active selection, what does the outer editor's "active interactable" state say? Surface tradeoffs across three architectural options.

**Date:** 2026-04-21
**Consumer:** OK ActiveInteractable union design for CB-v2 per-block source-toggle

---

## TL;DR

Our own cm-in-pm report answers the **focus-ownership** question cleanly (§5.3 — HIGH confidence: exactly one editor holds focus; PM should present a NodeSelection when CM has focus) but is **silent on the UI-state-model question** (whether OK's `ActiveInteractable` should have a `kind: 'nested-editor'` variant, what that carries, and how it generalizes to N-deep nesting).

The report's §5.3 recommendation ("PM's selection should be a NodeSelection of the rawMdxFallback node") **diverges from the canonical PM tutorial pattern**, which actually sets a **TextSelection with positions *inside* the node** via `forwardUpdate` + `setSelection` NodeView method. CB-v2's current implementation does neither — PM selection stays stale while CM has focus (verified via `RawMdxFallbackView.tsx`).

Two production reference points:

- **Lexical** has first-class nested editors with `_parentEditor` refs (LexicalEditor.ts:823) and a pub/sub `SELECTION_CHANGE_COMMAND` that bubbles the active nested editor up to any subscriber — the toolbar tracks `activeEditor` as React state (Editor.tsx:137). N-deep generalizes naturally.
- **Blocksuite** rejects the premise — there is no nested editor. Every block holds an inline editor, coordinated by a single `StoreSelectionExtension` with a typed `BaseSelection` array (block / text / cursor / surface variants). Not applicable as reference — OK's CM-in-PM hybrid has no counterpart in their model.

---

## 1. Report synthesis

### 1.1 What cm-in-pm answers

| Question                                        | Report answer                                                                     | Confidence     | Source                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | -------------- | ---------------------------------- |
| Can nested CM reuse y-codemirror.next?          | **No** — direct PM dispatch pattern                                               | HIGH           | §8.3                               |
| Who owns the CRDT layer for nested-CM content?  | **y-prosemirror**, CM is view-only facade                                         | HIGH           | §1, §8.3                           |
| How does CM → PM sync work?                     | `forwardUpdate` dispatches PM transactions, `updating` flag prevents loops        | HIGH           | §3.1 (forwardUpdate), §4.1 (trace) |
| When CM has focus, what about PM focus?         | "Exactly one editor holds focus at any time"                                      | HIGH           | §5.3                               |
| What is PM's selection state when CM has focus? | "Should be a `NodeSelection` of the rawMdxFallback node"                          | HIGH (claimed) | §5.3                               |
| How does `selectNode()` fire?                   | "When node is selected (e.g., via mouse click on the node boundary)" — cm.focus() | HIGH           | §5.1                               |
| How to escape back to PM?                       | `maybeEscape('line'\|'char', -1\|1)` boundary-arrow keybindings                   | HIGH           | §5.2, §6.2                         |
| Multi-instance focus coordination?              | "Only one CM can have focus. Browser focus semantics enforce this"                | HIGH           | §5.4                               |

### 1.2 What cm-in-pm does NOT answer

The report is **scoped to the bridge mechanics**, not the app-level UI state model. It does not address:

- Whether there should be a first-class UI-state primitive (OK's `ActiveInteractable`) that carries `kind: 'nested-editor'`, `editorRef`, `innerSelection`
- How awareness/presence should expose a nested selection to remote peers (§13.1 explicitly lists "Per-block collaborative cursors" as **NOT investigated**, "Low value for rawMdxFallback (degraded state)")
- N-deep nesting (nested-in-nested): every example is one-deep raw-MDX-inside-PM
- How per-block-source-toggle (making EVERY JsxComponent potentially a nested editor) changes the calculus. Report's §14 forward-compat claim ("createNestedCMExtensions factory pattern") covers extension composition only, not selection state
- How an outer PM-level toolbar decides "am I talking to the outer editor or the nested one?" — the Lexical `$isEditorIsNestedEditor` question

### 1.3 Critical caveat — §5.3 is prescriptive, not descriptive

The claim "When CM has focus, PM's selection **should be** a `NodeSelection` of the rawMdxFallback node" is a **design recommendation**, not observed runtime behavior. The PM tutorial (which the report cites at §5.3) actually uses a **TextSelection with positions inside the nested node** via `forwardUpdate`:

> `tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo))` where `selFrom = offset + main.from` (prosemirror.net/examples/codemirror/)

This is a material divergence. CB-v2's current code (below) does neither — it runs "Option 3 (split ownership)" whether it meant to or not.

---

## 2. Lexical's nested-editor selection model

Lexical has **first-class nested editor support** with parent/child editor refs and a command-based selection-change notification.

### 2.1 Parent pointer

```
packages/lexical/src/LexicalEditor.ts:823
  _parentEditor: null | LexicalEditor;

packages/lexical/src/LexicalEditor.ts:893
  this._parentEditor = parentEditor;
```

Every editor carries a ref to its parent. `null` for root. Used to propagate config (theme, nodes) on construction.

### 2.2 "Is this a nested editor" predicate

```
packages/lexical-utils/src/index.ts:745
  export function $isEditorIsNestedEditor(editor: LexicalEditor): boolean {
    return editor._parentEditor !== null;
  }
```

One-liner. No fancy tracking — `parentEditor != null` ≡ nested.

### 2.3 Active-editor tracking — pub/sub via SELECTION_CHANGE_COMMAND

```
packages/lexical-playground/src/Editor.tsx:137
  const [activeEditor, setActiveEditor] = useState(editor);

packages/lexical-playground/src/plugins/ToolbarPlugin/index.tsx:785
  editor.registerCommand(
    SELECTION_CHANGE_COMMAND,
    (_payload, newEditor) => {
      setActiveEditor(newEditor);   // ← update React state
      $updateToolbar();
      return false;
    },
    COMMAND_PRIORITY_CRITICAL,
  );
```

The ROOT editor receives `SELECTION_CHANGE_COMMAND` events tagged with whichever editor (root or nested) owns the new selection. Toolbar subscribes on the root, tracks `activeEditor` as component state. A separate effect on `activeEditor` reads the toolbar state from whichever editor is live:

```
ToolbarPlugin/index.tsx:797
  activeEditor.getEditorState().read(
    () => $updateToolbar(),
    {editor: activeEditor},
  );
```

### 2.4 Nested-editor-aware toolbar logic

```
ToolbarPlugin/index.tsx:645
  if (activeEditor !== editor && $isEditorIsNestedEditor(activeEditor)) {
    const rootElement = activeEditor.getRootElement();
    updateToolbarState(
      'isImageCaption',
      !!rootElement?.parentElement?.classList.contains('image-caption-container'),
    );
  }
```

Note the pattern: the toolbar **branches behavior** based on whether `activeEditor` is nested (and which kind, via DOM ancestor check). This is a clean mapping to OK's proposed `ActiveInteractable { kind: 'nested-editor' }` — the kind variant encodes "the thing the toolbar/command palette/shortcut should route to is NOT the outer editor."

### 2.5 Awareness / collaboration — sub-document model

Lexical nested editors that participate in CRDT collaboration get their **own Y.Doc** (sub-document pattern):

```
packages/lexical-yjs/src/Utils.ts:333
  const nestedEditor = createEditor();
  ...
  nestedEditor._key = key;
  yjsDocMap.set(key, nextValue);
```

Each nested editor has a distinct `Y.Doc` in the binding's `docMap`. Awareness at the top level naturally describes which sub-doc the remote cursor is in. **OK's architecture is different** — CB-v2 uses ONE `Y.Doc` with nested content as `Y.XmlText` inside the parent `Y.XmlFragment`. No sub-doc boundary for awareness to key off.

### 2.6 Generalizes to N-deep

`_parentEditor` is a single pointer, not a depth counter, but chaining walks the hierarchy: `editor._parentEditor?._parentEditor?...`. `SELECTION_CHANGE_COMMAND` bubbles through the root editor regardless of depth. The toolbar-sees-active-editor pattern works at any nesting depth with no code change.

---

## 3. Blocksuite's nested-editor selection model

**Blocksuite does not have nested editors in the OK/Lexical sense.** Code blocks use an `InlineEditor` (custom, Shiki-highlighted) — one of many inline editors, each paired with a block, all coordinated by one top-level selection manager.

### 3.1 Selection as a typed, flat array

```
packages/framework/store/src/extension/selection/selection-extension.ts:17
  private readonly _selections = signal<BaseSelection[]>([]);

packages/framework/store/src/extension/selection/base.ts:9
  export abstract class BaseSelection {
    static readonly group: string;  // e.g. 'note', 'gfx'
    static readonly type: string;   // 'text' | 'block' | 'cursor' | 'surface'
    readonly blockId: string;
    ...
  }
```

Selections are persisted as a `BaseSelection[]` on a signal, each subtype carries `blockId` and a `type` discriminator. Variants in `packages/framework/std/src/selection/`:

- `TextSelection` — per-block text caret/range (text.ts:34)
- `BlockSelection` — block-level selection (block.ts)
- `CursorSelection` — cross-block cursor
- `SurfaceElementSelection` — edgeless/canvas elements (gfx/selection.ts)

### 3.2 Why Blocksuite isn't comparable

The `InlineEditor` is **not a separate editor with its own selection subsystem**. It's a lightweight rich-text widget that *reports into* the shared selection manager via `TextSelection { blockId, from, to }`. There is no concept of "which editor is active" because there's only one selection manager — the focused block's inline editor is simply whichever `TextSelection.blockId` is current.

This is a tempting architectural endpoint for OK ("flatten nested CM into inline-editor-per-block") but would require decomposing PM's fragment-based selection model, which is a much larger rewrite than the question at hand.

### 3.3 What Blocksuite contributes to the decision

- **Evidence that kind-polymorphic selection** (text/block/cursor/surface) is a proven pattern for a multi-surface editor — BaseSelection subclasses with a `type` discriminator
- **Remote selection broadcasting** works the same way regardless of subtype (selection-extension.ts:66-94) — the map is `Map<clientID, BaseSelection[]>`, awareness doesn't care whether the remote peer's selection is in a code block or a paragraph

---

## 4. PM-level selection semantics during nested focus

### 4.1 `EditorView.hasFocus()` returns false when nested CM has focus

```
node_modules/prosemirror-view/dist/index.js:5618
  hasFocus() {
    ...
    return this.root.activeElement == this.dom;
  }
```

The non-IE branch is strict: `activeElement === view.dom`. When focus is inside a nested CM's `contentDOM`, `view.dom` is an **ancestor** of `activeElement`, not equal. `hasFocus()` returns false.

The IE branch walks up from `activeElement`, but short-circuits to `false` on any `contentEditable="false"` ancestor. Since CB-v2's NodeViewWrapper is `contentEditable={false}`, this also returns false.

**Consequence:** PM's focus-awareness is blind to nested-CM focus. The PM selection is "stale" — whatever it was before the click.

### 4.2 PM NodeView selection hooks

```
node_modules/prosemirror-view/dist/index.d.ts:314-327
  selectNode?: () => void;
  deselectNode?: () => void;
  setSelection?: (anchor: number, head: number, root: Document | ShadowRoot) => void;
```

- `selectNode()` — fires when PM dispatches a `NodeSelection` wrapping the node. Report's pattern: `selectNode() { this.cm.focus() }`.
- `setSelection()` — fires when PM attempts to place a `TextSelection` inside the node (e.g., `Selection.near()` lands inside). Report doesn't override this, but the PM tutorial does: places cursor in CM at the mapped anchor/head.
- `deselectNode()` — fires when PM selection moves off the node. Report says "No-op; CM keeps its visual state" (§3.1).

### 4.3 The canonical PM tutorial sets a TextSelection INSIDE the node

```js
// from prosemirror.net/examples/codemirror/
forwardUpdate(update) {
  ...
  let offset = this.getPos() + 1
  let {main} = update.state.selection
  let selFrom = offset + main.from
  let selTo = offset + main.to
  let pmSel = TextSelection.create(tr.doc, selFrom, selTo)
  this.view.dispatch(tr.setSelection(pmSel))
}
```

This is **not a NodeSelection on the outer node** — it's a TextSelection with from/to **inside** the node. The outer PM's selection "moves with" the CM cursor. The cm-in-pm report §5.3 says the opposite (NodeSelection on the node).

### 4.4 CB-v2 today does NEITHER

From `packages/app/src/editor/extensions/RawMdxFallbackCMView.tsx` (branch `worktree-component-blocks-v2`):

```js
const forwardUpdate = (newText: string) => {
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  if (pos === undefined) return;
  const pmView = editor.view;
  if (!pmView) return;
  const currentNode = pmView.state.doc.nodeAt(pos);
  if (!currentNode) return;
  const start = pos + 1;
  const end = pos + currentNode.nodeSize - 1;
  updatingRef.current = true;
  try {
    const tr = pmView.state.tr;
    if (newText.length === 0) {
      tr.delete(start, end);
    } else {
      const textNode = pmView.state.schema.text(newText);
      tr.replaceWith(start, end, textNode);
    }
    pmView.dispatch(tr);   // ← no setSelection
  } ...
};
```

CB-v2 **does not sync selection at all** — neither the PM tutorial's TextSelection-inside-node pattern, nor the report's NodeSelection pattern. Also: no `selectNode` override, no `setSelection` override. PM's selection state whatever it was before CM got focus; it stays that way until the user does something that triggers a PM transaction that changes selection.

**This is Option 3 (split ownership) by omission.** Not necessarily by design — the report specifies §5.3 but the implementation didn't wire it.

---

## 5. CB-v2's current rawMdxFallback — full picture

Branch: `worktree-component-blocks-v2`
Files:

- `packages/app/src/editor/extensions/raw-mdx-fallback.ts` — TipTap extension that swaps in the React NodeView
- `packages/app/src/editor/extensions/RawMdxFallbackView.tsx` (aliased from RawMdxFallbackCMView) — React component that imperatively mounts CM
- `packages/core/src/extensions/raw-mdx-fallback.ts` — core schema (`atom: false, content: 'text*'`)

### 5.1 Key architectural properties (verified from source)

| Aspect                               | Value                                                                            | Source                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| NodeView mount                       | `ReactNodeViewRenderer` with `stopEvent: () => true, ignoreMutation: () => true` | raw-mdx-fallback.ts:15-23                                |
| Wrapper contentEditable              | `false`                                                                          | RawMdxFallbackCMView\.tsx:205                            |
| CM mount style                       | Imperative (ref'd `cmContainerRef`, `new CMEditorView` in useEffect) — NOT React | RawMdxFallbackCMView\.tsx:100-140                        |
| CM→PM sync                           | `forwardUpdate` fires from CM `updateListener`; guards via `updatingRef.current` | RawMdxFallbackCMView\.tsx:58-99                          |
| PM→CM sync                           | `useEffect([textContent])` runs `computeChange` + `cmView.dispatch`              | RawMdxFallbackCMView\.tsx:149-171                        |
| Selection sync (either direction)    | **None**                                                                         | absence; grep for `setSelection` in file returns nothing |
| `selectNode`/`deselectNode` override | **None**                                                                         | absence in React NodeView config                         |
| Undo/redo                            | Delegates via `editor.commands.undo()` / `redo()` — routed through PM history    | RawMdxFallbackCMView\.tsx:118-138                        |
| Boundary-escape (`maybeEscape`)      | **Not implemented** in CB-v2                                                     | absence; report's §6.2 not wired                         |
| markUserTyping forwarding            | Yes — `keydown/paste/drop/cut` on `cm.contentDOM`                                | RawMdxFallbackCMView\.tsx:145-156                        |

### 5.2 Observed gaps vs cm-in-pm report recommendations

| Report § | Recommendation                                                  | Implemented?                                  |
| -------- | --------------------------------------------------------------- | --------------------------------------------- |
| §5.1     | `selectNode() { this.cm.focus() }` on click-to-boundary         | ✗                                             |
| §5.2     | `maybeEscape` with `ArrowUp/Down/Left/Right` boundary detection | ✗                                             |
| §5.3     | NodeSelection-on-node while CM has focus                        | ✗                                             |
| §6.2     | Arrow keybindings delegated to maybeEscape                      | ✗                                             |
| §6.3     | Outer PM `arrowHandler` keymap for entry                        | ✗                                             |
| §9.4     | Click-to-edit lazy init                                         | ✗ (CM always mounts on NodeView construction) |

### 5.3 What this means for the selection-composition question

CB-v2 is **not** implementing Option 1 (transparent bubbling) — PM doesn't get a NodeSelection, and `selectNode`/`deselectNode` are absent. It's **not** implementing Option 2 (first-class nested-kind) — there's no shared UI-state that reads "nested-editor is active." It's **Option 3 (split ownership) by omission** — CM manages its browser focus, PM's state.selection is whatever the last PM transaction left it at, and no bridge exists at hard boundaries either (no `maybeEscape`, no `selectNode`).

The stakes for "which option" are therefore: **OK has a blank slate.** The current CB-v2 code is not a reference implementation of any of the three options — it's a working bridge for content sync with selection deliberately (or accidentally) decoupled.

---

## 6. Decision matrix

### 6.1 The three options recapped

1. **Transparent bubbling** — PM treats nested-CM focus as "the rawMdxFallback node is active." PM `state.selection` holds a `NodeSelection` on the node; nested CM selection is internal-only.
2. **First-class nested-kind** — `ActiveInteractable` gains `kind: 'nested-editor'` carrying the nested `EditorView` ref + its `EditorState.selection`. Shared UI state tracks it.
3. **Split ownership** — Outer PM state is unaware of nested selection. Bridge only at hard boundaries (boundary-escape, click-outside). CM manages its state standalone.

### 6.2 Cost / enables / forbids

|                                                                                  | Option 1 — Transparent bubbling                                                                                         | Option 2 — First-class nested-kind                                                                                                                                                  | Option 3 — Split ownership                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Mental model**                                                                 | "There is one editor; NodeViews are black-box nodes"                                                                    | "There are N editors organized hierarchically; one is currently active"                                                                                                             | "There are N editors, no shared notion of who is active"                         |
| **Prior-art match**                                                              | PM tutorial partially (via `selectNode`, but tutorial uses TextSelection-inside-node not NodeSelection)                 | Lexical (LexicalEditor.ts:823 `_parentEditor`, SELECTION\_CHANGE\_COMMAND bubbling, `$isEditorIsNestedEditor`)                                                                      | CB-v2 today by omission; no OSS reference                                        |
| **Outer toolbar/shortcut routing**                                               | Commands land on PM; PM forwards to NodeView or no-op                                                                   | Toolbar reads `activeInteractable.kind`, branches to appropriate editor (Lexical pattern `activeEditor.dispatchCommand(...)`)                                                       | Toolbar must query DOM for focus each time; no single source of truth            |
| **N-deep nested (JsxComponent inside JsxComponent)**                             | Works trivially — the innermost NodeView gets the NodeSelection, ancestors don't know                                   | Generalizes: `activeInteractable` always points to the deepest focused editor; UI code walks the chain via `_parentEditor` if needed                                                | Requires ad-hoc DOM walking every time; brittle                                  |
| **Awareness / presence cost**                                                    | Low — remote peer sees a single PM NodeSelection; "who's editing the code block" is implicit                            | Medium — need to broadcast nested-editor selection payload (similar to Lexical's sub-doc awareness); schema change to awareness state                                               | High — each nested editor must independently broadcast, consumers must correlate |
| **Cost to implement from here**                                                  | Low. Add `selectNode()` → focus CM + set NodeSelection. CB-v2 needs +50 LOC. Report §5.3 gives the target               | Medium. New `ActiveInteractable` union, event bus (like Lexical SELECTION\_CHANGE\_COMMAND), subscribers for toolbar/shortcuts. +300 LOC across app; schema additions to awareness. | Very low — already shipped in CB-v2                                              |
| **Enables: cursor-position-aware toolbar**                                       | ✗ (toolbar only knows "a code block is selected"; no access to CM caret)                                                | ✓ (toolbar reads `activeInteractable.inner.selection` for caret-context menus)                                                                                                      | ✓ but toolbar does DOM-walk every time                                           |
| **Enables: block-level chrome** (border highlight, etc.)                         | ✓ (NodeSelection drives `selected` attr on NodeView DOM via PM decorations)                                             | ✓                                                                                                                                                                                   | ✗ (must reverse-engineer from DOM focus)                                         |
| **Enables: cross-editor undo stack**                                             | Already done (PM history owns it per report §6.2)                                                                       | Already done                                                                                                                                                                        | Already done                                                                     |
| **Enables: keyboard escape (arrow to outer)**                                    | Requires `maybeEscape` regardless                                                                                       | Requires `maybeEscape` regardless                                                                                                                                                   | Requires `maybeEscape` regardless                                                |
| **Enables: arrow-entry from outer to inner**                                     | Via PM arrowHandler + NodeSelection → cm.focus                                                                          | Via activeInteractable transition event                                                                                                                                             | Via ad-hoc listener on click; keyboard-entry hard                                |
| **Enables: nested cursors in awareness**                                         | Hard — PM NodeSelection is coarse; no caret info for remote peer                                                        | Natural — `ActiveInteractable.inner.selection` broadcastable                                                                                                                        | Works per-CM, but aggregation is ad-hoc                                          |
| **Forbids: two nested CMs being "semi-active" simultaneously**                   | Browser focus already enforces one (report §5.4)                                                                        | Same                                                                                                                                                                                | Same                                                                             |
| **Forbids: outer PM having a TextSelection that crosses a nested node boundary** | Yes — NodeSelection is opaque; no selection spans into the node                                                         | No, unless enforced                                                                                                                                                                 | No, unless enforced                                                              |
| **Correctness risk: selection becomes wrong after PM transaction**               | Low — NodeSelection is a single node ref; stable under most edits                                                       | Medium — nested editor selection is an inner position; PM-level transaction may invalidate (node removed, replaced)                                                                 | Low                                                                              |
| **Correctness risk: PM tutorial divergence**                                     | Medium — report §5.3 says NodeSelection but tutorial uses TextSelection-inside-node; two different patterns both "work" | Low — Option 2 makes this irrelevant (source of truth moves to ActiveInteractable)                                                                                                  | —                                                                                |
| **Blast radius if changed later**                                                | Low. Local to NodeView class.                                                                                           | Medium. All ActiveInteractable consumers.                                                                                                                                           | Low.                                                                             |

### 6.3 Forward-compat to per-block-source-toggle

If every JsxComponent becomes a potential nested editor (CB-v2's NG direction):

- **Option 1** — Every JsxComponent NodeView implements `selectNode() { this.innerEditor.focus() }`. Toolbar sees a NodeSelection on any of them; shortcuts route to the wrapped editor. **Scales if the outer editor's behavior is uniform across JsxComponent kinds** — which may not be true (a Tabs block's "active interactable" is different from a CodeBlock's).
- **Option 2** — Each nested-editor kind (CM, perhaps a future Monaco for TSX, perhaps an inline-rich-editor for captions) emits a typed variant. Tool/shortcut consumers pattern-match on kind. **The Lexical toolbar's `isImageCaption` branch is exactly this pattern, at page-root level** (ToolbarPlugin/index.tsx:645).
- **Option 3** — Per-JsxComponent selection is fully local; no shared state. Works, but every toolbar/shortcut/presence-consumer must independently discover which editor has focus. Composability cost grows with kinds.

### 6.4 Nested-in-nested (JsxComponent containing another JsxComponent with source-toggle)

- **Option 1** — PM NodeSelection is always the **outermost selected node**, opaque to children. If inner JsxComponent is source-toggled, the outer is ALSO selected from PM's POV. Confusing.
- **Option 2** — `ActiveInteractable` points to the **deepest** active editor, matching Lexical (`activeEditor` is always the leaf). Parent chain walkable via `editor._parentEditor`. Cleanest.
- **Option 3** — Each level of CM does its own thing. No "deepest" concept.

---

## Sources

### Primary (anchored against)

- **cm-in-pm-nested-editor-architecture REPORT** — `reports/cm-in-pm-nested-editor-architecture/REPORT.md:582-611` (§5 Selection + Focus Contract), `:962-984` (§13 What was NOT investigated)

### CB-v2 code

- `worktree-component-blocks-v2:packages/app/src/editor/extensions/raw-mdx-fallback.ts:14-24` (NodeView swap)
- `worktree-component-blocks-v2:packages/app/src/editor/extensions/RawMdxFallbackCMView.tsx:58-99` (forwardUpdate — no setSelection)
- `worktree-component-blocks-v2:packages/app/src/editor/extensions/RawMdxFallbackCMView.tsx:100-171` (CM mount + PM→CM sync)

### Lexical

- `oss-repos/lexical/packages/lexical/src/LexicalEditor.ts:823, :893` (\_parentEditor)
- `oss-repos/lexical/packages/lexical-utils/src/index.ts:745` ($isEditorIsNestedEditor predicate)
- `oss-repos/lexical/packages/lexical-react/src/LexicalNestedComposer.tsx:118` (parent link established)
- `oss-repos/lexical/packages/lexical-playground/src/Editor.tsx:137` (activeEditor as React state)
- `oss-repos/lexical/packages/lexical-playground/src/plugins/ToolbarPlugin/index.tsx:645, :785-794` (active-editor routing pattern)
- `oss-repos/lexical/packages/lexical-yjs/src/Utils.ts:327-338` (sub-doc-per-nested-editor awareness)
- `oss-repos/lexical/packages/lexical-react/src/useLexicalNodeSelection.ts:57-114` (per-key isSelected hook — alternative to activeEditor pattern)

### Blocksuite (demonstrative, not directly applicable)

- `oss-repos/blocksuite/packages/framework/store/src/extension/selection/selection-extension.ts:17` (single flat selections array)
- `oss-repos/blocksuite/packages/framework/store/src/extension/selection/base.ts:9-29` (BaseSelection discriminator)
- `oss-repos/blocksuite/packages/framework/std/src/selection/text.ts:34-115` (TextSelection variant)
- `oss-repos/blocksuite/packages/affine/blocks/code/src/code-block.ts:1-70` (code-block uses inline editor, not nested editor)

### ProseMirror

- `node_modules/prosemirror-view/dist/index.js:5618-5638` (hasFocus returns activeElement === view\.dom)
- `node_modules/prosemirror-view/dist/index.d.ts:314-339` (NodeView selectNode/deselectNode/setSelection/stopEvent/ignoreMutation surface)
- prosemirror.net/examples/codemirror/ (tutorial's `forwardUpdate` sets TextSelection inside node — divergent from report §5.3)

### Cross-reference (nested-selection UX)

- `worktree-component-blocks-v2:reports/block-selection-indicator-patterns/evidence/nested-and-multi-selection.md` — Gutenberg's `has-child-selected` class propagation, Lexical's $isRangeSelection vs $isNodeSelection split, "innermost wins for visible chrome"
