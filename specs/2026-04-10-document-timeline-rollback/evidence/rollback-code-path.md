---
type: evidence
source: codebase trace (api-extension.ts, persistence.ts, external-change.ts, agent-sessions.ts)
confidence: HIGH
created: 2026-04-10
---

# Rollback Code Path — Composing from Existing Functions

## No New Infrastructure Needed

Every function required for rollback already exists and is exported. The rollback endpoint composes them.

## Rollback Transaction Sequence

```
1. shadowGit(shadow).raw('show', `${commitSha}:${docName}.md`)  → historical markdown
2. stripFrontmatter(markdown)                                     → { frontmatter, body }
3. mdManager.parse(body)                                          → ProseMirror JSON
4. schema.nodeFromJSON(json)                                      → ProseMirror Node
5. document.transact(() => {
     updateYFragment(document, xmlFragment, pmNode, meta)          → update XmlFragment
     ytext.delete(0, ytext.length); ytext.insert(0, markdown)     → update Y.Text
     metaMap.set('frontmatter', frontmatter)                       → update metadata
   }, 'rollback-apply')
6. setReconciledBase(docName, markdown)                            → update merge base
```

## Three Existing Analogues

| Path | Location | Transaction origin | Pattern |
|------|----------|-------------------|---------|
| External change handler | `external-change.ts` | `'file-watcher'` | Parse markdown → updateYFragment + Y.Text sync |
| Agent write-md (replace) | `api-extension.ts` L128-207 | `'agent-write'` | Y.Text replace + syncTextToFragment |
| onLoadDocument | `persistence.ts` L287-333 | (initial load) | Parse markdown → updateYFragment (only if empty) |

**Recommended: Follow external-change pattern** — it handles the full replacement case (parse markdown → update both XmlFragment and Y.Text → update metadata).

## Key Function Imports

All available from existing packages:
- `shadowGit()` — from `shadow-repo.ts`
- `updateYFragment`, `yXmlFragmentToProsemirrorJSON` — from `@tiptap/y-tiptap`
- `stripFrontmatter`, `prependFrontmatter` — from `@inkeep/open-knowledge-core`
- `setReconciledBase` — from `persistence.ts`
- `syncTextToFragment` — from `agent-sessions.ts`
- `MarkdownManager`, `getSchema` — from core extensions

## reconciledBase Update

reconciledBase updates at three points:
1. `onLoadDocument` — when doc loads from disk
2. `onStoreDocument` — after successful disk write
3. After reconciliation — `setReconciledBase(docName, result.newContent)`

For rollback: update reconciledBase **immediately after** the transaction (not inside — `setReconciledBase` is not a Y.Doc operation). The implementation calls `setReconciledBase(docName, markdown)` after `document.transact()` completes, so the next L1 save uses the restored content as the merge base.

## Transaction Origin

Use a distinct origin `'rollback-apply'` to:
- Distinguish rollback from agent writes in the observer system
- Allow the bidirectional observers to handle the transaction correctly
- Enable activity/presence tracking of rollback events

## Client Impact

Since rollback goes through Y.Doc transact:
- All connected clients receive the update via Hocuspocus sync
- Bidirectional observers (XmlFragment ↔ Y.Text) fire normally
- L1 persistence debounce triggers, writing restored content to disk
- L2 git debounce triggers, creating a new WIP commit with restored content
- No special client-side handling needed — it's just another CRDT transaction
