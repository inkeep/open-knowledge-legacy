# Evidence: Obsidian Canvas and JSON Canvas Format

## Canvas Basics
Canvas is a core Obsidian plugin providing an infinite spatial workspace. `.canvas` files are plain JSON.

### Node Types
1. **text** — inline Markdown cards (fully editable)
2. **file** — embeds a vault note/image/PDF (live content)
3. **link** — embeds a URL
4. **group** — bounding rectangle containing other nodes

### Edge/Connection Properties
- `fromNode`/`toNode` — node IDs
- `fromSide`/`toSide` — `top`, `right`, `bottom`, `left`
- `fromEnd`/`toEnd` — `none` or `arrow`
- `color` — hex or preset
- `label` — text label on connection

## JSON Canvas Format (Fully Documented)

Spec: https://jsoncanvas.org/spec/1.0/

```json
{
  "nodes": [
    {"id":"abc","type":"file","file":"Wiki/LLMs.md","x":0,"y":0,"width":400,"height":300},
    {"id":"def","type":"text","text":"# Key Concept\nSome markdown","x":500,"y":0,"width":300,"height":200,"color":"4"}
  ],
  "edges": [
    {"id":"e1","fromNode":"abc","toNode":"def","fromSide":"right","toSide":"left","label":"relates to","color":"#FF0000"}
  ]
}
```

Every node needs: `id`, `type`, `x`, `y`, `width`, `height`. Colors are hex or presets 1-6. No binary components, no schema validation required. Diffs cleanly in git.

## Live Note Embedding
File nodes embed vault notes and display rendered content. When source note is edited, canvas card updates live. Can target specific heading via `subpath` (e.g., `#heading`). Editing within canvas card is limited — primarily rendered view.

Source: https://forum.obsidian.md/t/embedding-canvas-into-notes/72807

## Open Standard
- Open-sourced March 2024, MIT license
- GitHub: https://github.com/obsidianmd/jsoncanvas
- Website: https://jsoncanvas.org/
- Adopters: Obsidian, Kinopio, Flowchart Fun, hi-canvas, OrgPad, Charkoal
- Libraries: Python, TypeScript, Go, Rust, Ruby, Dart, React, Vue
- Apps list: https://jsoncanvas.org/docs/apps/

## Scale and Performance
- **~100 text cards**: Freezes when entering/exiting viewport during panning
- Rendering engine culls off-screen nodes causing stutter at boundary
- File-type nodes heavier than text cards
- Workarounds: groups, collapse with Advanced Canvas, split across files

Sources:
- https://forum.obsidian.md/t/canvas-performance/108795
- https://forum.obsidian.md/t/performance-issue-with-canvas-when-panning-out-of-region-with-a-large-number-of-nodes/68609

## Canvas Edges Are NOT Queryable
Edges live only in canvas JSON — not accessible via Dataview, search, or backlinks. Advanced Canvas plugin partially addresses this.

## Key Plugins for Knowledge Workflows

| Plugin | Purpose | URL |
|---|---|---|
| Advanced Canvas | Graph view integration, collapsible groups, portals, auto-resize, frontmatter-based auto-edges | https://github.com/Developer-Mike/obsidian-advanced-canvas |
| Canvas LLM Extender | Right-click node → OpenAI generates connected nodes | https://github.com/Phasip/obsidian-canvas-llm-extender |
| Cannoli | No-code LLM pipelines on Canvas | https://github.com/DeabLabs/cannoli |
| JSON Canvas MCP Server | Agent read/write of .canvas files | https://mcpservers.org/servers/Cam10001110101/mcp-server-obsidian-jsoncanvas |

Source: https://help.obsidian.md/plugins/canvas
