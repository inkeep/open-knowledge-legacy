# Evidence: @codemirror/merge mergeControls Fitness for Non-Dev Conflict Resolution

**Dimension:** D3 extension — Merge Control UI Fitness
**Date:** 2026-04-15
**Sources:** @codemirror/merge v6.12.1 source (locally installed, `node_modules/@codemirror/merge/dist/index.js`), Monaco Editor docs, react-diff-view, react-diff-viewer-continued, Mergely docs, diffview.nvim README, GitKraken docs, Sublime Merge docs, VS Code merge editor docs

---

## Key files / pages referenced

- `@codemirror/merge/dist/index.js` lines 1543-1564 — `deletionWidget` DOM construction with `mergeControls` branch
- `@codemirror/merge/dist/index.js` lines 1129-1143 — `baseTheme` CSS for `.cm-deletedChunk`, `.cm-chunkButtons`, button styling
- `@codemirror/merge/dist/index.js` lines 1645-1679 — `acceptChunk` and `rejectChunk` command implementations
- `@codemirror/merge/dist/index.js` lines 588-665 — `Chunk` class (hunk model)
- `@codemirror/merge/dist/index.js` lines 676-694 — `toChunks()` grouping function
- `@codemirror/merge/dist/index.js` lines 1043-1065 — `collapseUnchanged` widget decorations
- `@codemirror/merge/dist/index.js` lines 1401-1412 — side-by-side `revertControls` (arrow buttons)
- [Monaco DiffEditor API](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IDiffEditorConstructionOptions.html) — construction options, no merge controls
- [Monaco issue #2269](https://github.com/microsoft/monaco-editor/issues/2269) — merge controls feature request (not implemented)
- [VS Code merge conflict docs](https://code.visualstudio.com/docs/sourcecontrol/merge-conflicts) — 3-way merge editor UX
- [Mergely docs](https://www.mergely.com/doc) — `mergeCurrentChange(side)` API
- [diffview.nvim README](https://github.com/sindrets/diffview.nvim) — 3/4-way merge, per-hunk keybindings
- [GitKraken merge tool](https://www.gitkraken.com/features/merge-conflict-resolution-tool) — checkbox model + AI resolve
- [Sublime Merge docs](https://www.sublimemerge.com/docs/getting_started) — gutter buttons, 3-way layout
- [react-diff-view](https://github.com/otakustay/react-diff-view) — widget system, read-only
- [react-diff-viewer-continued](https://github.com/Aeolun/react-diff-viewer-continued) — read-only diff

---

## Findings

### Finding: mergeControls renders two <button> elements per chunk in unified view only
**Confidence:** CONFIRMED
**Evidence:** `@codemirror/merge/dist/index.js` lines 1543-1564

DOM structure:
```html
<div class="cm-deletedChunk">
  <div class="cm-chunkButtons">
    <button name="accept">Accept</button>
    <button name="reject">Reject</button>
  </div>
  <!-- deleted lines: div.cm-deletedLine > del -->
</div>
```

The buttons are block widget decorations (`Decoration.widget({ block: true, side: -1 })`) at `chunk.fromB`. Labels use `state.phrase("Accept")`/`state.phrase("Reject")` — localizable via CodeMirror's phrase system.

Default CSS (baseTheme priority — overridable):
- `.cm-chunkButtons`: `position: absolute; insetInlineEnd: 5px`
- `button[name=accept]`: `background: #2a2; color: white; border: none; borderRadius: 3px`
- `button[name=reject]`: `background: #d43; color: white; border: none; borderRadius: 3px`

Side-by-side `MergeView` uses a different control — `revertControls` — which renders arrow buttons (`⇜`/`⇝`) in a narrow column (`div.cm-merge-revert`, 1.6em wide) between panes. These are one-directional (push content from one side to the other), not accept/reject.

**Implications:** mergeControls is unified-view-specific. Side-by-side mode has a structurally different control model (revert arrows). Any product using split view would not benefit from `mergeControls: true`.

### Finding: Accept/reject operates at per-chunk (hunk) granularity
**Confidence:** CONFIRMED
**Evidence:** `@codemirror/merge/dist/index.js` lines 1645-1679

`acceptChunk` and `rejectChunk` look up the `Chunk` object containing the position:
```javascript
let chunk = view.state.field(ChunkField).find(ch => ch.fromB <= at && ch.endB >= at);
```

A `Chunk` groups adjacent changed lines. No per-line or per-character accept/reject is provided.

`acceptChunk` does NOT modify the editor document — it updates the `originalDoc` state field (via effect) so the diff recalculates with no difference. `userEvent: "accept"`.

`rejectChunk` replaces the editor document's chunk range with the original document's content. `userEvent: "revert"`.

**Implications:** For non-dev conflict resolution where hunks may contain mixed desirable/undesirable content, per-chunk is potentially too coarse. Users would need to manually edit before accepting, or the product would need to provide sub-hunk selection.

### Finding: Custom render function provides full DOM control
**Confidence:** CONFIRMED
**Evidence:** `@codemirror/merge/dist/index.js` lines 1551-1553 (type signature from line 362)

```typescript
mergeControls?: boolean | ((type: "reject" | "accept", action: (e: MouseEvent) => void) => HTMLElement);
```

When a function is provided, it's called twice per chunk — once for "accept", once for "reject" — and the returned HTMLElement is appended directly to `div.cm-chunkButtons`. Complete DOM control: custom icons, styled buttons, tooltips, explanatory labels.

For React integration: the function returns raw HTMLElement, not a React component. Standard pattern: `ReactDOM.createRoot(container).render(<AcceptButton onClick={action}/>)` inside the factory function. This is identical to the standard CodeMirror widget-to-React bridge pattern.

For side-by-side `MergeView`, the equivalent is `renderRevertControl?: () => HTMLElement`.

**Implications:** The custom render function is the primary customization surface. A product can supply entirely custom buttons (large "Keep This Version" / "Use Original" with prose-friendly labels and explanatory subtext) without forking or patching @codemirror/merge. The DOM-level return type is a minor inconvenience for React codebases but follows the established CodeMirror widget pattern.

### Finding: No dedicated callbacks — hook via userEvent on transactions
**Confidence:** CONFIRMED
**Evidence:** `@codemirror/merge/dist/index.js` lines 1645-1679

Accept dispatches with `userEvent: "accept"`. Reject dispatches with `userEvent: "revert"`. Hook via:
```typescript
EditorView.updateListener.of(update => {
    for (let tr of update.transactions) {
        if (tr.isUserEvent("accept")) { /* chunk accepted */ }
        if (tr.isUserEvent("revert")) { /* chunk rejected */ }
    }
})
```

Public API for programmatic control: `acceptChunk(view, pos?)` and `rejectChunk(view, pos?)` — return boolean (false if no chunk at position).

**Implications:** The transaction-based hook model is standard CodeMirror, but requires familiarity with CM's state management to consume. A wrapper would expose simpler `onAccept(chunk)` / `onReject(chunk)` callbacks.

### Finding: 2-way diff only — no 3-way merge
**Confidence:** CONFIRMED
**Evidence:** `@codemirror/merge/dist/index.js` lines 649-652

`Chunk.build(a, b, conf)` compares exactly two `Text` documents. No base document concept, no 3-way merge algorithm, no conflict marker parsing. Both `MergeView` and `unifiedMergeView` are strictly 2-way.

**Implications:** For git conflict resolution (inherently 3-way: base + ours + theirs), the 3-way merge logic must be computed externally and the result fed as one of the two documents. The common pattern: run a 3-way merge algorithm externally, produce a "merged with conflict markers" document, then display that against either the base or one side.

### Finding: collapseUnchanged is orthogonal to mergeControls
**Confidence:** CONFIRMED
**Evidence:** `@codemirror/merge/dist/index.js` lines 1043-1065

`collapseUnchanged({ margin?, minSize? })` creates `Decoration.replace` widgets for long unchanged regions ("N unchanged lines" clickable expander). These sit BETWEEN chunks. Merge control buttons sit INSIDE `cm-deletedChunk` widgets at chunk boundaries. No interference.

**Implications:** A product already using `collapseUnchanged` for read-only diff views can add `mergeControls` without conflicts. The features compose cleanly.

### Finding: Buttons render regardless of read-only state
**Confidence:** CONFIRMED
**Evidence:** `@codemirror/merge/dist/index.js` — no guard for `EditorView.editable` or `EditorState.readOnly` in the widget construction path

`acceptChunk` updates the `originalDoc` state field (not the document) — works even in read-only. `rejectChunk` dispatches document changes — silently rejected by read-only guard. The buttons still render and are clickable; accept works, reject silently fails.

**Implications:** A product must either (a) conditionally pass `mergeControls: false` when the view should be read-only, or (b) conditionally disable/hide buttons in the custom render function when the editor is in review-only mode.

### Finding: No embeddable React component with per-hunk merge controls exists
**Confidence:** CONFIRMED
**Evidence:** Survey of Monaco DiffEditor (read-only), react-diff-view (read-only), react-diff-viewer-continued (read-only), @git-diff-view/react (read-only), Mergely (API-driven per-change, no visual buttons)

Every React-embeddable diff component is a read-only diff viewer with no merge affordances. Every tool with real merge controls (VS Code merge editor, GitKraken, Sublime Merge, diffview.nvim) is a non-embeddable standalone application. Mergely has `mergeCurrentChange(side)` API — closest to usable merge primitives in an embeddable library — but has no visual accept/reject buttons, is 2-way only, and is GPL/LGPL/MPL triple-licensed.

A community demo for Monaco ([monaco-inline-diff-editor-with-accept-reject-undo](https://github.com/Dimitri-WEI-Lingfeng/monaco-inline-diff-editor-with-accept-reject-undo)) adds inline accept/reject using jsdiff, but has 2 commits, ~1 star, no npm package — proof-of-concept only.

**Implications:** @codemirror/merge's `mergeControls` is the only production-quality, embeddable, per-hunk accept/reject implementation available. The alternatives are either read-only viewers (must build everything from scratch) or non-embeddable applications (cannot use). This makes @codemirror/merge the clear foundation choice despite its limitations.

### Finding: Comparison of gold-standard merge UX patterns across tools
**Confidence:** CONFIRMED
**Evidence:** VS Code docs, GitKraken docs, Sublime Merge docs, diffview.nvim README

| Tool | Controls | Granularity | 3-way | Embeddable | Non-dev friendliness |
|---|---|---|---|---|---|
| @codemirror/merge | Accept/Reject buttons (unified); arrow revert (split) | Per-chunk | No (2-way) | Yes (npm) | Low (default) / Medium (custom render) |
| VS Code merge editor | Checkboxes + CodeLens per conflict | Per-hunk + editable result | Yes (+ base) | No | Medium |
| Monaco DiffEditor | None (read-only diff) | N/A | No (2-way) | Yes | Low |
| react-diff-view | None (read-only) | N/A | No | Yes (React-native) | Low-Medium |
| react-diff-viewer-continued | None (read-only) | N/A | No | Yes (React-native) | Medium |
| Mergely | API-driven per-change (no visual buttons) | Per-change (cursor) | No (2-way) | Yes (React wrapper, GPL/LGPL/MPL) | Medium |
| GitKraken | Checkboxes + AI resolve | Per-hunk + per-line + editable | Yes | No (Electron) | Medium-High |
| Sublime Merge | Gutter buttons | Per-hunk + editable | Yes (+ base) | No (native) | Medium |
| diffview.nvim | Keybindings (co/ct/cb/ca) | Per-hunk + per-file | Yes (3+4 way) | No (Neovim) | Low |

---

## Negative searches

- Searched for React-embeddable merge component with per-hunk accept/reject: NOT FOUND (no production-quality option exists beyond @codemirror/merge)
- Searched for @codemirror/merge 3-way merge support: NOT FOUND (strictly 2-way)
- Searched for per-line accept/reject in @codemirror/merge: NOT FOUND (per-chunk only)
- Searched for read-only-aware button hiding in @codemirror/merge: NOT FOUND (buttons always render)
- Searched for Monaco DiffEditor merge controls: NOT FOUND (GitHub issue #2269 open, not implemented)

---

## Gaps / follow-ups

- Performance of mergeControls with large diffs (100+ chunks) not benchmarked
- Whether CodeMirror's `Chunk.updateA/updateB` incremental diff handles real-time typing during conflict resolution was not tested
- Accessibility (keyboard navigation, screen reader announcements) of accept/reject buttons not audited
