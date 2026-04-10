# Evidence: D5 — Editing Experience for Knowledge Work

**Dimension:** Web editor capabilities, comparison to Obsidian/VS Code for knowledge authoring
**Date:** 2026-04-02
**Sources:** Mintlify editor docs, blog posts, independent reviews

---

## Key pages referenced
- https://www.mintlify.com/docs/editor/getting-started — Web editor overview
- https://www.mintlify.com/blog/improved-web-editor — 2026 editor improvements
- https://www.mintlify.com/blog/introducing-web-editor — Original editor launch
- https://www.mintlify.com/docs/editor/collaborate — Collaboration features
- https://ferndesk.com/blog/mintlify-review — Independent 2026 review

---

## Findings

### Finding: Web editor is "Notion-like" WYSIWYG with markdown toggle
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/editor/getting-started, https://www.mintlify.com/blog/improved-web-editor

Capabilities:
- Visual (WYSIWYG) mode and Markdown source mode, switchable
- Live preview (no local build required)
- "/" slash commands for inserting components (callouts, code blocks, snippets)
- Drag-and-drop navigation management
- Media asset management (upload images, videos)
- AI-powered content generation, rewriting, restructuring
- Git auto-commit on save
- Branch-based workflow (create/switch branches in editor)

The 2026 improved editor brings "configuration, structure, content, and preview together into a single workspace" — docs.json settings now editable visually.

### Finding: The editor is optimized for documentation, not general knowledge work
**Confidence:** INFERRED
**Evidence:** Feature set analysis across sources

What the editor does well for docs:
- Component insertion (Callouts, Code Groups, Steps, API Fields, Tabs)
- OpenAPI-aware API reference editing
- Frontmatter management
- Navigation structure management

What the editor lacks for knowledge work:
- No graph view or visual knowledge map
- No [[wiki-link]] autocomplete
- No backlink panel
- No daily notes or journal features
- No tag/property system (beyond frontmatter)
- No canvas/whiteboard
- No outliner mode
- No transclusion or block references
- No query/dataview system
- No templates system (beyond snippets)

### Finding: Side-by-side comparison — Mintlify vs Obsidian vs VS Code for knowledge authoring
**Confidence:** INFERRED
**Evidence:** Feature comparison across known capabilities

| Capability | Mintlify Web Editor | Obsidian | VS Code |
|---|---|---|---|
| WYSIWYG editing | Yes (primary mode) | Yes (Live Preview) | No (source only) |
| Markdown source | Yes (toggle) | Yes (Source mode) | Yes (primary) |
| Wiki-links ([[...]]) | No | Yes (core) | Via extension |
| Backlinks | No | Yes (core) | No |
| Graph view | No | Yes (core) | No |
| Tags/properties | Frontmatter only | Yes (rich property editor) | Via extensions |
| Templates | Snippets only | Yes (core + Templater plugin) | Yes (snippets) |
| Canvas/visual | No | Yes (Canvas feature) | No |
| Daily notes | No | Yes (core) | No |
| Dataview/queries | No | Yes (Dataview plugin) | No |
| Git integration | Auto-commit on save | Via plugin (Obsidian Git) | Built-in |
| AI assistance | Built-in (generate, rewrite) | Via plugins (86+ AI plugins) | Via extensions (Copilot etc) |
| Component library | 22+ MDX components | Community plugins (2,736) | N/A |
| API playground | Yes | No | REST Client extension |
| Collaboration | Branch-based | No (single player) | Live Share |
| Web-based | Yes | No (desktop app) | Yes (vscode.dev) |

### Finding: Frontmatter handled via visual editor in 2026 update
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/improved-web-editor

The 2026 editor update made frontmatter editable through the visual interface — "configuration that once lived in docs.json now fully visual." This reduces friction for non-technical editors but doesn't add knowledge-work-specific metadata capabilities.

---

## Gaps / follow-ups

* Exact slash command list and available block types in the web editor not fully documented
* Performance of the editor with large content sets (100+ pages) not tested
