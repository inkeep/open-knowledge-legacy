---
"@inkeep/open-knowledge": minor
"@inkeep/open-knowledge-server": minor
---

feat: add suggest_links discovery and precision patch targeting

- add a `suggest_links` MCP tool and `/api/suggest-links` endpoint for deterministic missing-link discovery
- add title-aware and alias-aware mixed live-or-disk scanning that skips already-linked and non-prose regions
- add optional offset-aware `edit_document` patch targeting so follow-up edits can address an exact mention
