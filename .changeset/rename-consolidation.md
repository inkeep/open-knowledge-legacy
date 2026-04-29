---
"@inkeep/open-knowledge": minor
"@inkeep/open-knowledge-server": minor
---

feat(rename): consolidate `/api/rename` and `/api/rename-path` into a single polymorphic endpoint, lift the link-rewrite spine, extend the recovery journal to v2, and add principal-attribution fallback for rename + rollback handlers.

**Breaking change** — `POST /api/rename` is **removed**. Clients (UI, MCP, scripts) must use `POST /api/rename-path` with the polymorphic body shape:

```json
{ "kind": "file" | "folder", "fromPath": "<path>", "toPath": "<path>", ...identity, "summary": "..." }
```

The MCP `rename_document` tool's outward API is unchanged (parameters, response shape, identity passthrough are all functionally equivalent) — only the internal HTTP target changed.

**New capabilities:**
- Folder rename now rewrites all inbound wiki-links and supported markdown links across linking docs (was previously a CONFIRMED gap — folder rename moved files but left link text untouched).
- Folder rename is now crash-safe — process kill mid-batch is recoverable on next startup with no partial state.
- File rename via the consolidated endpoint now updates the in-memory backlink index (was missing on the file branch of `/api/rename-path`).
- UI-driven rename and rollback now attribute to the server-loaded principal (`principal-<uuid>`) when no agent identity is supplied. Body-supplied `principalId` is silently ignored — server's `getPrincipal()` is the only source of principal identity.

The recovery journal schema is bumped from v1 (single source/destination) to v2 (multi-doc `affectedDocs[]`). The v1 parser is preserved alongside v2 — legacy v1 journals on disk at startup still recover correctly.

Side-effect docs (backlink-rewrite cascades) remain anonymous for both agent-driven and principal-driven renames — only the renamed doc itself is attributed to the actor.
