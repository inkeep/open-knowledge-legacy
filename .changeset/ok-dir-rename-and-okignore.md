---
"@inkeep/open-knowledge": minor
---

feat(rename): rename `.open-knowledge/` → `.ok/` everywhere (per-project, `~/.ok/`, and the shadow repo at `.git/ok/`); replace `content.include` and `content.exclude` in `config.yml` with a `.okignore` file at the project root using gitignore syntax.

**Hard cutover for the directory rename** (pre-release license to break — no auto-rename of `.open-knowledge/` → `.ok/`):

- The per-project state directory is now `.ok/` instead of `.open-knowledge/`. Same for the user-global directory (`~/.ok/`) and the shadow repo (`.git/ok/`).
- `content.include` and `content.exclude` are removed from `ConfigSchema`. If they appear in your `config.yml`, OK rejects the file with a source-located error directing you to move the patterns into a project-root `.okignore`.
- `.okignore` uses gitignore syntax (parsed by the `ignore` npm library) and is evaluated alongside `.gitignore` in a single ignore-lib instance — cross-source `!` overrides work (e.g. `!secret.md` in `.okignore` re-includes a file `.gitignore` excluded). Nested `.okignore` files at any folder depth are honored.
- `ok init` now scaffolds both `.ok/` and a project-root `.okignore` (commented header, no example excludes).
- The Settings pane's Content section is removed; `content.dir` becomes YAML-only (default `.` covers the common case).
- The MCP `set_config` allowlist drops to 3 paths: `folders[]`, `mcp.tools.search.maxResults`, `mcp.tools.read_document.historyDepth`.

**For pre-existing OK projects:**

1. Rename your `.open-knowledge/` directory to `.ok/` (manual — no auto-rename shim).
2. Lift any `content.include` / `content.exclude` patterns into a project-root `.okignore` (recreate exclusion patterns; remember the `.okignore` mental model is exclude-only).
3. Run `ok config migrate` to strip the obsolete `content.{include,exclude}` keys from `config.yml`. The codemod is idempotent and also clears the other deprecated keys (`sync.*`, `persistence.{debounceMs,maxDebounceMs}`, `server.port`).
4. Delete the orphan `.git/open-knowledge/` shadow repo.
5. Re-authenticate.

The dogfood team will see one re-prompt for stored credentials (`~/.ok/auth.yml`), first-launch consent (`~/.ok/mcp-status.json`), and the skill-installed marker on first run after merging — expected behavior for the hard cutover on the user-home rename.

The protected identifiers (MCP server name `open-knowledge`, writer-ID `openknowledge-service`, bundle ID `com.inkeep.open-knowledge`, URL scheme `openknowledge://`, package names) are unchanged.
