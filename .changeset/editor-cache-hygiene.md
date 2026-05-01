---
'@inkeep/open-knowledge-app': patch
---

Editor-cache hygiene — test + comments only, no behavior change:

- Adds two regression-prevention tests for the `subscribePoolEviction` → `evictTiptapEditor` / `evictCmEditor` propagation path. The two pre-existing `subscribePoolEviction` tests both passed a no-op `onEvict`, leaving the eviction-callback wiring uncovered. The new tests capture the registered callback via a fake pool, fire it directly, and assert both cache kinds are torn down for the same `docName` (and that an unknown `docName` is a safe no-op).
- Strips six `FR3b` process citations from `editor-cache.ts` per CLAUDE.md "Don't cite the process that produced the code" — substance preserved (the comments still describe the activity-hidden observer-CPU cap and the provider connect/disconnect transitions), just no internal FR-number tags.
