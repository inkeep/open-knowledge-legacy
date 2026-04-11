---
"@inkeep/open-knowledge": major
---

BREAKING: Unify wiki → content config, mirrored catalogs

- **Config rename**: `wiki` section removed; use `content` with `dir`, `include`, `exclude`
  - `content.dir` defaults to `.` (project root), was `./content`
  - `content.include`/`exclude` replace `wiki.include`/`wiki.exclude`
  - `wiki.roots` removed — use glob patterns instead
  - Old `wiki` config key triggers a deprecation warning
- **MCP tool rename**: `init-wiki` → `init-content`
- **Mirrored catalogs**: INDEX.md catalogs now generated inside `.open-knowledge/catalogs/` instead of in-place next to source files
- **Migration**: move `wiki.include`/`wiki.exclude` to `content.include`/`content.exclude` in your `.open-knowledge/config.yml`
