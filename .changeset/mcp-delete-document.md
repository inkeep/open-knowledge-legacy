---
"@inkeep/open-knowledge": minor
---

feat(mcp): add `delete_document` tool

Wraps the existing `POST /api/delete-path` (kind: file) endpoint. Closes
all open agent sessions for the target doc, unloads it from Hocuspocus,
and removes the file from disk. Identity passthrough mirrors the
write/edit/rename pattern. Response emits `previousPreviewUrl` so agents
can close any stale preview tab pointing at the deleted doc.

Inbound wiki-links to the deleted doc are NOT rewritten — they become
redlinks (parallels the file-tree UI delete behavior). Use
`get_backlinks` first if you want to update or remove referrers.
