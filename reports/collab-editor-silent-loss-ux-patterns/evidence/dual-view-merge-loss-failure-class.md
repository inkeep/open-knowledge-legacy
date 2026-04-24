# Evidence: Dual-view WYSIWYG+source editors and the bridge-layer merge-loss failure class

**Dimension:** Are there any editors with dual WYSIWYG + source representations (like ours)? Do they use bridges? Do they handle content loss?
**Date:** 2026-04-16
**Sources:** GitHub repos, editor documentation, Joplin/Typora/CKEditor forum threads.

---

## Key pages referenced

- [Joplin Forum — Toggle between WYSIWYG/Markdown](https://discourse.joplinapp.org/t/toggle-between-wysiwig-markdown-editor-mode-with-keyboard-shortcut/16848) — Joplin's mode-toggle model
- [StackEdit](https://stackedit.io/) — split-pane markdown editor
- [CKEditor Markdown Editor](https://ckeditor.com/blog/the-best-markdown-editor-for-seamless-content-creation/) — toggle approach
- [VS Code Markdown WYSIWYG Editor issue #296639](https://github.com/microsoft/vscode/issues/296639) — discussion of dual-view approaches
- [Obsidian docs — Editor modes](https://help.obsidian.md/editor) — Source/Live Preview/Reading

---

## Findings

### Finding: Most dual-view editors are NOT collaborative — they're single-user, no bridge-merge failure class
**Confidence:** CONFIRMED
**Evidence:** Joplin (single-user), Typora (single-user), StackEdit (cloud sync but not real-time CRDT), Obsidian (plugin-based sync; not real-time CRDT by default), VS Code (single-user by default).

Dual-view in these editors is typically "toggle between modes" — at any instant only one mode is active. There's no concurrent multi-client bridge because there's no CRDT layer to bridge. Content-loss can happen from sync conflicts or buggy round-trips, but not from the specific failure class of "bridge-merge post-condition violation during concurrent edits from different mode surfaces."

**Implications:** Our failure class is narrower than any surveyed editor. We can't adopt a pattern from a peer because we don't have peers with this exact architecture.

---

### Finding: CKEditor has a toggle model but explicitly warns about content loss on toggle
**Confidence:** INFERRED
**Evidence:** [CKEditor — Markdown Editor blog](https://ckeditor.com/blog/the-best-markdown-editor-for-seamless-content-creation/)

CKEditor's markdown mode toggle documents that switching modes can lose formatting if the source markdown can't round-trip the current WYSIWYG state. Their solution is a pre-toggle confirmation dialog, not a post-toggle toast. The pattern: *prevent* the loss before it happens by asking the user's permission.

**Implications:** CKEditor's approach — pre-toggle confirmation — is a preventive pattern. It doesn't apply to our case because our merge loss happens DURING concurrent edits, not at a discrete user-initiated toggle point. The user never "confirms" a merge.

---

### Finding: Obsidian's 3-mode system (Source / Live Preview / Reading) uses a SINGLE representation and doesn't bridge
**Confidence:** CONFIRMED
**Evidence:** [Obsidian docs — Editor](https://help.obsidian.md/editor)

Obsidian's modes are rendering modes over the SAME underlying CodeMirror buffer — not parallel representations. Live Preview is a decoration layer on top of the markdown source, not a separate CRDT. There's no bridge, no merge anomaly class.

**Implications:** Obsidian's architecture (single source, decorated rendering) is a solved version of our problem but at a much greater cost: no WYSIWYG editing in the sense that TipTap provides. Their model preserves fidelity by not having a second representation.

---

### Finding: Notion has NO "source mode" — block JSON is never exposed
**Confidence:** CONFIRMED
**Evidence:** [Notion block API](https://developers.notion.com/reference/block); Notion's frontend doesn't expose raw block JSON to the user.

Notion's editor is single-representation (block tree only). There's no markdown source surface for users. Their "export as markdown" is lossy by design and not a collaboration surface.

**Implications:** Notion doesn't have our dual-view failure class because they don't have a dual view.

---

### Finding: Our bridge-merge post-condition (c) failure class is unique to our architecture
**Confidence:** CONFIRMED
**Evidence:** `specs/2026-04-16-bridge-correctness/SPEC.md §R1`; `packages/core/src/bridge/merge-three-way.ts` §mergeConflictRegion; no comparable implementation found in surveyed editors.

Our architecture:
- Y.XmlFragment (ProseMirror tree, WYSIWYG)
- Y.Text (flat string, source mode)
- Bidirectional server-authoritative observer bridge (precedent #14)
- Hybrid diff3+DMP three-way merge in `mergeThreeWay` when Y.Text has diverged from baseline

This is a novel architecture: dual CRDTs with a runtime-synchronized merge bridge. The post-condition (c) — "every unique substring in `(mine ∖ base)` and `(theirs ∖ base)` must appear in result" — is our specific invariant. Surveyed editors either have a single CRDT (Yjs-only, no bridge) or a disconnected dual-mode (no runtime bridge).

**Implications:** We are UX-designing a novel surface. The closest industry precedents are:
- Figma's branch-merge (Review/Dismiss with version history, but triggered by user)
- Notion's conflict-page (post-hoc artifact)
- Obsidian's conflict-file (post-hoc artifact)
- Our own paste-failure-toast (degradation notice with throttle)

None of these fit perfectly. The closest structural match is our own paste-failure-toast pattern.

---

### Finding: The failure class is asymmetric — user can be actively typing the content that's at risk
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/server-observers.ts:167-175` (Path B triggers when Y.Text diverged from baseline); `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` fuzzer reproductions.

The D3-violation scenario: user A (WYSIWYG) and user B (source mode) are both actively editing. Path B's `mergeThreeWay` runs on every debounced tick. If the merge's conflict-region DMP patch drops a patch (flag `false`), content that WAS in Y.Text (B's typing) and NOT in XmlFragment (A's typing) gets dropped from the output.

The user whose content was dropped is still actively typing — they may not even notice for several seconds that their last sentence vanished from the other peer's view. By the time they do, their local cursor has moved, and explaining "your text of a few seconds ago disappeared because of a merge algorithm limitation" is high cognitive load.

**Implications:** The UX must carry enough information for the user to KNOW WHERE TO LOOK for the lost content (version history, a diff) without being blocked mid-typing. A bare "Something went wrong" toast fails this test. A "[View version history]" CTA is the minimum actionable signal.

---

## Negative searches

- No editor with a published "bridge-merge" failure class found. The term itself is specific to our architecture.
- No CKEditor / Slate / Quill collaboration layer uses a dual-CRDT bridge; they use single-source-of-truth CRDT (typically Yjs Y.XmlFragment).

---

## Gaps / follow-ups

- Automerge-based editors (Peritext-on-Automerge, TinyBase + Yjs) have a single-CRDT model; none surveyed use a dual-CRDT bridge.
- Research reports already in the repo: `reports/yjs-constrained-observer-sync/`, `reports/crdt-observer-bridge-latency-analysis/` may have additional context on why our architecture is unusual.
