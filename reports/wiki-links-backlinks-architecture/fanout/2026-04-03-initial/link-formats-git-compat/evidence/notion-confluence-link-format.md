# Evidence: Notion & Confluence Internal Link Formats

## Notion Sources
- **Primary:** [Exploring Notion's Data Model: A Block-Based Architecture](https://www.notion.com/blog/data-model-behind-notion)
- **Primary:** [Working with page content - Notion API](https://developers.notion.com/docs/working-with-page-content)
- **Primary:** [Unique ID - Notion Help Center](https://www.notion.com/help/unique-id)
- **Primary:** [Database - Notion API Reference](https://developers.notion.com/reference/database)

## Confluence Sources
- **Primary:** [Confluence Storage Format](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html) (official Atlassian documentation, Data Center 10.2)
- **Primary:** [Confluence Storage Format - Data Center 9.5](https://confluence.atlassian.com/conf95/confluence-storage-format-1573750426.html)
- **Primary:** [Is ac:link's ri:page no longer supported on Confluence Cloud?](https://community.developer.atlassian.com/t/is-ac-link-s-ri-page-no-longer-supported-on-confluence-cloud-anymore/99497) (Atlassian Developer Community)

---

## Notion Internal Links

### Architecture
Notion uses a **block-based** data model where everything is a block — pages, paragraphs, lists, etc. Each block has a UUID.

### UUID Format
- UUID v4 (randomly generated)
- 32 hexadecimal digits
- Formatted with hyphens: `8-4-4-4-12` pattern
- Example: `1429989f-e8ac-4eff-bc8f-57f56486db54`

### URL Structure
Page URLs follow the pattern:
```
https://www.notion.so/{TITLE-OF-PAGE}-{UUID}
```
The UUID is embedded in the URL with hyphens stripped.

### Internal Link Representation
- Notion does NOT use text-based wikilinks
- Links are stored as **block references** with UUID pointers
- When exported to markdown, links become standard markdown links with Notion URLs
- There is no human-readable, text-file-based link format — links are opaque UUID references in the database

### Implications for Agent-Native Platform
- Notion's UUID-based linking is **not portable** to plain-text files
- Not git-friendly (UUIDs don't carry semantic meaning)
- Requires a server-side database to resolve links
- However, the UUID approach is **refactoring-resilient** — renaming a page never breaks links

---

## Confluence Internal Links

### Storage Format
Confluence stores page content as **XHTML-based XML** (technically XML, not strict XHTML). Links use custom namespaces:
- `ac:` — Atlassian Confluence namespace
- `ri:` — Resource Identifier namespace

### Link Representation
Basic page link:
```xml
<ac:link>
  <ri:page ri:content-title="Home" ri:space-key="SANDBOX" />
</ac:link>
```

Page link with custom display text:
```xml
<ac:link>
  <ri:page ri:content-title="Home" ri:space-key="SANDBOX" />
  <ac:link-body>Some <strong>Rich</strong> Text</ac:link-body>
</ac:link>
```

### Link Body Markup
Permitted tags within `<ac:link-body>`:
`<b>`, `<strong>`, `<em>`, `<i>`, `<code>`, `<tt>`, `<sub>`, `<sup>`, `<br>`, `<span>`

### Include Macro (Embedding)
```xml
<ac:structured-macro ac:name="include">
  <ac:parameter ac:name="">
    <ac:link>
      <ri:page ri:content-title="My page" ri:space-key="DOC"/>
    </ac:link>
  </ac:parameter>
</ac:structured-macro>
```

### Implications for Agent-Native Platform
- Confluence uses **title-based** linking (`ri:content-title`), not path-based
- Links include `ri:space-key` for cross-space references (analogous to cross-vault references)
- The XML format is **not human-readable** and not git-friendly
- Title-based linking means renaming pages breaks links (unlike Notion's UUID approach)
- The `ac:link` + `ri:page` pattern is proprietary and not portable
