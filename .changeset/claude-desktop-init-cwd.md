---
"@inkeep/open-knowledge": minor
---

feat(init): register Claude Desktop (and the claude.ai web connector via the shared config) with project-qualified keys and --cwd. Upgrade the Windsurf target to the same shape, with a one-time non-interactive migration of any legacy single `open-knowledge` entry. Project-scoped editors (Claude Code, Cursor, VS Code) are unchanged.

Global-scope editors now use `open-knowledge-<project-basename>` keys so a single config file can serve multiple projects on the same machine. Re-running `init` in the same project is idempotent (realpath-normalized match-by-cwd). Basename collisions across projects auto-disambiguate with `-2`, `-3`, … suffixes. The `--editor` flag accepts `claude-desktop`, `desktop`, and `claude_desktop` for Claude Desktop.
