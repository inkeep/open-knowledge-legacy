---
"@inkeep/open-knowledge-app": patch
"@inkeep/open-knowledge-server": patch
---

Recover safely from stale browser CRDT caches after server restarts.

This scopes client IndexedDB persistence by server epoch, adds server-side tripwires for duplicated persisted content, and records structured mismatch telemetry so stale-cache recovery is observable without replaying unsafe buffered edits.
