# Evidence: Obsidian Internal Link Format

## Source
- **Primary:** [Internal links - Obsidian Help](https://help.obsidian.md/links) (official documentation)
- **Source file:** [obsidian-help/en/Linking notes and files/Internal links.md](https://github.com/obsidianmd/obsidian-help/blob/master/en/Linking%20notes%20and%20files/Internal%20links.md)
- **Forum:** [Settings: New Link Format: What is "Shortest path when possible"?](https://forum.obsidian.md/t/settings-new-link-format-what-is-shortest-path-when-possible/6748)
- **Forum:** [Case sensitivity](https://forum.obsidian.md/t/case-sensitivity/52331)
- **Forum:** [Wikilink vs Markdown: The Latter Suffers From Lack Of Support](https://forum.obsidian.md/t/wikilink-vs-markdown-the-latter-suffers-from-lack-of-support/86920)

## Key Findings

### Two Link Formats
Obsidian supports two link formats, controlled by "Use [[Wikilinks]]" toggle in Settings > Files & Links:

1. **Wikilink format** (default): `[[Three laws of motion]]` or `[[Three laws of motion.md]]`
2. **Markdown format**: `[Three laws of motion](Three%20laws%20of%20motion)` (requires URL encoding; spaces become `%20`)

Quote from official docs: "By default, due to its more compact format, Obsidian generates links using the Wikilink format."

### Link Path Resolution Modes
Three modes controlled by Settings > Files & Links > New link format:

1. **Shortest path when possible** (default): Uses the minimum path needed to uniquely identify the target. If a filename is unique across the vault, no path prefix is needed. If duplicate filenames exist, adds enough path to disambiguate.
2. **Relative path to file**: `[[./subfolder/note]]` — path relative to the current file's location.
3. **Absolute path in vault**: `[[folder/subfolder/note]]` — full path from vault root.

### Case Sensitivity
Links are **case-insensitive**: `[[project alpha]]` and `[[Project Alpha]]` resolve to the same note.

### Heading Links (Anchor Links)
- Same note: `[[#Preview a linked file]]`
- Other note: `[[About Obsidian#Links are first-class citizens]]`
- Subheadings: `[[Help and support#Questions and advice#Report bugs]]`
- Vault-wide heading search: `[[## team]]`

### Block Links
Format: `[[filename#^identifier]]`
- Block IDs can be auto-generated (e.g., `^37066d`) or human-readable (e.g., `^quote-of-the-day`)
- Restricted to Latin letters, numbers, and dashes
- **Portability note from official docs:** "Block references are specific to Obsidian and not part of the standard Markdown format. Links containing block references won't work outside of Obsidian."

### Display Text / Aliases
- Wikilink: `[[Example|Custom name]]` (note: pipe order is `[[target|display]]`, opposite of MediaWiki's convention)
- Markdown: `[Custom name](Example.md)`

### Embedding
Prefix with `!`: `![[Figure 1.png]]` or `![[note-name]]` to embed content inline.

### Characters to Avoid in Filenames
`# | ^ : %% [[ ]]`

### Automatic Link Updates
When files are renamed or moved through Obsidian's UI, all internal links are automatically updated. Setting: "Automatically update internal links" in Files & Links.

**API limitation:** `Vault.rename(file, path)` does NOT trigger automatic link updates — only UI-initiated renames do. Source: [Forum discussion](https://forum.obsidian.md/t/vault-rename-file-path-doesnt-trigger-link-update/32317)

### Community Plugins for Link Management
- **Link Converter**: Convert between wikilinks and markdown links, adjust path formats. Source: [obsidian-link-converter](https://www.obsidianstats.com/plugins/obsidian-link-converter)
- **Wikilinks to MDLinks**: Convert individual links via hotkey (Ctrl/Cmd+Shift+L). Source: [GitHub](https://github.com/agathauy/wikilinks-to-mdlinks-obsidian)
- **Consistent Attachments and Links**: Ensures links stay valid when moving files. Source: [GitHub](https://github.com/dy-sh/obsidian-consistent-attachments-and-links)
