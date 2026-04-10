# Evidence: Implementation Patterns for the Branch-Switching Problem

**Dimension:** Technical approaches to switching CRDT-backed editor content between branches
**Date:** 2026-04-02
**Sources:** Synthesis from all research dimensions + Hocuspocus docs + y-prosemirror behavior

---

## Key files / pages referenced

- All evidence files in this report
- https://tiptap.dev/docs/hocuspocus/server/hooks -- Hocuspocus lifecycle
- https://tiptap.dev/docs/hocuspocus/guides/multi-subdocuments -- Multiplexing
- https://github.com/yjs/y-prosemirror -- y-prosemirror binding constraints

---

## Findings

### Finding: Four candidate patterns exist for branch switching; Pattern B (namespaced Y.Docs) is the most proven
**Confidence:** INFERRED
**Evidence:** Synthesis from all research

**Pattern A: Destroy and recreate the Y.Doc on branch switch**

Approach:
1. Serialize current branch Y.Doc to binary (`Y.encodeStateAsUpdate`)
2. Store serialized state (DB, S3, etc.)
3. Destroy Y.Doc, provider, and editor
4. Create new Y.Doc for target branch
5. Load target branch state from storage (`Y.applyUpdate`)
6. Create new provider and editor bound to new Y.Doc

Pros: Simple, clean isolation, no memory overhead
Cons: Visible unmount/remount flash, loss of editor state (scroll position, cursor), cold start for CRDT sync

**Pattern B: Keep separate Y.Docs per branch, use Hocuspocus document naming**

Approach:
1. Each branch has a unique document name: `article.123.main`, `article.123.draft-1`
2. On branch switch, disconnect from current provider, connect to new one
3. Hocuspocus manages lifecycle independently per document name
4. React key-based remount forces clean editor recreation

```typescript
// Client-side
function useDocumentForBranch(docId: string, branch: string) {
  const docName = `${docId}.${branch}`;
  const ydoc = useMemo(() => new Y.Doc(), [docName]);
  const provider = useMemo(() => 
    new HocuspocusProvider({ url: WS_URL, name: docName, document: ydoc }),
    [docName]
  );
  return { ydoc, provider };
}

// Server-side (Hocuspocus)
server = new Server({
  async onLoadDocument({ documentName }) {
    const [docId, branch] = parseDocName(documentName);
    return await loadYDocFromDB(docId, branch);
  },
  async onStoreDocument({ documentName, document }) {
    const [docId, branch] = parseDocName(documentName);
    await saveYDocToDB(docId, branch, document);
  },
});
```

Pros: Clean isolation, Hocuspocus manages lifecycle, multiple branches can be active simultaneously, proven pattern (it's how Hocuspocus handles multiple documents already)
Cons: Still requires editor remount, branch creation requires initializing from parent branch state

**Pattern C: Pre-load both branches, hot-swap the binding**

Approach:
1. Maintain two Y.Docs in memory (main + target branch)
2. Pre-load target branch via multiplexed Hocuspocus connection
3. On switch, rebind y-prosemirror plugins to new Y.Doc's fragment

Limitation: y-prosemirror does NOT support rebinding. The `ySyncPlugin` is bound at creation. This pattern would require either:
- A custom fork of y-prosemirror with rebinding support
- Maintaining two hidden editor instances and swapping DOM visibility

**Pattern D: Use Loro instead of Yjs for native branching**

Approach:
1. Use Loro as the CRDT library with loro-prosemirror binding
2. `doc.fork()` to create branches
3. `doc.checkout(frontiers)` for read-only version viewing
4. `doc.forkAt(frontiers)` for editing at a historical point
5. `doc.import(otherDoc.export())` for merge

Pros: Native branching semantics, eg-walker-based merge (no text interleaving), theoretically cleanest architecture
Cons: loro-prosemirror is pre-1.0 (v0.4.x), no Hocuspocus equivalent, no TipTap extension, limited production track record, significant migration cost

### Finding: Branch creation requires careful CRDT initialization to avoid duplication
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus persistence docs, multi-file-crdt-operations report

When creating a branch Y.Doc from a parent:

CORRECT:
```javascript
// Encode parent Y.Doc state as binary
const parentState = Y.encodeStateAsUpdate(parentDoc);
// Apply to new Y.Doc -- preserves CRDT history
const branchDoc = new Y.Doc();
Y.applyUpdate(branchDoc, parentState);
```

WRONG:
```javascript
// DON'T extract text and create new Y.Doc from text
const text = parentDoc.getText('content').toString();
const branchDoc = new Y.Doc();
branchDoc.getText('content').insert(0, text);
// This creates NEW CRDT items -- merging back will DOUBLE the content
```

### Finding: Branch merge is an application-level concern, not a CRDT operation
**Confidence:** CONFIRMED
**Evidence:** Yjs branching limitations, Figma architecture

For Yjs-based systems, branch merge must use text-level diffing:

1. Extract text from both branch and main Y.Docs
2. Compute a three-way diff (base, main, branch)
3. Resolve conflicts at the application level
4. Apply the resolved changes as Y.Doc operations on the target

This is identical to how git merge works -- the CRDT is the storage layer, not the merge engine.

Alternatively, if using Loro, the CRDT itself handles merge via `import()/export()`.

---

## Gaps / follow-ups

- Performance benchmarks: how fast is Pattern B (editor remount + Hocuspocus load) for a typical article?
- Merge UI/UX: how to present three-way text diffs to non-technical users
- Concurrent editing on the same branch: does the pattern work when multiple users are on the same branch?
