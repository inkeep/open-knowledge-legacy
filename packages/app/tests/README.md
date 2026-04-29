# App tests

## Integration preload (`idb-preload.ts`)

Integration tests that need a clean IndexedDB import `./idb-preload.ts` (under `tests/integration/`), which registers a global `afterEach` that deletes every `indexedDB` database. That cleanup assumes **Bun runs `afterEach` hooks in LIFO order** so per-test teardown (closing providers/servers) runs before the global wipe. If Bun ever switched to FIFO, tests would need to close providers before `deleteDatabase`; otherwise `deleteDatabase` can hit `onblocked` while IndexedDB handles are still open. The assumption is documented in `idb-preload.ts` as well.
