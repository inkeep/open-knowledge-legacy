---
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge-app": patch
---

fix(server): asset-event-driven embed re-render fallback

When an asset is created or deleted outside a cross-branch git batch, the
server now scans open docs for `[[<basename>]]` references and re-applies
the disk content against the current `basenameIndex`. This makes embed
resolution self-healing for asset moves that don't go through the
head-watcher's cross-branch path — fixing a Linux-CI flake where T17's
test-doc was byte-identical across branches and had no fallback re-render
trigger when `parcel-watcher` missed the `.git/HEAD` event.

Idempotent: `applyExternalChange`'s `updateYFragment` diffs against the
live XmlFragment, so re-applying the same content is a no-op. Skipped
during cross-branch batches (events are buffered and discarded), preserving
the existing reseed-then-reset ordering.

Includes T17 test-design fix (poll on actual post-switch invariant instead
of pre/post-equivalent embed count) and a new regression test
(`asset-move-rerenders-embeds.test.ts`) that exercises the asset-event
path independently of git.
