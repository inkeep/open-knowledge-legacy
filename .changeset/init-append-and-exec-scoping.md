---
"@inkeep/open-knowledge": minor
---

`open-knowledge init` now appends a load-bearing "Open Knowledge" section to root `CLAUDE.md` and `AGENTS.md` (idempotent via `<!-- open-knowledge:begin -->` markers; dedups symlinked files via `realpath`). The appended section nudges agents toward `exec`, `write_document`/`edit_document`, and `[[wiki-links]]`. Use `--force` to overwrite the block in place.

The `exec` MCP tool now auto-scopes recursive `grep -r` / `find` invocations with `--exclude-dir=` / `-not -path` for known non-wiki directories (`node_modules`, `.git`, `dist`, `build`, `.next`, `.turbo`, `.nuxt`, `coverage`, `.cache`, `.parcel-cache`, `.vercel`, `.open-knowledge`). Observed speedup on a real repo: ~210× (56.6s → 0.27s). User-provided `--exclude-dir` / `-not` / `-prune` disables injection for that stage.
