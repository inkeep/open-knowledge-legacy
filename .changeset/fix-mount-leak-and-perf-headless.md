---
"@inkeep/open-knowledge-app": patch
---

fix(editor-cache): walk pool.entries on demote so non-V2-cached providers disconnect

`setActivityMountList`'s demote loop only consulted the V2 editor cache
(`tiptapCache` + `cmCache`) to find a doc's provider. When a doc was
`ProviderPool`-resident but not V2-cache-resident — defer-mounted +
`BYTES_CACHE_THRESHOLD`-rejected, which happens for multi-MB docs at small
`ACTIVITY_MOUNT_LIMIT` — the lookup returned null, the disconnect was
silently skipped, and the provider kept draining peer bytes into the local
Y.Doc forever. FR3b violated at limit=1.

Stash the `ProviderPool` reference on `subscribePoolEviction` (cleared on
its unsubscribe). The lookup now falls back to `pool.entries` so demote-
path disconnects fire for the full set of pool-resident docs, not just the
V2-cached subset.

Production exposure is currently dormant — shipped `ACTIVITY_MOUNT_LIMIT`
is 3, and the bug only manifests at limit=1 — but the silent-skip class is
removed so the contract holds if the limit ever changes or an unrelated
code path lands a doc in `pool.entries` without going through the cache.
