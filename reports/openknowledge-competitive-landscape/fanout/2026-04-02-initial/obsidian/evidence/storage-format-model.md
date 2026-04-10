---
title: "Obsidian Storage & Format Model - Evidence"
type: evidence
dimension: "D3 - Storage & Format Model"
collected: 2026-04-02
sources:
  - https://stephango.com/file-over-app
  - https://obsidian.md/about
  - https://obsidian.md/license
  - https://help.obsidian.md/bases
  - https://obsidian.md/canvas
---

# D3: Storage & Format Model - Evidence

## Core Architecture: Local Markdown Files

Obsidian operates on a "vault" — a directory of plain files on the user's local filesystem. The application is a viewer/editor for those files; it does not own them.

**File types:**
- `.md` — Markdown notes (Obsidian Flavored Markdown, a superset of CommonMark)
- `.base` — Bases database view definitions (JSON-based)
- `.canvas` — JSON Canvas visual layouts (open format specification)
- `.obsidian/` — Configuration directory (settings, plugins, themes, workspaces)
- Standard attachments: images, PDFs, audio, video stored alongside or in dedicated folder

**No proprietary database.** No SQLite. No binary blobs for note content. Every note is a readable text file.

## YAML Frontmatter (Properties)

Notes can have YAML frontmatter for structured metadata:

```yaml
---
title: "Note Title"
tags: [tag1, tag2]
created: 2026-01-15
aliases: ["alternative name"]
cssclass: special-layout
---
```

Obsidian calls these "Properties" and renders them in a visual editor. Properties are the primary mechanism for structured data — Bases queries them, Dataview queries them, search operators filter by them.

**Limitation:** No schema enforcement. Each note can have different properties. No type validation. Community plugins (Linter, MetaEdit) add some enforcement but it's opt-in.

## "File Over App" Philosophy

Steph Ango's essay (stephango.com/file-over-app) articulates the founding philosophy:

> "In the fullness of time, the files you create are more important than the tools you use to create them. Apps are ephemeral, but your files have a chance to last."

> "If you want your writing to still be readable on a computer from the 2060s or 2160s, it's important that your notes can be read on a computer from the 1960s."

> "All software is ephemeral... give people ownership over their data."

This philosophy means:
- **No vendor lock-in by design.** If Obsidian disappears, your vault is still a folder of markdown files.
- **Any tool can read/write the files.** VS Code, Vim, any text editor, any script, any agent.
- **But Obsidian-specific features live in syntax extensions.** Wikilinks (`[[note]]`), embeds (`![[embed]]`), callouts (`> [!note]`), and block references (`^block-id`) are Obsidian Flavored Markdown — readable but not rendered correctly by all markdown parsers.

## Git Compatibility

Obsidian vaults are git-compatible but not git-native:
- The vault is a directory — `git init` works immediately
- `.obsidian/` config directory can be committed or gitignored
- Markdown diffs work well in git
- **Community plugin: Obsidian Git** automates commit/push/pull
- **Not git-native because:** Obsidian doesn't use git. No built-in branching, merging, history, or collaboration via git. Git is a bolt-on managed by the user or community plugins.
- **Sync is proprietary:** Obsidian Sync is a separate, proprietary, end-to-end encrypted sync service. It does not use git.

## Comparison to "Markdown + Git" Native Platform

| Aspect | Obsidian | Markdown+Git Native |
|--------|----------|-------------------|
| Storage | Local filesystem | Git repository |
| Sync | Proprietary (Obsidian Sync) | Git push/pull |
| History | Obsidian Sync version history or Obsidian Git plugin | Git log (native) |
| Branching | Not supported | Native |
| Collaboration | Proprietary Sync (no real-time) | Git pull requests |
| Conflict resolution | Sync conflict files | Git merge |
| CI/CD integration | Manual or plugin-based | Native (GitHub Actions, etc.) |
| Agent writes | Filesystem access | Git commits with attribution |
| Audit trail | Limited (Sync history) | Complete (git log) |

**Key gap for agent-native use:** In Obsidian, an agent's writes are indistinguishable from the user's writes at the filesystem level. In a git-native system, agent writes can be separate commits with agent identity, enabling review, rollback, and attribution.
