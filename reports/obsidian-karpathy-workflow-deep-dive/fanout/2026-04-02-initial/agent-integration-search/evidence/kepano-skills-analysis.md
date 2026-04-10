# Evidence: kepano/obsidian-skills Deep Dive

## Source
- **GitHub:** https://github.com/kepano/obsidian-skills
- **Stars:** 19,200+
- **Forks:** 1,200+
- **Commits:** 37
- **Author:** Steph Ango (kepano) — CEO of Obsidian
- **Announced:** https://x.com/kepano/status/2008578873903206895

## Skills Inventory (5 total)

### 1. obsidian-markdown (SKILL.md)
**Coverage:** Obsidian Flavored Markdown — extends CommonMark + GFM

**Specific syntax taught:**
- Internal links: `[[Note]]`, `[[Note|Display]]`, `[[Note#Heading]]`, `[[Note#^block-id]]`
- Embeds: `![[Note]]`, `![[image.png|300]]`, `![[doc.pdf#page=3]]`, audio/video
- Callouts: `> [!type]` with 14+ types (note, tip, warning, etc.), collapse states
- Properties/Frontmatter: YAML between `---`, title, date, tags, aliases, cssclasses, custom
- Tags: `#tag`, `#nested/tag`, rules (no numbers first, allowed chars)
- Comments: `%%hidden%%` inline, `%%` block
- Highlights: `==highlighted==`
- Math: `$inline$`, `$$block$$` LaTeX
- Mermaid diagrams with Obsidian internal-link integration
- Footnotes: reference `[^1]` and inline `^[text]`
- Block IDs: `^block-id` syntax

**6-step workflow:** Add frontmatter → write content → link notes → embed content → add callouts → verify rendering

**Key convention taught:** "Use `[[wikilinks]]` for internal, `[text](url)` for external"

### 2. obsidian-bases (SKILL.md)
**Coverage:** Obsidian Bases — .base files (database-like views)

**Specific features taught:**
- File format: `.base` with YAML content
- Schema: filters, formulas, properties, summaries, views
- Filtering: AND/OR/NOT logic, operators (`==`, `!=`, `>`, `<`, etc.)
- Formulas: arithmetic, conditionals, string formatting, date manipulation
- Property types: note properties (frontmatter), file properties (name, path, size, timestamps, tags, links), formula properties (computed)
- View types: table, cards, list, map
- Duration/date arithmetic: `.days`, `.round()`, units like "1 day", "7d"
- 3 complete working examples: task tracker, reading list, daily note index

### 3. json-canvas (SKILL.md)
**Coverage:** JSON Canvas (.canvas files)

**Specific features taught:**
- Node types, edges, groups, connections
- Creating visual canvases, mind maps, flowcharts
- File format specification

### 4. obsidian-cli (SKILL.md)
**Coverage:** Obsidian CLI interaction

**Commands taught:**
- `obsidian read file="My Note"` — Read notes
- `obsidian create name="New" content="# Hello"` — Create notes
- `obsidian append file="Note" content="text"` — Append content
- `obsidian search query="term" limit=10` — Search vault
- `obsidian daily:read` / `daily:append` — Daily note operations
- `obsidian property:set name="status" value="done"` — Set properties
- `obsidian tasks daily todo` — Task management
- `obsidian tags sort=count counts` — Tag analytics
- `obsidian backlinks file="Note"` — Backlink discovery
- Plugin development: `plugin:reload`, `dev:errors`, `dev:screenshot`, `dev:dom`, `dev:console`
- Advanced: `eval code="..."` (JavaScript execution), CSS inspection, mobile emulation
- Parameters: `file=` (wikilink-style), `path=` (exact path), `vault=` (multi-vault)

### 5. defuddle (SKILL.md)
**Coverage:** Web content extraction to clean Markdown
- Extract main content from web pages
- Reduce token usage for LLM processing

## Assessment for Karpathy Workflow

### What the skills COVER well:
- ✅ Correct Obsidian Markdown generation (wikilinks, embeds, callouts, properties)
- ✅ Frontmatter/properties structure
- ✅ Internal linking conventions
- ✅ Bases for structured data views over notes
- ✅ CLI for programmatic vault interaction

### What's MISSING:
- ❌ No guidance on Dataview query syntax (DQL)
- ❌ No guidance on search operators (path:, tag:, section:, block:)
- ❌ No template/Templater integration
- ❌ No guidance on file organization strategies for large vaults
- ❌ No guidance on handling large batch operations (100+ files)
- ❌ No guidance on conflict resolution with external changes
- ❌ No guidance on embedding/transclusion best practices for compiled wikis
- ❌ No guidance on Obsidian URI scheme (obsidian://)
- ❌ No guidance on plugin-specific features (Smart Connections, Omnisearch, etc.)
