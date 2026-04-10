# Evidence: Wikilink Parsing Ecosystem (npm/JS)

## Sources
- **Primary:** [remark-wiki-link - GitHub](https://github.com/landakram/remark-wiki-link)
- **Primary:** [remark-wiki-link - npm](https://www.npmjs.com/package/remark-wiki-link)
- **Primary:** [mdast-util-wiki-link - GitHub](https://github.com/landakram/mdast-util-wiki-link)
- **Primary:** [mdast-util-wiki-link - npm](https://www.npmjs.com/package/mdast-util-wiki-link)
- **Primary:** [micromark-extension-wiki-link - GitHub](https://github.com/landakram/micromark-extension-wiki-link)
- **Primary:** [micromark-extension-wiki-link - npm](https://www.npmjs.com/package/micromark-extension-wiki-link)
- **Primary:** [@moritzrs/micromark-extension-ofm-wikilink - npm](https://www.npmjs.com/package/@moritzrs/micromark-extension-ofm-wikilink) (Obsidian-flavored Markdown)
- **Primary:** [remark-obsidian-link - jsDelivr](https://www.jsdelivr.com/package/npm/remark-obsidian-link)
- **Primary:** [Python-Markdown WikiLinks extension](https://python-markdown.github.io/extensions/wikilinks/)

---

## Three-Layer Architecture (unified ecosystem)

The JavaScript wikilink parsing stack follows the unified/remark/micromark layered architecture:

### Layer 1: Tokenizer — micromark-extension-wiki-link
- Lowest level: character-by-character parsing
- Recognizes `[[` open and `]]` close delimiters
- Handles alias dividers (configurable, default `:`)
- Produces tokenization events for the micromark parser

### Layer 2: AST Utility — mdast-util-wiki-link
- Converts micromark tokens into mdast (Markdown Abstract Syntax Tree) nodes
- Produces a `wikiLink` node type with:
  ```json
  {
    "type": "wikiLink",
    "value": "Page Name",
    "data": {
      "alias": "Display Text",
      "permalink": "page_name",
      "exists": true,
      "hName": "a",
      "hProperties": { "className": "internal", "href": "#/page/page_name" },
      "hChildren": [{ "type": "text", "value": "Display Text" }]
    }
  }
  ```

### Layer 3: Plugin — remark-wiki-link
- Top-level remark plugin that integrates Layers 1 and 2
- Configuration options:
  - `permalinks`: array of existing page identifiers
  - `pageResolver`: function mapping page names to permalinks (default: lowercase + underscore spaces)
  - `hrefTemplate`: function converting permalinks to URLs (default: `#/page/${permalink}`)
  - `wikiLinkClassName`: CSS class for valid links (default: `"internal"`)
  - `newClassName`: CSS class for non-existent pages (default: `"new"`)
  - `aliasDivider`: string delimiter for aliases

### Obsidian-Flavored Markdown (OFM) Variant
- `@moritzrs/micromark-extension-ofm-wikilink` specifically handles Obsidian's wikilink format
- Handles `|` as alias divider (vs `:` in the generic implementation)
- Supports `#` heading references and `#^` block references
- Supports `![[embed]]` syntax

---

## Python Ecosystem

### Python-Markdown WikiLinks Extension
- Built-in extension for Python-Markdown
- Converts `[[Page Name]]` to `<a href="/Page_Name/">Page Name</a>`
- Configurable: `base_url`, `end_url`, `html_class`
- Does NOT support aliases, heading links, or block references
- Source: [python-markdown.github.io/extensions/wikilinks](https://python-markdown.github.io/extensions/wikilinks/)

---

## Implications for Agent-Native Platform

### Parsing Maturity
The remark/micromark ecosystem provides **production-ready** wikilink parsing with:
- Well-defined AST node types for programmatic manipulation
- Configurable resolution logic (crucial for agent tooling)
- Existence checking (can differentiate "live" vs "broken" links)
- Extensible alias and embed handling

### Agent Integration Points
1. **`pageResolver`**: An agent can inject custom resolution logic to map wikilinks to files in a CRDT document store
2. **`permalinks`**: An agent can provide the current list of valid page names for link validation
3. **`exists` flag**: Enables agents to detect and repair broken links
4. **AST manipulation**: Agents can programmatically create, modify, or analyze links via the mdast node structure

### Format Recommendation Signal
The existence of mature, layered parsing tools for wikilinks (but not for proprietary formats like Notion blocks or Confluence XML) suggests wikilinks are the most ecosystem-ready format for a new platform.
