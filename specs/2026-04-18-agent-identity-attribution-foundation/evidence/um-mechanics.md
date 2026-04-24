---
title: Y.UndoManager mechanics, effect-diff derivation, doc-op interactions
description: File:line-anchored answers to UM internals, captureTimeout tuning, effect-diff extraction (Y.Text delta), doc deletion + rename edge cases. Informs FR-3, FR-4, FR-11, FR-3 scope (UM tracks metadata + activity Y.Map).
tags: [evidence, spec-input, yjs, undomanager, effect-diff, v0-14]
sources: [node_modules/yjs/src/utils/UndoManager.js, node_modules/yjs/src/utils/Transaction.js, node_modules/yjs/src/types/YText.js, node_modules/yjs/src/utils/Doc.js, packages/server/src/api-extension.ts, packages/server/src/agent-sessions.ts]
---

# UM mechanics + effect-diff + doc-op interactions

## Q12 — UM.undo() internal transaction origin

`transaction.origin === undoManager` (the UndoManager instance itself). `UndoManager.js:120` passes the UM instance as the third arg to `transact`. Re-capture path: UM auto-adds itself to `trackedOrigins` (line 181); `afterTransactionHandler` at line 215-216 matches.

**No infinite loop** because of three guards:
1. `this.undoing = true` set before `popStackItem` (line 351-358); `this.redoing = true` for redo.
2. `const stack = undoing ? this.redoStack : this.undoStack` (line 222) — during `undoing`, results go to the REDO stack, not the undo stack.
3. `stopCapturing()` at line 224 prevents merge with prior redo items.

Calling `um.undo()` triggers the handler, passes tracked-origins filter (since UM auto-added), and captures the inverse onto the redo stack. Standard undo/redo protocol.

**Implication:** Per-session UM with `trackedOrigins = new Set([session.origin])` ONLY — the UM auto-adds itself (line 181). Redo stack works regardless.

## Q13 — transaction.changed is NOT the right API for effect-diffs

Correction: `transaction.changed` is `Map<AbstractType, Set<String|null>>` (per `Transaction.js:79-81`) — just which types and keys changed, not content.

**For Y.Text markdown diffs, use `YTextEvent.delta`:**
- `ytext.observe(event => { event.delta })` — returns a Quill Delta array of `{insert?, delete?, retain?}` ops.
- Yjs computes this during observer fan-out; near-zero marginal CPU.
- Storage: `O(#ops)` — a few hundred bytes for typical agent edits.

Alternative (pre/post `ytext.toString()` + DMP diff) is O(n) string copy + O(n·m) diff, unusable at scale.

**Recommendation (LOCK):** Attach `ytext.observe` inside `applyAgentMarkdownWrite`, capture the event's `delta`, persist as the effect record.

## Q14 — Per-session UM trackedOrigins shape

**LOCK: `new Set([session.origin])`** — writes only, NOT the undo-origin.

Rationale: Adding `session.undoOrigin` to trackedOrigins would cause the undo-replay transact (origin = session.undoOrigin) to be captured. Since `this.undoing === false` during replay (replay is NOT via `um.undo()` — it's via `applyAgentUndo` which uses `updateYFragment`), the handler's `clear(false, true)` path wipes the redo stack AND adds a new undo item. That gives confused semantics (undo button re-undoes the replay).

**Belt-and-suspenders (LOCK):** `captureTransaction: tr => tr.origin !== session.undoOrigin` as defense-in-depth.

## Q15 — Object.freeze depth

**LOCK: Deep freeze.** `Object.freeze` is shallow; `origin.context` must be frozen separately.

```ts
const context = Object.freeze({ origin: 'agent-write', paired: true, session_id, ... });
session.origin = Object.freeze({ source: 'local', skipStoreHooks: false, context });
```

Yjs never mutates origin.context (grep-verified). Risk is app-layer accidental mutation. Cost negligible; benefit = strict-mode throw on mutation.

## Q16 — captureTimeout

**LOCK: `500` (default).** Evidence at `UndoManager.js:231-248` — merges new transacts into prior stack item if `(now - lastChange) < captureTimeout`. For agent bursts (multiple tool calls within one user-prompt-reply cycle, typically <500ms apart), 500 collapses the burst into one undo step — matches user mental model "undo the agent's last turn."

Override path: if testing reveals agent bursts consistently exceed 500ms gap, use explicit `um.stopCapturing()` at reply boundaries rather than tuning the timeout.

## Q47 — Doc deletion while UM has stack items

Y.UndoManager auto-destroys when its Y.Doc destroys (`UndoManager.js:269-271`). But Hocuspocus `unloadDocument()` does NOT call `ydoc.destroy()` — it unloads from Hocuspocus's map but leaves the Y.Doc alive in memory. Orphaned UM stack items would apply undo to an orphaned Y.Doc — silent data loss from user's perspective.

**LOCK: Explicitly destroy session UM on rename/delete.** Hook into `captureAndCloseDocuments` and `unloadDocument` paths to call `session.um.destroy()` + optionally tear down the whole session record.

## Q48 — Rename + undo interaction

After managed-rename, the Y.Doc is unloaded and re-loaded fresh from disk at the new path. Old Y.Items are gone from the new store. UM stack items from pre-rename are bound to orphaned Items — undo would either silently no-op or apply to orphaned doc.

**LOCK: Tear down session UM on managed-rename** affecting that session's doc. If agent wants to continue editing, reconstruct fresh session on the renamed doc. No stack migration.

## Q52 — Mid-session origin refresh

No. Origin is frozen at session creation. `AGENT_LABEL` env is read once at subprocess start (Node `process.env` snapshot). Session identity IS the origin. If agent wants different identity, start new session.

## Additional finding — UM scope for metadata + activity

From Q38 analysis in `shadow-git-and-sweep.md`: `applyAgentMarkdownWrite` writes Y.Text AND `Y.Map('metadata')` AND (outside the function) `Y.Map('activity')` all inside one `transact(..., AGENT_WRITE_ORIGIN)` block. Y.UndoManager takes a type-scope argument; `new UndoManager(ytext, ...)` tracks ytext ONLY.

**LOCK: Pass `[ytext, metaMap, activityMap]` to the per-session UM.** One undo step reverts ALL session-originated writes in the transact (content + frontmatter + activity entry).

## Design recommendations — LOCKED

| ID | Decision | Rationale |
|---|---|---|
| DR-12 | UM internal undo transaction handling: rely on `um` auto-added to `trackedOrigins` | Default behavior; required for redo stack |
| DR-13 | Effect-diff derivation via `YTextEvent.delta` | O(1) Yjs-native; no O(n·m) string diff |
| DR-14 | Per-session UM trackedOrigins = writes only | Avoids redo-stack wipe on replay |
| DR-14b | Defense-in-depth: `captureTransaction` filter rejecting undo-origin | Belt-and-suspenders against future misuse |
| DR-15 | Deep freeze origin + origin.context | Runtime trap on accidental mutation |
| DR-16 | captureTimeout = 500 | Matches agent-burst semantics |
| DR-38 | UM scope includes Y.Text + Y.Map('metadata') + Y.Map('activity') | One undo reverts full transact |
| DR-47 | Destroy session UM explicitly on doc unload/delete | Avoids orphaned-doc silent data loss |
| DR-48 | Tear down session on managed-rename; no stack migration | CRDT identity destroyed at unload |
| DR-52 | No mid-session origin refresh | Stable session identity |
