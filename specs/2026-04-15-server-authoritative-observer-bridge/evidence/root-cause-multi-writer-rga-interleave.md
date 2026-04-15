# Root cause: Observer A multi-writer RGA interleave

## Status

Confirmed via `/debug` Phase 5 report during 2026-04-14 ship's post-hardening pass. Level 1 evidence (actual fuzzer runtime state, not conjecture).

## Reproduction

`packages/app/tests/stress/bridge-convergence.fuzz.test.ts` at SPEC §D17 FR-17 seed distribution. Seed `BRIDGE_FUZZ_SEEDS=40` produces ~2-4 convergence-timeout failures. Failure snapshot written to `/var/folders/<...>/T/bridge-conv-fuzz-<timestamp>/snapshot.json`.

Representative failing-seed evidence (captured during ship):

- Snapshot path: `/var/folders/6d/x278hdzs13n94ndq7c10s6w00000gn/T/bridge-conv-fuzz-1776234488341/snapshot.json`
- Op sequence: 6× `wysiwyg-type` + 2× `agent-write` + `sync-pause` + `sync-resume` ops, 3 clients
- Final state: ytext=287ch, fragment=122ch on ALL clients (CRDT-converged, bridge-invariant-violated uniformly — not a propagation issue)
- Y.Text content contains `M7-bravo alpha alpha` DUPLICATED and `M5-echo` split-and-interleaved with an M7 insertion

## Why the duplication happens

1. Multiple clients receive a burst of remote XmlFragment updates (from the other clients' local WYSIWYG typing). Each client's Observer A fires.
2. Each Observer A reads its **local** `ytext.toString()` — but the client's local Y.Text may not yet reflect CRDT-converged state from the remote updates (CRDT message ordering is not guaranteed between Y.Text and Y.XmlFragment; they propagate as independent protocol messages).
3. Each Observer A computes its delta against its local XmlFragment (via `diffLines` in Path A, or DMP `patch_make` in Path B) and calls `applyByPrefixSuffix(ytext, currentText, newText)` — which is `ytext.delete(prefix, deleteLen); ytext.insert(prefix, insertText)`.
4. N clients' concurrent `delete + insert` operations land on Y.Text's RGA CRDT. RGA tiebreaks at the character level — "concurrent inserts at the same logical position interleave."
5. Result: duplicate paragraphs in Y.Text (`M7-bravo alpha alpha M7-bravo alpha alpha`), or split-and-interleaved paragraphs (`M5-ech M7-... o`).

## Why Path B's DMP three-way merge does NOT heal this

Path B (`observers.ts:440-500` `applyUserDelta`) uses `diff-match-patch` three-way merge:
- `base` = `lastSyncedXmlMd`
- `user` = `newXmlMd` (current XmlFragment serialization)
- `agent` = `currentText` (current Y.Text)

It preserves both user's delta vs. base AND agent's delta vs. base. Under multi-client concurrent WYSIWYG writes, the "agent" side (Y.Text) contains duplication from a previous round's concurrent-writer race. Path B treats it as legitimate and PRESERVES the duplication.

DMP three-way merge cannot distinguish "legitimate remote content I should keep" from "duplication from my own class of race." No algorithm can, given only local views.

## Why Observer B does not reconcile

`observers.ts:608`:

```ts
if (!transaction.local) {
  getTypingState(doc).lastRemoteTreeOnlyAt = 0;
  return;
}
```

Observer B skips all remote transactions under the documented contract that "the server now updates both Y.Text and XmlFragment in the same transaction, so clients receive paired changes that are already in sync."

The contract is correct for agent-write and file-watcher paths (both use `applyAgentMarkdownWrite` / `applyExternalChange` — both write both sides server-side). It is wrong for the multi-client Observer A case, because the multi-client-race-produced duplicates do NOT originate from a single server-side atomic transaction; they accumulate from multiple clients' individual observer writes that propagate via CRDT.

Adding a remote-reconcile at Observer B's guard would not help, because it rebuilds XmlFragment from Y.Text. Once Y.Text has duplicates, XmlFragment would mirror them. "Bridge invariant holds with duplicates on both sides" — technically satisfied, actually wrong content. See `rejected-alternatives.md` Option E.

## Symmetric case on Observer B side

The same race structurally exists for concurrent source-mode editors:

1. Clients A and B type into CodeMirror concurrently (Y.Text RGA merges correctly — this is Y.Text's native strength).
2. Each client's Observer B fires on its local Y.Text change. Each reads its local Y.Text view, parses into a ProseMirror tree, calls `updateYFragment(xmlFragment, tree)`.
3. N clients' `updateYFragment` calls produce N tree-edit operations on Y.XmlFragment. `updateYFragment` is a structural diff — it's designed to produce minimal edits, but under concurrent execution against different input trees (different clients' local pre-merge Y.Text views), it produces different edit sets that merge at the Y.XmlFragment CRDT layer into potentially duplicated/corrupted tree structure.
4. The current FR-17 fuzzer's 0.5% `source-type` frequency hides this case (~0.07 expected ops per seed); raising to 15% (this spec's FR-10) exposes it.

This symmetric race also motivates server-authoritative observation: the same architectural fix closes both directions.

## Conclusion

The race is not a fuzzer artifact or an infra timing issue. It is a real production race that manifests any time 2+ clients edit the WYSIWYG view concurrently (observed at 2-4% per seed in the fuzzer; in production, rate depends on user concurrency density). Self-heals on next single-client edit (Observer A/B sees a clean `local=true` transaction and rebuilds deltas from a non-duplicated baseline), but during the window between concurrent bursts, Y.Text contains corrupted content visible to source-mode users.

The architectural fix (server-authoritative observer) eliminates the race by design: single writer to each derived CRDT means no multi-writer CRDT merge can produce interleave/duplication.
