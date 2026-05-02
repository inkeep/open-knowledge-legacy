---
title: GBrain Integration Surfaces
description: Evidence for detecting gbrain availability, matching the current folder to a gbrain source, and invoking search.
created: 2026-05-01
last-updated: 2026-05-01
---

# GBrain Integration Surfaces

## Findings

### CONFIRMED: `gbrain sources list --json` is the current source-path discovery surface.

The `sources` command returns JSON entries containing `id`, `name`, `local_path`, `federated`, `page_count`, and `last_sync_at`. The companion app can compare the current project folder's real path against `local_path`.

Primary source:
- `/Users/mike/src/gbrain/src/commands/sources.ts`

### CONFIRMED: gbrain has a legacy path fallback at `sync.repo_path`.

`getDefaultSourcePath()` first checks `sources.local_path`, then falls back to `engine.getConfig('sync.repo_path')` for older default-source brains.

Primary source:
- `/Users/mike/src/gbrain/src/core/source-resolver.ts`

### CONFIRMED: `gbrain import` may import pages without registering a source path.

The import command sets `sync.repo_path` only after successfully reading a git `HEAD` from the imported directory. A folder whose `.git` is above the imported subdirectory, or whose git state has no valid `HEAD`, can import pages while leaving `sources.local_path` null.

Primary source:
- `/Users/mike/src/gbrain/src/commands/import.ts`

### CONFIRMED: `gbrain call query` is a JSON-friendly CLI invocation for hybrid search.

The `call` command invokes a named gbrain operation with JSON params and prints JSON. The `query` operation runs hybrid search; the `search` operation runs keyword search. Current query params include query text, limit/offset, expansion/detail/language options, and code-symbol hints, but do not expose a `sourceId` or equivalent source-scoping parameter. Current result rows include `source_id` from the page table, so a caller can filter returned rows after the CLI query.

Primary sources:
- `/Users/mike/src/gbrain/src/commands/call.ts`
- `/Users/mike/src/gbrain/src/core/operations.ts`
- `/Users/mike/src/gbrain/src/core/utils.ts`
- `/Users/mike/src/gbrain/src/core/types.ts`

### CONFIRMED: gbrain's library surface exists but is tighter coupling than the CLI.

The package exports `gbrain/engine-factory`, `gbrain/config`, `gbrain/operations`, and `gbrain/search/hybrid`. A library integration could connect directly to the user's configured engine, but it would couple Open Knowledge to gbrain's package/runtime and versioning.

Primary source:
- `/Users/mike/src/gbrain/package.json`
