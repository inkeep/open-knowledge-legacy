# Evidence: YAML Frontmatter and Properties in Obsidian

## Properties View (Introduced v1.4)
Structured UI for editing frontmatter without touching raw YAML. Supports six types:
- Text
- List
- Number
- Checkbox
- Date (ISO 8601, with date picker)
- Date & Time (date + 12-hour time)

Auto-suggests property names from vault-wide tracking. Dedicated sidebar pane ("All Properties") for vault-wide management.

Sources:
- https://help.obsidian.md/properties
- https://obsidian.rocks/an-introduction-to-obsidian-properties/

## YAML Display by Editor Mode

| Mode | Behavior |
|---|---|
| Source | Raw YAML `---` block fully visible and editable |
| Live Preview | YAML replaced by Properties UI widget (raw hidden) |
| Reading | Same as Live Preview — Properties widget |

Toggle: "Show properties in document" in Editor settings controls inline Properties widget. If disabled, access via sidebar pane only.

## LLM-Generated Frontmatter Issues

| Issue | Detail |
|---|---|
| Nested YAML not supported | Properties system ignores/mishandles nested objects. Keep flat. |
| Code block wrappers | LLMs wrap output in ` ```yaml ` — must be stripped |
| `processFrontMatter` API destructive | Silently removes YAML comments, alters quoting, reformats types |
| Non-standard values | Unquoted colons, special chars, `yes`/`no`/`null` misinterpreted |

Source: https://forum.obsidian.md/t/yaml-properties-api-processfrontmatter-removes-alters-string-quotes-comments-types-formatting/65851?page=2

## Properties + Dataview / Bases

### Dataview
- All YAML frontmatter fields automatically available as Dataview fields
- Query via DQL: `WHERE status = "draft"`
- Also supports inline fields `[key:: value]`
- Source: https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/

### Bases (Core Plugin)
- Queries notes using frontmatter properties via `note.propertyName`
- `.base` file format with database-like table/card views
- All frontmatter properties queryable
- Positioned as first-party Dataview successor
- Sources: https://help.obsidian.md/bases/syntax, https://practicalpkm.com/bases-plugin-overview/

## Programmatic Frontmatter Best Practices
1. Use flat key-value pairs only (no nesting)
2. ISO 8601 for dates (`2026-04-03`) and datetimes (`2026-04-03T14:30`)
3. Quote strings with special YAML characters
4. Validate YAML before writing — malformed block breaks entire note's metadata
5. Obsidian MCP Server provides programmatic access including frontmatter ops
   - https://github.com/cyanheads/obsidian-mcp-server

## AI Knowledge Filler Plugin
Dedicated plugin for structured LLM-generated file creation in Obsidian:
- https://forum.obsidian.md/t/ai-knowledge-filler-turn-any-llm-into-a-structured-file-generator-for-obsidian/111443
