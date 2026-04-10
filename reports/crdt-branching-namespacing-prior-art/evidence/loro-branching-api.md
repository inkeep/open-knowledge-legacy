# Evidence: Loro CRDT Branching and Version Control

**Dimension:** Loro as an alternative to Yjs with native branching
**Date:** 2026-04-02
**Sources:** Loro docs (loro.dev), GitHub (loro-dev/loro, loro-dev/loro-prosemirror), npm (loro-crdt)

---

## Key files / pages referenced

- https://loro.dev/docs/api/js -- JavaScript API reference
- https://github.com/loro-dev/loro -- Core library (5.5k stars, 1.0 released)
- https://github.com/loro-dev/loro-prosemirror -- ProseMirror binding (v0.4.3)
- https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567 -- Yjs vs Loro comparison

---

## Findings

### Finding: Loro has purpose-built branching APIs that map directly to git semantics
**Confidence:** CONFIRMED
**Evidence:** loro.dev/docs/api/js, GitHub README

Loro provides:

```javascript
// Fork: create independent branch from current state
const branch = doc.fork();  // = git clone

// Fork at a specific point in history
const branch = doc.forkAt(frontiers);  // = git checkout <commit> -b branch

// Checkout: time-travel to a specific version (read-only)
doc.checkout(frontiers);  // doc becomes read-only at that point

// Detach: freeze at current version
doc.detach();

// Attach: resume tracking latest changes
doc.checkoutToLatest();  // = return to HEAD

// Import/export for sync (like git push/pull)
const bytes = doc.export({ mode: "update" });
otherDoc.import(bytes);

// Delta updates (like git fetch + merge)
const delta = doc.export({ mode: "update", from: lastKnownVersion });
otherDoc.import(delta);
```

After `checkout()`, the document enters "detached" mode (read-only by default). `checkoutToLatest()` returns to editing mode.

**Implications:** Loro's API is the closest thing to "git for CRDTs" that exists. Fork creates a true independent branch that can be edited independently and merged back via import/export. The merge uses Loro's Fugue-based CRDT algorithm, which handles text merging better than Yjs (no interleaving).

### Finding: Loro uses eg-walker-inspired merge that avoids Yjs interleaving problem
**Confidence:** CONFIRMED
**Evidence:** GitHub README, Kleppmann eg-walker paper

Loro combines:
- Fugue-based CRDT core for text editing
- Eg-walker-inspired techniques for merge: "replay only the divergent history when merging"
- No permanent tombstones (unlike Yjs)
- Fast local edits with efficient merges

The eg-walker approach means branching + merging produces sensible results for text, unlike Yjs where concurrent text edits interleave characters.

### Finding: loro-prosemirror provides ProseMirror integration but is pre-1.0
**Confidence:** CONFIRMED
**Evidence:** GitHub (loro-dev/loro-prosemirror), npm releases

loro-prosemirror v0.4.3 (Feb 2026) provides:
- `LoroSyncPlugin` -- bidirectional sync between Loro and ProseMirror
- `LoroUndoPlugin` -- collaborative undo/redo
- `LoroEphemeralCursorPlugin` -- cursor/presence sync
- Custom ContainerID support (multiple editors per doc)

Multi-instance support:
```typescript
const map = doc.getMap("<unique-id>");
LoroSyncPlugin({ doc, containerId: map.id });
```

The binding is pre-1.0 (v0.4.x) with active development and recent bug fixes for stability issues (position restoration, out-of-bounds, destroyed views).

### Finding: Loro core reached 1.0 but the ecosystem is young
**Confidence:** CONFIRMED
**Evidence:** GitHub releases, npm

- Loro core: 1.0 released (5.5k GitHub stars, 121 releases, Rust-first with WASM for JS)
- loro-prosemirror: v0.4.3 (pre-1.0)
- No Hocuspocus-equivalent collaboration server
- No TipTap extension (would need custom integration)
- Limited production usage evidence compared to Yjs

### Finding: Loro could theoretically replace Yjs but the migration cost is high
**Confidence:** INFERRED
**Evidence:** API comparison, ecosystem analysis

Migration would require:
- Replace y-prosemirror with loro-prosemirror
- Replace y-websocket/Hocuspocus with custom WebSocket sync (Loro provides `export`/`import` primitives but no server)
- Replace y-indexeddb with custom persistence
- No TipTap Collaboration extension equivalent
- No Liveblocks-style managed service

The branching capability gain is real, but the ecosystem gap is significant.

---

## Gaps / follow-ups

- No production case studies of Loro + ProseMirror at scale
- loro-prosemirror document switching behavior not documented
- No Loro equivalent to Hocuspocus DirectConnection for server-side mutations
