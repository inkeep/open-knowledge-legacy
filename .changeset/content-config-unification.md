---
"@inkeep/open-knowledge": minor
---

Unify wiki → content config, mirrored catalogs

- **Config**: `wiki` section replaced by `content` with `dir`, `include`, `exclude`
  - `content.dir` defaults to `.` (project root)
  - `content.include`/`exclude` are glob patterns for tracked content files
- **MCP tool**: `init-wiki` renamed to `init-content`
- **Mirrored catalogs**: INDEX.md catalogs generated inside `.open-knowledge/catalogs/` instead of in-place next to source files
