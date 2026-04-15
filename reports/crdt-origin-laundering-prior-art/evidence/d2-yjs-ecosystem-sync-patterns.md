# Evidence: Yjs ecosystem sync/bridge patterns

**Dimension:** D2 — How do other Yjs-based editors handle bidirectional sync between two Y types without origin-laundering?
**Date:** 2026-04-13
**Sources:** BlockSuite, slate-yjs, BlockNote, Milkdown, Plate source + issue tracker scan

---

## Key sources referenced

- **BlockSuite** (`toeverything/blocksuite`):
  - `packages/framework/store/src/extension/history-extension.ts:22-24` — UndoManager trackedOrigins
  - `packages/framework/store/src/reactive/base-reactive-data.ts:9-40` — `{proxy: true}` object origin
  - `packages/framework/store/src/store/store.ts:371-384` — transaction origin dispatch
- **slate-yjs** (`bitphinix/slate-yjs`):
  - `packages/core/src/plugins/withYjs.ts` — localOrigin Symbol
  - `packages/core/src/plugins/withYHistory.ts` — history plugin
- **BlockNote** (`TypeCellOS/BlockNote`) — uses y-prosemirror directly
- **Milkdown** (`Milkdown/milkdown`) — uses y-prosemirror via collab plugin
- **Plate** (`udecode/plate`) — uses slate-yjs

---

## Findings

### Finding 1: BlockSuite explicitly encodes "this write is programmatic, don't track it" as an origin
**Confidence:** CONFIRMED

BlockSuite distinguishes two classes of Y.Doc writes at the application layer:

1. **User-intent writes** — tagged with a clientID-derived origin string. UndoManager tracks these.
2. **Reactive-data / proxy writes** — tagged with an **object origin** `{proxy: true}`. UndoManager does NOT track these.

The UndoManager's `trackedOrigins` matches `tr.origin.constructor` (the `.constructor` branch). By passing a plain object `{proxy: true}` as origin, BlockSuite's UndoManager filters it out automatically — it's not in the tracked set.

This is THE pattern BlockSuite uses to prevent its own internal reactive-layer writes (proxy-based deep watchers that mirror Y.Map changes into typed application state) from laundering user writes. Without this split, every proxy mirror would create a phantom entry on the undo stack and potentially overwrite user Items.

### Finding 2: BlockSuite's pattern is closest to Observer A's situation
**Confidence:** CONFIRMED

The structural parallel:
- BlockSuite reactive layer mirrors Y.Map → typed state (internal, not user-facing)
- Open Knowledge Observer A mirrors Y.XmlFragment → Y.Text (internal, not user-facing)

In both cases, the internal mirror must NOT be tracked by UndoManager — otherwise user undo would reverse the mirror operations, not the underlying user intent. BlockSuite solves this with a dedicated non-tracked origin. We do the same thing conceptually (`'sync-from-tree'` is not in `trackedOrigins`).

**Where we differ:** BlockSuite's mirror writes to a *different* Y type that the user's UndoManager isn't tracking at all. Our mirror writes to Y.Text, which IS the user's undo target for the source-mode persona. So when the mirror overlays user Items in Y.Text, the UndoManager has record of the original Items but no record of the overlay — producing the zombie content pattern.

### Finding 3: slate-yjs avoids the problem structurally via operations, not origins
**Confidence:** CONFIRMED

slate-yjs converts Slate editor operations (`insertText`, `removeText`, etc.) directly into Y.Text/Y.Array operations. There is no serialize→diff→apply bridge — each Slate op maps to a specific Y-op. Origin tagging is done via `editor.localOrigin` (a `Symbol()` per editor instance) set as the transaction origin.

Because the transformation is structural (op → op, not tree → string → diff → tree), there is no intermediate "recompute the whole text" step. Items are never unnecessarily replaced.

**This is the gold standard for origin preservation but requires an operations-based upstream layer.** Our upstream is TipTap/ProseMirror transactions, not direct Slate ops, and our Y.Text is a flat view — the operations don't map 1:1 to Y.Text ops.

### Finding 4: BlockNote/Milkdown/Plate all delegate to y-prosemirror or slate-yjs
**Confidence:** CONFIRMED

- **BlockNote:** Wraps TipTap, delegates collab to y-prosemirror. No custom CRDT bridge.
- **Milkdown:** Uses `@milkdown/plugin-collab` which is a thin wrapper over y-prosemirror.
- **Plate:** Uses slate-yjs directly.

**None of these editors have a second-Y-type problem.** They have ONE Y type per editor (Y.XmlFragment for PM-based, Y.Text+Y.Array for Slate-based) and rely on the upstream library's structural diff. There is no serialize→parse→apply cycle between two Y types.

### Finding 5: BlockNote issue #2244 — yUndoPlugin lifecycle pain
**Confidence:** CONFIRMED

[BlockNote #2244](https://github.com/TypeCellOS/BlockNote/issues/2244) documents that `yUndoPlugin` lifecycle coordination (when to create the UndoManager, when to dispose it) is non-obvious. The issue is adjacent to ours: UndoManager state management across remount/reconnect boundaries. Not directly about origin-laundering but reflects the same underlying difficulty — the UndoManager is a stateful object that must be carefully coordinated with the CRDT lifecycle.

### Finding 6: No editor in the ecosystem uses a bidirectional two-Y-type bridge
**Confidence:** CONFIRMED

Our architecture (Y.XmlFragment ↔ Y.Text with bidirectional observers) is **unique in the surveyed ecosystem**. Every other editor uses ONE primary Y type, with an optional secondary view computed from it (e.g., markdown preview rendered from the XmlFragment). None of them maintain a second Y type as a first-class editing surface.

This explains why origin-laundering in the "two Y types" form doesn't appear in issue trackers — the community's design convention is to avoid the problem by not having two Y types bound to two editors in the first place.

---

## Comparison table

| Editor | Primary Y type | Secondary surface | Origin-laundering risk |
|---|---|---|---|
| y-prosemirror | Y.XmlFragment | None (markdown rendered from PM, read-only) | LOW — structural diff |
| slate-yjs | Y.Text + Y.Array | None | NONE — operation-based |
| BlockNote | Y.XmlFragment (via PM) | None | LOW — inherits y-prosemirror |
| Milkdown | Y.XmlFragment (via PM) | None | LOW — inherits y-prosemirror |
| Plate | Y.Text + Y.Array (via Slate) | None | NONE — inherits slate-yjs |
| BlockSuite | Y.Map/Y.Array (block tree) | Proxy mirror to typed state | MEDIUM — mitigated by `{proxy:true}` object origin |
| **Open Knowledge** | **Y.XmlFragment (WYSIWYG) + Y.Text (source mode)** | **Both first-class** | **HIGH — fixed by content-comparison gate + char-level diff** |

---

## Implications for Open Knowledge

1. **We are architecturally unique in the ecosystem.** Our two-first-class-Y-types design is not a pattern anyone else has shipped. This means no direct prior art to copy — but also no ecosystem pushback saying "don't do this."

2. **Our situation most closely resembles BlockSuite's.** The abstraction is: two kinds of writes (user vs. internal mirror) that must be distinguished at origin. We already have this (`'agent-write'` tracked, `'sync-from-tree'` not tracked). The gap is that our mirror writes overlay the user's content, creating the zombie pattern when undo hits the original Items.

3. **slate-yjs's operations-based model is the ideal but not achievable** without rewriting Observer A from scratch as a ProseMirror step → Y.Text op translator. This is a bigger architectural shift than either our content-comparison approach or the XmlFragment-event-driven approach (NG4).

4. **BlockSuite's origin object pattern is not the fix.** Even with a distinctive origin, the delete+reinsert still happens — BlockSuite's fix prevents the undo stack from TRACKING the mirror write, not from the mirror overwriting items. That's already what we do. Our problem is sharper: the mirror's replacement Items survive undo because they have no UndoManager record at all, AND they overlay previously-tracked Items.

5. **Typed transaction origins (precedent #1 in AGENTS.md) aligns with BlockSuite's object-origin pattern.** Confirms our direction at the origin-typing layer.

---

## Gaps / follow-ups

- Deep-dive BlockSuite's `base-reactive-data.ts` for any "content-comparison before write" patterns we might have missed. Quick scan didn't find one; scan wasn't exhaustive.
- Check whether any BlockSuite issue discusses zombie content or similar after undo. Not found in quick scan.
