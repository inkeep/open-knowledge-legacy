# Evidence: Obsidian Native Linking Model

## Sources
- [help.obsidian.md/links](https://help.obsidian.md/links)
- [help.obsidian.md/plugins/backlinks](https://help.obsidian.md/plugins/backlinks)
- [help.obsidian.md/plugins/graph](https://help.obsidian.md/plugins/graph)
- [GitHub Gist: Wikilink Resolution Rules](https://gist.github.com/dhpwd/9bb86c53b69cb63e09ccca42e3bf924c)

## Wiki-Link Syntax & Resolution

### Basic Syntax
- `[[Note Name]]` — wiki-link (default, Obsidian-native)
- `[text](path/file.md)` — standard markdown link (toggleable)
- Both tracked identically in metadata cache.

### Resolution Rules
- **Case-insensitive**: `[[project alpha]]` = `[[Project Alpha]]`
- **Normalizes spaces/hyphens/underscores**: `[[file name]]` = `[[file-name]]` = `[[file_name]]`
- **Forbidden characters**: `[ ] # ^ |` (reserved for link syntax), plus OS-specific: `\ / :` (macOS), `* " \ / : ?` (Windows)
- **Cannot start with a dot**

### Link Format Settings (3 modes)
1. **Shortest path when possible** (default) — filename only if unique, falls back to full path
2. **Relative path to file**
3. **Absolute path in vault**

### Non-Existent Note Behavior
- Links to non-existent notes render in muted/grayed color.
- Clicking creates the note automatically ("link first, create later" wiki paradigm).

### Auto-Update on Rename/Move
- When enabled, all internal links updated automatically on file rename/move.
- Works for both wikilink and markdown formats, including heading/block references.

## Link Types

| Syntax | Purpose |
|--------|---------|
| `[[Note]]` | Basic link |
| `[[Note\|display text]]` | Aliased link |
| `[[Note#Heading]]` | Link to heading |
| `[[Note#Heading#SubHeading]]` | Deep heading link |
| `[[Note#^block-id]]` | Block reference link |
| `[[#Heading]]` | Same-note heading link |
| `![[Note]]` | Full note embed |
| `![[Note#Heading]]` | Section embed |
| `![[Note#^block-id]]` | Block embed |
| `![[image.png]]` | Image embed |
| `![[image.png\|640x480]]` | Sized image embed |
| `![[doc.pdf#page=3]]` | PDF page embed |
| `![[audio.mp3]]` | Audio player embed |

### Block References
- Created by appending `^identifier` to any paragraph (space + caret + alphanumeric/dashes)
- Auto-generation available in link autocomplete
- **Obsidian-specific** — will not work in standard markdown renderers
- Scope: single paragraph, list item, or blockquote (NOT multi-block ranges)

## Backlinks Panel

### Two Sections
1. **Linked Mentions** — All files with explicit `[[link]]` to current note. Shows surrounding context snippet.
2. **Unlinked Mentions** — Text matching note title or aliases, not yet wrapped in `[[brackets]]`.

### Unlinked → Linked Conversion
- Hover over unlinked mention → "Link" button appears.
- Converts one mention at a time.
- **No native bulk "link all" button** — most-requested feature since 2020 ([forum thread](https://forum.obsidian.md/t/link-all-unlinked-mentions-with-one-click/1045)).

### Display Modes
- Sidebar tab, linked tab (follows active note), or embedded at bottom of each note.

## Graph View

### Global vs Local
- **Global**: Every note + every link. Own tab. Mostly aesthetic at scale.
- **Local**: Notes connected to active note within configurable depth (hops). Sidebar panel. **Far more practical.**

### Features
- Search-based filters (path, tag, etc.)
- Color groups (search query → color assignment)
- Force settings (center, repel, link force, link distance)
- Node size, labels, arrows, animation toggleable

### Performance at Scale

| Vault Size | Global Graph | Local Graph |
|-----------|-------------|-------------|
| ~1,000 notes | Works, some lag on initial render | Fast |
| ~2,000 notes (dense) | Starts to freeze/lag | Usable |
| ~5,000 notes | Very slow | Still usable |
| ~10,000+ notes | Often crashes/freezes Obsidian | May cause editor lag |
| ~50,000+ notes | Should disable entirely | Limited |
| ~130,000 notes | Indexing alone ~10 minutes | Extremely limited |

Community consensus: **Local graph useful, global graph decorative.**

## Tags

### Syntax
- `#tag` in body text, `tags: [a, b]` in frontmatter
- Nested: `#status/in-progress`, `#type/book/fiction`
- Tag pane: sidebar listing all tags with note counts
- [Tag Wrangler](https://github.com/pjeby/tag-wrangler) plugin for rename/merge

### Tags vs Links

| Aspect | Tags | Links |
|--------|------|-------|
| Direction | Unidirectional (note → tag) | Bidirectional (backlinks) |
| Creates note? | No | Yes |
| Graph | Filter by tag, but tags aren't nodes | Creates edges between nodes |
| Best for | Categorization, metadata | Semantic relationships |

## Aliases

```yaml
---
aliases: [AI, Artificial Intelligence, Machine Intelligence]
---
```
- Autocomplete matches both filenames and aliases → generates `[[Full Name|Alias]]`
- Picked up by unlinked mention detection
- Global and reusable (vs per-link display text)

## Comparison to MediaWiki

### Obsidian Has, MediaWiki Lacks
- Automatic backlinks panel (vs "What links here" special page)
- Unlinked mention detection (does not exist in MediaWiki)
- Block-level linking (`^block-id`)
- Built-in graph visualization
- Local-first storage (plain files)

### MediaWiki Has, Obsidian Lacks
- Disambiguation pages (first-class concept)
- Hierarchical categories with auto-generated indexes
- Parameterized templates (`{{Template|param=value}}`)
- Full edit history with diff/revert/blame
- Multi-user collaboration (concurrent editing, talk pages, permissions)
- Structured data (Wikidata, infoboxes, semantic properties)
- Redirects, namespaces, interwiki links
- Watchlists / recent changes
- Full API access

### Philosophical Difference
MediaWiki = collaborative, server-side, structured knowledge base for many editors.
Obsidian = personal, local-first, unstructured knowledge graph for one person.

## Karpathy Workflow Relevance

**Strengths:**
- Wiki-link syntax is natural for knowledge graph construction
- Backlinks create automatic bidirectional connections
- Unlinked mentions surface missed connections
- Embeds enable "compiled" pages that reference raw sources
- Aliases support multiple entry points to concepts

**Gaps:**
- No bulk "link all" for unlinked mentions — critical for agent workflows
- Graph view won't scale to large knowledge bases (10K+ notes)
- No disambiguation, no categories, no parameterized templates
- No version history (need external git)
- No redirect concept
- Single-user design — no multi-agent safety
