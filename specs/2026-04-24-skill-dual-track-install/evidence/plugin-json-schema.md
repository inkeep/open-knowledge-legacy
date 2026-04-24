---
oq_refs: [OQ11]
decisions: [D14]
sources: [anthropics/knowledge-work-plugins/productivity/.claude-plugin/plugin.json]
captured: 2026-04-24
---

# Evidence: `.claude-plugin/plugin.json` shape

**Captured:** 2026-04-24
**Source:** `https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/productivity/.claude-plugin/plugin.json` via WebFetch

## Observed shape

```json
{
  "name": "productivity",
  "version": "1.2.0",
  "description": "Manage tasks, plan your day, and build up memory of important context about your work. Syncs with your calendar, email, and chat to keep everything organized and on track.",
  "author": {
    "name": "Anthropic"
  }
}
```

Four fields only: `name`, `version`, `description`, `author.name`. No `homepage`, no `skills` array, no `mcp_servers` block, no `commands`, no `hooks`.

## Implication

**Content discovery is by convention, not declaration.** Claude walks the plugin directory looking for:
- `skills/<name>/SKILL.md` → skills
- (Likely) `commands/`, `hooks/`, `mcp/` subdirs → other content types

No explicit declaration needed in `plugin.json`. The minimalism resolves OQ11: our plugin.json will be similarly minimal:

```json
{
  "name": "open-knowledge",
  "version": "0.2.0",
  "description": "Open Knowledge — markdown CRDT collaboration via MCP",
  "author": {
    "name": "Inkeep"
  }
}
```

## Composition with marketplace.json

- `.claude-plugin/marketplace.json` at repo root → declares this plugin with `source: "./open-knowledge-plugin"`.
- `open-knowledge-plugin/.claude-plugin/plugin.json` → minimal metadata.
- `open-knowledge-plugin/skills/open-knowledge/SKILL.md` → skill content (symlink to `packages/server/assets/skills/open-knowledge/SKILL.md`).

## Version sync

Both `marketplace.json` (via its one plugin's SHA embedded in the source reference) and `plugin.json`'s `version` field need to track the CLI release. D5/D8 already direct build-time injection for SKILL.md's `metadata.version`; the same CI step can update `plugin.json` `version` before commit.

Actually — simpler: the plugin's `version` field can be auto-updated by the same build step that injects `metadata.version` into SKILL.md. Or we accept occasional drift and let `changeset version` handle it (changesets already bumps per-package versions on release).

## Remaining uncertainty

- Whether `skills/<name>/SKILL.md` vs `skills/<name>/` (folder, no name-match-required) discovery path. Our SKILL.md's `name: open-knowledge` must match the folder name per the spec; the question is whether the plugin's convention enforces the same match. Safe default: align folder name + skill name (matches existing bundled convention).
- Whether Claude Desktop resolves symlinks when pulling the plugin from GitHub (OQ12 — still open; needs live test).
