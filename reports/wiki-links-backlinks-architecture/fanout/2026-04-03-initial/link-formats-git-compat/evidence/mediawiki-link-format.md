# Evidence: MediaWiki Internal Link Format

## Sources
- **Primary:** [Help:Links - MediaWiki](https://www.mediawiki.org/wiki/Help:Links) (official documentation)
- **Primary:** [Help:Link - Wikipedia](https://en.wikipedia.org/wiki/Help:Link)
- **Primary:** [Help:Wikitext - Wikipedia](https://en.wikipedia.org/wiki/Help:Wikitext)
- **Primary:** [Chapter 4: MediaWiki syntax](https://workingwithmediawiki.com/book/chapter4.html)

## Key Findings

### Basic Syntax (The Original Convention)
MediaWiki invented the `[[Page Name]]` wikilink syntax. This is the ancestral format that Obsidian, Logseq, Foam, and others derive from.

- Basic link: `[[Page Name]]`
- Piped link: `[[Target Page|Display Text]]` — note: target comes FIRST, display text SECOND
- Section link: `[[Page Name#Section Name]]`
- Same-page section: `[[#Section Name]]`

### Case Sensitivity Rules
- **First character:** Case-insensitive by default (configurable per-wiki)
- **Subsequent characters:** Case-sensitive — must match exactly
- Spaces and underscores are interchangeable: `[[Main Page]]` = `[[Main_Page]]`
- Display shows spaces (underscores hidden)

### Pipe Trick (Auto-abbreviation)
When using `[[Page Name|]]` (empty pipe), MediaWiki auto-generates display text by:
1. Removing namespace prefix (everything before first colon)
2. Stripping trailing parenthetical content
3. Removing commas and everything after

Example: `[[Help:Template|]]` renders as `Template`

### Namespace Handling
- Categories: `[[Category:Help]]` adds page to category; `[[:Category:Help]]` creates a visible link
- Files: `[[File:Example.png]]` embeds image; `[[:File:Example.png]]` links to file page
- Special prefix colon (`:`) prevents the namespace action and creates a plain link

### Interwiki Links
- Format: `[[wikipedia:Sunflower]]` or `[[w:Sunflower]]`
- These are prefix-based and configurable per-wiki installation
- Always render as blue links (no existence checking for external wikis)

### Self-Links
Linking to the current page produces **bold text** instead of a clickable hyperlink.

### Redirects
`#REDIRECT [[Target Page]]` — the canonical redirect mechanism in MediaWiki.

### Key Differences from Obsidian/Foam
| Feature | MediaWiki | Obsidian |
|---------|-----------|----------|
| Pipe syntax | `[[target\|display]]` | `[[target\|display]]` (same) |
| Case sensitivity | First char insensitive, rest sensitive | Fully insensitive |
| Block-level links | Not supported natively | `[[note#^blockid]]` |
| Embedding | `[[File:...]]` for media | `![[...]]` for any content |
| Auto-capitalization | First letter auto-capitalized | No auto-capitalization |
| Namespace system | Full namespace architecture | Folder-based only |
