---
"@inkeep/open-knowledge": minor
---

feat(publish): `ok publish build` exports the knowledge base as static HTML

Adds a `publish` command group with `build`, loading `.open-knowledge/publish.yml` for site title, base path, output directory, and optional glob excludes. Emits path-shaped pages, copies admitted assets, writes `search-index.json`, and warns on dead internal links without failing the build.
