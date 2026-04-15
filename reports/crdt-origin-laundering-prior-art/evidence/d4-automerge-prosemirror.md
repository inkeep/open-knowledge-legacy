# Evidence: Automerge-ProseMirror

**Dimension:** D4 — How does Automerge-ProseMirror handle the equivalent problem?
**Date:** 2026-04-13
**Sources:** `~/.claude/oss-repos/automerge-prosemirror/` (v0.2.0-alpha.0), GitHub issues

---

## Key sources referenced

- `src/syncPlugin.ts:14-147` — core sync plugin
- `src/DocHandle.ts` — Automerge handle
- `CHANGELOG.md` 0.0.13 — history-plugin integration note
- [automerge-prosemirror#19](https://github.com/automerge/automerge-prosemirror/issues/19) — metadata for remote-change transactions
- [Automerge getActorId docs](https://automerge.org/automerge/api-docs/js/functions/getActorId.html)

---

## Findings

### Finding 1: Automerge-ProseMirror is a plugin, not a transaction interceptor
**Confidence:** CONFIRMED

`syncPlugin` (`syncPlugin.ts:14-147`) operates via:
- **PM → AM:** `appendTransaction` collects `docChanged` txs and applies them via `handle.change((doc) => pmToAm(...))`. Single `ignoreTr` flag guards re-entry at `:23`.
- **AM → PM:** On the handle's `change` event, `patchesToTr` converts Automerge patches into a ProseMirror transaction that `view.dispatch`es.
- **Reconciliation step:** After PM→AM, uses `prosemirror-changeset` to compare PM-produced vs. AM-normalized output, replaces any diff range using `pmDocFromSpans` (`:89-105`).

The reconciliation step is **structurally similar to our Observer A/B bridge** but **one-way-at-a-time** (not bidirectional on a single CRDT). It's also applied between two representations of the same local write — a normalization check — not between old/new content to suppress unnecessary mutations.

### Finding 2: Automerge has NO `trackedOrigins` equivalent
**Confidence:** CONFIRMED

Automerge's granularity options:
- **Actor ID** (`am.getActorId`): per-session identifier on every change, stable across session. Property of the CRDT change, not a transient tag.
- **Change metadata** (`message`, `time`): persistent provenance attached to each `handle.change()` call.

**Undo is delegated to `prosemirror-history`.** CHANGELOG 0.0.13: *"the library now plays nice with other plugins such as the history plugin"* (`playground/src/Editor.tsx:13, 128`). Undo is a client-side PM concept; history plugin is per-client-local and has always been so.

### Finding 3: The equivalent pain point exists — issue #19
**Confidence:** CONFIRMED

[automerge-prosemirror#19](https://github.com/automerge/automerge-prosemirror/issues/19) documents the **structural dual** of our origin-laundering problem:

> *"For the case of working with the Prosemirror history plugin, it would be nice to be able to mark the transaction created by the incoming patch with `tx.setMeta('addToHistory', false)` so that only changes made locally are added to the history stack."*

The issue is CLOSED. Resolution: the fix lives entirely in the PM `history` plugin's purview. Because undo is on the PM layer, the "filter" is `tx.getMeta('addToHistory')`, which ProseMirror preserves accurately through the sync boundary (one hop, no laundering).

### Finding 4: Key architectural distinction from Yjs
**Confidence:** INFERRED — HIGH CONFIDENCE

Automerge-prosemirror's undo lives **inside ProseMirror**, so the filter is `tx.getMeta('addToHistory')`. Yjs's `UndoManager` lives **inside the CRDT** and filters by `trackedOrigins`.

**Our problem is sharper than Automerge-prosemirror's because:**
1. We run undo on the CRDT layer itself (Yjs UndoManager on Y.Text)
2. Sync updates arrive origin-less at the CRDT layer
3. Our two-first-class-Y-types architecture forces the mirror write to hit the SAME Y type that the undo is tracking

Automerge-prosemirror sidesteps all three by putting undo upstream of the sync boundary.

### Finding 5: Operation model difference is structural
**Confidence:** INFERRED — HIGH CONFIDENCE

- **Automerge:** True operation-based CRDT. Ops carry actor + sequence number *intrinsically*. "Who wrote this" is a property of the storage layer.
- **Yjs:** Item-based structs where `origin` is a transaction-level annotation NOT persisted to the CRDT wire format. "Who wrote this" is a property of *how it arrived*, not of the content itself.

This is the structural reason origin-laundering is a Yjs-shaped problem: once an update is serialized and re-applied by the sync provider, the origin is gone unless the application manually re-tags the receiving transaction.

---

## Implications for Open Knowledge

1. **Automerge-prosemirror's fix won't transfer directly.** Their fix (set `addToHistory: false` on incoming-patch transactions) only works because undo lives in PM, upstream of the sync boundary. Our undo lives in Yjs, downstream — we can't just "don't track" the sync transaction; we've already been doing that, and it's what creates the zombie pattern.

2. **The academic undo-in-CRDT literature uses the Automerge model** (actor on character), not the Yjs model (origin on transaction). See D5 evidence. This suggests the "right" long-term answer is richer per-character attribution, but that's a bigger lift than our current spec.

3. **No direct prior art in Automerge land for our specific fix.** The `prosemirror-changeset` reconciliation step is the closest analog to our content-comparison gate, but it's used for a different purpose (normalization self-check).
