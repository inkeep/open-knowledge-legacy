# Evidence: AFFiNE / BlockSuite Versioning Architecture

**Dimension:** AFFiNE & BlockSuite branching/versioning capabilities
**Date:** 2026-04-02
**Sources:** BlockSuite docs (blocksuite.io), AFFiNE docs (docs.affine.pro), GitHub (toeverything/blocksuite, toeverything/AFFiNE)

---

## Key files / pages referenced

- https://blocksuite.io/guide/store.html -- Doc/DocCollection architecture
- https://blocksuite.io/guide/data-synchronization.html -- CRDT-native sync and providers
- https://docs.affine.pro/blocksuite-wip/architecture -- Overall architecture
- https://github.com/toeverything/AFFiNE/issues/9557 -- Historical version issues

---

## Findings

### Finding: BlockSuite uses a DocCollection of Yjs subdocuments but has no branching concept
**Confidence:** CONFIRMED
**Evidence:** https://blocksuite.io/guide/store.html

BlockSuite's architecture:
- Each `Doc` holds a Yjs subdocument (`doc.spaceDoc`)
- A `DocCollection` manages multiple Docs (one per page/surface)
- The `doc.load()` API distinguishes creating vs loading documents
- Providers (IndexedDB, WebSocket) attach to `doc.spaceDoc` for sync

```typescript
const collection = new DocCollection({ schema });
collection.meta.initialize();
const doc = collection.createDoc();
```

There is no branching API, no fork/merge mechanism, no way to create alternative versions of a Doc within BlockSuite's API.

**Implications:** BlockSuite's Doc/DocCollection is a flat namespace -- pages are unique, not branched. The subdocument hierarchy enables lazy loading and isolation between pages, but not version branching within a page.

### Finding: AFFiNE has page history via CRDT snapshots, not branches
**Confidence:** CONFIRMED
**Evidence:** AFFiNE docs, GitHub issues

AFFiNE Pro introduced "unified page history" which:
- Stores Y.js state as snapshots
- Merges updates into snapshots periodically
- Moves old snapshots to history storage
- Does NOT expose branch/fork/merge semantics to users

There is no concept of "draft branches" in AFFiNE. History is linear snapshots of CRDT state.

### Finding: BlockSuite snapshot API enables JSON import/export but not branching
**Confidence:** CONFIRMED
**Evidence:** https://blocksuite.io/guide/data-synchronization.html

```typescript
import { Job } from '@blocksuite/store';
const job = new Job({ collection });
const json = await job.docToSnapshot(doc);
const newDoc = await job.snapshotToDoc(json);
```

This creates a new, independent Doc from JSON -- not a fork that can be merged back. The snapshot is a point-in-time export, not a branch point.

### Finding: No git integration in AFFiNE
**Confidence:** CONFIRMED (via negative search)

Searched: AFFiNE docs, GitHub issues, community forums for "git integration", "git sync", "git branch"
Result: No git integration exists or is planned. AFFiNE's persistence is cloud-based (OctoBase) or local (IndexedDB).

---

## Negative searches

- Searched "branching" in BlockSuite docs -> no results beyond block tree structure
- Searched AFFiNE GitHub issues for "branch", "version control", "fork" -> no relevant results
- Searched AFFiNE community forum for "git" -> no integration planned

---

## Gaps / follow-ups

- AFFiNE's y-octo (Rust Yjs implementation) internals not examined -- unlikely to add branching given no API surface
