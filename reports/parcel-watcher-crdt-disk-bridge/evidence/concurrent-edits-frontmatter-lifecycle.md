# Evidence: Concurrent Edit Scenarios, Frontmatter Handling, File Lifecycle

**Dimension:** Concurrent edit merge behavior, frontmatter parsing, file create/delete handling
**Date:** 2026-04-07
**Sources:** Hocuspocus source, persistence.ts, y-prosemirror analysis, VS Code/Cursor save patterns

---

## Key files referenced

- `open-knowledge/init_spike/src/server/persistence.ts:139-210` -- onLoadDocument and onStoreDocument
- `open-knowledge/init_spike/src/editor/extensions/frontmatter.ts` -- stripFrontmatter/prependFrontmatter
- `hocuspocus/packages/server/src/Hocuspocus.ts:263-311` -- handleDocumentUpdate and shouldSkipStoreHooks
- `hocuspocus/packages/server/src/Document.ts:39` -- lastChangeTime tracking

---

## Findings

### Finding: Concurrent edit scenario matrix with expected outcomes
**Confidence:** INFERRED
**Evidence:** Architecture analysis combining updateYFragment behavior, content-hash gate, and CRDT semantics

| Scenario | CRDT state | Disk state | Watcher action | Outcome |
|---|---|---|---|---|
| 1. Only external edit | A | A'' | updateYFragment(A, parse(A'')) | CRDT becomes A'' -- correct |
| 2. Only CRDT edit (user typing) | A' | A | Content hash matches tracked write | SKIP -- correct (our write) |
| 3. Both edited, different paragraphs | A' (P2 changed) | A'' (P5 changed) | updateYFragment clobbers P2 change | **DATA LOSS** -- P2 reverts |
| 4. Both edited, same paragraph | A' (word 1 in P3) | A'' (word 5 in P3) | updateYFragment overwrites P3 | **DATA LOSS** -- user's word-1 change lost |
| 5. External adds paragraph | A | A+P_new | updateYFragment inserts P_new | CRDT gains P_new -- correct |
| 6. External deletes paragraph | A | A-P_old | updateYFragment deletes P_old | CRDT loses P_old -- correct |

Scenarios 3 and 4 are the concurrent edit problem. Mitigation options:

**Option A: Detect-and-defer**
Before calling updateYFragment, check if `document.lastChangeTime` is newer than our last tracked write timestamp. If so, defer the watcher update -- let the next persistence cycle reconcile.

```typescript
const tracked = writeTracker.get(path);
const doc = hocuspocus.documents.get(docName);
if (doc && tracked && doc.lastChangeTime > tracked.timestamp) {
  // CRDT was modified after our last write -- concurrent edit!
  // Defer: let persistence overwrite disk with CRDT state
  return;
}
```

This prioritizes CRDT (browser user) edits over disk (Cursor) edits. The user's changes are preserved; Cursor's changes are lost on the next persistence write. This is often the right trade-off for a browser-primary editor.

**Option B: Three-way merge (future)**
Store the last-written content as the common ancestor. Compute diffs (ancestor->disk, ancestor->CRDT), apply non-conflicting changes from both sides.

---

### Finding: Frontmatter handling requires splitting the watcher path into metadata and body updates
**Confidence:** CONFIRMED
**Evidence:** persistence.ts:141-173 (onLoadDocument), persistence.ts:175-208 (onStoreDocument)

Current persistence architecture:
- **Load:** Strip frontmatter -> parse body -> updateYFragment(body) + store frontmatter in Y.Map('metadata')
- **Save:** Read frontmatter from Y.Map('metadata') -> serialize body -> prepend frontmatter -> write file

For the watcher path, when an external editor modifies a .md file:

```typescript
async function applyExternalChangeToCRDT(path: string, content: string) {
  const { frontmatter, body } = stripFrontmatter(content);
  const docName = pathToDocName(path);
  
  const doc = hocuspocus.documents.get(docName);
  if (!doc) return; // Document not open -- will be loaded from disk when opened
  
  // 1. Update frontmatter in Y.Map
  if (frontmatter) {
    doc.transact(() => {
      const metaMap = doc.getMap('metadata');
      metaMap.set('frontmatter', frontmatter);
    }, { source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } });
  }
  
  // 2. Update body via updateYFragment
  const json = mdManager.parse(body);
  if (json) {
    const pmNode = schema.nodeFromJSON(json);
    doc.transact(() => {
      const xmlFragment = doc.getXmlFragment('default');
      updateYFragment(doc, xmlFragment, pmNode, { mapping: new Map(), isOMark: new Map() });
    }, { source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } });
  }
}
```

**Edge cases:**

1. **External editor ADDS frontmatter to a file that had none:**
   - `stripFrontmatter` returns the new frontmatter + body
   - `metaMap.set('frontmatter', frontmatter)` sets it for the first time
   - Body content is updated via updateYFragment
   - Browser client's metadata observer fires -> UI can show frontmatter

2. **External editor REMOVES frontmatter:**
   - `stripFrontmatter` returns empty frontmatter, body is the full content
   - `metaMap.set('frontmatter', '')` clears the frontmatter value
   - Body content is updated

3. **External editor modifies ONLY frontmatter (body unchanged):**
   - Frontmatter is updated in Y.Map
   - updateYFragment on body is a no-op (content matches CRDT)
   - Minimal CRDT operations -- only the Y.Map change propagates

4. **External editor modifies ONLY body (frontmatter unchanged):**
   - Frontmatter set is a no-op (same value)
   - updateYFragment applies body changes
   - Normal path

---

### Finding: File deletion handling requires removing the document from Hocuspocus and notifying clients
**Confidence:** INFERRED
**Evidence:** Architecture analysis, Hocuspocus unloadDocument API

When an external editor deletes a .md file:

```typescript
async function handleFileDeleted(path: string) {
  const docName = pathToDocName(path);
  const doc = hocuspocus.documents.get(docName);
  
  if (!doc) return; // Not loaded -- nothing to do
  
  // Option 1: Close all connections and unload
  hocuspocus.closeConnections(docName);
  await hocuspocus.unloadDocument(doc);
  
  // Option 2: Clear the document content and notify clients
  doc.transact(() => {
    const fragment = doc.getXmlFragment('default');
    fragment.delete(0, fragment.length); // Clear all content
    const metaMap = doc.getMap('metadata');
    metaMap.set('deleted', true); // Signal to clients
  }, { source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } });
}
```

Option 1 is abrupt -- the user sees a disconnection. Option 2 is graceful -- the user sees the content disappear and can undo or react. The choice depends on UX requirements.

---

### Finding: File creation handling is straightforward -- the document is loaded on first access
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus createDocument behavior

When an external editor creates a new .md file:

The watcher fires a `create` event. Two options:

**Option A: Do nothing (lazy load)**
The new file will be loaded when a user navigates to it in the browser. `onLoadDocument` reads the file from disk. This is the simplest approach and avoids loading documents no one is using.

**Option B: Notify the browser of new files**
Use a separate channel (e.g., a project index Y.Map or a Hocuspocus stateless message) to inform connected clients that a new file exists in the content directory. The browser can then show it in a file tree.

```typescript
async function handleFileCreated(path: string) {
  const docName = pathToDocName(path);
  // Update project index
  const indexConn = await hocuspocus.openDirectConnection('_project_index');
  await indexConn.transact((doc) => {
    const index = doc.getMap('files');
    const stat = statSync(path);
    index.set(docName, { size: stat.size, mtime: stat.mtimeMs });
  });
  await indexConn.disconnect();
}
```

---

### Finding: VS Code uses truncate-and-write (not atomic rename) by default, with atomic writes for internal data
**Confidence:** CONFIRMED
**Evidence:** VS Code GitHub issue #98063, issue #195539

VS Code's default file save behavior:
1. Open the existing file
2. Truncate to 0 bytes
3. Write the new content

This is NOT atomic. A crash between truncate and write leaves an empty file. VS Code relies on its backup system for recovery.

VS Code's internal data (settings, state) uses atomic writes (write to temp, rename). There is an active feature request (#98063) to add atomic saves for user files, but as of the most recent discussion, it has not been implemented as a default.

**Auto-save modes (configurable in VS Code):**
- `afterDelay` (default delay: 1000ms after last keystroke)
- `onFocusChange` (when editor loses focus)
- `onWindowChange` (when VS Code window loses focus)

**Implications for @parcel/watcher:** VS Code's truncate-and-write produces a single `update` event (not a delete+create). The watcher handles this correctly. The auto-save delay of 1000ms means saves happen at most once per second during active typing.

---

### Finding: Cursor inherits VS Code's save mechanism but auto-save is enabled by default
**Confidence:** INFERRED
**Evidence:** Cursor community forum discussions, VS Code fork analysis

Cursor is a VS Code fork. Its file I/O subsystem is inherited from VS Code:
- Same truncate-and-write mechanism
- Same `files.autoSave` setting (defaulting to `afterDelay` with a short delay)
- Auto-save frequency has been requested as adjustable by the community, suggesting it's not easily configurable
- When the Cursor agent modifies files, it writes them directly to disk using the same file service

Cursor's agent writes produce the same pattern as manual saves: a single write to the file, which @parcel/watcher reports as a single `update` event.

---

## Gaps / follow-ups

* The exact auto-save delay in Cursor (default value) is not publicly documented. It may differ from VS Code's default of 1000ms.
* VS Code's `files.atomicSaves` setting may have been added in a recent release -- need to verify against the latest VS Code release notes.
* The three-way merge approach (Option B for concurrent edits) requires storing the last-persisted content as a snapshot. This adds memory overhead but is the only way to safely merge concurrent CRDT and disk changes.
