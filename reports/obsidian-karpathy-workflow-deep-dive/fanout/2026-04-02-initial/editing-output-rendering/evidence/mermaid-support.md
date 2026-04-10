# Evidence: Mermaid Diagram Support in Obsidian

## Native Mermaid Version
Obsidian bundles **Mermaid.js 11.4.1**. Historically lags behind upstream by several minor versions.

Update request to 11.5+: https://forum.obsidian.md/t/update-mermaid-js-from-11-4-to-11-5-or-later-to-fix-arrow-rendering/107507

## Supported Diagram Types (via Mermaid 11.4.1)

| Type | Status | Notes |
|---|---|---|
| Flowcharts | Works | Core diagram type |
| Sequence diagrams | Works | |
| Gantt charts | Works | |
| Class diagrams | Works | |
| State diagrams (v2) | Works | |
| ER diagrams | Works | |
| Pie charts | Works | |
| Git graphs | Works | |
| Mindmaps | Works | |
| Timeline | Works | |
| Sankey | Works | |
| Quadrant charts | Works | |
| Packet diagrams (packet-beta) | BROKEN | Added in version after 11.4.1 |
| Block diagrams | BROKEN | Added in version after 11.4.1 |
| ZenUML | BROKEN | Does not render properly |

Source for packet diagram issue: https://forum.obsidian.md/t/please-update-obsidians-mermaid-integration-to-a-version-supporting-the-packet-diagram-syntax/87755

## Dark Mode Issues (Persistent)
Mermaid's default theme clashes with Obsidian dark backgrounds:
- Text in mindmaps, sequence diagrams, pie charts nearly unreadable
- Workaround: Add `%%{init: {'theme':'dark'}}%%` at top of each diagram
- Obsidian does NOT auto-match Mermaid theme to its own light/dark setting

Sources:
- Mindmap dark mode: https://forum.obsidian.md/t/text-colors-for-mermaid-mindmap-graph-are-unreadable-in-dark-mode/68674
- Sequence diagram dark: https://forum.obsidian.md/t/mermaid-sequencediagram-with-dark-theme/43383
- Theme mirroring request: https://forum.obsidian.md/t/mermaid-theme-needs-to-mirror-obsidian-theme/61117

## Rendering by Mode

| Mode | Behavior |
|---|---|
| Source | Raw code only, no rendering |
| Live Preview | Renders inline when cursor outside block |
| Reading View | Renders; occasional errors for diagrams that work in LP |

Source for LP vs Reading differences: https://forum.obsidian.md/t/mermaid-renders-in-live-preview-errors-in-reading-exporting/40136, https://forum.obsidian.md/t/complex-mermaid-only-working-in-live-preview-mode/57392

## LLM-Generated Mermaid Compatibility
- LLMs (Claude, GPT-4) generate Mermaid that **mostly works** in Obsidian
- Common issues:
  1. LLMs sometimes use syntax from newer Mermaid versions (block diagrams, packet-beta)
  2. Minor syntax errors (LLMs can usually self-correct given error message)
  3. Special characters in node labels causing parse failures
- Claude noted as particularly good at Mermaid for software designs

Sources:
- LLM + Mermaid: https://microsoft.github.io/genaiscript/blog/mermaids/
- Claude + Mermaid: https://spin.atomicobject.com/diagrams-mermaid-excalidraw/

## Community Plugins

| Plugin | Purpose |
|---|---|
| Mermaid Tools | Toolbar for inserting Mermaid elements without memorizing syntax |
| Mermaid View | First-class `.mermaid`/`.mmd` file support, pan/zoom, SVG/PNG export, proper theme handling |
| Mermaid Themes | Custom theme application |
| Mehrmaid | Renders Obsidian markdown (links, tags, MathJax) inside Mermaid node labels |
| Mermaid Icons | Fixes Font Awesome icon rendering |

Source for Mermaid View: https://simonecarletti.com/blog/2026/02/obsidian-mermaid-view/

## Key Limitations
1. **Version lag** — blocks newer diagram types
2. **No custom configuration** — ignores Mermaid config directives (e.g., `elk` layout)
3. **No interactivity** — click handlers and links in nodes don't work
4. **No separate files** — must embed in code blocks (unless Mermaid View plugin)
5. **Size limits** — large diagrams overflow note width, no scroll/zoom
6. **Dark mode mismatch** — requires manual per-diagram theme directives

Source for config directive issue: https://forum.obsidian.md/t/support-for-mermaid-diagram-configurations/112732
