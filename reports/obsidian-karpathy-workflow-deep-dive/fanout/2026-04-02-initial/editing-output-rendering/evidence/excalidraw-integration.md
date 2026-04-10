# Evidence: Excalidraw Integration in Obsidian

## The Plugin
- **Name**: obsidian-excalidraw-plugin
- **Author**: Zsolt Viczian
- **GitHub**: https://github.com/zsviczian/obsidian-excalidraw-plugin
- **Stars**: 6,400+
- **Downloads**: 3.24 million (most downloaded Obsidian community plugin)
- **Version**: 2.11.x with monthly releases
- **Active since**: 2021, 57+ documented features
- **Stats**: https://www.obsidianstats.com/plugins/obsidian-excalidraw-plugin

## Integration Depth (Deep, Bidirectional)

| Feature | Detail |
|---|---|
| Embed drawings in markdown | `![[drawing.excalidraw]]` with size params (`\|100x100`) and group targeting (`#group=groupName`) |
| Inline editing | Full Excalidraw editor pane within Obsidian (dedicated view tab, not in-paragraph) |
| Link TO vault notes | `[[note name]]` links on any element; CTRL+click follows link |
| Embed vault notes IN drawings | `![[note]]` renders markdown content inside Excalidraw canvas |
| Block references | Supported bidirectionally |
| File format | `.excalidraw.md` — markdown with YAML frontmatter + compressed JSON in code block |

Sources:
- Embed guide: https://medium.com/the-obsidianist/obsidian-excalidraw-embed-drawings-into-your-notes-bd6a3f52f73f
- Create/link notes: https://excalidraw-obsidian.online/wiki/Create-new-note

## File Format
`.excalidraw.md` files are markdown files. This means:
- Vault-searchable
- Version-controllable (git)
- Plugin distinguishes from regular `.md` via frontmatter tags

The underlying Excalidraw format is plaintext JSON:
```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [...],
  "appState": {...},
  "files": {...}
}
```
Schema docs: https://docs.excalidraw.com/docs/codebase/json-schema

## ExcaliBrain Companion Plugin
Auto-generates interactive knowledge graphs from vault links, dataview fields, tags, and frontmatter. Renders parent/child/sibling/friend relationships in Excalidraw.
- https://www.obsidianstats.com/plugins/excalibrain

## Excalidraw vs Canvas for Knowledge Visualization
- **Excalidraw**: Superior for freehand drawing, diagramming, creative visual expression
- **Canvas**: Better for arranging existing notes spatially (card-based layouts)
- They are **complementary**, not competing
- Canvas has known performance issues at scale: https://forum.obsidian.md/t/canvas-performance/108795

## Programmatic Creation / LLM Workflow

### ExcalidrawAutomate API
Full JavaScript API accessible to Templater, Dataview, and built-in Script Engine.

**LLM Training File**: Viczian published dedicated AI training data:
- https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/refs/heads/master/docs/AITrainingData/ExcalidrawAutomate%20full%20library%20for%20LLM%20training.md
- https://excalidraw-obsidian.online/WIKI/07+Developer+Docs/Excalidraw+Automate+library+file+(not+only)+for+LLM+training

### MCP Server for Excalidraw
Full MCP server for LLM agents to create/edit/export diagrams:
- https://github.com/yctimlin/mcp_excalidraw

### Claude + Excalidraw
Claude can generate `.excalidraw` JSON (boxes, arrows, labels, connectors):
- https://workos.com/blog/excalidraw-skills-agents-describe-themselves

## Key Features
- **Script Engine**: 50+ pre-built scripts; user scripts as `.md` with embedded JS
- **Script library**: https://github.com/zsviczian/obsidian-excalidraw-plugin/wiki/Excalidraw-Script-Engine-scripts-library
- **Templates and stencil library**: Built-in
- **Image support**: Drag/drop, paste, camera capture (mobile), URL references
- **LaTeX**: Via Command Palette; formulas in `element.customData.latex`
- **LaTeX docs**: https://excalidraw-obsidian.online/WIKI/09+Video+Transcripts/Videos/Obsidian-Excalidraw+LaTex+Support
- **Other**: OCR, SVG import, PDF import, custom pens, mobile support, tray mode

## Performance
- Drawings with hundreds+ elements or 2MB+ file sizes cause slowdown
- Tablets crash with too many drawn elements
- Pen input degrades on text-heavy canvases
- Mitigation: split large maps into smaller linked canvases
- GitHub issue: https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/863
- Troubleshooting guide: https://excalidraw-obsidian.online/wiki/troubleshooting/performance

## Mind Mapping
Viczian demonstrates mind mapping specifically:
- https://www.zsolt.blog/2021/09/mind-mapping-with-excalidraw-in-obsidian.html
