# Evidence: Documentation Framework Link Formats

## Sources

### Docusaurus
- **Primary:** [Markdown links - Docusaurus](https://docusaurus.io/docs/markdown-features/links) (official docs)
- **Primary:** [Internal links with IDs instead of relative paths - Docusaurus Discussion #7380](https://github.com/facebook/docusaurus/discussions/7380)
- **Primary:** [Backlinking for Docusaurus - Discussion #8217](https://github.com/facebook/docusaurus/discussions/8217)

### GitHub Markdown
- **Primary:** [Relative links in markup files - The GitHub Blog](https://github.blog/news-insights/product-news/relative-links-in-markup-files/)
- **Primary:** [Branch relative links in markdown files - Issue #101](https://github.com/github/markup/issues/101)

### Foam
- **Primary:** [Wikilinks - Foam Documentation](https://foamnotes.com/user/features/wikilinks.html)
- **Primary:** [Link Reference Definitions - Foam](https://github.com/foambubble/foam/blob/main/docs/user/features/link-reference-definitions.md)
- **Primary:** [foambubble/foam GitHub repository](https://github.com/foambubble/foam)
- **Primary:** [Option to use internal standard Markdown Links instead of WikiLinks - Issue #1353](https://github.com/foambubble/foam/issues/1353)

### Dendron
- **Primary:** [Links - Dendron Wiki](https://wiki.dendron.so/notes/3472226a-ff3c-432d-bf5d-10926f39f6c2/)
- **Primary:** [dendronhq/dendron GitHub repository](https://github.com/dendronhq/dendron)

---

## Docusaurus

### Link Types
Docusaurus supports two approaches:
1. **URL path links**: Unprocessed by Docusaurus, resolve based on page URL location
2. **File path links**: Relative paths with `.mdx` extension, auto-converted to URL paths

### Path Resolution
- `./target.mdx` — relative to current file
- `../target.mdx` — relative to parent directory
- `/target.mdx` — relative to content root (`docs/`)
- `target.mdx` — checks current directory, then content roots, then site root

### Wikilink Support
**Not supported.** Docusaurus does not parse `[[wikilink]]` syntax. Some users use preprocessing scripts to convert wikilinks before build.

### Backlinking
A community member built a backlinks plugin: [Discussion #8217](https://github.com/facebook/docusaurus/discussions/8217). This is NOT built-in.

---

## GitHub Markdown

### Link Format
Standard markdown only: `[display text](./relative/path.md)`

### Resolution Rules
- Relative paths resolved from the current file's directory
- `./file.md` — same directory
- `../file.md` — parent directory
- `path/file.md` — subdirectory
- Heading anchors: lowercase, spaces become `-`, special characters removed

### Wikilink Support
**Not supported.** GitHub renders `[[link]]` as literal text, not as a hyperlink. There is an open community discussion requesting support: [Discussion #73062](https://github.com/orgs/community/discussions/73062).

### Submodule Limitation
GitHub resolves links relative to the main repo root, not submodule directories. Links into submodules don't work via relative paths.

---

## Foam (VS Code Extension)

### Link Format
- Primary: wikilinks `[[note-name]]`
- Supports heading links: `[[note-name#Section Title]]`
- Supports block links: `[[note-name#^blockid]]`
- Directory links: `[[folder-name]]` navigates to `index.md` or `README.md`

### Link Reference Definitions (Key Innovation)
Foam auto-generates **markdown link reference definitions** at the bottom of each file:
```markdown
[note-name]: path/to/note-name.md "Note Name"
```
This makes wikilinks compatible with standard markdown processors. The wikilink `[[note-name]]` in the body is paired with the definition at the bottom, creating a valid markdown link.

### Configuration Options
- `foam.edit.linkReferenceDefinitions`: `"withoutExtensions"` (default) or `"withExtensions"`
- `foam.links.sync.enable`: auto-update links on rename (default: true)

### Git Compatibility
- Link reference definitions make files renderable by any markdown parser
- File renames auto-update all wikilinks across the workspace
- VS Code's built-in `markdown.updateLinksOnFileMove.enabled` handles standard markdown links

---

## Dendron (VS Code Extension, archived)

### Link Format
- Wikilinks: `[[note-name]]`
- Cross-vault links: `[[dendron://vault-name/note-name]]` (protocol-style)
- Hierarchical dot notation: `[[daily.journal.2024.01.15]]`

### Unique Features
- Dendron uses **dot-separated hierarchical names** instead of folder paths
- Cross-vault links use a `dendron://` protocol prefix
- Built for VS Code, leverages IDE paradigms for knowledge management

### Status
Dendron is now **archived/unmaintained** as of 2023. Source: [GitHub](https://github.com/dendronhq/dendron) — the repository README notes the project is no longer actively maintained.

---

## Mintlify / Fumadocs

### Mintlify
- Uses standard markdown links: `[text](/path/to/page)`
- MDX-based, API-docs-first approach
- No wikilink support documented

### Fumadocs
- Next.js-based documentation framework
- Supports markdown and MDX
- Uses standard relative links between files
- No wikilink support documented
