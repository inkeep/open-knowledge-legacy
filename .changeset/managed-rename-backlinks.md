---
"@inkeep/open-knowledge": minor
---

feat(mcp): add managed document rename with backlink rewrite

Add the `rename_document` MCP tool and the backing managed rename server flow so page renames update inbound wiki-links plus supported internal inline Markdown links instead of leaving stale references behind.

Managed rename now uses a persisted recovery journal for crash-safe rollback, updates already-loaded documents through the live Y.Doc path, and keeps sidebar file rename on the graph-safe endpoint while folder rename stays on the lower-level path rename flow.
