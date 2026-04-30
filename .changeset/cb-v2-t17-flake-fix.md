---
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge-app": patch
---

fix(server): asset-event-driven embed re-render fallback

When an asset is created or deleted outside a cross-branch git batch, the
server now scans open docs for `[[<basename>]]` references and re-parses
the doc's Y.Text source against the current `basenameIndex` via
`applyDiskContentToDoc` (the pure-CRDT helper — no spurious file-system
attribution, no reconciledBase advance, no disk read that would revert
unsaved user edits). Makes embed resolution self-healing for asset moves
that don't go through the head-watcher's cross-branch path — fixing a
Linux-CI flake where T17's test-doc was byte-identical across branches
and had no fallback re-render trigger when `parcel-watcher` missed the
`.git/HEAD` event.

Idempotent: `applyDiskContentToDoc`'s `updateYFragment` diffs against the
live XmlFragment, so re-parsing the same Y.Text source with the same
`basenameIndex` is a no-op on the Y.Doc. Skipped during cross-branch
batches (events are buffered and discarded), preserving the existing
reseed-then-reset ordering. Same-basename events firing in one parcel-
watcher batch (e.g. `mv` produces `asset-delete` + `asset-create`)
collapse into one re-render via a `setImmediate`-deferred dedup pass.

Includes T17 test-design fix (poll on actual post-switch invariant instead
of pre/post-equivalent embed count) and a new regression test
(`asset-move-rerenders-embeds.test.ts`) that exercises the asset-event
path independently of git.
