---
title: Y.js attribution capabilities — verification (v13.6.30 + v14.0.0-rc.x)
description: Rigorous verification of per-agent character-level attribution claims for Y.js. Surfaces v14 AttributionManager/IdMap as a real pathway, and PermanentUserData as a partial v13 mechanism. Refines the binary "Option B infeasible" framing into a feasibility spectrum.
tags: [evidence, spec-input, yjs, attribution, crdt, v14]
sources: [node_modules/yjs/src/utils/ID.js, node_modules/yjs/src/utils/Transaction.js, node_modules/yjs/src/utils/UndoManager.js, node_modules/yjs/src/utils/PermanentUserData.js, node_modules/yjs/src/structs/Item.js, node_modules/yjs/src/utils/encoding.js, ~/.claude/oss-repos/yjs/src/utils/AttributionManager.js, ~/.claude/oss-repos/yjs/attribution-manager.md, ~/.claude/oss-repos/yjs/attributing-content.md]
---

# Y.js attribution capabilities — verification

**Scope:** Verify claims in `crdt-to-git-translation.md` §3 (Origin survival analysis) against `yjs@13.6.30` (Open Knowledge's pinned version) and `yjs@14.0.0-rc.x` (latest RC, April 2026).

## Summary of verified claims

| Claim | Status | Notes |
|---|---|---|
| C1. `ID = {client, clock}` only | **CONFIRMED** | Both v13 and v14. No attribution field. |
| C2. `transaction.origin` not persisted on items | **CONFIRMED** | Transient runtime ref; dropped after listeners. |
| C3. Wire protocol doesn't encode origin | **CONFIRMED** | `Item.write` carries info + structural origin (leftID/rightID) + content. Zero transaction-origin field. |
| C4. No API to enumerate items by origin post-facto | **CONFIRMED for v13**; **REFUTED for v14** | v14 introduces `AttributionManager` + `IdMap`. |
| C5. No ecosystem attribution plugin | **REFUTED in part** | `PermanentUserData` exists in v13 with coarse attribution. |
| C6. UndoManager captures origin at transaction time | **CONFIRMED** | At transaction-granularity, exposed via `stack-item-added` event, NOT stored on StackItem. |
| C7. Automerge has per-change actor ID | **CONFIRMED** | Structural difference from yjs. |
| C8. Recent developments | **CONFIRMED** | v14 introduces attribution; v13 stable unchanged. |

## Where prior analysis was wrong or incomplete

The `crdt-to-git-translation.md` evidence said "Option B (isolated contributions) is infeasible." That's strictly true for v13.6.30 out of the box. It misses two paths:

### Path 1 — PermanentUserData (v13, partial)

`/node_modules/yjs/src/utils/PermanentUserData.js:14-141` provides:

- `setUserMapping(doc, clientid, userDescription, { filter })` — maps a Y.Doc `clientID` to a user string. On every local `afterTransaction`, appends the transaction's deleteSet to that user's delete-set in a special `users` Y.Map (line 108-118).
- `getUserByClientId(clientid)` — returns user string for a clientid (line 125-127).
- `getUserByDeletedId(id)` — iterates per-user delete-sets; returns who deleted a given Item ID (line 133-140).

**What this gives you, today, in v13:**
- Coarse per-clientID attribution if there's a 1:1 mapping of agent ↔ Y.Doc-clientID.
- Accurate per-user delete tracking.
- No per-character insert attribution beyond "this clientID owns this insertion (read from `Item.id.client`)."

**Why the 1:1 mapping is hard in Open Knowledge's current architecture:**
- Today, agents write through server-side DirectConnection to a shared server Y.Doc. The server Y.Doc has ONE `clientID`. Every agent's write goes through that same clientID.
- To make PermanentUserData useful, each agent would need its own `clientID` on each write. Architecturally this means either:
  - (a) Each agent connects with its own Y.Doc client (like browsers do via HocuspocusProvider), syncs, writes, disconnects — abandons server-authoritative writes, violates precedent #14.
  - (b) Server-side: for each agent session, create a subordinate Y.Doc that writes to a separate clientID and sync-merges into the main. Overhead questionable; not the natural Y.js pattern.
- The `users` Map also grows unbounded with many short-lived connection cycles (every new clientID persists).

**Verdict:** PermanentUserData is designed for human collaboration where users have stable identities and infrequent new connections. Shoehorning it to multi-agent-server-authoritative is awkward and partially violates existing precedents.

### Path 2 — v14 AttributionManager + IdMap (proper Option B, RC)

v14.0.0-rc.x ships a first-class attribution subsystem. From `~/.claude/oss-repos/yjs/attribution-manager.md` and `attributing-content.md`:

- `IdMap` — new data structure mapping `{client, clock}` ranges → arbitrary attribution attributes. Sibling to `IdSet` (renamed `DeleteSet`).
- `DiffAttributionManager` (`AttributionManager.js:363-450`) — compares two Y.Docs or snapshots, computes the diff, produces `IdMap`s attributing each inserted/deleted range.
- `YText.getDelta(attributionManager)` and `toDelta(attributionManager)` — returns per-segment deltas with `attribution: { insert: ['author-name'], delete: ['author-name'] }`.

**Use pattern for Option B:**

```js
// Before agent X's transact:
const preSnapshot = Y.snapshot(doc);

// Agent X's transact:
doc.transact(() => {
  // ... agent write ...
}, AGENT_WRITE_ORIGIN);

// After:
const postSnapshot = Y.snapshot(doc);
const attr = new Y.DiffAttributionManager(preSnapshot, postSnapshot, 'agent-X-session-id');

// Anywhere later: render with attribution
const deltaWithAttribution = ytext.getDelta(attr);
// Returns: [
//   { insert: 'existing text' },
//   { insert: 'Claude-added text', attribution: { insert: ['agent-X-session-id'] } },
//   ...
// ]
```

**What this gives you:**
- Per-character attribution that's CRDT-coherent (it's another CRDT side-channel, replicated + merged properly).
- Persistent across server restart (IdMaps are stored).
- Works with multi-agent concurrent edits (each agent's session has its own IdMap).
- Natively renderable as per-segment deltas (TipTap/ProseMirror can consume).
- The storage is compact (`~20 bytes` for the worked example in `attributing-content.md`; scales with number of distinct contiguous spans, not characters).

**Example from `attributing-content.md:46-53`:**
```js
const insertionSet = Y.createInsertionSetFromStructStore(ydoc.store);
const insertionSetDiff = Y.diffIdSet(insertionSet, previousSnapshot);
const attribution = Y.createIdMapFromIdSet(insertionSetDiff, [new Y.Attribution('insert', 'Bob')]);
```

**Caveats:**
- v14 is RC. Latest: v14.0.0-rc.13 (April 14). Not stable npm.
- Ecosystem pinning: `@tiptap/y-tiptap@3.0.3`, `y-prosemirror@1.3.7`, `y-codemirror.next`, `@hocuspocus/server`, `@hocuspocus/provider` — all pinned to yjs v13 today. Upgrading yjs means coordinated upgrade across the entire tiptap/hocuspocus stack.
- Breaking changes before stable are possible.
- Open Knowledge already has patches against `y-prosemirror@1.3.7` and `@tiptap/y-tiptap@3.0.3` (per CLAUDE.md §precedent #9); re-porting for v14 stable is a bridge-work effort when v14 stable lands.

**Verdict:** v14 solves Option B correctly and natively. Adoption is a real architectural decision (RC dependency, ecosystem coordination, patch re-porting) but technically fully feasible.

## Refined feasibility spectrum

Replacing the binary "infeasible" framing:

| Option | Feasibility | Cost | Readiness |
|---|---|---|---|
| **B-native (v14 AttributionManager)** | Fully feasible | Significant ecosystem upgrade (yjs + tiptap + hocuspocus, re-port patches) | RC, unstable timeline |
| **B-sidechannel (app-built IdMap clone on v13)** | Feasible | App-code: pre/post snapshot capture per transact + IdMap-shaped storage + rendering | Ship today |
| **B-PermanentUserData (v13)** | Partial (delete-only attribution is clean; insert attribution requires arch shift) | Requires per-agent clientID discipline; conflicts with server-authoritative precedent | v13-native but architecturally awkward |
| **A (per-session refs, Option A semantic)** | Fully feasible | Minor refactor of commit fan-out | Ship today |
| **A + effect diffs** (hybrid) | Fully feasible | A + per-transact pre/post diff side-channel | Ship today |

## What this means for Option B's ruled-out list

My "what's ruled out" analysis stays mostly accurate for **v13 without additional investment**. But if we either:
- Build a B-sidechannel (app-side IdMap) today, OR
- Adopt v14 when stable

Then the following BECOME feasible:
- ✓ US-4b (sub-session per-line undo informed by attribution)
- ✓ Character-level accept/reject per agent
- ✓ `git blame`-like view per agent (via attribution-informed rendering, not git blame)
- ✓ Side-by-side "Claude's diff / Cursor's diff" renderings
- ✓ Proper "revoke agent X character-level" operations

The question isn't "can we?" — it's "what's the cost now vs later?"

## Net effect for the spec

The Option B ruling needs to shift from **binary** to **path-dependent**:

- **Today, status quo Y.js:** per-character attribution requires app-side work (B-sidechannel) or architectural regression (B-PermanentUserData).
- **Future (v14 stable):** per-character attribution is native and proper.
- **Bridge:** if we build B-sidechannel with an IdMap-shaped data model today, migration to v14's native AttributionManager is a swap, not a rewrite. The data model is the same shape.

This upgrades the earlier "Option B infeasible" guidance to: **"Option B is feasible via known paths. The decision is cost/readiness trade-off, not physical impossibility."**
