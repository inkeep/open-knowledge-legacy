# Evidence: Prior Art Survey — CM6 in PM NodeView

**Dimension:** D10 — External prior art survey
**Date:** 2026-04-14
**Sources:** ProseMirror examples, MDXEditor, BlockNote, Tiptap CodeBlock, Remirror, community repos

---

## Key references examined

- https://prosemirror.net/examples/codemirror/ — Official ProseMirror tutorial (CodeMirror 6)
- https://gist.github.com/marijnh/e8cfc8b427c97f4a69f324a1bc709819 — Marijn Haverbeke's gist
- https://github.com/mdx-editor/editor — MDXEditor (uses Lexical, NOT ProseMirror)
- https://github.com/TypeCellOS/BlockNote — BlockNote (uses Shiki for code highlighting, not CM)
- https://github.com/sibiraj-s/prosemirror-codemirror-6 — Community demo
- https://github.com/mdx-editor/editor/discussions/328 — MDXEditor CM extension discussion
- https://codesandbox.io/s/tiptapcodemirror-0jiqt — TipTap+CM CodeSandbox

---

## Findings

### Finding: ProseMirror official tutorial is THE reference pattern
**Confidence:** CONFIRMED
**Evidence:** https://prosemirror.net/examples/codemirror/

The official ProseMirror tutorial establishes the canonical `CodeBlockView` pattern:

```javascript
class CodeBlockView {
  constructor(node, view, getPos) {
    this.node = node
    this.view = view
    this.getPos = getPos
    this.updating = false  // loop prevention flag

    this.cm = new CodeMirror({
      doc: this.node.textContent,
      extensions: [
        cmKeymap.of([...this.codeMirrorKeymap(), ...defaultKeymap]),
        drawSelection(),
        syntaxHighlighting(defaultHighlightStyle),
        javascript(),
        CodeMirror.updateListener.of(update => this.forwardUpdate(update))
      ]
    })
    this.dom = this.cm.dom
  }
}
```

Key sync pattern:
- **CM → PM:** `forwardUpdate(update)` dispatches PM transactions via `tr.replaceWith()` / `tr.delete()`, with offset calculation (`this.getPos() + 1`)
- **PM → CM:** `update(node)` method diffs old vs new text content, applies minimal `cm.dispatch({changes: ...})` 
- **Loop prevention:** `this.updating` boolean flag — set true during programmatic updates, checked in `forwardUpdate`
- **Undo/redo:** CM keymap forwards to PM's `undo()` / `redo()` — unified history in PM
- **Boundary escape:** `maybeEscape(unit, dir)` checks cursor position at edges, transfers focus via `view.dispatch(tr.setSelection(...))` + `view.focus()`

**Implications:** This pattern is directly applicable to rawMdxFallback. The key difference: rawMdxFallback uses `content: 'text*'` (plain text children), whereas the tutorial uses `code_block` with `content: 'text*'` — structurally identical.

### Finding: MDXEditor uses Lexical, NOT ProseMirror
**Confidence:** CONFIRMED
**Evidence:** https://github.com/mdx-editor/editor — `CodeBlockNode extends DecoratorNode` (Lexical)

MDXEditor's code block implementation is based on Lexical, not ProseMirror. Their descriptor-based pattern (CodeBlockEditorDescriptor) is architecturally interesting but NOT directly applicable to our PM-based stack. The `decorate()` method returns a React component:

```typescript
decorate() {
  return <CodeBlockEditorContainer parentEditor={editor} code={this.getCode()} ... />
}
```

**Implications:** MDXEditor's descriptor dispatch pattern is similar to our Component Blocks v2 registry (§9.2), but their CM integration is at the Lexical level, not PM NodeView level. Limited direct reuse.

### Finding: BlockNote uses Shiki for code highlighting, NOT CodeMirror
**Confidence:** CONFIRMED
**Evidence:** https://github.com/TypeCellOS/BlockNote — `useCreateBlockNote({ codeBlock: { ... shiki: ... } })`

BlockNote uses [Shiki](https://shiki.matsu.io/) for syntax highlighting in code blocks, not CodeMirror. Their code blocks are rendered with static highlighting, not interactive editing via CM. Not applicable to our use case.

### Finding: Tiptap extension-code-block uses Lowlight (static highlighting)
**Confidence:** CONFIRMED
**Evidence:** npm @tiptap/extension-code-block-lowlight

Tiptap's code block extension uses [Lowlight](https://github.com/wooorm/lowlight) for syntax highlighting — a static AST-based highlighter. It does NOT embed CodeMirror. The NodeView lifecycle pattern (mount/unmount, `addNodeView()`) is relevant but the editing model is standard PM text editing with decoration overlays, not a nested CM instance.

### Finding: prosemirror-codemirror-6 community demo exists but is minimal
**Confidence:** CONFIRMED  
**Evidence:** https://github.com/sibiraj-s/prosemirror-codemirror-6

A working demo exists based on the ProseMirror tutorial pattern. TypeScript, vanilla (no React), minimal documentation. Useful as validation that the pattern works with CM6 but doesn't add architectural insight beyond the tutorial.

---

## Negative searches (for NOT FOUND)

- **@handlewithcare/prosemirror-codemirror-block:** Searched npm registry — no such package exists.
- **@remirror/extension-codemirror:** Package existed in older Remirror versions but was deprecated. Current Remirror uses `@remirror/extension-code-block` with Lowlight (not CM).
- **Production nested CM-in-PM with CRDT:** No existing implementation combines y-prosemirror's CRDT binding with nested CodeMirror instances. This is novel territory.

---

## Gaps / follow-ups

- No production React+TipTap+CM6 nested editor pattern found. Our implementation will be novel.
- The ProseMirror tutorial pattern is pre-React — adapting to React NodeView (`ReactNodeViewRenderer`) requires lifecycle management via `useEffect`.
- y-codemirror.next + y-prosemirror interaction in nested context is untested territory.
