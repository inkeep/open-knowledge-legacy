---
title: OTel Context Propagation Across Debounce Boundaries
type: analysis
sources:
  - packages/server/src/persistence.ts
  - packages/server/src/api-extension.ts
---

## Finding: Debounced operations must be independent trace roots

### Architecture

The server has three distinct timing domains:

1. **Synchronous request path** (API handler → CRDT transaction → response)
   - `onRequest` → `handleAgentWrite` → `dc.document.transact()` → `json(res, 200, ...)`
   - Duration: single-digit milliseconds
   - OTel: standard request span, parent-child for transaction/sync

2. **Debounced persistence** (triggered by Hocuspocus after 2000ms idle)
   - `onStoreDocument()` — called by Hocuspocus internal debounce timer
   - Batches multiple edits from multiple requests
   - No reference back to the triggering request
   - OTel: independent root span

3. **Debounced git commit** (triggered 30s after last disk write)
   - `commitToWipRef()` — called by setTimeout in `scheduleGitCommit()`
   - Batches multiple persistence writes
   - OTel: independent root span

### Implication

Parent-child span relationships are correct only within a single timing domain. Across debounce boundaries, operations are aggregations — they don't belong to any single parent request.

### Recommended pattern

| Operation | Span type | Parent |
|---|---|---|
| API request handler | Root span | None |
| Agent write transaction | Child span | API request |
| syncTextToFragment | Child span | Agent write transaction |
| onLoadDocument | Root span | None (called on first connection) |
| onStoreDocument | Root span | None (debounced, batches multiple edits) |
| commitToWipRef | Root span | None (debounced, batches multiple stores) |
| File watcher event | Root span | None (OS callback) |

### Span Links (optional enrichment)

OTel span links can create non-hierarchical relationships. Could optionally link:
- persistence.store → last triggering API request (if we track it)
- git_commit → persistence.store that scheduled it

This is Future Work — links add complexity for marginal value in local dev.
