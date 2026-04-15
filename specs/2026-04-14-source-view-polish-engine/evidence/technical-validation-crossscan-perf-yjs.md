# Technical validation: cross-scan, perf, Yjs

**Date:** 2026-04-14
**Verification level per finding:** CONFIRMED | INFERRED | UNRESOLVED

This note validates the SPEC.md proposals for a cross-scan StateField, view-layer decoration performance at scale, y-codemirror.next compatibility with view-layer decorations, block widget caveats, and viewport scoping. Sources are quoted with URLs / file:line; nothing is taken from a derived blog post when an authoritative source exists.

---

## 1. StateField cross-scan pattern

### Idiomatic pattern (CONFIRMED)

The two-pass StateField proposed in SPEC.md §3.2 is consistent with the canonical CodeMirror decoration recipes, but the official guidance is more nuanced than "use a StateField for cross-scan."

**Marijn (CM6 maintainer) on StateField vs ViewPlugin:**

> "Generally, if something is state that should be preserved (rather than derived state that can be reconstructed from other state), putting it in a state field is preferable."
> — `https://discuss.codemirror.net/t/highlighting-a-line-viewplugin-vs-statefield/4372`

For broken references, the decoration set is *derived state* (it can be reconstructed from the document at any moment), which by Marijn's rule pushes toward a ViewPlugin. The case for a StateField in our spec is not "state preservation" — it is **scope**: a ViewPlugin's `decorations` is iterated through `EditorView.decorations.of(...)` and is naturally viewport-coupled, while a cross-scan must look at the *whole* document (definitions outside the viewport must still resolve references inside it).

**The canonical "decorations from syntax tree" recipe** (Boolean Toggle Widgets, official decoration example) uses a ViewPlugin and recomputes when `docChanged || viewportChanged || syntaxTree(...) != syntaxTree(...)`:

```typescript
update(update: ViewUpdate) {
  if (update.docChanged || update.viewportChanged ||
      syntaxTree(update.startState) != syntaxTree(update.state))
    this.decorations = checkboxes(update.view)
}
```

— `https://codemirror.net/examples/decoration/`

This is appropriate for *viewport-local* derivations. A cross-scan that must collect document-wide labels does not fit this exact recipe (visibleRanges iteration would miss out-of-viewport definitions).

### Practical recommendation (INFERRED, with confidence)

Two reasonable shapes, both consistent with maintainer guidance:

1. **StateField with full-doc scan, gated on `tr.docChanged`** — matches the spec proposal. StateField.update fires on every transaction (CONFIRMED below), so an explicit `if (!tr.docChanged) return value.map(tr.changes)` early exit is required to avoid recomputing on cursor movement.
2. **ViewPlugin with full-doc scan** — equally valid. ViewPlugin's `update(update: ViewUpdate)` already exposes `update.docChanged` for the same gate.

Either choice works; the StateField is preferable here only because (a) the resulting set is logically part of editor state (other plugins can `state.field(...)` to read which references are broken), and (b) the spec mentions wanting to expose this for a future "broken refs" panel.

### StateField.update fires on every transaction (CONFIRMED)

> "**update(value: Value, transaction: Transaction) → Value** — Compute a new value from the field's previous value and a transaction."
> — `https://codemirror.net/docs/ref/`

There is no built-in "only fire on docChanged" gate; the field author must early-return on irrelevant transactions. Pattern:

```typescript
update(value, tr) {
  if (!tr.docChanged) return value;     // selection/effect-only — keep prior set
  // ... rebuild
}
```

### Full-rescan vs incremental (INFERRED)

Marijn's guidance on header-extraction (analogous problem — extract block-level structural info from the syntax tree):

> "could try to make it incremental and only re-query the headers that changed (by observing transactions), but that is probably overkill"
> — `https://discuss.codemirror.net/t/efficient-way-to-get-current-syntax-tree-to-extract-headers/3975`

> "`view.state.doc.sliceString(from, to)` calls should be cheap enough unless you have a *huge* amount of headings"
> — same thread

**Conclusion:** for the document sizes in scope (≤10k lines per SPEC §A5), a full-document `syntaxTree().iterate()` pass on every doc-changing transaction is the maintainer-endorsed default. Incremental patch via `tr.changes.iterChanges()` is *possible* but is "probably overkill" per the maintainer; reach for it only if the Phase 4 benchmark fails.

### Cross-scan is feasible to make incremental, but with caveats (INFERRED)

True incremental updating for a cross-scan is harder than for viewport-local decorations because *any* edit can affect references *anywhere*:

- Adding a new definition `[foo]: url` may un-break references throughout the document.
- Deleting a definition may break references throughout the document.

Patching only the changed range is insufficient — at minimum, you must know whether the change *added or removed a definition label*, then re-check all references for the affected label(s). This is doable but adds complexity. The full-rescan approach scales acceptably because Lezer's syntax tree is incremental (the tree itself is cheap to re-derive); only the `iterate()` walk and decoration build are the cost.

### RangeSetBuilder usage (CONFIRMED)

> "Ranges should be added in sorted (by `from` and `value.startSide`) order"
> — `https://codemirror.net/docs/ref/`

`RangeSet.of()` accepts an optional `sort: true` parameter to handle unsorted input. For a syntax-tree-driven scan, nodes are iterated in document order, so a `RangeSetBuilder` (which requires sorted input) is the correct primitive — no `sort: true` needed.

For our two-pass cross-scan (collect definitions in pass 1, decorate references in pass 2), pass 2 still produces ranges in document order, so `RangeSetBuilder` works without sort. **Caveat:** if multiple decoration *kinds* coexist in one StateField (e.g., broken-ref + something else), they must be merged via `RangeSet.of([...arr], true)` rather than a single builder, since each kind has its own `startSide`.

### Gotchas

1. **Stale syntax tree.** During large edits, `syntaxTree(state)` may return a partial tree. Marijn recommends mapping old decorations through `tr.changes` and waiting for the next reparse, rather than producing wrong decorations on a partial tree:
   > "when the new syntax tree doesn't cover the viewport yet, is to just map its old decorations through the changes and wait for more parsing to happen before it recomputes them"
   > — `https://discuss.codemirror.net/t/best-approach-for-state-field-decorations-determined-by-syntax/7708`

   Use `syntaxTreeAvailable(state, state.doc.length)` to gate full-document scans; if false, return `value.map(tr.changes)`.

2. **Selection-only transactions are cheap to skip.** As above — `if (!tr.docChanged) return value.map(tr.changes)` (or just `return value` since tr.changes is empty).

3. **Unsorted ranges throw.** `RangeSetBuilder.add` enforces sorted order at runtime; misordered adds throw "Ranges must be added sorted by `from` position and `startSide`."

---

## 2. CM6 decoration performance at scale

### Published ceilings (UNRESOLVED — no maintainer-stated number)

There is no maintainer-stated ceiling on decoration count. The closest signals:

**Marijn on viewport / performance philosophy:**

> "CodeMirror doesn't really support turning features off — rather, it requires you to turn them on to use them. As long as you don't set `viewportMargin` to something big, you should pretty much be getting the full performance you can hope for."
> — `https://discuss.codemirror.net/t/tips-for-improving-codemirror-performance/1331`

**The million-line demo** (`https://codemirror.net/examples/million/`) demonstrates document-size scalability but does not publish per-decoration benchmarks. It does note that syntax highlighting itself has built-in work limits:
> "the parser contains logic that limits the amount of work it does to avoid wasting too much battery and memory ... highlighting stops at some point if you scroll down far enough"
> — same page

**Verdict:** UNRESOLVED — no authoritative number for "safe decoration count." The architecture (RangeSet is a B-tree with O(log n) lookups, viewport-only DOM materialization) suggests practical limits are in the tens of thousands of total decorations as long as DOM-layer materialization is bounded by viewport.

### Best practices (CONFIRMED)

1. **Iterate visibleRanges, not the full document, when decorations are local** (CONFIRMED — official decoration example):
   ```typescript
   for (let {from, to} of view.visibleRanges) {
     syntaxTree(view.state).iterate({ from, to, enter: ... });
   }
   ```
   — `https://codemirror.net/examples/decoration/`

2. **For full-document scans, prefer Lezer's `TreeCursor`** (not `iterate`'s closure-per-node) for performance:
   > "when iterating over large amounts of nodes, you may want to use a mutable cursor instead, which is more efficient"
   > — `https://lezer.codemirror.net/docs/ref/` (per WebSearch summary)

3. **Use `EditorView.decorations.of(view => view.plugin(...).decorations)` (ViewPlugin) for viewport-derived sets and `EditorView.decorations.from(field)` (StateField) for state-derived sets.** Both are standard.

4. **Block decorations must be provided directly, not via fromField:**
   > "Decorations that significantly change the vertical layout ... must be provided directly, since indirect decorations are only retrieved after the viewport has been computed."
   > — `https://codemirror.net/examples/decoration/`

   For our registry, this means `kind: 'widget-side'` with `block: false` is fine for any provider; but `block: true` widgets (if ever added) must use the direct-provide path on the EditorView.decorations facet.

---

## 3. y-codemirror.next interaction

### Verified from source inspection (CONFIRMED)

Local clone: `~/.claude/oss-repos/y-codemirror.next/src/`.

**y-sync.js — what the binding observes:**

1. **One Y.Text observer** (`y-sync.js:236`):
   ```js
   this._observer = this._ytext.observe((event, tr) => { ... })
   ```
   This observes `Y.Text` insert/delete events only. It does NOT observe Y.XmlFragment, Y.Map, Y.Array, or any other Yjs type. It does NOT inspect CodeMirror decorations.

2. **One CM-side update path** (`y-sync.js:269` — `YSyncPluginValue.update`):
   ```js
   update (update) {
     if (!update.docChanged || (update.transactions.length > 0 &&
         update.transactions[0].annotation(ySyncAnnotation) === this.conf)) {
       return
     }
     // ... applies update.changes to Y.Text via iterChanges
   }
   ```
   It only acts on `docChanged` transactions, and only reads `update.changes` (the text delta). It does NOT inspect, serialize, or otherwise read decoration state.

3. **Decorations the binding produces itself** (`y-sync.js:9-62` — `yAttributionDecorations`):
   The binding *does* maintain a StateField of attribution decorations (`yjs-attribution-insert` / `yjs-attribution-delete`) via `cmView.EditorView.decorations.from(f)`. These are independent from any other extension's decorations — CM6 composes decoration providers via the `EditorView.decorations` facet, which merges multiple sources.

**Conclusion (CONFIRMED):** The binding is a pure text↔Y.Text bridge. View-layer decorations from any other extension (StateField or ViewPlugin) coexist without interaction.

### Decoration compatibility verdict — CONFIRMED

Decorations from the proposed registry (broken-ref marks, line backgrounds, gutter widgets, etc.) are view-layer only and cannot affect:
- Y.Text content (the binding only reads `update.changes`)
- CRDT update serialization (Yjs updates carry text deltas, not view state)
- Awareness sync (the binding's awareness path in `y-remote-selections.js` deals only with cursors/selection, not decorations)

**Two-peer scenario:** Peer A has decoration plugin installed, Peer B does not. Both peers see the same Y.Text content. Peer A renders broken-ref marks; Peer B does not. Sync continues to work because the binding never serialized any decoration state in the first place.

**Widget DOM and CRDT origin handling:**
- Widget DOM is rendered by CM6 from the decoration set; it is not part of the editable document text. y-codemirror.next's `update` handler is gated on `update.docChanged` (only fires when `EditorState.doc` actually changes), and widget DOM mounts/unmounts do not trigger doc changes.
- The binding writes back to Y.Text using its own `ySyncAnnotation` to suppress feedback loops. Widget decorations don't dispatch transactions; they're purely render-time DOM.

**Open issues review:** Surveyed `https://github.com/yjs/y-codemirror.next/issues` — no open or closed issues reference decorations, widgets, or view-layer extension compatibility. Open issues touch sync-when-disconnected, line separators, Vue3 mounting, remote selection display — none decoration-adjacent.

### Caveat on attribution StateField

The binding's own `yAttributionDecorations` StateField writes the binding's annotation `yAttributionAnnotation` into the StateField. If a future feature wants to store decorations alongside binding-attribution decorations on the same range, be aware they're separate decoration sources composed by the facet — overlapping classes will both apply, and CM6 sorts by `startSide`.

---

## 4. Block widget caveats

### `Decoration.widget({ block: true })` — supported but with active bugs

Block widgets (the inserted-alongside flavor, NOT replace) are supported, but cursor navigation around them has been an active development area:

1. **CM 6.39.3 — block widget side=1 cursor bug:**
   > "Can't navigate through block widget with side = 1"
   > — `https://discuss.codemirror.net/t/v6-39-3-cant-navigate-through-block-widget-with-side-1-another-language-issue/9607` (fixed in 6.39.4)

2. **Cursor jumps over entire widget:**
   > "the cursor jumps over the entire widget instead of letting users position it precisely around the widget boundaries"
   > — `https://discuss.codemirror.net/t/cursor-jumps-over-entire-widget-need-help-with-keyup-keydown-events-update-optimization/9263`

3. **Cross-browser inconsistency:** "Inconsistent cursor position for a widget created by Decoration.replace in Chrome and Safari" — `https://discuss.codemirror.net/t/inconsistent-cursor-position-for-a-widget-created-by-decoration-replace-in-chrome-and-safari/3239`

### Implications for the registry

- The spec's `kind: 'widget-side'` (inline widget with `block: false`) avoids all of the above. Safe.
- `kind: 'replace'` is already excluded by spec (would hide source). Reaffirmed: still correct.
- `Decoration.widget({ block: true })` (inserted as block alongside source) is *technically* available — but: (a) cursor-positioning bugs persist in recent CM6 versions, (b) they alter vertical layout so they must be provided via the direct EditorView.decorations facet path, not via `provide: f => EditorView.decorations.from(f)` for the relevant slice. Per spec §3.2 the registry has no current consumer for block widgets; recommend keeping it out of v1 of the registry until a real need surfaces. Adding `kind: 'widget-block'` later is straightforward.

### Atomic ranges

If a widget should swallow cursor motion / deletion as a single unit:
> "If you want decorated ranges to behave like atomic units for cursor motion and deletion purposes, also provide the range set containing the decorations to `EditorView.atomicRanges`."
> — CM6 reference

Useful for things like "treat a [[wikilink]] as an atomic delete target" — currently out of scope, but the registry should leave room for atomic-range opt-in per provider.

---

## 5. Viewport scoping pattern

### Idiomatic answer (CONFIRMED)

The canonical pattern from the official decoration example uses a single ViewPlugin with conditional logic:

```typescript
update(update: ViewUpdate) {
  if (update.docChanged || update.viewportChanged ||
      syntaxTree(update.startState) != syntaxTree(update.state))
    this.decorations = checkboxes(update.view)
}
```
— `https://codemirror.net/examples/decoration/`

Note: `update.selectionSet` is **not** in this gate. Cursor movement does not trigger recompute for syntax-driven decorations.

### For our registry — recommendation

**Single ViewPlugin per "trigger profile," not per decoration.** Group decoration providers by what they react to:

1. **Doc-driven group** (`docChanged || viewportChanged || syntaxTree(...) != syntaxTree(...)`): broken-ref marks, structural marks, line-bg classes derived from syntax. This is the majority.
2. **Selection-aware group** (`docChanged || viewportChanged || selectionSet`): cursor-context decorations (e.g., "highlight current heading section"). Add `selectionSet` only for providers that need it.
3. **Effect-driven** (StateField with `tr.effects`): user-triggered marks (e.g., "show search match"). Already StateField territory.

A single ViewPlugin per group keeps DOM materialization batched by CM6's update cycle. Splitting into per-provider ViewPlugins would mean multiple separate decoration sets composed by the facet — correct, but redundant computation per update. The spec's "registry dispatcher" pattern naturally lands in this shape.

### Performance implications

- Iterating `syntaxTree(view.state)` once per update is cheap (it's a B-tree walk); iterating it N times for N independent ViewPlugins is N× the same walk. Group providers to share the walk.
- `selectionSet` fires on every keystroke that moves the cursor (very frequent). Plugins that don't care about selection should not be in a `selectionSet`-gated update path.
- For doc-driven providers, the `syntaxTree(update.startState) != syntaxTree(update.state)` check is what handles the case where the syntax tree finished parsing in the background (no docChanged, but new tree available).

---

## Summary of changes the spec should consider

1. **§3.2 cross-scan dispatcher:** clarify that `kind: 'cross-scan-mark'` providers run inside the StateField on `tr.docChanged` only; selection-only transactions early-return with `value.map(tr.changes)` (effectively, no-op since changes are empty). Also add the `syntaxTreeAvailable()` gate to avoid mid-parse decoration corruption.
2. **§3.2 dispatcher count:** group ViewPlugin providers by trigger profile (doc-driven vs. selection-aware) rather than per-provider, to share the syntax-tree walk.
3. **§A5 benchmark:** the maintainer's "probably overkill" guidance on incremental cross-scan suggests our 100ms-on-10k-lines target is achievable with a full-rescan implementation. Incremental patch is a fallback if Phase 4 misses the budget, not a Phase 1 requirement.
4. **§Risks:** y-codemirror.next decoration interaction risk is downgraded from LOW to NONE — confirmed no read path against decorations exists in the binding source.
5. **Block widgets:** explicitly out of scope for v1 registry; document `kind: 'widget-block'` as a future addition pending real need + CM6 ≥ 6.39.4.

---

## Source index

- y-codemirror.next source (local clone): `~/.claude/oss-repos/y-codemirror.next/src/y-sync.js:9-62, 236-303` and `src/index.js:20-48`
- CM6 decoration example: `https://codemirror.net/examples/decoration/`
- CM6 reference manual: `https://codemirror.net/docs/ref/`
- CM6 million-line demo: `https://codemirror.net/examples/million/`
- Marijn — ViewPlugin vs StateField guidance: `https://discuss.codemirror.net/t/highlighting-a-line-viewplugin-vs-statefield/4372`
- Marijn — viewportMargin perf: `https://discuss.codemirror.net/t/tips-for-improving-codemirror-performance/1331`
- Marijn — header extraction perf: `https://discuss.codemirror.net/t/efficient-way-to-get-current-syntax-tree-to-extract-headers/3975`
- Marijn — partial syntax tree handling: `https://discuss.codemirror.net/t/best-approach-for-state-field-decorations-determined-by-syntax/7708`
- Block widget cursor bug: `https://discuss.codemirror.net/t/v6-39-3-cant-navigate-through-block-widget-with-side-1-another-language-issue/9607`
- Cursor jumps over widget: `https://discuss.codemirror.net/t/cursor-jumps-over-entire-widget-need-help-with-keyup-keydown-events-update-optimization/9263`
- Replace widget cross-browser cursor: `https://discuss.codemirror.net/t/inconsistent-cursor-position-for-a-widget-created-by-decoration-replace-in-chrome-and-safari/3239`
- Lezer reference (TreeCursor perf): `https://lezer.codemirror.net/docs/ref/`
- Obsidian markdown attributes (real-world syntaxTree decoration plugin): `https://github.com/nothingislost/obsidian-cm6-attributes`
- y-codemirror.next open issues: `https://github.com/yjs/y-codemirror.next/issues`
