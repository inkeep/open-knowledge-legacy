---
"@inkeep/open-knowledge": patch
---

chore(init): consolidate Open Knowledge ignore rules into `.open-knowledge/.gitignore`. The scaffold now writes `cache/`, `server.lock`, `ui.lock`, `sync-state.json`, `principal.json`, and `last-spawn-error.log`, and `ok init` merges missing entries into pre-existing files (existing user lines preserved). `ok clone` no longer mutates the cloned repo's tracked `.gitignore`; per-clone protection lives in `.git/info/exclude` (local-only, never committed) instead.
