---
title: "CRDT Branching, Namespacing, and Context-Switching in Collaborative Editors: Prior Art and Implementation Patterns"
description: "Whether any CRDT-based collaborative editing system has implemented branching, namespacing, or context-switching where the same editor switches between different versions/branches of content, each backed by its own CRDT state. Covers AFFiNE/BlockSuite, Outline, Hocuspocus, Yjs, Loro, Automerge, Ink & Switch research prototypes (Upwelling, Patchwork), Figma branching, and four concrete implementation patterns for ProseMirror + TipTap + Yjs + Hocuspocus."
createdAt: 2026-04-02
updatedAt: 2026-04-02
subjects:
  - Yjs
  - Hocuspocus
  - TipTap
  - ProseMirror
  - y-prosemirror
  - Loro
  - Automerge
  - AFFiNE
  - BlockSuite
  - Outline
  - Figma
  - Ink & Switch
  - Upwelling
  - Patchwork
topics:
  - CRDT branching
  - collaborative editor versioning
  - document context switching
  - Y.Doc lifecycle
  - draft isolation
  - branch-aware persistence
---

# CRDT Branching, Namespacing, and Context-Switching in Collaborative Editors

**Purpose:** Determine whether any production or research system has combined CRDT-based real-time collaborative editing with git-style branching -- where the same editor instance can switch between branches, each backed by its own CRDT state -- and identify the concrete technical approach for implementing this pattern with ProseMirror + TipTap + Yjs + Hocuspocus.

---

## Executive Summary

After investigating 12 systems (6 production editors, 3 CRDT libraries, 3 research prototypes), the Yjs community forum, and academic literature, the central finding is:

**No production system has implemented the exact pattern of switching a CRDT-backed collaborative editor between git branches.** The concept of "CRDT branching" exists primarily in research prototypes (Ink & Switch's Upwelling and Patchwork) and in Loro's purpose-built API, but none of these have been deployed in a production editor that switches between branches the way a knowledge platform requires.

However, the building blocks are well-established and the most practical implementation path is clear: **use Hocuspocus document naming as the namespacing mechanism, where each branch gets its own document name (and thus its own Y.Doc), and switch branches by destroying and recreating the editor bound to the new document.** This is not a hack -- it is how Hocuspocus was designed to handle distinct documents, and the pattern extends naturally to branch isolation.

The more ambitious approach -- using Loro's native `fork()`/`merge()` API for true CRDT-level branching -- is theoretically superior but carries significant ecosystem risk: loro-prosemirror is v0.4.x (pre-1.0), there is no Hocuspocus equivalent for Loro, and no production case studies exist.

**Key Findings:**

- **No production editor does branch switching on CRDTs.** AFFiNE, Outline, Notion, Google Docs, and Figma all use linear version history. Figma's "branching" creates full file copies, not CRDT forks.
- **Upwelling (Ink & Switch) is the closest prior art.** It implements "drafts as CRDT branches" using Automerge + ProseMirror, but is a research prototype built on an experimental Automerge fork.
- **Hocuspocus document naming IS the branching mechanism.** Using `article.123.main` and `article.123.draft-1` as document names gives you isolated Y.Docs per branch with full lifecycle management, persistence hooks, and multiplexing -- all built into Hocuspocus.
- **Yjs cannot merge branches at the CRDT level.** Merging two independently-edited Y.Docs produces interleaved text. Branch merge must be application-level (text diffing), not CRDT-level.
- **Loro is the only CRDT library with native branching APIs** (`fork()`, `forkAt()`, `checkout()`, `import()/export()`), and its eg-walker-inspired merge avoids the interleaving problem. But its ecosystem is young.
- **y-prosemirror cannot rebind to a different Y.Doc.** Switching documents requires destroying the editor and recreating it with new plugins bound to the new Y.Doc.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| 1 | AFFiNE / BlockSuite branching & versioning | P0 | Moderate | CONFIRMED -- no branching |
| 2 | Outline version history & CRDT interaction | P0 | Moderate | CONFIRMED -- linear history only |
| 3 | Hocuspocus multi-Y.Doc management & document naming | P0 | Deep | CONFIRMED -- document naming is the mechanism |
| 4 | Yjs branching, snapshots, and limitations | P0 | Deep | CONFIRMED -- no native branching |
| 5 | Loro branching API & ProseMirror maturity | P0 | Deep | CONFIRMED -- native branching, young ecosystem |
| 6 | Academic/research: CRDT branching prototypes | P0 | Moderate | CONFIRMED -- Upwelling, Patchwork, eg-walker |
| 7 | Production editors with branch-like features | P1 | Moderate | CONFIRMED -- Figma copies files, others are linear |
| 8 | Implementation patterns for the specific use case | P0 | Deep | INFERRED -- Pattern B recommended |

**Stance:** Factual with conclusions.
**Non-goals:** Implementing the solution, designing the merge UI, choosing between approaches for a specific project, designing the git integration layer.

---

## Detailed Findings

### 1. AFFiNE / BlockSuite: CRDT-Native but No Branching

**Finding:** BlockSuite uses a DocCollection of Yjs subdocuments with page-level isolation, but has no branching, forking, or version-switching capabilities. AFFiNE's page history is linear CRDT snapshots, not branches.

**Evidence:** [evidence/affine-blocksuite-versioning.md](evidence/affine-blocksuite-versioning.md)

[BlockSuite](https://blocksuite.io/guide/store.html) architecture:
- Each `Doc` holds a Yjs subdocument (`doc.spaceDoc`)
- A `DocCollection` manages multiple Docs
- Providers (IndexedDB, WebSocket) attach for sync
- The `Job` class enables JSON snapshot export/import (`docToSnapshot` / `snapshotToDoc`)

Snapshot export creates a new, independent Doc -- not a fork that can be merged back. There is no `doc.branch()`, no `doc.fork()`, no way to create alternative versions of a page within the API.

[AFFiNE](https://docs.affine.pro/) Pro introduced "unified page history" which stores periodic CRDT snapshots and supports viewing historical states. This is linear history (like "undo" to a point in time), not branching. No git integration exists or is planned.

**Implications:** AFFiNE's subdocument hierarchy enables lazy loading and page isolation, but cannot be repurposed for branching. The architecture would need fundamental changes to support branch-aware editing.

---

### 2. Outline: Revision History Separate from CRDT

**Finding:** Outline stores revisions as database records independent of the Yjs collaboration layer. Restoring a version creates a new revision (append-only), not a CRDT revert. No branching concept exists.

**Evidence:** [evidence/outline-versioning.md](evidence/outline-versioning.md)

[Outline](https://www.getoutline.com/) (5+ years production with ProseMirror + Yjs):
- Stores version snapshots at minimum every 5 minutes
- Uses a `revisions.list` API endpoint (refactored in [PR #8497](https://github.com/outline/outline/pull/8497), Feb 2025)
- Restoring a version "will create another version and not rollback history" -- non-destructive
- Revisions can be viewed with diffs and downloaded as HTML/Markdown

The revision system operates at the application layer, not the CRDT layer. There is no mechanism to load a previous version into the Yjs document for editing, and no concept of draft branches.

**Implications:** Outline validates that a production ProseMirror + Yjs system can have version history without CRDT-level branching. The version system is a separate concern layered on top. This pattern works for "view history" but not for "edit on a different branch."

---

### 3. Hocuspocus: Document Naming as the Branch Namespace

**Finding:** Hocuspocus document naming is the primary mechanism for CRDT-level branch isolation. Each unique `documentName` gets an independent Y.Doc with its own lifecycle, persistence, and client set. The `onConnect` hook can pass branch context through the entire hook chain.

**Evidence:** [evidence/hocuspocus-document-lifecycle.md](evidence/hocuspocus-document-lifecycle.md)

[Hocuspocus](https://tiptap.dev/docs/hocuspocus/) uses `documentName` as the primary document identifier. The recommended pattern is `entityType.entityID`, which extends naturally to branches:

```
article.123.main     -> main branch of article 123
article.123.draft-1  -> draft-1 branch of article 123
```

The hook chain supports branch-aware operations:

```javascript
async onConnect(data) {
  const branch = data.requestParameters.get("branch") || "main";
  return { branch };  // Flows to all downstream hooks via context
},

async onLoadDocument(data) {
  return await loadYDocFromDB(data.documentName, data.context.branch);
},

async onStoreDocument(data) {
  await saveYDocToDB(data.documentName, data.context.branch, data.document);
}
```

Key lifecycle behaviors:
- Y.Doc is loaded into memory when the first client connects to a document name
- Y.Doc is freed from memory when the last client disconnects (`afterUnloadDocument`)
- Multiple documents can be multiplexed over a single WebSocket connection
- Each document name has completely independent CRDT state

**Critical warning:** When creating a branch Y.Doc, it must be initialized from the parent Y.Doc's binary state (`Y.encodeStateAsUpdate`), not from extracted text. Creating a new Y.Doc from text produces new CRDT items; merging this back with the original will double the content, because Yjs merges insertions without deduplication.

**Implications:** Hocuspocus already has the infrastructure for branch isolation. No new features are needed in Hocuspocus itself. The work is in: (a) the naming convention, (b) branch creation logic (binary state initialization), (c) client-side editor lifecycle management, and (d) branch merge (application-level, not CRDT-level).

---

### 4. Yjs: Snapshots and Serialization but No Native Branching

**Finding:** Yjs provides `Y.encodeStateAsUpdate` / `Y.applyUpdate` for serialization and `Y.snapshot()` for point-in-time views, but has no branching API. Merging two independently-edited Y.Docs interleaves text characters, producing broken content. Kevin Jahns (Yjs creator) confirmed that git-style branching contradicts CRDT merge semantics for text.

**Evidence:** [evidence/yjs-branching-limitations.md](evidence/yjs-branching-limitations.md)

From the [Yjs community discussion on branches](https://discuss.yjs.dev/t/document-branches-like-git-branches/697), Jahns explained that updates have interdependencies preventing selective (cherry-pick) merging, and document cloning is possible but true branching with independent histories produces broken text on merge.

The fundamental problem with Yjs text merge:

```
docA: "Hello World" -> "Hello Beautiful World"  (independent edit)
docB: "Hello World" -> "Hello Amazing World"    (independent edit)

Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB))
Result: "Hello BAeamuatiizfiunlg World"  -- interleaved characters
```

Yjs CRDTs are designed for concurrent real-time editing where all parties see each other's changes. They are NOT designed for independent editing on divergent branches followed by merge. The CRDT guarantees convergence (all clients end up with the same state) but not semantic correctness of the merged result.

Snapshot capabilities:
- `Y.snapshot(doc)` -- captures `{ deleteSet, stateVector }` (small, efficient)
- `Y.createDocFromSnapshot(originDoc, snapshot)` -- read-only historical view (requires `gc: false`)
- Version recovery requires UndoManager workarounds that rely on non-public internals

The [prosemirror-versions demo](https://github.com/yjs/yjs-demos/tree/main/prosemirror-versions) shows snapshot viewing and diff rendering, but does NOT implement version switching for editing or any branching concept.

**Implications:** Yjs is the right tool for real-time collaboration within a branch, but cannot serve as the merge mechanism between branches. Branch merge must be application-level: extract text from both branches, compute a three-way diff (using the branch point as the base), resolve conflicts in the UI, and apply the resolved changes as Yjs operations on the target branch's Y.Doc.

---

### 5. Loro: Native Branching API but Young Ecosystem

**Finding:** [Loro](https://github.com/loro-dev/loro) is the only CRDT library with purpose-built branching APIs (`fork()`, `forkAt()`, `checkout()`, `import()/export()`) that map directly to git semantics. Its eg-walker-inspired merge avoids the text interleaving problem. However, loro-prosemirror is v0.4.x (pre-1.0), there is no collaboration server equivalent to Hocuspocus, and no production case studies exist.

**Evidence:** [evidence/loro-branching-api.md](evidence/loro-branching-api.md)

Loro's branching API:

```javascript
const branch = doc.fork();              // git clone
const branch = doc.forkAt(frontiers);   // git checkout <commit> -b branch
doc.checkout(frontiers);                // time-travel (read-only)
doc.detach();                           // freeze at current version
doc.checkoutToLatest();                 // return to HEAD

// Sync (like git push/pull)
const bytes = doc.export({ mode: "update" });
otherDoc.import(bytes);

// Delta updates
const delta = doc.export({ mode: "update", from: lastKnownVersion });
otherDoc.import(delta);
```

[loro-prosemirror](https://github.com/loro-dev/loro-prosemirror) (v0.4.3, Feb 2026) provides `LoroSyncPlugin`, `LoroUndoPlugin`, and `LoroEphemeralCursorPlugin`. It supports multiple editor instances per document via custom ContainerIDs.

Maturity comparison:

| Aspect | Yjs | Loro |
|--------|-----|------|
| Core library | 10+ years, thousands of production deployments | 1.0 released, 5.5k stars, limited production evidence |
| ProseMirror binding | y-prosemirror (mature, widely used) | loro-prosemirror v0.4.x (pre-1.0, active development) |
| Collaboration server | Hocuspocus (production-grade) | None -- custom WebSocket sync required |
| TipTap extension | Official Collaboration extension | None -- custom integration required |
| Managed services | Liveblocks, TipTap Cloud | None |
| Branching | Not supported | Native, purpose-built |
| Text merge quality | Interleaves concurrent edits | Eg-walker-inspired, sensible merge results |

**Implications:** Loro is the architecturally correct solution for CRDT branching. If the ecosystem were mature, it would be the recommendation. Today, the ecosystem gap (no collaboration server, pre-1.0 ProseMirror binding, no TipTap support, no managed services) makes it a high-risk choice for production. It is worth monitoring and potentially adopting in 6-12 months as the ecosystem matures.

---

### 6. Academic/Research: Upwelling and Patchwork Validate the Concept

**Finding:** Ink & Switch's [Upwelling](https://www.inkandswitch.com/upwelling/) (2023) is the closest prior art to "CRDT branches in a collaborative editor." It implements drafts as isolated editing branches on a single Automerge document, with ProseMirror as the editor. Patchwork (2024) extends this with retroactive branching. Martin Kleppmann identified CRDT branching as an open research problem in 2019; by 2025, Loro and eg-walker have made it technically feasible.

**Evidence:** [evidence/academic-crdt-branching.md](evidence/academic-crdt-branching.md)

**Upwelling** implements exactly the concept the user is asking about:
- Drafts function as independent, unmerged layers within a single Automerge document
- "Drafts are independent from each other: edits made in one draft do not appear in other drafts"
- Users switch between drafts via a dropdown menu
- Merge uses the CRDT to incorporate changes, with automatic rebasing of other active drafts
- Built on Automerge (experimental fork) + ProseMirror + TypeScript/React

Key distinction: Upwelling uses a single Automerge document with metadata layers to track draft membership, not separate documents per branch. This is architecturally different from the "separate Y.Doc per branch" approach.

**Patchwork** (2024) adds:
- Retroactive branch creation (select past edits and move them to a branch)
- Fast, low-ceremony branch creation and switching
- Side-by-side diff viewing
- Limitation: branches only from main, not from other branches

**Eg-walker** (EuroSys 2025, Gentle + Kleppmann) proves that efficient CRDT branch merging is possible: "merging long-running branches is orders of magnitude faster" than OT. Loro implements eg-walker-inspired techniques.

**Implications:** The research community has validated CRDT branching as both desirable and feasible. The gap is between research prototypes and production systems. No one has productionized this pattern yet.

---

### 7. Production Editors: Figma Copies Files, Everyone Else is Linear

**Finding:** Figma is the only production editor with "branching," and it creates full file copies -- not CRDT forks. Notion, Google Docs, VS Code, and Obsidian all use linear version history with no branching concept. No production system loads a different version into the CRDT-backed editor for editing.

**Evidence:** [evidence/figma-branching-architecture.md](evidence/figma-branching-architecture.md)

[Figma branching](https://help.figma.com/hc/en-us/articles/360063144053-Guide-to-branching):
- Creates "an exact replica of the main file" -- full copy, not a CRDT fork
- Each branch is an independent file with its own CRDT state
- Server-mediated merge with manual conflict resolution for design-specific conflicts
- Merge creates a single checkpoint in main's version history

This is conceptually closest to Pattern B (separate documents per branch), but at the Figma infrastructure level rather than using Yjs/Hocuspocus.

Other editors:
- **Notion:** CRDT for structure + OT for text, linear snapshots, no branching
- **Google Docs:** OT-based, version history is view-only, restore creates a new version
- **VS Code:** Each file has independent state, Live Share is per-file OT
- **Obsidian:** Local files, no CRDT, no branching (version history via git plugin, not in-editor)

**Implications:** The user's requirement ("same editor, switch between branches") is genuinely novel in production systems. Figma's approach (independent files per branch) is the closest production precedent and validates Pattern B conceptually.

---

### 8. Implementation Patterns for ProseMirror + TipTap + Yjs + Hocuspocus

**Finding:** Four implementation patterns exist. Pattern B (Hocuspocus document naming as branch namespace) is the recommended approach: proven infrastructure, clean isolation, minimal new code, and no CRDT library changes required.

**Evidence:** [evidence/implementation-patterns.md](evidence/implementation-patterns.md), [evidence/editor-document-switching.md](evidence/editor-document-switching.md)

#### Pattern A: Destroy and Recreate Y.Doc

1. Serialize current branch state (`Y.encodeStateAsUpdate`)
2. Store serialized state
3. Destroy Y.Doc, provider, editor
4. Create new Y.Doc for target branch
5. Load target branch state (`Y.applyUpdate`)
6. Recreate provider and editor

**Assessment:** Works but requires manual state management. Hocuspocus handles most of this automatically if you use Pattern B instead.

#### Pattern B: Hocuspocus Document Naming (Recommended)

Each branch is a separate Hocuspocus document:

```typescript
// Client
function EditorForBranch({ docId, branch }: Props) {
  // React key forces clean remount on branch change
  return <Editor key={`${docId}-${branch}`} docName={`${docId}.${branch}`} />;
}

function Editor({ docName }: { docName: string }) {
  const ydoc = useMemo(() => new Y.Doc(), [docName]);
  const provider = useMemo(() =>
    new HocuspocusProvider({ url: WS_URL, name: docName, document: ydoc }),
    [docName]
  );

  useEffect(() => {
    return () => { provider.destroy(); ydoc.destroy(); };
  }, [provider, ydoc]);

  // ... create TipTap editor with Collaboration extension
}
```

```typescript
// Server (Hocuspocus)
const server = new Server({
  async onLoadDocument({ documentName }) {
    const [docId, branch] = documentName.split('.');
    return await db.loadYDoc(docId, branch);
  },
  async onStoreDocument({ documentName, document }) {
    const [docId, branch] = documentName.split('.');
    await db.saveYDoc(docId, branch, Y.encodeStateAsUpdate(document));
  },
});
```

Branch creation:
```typescript
async function createBranch(docId: string, sourceBranch: string, newBranch: string) {
  const sourceDoc = await db.loadYDoc(docId, sourceBranch);
  const state = Y.encodeStateAsUpdate(sourceDoc);
  const branchDoc = new Y.Doc();
  Y.applyUpdate(branchDoc, state);  // Initialize from binary state, NOT text
  await db.saveYDoc(docId, newBranch, Y.encodeStateAsUpdate(branchDoc));
}
```

**Assessment:** This is the recommended approach. It uses Hocuspocus exactly as designed, provides clean isolation between branches, supports multiple users per branch, and requires no changes to Yjs, y-prosemirror, TipTap, or Hocuspocus.

The tradeoff is that branch switching requires an editor remount (visible to the user as a brief reload), and branch merge is an application-level concern (text diffing, not CRDT merge).

#### Pattern C: Hot-Swap Binding (Not Feasible Today)

Pre-load both branch Y.Docs and swap which one the editor binds to.

**Assessment:** Not feasible. y-prosemirror's `ySyncPlugin` binds to a Y.XmlFragment at creation time and cannot be rebound. A custom fork of y-prosemirror or a dual-editor DOM-swapping approach would be needed, adding significant complexity for marginal UX improvement.

#### Pattern D: Replace Yjs with Loro

Use Loro's native `fork()`/`forkAt()`/`import()`/`export()` for true CRDT-level branching.

**Assessment:** Architecturally superior but high risk today. loro-prosemirror is v0.4.x, there is no collaboration server, no TipTap extension, and no production track record. Worth revisiting in 6-12 months.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Branch merge UX:** How to present three-way diffs to non-technical users in a knowledge platform (not a code editor). No production precedent for CRDT-backed branch merge UI outside of Figma's design-specific approach.
- **Performance of branch switching:** How fast is the editor remount + Hocuspocus document load cycle? No benchmarks found. Expected to be sub-second for typical article sizes but not verified.
- **Concurrent editing across branches:** If users A and B are both editing different branches of the same article, does Pattern B handle this cleanly? Hocuspocus should handle it (separate document names = separate rooms), but this is untested in the specific branching context.

### Out of Scope (per Rubric)

- Implementation code for any pattern
- Merge UI/UX design
- Git integration layer design (how git branches map to Hocuspocus document names)
- Choosing between patterns for a specific project

---

## References

### Evidence Files

- [evidence/affine-blocksuite-versioning.md](evidence/affine-blocksuite-versioning.md) -- AFFiNE/BlockSuite architecture, no branching
- [evidence/outline-versioning.md](evidence/outline-versioning.md) -- Outline revision history, separate from CRDT
- [evidence/hocuspocus-document-lifecycle.md](evidence/hocuspocus-document-lifecycle.md) -- Hocuspocus hooks, document naming, lifecycle
- [evidence/yjs-branching-limitations.md](evidence/yjs-branching-limitations.md) -- Yjs snapshots, fork/merge limitations
- [evidence/loro-branching-api.md](evidence/loro-branching-api.md) -- Loro fork/checkout/merge API, ecosystem maturity
- [evidence/academic-crdt-branching.md](evidence/academic-crdt-branching.md) -- Upwelling, Patchwork, eg-walker, Kleppmann
- [evidence/figma-branching-architecture.md](evidence/figma-branching-architecture.md) -- Figma file-copy branching, Notion/Google Docs
- [evidence/implementation-patterns.md](evidence/implementation-patterns.md) -- Four patterns for branch switching
- [evidence/editor-document-switching.md](evidence/editor-document-switching.md) -- y-prosemirror/TipTap document switching mechanics

### External Sources

- [Hocuspocus Hooks Documentation](https://tiptap.dev/docs/hocuspocus/server/hooks) -- Hook chain, document naming, context passing
- [Yjs Community: Document Branches Like Git](https://discuss.yjs.dev/t/document-branches-like-git-branches/697) -- Kevin Jahns on branching limitations
- [Yjs Community: Version History](https://discuss.yjs.dev/t/correct-way-to-implement-version-history-like-google-doc/1691) -- Version history implementation patterns
- [Upwelling (Ink & Switch)](https://www.inkandswitch.com/upwelling/) -- Drafts as CRDT branches research prototype
- [Patchwork (Ink & Switch)](https://www.inkandswitch.com/patchwork/notebook/) -- Retroactive branching on CRDTs
- [Loro API Reference](https://loro.dev/docs/api/js) -- Fork, checkout, detach, import/export APIs
- [loro-prosemirror](https://github.com/loro-dev/loro-prosemirror) -- ProseMirror binding for Loro
- [Eg-walker Paper (EuroSys 2025)](https://arxiv.org/abs/2409.14252) -- Efficient CRDT branch merging algorithm
- [Figma Branching Guide](https://help.figma.com/hc/en-us/articles/360063144053-Guide-to-branching) -- Full file copy branching
- [Martin Kleppmann: Local-First Software](https://martin.kleppmann.com/papers/local-first.pdf) -- CRDT branching as open problem
- [Liveblocks Yjs Best Practices](https://liveblocks.io/docs/guides/yjs-best-practices-and-tips) -- Room switching guidance
- [BlockSuite Store Architecture](https://blocksuite.io/guide/store.html) -- DocCollection, subdocuments

### Related Research

- [Multi-File CRDT Operations](../multi-file-crdt-operations/REPORT.md) -- Covers CRDT fork/branch/merge patterns (Loro, Automerge, Figma), Y.Doc initialization from files, and the duplication trap
- [Source of Truth, Persistence, and Collaboration](../source-of-truth-persistence-collaboration/REPORT.md) -- Covers BlockSuite stash/pop, CRDT document granularity, and collaboration topology
- [CRDT-MCP Filesystem Bridge](../crdt-mcp-filesystem-bridge/REPORT.md) -- Covers Hocuspocus DirectConnection and CRDT-level file operations
- [Collaborative Editor Auth and Document Lifecycle](../collaborative-editor-auth-secrets-lifecycle/REPORT.md) -- Covers Hocuspocus document lifecycle, unloading behavior, and permission models
