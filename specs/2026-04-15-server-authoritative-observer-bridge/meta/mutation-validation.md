# Mutation Validation — Server-Authoritative Observer Bridge

Three mutation tests validate that the server-authoritative architecture's load-bearing
components each catch regressions when reverted.

## Mutation E: Revert Server Observer B Attachment

**What to revert:** In `packages/server/src/server-observers.ts`, comment out the Observer B
section (the `ytext.observe(observerB)` call and the entire `runObserverBSync` / `observerB`
callback). Leave Observer A intact.

**Expected failure:** C2 (concurrent source-mode) fails — Y.Text changes from multiple clients
are NOT mirrored to XmlFragment because server Observer B is missing. XmlFragment stays empty
or stale. The `assertBridgeInvariant` check reports Y.Text content that XmlFragment does not have.

**Verification command:**
```bash
# Temporarily comment out ytext.observe(observerB) in server-observers.ts, then:
bun test --cwd packages/app tests/integration/c2-concurrent-source.test.ts
# Expected: test failures with bridge invariant violations
```

## Mutation F: Revert OBSERVER_SYNC_ORIGIN.skipStoreHooks

**What to revert:** In `packages/server/src/server-observers.ts`, change
`skipStoreHooks: true` to `skipStoreHooks: false` on `OBSERVER_SYNC_ORIGIN`.

**Expected failure:** Persistence feedback loop detected — the server observer writes Y.Text
under `OBSERVER_SYNC_ORIGIN`, which triggers `onStoreDocument` (because `skipStoreHooks` is
now false), which writes to disk, which triggers the file watcher, which calls
`applyExternalChange`, which modifies the doc, which triggers the server observer again.
Observable as disk-write thrashing (multiple `fs.writeFile` calls per edit) and potentially
`OBSERVER_SYNC_ORIGIN` fire count exceeding the STOP_IF threshold (>10 fires/sec/doc).

**Verification command:**
```bash
# Change skipStoreHooks to false in OBSERVER_SYNC_ORIGIN, then:
bun test --cwd packages/app tests/integration/c1-concurrent-wysiwyg.test.ts
# Expected: test timeout or bridge invariant violation from feedback loop
```

## Mutation G: Revert FR-7 Client Write-Path Deletion

**What to revert:** In `packages/app/src/editor/observers.ts`, restore the deleted
`doc.transact(() => { ... }, ORIGIN_TREE_TO_TEXT)` block in Observer A's `runObserverASync`
and the `doc.transact(() => { ... }, ORIGIN_TEXT_TO_TREE)` block in Observer B's
`runObserverBSync`. This re-adds the client-side cross-CRDT write paths that were deleted
in US-006.

**Expected failure:** C1, C2, C3 all fail with multi-writer RGA interleave. Multiple clients'
Observer A instances fire concurrently alongside the server observer, each writing Y.Text with
their own pre-merge view. Y.Text's RGA CRDT interleaves the concurrent writes, producing
duplicated or scrambled content.

This is the MOST LIKELY regression path — someone "cleans up" observers.ts and re-adds the
writes, not realizing they were deleted intentionally.

**Verification command:**
```bash
# Restore the deleted transact blocks in observers.ts, then:
bun test --cwd packages/app tests/integration/c1-concurrent-wysiwyg.test.ts
bun test --cwd packages/app tests/integration/c2-concurrent-source.test.ts
bun test --cwd packages/app tests/integration/c3-mixed-mode.test.ts
# Expected: content duplication or bridge invariant violations
```

## Validation Triangle

| Mutation | Validates | Catches |
|----------|-----------|---------|
| E | Server Observer B attachment | Missing source-mode→XmlFragment sync |
| F | skipStoreHooks feedback loop prevention | Persistence→watcher→observer cycle |
| G | Client write-path deletion | Multi-writer RGA interleave race |

Together they form a complete triangle: E covers server attachment, F covers feedback loop,
G covers client deletion. Without G, E and F could both pass while the original multi-writer
race returns at lower probability.
