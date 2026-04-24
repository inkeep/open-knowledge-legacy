---
oq_refs: [OQ9]
decisions: [D13, D14]
sources: [anthropics/knowledge-work-plugins]
captured: 2026-04-24
---

# Evidence: Claude Desktop plugin marketplace schema (`.claude-plugin/marketplace.json`)

**Captured:** 2026-04-24
**Source:** `https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/.claude-plugin/marketplace.json` via WebFetch 2026-04-24

## Schema (as of 2026-04-24)

### Root-level
```json
{
  "name": "knowledge-work-plugins",
  "owner": { "name": "Anthropic" },
  "plugins": [ /* plugin objects */ ]
}
```

### Plugin object
- **Required:** `name` (unique identifier), `description` (functionality overview), `source` (string path OR object)
- **Optional:** `category`, `author.name`, `homepage`

### Source variants
- **Local (string):** `"source": "./productivity"` → path relative to repo root containing the plugin's `.claude-plugin/plugin.json`.
- **Remote (object):**
  ```json
  "source": {
    "source": "url" | "git-subdir",
    "url": "...",
    "sha": "...",
    "path": "<for git-subdir>",
    "ref": "<for git-subdir>"
  }
  ```

### NOT present at marketplace root
- No `version:` field — version tracking is per-plugin via git SHA, not semver.
- No `repository:` URL — inferred from the repo hosting the marketplace.

## Proposed `inkeep/open-knowledge` marketplace structure (for D13)

Add at the repo root:

```
.claude-plugin/
  marketplace.json        ← declares the "open-knowledge" plugin
open-knowledge-plugin/    ← the plugin directory (local source "./open-knowledge-plugin")
  .claude-plugin/
    plugin.json           ← plugin-level metadata
  skills/
    open-knowledge/
      SKILL.md            ← symlink or copy of packages/server/assets/skills/open-knowledge/SKILL.md
```

**Pragmatic simplification:** because the skill is a single file that lives in `packages/server/assets/skills/open-knowledge/SKILL.md`, we can use a symlink in `open-knowledge-plugin/skills/open-knowledge/SKILL.md → ../../../packages/server/assets/skills/open-knowledge/SKILL.md`. Single source of truth. CI build-skill-zip script also references the same file.

If symlinks cause platform-specific headaches (Windows git-config quirks), fall back to a pre-commit hook or CI step that copies the SKILL.md into the plugin subdir.

## Marketplace.json proposed content

```json
{
  "name": "open-knowledge",
  "owner": { "name": "Inkeep" },
  "plugins": [
    {
      "name": "open-knowledge",
      "description": "Open Knowledge — markdown CRDT collaboration via MCP",
      "source": "./open-knowledge-plugin",
      "category": "knowledge-management",
      "author": { "name": "Inkeep" },
      "homepage": "https://github.com/inkeep/open-knowledge"
    }
  ]
}
```

## Known bugs that affect this path

- **#39400** — marketplace-sourced plugin skills silently fail to mount in Cowork. Zip-upload works. Docs must warn Team+ admins of this caveat.
- **#38429** — `RemotePluginManager.syncPlugins()` wipes `source: "github"` marketplaces on every Desktop restart. Plugins vanish. Protected only for `source: "manual"` uploads. Org admins re-add after upgrades.

**Net:** plugin marketplace path is offered as a convenience for Team+ admins who want GitHub-sync semantics, but the ZIP-upload path (docs page `install-claude-cowork.mdx`) is still the more reliable install — doc this clearly.

## UNCERTAIN

- Whether `plugin.json` (inside the plugin subdir) has a different schema than `marketplace.json` (at repo root). WebFetch only retrieved the marketplace shape. Needs a second fetch or investigation of `anthropics/knowledge-work-plugins/productivity/.claude-plugin/plugin.json` before implementing Phase 3.
- Whether `skills/<name>/SKILL.md` is the only subpath or if plugins can declare other types (commands, hooks, MCP servers). Research report mentioned MCP components — the plugin likely supports those too, but not in scope for the wedge.
