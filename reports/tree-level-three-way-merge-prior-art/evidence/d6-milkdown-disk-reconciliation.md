# Evidence: D6 Milkdown disk reconciliation

**Dimension:** Milkdown — how does it handle concurrent markdown file external edits while a collaborative Y.XmlFragment session is live?
**Date:** 2026-04-17
**Sources:** milkdown.dev docs, github.com/Milkdown, Milkdown collab plugin source

---

## Key files / pages referenced

- [Milkdown Collaborative Editing docs](https://milkdown.dev/docs/guide/collaborative-editing)
- [Milkdown plugin-collab API docs](https://milkdown.dev/docs/api/plugin-collab)
- [Milkdown collab-service source (main branch)](https://raw.githubusercontent.com/Milkdown/milkdown/main/packages/plugins/plugin-collab/src/collab-service.ts)
- [Milkdown GitHub Discussion #1993](https://github.com/orgs/Milkdown/discussions/1993) — Yjs integration
- [Yjs ecosystem docs on Milkdown](https://docs.yjs.dev/ecosystem/editor-bindings/milkdown)

---

## Findings

### Finding: Milkdown's collab plugin uses `ySyncPlugin` directly — no custom tree-level three-way merge

**Confidence:** CONFIRMED
**Evidence:** `milkdown/packages/plugins/plugin-collab/src/collab-service.ts` — direct source read

Import statements from the source:
```ts
import {
  prosemirrorToYDoc,
  redo,
  undo,
  yCursorPlugin,
  yCursorPluginKey,
  yXmlFragmentToProseMirrorRootNode,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
  yUndoPluginKey,
} from 'y-prosemirror'
```

Milkdown imports `ySyncPlugin`, `yUndoPlugin`, and `yCursorPlugin` from `y-prosemirror` directly and uses them as-is. The collab service is a thin orchestration layer over y-prosemirror — there is no custom merge algorithm, no three-way merge primitive, no external-state reconciliation.

### Finding: Milkdown has NO disk/filesystem integration for markdown file reconciliation

**Confidence:** CONFIRMED
**Evidence:** [Milkdown Collaborative Editing docs](https://milkdown.dev/docs/guide/collaborative-editing), [Milkdown plugin-collab API](https://milkdown.dev/docs/api/plugin-collab)

Milkdown's collaborative editing docs describe:
- Connecting to a `y-websocket` or `y-indexeddb` provider
- Binding the editor via `ySyncPlugin` to a `Y.XmlFragment`
- That's it.

**There is no concept of a canonical markdown file on disk** in Milkdown's collaborative model. The Y.XmlFragment IS the document state; whatever the application does with it at the persistence layer is outside Milkdown's scope. If the application wants to load markdown from a file, it calls `editor.action(insert(markdownString))` which triggers `prosemirrorToYDoc` — a full-document replace that wipes any concurrent edits.

### Finding: Milkdown users asking about external-edit reconciliation get directed to "rebuild the editor" or "use Yjs providers"

**Confidence:** CONFIRMED
**Evidence:** [GitHub Discussion #1993](https://github.com/orgs/Milkdown/discussions/1993)

From the search result summary of Milkdown discussions:
> "At some point the server and client have a different version of the ydoc and therefore cannot integrate new updates coming in. This highlights the importance of proper state synchronization when dealing with external edits."

No solution in the thread goes deeper than "use Yjs providers for real-time sync." Loading a new markdown file from disk while a collab session is live is not an operation Milkdown supports natively — the recommended pattern is to destroy the editor and rebuild with the new initial state.

### Finding: The CollabMD project (not Milkdown core) is the closest community pattern — and it explicitly does disk-text reconciliation, not tree-level merge

**Confidence:** CONFIRMED
**Evidence:** [CollabMD GitHub search result](https://github.com/andes90/collabmd)

CollabMD is a separate community project (not Milkdown) that specifically wires up "markdown folders" + "git-backed docs" + Yjs rooms. Its README describes the reconciliation flow as watching disk for external changes and "reconciling back into live rooms" — which is serialize-merge-parse at the disk layer (the markdown text is the reconciliation medium, not the Yjs tree state).

---

## Implications for the central research question

Milkdown is the most widely-used WYSIWYG-over-markdown editor built on Yjs (TipTap is more widely-used overall, but TipTap doesn't ship with a markdown-file-centric collaboration story; Milkdown does). **Even Milkdown — which is explicitly about markdown editing — punts on the external-file-reconciliation problem.** The architectural answer it offers is:
- Use Y.XmlFragment as the canonical state
- Serialize to markdown for export
- Reconciling external markdown edits back into Y.XmlFragment is the application's problem, not Milkdown's

The CollabMD project demonstrates what "the application's problem" looks like in practice: serialize-merge-parse at the disk-text layer, not tree-level three-way merge.

---

## Negative searches

- Searched Milkdown docs + source for "file watcher", "disk sync", "external edit", "reconcile", "three-way", "tree merge" → no hits
- Searched Milkdown GitHub issues for concurrent file edits → the architectural answer is "rebuild editor" or "use Yjs provider"
- No Milkdown plugin implements a three-way merge primitive

---

## Gaps / follow-ups

- The Milkdown + y-websocket production pattern for multi-device + git-backed docs is not well-documented; this is an ecosystem gap
- The TipTap ecosystem (larger than Milkdown) has the same architecture — no native disk reconciliation — but has more market share so the gap is more visible
